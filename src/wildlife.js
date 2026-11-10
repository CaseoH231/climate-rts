import { UNIT_SPRITE_SCALE } from './art.js';
// Herds of deer that wander the map. They bolt away from people, and a hunted deer
// becomes a "Hunted deer" food tile that workers butcher quickly.

import { TILE, TERRAIN } from './config.js';
import { toIso } from './iso.js';

const WANDER_SPEED = 26;  // grid px per second
const FLEE_SPEED = 105;
const SCARE_DIST = 2.6 * TILE;

export class Wildlife {
  constructor(scene, map, saved) {
    this.scene = scene;
    this.map = map;
    this.deer = [];
    this.nextId = 1;
    if (saved) {
      for (const d of saved) this.add(d.x, d.y);
    } else {
      this.spawnHerds();
    }
  }

  // A herd within reach of each base, plus a few out in the wilds.
  spawnHerds() {
    const rng = mulberry(this.map.seed ^ 0x5eed);
    const spots = [];
    for (const base of this.map.starts) {
      const ax = base.x < this.map.w / 2 ? 1 : -1;
      const ay = base.y < this.map.h / 2 ? 1 : -1;
      spots.push({ x: base.x + ax * 9, y: base.y + ay * 3 });
    }
    const wilds = this.map.starts.length > 2 ? 8 : 5;
    for (let i = 0; i < wilds; i++) spots.push({ x: 8 + Math.floor(rng() * (this.map.w - 16)), y: 8 + Math.floor(rng() * (this.map.h - 16)) });
    for (const s of spots) {
      const c = this.map.nearestWalkable(s.x, s.y, 8);
      if (!c) continue;
      const n = 3 + Math.floor(rng() * 3);
      const tiles = this.map.tilesAround(c.x, c.y, n);
      for (const t of tiles) this.add(t.x * TILE + 16, t.y * TILE + 16);
    }
  }

  add(x, y) {
    const sprite = this.scene.add.image(0, 0, 'deer0').setOrigin(0.5, 0.88).setScale(UNIT_SPRITE_SCALE * 1.1);
    const d = { id: this.nextId++, x, y, tx: x, ty: y, wait: this.scene.rand() * 4, fleeing: 0, sprite, dead: false, phase: Math.random() * 1000 };
    this.place(d);
    this.deer.push(d);
    return d;
  }

  place(d) {
    const i = toIso(d.x, d.y);
    d.sprite.setPosition(i.x, i.y).setDepth(i.y);
  }

  tileOf(d) {
    return { x: Math.floor(d.x / TILE), y: Math.floor(d.y / TILE) };
  }

  // Can a deer walk in a straight line from its spot to (x, y)?
  clearLine(d, x, y) {
    const steps = Math.ceil(Math.hypot(x - d.x, y - d.y) / 12);
    for (let k = 1; k <= steps; k++) {
      const px = d.x + ((x - d.x) * k) / steps;
      const py = d.y + ((y - d.y) * k) / steps;
      if (!this.map.isWalkable(Math.floor(px / TILE), Math.floor(py / TILE))) return false;
    }
    return true;
  }

