// On-screen interface: resource bar, climate meter, selection panel with command buttons, minimap and messages.
import { TILE, MAP_W, MAP_H, TERRAIN_INFO, TEAM_COLORS, CLIMATE } from '../config.js';
import { BUILDING_TYPES, WORKER_BUILDS, UPGRADES } from '../buildings.js';
import { UNIT_TYPES } from '../unit.js';

const BAR_H = 34;
const PANEL_H = 122;
const MM_SCALE = 3;
const MM_PAD = 10;
const BTN_W = 128;
const BTN_H = 44;
const CLIM_W = 300;
const CLIM_H = 64;
const MAX_TEMP_SHOWN = 5;
const FONT = 'Segoe UI, Arial, sans-serif';
const RES_ICON = { food: '🌾', wood: '🪵', stone: '🪨', fuel: '🛢️', clean: '⚡', energy: '🔋' };

function costText(cost) {
  const parts = Object.entries(cost).map(([k, v]) => `${RES_ICON[k]} ${v}`);
  return parts.length ? parts.join('  ') : 'free';
}

// Green → yellow → orange → red as it gets hotter.
function tempColor(t) {
  if (t < 1) return 0x6aa84f;
  if (t < 2) return 0xf1c232;
  if (t < 3) return 0xe69138;
  return 0xcc0000;
}

export default class UIScene extends Phaser.Scene {
  constructor() {
    super('UIScene');
  }

