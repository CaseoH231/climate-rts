// Map generation, terrain lookups and drawing.
import { TILE, TERRAIN, TERRAIN_INFO, PLAYER_START } from './config.js';

// Small seeded random number generator, so the same seed always makes the same map.
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth random "blobs" used to place lakes, forests and stone.
function valueNoise(rng, w, h, cell) {
  const gw = Math.ceil(w / cell) + 2;
  const gh = Math.ceil(h / cell) + 2;
  const grid = new Float32Array(gw * gh);
  for (let i = 0; i < grid.length; i++) grid[i] = rng();
  const smooth = (t) => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;
  const g = (x, y) => grid[y * gw + x];
  return (x, y) => {
    const fx = x / cell;
    const fy = y / cell;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = smooth(fx - x0);
    const ty = smooth(fy - y0);
    return lerp(lerp(g(x0, y0), g(x0 + 1, y0), tx), lerp(g(x0, y0 + 1), g(x0 + 1, y0 + 1), tx), ty);
  };
}

// Repeatable "random" number per tile, used for decoration so it never flickers.
function hash(x, y, k = 0) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(k, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class GameMap {
  constructor(w, h, seed) {
    this.w = w;
    this.h = h;
    this.seed = seed;
    this.tiles = new Uint8Array(w * h);
    this.generate();
  }

  generate() {
    const rng = mulberry32(this.seed);
    const base = valueNoise(rng, this.w, this.h, 12);
    const detail = valueNoise(rng, this.w, this.h, 5);
    const forest = valueNoise(rng, this.w, this.h, 6);
    const stone = valueNoise(rng, this.w, this.h, 4);

    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const n = 0.65 * base(x, y) + 0.35 * detail(x, y);
        let t = TERRAIN.GRASS;
        if (n < 0.32) t = TERRAIN.WATER;
        else if (forest(x, y) > 0.67) t = TERRAIN.FOREST;
        else if (stone(x, y) > 0.84) t = TERRAIN.STONE;
        this.set(x, y, t);
      }
    }

    // Clear open land around the player's start so there's room to build.
    const s = PLAYER_START;
    this.fillCircle(s.x, s.y, 6, TERRAIN.GRASS);
    // Guarantee some wood and stone close to the base.
    this.fillCircle(s.x + 9, s.y, 2, TERRAIN.FOREST);
    this.fillCircle(s.x, s.y + 9, 1, TERRAIN.STONE);
  }

  fillCircle(cx, cy, r, t) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= r * r + r * 0.5 && this.inBounds(cx + dx, cy + dy)) {
          this.set(cx + dx, cy + dy, t);
        }
      }
    }
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  get(x, y) {
    return this.inBounds(x, y) ? this.tiles[y * this.w + x] : TERRAIN.WATER;
  }

  set(x, y, t) {
    this.tiles[y * this.w + x] = t;
  }

  isWalkable(x, y) {
    return this.inBounds(x, y) && TERRAIN_INFO[this.get(x, y)].walkable;
  }

  worldToTile(wx, wy) {
    return {
      x: Math.min(this.w - 1, Math.max(0, Math.floor(wx / TILE))),
      y: Math.min(this.h - 1, Math.max(0, Math.floor(wy / TILE))),
    };
  }

  tileCenter(x, y) {
    return { x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 };
  }

  // Closest walkable tile to (x, y), searching outward in rings.
  nearestWalkable(x, y, maxR = 15) {
    if (this.isWalkable(x, y)) return { x, y };
    for (let r = 1; r <= maxR; r++) {
      let best = null;
      let bestD = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (!this.isWalkable(x + dx, y + dy)) continue;
          const d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; best = { x: x + dx, y: y + dy }; }
        }
      }
      if (best) return best;
    }
    return null;
  }

  // n walkable tiles clustered around (x, y) — used so a group doesn't stack on one tile.
  tilesAround(x, y, n) {
    const start = this.nearestWalkable(x, y);
    if (!start) return [];
    const out = [];
    const seen = new Set([start.y * this.w + start.x]);
    const queue = [start];
    while (queue.length && out.length < n) {
      const t = queue.shift();
      out.push(t);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const nx = t.x + dx;
        const ny = t.y + dy;
        const key = ny * this.w + nx;
        if (!seen.has(key) && this.isWalkable(nx, ny)) {
          seen.add(key);
          queue.push({ x: nx, y: ny });
        }
      }
    }
    return out;
  }

  // Draws the whole map once into a texture (much faster than redrawing every frame).
  createTexture(scene, key) {
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const t = this.get(x, y);
        const info = TERRAIN_INFO[t];
        const px = x * TILE;
        const py = y * TILE;
        g.fillStyle(info.colors[Math.floor(hash(x, y) * info.colors.length)], 1);
        g.fillRect(px, py, TILE, TILE);

        if (t === TERRAIN.GRASS) {
          if (hash(x, y, 1) < 0.3) {
            g.fillStyle(0x5b9a40, 1);
            g.fillRect(px + 4 + hash(x, y, 2) * 22, py + 4 + hash(x, y, 3) * 22, 3, 3);
          }
          // Sandy edge where land meets water.
          if (this.get(x, y - 1) === TERRAIN.WATER) { g.fillStyle(0xd9c58f, 1); g.fillRect(px, py, TILE, 4); }
          if (this.get(x, y + 1) === TERRAIN.WATER) { g.fillStyle(0xd9c58f, 1); g.fillRect(px, py + TILE - 4, TILE, 4); }
          if (this.get(x - 1, y) === TERRAIN.WATER) { g.fillStyle(0xd9c58f, 1); g.fillRect(px, py, 4, TILE); }
          if (this.get(x + 1, y) === TERRAIN.WATER) { g.fillStyle(0xd9c58f, 1); g.fillRect(px + TILE - 4, py, 4, TILE); }
        } else if (t === TERRAIN.WATER) {
          if (hash(x, y, 1) < 0.35) {
            g.fillStyle(0x6fa8dc, 0.8);
            g.fillRect(px + 6 + hash(x, y, 2) * 10, py + 8 + hash(x, y, 3) * 16, 12, 2);
          }
        } else if (t === TERRAIN.FOREST) {
          g.fillStyle(0x4f7a30, 1);
          g.fillRect(px, py, TILE, TILE);
          for (let i = 0; i < 3; i++) {
            const tx = px + 8 + hash(x, y, i + 2) * 16;
            const ty = py + 8 + hash(x, y, i + 5) * 16;
            g.fillStyle(0x1f3d0f, 1); g.fillCircle(tx + 1, ty + 2, 7);
            g.fillStyle(0x2f5a17, 1); g.fillCircle(tx, ty, 7);
            g.fillStyle(0x45812a, 1); g.fillCircle(tx - 2, ty - 2, 3);
          }
        } else if (t === TERRAIN.STONE) {
          for (let i = 0; i < 2; i++) {
            const sx = px + 9 + hash(x, y, i + 2) * 14;
            const sy = py + 9 + hash(x, y, i + 5) * 14;
            g.fillStyle(0x4d4d4d, 1); g.fillCircle(sx + 1, sy + 2, 7);
            g.fillStyle(0x8e8e8e, 1); g.fillCircle(sx, sy, 7);
            g.fillStyle(0xbdbdbd, 1); g.fillCircle(sx - 2, sy - 2, 3);
          }
        }
      }
    }
    g.generateTexture(key, this.w * TILE, this.h * TILE);
    g.destroy();
  }

  // Small version of the map for the minimap.
  createMinimapTexture(scene, key, scale) {
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        g.fillStyle(TERRAIN_INFO[this.get(x, y)].minimap, 1);
        g.fillRect(x * scale, y * scale, scale, scale);
      }
    }
    g.generateTexture(key, this.w * scale, this.h * scale);
    g.destroy();
  }
}
