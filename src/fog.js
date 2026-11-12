// Fog of war: black where you've never been, dimmed where you've been but can't currently see.
// Enemy units are hidden unless one of your units or buildings can see them.
import { TILE, MAP_W, MAP_H } from './config.js';
import { ISO_W, ISO_H, toIso, fromIso } from './iso.js';

const K = 4; // the fog is drawn at 1/K size and stretched, which gives it soft edges

// Send just one patch of a canvas texture to the graphics card (a full refresh re-sends all of it).
export function uploadPatch(scene, tex, x, y, w, h) {
  const gl = scene.game && scene.game.renderer && scene.game.renderer.gl;
  const src = tex.getSourceImage();
  if (!gl || w * h > src.width * src.height * 0.5) { tex.refresh(); return; }
  try {
    const scratch = uploadPatch.scratch || (uploadPatch.scratch = document.createElement('canvas'));
    scratch.width = w; // (resizing also clears it)
    scratch.height = h;
    scratch.getContext('2d').drawImage(src, x, y, w, h, 0, 0, w, h);
    const wrapper = tex.source[0].glTexture;
    gl.bindTexture(gl.TEXTURE_2D, wrapper.webGLTexture || wrapper);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, scratch);
    gl.bindTexture(gl.TEXTURE_2D, null);
  } catch (e) {
    tex.refresh();
  }
}