  update(dt, world) {
    const s = dt / 1000;
    for (const d of this.deer) {
      if (d.dead) continue;
      // anyone close by? run the other way
      d.scan = (d.scan || 0) - dt;
      if (d.scan <= 0) {
        d.scan = 300;
        let threat = null;
        let td = SCARE_DIST;
        for (const u of world.units) {
          const dist = Math.hypot(u.x - d.x, u.y - d.y);
          if (dist < td) { td = dist; threat = u; }
        }
        if (threat) {
          const ang = Math.atan2(d.y - threat.y, d.x - threat.x) + (world.rand() - 0.5) * 0.9;
          for (const len of [4, 3, 2]) {
            const nx = d.x + Math.cos(ang) * len * TILE;
            const ny = d.y + Math.sin(ang) * len * TILE;
            if (this.clearLine(d, nx, ny)) { d.tx = nx; d.ty = ny; d.fleeing = 1.6; break; }
          }
        }
      }
      d.fleeing = Math.max(0, d.fleeing - s);
      const dx = d.tx - d.x;
      const dy = d.ty - d.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1) {
        const v = (d.fleeing > 0 ? FLEE_SPEED : WANDER_SPEED) * s;
        const step = Math.min(dist, v);
        const nx = d.x + (dx / dist) * step;
        const ny = d.y + (dy / dist) * step;
        if (this.map.isWalkable(Math.floor(nx / TILE), Math.floor(ny / TILE))) { d.x = nx; d.y = ny; }
        else { d.tx = d.x; d.ty = d.y; }
        d.moving = true;
      } else {
        d.moving = false;
        d.wait -= s;
        if (d.wait <= 0) {
          d.wait = 3 + world.rand() * 6;
          const ang = world.rand() * Math.PI * 2;
          const len = (0.6 + world.rand() * 1.6) * TILE;
          const nx = d.x + Math.cos(ang) * len;
          const ny = d.y + Math.sin(ang) * len;
          if (this.clearLine(d, nx, ny)) { d.tx = nx; d.ty = ny; }
        }
      }
    }
  }

  // Per frame: move sprites, animate legs, hide deer in the fog.
  render(time, fog) {
    for (const d of this.deer) {
      if (d.dead) continue;
      this.place(d);
      const t = this.tileOf(d);
      d.sprite.setVisible(!fog || fog.isVisible(t.x, t.y));
      if (d.moving) d.sprite.setTexture(Math.floor((time + d.phase) / (d.fleeing > 0 ? 90 : 220)) % 2 ? 'deer1' : 'deer0');
      // face the way it's heading (screen left/right)
      const sx = (d.tx - d.ty) - (d.x - d.y);
      if (Math.abs(sx) > 1) d.sprite.setFlipX(sx < 0);
    }
  }

  byId(id) {
    return this.deer.find((d) => d.id === id && !d.dead) || null;
  }

  // Remember where every deer was before a tick, so they can be drawn smoothly in between.
  snapshot() {
    for (const d of this.deer) { d.ox = d.x; d.oy = d.y; }
  }

  interpolate(a) {
    for (const d of this.deer) {
      if (d.dead || d.ox === undefined) continue;
      const i = toIso(d.ox + (d.x - d.ox) * a, d.oy + (d.y - d.oy) * a);
      d.sprite.setPosition(i.x, i.y);
    }
  }

  // The deer drawn under an isometric point.
  at(ix, iy) {
    let best = null;
    let bestD = 16;
    for (const d of this.deer) {
      if (d.dead || !d.sprite.visible) continue;
      const dd = Math.hypot(ix - d.sprite.x, iy - (d.sprite.y - 6));
      if (dd < bestD) { bestD = dd; best = d; }
    }
    return best;
  }

  // A hunter caught it: it becomes a food tile. Returns that tile (or null).
  kill(d, world) {
    if (d.dead) return null;
    d.dead = true;
    d.sprite.destroy();
    this.deer = this.deer.filter((x) => x !== d);
    let t = this.tileOf(d);
    const free = (x, y) => this.map.get(x, y) === TERRAIN.GRASS && !this.map.buildingAt(x, y) && !world.unitsInRect(x, y, 1, 1);
    if (!free(t.x, t.y)) {
      const near = this.map.tilesAround(t.x, t.y, 12).find((c) => free(c.x, c.y));
      if (!near) return null;
      t = near;
    }
    this.map.setTerrain(t.x, t.y, TERRAIN.MEAT);
    return t;
  }

  serialize() {
    return this.deer.filter((d) => !d.dead).map((d) => ({ x: Math.round(d.x), y: Math.round(d.y) }));
  }

  destroy() {
    for (const d of this.deer) d.sprite.destroy();
    this.deer = [];
  }
}

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
