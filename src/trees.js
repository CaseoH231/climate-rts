// Trees as proper sprites (like AoE2): tall, detailed, lit from the upper left, and sorted with
// people and buildings so you can walk behind them. Forests thin out tree by tree as they're cut.
// All of this is just for show; the forest tiles themselves are what the game uses.
import { makeCanvas, ART_RES } from './art.js';
import { TERRAIN, TILE } from './config.js';
import { RESOURCE_AMOUNT, TERRAIN_AMOUNT } from './config.js';

const OAKS = 5;
const PINES = 3;
// where each tree's trunk meets the ground, as a fraction of its canvas
const OAK_W = 48, OAK_H = 62, OAK_BASE = 59;
const PINE_W = 34, PINE_H = 66, PINE_BASE = 63;

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const css = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

// Broadleaf (oak / beech): a tapered trunk and a crown built from many lit leaf clumps.
function drawOak(ctx, v) {
  const r = seeded(9001 + v * 131);
  const cx = OAK_W / 2;
  const base = OAK_BASE;
  // palettes: darker summer greens, one slightly olive, one slightly blue-green
  const pals = [
    [[24, 40, 20], [48, 72, 32], [86, 112, 52], [138, 156, 84]],
    [[30, 42, 18], [60, 76, 30], [104, 118, 50], [156, 160, 86]],
    [[20, 38, 24], [42, 68, 40], [78, 106, 62], [128, 150, 96]],
    [[28, 44, 20], [54, 80, 34], [96, 124, 56], [150, 168, 90]],
    [[34, 44, 20], [66, 78, 34], [112, 120, 56], [166, 164, 96]],
  ];
  const [dark, mid, lit, hi] = pals[v % pals.length];
  const crownY = 25 + r() * 3;
  const RX = 15 + r() * 3;
  const RY = 16 + r() * 3;

  // trunk with a fork or two, bark darker on the shaded right
  const tw = 2.6 + r() * 0.8;
  const tg = ctx.createLinearGradient(cx - tw, 0, cx + tw, 0);
  tg.addColorStop(0, '#6a5440'); tg.addColorStop(0.5, '#4a3a2a'); tg.addColorStop(1, '#2a2018');
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.moveTo(cx - tw - 1, base); ctx.quadraticCurveTo(cx - tw * 0.6, base - 10, cx - tw * 0.5, crownY + 8);
  ctx.lineTo(cx + tw * 0.5, crownY + 8); ctx.quadraticCurveTo(cx + tw * 0.6, base - 10, cx + tw + 1, base);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#3a2c20'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(cx, crownY + 12); ctx.quadraticCurveTo(cx + side * 4, crownY + 6, cx + side * (7 + r() * 3), crownY + 2); ctx.stroke();
  }
  // bark streaks
  ctx.strokeStyle = 'rgba(20,14,10,0.35)'; ctx.lineWidth = 0.5;
  for (let i = 0; i < 4; i++) { const x = cx - tw * 0.6 + r() * tw * 1.2; ctx.beginPath(); ctx.moveTo(x, base - 1); ctx.lineTo(x + (r() - 0.5), crownY + 12); ctx.stroke(); }

  // crown: a dark mass first so there are no holes, then lit clumps back to front
  ctx.fillStyle = css(dark);
  ctx.beginPath(); ctx.ellipse(cx, crownY + 1, RX * 0.92, RY * 0.9, 0, 0, Math.PI * 2); ctx.fill();
  const clumps = [];
  const N = 46;
  for (let i = 0; i < N; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r());
    const x = cx + Math.cos(a) * RX * d * 0.9;
    const y = crownY + Math.sin(a) * RY * d * 0.88;
    clumps.push({ x, y, s: 3 + r() * 3.2 });
  }
  clumps.sort((p, q) => p.y - q.y);
  for (const c of clumps) {
    // light from the upper left; clumps on the outside of the crown catch more of it
    const nx = (c.x - cx) / RX;
    const ny = (c.y - crownY) / RY;
    let l = 0.55 - nx * 0.35 - ny * 0.45 + (r() - 0.5) * 0.25;
    l = Math.max(0, Math.min(1, l));
    const base3 = l < 0.5 ? mix(dark, mid, l * 2) : mix(mid, lit, (l - 0.5) * 2);
    ctx.fillStyle = css(base3);
    ctx.beginPath();
    // a clump is a few overlapping leaves, not a perfect ball
    for (let k = 0; k < 3; k++) {
      const ox = (r() - 0.5) * c.s * 0.8;
      const oy = (r() - 0.5) * c.s * 0.6;
      ctx.moveTo(c.x + ox + c.s * 0.6, c.y + oy);
      ctx.ellipse(c.x + ox, c.y + oy, c.s * 0.6, c.s * 0.5, r() * 3, 0, Math.PI * 2);
    }
    ctx.fill();
    // a lit upper edge and a shaded underside on each clump
    if (l > 0.45) {
      ctx.fillStyle = css(mix(lit, hi, l - 0.45), 0.8);
      ctx.beginPath(); ctx.ellipse(c.x - c.s * 0.2, c.y - c.s * 0.25, c.s * 0.35, c.s * 0.22, -0.3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = css(dark, 0.35);
    ctx.beginPath(); ctx.ellipse(c.x + c.s * 0.15, c.y + c.s * 0.35, c.s * 0.45, c.s * 0.16, 0, 0, Math.PI * 2); ctx.fill();
  }
  // fine leaf speckle for texture
  for (let i = 0; i < 140; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r());
    const x = cx + Math.cos(a) * RX * d * 0.95;
    const y = crownY + Math.sin(a) * RY * d * 0.92;
    const nx = (x - cx) / RX;
    const ny = (y - crownY) / RY;
    const l = 0.55 - nx * 0.35 - ny * 0.45;
    ctx.fillStyle = r() < l ? css(hi, 0.55) : css(dark, 0.6);
    ctx.fillRect(x, y, 0.8, 0.8);
  }
  // the shaded underside of the whole crown
  const sg = ctx.createLinearGradient(0, crownY, 0, crownY + RY);
  sg.addColorStop(0, 'rgba(10,20,8,0)'); sg.addColorStop(1, 'rgba(10,20,8,0.35)');
  ctx.fillStyle = sg;
  ctx.beginPath(); ctx.ellipse(cx, crownY + 1, RX, RY * 0.95, 0, 0, Math.PI * 2); ctx.fill();
}