  create() {
    this.world = this.scene.get('GameScene');

    // Top bar
    this.bar = this.add.rectangle(0, 0, 10, BAR_H, 0x1b1f17, 0.92).setOrigin(0);
    this.resText = this.add.text(12, 8, '', { fontFamily: FONT, fontSize: '16px', color: '#f3f0d7' });

    // Climate meter (top right)
    this.climBg = this.add.rectangle(0, 0, CLIM_W, CLIM_H, 0x1b1f17, 0.92).setOrigin(0).setStrokeStyle(1, 0x8a7f55);
    this.climText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '14px', color: '#f3f0d7' });
    this.climBar = this.add.graphics();
    this.climEvents = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '12px', color: '#ffb74d' });

    // Bottom panel
    this.panel = this.add.rectangle(0, 0, 10, PANEL_H, 0x1b1f17, 0.92).setOrigin(0);
    this.selTitle = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#f3f0d7' });
    this.selDetail = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '14px', color: '#c9c6ad' });
    this.buttons = [];

    // Minimap
    this.mmW = MAP_W * MM_SCALE;
    this.mmH = MAP_H * MM_SCALE;
    this.world.map.createMinimapTexture(this, 'minimap', MM_SCALE);
    this.mmFrame = this.add.rectangle(0, 0, this.mmW + 8, this.mmH + 8, 0x0d0f0b).setOrigin(0).setStrokeStyle(2, 0x8a7f55);
    this.mmImage = this.add.image(0, 0, 'minimap').setOrigin(0);
    this.mmPatch = this.add.graphics(); // painted over tiles that change (used up, burnt, flooded…)
    this.mmDots = this.add.graphics();
    this.pings = [];

    // Message log (newest at the bottom, each fades out)
    this.messages = [];

    this.sel = { units: [], building: null };
    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));

    this.world.events.on('selection', this.onSelection, this);
    this.world.events.on('toast', this.showToast, this);
    this.world.events.on('tileChanged', this.onTileChanged, this);
    this.world.events.on('alert', (x, y) => this.pings.push({ x, y, t: 3000 }));
    this.onSelection({ units: [], building: null });

    // Number keys press the command buttons.
    this.input.keyboard.on('keydown', (e) => {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 9 && this.buttons[n - 1]) this.buttons[n - 1].action();
    });

    // Minimap clicks: left = jump camera, right = send selected units there.
    this.mmDragging = false;
    this.input.on('pointerdown', (p) => {
      if (!Phaser.Geom.Rectangle.Contains(this.mmRect, p.x, p.y)) return;
      const w = this.minimapToWorld(p);
      if (p.rightButtonDown()) {
        this.world.commandAt(w.x, w.y);
      } else {
        this.mmDragging = true;
        this.world.cameras.main.centerOn(w.x, w.y);
      }
    });
    this.input.on('pointermove', (p) => {
      if (this.mmDragging && p.leftButtonDown()) {
        const w = this.minimapToWorld(p);
        this.world.cameras.main.centerOn(w.x, w.y);
      }
    });
    this.input.on('pointerup', () => { this.mmDragging = false; });
  }

  layout() {
    const w = this.scale.width;
    const h = this.scale.height;
    this.bar.setSize(w, BAR_H);
    this.panel.setPosition(0, h - PANEL_H).setSize(w, PANEL_H);
    this.selTitle.setPosition(16, h - PANEL_H + 10);
    this.selDetail.setPosition(16, h - PANEL_H + 38);
    this.selDetail.setWordWrapWidth(Math.max(200, w - this.mmW - 60));

    const cx = w - CLIM_W - 8;
    const cy = BAR_H + 6;
    this.climBg.setPosition(cx, cy);
    this.climText.setPosition(cx + 10, cy + 6);
    this.climBar.setPosition(cx + 10, cy + 28);
    this.climEvents.setPosition(cx + 10, cy + 44);
    this.climRect = new Phaser.Geom.Rectangle(cx, cy, CLIM_W, CLIM_H);

    const mx = w - this.mmW - MM_PAD;
    const my = h - this.mmH - MM_PAD;
    this.mmFrame.setPosition(mx - 4, my - 4);
    this.mmImage.setPosition(mx, my);
    this.mmPatch.setPosition(mx, my);
    this.mmDots.setPosition(mx, my);
    this.mmRect = new Phaser.Geom.Rectangle(mx, my, this.mmW, this.mmH);
    this.mmFrameRect = new Phaser.Geom.Rectangle(mx - 4, my - 4, this.mmW + 8, this.mmH + 8);

    this.layoutMessages();
    this.buildButtons();
  }

  isPointerOverUI(p) {
    const h = this.scale.height;
    return p.y < BAR_H || p.y > h - PANEL_H ||
      Phaser.Geom.Rectangle.Contains(this.mmFrameRect, p.x, p.y) ||
      Phaser.Geom.Rectangle.Contains(this.climRect, p.x, p.y);
  }

  minimapToWorld(p) {
    return {
      x: ((p.x - this.mmRect.x) / MM_SCALE) * TILE,
      y: ((p.y - this.mmRect.y) / MM_SCALE) * TILE,
    };
  }

  onTileChanged(x, y) {
    this.mmPatch.fillStyle(TERRAIN_INFO[this.world.map.get(x, y)].minimap, 1);
    this.mmPatch.fillRect(x * MM_SCALE, y * MM_SCALE, MM_SCALE, MM_SCALE);
  }

  // ---------- Messages ----------
  showToast(msg, color = '#ffe599') {
    const last = this.messages[this.messages.length - 1];
    if (last && last.text.text === msg) { last.life = 4000; last.text.setAlpha(1); return; }
    const t = this.add.text(0, 0, msg, {
      fontFamily: FONT, fontSize: '17px', fontStyle: 'bold', color, stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5, 0);
    this.messages.push({ text: t, life: 4000 });
    while (this.messages.length > 4) this.messages.shift().text.destroy();
    this.layoutMessages();
  }

  layoutMessages() {
    const x = (this.scale.width - CLIM_W) / 2;
    this.messages.forEach((m, i) => m.text.setPosition(x, BAR_H + 10 + i * 26));
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

  // ---------- Selection panel ----------
  onSelection(sel) {
    this.sel = sel;
    this.buildButtons();
  }

  commandList() {
    const { units, building } = this.sel;
    const w = this.world;
    if (building) {
      if (!building.complete) return [];
      const cmds = (building.def.trains || []).map((type) => {
        const u = UNIT_TYPES[type];
        return { label: `${u.icon} ${u.name}`, cost: u.cost, action: () => w.train(type) };
      });
      for (const id of building.def.upgrades || []) {
        if (w.upgrades.has(id)) continue;
        const up = UPGRADES[id];
        cmds.push({ label: `${up.icon} ${up.name}`, cost: up.cost, action: () => w.research(id) });
      }
      return cmds;
    }
    if (units.some((u) => u.type === 'worker')) {
      return WORKER_BUILDS.map((type) => {
        const d = BUILDING_TYPES[type];
        return { label: `${d.icon} ${d.name}`, cost: d.cost, action: () => w.startPlacing(type) };
      });
    }
    if (!units.length) {
      return [{ label: '👷 Idle worker', cost: null, sub: 'Key: .', action: () => w.selectIdleWorker() }];
    }
    return [];
  }

  buildButtons() {
    for (const b of this.buttons) b.container.destroy();
    this.buttons = [];
    const h = this.scale.height;
    const y = h - PANEL_H + 68;
    this.commandList().forEach((cmd, i) => {
      const x = 16 + i * (BTN_W + 6);
      const c = this.add.container(x, y);
      const bg = this.add.rectangle(0, 0, BTN_W, BTN_H, 0x2d3324).setOrigin(0).setStrokeStyle(1, 0x8a7f55);
      const key = this.add.text(BTN_W - 6, 4, `${i + 1}`, { fontFamily: FONT, fontSize: '11px', color: '#8a7f55' }).setOrigin(1, 0);
      const t1 = this.add.text(7, 4, cmd.label, { fontFamily: FONT, fontSize: '13px', color: '#f3f0d7' });
      const t2 = this.add.text(7, 24, cmd.sub || costText(cmd.cost), { fontFamily: FONT, fontSize: '12px', color: '#c9c6ad' });
      c.add([bg, key, t1, t2]);
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerover', () => bg.setFillStyle(0x3d4630));
      bg.on('pointerout', () => bg.setFillStyle(0x2d3324));
      bg.on('pointerdown', (p) => { if (p.leftButtonDown()) cmd.action(); });
      this.buttons.push({ container: c, costLabel: t2, cost: cmd.cost, action: cmd.action });
    });
  }

  panelText() {
    const { units, building: b } = this.sel;
    const w = this.world;
    if (b) {
      let title = `${b.def.icon} ${b.def.name}`;
      if (!b.complete) title += ` — under construction ${Math.floor(b.progress * 100)}%`;
      const parts = [`HP ${Math.max(0, Math.ceil(b.hp))}/${b.maxHp}`];
      if (b.type === 'farm') {
        parts.push(`Food left: ${Math.ceil(b.food)}`, b.farmer ? 'Being farmed' : 'No farmer — right-click it with a worker');
        if (w.climate.drought > 0) parts.push('☀️ Drought: half food');
      }
      if (b.type === 'trees' && b.complete) parts.push(`Growing… ${Math.floor(b.grow * 100)}%`);
      if (b.queue.length) {
        parts.push(`Training ${UNIT_TYPES[b.queue[0]].name} ${Math.floor(b.trainProgress * 100)}%` +
          (b.queue.length > 1 ? ` (+${b.queue.length - 1} queued)` : ''));
      }
      if (b.waitingForPop) parts.push('⚠ Population full — build a House!');
      if (!b.queue.length && b.type !== 'farm') parts.push(b.def.desc);
      return [title, parts.join('   •   ')];
    }
    if (!units.length) {
      return ['Nothing selected',
        'Right-click trees/stone/berries/coal to gather  •  Workers: 1–6 to build  •  ' +
        'Coal is fast energy but heats the planet — wind turbines and forests help  •  . = idle worker  •  H = home'];
    }
    if (units.length === 1) {
      const u = units[0];
      let status = `HP ${u.hp}/${u.maxHp}   •   ${u.statusText}`;
      if (u.carry >= 1) status += `   •   carrying ${Math.floor(u.carry)} ${u.carryType === 'fuel' ? 'coal' : u.carryType}`;
      if (u.type === 'worker') status += '   •   right-click resources to gather, or pick a building below';
      return [`${u.def.icon} ${u.name}`, status];
    }
    const counts = {};
    for (const u of units) counts[u.statusText] = (counts[u.statusText] || 0) + 1;
    const status = Object.entries(counts).map(([s, c]) => `${c} ${s}`).join('   •   ');
    return [`${units.length} units selected`, status];
  }

  // ---------- Climate meter ----------
  drawClimate() {
    const c = this.world.climate;
    const t = Math.max(0, c.temp);
    const text = `🏭 CO₂ ${Math.round(c.co2)} ppm     🌡️ +${t.toFixed(1)}°C     🌳 ${c.forestTiles} forest`;
    if (this.climText.text !== text) this.climText.setText(text);

    const g = this.climBar;
    const bw = CLIM_W - 20;
    g.clear();
    g.fillStyle(0x0d0f0b, 1).fillRect(0, 0, bw, 10);
    const frac = Math.min(1, t / MAX_TEMP_SHOWN);
    g.fillStyle(tempColor(t), 1).fillRect(0, 0, bw * frac, 10);
    // Sea-level-rise thresholds
    CLIMATE.seaSteps.forEach((s, i) => {
      const x = (s / MAX_TEMP_SHOWN) * bw;
      g.fillStyle(i < c.seaStage ? 0x3d85c6 : 0x9fc5e8, 1).fillRect(x - 1, -2, 2, 14);
    });
    g.lineStyle(1, 0x8a7f55, 1).strokeRect(0, 0, bw, 10);

    const ev = [];
    if (c.fires.size) ev.push(`🔥 ${c.fires.size} tiles burning`);
    if (c.drought > 0) ev.push(`☀️ Drought ${Math.ceil(c.drought)}s`);
    if (c.seaStage) ev.push(`🌊 Sea risen ×${c.seaStage}`);
    if (!ev.length) ev.push(t < 1 ? 'Climate stable' : 'Disasters are getting more likely…');
    const evText = ev.join('    ');
    if (this.climEvents.text !== evText) this.climEvents.setText(evText);
  }

  // ---------- Every frame ----------
  update(time, delta) {
    const w = this.world;
    const r = w.resources;

    const res = `🌾 Food ${Math.floor(r.food)}     🪵 Wood ${Math.floor(r.wood)}     🪨 Stone ${Math.floor(r.stone)}     ` +
      `🛢️ Fossil fuel ${Math.floor(r.fuel)}     ⚡ Clean energy ${Math.floor(r.clean)}          👥 ${w.popUsed}/${w.popCap}`;
    if (this.resText.text !== res) this.resText.setText(res);

    this.drawClimate();
    this.updateMessages(delta);

    const [title, detail] = this.panelText();
    if (this.selTitle.text !== title) this.selTitle.setText(title);
    if (this.selDetail.text !== detail) this.selDetail.setText(detail);

    // Red cost text on buttons you can't afford.
    for (const b of this.buttons) {
      if (!b.cost) continue;
      const col = w.canAfford(b.cost) ? '#c9c6ad' : '#e06666';
      if (b.costLabel.style.color !== col) b.costLabel.setColor(col);
    }

    // Minimap: buildings, units, fires, alerts and the camera view box.
    const g = this.mmDots;
    g.clear();
    for (const b of w.buildings) {
      g.fillStyle(TEAM_COLORS[b.team].main, b.complete ? 1 : 0.5);
      g.fillRect(b.tx * MM_SCALE, b.ty * MM_SCALE, b.w * MM_SCALE, b.h * MM_SCALE);
    }
    for (const u of w.units) {
      g.fillStyle(u.selected ? 0x7cfc00 : 0x9fc5ff, 1);
      g.fillRect((u.x / TILE) * MM_SCALE - 1.5, (u.y / TILE) * MM_SCALE - 1.5, 3, 3);
    }
    g.fillStyle(0xff5722, 1);
    for (const f of w.climate.fires.values()) g.fillRect(f.x * MM_SCALE, f.y * MM_SCALE, MM_SCALE, MM_SCALE);
    for (const p of this.pings) {
      p.t -= delta;
      const r2 = 4 + ((3000 - p.t) / 120) % 10;
      g.lineStyle(2, 0xff5722, Math.max(0, p.t / 3000)).strokeCircle(p.x * MM_SCALE, p.y * MM_SCALE, r2);
    }
    this.pings = this.pings.filter((p) => p.t > 0);

    const v = w.cameras.main.worldView;
    const vx = Math.max(0, v.x);
    const vy = Math.max(0, v.y);
    const vw = Math.min(MAP_W * TILE - vx, v.width);
    const vh = Math.min(MAP_H * TILE - vy, v.height);
    g.lineStyle(1, 0xffffff, 0.9);
    g.strokeRect((vx / TILE) * MM_SCALE, (vy / TILE) * MM_SCALE, (vw / TILE) * MM_SCALE, (vh / TILE) * MM_SCALE);
  }
}
