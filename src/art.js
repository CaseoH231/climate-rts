// All the game's art, drawn with code (canvas 2D) when the game starts.
// Buildings, units and icons become textures that sprites use.

import { TILE } from './config.js';


export const TEAM_RGB = {
  player: { main: '#3f6296', light: '#6585b8', dark: '#253c5e' },
  enemy:  { main: '#93382f', light: '#b85a4d', dark: '#5c201b' },
};

// ---------- little drawing helpers ----------
function rand(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
    s ^= s >>> 13;
    return (s >>> 0) / 4294967296;
  };
}

function vgrad(ctx, y0, y1, stops) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
}

function hgrad(ctx, x0, x1, stops) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
}

function rgrad(ctx, x, y, r0, r1, stops) {
  const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
}

function poly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

function shadow(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  poly(ctx, [[x + 6, y + h], [x + w + 6, y + h], [x + w + 12, y + h + 6], [x + 12, y + h + 6]]);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(x + w, y + 8, 7, h - 2);
}

// Stone wall with irregular blocks.
function stoneWall(ctx, x, y, w, h, seed, base = [128, 124, 116]) {
  const r = rand(seed);
  ctx.fillStyle = `rgb(${base[0] - 30},${base[1] - 30},${base[2] - 30})`;
  ctx.fillRect(x, y, w, h);
  const rowH = 6;
  for (let yy = y, row = 0; yy < y + h; yy += rowH, row++) {
    let xx = x - (row % 2 ? 5 : 0);
    while (xx < x + w) {
      const bw = 8 + Math.floor(r() * 7);
      const v = Math.floor((r() - 0.5) * 26);
      ctx.fillStyle = `rgb(${base[0] + v},${base[1] + v},${base[2] + v})`;
      const bx = Math.max(x, xx);
      const ex = Math.min(x + w, xx + bw - 1);
      if (ex > bx) ctx.fillRect(bx, yy, ex - bx, Math.min(rowH - 1, y + h - yy));
      xx += bw;
    }
  }
  // light from the top-left
  ctx.fillStyle = hgrad(ctx, x, x + w, ['rgba(255,255,255,0.08)', 'rgba(0,0,0,0.12)']);
  ctx.fillRect(x, y, w, h);
}

function plankWall(ctx, x, y, w, h, seed, base = [112, 82, 54]) {
  const r = rand(seed);
  for (let xx = x; xx < x + w; xx += 5) {
    const v = Math.floor((r() - 0.5) * 22);
    ctx.fillStyle = `rgb(${base[0] + v},${base[1] + v},${base[2] + v})`;
    ctx.fillRect(xx, y, Math.min(5, x + w - xx), h);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(xx, y, 1, h);
  }
  ctx.fillStyle = vgrad(ctx, y, y + h, ['rgba(0,0,0,0.25)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.15)']);
  ctx.fillRect(x, y, w, h);
}

function plasterWall(ctx, x, y, w, h, seed) {
  const r = rand(seed);
  ctx.fillStyle = '#cbbd9c';
  ctx.fillRect(x, y, w, h);
  for (let i = 0; i < w * h / 12; i++) {
    ctx.fillStyle = `rgba(${r() < 0.5 ? '90,80,60' : '255,250,235'},${0.08 + r() * 0.08})`;
    ctx.fillRect(x + r() * w, y + r() * h, 2, 1);
  }
  ctx.fillStyle = '#4a3423'; // timber frame
  ctx.fillRect(x, y, w, 2);
  ctx.fillRect(x, y + h - 2, w, 2);
  ctx.fillRect(x, y, 2, h);
  ctx.fillRect(x + w - 2, y, 2, h);
  for (let xx = x + 12; xx < x + w - 6; xx += 14) ctx.fillRect(xx, y, 2, h);
  ctx.fillStyle = hgrad(ctx, x, x + w, ['rgba(255,255,255,0.06)', 'rgba(0,0,0,0.14)']);
  ctx.fillRect(x, y, w, h);
}

