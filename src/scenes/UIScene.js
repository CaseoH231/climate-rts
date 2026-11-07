// On-screen interface: resource bar, selection panel with command buttons, minimap and messages.
import { TILE, MAP_W, MAP_H, TERRAIN, TERRAIN_INFO, TEAM_COLORS } from '../config.js';
import { BUILDING_TYPES, WORKER_BUILDS } from '../buildings.js';
import { UNIT_TYPES } from '../unit.js';

const BAR_H = 34;
const PANEL_H = 122;
const MM_SCALE = 3;
const MM_PAD = 10;
const BTN_W = 148;
const BTN_H = 44;
const FONT = 'Segoe UI, Arial, sans-serif';
const RES_ICON = { food: '🌾', wood: '🪵', stone: '🪨', fuel: '🛢️', clean: '⚡' };

function costText(cost) {
  const parts = Object.entries(cost).map(([k, v]) => `${RES_ICON[k]} ${v}`);
  return parts.length ? parts.join('  ') : 'free';
}

export default class UIScene extends Phaser.Scene {
  constructor() {
    super('UIScene');
  }

  create() {
    this.world = this.scene.get('GameScene');
    this.temperature = 0; // hooked up in the climate phase

    // Top bar
    this.bar = this.add.rectangle(0, 0, 10, BAR_H, 0x1b1f17, 0.92).setOrigin(0);
    this.resText = this.add.text(12, 8, '', { fontFamily: FONT, fontSize: '16px', color: '#f3f0d7' });
    this.tempText = this.add.text(0, 8, '', { fontFamily: FONT, fontSize: '16px', color: '#ffb366' }).setOrigin(1, 0);

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
    this.mmPatch = this.add.graphics(); // grass painted over used-up resources
    this.mmDots = this.add.graphics();

    // Pop-up messages
    this.toastText = this.add.text(0, BAR_H + 16, '', {
      fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#ffe599', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5, 0).setAlpha(0);

    this.sel = { units: [], building: null };
    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));

    this.world.events.on('selection', this.onSelection, this);
    this.world.events.on('toast', this.showToast, this);
    this.world.events.on('tileChanged', this.onTileChanged, this);
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
    this.tempText.setPosition(w - 12, 8);
    this.panel.setPosition(0, h - PANEL_H).setSize(w, PANEL_H);
    this.selTitle.setPosition(16, h - PANEL_H + 10);
    this.selDetail.setPosition(16, h - PANEL_H + 38);
    this.selDetail.setWordWrapWidth(Math.max(200, w - this.mmW - 60));
    this.toastText.setX(w / 2);

    const mx = w - this.mmW - MM_PAD;
    const my = h - this.mmH - MM_PAD;
    this.mmFrame.setPosition(mx - 4, my - 4);
    this.mmImage.setPosition(mx, my);
    this.mmPatch.setPosition(mx, my);
    this.mmDots.setPosition(mx, my);
    this.mmRect = new Phaser.Geom.Rectangle(mx, my, this.mmW, this.mmH);
    this.mmFrameRect = new Phaser.Geom.Rectangle(mx - 4, my - 4, this.mmW + 8, this.mmH + 8);

    this.buildButtons();
  }

  isPointerOverUI(p) {
    const h = this.scale.height;
    return p.y < BAR_H || p.y > h - PANEL_H || Phaser.Geom.Rectangle.Contains(this.mmFrameRect, p.x, p.y);
  }

  minimapToWorld(p) {
    return {
      x: ((p.x - this.mmRect.x) / MM_SCALE) * TILE,
      y: ((p.y - this.mmRect.y) / MM_SCALE) * TILE,
    };
  }

  onTileChanged(x, y) {
    this.mmPatch.fillStyle(TERRAIN_INFO[TERRAIN.GRASS].minimap, 1);
    this.mmPatch.fillRect(x * MM_SCALE, y * MM_SCALE, MM_SCALE, MM_SCALE);
  }

  showToast(msg) {
    this.tweens.killTweensOf(this.toastText);
    this.toastText.setText(msg).setAlpha(1);
    this.tweens.add({ targets: this.toastText, alpha: 0, delay: 1800, duration: 500 });
  }

  // ---------- Selection panel ----------
  onSelection(sel) {
    this.sel = sel;
    this.buildButtons();
  }

