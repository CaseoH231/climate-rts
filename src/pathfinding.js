// A* pathfinding on the tile grid (8 directions). People can squeeze diagonally past one blocked corner
// (between a house and a tree, say) but not through a gap where two obstacles touch corner to corner.

const SQRT2 = Math.SQRT2;
const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [-1, 1, SQRT2], [1, -1, SQRT2], [-1, -1, SQRT2],
];

class MinHeap {
  constructor() { this.items = []; this.prio = []; }
  get size() { return this.items.length; }
  push(item, p) {
    const a = this.items, b = this.prio;
    let i = a.length;
    a.push(item); b.push(p);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (b[parent] <= b[i]) break;
      [a[i], a[parent]] = [a[parent], a[i]];
      [b[i], b[parent]] = [b[parent], b[i]];
      i = parent;
    }
  }
  pop() {
    const a = this.items, b = this.prio;
    const top = a[0];
    const lastA = a.pop(), lastB = b.pop();
    if (a.length) {
      a[0] = lastA; b[0] = lastB;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && b[l] < b[m]) m = l;
        if (r < a.length && b[r] < b[m]) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        [b[i], b[m]] = [b[m], b[i]];
        i = m;
      }
    }
    return top;
  }
}

// Returns an array of tiles [{x,y}, ...] from (but not including) the start to the goal,
// or null if the goal can't be reached. `team` may pass through its own gates.
// With `ignoreWalls`, walls and gates count as open ground (to find out which wall is in the way).
// Straighten a tile path: skip waypoints whenever a straight line to a later one stays on open ground,
// so people walk directly instead of zig-zagging from tile centre to tile centre.
// pts are pixel points; (x0, y0) is where the walker is now.
export function smoothPath(map, x0, y0, pts, team, tile) {
  if (pts.length < 2) return pts;
  const clear = (ax, ay, bx, by) => {
    const d = Math.hypot(bx - ax, by - ay);
    const n = Math.ceil(d / (tile / 4));
    for (let i = 1; i < n; i++) {
      const x = ax + ((bx - ax) * i) / n;
      const y = ay + ((by - ay) * i) / n;
      // keep a little clearance from blocked tiles (check a small box around the point)
      for (const [ox, oy] of [[0, 0], [5, 5], [-5, -5], [5, -5], [-5, 5]]) {
        if (!map.isWalkable(Math.floor((x + ox) / tile), Math.floor((y + oy) / tile), team)) return false;
      }
    }
    return true;
  };
  const out = [];
  let ax = x0;
  let ay = y0;
  let i = 0;
  while (i < pts.length) {
    // the furthest waypoint (up to 10 ahead) we can walk to in a straight line
    let j = Math.min(pts.length - 1, i + 10);
    while (j > i && !clear(ax, ay, pts[j].x, pts[j].y)) j--;
    out.push(pts[j]);
    ax = pts[j].x;
    ay = pts[j].y;
    i = j + 1;
  }
  return out;
}

let SCRATCH = null;

export function findPath(map, sx, sy, gx, gy, team, ignoreWalls = false) {
  const walk = ignoreWalls
    ? (x, y) => map.isWalkable(x, y, team) || map.isWallTile(x, y)
    : (x, y) => map.isWalkable(x, y, team);
  if (!walk(gx, gy)) {
    const n = map.nearestWalkable(gx, gy, 15, team);
    if (!n) return null;
    gx = n.x; gy = n.y;
  }
  if (sx === gx && sy === gy) return [];

  const W = map.w;
  const N = map.w * map.h;
  // Working arrays are kept between searches (allocating and filling three map-sized arrays every time was
  // most of the cost); a stamp per tile says whether its entries belong to this search.
  if (!SCRATCH || SCRATCH.n !== N) {
    SCRATCH = { n: N, g: new Float32Array(N), came: new Int32Array(N), closed: new Uint8Array(N), stamp: new Uint32Array(N), run: 0 };
  }
  const S = SCRATCH;
  if (++S.run === 0xffffffff) { S.stamp.fill(0); S.run = 1; }
  const run = S.run;
  const sg = S.g, scame = S.came, sclosed = S.closed, stamp = S.stamp;
  const touch = (i) => { if (stamp[i] !== run) { stamp[i] = run; sg[i] = Infinity; scame[i] = -1; sclosed[i] = 0; } };
  const heap = new MinHeap();
  const start = sy * W + sx;
  const goal = gy * W + gx;
  const h = (x, y) => {
    const dx = Math.abs(x - gx), dy = Math.abs(y - gy);
    return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
  };

  touch(start);
  sg[start] = 0;
  heap.push(start, h(sx, sy));

  while (heap.size) {
    const cur = heap.pop();
    if (cur === goal) {
      const path = [];
      let c = goal;
      while (c !== start) {
        path.push({ x: c % W, y: (c / W) | 0 });
        c = scame[c];
      }
      return path.reverse();
    }
    if (stamp[cur] === run && sclosed[cur]) continue;
    touch(cur);
    sclosed[cur] = 1;
    const cx = cur % W, cy = (cur / W) | 0;
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!walk(nx, ny)) continue;
      if (dx && dy && !walk(cx + dx, cy) && !walk(cx, cy + dy)) continue;
      const ni = ny * W + nx;
      touch(ni);
      if (sclosed[ni]) continue;
      const ng = sg[cur] + cost;
      if (ng < sg[ni]) {
        sg[ni] = ng;
        scame[ni] = cur;
        heap.push(ni, ng + h(nx, ny));
      }
    }
  }
  return null;
}
