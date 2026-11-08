// A* pathfinding on the tile grid (8 directions, no cutting corners past obstacles).

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
  const g = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heap = new MinHeap();
  const start = sy * W + sx;
  const goal = gy * W + gx;
  const h = (x, y) => {
    const dx = Math.abs(x - gx), dy = Math.abs(y - gy);
    return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
  };

  g[start] = 0;
  heap.push(start, h(sx, sy));

  while (heap.size) {
    const cur = heap.pop();
    if (cur === goal) {
      const path = [];
      let c = goal;
      while (c !== start) {
        path.push({ x: c % W, y: (c / W) | 0 });
        c = came[c];
      }
      return path.reverse();
    }
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % W, cy = (cur / W) | 0;
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!walk(nx, ny)) continue;
      if (dx && dy && (!walk(cx + dx, cy) || !walk(cx, cy + dy))) continue;
      const ni = ny * W + nx;
      if (closed[ni]) continue;
      const ng = g[cur] + cost;
      if (ng < g[ni]) {
        g[ni] = ng;
        came[ni] = cur;
        heap.push(ni, ng + h(nx, ny));
      }
    }
  }
  return null;
}
