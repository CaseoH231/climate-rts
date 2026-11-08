// Fog of war: black where you've never been, dimmed where you've been but can't currently see.
// Enemy units are hidden unless one of your units or buildings can see them.
import { TILE, MAP_W, MAP_H } from './config.js';
import { ISO_W, ISO_H, toIso } from './iso.js';

const K = 4; // the fog is drawn at 1/K size and stretched, which gives it soft edges

// How far each thing can see, in tiles.
export const SIGHT = {
  worker: 4, soldier: 6, archer: 7, rifleman: 7, armoured_car: 7,
  town_centre: 8, tower: 9, barracks: 5, default: 4,
};

export class Fog {
  constructor(world, enabled = true, explored = null) {
    this.world = world;
    this.enabled = enabled;
    this.w = MAP_W;
    this.h = MAP_H;
    this.explored = new Uint8Array(this.w * this.h);
    if (explored) for (let i = 0; i < explored.length; i++) this.explored[i] = explored.charCodeAt(i) === 49 ? 1 : 0;
    this.visible = new Uint8Array(this.w * this.h);
    this.timer = 0;
    this.version = 0;
    if (!enabled) {
      this.visible.fill(1);
      this.explored.fill(1);
    }
    // Only create graphics inside a real Phaser scene.
    if (enabled && world.textures && world.textures.createCanvas) {
      if (world.textures.exists('fog')) world.textures.remove('fog');
      this.tex = world.textures.createCanvas('fog', ISO_W / K, ISO_H / K);
      this.ctx = this.tex.getContext();
      this.scratch = document.createElement('canvas');
      this.scratch.width = ISO_W / K;
      this.scratch.height = ISO_H / K;
      this.scratch2 = document.createElement('canvas');
      this.scratch2.width = ISO_W / K;
      this.scratch2.height = ISO_H / K;
      this.image = world.add.image(0, 0, 'fog').setOrigin(0).setScale(K).setDepth(1e6 - 5);
    }
    this.recompute();
    this.draw();
  }

  isVisible(tx, ty) {
    return !this.enabled || this.visible[ty * this.w + tx] === 1;
  }

  isExplored(tx, ty) {
    return !this.enabled || this.explored[ty * this.w + tx] === 1;
  }

  // Grid pixel position
  visibleAt(x, y) {
    if (!this.enabled) return true;
    const tx = Math.max(0, Math.min(this.w - 1, Math.floor(x / TILE)));
    const ty = Math.max(0, Math.min(this.h - 1, Math.floor(y / TILE)));
    return this.isVisible(tx, ty);
  }

  reveal(cx, cy, r) {
    const r2 = r * r + r;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
        const i = y * this.w + x;
        this.visible[i] = 1;
        this.explored[i] = 1;
      }
    }
  }

  recompute() {
    if (!this.enabled) return;
    this.visible.fill(0);
    const w = this.world;
    for (const u of w.units) {
      if (u.team !== 'player' || u.dead) continue;
      this.reveal(Math.floor(u.x / TILE), Math.floor(u.y / TILE), SIGHT[u.type] || SIGHT.default);
    }
    for (const b of w.buildings) {
      if (b.team !== 'player') continue;
      this.reveal(Math.floor(b.cx / TILE), Math.floor(b.cy / TILE), (SIGHT[b.type] || SIGHT.default) + Math.floor(b.w / 2));
    }
  }

  update(dt) {
    if (!this.enabled) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 300;
    this.recompute();
    this.draw();
    this.applyVisibility();
  }

  // Hide enemy units you can't see, and enemy buildings you haven't discovered.
  applyVisibility() {
    const w = this.world;
    for (const u of w.units) {
      if (u.team === 'player') continue;
      u.container.setVisible(this.visibleAt(u.x, u.y));
    }
    for (const b of w.buildings) {
      if (b.team === 'player') continue;
      b.container.setVisible(this.isExplored(Math.floor(b.cx / TILE), Math.floor(b.cy / TILE)));
    }
  }

  draw() {
    this.version++;
    if (!this.ctx) return;
    // Two solid layers: everything you can't see now, and everything never explored.
    const hidden = this.scratch.getContext('2d');
    const unknown = this.scratch2.getContext('2d');
    hidden.clearRect(0, 0, this.scratch.width, this.scratch.height);
    unknown.clearRect(0, 0, this.scratch.width, this.scratch.height);
    hidden.fillStyle = '#000';
    unknown.fillStyle = '#000';
    const hw = (TILE / K) * 1.15; // tile diamond half-size on the fog canvas (a bit bigger to avoid gaps)
    const hh = hw / 2;
    for (let ty = 0; ty < this.h; ty++) {
      for (let tx = 0; tx < this.w; tx++) {
        const i = ty * this.w + tx;
        if (this.visible[i]) continue;
        const c = toIso(tx * TILE + TILE / 2, ty * TILE + TILE / 2);
        const x = c.x / K;
        const y = c.y / K;
        for (const g of this.explored[i] ? [hidden] : [hidden, unknown]) {
          g.beginPath();
          g.moveTo(x, y - hh);
          g.lineTo(x + hw, y);
          g.lineTo(x, y + hh);
          g.lineTo(x - hw, y);
          g.closePath();
          g.fill();
        }
      }
    }
    // Combine with soft edges: explored-but-hidden = half dark, unexplored = black.
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.scratch.width, this.scratch.height);
    ctx.filter = 'blur(2px)';
    ctx.globalAlpha = 0.5;
    ctx.drawImage(this.scratch, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.scratch2, 0, 0);
    ctx.filter = 'none';
    this.tex.refresh();
  }

  // For save files: explored tiles as a string of 0s and 1s.
  serialize() {
    let s = '';
    for (let i = 0; i < this.explored.length; i++) s += this.explored[i] ? '1' : '0';
    return { enabled: this.enabled, explored: s };
  }

  get canvas() {
    return this.tex ? this.tex.getSourceImage() : null;
  }
}
