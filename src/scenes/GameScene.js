// The main game world: map, units, camera and mouse/keyboard controls.
import { TILE, MAP_W, MAP_H, MAP_SEED, PLAYER_START } from '../config.js';
import { GameMap } from '../map.js';
import { Unit } from '../unit.js';

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create() {
    // --- Map ---
    this.map = new GameMap(MAP_W, MAP_H, MAP_SEED);
    this.map.createTexture(this, 'terrain');
    this.add.image(0, 0, 'terrain').setOrigin(0).setDepth(-1);

    // --- Camera ---
    const cam = this.cameras.main;
    cam.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);
    this.home = this.map.tileCenter(PLAYER_START.x, PLAYER_START.y);
    cam.centerOn(this.home.x, this.home.y);

    // --- Starting units ---
    this.units = [];
    const types = ['worker', 'worker', 'worker', 'worker', 'soldier', 'soldier', 'soldier'];
    const spots = this.map.tilesAround(PLAYER_START.x, PLAYER_START.y, types.length);
    types.forEach((type, i) => {
      this.units.push(new Unit(this, this.map, spots[i].x, spots[i].y, type));
    });

    // --- Selection ---
    this.selected = new Set();
    this.drag = null;
    this.selBox = this.add.graphics().setDepth(1e6);

    // --- Input ---
    this.input.mouse.disableContextMenu();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT,ESC,H');
    this.keys.ESC.on('down', () => this.clearSelection());
    this.keys.H.on('down', () => cam.pan(this.home.x, this.home.y, 300, 'Sine.easeInOut'));

    this.pointerInGame = true;
    this.input.on('gameout', () => { this.pointerInGame = false; });
    this.input.on('gameover', () => { this.pointerInGame = true; });

    this.input.on('wheel', (pointer, objs, dx, dy) => {
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.5, 2));
    });

    this.input.on('pointerdown', (p) => {
      if (this.overUI(p)) return;
      if (p.rightButtonDown()) {
        this.commandMove(p.worldX, p.worldY);
      } else if (p.leftButtonDown()) {
        this.drag = { x: p.worldX, y: p.worldY, sx: p.x, sy: p.y, active: false };
      }
    });

    this.input.on('pointermove', (p) => {
      if (!this.drag) return;
      if (!this.drag.active && Phaser.Math.Distance.Between(p.x, p.y, this.drag.sx, this.drag.sy) > 6) {
        this.drag.active = true;
      }
      if (this.drag.active) this.drawSelBox(p);
    });

    this.input.on('pointerup', (p) => {
      if (!this.drag || p.button !== 0) return;
      const additive = this.keys.SHIFT.isDown;
      if (this.drag.active) {
        const r = this.dragRect(p);
        this.selectWhere((u) => Phaser.Geom.Rectangle.Contains(r, u.x, u.y), additive);
      } else {
        const u = this.unitAt(p.worldX, p.worldY);
        if (u && additive && this.selected.has(u)) this.deselect(u);
        else if (u) this.selectWhere((x) => x === u, additive);
        else if (!additive) this.clearSelection();
      }
      this.drag = null;
      this.selBox.clear();
    });

    // UI (top bar, info panel, minimap) runs as its own scene on top.
    this.scene.launch('UIScene');
  }

  overUI(p) {
    const ui = this.scene.get('UIScene');
    return !!(ui && ui.isPointerOverUI && ui.isPointerOverUI(p));
  }

  // ---------- Selection ----------
  dragRect(p) {
    const x = Math.min(this.drag.x, p.worldX);
    const y = Math.min(this.drag.y, p.worldY);
    return new Phaser.Geom.Rectangle(x, y, Math.abs(p.worldX - this.drag.x), Math.abs(p.worldY - this.drag.y));
  }

  drawSelBox(p) {
    const r = this.dragRect(p);
    const z = this.cameras.main.zoom;
    this.selBox.clear();
    this.selBox.fillStyle(0x7cfc00, 0.12).fillRect(r.x, r.y, r.width, r.height);
    this.selBox.lineStyle(2 / z, 0x7cfc00, 1).strokeRect(r.x, r.y, r.width, r.height);
  }

  unitAt(wx, wy) {
    let best = null;
    let bestD = 16;
    for (const u of this.units) {
      const d = Phaser.Math.Distance.Between(wx, wy, u.x, u.y);
      if (d < bestD) { bestD = d; best = u; }
    }
    return best;
  }

  selectWhere(pred, additive) {
    if (!additive) this.clearSelection(true);
    for (const u of this.units) {
      if (u.team === 'player' && pred(u)) {
        this.selected.add(u);
        u.setSelected(true);
      }
    }
    this.emitSelection();
  }

  deselect(u) {
    this.selected.delete(u);
    u.setSelected(false);
    this.emitSelection();
  }

  clearSelection(silent = false) {
    for (const u of this.selected) u.setSelected(false);
    this.selected.clear();
    if (!silent) this.emitSelection();
  }

  emitSelection() {
    this.events.emit('selection', [...this.selected]);
  }

  // ---------- Orders ----------
  commandMove(wx, wy) {
    if (!this.selected.size) return;
    const t = this.map.worldToTile(wx, wy);
    const goals = this.map.tilesAround(t.x, t.y, this.selected.size);
    if (!goals.length) return;

    // Closest units take the closest spots so the group doesn't cross over itself.
    const units = [...this.selected].sort(
      (a, b) => Phaser.Math.Distance.Between(a.x, a.y, wx, wy) - Phaser.Math.Distance.Between(b.x, b.y, wx, wy)
    );
    units.forEach((u, i) => u.moveTo(goals[Math.min(i, goals.length - 1)]));
    this.showMoveMarker(wx, wy);
  }

  showMoveMarker(wx, wy) {
    const m = this.add.circle(wx, wy, 12).setStrokeStyle(2, 0xffffff).setDepth(1e6);
    this.tweens.add({ targets: m, scale: 0.2, alpha: 0, duration: 450, onComplete: () => m.destroy() });
  }

  // ---------- Every frame ----------
  update(time, delta) {
    const cam = this.cameras.main;
    const k = this.keys;
    const speed = (700 * delta) / 1000 / cam.zoom;
    let dx = 0;
    let dy = 0;
    if (k.A.isDown || k.LEFT.isDown) dx -= 1;
    if (k.D.isDown || k.RIGHT.isDown) dx += 1;
    if (k.W.isDown || k.UP.isDown) dy -= 1;
    if (k.S.isDown || k.DOWN.isDown) dy += 1;

    // Scroll when the mouse is at the edge of the screen.
    const p = this.input.activePointer;
    const edge = 12;
    if (this.pointerInGame && !this.drag) {
      if (p.x < edge) dx -= 1;
      else if (p.x > this.scale.width - edge) dx += 1;
      if (p.y < edge) dy -= 1;
      else if (p.y > this.scale.height - edge) dy += 1;
    }
    cam.scrollX += Math.sign(dx) * speed;
    cam.scrollY += Math.sign(dy) * speed;

    for (const u of this.units) u.update(delta);
  }
}
