// Map generation, terrain/resource lookups and drawing.
import { TILE, TERRAIN, TERRAIN_INFO, TERRAIN_RESOURCE, RESOURCE_AMOUNT, TERRAIN_AMOUNT, PLAYER_START, ENEMY_START } from './config.js';
import { toIso, fromIso } from './iso.js';

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

// Smooth noise at a given pixel scale (for natural-looking colour variation).
function pnoise(x, y, scale) {
  const fx = x / scale;
  const fy = y / scale;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = hash(x0, y0, scale);
  const b = hash(x0 + 1, y0, scale);
  const c = hash(x0, y0 + 1, scale);
  const d = hash(x0 + 1, y0 + 1, scale);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// Repeatable random numbers for one tile's decorations.
function tileRand(x, y) {
  let s = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
    s ^= s >>> 13;
    return (s >>> 0) / 4294967296;
  };
}

// Kinds of map you can pick for a new game.
export const MAP_TYPES = {
  continental: { name: 'Continental', desc: 'Rolling land with a few lakes and coasts.', sea: 0.32, cell: 12, forest: 0.67, stone: 0.84, coal: 0.86 },
  lakes: { name: 'Lakes', desc: 'Lots of small lakes to work around. Rising seas bite hard.', sea: 0.41, cell: 7, forest: 0.68, stone: 0.83, coal: 0.85 },
  highlands: { name: 'Highlands', desc: 'High, dry land rich in stone and coal. Hardly any water.', sea: 0.15, cell: 14, forest: 0.62, stone: 0.79, coal: 0.82 },
  river: { name: 'Great River', desc: 'A wide river splits the map. Armies must cross at three fords.', sea: 0.2, cell: 12, forest: 0.66, stone: 0.84, coal: 0.86, river: true },
};

const NEIGHBOURS_8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
const TEAM_CODE = { player: 1, enemy: 2 };

export class GameMap {
  constructor(w, h, seed, type = 'continental') {
    this.w = w;
    this.h = h;
    this.seed = seed;
    this.type = MAP_TYPES[type] ? type : 'continental';
    this.tiles = new Uint8Array(w * h);
    this.amount = new Float32Array(w * h);   // resource left in each tile
    this.blocked = new Uint8Array(w * h);    // 1 = a solid building stands here
    this.gateTeam = new Uint8Array(w * h);   // gates: only their owner (1 player, 2 enemy) may walk through
    this.buildings = new Array(w * h).fill(null);
    this.elev = new Float32Array(w * h);     // land height — low land floods first when the sea rises
    this.seaLevel = MAP_TYPES[this.type].sea;
    this.onTileChanged = null;               // called when a tile changes (used up, burnt, flooded…)
    this.generate();
  }

