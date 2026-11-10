// Title screen: a living landscape in the background, with New Game, Load Game and How to Play.
import { TILE, MAP_W, MAP_H, PLAYER_START, GAME_VERSION } from '../config.js';
import { GameMap, MAP_TYPES } from '../map.js';
import { BUILDING_TYPES, ERAS } from '../buildings.js';
import { generateArt, buildingKey, unitKey, buildingTexInfo, BUILDING_POINTS, ART_RES } from '../art.js';
import { toIso, ISO_W, ISO_H, setWorldSize } from '../iso.js';
import { panel, button, volumeRows, scrollText, htmlInput, FONT_SERIF, FONT_SANS, UI_COL } from '../ui.js';
import { MODES, PRESETS, presetSeats, seatsSetup, seatsProblem, describeSetup, RULES, cleanRules, describeRules } from '../setup.js';
import { Net, newCode, cleanCode, playerName, setPlayerName, lastGame, forgetLastGame, onlineAvailable } from '../net.js';
import { audio } from '../audio.js';
import { listSaves, readSave } from '../save.js';
import { listReplays, deleteReplay } from '../replay.js';
import { DIFFICULTY } from '../ai.js';
import { HOW_TO_PLAY } from '../help.js';
import { Effects } from '../effects.js';
import { makeCanvas } from '../art.js';
import { cursors } from '../cursors.js';

export { GAME_VERSION };

