// Title screen: a living landscape in the background, with New Game, Load Game and How to Play.
import { TILE, MAP_W, MAP_H, PLAYER_START } from '../config.js';
import { GameMap, MAP_TYPES } from '../map.js';
import { BUILDING_TYPES, ERAS } from '../buildings.js';
import { generateArt, buildingKey, unitKey, buildingTexInfo, BUILDING_POINTS, ART_RES } from '../art.js';
import { toIso, ISO_W, ISO_H } from '../iso.js';
import { panel, button, volumeRows, FONT_SERIF, FONT_SANS, UI_COL } from '../ui.js';
import { audio } from '../audio.js';
import { listSaves, readSave } from '../save.js';
import { DIFFICULTY } from '../ai.js';
import { HOW_TO_PLAY } from '../help.js';

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
      this.addUI(panel(this, (w - PW) / 2, top, PW, canInstall ? 370 : 310, D));
      btn(top + 30, 'New Game', () => this.show('new'));
      const any = listSaves().some((s) => !s.empty);
      btn(top + 90, 'Load Game', () => this.show('load')).setEnabled(any);
      btn(top + 150, 'How to Play', () => this.show('help'));
      btn(top + 210, 'Settings', () => this.show('settings'));
      if (canInstall) {
        btn(top + 270, 'Install Game', async () => {
          const prompt = window.installPrompt;
          if (!prompt) return;
          prompt.prompt();
          await prompt.userChoice;
          window.installPrompt = null;
          this.show('main');
        });
      }
    } else if (view === 'settings') {
      this.addUI(panel(this, (w - PW) / 2, top, PW, 290, D));
      this.addUI(this.add.text(w / 2, top + 22, 'Settings', { fontFamily: FONT_SERIF, fontSize: '22px', color: UI_COL.gold, stroke: '#000', strokeThickness: 4 }).setOrigin(0.5, 0).setDepth(D + 1));
      for (const o of volumeRows(this, (w - PW) / 2 + 30, top + 66, PW - 60, D + 1)) this.addUI(o);
      btn(top + 226, 'Back', () => this.show('main'), { w: 200 });
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
    } else if (view === 'help') {
      const PH = 420;
      this.addUI(panel(this, (w - 560) / 2, top - 20, 560, PH, D));
      this.addUI(this.add.text((w - 560) / 2 + 26, top + 6, HOW_TO_PLAY, {
        fontFamily: FONT_SANS, fontSize: '14px', color: UI_COL.text, lineSpacing: 5, wordWrap: { width: 508 }, stroke: '#000', strokeThickness: 2,
      }).setDepth(D + 1));
      btn(top - 20 + PH - 62, 'Back', () => this.show('main'), { w: 200 });
    }
  }

  startGame() {
    const seed = Math.floor(Math.random() * 1e9);
    this.scene.start('GameScene', { seed, mapType: this.options.map, difficulty: this.options.difficulty, fog: this.options.fog });
  }

  update(time, delta) {
    audio.updateAmbience(delta / 1000, { temp: 0 });
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