// Conifer (pine / fir): drooping tiers of needles, darker and bluer than the oaks.
function drawPine(ctx, v) {
  const r = seeded(7001 + v * 97);
  const cx = PINE_W / 2;
  const base = PINE_BASE;
  const dark = [16, 32, 26];
  const mid = [34, 60, 42];
  const lit = [70, 98, 62];
  const hi = [118, 140, 92];
  const top = 4 + r() * 3;
  // trunk
  ctx.fillStyle = '#4a3828'; ctx.fillRect(cx - 1.4, base - 14, 2.8, 14);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(cx + 0.2, base - 14, 1.2, 14);
  const tiers = 6;
  for (let k = 0; k < tiers; k++) {
    const t = k / (tiers - 1);             // 0 bottom … 1 top
    const yb = base - 10 - t * (base - 10 - top - 8);
    const w = 13.5 * (1 - t * 0.78) + r() * 1.2;
    const h = 11 - t * 3;
    // tier silhouette with a ragged, drooping lower edge
    ctx.fillStyle = css(mix(dark, mid, 0.3));
    ctx.beginPath();
    ctx.moveTo(cx, yb - h);
    const steps = 9;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const x = cx + w - u * w * 2;
      const y = yb + Math.sin(u * Math.PI) * 1.8 + (i % 2 ? -1.6 : 0.6) * (0.6 + r() * 0.6);
      if (i === 0) ctx.lineTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    // lit left side, shaded right side, needle strokes
    const g = ctx.createLinearGradient(cx - w, 0, cx + w, 0);
    g.addColorStop(0, css(lit, 0.85)); g.addColorStop(0.45, css(mid, 0.4)); g.addColorStop(1, css(dark, 0.6));
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 18; i++) {
      const u = r();
      const x = cx - w + u * w * 2;
      const y = yb - r() * h * 0.8;
      const lt = 1 - u;
      ctx.strokeStyle = r() < lt * 0.8 ? css(hi, 0.55) : css(dark, 0.55);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (u - 0.5) * 2.4, y + 1.6); ctx.stroke();
    }
  }
  // tip
  ctx.fillStyle = css(mid);
  ctx.beginPath(); ctx.moveTo(cx, top - 2); ctx.lineTo(cx + 2.4, top + 6); ctx.lineTo(cx - 2.4, top + 6); ctx.closePath(); ctx.fill();
}

