// Map generation, terrain/resource lookups and drawing.
import { TILE, TERRAIN, TERRAIN_INFO, TERRAIN_RESOURCE, RESOURCE_AMOUNT, PLAYER_START } from './config.js';

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

const NEIGHBOURS_8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];

export class GameMap {
  constructor(w, h, seed) {
    this.w = w;
    this.h = h;
    this.seed = seed;
    this.tiles = new Uint8Array(w * h);
    this.amount = new Float32Array(w * h);   // resource left in each tile
    this.blocked = new Uint8Array(w * h);    // 1 = a solid building stands here
    this.buildings = new Array(w * h).fill(null);
    this.elev = new Float32Array(w * h);     // land height — low land floods first when the sea rises
    this.seaLevel = 0.32;
    this.onTileChanged = null;               // called when a tile changes (used up, burnt, flooded…)
    this.generate();
  }

  generate() {
    const rng = mulberry32(this.seed);
    const base = valueNoise(rng, this.w, this.h, 12);
    const detail = valueNoise(rng, this.w, this.h, 5);
    const forest = valueNoise(rng, this.w, this.h, 6);
    const stone = valueNoise(rng, this.w, this.h, 4);
    const coal = valueNoise(rng, this.w, this.h, 5);

    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const n = 0.65 * base(x, y) + 0.35 * detail(x, y);
        this.elev[y * this.w + x] = n;
        let t = TERRAIN.GRASS;
        if (n < this.seaLevel) t = TERRAIN.WATER;
        else if (forest(x, y) > 0.67) t = TERRAIN.FOREST;
        else if (stone(x, y) > 0.84) t = TERRAIN.STONE;
        else if (coal(x, y) > 0.86) t = TERRAIN.COAL;
        this.set(x, y, t);
      }
    }

    // Scatter some berry bushes around the map.
    for (let i = 0; i < 10; i++) {
      const bx = Math.floor(rng() * this.w);
      const by = Math.floor(rng() * this.h);
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        if (this.get(bx + dx, by + dy) === TERRAIN.GRASS) this.set(bx + dx, by + dy, TERRAIN.BERRIES);
      }
    }

    // Clear open land around the player's start so there's room to build.
    const s = PLAYER_START;
    this.fillCircle(s.x, s.y, 6, TERRAIN.GRASS);
    // Keep the starting base on high ground so it doesn't flood straight away.
    for (let dy = -8; dy <= 8; dy++) {
      for (let dx = -8; dx <= 8; dx++) {
        if (this.inBounds(s.x + dx, s.y + dy)) {
          const i = (s.y + dy) * this.w + s.x + dx;
          this.elev[i] = Math.max(this.elev[i], 0.6);
        }
      }
    }
    // Guarantee wood, stone and berries close to the base.
    this.fillCircle(s.x + 9, s.y, 2, TERRAIN.FOREST);
    this.fillCircle(s.x, s.y + 9, 1, TERRAIN.STONE);
    this.fillCircle(s.x - 1, s.y - 9, 1, TERRAIN.COAL);
    for (const [dx, dy] of [[-4, 3], [-5, 3], [-4, 4], [-5, 4], [-3, 4]]) {
      this.set(s.x + dx, s.y + dy, TERRAIN.BERRIES);
    }

    // Fill resource tiles with their starting amounts.
    for (let i = 0; i < this.tiles.length; i++) {
      const res = TERRAIN_RESOURCE[this.tiles[i]];
      this.amount[i] = res ? RESOURCE_AMOUNT[res] : 0;
    }
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

  // ---------- Basic lookups ----------
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
    if (!this.inBounds(x, y)) return false;
    const i = y * this.w + x;
    return TERRAIN_INFO[this.tiles[i]].walkable && !this.blocked[i];
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

  // ---------- Resources ----------
  resourceAt(x, y) {
    if (!this.inBounds(x, y)) return null;
    return TERRAIN_RESOURCE[this.get(x, y)] || null;
  }

  hasWalkableNeighbour(x, y) {
    return NEIGHBOURS_8.some(([dx, dy]) => this.isWalkable(x + dx, y + dy));
  }

  // Take up to `amt` from a resource tile. Returns how much was actually taken.
  harvest(x, y, amt) {
    const i = y * this.w + x;
    if (!this.resourceAt(x, y)) return 0;
    const take = Math.min(amt, this.amount[i]);
    this.amount[i] -= take;
    if (this.amount[i] <= 0.0001) {
      this.amount[i] = 0;
      this.set(x, y, TERRAIN.GRASS);
      if (this.onTileChanged) this.onTileChanged(x, y);
    }
    return take;
  }

  // Change a tile's terrain (resets its resource amount) and tell the game to redraw it.
  setTerrain(x, y, t, notify = true) {
    if (!this.inBounds(x, y)) return;
    const i = y * this.w + x;
    this.tiles[i] = t;
    const res = TERRAIN_RESOURCE[t];
    this.amount[i] = res ? RESOURCE_AMOUNT[res] : 0;
    if (notify && this.onTileChanged) this.onTileChanged(x, y);
  }

  // Raise the sea: every low tile below the new level becomes water. Returns the flooded tiles.
  raiseSea(amount) {
    this.seaLevel += amount;
    const flooded = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = y * this.w + x;
        if (this.tiles[i] !== TERRAIN.WATER && this.elev[i] < this.seaLevel) {
          this.tiles[i] = TERRAIN.WATER;
          this.amount[i] = 0;
          flooded.push({ x, y });
        }
      }
    }
    return flooded;
  }

  countTiles(t) {
    let n = 0;
    for (let i = 0; i < this.tiles.length; i++) if (this.tiles[i] === t) n++;
    return n;
  }

  // Closest reachable tile of a resource type near (x, y).
  nearestResource(res, x, y, maxR = 10) {
    const list = this.resourceTilesNear(res, x, y, maxR);
    return list.length ? list[0] : null;
  }

  // All reachable tiles of a resource within a radius, closest first.
  resourceTilesNear(res, x, y, r) {
    const out = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const tx = x + dx;
        const ty = y + dy;
        if (this.resourceAt(tx, ty) === res && this.hasWalkableNeighbour(tx, ty)) {
          out.push({ x: tx, y: ty, d: dx * dx + dy * dy });
        }
      }
    }
    out.sort((a, b) => a.d - b.d);
    return out;
  }

  // ---------- Buildings ----------
  buildingAt(x, y) {
    return this.inBounds(x, y) ? this.buildings[y * this.w + x] : null;
  }

  canPlace(x, y, w, h) {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        if (!this.inBounds(i, j)) return false;
        if (this.get(i, j) !== TERRAIN.GRASS) return false;
        if (this.buildings[j * this.w + i]) return false;
      }
    }
    return true;
  }

  placeBuilding(b) {
    for (let j = b.ty; j < b.ty + b.h; j++) {
      for (let i = b.tx; i < b.tx + b.w; i++) {
        const k = j * this.w + i;
        this.buildings[k] = b;
        if (!b.def.walkable) this.blocked[k] = 1;
      }
    }
  }

  removeBuilding(b) {
    for (let j = b.ty; j < b.ty + b.h; j++) {
      for (let i = b.tx; i < b.tx + b.w; i++) {
        const k = j * this.w + i;
        if (this.buildings[k] === b) {
          this.buildings[k] = null;
          this.blocked[k] = 0;
        }
      }
    }
  }

  // Walkable tiles in the ring just outside a rectangle.
  perimeter(x, y, w, h) {
    const out = [];
    for (let j = y - 1; j <= y + h; j++) {
      for (let i = x - 1; i <= x + w; i++) {
        const onEdge = i === x - 1 || i === x + w || j === y - 1 || j === y + h;
        if (onEdge && this.isWalkable(i, j)) out.push({ x: i, y: j });
      }
    }
    return out;
  }

  // Places to stand next to a rectangle, closest to `from` first.
  standSpots(x, y, w, h, from) {
    const d = (p) => (p.x - from.x) ** 2 + (p.y - from.y) ** 2;
    return this.perimeter(x, y, w, h).sort((a, b) => d(a) - d(b));
  }

  // ---------- Searching ----------
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
      for (const [dx, dy] of NEIGHBOURS_8) {
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

  // ---------- Drawing ----------
  // Draws one tile into a Graphics object at pixel position (px, py).
  drawTile(g, x, y, px, py) {
    const t = this.get(x, y);
    const info = TERRAIN_INFO[t];
    g.fillStyle(info.colors[Math.floor(hash(x, y) * info.colors.length)], 1);
    g.fillRect(px, py, TILE, TILE);

    if (t === TERRAIN.GRASS) {
      if (hash(x, y, 1) < 0.3) {
        g.fillStyle(0x5b9a40, 1);
        g.fillRect(px + 4 + hash(x, y, 2) * 22, py + 4 + hash(x, y, 3) * 22, 3, 3);
      }
      // Sandy edge where land meets water.
      g.fillStyle(0xd9c58f, 1);
      if (this.get(x, y - 1) === TERRAIN.WATER) g.fillRect(px, py, TILE, 4);
      if (this.get(x, y + 1) === TERRAIN.WATER) g.fillRect(px, py + TILE - 4, TILE, 4);
      if (this.get(x - 1, y) === TERRAIN.WATER) g.fillRect(px, py, 4, TILE);
      if (this.get(x + 1, y) === TERRAIN.WATER) g.fillRect(px + TILE - 4, py, 4, TILE);
    } else if (t === TERRAIN.WATER) {
      if (hash(x, y, 1) < 0.35) {
        g.fillStyle(0x6fa8dc, 0.8);
        g.fillRect(px + 6 + hash(x, y, 2) * 10, py + 8 + hash(x, y, 3) * 16, 12, 2);
      }
    } else if (t === TERRAIN.FOREST) {
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
    } else if (t === TERRAIN.COAL) {
      for (let i = 0; i < 3; i++) {
        const cx = px + 8 + hash(x, y, i + 2) * 16;
        const cy = py + 8 + hash(x, y, i + 5) * 16;
        g.fillStyle(0x0d0d0d, 1); g.fillCircle(cx + 1, cy + 2, 6);
        g.fillStyle(0x262626, 1); g.fillCircle(cx, cy, 6);
        g.fillStyle(0x5a5a5a, 1); g.fillCircle(cx - 2, cy - 2, 2);
      }
    } else if (t === TERRAIN.ASH) {
      g.fillStyle(0x2b2520, 1);
      for (let k = 0; k < 5; k++) g.fillRect(px + hash(x, y, k + 1) * 28, py + hash(x, y, k + 9) * 28, 3, 2);
      if (hash(x, y, 20) < 0.5) {
        g.fillStyle(0x3a2a1a, 1);
        g.fillRect(px + 10 + hash(x, y, 21) * 10, py + 12 + hash(x, y, 22) * 8, 3, 9); // burnt stump
      }
    } else if (t === TERRAIN.BERRIES) {
      for (let i = 0; i < 2; i++) {
        const bx = px + 9 + hash(x, y, i + 2) * 14;
        const by = py + 9 + hash(x, y, i + 5) * 14;
        g.fillStyle(0x1e4d1e, 1); g.fillCircle(bx + 1, by + 2, 8);
        g.fillStyle(0x2e7d32, 1); g.fillCircle(bx, by, 8);
        g.fillStyle(0xd81b60, 1);
        for (let k = 0; k < 4; k++) {
          g.fillCircle(bx - 4 + hash(x, y, i * 10 + k) * 8, by - 4 + hash(x, y, i * 10 + k + 5) * 8, 2);
        }
      }
    }
  }

  // Draws the whole map once into a texture (much faster than redrawing every frame).
  createTexture(scene, key) {
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) this.drawTile(g, x, y, x * TILE, y * TILE);
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
