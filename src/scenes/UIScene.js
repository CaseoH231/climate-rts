// In-game interface, in the style of classic isometric RTS games: wooden resource bar, stone command panel
// with a command grid, info portrait and diamond minimap, climate panel, messages, in-game menu, end screen.
import { TILE, MAP_W, MAP_H, TEAM_COLORS, CLIMATE } from '../config.js';
import { BUILDING_TYPES, WORKER_PAGES, UPGRADES, ERAS } from '../buildings.js';
import { UNIT_TYPES } from '../unit.js';
import { buildingKey, unitKey } from '../art.js';
import { toIso, fromIso, ISO_W, ISO_H } from '../iso.js';
import { panel, button, inset, bevelBorder, volumeRows, FONT_SERIF, FONT_SANS, UI_COL } from '../ui.js';
import { audio } from '../audio.js';
import { listSaves, readSave, writeSave } from '../save.js';
import { DIFFICULTY } from '../ai.js';
import { HOW_TO_PLAY } from '../help.js';
import { GAME_SPEEDS, MARKET_BASE } from '../config.js';

const TOP_H = 34;
const PANEL_H = 180;
const MM_W = 256;
const MM_H = 128;
const MM_K = ISO_W / MM_W; // world px per minimap px
const CELL = 54;
const BTN = 50;
const GRID_X = 18;
const INFO_X = 18 + 6 * CELL + 18;
const CLIM_W = 330;
const CLIM_H = 66;
const MAX_TEMP_SHOWN = 5;
const SERIF = FONT_SERIF;
const SANS = FONT_SANS;
const COL = { text: UI_COL.text, dim: UI_COL.dim, gold: UI_COL.gold, bad: UI_COL.bad, good: UI_COL.good };
// Command buttons use the two left-hand letter rows (number keys are for control groups).
const HOTKEYS = ['q', 'w', 'e', 'r', 't', 'y', 'z', 'x', 'c', 'v', 'b', 'n'];
const RES_ORDER = ['food', 'wood', 'stone', 'fuel', 'clean'];
const RES_NAME = { food: 'Food', wood: 'Wood', stone: 'Stone', fuel: 'Fossil fuel', clean: 'Clean energy', energy: 'Energy (any)' };

const stripEmoji = (s) => s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim();

function tempColor(t) {
  if (t < 1) return 0x7f9f5a;
  if (t < 2) return 0xc8a548;
  if (t < 3) return 0xc77a3a;
  return 0xa83a2c;
}

function fmtTime(sec) {
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
}

export default class UIScene extends Phaser.Scene {
  constructor() {
    super('UIScene');
  }

