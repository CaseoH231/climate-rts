// The main game world: map, units, buildings, economy, combat, climate, the AI, camera and controls.
import {
  TILE, MAP_W, MAP_H, MAP_SEED, START_RESOURCES, TEAM_NAMES, POP_MAX, TEAM_COLORS, TERRAIN, CLIMATE,
} from '../config.js';
import { GameMap } from '../map.js';
import { Unit, UNIT_TYPES, INFANTRY } from '../unit.js';
import { Building, BUILDING_TYPES, UPGRADES, ERAS } from '../buildings.js';
import { generateArt, buildingKey, buildingTexInfo, ART_RES, ensureBuildingTex, unitKey, unitTier, ensureUnitTex } from '../art.js';
import { toIso, fromIso, ISO_W, ISO_H, setWorldSize } from '../iso.js';
import { soloSetup, computeStarts, cleanRules, mapSizeFor, START_AMOUNTS } from '../setup.js';
import { fxEnabled } from '../ui.js';

const fmtClock = (sec) => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.floor(Math.max(0, sec)) % 60).padStart(2, '0')}`;
import { Climate } from '../climate.js';
import { findPath } from '../pathfinding.js';
import { Stats } from '../stats.js';
import { Effects } from '../effects.js';
import { cursors } from '../cursors.js';
import { Wildlife } from '../wildlife.js';
import { GAME_SPEEDS, MARKET_BASE, GAME_VERSION, TICK_MS } from '../config.js';
import { Rng, hashNumbers } from '../rng.js';
import { saveReplay } from '../replay.js';

const HASH_EVERY = 40;      // fingerprint the game state every 40 ticks (2 seconds)
const MAX_TICKS_PER_FRAME = 8;

const MARKET_FEE = 1.3;   // you always get back less than you put in
const SPEED_KEY = 'climate-rts-speed';
function loadSpeed() {
  try { const v = Number(localStorage.getItem(SPEED_KEY)); return GAME_SPEEDS.includes(v) ? v : 1; } catch (e) { return 1; }
}
import { EnemyAI, DIFFICULTY } from '../ai.js';
import { audio } from '../audio.js';
import { Practice } from '../practice.js';
import { TreeLayer } from '../trees.js';
import { Fog } from '../fog.js';

const TRIBUTE_RES = ['food', 'wood', 'stone', 'fuel'];
const TRIBUTE_FEE = 0.1;

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  // data: { seed, difficulty } for a new game, or { load: <save data> } to continue a saved one.
  // data: { replay } to watch a recorded game.
  create(data = {}) {
    const replay = data.replay || null;
    const net = replay ? null : data.net || null;
    const save = replay || net ? null : data.load || null;
    this.replay = replay;
    // Online: `net` is the connection to the game room. Each person plays one side ('player' = Blue, 'enemy' = Red,
    // 'green', 'yellow'); a spectator watches without a side.
    this.net = net;
    this.mp = !!(net || (replay && replay.mp));
    this.savedGroups = null;
    this.difficulty = this.mp ? 'normal' : replay ? replay.difficulty : save ? save.difficulty : data.difficulty || 'normal';
    // Who's playing: the sides, their alliances, and which ones the computer runs.
    this.setup = (replay && replay.setup) || (net && net.settings.setup) || (save && save.setup) || data.setup || soloSetup('1v1', this.difficulty);
    this.teamIds = this.setup.teams.map((t) => t.id);
    this.alliance = Object.fromEntries(this.setup.teams.map((t) => [t.id, t.alliance]));
    this.spectator = !!(net && !net.team);
    const you = (this.setup.teams.find((t) => t.you) || this.setup.teams.find((t) => !t.ai) || this.setup.teams[0]).id;
    this.me = net ? net.team || this.teamIds[0] : replay && replay.me ? replay.me : save && save.me ? save.me : you;
    this.self = this.me; // the side this person actually plays (`me` can change when spectating)
    this.freeplay = this.setup.mode === 'freeplay' || this.teamIds.length === 1; // practising alone
    this.practiceDone = false;
    this.foe = this.teamIds.find((t) => this.isEnemy(t, this.me)) || this.teamIds.find((t) => t !== this.me);
    // Game settings (map size, resources, starting age, population, reveal, peace time, victory, climate).
    this.rules = cleanRules((replay && (replay.rules || { fog: replay.fog })) || (net && net.settings) || (save && (save.rules || {})) || data.rules || { fog: data.fog });
    const size = mapSizeFor(this.rules, this.teamIds.length);
    setWorldSize(size, size);
    this.peaceUntil = this.rules.peace * 60; // game seconds
    this.peaceWarned = 0;
    this.starts = computeStarts(this.setup, MAP_W, MAP_H); // where each side's town goes (allies side by side)
    const seed = replay ? replay.seed : net ? net.settings.seed : save ? save.seed : data.seed ?? MAP_SEED;
    this.mapType = (replay ? replay.mapType : net ? net.settings.mapType : save ? save.mapType : data.mapType) || 'continental';

    // --- Deterministic simulation ---
    // Everything that changes the game uses this seeded random number generator (never Math.random),
    // runs in fixed 50 ms ticks, and only changes through commands. The same seed + the same commands
    // always give the same game: that's what makes replays — and later online play — possible.
    this.rng = new Rng((seed ^ 0x9e3779b9) >>> 0);
    this.nextId = 1;
    this.ents = new Map();        // id -> unit or building, so commands can name things by number
    this.tick = 0;
    this.acc = 0;                 // real time waiting to be turned into ticks
    this.pending = [];            // commands given since the last tick
    this.replayCursor = 0;
    this.hashCursor = 0;
    this.desync = null;
    this.syncChecks = 0;
    // Phaser reuses this scene object for every game, so clear anything left over from the last one.
    this.replayEnded = false;
    this.endNote = null;
    this.lastOut = null;
    this.netWait = null;
    this.netDown = false;
    this.catchingUp = null;
    this.gameOver = null;
    this.recording = !save && !replay ? {
      id: Date.now(), v: GAME_VERSION, date: Date.now(), seed, mapType: this.mapType, difficulty: this.difficulty,
      fog: net ? net.settings.fog !== false : data.fog !== false, cmds: [], hashes: [], ticks: 0, result: null,
      mp: this.mp, me: this.me, names: net ? net.names() : null, setup: this.setup, rules: this.rules,
    } : null;

    // --- Art (drawn with code at start-up) & sound ---
    generateArt(this, BUILDING_TYPES, this.teamIds);
    audio.init(this.sound.context);
    audio.startAmbience();
    audio.startMusic('calm');
    this.moodTimer = 0;
    this.fireCheck = 0;
    this.firesOnScreen = 0;

    // --- Map: painted onto a canvas texture we can repaint when tiles change ---
    this.map = new GameMap(MAP_W, MAP_H, seed, this.mapType, this.teamIds.map((t) => this.starts[t]));
    if (save) {
      this.map.tiles.set(save.map.tiles);
      this.map.amount.set(save.map.amount);
      this.map.elev.set(save.map.elev);
      this.map.seaLevel = save.map.seaLevel;
    }
    if (this.textures.exists('terrain')) this.textures.remove('terrain');
    this.terrainTex = this.textures.createCanvas('terrain', ISO_W, ISO_H);
    this.terrainCtx = this.terrainTex.getContext();
    this.map.treeSprites = true; // trees are sprites, so the ground only gets their shadows
    this.map.renderAll(this.terrainCtx);
    this.terrainTex.refresh();
    this.terrainDirty = false;
    this.add.image(0, 0, 'terrain').setOrigin(0).setDepth(-1);
    this.map.onTileChanged = (x, y) => this.redrawTile(x, y);
    this.terrainRect = null; // which part of the ground canvas changed since the last upload
    this.trees = new TreeLayer(this, this.map);
    // (for show) as things are gathered they run down in stages: trees fall one by one, bushes and
    // rocks shrink — repaint a tile's ground only when its stage changes
    this.harvestStage = new Map();
    this.map.onHarvest = (x, y) => {
      if (this.map.get(x, y) === TERRAIN.FOREST) { this.trees.refresh(x, y); return; }
      const k = y * this.map.w + x;
      const st = this.map.stageOf(x, y);
      if (this.harvestStage.get(k) === st) return;
      const first = !this.harvestStage.has(k);
      this.harvestStage.set(k, st);
      if (first && st === 6) return; // still untouched
      this.repaintGround(x - 1, y - 1, x + 1, y + 1);
    };

    // --- Camera ---
    const cam = this.cameras.main;
    cam.setBounds(-200, -150, ISO_W + 400, ISO_H + 450);
    cam.setBackgroundColor('#0b0c0d');
    this.applyScreenFx();
    const onFx = () => this.applyScreenFx();
    this.game.events.on('fxChanged', onFx);
    this.events.once('shutdown', () => this.game.events.off('fxChanged', onFx));
    const start = this.starts[this.me];
    const h = this.map.tileCenter(start.x, start.y);
    this.home = toIso(h.x, h.y);
    cam.centerOn(this.home.x, this.home.y);
    this.terrainRefreshTimer = 0;

    // --- Teams: each has its own resources and upgrades ---
    this.teams = {};
    const startRes = { ...START_RESOURCES, ...START_AMOUNTS[this.rules.resources] };
    for (const id of this.teamIds) this.teams[id] = { resources: { ...startRes }, upgrades: new Set(), era: this.rules.era, out: false, resigned: false };
    this.resources = this.teams[this.me].resources; // shortcut for the person at this computer
    this.upgrades = this.teams[this.me].upgrades;
    this.buildings = [];
    this.units = [];
    this.gameTime = 0;
    this.gameOver = null;
    this.paused = false;
    this.lastAttackAlert = -999;
    this.projectiles = [];
    this.renderShots = true;       // shots in flight: damage lands on game time, not animation time
    this.speed = loadSpeed();
    this.targeting = null;       // 'amove' while choosing an attack-move destination
    this.stats = new Stats(save && save.stats, this.teamIds);
    this.practice = this.freeplay ? new Practice(this, save && save.practice) : null;
    // One market shared by everyone: prices go up when people buy and down when they sell.
    this.market = { ...MARKET_BASE, ...(save && save.market) };

    if (save) {
      this.restore(save);
      if (save.rngState != null) this.rng.state = save.rngState >>> 0;
      this.tick = save.tick || 0;
    } else {
      // --- Starting bases ---
      for (const id of this.teamIds) {
        const st = this.starts[id];
        this.setupBase(st, id, ['worker', 'worker', 'worker', 'worker', 'soldier', 'soldier', 'soldier'], st.y < MAP_H / 2 ? 2 : -2);
      }
      // --- Climate & computer players ---
      this.climate = new Climate(this);
      this.makeAIs();
      for (const a of this.ais) {
        const bonus = DIFFICULTY[a.difficulty].bonus;
        for (const k of ['food', 'wood', 'stone']) this.teams[a.team].resources[k] += bonus;
      }
    }

    // --- Fog of war ---
    const reveal = replay || this.spectator ? 'visible' : this.rules.reveal;
    const fogOn = save ? (save.fog ? save.fog.enabled : true) : reveal !== 'visible';
    this.fog = new Fog(this, fogOn, save && save.fog ? save.fog.explored : null);
    if (fogOn && reveal === 'explored' && !save) { this.fog.explored.fill(1); this.fog.draw(); }
    this.fog.applyVisibility();

    // --- Living world: cloud shadows drifting over the land, glints on the water ---
    this.fx = new Effects(this);
    this.wildlife = new Wildlife(this, this.map, save ? save.wildlife || [] : null);
    this.events.once('shutdown', () => this.wildlife.destroy());
    this.events.once('shutdown', () => this.finishRecording());
    if (this.peaceUntil && !save) this.time.delayedCall(1200, () => this.toast(`🕊 Peace time: nobody can attack for the first ${this.rules.peace} minutes.`, '#e3c46f'));
    if (save && this.gameTime >= this.peaceUntil) this.peaceUntil = 0;
    if (net) {
      this.listenToNet(net);
      this.events.once('shutdown', () => net.close(!this.gameOver));
    }
    this.cursorKind = null;
    this.time.delayedCall(0, () => this.setCursor('arrow'));
    this.cursorTimer = 0;
    this.lastAlertPos = null;
    this.rainTime = 0;
    this.events.once('shutdown', () => this.fx.destroy());
    this.clouds = [];
    for (let i = 0; i < 5; i++) {
      const c = this.add.image(Math.random() * ISO_W, Math.random() * ISO_H, 'cloud')
        .setScale(2.5 + Math.random() * 1.5).setAlpha(0.16).setDepth(1e6 - 6);
      c.speed = 10 + Math.random() * 8;
      this.clouds.push(c);
    }
    this.glintTimer = 0;
    this.glints = 0;
    this.lastClick = null;

    // --- Selection & placement ---
    this.selected = new Set();
    this.selectedBuilding = null;
    this.drag = null;
    this.placing = null;
    this.selBox = this.add.graphics().setDepth(1e6);
    this.rallyGfx = this.add.graphics().setDepth(1e6 - 3);
    this.ghost = this.add.graphics().setDepth(1e6 - 1);
    this.ghostImg = this.add.image(0, 0, buildingKey('house', 'player')).setOrigin(0).setScale(1 / ART_RES).setAlpha(0.6).setDepth(1e6 - 2).setVisible(false);

    // --- Input ---
    this.input.mouse.disableContextMenu();
    this.keys = this.input.keyboard.addKeys('UP,DOWN,LEFT,RIGHT,SHIFT,ESC,H,PERIOD,A', false);
    this.keys.A.on('down', (k) => {
      if (k.originalEvent && (k.originalEvent.ctrlKey || k.originalEvent.metaKey)) return;
      if (!this.paused && !this.gameOver) this.startAttackMove();
    });
    this.input.keyboard.on('keydown', (e) => {
      if (this.gameOver) return;
      if (e.code === 'Space' && !this.paused) { e.preventDefault(); this.jumpToAlert(); return; }
      if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') this.changeSpeed(1);
      else if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') this.changeSpeed(-1);
    });
    this.keys.ESC.on('down', () => {
      if (this.paused || this.gameOver) return;
      if (this.targeting) this.cancelTargeting();
      else if (this.placing) this.cancelPlacing();
      else if (this.selected.size || this.selectedBuilding) this.clearSelection();
      else this.events.emit('openMenu');
    });
    this.input.keyboard.on('keydown-F10', () => { if (!this.gameOver) this.events.emit('openMenu'); });
    this.input.keyboard.on('keydown-DELETE', () => { if (!this.paused || this.net) this.deleteSelected(); });
    this.keys.H.on('down', () => cam.pan(this.home.x, this.home.y, 300, 'Sine.easeInOut'));
    this.keys.PERIOD.on('down', () => this.selectIdleWorker());

    // Control groups: Ctrl/Alt + number saves the selection, Shift + number adds to it,
    // the number on its own selects the group, pressing it twice jumps the camera there.
    this.groups = Array.from({ length: 10 }, (_, i) => (this.savedGroups && this.savedGroups[i]) || []);
    this.lastGroupKey = null;
    this.input.keyboard.on('keydown', (e) => {
      const m = /^Digit(\d)$/.exec(e.code);
      if (!m || this.paused || this.gameOver) return;
      const n = Number(m[1]);
      if (e.ctrlKey || e.metaKey || e.altKey) {
        e.preventDefault();
        this.setGroup(n, false);
      } else if (e.shiftKey) {
        this.setGroup(n, true);
      } else {
        this.recallGroup(n);
      }
    });

    this.pointerInGame = false; // edge-scrolling only starts once the mouse has moved over the game
    this.input.on('pointermove', () => { this.pointerInGame = true; });
    this.input.on('gameout', () => { this.pointerInGame = false; });
    this.input.on('gameover', () => { this.pointerInGame = true; });

    this.input.on('wheel', (pointer, objs, dx, dy) => {
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.5, 2));
    });

    this.input.on('pointerdown', (p) => {
      if (this.gameOver || this.paused || this.overUI(p)) return;
      const w = this.worldPoint(p);
      const iso = this.isoPoint(p);
      if (this.targeting) {
        if (p.leftButtonDown()) this.attackMoveTo(w.x, w.y);
        else this.cancelTargeting();
        return;
      }
      if (this.placing) {
        if (p.rightButtonDown()) this.cancelPlacing();
        else if (p.leftButtonDown()) {
          if (BUILDING_TYPES[this.placing.type].line) {
            this.placing.from = this.map.worldToTile(w.x, w.y);
            this.updateGhost();
          } else this.tryPlace(w);
        }
        return;
      }
      if (p.rightButtonDown()) this.commandAt(w.x, w.y, iso);
      else if (p.leftButtonDown()) this.drag = { x: iso.x, y: iso.y, sx: p.x, sy: p.y, active: false };
    });

    this.input.on('pointermove', (p) => {
      if (this.placing) this.updateGhost();
      if (!this.drag) return;
      if (!this.drag.active && Phaser.Math.Distance.Between(p.x, p.y, this.drag.sx, this.drag.sy) > 6) {
        this.drag.active = true;
      }
      if (this.drag.active) this.drawSelBox(this.isoPoint(p));
    });

    this.input.on('pointerup', (p) => {
      if (this.placing && this.placing.from && p.button === 0) { this.placeLine(); return; }
      if (!this.drag || p.button !== 0) return;
      const iso = this.isoPoint(p);
      const additive = this.keys.SHIFT.isDown;
      if (this.drag.active) {
        const r = this.dragRect(iso);
        this.selectWhere((u) => Phaser.Geom.Rectangle.Contains(r, u.isoX, u.isoY - 10), additive);
      } else {
        const u = this.unitAt(iso.x, iso.y, this.me);
        const now = this.time.now;
        const ctrl = p.event && (p.event.ctrlKey || p.event.metaKey);
        const dbl = u && this.lastClick && this.lastClick.unit === u && now - this.lastClick.t < 350;
        this.lastClick = { unit: u, t: now };
        if (u && (dbl || ctrl)) this.selectSameOnScreen(u, additive);
        else if (u && additive && this.selected.has(u)) this.deselect(u);
        else if (u) this.selectWhere((x) => x === u, additive);
        else {
          const b = this.buildingAtIso(iso.x, iso.y);
          if (b && b.team === this.me) this.selectBuilding(b);
          else if (!additive) this.clearSelection();
        }
      }
      this.drag = null;
      this.selBox.clear();
    });

    // UI (top bar, climate meter, info panel, minimap) runs as its own scene on top.
    this.scene.launch('UIScene');
  }

  // Rebuild a saved game.
  restore(save) {
    for (const [k, t] of Object.entries(save.teams)) {
      Object.assign(this.teams[k].resources, t.resources);
      t.upgrades.forEach((u) => this.teams[k].upgrades.add(u));
      this.teams[k].era = t.era;
    }
    this.gameTime = save.gameTime;
    const bs = save.buildings.map((d) => {
      const b = this.addBuilding(d.type, d.tx, d.ty, d.progress >= 1, d.team);
      Object.assign(b, { progress: d.progress, hp: d.hp, queue: d.queue, trainTimer: d.trainTimer, research: d.research, food: d.food, grow: d.grow, wonderTime: d.wonderTime, rally: d.rally || null });
      b.redraw();
      return b;
    });
    const us = save.units.map((d) => {
      const t = this.map.worldToTile(d.x, d.y);
      const u = new Unit(this, this.map, t.x, t.y, d.type, d.team);
      u.setPos(d.x, d.y);
      u.hp = d.hp;
      u.updateHpBar();
      this.units.push(u);
      return u;
    });
    // A saved "job to go back to" turned back into a live order.
    const prevIn = (o) => {
      if (!o) return null;
      if (o.kind === 'gather') return { kind: 'gather', res: o.res, tx: o.tx, ty: o.ty, farm: o.farm !== null && o.farm !== undefined ? bs[o.farm] || null : null };
      if (o.kind === 'build' && bs[o.building]) return { kind: 'build', building: bs[o.building] };
      return null;
    };
    // Workers sheltering inside buildings.
    save.buildings.forEach((d, i) => {
      for (const g of d.garrison || []) {
        const b = bs[i];
        const u = new Unit(this, this.map, b.tx, b.ty, g.type, b.team);
        u.hp = g.hp;
        u.updateHpBar();
        this.units.push(u);
        this.enterBuilding(u, b, prevIn(g.prev));
      }
    });
    // Orders need everything to exist first.
    save.units.forEach((d, i) => {
      const u = us[i];
      const o = d.order;
      if (o) {
        if (o.kind === 'gather' && o.farm !== null && bs[o.farm]) u.orderFarm(bs[o.farm]);
        else if (o.kind === 'gather' && this.map.resourceAt(o.tx, o.ty)) u.orderGather({ x: o.tx, y: o.ty });
        else if (o.kind === 'build' && bs[o.building]) u.orderBuild(bs[o.building]);
        else if (o.kind === 'attack' && o.target) {
          const tgt = o.target.b !== undefined ? bs[o.target.b] : us[o.target.u];
          if (tgt) { u.orderAttack(tgt); if (o.resume && u.order) u.order.resume = o.resume; }
        } else if (o.kind === 'amove' && o.dest) u.orderAttackMove(o.dest);
        else if (o.kind === 'garrison' && bs[o.building]) u.orderGarrison(bs[o.building], prevIn(o.prev));
      }
      u.carry = d.carry;
      u.carryType = d.carryType;
      u.updateCarryIcon();
    });
    this.climate = new Climate(this);
    const c = save.climate;
    Object.assign(this.climate, { co2: c.co2, temp: c.temp, drought: c.drought, heatwave: c.heatwave || 0, seaStage: c.seaStage, warnedStage: c.warnedStage, fireBudget: c.fireBudget, disasterTimer: c.disasterTimer, emittedTotal: c.emittedTotal });
    for (const f of c.fires) this.climate.fires.set(f.y * this.map.w + f.x, { ...f });
    for (const a of c.ash) this.climate.ash.set(a.y * this.map.w + a.x, { ...a });
    this.makeAIs();
    for (const sa of save.ais || []) {
      const a = this.ais.find((x) => x.team === sa.team);
      if (!a) continue;
      Object.assign(a, { nextWave: sa.nextWave, waveSize: sa.waveSize, waveNum: sa.waveNum });
      sa.assault.forEach((i) => us[i] && a.assault.add(us[i]));
    }
    for (const [id, t] of Object.entries(save.teams)) if (this.teams[id]) { this.teams[id].out = !!t.out; this.teams[id].resigned = !!t.resigned; }
    this.savedGroups = (save.groups || []).map((g) => g.map((i) => us[i]).filter(Boolean));
    const cam = this.cameras.main;
    cam.setZoom(save.camera.zoom);
    cam.centerOn(save.camera.x, save.camera.y);
  }

  // A soft vignette and a little extra colour and contrast on the game view (Settings → Screen effects).
  applyScreenFx() {
    const cam = this.cameras.main;
    if (!cam.postFX) return; // not available without WebGL
    cam.postFX.clear();
    if (!fxEnabled()) return;
    cam.postFX.addVignette(0.5, 0.5, 0.95, 0.22);
    const cm = cam.postFX.addColorMatrix();
    // a slightly muted, warm, contrasty grade (closer to AoE2 than bright cartoon colours)
    cm.saturate(-0.1);
    cm.contrast(0.1, true);
    cm.brightness(0.98, true);
    this.gradeFx = cm;
  }

  // A computer player for every side the computer runs.
  makeAIs() {
    this.ais = this.setup.teams.filter((t) => t.ai).map((t) => new EnemyAI(this, t.id, t.ai));
    // (tests and older code use .ai for "the computer opponent")
    this.ai = this.ais.find((a) => this.isEnemy(a.team, this.me)) || this.ais[0] || null;
  }

  // Are these two sides at war? (Different sides in the same alliance are allies.)
  isEnemy(a, b) {
    return a !== b && this.alliance[a] !== this.alliance[b];
  }

  isAlly(a, b) {
    return a === b || this.alliance[a] === this.alliance[b];
  }

  // The sides still in the game.
  liveTeams() {
    return this.teamIds.filter((t) => !this.teams[t].out);
  }

  setupBase(start, team, types, spawnDir) {
    this.addBuilding('town_centre', start.x - 1, start.y - 1, true, team);
    const spots = this.map.tilesAround(start.x, start.y + spawnDir, types.length);
    types.forEach((type, i) => this.units.push(new Unit(this, this.map, spots[i].x, spots[i].y, type, team)));
  }

  // ---------- Helpers ----------
  // Mouse → isometric world position (what you see).
  isoPoint(p) {
    return this.cameras.main.getWorldPoint(p.x, p.y);
  }

  // Mouse → position on the game grid (what the game logic uses).
  worldPoint(p) {
    const i = this.isoPoint(p);
    return fromIso(i.x, i.y);
  }

  // The building drawn under an isometric point (front-most first, includes roofs).
  buildingAtIso(ix, iy) {
    let best = null;
    for (const b of this.buildings) {
      if (!b.container.visible) continue;
      const left = b.container.x - b.tex.ox;
      const top = b.container.y - b.tex.oy * 0.55;
      const bottom = b.container.y + (b.W + b.H) / 2;
      if (ix < left + 6 || ix > left + b.tex.width - 6 || iy < top || iy > bottom) continue;
      if (!best || b.container.depth > best.container.depth) best = b;
    }
    if (best) return best;
    const g = fromIso(ix, iy);
    const t = this.map.worldToTile(g.x, g.y);
    return this.map.buildingAt(t.x, t.y);
  }

  overUI(p) {
    const ui = this.scene.get('UIScene');
    return !!(ui && ui.isPointerOverUI && ui.isPointerOverUI(p));
  }

  toast(msg, color) {
    this.events.emit('toast', msg, color);
  }

  // A message about something the player can't do, with an error sound.
  fail(msg) {
    if (this.replay || this.spectator) return;
    this.toast(msg);
    audio.play('error');
  }

  // Play a sound that happens at grid point (x, y): only if it's on screen, quieter towards the edges.
  sfx(name, x, y) {
    if (x === undefined) { audio.play(name); return; }
    if (this.fog && !this.fog.visibleAt(x, y)) return;
    const i = toIso(x, y);
    const v = this.cameras.main.worldView;
    const margin = 120;
    if (i.x < v.x - margin || i.x > v.right + margin || i.y < v.y - margin || i.y > v.bottom + margin) return;
    const d = Math.hypot(i.x - v.centerX, i.y - v.centerY) / Math.max(v.width, v.height);
    audio.play(name, Math.max(0.25, 1 - d * 0.9) * Math.min(1, this.cameras.main.zoom + 0.2));
  }

  // Repaint a changed tile (and its neighbours, for soft edges). Uploaded to the GPU once per frame.
  // Repaint a few tiles on the ground canvas and note the changed pixels for the next upload.
  repaintGround(x0, y0, x1, y1) {
    this.map.renderRegion(this.terrainCtx, x0, y0, x1, y1);
    const pts = [toIso(x0 * TILE, y0 * TILE), toIso((x1 + 1) * TILE, y0 * TILE), toIso((x1 + 1) * TILE, (y1 + 1) * TILE), toIso(x0 * TILE, (y1 + 1) * TILE)];
    const r = {
      x0: Math.min(...pts.map((p) => p.x)) - 8,
      x1: Math.max(...pts.map((p) => p.x)) + 8,
      y0: Math.min(...pts.map((p) => p.y)) - 48, // objects stand up to ~45px above their tile
      y1: Math.max(...pts.map((p) => p.y)) + 12,
    };
    const t = this.terrainRect;
    this.terrainRect = t ? { x0: Math.min(t.x0, r.x0), x1: Math.max(t.x1, r.x1), y0: Math.min(t.y0, r.y0), y1: Math.max(t.y1, r.y1) } : r;
    this.terrainDirty = true;
  }

  // Send only the changed region of the big ground canvas to the graphics card.
  // (A full refresh re-uploads the whole thing — tens of MB on a huge map — causing a stutter.)
  uploadGround() {
    const r = this.terrainRect;
    this.terrainRect = null;
    const src = this.terrainTex.canvas;
    const gl = this.game.renderer && this.game.renderer.gl;
    const x = r && Math.max(0, Math.floor(r.x0));
    const y = r && Math.max(0, Math.floor(r.y0));
    const w = r && Math.min(src.width, Math.ceil(r.x1)) - x;
    const h = r && Math.min(src.height, Math.ceil(r.y1)) - y;
    if (!r || !gl || w > src.width / 2) { this.terrainTex.refresh(); return; } // no GL, or most of it anyway
    if (w <= 0 || h <= 0) return;
    try {
      const scratch = this.groundScratch || (this.groundScratch = document.createElement('canvas'));
      scratch.width = w; // resizing also clears it
      scratch.height = h;
      scratch.getContext('2d').drawImage(src, x, y, w, h, 0, 0, w, h);
      const wrapper = this.terrainTex.source[0].glTexture;
      gl.bindTexture(gl.TEXTURE_2D, wrapper.webGLTexture || wrapper);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, scratch);
      gl.bindTexture(gl.TEXTURE_2D, null);
    } catch (e) {
      this.terrainTex.refresh();
    }
  }

  redrawTile(x, y) {
    this.repaintGround(x - 1, y - 1, x + 1, y + 1);
    if (this.trees) this.trees.refresh(x, y);
    if (this.miniDirty !== undefined) this.miniDirty = true;
    this.terrainDirty = true;
    this.events.emit('tileChanged', x, y);
  }

  smoke(x, y, color) {
    if (!this.renderShots) return;
    // not from places hidden in the fog (you shouldn't see an enemy's chimneys you haven't scouted)
    if (this.fog && this.fog.enabled) {
      const w = fromIso(x, y + 40);
      if (!this.fog.isExplored(Math.floor(w.x / TILE), Math.floor(w.y / TILE))) return;
    }
    this.fx.smoke(x, y, color);
  }

  // Units and buildings far off screen are left out of drawing (their game logic still runs).
  cullObjects(view) {
    const c = this.cameras.main;
    const x0 = view.x - 96, x1 = view.right + 96, y0 = view.y - 64, y1 = view.bottom + 220;
    for (const u of this.units) {
      const o = u.container;
      const off = o.x < x0 || o.x > x1 || o.y < y0 || o.y > y1;
      o.cameraFilter = off ? c.id : 0;
    }
    const moved = !this.lastCullView || Math.abs(view.x - this.lastCullView.x) > 32 || Math.abs(view.y - this.lastCullView.y) > 32
      || Math.abs(view.width - this.lastCullView.w) > 32 || this.buildings.length !== this.lastCullView.n;
    if (!moved) return;
    this.lastCullView = { x: view.x, y: view.y, w: view.width, n: this.buildings.length };
    for (const b of this.buildings) {
      const o = b.container;
      const r = (b.w + b.h) * TILE;
      const off = o.x + r < x0 - r || o.x - r > x1 || o.y + r * 0.8 < y0 || o.y - r > y1;
      o.cameraFilter = off ? c.id : 0;
      if (b.ground) b.ground.cameraFilter = o.cameraFilter;
    }
  }

  unitsInRect(tx, ty, w, h) {
    return this.units.some((u) => {
      const t = u.tile;
      return t.x >= tx && t.x < tx + w && t.y >= ty && t.y < ty + h;
    });
  }

  // ---------- Economy (per team) ----------
  popUsedOf(team) {
    const sheltering = this.buildings.reduce((n, b) => n + (b.team === team ? b.garrison.length : 0), 0);
    return this.units.filter((u) => u.team === team).length + sheltering;
  }

  popCapOf(team) {
    const total = this.buildings
      .filter((b) => b.team === team && b.complete)
      .reduce((sum, b) => sum + (b.def.pop || 0), 0);
    return Math.min(this.rules ? this.rules.pop : POP_MAX, total);
  }

  get popUsed() { return this.popUsedOf(this.me); }
  get popCap() { return this.popCapOf(this.me); }

  // "energy" = fossil fuel + clean energy together.
  have(k, team = this.me) {
    const r = this.teams[team].resources;
    return k === 'energy' ? r.fuel + r.clean : r[k];
  }

  canAfford(cost, team = this.me) {
    return Object.entries(cost).every(([k, v]) => this.have(k, team) >= v);
  }

  missingText(cost, team = this.me) {
    return Object.entries(cost)
      .filter(([k, v]) => this.have(k, team) < v)
      .map(([k, v]) => `${Math.ceil(v - this.have(k, team))} ${k}`)
      .join(', ');
  }

  spend(cost, team = 'player') {
    const r = this.teams[team].resources;
    for (const [k, v] of Object.entries(cost)) {
      if (k === 'energy') {
        // Use clean energy first, then fossil fuel.
        const fromClean = Math.min(r.clean, v);
        r.clean -= fromClean;
        r.fuel -= v - fromClean;
      } else {
        r[k] -= v;
      }
    }
  }

  addResource(res, n, team = 'player') {
    this.teams[team].resources[res] += n;
    this.stats.gather(team, res, n);
    // Coal gets burned for energy — that's where the CO₂ comes from (anyone's coal heats everyone's planet).
    if (res === 'fuel' && n > 0) {
      this.climate.addCO2(n * CLIMATE.co2PerFuel);
      this.stats.emit(team, n * CLIMATE.co2PerFuel);
    }
  }

  productionMultiplier(res, team, type) {
    const ups = this.teams[team].upgrades;
    let m = 1;
    if (res === 'clean' && ups.has('smart_grid')) m *= 1.5;
    if (type === 'fishing_dock' && ups.has('fish_farming')) m *= 1.6;
    if (['factory', 'office', 'fishing_dock'].includes(type) && ups.has('automation')) m *= 1.5;
    return m;
  }

  attackMultiplier(team) {
    return this.teams[team].upgrades.has('iron_weapons') ? 1.25 : 1;
  }

  eraOf(team) {
    return this.teams[team].era;
  }

  gatherMultiplier(res, isFarm, team = 'player') {
    const ups = this.teams[team].upgrades;
    let m = 1;
    if (res === 'wood' && ups.has('steel_axes')) m *= 1.3;
    if (res === 'wood' && ups.has('chainsaws')) m *= 1.3;
    if (ups.has('electric_tools')) m *= 1.2;
    if ((res === 'stone' || res === 'fuel') && ups.has('mining_carts')) m *= 1.3;
    if (isFarm && ups.has('plough')) m *= 1.3;
    if (res === 'food' && this.climate.drought > 0) m *= 0.5;
    if (this.climate.heatwave > 0 && !ups.has('cool_roofs')) m *= 0.7;
    return m;
  }

  // ---------- Research & eras ----------
  // Why can't this team research/advance right now? (null = it can)
  researchProblem(b, kind, id) {
    const team = b.team;
    const t = this.teams[team];
    if (!b.complete) return 'Building not finished';
    if (b.research) return 'Already researching something here';
    if (kind === 'era') {
      if (!b.def.advancesEra) return 'Advance at the Town Centre';
      const next = ERAS[t.era + 1];
      if (!next) return 'Already in the final era';
      if (this.buildings.some((x) => x.team === team && x.research && x.research.kind === 'era')) return 'Already advancing';
      if (!this.canAfford(next.cost, team)) return `Need ${this.missingText(next.cost, team)} more`;
      return null;
    }
    const up = UPGRADES[id];
    if (t.upgrades.has(id)) return 'Already researched';
    if (up.era > t.era) return `Requires the ${ERAS[up.era].name}`;
    if (this.buildings.some((x) => x.team === team && x.research && x.research.id === id)) return 'Already being researched';
    if (!this.canAfford(up.cost, team)) return `Need ${this.missingText(up.cost, team)} more`;
    return null;
  }

  startResearch(b, kind, id) {
    const problem = this.researchProblem(b, kind, id);
    if (problem) {
      if (b.team === this.me) this.fail(problem);
      return false;
    }
    const t = this.teams[b.team];
    if (kind === 'era') {
      const next = ERAS[t.era + 1];
      this.spend(next.cost, b.team);
      b.research = { kind, id: 'era', name: next.name, time: next.time, t: 0 };
    } else {
      const up = UPGRADES[id];
      this.spend(up.cost, b.team);
      b.research = { kind, id, name: up.name, time: up.time, t: 0 };
    }
    b.redraw();
    if (this.selectedBuilding === b) this.emitSelection();
    return true;
  }

  finishResearch(b) {
    const r = b.research;
    b.research = null;
    const t = this.teams[b.team];
    if (r.kind === 'era') {
      t.era++;
      this.restyleTeam(b.team);
      if (b.team === this.me) audio.play('fanfare');
      if (b.team === this.me) this.toast(`Your people have entered the ${ERAS[t.era].name}`, '#d8c9a0');
      else this.toast(`The enemy has entered the ${ERAS[t.era].name}`, '#d9a39b');
    } else {
      t.upgrades.add(r.id);
      this.refreshUnitLooks(b.team, r.id);
      if (b.team === this.me) { this.toast(`${UPGRADES[r.id].name} researched: ${UPGRADES[r.id].desc}`, '#b8c99a'); audio.play('chime'); }
    }
    b.redraw();
    if (b.team === this.me) this.emitSelection();
  }

  // Player buttons
  research(id) {
    const b = this.selectedBuilding;
    if (!b) return;
    const problem = this.researchProblem(b, 'upgrade', id);
    if (problem) { this.fail(problem); return; }
    this.issue({ k: 'research', b: b.id, id });
  }

  advanceEra() {
    const b = this.selectedBuilding;
    if (!b) return;
    const problem = this.researchProblem(b, 'era');
    if (problem) { this.fail(problem); return; }
    this.issue({ k: 'era', b: b.id });
  }

  researchFor(team, id) {
    const b = this.buildings.find((x) => x.team === team && x.complete && !x.research && (x.def.research || []).includes(id));
    return b ? this.startResearch(b, 'upgrade', id) : false;
  }

  // ---------- Buildings ----------
  addBuilding(type, tx, ty, complete = false, team = 'player') {
    const b = new Building(this, this.map, type, tx, ty, team, complete);
    this.buildings.push(b);
    return b;
  }

  // Pay for and lay the foundation of a new building.
  placeBuilding(type, tx, ty, team) {
    this.spend(BUILDING_TYPES[type].cost, team);
    return this.addBuilding(type, tx, ty, false, team);
  }

  removeBuilding(b) {
    if (b.dead) return;
    if (b.garrison.length) this.ejectAll(b); // everyone inside runs out
    if (b.hp <= 0 && (b.complete || b.progress > 0.25) && b.type !== 'trees') this.fx.ruins(b);
    b.dead = true;
    b.destroy();
    this.ents.delete(b.id);
    this.buildings = this.buildings.filter((x) => x !== b);
    if (this.selectedBuilding === b) {
      this.selectedBuilding = null;
      this.emitSelection();
    }
  }

  onBuildingComplete(b) {
    this.stats.built(b.team);
    if (this.renderShots && b.container.visible && !b.def.line) this.fx.completeBounce(b);
    if (b.def.wonder) {
      this.toast(b.team === this.me
        ? 'The Climate Restoration Project is complete! Defend it for 3 minutes to win.'
        : 'The enemy has completed a Climate Restoration Project!', '#b8c99a');
    } else if (b.team === this.me && b.type !== 'farm') this.toast(`${b.def.name} complete`);
    if (b.team === this.me) this.sfx('chime', b.cx, b.cy);
    if (this.selectedBuilding === b) this.emitSelection();
  }

  // The closest finished building of this side that takes this resource (res omitted = any drop-off).
  nearestDropOff(x, y, team = 'player', res = null) {
    let best = null;
    let bestD = Infinity;
    for (const b of this.buildings) {
      if (b.team !== team || !b.complete || !b.def.dropOff) continue;
      if (res && b.def.dropOff !== true && !b.def.dropOff.includes(res)) continue;
      const d = Phaser.Math.Distance.Between(x, y, b.cx, b.cy);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  nearestUnfinished(x, y, rangeTiles, team = 'player') {
    let best = null;
    let bestD = rangeTiles * TILE;
    for (const b of this.buildings) {
      if (b.team !== team || b.complete) continue;
      const d = Phaser.Math.Distance.Between(x, y, b.cx, b.cy);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  // ---------- Combat ----------
  // Distance from a point to a unit, or to the nearest edge of a building.
  distanceTo(x, y, t) {
    if (t.isBuilding) {
      const left = t.tx * TILE;
      const top = t.ty * TILE;
      const dx = Math.max(left - x, 0, x - (left + t.W));
      const dy = Math.max(top - y, 0, y - (top + t.H));
      return Math.hypot(dx, dy);
    }
    return Math.hypot(t.x - x, t.y - y);
  }

  // Peace time (a game setting): nobody can attack anybody until it runs out.
  atPeace() {
    return this.gameTime < this.peaceUntil;
  }

  findEnemyUnitNear(x, y, radius, team) {
    if (this.atPeace()) return null;
    let best = null;
    let bestD = radius;
    for (const u of this.units) {
      if (!this.isEnemy(u.team, team) || u.dead) continue;
      const d = Math.hypot(u.x - x, u.y - y);
      if (d < bestD) { bestD = d; best = u; }
    }
    return best;
  }

  // Nearest enemy unit in range, otherwise nearest enemy building in range.
  findEnemyNear(x, y, radius, team) {
    if (!radius || this.atPeace()) return null;
    const u = this.findEnemyUnitNear(x, y, radius, team);
    if (u) return u;
    let best = null;
    let bestD = radius;
    for (const b of this.buildings) {
      if (!this.isEnemy(b.team, team) || b.def.wall || b.def.bridge) continue; // walls only get attacked when they're in the way
      const d = this.distanceTo(x, y, b);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  // Anything of the other side's, anywhere — used by attack waves.
  nearestEnemyTarget(x, y, team) {
    if (this.atPeace()) return null;
    let best = null;
    let bestD = Infinity;
    for (const t of [...this.buildings, ...this.units]) {
      if (!this.isEnemy(t.team, team) || t.dead || (t.isBuilding && (t.def.wall || t.def.bridge))) continue;
      const d = this.distanceTo(x, y, t);
      if (d < bestD) { bestD = d; best = t; }
    }
    return best;
  }

  // The first enemy wall or gate a unit would have to break through to reach its target.
  wallInTheWay(u, target) {
    const from = u.tile;
    const goal = target.isBuilding ? { x: target.tx, y: target.ty } : target.tile;
    const path = findPath(this.map, from.x, from.y, goal.x, goal.y, u.team, true);
    if (!path) return null;
    for (const n of path) {
      if (this.map.isWalkable(n.x, n.y, u.team)) continue;
      const b = this.map.buildingAt(n.x, n.y);
      if (b && b.def.wall && this.isEnemy(b.team, u.team)) return b;
      if (b === target) return null;
    }
    return null;
  }

  // Fire a projectile from grid point (x, y) at height z towards a target (drawn isometrically).
  shoot(x, y, target, dmg, attacker, z = 0) {
    const kind = attacker.type === 'rifleman' ? 'gun' : attacker.type === 'armoured_car' ? 'cannon' : 'arrow';
    this.sfx(kind, x, y);
    const from = toIso(x, y);
    from.y -= z;
    const to = target.isBuilding ? toIso(target.cx, target.cy) : toIso(target.x, target.y);
    to.y -= target.isBuilding ? 20 : 12;
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const flight = Math.max(80, dist * 2.2); // ms of game time
    this.projectiles.push({ t: flight, target, dmg, attacker });
    if (!this.renderShots) return;
    if (attacker && (attacker.type === 'rifleman' || attacker.type === 'armoured_car') && (!attacker.container || attacker.container.visible)) {
      this.fx.muzzle(from.x, from.y, attacker.type === 'armoured_car');
    }
    const arrow = this.add.rectangle(from.x, from.y, 10, 1.5, 0xe8e2cf).setRotation(Math.atan2(to.y - from.y, to.x - from.x)).setDepth(9e5);
    this.tweens.add({
      targets: arrow, x: to.x, y: to.y, duration: flight / this.speed,
      onComplete: () => arrow.destroy(),
    });
  }

  // Shots land after their flight time (in game time, so pausing and game speed stay fair).
  updateProjectiles(dt) {
    if (!this.projectiles.length) return;
    const landed = [];
    for (const p of this.projectiles) {
      p.t -= dt;
      if (p.t <= 0) landed.push(p);
    }
    if (!landed.length) return;
    this.projectiles = this.projectiles.filter((p) => p.t > 0);
    for (const p of landed) {
      if (p.target.dead) continue;
      if (this.renderShots && p.target.container && p.target.container.visible) {
        const t = p.target;
        if (t.isBuilding) { const i = toIso(t.cx, t.cy); this.fx.impact(i.x + (Math.random() - 0.5) * 30, i.y - 10, true); }
        else this.fx.impact(t.isoX, t.isoY - 6, false);
      }
      this.dealDamage(p.target, p.dmg, p.attacker);
    }
  }

  // ---------- Era looks ----------
  // Buildings look like their owner's era (but never older than the era they belong to).
  styleFor(type, team) {
    return Math.max(this.teams ? this.teams[team].era : 0, BUILDING_TYPES[type].era || 0);
  }

  // Texture key for a building in a team's current look (drawn if needed) — for buttons and the ghost.
  buildingTexKey(type, team = this.me) {
    return ensureBuildingTex(this, type, team, this.styleFor(type, team), BUILDING_TYPES[type]);
  }

  unitTexKey(type, team = this.me) {
    const tier = unitTier(type, this.teams[team].upgrades);
    ensureUnitTex(this, type, team, tier);
    return unitKey(type, team, 0, tier);
  }

  // A team entered a new era: every one of its buildings gets the new look.
  restyleTeam(team) {
    for (const b of this.buildings) if (b.team === team) b.restyle(this.styleFor(b.type, team));
  }

  // While an era is being researched, quietly draw the next era's building looks a few per frame
  // so switching over doesn't cause a stutter.
  prewarmStyles(delta) {
    if (!this.styleQueue || !this.styleQueue.length) {
      for (const team of this.teamIds) {
        const tc = this.buildings.find((b) => b.team === team && b.research && b.research.kind === 'era');
        if (!tc) continue;
        const style = this.teams[team].era + 1;
        const types = [...new Set(this.buildings.filter((b) => b.team === team).map((b) => b.type))];
        this.styleQueue = types.map((type) => ({ type, team, style: Math.max(style, BUILDING_TYPES[type].era || 0) }))
          .filter((q) => !this.textures.exists(buildingKey(q.type, q.team, q.style)));
        if (this.styleQueue.length) break;
      }
      return;
    }
    const q = this.styleQueue.shift();
    ensureBuildingTex(this, q.type, q.team, q.style, BUILDING_TYPES[q.type]);
  }

  // Research finished: units that it upgrades get their new look (and Body Armour's extra health).
  refreshUnitLooks(team, id) {
    const ups = this.teams[team].upgrades;
    const all = [...this.units, ...this.buildings.flatMap((b) => b.garrison)];
    for (const u of all) {
      if (u.team !== team) continue;
      if (id === 'body_armour' && INFANTRY.includes(u.type)) {
        const frac = u.hp / u.maxHp;
        u.maxHp = Math.round(u.def.hp * 1.3);
        u.hp = u.maxHp * frac;
        u.updateHpBar();
      }
      u.setTier(unitTier(u.type, ups));
    }
    if (team === this.me) this.emitSelection();
  }

  // ---------- Town bell & shelter ----------
  // Every worker drops what they're doing and runs into the nearest Town Centre or tower with room.
  ringBell(team = 'player') {
    const shelters = this.buildings.filter((b) => b.team === team && b.complete && b.def.garrison);
    if (!shelters.length) return;
    const room = new Map(shelters.map((b) => [b, b.def.garrison - b.garrison.length]));
    let sent = 0;
    for (const u of this.units) {
      if (u.team !== team || u.type !== 'worker' || (u.order && u.order.kind === 'garrison')) continue;
      let best = null;
      let bestD = Infinity;
      for (const b of shelters) {
        if (room.get(b) <= 0) continue;
        const d = this.distanceTo(u.x, u.y, b);
        if (d < bestD) { bestD = d; best = b; }
      }
      if (!best) break;
      room.set(best, room.get(best) - 1);
      u.orderGarrison(best, u.order);
      sent++;
    }
    if (team === this.me) {
      audio.play('horn');
      this.toast(sent ? `The town bell rings! ${sent} workers run for shelter.` : 'No room left to shelter anyone.', '#e3c46f');
      this.events.emit('selection', { units: [...this.selected], building: this.selectedBuilding });
    }
  }

  // Everyone comes out of their shelters and goes back to work.
  allClear(team = 'player') {
    for (const b of this.buildings) if (b.team === team && b.garrison.length) this.ejectAll(b);
    for (const u of this.units) if (u.team === team && u.order && u.order.kind === 'garrison') this.resumeWork(u, u.order.prev);
    if (team === this.me) {
      this.toast('All clear — back to work!', '#b8c99a');
      this.events.emit('selection', { units: [...this.selected], building: this.selectedBuilding });
    }
  }

  get bellRung() {
    return this.buildings.some((b) => b.team === this.me && b.garrison.length) ||
      this.units.some((u) => u.team === this.me && u.order && u.order.kind === 'garrison');
  }

  enterBuilding(u, b, prev) {
    u.stop();
    u.prevOrder = prev || null;
    u.container.setVisible(false);
    this.units = this.units.filter((x) => x !== u);
    if (this.selected && this.selected.delete(u)) { u.setSelected(false); this.emitSelection(); }
    b.garrison.push(u);
    if (this.selectedBuilding && this.selectedBuilding === b) this.emitSelection();
  }

  ejectAll(b) {
    const spots = this.map.standSpots(b.tx, b.ty, b.w, b.h, { x: b.tx + Math.floor(b.w / 2), y: b.ty + b.h });
    b.garrison.forEach((u, i) => {
      const s = spots[i % Math.max(1, spots.length)];
      if (s) {
        const c = this.map.tileCenter(s.x, s.y);
        u.setPos(c.x, c.y);
      }
      u.container.setVisible(true);
      this.units.push(u);
      this.resumeWork(u, u.prevOrder);
      u.prevOrder = null;
    });
    b.garrison = [];
    if (this.selectedBuilding === b) this.emitSelection();
  }

  // Give a worker back the job it had before (if that job still makes sense).
  resumeWork(u, prev) {
    u.stop();
    if (!prev) return;
    if (prev.kind === 'gather' && prev.farm) {
      if (!prev.farm.dead) u.orderFarm(prev.farm);
    } else if (prev.kind === 'gather') {
      if (this.map.resourceAt(prev.tx, prev.ty)) u.orderGather({ x: prev.tx, y: prev.ty });
      else {
        const n = this.map.nearestResource(prev.res, prev.tx, prev.ty, 10);
        if (n) u.orderGather(n);
      }
    } else if (prev.kind === 'build') {
      if (!prev.building.dead && !prev.building.complete) u.orderBuild(prev.building);
    }
  }

  // ---------- Market ----------
  // How much of `pay` it costs to buy 100 of `buy` right now.
  tradeCost(pay, buy) {
    return Math.ceil((100 * this.market[buy] * MARKET_FEE) / this.market[pay]);
  }

  trade(pay, buy, team = 'player') {
    if (pay === buy) return false;
    const cost = this.tradeCost(pay, buy);
    if (!this.canAfford({ [pay]: cost }, team)) {
      if (team === this.me) this.fail(`Need ${this.missingText({ [pay]: cost }, team)} more`);
      return false;
    }
    this.spend({ [pay]: cost }, team);
    // Bought coal still gets burned somewhere — it heats the planet like mined coal.
    this.teams[team].resources[buy] += 100;
    if (buy === 'fuel') {
      this.climate.addCO2(100 * CLIMATE.co2PerFuel);
      this.stats.emit(team, 100 * CLIMATE.co2PerFuel);
    }
    const clamp = (v) => Math.max(0.3, Math.min(4, v));
    this.market[buy] = clamp(this.market[buy] * 1.05);
    this.market[pay] = clamp(this.market[pay] * 0.96);
    if (team === this.me) audio.play('confirm');
    return true;
  }

  // Tribute: give resources to another side (ally or not). A 10% fee is paid on top.
  tribute(from, to, res, amount) {
    const T = this.teams[to];
    const F = this.teams[from];
    if (!T || !F || to === from || T.out || F.out || !TRIBUTE_RES.includes(res)) return false;
    amount = Math.floor(Number(amount));
    if (!(amount > 0) || amount > 100000) return false;
    const fee = Math.ceil(amount * TRIBUTE_FEE);
    const total = amount + fee;
    if (!this.canAfford({ [res]: total }, from)) {
      if (from === this.me) this.fail(`Need ${this.missingText({ [res]: total }, from)} more (that includes the ${fee} fee)`);
      return false;
    }
    this.spend({ [res]: total }, from);
    T.resources[res] += amount;
    this.stats.tribute(from, to, amount);
    const NAMES = { food: 'food', wood: 'wood', stone: 'stone', fuel: 'coal' };
    if (from === this.me && !this.spectator) {
      this.toast(`Sent ${amount} ${NAMES[res]} to ${this.teamName(to)}  (fee ${fee})`, '#e8d9a0');
      audio.play('confirm');
    } else if (to === this.me && !this.spectator) {
      this.toast(`${this.teamName(from)} sent you ${amount} ${NAMES[res]}`, '#b8dc90');
      audio.play('chime');
    }
    this.events.emit('tribute');
    return true;
  }

  // Prices slowly drift back towards normal.
  updateMarket(dt) {
    const k = Math.min(1, (dt / 1000) * 0.004);
    for (const r of Object.keys(MARKET_BASE)) this.market[r] += (MARKET_BASE[r] - this.market[r]) * k;
  }

  // ---------- Game speed ----------
  changeSpeed(dir) {
    const i = GAME_SPEEDS.indexOf(this.speed);
    const next = GAME_SPEEDS[Math.max(0, Math.min(GAME_SPEEDS.length - 1, (i < 0 ? 1 : i) + dir))];
    this.setSpeed(next);
  }

  setSpeed(v) {
    if (this.net) { this.toast('Online games always run at normal speed'); return; }
    if (v === this.speed) return;
    this.speed = v;
    try { localStorage.setItem(SPEED_KEY, String(v)); } catch (e) { /* private mode */ }
    this.toast(`Game speed ×${v}`);
    this.events.emit('speed', v);
  }

  // ---------- Attack-move ----------
  startAttackMove() {
    if (![...this.selected].some((u) => u.isMilitary)) return;
    if (this.placing) this.cancelPlacing();
    this.targeting = 'amove';
    this.setCursor('sword');
    this.toast('Attack-move: click where to go. They fight anything on the way.');
  }

  cancelTargeting() {
    this.targeting = null;
    this.setCursor('arrow');
  }

  // ---------- Mouse cursor: shows what a right-click would do ----------
  setCursor(kind) {
    if (kind === this.cursorKind) return;
    this.cursorKind = kind;
    this.input.setDefaultCursor(cursors()[kind]);
  }

  updateCursor(delta) {
    this.cursorTimer -= delta;
    if (this.cursorTimer > 0) return;
    this.cursorTimer = 90;
    if (this.targeting) { this.setCursor('sword'); return; }
    const p = this.input.activePointer;
    if (this.placing || this.drag || !this.selected.size || this.overUI(p)) { this.setCursor('arrow'); return; }
    const i = this.isoPoint(p);
    const units = [...this.selected];
    const enemy = this.enemyUnitAt(i.x, i.y);
    const b = this.buildingAtIso(i.x, i.y);
    if (enemy || (b && b.team !== this.me && b.container.visible)) { this.setCursor('sword'); return; }
    const workers = units.some((u) => u.type === 'worker');
    if (workers && b && b.team === this.me && (!b.complete || b.hp < b.maxHp)) { this.setCursor('hammer'); return; }
    if (workers && !b && this.wildlife.at(i.x, i.y)) { this.setCursor('pick'); return; }
    if (workers && !b) {
      const g = fromIso(i.x, i.y);
      const t = this.map.worldToTile(g.x, g.y);
      if (this.map.resourceAt(t.x, t.y) && (!this.fog || this.fog.isExplored(t.x, t.y))) { this.setCursor('pick'); return; }
    }
    this.setCursor('arrow');
  }

  // Jump the camera to where the last attack happened (Space).
  jumpToAlert() {
    if (!this.lastAlertPos) return;
    const c = this.map.tileCenter(this.lastAlertPos.x, this.lastAlertPos.y);
    const i = toIso(c.x, c.y);
    this.cameras.main.pan(i.x, i.y, 300, 'Sine.easeInOut');
  }

  // Remove one unit from the current selection.
  deselectUnit(u) {
    if (!this.selected.delete(u)) return;
    u.setSelected(false);
    this.emitSelection();
  }

  // Cancel a queued unit and give its cost back.
  cancelTrain(b, i) {
    if (!b || b.dead || i < 0 || i >= b.queue.length) return;
    const type = b.queue[i];
    for (const [k, v] of Object.entries(UNIT_TYPES[type].cost)) {
      if (k === 'energy') this.teams[b.team].resources.clean += v; // refund as clean energy
      else this.teams[b.team].resources[k] += v;
    }
    b.queue.splice(i, 1);
    if (i === 0) { b.trainTimer = 0; b.waitingForPop = false; }
    b.redraw();
    if (b === this.selectedBuilding) this.emitSelection();
  }

  attackMoveTo(wx, wy) {
    const ids = [...this.selected].filter((u) => u.isMilitary).map((u) => u.id);
    if (ids.length) this.issue({ k: 'amove', ids, x: wx, y: wy });
    audio.play('confirm');
    this.showMarker(wx, wy, 0xe05a4a);
    if (!this.keys.SHIFT.isDown) this.cancelTargeting();
  }

  dealDamage(target, dmg, attacker) {
    if (target.dead) return;
    if (target.team === this.me) this.alertAttack(target);
    if (target.isBuilding) {
      this.damageBuilding(target, dmg, attacker.team === this.me ? 'your army' : 'the enemy', attacker.team);
      return;
    }
    target.hp -= dmg;
    target.updateHpBar();
    if (this.renderShots && target.container.visible) this.fx.hitFlash(target);
    if (target.hp <= 0) {
      this.killUnit(target, attacker.team);
      return;
    }
    // Fight back if we're a soldier with nothing better to do.
    const busyWithUnit = target.order && target.order.kind === 'attack' && !target.order.target.isBuilding && !target.order.target.dead;
    if (target.isMilitary && !attacker.isBuilding && !busyWithUnit) {
      target.orderAttack(attacker);
    }
  }

  killUnit(u, killer = null) {
    if (u.dead) return;
    this.stats.unitDied(u, killer);
    u.stop();
    u.dead = true;
    this.sfx('death', u.x, u.y);
    if (u.container.visible) this.fx.death(u);
    u.container.destroy();
    this.ents.delete(u.id);
    this.units = this.units.filter((x) => x !== u);
    if (this.selected.delete(u)) this.emitSelection();
  }

  alertAttack(target) {
    if (this.gameTime - this.lastAttackAlert < 15) return;
    this.lastAttackAlert = this.gameTime;
    this.toast('You are under attack!  (Space to look)', '#d9a39b');
    audio.play('horn');
    const x = target.isBuilding ? target.cx : target.x;
    const y = target.isBuilding ? target.cy : target.y;
    this.lastAlertPos = { x: Math.floor(x / TILE), y: Math.floor(y / TILE) };
    this.events.emit('alert', Math.floor(x / TILE), Math.floor(y / TILE));
  }

  // ---------- Damage & climate effects ----------
  damageBuilding(b, amount, cause, killer = null) {
    if (b.dead) return;
    const disaster = cause === 'fire' || cause === 'a storm';
    if (disaster && this.teams[b.team].upgrades.has('climate_shields')) amount *= 0.5;
    b.hp -= amount;
    if (b.hp <= 0) {
      this.sfx('collapse', b.cx, b.cy);
      if (b.team === this.me) this.toast(`Your ${b.def.name} was destroyed by ${cause}`, '#d9a39b');
      else if (cause === 'your army') this.toast(`Enemy ${b.def.name} destroyed`, '#b8c99a');
      this.stats.buildingDied(b, killer);
      this.removeBuilding(b);
    } else {
      b.redraw();
    }
  }

  growForest(b) {
    this.removeBuilding(b);
    for (let j = b.ty; j < b.ty + b.h; j++) {
      for (let i = b.tx; i < b.tx + b.w; i++) {
        if (this.map.get(i, j) === TERRAIN.GRASS) this.map.setTerrain(i, j, TERRAIN.FOREST);
      }
    }
    for (const u of this.units) u.rescue();
    if (b.team === this.me) this.toast('Your saplings have grown into a forest', '#b8c99a');
  }

  stormEffect(x, y, r) {
    this.rainTime = Math.max(this.rainTime, 14);
    const i = toIso(x, y);
    const c = this.add.ellipse(i.x, i.y, r * 2.8, r * 1.4, 0x2a3440, 0.4).setDepth(9e5);
    this.tweens.add({ targets: c, alpha: 0, scale: 1.3, duration: 1200, onComplete: () => c.destroy() });
    const v = this.cameras.main.worldView;
    if (Phaser.Geom.Rectangle.Contains(v, i.x, i.y)) this.cameras.main.shake(400, 0.006);
  }

  // ---------- Placing new buildings (player) ----------
  selectedWorkers() {
    return [...this.selected].filter((u) => u.type === 'worker');
  }

  startPlacing(type) {
    if (this.replay || !this.selectedWorkers().length) return;
    const def = BUILDING_TYPES[type];
    const problem = this.placeProblem(type, this.me);
    if (problem) {
      this.fail(problem);
      return;
    }
    if (!this.canAfford(def.cost)) {
      this.fail(`Need ${this.missingText(def.cost)} more for a ${def.name}`);
      return;
    }
    this.placing = { type };
    this.updateGhost();
  }

  cancelPlacing() {
    this.placing = null;
    this.ghost.setPosition(0, 0);
    this.ghost.clear();
    this.ghostImg.setVisible(false);
  }

  placementAt(w) {
    const def = BUILDING_TYPES[this.placing.type];
    const tx = Math.round(w.x / TILE - def.w / 2);
    const ty = Math.round(w.y / TILE - def.h / 2);
    return { tx, ty, valid: this.canPlaceAt(this.placing.type, tx, ty), def };
  }

  // Is the ground free for this building with its top-left corner on tile (tx, ty)?
  canPlaceAt(type, tx, ty) {
    const def = BUILDING_TYPES[type];
    if (def && def.bridge) return this.map.canPlaceBridge(tx, ty);
    if (!def || !this.map.canPlace(tx, ty, def.w, def.h)) return false;
    if (!def.walkable && this.unitsInRect(tx, ty, def.w, def.h)) return false;
    if (def.needsWater && this.map.waterAround(tx, ty, def.w, def.h) < def.needsWater) return false;
    return true;
  }

  // Why a team can't start this kind of building at all (or null if it can).
  placeProblem(type, team) {
    const def = BUILDING_TYPES[type];
    if (!def) return "Can't build that";
    if (def.era > this.eraOf(team)) return `${def.name} requires the ${ERAS[def.era].name}`;
    if (def.wonder && this.buildings.some((b) => b.team === team && b.def.wonder)) return 'You can only build one Climate Restoration Project';
    return null;
  }

  // Tiles on a straight line between two tiles (Bresenham) — used for walls.
  // Diagonal steps still seal the wall, because units can't squeeze between two corner-touching blocks.
  lineTiles(a, b) {
    const out = [];
    let { x, y } = a;
    const dx = Math.abs(b.x - x);
    const dy = -Math.abs(b.y - y);
    const sx = Math.sign(b.x - x);
    const sy = Math.sign(b.y - y);
    let err = dx + dy;
    for (;;) {
      out.push({ x, y });
      if ((x === b.x && y === b.y) || out.length >= 40) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
    return out;
  }

  wallLine() {
    const w = this.worldPoint(this.input.activePointer);
    const to = this.map.worldToTile(w.x, w.y);
    const tiles = this.lineTiles(this.placing.from, to);
    return tiles.map((t) => ({
      ...t,
      valid: this.canPlaceAt(this.placing.type, t.x, t.y),
    }));
  }

  placeLine() {
    const type = this.placing.type;
    const def = BUILDING_TYPES[type];
    const tiles = this.wallLine().filter((t) => t.valid);
    this.placing.from = null;
    if (!tiles.length || !this.canAfford(def.cost)) {
      this.fail(tiles.length ? `Need ${this.missingText(def.cost)} more for a ${def.name}` : "Can't build there");
      this.updateGhost();
      return;
    }
    this.issue({ k: 'wall', type, tiles: tiles.map((t) => [t.x, t.y]), ids: this.selectedWorkers().map((u) => u.id) });
    audio.play('build');
    const c = this.map.tileCenter(tiles[0].x, tiles[0].y);
    this.showMarker(c.x, c.y, 0x7cfc00);
    if (!this.keys.SHIFT.isDown) this.cancelPlacing();
    else this.updateGhost();
  }

  updateGhost() {
    if (!this.placing) return;
    if (this.placing.from) {
      // dragging out a wall: one diamond per section
      const g = this.ghost;
      g.clear().setPosition(0, 0);
      this.ghostImg.setVisible(false);
      for (const t of this.wallLine()) {
        const o = toIso(t.x * TILE, t.y * TILE);
        const pts = [{ x: o.x, y: o.y }, { x: o.x + TILE, y: o.y + TILE / 2 }, { x: o.x, y: o.y + TILE }, { x: o.x - TILE, y: o.y + TILE / 2 }];
        g.fillStyle(t.valid ? 0x7fbf5a : 0xc0453a, 0.45).fillPoints(pts, true);
        g.lineStyle(1, t.valid ? 0xb8e08a : 0xe07a6e, 0.9).strokePoints(pts, true);
      }
      return;
    }
    const w = this.worldPoint(this.input.activePointer);
    const { tx, ty, valid, def } = this.placementAt(w);
    const g = this.ghost;
    g.clear();
    const o = toIso(tx * TILE, ty * TILE);
    const info = buildingTexInfo(def);
    g.setPosition(o.x, o.y);
    this.ghostImg.setTexture(this.buildingTexKey(this.placing.type, this.me)).setPosition(o.x - info.ox, o.y - info.oy).setVisible(true);
    const W = def.w * TILE;
    const H = def.h * TILE;
    const pts = [{ x: 0, y: 0 }, { x: W, y: W / 2 }, { x: W - H, y: (W + H) / 2 }, { x: -H, y: H / 2 }];
    g.fillStyle(valid ? 0x7fbf5a : 0xc0453a, 0.35).fillPoints(pts, true);
    g.lineStyle(1, valid ? 0xb8e08a : 0xe07a6e, 0.9).strokePoints(pts, true);
    if (def.attack) g.lineStyle(1, 0xe0d8b0, 0.35).strokeEllipse((W - H) / 2, (W + H) / 4, def.attack.range * 2 * Math.SQRT2, def.attack.range * Math.SQRT2);
  }

  tryPlace(w) {
    const { tx, ty, valid, def } = this.placementAt(w);
    if (!valid) { this.fail(def.needsWater ? `A ${def.name} has to be built right on the shore` : "Can't build there"); return; }
    if (!this.canAfford(def.cost)) {
      this.fail(`Need ${this.missingText(def.cost)} more for a ${def.name}`);
      this.cancelPlacing();
      return;
    }
    this.issue({ k: 'place', type: this.placing.type, tx, ty, ids: this.selectedWorkers().map((u) => u.id) });
    audio.play('build');
    this.showMarker((tx + def.w / 2) * TILE, (ty + def.h / 2) * TILE, 0x7cfc00);
    if (!this.keys.SHIFT.isDown) this.cancelPlacing();
  }

  // ---------- Training units ----------
  train(type) {
    const b = this.selectedBuilding;
    if (!b || !b.complete || !(b.def.trains || []).includes(type)) return;
    const problem = this.trainProblem(b, type);
    if (problem) { this.fail(problem); return; }
    this.issue({ k: 'train', b: b.id, type });
  }

  // Why this building can't start training this unit right now (or null if it can).
  trainProblem(b, type) {
    const u = UNIT_TYPES[type];
    if (!u || !b || b.dead || !b.complete || !(b.def.trains || []).includes(type)) return "Can't train that here";
    if (u.era > this.eraOf(b.team)) return `${u.name} requires the ${ERAS[u.era].name}`;
    if (b.research) return 'Busy researching';
    if (b.queue.length >= 5) return 'Queue is full (5 max)';
    if (!this.canAfford(u.cost, b.team)) return `Need ${this.missingText(u.cost, b.team)} more for a ${u.name}`;
    return null;
  }

  trainAt(b, type) {
    const cost = UNIT_TYPES[type].cost;
    if (UNIT_TYPES[type].era > this.eraOf(b.team)) return false;
    if (!b.complete || b.research || b.queue.length >= 5 || !this.canAfford(cost, b.team)) return false;
    this.spend(cost, b.team);
    b.queue.push(type);
    b.redraw();
    if (b === this.selectedBuilding) this.emitSelection();
    return true;
  }

  updateTraining(dt) {
    for (const b of this.buildings) {
      if (!b.complete || !b.queue.length || b.research) continue;
      if (this.popUsedOf(b.team) >= this.popCapOf(b.team)) {
        if (!b.waitingForPop && b.team === this.me) this.fail('Population full — build a House!');
        b.waitingForPop = true;
        continue;
      }
      b.waitingForPop = false;
      b.trainTimer += dt / 1000;
      if (b.trainTimer >= UNIT_TYPES[b.queue[0]].trainTime) {
        this.spawnUnit(b, b.queue.shift());
        b.trainTimer = 0;
      }
      b.redraw();
    }
  }

  spawnUnit(b, type) {
    const toward = b.cy < (MAP_H * TILE) / 2 ? 1 : -1; // new units step out towards the middle of the map
    const side = { x: b.tx + Math.floor(b.w / 2), y: toward > 0 ? b.ty + b.h : b.ty - 1 };
    const spots = this.map.standSpots(b.tx, b.ty, b.w, b.h, side);
    const free = spots.find((s) => !this.units.some((u) => u.tile.x === s.x && u.tile.y === s.y)) || spots[0];
    if (!free) return;
    const u = new Unit(this, this.map, free.x, free.y, type, b.team);
    this.units.push(u);
    this.stats.trained(b.team);
    if (b.rally) this.sendToRally(u, b.rally);
  }

  // New units head for their building's rally point; workers get straight to work if it's on a job.
  sendToRally(u, r) {
    if (u.type === 'worker') {
      const at = this.map.buildingAt(r.x, r.y);
      if (at && at.team === u.team && !at.complete) { u.orderBuild(at); return; }
      if (at && at.team === u.team && at.type === 'farm' && !(at.farmer && !at.farmer.dead && at.farmer.order && at.farmer.order.farm === at)) {
        u.orderFarm(at);
        return;
      }
      if (this.map.resourceAt(r.x, r.y)) { u.orderGather(r); return; }
    }
    const spots = this.map.tilesAround(r.x, r.y, 9);
    if (spots.length) u.moveTo(spots[Math.floor(this.rand() * spots.length)]);
  }

  // Flag and dotted line showing where the selected building sends its new units.
  drawRally() {
    const g = this.rallyGfx;
    g.clear();
    const b = this.selectedBuilding;
    if (!b || !b.rally) return;
    const c = this.map.tileCenter(b.rally.x, b.rally.y);
    const a = toIso(b.cx, b.cy);
    const f = toIso(c.x, c.y);
    const n = Math.max(1, Math.floor(Phaser.Math.Distance.Between(a.x, a.y, f.x, f.y) / 10));
    g.fillStyle(0xf0e6c0, 0.8);
    for (let i = 1; i < n; i++) g.fillCircle(a.x + ((f.x - a.x) * i) / n, a.y + ((f.y - a.y) * i) / n, 1.4);
    g.fillStyle(0x000000, 0.3).fillEllipse(f.x + 2, f.y, 12, 5);
    g.fillStyle(0x3a2a1a, 1).fillRect(f.x - 1, f.y - 26, 2, 26);
    g.fillStyle(TEAM_COLORS.player.main, 1).fillTriangle(f.x + 1, f.y - 26, f.x + 15, f.y - 21, f.x + 1, f.y - 16);
    g.lineStyle(1, 0x000000, 0.5).strokeTriangle(f.x + 1, f.y - 26, f.x + 15, f.y - 21, f.x + 1, f.y - 16);
  }

  // Delete key / Delete button: get rid of your selected units or building.
  deleteSelected() {
    if (this.replay || this.spectator || this.gameOver) return;
    const units = [...this.selected].filter((u) => u.team === this.me);
    if (units.length) {
      this.issue({ k: 'delete', ids: units.map((u) => u.id) });
      audio.play('click');
      return;
    }
    const b = this.selectedBuilding;
    if (!b || b.team !== this.me) return;
    if (b.type === 'town_centre' && !(this.confirmDelete && this.confirmDelete.b === b && this.time.now - this.confirmDelete.at < 4000)) {
      this.confirmDelete = { b, at: this.time.now };
      this.toast('Press Delete again to tear down your Town Centre — without one, your side is out!', '#e07a6a');
      return;
    }
    this.confirmDelete = null;
    this.issue({ k: 'delete', b: b.id });
    audio.play('click');
  }

  stopSelected() {
    if (this.selected.size) this.issue({ k: 'stop', ids: [...this.selected].map((u) => u.id) });
  }

  // ---------- Control groups ----------
  setGroup(n, add) {
    const units = [...this.selected];
    if (!units.length) return;
    const g = add ? [...new Set([...this.groups[n].filter((u) => !u.dead), ...units])] : units;
    this.groups[n] = g;
    this.toast(`Group ${n}: ${g.length} unit${g.length > 1 ? 's' : ''}`);
  }

  recallGroup(n) {
    const g = (this.groups[n] = this.groups[n].filter((u) => !u.dead));
    if (!g.length) return;
    const now = this.time.now;
    const twice = this.lastGroupKey && this.lastGroupKey.n === n && now - this.lastGroupKey.t < 400;
    this.lastGroupKey = { n, t: now };
    this.selectWhere((u) => g.includes(u), false);
    if (twice) {
      const x = g.reduce((s, u) => s + u.isoX, 0) / g.length;
      const y = g.reduce((s, u) => s + u.isoY, 0) / g.length;
      this.cameras.main.pan(x, y, 250, 'Sine.easeInOut');
    }
  }

  // Units in group n (for the interface).
  groupOf(u) {
    return this.groups.findIndex((g) => g.includes(u));
  }

  // ---------- Selection ----------
  dragRect(w) {
    const x = Math.min(this.drag.x, w.x);
    const y = Math.min(this.drag.y, w.y);
    return new Phaser.Geom.Rectangle(x, y, Math.abs(w.x - this.drag.x), Math.abs(w.y - this.drag.y));
  }

  drawSelBox(w) {
    const r = this.dragRect(w);
    const z = this.cameras.main.zoom;
    this.selBox.clear();
    this.selBox.fillStyle(0x7cfc00, 0.12).fillRect(r.x, r.y, r.width, r.height);
    this.selBox.lineStyle(2 / z, 0x7cfc00, 1).strokeRect(r.x, r.y, r.width, r.height);
  }

  // Unit under an isometric point (aims at the middle of the body, not the feet).
  unitAt(ix, iy, team) {
    let best = null;
    let bestD = 15;
    for (const u of this.units) {
      if (team && u.team !== team) continue;
      const d = Phaser.Math.Distance.Between(ix, iy, u.isoX, u.isoY - 12);
      if (d < bestD) { bestD = d; best = u; }
    }
    return best;
  }

  enemyUnitAt(ix, iy) {
    let best = null;
    let bestD = 17;
    for (const u of this.units) {
      if (!this.isEnemy(u.team, this.me) || !u.container.visible) continue;
      const d = Phaser.Math.Distance.Between(ix, iy, u.isoX, u.isoY - 12);
      if (d < bestD) { bestD = d; best = u; }
    }
    return best;
  }

  selectWhere(pred, additive) {
    if (!additive) this.clearSelection(true);
    if (this.selectedBuilding) {
      this.selectedBuilding.setSelected(false);
      this.selectedBuilding = null;
    }
    for (const u of this.units) {
      if (u.team === this.me && pred(u)) {
        this.selected.add(u);
        u.setSelected(true);
      }
    }
    this.emitSelection();
  }

  // Double-click / Ctrl+click: every unit of the same type that's on screen.
  selectSameOnScreen(u, additive) {
    const v = this.cameras.main.worldView;
    this.selectWhere((x) => x.type === u.type && Phaser.Geom.Rectangle.Contains(v, x.isoX, x.isoY), additive);
  }

  selectBuilding(b) {
    this.clearSelection(true);
    this.selectedBuilding = b;
    b.setSelected(true);
    this.emitSelection();
  }

  deselect(u) {
    this.selected.delete(u);
    u.setSelected(false);
    this.emitSelection();
  }

  clearSelection(silent = false) {
    if (this.placing) this.cancelPlacing();
    if (this.targeting) this.cancelTargeting();
    for (const u of this.selected) u.setSelected(false);
    this.selected.clear();
    if (this.selectedBuilding) {
      this.selectedBuilding.setSelected(false);
      this.selectedBuilding = null;
    }
    if (!silent) this.emitSelection();
  }

  emitSelection() {
    this.drawRally();
    this.events.emit('selection', { units: [...this.selected], building: this.selectedBuilding });
  }

  selectIdleWorker() {
    const idle = this.units.filter((u) => u.type === 'worker' && u.team === this.me && u.isIdle);
    if (!idle.length) { this.fail('No idle workers'); return; }
    this.idleIndex = ((this.idleIndex ?? -1) + 1) % idle.length;
    const u = idle[this.idleIndex];
    this.selectWhere((x) => x === u, false);
    this.cameras.main.pan(u.isoX, u.isoY, 250, 'Sine.easeInOut');
  }

  // ---------- Right-click orders ----------
  // Right-click at grid point (wx, wy). `iso` is the isometric click point when it came from the mouse.
  commandAt(wx, wy, iso) {
    if (this.replay) return;
    const sb = this.selectedBuilding;
    if (!this.selected.size && sb && sb.team === this.me && sb.def.trains) {
      const rt = this.map.worldToTile(wx, wy);
      this.issue({ k: 'rally', b: sb.id, x: rt.x, y: rt.y });
      audio.play('confirm');
      this.showMarker(wx, wy, 0xf0e6c0);
      return;
    }
    if (!this.selected.size) return;
    const t = this.map.worldToTile(wx, wy);
    const b = iso ? this.buildingAtIso(iso.x, iso.y) : this.map.buildingAt(t.x, t.y);
    const units = [...this.selected];
    const ids = units.map((u) => u.id);
    if (iso) audio.play('confirm');

    // What did we click on? Work it out here (where the player sees things) and send it by id.
    const enemy = (iso && this.enemyUnitAt(iso.x, iso.y)) || (b && this.isEnemy(b.team, this.me) ? b : null);
    if (enemy) {
      this.issue({ k: 'order', ids, x: wx, y: wy, target: enemy.id });
      this.showMarker(wx, wy, 0xff4444);
      return;
    }
    const hasWorkers = units.some((u) => u.type === 'worker');
    const deer = iso && hasWorkers ? this.wildlife.at(iso.x, iso.y) : null;
    const job = hasWorkers && (deer || (b && (!b.complete || b.type === 'farm')) || this.map.resourceAt(t.x, t.y));
    this.issue({ k: 'order', ids, x: wx, y: wy, at: b ? b.id : null, deer: deer ? deer.id : null });
    this.showMarker(wx, wy, job ? 0x7cfc00 : 0xffffff);
  }

  // A right-click order, carried out on the tick it was sent for.
  execOrder(units, c, team) {
    const wx = c.x;
    const wy = c.y;
    if (c.target != null) {
      const target = this.byId(c.target);
      if (target && this.isEnemy(target.team, team) && this.atPeace()) {
        if (team === this.me) this.fail(`Peace time: no fighting for another ${fmtClock(this.peaceUntil - this.gameTime)}`);
      } else if (target && this.isEnemy(target.team, team)) { units.forEach((u) => u.orderAttack(target)); return; }
      this.moveGroup(units, wx, wy); // it died on the way: just go there
      return;
    }
    const t = this.map.worldToTile(wx, wy);
    const b = c.at != null ? this.byId(c.at) : null;
    const res = this.map.resourceAt(t.x, t.y);
    const workers = units.filter((u) => u.type === 'worker');
    let movers = units.filter((u) => u.type !== 'worker');

    // Hunt a deer.
    const deer = c.deer != null && workers.length ? this.wildlife.byId(c.deer) : null;
    if (deer) {
      workers.forEach((w) => w.orderHunt(deer));
      if (movers.length) this.moveGroup(movers, wx, wy);
      return;
    }

    const ours = b && b.team === team;
    if (workers.length && ours && !b.complete) {
      workers.forEach((w) => w.orderBuild(b));
    } else if (workers.length && ours && b.type === 'farm') {
      const [first, ...rest] = workers;
      const taken = b.farmer && b.farmer.order && b.farmer.order.farm === b && b.farmer !== first;
      if (!taken) first.orderFarm(b);
      else movers.push(first);
      movers.push(...rest);
    } else if (workers.length && res) {
      const tiles = this.map.resourceTilesNear(res, t.x, t.y, 4);
      if (tiles.length) workers.forEach((w, i) => w.orderGather(tiles[i % tiles.length]));
    } else {
      movers = units;
    }
    if (movers.length) this.moveGroup(movers, wx, wy);
  }

  moveGroup(units, wx, wy) {
    const t = this.map.worldToTile(wx, wy);
    const goals = this.map.tilesAround(t.x, t.y, units.length);
    if (!goals.length) return;
    // Closest units take the closest spots so the group doesn't cross over itself.
    units.sort((a, b) => Phaser.Math.Distance.Between(a.x, a.y, wx, wy) - Phaser.Math.Distance.Between(b.x, b.y, wx, wy));
    units.forEach((u, i) => u.moveTo(goals[Math.min(i, goals.length - 1)]));
  }

  showMarker(wx, wy, color) {
    const i = toIso(wx, wy);
    const m = this.add.ellipse(i.x, i.y, 26, 13).setStrokeStyle(2, color).setDepth(1e6);
    this.tweens.add({ targets: m, scale: 0.2, alpha: 0, duration: 450, onComplete: () => m.destroy() });
  }

  // ---------- Winning & losing ----------
  checkGameOver() {
    if (this.gameOver) return;
    // A side is out when its Town Centre falls (or it resigns). Everything it has left crumbles away.
    for (const id of this.teamIds) {
      const T = this.teams[id];
      if (T.out) continue;
      if (T.resigned || !this.buildings.some((b) => b.team === id && b.type === 'town_centre')) this.eliminate(id);
    }
    const wonder = this.rules.victory === 'conquest' ? null : this.buildings.find((b) => b.def.wonder && b.complete && b.wonderTime >= 180);
    const alive = new Set(this.liveTeams().map((t) => this.alliance[t]));
    let winner = null; // the winning alliance
    let result = null;
    if (wonder) {
      winner = this.alliance[wonder.team];
      result = this.alliance[this.self] === winner ? 'green' : 'defeat';
    } else if (this.climate.temp >= 5) {
      result = 'collapse';
    } else if (this.freeplay) {
      // practice only ends when you say so (or your town falls)
      if (this.practiceDone) { result = 'practice'; this.endNote = this.practice ? this.practice.summary() : ''; }
      else if (this.teams[this.self].out) result = 'defeat';
    } else if (alive.size <= 1) {
      winner = alive.size ? [...alive][0] : null;
      result = winner !== null && this.alliance[this.self] === winner ? 'victory' : 'defeat';
      if (!this.endNote && this.lastOut && this.teams[this.lastOut].resigned) {
        this.endNote = this.lastOut === this.self ? 'You resigned.' : `${this.teamName(this.lastOut)} resigned.`;
      }
    } else if (this.teams[this.self].out && !this.mp) {
      result = 'defeat'; // on your own, the game stops when you're out
    }
    if (!result) return;
    if ((this.net && this.net.spectator) || (this.replay && this.mp)) {
      const names = this.teamIds.filter((t) => this.alliance[t] === winner).map((t) => this.teamName(t));
      if (result !== 'collapse') { result = 'over'; this.endNote = winner === null ? 'Nobody won.' : `${names.join(' & ')} won.`; }
    }
    this.gameOver = result;
    this.winner = winner;
    this.stats.sample(this);
    this.cancelTargeting();
    audio.play(result === 'victory' || result === 'green' || result === 'over' || result === 'practice' ? 'victory' : 'defeat');
    this.clearSelection();
    this.finishRecording(result);
    if (this.net) this.net.send({ t: 'over' });
    this.events.emit('gameOver', result);
  }

  // A side is out of the game.
  eliminate(id) {
    const T = this.teams[id];
    T.out = true;
    this.lastOut = id;
    for (const u of this.units.filter((x) => x.team === id)) this.killUnit(u);
    for (const b of this.buildings.filter((x) => x.team === id)) { b.hp = 0; this.removeBuilding(b); }
    for (const b of this.buildings) for (const g of [...b.garrison]) if (g.team === id) this.killUnit(g);
    const name = this.teamName(id);
    if (id === this.me) {
      this.endNote = T.resigned ? 'You resigned.' : null;
      if (this.mp && !this.replay) {
        // Online the match carries on: you can keep watching.
        this.spectator = true;
        this.clearSelection();
        this.cancelPlacing && this.cancelPlacing();
        if (this.fog.enabled) { this.fog.enabled = false; this.fog.visible.fill(1); this.fog.explored.fill(1); this.fog.draw(); this.fog.applyVisibility(); }
        this.events.emit('eliminated');
      }
    } else {
      this.toast(`${T.resigned ? '🏳' : '⚔'} ${name} ${T.resigned ? 'resigned' : 'has been defeated'}${this.isAlly(id, this.me) ? ' (your ally)' : ''}`,
        this.isAlly(id, this.me) ? '#e0a49c' : '#b8dc90');
    }
  }

  // ---------- Every frame ----------
  update(time, delta) {
    const cam = this.cameras.main;
    const k = this.keys;
    const speed = (700 * delta) / 1000 / cam.zoom;
    let dx = 0;
    let dy = 0;
    if (k.LEFT.isDown) dx -= 1;
    if (k.RIGHT.isDown) dx += 1;
    if (k.UP.isDown) dy -= 1;
    if (k.DOWN.isDown) dy += 1;

    // Scroll when the mouse is at the edge of the screen.
    const p = this.input.activePointer;
    const edge = 12;
    if (this.pointerInGame && !this.drag && !this.gameOver) {
      if (p.x < edge) dx -= 1;
      else if (p.x > this.scale.width - edge) dx += 1;
      if (p.y < edge) dy -= 1;
      else if (p.y > this.scale.height - edge) dy += 1;
    }
    if (dx || dy) {
      cam.scrollX += Math.sign(dx) * speed;
      cam.scrollY += Math.sign(dy) * speed;
      if (this.placing) this.updateGhost();
    }

    // Upload terrain changes to the graphics card (at most a few times a second, and
    // only the changed part of the big ground canvas, not all of it).
    this.terrainRefreshTimer -= delta;
    if (this.terrainDirty && this.terrainRefreshTimer <= 0) {
      this.uploadGround();
      this.terrainDirty = false;
      this.terrainRefreshTimer = 300;
    }
    // Trees far off screen leave the display list entirely.
    if (this.trees) this.trees.cull(cam.worldView);
    if ((this.cullFrame = (this.cullFrame || 0) + 1) % 3 === 0) this.cullObjects(cam.worldView);
    // Ambience follows the climate; fire crackle only when fires are on screen.
    this.fireCheck -= delta;
    if (this.fireCheck <= 0) {
      this.fireCheck = 500;
      const v = cam.worldView;
      this.firesOnScreen = 0;
      for (const f of this.climate.fires.values()) {
        const i = toIso(f.x * TILE + 16, f.y * TILE + 16);
        if (Phaser.Geom.Rectangle.Contains(v, i.x, i.y)) this.firesOnScreen++;
      }
    }
    audio.updateAmbience(delta / 1000, { temp: this.climate.temp, firesOnScreen: this.firesOnScreen, paused: this.paused || !!this.gameOver });

    this.fx.updateGrade(this.climate.temp, this.climate.drought + this.climate.heatwave);
    this.moodTimer -= delta;
    if (this.moodTimer <= 0) {
      this.moodTimer = 2000;
      const era = this.eraOf(this.me);
      audio.setMood(this.climate.temp > 2.5 ? 'tense' : era === 0 ? 'calm' : era <= 2 ? 'industry' : 'hope');
    }
    if (!this.paused && !this.gameOver) this.updateCursor(delta);
    else this.setCursor('arrow');
    // Online the game never pauses for one player (the menu just covers the screen).
    if (this.gameOver || (this.paused && !this.net)) return;
    this.rainTime = Math.max(0, this.rainTime - delta / 1000);
    const view = this.cameras.main.worldView;
    this.fx.updateDamage(delta, this.buildings, view);
    this.prewarmStyles(delta);
    this.wildlife.render(time, this.fog);
    this.fx.updateBirds(delta, view, this.climate.temp);
    this.ambientEffects(delta);
    // Online: we may only run ticks whose turn has arrived from the server.
    const limit = this.net ? (this.net.maxTurn + 1) * this.net.ticksPerTurn : Infinity;
    if (this.net && limit - this.tick > 20) {
      // Behind (just rejoined, back from a dropout, or a slow frame): fast-forward as quickly as the computer
      // allows. A long way behind, the map is hidden meanwhile so all the time goes into catching up.
      const far = limit - this.tick > 200;
      this.catchingUp = { done: this.tick, of: limit, far };
      const until = performance.now() + (far ? 120 : 30);
      this.renderShots = false;
      if (far) this.cameras.main.setVisible(false);
      while (this.tick < limit - 2 && !this.gameOver && performance.now() < until) this.tickOnce();
      this.acc = 0;
      this.interpolate(1);
      return;
    }
    if (this.catchingUp) {
      this.catchingUp = null;
      this.renderShots = true;
      this.cameras.main.setVisible(true);
    }

    // Turn real time into fixed 50 ms ticks (faster game speeds run more ticks per second).
    // A lag spike is capped so units don't teleport.
    this.acc += Math.min(delta, 100) * this.speed;
    let n = 0;
    if (this.replay && !this.replayEnded && this.tick >= (this.replay.ticks || Infinity)) {
      this.replayEnded = true;
      this.toast('The replay has ended. Esc opens the menu.', '#d8c9a0');
    }
    while (this.acc >= TICK_MS && !this.gameOver && !this.replayEnded && n < MAX_TICKS_PER_FRAME && this.tick < limit) {
      this.tickOnce();
      this.acc -= TICK_MS;
      n++;
    }
    // Waiting for the next turn from the server (or a lag spike): don't build up a backlog.
    if (n >= MAX_TICKS_PER_FRAME || this.tick >= limit) this.acc = Math.min(this.acc, TICK_MS);
    for (const u of this.units) u.updateVisual(delta);
    this.interpolate(this.gameOver ? 1 : this.acc / TICK_MS);
  }

  // Drifting cloud shadows and glints of sunlight on water near the camera.
  ambientEffects(delta) {
    for (const c of this.clouds) {
      c.x += (c.speed * delta) / 1000;
      c.y += (c.speed * 0.3 * delta) / 1000;
      if (c.x > ISO_W + 900) { c.x = -900; c.y = Math.random() * ISO_H; }
      if (c.y > ISO_H + 500) c.y = -500;
    }
    this.glintTimer -= delta;
    if (this.glintTimer > 0 || this.glints > 40) return;
    this.glintTimer = 70;
    const v = this.cameras.main.worldView;
    const ix = v.x + Math.random() * v.width;
    const iy = v.y + Math.random() * v.height;
    const g = fromIso(ix, iy);
    const tx = Math.floor(g.x / TILE);
    const ty = Math.floor(g.y / TILE);
    if (!this.map.inBounds(tx, ty) || this.map.get(tx, ty) !== TERRAIN.WATER) return;
    if (this.fog && !this.fog.isExplored(tx, ty)) return;
    const s = this.add.image(ix, iy, 'glint').setDepth(1).setAlpha(0).setScale(0.6 + Math.random() * 0.8);
    this.glints++;
    this.tweens.add({
      targets: s, alpha: 0.75, duration: 450, yoyo: true, ease: 'Sine.easeInOut',
      onComplete: () => { s.destroy(); this.glints--; },
    });
  }

  // ---------- Online ----------
  listenToNet(net) {
    this.netWait = null;
    net.on('chat', (m) => this.events.emit('chat', m))
      .on('wait', (m) => { this.netWait = { name: m.name, until: Date.now() + m.seconds * 1000 }; })
      .on('resume', () => { this.netWait = null; })
      .on('welcome', () => { this.netDown = false; })
      .on('disconnected', () => { this.netDown = true; })
      .on('lost', () => this.toast('Lost the connection to the game server.', '#e07a6a'))
      .on('desync', (m) => {
        this.desync = m.tick;
        this.toast('⚠ The two games have drifted out of sync. Results from here on may differ between you.', '#e07a6a');
      })
      .on('left', (m) => this.opponentLeft(m))
      .on('error', (m) => this.toast(m.msg, '#e07a6a'));
  }

  // Someone quit or never came back. (The room turns that into a 'resign' order for their side, so every
  // computer removes them on the same tick.)
  opponentLeft(m) {
    this.netWait = null;
    if (m.slot === this.net.slot) return;
    this.toast(m.reason === 'timeout' ? `${m.name} lost connection and didn't come back.` : `${m.name} left the game.`, '#d8c9a0');
  }

  // Messages as peace time runs out.
  peaceCheck() {
    const left = this.peaceUntil - this.gameTime;
    if (!this.peaceWarned && left <= 60 && this.peaceUntil > 60) {
      this.peaceWarned = 1;
      this.toast('One minute of peace left. Get your army ready!', '#e3c46f');
    }
    if (left <= 0) {
      this.peaceUntil = 0;
      this.toast('⚔ Peace time is over. Let the fighting begin!', '#e07a6a');
    }
  }

  // Spectators and replays can follow any side: its resources, research and army show in the panels.
  setView(team) {
    if (!this.teams[team]) return;
    this.me = team;
    this.foe = this.teamIds.find((t) => this.isEnemy(t, team)) || this.teamIds.find((t) => t !== team);
    this.resources = this.teams[team].resources;
    this.upgrades = this.teams[team].upgrades;
    this.clearSelection();
    this.events.emit('viewChanged', team);
  }

  get canSwitchView() {
    return !!(this.spectator || this.replay);
  }

  // A side's name: the player's name online, "You" / colour names against the computer.
  teamName(team) {
    const t = this.setup.teams.find((x) => x.id === team);
    if (!this.mp && team === this.self && !this.replay) return 'You';
    return (t && t.name) || TEAM_NAMES[team] || team;
  }

  resign() {
    if (!this.net || this.gameOver || this.spectator) return;
    this.issue({ k: 'resign' });
  }

  // ---------- Deterministic simulation: ids, random numbers, commands, ticks ----------
  rand() {
    return this.rng.next();
  }

  newId() {
    return this.nextId++;
  }

  byId(id) {
    const e = this.ents.get(id);
    return e && !e.dead ? e : null;
  }

  // Everything the player does to the game goes through here. Commands wait for the next tick,
  // so they happen at the same moment in the recording (and, later, on every computer online).
  issue(cmd) {
    if (this.replay || this.gameOver || this.spectator) return;
    if (this.net) this.net.send({ t: 'cmd', c: { p: this.me, ...cmd } }); // comes back to everyone in a turn
    else this.pending.push({ p: this.me, ...cmd });
  }

  execute(c) {
    const team = c.p || 'player';
    const live = new Set(this.units); // garrisoned units aren't on the field
    const units = (c.ids || []).map((id) => this.ents.get(id))
      .filter((u) => u && !u.dead && !u.isBuilding && u.team === team && live.has(u));
    const b = c.b != null ? this.byId(c.b) : null;
    const own = b && b.isBuilding && b.team === team ? b : null;
    switch (c.k) {
      case 'order': if (units.length) this.execOrder(units, c, team); break;
      case 'move': if (units.length) this.moveGroup(units, c.x, c.y); break;
      case 'amove': {
        const army = units.filter((u) => u.isMilitary);
        const t = this.map.worldToTile(c.x, c.y);
        const spots = this.map.tilesAround(t.x, t.y, army.length);
        army.forEach((u, i) => u.orderAttackMove(spots[i] || t));
        break;
      }
      case 'stop': units.forEach((u) => u.stop()); break;
      case 'rally':
        if (own && own.def.trains) {
          own.rally = { x: c.x, y: c.y };
          if (own === this.selectedBuilding) this.drawRally();
        }
        break;
      case 'place': this.execPlace(c, units, team); break;
      case 'wall': this.execWall(c, units, team); break;
      case 'train': {
        if (!own) break;
        const problem = this.trainProblem(own, c.type);
        if (problem) { if (team === this.me) this.fail(problem); break; }
        this.trainAt(own, c.type);
        break;
      }
      case 'research': if (own) this.startResearch(own, 'upgrade', c.id); break;
      case 'era': if (own) this.startResearch(own, 'era'); break;
      case 'cancel': if (own) this.cancelTrain(own, c.i); break;
      case 'bell': this.ringBell(team); break;
      case 'allclear': this.allClear(team); break;
      case 'trade':
        this.trade(c.pay, c.buy, team);
        if (team === this.me) this.events.emit('market');
        break;
      case 'tribute': this.tribute(team, c.to, c.res, c.amount); break;
      case 'finish': if (this.freeplay) { this.practiceDone = true; this.checkGameOver(); } break;
      case 'delete':
        for (const u of units) this.killUnit(u);
        if (own) {
          // A foundation nobody has started building gives its cost back.
          if (!own.complete && !(own.progress > 0)) {
            for (const [r, n] of Object.entries(own.def.cost || {})) {
              const key = r === 'energy' ? 'clean' : r;
              if (key in this.teams[team].resources) this.teams[team].resources[key] += n;
            }
          }
          if (own === this.selectedBuilding) this.clearSelection();
          own.hp = 0;
          this.removeBuilding(own);
        }
        break;
      case 'resign':
        if (this.teams[team] && !this.teams[team].out) this.teams[team].resigned = true;
        break;
      default: break;
    }
  }

  execPlace(c, units, team) {
    const def = BUILDING_TYPES[c.type];
    const problem = this.placeProblem(c.type, team)
      || (!this.canPlaceAt(c.type, c.tx, c.ty) ? "Can't build there" : null)
      || (!this.canAfford(def.cost, team) ? `Need ${this.missingText(def.cost, team)} more for a ${def.name}` : null);
    if (problem) { if (team === this.me) this.fail(problem); return; }
    const b = this.placeBuilding(c.type, c.tx, c.ty, team);
    for (const u of units) if (u.type === 'worker') u.orderBuild(b);
  }

  execWall(c, units, team) {
    const def = BUILDING_TYPES[c.type];
    if (!def || !def.line || this.placeProblem(c.type, team)) return;
    const tiles = (c.tiles || []).slice(0, 80);
    let placed = 0;
    let first = null;
    for (const [x, y] of tiles) {
      if (!this.canAfford(def.cost, team)) break;
      if (!this.canPlaceAt(c.type, x, y)) continue;
      const b = this.placeBuilding(c.type, x, y, team);
      first = first || b;
      placed++;
    }
    if (team === this.me) {
      if (!placed) this.fail(`Need ${this.missingText(def.cost, team)} more for a ${def.name}`);
      else if (placed < tiles.length) this.fail(`Ran out of stone after ${placed} wall sections`);
    }
    // Bridges are built from the bank outwards: start on a section that touches walkable ground.
    if (first && def.bridge) {
      const placedHere = this.buildings.filter((b) => b.def.bridge && !b.complete && tiles.some(([x, y]) => b.tx === x && b.ty === y));
      const touchesLand = (b) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => this.map.isWalkable(b.tx + dx, b.ty + dy, team));
      const ws = units.filter((u) => u.type === 'worker');
      const cx = ws.reduce((a, u) => a + u.x, 0) / Math.max(1, ws.length);
      const cy = ws.reduce((a, u) => a + u.y, 0) / Math.max(1, ws.length);
      const starts = placedHere.filter(touchesLand).sort((a, b) => Math.hypot(a.cx - cx, a.cy - cy) - Math.hypot(b.cx - cx, b.cy - cy));
      if (starts.length) first = starts[0];
    }
    if (first) for (const u of units) if (u.type === 'worker') u.orderBuild(first);
  }

  // One fixed tick: carry out this tick's commands, then move the world on by 50 ms.
  tickOnce() {
    const net = this.net;
    if (net && this.tick % net.ticksPerTurn === 0) {
      const cmds = net.turn(this.tick / net.ticksPerTurn) || [];
      for (const c of cmds) {
        if (this.recording) this.recording.cmds.push([this.tick, c]);
        this.execute(c);
      }
    } else if (this.replay) {
      const cmds = this.replay.cmds;
      while (this.replayCursor < cmds.length && cmds[this.replayCursor][0] <= this.tick) {
        this.execute(cmds[this.replayCursor][1]);
        this.replayCursor++;
      }
    } else if (this.pending.length) {
      const batch = this.pending;
      this.pending = [];
      for (const c of batch) {
        if (this.recording) this.recording.cmds.push([this.tick, c]);
        this.execute(c);
      }
    }
    for (const u of this.units) { u.ox = u.px; u.oy = u.py; }
    this.wildlife.snapshot();
    this.step(TICK_MS);
    this.tick++;
    if (this.practice) this.practice.update(TICK_MS);
    if (this.tick % HASH_EVERY === 0) this.checkHash();
  }

  // A fingerprint of everything that matters in the game. Two computers running the same game
  // must get the same number on the same tick — if not, they've drifted apart ("desync").
  stateHash() {
    const nums = [this.tick, this.rng.state, this.units.length, this.buildings.length];
    for (const u of this.units) nums.push(u.id, u.px, u.py, u.hp);
    for (const b of this.buildings) nums.push(b.id, b.hp, b.progress || 0, b.queue.length);
    for (const team of this.teamIds) {
      const t = this.teams[team];
      nums.push(t.out ? 1 : 0);
      for (const k of Object.keys(t.resources).sort()) nums.push(t.resources[k]);
      nums.push(t.era, t.upgrades.size);
    }
    nums.push(this.climate.co2, this.climate.temp);
    return hashNumbers(nums);
  }

  checkHash() {
    const h = this.stateHash();
    if (this.net) this.net.send({ t: 'hash', tick: this.tick, h });
    if (this.recording) {
      this.recording.hashes.push([this.tick, h]);
      return;
    }
    if (!this.replay) return;
    const hs = this.replay.hashes || [];
    while (this.hashCursor < hs.length && hs[this.hashCursor][0] < this.tick) this.hashCursor++;
    const e = hs[this.hashCursor];
    if (!e || e[0] !== this.tick) return;
    this.syncChecks++;
    if (e[1] !== h && this.desync == null) {
      this.desync = this.tick;
      this.toast(`⚠ Replay went out of sync at ${Math.floor(this.tick / 1200)}:${String(Math.floor(this.tick / 20) % 60).padStart(2, '0')}`, '#e07a6a');
    }
  }

  // Save the recording of this game (on game over, and when leaving it).
  finishRecording(result = null) {
    const r = this.recording;
    if (!r || this.tick < 100) return null;
    if (result) r.result = result;
    // Ticks played. A game ends part-way through a tick, so that tick counts too.
    r.ticks = this.gameOver ? Math.max(r.ticks || 0, this.tick + 1) : this.tick;
    r.gameTime = this.gameTime;
    r.era = this.eraOf(this.me);
    saveReplay(r);
    return r;
  }

  // Draw units part-way between their last two tick positions, so movement stays smooth at any frame rate.
  interpolate(a) {
    for (const u of this.units) {
      let iso;
      const dx = u.ox === undefined ? 0 : u.px - u.ox;
      const dy = u.oy === undefined ? 0 : u.py - u.oy;
      if (u.ox === undefined || dx * dx + dy * dy > TILE * TILE * 4) iso = toIso(u.px, u.py); // teleported: don't slide
      else iso = toIso(u.ox + dx * a, u.oy + dy * a);
      // (plus the little visual step a worker takes to stand right at the tree / rock / wall)
      u.container.setPosition(iso.x + u.vox, iso.y + u.voy);
      // only re-sort the scene when a unit really moves to a new row (sorting everything is dear)
      const q = (iso.y + u.voy) | 0;
      if (u.depthQ !== q) { u.depthQ = q; u.container.setDepth(q); }
    }
    this.wildlife.interpolate(a);
  }

  // One tick of the simulation.
  step(dt) {
    this.gameTime += dt / 1000;
    if (this.peaceUntil) this.peaceCheck();
    this.updateProjectiles(dt);
    for (const u of [...this.units]) u.update(dt, this);
    for (const b of [...this.buildings]) b.update(dt, this);
    this.updateTraining(dt);
    this.updateMarket(dt);
    this.wildlife.update(dt, this);
    this.climate.update(dt);
    for (const a of this.ais) if (!this.teams[a.team].out) a.update(dt);
    if (this.fog) this.fog.update(dt);
    this.stats.update(dt, this);
    this.checkGameOver();
  }
}
