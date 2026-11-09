// Title screen: a living landscape in the background, with New Game, Load Game and How to Play.
import { TILE, MAP_W, MAP_H, PLAYER_START, GAME_VERSION } from '../config.js';
import { GameMap, MAP_TYPES } from '../map.js';
import { BUILDING_TYPES, ERAS } from '../buildings.js';
import { generateArt, buildingKey, unitKey, buildingTexInfo, BUILDING_POINTS, ART_RES } from '../art.js';
import { toIso, ISO_W, ISO_H } from '../iso.js';
import { panel, button, volumeRows, scrollText, FONT_SERIF, FONT_SANS, UI_COL } from '../ui.js';
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
    generateArt(this, BUILDING_TYPES);
    audio.init(this.sound.context);
    audio.startAmbience();
    audio.startMusic('calm');
    this.input.setDefaultCursor(cursors().arrow);
    makeCanvas(this, 'crest', 80, 80, drawCrest, 2);
    this.options = { difficulty: 'normal', map: 'continental', fog: true };

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
    });
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
      this.addUI(panel(this, (w - PW) / 2, top, PW, (canInstall ? 430 : 370) + k, D));
      if (any) {
        const latest = saves[0];
        btn(top + 30, `Continue  ·  ${fmtTime(latest.gameTime || 0)}, ${ERAS[latest.era || 0].name}`, () => {
          const data = readSave(latest.slot);
          if (data) this.scene.start('GameScene', { load: data });
        }, { size: '16px' });
      }
      btn(top + 30 + k, 'New Game', () => this.show('new'));
      btn(top + 90 + k, 'Load Game', () => this.show('load')).setEnabled(any);
      btn(top + 150 + k, 'Replays', () => this.show('replays')).setEnabled(listReplays().length > 0);
      btn(top + 210 + k, 'How to Play', () => this.show('help'));
      btn(top + 270 + k, 'Settings', () => this.show('settings'));
      if (canInstall) {
        btn(top + 330 + k, 'Install Game', async () => {
          const prompt = window.installPrompt;
          if (!prompt) return;
          prompt.prompt();
          await prompt.userChoice;
          window.installPrompt = null;
          this.show('main');
        });
      }
    } else if (view === 'settings') {
      this.addUI(panel(this, (w - PW) / 2, top, PW, 330, D));
      this.addUI(this.add.text(w / 2, top + 22, 'Settings', { fontFamily: FONT_SERIF, fontSize: '22px', color: UI_COL.gold, stroke: '#000', strokeThickness: 4 }).setOrigin(0.5, 0).setDepth(D + 1));
      for (const o of volumeRows(this, (w - PW) / 2 + 30, top + 66, PW - 60, D + 1)) this.addUI(o);
      btn(top + 268, 'Back', () => this.show('main'), { w: 200 });
    } else if (view === 'new') {
      this.addUI(panel(this, (w - PW) / 2, top, PW, 438, D));
      this.addUI(this.add.text(w / 2, top + 22, 'Difficulty', { fontFamily: FONT_SERIF, fontSize: '18px', color: UI_COL.text, stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 0).setDepth(D + 1));
      const diffBtns = Object.entries(DIFFICULTY).map(([k, d], i) => {
        const b = this.addUI(button(this, (w - PW) / 2 + 30 + i * 130, top + 52, 120, 38, d.name, () => {
          this.options.difficulty = k;
          diffBtns.forEach(([kk, bb]) => bb.setSelected(kk === k));
        }, { depth: D + 1, size: '16px' }));
        b.setSelected(k === this.options.difficulty);
        return [k, b];
      });
      this.addUI(this.add.text(w / 2, top + 108, 'Map', { fontFamily: FONT_SERIF, fontSize: '18px', color: UI_COL.text, stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 0).setDepth(D + 1));
      if (!MAP_TYPES[this.options.map]) this.options.map = 'continental';
      const mapDesc = this.addUI(this.add.text(w / 2, top + 182, '', {
        fontFamily: FONT_SANS, fontSize: '13px', fontStyle: 'italic', color: UI_COL.dim, stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5, 0).setDepth(D + 1));
      const mapBtns = Object.entries(MAP_TYPES).map(([k, t], i) => {
        const b = this.addUI(button(this, (w - PW) / 2 + 22 + i * 100, top + 138, 96, 38, t.name, () => {
          this.options.map = k;
          mapBtns.forEach(([kk, bb]) => bb.setSelected(kk === k));
          mapDesc.setText(t.desc);
        }, { depth: D + 1, size: '13px' }));
        b.setSelected(k === this.options.map);
        return [k, b];
      });
      mapDesc.setText(MAP_TYPES[this.options.map].desc);
      top += 38;
      this.addUI(this.add.text(w / 2, top + 188, 'Fog of war', { fontFamily: FONT_SERIF, fontSize: '18px', color: UI_COL.text, stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 0).setDepth(D + 1));
      const fogBtns = [[true, 'On'], [false, 'Off']].map(([k, label], i) => {
        const b = this.addUI(button(this, (w - PW) / 2 + 30 + i * 195, top + 218, 185, 38, label, () => {
          this.options.fog = k;
          fogBtns.forEach(([kk, bb]) => bb.setSelected(kk === k));
        }, { depth: D + 1, size: '16px' }));
        b.setSelected(k === this.options.fog);
        return [k, b];
      });
      btn(top + 276, 'Start Game', () => this.startGame());
      btn(top + 334, 'Back', () => this.show('main'), { w: 200 });
    } else if (view === 'load') {
      const saves = listSaves();
      this.addUI(panel(this, (w - PW) / 2, top, PW, 90 + saves.length * 54 + 40, D));
      this.addUI(this.add.text(w / 2, top + 22, 'Load Game', { fontFamily: FONT_SERIF, fontSize: '22px', color: UI_COL.gold, stroke: '#000', strokeThickness: 4 }).setOrigin(0.5, 0).setDepth(D + 1));
      saves.forEach((s, i) => {
        const label = s.empty ? `Slot ${s.slot} — empty`
          : `Slot ${s.slot} — ${fmtTime(s.gameTime)}, ${ERAS[s.era].name}, ${DIFFICULTY[s.difficulty]?.name || ''}`;
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
    } else if (view === 'help') {
      const PH = Math.min(440, h - top - 10);
      this.addUI(panel(this, (w - 600) / 2, top - 20, 600, PH, D));
      this.addUI(scrollText(this, (w - 600) / 2 + 24, top + 4, 552, PH - 102, HOW_TO_PLAY, {
        fontFamily: FONT_SANS, fontSize: '14px', color: UI_COL.text, lineSpacing: 5, stroke: '#000', strokeThickness: 2,
      }, D + 1));
      btn(top - 20 + PH - 62, 'Back', () => this.show('main'), { w: 200 });
    }
  }

  startGame() {
    const seed = Math.floor(Math.random() * 1e9);
    this.scene.start('GameScene', { seed, mapType: this.options.map, difficulty: this.options.difficulty, fog: this.options.fog });
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