// What's left after a tree is felled: a stump with a pale cut top.
function drawStump(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(8, 11, 6, 2.2, 0, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createLinearGradient(4, 0, 12, 0);
  g.addColorStop(0, '#6a5440'); g.addColorStop(1, '#2e2219');
  ctx.fillStyle = g; ctx.fillRect(4.6, 5.4, 6.8, 5.6);
  ctx.fillStyle = '#c8a878'; ctx.beginPath(); ctx.ellipse(8, 5.4, 3.4, 1.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(120,90,60,0.8)'; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.ellipse(8, 5.4, 1.8, 0.7, 0, 0, Math.PI * 2); ctx.stroke();
}

export function ensureTreeTex(scene) {
  if (scene.textures.exists('tree_oak_0')) return;
  makeCanvas(scene, 'tree_stump', 16, 13, drawStump, ART_RES);
  for (let v = 0; v < OAKS; v++) makeCanvas(scene, `tree_oak_${v}`, OAK_W, OAK_H, (ctx) => drawOak(ctx, v), ART_RES);
  for (let v = 0; v < PINES; v++) makeCanvas(scene, `tree_pine_${v}`, PINE_W, PINE_H, (ctx) => drawPine(ctx, v), ART_RES);
}

// How tall a tree on the map is drawn (screen px), for falling leaves etc.
export function treeHeight(a) {
  return (a.pine ? PINE_BASE - 4 : OAK_BASE - 8) * a.scale;
}

// The tree sprites for the whole map, kept in step with the forest tiles.
export class TreeLayer {
  constructor(scene, map) {
    this.scene = scene;
    this.map = map;
    this.sprites = new Map(); // tile index → images (one per tree, null once felled)
    this.felled = new Map();  // tile index → set of felled tree numbers
    this.lastHit = new Map(); // tile index → the tree number last chopped
    ensureTreeTex(scene);
    this.starting = true;
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) this.refresh(x, y);
    this.starting = false;
  }

  // The trees still standing on a tile (for workers to pick from).
  standingAnchors(x, y) {
    if (this.map.get(x, y) !== TERRAIN.FOREST) return [];
    const f = this.felled.get(y * this.map.w + x);
    return this.map.objectAnchors(x, y).filter((a, k) => !(f && f.has(k)));
  }

  isStanding(x, y, a) {
    return !!a && this.standingAnchors(x, y).some((b) => Math.abs(b.x - a.x) < 0.5 && Math.abs(b.y - a.y) < 0.5);
  }

  // How many of this tile's trees are still standing.
  standing(x, y, n) {
    const i = y * this.map.w + x;
    const full = TERRAIN_AMOUNT[TERRAIN.FOREST] || RESOURCE_AMOUNT.wood;
    const frac = Math.max(0, Math.min(1, this.map.amount[i] / full));
    return Math.max(1, Math.ceil(n * frac - 0.001));
  }

  makeTree(a) {
    const key = a.pine ? `tree_pine_${Math.floor(a.hue * PINES) % PINES}` : `tree_oak_${Math.floor(a.hue * OAKS) % OAKS}`;
    const oy = (a.pine ? PINE_BASE / PINE_H : OAK_BASE / OAK_H);
    const img = this.scene.add.image(a.x, a.y, key).setOrigin(0.5, oy).setScale(a.scale / ART_RES).setDepth(a.y);
    if (a.flip) img.setFlipX(true);
    return img;
  }

  makeStump(a, fade) {
    const img = this.scene.add.image(a.x, a.y, 'tree_stump').setOrigin(0.5, 0.85).setScale(a.scale * 0.9 / ART_RES).setDepth(a.y - 0.5);
    // stumps weather away after a while
    this.scene.tweens.add({ targets: img, alpha: 0, delay: fade ? 45000 : 20000, duration: 4000, onComplete: () => img.destroy() });
  }

  refresh(x, y) {
    const i = y * this.map.w + x;
    const forest = this.map.get(x, y) === TERRAIN.FOREST;
    let list = this.sprites.get(i);
    if (!forest) {
      // gone: cut down to the last tree, burnt or flooded
      if (list) {
        const anchors = this.map.objectAnchors.call({ ...this.map, get: () => TERRAIN.FOREST }, x, y);
        list.forEach((img, k) => {
          if (!img) return;
          if (this.map.get(x, y) === TERRAIN.GRASS && this.scene.renderShots) this.fall(img, anchors[k], k, i);
          else img.destroy();
        });
      }
      this.sprites.delete(i); this.felled.delete(i); this.lastHit.delete(i);
      return;
    }
    const anchors = this.map.objectAnchors(x, y);
    if (!list) {
      list = anchors.map((a) => this.makeTree(a));
      this.sprites.set(i, list);
      this.felled.set(i, new Set());
    }
    const felled = this.felled.get(i);
    const want = this.standing(x, y, anchors.length);
    // fell trees one at a time until the right number are left: the one being chopped first,
    // otherwise the one nearest the front
    while (anchors.length - felled.size > want) {
      let k = this.lastHit.get(i);
      if (k == null || felled.has(k)) {
        k = -1;
        for (let j = anchors.length - 1; j >= 0; j--) if (!felled.has(j)) { k = j; break; }
      }
      if (k < 0) break;
      felled.add(k);
      const img = list[k];
      list[k] = null;
      if (img) {
        if (this.starting || !this.scene.renderShots) { img.destroy(); this.makeStump(anchors[k], false); }
        else this.fall(img, anchors[k], k, i);
      }
    }
  }

  // Timber! The tree topples away from the axe, lands with a thump and some leaves, then fades.
  fall(img, a, k, i) {
    const s = this.scene;
    const hit = this.lastHitSide && this.lastHitSide.get(i);
    const dir = hit ? hit : (img.x % 2 < 1 ? 1 : -1);
    this.makeStump(a, true);
    s.tweens.add({
      targets: img, angle: 84 * dir, duration: 950, ease: 'Quad.easeIn',
      onComplete: () => {
        s.tweens.add({ targets: img, angle: 80 * dir, duration: 120, yoyo: true, ease: 'Sine.easeOut' });
        if (s.fx && s.fx.treeLanded) s.fx.treeLanded(img.x + dir * 34 * a.scale, img.y - 4, a.pine);
        s.tweens.add({ targets: img, alpha: 0, delay: 3500, duration: 1500, onComplete: () => img.destroy() });
      },
    });
  }

  // A tree shakes when it's chopped.
  shake(x, y, a, side = 1) {
    const i = y * this.map.w + x;
    const list = this.sprites.get(i);
    if (!list) return;
    const k = list.findIndex((s) => s && Math.abs(s.x - a.x) < 0.5 && Math.abs(s.y - a.y) < 0.5);
    if (k < 0) return;
    // remember which tree is being chopped, and from which side (it falls away from the axe)
    this.lastHit.set(i, k);
    if (!this.lastHitSide) this.lastHitSide = new Map();
    this.lastHitSide.set(i, side);
    const img = list[k];
    if (img.shaking) return;
    img.shaking = true;
    this.scene.tweens.add({ targets: img, angle: { from: -1.6, to: 1.2 }, duration: 70, yoyo: true, repeat: 1, ease: 'Sine.easeInOut',
      onComplete: () => { img.angle = 0; img.shaking = false; } });
  }
}