// Hip roof seen from the front/above with tile rows.
function roof(ctx, x, y, w, h, inset, light, dark, seed) {
  const r = rand(seed);
  poly(ctx, [[x, y + h], [x + inset, y], [x + w - inset, y], [x + w, y + h]]);
  ctx.fillStyle = vgrad(ctx, y, y + h, [light, dark]);
  ctx.fill();
  ctx.save();
  poly(ctx, [[x, y + h], [x + inset, y], [x + w - inset, y], [x + w, y + h]]);
  ctx.clip();
  for (let yy = y + 3; yy < y + h; yy += 4) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(x, yy, w, 1);
    for (let xx = x + (yy % 8 ? 0 : 3); xx < x + w; xx += 6) {
      ctx.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.05 + r() * 0.07})`;
      ctx.fillRect(xx, yy - 3, 5, 3);
    }
  }
  // side shading
  ctx.fillStyle = hgrad(ctx, x, x + w, ['rgba(255,255,255,0.10)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.25)']);
  ctx.fillRect(x, y, w, h);
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; // ridge
  ctx.fillRect(x + inset, y, w - inset * 2, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; // eave
  ctx.fillRect(x, y + h - 1, w, 2);
}

function windowLit(ctx, x, y, w, h) {
  ctx.fillStyle = '#2b2118';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = vgrad(ctx, y, y + h, ['#e9c27a', '#b98a43']);
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#2b2118';
  ctx.fillRect(x + w / 2 - 0.5, y, 1, h);
}

function door(ctx, x, y, w, h, arch = true) {
  ctx.fillStyle = '#2a1d13';
  if (arch) {
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + w / 2);
    ctx.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fill();
  } else ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#5a3f28';
  ctx.fillRect(x + 2, y + (arch ? w / 2 : 2), w - 4, h - (arch ? w / 2 : 2));
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  for (let xx = x + 4; xx < x + w - 2; xx += 3) ctx.fillRect(xx, y + (arch ? w / 2 : 2), 1, h);
}

function banner(ctx, x, y, h, team) {
  const c = TEAM_RGB[team];
  ctx.fillStyle = '#3a2a1c';
  ctx.fillRect(x, y - 4, 2, h + 6);
  ctx.fillStyle = vgrad(ctx, y, y + h, [c.light, c.main, c.dark]);
  poly(ctx, [[x + 2, y], [x + 12, y], [x + 12, y + h], [x + 7, y + h - 4], [x + 2, y + h]]);
  ctx.fill();
  ctx.fillStyle = 'rgba(230,200,120,0.6)';
  ctx.fillRect(x + 5, y + 4, 4, 1);
}

function flag(ctx, x, y, team) {
  const c = TEAM_RGB[team];
  ctx.fillStyle = '#3a2a1c';
  ctx.fillRect(x, y, 2, 22);
  ctx.fillStyle = hgrad(ctx, x + 2, x + 16, [c.light, c.main]);
  poly(ctx, [[x + 2, y], [x + 16, y + 3], [x + 14, y + 7], [x + 2, y + 9]]);
  ctx.fill();
}

function barrel(ctx, x, y) {
  ctx.fillStyle = hgrad(ctx, x, x + 7, ['#5a3e26', '#8a6440', '#4a321e']);
  ctx.fillRect(x, y, 7, 9);
  ctx.fillStyle = '#2e2e2e';
  ctx.fillRect(x, y + 2, 7, 1);
  ctx.fillRect(x, y + 6, 7, 1);
}

function crate(ctx, x, y, s) {
  ctx.fillStyle = '#8f6d45';
  ctx.fillRect(x, y, s, s);
  ctx.strokeStyle = '#5a4128';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + s, y + s);
  ctx.stroke();
}

// ---------- buildings (isometric) ----------
// Building textures: the footprint's TOP corner sits at (h*32, ART_TOP) in the texture.
// P(x, y, z) turns a point on the footprint (grid px) + height into texture coordinates.
export const ART_TOP = 110;

function P(x, y, z = 0) {
  return [x - y, (x + y) / 2 - z];
}

// Draw `draw(ctx, w, h)` in a local rectangle mapped onto a parallelogram (origin o, axis vectors u and v).
function quad(ctx, o, u, v, w, h, draw) {
  ctx.save();
  ctx.transform(u[0], u[1], v[0], v[1], o[0], o[1]);
  draw(ctx, w, h);
  ctx.restore();
}

// Front-left wall (the y = y face), local x along the wall, y going down from the top.
function wallL(ctx, x0, x1, y, z, draw, shade = 0, zb = 0) {
  quad(ctx, P(x0, y, zb + z), [1, 0.5], [0, 1], x1 - x0, z, (c, w, h) => {
    draw(c, w, h);
    if (shade) { c.fillStyle = `rgba(0,0,0,${shade})`; c.fillRect(0, 0, w, h); }
  });
}

// Front-right wall (the x = x face).
function wallR(ctx, y0, y1, x, z, draw, shade = 0.22, zb = 0) {
  quad(ctx, P(x, y1, zb + z), [1, -0.5], [0, 1], y1 - y0, z, (c, w, h) => {
    draw(c, w, h);
    if (shade) { c.fillStyle = `rgba(0,0,0,${shade})`; c.fillRect(0, 0, w, h); }
  });
}

function diamond(ctx, x0, y0, x1, y1, z = 0) {
  const a = P(x0, y0, z), b = P(x1, y0, z), c = P(x1, y1, z), d = P(x0, y1, z);
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]);
  ctx.closePath();
}

function isoShadow(ctx, x0, y0, x1, y1, len) {
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  const a = P(x1, y0), b = P(x1, y1), c = P(x0, y1);
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(a[0] + len, a[1] + len * 0.25);
  ctx.lineTo(b[0] + len, b[1] + len * 0.25);
  ctx.lineTo(c[0] + len, c[1] + len * 0.25);
  ctx.lineTo(c[0], c[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.closePath();
  ctx.fill();
}

// Roof-tile texture for a slope in local coords.
function tiles(c, w, h, top, bottom, seed) {
  const r = rand(seed);
  c.fillStyle = vgrad(c, 0, h, [top, bottom]);
  c.fillRect(0, 0, w, h);
  for (let y = 3; y < h; y += 4) {
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(0, y, w, 1);
    for (let x = (y % 8 ? 0 : 3); x < w; x += 6) {
      c.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.04 + r() * 0.08})`;
      c.fillRect(x, y - 3, 5, 3);
    }
  }
}

// Box with walls + optional gable roof. ridge: 'x' or 'y'.
function house(ctx, o) {
  const { x0, y0, x1, y1, wallLeft, wallRight, roof, rh = 20, ov = 3, ridge = 'x', seed = 1, zb = 0 } = o;
  const wallH = o.z;
  wallL(ctx, x0, x1, y1, wallH, wallLeft, 0, zb);
  wallR(ctx, y0, y1, x1, wallH, wallRight || wallLeft, 0.24, zb);
  const z = zb + wallH; // roof sits on top of the walls
  if (!roof) return;
  const [light, dark] = roof;
  if (ridge === 'x') {
    const ym = (y0 + y1) / 2;
    const L = Math.hypot(ym - y0 + ov, rh);
    // back slope (faces up-right) then gable end, then front slope
    const r0 = P(x0 - ov, ym, z + rh);
    const backEave = P(x0 - ov, y0 - ov, z);
    quad(ctx, backEave, [1, 0.5], [(r0[0] - backEave[0]) / L, (r0[1] - backEave[1]) / L], x1 - x0 + ov * 2, L,
      (c, w, h) => { tiles(c, w, h, dark, light, seed); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, 0, w, h); });
    const g1 = P(x1, y0, z), g2 = P(x1, y1, z), g3 = P(x1, ym, z + rh);
    ctx.save();
    ctx.beginPath(); ctx.moveTo(...g1); ctx.lineTo(...g2); ctx.lineTo(...g3); ctx.closePath(); ctx.clip();
    wallR(ctx, y0, y1, x1, rh, (c, w, h) => (wallRight || wallLeft)(c, w, h), 0.3, z);
    ctx.restore();
    const fe = P(x0 - ov, y1 + ov, z);
    quad(ctx, r0, [1, 0.5], [(fe[0] - r0[0]) / L, (fe[1] - r0[1]) / L], x1 - x0 + ov * 2, L,
      (c, w, h) => tiles(c, w, h, light, dark, seed + 1));
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    const ra = P(x0 - ov, ym, z + rh), rb = P(x1 + ov, ym, z + rh);
    ctx.beginPath(); ctx.moveTo(ra[0], ra[1] - 1); ctx.lineTo(rb[0], rb[1] - 1); ctx.lineTo(rb[0], rb[1] + 1); ctx.lineTo(ra[0], ra[1] + 1); ctx.fill();
  } else {
    const xm = (x0 + x1) / 2;
    const L = Math.hypot(xm - x0 + ov, rh);
    const r0 = P(xm, y0 - ov, z + rh);
    const leftEave = P(x0 - ov, y0 - ov, z);
    // left slope (faces up-left), lit
    quad(ctx, leftEave, [-1, 0.5], [(r0[0] - leftEave[0]) / L, (r0[1] - leftEave[1]) / L], y1 - y0 + ov * 2, L,
      (c, w, h) => tiles(c, w, h, dark, light, seed));
    // gable end facing front-left
    const g1 = P(x0, y1, z), g2 = P(x1, y1, z), g3 = P(xm, y1, z + rh);
    ctx.save();
    ctx.beginPath(); ctx.moveTo(...g1); ctx.lineTo(...g2); ctx.lineTo(...g3); ctx.closePath(); ctx.clip();
    wallL(ctx, x0, x1, y1, rh, wallLeft, 0.05, z);
    ctx.restore();
    // right slope (faces down-right), shaded
    const re = P(x1 + ov, y0 - ov, z);
    quad(ctx, r0, [-1, 0.5], [(re[0] - r0[0]) / L, (re[1] - r0[1]) / L], y1 - y0 + ov * 2, L,
      (c, w, h) => { tiles(c, w, h, light, dark, seed + 1); c.fillStyle = 'rgba(0,0,0,0.22)'; c.fillRect(0, 0, w, h); });
  }
}