  commandList() {
    const { units, building } = this.sel;
    if (building) {
      if (!building.complete || !building.def.trains) return [];
      return building.def.trains.map((type) => {
        const u = UNIT_TYPES[type];
        return { label: `${u.icon} ${u.name}`, cost: u.cost, action: () => this.world.train(type) };
      });
    }
    if (units.some((u) => u.type === 'worker')) {
      return WORKER_BUILDS.map((type) => {
        const d = BUILDING_TYPES[type];
        return { label: `${d.icon} ${d.name}`, cost: d.cost, action: () => this.world.startPlacing(type) };
      });
    }
    if (!units.length) {
      return [{ label: '👷 Idle worker', cost: null, sub: 'Key: .', action: () => this.world.selectIdleWorker() }];
    }
    return [];
  }

  buildButtons() {
    for (const b of this.buttons) b.container.destroy();
    this.buttons = [];
    const h = this.scale.height;
    const y = h - PANEL_H + 68;
    this.commandList().forEach((cmd, i) => {
      const x = 16 + i * (BTN_W + 8);
      const c = this.add.container(x, y);
      const bg = this.add.rectangle(0, 0, BTN_W, BTN_H, 0x2d3324).setOrigin(0).setStrokeStyle(1, 0x8a7f55);
      const key = this.add.text(BTN_W - 8, 4, `${i + 1}`, { fontFamily: FONT, fontSize: '11px', color: '#8a7f55' }).setOrigin(1, 0);
      const t1 = this.add.text(8, 4, cmd.label, { fontFamily: FONT, fontSize: '14px', color: '#f3f0d7' });
      const t2 = this.add.text(8, 24, cmd.sub || costText(cmd.cost), { fontFamily: FONT, fontSize: '12px', color: '#c9c6ad' });
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
    if (b) {
      let title = `${b.def.icon} ${b.def.name}`;
      if (!b.complete) title += ` — under construction ${Math.floor(b.progress * 100)}%`;
      const parts = [`HP ${b.hp}/${b.maxHp}`];
      if (b.type === 'farm') parts.push(`Food left: ${Math.ceil(b.food)}`, b.farmer ? 'Being farmed' : 'No farmer — right-click it with a worker');
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
        'Click / drag to select  •  Right-click to move, or on trees/stone/berries to gather  •  ' +
        'Workers: 1–4 to build  •  . = idle worker  •  H = home  •  WASD / edge to pan  •  Wheel to zoom'];
    }
    if (units.length === 1) {
      const u = units[0];
      let status = `HP ${u.hp}/${u.maxHp}   •   ${u.statusText}`;
      if (u.carry >= 1) status += `   •   carrying ${Math.floor(u.carry)} ${u.carryType}`;
      if (u.type === 'worker') status += '   •   right-click resources to gather, or pick a building below';
      return [`${u.def.icon} ${u.name}`, status];
    }
    const counts = {};
    for (const u of units) counts[u.statusText] = (counts[u.statusText] || 0) + 1;
    const status = Object.entries(counts).map(([s, c]) => `${c} ${s}`).join('   •   ');
    return [`${units.length} units selected`, status];
  }

  // ---------- Every frame ----------
  update() {
    const w = this.world;
    const r = w.resources;

    const res = `🌾 Food ${Math.floor(r.food)}     🪵 Wood ${Math.floor(r.wood)}     🪨 Stone ${Math.floor(r.stone)}     ` +
      `🛢️ Fuel ${Math.floor(r.fuel)}     ⚡ Clean energy ${Math.floor(r.clean)}          👥 ${w.popUsed}/${w.popCap}`;
    if (this.resText.text !== res) this.resText.setText(res);
    const temp = `🌡️ Global temp +${this.temperature.toFixed(1)}°C`;
    if (this.tempText.text !== temp) this.tempText.setText(temp);

    const [title, detail] = this.panelText();
    if (this.selTitle.text !== title) this.selTitle.setText(title);
    if (this.selDetail.text !== detail) this.selDetail.setText(detail);

    // Grey out buttons you can't afford.
    for (const b of this.buttons) {
      if (!b.cost) continue;
      const col = w.canAfford(b.cost) ? '#c9c6ad' : '#e06666';
      if (b.costLabel.style.color !== col) b.costLabel.setColor(col);
    }

    // Minimap: buildings, units and the camera view box.
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
    const v = w.cameras.main.worldView;
    const vx = Math.max(0, v.x);
    const vy = Math.max(0, v.y);
    const vw = Math.min(MAP_W * TILE - vx, v.width);
    const vh = Math.min(MAP_H * TILE - vy, v.height);
    g.lineStyle(1, 0xffffff, 0.9);
    g.strokeRect((vx / TILE) * MM_SCALE, (vy / TILE) * MM_SCALE, (vw / TILE) * MM_SCALE, (vh / TILE) * MM_SCALE);
  }
}
