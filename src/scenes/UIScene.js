// On-screen interface: resource bar, selection panel and minimap.
import { TILE, MAP_W, MAP_H } from '../config.js';

const BAR_H = 34;
const PANEL_H = 84;
const MM_SCALE = 3;
const MM_PAD = 10;
const FONT = 'Segoe UI, Arial, sans-serif';

export default class UIScene extends Phaser.Scene {
  constructor() {
    super('UIScene');
  }

  create() {
    this.world = this.scene.get('GameScene');

    // Placeholder numbers — the economy gets hooked up in the next phase.
    this.resources = { food: 200, wood: 200, stone: 100, fuel: 0, clean: 0 };
    this.temperature = 0;

    // Top bar
    this.bar = this.add.rectangle(0, 0, 10, BAR_H, 0x1b1f17, 0.92).setOrigin(0);
    this.resText = this.add.text(12, 8, '', { fontFamily: FONT, fontSize: '16px', color: '#f3f0d7' });
    this.tempText = this.add.text(0, 8, '', { fontFamily: FONT, fontSize: '16px', color: '#ffb366' }).setOrigin(1, 0);

    // Bottom panel
    this.panel = this.add.rectangle(0, 0, 10, PANEL_H, 0x1b1f17, 0.92).setOrigin(0);
    this.selTitle = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#f3f0d7' });
    this.selDetail = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '14px', color: '#c9c6ad' });

    // Minimap
    this.mmW = MAP_W * MM_SCALE;
    this.mmH = MAP_H * MM_SCALE;
    this.world.map.createMinimapTexture(this, 'minimap', MM_SCALE);
    this.mmFrame = this.add.rectangle(0, 0, this.mmW + 8, this.mmH + 8, 0x0d0f0b).setOrigin(0).setStrokeStyle(2, 0x8a7f55);
    this.mmImage = this.add.image(0, 0, 'minimap').setOrigin(0);
    this.mmDots = this.add.graphics();

    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));

    this.world.events.on('selection', this.onSelection, this);
    this.onSelection([]);
    this.refreshTopBar();

    // Minimap clicks: left = jump camera, right = send selected units there.
    this.mmDragging = false;
    this.input.on('pointerdown', (p) => {
      if (!Phaser.Geom.Rectangle.Contains(this.mmRect, p.x, p.y)) return;
      const w = this.minimapToWorld(p);
      if (p.rightButtonDown()) {
        this.world.commandMove(w.x, w.y);
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
    this.selTitle.setPosition(16, h - PANEL_H + 12);
    this.selDetail.setPosition(16, h - PANEL_H + 42);
    this.selDetail.setWordWrapWidth(Math.max(200, w - this.mmW - 60));

    const mx = w - this.mmW - MM_PAD;
    const my = h - this.mmH - MM_PAD;
    this.mmFrame.setPosition(mx - 4, my - 4);
    this.mmImage.setPosition(mx, my);
    this.mmRect = new Phaser.Geom.Rectangle(mx, my, this.mmW, this.mmH);
    this.mmFrameRect = new Phaser.Geom.Rectangle(mx - 4, my - 4, this.mmW + 8, this.mmH + 8);
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

  refreshTopBar() {
    const r = this.resources;
    this.resText.setText(
      `🌾 Food ${r.food}     🪵 Wood ${r.wood}     🪨 Stone ${r.stone}     🛢️ Fuel ${r.fuel}     ⚡ Clean energy ${r.clean}`
    );
    const sign = this.temperature >= 0 ? '+' : '';
    this.tempText.setText(`🌡️ Global temp ${sign}${this.temperature.toFixed(1)}°C`);
  }

  onSelection(units) {
    if (!units.length) {
      this.selTitle.setText('Nothing selected');
      this.selDetail.setText(
        'Left-click or drag a box to select  •  Shift = add to selection  •  Right-click to move  •  ' +
        'WASD / arrows / screen edge to pan  •  Mouse wheel to zoom  •  H = home  •  Esc = deselect'
      );
      return;
    }
    const counts = {};
    for (const u of units) counts[u.name] = (counts[u.name] || 0) + 1;
    this.selTitle.setText(units.length === 1 ? units[0].name : `${units.length} units selected`);
    this.selDetail.setText(
      Object.entries(counts).map(([n, c]) => `${c} × ${n}`).join('     ') + '     —  right-click the map to move'
    );
  }

  update() {
    // Unit dots + camera view box on the minimap.
    const g = this.mmDots;
    const mx = this.mmRect.x;
    const my = this.mmRect.y;
    g.clear();
    for (const u of this.world.units) {
      g.fillStyle(u.selected ? 0x7cfc00 : 0x5fa8ff, 1);
      g.fillRect(mx + (u.x / TILE) * MM_SCALE - 1.5, my + (u.y / TILE) * MM_SCALE - 1.5, 3, 3);
    }
    const v = this.world.cameras.main.worldView;
    const vx = Math.max(0, v.x);
    const vy = Math.max(0, v.y);
    const vw = Math.min(MAP_W * TILE - vx, v.width);
    const vh = Math.min(MAP_H * TILE - vy, v.height);
    g.lineStyle(1, 0xffffff, 0.9);
    g.strokeRect(mx + (vx / TILE) * MM_SCALE, my + (vy / TILE) * MM_SCALE, (vw / TILE) * MM_SCALE, (vh / TILE) * MM_SCALE);
  }
}