  create() {
    this.world = this.scene.get('GameScene');
    const w = this.world;

    // Atmosphere: heat haze grows with temperature, vignette darkens the edges.
    this.haze = this.add.rectangle(0, 0, 10, 10, 0xb0603a, 0).setOrigin(0);
    this.vignette = this.add.image(0, 0, 'vignette').setOrigin(0).setAlpha(0.8);

    // ---- Top bar (wood) ----
    this.topBar = this.add.tileSprite(0, 0, 10, TOP_H, 'ui_wood').setOrigin(0);
    this.topTrim = this.add.graphics();
    this.topBoxes = this.add.graphics();
    this.resItems = {};
    RES_ORDER.forEach((res, i) => {
      const x = 10 + i * 104;
      this.add.image(x + 6, 7, `i_${res}`).setOrigin(0).setScale(0.5);
      this.resItems[res] = this.add.text(x + 30, 8, '0', { fontFamily: SERIF, fontSize: '15px', color: COL.text });
    });
    this.add.image(10 + 5 * 104 + 6, 7, 'i_pop').setOrigin(0).setScale(0.5);
    this.popText = this.add.text(10 + 5 * 104 + 30, 8, '', { fontFamily: SERIF, fontSize: '15px', color: COL.text });
    this.eraText = this.add.text(0, 7, '', { fontFamily: SERIF, fontSize: '17px', color: COL.gold, stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 0);
    this.clockText = this.add.text(0, 8, '', { fontFamily: SERIF, fontSize: '15px', color: COL.dim }).setOrigin(1, 0);
    // Game speed: click to speed up, right-click to slow down (or + / - keys).
    this.speedText = this.add.text(0, 8, '', { fontFamily: SERIF, fontSize: '15px', color: COL.gold }).setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    this.speedText.on('pointerdown', (p) => {
      const i = GAME_SPEEDS.indexOf(this.world.speed);
      const n = GAME_SPEEDS.length;
      audio.play('click');
      this.world.setSpeed(GAME_SPEEDS[(i + (p.rightButtonDown() ? n - 1 : 1)) % n]);
    });
    this.speedText.on('pointerover', () => this.showTip({ name: 'Game speed', cost: null, desc: 'Click to speed up, right-click to slow down. Keys: + and -.' }, this.speedText.x - 120, 40, true));
    this.speedText.on('pointerout', () => this.hideTip());
    this.menuBtn = button(this, 0, 4, 78, 26, 'Menu', () => this.openMenu(), { size: '14px' });

    // ---- Climate panel (top right) ----
    this.climPanel = panel(this, 0, 0, CLIM_W, CLIM_H);
    this.climIcons = ['i_co2', 'i_temp', 'i_forest'].map((k) => this.add.image(0, 0, k).setOrigin(0).setScale(0.5));
    this.climTexts = [0, 1, 2].map(() => this.add.text(0, 0, '', { fontFamily: SERIF, fontSize: '14px', color: COL.text }));
    this.climBar = this.add.graphics();
    this.climEvents = this.add.text(0, 0, '', { fontFamily: SANS, fontSize: '12px', color: '#e0b070' });

    // ---- Bottom panel (stone) ----
    this.bottom = panel(this, 0, 0, 10, PANEL_H);
    this.insets = this.add.graphics();
    this.portrait = this.add.image(0, 0, 'i_pop').setVisible(false);
    this.selTitle = this.add.text(0, 0, '', { fontFamily: SERIF, fontSize: '19px', color: COL.gold, stroke: '#000', strokeThickness: 3 });
    this.selDetail = this.add.text(0, 0, '', { fontFamily: SANS, fontSize: '13px', color: COL.text, lineSpacing: 4, stroke: '#000', strokeThickness: 2 });
    this.hpBar = this.add.graphics();
    this.buttons = [];
    this.buildPage = 0;

    // ---- Idle worker button (sits just above the command grid) ----
    this.idleBtn = this.add.container(0, 0).setVisible(false);
    const ib = this.add.graphics();
    ib.fillStyle(0x2a241c, 1).fillRect(0, 0, 46, 46);
    ib.lineStyle(2, UI_COL.bronze, 1).strokeRect(1, 1, 44, 44);
    const iImg = this.add.image(23, 22, unitKey('worker', 'player')).setScale(0.55);
    this.idleCount = this.add.text(42, 44, '', { fontFamily: SERIF, fontSize: '14px', color: COL.gold, stroke: '#000', strokeThickness: 3 }).setOrigin(1, 1);
    const iHit = this.add.rectangle(0, 0, 46, 46, 0, 0).setOrigin(0).setInteractive({ useHandCursor: true });
    iHit.on('pointerdown', (p) => { if (p.leftButtonDown()) { audio.play('click'); this.world.selectIdleWorker(); } });
    iHit.on('pointerover', () => this.showTip({ name: 'Idle workers', cost: null, desc: 'Click (or press full stop) to select the next worker with nothing to do.' }, this.idleBtn.x, this.idleBtn.y));
    iHit.on('pointerout', () => this.hideTip());
    this.idleBtn.add([ib, iImg, this.idleCount, iHit]);
    this.idleTimer = 0;

    // ---- Tooltip ----
    this.tip = this.add.container(0, 0).setVisible(false).setDepth(50);
    this.tipBg = this.add.graphics();
    this.tipTitle = this.add.text(12, 0, '', { fontFamily: SERIF, fontSize: '15px', color: COL.gold });
    this.tipCost = this.add.text(12, 0, '', { fontFamily: SANS, fontSize: '12px', color: COL.text });
    this.tipDesc = this.add.text(12, 0, '', { fontFamily: SANS, fontSize: '12px', color: COL.dim, wordWrap: { width: 300 } });
    this.tipWarn = this.add.text(12, 0, '', { fontFamily: SANS, fontSize: '12px', color: COL.bad });
    this.tip.add([this.tipBg, this.tipTitle, this.tipCost, this.tipDesc, this.tipWarn]);

    // ---- Minimap (diamond) ----
    if (!this.textures.exists('minimap')) this.textures.createCanvas('minimap', MM_W, MM_H);
    this.mmTex = this.textures.get('minimap');
    this.redrawMinimap();
    this.mmDirty = false;
    this.mmTimer = 0;
    this.mmImage = this.add.image(0, 0, 'minimap').setOrigin(0);
    this.mmDots = this.add.graphics();
    this.pings = [];

    this.messages = [];
    this.sel = { units: [], building: null };
    this.hovered = null;
    this.menu = null;

    this.layout();
    this.scale.on('resize', this.layout, this);

    // Listen to the game — and stop listening when this screen closes (e.g. loading a game or quitting).
    const handlers = {
      selection: (sel) => this.onSelection(sel),
      toast: (m, c) => this.showToast(m, c),
      tileChanged: () => { this.mmDirty = true; },
      alert: (ax, ay) => this.pings.push({ x: ax, y: ay, t: 3000 }),
      gameOver: (r) => this.showGameOver(r),
      openMenu: () => (this.menu ? this.closeMenu() : this.openMenu()),
    };
    for (const [ev, fn] of Object.entries(handlers)) w.events.on(ev, fn);
    this.events.once('shutdown', () => {
      for (const [ev, fn] of Object.entries(handlers)) w.events.off(ev, fn);
      this.scale.off('resize', this.layout, this);
    });
    this.onSelection({ units: [], building: null });

    // Hotkeys press the command buttons.
    this.input.keyboard.on('keydown', (e) => {
      if (this.menu || w.gameOver || e.ctrlKey || e.altKey || e.metaKey) return;
      const i = HOTKEYS.indexOf(e.key.toLowerCase());
      if (i >= 0 && this.buttons[i]) this.buttons[i].cmd.action();
    });

    // Minimap clicks: left = jump camera, right = send selected units there.
    this.mmDragging = false;
    this.input.on('pointerdown', (p) => {
      if (this.menu || !this.inMinimap(p)) return;
      const iso = this.minimapToIso(p);
      if (p.rightButtonDown()) {
        const g = fromIso(iso.x, iso.y);
        w.commandAt(g.x, g.y);
      } else {
        this.mmDragging = true;
        w.cameras.main.centerOn(iso.x, iso.y);
      }
    });
    this.input.on('pointermove', (p) => {
      if (this.mmDragging && p.leftButtonDown()) {
        const iso = this.minimapToIso(p);
        w.cameras.main.centerOn(iso.x, iso.y);
      }
    });
    this.input.on('pointerup', () => { this.mmDragging = false; });
  }

  // ---------- Layout ----------
  layout() {
    const w = this.scale.width;
    const h = this.scale.height;
    this.haze.setSize(w, h);
    this.vignette.setDisplaySize(w, h);

    this.topBar.setSize(w, TOP_H);
    this.topTrim.clear();
    this.topTrim.fillStyle(UI_COL.bronzeDark, 1).fillRect(0, TOP_H - 3, w, 3);
    this.topTrim.fillStyle(UI_COL.bronze, 1).fillRect(0, TOP_H - 2, w, 1);
    this.topBoxes.clear();
    for (let i = 0; i < 6; i++) inset(this.topBoxes, 8 + i * 104, 4, 96, TOP_H - 10);
    this.eraText.setPosition(w / 2 + 120, 6);
    this.clockText.setPosition(w - 98, 8);
    this.speedText.setPosition(w - 150, 8);
    this.menuBtn.setPosition(w - 86, 3);

    const cx = w - CLIM_W - 8;
    const cy = TOP_H + 6;
    this.climPanel.setPosition(cx, cy);
    [0, 1, 2].forEach((i) => {
      const ix = cx + 14 + i * 104;
      this.climIcons[i].setPosition(ix, cy + 10);
      this.climTexts[i].setPosition(ix + 24, cy + 11);
    });
    this.climBar.setPosition(cx + 14, cy + 35);
    this.climEvents.setPosition(cx + 14, cy + 46);
    this.climRect = new Phaser.Geom.Rectangle(cx, cy, CLIM_W, CLIM_H);

    const py = h - PANEL_H;
    this.bottom.setPosition(0, py);
    this.bottom.bg.setSize(w, PANEL_H);
    bevelBorder(this.bottom.border, 0, 0, w, PANEL_H);

    // minimap frame on the right
    this.mmX = w - MM_W - 26;
    this.mmY = py + (PANEL_H - MM_H) / 2;
    this.mmImage.setPosition(this.mmX, this.mmY);
    this.mmDots.setPosition(this.mmX, this.mmY);

    // portrait + info in the middle
    const infoW = this.mmX - 30 - INFO_X;
    this.insets.clear();
    this.insets.setPosition(0, py);
    inset(this.insets, GRID_X - 6, 12, 6 * CELL + 8, 2 * CELL + 10 + CELL);
    inset(this.insets, INFO_X, 14, 84, 84);
    inset(this.insets, INFO_X + 96, 14, Math.max(120, infoW - 96), PANEL_H - 30);
    inset(this.insets, this.mmX - 10, this.mmY - py - 8, MM_W + 20, MM_H + 16);
    this.portrait.setPosition(INFO_X + 42, py + 56);
    this.selTitle.setPosition(INFO_X + 108, py + 22);
    this.selDetail.setPosition(INFO_X + 108, py + 52);
    this.selDetail.setWordWrapWidth(Math.max(110, infoW - 120));
    this.hpBarPos = { x: INFO_X + 4, y: py + 104, w: 76 };
    this.idleBtn.setPosition(GRID_X - 6, py - 54);
    this.idleRect = new Phaser.Geom.Rectangle(GRID_X - 6, py - 54, 46, 46);

    this.layoutMessages();
    this.buildButtons();
    if (this.menu) this.openMenu(this.menu.view);
  }

  isPointerOverUI(p) {
    if (this.menu) return true;
    const h = this.scale.height;
    return p.y < TOP_H || p.y > h - PANEL_H || Phaser.Geom.Rectangle.Contains(this.climRect, p.x, p.y) ||
      (this.idleBtn.visible && Phaser.Geom.Rectangle.Contains(this.idleRect, p.x, p.y));
  }

  inMinimap(p) {
    const x = p.x - this.mmX - MM_W / 2;
    const y = p.y - this.mmY - MM_H / 2;
    return Math.abs(x) / (MM_W / 2) + Math.abs(y) / (MM_H / 2) <= 1.02;
  }

  minimapToIso(p) {
    return { x: (p.x - this.mmX) * MM_K, y: (p.y - this.mmY) * MM_K };
  }

  redrawMinimap() {
    const ctx = this.mmTex.getContext();
    ctx.clearRect(0, 0, MM_W, MM_H);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.world.terrainTex.getSourceImage(), 0, 0, ISO_W, ISO_H, 0, 0, MM_W, MM_H);
    const fog = this.world.fog && this.world.fog.canvas;
    if (fog) ctx.drawImage(fog, 0, 0, fog.width, fog.height, 0, 0, MM_W, MM_H);
    this.mmTex.refresh();
    this.mmFogVersion = this.world.fog ? this.world.fog.version : 0;
  }

