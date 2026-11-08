// The main game world: map, units, buildings, economy, combat, climate, the AI, camera and controls.
import {
  TILE, MAP_W, MAP_H, MAP_SEED, PLAYER_START, ENEMY_START, START_RESOURCES, POP_MAX, TEAM_COLORS, TERRAIN, CLIMATE,
} from '../config.js';
import { GameMap } from '../map.js';
import { Unit, UNIT_TYPES } from '../unit.js';
import { Building, BUILDING_TYPES, UPGRADES, ERAS } from '../buildings.js';
import { generateArt, buildingKey, buildingTexInfo, ART_RES } from '../art.js';
import { toIso, fromIso, ISO_W, ISO_H } from '../iso.js';
import { Climate } from '../climate.js';
import { findPath } from '../pathfinding.js';
import { EnemyAI, DIFFICULTY } from '../ai.js';
import { audio } from '../audio.js';
import { Fog } from '../fog.js';

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  // data: { seed, difficulty } for a new game, or { load: <save data> } to continue a saved one.
  create(data = {}) {
    const save = data.load || null;
    this.savedGroups = null;
    this.difficulty = save ? save.difficulty : data.difficulty || 'normal';
    const seed = save ? save.seed : data.seed ?? MAP_SEED;

    // --- Art (drawn with code at start-up) & sound ---
    generateArt(this, BUILDING_TYPES);
    audio.init(this.sound.context);
    audio.startAmbience();
    this.fireCheck = 0;
    this.firesOnScreen = 0;

    // --- Map: painted onto a canvas texture we can repaint when tiles change ---
    this.map = new GameMap(MAP_W, MAP_H, seed);
    if (save) {
      this.map.tiles.set(save.map.tiles);
      this.map.amount.set(save.map.amount);
      this.map.elev.set(save.map.elev);
      this.map.seaLevel = save.map.seaLevel;
    }
    if (this.textures.exists('terrain')) this.textures.remove('terrain');
    this.terrainTex = this.textures.createCanvas('terrain', ISO_W, ISO_H);
    this.terrainCtx = this.terrainTex.getContext();
    this.map.renderAll(this.terrainCtx);
    this.terrainTex.refresh();
    this.terrainDirty = false;
    this.add.image(0, 0, 'terrain').setOrigin(0).setDepth(-1);
    this.map.onTileChanged = (x, y) => this.redrawTile(x, y);

    // --- Camera ---
    const cam = this.cameras.main;
    cam.setBounds(-200, -150, ISO_W + 400, ISO_H + 450);
    cam.setBackgroundColor('#0b0c0d');
    const h = this.map.tileCenter(PLAYER_START.x, PLAYER_START.y);
    this.home = toIso(h.x, h.y);
    cam.centerOn(this.home.x, this.home.y);
    this.terrainRefreshTimer = 0;

    // --- Teams: each has its own resources and upgrades ---
    this.teams = {
      player: { resources: { ...START_RESOURCES }, upgrades: new Set(), era: 0 },
      enemy: { resources: { ...START_RESOURCES }, upgrades: new Set(), era: 0 },
    };
    this.resources = this.teams.player.resources; // shortcuts for the player
    this.upgrades = this.teams.player.upgrades;
    this.buildings = [];
    this.units = [];
    this.gameTime = 0;
    this.gameOver = null;
    this.paused = false;
    this.lastAttackAlert = -999;

    if (save) {
      this.restore(save);
    } else {
      // --- Starting bases ---
      this.setupBase(PLAYER_START, 'player', ['worker', 'worker', 'worker', 'worker', 'soldier', 'soldier', 'soldier'], 2);
      this.setupBase(ENEMY_START, 'enemy', ['worker', 'worker', 'worker', 'worker', 'soldier', 'soldier', 'soldier'], -2);
      const bonus = DIFFICULTY[this.difficulty].bonus;
      for (const k of ['food', 'wood', 'stone']) this.teams.enemy.resources[k] += bonus;
      // --- Climate & AI ---
      this.climate = new Climate(this);
      this.ai = new EnemyAI(this, 'enemy', this.difficulty);
    }

    // --- Fog of war ---
    const fogOn = save ? (save.fog ? save.fog.enabled : true) : data.fog !== false;
    this.fog = new Fog(this, fogOn, save && save.fog ? save.fog.explored : null);
    this.fog.applyVisibility();

    // --- Living world: cloud shadows drifting over the land, glints on the water ---
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
    this.keys = this.input.keyboard.addKeys('UP,DOWN,LEFT,RIGHT,SHIFT,ESC,H,PERIOD', false);
    this.keys.ESC.on('down', () => {
      if (this.paused || this.gameOver) return;
      if (this.placing) this.cancelPlacing();
      else if (this.selected.size || this.selectedBuilding) this.clearSelection();
      else this.events.emit('openMenu');
    });
    this.input.keyboard.on('keydown-F10', () => { if (!this.gameOver) this.events.emit('openMenu'); });
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
        const u = this.unitAt(iso.x, iso.y, 'player');
        const now = this.time.now;
        const ctrl = p.event && (p.event.ctrlKey || p.event.metaKey);
        const dbl = u && this.lastClick && this.lastClick.unit === u && now - this.lastClick.t < 350;
        this.lastClick = { unit: u, t: now };
        if (u && (dbl || ctrl)) this.selectSameOnScreen(u, additive);
        else if (u && additive && this.selected.has(u)) this.deselect(u);
        else if (u) this.selectWhere((x) => x === u, additive);
        else {
          const b = this.buildingAtIso(iso.x, iso.y);
          if (b && b.team === 'player') this.selectBuilding(b);
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
          if (tgt) u.orderAttack(tgt);
        }
      }
      u.carry = d.carry;
      u.carryType = d.carryType;
      u.updateCarryIcon();
    });
    this.climate = new Climate(this);
    const c = save.climate;
    Object.assign(this.climate, { co2: c.co2, temp: c.temp, drought: c.drought, seaStage: c.seaStage, warnedStage: c.warnedStage, fireBudget: c.fireBudget, disasterTimer: c.disasterTimer, emittedTotal: c.emittedTotal });
    for (const f of c.fires) this.climate.fires.set(f.y * this.map.w + f.x, { ...f });
    for (const a of c.ash) this.climate.ash.set(a.y * this.map.w + a.x, { ...a });
    this.ai = new EnemyAI(this, 'enemy', this.difficulty);
    Object.assign(this.ai, { nextWave: save.ai.nextWave, waveSize: save.ai.waveSize, waveNum: save.ai.waveNum });
    save.ai.assault.forEach((i) => us[i] && this.ai.assault.add(us[i]));
    this.savedGroups = (save.groups || []).map((g) => g.map((i) => us[i]).filter(Boolean));
    const cam = this.cameras.main;
    cam.setZoom(save.camera.zoom);
    cam.centerOn(save.camera.x, save.camera.y);
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
  redrawTile(x, y) {
    this.map.renderRegion(this.terrainCtx, x - 1, y - 1, x + 1, y + 1);
    if (this.miniDirty !== undefined) this.miniDirty = true;
    this.terrainDirty = true;
    this.events.emit('tileChanged', x, y);
  }

  smoke(x, y) {
    const p = this.add.circle(x + (Math.random() - 0.5) * 4, y, 4, 0x5f5c58, 0.28).setDepth(8e5);
    this.tweens.add({
      targets: p, y: y - 70 - Math.random() * 30, x: p.x + 20 + Math.random() * 25, scale: 3.5, alpha: 0,
      duration: 3200, onComplete: () => p.destroy(),
    });
  }

  unitsInRect(tx, ty, w, h) {
    return this.units.some((u) => {
      const t = u.tile;
      return t.x >= tx && t.x < tx + w && t.y >= ty && t.y < ty + h;
    });
  }

  // ---------- Economy (per team) ----------
  popUsedOf(team) {
    return this.units.filter((u) => u.team === team).length;
  }

  popCapOf(team) {
    const total = this.buildings
      .filter((b) => b.team === team && b.complete)
      .reduce((sum, b) => sum + (b.def.pop || 0), 0);
    return Math.min(POP_MAX, total);
  }

  get popUsed() { return this.popUsedOf('player'); }
  get popCap() { return this.popCapOf('player'); }

  // "energy" = fossil fuel + clean energy together.
  have(k, team = 'player') {
    const r = this.teams[team].resources;
    return k === 'energy' ? r.fuel + r.clean : r[k];
  }

  canAfford(cost, team = 'player') {
    return Object.entries(cost).every(([k, v]) => this.have(k, team) >= v);
  }

  missingText(cost, team = 'player') {
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
    // Coal gets burned for energy — that's where the CO₂ comes from (anyone's coal heats everyone's planet).
    if (res === 'fuel' && n > 0) this.climate.addCO2(n * CLIMATE.co2PerFuel);
  }

  productionMultiplier(res, team) {
    return res === 'clean' && this.teams[team].upgrades.has('smart_grid') ? 1.5 : 1;
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
      if (b.team === 'player') this.fail(problem);
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
      if (b.team === 'player') audio.play('fanfare');
      if (b.team === 'player') this.toast(`Your people have entered the ${ERAS[t.era].name}`, '#d8c9a0');
      else this.toast(`The enemy has entered the ${ERAS[t.era].name}`, '#d9a39b');
    } else {
      t.upgrades.add(r.id);
      if (b.team === 'player') { this.toast(`${UPGRADES[r.id].name} researched: ${UPGRADES[r.id].desc}`, '#b8c99a'); audio.play('chime'); }
    }
    b.redraw();
    if (b.team === 'player') this.emitSelection();
  }

  // Player buttons
  research(id) {
    if (this.selectedBuilding) this.startResearch(this.selectedBuilding, 'upgrade', id);
  }

  advanceEra() {
    if (this.selectedBuilding) this.startResearch(this.selectedBuilding, 'era');
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
    b.dead = true;
    b.destroy();
    this.buildings = this.buildings.filter((x) => x !== b);
    if (this.selectedBuilding === b) {
      this.selectedBuilding = null;
      this.emitSelection();
    }
  }

  onBuildingComplete(b) {
    if (b.def.wonder) {
      this.toast(b.team === 'player'
        ? 'The Climate Restoration Project is complete! Defend it for 3 minutes to win.'
        : 'The enemy has completed a Climate Restoration Project!', '#b8c99a');
    } else if (b.team === 'player' && b.type !== 'farm') this.toast(`${b.def.name} complete`);
    if (b.team === 'player') this.sfx('chime', b.cx, b.cy);
    if (this.selectedBuilding === b) this.emitSelection();
  }

  nearestDropOff(x, y, team = 'player') {
    let best = null;
    let bestD = Infinity;
    for (const b of this.buildings) {
      if (b.team !== team || !b.complete || !b.def.dropOff) continue;
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

  findEnemyUnitNear(x, y, radius, team) {
    let best = null;
    let bestD = radius;
    for (const u of this.units) {
      if (u.team === team || u.dead) continue;
      const d = Math.hypot(u.x - x, u.y - y);
      if (d < bestD) { bestD = d; best = u; }
    }
    return best;
  }

  // Nearest enemy unit in range, otherwise nearest enemy building in range.
  findEnemyNear(x, y, radius, team) {
    if (!radius) return null;
    const u = this.findEnemyUnitNear(x, y, radius, team);
    if (u) return u;
    let best = null;
    let bestD = radius;
    for (const b of this.buildings) {
      if (b.team === team || b.def.wall) continue; // walls only get attacked when they're in the way
      const d = this.distanceTo(x, y, b);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  // Anything of the other side's, anywhere — used by attack waves.
  nearestEnemyTarget(x, y, team) {
    let best = null;
    let bestD = Infinity;
    for (const t of [...this.buildings, ...this.units]) {
      if (t.team === team || t.dead || (t.isBuilding && t.def.wall)) continue;
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
      if (b && b.def.wall && b.team !== u.team) return b;
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
    const to = target.isBuilding ? toIso(target.cx, target.cy) : { x: target.isoX, y: target.isoY };
    to.y -= target.isBuilding ? 20 : 12;
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const arrow = this.add.rectangle(from.x, from.y, 10, 1.5, 0xe8e2cf).setRotation(Math.atan2(to.y - from.y, to.x - from.x)).setDepth(9e5);
    this.tweens.add({
      targets: arrow, x: to.x, y: to.y, duration: Math.max(80, dist * 2.2),
      onComplete: () => {
        arrow.destroy();
        if (!target.dead) this.dealDamage(target, dmg, attacker);
      },
    });
  }

  dealDamage(target, dmg, attacker) {
    if (target.dead) return;
    if (target.team === 'player') this.alertAttack(target);
    if (target.isBuilding) {
      this.damageBuilding(target, dmg, attacker.team === 'player' ? 'your army' : 'the enemy');
      return;
    }
    target.hp -= dmg;
    target.updateHpBar();
    if (target.hp <= 0) {
      this.killUnit(target);
      return;
    }
    // Fight back if we're a soldier with nothing better to do.
    const busyWithUnit = target.order && target.order.kind === 'attack' && !target.order.target.isBuilding && !target.order.target.dead;
    if (target.isMilitary && !attacker.isBuilding && !busyWithUnit) {
      target.orderAttack(attacker);
    }
  }

  killUnit(u) {
    if (u.dead) return;
    u.stop();
    u.dead = true;
    this.sfx('death', u.x, u.y);
    const puff = this.add.ellipse(u.isoX, u.isoY - 6, 20, 14, 0x555555, 0.55).setDepth(u.isoY);
    this.tweens.add({ targets: puff, alpha: 0, scale: 1.8, duration: 500, onComplete: () => puff.destroy() });
    u.container.destroy();
    this.units = this.units.filter((x) => x !== u);
    if (this.selected.delete(u)) this.emitSelection();
  }

  alertAttack(target) {
    if (this.gameTime - this.lastAttackAlert < 15) return;
    this.lastAttackAlert = this.gameTime;
    this.toast('You are under attack!', '#d9a39b');
    audio.play('horn');
    const x = target.isBuilding ? target.cx : target.x;
    const y = target.isBuilding ? target.cy : target.y;
    this.events.emit('alert', Math.floor(x / TILE), Math.floor(y / TILE));
  }

  // ---------- Damage & climate effects ----------
  damageBuilding(b, amount, cause) {
    if (b.dead) return;
    const disaster = cause === 'fire' || cause === 'a storm';
    if (disaster && this.teams[b.team].upgrades.has('climate_shields')) amount *= 0.5;
    b.hp -= amount;
    if (b.hp <= 0) {
      this.sfx('collapse', b.cx, b.cy);
      if (b.team === 'player') this.toast(`Your ${b.def.name} was destroyed by ${cause}`, '#d9a39b');
      else if (cause === 'your army') this.toast(`Enemy ${b.def.name} destroyed`, '#b8c99a');
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
    if (b.team === 'player') this.toast('Your saplings have grown into a forest', '#b8c99a');
  }

  stormEffect(x, y, r) {
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
    if (!this.selectedWorkers().length) return;
    const def = BUILDING_TYPES[type];
    if (def.era > this.eraOf('player')) {
      this.fail(`${def.name} requires the ${ERAS[def.era].name}`);
      return;
    }
    if (def.wonder && this.buildings.some((b) => b.team === 'player' && b.def.wonder)) {
      this.fail('You can only build one Climate Restoration Project');
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
    let valid = this.map.canPlace(tx, ty, def.w, def.h);
    if (valid && !def.walkable) valid = !this.unitsInRect(tx, ty, def.w, def.h);
    return { tx, ty, valid, def };
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
      valid: this.map.canPlace(t.x, t.y, 1, 1) && !this.unitsInRect(t.x, t.y, 1, 1),
    }));
  }

  placeLine() {
    const type = this.placing.type;
    const def = BUILDING_TYPES[type];
    const tiles = this.wallLine().filter((t) => t.valid);
    this.placing.from = null;
    let placed = 0;
    let first = null;
    for (const t of tiles) {
      if (!this.canAfford(def.cost)) break;
      const b = this.placeBuilding(type, t.x, t.y, 'player');
      first = first || b;
      placed++;
    }
    if (!placed) {
      this.fail(tiles.length ? `Need ${this.missingText(def.cost)} more for a ${def.name}` : "Can't build there");
      this.updateGhost();
      return;
    }
    if (placed < tiles.length) this.fail(`Ran out of stone after ${placed} wall sections`);
    audio.play('build');
    for (const u of this.selectedWorkers()) u.orderBuild(first);
    this.showMarker(first.cx, first.cy, 0x7cfc00);
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
    this.ghostImg.setTexture(buildingKey(this.placing.type, 'player')).setPosition(o.x - info.ox, o.y - info.oy).setVisible(true);
    const W = def.w * TILE;
    const H = def.h * TILE;
    const pts = [{ x: 0, y: 0 }, { x: W, y: W / 2 }, { x: W - H, y: (W + H) / 2 }, { x: -H, y: H / 2 }];
    g.fillStyle(valid ? 0x7fbf5a : 0xc0453a, 0.35).fillPoints(pts, true);
    g.lineStyle(1, valid ? 0xb8e08a : 0xe07a6e, 0.9).strokePoints(pts, true);
    if (def.attack) g.lineStyle(1, 0xe0d8b0, 0.35).strokeEllipse((W - H) / 2, (W + H) / 4, def.attack.range * 2 * Math.SQRT2, def.attack.range * Math.SQRT2);
  }

  tryPlace(w) {
    const { tx, ty, valid, def } = this.placementAt(w);
    if (!valid) { this.fail("Can't build there"); return; }
    if (!this.canAfford(def.cost)) {
      this.fail(`Need ${this.missingText(def.cost)} more for a ${def.name}`);
      this.cancelPlacing();
      return;
    }
    const b = this.placeBuilding(this.placing.type, tx, ty, 'player');
    audio.play('build');
    for (const u of this.selectedWorkers()) u.orderBuild(b);
    this.showMarker(b.cx, b.cy, 0x7cfc00);
    if (!this.keys.SHIFT.isDown) this.cancelPlacing();
  }

  // ---------- Training units ----------
  train(type) {
    const b = this.selectedBuilding;
    if (!b || !b.complete || !(b.def.trains || []).includes(type)) return;
    if (UNIT_TYPES[type].era > this.eraOf('player')) {
      this.fail(`${UNIT_TYPES[type].name} requires the ${ERAS[UNIT_TYPES[type].era].name}`);
      return;
    }
    if (b.research) { this.fail('Busy researching'); return; }
    if (b.queue.length >= 5) { this.fail('Queue is full (5 max)'); return; }
    const cost = UNIT_TYPES[type].cost;
    if (!this.canAfford(cost)) {
      this.fail(`Need ${this.missingText(cost)} more for a ${UNIT_TYPES[type].name}`);
      return;
    }
    this.trainAt(b, type);
  }

  trainAt(b, type) {
    const cost = UNIT_TYPES[type].cost;
    if (UNIT_TYPES[type].era > this.eraOf(b.team)) return false;
    if (!b.complete || b.research || b.queue.length >= 5 || !this.canAfford(cost, b.team)) return false;
    this.spend(cost, b.team);
    b.queue.push(type);
    b.redraw();
    return true;
  }

  updateTraining(dt) {
    for (const b of this.buildings) {
      if (!b.complete || !b.queue.length || b.research) continue;
      if (this.popUsedOf(b.team) >= this.popCapOf(b.team)) {
        if (!b.waitingForPop && b.team === 'player') this.fail('Population full — build a House!');
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
    const toward = b.team === 'player' ? 1 : -1;
    const side = { x: b.tx + Math.floor(b.w / 2), y: toward > 0 ? b.ty + b.h : b.ty - 1 };
    const spots = this.map.standSpots(b.tx, b.ty, b.w, b.h, side);
    const free = spots.find((s) => !this.units.some((u) => u.tile.x === s.x && u.tile.y === s.y)) || spots[0];
    if (!free) return;
    const u = new Unit(this, this.map, free.x, free.y, type, b.team);
    this.units.push(u);
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
    if (spots.length) u.moveTo(spots[Math.floor(Math.random() * spots.length)]);
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

  stopSelected() {
    for (const u of this.selected) u.stop();
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
      if (u.team === 'player' || !u.container.visible) continue;
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
      if (u.team === 'player' && pred(u)) {
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
    const idle = this.units.filter((u) => u.type === 'worker' && u.team === 'player' && u.isIdle);
    if (!idle.length) { this.fail('No idle workers'); return; }
    this.idleIndex = ((this.idleIndex ?? -1) + 1) % idle.length;
    const u = idle[this.idleIndex];
    this.selectWhere((x) => x === u, false);
    this.cameras.main.pan(u.isoX, u.isoY, 250, 'Sine.easeInOut');
  }

  // ---------- Right-click orders ----------
  // Right-click at grid point (wx, wy). `iso` is the isometric click point when it came from the mouse.
  commandAt(wx, wy, iso) {
    const sb = this.selectedBuilding;
    if (!this.selected.size && sb && sb.team === 'player' && sb.def.trains) {
      const rt = this.map.worldToTile(wx, wy);
      sb.rally = { x: rt.x, y: rt.y };
      audio.play('confirm');
      this.showMarker(wx, wy, 0xf0e6c0);
      this.drawRally();
      return;
    }
    if (!this.selected.size) return;
    const t = this.map.worldToTile(wx, wy);
    const b = iso ? this.buildingAtIso(iso.x, iso.y) : this.map.buildingAt(t.x, t.y);
    const units = [...this.selected];
    if (iso) audio.play('confirm');

    // Attack an enemy unit or building.
    const enemy = (iso && this.enemyUnitAt(iso.x, iso.y)) || (b && b.team !== 'player' ? b : null);
    if (enemy) {
      units.forEach((u) => u.orderAttack(enemy));
      this.showMarker(wx, wy, 0xff4444);
      return;
    }

    const res = this.map.resourceAt(t.x, t.y);
    const workers = units.filter((u) => u.type === 'worker');
    let movers = units.filter((u) => u.type !== 'worker');

    if (workers.length && b && !b.complete) {
      workers.forEach((w) => w.orderBuild(b));
      this.showMarker(wx, wy, 0x7cfc00);
    } else if (workers.length && b && b.type === 'farm') {
      const [first, ...rest] = workers;
      const taken = b.farmer && b.farmer.order && b.farmer.order.farm === b && b.farmer !== first;
      if (!taken) first.orderFarm(b);
      else movers.push(first);
      movers.push(...rest);
      this.showMarker(wx, wy, 0x7cfc00);
    } else if (workers.length && res) {
      const tiles = this.map.resourceTilesNear(res, t.x, t.y, 4);
      if (tiles.length) workers.forEach((w, i) => w.orderGather(tiles[i % tiles.length]));
      this.showMarker(wx, wy, 0x7cfc00);
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
    this.showMarker(wx, wy, 0xffffff);
  }

  showMarker(wx, wy, color) {
    const i = toIso(wx, wy);
    const m = this.add.ellipse(i.x, i.y, 26, 13).setStrokeStyle(2, color).setDepth(1e6);
    this.tweens.add({ targets: m, scale: 0.2, alpha: 0, duration: 450, onComplete: () => m.destroy() });
  }

  // ---------- Winning & losing ----------
  checkGameOver() {
    if (this.gameOver) return;
    const hasTC = (team) => this.buildings.some((b) => b.team === team && b.type === 'town_centre');
    let result = null;
    const wonder = this.buildings.find((b) => b.def.wonder && b.complete && b.wonderTime >= 180);
    if (wonder) result = wonder.team === 'player' ? 'green' : 'defeat';
    else if (this.climate.temp >= 5) result = 'collapse';
    else if (!hasTC('player')) result = 'defeat';
    else if (!hasTC('enemy')) result = 'victory';
    if (!result) return;
    this.gameOver = result;
    audio.play(result === 'victory' || result === 'green' ? 'victory' : 'defeat');
    this.clearSelection();
    this.events.emit('gameOver', result);
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

    // Upload terrain changes to the graphics card (at most a few times a second).
    this.terrainRefreshTimer -= delta;
    if (this.terrainDirty && this.terrainRefreshTimer <= 0) {
      this.terrainTex.refresh();
      this.terrainDirty = false;
      this.terrainRefreshTimer = 300;
    }
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

    if (this.gameOver || this.paused) return;
    this.ambientEffects(delta);
    this.step(Math.min(delta, 100)); // cap frame time so a lag spike doesn't teleport units
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

  // One tick of the simulation.
  step(dt) {
    this.gameTime += dt / 1000;
    for (const u of [...this.units]) u.update(dt, this);
    for (const b of [...this.buildings]) b.update(dt, this);
    this.updateTraining(dt);
    this.climate.update(dt);
    this.ai.update(dt);
    if (this.fog) this.fog.update(dt);
    this.checkGameOver();
  }
}
