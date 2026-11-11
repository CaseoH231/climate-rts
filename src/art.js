// All the game's art, drawn with code (canvas 2D) when the game starts.
// Buildings, units and icons become textures that sprites use.

import { TILE } from './config.js';


export const TEAM_RGB = {
  player: { main: '#3f6296', light: '#6585b8', dark: '#253c5e' },
  enemy:  { main: '#93382f', light: '#b85a4d', dark: '#5c201b' },
  green:  { main: '#3b8044', light: '#5ea866', dark: '#214a27' },
  yellow: { main: '#b58c22', light: '#d8b14a', dark: '#6b5212' },
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

// ---------- Era styles ----------
// Buildings are redrawn in the look of their owner's era. The shared material helpers below
// read STYLE: 0 Coal (stone & timber), 1 Industrial (brick, slate, chimneys), 2 Modern (concrete,
// glass, flat roofs), 3 Transition (white render, solar roofs), 4 Green (timber, ivy, grass roofs).
let STYLE = 0;
export const STYLE_COUNT = 5;

function brickWall(ctx, x, y, w, h, seed) {
  const r = rand(seed);
  ctx.fillStyle = '#6e5a4c';
  ctx.fillRect(x, y, w, h);
  for (let yy = y, row = 0; yy < y + h; yy += 3.5, row++) {
    for (let xx = x - (row % 2 ? 3.5 : 0); xx < x + w; xx += 7) {
      const v = Math.floor((r() - 0.5) * 30);
      ctx.fillStyle = `rgb(${150 + v},${70 + v * 0.6},${52 + v * 0.5})`;
      const bx = Math.max(x, xx);
      const ex = Math.min(x + w, xx + 6.2);
      if (ex > bx) ctx.fillRect(bx, yy, ex - bx, Math.min(2.8, y + h - yy));
    }
  }
  ctx.fillStyle = hgrad(ctx, x, x + w, ['rgba(255,255,255,0.06)', 'rgba(0,0,0,0.14)']);
  ctx.fillRect(x, y, w, h);
}

function concreteWall(ctx, x, y, w, h, seed, light = false) {
  const r = rand(seed);
  ctx.fillStyle = light ? '#e4e1d8' : '#b4b1a8';
  ctx.fillRect(x, y, w, h);
  for (let yy = y; yy < y + h; yy += 10) {
    for (let xx = x; xx < x + w; xx += 16) {
      const v = (r() - 0.5) * (light ? 10 : 18);
      ctx.fillStyle = `rgba(${v > 0 ? '255,255,255' : '0,0,0'},${Math.abs(v) / 120})`;
      ctx.fillRect(xx, yy, 16, 10);
    }
  }
  ctx.fillStyle = light ? 'rgba(0,0,0,0.07)' : 'rgba(0,0,0,0.16)';
  for (let yy = y + 10; yy < y + h; yy += 10) ctx.fillRect(x, yy, w, 0.8);
  for (let xx = x + 16; xx < x + w; xx += 16) ctx.fillRect(xx, y, 0.8, h);
  ctx.fillStyle = hgrad(ctx, x, x + w, ['rgba(255,255,255,0.08)', 'rgba(0,0,0,0.1)']);
  ctx.fillRect(x, y, w, h);
}

function glassWall(ctx, x, y, w, h, fins = false) {
  ctx.fillStyle = vgrad(ctx, y, y + h, ['#7fa9c6', '#3d6585', '#28455e']);
  ctx.fillRect(x, y, w, h);
  // sky reflection streak
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath(); ctx.moveTo(x + w * 0.2, y); ctx.lineTo(x + w * 0.38, y); ctx.lineTo(x + w * 0.12, y + h); ctx.lineTo(x - w * 0.06, y + h); ctx.fill();
  ctx.restore();
  ctx.fillStyle = fins ? '#8a6440' : '#c9ced2';
  for (let xx = x; xx < x + w; xx += fins ? 7 : 9) ctx.fillRect(xx, y, fins ? 2 : 1, h);
  if (!fins) for (let yy = y + 7; yy < y + h; yy += 7) ctx.fillRect(x, yy, w, 1);
}

function corrugatedWall(ctx, x, y, w, h) {
  for (let xx = x; xx < x + w; xx += 3) {
    ctx.fillStyle = (xx - x) % 6 < 3 ? '#8a949a' : '#6a7378';
    ctx.fillRect(xx, y, Math.min(3, x + w - xx), h);
  }
  ctx.fillStyle = 'rgba(120,70,40,0.18)'; // a little rust
  ctx.fillRect(x, y + h - 4, w, 4);
  ctx.fillStyle = vgrad(ctx, y, y + h, ['rgba(255,255,255,0.1)', 'rgba(0,0,0,0.12)']);
  ctx.fillRect(x, y, w, h);
}

function cedarWall(ctx, x, y, w, h, seed) {
  const r = rand(seed);
  for (let xx = x; xx < x + w; xx += 4) {
    const v = Math.floor((r() - 0.5) * 20);
    ctx.fillStyle = `rgb(${176 + v},${128 + v},${82 + v})`;
    ctx.fillRect(xx, y, Math.min(4, x + w - xx), h);
    ctx.fillStyle = 'rgba(80,50,20,0.25)';
    ctx.fillRect(xx, y, 0.8, h);
  }
  ivy(ctx, x, y, w, h, seed);
}

// Climbing plants for the Green Age look.
function ivy(ctx, x, y, w, h, seed) {
  const r = rand(seed + 9);
  const clumps = Math.max(1, Math.floor(w / 14));
  for (let k = 0; k < clumps; k++) {
    const cx = x + r() * w;
    const top = y + r() * h * 0.5;
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = r() < 0.5 ? 'rgba(74,122,48,0.85)' : 'rgba(104,152,62,0.85)';
      ctx.beginPath();
      ctx.arc(cx + (r() - 0.5) * 8, top + r() * (y + h - top), 1.4 + r() * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Stone wall with irregular blocks.
function stoneWall(ctx, x, y, w, h, seed, base = [128, 124, 116]) {
  if (STYLE === 1) { brickWall(ctx, x, y, w, h, seed); return; }
  if (STYLE === 2) { concreteWall(ctx, x, y, w, h, seed); return; }
  if (STYLE === 3) { concreteWall(ctx, x, y, w, h, seed, true); return; }
  if (STYLE === 4) base = [176, 168, 150];
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
  if (STYLE === 4) ivy(ctx, x, y, w, h, seed);
}

function plankWall(ctx, x, y, w, h, seed, base = [112, 82, 54]) {
  if (STYLE === 1) { corrugatedWall(ctx, x, y, w, h); return; }
  if (STYLE === 2) { glassWall(ctx, x, y, w, h); return; }
  if (STYLE === 3) { glassWall(ctx, x, y, w, h, true); return; }
  if (STYLE === 4) { cedarWall(ctx, x, y, w, h, seed); return; }
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
  if (STYLE === 1) { brickWall(ctx, x, y, w, h, seed); return; }
  if (STYLE === 2 || STYLE === 3) {
    concreteWall(ctx, x, y, w, h, seed, true);
    // a ribbon of glass windows
    glassWall(ctx, x, y + h * 0.3, w, Math.max(4, h * 0.25));
    if (STYLE === 3) { ctx.fillStyle = '#a0784a'; ctx.fillRect(x, y + h * 0.62, w, 3); }
    return;
  }
  if (STYLE === 4) { cedarWall(ctx, x, y, w, h, seed); return; }
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
  if (STYLE >= 2) {
    ctx.fillStyle = '#5e6266';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = vgrad(ctx, y, y + h, ['#a9cbe0', '#4f7a99']);
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(x + 1, y + 1, Math.max(1, w * 0.3), 1);
    return;
  }
  ctx.fillStyle = '#2b2118';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = vgrad(ctx, y, y + h, ['#e9c27a', '#b98a43']);
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#2b2118';
  ctx.fillRect(x + w / 2 - 0.5, y, 1, h);
}

function door(ctx, x, y, w, h, arch = true) {
  if (STYLE >= 2) {
    ctx.fillStyle = '#4a4e52';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 1);
    ctx.fillStyle = vgrad(ctx, y, y + h, ['#5a7f9a', '#2a3e4e']);
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#4a4e52';
    ctx.fillRect(x + w / 2 - 0.5, y, 1, h);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(x + 1, y + 1, 1, h - 2);
    return;
  }
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
  if (STYLE >= 2) { flatRoof(ctx, x0, y0, x1, y1, z, seed); return; }
  let [light, dark] = roof;
  if (STYLE === 1) { light = '#7a7f86'; dark = '#3a3e44'; } // slate
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
  // Industrial Age: a brick chimney on every pitched roof
  if (STYLE === 1 && x1 - x0 >= 14 && y1 - y0 >= 14) {
    const cx = x0 + (x1 - x0) * 0.25;
    const cy = y0 + (y1 - y0) * 0.25;
    wallL(ctx, cx, cx + 5, cy + 5, rh + 9, (c, w, h) => brickWall(c, 0, 0, w, h, seed), 0, z);
    wallR(ctx, cy, cy + 5, cx + 5, rh + 9, (c, w, h) => brickWall(c, 0, 0, w, h, seed + 1), 0.25, z);
    diamond(ctx, cx, cy, cx + 5, cy + 5, z + rh + 9);
    ctx.fillStyle = '#2a2420';
    ctx.fill();
  }
}

// Flat roofs for the Modern, Transition and Green looks.
function flatRoof(ctx, x0, y0, x1, y1, z, seed) {
  const r = rand(seed + 5);
  diamond(ctx, x0, y0, x1, y1, z);
  if (STYLE === 4) {
    ctx.fillStyle = rgrad(ctx, ...P((x0 + x1) / 2, (y0 + y1) / 2, z), 2, Math.max(x1 - x0, y1 - y0), ['#86b45a', '#5d8a3e']);
  } else ctx.fillStyle = STYLE === 3 ? '#d6d3ca' : '#8f8c84';
  ctx.fill();
  // parapet
  ctx.strokeStyle = STYLE === 4 ? '#7a6a52' : '#cfccc4';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  const w = x1 - x0;
  const h = y1 - y0;
  if (STYLE === 2) {
    // air-conditioning boxes and a vent
    const n = Math.max(1, Math.floor((w * h) / 500));
    for (let i = 0; i < n; i++) {
      const bx = x0 + 3 + r() * Math.max(1, w - 12);
      const by = y0 + 3 + r() * Math.max(1, h - 12);
      wallL(ctx, bx, bx + 7, by + 6, 5, (c, ww, hh) => { c.fillStyle = '#a7aaad'; c.fillRect(0, 0, ww, hh); c.fillStyle = '#7d8083'; c.fillRect(1, 1, ww - 2, 1); }, 0, z);
      wallR(ctx, by, by + 6, bx + 7, 5, (c, ww, hh) => { c.fillStyle = '#8e9194'; c.fillRect(0, 0, ww, hh); }, 0.2, z);
      diamond(ctx, bx, by, bx + 7, by + 6, z + 5);
      ctx.fillStyle = '#b9bcbf'; ctx.fill();
      const f = P(bx + 3.5, by + 3, z + 5);
      ctx.fillStyle = '#4a4d50'; ctx.beginPath(); ctx.ellipse(f[0], f[1], 2.2, 1.1, 0, 0, Math.PI * 2); ctx.fill();
    }
  } else if (STYLE === 3) {
    // rows of solar panels
    for (let yy = y0 + 3; yy + 7 < y1; yy += 9) {
      const a = P(x0 + 3, yy, z + 3);
      const b = P(x0 + 3, yy + 6, z + 1);
      quad(ctx, a, [1, 0.5], [(b[0] - a[0]) / 6, (b[1] - a[1]) / 6], w - 6, 6, (c, ww, hh) => {
        c.fillStyle = vgrad(c, 0, hh, ['#3b6aa0', '#1d3554']); c.fillRect(0, 0, ww, hh);
        c.fillStyle = 'rgba(170,200,230,0.45)';
        for (let gx = 0; gx < ww; gx += 5) c.fillRect(gx, 0, 0.6, hh);
      });
    }
  } else {
    // green roof: shrubs and wildflowers
    const n = Math.max(3, Math.floor((w * h) / 120));
    for (let i = 0; i < n; i++) {
      const p = P(x0 + 3 + r() * (w - 6), y0 + 3 + r() * (h - 6), z);
      ctx.fillStyle = r() < 0.5 ? '#4a7a32' : '#6a9a42';
      ctx.beginPath(); ctx.arc(p[0], p[1] - 1.5, 2 + r() * 2.5, 0, Math.PI * 2); ctx.fill();
      if (r() < 0.3) { ctx.fillStyle = r() < 0.5 ? '#f2d24a' : '#e8e8f0'; ctx.fillRect(p[0] + 1, p[1] - 3, 1.2, 1.2); }
    }
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
  if (STYLE >= 2) {
    // modern towers get a flat cap with an antenna instead of a spire
    ctx.fillStyle = STYLE === 4 ? '#5d8a3e' : '#8e9296';
    ctx.beginPath(); ctx.ellipse(top[0], top[1], rx + 2, ry + 1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.strokeStyle = '#4a4e52'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.lineTo(top[0], top[1] - h * 0.8); ctx.stroke();
    ctx.fillStyle = '#d33'; ctx.fillRect(top[0] - 1, top[1] - h * 0.8 - 1, 2, 2);
    return;
  }
  if (STYLE === 1) { light = '#7c8288'; dark = '#3a3e42'; }
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
const brickFace = (seed) => (c, w, h) => (STYLE === 0 ? brickWall(c, 0, 0, w, h, seed) : stoneWall(c, 0, 0, w, h, seed, [132, 72, 54]));

function bannerL(ctx, x, y, z, team) {
  // a banner hanging on the front-left wall at grid x, wall y, top height z
  quad(ctx, P(x, y, z), [1, 0.5], [0, 1], 12, 22, (c) => banner(c, 0, 0, 18, team));
}

// A market stall: wooden counter with goods, four posts and a striped awning sloping to the front.
function stall(ctx, x0, y0, x1, y1, stripeA, stripeB, goods) {
  const post = (x, y, z) => {
    const a = P(x, y, 0);
    const b = P(x, y, z);
    ctx.fillStyle = '#3e2a18';
    ctx.fillRect(a[0] - 1, b[1], 2, a[1] - b[1]);
  };
  post(x0, y0, 22);
  post(x1, y0, 22);
  house(ctx, { x0, y0, x1, y1, z: 7, wallLeft: plankFace(x0 * 3 + y0, [126, 92, 58]), wallRight: plankFace(x0 + y0 * 3, [126, 92, 58]) });
  diamond(ctx, x0, y0, x1, y1, 7);
  ctx.fillStyle = '#8a6440';
  ctx.fill();
  // goods heaped on the counter
  const r = rand(x0 * 7 + y0);
  for (let i = 0; i < 9; i++) {
    const g = P(x0 + 3 + r() * (x1 - x0 - 6), y0 + 3 + r() * (y1 - y0 - 6), 9);
    ctx.fillStyle = goods[i % goods.length];
    ctx.beginPath();
    ctx.ellipse(g[0], g[1], 3, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  post(x0, y1, 15);
  post(x1, y1, 15);
  const r0 = P(x0 - 2, y0 - 1, 22);
  const fe = P(x0 - 2, y1 + 4, 15);
  const L = Math.hypot(y1 + 5 - y0, 7);
  quad(ctx, r0, [1, 0.5], [(fe[0] - r0[0]) / L, (fe[1] - r0[1]) / L], x1 - x0 + 4, L, (c, w, h) => {
    for (let x = 0, k = 0; x < w; x += 5, k++) { c.fillStyle = k % 2 ? stripeA : stripeB; c.fillRect(x, 0, 5, h); }
    c.fillStyle = 'rgba(0,0,0,0.18)';
    c.fillRect(0, h - 2, w, 2);
    // scalloped edge
    c.fillStyle = stripeA;
    for (let x = 0; x < w; x += 5) { c.beginPath(); c.arc(x + 2.5, h, 2.5, 0, Math.PI); c.fill(); }
  });
}

// One tile of wall: a stone block with a walkway on top and merlons on the corners.
// `door` optionally draws on the front faces (for gates).
function wallBlock(ctx, team, seed, door, Z = 26) {
  const face = (s) => (c, w, h) => { stoneWall(c, 0, 0, w, h, s, [122, 116, 106]); if (door) door(c, w, h); };
  wallL(ctx, 0, 32, 32, Z, face(seed), 0);
  wallR(ctx, 0, 32, 32, Z, face(seed + 1), 0.24);
  // team-coloured band just below the top
  wallL(ctx, 0, 32, 32, 2, (c, w) => { c.fillStyle = TEAM_RGB[team].main; c.fillRect(0, 0, w, 2); }, 0, Z - 5);
  wallR(ctx, 0, 32, 32, 2, (c, w) => { c.fillStyle = TEAM_RGB[team].dark; c.fillRect(0, 0, w, 2); }, 0, Z - 5);
  // walkway
  diamond(ctx, 0, 0, 32, 32, Z);
  ctx.fillStyle = '#8f897e';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 0.75;
  ctx.stroke();
  // merlons, back to front
  for (const [x, y] of [[0, 0], [13, 0], [0, 13], [26, 0], [0, 26], [26, 13], [13, 26], [26, 26]]) {
    if (x === 13 && y === 13) continue;
    house(ctx, { x0: x, y0: y, x1: x + 6, y1: y + 6, z: 6, zb: Z, wallLeft: stoneFace(seed + x + y, [138, 132, 120]) });
    diamond(ctx, x, y, x + 6, y + 6, Z + 6);
    ctx.fillStyle = '#a49e92';
    ctx.fill();
  }
}

// Facade with a grid of windows and little balconies (apartment blocks).
function apartmentFace(seed, team, balconies) {
  return (c, w, h) => {
    if (STYLE === 4) cedarWall(c, 0, 0, w, h, seed);
    else concreteWall(c, 0, 0, w, h, seed, STYLE === 3);
    const r = rand(seed);
    for (let y = 6; y < h - 10; y += 11) {
      for (let x = 4; x < w - 6; x += 9) {
        windowLitModern(c, x, y, 5, 6, r() < 0.35);
        if (balconies && (x / 9) % 2 < 1) { c.fillStyle = '#d7d4cc'; c.fillRect(x - 1, y + 7, 7, 1.5); c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(x - 1, y + 8.5, 7, 1); }
      }
    }
    c.fillStyle = TEAM_RGB[team].main; c.fillRect(0, h - 9, w, 2);
    door(c, w / 2 - 4, h - 9, 8, 9, false);
  };
}
function windowLitModern(c, x, y, w, h, lit) {
  c.fillStyle = '#5e6266'; c.fillRect(x - 0.5, y - 0.5, w + 1, h + 1);
  c.fillStyle = lit ? vgrad(c, y, y + h, ['#f2d590', '#c99a4a']) : vgrad(c, y, y + h, ['#a9cbe0', '#4f7a99']);
  c.fillRect(x, y, w, h);
}

export const BUILDING_POINTS = {
  factory: { smoke: [P(76, 20, 98)] },
  wind_turbine: { hub: P(32, 32, 88) },
  power_plant: { smoke: [P(80, 18, 104), P(84, 44, 90)] },
  geothermal: { smoke: [P(26, 26, 62), P(66, 30, 52)] },
  hydro_dam: { smoke: [P(34, 60, 2), P(52, 60, 2)] },
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

  // Lumber camp (1×1): an open lean-to with a stack of logs, a chopping block and a team pennant.
  lumber_camp(ctx, team) {
    isoShadow(ctx, 3, 3, 29, 29, 16);
    // trampled ground with sawdust
    diamond(ctx, 1, 1, 31, 31);
    ctx.fillStyle = 'rgba(120,92,58,0.55)';
    ctx.fill();
    const r = rand(71);
    for (let i = 0; i < 26; i++) {
      const q = P(3 + r() * 26, 3 + r() * 26);
      ctx.fillStyle = `rgba(${210 + r() * 30},${180 + r() * 30},${120 + r() * 30},0.6)`;
      ctx.fillRect(q[0], q[1], 1, 0.8);
    }
    // back posts + sloping plank roof (high at the back)
    const post = (x, y, z) => { const b = P(x, y), t = P(x, y, z); ctx.fillStyle = '#4a321e'; ctx.fillRect(t[0] - 1, t[1], 2, b[1] - t[1]); };
    post(4, 4, 20); post(26, 4, 20);
    // log stack under the roof: ends of logs facing front-left
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 4 - row; i++) {
        const q = P(6 + i * 5 + row * 2.5, 22, 3 + row * 4.6);
        ctx.fillStyle = rgrad(ctx, q[0] - 0.6, q[1] - 0.6, 0.3, 2.6, ['#e9c991', '#c99a5e', '#8a5e34']);
        ctx.beginPath(); ctx.ellipse(q[0], q[1], 2.6, 2.4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#5e3c1e'; ctx.lineWidth = 0.7; ctx.stroke();
        ctx.strokeStyle = 'rgba(120,80,40,0.6)'; ctx.lineWidth = 0.4;
        ctx.beginPath(); ctx.ellipse(q[0], q[1], 1.2, 1.1, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
    // the logs' long sides, running back under the roof
    wallR(ctx, 6, 22, 24, 13, (c, w, h) => {
      for (let y = 0; y < h; y += 4.4) {
        c.fillStyle = vgrad(c, y, y + 4.4, ['#9a6c40', '#7a5230', '#5a3a20']);
        c.fillRect(0, y, w, 4.2);
      }
    }, 0.15);
    // roof
    const a = P(1, 1, 22), b = P(30, 1, 22), c2 = P(30, 26, 15), d = P(1, 26, 15);
    ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...c2); ctx.lineTo(...d); ctx.closePath();
    ctx.save(); ctx.clip();
    ctx.fillStyle = vgrad(ctx, a[1], d[1], ['#8e6a44', '#6a4a2c']);
    ctx.fillRect(d[0] - 2, a[1] - 2, b[0] - d[0] + 4, c2[1] - a[1] + 4);
    ctx.strokeStyle = 'rgba(40,24,12,0.45)'; ctx.lineWidth = 0.7;
    for (let x = 1; x < 31; x += 3.6) { const p0 = P(x, 1, 22), p1 = P(x, 26, 15); ctx.beginPath(); ctx.moveTo(...p0); ctx.lineTo(...p1); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.moveTo(...d); ctx.lineTo(...c2); ctx.lineTo(c2[0], c2[1] + 1.5); ctx.lineTo(d[0], d[1] + 1.5); ctx.fill();
    post(1, 26, 15); post(30, 26, 15);
    // chopping block with an axe, at the front corner
    const cb = P(26, 30);
    ctx.fillStyle = hgrad(ctx, cb[0] - 3, cb[0] + 3, ['#6a4a2c', '#9a7048', '#5a3a20']);
    ctx.fillRect(cb[0] - 3, cb[1] - 4, 6, 4);
    ctx.fillStyle = '#c99a5e'; ctx.beginPath(); ctx.ellipse(cb[0], cb[1] - 4, 3, 1.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#5a3a20'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cb[0], cb[1] - 4.5); ctx.lineTo(cb[0] + 4, cb[1] - 10); ctx.stroke();
    ctx.fillStyle = '#b4bac0'; poly(ctx, [[cb[0] - 1, cb[1] - 5.5], [cb[0] + 1.5, cb[1] - 7], [cb[0] + 0.5, cb[1] - 3.5]]); ctx.fill();
    // pennant on the roof
    const fp = P(28, 3, 22);
    ctx.fillStyle = '#3a2a1a'; ctx.fillRect(fp[0], fp[1] - 12, 1, 12);
    ctx.fillStyle = TEAM_RGB[team].main; poly(ctx, [[fp[0] + 1, fp[1] - 12], [fp[0] + 8, fp[1] - 10], [fp[0] + 1, fp[1] - 8]]); ctx.fill();
  },

  // Mining camp (1×1): a sturdy hut with a cart of stone and coal and a pickaxe.
  mining_camp(ctx, team) {
    isoShadow(ctx, 3, 3, 29, 29, 18);
    diamond(ctx, 1, 1, 31, 31);
    ctx.fillStyle = 'rgba(96,90,82,0.55)';
    ctx.fill();
    const r = rand(83);
    for (let i = 0; i < 20; i++) {
      const q = P(2 + r() * 28, 2 + r() * 28);
      ctx.fillStyle = r() < 0.5 ? 'rgba(40,38,36,0.7)' : 'rgba(170,166,158,0.7)';
      ctx.fillRect(q[0], q[1], 1.2, 0.9);
    }
    // timber hut at the back
    house(ctx, {
      x0: 3, y0: 3, x1: 19, y1: 19, z: 13, ridge: 'y', rh: 9, ov: 2, seed: 84,
      roof: ['#7c7468', '#45403a'],
      wallLeft: (c, w, h) => { plankWall(c, 0, 0, w, h, 85, [104, 84, 60]); c.fillStyle = '#1a120c'; c.fillRect(w / 2 - 3, h - 9, 6, 9); },
      wallRight: plankFace(86, [104, 84, 60]),
    });
    wallL(ctx, 3, 19, 19, 11, (c, w) => { c.fillStyle = TEAM_RGB[team].main; c.fillRect(0, 0, w, 1.6); });
    // ore cart on little rails
    ctx.strokeStyle = '#3a3634'; ctx.lineWidth = 0.8;
    for (const off of [-1.5, 1.5]) { const p0 = P(19 + off, 22), p1 = P(19 + off, 31); ctx.beginPath(); ctx.moveTo(...p0); ctx.lineTo(...p1); ctx.stroke(); }
    const cx = 19, cy = 26;
    wallL(ctx, cx - 4, cx + 4, cy + 3, 5, (c, w, h) => { c.fillStyle = vgrad(c, 0, h, ['#6a5a48', '#3e342a']); c.fillRect(0, 0, w, h); c.fillStyle = '#2a2420'; c.fillRect(0, 0, w, 0.8); }, 0, 1);
    wallR(ctx, cy - 3, cy + 3, cx + 4, 5, (c, w, h) => { c.fillStyle = vgrad(c, 0, h, ['#5a4a3a', '#30281e']); c.fillRect(0, 0, w, h); }, 0.2, 1);
    for (let i = 0; i < 7; i++) {
      const q = P(cx - 3 + r() * 6, cy - 2 + r() * 4, 7 + r() * 1.5);
      ctx.fillStyle = i % 2 ? '#2a2826' : '#a8a296';
      ctx.beginPath(); ctx.arc(q[0], q[1], 1.5 + r() * 0.7, 0, Math.PI * 2); ctx.fill();
    }
    for (const [wx, wy] of [[cx - 3, cy + 3], [cx + 3, cy + 3]]) { const q = P(wx, wy, 1); ctx.fillStyle = '#1e1c1a'; ctx.beginPath(); ctx.arc(q[0], q[1], 1.3, 0, Math.PI * 2); ctx.fill(); }
    // pickaxe leaning on the hut
    const pk = P(21, 12);
    ctx.strokeStyle = '#6a4a2c'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pk[0], pk[1]); ctx.lineTo(pk[0] + 2, pk[1] - 10); ctx.stroke();
    ctx.strokeStyle = '#9aa0a6'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(pk[0] - 2.5, pk[1] - 8.5); ctx.quadraticCurveTo(pk[0] + 2, pk[1] - 11.5, pk[0] + 6, pk[1] - 8); ctx.stroke();
    // lantern
    const ln = P(19, 11, 10);
    ctx.fillStyle = 'rgba(255,200,90,0.35)'; ctx.beginPath(); ctx.arc(ln[0], ln[1], 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd27a'; ctx.fillRect(ln[0] - 0.8, ln[1] - 1, 1.6, 2);
  },

  // Mill (2×2): a stone base with a windmill (or a modern grain silo in later eras) and sacks of flour.
  mill(ctx, team) {
    // a cobbled yard
    diamond(ctx, 3, 3, 61, 61);
    ctx.fillStyle = 'rgba(132,116,92,0.5)';
    ctx.fill();
    const rr = rand(64);
    for (let i = 0; i < 60; i++) {
      const q = P(5 + rr() * 54, 5 + rr() * 54);
      ctx.fillStyle = `rgba(${150 + rr() * 50},${135 + rr() * 45},${110 + rr() * 40},0.7)`;
      ctx.beginPath(); ctx.ellipse(q[0], q[1], 1.6, 0.9, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (STYLE >= 2) isoShadow(ctx, 8, 8, 56, 56, 30);
    else isoShadow(ctx, 16, 16, 42, 42, 36);
    if (STYLE >= 2) {
      // grain elevator: concrete silos + a shed
      house(ctx, {
        x0: 8, y0: 30, x1: 56, y1: 56, z: 16, ridge: 'x', rh: 8, ov: 2, seed: 61,
        roof: ['#8a8f94', '#4a4e52'],
        wallLeft: (c, w, h) => { (STYLE === 4 ? cedarWall : corrugatedWall)(c, 0, 0, w, h, 62); c.fillStyle = '#26282a'; c.fillRect(w / 2 - 7, h - 13, 14, 13); },
        wallRight: (c, w, h) => corrugatedWall(c, 0, 0, w, h),
      });
      for (const [x, y] of [[18, 18], [34, 16]]) {
        cylinder(ctx, x, y, 8, 0, 50, (c, X, Y, W, H) => { c.fillStyle = hgrad(c, X, X + W, ['#cfd2d4', '#e8eaec', '#a4a8ac']); c.fillRect(X, Y, W, H);
          c.fillStyle = 'rgba(0,0,0,0.12)'; for (let yy = Y + 6; yy < Y + H; yy += 7) c.fillRect(X, yy, W, 1); }, '#b8bcc0');
      }
      wallL(ctx, 8, 56, 56, 14, (c, w) => { c.fillStyle = TEAM_RGB[team].main; c.fillRect(0, 0, w, 2); });
      return;
    }
    // round stone tower
    const t = cylinder(ctx, 29, 29, 14, 0, 42, (c, X, Y, W, H) => {
      if (STYLE === 1) brickWall(c, X, Y, W, H, 63); else stoneWall(c, X, Y, W, H, 63, [150, 140, 122]);
    });
    // door and window
    const dp = P(28, 41, 12);
    ctx.fillStyle = '#2a1c10'; ctx.beginPath(); ctx.moveTo(dp[0] - 4, dp[1] + 12); ctx.lineTo(dp[0] - 4, dp[1] + 3); ctx.arc(dp[0], dp[1] + 3, 4, Math.PI, 0); ctx.lineTo(dp[0] + 4, dp[1] + 12); ctx.fill();
    windowLit(ctx, dp[0] + 8, dp[1] - 16, 5, 6);
    // conical thatched cap
    cone(ctx, t.top, t.rx + 2, t.ry + 1, 18, '#c49a5e', '#6e5230');
    // sails, turned towards the viewer
    const hub = [t.top[0] + 1, t.top[1] - 4];
    ctx.save();
    ctx.translate(hub[0], hub[1]);
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = '#5a3e26'; ctx.fillRect(-1, 0, 2, 30);
      ctx.fillStyle = 'rgba(236,226,200,0.92)';
      ctx.fillRect(1, 6, 7, 22);
      ctx.strokeStyle = 'rgba(90,62,38,0.7)'; ctx.lineWidth = 0.6;
      for (let y = 9; y < 28; y += 4) { ctx.beginPath(); ctx.moveTo(1, y); ctx.lineTo(8, y); ctx.stroke(); }
    }
    ctx.fillStyle = '#3a2a1a'; ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // flour sacks and a team banner
    for (const [x, y] of [[50, 44], [54, 40], [52, 50]]) {
      const q = P(x, y);
      ctx.fillStyle = rgrad(ctx, q[0] - 1, q[1] - 5, 0.5, 5, ['#f2ead6', '#d6cab0', '#a89a7c']);
      ctx.beginPath(); ctx.ellipse(q[0], q[1] - 3.5, 3.4, 4.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8a7a5a'; ctx.fillRect(q[0] - 1.2, q[1] - 8, 2.4, 1.2);
    }
    bannerL(ctx, 18, 41, 22, team);
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

  // Apartment block: a tall concrete block of flats with balconies.
  apartments(ctx, team) {
    isoShadow(ctx, 4, 4, 60, 60, 60);
    diamond(ctx, 2, 2, 62, 62);
    ctx.fillStyle = '#9a978e'; ctx.fill();
    house(ctx, {
      x0: 8, y0: 8, x1: 56, y1: 56, z: 74, seed: 61, roof: ['#888', '#666'],
      wallLeft: apartmentFace(61, team, true), wallRight: apartmentFace(62, team, false),
    });
  },

  // Office tower: a glass skyscraper on a stone lobby, with a lit crown.
  office(ctx, team) {
    isoShadow(ctx, 6, 6, 58, 58, 90);
    diamond(ctx, 2, 2, 62, 62);
    ctx.fillStyle = '#a8a59c'; ctx.fill();
    house(ctx, {
      x0: 8, y0: 8, x1: 56, y1: 56, z: 12,
      wallLeft: (c, w, h) => { concreteWall(c, 0, 0, w, h, 71, true); door(c, w / 2 - 6, h - 11, 12, 11, false); },
      wallRight: (c, w, h) => concreteWall(c, 0, 0, w, h, 72, true),
    });
    const glass = (fins) => (c, w, h) => {
      if (STYLE === 4) { glassWall(c, 0, 0, w, h, true); ivy(c, 0, 0, w, h, 7); } else glassWall(c, 0, 0, w, h, fins);
      c.fillStyle = TEAM_RGB[team].main; c.fillRect(0, 0, w, 2);
    };
    house(ctx, { x0: 12, y0: 12, x1: 52, y1: 52, z: 70, zb: 12, wallLeft: glass(false), wallRight: glass(STYLE === 3) });
    // crown
    house(ctx, { x0: 20, y0: 20, x1: 44, y1: 44, z: 10, zb: 82, seed: 73, roof: ['#999', '#777'],
      wallLeft: (c, w, h) => { c.fillStyle = '#d8d5cd'; c.fillRect(0, 0, w, h); c.fillStyle = TEAM_RGB[team].main; c.fillRect(2, 3, w - 4, 3); } });
    const a = P(32, 32, 92);
    ctx.strokeStyle = '#4a4e52'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(a[0], a[1] - 14); ctx.stroke();
    ctx.fillStyle = '#e33'; ctx.fillRect(a[0] - 1, a[1] - 15, 2, 2);
  },

  // Factory: a saw-tooth roofed hall, a loading bay and a tall chimney.
  factory(ctx, team) {
    isoShadow(ctx, 6, 6, 92, 92, 46);
    diamond(ctx, 2, 2, 94, 94);
    ctx.fillStyle = '#8a857a'; ctx.fill();
    const wallA = (c, w, h) => { brickWall(c, 0, 0, w, h, 81); for (let x = 6; x < w - 8; x += 13) windowLitModern(c, x, 5, 8, 9, false); c.fillStyle = TEAM_RGB[team].main; c.fillRect(0, 1, w, 2); };
    const wallB = (c, w, h) => { brickWall(c, 0, 0, w, h, 82); c.fillStyle = '#4a4e52'; c.fillRect(w / 2 - 11, h - 18, 22, 18); c.fillStyle = '#6a6e72'; for (let y = h - 17; y < h; y += 3) c.fillRect(w / 2 - 10, y, 20, 1.5); };
    house(ctx, { x0: 6, y0: 30, x1: 70, y1: 90, z: 26, wallLeft: wallA, wallRight: wallB });
    // saw-tooth roof: three north-light ridges
    for (let k = 0; k < 3; k++) {
      const y0 = 30 + k * 20;
      const a = P(6, y0, 26), b = P(6, y0 + 20, 26 + 10);
      quad(ctx, a, [1, 0.5], [(b[0] - a[0]) / 20, (b[1] - a[1]) / 20], 64, 20, (c, w, h) => {
        c.fillStyle = vgrad(c, 0, h, ['#6f747a', '#4a4e54']); c.fillRect(0, 0, w, h);
      });
      const g = P(6, y0 + 20, 36), g2 = P(6, y0 + 20, 26);
      quad(ctx, g, [1, 0.5], [(g2[0] - g[0]) / 10, (g2[1] - g[1]) / 10], 64, 10, (c, w, h) => { glassWall(c, 0, 0, w, h); });
    }
    // chimney and a silo
    cylinder(ctx, 76, 20, 6, 0, 98, (c, cx, cy, w, h) => {
      brickWall(c, cx, cy, w, h, 83);
      c.fillStyle = 'rgba(235,235,225,0.75)'; c.fillRect(cx, cy + 8, w, 3);
    }, '#1d1d1d');
    cylinder(ctx, 82, 50, 8, 0, 40, (c, cx, cy, w, h) => { c.fillStyle = hgrad(c, cx, cx + w, ['#d8dade', '#9a9ea4']); c.fillRect(cx, cy, w, h); }, '#8a8e92');
  },

  // Radar station: a hut with a lattice mast and a big dish.
  radar(ctx, team) {
    isoShadow(ctx, 4, 4, 60, 60, 40);
    diamond(ctx, 2, 2, 62, 62);
    ctx.fillStyle = '#8f8c84'; ctx.fill();
    house(ctx, {
      x0: 6, y0: 30, x1: 34, y1: 58, z: 16, seed: 91, roof: ['#888', '#666'],
      wallLeft: (c, w, h) => { concreteWall(c, 0, 0, w, h, 91, STYLE === 3); door(c, w / 2 - 4, h - 10, 8, 10, false); c.fillStyle = TEAM_RGB[team].main; c.fillRect(0, 1, w, 2); },
    });
    // lattice mast
    const base = P(44, 22, 0), top = P(44, 22, 70);
    ctx.strokeStyle = '#5a5e62'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(base[0] - 7, base[1]); ctx.lineTo(top[0] - 1.5, top[1]);
    ctx.moveTo(base[0] + 7, base[1]); ctx.lineTo(top[0] + 1.5, top[1]);
    for (let k = 0; k < 7; k++) {
      const t0 = k / 7, t1 = (k + 1) / 7;
      const lx0 = base[0] - 7 + 5.5 * t0, rx0 = base[0] + 7 - 5.5 * t0, y0 = base[1] + (top[1] - base[1]) * t0;
      const lx1 = base[0] - 7 + 5.5 * t1, rx1 = base[0] + 7 - 5.5 * t1, y1 = base[1] + (top[1] - base[1]) * t1;
      ctx.moveTo(lx0, y0); ctx.lineTo(rx1, y1); ctx.moveTo(rx0, y0); ctx.lineTo(lx1, y1);
    }
    ctx.stroke();
    // dish
    ctx.save();
    ctx.translate(top[0], top[1] - 4);
    ctx.rotate(-0.35);
    ctx.fillStyle = hgrad(ctx, -14, 14, ['#f2f3f4', '#b9bcc0']);
    ctx.beginPath(); ctx.ellipse(0, 0, 14, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#7d8083'; ctx.lineWidth = 1; ctx.stroke();
    ctx.strokeStyle = '#5a5e62';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(9, -6); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = TEAM_RGB[team].main; ctx.fillRect(top[0] - 2, top[1] + 4, 4, 3);
  },

  // Fishing dock: a plank jetty with a net shed, drying racks and a rowing boat.
  fishing_dock(ctx, team) {
    isoShadow(ctx, 4, 4, 60, 60, 18);
    diamond(ctx, 2, 2, 62, 62, 3);
    ctx.fillStyle = '#8a6a44';
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,26,14,0.45)';
    ctx.lineWidth = 0.8;
    for (let x = 8; x < 62; x += 6) { const a = P(x, 2, 3); const b = P(x, 62, 3); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    // front posts into the water
    ctx.fillStyle = '#4a3220';
    for (const [x, y] of [[62, 62], [62, 34], [34, 62]]) { const q = P(x, y, 3); ctx.fillRect(q[0] - 1.5, q[1], 3, 7); }
    house(ctx, {
      x0: 6, y0: 6, x1: 30, y1: 28, z: 16, ridge: 'x', rh: 10, ov: 2, seed: 21,
      roof: ['#7a5a3a', '#3e2a18'],
      wallLeft: (c, w, h) => { plankWall(c, 0, 0, w, h, 23); door(c, w / 2 - 5, h - 12, 10, 12, false); },
      wallRight: (c, w, h) => { plankWall(c, 0, 0, w, h, 24); c.fillStyle = TEAM_RGB[team].main; c.fillRect(0, 2, w, 2); },
    });
    // net drying rack
    const a = P(40, 10, 0), b = P(40, 30, 0);
    ctx.strokeStyle = '#3e2a18'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(a[0], a[1] - 16); ctx.moveTo(b[0], b[1]); ctx.lineTo(b[0], b[1] - 16); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(a[0], a[1] - 16); ctx.lineTo(b[0], b[1] - 16); ctx.stroke();
    ctx.strokeStyle = 'rgba(210,200,170,0.75)'; ctx.lineWidth = 0.6;
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      const x = a[0] + (b[0] - a[0]) * t;
      const y = a[1] - 16 + (b[1] - a[1]) * t;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 11); ctx.stroke();
    }
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(a[0], a[1] - 14 + k * 3.5); ctx.lineTo(b[0], b[1] - 14 + k * 3.5); ctx.stroke(); }
    // fish basket and barrel
    const f = P(48, 46, 3);
    ctx.fillStyle = '#8a6a3a'; ctx.beginPath(); ctx.ellipse(f[0], f[1], 6, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c8d2d8';
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(f[0] - 3 + k * 2, f[1] - 1.5, 2.2, 0.9, 0.3, 0, Math.PI * 2); ctx.fill(); }
    const br = P(20, 44, 3);
    barrel(ctx, br[0] - 3, br[1] - 9);
    // rowing boat tied up at the front
    const bt = P(56, 58, 0);
    ctx.fillStyle = '#5a3c22';
    ctx.beginPath(); ctx.ellipse(bt[0] + 10, bt[1] + 6, 11, 4, -0.45, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8a6440';
    ctx.beginPath(); ctx.ellipse(bt[0] + 10, bt[1] + 5, 9, 2.6, -0.45, 0, Math.PI * 2); ctx.fill();
  },

  // Hydro dam: a concrete wall with water pouring through, a turbine house and a pylon.
  hydro_dam(ctx, team) {
    isoShadow(ctx, 2, 2, 62, 62, 26);
    const concrete = (seed) => (c, w, h) => {
      c.fillStyle = vgrad(c, 0, h, ['#b9b5aa', '#9a968a', '#7e7a70']);
      c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(0,0,0,0.12)';
      for (let x = 6; x < w; x += 9) c.fillRect(x, 0, 1, h);
      // two spillways with white water
      for (const sx of [w * 0.28, w * 0.62]) {
        const g = vgrad(c, 4, h, ['#d8eef8', '#7fb6d8', '#e8f6ff']);
        c.fillStyle = g; c.fillRect(sx, 6, 7, h - 6);
        c.fillStyle = 'rgba(255,255,255,0.7)';
        for (let y = 8; y < h; y += 4) c.fillRect(sx + ((y * 7 + seed) % 5), y, 1.5, 2);
      }
      c.fillStyle = TEAM_RGB[team].main; c.fillRect(0, 1, w, 2);
    };
    house(ctx, { x0: 2, y0: 8, x1: 62, y1: 56, z: 22, wallLeft: concrete(3), wallRight: concrete(7) });
    diamond(ctx, 2, 8, 62, 56, 22);
    ctx.fillStyle = '#a8a498'; ctx.fill();
    // turbine house on top
    house(ctx, {
      x0: 10, y0: 16, x1: 34, y1: 36, z: 12, zb: 22, ridge: 'x', rh: 6, ov: 1, seed: 44,
      roof: ['#4f6a7a', '#2a3a44'],
      wallLeft: (c, w, h) => { c.fillStyle = '#d0ccc0'; c.fillRect(0, 0, w, h); c.fillStyle = '#2a3440'; for (let x = 4; x < w - 3; x += 7) c.fillRect(x, 3, 4, 5); },
    });
    // pylon
    const p0 = P(50, 26, 22);
    ctx.strokeStyle = '#4a4e52'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(p0[0] - 4, p0[1]); ctx.lineTo(p0[0], p0[1] - 26); ctx.lineTo(p0[0] + 4, p0[1]);
    ctx.moveTo(p0[0] - 7, p0[1] - 18); ctx.lineTo(p0[0] + 7, p0[1] - 18); ctx.moveTo(p0[0] - 5, p0[1] - 23); ctx.lineTo(p0[0] + 5, p0[1] - 23); ctx.stroke();
  },

  // Geothermal plant: steaming cooling towers over a hot spring, with pipes.
  geothermal(ctx, team) {
    isoShadow(ctx, 6, 6, 90, 90, 40);
    diamond(ctx, 2, 2, 94, 94);
    ctx.fillStyle = '#8c7e66'; ctx.fill();
    // hot pool
    const pool = P(70, 72);
    ctx.fillStyle = rgrad(ctx, pool[0], pool[1], 2, 18, ['#bfeef0', '#5fb8c4', '#3d8a96']);
    ctx.beginPath(); ctx.ellipse(pool[0], pool[1], 18, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#d8c9a0'; ctx.lineWidth = 2; ctx.stroke();
    // control building
    house(ctx, {
      x0: 46, y0: 52, x1: 86, y1: 84, z: 16, ridge: 'y', rh: 6, ov: 1, seed: 91,
      roof: ['#6c7378', '#3a4044'],
      wallLeft: (c, w, h) => { c.fillStyle = '#dcd8cc'; c.fillRect(0, 0, w, h); c.fillStyle = TEAM_RGB[team].main; c.fillRect(0, 2, w, 2); door(c, w / 2 - 5, h - 11, 10, 11, false); },
      wallRight: (c, w, h) => { c.fillStyle = '#c8c4b8'; c.fillRect(0, 0, w, h); c.fillStyle = '#2a3440'; for (let x = 5; x < w - 4; x += 8) c.fillRect(x, 4, 4, 5); },
    });
    // cooling towers (curved concrete)
    for (const [x, y, z, r] of [[26, 26, 62, 15], [66, 30, 52, 12]]) {
      cylinder(ctx, x, y, r, 0, z, (c, cx, cy, w, h) => {
        c.fillStyle = hgrad(c, cx, cx + w, ['#efebe2', '#cfcac0', '#9c978e']);
        c.fillRect(cx, cy, w, h);
        c.fillStyle = 'rgba(0,0,0,0.08)'; c.fillRect(cx, cy + h * 0.3, w, 2);
        c.fillStyle = TEAM_RGB[team].main; c.fillRect(cx, cy + 6, w, 2);
      }, '#5a5650');
    }
    // pipes
    ctx.strokeStyle = '#8a9096'; ctx.lineWidth = 3;
    const a = P(40, 40, 6), b = P(58, 60, 6), c2 = P(66, 46, 6);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.moveTo(c2[0], c2[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  },

  // Market square: a trading hall at the back and three striped stalls on a paved square.
  market(ctx, team) {
    isoShadow(ctx, 6, 6, 90, 90, 30);
    diamond(ctx, 2, 2, 94, 94);
    ctx.fillStyle = '#9d927c';
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,50,40,0.35)';
    ctx.lineWidth = 0.75;
    for (let k = 14; k < 94; k += 12) {
      let a = P(k, 2), b = P(k, 94);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      a = P(2, k); b = P(94, k);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    house(ctx, {
      x0: 10, y0: 10, x1: 46, y1: 44, z: 22, ridge: 'y', rh: 16, ov: 3, seed: 77,
      roof: ['#9a5236', '#4e2618'],
      wallLeft: (c, w, h) => { stoneWall(c, 0, 0, w, h, 71, [150, 136, 112]); door(c, w / 2 - 7, h - 17, 14, 17, true); },
      wallRight: (c, w, h) => { plankWall(c, 0, 0, w, h, 73); c.fillStyle = '#1e1813'; c.fillRect(8, 7, 5, 6); c.fillRect(w - 13, 7, 5, 6); },
    });
    bannerL(ctx, 34, 44, 20, team);
    const tm = TEAM_RGB[team].main;
    stall(ctx, 56, 14, 84, 34, tm, '#ece3cc', ['#c33', '#e8b23a', '#7a3']);
    const b1 = P(52, 46);
    barrel(ctx, b1[0] - 3, b1[1] - 9);
    stall(ctx, 14, 58, 42, 80, '#c9a227', '#ece3cc', ['#d06030', '#6a9a3a', '#e8d27a']);
    const c1 = P(50, 54);
    crate(ctx, c1[0] - 5, c1[1] - 10, 9);
    stall(ctx, 58, 60, 84, 82, '#3f7a4a', '#ece3cc', ['#8a6440', '#b9b2a4', '#2a2a2a']);
  },

  // One section of bridge: a plank deck on posts (a concrete deck from the Modern Age on).
  // Sections are drawn edge to edge so a line of them reads as one bridge.
  bridge(ctx, team) {
    const Z = 5;
    const modern = STYLE >= 2;
    // soft shadow on the water / ground below
    diamond(ctx, 2, 2, 34, 34);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fill();
    // posts under the corners
    for (const [x, y] of [[2, 30], [30, 30], [30, 2]]) {
      const b = P(x, y, -3), t = P(x, y, Z);
      ctx.fillStyle = modern ? '#8e9296' : '#4a321e';
      ctx.fillRect(t[0] - 1.6, t[1], 3.2, b[1] - t[1]);
    }
    // deck edges
    wallL(ctx, 0, 32, 32, Z, (c, w, h) => { c.fillStyle = modern ? '#9a9ea2' : '#6a4a2c'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, h - 1, w, 1); });
    wallR(ctx, 0, 32, 32, Z, (c, w, h) => { c.fillStyle = modern ? '#7c8084' : '#563a22'; c.fillRect(0, 0, w, h); }, 0.15);
    // deck
    diamond(ctx, 0, 0, 32, 32, Z);
    ctx.save();
    ctx.clip();
    const top = P(0, 0, Z), right = P(32, 0, Z), bottom = P(32, 32, Z), left = P(0, 32, Z);
    ctx.fillStyle = modern ? '#b4b8bc' : '#9a7048';
    ctx.fillRect(left[0], top[1], right[0] - left[0], bottom[1] - top[1]);
    const r = rand(team.length * 7 + 3);
    if (modern) {
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      for (let i = 4; i < 32; i += 8) { const a = P(i, 0, Z), b = P(i, 32, Z); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.stroke(); }
      const a = P(16, 0, Z), b = P(16, 32, Z);
      ctx.strokeStyle = 'rgba(240,220,120,0.7)'; ctx.setLineDash([3, 3]); ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); ctx.setLineDash([]);
    } else {
      // planks: alternating shades with dark gaps, running across both ways so any line direction looks right
      for (let i = 0; i < 32; i += 4) {
        const a = P(i, 0, Z), b = P(i, 32, Z), c = P(i + 4, 32, Z), d = P(i + 4, 0, Z);
        ctx.fillStyle = `rgba(${r() < 0.5 ? '255,235,200' : '40,24,12'},${0.06 + r() * 0.1})`;
        ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...c); ctx.lineTo(...d); ctx.fill();
        ctx.strokeStyle = 'rgba(40,24,12,0.55)'; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(30,20,10,0.6)';
      for (let i = 0; i < 6; i++) { const q = P(2 + r() * 28, 2 + r() * 28, Z); ctx.fillRect(q[0], q[1], 0.8, 0.8); } // nails
    }
    ctx.restore();
    // little corner posts with a team-coloured band
    for (const [x, y] of [[1, 1], [31, 1], [31, 31], [1, 31]]) {
      const b = P(x, y, Z), t = P(x, y, Z + 6);
      ctx.fillStyle = modern ? '#6c7074' : '#5a3e26';
      ctx.fillRect(t[0] - 1, t[1], 2, b[1] - t[1]);
      ctx.fillStyle = TEAM_RGB[team].main;
      ctx.fillRect(t[0] - 1, t[1] + 1, 2, 1.4);
    }
  },

  // A one-tile block of curtain wall; neighbouring blocks join up into a continuous wall.
  wall(ctx, team) {
    isoShadow(ctx, 0, 0, 32, 32, 22);
    wallBlock(ctx, team, 81);
  },

  // A gatehouse: taller than the wall, a big timber door in each face and a pennant on top.
  gate(ctx, team) {
    isoShadow(ctx, 0, 0, 32, 32, 34);
    const Z = 38;
    wallBlock(ctx, team, 91, (c, w, h) => {
      // stone arch with a heavy timber door and iron bands
      c.fillStyle = '#5e594f';
      c.beginPath();
      c.moveTo(3, h); c.lineTo(3, 15); c.quadraticCurveTo(w / 2, -1, w - 3, 15); c.lineTo(w - 3, h); c.closePath();
      c.fill();
      c.fillStyle = '#20180f';
      c.beginPath();
      c.moveTo(6, h); c.lineTo(6, 17); c.quadraticCurveTo(w / 2, 3, w - 6, 17); c.lineTo(w - 6, h); c.closePath();
      c.fill();
      plankWall(c, 8, 16, w - 16, h - 16, 92, [118, 84, 50]);
      c.fillStyle = '#2e2e2e';
      for (const y of [20, h / 2 + 4, h - 6]) c.fillRect(8, y, w - 16, 2);
      c.fillStyle = 'rgba(0,0,0,0.5)';
      c.fillRect(w / 2 - 0.5, 16, 1, h - 16);
      c.fillStyle = '#d4bd6e';
      c.fillRect(w / 2 - 3, h / 2 + 8, 2, 2);
      c.fillRect(w / 2 + 1, h / 2 + 8, 2, 2);
    }, Z);
    const t = P(16, 16, Z);
    flag(ctx, t[0] - 1, t[1] - 22, team);
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
let UNIT_TIER = 0; // 0 basic, 1 first upgrade (iron armour / steel tools), 2 modern kit
let POSE = 0;      // 0 normal, 1 tool/sword raised (wind-up), 2 strike
let HAND = { x: 23.6, y: 24.6 }; // where the front hand ended up (tools and swords are held here)

// Animation frames for people: 0 standing, 1/2 full stride, 3/4 half stride (smoother walking),
// 5 wind-up and 6 strike (chopping, mining, building, sword blows).
export const FRAMES = [
  { step: 0, pose: 0 }, { step: 1, pose: 0 }, { step: -1, pose: 0 }, { step: 0.5, pose: 0 }, { step: -0.5, pose: 0 },
  { step: 0, pose: 1 }, { step: 0, pose: 2 },
];
const PERSON_FRAMES = [0, 1, 2, 3, 4, 5, 6];
const RIDER_FRAMES = [0, 1, 2];
const PAD = 12; // spare room either side of a person for a swung tool or sword

// Draw a held tool/weapon (drawn for the normal pose) moved and turned to the current pose's hand.
function heldTool(ctx, draw) {
  const angle = POSE === 1 ? -1.0 : POSE === 2 ? 0.7 : 0;
  ctx.save();
  ctx.translate(HAND.x, HAND.y);
  ctx.rotate(angle);
  ctx.translate(-23.6, -24.6);
  draw();
  ctx.restore();
}

// ---------- Worker jobs ----------
// Workers carry the tool for the job they're doing (like villagers in AoE2), and each job has its
// own two working poses: 1 = wind-up / reach, 2 = the blow / pull back.
// hand: where the front hand is; th: tool angle (0 = handle straight up, + = tipped forward);
// lean: upper body tipped forward; crouch: knees bent.
let JOB = null;          // which worker job is being drawn (null for soldiers etc.)
let CONTACT = null;      // filled in while drawing: where the tool's working end is (canvas units)
export const JOBS = ['pick', 'axe', 'hammer', 'hoe', 'knife', 'spear', 'forage'];
const REST_TH = 0.28;
const JOB_POSES = {
  pick:     [{ hand: [21.2, 12.4], th: -1.15, lean: -0.06 }, { hand: [27.2, 23], th: 1.95, lean: 0.14 }],
  axe:      [{ hand: [19.4, 12.8], th: -1.25, lean: -0.08 }, { hand: [28.4, 19.6], th: 1.45, lean: 0.08 }],
  hammer:   [{ hand: [23.6, 13.2], th: -0.9, lean: 0 }, { hand: [27.6, 23.4], th: 1.95, lean: 0.12 }],
  hoe:      [{ hand: [24.2, 13.2], th: -0.55, lean: -0.04 }, { hand: [26.6, 23], th: 2.2, lean: 0.16 }],
  knife:    [{ hand: [25, 21], th: 1.3, lean: 0.18, crouch: 3 }, { hand: [27.4, 24.2], th: 2.3, lean: 0.24, crouch: 3 }],
  spear:    [{ hand: [12.6, 13.2], th: 1.52, lean: -0.12 }, { hand: [28, 16.4], th: 1.52, lean: 0.14, empty: true }],
  forage:   [{ hand: [29.6, 19.2], lean: 0.12, crouch: 1.5 }, { hand: [19.6, 22.6], lean: 0.04, crouch: 1.5, berries: true }],
  // electric tools (after Electric Tools)
  chainsaw: [{ hand: [24.2, 19.6], th: 0.7, lean: 0 }, { hand: [27.4, 21.4], th: 1.6, lean: 0.08 }],
  drill:    [{ hand: [25.2, 21.6], th: 1.35, lean: 0.04 }, { hand: [26.6, 24.4], th: 1.95, lean: 0.14 }],
};
// the electric version of a job's tool, if there is one
function jobTool(job) {
  if (UNIT_TIER === 2 && job === 'axe') return 'chainsaw';
  if (UNIT_TIER === 2 && (job === 'pick' || job === 'hammer')) return 'drill';
  return job;
}
function poseSpec() {
  if (!JOB || !POSE) return null;
  return JOB_POSES[jobTool(JOB)][POSE - 1];
}

// Tools in their own frame: grip at (0, 0), handle pointing up (−y), working end listed as `tip`.
const TOOLS = {
  pick: { tip: [6.6, -12.4], draw(ctx) {
    ctx.strokeStyle = '#6b4a2c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 1.6); ctx.lineTo(0, -14); ctx.stroke();
    ctx.strokeStyle = UNIT_TIER === 1 ? '#d5dade' : '#8d9296'; ctx.lineWidth = UNIT_TIER === 1 ? 2.4 : 2;
    ctx.beginPath(); ctx.moveTo(-4.6, -11.6); ctx.quadraticCurveTo(0, -16.2, 6.6, -12.4); ctx.stroke();
  } },
  axe: { tip: [5.8, -12.6], draw(ctx) {
    ctx.strokeStyle = '#7a5530'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 1.6); ctx.quadraticCurveTo(0.8, -6, 0, -15); ctx.stroke();
    ctx.fillStyle = UNIT_TIER === 1 ? '#dfe3e6' : '#9aa0a4';
    ctx.beginPath(); ctx.moveTo(0, -15.4); ctx.lineTo(5.2, -16.6); ctx.quadraticCurveTo(6.6, -12.6, 5.2, -9.4); ctx.lineTo(0, -11.2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(4.4, -15.6, 0.9, 5.4);
  } },
  hammer: { tip: [3.4, -10.4], draw(ctx) {
    ctx.strokeStyle = '#7a5530'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(0, 1.4); ctx.lineTo(0, -10); ctx.stroke();
    ctx.fillStyle = UNIT_TIER === 1 ? '#c8ced2' : '#6e7276';
    ctx.fillRect(-3, -12.2, 6.4, 3.4);
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(-3, -12.2, 6.4, 0.8);
  } },
  hoe: { tip: [4.4, -15.2], draw(ctx) {
    ctx.strokeStyle = '#7a5530'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(0, -17); ctx.stroke();
    ctx.fillStyle = UNIT_TIER === 1 ? '#c8ced2' : '#7e8286';
    poly(ctx, [[-0.6, -17.6], [4.8, -16.4], [4.4, -14], [0, -15.4]]); ctx.fill();
  } },
  knife: { tip: [0, -7.4], draw(ctx) {
    ctx.fillStyle = '#3a2a1c'; ctx.fillRect(-0.9, -2.6, 1.8, 3.6);
    ctx.fillStyle = '#d8dde0'; poly(ctx, [[-1, -2.6], [1, -2.6], [0.4, -7.4], [-1, -6]]); ctx.fill();
  } },
  spear: { tip: [0, -21], draw(ctx) {
    ctx.strokeStyle = '#8a6a44'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, 7); ctx.lineTo(0, -18); ctx.stroke();
    ctx.fillStyle = '#cfd4d8'; poly(ctx, [[-1.4, -18], [1.4, -18], [0, -22]]); ctx.fill();
  } },
  chainsaw: { tip: [0, -14], draw(ctx) {
    ctx.fillStyle = '#e46a1c'; ctx.fillRect(-2.6, -4.4, 6, 5.4);
    ctx.fillStyle = '#2a2a2a'; ctx.fillRect(-1.6, -1, 3, 2.4);
    ctx.fillStyle = '#b8bdc1'; ctx.fillRect(-1.1, -15, 2.4, 10.8);
    ctx.fillStyle = '#4a4a4a'; for (let y = -14.4; y < -4.6; y += 1.6) { ctx.fillRect(-1.6, y, 0.7, 0.8); ctx.fillRect(1.2, y + 0.8, 0.7, 0.8); }
  } },
  drill: { tip: [0, -11.6], draw(ctx) {
    ctx.fillStyle = '#e0b21a'; ctx.fillRect(-2.6, -7, 5.2, 6.4);
    ctx.fillStyle = '#2a2a2a'; ctx.fillRect(-1.4, -0.8, 2.8, 2.6);
    ctx.fillStyle = '#9aa0a4'; ctx.fillRect(-0.7, -11.6, 1.4, 4.8);
  } },
};

// Draw the worker's tool in the front hand, and note where its working end is.
function drawJobTool(ctx) {
  const tool = jobTool(JOB);
  const spec = poseSpec();
  if (tool === 'forage') {
    // a wicker basket in the back hand; berries in the front hand when pulling back from the bush
    ctx.fillStyle = '#9a7442'; poly(ctx, [[5.2, 23.4], [12.4, 23.4], [11.6, 29], [6, 29]]); ctx.fill();
    ctx.strokeStyle = '#6e5028'; ctx.lineWidth = 0.6;
    for (const y of [25, 26.8]) { ctx.beginPath(); ctx.moveTo(5.6, y); ctx.lineTo(12, y); ctx.stroke(); }
    ctx.strokeStyle = '#6e5028'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(8.8, 23.4, 3.4, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = '#a02838'; for (const [x, y] of [[7.4, 23], [9.4, 22.6], [10.6, 23.2]]) { ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill(); }
    if (spec && spec.berries) {
      ctx.fillStyle = '#b02a3c'; for (const [dx, dy] of [[-0.8, -1.2], [0.9, -1.4], [0, -2.4]]) { ctx.beginPath(); ctx.arc(HAND.x + dx, HAND.y + dy, 0.95, 0, Math.PI * 2); ctx.fill(); }
    }
    if (POSE === 1) CONTACT = toCanvas(ctx, HAND.x + 1, HAND.y);
    return;
  }
  if (spec && spec.empty) return; // the spear has been thrown
  const T = TOOLS[tool];
  const th = spec ? spec.th : (tool === 'spear' ? 0.08 : REST_TH);
  ctx.save();
  ctx.translate(HAND.x, HAND.y);
  ctx.rotate(th);
  T.draw(ctx);
  // where the working end ended up, back in canvas units (undo the art scale and the padding)
  const m = ctx.getTransform();
  const res = UNIT_RES;
  const px = m.a * T.tip[0] + m.c * T.tip[1] + m.e;
  const py = m.b * T.tip[0] + m.d * T.tip[1] + m.f;
  if (POSE === (tool === 'spear' ? 1 : 2)) CONTACT = { x: px / res - PAD, y: py / res };
  ctx.restore();
}

// A point in the current drawing frame, back in plain canvas units (undoing art scale and padding).
function toCanvas(ctx, x, y) {
  const m = ctx.getTransform();
  const res = UNIT_RES;
  return { x: (m.a * x + m.c * y + m.e) / res - PAD, y: (m.b * x + m.d * y + m.f) / res };
}

// What a worker carries home, shown on the shoulder.
export const CARRY_LOOKS = ['wood', 'stone', 'fuel', 'berries', 'meat', 'grain'];
export function ensureCarryTex(scene) {
  if (scene.textures.exists('carry_wood')) return;
  const D = {
    wood: (ctx) => { // a bundle of logs
      for (const [y, l] of [[6, 13], [3.6, 12], [8.4, 11]]) {
        ctx.fillStyle = '#7a5532'; ctx.fillRect(1.5, y - 1.3, l, 2.6);
        ctx.fillStyle = '#c9a26a'; ctx.beginPath(); ctx.ellipse(1.5 + l, y, 1, 1.3, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#4a3520'; ctx.fillRect(6, 2, 1, 8.2);
    },
    stone: (ctx) => { ctx.fillStyle = hgrad(ctx, 3, 12, ['#ddd5c2', '#9a917f', '#5e574a']); poly(ctx, [[3, 9.5], [4, 4], [8.5, 2.6], [12, 5], [11.4, 9.8]]); ctx.fill(); },
    fuel: (ctx) => { // a sack of coal
      ctx.fillStyle = '#6e6250'; ctx.beginPath(); ctx.ellipse(7.5, 6.6, 5.4, 4.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1a1816'; ctx.beginPath(); ctx.ellipse(7.5, 3.2, 3.6, 1.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#4a4034'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(5, 3.6); ctx.lineTo(10, 3.6); ctx.stroke();
    },
    berries: (ctx) => { // a basket full of berries
      ctx.fillStyle = '#9a7442'; poly(ctx, [[2.4, 5], [12.6, 5], [11.4, 10.6], [3.6, 10.6]]); ctx.fill();
      ctx.strokeStyle = '#6e5028'; ctx.lineWidth = 0.6; for (const y of [7, 9]) { ctx.beginPath(); ctx.moveTo(3, y); ctx.lineTo(12, y); ctx.stroke(); }
      ctx.fillStyle = '#a02838'; for (const [x, y] of [[4.6, 4.4], [6.8, 3.6], [9, 4.2], [11, 4.6], [7.8, 5]]) { ctx.beginPath(); ctx.arc(x, y, 1.2, 0, Math.PI * 2); ctx.fill(); }
    },
    meat: (ctx) => { // a haunch over the shoulder
      ctx.fillStyle = '#9b4a34'; ctx.beginPath(); ctx.ellipse(6, 6.4, 4.8, 3.4, -0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e9dcc4'; ctx.fillRect(9.6, 3.2, 3.6, 1.6);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.ellipse(5, 5.2, 2.4, 1.1, -0.3, 0, Math.PI * 2); ctx.fill();
    },
    grain: (ctx) => { // a sheaf of wheat
      ctx.strokeStyle = '#c9a443'; ctx.lineWidth = 1;
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(7.5 + i * 0.5, 11); ctx.lineTo(7.5 + i * 1.5, 1.8); ctx.stroke(); }
      ctx.fillStyle = '#e2c25a'; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.ellipse(7.5 + i * 1.5, 2.6, 0.9, 1.8, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#8a6a2a'; ctx.fillRect(5.6, 7, 3.8, 1.2);
    },
  };
  for (const k of CARRY_LOOKS) makeUnitCanvas(scene, `carry_${k}`, 15, 12, D[k]);
}

// Where each job's blow lands, relative to the feet, in screen pixels (for lining workers up).
const CONTACTS = {};
// The 3D-rendered workers (tools/render_units.py) come with their own measured contact points.
export function setJobContacts(list, tier = 0) {
  for (const [job, c] of Object.entries(list || {})) CONTACTS[`${job}|${tier}`] = c;
}
export function jobContact(job, tier = 0) {
  return CONTACTS[`${job}|${tier}`] || { x: 16, y: -14 };
}

// Colour helpers for the figures: mix a #rrggbb colour towards white (amt > 0) or black (amt < 0).
function tone(hex, amt) {
  let rgb;
  if (hex.startsWith('rgb')) rgb = hex.match(/[\d.]+/g).slice(0, 3).map(Number); // (already toned once)
  else { const n = parseInt(hex.slice(1), 16); rgb = [n >> 16, (n >> 8) & 255, n & 255]; }
  const f = (v) => Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt));
  return `rgb(${f(rgb[0])},${f(rgb[1])},${f(rgb[2])})`;
}

const SKINS = ['#c99c78', '#a8775a', '#e0b896', '#8a5e44'];
const HAIRS = ['#3a2a1c', '#5a3a22', '#1e1a16', '#8a6a3a'];

// A person in 3/4 view on a 32×40 canvas, feet at (16, 34). opts: body (tunic colour), armour, legs,
// head(ctx, c) for hats/helmets, item(ctx, c) for tools and weapons, hair (false = hidden under a hat),
// look (picks skin/hair), tabard (team-coloured front panel, default on for plain tunics).
function figure(ctx, team, opts) {
  const c = TEAM_RGB[team];
  const look = opts.look || 0;
  const skin = SKINS[look % SKINS.length];
  const s = LEG_STEP;
  const trousers = opts.legs || '#4a3d30';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // realistic proportions: a slimmer build, longer legs and a smaller head than a cartoon figure
  const HIP = 22.6;
  ctx.save();
  ctx.translate(16, 0);
  ctx.scale(0.88, 1);
  ctx.translate(-16, 0);

  // --- legs (the back leg is drawn darker) ---
  const leg = (x, swing) => {
    const fx = x + swing * 2.3;
    const fy = 33.4 - Math.abs(swing) * 0.5;
    ctx.fillStyle = swing > 0 ? tone(trousers, -0.25) : trousers;
    poly(ctx, [[x - 1.9, HIP], [x + 1.9, HIP], [fx + 1.4, fy - 2], [fx - 1.4, fy - 2]]);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    poly(ctx, [[x + 0.6, HIP], [x + 1.9, HIP], [fx + 1.4, fy - 2], [fx + 0.4, fy - 2]]);
    ctx.fill();
    // boot
    ctx.fillStyle = '#2a1d13';
    ctx.beginPath(); ctx.ellipse(fx + 0.5, fy - 0.3, 2.5, 1.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(fx - 1.7, fy - 3, 3.4, 2.6);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(fx - 1.2, fy - 2.8, 1, 2);
  };
  const spec = poseSpec();
  const crouch = (spec && spec.crouch) || 0;
  if (crouch) {
    // bent knees: the hips drop and the legs splay
    const hip = HIP + crouch;
    for (const [x, kx] of [[13.4, 11.2], [18.6, 21.4]]) {
      ctx.strokeStyle = x < 16 ? tone(trousers, -0.25) : trousers; ctx.lineWidth = 3.8;
      ctx.beginPath(); ctx.moveTo(x, hip); ctx.lineTo(kx, hip + 3.4); ctx.lineTo(x + (x < 16 ? -1.2 : 1.2), 31.4); ctx.stroke();
      ctx.fillStyle = '#2a1d13'; ctx.beginPath(); ctx.ellipse(x + (x < 16 ? -0.8 : 1.6), 33, 2.5, 1.5, 0, 0, Math.PI * 2); ctx.fill();
    }
  } else if (s >= 0) { leg(18.6, s); leg(13.4, -s); } else { leg(13.4, -s); leg(18.6, s); }
  // the upper body leans into the work (turning about the hips) and drops when crouching
  // (the upper body is drawn 3 units higher than it's laid out, on top of the longer legs)
  ctx.save();
  ctx.translate(16, 26 + crouch - 3);
  ctx.rotate((spec && spec.lean) || 0);
  ctx.translate(-16, -26);

  // --- arms behind the body swing opposite to the legs ---
  const body = opts.body || c.main;
  const sleeve = opts.sleeve || tone(body, -0.15);
  const arm = (x, swing, front) => {
    let hx = x + swing * 0.9;
    let hy = 24.6;
    if (front && spec) { hx = spec.hand[0]; hy = spec.hand[1]; }
    else if (front && POSE === 1) { hx = 24.4; hy = 13.6; }  // raised above the shoulder
    else if (front && POSE === 2) { hx = 26.4; hy = 22.2; }  // swung forward and down
    if (!front && JOB === 'forage') { hx = 9; hy = 24.6; }   // holding the basket
    ctx.strokeStyle = front ? sleeve : tone(sleeve, -0.14);
    ctx.lineWidth = 3.3;
    const bend = x + (x < 16 ? -0.8 : 0.8);
    ctx.beginPath(); ctx.moveTo(x, 16.3); ctx.quadraticCurveTo(POSE && front ? x + 1.6 : bend, POSE && front ? (16.3 + hy) / 2 : 20.5, hx, hy - 1.2); ctx.stroke();
    ctx.fillStyle = front ? skin : tone(skin, -0.2);
    ctx.beginPath(); ctx.arc(hx, hy, 1.6, 0, Math.PI * 2); ctx.fill();
    if (front) HAND = { x: hx, y: hy };
  };
  arm(9.2, s, false);

  // --- torso: rounded shoulders, narrower waist ---
  const torso = () => {
    ctx.beginPath();
    ctx.moveTo(9.6, 17.2);
    ctx.quadraticCurveTo(9.8, 14.4, 12.6, 14.2);
    ctx.lineTo(19.4, 14.2);
    ctx.quadraticCurveTo(22.2, 14.4, 22.4, 17.2);
    ctx.lineTo(22.2, 26.6);
    ctx.quadraticCurveTo(16, 27.8, 9.8, 26.6);
    ctx.closePath();
  };
  torso();
  ctx.fillStyle = hgrad(ctx, 9.5, 22.5, [tone(body, 0.22), body, tone(body, -0.38)]);
  ctx.fill();
  const plainTunic = !opts.armour;
  if (opts.tabard !== false && plainTunic && body !== c.main) {
    // a team-coloured tabard down the front, with a pale trim
    ctx.fillStyle = vgrad(ctx, 14, 28, [c.light, c.main, c.dark]);
    poly(ctx, [[12.2, 14.3], [19.8, 14.3], [20.4, 27.4], [16, 28.6], [11.6, 27.4]]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(232,214,160,0.75)'; ctx.lineWidth = 0.5; ctx.stroke();
  }
  ctx.save();
  torso();
  ctx.clip();
  if (opts.armour === 'plate') {
    ctx.fillStyle = hgrad(ctx, 10, 22, ['#eef0f2', '#aab0b6', '#62686e']);
    ctx.fillRect(9, 14, 14, 10.5);
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(12.4, 15.5, 1.2, 6);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(9, 19.2, 14, 0.6);
    ctx.fillStyle = c.main; ctx.fillRect(9, 24.5, 14, 3); // team skirt below the plate
  } else if (opts.armour === 'leather') {
    ctx.fillStyle = hgrad(ctx, 10, 22, ['#93704a', '#6a4a2c', '#43301c']);
    ctx.fillRect(9, 14, 14, 10.5);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    for (let yy = 16.5; yy < 24; yy += 2.3) ctx.fillRect(9, yy, 14, 0.7);
    ctx.fillStyle = c.main; ctx.fillRect(14.6, 14, 2.8, 10.5);
  } else if (opts.armour === 'camo') {
    ctx.fillStyle = '#5c6b42'; ctx.fillRect(9, 14, 14, 14);
    ctx.fillStyle = '#46532f';
    for (const [x, y] of [[11, 17], [17, 20], [13, 24], [20, 25], [21, 16]]) { ctx.beginPath(); ctx.ellipse(x, y, 2.2, 1.3, 0.4, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = tone(c.dark, -0.1);
    poly(ctx, [[11.2, 15.2], [20.8, 15.2], [20.4, 23.6], [11.6, 23.6]]); ctx.fill();
    ctx.fillStyle = c.main; ctx.fillRect(12.2, 17.5, 3, 2.2); ctx.fillRect(16.8, 17.5, 3, 2.2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(12.2, 21, 7.6, 0.8);
  } else if (opts.armour === 'hivis') {
    ctx.fillStyle = '#ef7d22'; ctx.fillRect(9, 14, 14, 12);
    ctx.fillStyle = '#e8eef0'; ctx.fillRect(9, 19, 14, 1.4); ctx.fillRect(9, 22.5, 14, 1.4);
    ctx.fillStyle = c.main; ctx.fillRect(14.8, 14, 2.4, 4);
  }
  // soft shading: light from the upper left
  ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(9, 14, 4, 13);
  ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fillRect(19.5, 14, 4, 14);
  ctx.restore();
  // belt and buckle
  ctx.fillStyle = '#2e2118'; ctx.fillRect(9.8, 24.4, 12.4, 1.9);
  ctx.fillStyle = '#d4b45a'; ctx.fillRect(15.1, 24.5, 1.8, 1.6);

  // --- front arm ---
  arm(22.8, -s, true);

  // --- neck and head (drawn smaller, about the neck) ---
  ctx.save();
  ctx.translate(16, 14.2);
  ctx.scale(0.76, 0.76);
  ctx.translate(-16, -14.2);
  ctx.fillStyle = tone(skin, -0.18); ctx.fillRect(14.7, 12.6, 2.6, 2.4);
  ctx.fillStyle = rgrad(ctx, 14.6, 8.4, 0.8, 5.2, [tone(skin, 0.2), skin, tone(skin, -0.3)]);
  ctx.beginPath(); ctx.arc(16, 9.6, 4.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = tone(skin, -0.22); ctx.beginPath(); ctx.ellipse(11.7, 10.2, 0.9, 1.3, 0, 0, Math.PI * 2); ctx.fill(); // ear
  if (opts.hair !== false) {
    ctx.fillStyle = HAIRS[(look * 3 + 1) % HAIRS.length];
    ctx.beginPath(); ctx.arc(16, 9.2, 4.9, Math.PI * 1.02, Math.PI * 1.98); ctx.quadraticCurveTo(19, 6.8, 16.5, 6.6); ctx.quadraticCurveTo(13, 6.9, 11.2, 8.8); ctx.fill();
  }
  // face: eyes, brow shadow, a hint of a mouth
  ctx.fillStyle = '#1c1410';
  ctx.beginPath(); ctx.ellipse(14.4, 10.2, 0.55, 0.75, 0, 0, Math.PI * 2); ctx.ellipse(17.9, 10.2, 0.55, 0.75, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(13.3, 8.9, 5.8, 0.7);
  ctx.fillStyle = 'rgba(120,60,50,0.45)'; ctx.fillRect(15.2, 12.3, 2, 0.6);
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.arc(14.6, 7.6, 1.4, 0, Math.PI * 2); ctx.fill();

  if (opts.head) opts.head(ctx, c);
  ctx.restore();
  if (opts.item) opts.item(ctx, c);
  ctx.restore();
  ctx.restore();
}

// Helmets for upgraded units.
function plumedHelm(ctx, c) {
  ctx.fillStyle = rgrad(ctx, 14, 6, 1, 6, ['#eef0f2', '#8d9298']);
  ctx.beginPath(); ctx.arc(16, 9, 5.2, Math.PI, 0); ctx.fill();
  ctx.fillRect(10.8, 8.6, 10.4, 1.4);
  ctx.fillStyle = c.main; // crest in team colour
  ctx.beginPath(); ctx.moveTo(13, 4); ctx.quadraticCurveTo(16, 0, 20, 3); ctx.lineTo(19, 5); ctx.quadraticCurveTo(16, 3, 14, 5); ctx.fill();
}
function kevlarHelm(ctx, col = '#4e5a38') {
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(16, 9, 5.4, Math.PI, 0); ctx.fill();
  ctx.fillRect(10.4, 8.4, 11.2, 1.8);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(10.4, 9.6, 11.2, 0.8);
  ctx.fillStyle = '#2a2e30'; ctx.fillRect(13, 7, 6, 1.2); // goggles strap
}
function brodieHelm(ctx) {
  ctx.fillStyle = '#6f7560';
  ctx.beginPath(); ctx.ellipse(16, 7.5, 7.5, 2.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(16, 7.5, 4.2, Math.PI, 0); ctx.fill();
}

export const UNIT_ART = {
  worker: (ctx, team) => figure(ctx, team, {
    body: UNIT_TIER === 1 ? '#5e5644' : '#7a6a4f',
    armour: UNIT_TIER === 2 ? 'hivis' : null,
    head: (ctx) => {
      if (UNIT_TIER === 2) { // yellow hard hat
        ctx.fillStyle = rgrad(ctx, 14, 6, 1, 6, ['#ffe680', '#e0b21a']);
        ctx.beginPath(); ctx.arc(16, 8.5, 5.2, Math.PI, 0); ctx.fill();
        ctx.fillRect(10, 8, 12, 1.6);
        return;
      }
      if (UNIT_TIER === 1) { // felt cap
        ctx.fillStyle = '#4a3a2a';
        ctx.beginPath(); ctx.arc(16, 8, 4.8, Math.PI, 0); ctx.fill();
        ctx.fillRect(16, 7, 6, 1.6);
        return;
      }
      ctx.fillStyle = '#b3a066';
      ctx.beginPath();
      ctx.ellipse(16, 7, 7, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#9c8a55';
      ctx.fillRect(13, 3, 6, 4);
    },
    item: (ctx) => {
      if (UNIT_TIER === 1) { // a leather apron (narrow, so the team colour still shows)
        ctx.fillStyle = '#6e4c30'; poly(ctx, [[13.6, 19.4], [18.4, 19.4], [19, 27.6], [13, 27.6]]); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(16.8, 19.4, 1.8, 8.2);
      }
      drawJobTool(ctx);
    },
  }),
  soldier: (ctx, team) => figure(ctx, team, {
    armour: UNIT_TIER === 1 ? 'plate' : UNIT_TIER === 2 ? 'camo' : null,
    head: (ctx, c) => {
      if (UNIT_TIER === 1) { plumedHelm(ctx, c); return; }
      if (UNIT_TIER === 2) { kevlarHelm(ctx); return; }
      ctx.fillStyle = rgrad(ctx, 14, 6, 1, 6, ['#c4c8cc', '#7b8085']);
      ctx.beginPath();
      ctx.arc(16, 9, 5, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#5f6468';
      ctx.fillRect(11, 9, 10, 1);
      ctx.fillRect(15.5, 9, 1, 4);
    },
    item: (ctx, c) => {
      if (UNIT_TIER === 2) {
        // baton and a clear riot shield
        heldTool(ctx, () => { ctx.fillStyle = '#1e1e1e'; ctx.fillRect(25, 10, 2, 14); });
        ctx.fillStyle = 'rgba(200,225,240,0.55)'; ctx.fillRect(3, 13, 9, 15);
        ctx.strokeStyle = '#3a3e42'; ctx.lineWidth = 1; ctx.strokeRect(3.5, 13.5, 8, 14);
        ctx.fillStyle = c.main; ctx.fillRect(4, 18, 7, 1.5);
        return;
      }
      heldTool(ctx, () => {
        ctx.fillStyle = UNIT_TIER === 1 ? '#eef1f4' : '#c9cdd1'; // sword
        ctx.fillRect(25, 8, 2, 16);
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(25, 8, 0.7, 15);
        ctx.fillStyle = '#6b4a2c';
        ctx.fillRect(23, 23, 6, 2);
      });
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
    armour: UNIT_TIER === 1 ? 'leather' : UNIT_TIER === 2 ? 'camo' : null,
    head: (ctx) => {
      if (UNIT_TIER === 1) { // steel cap
        ctx.fillStyle = rgrad(ctx, 14, 6, 1, 6, ['#d8dce0', '#7b8085']);
        ctx.beginPath(); ctx.arc(16, 9, 5, Math.PI, 0); ctx.fill();
        return;
      }
      if (UNIT_TIER === 2) { // boonie hat
        ctx.fillStyle = '#5c6b42';
        ctx.beginPath(); ctx.ellipse(16, 7.5, 7, 2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(16, 7.5, 4, Math.PI, 0); ctx.fill();
        return;
      }
      ctx.fillStyle = '#3f4a30';
      ctx.beginPath();
      ctx.arc(16, 9.5, 5.2, Math.PI * 0.9, Math.PI * 2.1);
      ctx.fill();
      ctx.fillRect(11, 9, 2, 5);
      ctx.fillRect(19, 9, 2, 5);
    },
    item: (ctx) => {
      ctx.strokeStyle = UNIT_TIER === 2 ? '#1e2022' : '#6b4a2c'; // modern compound bow is black
      ctx.lineWidth = 2;
      if (UNIT_TIER === 2) { ctx.fillStyle = '#9aa0a6'; ctx.beginPath(); ctx.arc(26, 10, 1.6, 0, 7); ctx.arc(26, 28, 1.6, 0, 7); ctx.fill(); }
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
  medic: (ctx, team) => figure(ctx, team, {
    body: '#d8d2c2',
    tabard: false,
    head: (ctx) => {
      if (UNIT_TIER >= 1) {
        kevlarHelm(ctx, UNIT_TIER === 2 ? '#e8e4da' : '#c9ccd0');
        ctx.fillStyle = '#3f8f4a'; ctx.fillRect(15, 4.5, 2, 4); ctx.fillRect(14, 5.5, 4, 2);
        return;
      }
      ctx.fillStyle = '#e8e2d2';
      ctx.beginPath(); ctx.arc(16, 8.5, 4.8, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#3f8f4a'; ctx.fillRect(15, 4.5, 2, 4); ctx.fillRect(14, 5.5, 4, 2);
    },
    item: (ctx, c) => {
      ctx.fillStyle = '#3f8f4a'; // green cross on the tunic
      ctx.fillRect(15, 17, 2.5, 7); ctx.fillRect(12.8, 19.3, 7, 2.5);
      ctx.fillStyle = c.main; ctx.fillRect(9, 15, 14, 1.5);
      ctx.fillStyle = '#6b4a2c'; ctx.fillRect(23, 20, 6, 6); // satchel
      ctx.fillStyle = '#8a6440'; ctx.fillRect(23, 20, 6, 1.5);
    },
  }),
  rifleman: (ctx, team) => figure(ctx, team, {
    armour: UNIT_TIER === 2 ? 'camo' : null,
    body: UNIT_TIER === 1 ? '#5e6448' : undefined,
    head: (ctx, c) => {
      if (UNIT_TIER === 1) { brodieHelm(ctx); return; }
      if (UNIT_TIER === 2) { kevlarHelm(ctx); return; }
      ctx.fillStyle = c.dark;
      ctx.beginPath();
      ctx.arc(16, 8.5, 4.8, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(15, 8, 8, 2);
    },
    item: (ctx) => {
      ctx.strokeStyle = UNIT_TIER === 2 ? '#26282a' : '#4a3220';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(8, 26);
      ctx.lineTo(26, 10);
      ctx.stroke();
      if (UNIT_TIER === 2) { ctx.fillStyle = '#111'; ctx.fillRect(15, 15, 5, 2); } // scope
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

// Scout: a rider on a horse, 44×40 canvas, hooves at y≈37. LEG_STEP animates a gallop.
function scoutRider(ctx, team) {
  const c = TEAM_RGB[team];
  const s = LEG_STEP;
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(22, 36, 15, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  // legs (far pair darker)
  const leg = (x, sw, col) => {
    ctx.strokeStyle = col; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, 25); ctx.lineTo(x + sw, 31); ctx.lineTo(x + sw * 0.6, 36); ctx.stroke();
  };
  leg(13, -2 * s, '#4a3020'); leg(29, 2 * s, '#4a3020');
  leg(15, 2 * s, '#6b4528'); leg(31, -2 * s, '#6b4528');
  // body
  ctx.fillStyle = hgrad(ctx, 10, 34, ['#9a6a40', '#7a4f2c', '#5a3820']);
  ctx.beginPath(); ctx.ellipse(22, 23, 11, 5.5, 0, 0, Math.PI * 2); ctx.fill();
  // neck and head
  ctx.fillStyle = '#7a4f2c';
  poly(ctx, [[30, 21], [36, 11], [39, 12], [35, 23]]); ctx.fill();
  ctx.beginPath(); ctx.ellipse(39, 13, 4.2, 2.4, 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2a1a10'; // mane and tail
  poly(ctx, [[30, 20], [35, 10], [33, 10], [28, 20]]); ctx.fill();
  ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(11, 21); ctx.quadraticCurveTo(6, 24, 7, 30 + s); ctx.stroke();
  // saddle cloth in team colour
  ctx.fillStyle = c.main; ctx.fillRect(17, 18, 10, 7);
  ctx.fillStyle = c.dark; ctx.fillRect(17, 24, 10, 1.5);
  // rider
  ctx.fillStyle = hgrad(ctx, 17, 27, [c.light, c.main, c.dark]);
  poly(ctx, [[18, 8], [26, 8], [26, 19], [18, 19]]); ctx.fill();
  if (UNIT_TIER === 1) { ctx.fillStyle = hgrad(ctx, 18, 26, ['#e4e7ea', '#8d9298']); ctx.fillRect(18.5, 9, 7, 7); }
  if (UNIT_TIER === 2) { ctx.fillStyle = '#5c6b42'; ctx.fillRect(18, 8, 8, 11); ctx.fillStyle = c.dark; ctx.fillRect(19, 10, 6, 6); }
  ctx.fillStyle = '#3a3128'; ctx.fillRect(19, 18, 6, 6);
  ctx.fillStyle = rgrad(ctx, 22, 4, 1, 4, ['#d9b391', '#c49a78', '#8f6b52']);
  ctx.beginPath(); ctx.arc(22, 5, 3.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = UNIT_TIER === 1 ? '#c9ced2' : UNIT_TIER === 2 ? '#4e5a38' : '#5a4630';
  ctx.beginPath(); ctx.arc(22, 4, 4, Math.PI, 0); ctx.fill();
  if (UNIT_TIER === 1) { ctx.fillStyle = c.main; ctx.fillRect(21, -1, 2, 3); }
  // lance
  ctx.strokeStyle = '#6b4a2c'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(14, 20); ctx.lineTo(38, 2); ctx.stroke();
  ctx.fillStyle = '#c9cdd1'; poly(ctx, [[38, 2], [42, 0], [39, 4]]); ctx.fill();
}

// Field cannon on two wheels, 44×40.
function cannon(ctx, team) {
  const c = TEAM_RGB[team];
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(22, 34, 18, 4.5, 0, 0, Math.PI * 2); ctx.fill();
  // trail
  ctx.fillStyle = '#5a3c22'; poly(ctx, [[4, 31], [8, 28], [24, 26], [24, 30]]); ctx.fill();
  // barrel
  ctx.fillStyle = vgrad(ctx, 12, 24, ['#6a6e72', '#2e3134', '#1c1e20']);
  poly(ctx, [[12, 24], [38, 13], [40, 17], [14, 28]]); ctx.fill();
  ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.ellipse(39, 15, 1.8, 2.4, -0.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = c.main; ctx.fillRect(17, 22, 5, 3);
  // wheel
  ctx.strokeStyle = '#3a2614'; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.arc(22, 27, 7, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(22, 27); ctx.lineTo(22 + Math.cos(a) * 7, 27 + Math.sin(a) * 7); ctx.stroke(); }
  ctx.fillStyle = '#2a1c10'; ctx.beginPath(); ctx.arc(22, 27, 1.8, 0, Math.PI * 2); ctx.fill();
}

// Electric tank: low, sleek, solar panels on the hull, 44×40.
function electricTank(ctx, team) {
  const c = TEAM_RGB[team];
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath(); ctx.ellipse(23, 34, 20, 5, 0, 0, Math.PI * 2); ctx.fill();
  // tracks
  ctx.fillStyle = '#1c1d1e'; ctx.beginPath(); ctx.roundRect(4, 26, 37, 8, 4); ctx.fill();
  ctx.fillStyle = '#3a3c3e'; for (let x = 7; x < 40; x += 5) ctx.fillRect(x, 28, 2.5, 4);
  // hull
  ctx.fillStyle = vgrad(ctx, 16, 28, ['#9fa8a2', '#6f7a74', '#4c5650']);
  poly(ctx, [[3, 25], [8, 17], [38, 17], [43, 25]]); ctx.fill();
  ctx.fillStyle = c.main; ctx.fillRect(6, 23, 35, 2.5);
  // solar panel on the hull
  ctx.fillStyle = vgrad(ctx, 17, 22, ['#3b6aa0', '#1d3554']);
  poly(ctx, [[10, 21], [13, 18], [26, 18], [24, 21]]); ctx.fill();
  ctx.strokeStyle = 'rgba(170,200,230,0.5)'; ctx.lineWidth = 0.5;
  for (let x = 13; x < 25; x += 3) { ctx.beginPath(); ctx.moveTo(x, 18); ctx.lineTo(x - 2, 21); ctx.stroke(); }
  // turret and barrel
  ctx.fillStyle = rgrad(ctx, 30, 13, 1, 8, ['#a8b2ac', '#5d6862']);
  ctx.beginPath(); ctx.ellipse(31, 15, 7, 4.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2e3432'; ctx.fillRect(36, 13, 8, 2.5);
  ctx.fillStyle = '#7fe0ff'; ctx.fillRect(28, 13, 3, 1.5); // glowing sensor
}

// Deer, 32×24, two walking frames.
export function deerArt(ctx, frame) {
  const s = frame ? 1 : -1;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(16, 21, 10, 2.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#6b4a2e'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  for (const [x, d] of [[9, s], [12, -s], [20, -s], [23, s]]) { ctx.beginPath(); ctx.moveTo(x, 14); ctx.lineTo(x + d * 1.5, 21); ctx.stroke(); }
  ctx.fillStyle = hgrad(ctx, 7, 25, ['#b88454', '#9a6a3e', '#76502c']);
  ctx.beginPath(); ctx.ellipse(16, 13, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f0e6d4'; ctx.beginPath(); ctx.ellipse(8, 12, 1.8, 1.6, 0, 0, Math.PI * 2); ctx.fill(); // white tail
  ctx.fillStyle = '#9a6a3e';
  poly(ctx, [[22, 12], [26, 5], [28, 6], [25, 13]]); ctx.fill();
  ctx.beginPath(); ctx.ellipse(28, 6, 3, 1.8, 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#5a4026'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(27, 4); ctx.lineTo(25, 0); ctx.moveTo(26, 2); ctx.lineTo(24, 2); ctx.moveTo(28, 4); ctx.lineTo(30, 0); ctx.moveTo(29.5, 1.5); ctx.lineTo(31.5, 1.5); ctx.stroke();
  ctx.fillStyle = '#1a1410'; ctx.fillRect(29, 5.5, 1, 1);
}

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
  wheelbarrow(ctx) {
    ctx.strokeStyle = '#5a3c22'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(14, 22); ctx.lineTo(34, 30); ctx.moveTo(26, 22); ctx.lineTo(36, 26); ctx.stroke();
    ctx.fillStyle = '#8a6440'; poly(ctx, [[6, 14], [28, 14], [26, 24], [10, 24]]); ctx.fill();
    ctx.fillStyle = '#a9a59b'; for (const [x, y] of [[12, 12], [18, 11], [23, 12]]) { ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = '#2a1c10'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(12, 29, 5, 0, Math.PI * 2); ctx.stroke();
  },
  fish_farming(ctx) {
    ctx.fillStyle = '#3d74a8'; ctx.fillRect(2, 24, 36, 12);
    ctx.fillStyle = '#c8d2d8';
    for (const [x, y] of [[13, 18], [26, 26]]) {
      ctx.beginPath(); ctx.ellipse(x, y, 7, 3.5, 0, 0, Math.PI * 2); ctx.fill();
      poly(ctx, [[x - 6, y], [x - 11, y - 4], [x - 11, y + 4]]); ctx.fill();
    }
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(17, 17, 1.5, 1.5); ctx.fillRect(30, 25, 1.5, 1.5);
  },
  field_medicine(ctx) {
    ctx.fillStyle = '#e8e2d2'; ctx.beginPath(); ctx.roundRect(6, 10, 28, 22, 4); ctx.fill();
    ctx.fillStyle = '#6b4a2c'; ctx.fillRect(14, 6, 12, 5);
    ctx.fillStyle = '#3f8f4a'; ctx.fillRect(17, 14, 6, 14); ctx.fillRect(13, 18, 14, 6);
  },
  cool_roofs(ctx) {
    ctx.fillStyle = '#f2c94c'; ctx.beginPath(); ctx.arc(30, 9, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c8c4b8'; poly(ctx, [[4, 32], [4, 20], [20, 10], [36, 20], [36, 32]]); ctx.fill();
    ctx.fillStyle = '#f4f8fb'; poly(ctx, [[2, 21], [20, 8], [38, 21], [36, 23], [20, 12], [4, 23]]); ctx.fill();
    ctx.fillStyle = '#5a3c22'; ctx.fillRect(16, 23, 8, 9);
  },
  // Town bell
  bell(ctx) {
    ctx.fillStyle = '#3e2a18';
    ctx.fillRect(6, 5, 28, 3);
    ctx.fillStyle = hgrad(ctx, 10, 30, ['#f0d27a', '#a87a26']);
    ctx.beginPath();
    ctx.moveTo(20, 8); ctx.quadraticCurveTo(11, 9, 11, 22); ctx.quadraticCurveTo(10, 28, 6, 30);
    ctx.lineTo(34, 30); ctx.quadraticCurveTo(30, 28, 29, 22); ctx.quadraticCurveTo(29, 9, 20, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#6a4a1a';
    ctx.beginPath(); ctx.arc(20, 33, 3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#f2ead6';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(20, 20, 17, -0.45, 0.45); ctx.stroke();
    ctx.beginPath(); ctx.arc(20, 20, 17, Math.PI - 0.45, Math.PI + 0.45); ctx.stroke();
  },
  // All clear: a worker's pick over a green tick
  allclear(ctx) {
    ctx.strokeStyle = '#6fbf4a';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(8, 21); ctx.lineTo(16, 29); ctx.lineTo(32, 10); ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
  },
  // Attack-move: an arrow with a sword across it
  amove(ctx) {
    ctx.strokeStyle = '#e8dcc0';
    ctx.fillStyle = '#e8dcc0';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(6, 32); ctx.lineTo(28, 10); ctx.stroke();
    poly(ctx, [[34, 4], [22, 8], [30, 16]]);
    ctx.fill();
    // sword
    ctx.strokeStyle = '#c9ccd2';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(10, 10); ctx.lineTo(30, 30); ctx.stroke();
    ctx.strokeStyle = '#8a5a2a';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(7, 13); ctx.lineTo(13, 7); ctx.stroke();
    ctx.strokeStyle = '#b8433a';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(20, 20, 16, 0, Math.PI * 2); ctx.stroke();
  },
  // Stop: a red octagon with a white bar
  stop(ctx) {
    ctx.fillStyle = '#7d1f18';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + (i * Math.PI) / 4;
      ctx.lineTo(20 + Math.cos(a) * 15, 20 + Math.sin(a) * 15);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#e8dcc0';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#f2ead6';
    ctx.fillRect(11, 17, 18, 6);
  },
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

export function makeCanvas(scene, key, w, h, draw, res = 1) {
  if (scene.textures.exists(key)) return; // already made (e.g. when starting a second game)
  const tex = scene.textures.createCanvas(key, Math.ceil(w * res), Math.ceil(h * res));
  const ctx = tex.getContext();
  ctx.scale(res, res);
  draw(ctx);
  tex.refresh();
}

// People, horses and vehicles are drawn a little larger than the art grid (so they read well next to
// buildings) and get a thin dark outline, which keeps them crisp against grass, fields and each other.
// People and vehicles are shown at UNIT_SCALE × their drawing size (small next to buildings, as in
// AoE2), but drawn at UNIT_RES pixels per unit so they stay sharp when you zoom in.
export const UNIT_SCALE = 0.86;
export const UNIT_RES = ART_RES * 1.5;
export const UNIT_SPRITE_SCALE = UNIT_SCALE / UNIT_RES;
const OUTLINE = 'rgba(28,20,12,0.42)'; // a soft dark edge rather than a cartoon outline
export function makeUnitCanvas(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) return;
  const res = UNIT_RES;
  const W = Math.ceil(w * res);
  const H = Math.ceil(h * res);
  const art = document.createElement('canvas');
  art.width = W; art.height = H;
  const a = art.getContext('2d');
  a.scale(res, res);
  draw(a);
  // silhouette in the outline colour
  const sil = document.createElement('canvas');
  sil.width = W; sil.height = H;
  const sc = sil.getContext('2d');
  sc.drawImage(art, 0, 0);
  sc.globalCompositeOperation = 'source-in';
  sc.fillStyle = OUTLINE;
  sc.fillRect(0, 0, W, H);
  const tex = scene.textures.createCanvas(key, W, H);
  const ctx = tex.getContext();
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1]]) ctx.drawImage(sil, dx, dy);
  ctx.drawImage(art, 0, 0);
  tex.refresh();
}

export function buildingKey(type, team, style = 0) { return `b_${type}_${team}${style ? `_s${style}` : ''}`; }
export function unitKey(type, team, frame = 0, tier = 0, job = null) {
  return `u_${type}_${team}${frame ? `_w${frame}` : ''}${tier ? `_t${tier}` : ''}${job && job !== 'pick' ? `_${job}` : ''}`;
}

// Draw a worker's frames for one job (tool) and upgrade tier, if not drawn yet.
export function ensureJobTex(scene, team, tier, job) {
  if (scene.textures.exists(unitKey('worker', team, 6, tier, job))) return;
  UNIT_TIER = tier;
  JOB = job;
  try {
    PERSON_FRAMES.forEach((frame) => {
      LEG_STEP = FRAMES[frame].step;
      POSE = FRAMES[frame].pose;
      CONTACT = null;
      makeUnitCanvas(scene, unitKey('worker', team, frame, tier, job), 32 + PAD * 2, 40, (ctx) => { ctx.translate(PAD, 0); UNIT_ART.worker(ctx, team); });
      if (CONTACT && POSE === (job === 'spear' ? 1 : job === 'forage' ? 1 : 2)) {
        CONTACTS[`${job}|${tier}`] = { x: (CONTACT.x - 16) * UNIT_SCALE, y: (CONTACT.y - 34.4) * UNIT_SCALE };
      }
    });
  } finally {
    LEG_STEP = 0;
    POSE = 0;
    UNIT_TIER = 0;
    JOB = null;
  }
}

// Draw a building's texture in a given era style (if it hasn't been drawn yet).
export function ensureBuildingTex(scene, type, team, style, def) {
  // a 3D-rendered version (made by tools/render_buildings.py) wins over the drawn one, if there is one;
  // an age without its own render yet uses the newest rendered look below it
  for (let st = style; st >= 0; st--) {
    const rendered = `b3d_${type}_s${st}_${team}`;
    if (scene.textures.exists(rendered)) return rendered;
  }
  const key = buildingKey(type, team, style);
  if (scene.textures.exists(key) || !BUILDING_ART[type]) return key;
  const info = buildingTexInfo(def);
  STYLE = style;
  try {
    makeCanvas(scene, key, info.width, info.height, (ctx) => { ctx.translate(info.ox, info.oy); BUILDING_ART[type](ctx, team); }, ART_RES);
  } finally {
    STYLE = 0;
  }
  return key;
}

// Which look a unit has, from its team's research.
export function unitTier(type, upgrades) {
  if (type === 'worker') return upgrades.has('electric_tools') ? 2 : (upgrades.has('steel_axes') || upgrades.has('mining_carts') || upgrades.has('wheelbarrow')) ? 1 : 0;
  if (!['soldier', 'archer', 'rifleman', 'medic', 'scout'].includes(type)) return 0;
  return upgrades.has('body_armour') ? 2 : upgrades.has('iron_weapons') ? 1 : 0;
}

// Draw a unit's textures for an upgrade tier (if not drawn yet).
export function ensureUnitTex(scene, type, team, tier) {
  if (type === 'worker') { ensureJobTex(scene, team, tier, 'pick'); return; }
  if (!tier || scene.textures.exists(unitKey(type, team, 0, tier))) return;
  UNIT_TIER = tier;
  try {
    (type === 'scout' ? RIDER_FRAMES : PERSON_FRAMES).forEach((frame) => {
      LEG_STEP = FRAMES[frame].step;
      POSE = FRAMES[frame].pose;
      if (type === 'scout') makeUnitCanvas(scene, unitKey(type, team, frame, tier), 44, 40, (ctx) => scoutRider(ctx, team));
      else makeUnitCanvas(scene, unitKey(type, team, frame, tier), 32 + PAD * 2, 40, (ctx) => { ctx.translate(PAD, 0); UNIT_ART[type](ctx, team); });
    });
  } finally {
    LEG_STEP = 0;
    POSE = 0;
    UNIT_TIER = 0;
  }
}

export function generateArt(scene, buildingTypes, teams = ['player', 'enemy']) {
  for (const team of teams) {
    for (const [type, def] of Object.entries(buildingTypes)) {
      const draw = BUILDING_ART[type];
      if (!draw) continue;
      const info = buildingTexInfo(def);
      makeCanvas(scene, buildingKey(type, team), info.width, info.height, (ctx) => {
        ctx.translate(info.ox, info.oy);
        draw(ctx, team);
      }, ART_RES);
    }
    ensureJobTex(scene, team, 0, 'pick');
    for (const [type, draw] of Object.entries(UNIT_ART)) {
      if (type === 'worker') continue;
      // standing, four walking poses, wind-up and strike
      PERSON_FRAMES.forEach((frame) => {
        LEG_STEP = FRAMES[frame].step;
        POSE = FRAMES[frame].pose;
        makeUnitCanvas(scene, unitKey(type, team, frame), 32 + PAD * 2, 40, (ctx) => { ctx.translate(PAD, 0); draw(ctx, team); });
      });
      LEG_STEP = 0;
      POSE = 0;
    }
    makeUnitCanvas(scene, unitKey('armoured_car', team), 44, 40, (ctx) => armouredCar(ctx, team));
    makeUnitCanvas(scene, unitKey('cannon', team), 44, 40, (ctx) => cannon(ctx, team));
    makeUnitCanvas(scene, unitKey('e_tank', team), 44, 40, (ctx) => electricTank(ctx, team));
    [0, 1, 2].forEach((frame) => {
      LEG_STEP = frame === 1 ? 1 : frame === 2 ? -1 : 0;
      makeUnitCanvas(scene, unitKey('scout', team, frame), 44, 40, (ctx) => scoutRider(ctx, team));
    });
    LEG_STEP = 0;
  }
  for (const [name, draw] of Object.entries(ICON_ART)) makeCanvas(scene, `i_${name}`, 20, 20, draw, ART_RES);
  makeUnitCanvas(scene, 'deer0', 32, 24, (ctx) => deerArt(ctx, 0));
  makeUnitCanvas(scene, 'deer1', 32, 24, (ctx) => deerArt(ctx, 1));
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