  generate() {
    const rng = mulberry32(this.seed);
    const T = MAP_TYPES[this.type];
    const base = valueNoise(rng, this.w, this.h, T.cell);
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
        else if (forest(x, y) > T.forest) t = TERRAIN.FOREST;
        else if (stone(x, y) > T.stone) t = TERRAIN.STONE;
        else if (coal(x, y) > T.coal) t = TERRAIN.COAL;
        this.set(x, y, t);
      }
    }
    if (T.river) this.carveRiver(rng);

    // Scatter some berry bushes around the map.
    for (let i = 0; i < 10; i++) {
      const bx = Math.floor(rng() * this.w);
      const by = Math.floor(rng() * this.h);
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        if (this.get(bx + dx, by + dy) === TERRAIN.GRASS) this.set(bx + dx, by + dy, TERRAIN.BERRIES);
      }
    }

    // Each base: cleared land on high ground, with wood, stone, coal and berries nearby.
    // The enemy's layout is a mirror image of the player's (dir = -1).
    for (const [s, dir] of [[PLAYER_START, 1], [ENEMY_START, -1]]) {
      this.fillCircle(s.x, s.y, 6, TERRAIN.GRASS);
      for (let dy = -8; dy <= 8; dy++) {
        for (let dx = -8; dx <= 8; dx++) {
          if (this.inBounds(s.x + dx, s.y + dy)) {
            const i = (s.y + dy) * this.w + s.x + dx;
            this.elev[i] = Math.max(this.elev[i], 0.6);
          }
        }
      }
      this.fillCircle(s.x + 9 * dir, s.y, 2, TERRAIN.FOREST);
      this.fillCircle(s.x, s.y + 9 * dir, 1, TERRAIN.STONE);
      this.fillCircle(s.x - dir, s.y - 9 * dir, 1, TERRAIN.COAL);
      for (const [dx, dy] of [[-4, 3], [-5, 3], [-4, 4], [-5, 4], [-3, 4]]) {
        if (this.inBounds(s.x + dx * dir, s.y + dy * dir)) this.set(s.x + dx * dir, s.y + dy * dir, TERRAIN.BERRIES);
      }
    }
    // Make sure the two bases are connected by walkable land.
    this.ensureConnected(PLAYER_START, ENEMY_START);

    // Fill resource tiles with their starting amounts.
    for (let i = 0; i < this.tiles.length; i++) {
      const res = TERRAIN_RESOURCE[this.tiles[i]];
      this.amount[i] = res ? TERRAIN_AMOUNT[this.tiles[i]] || RESOURCE_AMOUNT[res] : 0;
    }
  }

  // How many water tiles touch the edge of a footprint (for docks and dams).
  waterAround(tx, ty, w, h) {
    let n = 0;
    for (let y = ty - 1; y <= ty + h; y++) {
      for (let x = tx - 1; x <= tx + w; x++) {
        const edge = x === tx - 1 || x === tx + w || y === ty - 1 || y === ty + h;
        if (edge && this.inBounds(x, y) && this.tiles[y * this.w + x] === TERRAIN.WATER) n++;
      }
    }
    return n;
  }

  // A winding river across the map, between the two bases, with three shallow fords.
  carveRiver(rng) {
    const mid = (PLAYER_START.x + PLAYER_START.y + ENEMY_START.x + ENEMY_START.y) / 2; // x + y along the river
    const ph1 = rng() * 6.28;
    const ph2 = rng() * 6.28;
    const wobble = (a) => 3.5 * Math.sin(a * 0.16 + ph1) + 1.5 * Math.sin(a * 0.41 + ph2);
    const fords = [-24, 0, 24];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const along = (x - y) / Math.SQRT2;
        const across = (x + y - mid) / Math.SQRT2 - wobble(along);
        const i = y * this.w + x;
        const ford = fords.some((f) => Math.abs(along - f) < 2.3);
        if (Math.abs(across) < 1.9) {
          if (ford) {
            this.tiles[i] = TERRAIN.GRASS;
            this.elev[i] = 0.7; // fords stay dry even when the sea rises
          } else {
            this.tiles[i] = TERRAIN.WATER;
            this.elev[i] = 0.05;
          }
        } else if (Math.abs(across) < 3.2) {
          // soft, low banks
          this.elev[i] = Math.min(this.elev[i], 0.3);
          if (ford && this.tiles[i] !== TERRAIN.GRASS) this.tiles[i] = TERRAIN.GRASS;
        }
      }
    }
  }

  // If you can't walk from a to b, carve a raised land bridge between them.
  ensureConnected(a, b) {
    const reach = () => {
      const seen = new Uint8Array(this.w * this.h);
      const q = [[a.x, a.y]];
      seen[a.y * this.w + a.x] = 1;
      while (q.length) {
        const [x, y] = q.pop();
        if (x === b.x && y === b.y) return true;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (!this.inBounds(nx, ny) || seen[ny * this.w + nx]) continue;
          if (!TERRAIN_INFO[this.get(nx, ny)].walkable) continue;
          seen[ny * this.w + nx] = 1;
          q.push([nx, ny]);
        }
      }
      return false;
    };
    if (reach()) return;
    const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(a.x + ((b.x - a.x) * i) / steps);
      const y = Math.round(a.y + ((b.y - a.y) * i) / steps);
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        if (!this.inBounds(x + dx, y + dy)) continue;
        const k = (y + dy) * this.w + x + dx;
        if (!TERRAIN_INFO[this.tiles[k]].walkable) this.tiles[k] = TERRAIN.GRASS;
        this.elev[k] = Math.max(this.elev[k], 0.6);
      }
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

  // `team` lets a side walk through its own gates; without it, every gate counts as closed.
  isWalkable(x, y, team) {
    if (!this.inBounds(x, y)) return false;
    const i = y * this.w + x;
    if (!TERRAIN_INFO[this.tiles[i]].walkable || this.blocked[i]) return false;
    const g = this.gateTeam[i];
    return !g || (team !== undefined && TEAM_CODE[team] === g);
  }

  // A wall or gate stands here (used to work out what an army has to smash through).
  isWallTile(x, y) {
    if (!this.inBounds(x, y)) return false;
    const b = this.buildings[y * this.w + x];
    return !!(b && b.def.wall && TERRAIN_INFO[this.tiles[y * this.w + x]].walkable);
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
    this.amount[i] = res ? TERRAIN_AMOUNT[t] || RESOURCE_AMOUNT[res] : 0;
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
        if (b.def.gate) this.gateTeam[k] = TEAM_CODE[b.team];
        else if (!b.def.walkable) this.blocked[k] = 1;
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
          this.gateTeam[k] = 0;
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
  nearestWalkable(x, y, maxR = 15, team) {
    if (this.isWalkable(x, y, team)) return { x, y };
    for (let r = 1; r <= maxR; r++) {
      let best = null;
      let bestD = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (!this.isWalkable(x + dx, y + dy, team)) continue;
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
  // The ground is painted pixel by pixel in isometric view (grass, sand, water depth, burnt ground),
  // then trees, rocks, coal and bushes are drawn on top, back to front.
  renderAll(ctx) {
    this.renderRegion(ctx, 0, 0, this.w - 1, this.h - 1, true);
  }

  // Colour of the ground at grid pixel (wx, wy).
  groundColor(wx, wy, out) {
    const lerp = (a, b, t) => a + (b - a) * t;
    const tx = Math.min(this.w - 1, (wx / TILE) | 0);
    const ty = Math.min(this.h - 1, (wy / TILE) | 0);
    const t = this.tiles[ty * this.w + tx];
    const n1 = pnoise(wx, wy, 5);
    const n2 = pnoise(wx, wy, 26);
    const n3 = pnoise(wx, wy, 110);
    const grain = hash(wx | 0, wy | 0, 77) - 0.5;
    let r, g, b;
    const wobble = (n1 - 0.5) * 6 + (n2 - 0.5) * 10;
    const wf = this.waterField(wx, wy) + wobble * 0.035;
    if (wf > 0.5) {
      let dl = t === TERRAIN.WATER ? this.distToClass(wx, wy, tx, ty, false) : 0;
      dl = Math.min(dl, (wf - 0.5) * 60);
      const depth = Math.min(1, dl / 26);
      r = lerp(62, 22, depth); g = lerp(118, 62, depth); b = lerp(128, 104, depth);
      const ripple = (n1 - 0.5) * 8 + (n2 - 0.5) * 10;
      r += ripple; g += ripple; b += ripple;
      if (dl < 2.5) { const f = (1 - dl / 2.5) * 0.4; r = lerp(r, 196, f); g = lerp(g, 200, f); b = lerp(b, 180, f); }
    } else {
      r = lerp(86, 112, n2); g = lerp(116, 138, n2); b = lerp(42, 54, n2);
      const dry = Math.max(0, n3 - 0.55) * 1.8;
      r = lerp(r, 142, dry); g = lerp(g, 134, dry); b = lerp(b, 68, dry);
      const shade = this.edgeFade(wx, wy, tx, ty, t, wobble);
      if (t === TERRAIN.FOREST || t === TERRAIN.BERRIES) { r *= 1 - 0.32 * shade; g *= 1 - 0.24 * shade; b *= 1 - 0.3 * shade; }
      else if (t === TERRAIN.STONE || t === TERRAIN.COAL) { const k = 0.35 * shade; r = lerp(r, 120, k); g = lerp(g, 110, k); b = lerp(b, 86, k); }
      else if (t === TERRAIN.ASH) { const k = shade; r = lerp(r, lerp(60, 78, n2), k); g = lerp(g, lerp(52, 64, n2), k); b = lerp(b, lerp(44, 52, n2), k); }
      const dw = (0.5 - wf) * 40;
      if (dw < 8) { const sand = (1 - Math.max(0, dw) / 8) * 0.85; r = lerp(r, 196, sand); g = lerp(g, 174, sand); b = lerp(b, 118, sand); }
      const v = (n1 - 0.5) * 16;
      r += v; g += v; b += v * 0.8;
    }
    out[0] = r + grain * 10;
    out[1] = g + grain * 10;
    out[2] = b + grain * 8;
  }

  // Repaint tiles x0..x1, y0..y1 (inclusive) onto the isometric canvas.
  renderRegion(ctx, x0, y0, x1, y1, fresh = false) {
    x0 = Math.max(0, x0); y0 = Math.max(0, y0);
    x1 = Math.min(this.w - 1, x1); y1 = Math.min(this.h - 1, y1);
    const T = TILE;
    const gx0 = x0 * T, gy0 = y0 * T, gx1 = (x1 + 1) * T, gy1 = (y1 + 1) * T;
    const top = toIso(gx0, gy0);
    const right = toIso(gx1, gy0);
    const bottom = toIso(gx1, gy1);
    const left = toIso(gx0, gy1);
    const bx = Math.floor(left.x);
    const by = Math.floor(top.y);
    const bw = Math.ceil(right.x) - bx;
    const bh = Math.ceil(bottom.y) - by;
    const img = fresh ? ctx.createImageData(bw, bh) : ctx.getImageData(bx, by, bw, bh);
    const d = img.data;
    const col = [0, 0, 0];
    for (let py = 0; py < bh; py++) {
      for (let px = 0; px < bw; px++) {
        const g = fromIso(bx + px + 0.5, by + py + 0.5);
        if (g.x < gx0 || g.y < gy0 || g.x >= gx1 || g.y >= gy1) continue;
        this.groundColor(g.x, g.y, col);
        const i = (py * bw + px) * 4;
        d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, bx, by);

    // Objects: redraw everything that could overlap this area, clipped to it, back to front.
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(right.x, right.y);
    ctx.lineTo(bottom.x, bottom.y);
    ctx.lineTo(left.x, left.y);
    ctx.closePath();
    if (!fresh) ctx.clip();
    const list = [];
    for (let ty = Math.max(0, y0 - 1); ty <= Math.min(this.h - 1, y1 + 3); ty++) {
      for (let tx = Math.max(0, x0 - 1); tx <= Math.min(this.w - 1, x1 + 3); tx++) list.push([tx, ty]);
    }
    list.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
    for (const [tx, ty] of list) this.drawObject(ctx, tx, ty);
    ctx.restore();
  }

  // 1 = water, 0 = land, blended smoothly between tile centres.
  waterField(wx, wy) {
    const u = (wx - TILE / 2) / TILE;
    const v = (wy - TILE / 2) / TILE;
    const ix = Math.floor(u);
    const iy = Math.floor(v);
    const fx = u - ix;
    const fy = v - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const at = (x, y) => {
      x = Math.max(0, Math.min(this.w - 1, x));
      y = Math.max(0, Math.min(this.h - 1, y));
      return this.tiles[y * this.w + x] === TERRAIN.WATER ? 1 : 0;
    };
    const a = at(ix, iy);
    const b = at(ix + 1, iy);
    const c = at(ix, iy + 1);
    const d = at(ix + 1, iy + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }

  // 0 at the edge of a patch of this terrain → 1 inside it (with a wobbly edge).
  edgeFade(wx, wy, tx, ty, t, wobble) {
    let best = 99;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = tx + dx;
        const ny = ty + dy;
        if (!this.inBounds(nx, ny) || this.tiles[ny * this.w + nx] === t) continue;
        const ex = Math.max(nx * TILE - wx, 0, wx - (nx * TILE + TILE - 1));
        const ey = Math.max(ny * TILE - wy, 0, wy - (ny * TILE + TILE - 1));
        const dd = Math.hypot(ex, ey);
        if (dd < best) best = dd;
      }
    }
    return Math.max(0, Math.min(1, (best + wobble * 0.6) / 8));
  }

  // Pixel distance from (wx, wy) to the nearest neighbouring tile that is water (or land).
  distToClass(wx, wy, tx, ty, wantWater) {
    let best = 99;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = tx + dx;
        const ny = ty + dy;
        if (!this.inBounds(nx, ny)) continue;
        const isWater = this.tiles[ny * this.w + nx] === TERRAIN.WATER;
        if (isWater !== wantWater) continue;
        const ex = Math.max(nx * TILE - wx, 0, wx - (nx * TILE + TILE - 1));
        const ey = Math.max(ny * TILE - wy, 0, wy - (ny * TILE + TILE - 1));
        const dd = Math.hypot(ex, ey);
        if (dd < best) best = dd;
      }
    }
    return best;
  }

  // Trees, rocks, coal, bushes and stumps, drawn standing up in isometric view.
  drawObject(ctx, tx, ty) {
    const t = this.get(tx, ty);
    if (t === TERRAIN.WATER) return;
    const r = tileRand(tx, ty);
    const at = (fx, fy) => toIso(tx * TILE + fx, ty * TILE + fy); // point inside the tile
    if (t === TERRAIN.FOREST) {
      const trees = [];
      const n = 3 + (r() < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const p = at(4 + r() * 24, 4 + r() * 24);
        trees.push({ x: p.x, y: p.y, s: 8 + r() * 3.5, pine: r() < 0.35, hue: r() });
      }
      trees.sort((a, b) => a.y - b.y);
      for (const tr of trees) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(tr.x + tr.s * 0.8, tr.y + 1, tr.s * 1.1, tr.s * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3b2a1a';
        ctx.fillRect(tr.x - 1, tr.y - tr.s * 1.1, 2.5, tr.s * 1.1);
        if (tr.pine) {
          for (let k = 0; k < 4; k++) {
            const w = tr.s * (1.05 - k * 0.2);
            const yy = tr.y - tr.s * 0.6 - k * tr.s * 0.62;
            const gr = ctx.createLinearGradient(tr.x - w, 0, tr.x + w, 0);
            gr.addColorStop(0, '#4c6e33'); gr.addColorStop(1, '#1d3418');
            ctx.fillStyle = gr;
            ctx.beginPath();
            ctx.moveTo(tr.x, yy - tr.s * 1.0);
            ctx.lineTo(tr.x + w, yy);
            ctx.lineTo(tr.x - w, yy);
            ctx.closePath();
            ctx.fill();
          }
        } else {
          const cy = tr.y - tr.s * 1.7;
          const light = tr.hue < 0.5 ? ['#8aa34e', '#4f7230', '#24401b'] : ['#9aa54a', '#5f7a2c', '#2e4419'];
          for (const [ox, oy, k] of [[-0.55, 0.3, 0.7], [0.55, 0.3, 0.7], [0, -0.35, 0.8], [0, 0.25, 0.75]]) {
            const cx = tr.x + ox * tr.s;
            const cyy = cy + oy * tr.s;
            const rad = tr.s * k;
            const gr = ctx.createRadialGradient(cx - rad * 0.4, cyy - rad * 0.45, rad * 0.1, cx, cyy, rad);
            gr.addColorStop(0, light[0]); gr.addColorStop(0.55, light[1]); gr.addColorStop(1, light[2]);
            ctx.fillStyle = gr;
            ctx.beginPath();
            ctx.arc(cx, cyy, rad, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    } else if (t === TERRAIN.STONE || t === TERRAIN.COAL) {
      const coal = t === TERRAIN.COAL;
      const c = at(16, 16);
      if (coal) {
        ctx.fillStyle = 'rgba(20,18,16,0.4)';
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, 22, 10, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      const n = coal ? 5 : 3;
      const rocks = [];
      for (let i = 0; i < n; i++) rocks.push({ p: at(7 + r() * 18, 7 + r() * 18), s: coal ? 4 + r() * 3 : 6 + r() * 4 });
      rocks.sort((a, b) => a.p.y - b.p.y);
      for (const { p, s: size } of rocks) {
        const pts = [];
        const k = 7;
        for (let j = 0; j < k; j++) {
          const a = (j / k) * Math.PI * 2;
          const rr = size * (0.75 + r() * 0.35);
          pts.push([p.x + Math.cos(a) * rr, p.y - size * 0.4 + Math.sin(a) * rr * 0.7]);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(p.x + 3, p.y + 1, size, size * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        const gr = ctx.createLinearGradient(p.x - size, p.y - size, p.x + size, p.y + size * 0.5);
        if (coal) { gr.addColorStop(0, '#55524c'); gr.addColorStop(1, '#100f0e'); }
        else { gr.addColorStop(0, '#d1c9b5'); gr.addColorStop(1, '#6e6656'); }
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (const q of pts) ctx.lineTo(q[0], q[1]);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = coal ? 'rgba(220,220,210,0.55)' : 'rgba(255,250,235,0.35)';
        ctx.fillRect(p.x - size * 0.3, p.y - size * 0.8, coal ? 1 : 2, 1);
      }
    } else if (t === TERRAIN.MEAT) {
      // a deer lying on its side
      const c = at(16, 18);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(c.x + 2, c.y + 2, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#6b4a2e'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      for (const k of [-6, -3, 4, 7]) { ctx.beginPath(); ctx.moveTo(c.x + k, c.y + 1); ctx.lineTo(c.x + k + 2, c.y + 6); ctx.stroke(); }
      const gr = ctx.createLinearGradient(c.x, c.y - 6, c.x, c.y + 3);
      gr.addColorStop(0, '#b88454'); gr.addColorStop(1, '#76502c');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.ellipse(c.x, c.y - 1, 10, 4.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f0e6d4'; ctx.beginPath(); ctx.ellipse(c.x - 2, c.y + 1, 5, 1.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#9a6a3e'; ctx.beginPath(); ctx.ellipse(c.x + 11, c.y - 2, 3.5, 2.2, 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#5a4026'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(c.x + 12, c.y - 4); ctx.lineTo(c.x + 15, c.y - 8); ctx.moveTo(c.x + 13.5, c.y - 6); ctx.lineTo(c.x + 16, c.y - 6); ctx.stroke();
    } else if (t === TERRAIN.BERRIES) {
      for (let i = 0; i < 2; i++) {
        const p = at(8 + r() * 16, 8 + r() * 16);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(p.x + 3, p.y + 1, 8, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();
        const gr = ctx.createRadialGradient(p.x - 2, p.y - 8, 1, p.x, p.y - 5, 9);
        gr.addColorStop(0, '#6f8f45'); gr.addColorStop(1, '#22361a');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y - 5, 9, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        for (let k = 0; k < 7; k++) {
          ctx.fillStyle = '#a02838';
          ctx.beginPath();
          ctx.arc(p.x - 6 + r() * 12, p.y - 10 + r() * 9, 1.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (t === TERRAIN.ASH) {
      for (let i = 0; i < 2; i++) {
        if (r() < 0.35) continue;
        const p = at(6 + r() * 20, 6 + r() * 20);
        ctx.fillStyle = 'rgba(15,12,10,0.5)';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 6, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1e1813';
        ctx.fillRect(p.x - 1.5, p.y - 7, 3, 7);
      }
    } else if (t === TERRAIN.GRASS) {
      if (r() < 0.35) {
        const p = at(4 + r() * 24, 4 + r() * 24);
        ctx.strokeStyle = 'rgba(48,70,24,0.6)';
        ctx.lineWidth = 1;
        for (let k = -1; k <= 1; k++) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + k * 2, p.y - 3 - r() * 2);
          ctx.stroke();
        }
      }
    }
  }
}