// Upright cylinder (towers, chimneys, tanks) standing at grid point (cx, cy).
function cylinder(ctx, cx, cy, r, z0, z1, face, topColor) {
  const rx = r * Math.SQRT2;
  const ry = rx / 2;
  const b = P(cx, cy, z0);
  const t = P(cx, cy, z1);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(b[0], b[1], rx, ry, 0, 0, Math.PI);
  ctx.lineTo(t[0] - rx, t[1]);
  ctx.ellipse(t[0], t[1], rx, ry, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.clip();
  face(ctx, t[0] - rx, t[1] - ry, rx * 2, b[1] - t[1] + ry * 2);
  ctx.fillStyle = hgrad(ctx, t[0] - rx, t[0] + rx, ['rgba(0,0,0,0.25)', 'rgba(255,255,255,0.12)', 'rgba(0,0,0,0.05)', 'rgba(0,0,0,0.45)']);
  ctx.fillRect(t[0] - rx, t[1] - ry, rx * 2, b[1] - t[1] + ry * 2);
  ctx.restore();
  if (topColor) {
    ctx.fillStyle = topColor;
    ctx.beginPath();
    ctx.ellipse(t[0], t[1], rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return { top: t, rx, ry };
}

function cone(ctx, top, rx, ry, h, light, dark) {
  ctx.fillStyle = hgrad(ctx, top[0] - rx, top[0] + rx, [light, dark]);
  ctx.beginPath();
  ctx.moveTo(top[0] - rx - 2, top[1]);
  ctx.ellipse(top[0], top[1], rx + 2, ry + 1, 0, Math.PI, 0, true);
  ctx.lineTo(top[0], top[1] - h);
  ctx.closePath();
  ctx.fill();
}

const stoneFace = (seed, base) => (c, w, h) => stoneWall(c, 0, 0, w, h, seed, base);
const plankFace = (seed, base) => (c, w, h) => plankWall(c, 0, 0, w, h, seed, base);
const plasterFace = (seed) => (c, w, h) => plasterWall(c, 0, 0, w, h, seed);
const brickFace = (seed) => (c, w, h) => stoneWall(c, 0, 0, w, h, seed, [132, 72, 54]);

function bannerL(ctx, x, y, z, team) {
  // a banner hanging on the front-left wall at grid x, wall y, top height z
  quad(ctx, P(x, y, z), [1, 0.5], [0, 1], 12, 22, (c) => banner(c, 0, 0, 18, team));
}

export const BUILDING_POINTS = {
  wind_turbine: { hub: P(32, 32, 88) },
  power_plant: { smoke: [P(80, 18, 104), P(84, 44, 90)] },
};

export const BUILDING_ART = {
  town_centre(ctx, team) {
    isoShadow(ctx, 6, 6, 90, 90, 40);
    house(ctx, { x0: 6, y0: 6, x1: 90, y1: 90, z: 14, wallLeft: stoneFace(11) });
    house(ctx, {
      x0: 14, y0: 14, x1: 84, y1: 84, z: 24, zb: 14, ridge: 'x', rh: 30, ov: 6, seed: 13,
      roof: ['#6f7378', '#3a3d42'],
      wallLeft: (c, w, h) => { plasterWall(c, 0, 0, w, h, 12); windowLit(c, 10, 8, 6, 9); windowLit(c, w - 16, 8, 6, 9); },
      wallRight: (c, w, h) => { plasterWall(c, 0, 0, w, h, 14); windowLit(c, 14, 8, 6, 9); windowLit(c, w - 20, 8, 6, 9); },
    });
    wallL(ctx, 34, 56, 90, 14, (c) => door(c, 0, -2, 22, 16, true), 0);
    bannerL(ctx, 14, 90, 13, team);
    bannerL(ctx, 70, 90, 13, team);
    // bell tower at the back
    const t = cylinder(ctx, 24, 24, 9, 38, 92, (c, x, y, w, h) => stoneWall(c, x, y, w, h, 15), '#8e8a80');
    cone(ctx, t.top, t.rx, t.ry, 22, TEAM_RGB[team].light, TEAM_RGB[team].dark);
    flag(ctx, t.top[0] - 1, t.top[1] - 44, team);
  },

  house(ctx, team) {
    isoShadow(ctx, 10, 10, 54, 54, 26);
    house(ctx, {
      x0: 10, y0: 10, x1: 54, y1: 54, z: 22, ridge: 'y', rh: 22, ov: 3, seed: 21,
      roof: ['#a8613f', '#6a3423'],
      wallLeft: (c, w, h) => { plasterWall(c, 0, 0, w, h, 21); door(c, w / 2 - 5, h - 15, 10, 15, false); },
      wallRight: (c, w, h) => { plasterWall(c, 0, 0, w, h, 22); windowLit(c, w / 2 - 4, 6, 7, 8); },
    });
    const ch = cylinder(ctx, 20, 18, 3, 36, 50, (c, x, y, w, h) => stoneWall(c, x, y, w, h, 23), '#6a645a');
    wallL(ctx, 10, 54, 54, 3, (c, w) => { c.fillStyle = TEAM_RGB[team].main; c.fillRect(0, 0, w, 2); });
    return ch;
  },

  farm(ctx) {
    diamond(ctx, 1, 1, 63, 63);
    ctx.fillStyle = '#6a4e30';
    ctx.fill();
    const r = rand(31);
    for (let y = 4; y < 62; y += 5) {
      const a = P(3, y), b = P(61, y);
      ctx.strokeStyle = 'rgba(40,26,14,0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      ctx.strokeStyle = `rgba(150,110,70,${0.25 + r() * 0.15})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(a[0], a[1] - 1.2); ctx.lineTo(b[0], b[1] - 1.2); ctx.stroke();
    }
    // fence
    ctx.strokeStyle = '#5c4529';
    ctx.lineWidth = 1.5;
    diamond(ctx, 1, 1, 63, 63, 4);
    ctx.stroke();
    ctx.fillStyle = '#4a3622';
    for (const [x, y] of [[1, 1], [63, 1], [63, 63], [1, 63], [32, 63], [63, 32]]) {
      const q = P(x, y);
      ctx.fillRect(q[0] - 1, q[1] - 6, 2, 6);
    }
  },

  storage(ctx, team) {
    isoShadow(ctx, 8, 8, 56, 56, 26);
    house(ctx, {
      x0: 8, y0: 8, x1: 56, y1: 56, z: 20, ridge: 'x', rh: 16, ov: 3, seed: 42,
      roof: ['#6d6a62', '#383630'],
      wallLeft: (c, w, h) => { plankWall(c, 0, 0, w, h, 41); c.fillStyle = '#1e140c'; c.fillRect(w / 2 - 8, h - 15, 16, 15); },
      wallRight: plankFace(43),
    });
    wallL(ctx, 8, 56, 56, 17, (c, w) => { c.fillStyle = TEAM_RGB[team].main; c.fillRect(0, 0, w, 2); });
    const cr = P(46, 62);
    crate(ctx, cr[0] - 5, cr[1] - 10, 9);
    const br = P(60, 46);
    barrel(ctx, br[0] - 3, br[1] - 9);
  },

  barracks(ctx, team) {
    isoShadow(ctx, 6, 6, 90, 90, 40);
    house(ctx, {
      x0: 6, y0: 10, x1: 90, y1: 86, z: 30, ridge: 'x', rh: 24, ov: 4, seed: 52,
      roof: ['#5a4e3e', '#2e271f'],
      wallLeft: (c, w, h) => { stoneWall(c, 0, 0, w, h, 51, [118, 108, 96]); door(c, w / 2 - 9, h - 22, 18, 22, true); c.fillStyle = '#1e1813'; c.fillRect(14, 8, 3, 7); c.fillRect(w - 18, 8, 3, 7); },
      wallRight: (c, w, h) => { stoneWall(c, 0, 0, w, h, 53, [118, 108, 96]); c.fillStyle = '#1e1813'; for (let x = 12; x < w - 8; x += 18) c.fillRect(x, 10, 3, 7); },
    });
    bannerL(ctx, 18, 86, 28, team);
    bannerL(ctx, 66, 86, 28, team);
    // weapon rack in the yard
    const q = P(94, 70);
    ctx.fillStyle = '#4a3622';
    ctx.fillRect(q[0] - 6, q[1] - 3, 12, 2);
    ctx.fillStyle = '#b8bcc0';
    for (let i = 0; i < 4; i++) ctx.fillRect(q[0] - 5 + i * 3, q[1] - 14, 1, 12);
  },

  tower(ctx, team) {
    isoShadow(ctx, 18, 18, 46, 46, 50);
    const base = cylinder(ctx, 32, 32, 16, 0, 8, (c, x, y, w, h) => stoneWall(c, x, y, w, h, 60, [110, 104, 94]), '#77726a');
    const t = cylinder(ctx, 32, 32, 13, 8, 66, (c, x, y, w, h) => {
      stoneWall(c, x, y, w, h, 61);
      c.fillStyle = '#1a1511';
      c.fillRect(x + w / 2 - 1.5, y + 22, 3, 9);
      c.fillRect(x + w / 2 - 1.5, y + 46, 3, 9);
    }, '#8a857c');
    const top = cylinder(ctx, 32, 32, 16, 66, 74, (c, x, y, w, h) => stoneWall(c, x, y, w, h, 62), '#5d5850');
    // battlements around the front half
    ctx.fillStyle = '#9a958b';
    for (let i = 0; i <= 6; i++) {
      const a = Math.PI * (i / 6);
      const bx = top.top[0] + Math.cos(a) * top.rx - 3;
      const by = top.top[1] + Math.sin(a) * top.ry - 7;
      ctx.fillRect(bx, by, 6, 7);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(bx + 4, by, 2, 7);
      ctx.fillStyle = '#9a958b';
    }
    wallL(ctx, 26, 38, 46, 14, (c) => door(c, 0, 0, 12, 14, true), 0);
    flag(ctx, top.top[0] + 6, top.top[1] - 30, team);
    return base;
  },

  wind_turbine(ctx, team) {
    diamond(ctx, 18, 18, 46, 46);
    ctx.fillStyle = '#8e8c84';
    ctx.fill();
    wallL(ctx, 18, 46, 46, 4, (c, w, h) => { c.fillStyle = '#6e6c66'; c.fillRect(0, 0, w, h); c.fillStyle = TEAM_RGB[team].main; c.fillRect(0, 1, w, 2); });
    wallR(ctx, 18, 46, 46, 4, (c, w, h) => { c.fillStyle = '#6e6c66'; c.fillRect(0, 0, w, h); });
    // tapered white tower
    const b = P(32, 32, 4), t = P(32, 32, 86);
    ctx.fillStyle = hgrad(ctx, b[0] - 5, b[0] + 5, ['#b9bab6', '#f2f2ee', '#9fa09c']);
    ctx.beginPath();
    ctx.moveTo(b[0] - 5, b[1]); ctx.lineTo(b[0] + 5, b[1]); ctx.lineTo(t[0] + 2.5, t[1]); ctx.lineTo(t[0] - 2.5, t[1]);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = hgrad(ctx, t[0] - 6, t[0] + 8, ['#d7d8d4', '#f0f0ec', '#a9aaa6']);
    ctx.fillRect(t[0] - 6, t[1] - 4, 14, 6);
  },

  trees(ctx) {
    diamond(ctx, 2, 2, 62, 62);
    ctx.fillStyle = '#5a4430';
    ctx.fill();
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const q = P(9 + i * 15, 9 + j * 15);
        ctx.strokeStyle = '#3d2b1c';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(q[0], q[1] - 4); ctx.stroke();
        ctx.fillStyle = '#6f9a4c';
        ctx.beginPath();
        ctx.ellipse(q[0] - 2, q[1] - 5, 2.2, 1.3, -0.5, 0, Math.PI * 2);
        ctx.ellipse(q[0] + 2, q[1] - 5, 2.2, 1.3, 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  },

  workshop(ctx, team) {
    isoShadow(ctx, 8, 12, 88, 88, 36);
    house(ctx, {
      x0: 8, y0: 12, x1: 88, y1: 88, z: 30, ridge: 'x', rh: 18, ov: 3, seed: 92,
      roof: ['#9aa0a3', '#565c60'],
      wallLeft: (c, w, h) => {
        stoneWall(c, 0, 0, w, h, 91, [132, 80, 62]);
        c.fillStyle = '#3b3f40'; c.fillRect(w / 2 - 14, h - 24, 28, 24);
        c.fillStyle = 'rgba(255,255,255,0.08)'; for (let x = w / 2 - 12; x < w / 2 + 14; x += 4) c.fillRect(x, h - 24, 1, 24);
        windowLit(c, 8, 8, 10, 8); windowLit(c, w - 18, 8, 10, 8);
        c.fillStyle = TEAM_RGB[team].main; c.fillRect(w / 2 - 10, h - 30, 20, 5);
      },
      wallRight: (c, w, h) => { stoneWall(c, 0, 0, w, h, 93, [132, 80, 62]); for (let x = 10; x < w - 10; x += 20) windowLit(c, x, 8, 10, 8); },
    });
    const ch = cylinder(ctx, 70, 26, 4, 40, 70, (c, x, y, w, h) => stoneWall(c, x, y, w, h, 94, [110, 64, 50]), '#2a2a2a');
    return ch;
  },

  power_plant(ctx, team) {
    isoShadow(ctx, 6, 8, 90, 90, 44);
    house(ctx, {
      x0: 6, y0: 8, x1: 68, y1: 90, z: 32, ridge: 'y', rh: 14, ov: 2, seed: 82,
      roof: ['#5f5c56', '#2f2d29'],
      wallLeft: (c, w, h) => { stoneWall(c, 0, 0, w, h, 81, [122, 66, 50]); door(c, w / 2 - 9, h - 20, 18, 20, false); c.fillStyle = TEAM_RGB[team].main; c.fillRect(0, 2, w, 2); },
      wallRight: (c, w, h) => { stoneWall(c, 0, 0, w, h, 83, [122, 66, 50]); c.fillStyle = '#1d1712'; for (let x = 8; x < w - 6; x += 14) c.fillRect(x, 8, 6, 12); },
    });
    for (const [x, y, z, r] of [[80, 18, 104, 6], [84, 44, 90, 5]]) {
      cylinder(ctx, x, y, r, 0, z, (c, cx, cy, w, h) => {
        stoneWall(c, cx, cy, w, h, x, [120, 70, 56]);
        c.fillStyle = 'rgba(235,235,225,0.7)';
        c.fillRect(cx, cy + 14, w, 3);
      }, '#1d1d1d');
    }
    const heap = P(86, 80);
    ctx.fillStyle = rgrad(ctx, heap[0] - 3, heap[1] - 6, 2, 16, ['#4a4a4a', '#141414']);
    ctx.beginPath();
    ctx.ellipse(heap[0], heap[1] - 3, 16, 8, 0, Math.PI, 0);
    ctx.lineTo(heap[0] + 16, heap[1]);
    ctx.ellipse(heap[0], heap[1] - 3, 16, 4, 0, 0, Math.PI);
    ctx.fill();
  },

  solar(ctx) {
    diamond(ctx, 2, 2, 62, 62);
    ctx.fillStyle = '#7d7a6e';
    ctx.fill();
    for (let row = 0; row < 3; row++) {
      const y = 6 + row * 19;
      const back = P(6, y, 12);
      const front = P(6, y + 13, 4);
      // posts
      ctx.fillStyle = '#4e5153';
      for (const x of [10, 54]) { const q = P(x, y + 7); ctx.fillRect(q[0] - 1, q[1] - 9, 2, 9); }
      quad(ctx, back, [1, 0.5], [(front[0] - back[0]) / 13, (front[1] - back[1]) / 13], 52, 13, (c, w, h) => {
        c.fillStyle = '#c3c7c9'; c.fillRect(0, 0, w, h);
        c.fillStyle = vgrad(c, 0, h, ['#34557a', '#1a2b40']); c.fillRect(1, 1, w - 2, h - 2);
        c.fillStyle = 'rgba(160,190,220,0.35)';
        for (let gx = 1; gx < w; gx += 6.5) c.fillRect(gx, 1, 0.8, h - 2);
        c.fillRect(1, h / 2, w - 2, 0.8);
        c.fillStyle = 'rgba(255,255,255,0.22)';
        c.fillRect(4, 1, 8, h - 2);
      });
    }
  },

  carbon_capture(ctx, team) {
    diamond(ctx, 2, 2, 94, 94);
    ctx.fillStyle = '#8c908e';
    ctx.fill();
    isoShadow(ctx, 50, 40, 88, 88, 30);
    for (const [x, y, h] of [[24, 22, 58], [24, 62, 48]]) {
      cylinder(ctx, x, y, 11, 0, h, (c, cx, cy, w, hh) => {
        c.fillStyle = '#d9dddd'; c.fillRect(cx, cy, w, hh);
        c.fillStyle = 'rgba(0,0,0,0.15)'; c.fillRect(cx, cy + 18, w, 2);
      }, '#eef1f1');
    }
    house(ctx, {
      x0: 50, y0: 40, x1: 88, y1: 88, z: 34,
      wallLeft: (c, w, h) => { c.fillStyle = '#6a7276'; c.fillRect(0, 0, w, h); c.fillStyle = '#4e7a4a'; c.fillRect(0, h - 4, w, 3); c.fillStyle = TEAM_RGB[team].main; c.fillRect(0, 0, w, 3); },
      wallRight: (c, w, h) => { c.fillStyle = '#6a7276'; c.fillRect(0, 0, w, h); },
    });
    diamond(ctx, 50, 40, 88, 88, 34);
    ctx.fillStyle = '#7d878b';
    ctx.fill();
    for (const [fx, fy] of [[60, 54], [76, 70]]) {
      const q = P(fx, fy, 34);
      ctx.fillStyle = '#2b3133';
      ctx.beginPath(); ctx.ellipse(q[0], q[1], 12, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#8a9497'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(q[0] + Math.cos(a) * 11, q[1] + Math.sin(a) * 5.5); ctx.stroke(); }
    }
    const p1 = P(30, 40, 30), p2 = P(52, 52, 26);
    ctx.strokeStyle = '#7b8386'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(...p1); ctx.lineTo(...p2); ctx.stroke();
  },

  restoration(ctx, team) {
    isoShadow(ctx, 4, 4, 124, 124, 40);
    house(ctx, { x0: 4, y0: 4, x1: 124, y1: 124, z: 12, wallLeft: stoneFace(101, [156, 148, 130]) });
    diamond(ctx, 4, 4, 124, 124, 12);
    ctx.fillStyle = '#5b7a3c';
    ctx.fill();
    // glass dome
    const c = P(64, 64, 12);
    const rx = 58 * Math.SQRT2 * 0.8, ry = rx / 2, hgt = 92;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(c[0], c[1], rx, ry, 0, 0, Math.PI);
    ctx.ellipse(c[0], c[1], rx, hgt, 0, Math.PI, 0);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = vgrad(ctx, c[1] - hgt, c[1] + ry, ['rgba(180,225,220,0.95)', 'rgba(90,150,150,0.9)']);
    ctx.fillRect(c[0] - rx, c[1] - hgt, rx * 2, hgt + ry);
    const r = rand(102);
    for (let i = 0; i < 26; i++) {
      const tx = c[0] - rx * 0.8 + r() * rx * 1.6;
      const ty = c[1] - 20 + r() * 40;
      const tr = 7 + r() * 8;
      ctx.fillStyle = rgrad(ctx, tx - 2, ty - 3, 1, tr, ['#7aa652', '#2f4a24']);
      ctx.beginPath(); ctx.arc(tx, ty - tr * 0.6, tr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(235,240,235,0.85)';
    ctx.lineWidth = 1.5;
    for (let i = -4; i <= 4; i++) {
      ctx.beginPath(); ctx.ellipse(c[0], c[1], Math.abs(i) * rx / 4 + 0.1, hgt, 0, Math.PI, 0); ctx.stroke();
    }
    for (const k of [0.35, 0.65, 0.88]) {
      ctx.beginPath(); ctx.ellipse(c[0], c[1] - hgt * k, rx * Math.sqrt(1 - k * k), ry * Math.sqrt(1 - k * k), 0, 0, Math.PI); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.ellipse(c[0] - rx * 0.35, c[1] - hgt * 0.55, 10, 28, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#dfe4dc'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(c[0], c[1], rx, hgt, 0, Math.PI, 0); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(c[0], c[1], rx, ry, 0, 0, Math.PI); ctx.stroke();
    ctx.fillStyle = '#dfe4dc';
    ctx.fillRect(c[0] - 1, c[1] - hgt - 12, 3, 12);
    flag(ctx, c[0], c[1] - hgt - 34, team);
    bannerL(ctx, 22, 124, 11, team);
    bannerL(ctx, 96, 124, 11, team);
    wallL(ctx, 54, 74, 124, 12, (cc) => door(cc, 0, 0, 20, 12, false), 0);
  },
};

// Size of a building texture and where the footprint's top corner sits in it.
export function buildingTexInfo(def) {
  const w = def.w * TILE;
  const h = def.h * TILE;
  return { width: w + h, height: (w + h) / 2 + ART_TOP, ox: h, oy: ART_TOP };
}

// ---------- units ----------
// Little people seen from slightly above, drawn on a 32×40 canvas with feet at (16, 34).
// Which walking pose to draw: 0 = standing, 1 / -1 = mid-stride.
let LEG_STEP = 0;

function figure(ctx, team, opts) {
  const c = TEAM_RGB[team];
  const skin = '#c49a78';
  // legs
  ctx.fillStyle = '#3a3128';
  const s = LEG_STEP;
  ctx.fillRect(12 - s * 1.5, 26, 3, 8 - Math.max(0, s));
  ctx.fillRect(17 + s * 1.5, 26, 3, 8 - Math.max(0, -s));
  ctx.fillStyle = '#211b15';
  ctx.fillRect(11 - s * 1.5, 33 - Math.max(0, s), 4, 2);
  ctx.fillRect(17 + s * 1.5, 33 - Math.max(0, -s), 4, 2);
  // body
  const body = opts.body || c.main;
  ctx.fillStyle = hgrad(ctx, 9, 23, [c.light, body, c.dark]);
  poly(ctx, [[10, 15], [22, 15], [23, 27], [9, 27]]);
  ctx.fill();
  ctx.fillStyle = '#3a2b1d'; // belt
  ctx.fillRect(9, 24, 14, 2);
  // arms
  ctx.fillStyle = c.dark;
  ctx.fillRect(7, 16, 3, 9);
  ctx.fillRect(22, 16, 3, 9);
  ctx.fillStyle = skin;
  ctx.fillRect(7, 24, 3, 2);
  ctx.fillRect(22, 24, 3, 2);
  // head
  ctx.fillStyle = rgrad(ctx, 15, 9, 1, 5, ['#d9b391', skin, '#8f6b52']);
  ctx.beginPath();
  ctx.arc(16, 10, 4.5, 0, Math.PI * 2);
  ctx.fill();
  if (opts.head) opts.head(ctx, c);
  if (opts.item) opts.item(ctx, c);
}

export const UNIT_ART = {
  worker: (ctx, team) => figure(ctx, team, {
    body: '#7a6a4f',
    head: (ctx) => {
      ctx.fillStyle = '#b3a066';
      ctx.beginPath();
      ctx.ellipse(16, 7, 7, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#9c8a55';
      ctx.fillRect(13, 3, 6, 4);
    },
    item: (ctx) => {
      ctx.strokeStyle = '#6b4a2c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(24, 26);
      ctx.lineTo(28, 12);
      ctx.stroke();
      ctx.strokeStyle = '#8d9296';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(24, 11);
      ctx.quadraticCurveTo(28, 9, 31, 13);
      ctx.stroke();
    },
  }),
  soldier: (ctx, team) => figure(ctx, team, {
    head: (ctx) => {
      ctx.fillStyle = rgrad(ctx, 14, 6, 1, 6, ['#c4c8cc', '#7b8085']);
      ctx.beginPath();
      ctx.arc(16, 9, 5, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#5f6468';
      ctx.fillRect(11, 9, 10, 1);
      ctx.fillRect(15.5, 9, 1, 4);
    },
    item: (ctx, c) => {
      ctx.fillStyle = '#c9cdd1'; // sword
      ctx.fillRect(25, 8, 2, 16);
      ctx.fillStyle = '#6b4a2c';
      ctx.fillRect(23, 23, 6, 2);
      ctx.fillStyle = rgrad(ctx, 7, 19, 1, 7, [c.light, c.main, c.dark]); // shield
      ctx.beginPath();
      ctx.arc(8, 20, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#c9b47a';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#c9b47a';
      ctx.fillRect(7, 19, 2, 2);
    },
  }),
  archer: (ctx, team) => figure(ctx, team, {
    body: '#55603f',
    head: (ctx) => {
      ctx.fillStyle = '#3f4a30';
      ctx.beginPath();
      ctx.arc(16, 9.5, 5.2, Math.PI * 0.9, Math.PI * 2.1);
      ctx.fill();
      ctx.fillRect(11, 9, 2, 5);
      ctx.fillRect(19, 9, 2, 5);
    },
    item: (ctx) => {
      ctx.strokeStyle = '#6b4a2c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(22, 19, 10, -1.2, 1.2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(230,225,210,0.8)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(22 + Math.cos(-1.2) * 10, 19 + Math.sin(-1.2) * 10);
      ctx.lineTo(22 + Math.cos(1.2) * 10, 19 + Math.sin(1.2) * 10);
      ctx.stroke();
      ctx.fillStyle = '#5a4128'; // quiver
      ctx.fillRect(10, 13, 3, 9);
    },
  }),
  rifleman: (ctx, team) => figure(ctx, team, {
    head: (ctx, c) => {
      ctx.fillStyle = c.dark;
      ctx.beginPath();
      ctx.arc(16, 8.5, 4.8, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(15, 8, 8, 2);
    },
    item: (ctx) => {
      ctx.strokeStyle = '#4a3220';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(8, 26);
      ctx.lineTo(26, 10);
      ctx.stroke();
      ctx.strokeStyle = '#3a3d40';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(20, 15);
      ctx.lineTo(30, 6);
      ctx.stroke();
      ctx.fillStyle = '#5a4128';
      ctx.fillRect(9, 18, 14, 2);
    },
  }),
};

// Armoured car: 44×40 canvas, centred at (22, 26).
function armouredCar(ctx, team) {
  const c = TEAM_RGB[team];
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(24, 34, 19, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1e1e1e'; // wheels
  for (const x of [8, 18, 28]) ctx.fillRect(x, 29, 7, 6);
  ctx.fillStyle = vgrad(ctx, 14, 32, ['#7a7f6a', '#555a48', '#3f4336']);
  poly(ctx, [[4, 22], [8, 14], [36, 14], [41, 22], [40, 31], [4, 31]]);
  ctx.fill();
  ctx.fillStyle = c.main;
  ctx.fillRect(6, 24, 33, 3);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(8, 14, 28, 2);
  ctx.fillStyle = rgrad(ctx, 20, 11, 1, 8, ['#808570', '#4a4e3f']); // turret
  ctx.beginPath();
  ctx.ellipse(22, 13, 8, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2e302a';
  ctx.fillRect(29, 11, 13, 3);
  ctx.fillStyle = '#1b1d1a';
  ctx.fillRect(13, 18, 6, 3);
}

// ---------- icons (resources, upgrades, eras) ----------
export const ICON_ART = {
  food(ctx) {
    ctx.strokeStyle = '#c9a94e';
    ctx.lineWidth = 1.5;
    for (const dx of [-4, 0, 4]) {
      ctx.beginPath();
      ctx.moveTo(10, 18);
      ctx.lineTo(10 + dx, 6);
      ctx.stroke();
      ctx.fillStyle = '#d9bc62';
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.ellipse(10 + dx * (1 - k * 0.15) - 1, 4 + k * 3, 1.6, 2.4, -0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  },
  wood(ctx) {
    ctx.fillStyle = hgrad(ctx, 2, 18, ['#5e4127', '#8a6440']);
    ctx.fillRect(2, 7, 13, 8);
    ctx.fillStyle = '#b48d5e';
    ctx.beginPath();
    ctx.ellipse(15, 11, 3.5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7a5836';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(15, 11, 1.6, 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  },
  stone(ctx) {
    ctx.fillStyle = rgrad(ctx, 8, 7, 1, 10, ['#c4c1b8', '#77746c']);
    poly(ctx, [[2, 14], [5, 6], [11, 3], [17, 8], [18, 15], [10, 17]]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.moveTo(8, 8);
    ctx.lineTo(11, 13);
    ctx.stroke();
  },
  fuel(ctx) {
    for (const [x, y, r] of [[7, 12, 5], [13, 12, 4.5], [10, 7, 4]]) {
      ctx.fillStyle = rgrad(ctx, x - 1.5, y - 1.5, 0.5, r, ['#9a968e', '#3a3835']);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(200,195,180,0.35)';
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
  },
  clean(ctx) {
    ctx.fillStyle = '#9fd0c4';
    poly(ctx, [[11, 1], [4, 11], [9, 11], [7, 19], [16, 7], [11, 7], [13, 1]]);
    ctx.fill();
    ctx.strokeStyle = '#4d8c7d';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  },
  energy(ctx) {
    ctx.fillStyle = '#d8c26a';
    poly(ctx, [[11, 1], [4, 11], [9, 11], [7, 19], [16, 7], [11, 7], [13, 1]]);
    ctx.fill();
  },
  pop(ctx) {
    ctx.fillStyle = '#cfc6ac';
    ctx.beginPath();
    ctx.arc(10, 6, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(10, 16, 6, 5, 0, Math.PI, 0);
    ctx.fill();
  },
  co2(ctx) {
    ctx.fillStyle = '#8c8f93';
    for (const [x, y, r] of [[6, 12, 4], [11, 9, 5], [15, 12, 3.5]]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillRect(5, 12, 11, 4);
  },
  temp(ctx) {
    ctx.fillStyle = '#d9d2c0';
    ctx.fillRect(8, 2, 4, 12);
    ctx.beginPath();
    ctx.arc(10, 15, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(9, 7, 2, 8);
    ctx.beginPath();
    ctx.arc(10, 15, 2.8, 0, Math.PI * 2);
    ctx.fill();
  },
  forest(ctx) {
    ctx.fillStyle = '#4f2f1a';
    ctx.fillRect(9, 13, 2, 5);
    ctx.fillStyle = '#4e7a3a';
    poly(ctx, [[10, 1], [17, 14], [3, 14]]);
    ctx.fill();
  },
  clock(ctx) {
    ctx.strokeStyle = '#cfc6ac';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(10, 10, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(10, 10);
    ctx.lineTo(10, 5);
    ctx.moveTo(10, 10);
    ctx.lineTo(13, 12);
    ctx.stroke();
  },
};

// Bigger 40×40 icons for research buttons.
const UPGRADE_ICON = {
  era(ctx) {
    ctx.fillStyle = '#c8a960';
    poly(ctx, [[20, 4], [33, 18], [25, 18], [25, 34], [15, 34], [15, 18], [7, 18]]);
    ctx.fill();
    ctx.strokeStyle = '#6b5a2e';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  },
  steel_axes(ctx) {
    ctx.strokeStyle = '#6b4a2c'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(10, 34); ctx.lineTo(26, 10); ctx.stroke();
    ctx.fillStyle = hgrad(ctx, 20, 34, ['#e0e3e6', '#8d9296']);
    poly(ctx, [[22, 6], [34, 10], [32, 20], [24, 16]]); ctx.fill();
  },
  mining_carts(ctx) {
    ctx.fillStyle = '#6d5136'; poly(ctx, [[6, 14], [34, 14], [30, 28], [10, 28]]); ctx.fill();
    ctx.fillStyle = '#2b2b2b'; for (const [x, y, r] of [[14, 12, 4], [20, 10, 5], [27, 12, 4]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#3a3a3a'; for (const x of [13, 27]) { ctx.beginPath(); ctx.arc(x, 31, 4, 0, 7); ctx.fill(); }
  },
  plough(ctx) {
    ctx.strokeStyle = '#6b4a2c'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(6, 10); ctx.lineTo(26, 24); ctx.stroke();
    ctx.fillStyle = '#9aa0a4'; poly(ctx, [[22, 20], [34, 26], [26, 32]]); ctx.fill();
    ctx.fillStyle = '#c9a94e'; for (let x = 6; x < 22; x += 5) ctx.fillRect(x, 30, 2, 6);
  },
  chainsaws(ctx) {
    ctx.fillStyle = '#b8862c'; ctx.fillRect(6, 16, 12, 10);
    ctx.fillStyle = '#9aa0a4'; ctx.fillRect(18, 18, 16, 6);
    ctx.fillStyle = '#3a3a3a'; for (let x = 18; x < 34; x += 3) { ctx.fillRect(x, 16, 2, 2); ctx.fillRect(x, 24, 2, 2); }
  },
  iron_weapons(ctx) {
    ctx.fillStyle = '#c9cdd1'; poly(ctx, [[19, 3], [22, 3], [22, 27], [19, 27]]); ctx.fill();
    poly(ctx, [[19, 3], [20.5, 0], [22, 3]]); ctx.fill();
    ctx.fillStyle = '#6b4a2c'; ctx.fillRect(13, 27, 15, 3); ctx.fillRect(19, 30, 3, 7);
  },
  electric_tools(ctx) {
    ctx.fillStyle = '#9fd0c4'; poly(ctx, [[22, 2], [10, 20], [19, 20], [15, 38], [30, 14], [21, 14], [26, 2]]); ctx.fill();
  },
  smart_grid(ctx) {
    ctx.strokeStyle = '#9fd0c4'; ctx.lineWidth = 2;
    const pts = [[8, 8], [32, 8], [20, 20], [8, 32], [32, 32]];
    for (const [a, b] of [[0, 2], [1, 2], [2, 3], [2, 4], [0, 1], [3, 4]]) { ctx.beginPath(); ctx.moveTo(...pts[a]); ctx.lineTo(...pts[b]); ctx.stroke(); }
    ctx.fillStyle = '#d8c26a'; for (const p of pts) { ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, 7); ctx.fill(); }
  },
  reforestation(ctx) {
    for (const [x, s] of [[12, 1], [26, 1.3]]) {
      ctx.fillStyle = '#4f2f1a'; ctx.fillRect(x - 1, 26, 3, 9);
      ctx.fillStyle = '#5c8a42'; poly(ctx, [[x, 26 - 18 * s], [x + 9 * s, 28], [x - 9 * s, 28]]); ctx.fill();
    }
  },
  climate_shields(ctx) {
    ctx.fillStyle = rgrad(ctx, 18, 14, 2, 18, ['#9fd0c4', '#3f7a6c']);
    ctx.beginPath(); ctx.moveTo(20, 3); ctx.lineTo(34, 9); ctx.quadraticCurveTo(33, 30, 20, 37); ctx.quadraticCurveTo(7, 30, 6, 9); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#d8ddd6'; ctx.lineWidth = 1.5; ctx.stroke();
  },
};

// ---------- interface textures (stone & wood, in the style of classic RTS panels) ----------
function uiStone(ctx, S) {
  const r = rand(901);
  ctx.fillStyle = '#3a342b';
  ctx.fillRect(0, 0, S, S);
  const rowH = 16;
  for (let y = 0, row = 0; y < S; y += rowH, row++) {
    let x = row % 2 ? -14 : 0;
    while (x < S) {
      const w = 26 + Math.floor(r() * 18);
      const v = Math.floor((r() - 0.5) * 18);
      const base = [92 + v, 84 + v, 70 + v];
      ctx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
      ctx.fillRect(x + 1, y + 1, w - 2, rowH - 2);
      // speckle + bevel
      for (let k = 0; k < (w * rowH) / 10; k++) {
        ctx.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,245,225'},${0.05 + r() * 0.07})`;
        ctx.fillRect(x + 1 + r() * (w - 2), y + 1 + r() * (rowH - 2), 1, 1);
      }
      ctx.fillStyle = 'rgba(255,240,210,0.10)';
      ctx.fillRect(x + 1, y + 1, w - 2, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x + 1, y + rowH - 2, w - 2, 1);
      // wrap around horizontally so the texture tiles
      if (x + w > S) { ctx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`; ctx.fillRect(1, y + 1, x + w - S - 2, rowH - 2); }
      x += w;
    }
  }
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 0, S, S);
}

function uiWood(ctx, W, H) {
  const r = rand(902);
  for (let y = 0; y < H; y += 8) {
    const v = Math.floor((r() - 0.5) * 16);
    ctx.fillStyle = `rgb(${64 + v},${42 + v},${26 + v})`;
    ctx.fillRect(0, y, W, 8);
    for (let k = 0; k < W / 3; k++) {
      ctx.fillStyle = `rgba(${r() < 0.5 ? '20,10,4' : '120,84,50'},${0.15 + r() * 0.2})`;
      ctx.fillRect(r() * W, y + r() * 8, 6 + r() * 20, 1);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, y + 7, W, 1);
  }
}

// Vignette that darkens the screen edges a little.
function vignette(ctx, s) {
  ctx.fillStyle = rgrad(ctx, s / 2, s / 2, s * 0.32, s * 0.72, ['rgba(0,0,0,0)', 'rgba(0,0,0,0.5)']);
  ctx.fillRect(0, 0, s, s);
}

// ---------- make Phaser textures from all of the above ----------
// Art is drawn at ART_RES× size and shown at 1/ART_RES scale, so it stays crisp when you zoom in.
export const ART_RES = 2;

function makeCanvas(scene, key, w, h, draw, res = 1) {
  if (scene.textures.exists(key)) return; // already made (e.g. when starting a second game)
  const tex = scene.textures.createCanvas(key, Math.ceil(w * res), Math.ceil(h * res));
  const ctx = tex.getContext();
  ctx.scale(res, res);
  draw(ctx);
  tex.refresh();
}

export function buildingKey(type, team) { return `b_${type}_${team}`; }
export function unitKey(type, team, frame = 0) { return `u_${type}_${team}${frame ? `_w${frame}` : ''}`; }

export function generateArt(scene, buildingTypes) {
  for (const team of Object.keys(TEAM_RGB)) {
    for (const [type, def] of Object.entries(buildingTypes)) {
      const draw = BUILDING_ART[type];
      if (!draw) continue;
      const info = buildingTexInfo(def);
      makeCanvas(scene, buildingKey(type, team), info.width, info.height, (ctx) => {
        ctx.translate(info.ox, info.oy);
        draw(ctx, team);
      }, ART_RES);
    }
    for (const [type, draw] of Object.entries(UNIT_ART)) {
      // standing pose + two walking poses
      [0, 1, 2].forEach((frame) => {
        LEG_STEP = frame === 1 ? 1 : frame === 2 ? -1 : 0;
        makeCanvas(scene, unitKey(type, team, frame), 32, 40, (ctx) => draw(ctx, team), ART_RES);
      });
      LEG_STEP = 0;
    }
    makeCanvas(scene, unitKey('armoured_car', team), 44, 40, (ctx) => armouredCar(ctx, team), ART_RES);
  }
  for (const [name, draw] of Object.entries(ICON_ART)) makeCanvas(scene, `i_${name}`, 20, 20, draw, ART_RES);
  for (const [name, draw] of Object.entries(UPGRADE_ICON)) makeCanvas(scene, `up_${name}`, 40, 40, draw, ART_RES);
  // soft cloud shadow and a water glint
  makeCanvas(scene, 'cloud', 512, 256, (ctx) => {
    const r = rand(77);
    for (let i = 0; i < 9; i++) {
      const x = 120 + r() * 270;
      const y = 80 + r() * 100;
      const rad = 50 + r() * 70;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(0,0,0,0.5)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, rad, rad * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  makeCanvas(scene, 'glint', 16, 6, (ctx) => {
    const g = ctx.createRadialGradient(8, 3, 0, 8, 3, 8);
    g.addColorStop(0, 'rgba(255,255,245,1)');
    g.addColorStop(1, 'rgba(255,255,245,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(8, 3, 8, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  makeCanvas(scene, 'vignette', 512, 512, (ctx) => vignette(ctx, 512));
  makeCanvas(scene, 'ui_stone', 256, 256, (ctx) => uiStone(ctx, 256));
  makeCanvas(scene, 'ui_wood', 256, 64, (ctx) => uiWood(ctx, 256, 64));
}

// Exported for the preview/test page.
export const _internal = { armouredCar, UPGRADE_ICON, vignette, buildingTexInfo };