  // ---------- Messages ----------
  showToast(msg, color = '#f0d890') {
    msg = stripEmoji(msg);
    const last = this.messages[this.messages.length - 1];
    if (last && last.text.text === msg) { last.life = 4500; last.text.setAlpha(1); return; }
    const t = this.add.text(0, 0, msg, {
      fontFamily: SERIF, fontSize: '16px', color, stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0, 0);
    this.messages.push({ text: t, life: 4500 });
    while (this.messages.length > 5) this.messages.shift().text.destroy();
    this.layoutMessages();
  }

  layoutMessages() {
    this.messages.forEach((m, i) => m.text.setPosition(14, TOP_H + 10 + i * 23));
  }

  updateMessages(dt) {
    let changed = false;
    for (const m of this.messages) {
      m.life -= dt;
      if (m.life < 600) m.text.setAlpha(Math.max(0, m.life / 600));
    }
    while (this.messages.length && this.messages[0].life <= 0) {
      this.messages.shift().text.destroy();
      changed = true;
    }
    if (changed) this.layoutMessages();
  }

  // ---------- Selection & commands ----------
  onSelection(sel) {
    const sameUnits = sel.units.length && sel.units.every((u) => this.sel.units.includes(u));
    if (!sameUnits) this.buildPage = 0;
    this.sel = sel;
    this.buildButtons();
    const { units, building } = sel;
    let key = null;
    if (building) key = buildingKey(building.type, building.team);
    else if (units.length) key = unitKey(units[0].type, units[0].team);
    if (key) {
      const tex = this.textures.get(key).getSourceImage();
      const s = Math.min(78 / tex.width, 78 / tex.height, 1.9);
      this.portrait.setTexture(key).setScale(s).setVisible(true).setAlpha(1);
    } else {
      this.portrait.setTexture('b_town_centre_player');
      const tex = this.textures.get('b_town_centre_player').getSourceImage();
      this.portrait.setScale(Math.min(78 / tex.width, 78 / tex.height)).setVisible(true).setAlpha(0.35);
    }
  }

  commandList() {
    const { units, building: b } = this.sel;
    const w = this.world;
    const era = w.eraOf('player');
    const cmds = [];
    if (b) {
      if (!b.complete || b.team !== 'player') return cmds;
      if (b.type === 'market') return this.marketCommands();
      for (const type of b.def.trains || []) {
        const u = UNIT_TYPES[type];
        cmds.push({
          thumb: unitKey(type, 'player'), name: `Train ${u.name}`, cost: u.cost,
          desc: `${u.desc}\nHealth ${u.hp}  ·  Damage ${u.attack}  ·  ${u.range > 60 ? 'Ranged' : 'Close combat'}`,
          locked: u.era > era ? `Requires the ${ERAS[u.era].name}` : null, lockEra: u.era, action: () => w.train(type),
        });
      }
      if (b.def.advancesEra && ERAS[era + 1]) {
        const next = ERAS[era + 1];
        cmds.push({
          thumb: 'up_era', name: `Advance to the ${next.name}`, cost: next.cost, desc: `${next.desc} Takes ${next.time}s.`,
          busy: b.research && b.research.kind === 'era', action: () => w.advanceEra(),
        });
      }
      for (const id of b.def.research || []) {
        if (w.upgrades.has(id)) continue;
        const up = UPGRADES[id];
        cmds.push({
          thumb: `up_${id}`, name: up.name, cost: up.cost, desc: `${up.desc} Takes ${up.time}s.`,
          locked: up.era > era ? `Requires the ${ERAS[up.era].name}` : null, lockEra: up.era,
          busy: b.research && b.research.id === id, action: () => w.research(id),
        });
      }
      if (b.def.garrison) {
        while (cmds.length < 5) cmds.push(null);
        cmds.push(w.bellRung
          ? { thumb: 'up_allclear', name: 'All clear', cost: null, desc: 'Everyone comes out of shelter and goes back to the job they were doing.', action: () => w.allClear() }
          : { thumb: 'up_bell', name: 'Ring the town bell', cost: null,
            desc: 'Every worker runs into the nearest Town Centre (15) or tower (5). Each 3 inside adds an extra arrow. Ring again for "All clear".',
            action: () => w.ringBell() });
      }
      return cmds;
    }
    if (units.some((u) => u.type === 'worker')) {
      for (const type of WORKER_PAGES[this.buildPage]) {
        const d = BUILDING_TYPES[type];
        cmds.push({
          thumb: buildingKey(type, 'player'), name: d.name, cost: d.cost, desc: d.desc,
          locked: d.era > era ? `Requires the ${ERAS[d.era].name}` : null, lockEra: d.era, action: () => w.startPlacing(type),
        });
      }
      while (cmds.length < 11) cmds.push(null);
      const toMilitary = this.buildPage === 0;
      cmds.push({
        thumb: buildingKey(toMilitary ? 'barracks' : 'house', 'player'), page: true,
        name: toMilitary ? 'Military buildings' : 'Economy buildings',
        desc: toMilitary ? 'Barracks, towers, walls and gates.' : 'Back to houses, farms, energy and the rest.',
        action: () => { this.buildPage = toMilitary ? 1 : 0; this.buildButtons(); },
      });
      return cmds;
    }
    if (units.length) {
      cmds.push({ thumb: 'up_stop', name: 'Stop', cost: null, desc: 'Stop what they are doing and stand still.', action: () => w.stopSelected() });
      cmds.push({ thumb: 'up_amove', name: 'Attack-move', cost: null, desc: 'Then click the map: they march there and fight anything they meet on the way. Key: A or W.', action: () => w.startAttackMove() });
      return cmds;
    }
    if (!units.length) {
      cmds.push({ thumb: unitKey('worker', 'player'), name: 'Find idle worker', cost: null, desc: 'Selects the next worker with nothing to do. Key: full stop.', action: () => w.selectIdleWorker() });
    }
    return cmds;
  }

  // Market: top row buys 100 of something, bottom row picks what you pay with.
  marketCommands() {
    const w = this.world;
    const RES = ['food', 'wood', 'stone', 'fuel'];
    if (!this.marketPay) this.marketPay = 'wood';
    const pay = this.marketPay;
    const cmds = [];
    for (const r of RES) {
      if (r === pay) { cmds.push(null); continue; }
      const cost = w.tradeCost(pay, r);
      cmds.push({
        thumb: `i_${r}`, name: `Buy 100 ${RES_NAME[r]}`, cost: { [pay]: cost },
        desc: r === 'fuel' ? 'Bought coal gets burned too: it adds CO₂ just like mining it.' : 'Buying makes this more expensive for a while.',
        action: () => { w.trade(pay, r); this.buildButtons(); },
      });
    }
    cmds.push(null, null);
    for (const r of RES) {
      cmds.push({
        thumb: `i_${r}`, name: `Pay with ${RES_NAME[r]}`, cost: null, active: r === pay, payWith: true,
        desc: `Price now: ${w.market[r].toFixed(2)} (normal ${MARKET_BASE[r]}). Selling a lot of something makes it cheaper.`,
        action: () => { this.marketPay = r; this.buildButtons(); },
      });
    }
    return cmds;
  }

  buildButtons() {
    for (const b of this.buttons) if (b) b.container.destroy();
    this.buttons = [];
    this.hideTip();
    const h = this.scale.height;
    const y0 = h - PANEL_H + 18;
    this.commandList().forEach((cmd, i) => {
      if (!cmd) return;
      const col = i % 6;
      const row = Math.floor(i / 6);
      const x = GRID_X + col * CELL;
      const y = y0 + row * CELL;
      const c = this.add.container(x, y);
      const g = this.add.graphics();
      const drawBg = (hover) => {
        g.clear();
        g.fillStyle(hover ? 0x3e3426 : 0x2a241c, 1).fillRect(0, 0, BTN, BTN);
        g.lineStyle(1, 0xc9a85a, hover ? 0.9 : 0.55).lineBetween(1, 1, BTN - 1, 1).lineBetween(1, 1, 1, BTN - 1);
        g.lineStyle(1, 0x000000, 0.9).lineBetween(1, BTN - 1, BTN - 1, BTN - 1).lineBetween(BTN - 1, 1, BTN - 1, BTN - 1);
      };
      drawBg(false);
      const tex = this.textures.get(cmd.thumb).getSourceImage();
      const s = Math.min(44 / tex.width, 44 / tex.height, 1.25);
      const img = this.add.image(BTN / 2, BTN / 2 + 1, cmd.thumb).setScale(s);
      const key = this.add.text(3, 1, (HOTKEYS[i] || '').toUpperCase(), { fontFamily: SANS, fontSize: '10px', color: COL.dim, stroke: '#000', strokeThickness: 2 });
      const stripe = this.add.rectangle(2, BTN - 5, BTN - 4, 3, 0x000000, 0).setOrigin(0);
      const shade = this.add.rectangle(0, 0, BTN, BTN, 0x000000, cmd.locked ? 0.55 : 0).setOrigin(0);
      c.add([g, img, shade, stripe, key]);
      if (cmd.active) {
        const ring = this.add.graphics();
        ring.lineStyle(2, 0xe3c46f, 1).strokeRect(1, 1, BTN - 2, BTN - 2);
        c.add(ring);
      }
      if (cmd.payWith) {
        c.add(this.add.text(BTN - 3, BTN - 2, 'pay', {
          fontFamily: SANS, fontSize: '10px', color: cmd.active ? COL.gold : COL.dim, stroke: '#000000', strokeThickness: 2,
        }).setOrigin(1, 1));
      }
      if (cmd.page) {
        c.add(this.add.text(BTN - 3, BTN - 2, '»', {
          fontFamily: SERIF, fontSize: '20px', color: COL.gold, stroke: '#000000', strokeThickness: 3,
        }).setOrigin(1, 1));
      }
      if (cmd.locked) {
        c.add(this.add.text(BTN / 2, BTN / 2, ERAS[cmd.lockEra].short, {
          fontFamily: SERIF, fontSize: '17px', color: COL.gold, stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5));
      }
      const hit = this.add.rectangle(0, 0, BTN, BTN, 0, 0).setOrigin(0).setInteractive({ useHandCursor: true });
      c.add(hit);
      hit.on('pointerover', () => { drawBg(true); this.showTip(cmd, x, y); });
      hit.on('pointerout', () => { drawBg(false); this.hideTip(); });
      hit.on('pointerdown', (p) => { if (p.leftButtonDown()) { audio.play('click'); cmd.action(); } });
      this.buttons[i] = { container: c, cmd, stripe };
    });
  }

  costText(cost) {
    if (!cost || !Object.keys(cost).length) return 'Free';
    return Object.entries(cost).map(([k, v]) => `${v} ${RES_NAME[k]}`).join('   ');
  }

  showTip(cmd, bx, by = 0, below = false) {
    this.hovered = cmd;
    this.tipTitle.setText(cmd.name);
    this.tipCost.setText(this.costText(cmd.cost));
    this.tipDesc.setText(cmd.desc || '');
    const problem = cmd.locked || (cmd.cost && !this.world.canAfford(cmd.cost) ? `Need ${this.world.missingText(cmd.cost)} more` : '');
    this.tipWarn.setText(problem);
    const parts = [this.tipTitle, this.tipCost, this.tipDesc, this.tipWarn];
    const total = parts.filter((t) => t.text).reduce((sum, t) => sum + t.height + 4, 0) + 16;
    let yy = -total + 9;
    for (const t of parts) {
      t.setY(yy);
      if (t.text) yy += t.height + 4;
    }
    this.tipBg.clear();
    this.tipBg.fillStyle(0x15120e, 0.96).fillRect(0, -total, 326, total);
    this.tipBg.lineStyle(2, UI_COL.bronzeDark, 1).strokeRect(1, -total + 1, 324, total - 2);
    this.tipBg.lineStyle(1, UI_COL.bronze, 1).strokeRect(3, -total + 3, 320, total - 6);
    this.tip.setPosition(Math.min(bx, this.scale.width - 336), below ? by + total : this.scale.height - PANEL_H - 4).setVisible(true);
  }

  hideTip() {
    this.hovered = null;
    if (this.tip) this.tip.setVisible(false);
  }

  panelText() {
    const { units, building: b } = this.sel;
    const w = this.world;
    if (b) {
      const lines = [];
      if (!b.complete) lines.push(`Under construction: ${Math.floor(b.progress * 100)}%`);
      lines.push(`Health ${Math.max(0, Math.ceil(b.hp))} / ${b.maxHp}`);
      if (b.research) lines.push(`Researching ${b.research.name}: ${Math.floor((b.research.t / b.research.time) * 100)}%`);
      if (b.queue.length) {
        lines.push(`Training ${UNIT_TYPES[b.queue[0]].name}: ${Math.floor(b.trainProgress * 100)}%` +
          (b.queue.length > 1 ? `  (+${b.queue.length - 1} queued)` : ''));
      }
      if (b.waitingForPop) lines.push('Population limit reached — build a House.');
      if (b.def.garrison && b.team === 'player' && b.complete) lines.push(`Sheltering ${b.garrison.length} / ${b.def.garrison}`);
      if (b.def.trains && b.complete && b.team === 'player' && !b.research && !b.queue.length) {
        lines.push(b.rally ? 'Rally point set (right-click to move it).' : 'Right-click the ground to set a rally point.');
      }
      if (b.type === 'farm') {
        lines.push(`Food left: ${Math.ceil(b.food)}${b.farmer ? '' : '  (no farmer — right-click it with a worker)'}`);
        if (w.climate.drought > 0) lines.push('Drought: crops yield half.');
      }
      if (b.type === 'trees' && b.complete) lines.push(`Growing: ${Math.floor(b.grow * 100)}%`);
      if (b.def.produces && b.complete) {
        const [res, rate] = Object.entries(b.def.produces)[0];
        lines.push(`Producing ${(rate * w.productionMultiplier(res, 'player')).toFixed(2)} ${RES_NAME[res].toLowerCase()} / sec`);
      }
      if (b.def.capture && b.complete) lines.push(b.capturing ? 'Capturing CO₂.' : 'Idle — needs clean energy.');
      if (b.def.wonder && b.complete) lines.push(`Green Victory in ${Math.max(0, Math.ceil(180 - b.wonderTime))}s`);
      if (!b.research && !b.queue.length && lines.length < 3) lines.push(b.def.desc);
      return [b.def.name, lines.join('\n')];
    }
    if (!units.length) {
      return ['Your people', 'Click or drag to select. Right-click to move, gather or attack.\n' +
        'Ctrl/Alt+1–9: make a group, 1–9: select it (twice to jump there)\n' +
        'H: home   ·   Full stop: idle worker   ·   Esc: cancel'];
    }
    if (units.length === 1) {
      const u = units[0];
      const lines = [`Health ${Math.max(0, Math.ceil(u.hp))} / ${u.maxHp}`, `Currently ${u.statusText}`];
      const grp = w.groupOf(u);
      if (grp >= 0) lines[0] += `   ·   Group ${grp}`;
      if (u.carry >= 1) lines.push(`Carrying ${Math.floor(u.carry)} ${u.carryType === 'fuel' ? 'coal' : u.carryType}`);
      lines.push(u.def.desc);
      return [u.name, lines.join('\n')];
    }
    const types = {};
    const statuses = {};
    for (const u of units) {
      types[u.name] = (types[u.name] || 0) + 1;
      statuses[u.statusText] = (statuses[u.statusText] || 0) + 1;
    }
    const grp = w.groups ? w.groups.findIndex((g) => g.length === units.length && units.every((u) => g.includes(u))) : -1;
    return [`${units.length} units${grp >= 0 ? `  (group ${grp})` : ''}`,
      Object.entries(types).map(([n, c]) => `${c} ${n}${c > 1 ? 's' : ''}`).join(', ') + '\n' +
      Object.entries(statuses).map(([s, c]) => `${c} ${s}`).join(', ')];
  }

  // ---------- Climate panel ----------
  drawClimate() {
    const c = this.world.climate;
    const t = Math.max(0, c.temp);
    const vals = [`${Math.round(c.co2)} ppm`, `+${t.toFixed(1)}°C`, `${c.forestTiles}`];
    vals.forEach((v, i) => { if (this.climTexts[i].text !== v) this.climTexts[i].setText(v); });
    this.climTexts[1].setColor(t < 1 ? COL.text : t < 2 ? '#e8cc7a' : t < 3 ? '#e8a060' : '#f07060');

    const g = this.climBar;
    const bw = CLIM_W - 28;
    g.clear();
    g.fillStyle(0x0b0a08, 1).fillRect(0, 0, bw, 7);
    g.fillStyle(tempColor(t), 1).fillRect(0, 0, bw * Math.min(1, t / MAX_TEMP_SHOWN), 7);
    CLIMATE.seaSteps.forEach((s, i) => {
      const x = (s / MAX_TEMP_SHOWN) * bw;
      g.fillStyle(i < c.seaStage ? 0x3f6f8f : 0x8fb0c0, 1).fillRect(x - 1, -2, 2, 11);
    });
    g.fillStyle(0xa83a2c, 1).fillRect(bw - 2, -2, 2, 11);
    g.lineStyle(1, UI_COL.bronze, 1).strokeRect(0, 0, bw, 7);

    const ev = [];
    if (c.fires.size) ev.push(`Wildfire: ${c.fires.size} tiles burning`);
    if (c.drought > 0) ev.push(`Drought ${Math.ceil(c.drought)}s`);
    if (c.seaStage) ev.push(`Sea risen ×${c.seaStage}`);
    const wonder = this.world.buildings.find((b) => b.def.wonder && b.complete);
    if (wonder) ev.push(`${wonder.team === 'player' ? 'Green Victory' : 'Enemy wonder'} in ${Math.max(0, Math.ceil(180 - wonder.wonderTime))}s`);
    if (!ev.length) ev.push(t < 1 ? 'Climate stable' : t < 2.5 ? 'Disasters becoming more likely' : 'Severe climate disruption');
    const evText = ev.join('   ·   ');
    if (this.climEvents.text !== evText) this.climEvents.setText(evText);
  }

  // ---------- In-game menu (pause, save, load, quit) ----------
  openMenu(view = 'main') {
    const w = this.world;
    if (w.gameOver) return;
    this.closeMenu(true);
    w.paused = true;
    this.hideTip();
    const sw = this.scale.width;
    const sh = this.scale.height;
    const items = [];
    const shade = this.add.rectangle(0, 0, sw, sh, 0x000000, 0.55).setOrigin(0).setInteractive().setDepth(80);
    items.push(shade);
    const PW = 420;
    let rows = [];
    let title = 'Game Menu';
    if (view === 'main') {
      rows = [
        ['Resume Game', () => this.closeMenu()],
        ['Save Game', () => this.openMenu('save')],
        ['Load Game', () => this.openMenu('load')],
        ['How to Play', () => this.openMenu('help')],
        ['Settings', () => this.openMenu('settings')],
        ['Quit to Main Menu', () => this.quitToMenu()],
      ];
    } else if (view === 'save' || view === 'load') {
      title = view === 'save' ? 'Save Game' : 'Load Game';
      for (const info of listSaves()) {
        const label = info.empty ? `Slot ${info.slot} — empty`
          : `Slot ${info.slot} — ${fmtTime(info.gameTime)}, ${ERAS[info.era].name}, ${DIFFICULTY[info.difficulty]?.name || ''}`;
        rows.push([label, () => {
          if (view === 'save') {
            const ok = writeSave(info.slot, w);
            this.closeMenu();
            this.showToast(ok ? `Game saved to slot ${info.slot}` : 'Could not save the game', ok ? '#c8dca0' : '#e07a6a');
          } else {
            const data = readSave(info.slot);
            if (data) this.loadGame(data);
          }
        }, view === 'load' && info.empty]);
      }
      rows.push(['Back', () => this.openMenu('main')]);
    } else if (view === 'help') {
      title = 'How to Play';
    } else if (view === 'settings') {
      title = 'Settings';
      rows.push(['Back', () => this.openMenu('main')]);
    }
    const helpH = view === 'help' ? 330 : 0;
    const settingsH = view === 'settings' ? 170 : 0;
    const PH = 80 + rows.length * 50 + helpH + settingsH + (view === 'help' ? 60 : 0);
    const px = (sw - PW) / 2;
    const py = (sh - PH) / 2;
    items.push(panel(this, px, py, PW, PH, 81));
    items.push(this.add.text(sw / 2, py + 22, title, { fontFamily: SERIF, fontSize: '24px', color: COL.gold, stroke: '#000', strokeThickness: 4 }).setOrigin(0.5, 0).setDepth(82));
    if (view === 'help') {
      items.push(this.add.text(px + 24, py + 64, HOW_TO_PLAY, {
        fontFamily: SANS, fontSize: '13px', color: COL.text, lineSpacing: 4, wordWrap: { width: PW - 48 }, stroke: '#000', strokeThickness: 2,
      }).setDepth(82));
      items.push(button(this, px + (PW - 200) / 2, py + PH - 60, 200, 38, 'Back', () => this.openMenu('main'), { depth: 82 }));
    }
    if (view === 'settings') items.push(...volumeRows(this, px + 30, py + 70, PW - 60, 82));
    rows.forEach(([label, fn, disabled], i) => {
      const b = button(this, px + 30, py + 70 + settingsH + i * 50, PW - 60, 40, label, fn, { depth: 82, size: label.length > 30 ? '14px' : '17px' });
      if (disabled) b.setEnabled(false);
      items.push(b);
    });
    this.menu = { view, items };
  }

  closeMenu(keepPaused = false) {
    if (!this.menu) return;
    for (const it of this.menu.items) it.destroy();
    this.menu = null;
    if (!keepPaused) this.world.paused = false;
  }

  loadGame(data) {
    this.closeMenu(true);
    this.world.scene.start('GameScene', { load: data });
  }

  quitToMenu() {
    this.closeMenu(true);
    this.scene.stop('GameScene');
    this.scene.start('MenuScene');
  }

  // ---------- Game over screen ----------
  showGameOver(result) {
    this.closeMenu(true);
    this.hideTip();
    const w = this.scale.width;
    const h = this.scale.height;
    const info = {
      victory: ['Victory', 'The enemy Town Centre has fallen.', '#e3c46f'],
      green: ['Green Victory', 'The Climate Restoration Project has begun to heal the planet.', '#b8dc90'],
      defeat: ['Defeat', 'Your Town Centre has fallen.', '#e07a6a'],
      collapse: ['Climate Collapse', 'The planet passed +5°C. Nobody wins on a ruined world.', '#e8a060'],
    }[result];
    const world = this.world;
    const c = world.climate;
    const PW = Math.min(860, w - 20);
    const PH = Math.min(580, h - 20);
    const x0 = Math.round(w / 2 - PW / 2);
    const y0 = Math.round(h / 2 - PH / 2);
    const D = 101;
    this.add.rectangle(0, 0, w, h, 0x000000, 0.6).setOrigin(0).setInteractive().setDepth(100);
    panel(this, x0, y0, PW, PH, 100);
    const txt = (x, y, str, style, ox = 0) => this.add.text(x, y, str, { fontFamily: SANS, fontSize: '13px', color: COL.text, stroke: '#000', strokeThickness: 2, ...style }).setOrigin(ox, 0).setDepth(D);
    txt(w / 2, y0 + 16, info[0], { fontFamily: SERIF, fontSize: '44px', color: info[2], strokeThickness: 6 }, 0.5);
    txt(w / 2, y0 + 70, info[1], { fontFamily: SERIF, fontSize: '17px', fontStyle: 'italic', strokeThickness: 3 }, 0.5);
    txt(w / 2, y0 + 96, `Game time ${fmtTime(world.gameTime)}   ·   CO₂ ${Math.round(c.co2)} ppm   ·   +${Math.max(0, c.temp).toFixed(1)}°C   ·   ` +
      `Sea rises ${c.seaStage}   ·   ${ERAS[world.eraOf('player')].name}`, { color: COL.dim }, 0.5);

    // --- Left: the numbers ---
    const st = world.stats.teams;
    const sum = (g) => Math.round(g.food + g.wood + g.stone + g.fuel + g.clean);
    const rows = [
      ['Resources gathered', sum(st.player.gathered), sum(st.enemy.gathered)],
      ['   of which coal', Math.round(st.player.gathered.fuel), Math.round(st.enemy.gathered.fuel)],
      ['   of which clean energy', Math.round(st.player.gathered.clean), Math.round(st.enemy.gathered.clean)],
      ['CO₂ added (ppm)', Math.round(st.player.co2), Math.round(st.enemy.co2)],
      ['Units trained', st.player.trained, st.enemy.trained],
      ['Units lost', st.player.lost, st.enemy.lost],
      ['Enemy units killed', st.player.kills, st.enemy.kills],
      ['Buildings completed', st.player.built, st.enemy.built],
      ['Buildings lost', st.player.buildingsLost, st.enemy.buildingsLost],
      ['Enemy buildings destroyed', st.player.razed, st.enemy.razed],
    ];
    const lx = x0 + 28;
    const ty = y0 + 132;
    const colA = lx + 300;
    const colB = lx + 380;
    const tw = colB + 10 - lx;
    const g = this.add.graphics().setDepth(D);
    g.fillStyle(0x000000, 0.35).fillRect(lx - 8, ty - 6, tw + 16, 28 + rows.length * 25);
    txt(colA, ty, 'You', { fontFamily: SERIF, fontSize: '15px', color: '#9fb9e0' }, 1);
    txt(colB, ty, 'Enemy', { fontFamily: SERIF, fontSize: '15px', color: '#e0a49c' }, 1);
    rows.forEach(([label, a, b], i) => {
      const y = ty + 26 + i * 25;
      if (i % 2 === 0) g.fillStyle(0xffffff, 0.04).fillRect(lx - 8, y - 4, tw + 16, 25);
      const sub = label.startsWith('   ');
      txt(lx, y, label.trim(), { color: sub ? COL.dim : COL.text, fontSize: sub ? '12px' : '13px' }).setX(sub ? lx + 14 : lx);
      // the better number glows a little (fewer is better for losses and CO₂)
      const lowerBetter = /lost|CO₂|coal/.test(label);
      const aWins = a !== b && (lowerBetter ? a < b : a > b);
      const bWins = a !== b && !aWins;
      txt(colA, y, String(a), { color: aWins ? COL.gold : COL.text }, 1);
      txt(colB, y, String(b), { color: bWins ? COL.gold : COL.text }, 1);
    });

    // --- Right: charts over time ---
    const tl = world.stats.timeline;
    const cx = x0 + PW - 28 - 330;
    const chartW = 330;
    const chartH = 120;
    this.drawChart(cx, ty, chartW, chartH, 'Temperature (°C above normal)', tl.map((p) => p.t),
      [{ values: tl.map((p) => Math.max(0, p.temp)), color: 0xe08a4a }], { min: 0, maxAtLeast: 1, fmt: (v) => `+${v.toFixed(1)}` });
    this.drawChart(cx, ty + chartH + 58, chartW, chartH, 'Army size', tl.map((p) => p.t),
      [{ values: tl.map((p) => p.army.player), color: TEAM_COLORS.player.main, name: 'You' },
        { values: tl.map((p) => p.army.enemy), color: TEAM_COLORS.enemy.main, name: 'Enemy' }], { min: 0, maxAtLeast: 5, fmt: (v) => String(Math.round(v)) });

    const by = y0 + PH - 64;
    button(this, w / 2 - 210, by, 200, 44, 'Play Again', () => {
      this.world.scene.start('GameScene', { seed: Math.floor(Math.random() * 1e9), mapType: this.world.mapType, difficulty: this.world.difficulty, fog: this.world.fog ? this.world.fog.enabled : true });
    }, { depth: D });
    button(this, w / 2 + 10, by, 200, 44, 'Main Menu', () => this.quitToMenu(), { depth: D });
  }

  // A small line chart: times along the bottom, one line per series.
  drawChart(x, y, cw, ch, title, times, series, opt) {
    const D = 101;
    const g = this.add.graphics().setDepth(D);
    this.add.text(x, y, title, { fontFamily: SERIF, fontSize: '14px', color: COL.gold, stroke: '#000', strokeThickness: 2 }).setDepth(D);
    const top = y + 22;
    g.fillStyle(0x000000, 0.4).fillRect(x, top, cw, ch);
    g.lineStyle(1, UI_COL.bronzeDark, 1).strokeRect(x, top, cw, ch);
    const all = series.flatMap((s) => s.values);
    const max = Math.max(opt.maxAtLeast, ...all) * 1.08;
    const min = opt.min;
    const tMax = Math.max(60, times[times.length - 1] || 0);
    // gridlines
    g.lineStyle(1, 0xffffff, 0.07);
    for (let i = 1; i < 4; i++) g.lineBetween(x, top + (ch * i) / 4, x + cw, top + (ch * i) / 4);
    const lbl = (tx, ty2, str, ox = 0, oy = 0) => this.add.text(tx, ty2, str, { fontFamily: SANS, fontSize: '11px', color: COL.dim }).setOrigin(ox, oy).setDepth(D);
    lbl(x - 4, top, opt.fmt(max), 1, 0);
    lbl(x - 4, top + ch, opt.fmt(min), 1, 1);
    lbl(x, top + ch + 3, '0:00');
    lbl(x + cw, top + ch + 3, fmtTime(tMax), 1, 0);
    const px = (t) => x + (t / tMax) * cw;
    const py = (v) => top + ch - ((v - min) / (max - min || 1)) * ch;
    for (const s of series) {
      if (times.length < 2) continue;
      g.lineStyle(2, s.color, 1);
      g.beginPath();
      times.forEach((t, i) => (i ? g.lineTo(px(t), py(s.values[i])) : g.moveTo(px(t), py(s.values[i]))));
      g.strokePath();
    }
    if (times.length < 2) lbl(x + cw / 2, top + ch / 2, 'Not enough time played', 0.5, 0.5);
    // legend
    let lx = x + cw;
    for (const s of [...series].reverse()) {
      if (!s.name) continue;
      const t = lbl(lx, y + 3, s.name, 1, 0);
      lx -= t.width + 4;
      g.fillStyle(s.color, 1).fillRect(lx - 10, y + 8, 10, 3);
      lx -= 22;
    }
  }

  // ---------- Every frame ----------
  update(time, delta) {
    const w = this.world;
    if (!w.climate) return;
    const r = w.resources;

    for (const res of RES_ORDER) {
      const v = `${Math.floor(r[res])}`;
      if (this.resItems[res].text !== v) this.resItems[res].setText(v);
    }
    const pop = `${w.popUsed} / ${w.popCap}`;
    if (this.popText.text !== pop) this.popText.setText(pop);
    const era = ERAS[w.eraOf('player')].name + (w.paused ? '   (paused)' : '');
    if (this.eraText.text !== era) this.eraText.setText(era);
    const clock = fmtTime(w.gameTime);
    if (this.clockText.text !== clock) this.clockText.setText(clock);
    const sp = `×${w.speed}`;
    if (this.speedText.text !== sp) this.speedText.setText(sp);

    this.haze.setAlpha(Math.min(0.2, Math.max(0, w.climate.temp) * 0.045));

    this.idleTimer -= delta;
    if (this.idleTimer <= 0) {
      this.idleTimer = 400;
      const n = w.units.filter((u) => u.team === 'player' && u.type === 'worker' && u.isIdle).length;
      this.idleBtn.setVisible(n > 0 && !this.menu && !w.gameOver);
      this.idleCount.setText(String(n));
    }
    this.drawClimate();
    this.updateMessages(delta);

    const [title, detail] = this.panelText();
    if (this.selTitle.text !== title) this.selTitle.setText(title);
    if (this.selDetail.text !== detail) this.selDetail.setText(detail);

    // Health bar under the portrait.
    this.hpBar.clear();
    const target = this.sel.building || this.sel.units[0];
    if (target) {
      const f = Math.max(0, target.hp / target.maxHp);
      const { x, y, w: bw } = this.hpBarPos;
      this.hpBar.fillStyle(0x000000, 1).fillRect(x, y, bw, 6);
      this.hpBar.fillStyle(f > 0.5 ? 0x4fa83a : f > 0.25 ? 0xd0a63a : 0xb8433a, 1).fillRect(x + 1, y + 1, (bw - 2) * f, 4);
    }

    // Button stripes: red = can't afford, purple = in progress.
    for (const b of this.buttons) {
      if (!b) continue;
      let col = 0;
      let a = 0;
      if (b.cmd.busy) { col = 0x9c86c9; a = 1; }
      else if (!b.cmd.locked && b.cmd.cost && !w.canAfford(b.cmd.cost)) { col = 0xb8433a; a = 0.9; }
      b.stripe.setFillStyle(col, a);
    }
    if (this.hovered) {
      const problem = this.hovered.locked || (this.hovered.cost && !w.canAfford(this.hovered.cost) ? `Need ${w.missingText(this.hovered.cost)} more` : '');
      if (this.tipWarn.text !== problem) this.tipWarn.setText(problem);
    }

    // Minimap terrain refresh when something changed.
    this.mmTimer -= delta;
    if (w.fog && w.fog.version !== this.mmFogVersion) this.mmDirty = true;
    if (this.mmDirty && this.mmTimer <= 0) {
      this.mmTimer = 1500;
      this.mmDirty = false;
      this.redrawMinimap();
    }

    // Minimap overlays.
    const g = this.mmDots;
    g.clear();
    for (const b of w.buildings) {
      if (!b.container.visible) continue;
      const i = toIso(b.cx, b.cy);
      g.fillStyle(TEAM_COLORS[b.team].main, b.complete ? 1 : 0.5);
      if (b.def.wall) { g.fillRect(i.x / MM_K - 1, i.y / MM_K - 1, 2, 2); continue; }
      g.fillRect(i.x / MM_K - 2.5, i.y / MM_K - 2, 5, 4);
      g.lineStyle(1, 0x000000, 0.6).strokeRect(i.x / MM_K - 2.5, i.y / MM_K - 2, 5, 4);
    }
    for (const u of w.units) {
      if (!u.container.visible) continue;
      g.fillStyle(u.selected ? 0xffffff : u.team === 'player' ? 0x7aa8ff : 0xff6a5a, 1);
      g.fillRect(u.isoX / MM_K - 1, u.isoY / MM_K - 1, 2, 2);
    }
    g.fillStyle(0xff5a14, 1);
    for (const f of w.climate.fires.values()) {
      const i = toIso(f.x * TILE + 16, f.y * TILE + 16);
      g.fillRect(i.x / MM_K - 1, i.y / MM_K - 1, 2, 2);
    }
    for (const p of this.pings) {
      p.t -= delta;
      const i = toIso(p.x * TILE + 16, p.y * TILE + 16);
      const r2 = 4 + ((3000 - p.t) / 120) % 10;
      g.lineStyle(2, 0xff6a5a, Math.max(0, p.t / 3000)).strokeCircle(i.x / MM_K, i.y / MM_K, r2);
    }
    this.pings = this.pings.filter((p) => p.t > 0);

    const v = w.cameras.main.worldView;
    g.lineStyle(1, 0xffffff, 0.9);
    g.strokeRect(v.x / MM_K, v.y / MM_K, v.width / MM_K, v.height / MM_K);
  }
}