// How far each thing can see, in tiles.
export const SIGHT = {
  worker: 4, soldier: 6, archer: 7, rifleman: 7, armoured_car: 7, scout: 9, medic: 5, cannon: 6, e_tank: 7,
  town_centre: 8, tower: 9, barracks: 5, radar: 20, default: 4,
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
      if (!w.isAlly(u.team, w.me) || u.dead) continue;
      this.reveal(Math.floor(u.x / TILE), Math.floor(u.y / TILE), SIGHT[u.type] || SIGHT.default);
    }
    for (const b of w.buildings) {
      if (!w.isAlly(b.team, w.me)) continue;
      this.reveal(Math.floor(b.cx / TILE), Math.floor(b.cy / TILE), (SIGHT[b.type] || SIGHT.default) + Math.floor(b.w / 2));
    }
  }

  update(dt) {
    if (!this.enabled) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 300;
    this.recompute();
    // Only redraw the part of the fog picture where what you can see actually changed
    // (units moving only ever change it in small patches).
    const n = this.visible.length;
    if (!this.lastVisible || this.lastVisible.length !== n) {
      this.lastVisible = new Uint8Array(n);
      this.lastExplored = new Uint8Array(n);
      this.lastVisible.set(this.visible);
      this.lastExplored.set(this.explored);
      this.draw();
    } else {
      let x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
      for (let i = 0; i < n; i++) {
        if (this.visible[i] !== this.lastVisible[i] || this.explored[i] !== this.lastExplored[i]) {
          const tx = i % this.w, ty = (i / this.w) | 0;
          if (tx < x0) x0 = tx; if (tx > x1) x1 = tx;
          if (ty < y0) y0 = ty; if (ty > y1) y1 = ty;
        }
      }
      if (x1 >= 0) {
        this.lastVisible.set(this.visible);
        this.lastExplored.set(this.explored);
        this.draw(x0, y0, x1, y1);
      }
    }
    this.applyVisibility();
  }

  // Hide enemy units you can't see, and enemy buildings you haven't discovered.
  applyVisibility() {
    const w = this.world;
    for (const u of w.units) {
      if (w.isAlly(u.team, w.me)) continue;
      u.container.setVisible(this.visibleAt(u.x, u.y));
    }
    for (const b of w.buildings) {
      if (w.isAlly(b.team, w.me)) continue;
      b.container.setVisible(this.isExplored(Math.floor(b.cx / TILE), Math.floor(b.cy / TILE)));
    }
  }

  // Redraw the fog picture: all of it, or just the tiles x0..x1, y0..y1 that changed (plus a margin).
  draw(x0 = 0, y0 = 0, x1 = this.w - 1, y1 = this.h - 1) {
    this.version++;
    if (!this.ctx) return;
    const full = x0 === 0 && y0 === 0 && x1 === this.w - 1 && y1 === this.h - 1;
    // the changed patch in fog-canvas pixels (corners of the tile box, padded for the diamonds and the blur)
    const W = this.scratch.width, H = this.scratch.height;
    let rx = 0, ry = 0, rw = W, rh = H;
    if (!full) {
      const pts = [toIso(x0 * TILE, y0 * TILE), toIso((x1 + 1) * TILE, y0 * TILE), toIso((x1 + 1) * TILE, (y1 + 1) * TILE), toIso(x0 * TILE, (y1 + 1) * TILE)];
      const PAD = TILE / K + 6;
      rx = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.x)) / K - PAD));
      ry = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.y)) / K - PAD));
      rw = Math.min(W, Math.ceil(Math.max(...pts.map((p) => p.x)) / K + PAD)) - rx;
      rh = Math.min(H, Math.ceil(Math.max(...pts.map((p) => p.y)) / K + PAD)) - ry;
      if (rw <= 0 || rh <= 0) return;
    }
    // Two solid layers: everything you can't see now, and everything never explored
    // (each drawn as one batched shape, not one diamond at a time).
    const hidden = this.scratch.getContext('2d');
    const unknown = this.scratch2.getContext('2d');
    hidden.clearRect(rx, ry, rw, rh);
    unknown.clearRect(rx, ry, rw, rh);
    hidden.fillStyle = '#000';
    unknown.fillStyle = '#000';
    const hw = (TILE / K) * 1.15; // tile diamond half-size on the fog canvas (a bit bigger to avoid gaps)
    const hh = hw / 2;
    for (const g of [hidden, unknown]) { g.save(); g.beginPath(); g.rect(rx, ry, rw, rh); g.clip(); g.beginPath(); }
    // every tile whose diamond overlaps the patch (in this view a rectangle takes in tiles well outside the
    // changed box, towards its corners)
    let tx0 = 0, ty0 = 0, tx1 = this.w - 1, ty1 = this.h - 1;
    if (!full) {
      const cs = [[rx, ry], [rx + rw, ry], [rx + rw, ry + rh], [rx, ry + rh]].map(([px, py]) => fromIso(px * K, py * K));
      tx0 = Math.max(0, Math.floor(Math.min(...cs.map((c) => c.x)) / TILE) - 2);
      tx1 = Math.min(this.w - 1, Math.ceil(Math.max(...cs.map((c) => c.x)) / TILE) + 2);
      ty0 = Math.max(0, Math.floor(Math.min(...cs.map((c) => c.y)) / TILE) - 2);
      ty1 = Math.min(this.h - 1, Math.ceil(Math.max(...cs.map((c) => c.y)) / TILE) + 2);
    }
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const i = ty * this.w + tx;
        if (this.visible[i]) continue;
        const c = toIso(tx * TILE + TILE / 2, ty * TILE + TILE / 2);
        const x = c.x / K;
        const y = c.y / K;
        for (const g of this.explored[i] ? [hidden] : [hidden, unknown]) {
          g.moveTo(x, y - hh);
          g.lineTo(x + hw, y);
          g.lineTo(x, y + hh);
          g.lineTo(x - hw, y);
          g.closePath();
        }
      }
    }
    for (const g of [hidden, unknown]) { g.fill(); g.restore(); }
    // Combine with soft edges: explored-but-hidden = half dark, unexplored = black.
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath(); ctx.rect(rx, ry, rw, rh); ctx.clip();
    ctx.clearRect(rx, ry, rw, rh);
    ctx.filter = 'blur(2px)';
    ctx.globalAlpha = 0.5;
    ctx.drawImage(this.scratch, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.scratch2, 0, 0);
    ctx.filter = 'none';
    ctx.restore();
    if (full) this.tex.refresh();
    else uploadPatch(this.world, this.tex, rx, ry, rw, rh);
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