// The game's crest: a globe, half green and half smog, ringed in bronze with a laurel.
function drawCrest(ctx) {
  const cx = 40;
  const cy = 40;
  // laurel
  ctx.fillStyle = '#5f7f3a';
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const a = Math.PI / 2 + side * (0.5 + i * 0.32);
      const x = cx + Math.cos(a) * 33;
      const y = cy + Math.sin(a) * 33;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a + side * 1.2);
      ctx.beginPath();
      ctx.ellipse(0, 0, 6, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  // bronze ring
  const ring = ctx.createLinearGradient(0, 8, 0, 72);
  ring.addColorStop(0, '#f3d98c');
  ring.addColorStop(1, '#8a5d22');
  ctx.fillStyle = ring;
  ctx.beginPath(); ctx.arc(cx, cy, 27, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2a1a08'; ctx.lineWidth = 2; ctx.stroke();
  // globe
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#3d74a8'; ctx.fillRect(0, 0, 80, 80);
  ctx.fillStyle = '#5d9a46';
  ctx.beginPath(); ctx.ellipse(31, 34, 9, 12, 0.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(48, 48, 8, 6, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(46, 27, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
  // the right half sits under smog
  const smog = ctx.createLinearGradient(cx, 0, cx + 22, 0);
  smog.addColorStop(0, 'rgba(120,90,60,0)');
  smog.addColorStop(0.25, 'rgba(120,90,60,0.65)');
  smog.addColorStop(1, 'rgba(70,55,45,0.85)');
  ctx.fillStyle = smog; ctx.fillRect(cx, 0, 40, 80);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(cx, cy, 10, 22, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 22, cy); ctx.lineTo(cx + 22, cy); ctx.stroke();
  ctx.restore();
  // shine
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath(); ctx.ellipse(32, 30, 9, 5, -0.6, 0, Math.PI * 2); ctx.fill();
}

export const GAME_TITLE = 'Age of Emissions';

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create() {
    setWorldSize(64, 64); // the menu's background is a corner of a 1 v 1 map
    generateArt(this, BUILDING_TYPES);
    audio.init(this.sound.context);
    audio.startAmbience();
    audio.startMusic('calm');
    this.input.setDefaultCursor(cursors().arrow);
    makeCanvas(this, 'crest', 80, 80, drawCrest, 2);
    this.options = this.options || { difficulty: 'normal', map: 'continental', mode: '1v1', seats: presetSeats('1v1'), rules: cleanRules({}), tab: 'players' };

    // --- Background: paint a corner of a map and put a little town on it ---
    if (!this.textures.exists('menu_terrain')) {
      const tex = this.textures.createCanvas('menu_terrain', ISO_W, ISO_H);
      const map = new GameMap(MAP_W, MAP_H, 4242);
      map.renderRegion(tex.getContext(), 0, 0, 26, 26);
      tex.refresh();
    }
    this.add.image(0, 0, 'menu_terrain').setOrigin(0);
    const s = PLAYER_START;
    const put = (type, tx, ty) => {
      const info = buildingTexInfo(BUILDING_TYPES[type]);
      const p = toIso(tx * TILE, ty * TILE);
      this.add.image(p.x - info.ox, p.y - info.oy, buildingKey(type, 'player')).setOrigin(0).setScale(1 / ART_RES)
        .setDepth(p.y + (BUILDING_TYPES[type].w + BUILDING_TYPES[type].h) * TILE / 2);
      return p;
    };
    put('town_centre', s.x - 1, s.y - 1);
    put('house', s.x + 3, s.y - 4);
    put('house', s.x - 4, s.y + 2);
    put('farm', s.x - 4, s.y - 3);
    put('tower', s.x + 4, s.y + 3);
    this.turbine = put('wind_turbine', s.x + 1, s.y + 5);
    this.blades = this.add.graphics().setDepth(this.turbine.y + 200);
    this.walkers = [];
    for (let i = 0; i < 6; i++) {
      const type = i < 4 ? 'worker' : 'soldier';
      const p = toIso((s.x - 2 + i) * TILE, (s.y + 2.5) * TILE);
      const img = this.add.image(p.x, p.y, unitKey(type, 'player')).setOrigin(0.5, 0.86).setDepth(p.y).setScale(1 / ART_RES);
      this.walkers.push({ img, base: p, phase: i, type });
    }
    const cam = this.cameras.main;
    cam.setBackgroundColor('#0b0c0d');
    const c = toIso(s.x * TILE, s.y * TILE);
    cam.centerOn(c.x + 40, c.y + 20);
    this.camBase = { x: cam.scrollX, y: cam.scrollY };

    // --- Overlay ---
    this.overlay = [];
    this.vig = this.add.image(0, 0, 'vignette').setOrigin(0).setScrollFactor(0).setDepth(1e6).setAlpha(0.9);
    this.title = this.add.text(0, 0, GAME_TITLE, {
      fontFamily: FONT_SERIF, fontSize: '64px', color: UI_COL.gold, stroke: '#1a1208', strokeThickness: 8,
      shadow: { offsetX: 3, offsetY: 4, color: '#000', blur: 8, fill: true },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1e6 + 1);
    this.subtitle = this.add.text(0, 0, 'A strategy game of empires, energy and a warming world', {
      fontFamily: FONT_SERIF, fontSize: '19px', fontStyle: 'italic', color: '#efe6cc', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1e6 + 1);
    this.crests = [0, 1].map(() => this.add.image(0, 0, 'crest').setScale(0.5).setScrollFactor(0).setDepth(1e6 + 1));
    this.version = this.add.text(0, 0, `${GAME_VERSION}`, {
      fontFamily: FONT_SANS, fontSize: '12px', color: '#b8ae94', stroke: '#000', strokeThickness: 3,
    }).setOrigin(1, 1).setScrollFactor(0).setDepth(1e6 + 1);
    this.fx = new Effects(this);
    this.fx.birdTimer = 2500;
    this.events.once('shutdown', () => this.fx.destroy());

    this.scale.on('resize', this.relayout, this);
    const onInstall = () => { if (this.view === 'main') this.show('main'); };
    window.addEventListener('install-available', onInstall);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.relayout, this);
      window.removeEventListener('install-available', onInstall);
      this.clearOverlay(); // removes any text boxes
    });
    this.net = null;
    this.starting = false;
    this.online = null; // null = not checked yet, then true / false
    this.netMsg = '';
    this.view = 'main';
    this.relayout();
  }

  relayout() {
    const w = this.scale.width;
    const h = this.scale.height;
    this.vig.setDisplaySize(w, h);
    this.title.setPosition(w / 2, h * 0.16);
    this.subtitle.setPosition(w / 2, h * 0.16 + 52);
    const half = this.title.width / 2 + 52;
    this.crests[0].setPosition(w / 2 - half, h * 0.16);
    this.crests[1].setPosition(w / 2 + half, h * 0.16);
    this.version.setPosition(w - 10, h - 8);
    this.show(this.view);
  }

  clearOverlay() {
    for (const o of this.overlay) o.destroy();
    this.overlay = [];
  }

  addUI(o) {
    o.setScrollFactor(0);
    if (o.list) o.list.forEach((c) => c.setScrollFactor && c.setScrollFactor(0));
    this.overlay.push(o);
    return o;
  }

  show(view) {
    this.view = view;
    this.clearOverlay();
    const w = this.scale.width;
    const h = this.scale.height;
    const PW = 440;
    let top = h * 0.16 + 100;
    const D = 1e6 + 2;
    const btn = (y, label, fn, opts = {}) => this.addUI(button(this, (w - (opts.w || 320)) / 2, y, opts.w || 320, 44, label, fn, { depth: D + 1, size: opts.size }));

    if (view === 'main') {
      const canInstall = !!window.installPrompt;
      const saves = listSaves().filter((s) => !s.empty).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
      const any = saves.length > 0;
      const k = any ? 60 : 0; // room for "Continue"
      top = Math.max(top - 30, Math.min(top, h - ((canInstall ? 550 : 490) + k) - 10));
      this.addUI(panel(this, (w - PW) / 2, top, PW, (canInstall ? 550 : 490) + k, D));
      if (any) {
        const latest = saves[0];
        btn(top + 30, `Continue  ·  ${fmtTime(latest.gameTime || 0)}, ${ERAS[latest.era || 0].name}`, () => {
          const data = readSave(latest.slot);
          if (data) this.scene.start('GameScene', { load: data });
        }, { size: '16px' });
      }
      btn(top + 30 + k, 'New Game', () => this.show('new'));
      btn(top + 90 + k, 'Freeplay (practice)', () => {
        const o = this.options;
        o.mode = 'free';
        o.seats = presetSeats('free', o.difficulty);
        o.tab = 'rules';
        this.show('new');
      });
      btn(top + 150 + k, 'Play Online', () => this.show('online'));
      btn(top + 210 + k, 'Load Game', () => this.show('load')).setEnabled(any);
      btn(top + 270 + k, 'Replays', () => this.show('replays')).setEnabled(listReplays().length > 0);
      btn(top + 330 + k, 'How to Play', () => this.show('help'));
      btn(top + 390 + k, 'Settings', () => this.show('settings'));
      if (canInstall) {
        btn(top + 450 + k, 'Install Game', async () => {
          const prompt = window.installPrompt;
          if (!prompt) return;
          prompt.prompt();
          await prompt.userChoice;
          window.installPrompt = null;
          this.show('main');
        });
      }
    } else if (view === 'settings') {
      this.addUI(panel(this, (w - PW) / 2, top, PW, 380, D));
      this.addUI(this.add.text(w / 2, top + 22, 'Settings', { fontFamily: FONT_SERIF, fontSize: '22px', color: UI_COL.gold, stroke: '#000', strokeThickness: 4 }).setOrigin(0.5, 0).setDepth(D + 1));
      for (const o of volumeRows(this, (w - PW) / 2 + 30, top + 66, PW - 60, D + 1)) this.addUI(o);
      btn(top + 318, 'Back', () => this.show('main'), { w: 200 });
    } else if (view === 'new') {
      // An AoE2-style game set-up, on two tabs: who's playing, then the map and the rules.
      const o = this.options;
      o.rules = cleanRules(o.rules);
      const NW = 640;
      const PH = 600;
      const x0 = (w - NW) / 2;
      top = Math.max(4, (h - PH) / 2);
      this.addUI(panel(this, x0, top, NW, PH, D));
      const T = (x, y, str, style = {}, ox = 0.5) => this.addUI(this.add.text(x, y, str, {
        fontFamily: FONT_SANS, fontSize: '14px', color: UI_COL.text, stroke: '#000', strokeThickness: 2, ...style,
      }).setOrigin(ox, 0).setDepth(D + 1));
      const label = (y, str) => T(w / 2, y, str, { fontFamily: FONT_SERIF, fontSize: '18px', strokeThickness: 3 });
      // tabs
      [['players', 'Players & teams'], ['rules', 'Map & settings']].forEach(([k, name], i) => {
        this.addUI(button(this, x0 + 20 + i * 306, top + 12, 294, 36, name, () => { o.tab = k; this.show('new'); }, { depth: D + 1, size: '16px' }))
          .setSelected(o.tab === k);
      });
      let y = top + 62;
      const problem = seatsProblem(o.seats);
      if (o.tab !== 'rules') {
        // --- quick set-ups ---
        const keys = Object.keys(PRESETS);
        const bw = (NW - 40 - (keys.length - 1) * 6) / keys.length;
        keys.forEach((k, i) => {
          const b = this.addUI(button(this, x0 + 20 + i * (bw + 6), y, bw, 32, PRESETS[k].name, () => {
            o.mode = k;
            o.seats = presetSeats(k, o.difficulty);
            this.show('new');
          }, { depth: D + 1, size: '13px' }));
          b.setSelected(o.mode === k);
        });
        T(w / 2, y + 38, PRESETS[o.mode] ? PRESETS[o.mode].desc : 'Your own set-up.', { fontStyle: 'italic', color: UI_COL.dim, fontSize: '13px' });
        y += 64;
        // --- the four seats ---
        const COLORS = ['#7d9fd4', '#d98a7e', '#7cc486', '#e2c25e'];
        const SIDE = ['Blue', 'Red', 'Green', 'Yellow'];
        const LEVEL = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };
        const kinds = ['ai:normal', 'ai:hard', 'ai:easy', 'closed'];
        const changed = () => { o.mode = 'custom'; this.show('new'); };
        T(x0 + 150, y, 'Player', { color: UI_COL.dim, fontSize: '12px' }, 0);
        T(x0 + NW - 100, y, 'Team', { color: UI_COL.dim, fontSize: '12px' });
        o.seats.forEach((st, i) => {
          const yy = y + 18 + i * 42;
          const closed = st.kind === 'closed';
          // the colour: click it to play as this side
          this.addUI(button(this, x0 + 20, yy, 110, 36, SIDE[i], () => {
            if (st.kind === 'you') return;
            const mine = o.seats.findIndex((x) => x.kind === 'you');
            const prev = { ...st };
            o.seats[i] = { ...o.seats[mine], kind: 'you', team: prev.kind === 'closed' ? o.seats[mine].team : prev.team };
            o.seats[mine] = { kind: 'ai', ai: o.difficulty, team: o.seats[mine].team };
            changed();
          }, { depth: D + 1, size: '15px' })).setSelected(st.kind === 'you');
          this.addUI(this.add.rectangle(x0 + 30, yy + 18, 10, 10, parseInt(COLORS[i].slice(1), 16), closed ? 0.3 : 1).setStrokeStyle(1, 0x000000).setDepth(D + 2));
          if (st.kind === 'you') {
            T(x0 + 150, yy + 9, 'You', { fontFamily: FONT_SERIF, fontSize: '17px', color: UI_COL.gold }, 0);
          } else {
            const cur = st.kind === 'ai' ? `ai:${st.ai || 'normal'}` : 'closed';
            const text = st.kind === 'ai' ? `Computer — ${LEVEL[st.ai] || 'Normal'}` : 'Closed';
            this.addUI(button(this, x0 + 140, yy, 290, 36, text, () => {
              const [kind, ai] = kinds[(kinds.indexOf(cur) + 1) % kinds.length].split(':');
              o.seats[i] = { ...st, kind, ai };
              changed();
            }, { depth: D + 1, size: '14px' }));
          }
          if (!closed) {
            this.addUI(button(this, x0 + NW - 150, yy, 100, 36, st.team ? `Team ${st.team}` : '–', () => {
              o.seats[i] = { ...st, team: ((st.team || 0) + 1) % 5 };
              changed();
            }, { depth: D + 1, size: '15px' }));
          }
        });
        y += 18 + 4 * 42 + 2;
        // set every computer player's level at once
        T(x0 + 150, y + 9, 'All computers:', { color: UI_COL.dim, fontSize: '13px' }, 0);
        [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']].forEach(([lvl, name], i) => {
          this.addUI(button(this, x0 + 260 + i * 92, y + 2, 86, 30, name, () => {
            o.difficulty = lvl;
            o.seats = o.seats.map((x) => (x.kind === 'ai' ? { ...x, ai: lvl } : x));
            this.show('new');
          }, { depth: D + 1, size: '13px' })).setSelected(o.seats.some((x) => x.kind === 'ai') && o.seats.every((x) => x.kind !== 'ai' || x.ai === lvl));
        });
        y += 44;
        T(w / 2, y, problem || describeSetup(seatsSetup(o.seats)), { fontFamily: FONT_SERIF, fontSize: '15px', color: problem ? '#e8b080' : UI_COL.gold });
        T(w / 2, y + 22, 'Click a colour to play as it. Same team number = allies. "–" = on their own.', { color: UI_COL.dim, fontSize: '12px', fontStyle: 'italic' });
      } else {
        // --- map ---
        label(y - 4, 'Map');
        if (!MAP_TYPES[o.map]) o.map = 'continental';
        const mapKeys = Object.keys(MAP_TYPES);
        const mw = (NW - 40 - (mapKeys.length - 1) * 8) / mapKeys.length;
        mapKeys.forEach((k, i) => {
          this.addUI(button(this, x0 + 20 + i * (mw + 8), y + 24, mw, 32, MAP_TYPES[k].name, () => { o.map = k; this.show('new'); }, { depth: D + 1, size: '14px' }))
            .setSelected(o.map === k);
        });
        T(w / 2, y + 62, MAP_TYPES[o.map].desc, { fontStyle: 'italic', color: UI_COL.dim, fontSize: '13px', wordWrap: { width: NW - 60 }, align: 'center', lineSpacing: 2 });
        y += 120;
        label(y, 'Settings');
        this.rulesGrid(x0 + 20, y + 30, NW - 40, o.rules, (k, v) => { o.rules[k] = v; this.show('new'); }, D);
      }
      // start / back
      const by = top + PH - 56;
      if (problem && o.tab === 'rules') T(w / 2, by - 22, problem, { color: '#e8b080', fontSize: '12px' });
      this.addUI(button(this, x0 + 20, by, 400, 42, 'Start Game', () => this.startGame(), { depth: D + 1 })).setEnabled(!problem);
      this.addUI(button(this, x0 + 432, by, 188, 42, 'Back', () => this.show('main'), { depth: D + 1, size: '16px' }));
    } else if (view === 'load') {
      const saves = listSaves();
      this.addUI(panel(this, (w - PW) / 2, top, PW, 90 + saves.length * 54 + 40, D));
      this.addUI(this.add.text(w / 2, top + 22, 'Load Game', { fontFamily: FONT_SERIF, fontSize: '22px', color: UI_COL.gold, stroke: '#000', strokeThickness: 4 }).setOrigin(0.5, 0).setDepth(D + 1));
      saves.forEach((s, i) => {
        const label = s.empty ? `Slot ${s.slot} — ${s.old ? 'old save (from before v13)' : 'empty'}`
          : `Slot ${s.slot} — ${fmtTime(s.gameTime)}, ${ERAS[s.era].name}, ${MODES[s.mode] ? MODES[s.mode].name : s.mode === 'custom' ? 'custom game' : '1 v 1'}, ${DIFFICULTY[s.difficulty]?.name || ''}`;
        btn(top + 66 + i * 54, label, () => {
          const data = readSave(s.slot);
          if (data) this.scene.start('GameScene', { load: data });
        }, { w: 380, size: '15px' }).setEnabled(!s.empty);
      });
      btn(top + 66 + saves.length * 54 + 6, 'Back', () => this.show('main'), { w: 200 });
    } else if (view === 'replays') {
      const list = listReplays();
      const RW = 520;
      this.addUI(panel(this, (w - RW) / 2, top, RW, 120 + list.length * 54 + 40, D));
      this.addUI(this.add.text(w / 2, top + 22, 'Replays', { fontFamily: FONT_SERIF, fontSize: '22px', color: UI_COL.gold, stroke: '#000', strokeThickness: 4 }).setOrigin(0.5, 0).setDepth(D + 1));
      this.addUI(this.add.text(w / 2, top + 54, 'Your last few games, played back move by move.', {
        fontFamily: FONT_SANS, fontSize: '13px', fontStyle: 'italic', color: UI_COL.dim, stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5, 0).setDepth(D + 1));
      const RESULT = { victory: 'Victory', green: 'Green Victory', defeat: 'Defeat', collapse: 'Collapse' };
      list.forEach((r, i) => {
        const d = new Date(r.date);
        const when = `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        const map = MAP_TYPES[r.mapType] ? MAP_TYPES[r.mapType].name : r.mapType;
        const label = `${when} — ${fmtTime((r.ticks || 0) / 20)}, ${RESULT[r.result] || 'unfinished'}, ${map}, ${DIFFICULTY[r.difficulty]?.name || ''}`;
        const b = btn(top + 86 + i * 54, label, () => this.scene.start('GameScene', { replay: r }), { w: 420, size: '14px' });
        b.setX((w - RW) / 2 + 20);
        this.addUI(button(this, (w - RW) / 2 + RW - 72, top + 86 + i * 54, 52, 44, '✕', () => { deleteReplay(r.id); this.show(listReplays().length ? 'replays' : 'main'); }, { depth: D + 1, size: '16px' }));
      });
      btn(top + 86 + list.length * 54 + 6, 'Back', () => this.show('main'), { w: 200 });
    } else if (view === 'online') {
      const OW = 480;
      const x0 = (w - OW) / 2;
      const last = lastGame();
      const rejoin = last && last.started;
      this.addUI(panel(this, x0, top - 20, OW, rejoin ? 470 : 410, D));
      const T = (x, y, str, style = {}, ox = 0.5) => this.addUI(this.add.text(x, y, str, {
        fontFamily: FONT_SANS, fontSize: '14px', color: UI_COL.text, stroke: '#000', strokeThickness: 2, ...style,
      }).setOrigin(ox, 0).setDepth(D + 1));
      T(w / 2, top, 'Play Online', { fontFamily: FONT_SERIF, fontSize: '22px', color: UI_COL.gold, strokeThickness: 4 });
      T(w / 2, top + 30, 'Up to four players over the internet: one hosts, the others join with\nthe code. Watch lets you follow a game without playing.', { fontStyle: 'italic', color: UI_COL.dim, fontSize: '13px', align: 'center' });
      T(x0 + 30, top + 74, 'Your name', {}, 0);
      this.addUI(htmlInput(this, x0 + 150, top + 66, OW - 180, 34, { maxLength: 16, value: playerName(), onInput: (v) => setPlayerName(v.trim()) }));
      const ok = this.online !== false;
      btn(top + 120, 'Host a Game', () => this.connectOnline(newCode(), 'host')).setEnabled(ok);
      T(x0 + 30, top + 190, 'Code', {}, 0);
      const codeBox = this.addUI(htmlInput(this, x0 + 180, top + 182, 130, 34, {
        maxLength: 8, upper: true, align: 'center', spacing: '3px', placeholder: 'CODE',
        onEnter: (v) => cleanCode(v).length >= 4 && this.connectOnline(cleanCode(v), 'join'),
      }));
      const withCode = (role) => {
        const code = cleanCode(codeBox.value);
        if (code.length < 4) { this.netMsg = 'Type the code your friend sees on their screen.'; this.show('online'); return; }
        this.connectOnline(code, role);
      };
      this.addUI(button(this, x0 + 318, top + 178, 64, 42, 'Join', () => withCode('join'), { depth: D + 1, size: '15px' })).setEnabled(ok);
      this.addUI(button(this, x0 + 388, top + 178, 72, 42, 'Watch', () => withCode('watch'), { depth: D + 1, size: '15px' })).setEnabled(ok);
      let y = top + 240;
      if (rejoin) {
        btn(y, `Rejoin game ${last.code}`, () => this.connectOnline(last.code, last.role));
        y += 60;
      }
      const msg = this.online === false
        ? 'Online play needs the game\'s Cloudflare website — it won\'t work from a copy on your own computer.'
        : this.online === null ? 'Checking the game server…' : this.netMsg;
      T(w / 2, y, msg, { color: this.online === false || this.netMsg ? '#e8b080' : UI_COL.dim, wordWrap: { width: OW - 60 }, align: 'center' });
      btn(y + 64, 'Back', () => { this.netMsg = ''; this.show('main'); }, { w: 200 });
      if (this.online === null) onlineAvailable().then((v) => { this.online = v; if (this.view === 'online') this.show('online'); });
    } else if (view === 'lobby') {
      const net = this.net;
      if (!net) { this.show('online'); return; }
      const OW = 640;
      const PH = 604;
      const x0 = (w - OW) / 2;
      top = Math.max(8, (h - PH) / 2);
      const host = net.role === 'host' && net.slot === 0;
      const tab = this.lobbyTab || 'seats';
      this.addUI(panel(this, x0, top, OW, PH, D));
      const T = (x, y, str, style = {}, ox = 0.5) => this.addUI(this.add.text(x, y, str, {
        fontFamily: FONT_SANS, fontSize: '14px', color: UI_COL.text, stroke: '#000', strokeThickness: 2, ...style,
      }).setOrigin(ox, 0).setDepth(D + 1));
      T(w / 2, top + 12, 'Game code', { fontFamily: FONT_SERIF, fontSize: '15px', color: UI_COL.dim });
      T(w / 2, top + 30, net.code.split('').join(' '), { fontFamily: FONT_SERIF, fontSize: '36px', color: UI_COL.gold, strokeThickness: 5 });
      const status = !net.connected && net.slot === null && !net.spectator ? 'Connecting…'
        : host ? 'Send this code to your friends. Set up the seats and settings, then start.'
          : net.spectator ? 'You\'re watching. The game shows up here when the host starts it.' : 'Waiting for the host to start the game…';
      T(w / 2, top + 76, status, { fontStyle: 'italic', color: UI_COL.dim, fontSize: '13px' });
      [['seats', 'Players & teams'], ['rules', 'Map & settings']].forEach(([k, name], i) => {
        this.addUI(button(this, x0 + 20 + i * 306, top + 100, 294, 34, name, () => { this.lobbyTab = k; this.show('lobby'); }, { depth: D + 1, size: '15px' }))
          .setSelected(tab === k);
      });
      const st = net.settings || {};
      if (tab === 'seats') {
        if (host) {
          const keys = Object.keys(PRESETS);
          const bw = (OW - 40 - (keys.length - 1) * 6) / keys.length;
          keys.forEach((k, i) => this.addUI(button(this, x0 + 20 + i * (bw + 6), top + 146, bw, 28, PRESETS[k].name, () => {
            net.send({ t: 'preset', seats: PRESETS[k].seats.map((x) => ({ used: x.kind !== 'closed', team: x.team })) });
          }, { depth: D + 1, size: '12px' })));
        }
        // --- the four seats ---
        const COLORS = ['#7d9fd4', '#d98a7e', '#7cc486', '#e2c25e'];
        const SIDE = ['Blue', 'Red', 'Green', 'Yellow'];
        const AI_NAMES = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };
        const cycle = ['open', 'ai:normal', 'ai:hard', 'ai:easy', 'closed'];
        (net.slots.length ? net.slots : [0, 1, 2, 3].map((i) => ({ slot: i, kind: i ? 'closed' : 'human', team: i < 2 ? i + 1 : 0 }))).forEach((seat, i) => {
          const y = top + 184 + i * 44;
          const closed = seat.kind === 'closed';
          this.addUI(this.add.rectangle(x0 + 30, y + 18, 14, 14, parseInt(COLORS[i].slice(1), 16), closed ? 0.3 : 1).setStrokeStyle(1, 0x000000).setDepth(D + 1));
          T(x0 + 44, y + 9, SIDE[i], { fontFamily: FONT_SERIF, fontSize: '16px', color: closed ? UI_COL.dim : COLORS[i] }, 0);
          let who;
          if (seat.kind === 'human') who = `${seat.name}${i === net.slot ? '  (you)' : ''}${i === 0 ? '  — host' : ''}${seat.connected === false ? '  · reconnecting…' : ''}`;
          else if (seat.kind === 'ai') who = `Computer (${AI_NAMES[seat.ai] || 'Normal'})`;
          else if (seat.kind === 'open') who = 'Open — waiting for someone to join';
          else who = 'Closed';
          if (host && i > 0 && seat.kind !== 'human') {
            const cur = seat.kind === 'ai' ? `ai:${seat.ai || 'normal'}` : seat.kind;
            this.addUI(button(this, x0 + 120, y, 290, 36, who, () => {
              const next = cycle[(cycle.indexOf(cur) + 1) % cycle.length];
              const [kind, ai] = next.split(':');
              net.send({ t: 'slot', i, kind, ai });
            }, { depth: D + 1, size: '14px' }));
          } else {
            T(x0 + 128, y + 10, who, { fontSize: '15px', color: seat.kind === 'human' || seat.kind === 'ai' ? UI_COL.text : UI_COL.dim }, 0);
          }
          if (!closed) {
            const teamLabel = seat.team ? `Team ${seat.team}` : '–';
            if (host) {
              this.addUI(button(this, x0 + OW - 150, y, 120, 36, teamLabel, () => net.send({ t: 'slot', i, team: ((seat.team || 0) + 1) % 5 }), { depth: D + 1, size: '14px' }));
            } else T(x0 + OW - 90, y + 10, teamLabel, { fontSize: '15px', color: UI_COL.dim });
          }
        });
        const preview = net.slots && net.slots.length ? describeSetup(seatsSetup(net.slots.map((x) => (x.kind === 'open' ? { ...x, kind: 'human' } : x)))) : '';
        // (a "can't start yet" message from the room takes this line's place)
        T(w / 2, top + 366, this.netNotice || preview + (net.watchers && net.watchers.length ? `     ·     Watching: ${net.watchers.join(', ')}` : ''),
          { fontFamily: FONT_SERIF, fontSize: this.netNotice ? '13px' : '15px', color: this.netNotice ? '#e8b080' : UI_COL.gold, wordWrap: { width: OW - 40 }, align: 'center' });
        T(w / 2, top + 396, `${MAP_TYPES[st.mapType] ? MAP_TYPES[st.mapType].name : ''} map  ·  ${describeRules(cleanRules(st))}`, { color: UI_COL.dim, fontSize: '13px', wordWrap: { width: OW - 40 }, align: 'center' });
      } else {
        // --- map & settings ---
        const keys = Object.keys(MAP_TYPES);
        keys.forEach((k, i) => {
          const b = this.addUI(button(this, x0 + 24 + i * ((OW - 48) / keys.length), top + 146, (OW - 48) / keys.length - 8, 32, MAP_TYPES[k].name, () => {
            if (host) net.send({ t: 'settings', mapType: k });
          }, { depth: D + 1, size: '14px' }));
          b.setSelected(st.mapType === k);
          if (!host) b.setEnabled(st.mapType === k);
        });
        T(w / 2, top + 184, MAP_TYPES[st.mapType] ? MAP_TYPES[st.mapType].desc : '', { fontStyle: 'italic', color: UI_COL.dim, fontSize: '13px', wordWrap: { width: OW - 60 }, align: 'center' });
        this.rulesGrid(x0 + 20, top + 250, OW - 40, cleanRules(st), host ? (k, v) => net.send({ t: 'settings', [k]: v }) : null, D);
      }
      if (host) btn(top + PH - 108, 'Start Game', () => net.send({ t: 'start' }));
      btn(top + PH - 56, 'Leave', () => this.leaveOnline(), { w: 200 });
    } else if (view === 'help') {
      const PH = Math.min(440, h - top - 10);
      this.addUI(panel(this, (w - 600) / 2, top - 20, 600, PH, D));
      this.addUI(scrollText(this, (w - 600) / 2 + 24, top + 4, 552, PH - 102, HOW_TO_PLAY, {
        fontFamily: FONT_SANS, fontSize: '14px', color: UI_COL.text, lineSpacing: 5, stroke: '#000', strokeThickness: 2,
      }, D + 1));
      btn(top - 20 + PH - 62, 'Back', () => this.show('main'), { w: 200 });
    }
  }

  // The game settings as a grid of "Label  [value]" buttons (click to cycle). onChange null = read-only.
  rulesGrid(x, y, width, rules, onChange, D) {
    const colW = (width - 16) / 2;
    Object.entries(RULES).forEach(([k, def], i) => {
      const cx = x + (i % 2) * (colW + 16);
      const cy = y + Math.floor(i / 2) * 44;
      this.addUI(this.add.text(cx, cy + 10, def.label, { fontFamily: FONT_SERIF, fontSize: '15px', color: UI_COL.text, stroke: '#000', strokeThickness: 3 }).setDepth(D + 1));
      const idx = def.options.findIndex(([v]) => v === rules[k]);
      const text = def.options[Math.max(0, idx)][1];
      const b = this.addUI(button(this, cx + colW - 150, cy, 150, 36, text, () => {
        if (!onChange) return;
        const next = def.options[(idx + 1) % def.options.length][0];
        onChange(k, next);
      }, { depth: D + 1, size: '14px' }));
      if (!onChange) b.setEnabled(false);
      else b.setSelected(rules[k] !== def.def);
    });
    const rows = Math.ceil(Object.keys(RULES).length / 2);
    this.addUI(this.add.text(x + width / 2, y + rows * 44 + 4, onChange ? 'Click a setting to change it. Highlighted = different from normal.' : 'Only the host can change these.', {
      fontFamily: FONT_SANS, fontSize: '12px', fontStyle: 'italic', color: UI_COL.dim, stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5, 0).setDepth(D + 1));
  }

  // ---------- Online lobby ----------
  connectOnline(code, role) {
    if (this.net) this.net.close();
    this.lobbyTab = 'seats';
    this.netMsg = '';
    this.netNotice = '';
    const net = new Net(code, role);
    this.net = net;
    const refresh = () => { if (this.net === net && this.view === 'lobby') this.show('lobby'); };
    net.on('welcome', (m) => { if (m.started) this.startOnline(); else refresh(); })
      .on('lobby', () => { this.netNotice = ''; refresh(); })
      .on('notice', (m) => { this.netNotice = m.msg; refresh(); })
      .on('start', () => this.startOnline())
      .on('disconnected', refresh)
      .on('error', (m) => this.onlineFailed(net, m.msg))
      .on('closed', (m) => this.onlineFailed(net, m.msg))
      .on('lost', () => this.onlineFailed(net, 'Lost the connection to the game server.'));
    net.connect();
    this.show('lobby');
  }

  onlineFailed(net, msg) {
    if (this.net !== net) return;
    net.close(false);
    this.net = null;
    this.netMsg = msg;
    this.show('online');
  }

  leaveOnline() {
    if (this.net) this.net.close();
    this.net = null;
    forgetLastGame();
    this.show('online');
  }

  startOnline() {
    const net = this.net;
    if (!net || this.starting) return;
    this.starting = true;
    this.scene.start('GameScene', { net });
  }

  startGame() {
    const seed = Math.floor(Math.random() * 1e9);
    const o = this.options;
    if (seatsProblem(o.seats)) return;
    const setup = seatsSetup(o.seats, o.mode);
    const levels = setup.teams.filter((t) => t.ai).map((t) => t.ai);
    const difficulty = levels.includes('hard') ? 'hard' : levels.includes('normal') ? 'normal' : 'easy';
    this.scene.start('GameScene', { seed, mapType: o.map, difficulty, setup, rules: cleanRules(o.rules) });
  }

  update(time, delta) {
    audio.updateAmbience(delta / 1000, { temp: 0 });
    this.fx.updateBirds(delta, this.cameras.main.worldView, 0);
    // Gentle camera drift, turning turbine and pottering villagers.
    const cam = this.cameras.main;
    cam.scrollX = this.camBase.x + Math.sin(time / 9000) * 60;
    cam.scrollY = this.camBase.y + Math.cos(time / 11000) * 30;
    const [hx, hy] = BUILDING_POINTS.wind_turbine.hub;
    const g = this.blades;
    g.clear();
    for (let i = 0; i < 3; i++) {
      const a = time / 400 + (i * Math.PI * 2) / 3;
      const x = this.turbine.x + hx;
      const y = this.turbine.y + hy;
      g.lineStyle(2.5, 0xeaeae6, 1).lineBetween(x, y, x + Math.cos(a) * 24, y + Math.sin(a) * 24);
    }
    for (const wk of this.walkers) {
      const t = time / 1000 + wk.phase;
      const dx = Math.sin(t * 0.4) * 30;
      wk.img.setPosition(wk.base.x + dx, wk.base.y + dx * 0.5 - Math.abs(Math.sin(t * 6)) * 1.5);
      wk.img.setFlipX(Math.cos(t * 0.4) < 0);
      const sw = Math.sin(t * 6);
      wk.img.setTexture(unitKey(wk.type, 'player', sw > 0.35 ? 1 : sw < -0.35 ? 2 : 0));
    }
  }
}
