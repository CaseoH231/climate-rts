// Visual effects that make the world feel alive: climate colour grading, burning buildings,
// ruins, gun flashes and impacts, falling units, floating "+10" text and flocks of birds.
// Everything here is cosmetic — the simulation never depends on it.

import { toIso } from './iso.js';
import { TILE } from './config.js';
import { makeCanvas } from './art.js';

const ART = 2; // textures are drawn at 2x and shown at half size

function makeEffectTextures(scene) {
  // soft flame tongue
  makeCanvas(scene, 'fx_flame', 12, 20, (c) => {
    const g = c.createRadialGradient(6, 14, 1, 6, 12, 10);
    g.addColorStop(0, 'rgba(255,244,190,1)');
    g.addColorStop(0.35, 'rgba(255,170,50,0.95)');
    g.addColorStop(0.75, 'rgba(220,70,20,0.6)');
    g.addColorStop(1, 'rgba(160,30,10,0)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(6, 0);
    c.quadraticCurveTo(12, 10, 10, 15);
    c.quadraticCurveTo(6, 21, 2, 15);
    c.quadraticCurveTo(0, 10, 6, 0);
    c.fill();
  }, ART);
  // round soft puff (smoke, dust)
  makeCanvas(scene, 'fx_puff', 16, 16, (c) => {
    const g = c.createRadialGradient(8, 8, 0, 8, 8, 8);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.4)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 16, 16);
  }, ART);
  // bright star-shaped muzzle flash
  makeCanvas(scene, 'fx_flash', 14, 14, (c) => {
    const g = c.createRadialGradient(7, 7, 0, 7, 7, 7);
    g.addColorStop(0, 'rgba(255,255,230,1)');
    g.addColorStop(0.4, 'rgba(255,210,90,0.9)');
    g.addColorStop(1, 'rgba(255,140,30,0)');
    c.fillStyle = g;
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const r = i % 2 ? 2.5 : 7;
      c.lineTo(7 + Math.cos(a) * r, 7 + Math.sin(a) * r);
    }
    c.fill();
  }, ART);
  // rain streak
  makeCanvas(scene, 'fx_drop', 2, 14, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 14);
    g.addColorStop(0, 'rgba(200,215,235,0)');
    g.addColorStop(1, 'rgba(200,215,235,0.9)');
    c.fillStyle = g;
    c.fillRect(0, 0, 2, 14);
  }, 1);
  // birds, wings up and down
  for (const [k, up] of [['fx_bird0', true], ['fx_bird1', false]]) {
    makeCanvas(scene, k, 14, 8, (c) => {
      c.strokeStyle = '#1d1a17';
      c.lineWidth = 1.4;
      c.lineCap = 'round';
      c.beginPath();
      if (up) { c.moveTo(1, 2); c.quadraticCurveTo(4, 6, 7, 5); c.quadraticCurveTo(10, 6, 13, 2); }
      else { c.moveTo(1, 6); c.quadraticCurveTo(4, 3, 7, 5); c.quadraticCurveTo(10, 3, 13, 6); }
      c.stroke();
    }, ART);
  }
}

// Scorched ground with rubble, drawn for a footprint of w x h tiles.
function makeRubble(scene, w, h, wood) {
  const key = `fx_rubble_${w}x${h}${wood ? 'w' : ''}`;
  const W = (w + h) * TILE;
  const H = ((w + h) * TILE) / 2;
  makeCanvas(scene, key, W, H, (c) => {
    // footprint diamond in local coords (top corner at x = h*TILE)
    const P = (x, y) => [x - y + h * TILE, (x + y) / 2];
    const grd = c.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, W / 2);
    grd.addColorStop(0, 'rgba(30,24,20,0.75)');
    grd.addColorStop(0.7, 'rgba(45,38,30,0.45)');
    grd.addColorStop(1, 'rgba(45,38,30,0)');
    c.fillStyle = grd;
    c.beginPath();
    const corners = [P(0, 0), P(w * TILE, 0), P(w * TILE, h * TILE), P(0, h * TILE)];
    corners.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.fill();
    // scattered stones and charred beams
    let seed = w * 31 + h * 7 + (wood ? 3 : 0);
    const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const n = 10 * w * h;
    for (let i = 0; i < n; i++) {
      const [x, y] = P(4 + r() * (w * TILE - 8), 4 + r() * (h * TILE - 8));
      if (r() < (wood ? 0.6 : 0.3)) {
        c.save();
        c.translate(x, y);
        c.rotate((r() - 0.5) * 2.5);
        c.fillStyle = r() < 0.5 ? '#2a1d14' : '#4a3424';
        c.fillRect(-5, -1, 10, 2.2);
        c.restore();
      } else {
        const s = 1.5 + r() * 2.5;
        const v = 90 + Math.floor(r() * 50);
        c.fillStyle = `rgb(${v},${v - 6},${v - 14})`;
        c.beginPath();
        c.ellipse(x, y, s, s * 0.7, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = 'rgba(0,0,0,0.3)';
        c.fillRect(x - s, y + s * 0.4, s * 2, 1);
      }
    }
  }, 1);
  return key;
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    makeEffectTextures(scene);
    this.burning = new Map(); // building -> { flames: [], smokeTimer }
    this.damageTimer = 0;
    this.birdTimer = 8000 + Math.random() * 10000;
    this.flocks = [];
    this.grade = null;
    this.gradeKey = '';
    const cam = scene.cameras.main;
    if (scene.game.renderer.type === Phaser.WEBGL && cam.postFX) {
      this.grade = cam.postFX.addColorMatrix();
    }
  }

  // ---- Climate colour grading: the hotter it gets, the more washed-out and amber the world looks ----
  updateGrade(temp, drought) {
    if (!this.grade) return;
    const k = Math.max(0, Math.min(1, temp / 4.5));
    const d = drought > 0 ? 1 : 0;
    const key = `${Math.round(k * 40)}_${d}`;
    if (key === this.gradeKey) return;
    this.gradeKey = key;
    const g = this.grade;
    g.reset();
    if (k <= 0.01 && !d) return;
    g.saturate(-0.55 * k - 0.15 * d, true);
    // warm it up: more red, a little less blue
    const warm = 0.1 * k + 0.04 * d;
    g.multiply([1 + warm, 0, 0, 0, 0, 0, 1 + warm * 0.35, 0, 0, 0, 0, 0, 1 - warm * 0.9, 0, 0, 0, 0, 0, 1, 0], true);
  }

  // ---- Battle damage: smoke when a building is hurt, flames when it's badly hurt ----
  updateDamage(delta, buildings, view) {
    this.damageTimer -= delta;
    if (this.damageTimer > 0) return;
    this.damageTimer = 220;
    const s = this.scene;
    const pad = 120;
    for (const b of buildings) {
      if (!b.complete || b.dead) continue;
      const frac = b.hp / b.maxHp;
      const iso = b.container;
      const onScreen = iso.x > view.x - pad && iso.x < view.right + pad && iso.y > view.y - pad && iso.y < view.bottom + pad + 80;
      const visible = onScreen && iso.visible !== false;
      let st = this.burning.get(b);
      if (frac < 0.4 && !b.def.wall) {
        if (!st) { st = { flames: [] }; this.burning.set(b, st); }
        const want = visible ? Math.min(6, 1 + Math.floor(((0.4 - frac) / 0.4) * 5) + (b.w > 2 ? 1 : 0)) : 0;
        while (st.flames.length < want) st.flames.push(this.makeFlame(b));
        while (st.flames.length > want) st.flames.pop().destroy();
      } else if (st) {
        for (const f of st.flames) f.destroy();
        this.burning.delete(b);
      }
      if (visible && frac < 0.7 && Math.random() < (frac < 0.4 ? 0.9 : 0.45)) {
        const p = this.roofPoint(b);
        this.smoke(p.x, p.y, frac < 0.4 ? 0x3a3532 : 0x6a6560);
      }
    }
    // tidy up flames of buildings that no longer exist
    for (const [b, st] of this.burning) {
      if (b.dead) { for (const f of st.flames) f.destroy(); this.burning.delete(b); }
    }
  }

  // A random spot on top of a building (in iso space).
  roofPoint(b) {
    const gx = b.tx * TILE + (0.2 + Math.random() * 0.6) * b.w * TILE;
    const gy = b.ty * TILE + (0.2 + Math.random() * 0.6) * b.h * TILE;
    const i = toIso(gx, gy);
    return { x: i.x, y: i.y - 14 - Math.random() * (10 + b.w * 6) };
  }

  makeFlame(b) {
    const p = this.roofPoint(b);
    const f = this.scene.add.image(p.x, p.y, 'fx_flame').setOrigin(0.5, 0.9).setScale(0.5 + Math.random() * 0.35)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(b.container.depth + 1);
    this.scene.tweens.add({
      targets: f, scaleY: f.scaleY * 1.35, scaleX: f.scaleX * 0.85, alpha: 0.75,
      duration: 160 + Math.random() * 140, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    return f;
  }

  smoke(x, y, color = 0x5f5c58) {
    const p = this.scene.add.image(x + (Math.random() - 0.5) * 6, y, 'fx_puff').setTint(color).setAlpha(0.45)
      .setScale(0.5).setDepth(8e5);
    this.scene.tweens.add({
      targets: p, y: y - 60 - Math.random() * 30, x: p.x + 15 + Math.random() * 25, scale: 2.4, alpha: 0,
      duration: 2600 + Math.random() * 800, onComplete: () => p.destroy(),
    });
  }

  // ---- Ruins left where a building fell (they fade away after a couple of minutes) ----
  ruins(b) {
    const key = makeRubble(this.scene, b.w, b.h, ['house', 'farm', 'lumber_camp', 'mining_camp', 'mill', 'barracks', 'market', 'trees'].includes(b.type));
    const top = toIso(b.tx * TILE, b.ty * TILE);
    const img = this.scene.add.image(top.x - b.h * TILE, top.y, key).setOrigin(0, 0).setDepth(1.5);
    this.scene.tweens.add({ targets: img, alpha: 0, delay: 120000, duration: 8000, onComplete: () => img.destroy() });
    // a burst of dust as it comes down
    const c = toIso(b.cx, b.cy);
    for (let i = 0; i < 8 + b.w * 3; i++) {
      const d = this.scene.add.image(c.x + (Math.random() - 0.5) * b.w * 40, c.y - Math.random() * 20, 'fx_puff')
        .setTint(0x8a7f70).setAlpha(0.7).setScale(0.8).setDepth(c.y + 50);
      this.scene.tweens.add({
        targets: d, y: d.y - 20 - Math.random() * 30, x: d.x + (Math.random() - 0.5) * 40, scale: 3 + Math.random() * 2, alpha: 0,
        duration: 1400 + Math.random() * 900, onComplete: () => d.destroy(),
      });
    }
    return img;
  }

  // ---- Combat ----
  muzzle(ix, iy, big = false) {
    const f = this.scene.add.image(ix, iy, 'fx_flash').setBlendMode(Phaser.BlendModes.ADD).setScale(big ? 0.9 : 0.6).setDepth(9e5);
    this.scene.tweens.add({ targets: f, alpha: 0, scale: f.scale * 1.4, duration: 110, onComplete: () => f.destroy() });
    const p = this.scene.add.image(ix, iy, 'fx_puff').setTint(0xcfcac0).setAlpha(0.45).setScale(0.35).setDepth(9e5);
    this.scene.tweens.add({ targets: p, y: iy - 12, scale: 1.4, alpha: 0, duration: 700, onComplete: () => p.destroy() });
  }

  impact(ix, iy, building) {
    const n = building ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const p = this.scene.add.image(ix + (Math.random() - 0.5) * 10, iy + (Math.random() - 0.5) * 6, 'fx_puff')
        .setTint(building ? 0x9a8c78 : 0xb5a58a).setAlpha(0.55).setScale(0.3).setDepth(iy + 2);
      this.scene.tweens.add({ targets: p, y: p.y - 8, scale: 1, alpha: 0, duration: 450, onComplete: () => p.destroy() });
    }
  }

  // Brief white flash on a unit that takes a hit.
  hitFlash(u) {
    if (!u.sprite || u.flashing) return;
    u.flashing = true;
    u.sprite.setTintFill(0xffffff);
    if (!u.def.vehicle) { // a small flinch
      const kx = u.sprite.flipX ? 1.5 : -1.5;
      u.sprite.x = kx;
      this.scene.tweens.add({ targets: u.sprite, x: 0, duration: 120, ease: 'Quad.easeOut' });
    }
    this.scene.time.delayedCall(70, () => {
      u.flashing = false;
      if (u.sprite && u.sprite.active) u.sprite.clearTint();
    });
  }

  // Wood chips / stone shards / soil flying off a tool blow.
  chips(ix, iy, color) {
    const s = this.scene;
    for (let i = 0; i < 3; i++) {
      const c = s.add.rectangle(ix, iy, 1.6 + Math.random(), 1.6 + Math.random(), color).setDepth(iy + 3);
      const vx = (Math.random() - 0.5) * 22;
      s.tweens.add({ targets: c, x: ix + vx, duration: 380, ease: 'Linear' });
      s.tweens.add({
        targets: c, y: iy - 6 - Math.random() * 6, duration: 160, ease: 'Quad.easeOut', yoyo: true,
        onComplete: () => c.destroy(),
      });
    }
  }

  // A blow landing on whatever a worker is working (all just for show).
  workHit(kind, at, u, target) {
    const s = this.scene;
    const flip = u.sprite.flipX ? -1 : 1;
    const bits = (n, color, spread, up, size = 1.6, life = 380) => {
      for (let i = 0; i < n; i++) {
        const c = s.add.rectangle(at.x, at.y, size + Math.random() * 0.8, size + Math.random() * 0.8, color).setDepth(at.y + 20);
        const vx = (Math.random() - 0.5) * spread - flip * spread * 0.3; // mostly back towards the worker
        s.tweens.add({ targets: c, x: at.x + vx, angle: Math.random() * 360, duration: life, ease: 'Linear' });
        s.tweens.add({ targets: c, y: at.y - up - Math.random() * up, duration: life * 0.4, ease: 'Quad.easeOut', yoyo: true, hold: 0, onComplete: () => c.destroy() });
      }
    };
    const spark = () => {
      const sp = s.add.star(at.x, at.y, 4, 0.6, 2.4, 0xfff4c0).setDepth(at.y + 21);
      s.tweens.add({ targets: sp, scale: 0.2, alpha: 0, angle: 45, duration: 140, onComplete: () => sp.destroy() });
    };
    const puff = (tint, scale = 0.35, alpha = 0.45) => {
      const d = s.add.image(at.x, at.y + 2, 'fx_puff').setTint(tint).setAlpha(alpha).setScale(scale).setDepth(at.y + 19);
      s.tweens.add({ targets: d, y: d.y - 5, scale: scale * 2.6, alpha: 0, duration: 520, onComplete: () => d.destroy() });
    };
    if (kind === 'wood') {
      bits(3, 0xd8b27a, 16, 5);
      // a couple of leaves shaken loose from the crown
      if (target && target.top != null) {
        for (let i = 0; i < 2; i++) {
          if (Math.random() < 0.35) continue;
          const lx = target.x + (Math.random() - 0.5) * 14;
          const ly = target.top + Math.random() * 8;
          const leaf = s.add.ellipse(lx, ly, 2.4, 1.3, Math.random() < 0.5 ? 0x5e8a3a : 0x3f6a2a).setDepth(target.y + 30);
          const drop = target.y - ly + 2;
          s.tweens.add({ targets: leaf, y: ly + drop, duration: 900 + Math.random() * 500, ease: 'Sine.easeIn', onComplete: () => s.tweens.add({ targets: leaf, alpha: 0, duration: 400, onComplete: () => leaf.destroy() }) });
          s.tweens.add({ targets: leaf, x: lx + 5, angle: 120, duration: 360, yoyo: true, repeat: 2, ease: 'Sine.easeInOut' });
        }
      }
    } else if (kind === 'stone') {
      bits(3, 0xb9b2a4, 14, 5); spark();
    } else if (kind === 'coal') {
      bits(3, 0x2a2826, 14, 5); spark(); puff(0x3a3634, 0.3, 0.35);
    } else if (kind === 'berries') {
      // a berry goes from the bush into the basket, and the leaves rustle
      bits(2, 0x4f7a33, 10, 3, 1.4, 300);
      const b = s.add.circle(at.x, at.y, 1.3, 0xb02a3c).setDepth(at.y + 22);
      const bx = u.isoX - flip * 8.3;
      const by = u.isoY - 11;
      s.tweens.add({ targets: b, x: bx, duration: 260, ease: 'Linear' });
      s.tweens.add({ targets: b, y: Math.min(at.y, by) - 5, duration: 130, ease: 'Quad.easeOut', yoyo: true, onComplete: () => { b.y = by; b.destroy(); } });
    } else if (kind === 'meat') {
      bits(2, 0x7a4a34, 8, 2, 1.2, 260);
    } else if (kind === 'soil') {
      bits(3, 0x7a5a3a, 12, 4); puff(0x9c8a68, 0.3, 0.4);
    } else if (kind === 'build') {
      bits(2, 0xe2cfa0, 12, 4, 1.3); puff(0xb3a68c, 0.28, 0.4);
      if (Math.random() < 0.4) spark();
    }
  }

  // A felled tree hitting the ground: a burst of dust and leaves along the trunk.
  treeLanded(x, y, pine) {
    const s = this.scene;
    for (let i = 0; i < 5; i++) {
      const d = s.add.image(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 8, 'fx_puff')
        .setTint(0xa89a7c).setAlpha(0.55).setScale(0.4).setDepth(y + 10);
      s.tweens.add({ targets: d, y: d.y - 8, scale: 1.6, alpha: 0, duration: 800 + Math.random() * 400, onComplete: () => d.destroy() });
    }
    for (let i = 0; i < 8; i++) {
      const lx = x + (Math.random() - 0.5) * 36;
      const leaf = s.add.ellipse(lx, y - 4, 2.4, 1.3, pine ? 0x2e4a30 : (Math.random() < 0.5 ? 0x5e8a3a : 0x3f6a2a)).setDepth(y + 11);
      s.tweens.add({ targets: leaf, y: y - 10 - Math.random() * 10, x: lx + (Math.random() - 0.5) * 16, angle: 200, duration: 300, yoyo: true, ease: 'Quad.easeOut',
        onComplete: () => s.tweens.add({ targets: leaf, alpha: 0, duration: 600, onComplete: () => leaf.destroy() }) });
    }
  }

  // A thrown hunting spear.
  spear(x0, y0, x1, y1) {
    const s = this.scene;
    const ang = Math.atan2(y1 - y0, x1 - x0);
    const sp = s.add.rectangle(x0, y0, 14, 1.4, 0x8a6a44).setRotation(ang).setDepth(Math.max(y0, y1) + 30);
    const tip = s.add.rectangle(x0, y0, 3, 2, 0xcfd4d8).setRotation(ang).setDepth(Math.max(y0, y1) + 31);
    const d = Math.hypot(x1 - x0, y1 - y0);
    const dur = Math.max(160, d * 2.2);
    const arc = Math.min(18, d * 0.15);
    s.tweens.addCounter({
      from: 0, to: 1, duration: dur,
      onUpdate: (tw) => {
        const t = tw.getValue();
        const x = x0 + (x1 - x0) * t;
        const y = y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * arc;
        sp.setPosition(x, y);
        tip.setPosition(x + Math.cos(ang) * 7, y + Math.sin(ang) * 7);
      },
      onComplete: () => {
        s.tweens.add({ targets: [sp, tip], alpha: 0, delay: 900, duration: 500, onComplete: () => { sp.destroy(); tip.destroy(); } });
      },
    });
  }

  // A building settling as it's finished: a little drop and a ring of dust.
  completeBounce(b) {
    const s = this.scene;
    if (!b.image) return;
    const y0 = b.image.y;
    b.image.y = y0 - 5;
    s.tweens.add({ targets: b.image, y: y0, duration: 420, ease: 'Bounce.easeOut' });
    const c = toIso(b.cx, b.cy);
    const n = 6 + b.w * 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 12 + b.w * 14;
      const d = s.add.image(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r * 0.5, 'fx_puff')
        .setTint(0xb3a68c).setAlpha(0.6).setScale(0.5).setDepth(c.y + 40);
      s.tweens.add({
        targets: d, x: d.x + Math.cos(a) * 14, y: d.y + Math.sin(a) * 7 - 6, scale: 1.6, alpha: 0,
        duration: 700 + Math.random() * 300, onComplete: () => d.destroy(),
      });
    }
  }

  // The unit topples over and fades away (vehicles burn out instead).
  death(u) {
    const s = this.scene;
    const spr = u.sprite;
    const img = s.add.image(u.isoX, u.isoY, spr.texture.key).setOrigin(spr.originX, spr.originY).setScale(spr.scaleX, spr.scaleY)
      .setFlipX(spr.flipX).setDepth(u.isoY);
    if (u.def.vehicle) {
      img.setTint(0x3a3430);
      for (let i = 0; i < 6; i++) this.smoke(u.isoX + (Math.random() - 0.5) * 20, u.isoY - 10, 0x2f2b28);
      const f = s.add.image(u.isoX, u.isoY - 6, 'fx_flash').setBlendMode(Phaser.BlendModes.ADD).setScale(1.8).setDepth(9e5);
      s.tweens.add({ targets: f, alpha: 0, scale: 3, duration: 350, onComplete: () => f.destroy() });
      s.tweens.add({ targets: img, alpha: 0, delay: 6000, duration: 3000, onComplete: () => img.destroy() });
      return;
    }
    // knocked back a step, a small hop, then down onto the ground with a puff of dust
    const dir = spr.flipX ? 1 : -1; // fall away from the way they were facing
    const y0 = img.y;
    s.tweens.chain({
      targets: img,
      tweens: [
        { x: img.x + dir * 3, y: y0 - 3, angle: 12 * dir, duration: 110, ease: 'Quad.easeOut' },
        { x: img.x + dir * 6, y: y0 + 2, angle: 88 * dir, duration: 300, ease: 'Quad.easeIn' },
        { angle: 82 * dir, y: y0 + 1, duration: 120, ease: 'Sine.easeOut' },
      ],
    });
    s.time.delayedCall(410, () => {
      for (let i = 0; i < 3; i++) {
        const d = s.add.image(u.isoX + dir * (6 + i * 4), y0, 'fx_puff').setTint(0x9c8f78).setAlpha(0.5).setScale(0.35).setDepth(y0 + 1);
        s.tweens.add({ targets: d, y: d.y - 5, x: d.x + (Math.random() - 0.5) * 10, scale: 1.1, alpha: 0, duration: 600, onComplete: () => d.destroy() });
      }
    });
    s.tweens.add({ targets: img, alpha: 0, delay: 4000, duration: 2500, onComplete: () => img.destroy() });
  }

  // Floating text, e.g. "+10" over a worker dropping off wood.
  floatText(ix, iy, text, color = '#f2e6c0') {
    const t = this.scene.add.text(ix, iy, text, {
      fontFamily: 'Georgia, serif', fontSize: '13px', color, stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(9.5e5);
    this.scene.tweens.add({ targets: t, y: iy - 28, alpha: 0, duration: 1300, ease: 'Sine.easeOut', onComplete: () => t.destroy() });
  }

  // ---- Birds: a flock now and then, fewer as the planet heats up ----
  updateBirds(delta, view, temp) {
    this.birdTimer -= delta;
    if (this.birdTimer <= 0) {
      this.birdTimer = (18000 + Math.random() * 22000) * (1 + Math.max(0, temp) * 0.6);
      if (temp < 4) this.spawnFlock(view);
    }
    for (const f of this.flocks) {
      f.t += delta;
      for (const b of f.birds) {
        b.x += (f.vx * delta) / 1000;
        b.y += (f.vy * delta) / 1000 + Math.sin((f.t + b.off) / 300) * 0.15;
        b.setTexture(Math.floor((f.t + b.off) / 140) % 2 ? 'fx_bird0' : 'fx_bird1');
        b.shadow.setPosition(b.x + 30, b.y + 90);
      }
    }
    this.flocks = this.flocks.filter((f) => {
      if (f.t < f.life) return true;
      for (const b of f.birds) { b.shadow.destroy(); b.destroy(); }
      return false;
    });
  }

  spawnFlock(view) {
    const s = this.scene;
    const fromLeft = Math.random() < 0.5;
    const speed = 70 + Math.random() * 40;
    const vx = (fromLeft ? 1 : -1) * speed;
    const vy = (Math.random() - 0.5) * speed * 0.4;
    const x0 = fromLeft ? view.x - 60 : view.right + 60;
    const y0 = view.y + view.height * (0.2 + Math.random() * 0.5);
    const n = 4 + Math.floor(Math.random() * 5);
    const birds = [];
    for (let i = 0; i < n; i++) {
      const row = Math.ceil(i / 2);
      const side = i % 2 ? 1 : -1;
      const b = s.add.image(x0 - Math.sign(vx) * row * 16, y0 + side * row * 9, 'fx_bird0').setScale(0.55).setDepth(9.8e5).setFlipX(vx < 0);
      b.off = Math.random() * 400;
      b.shadow = s.add.image(b.x + 30, b.y + 90, 'fx_bird0').setScale(0.5).setTint(0x000000).setAlpha(0.18).setDepth(2);
      birds.push(b);
    }
    this.flocks.push({ birds, vx, vy, t: 0, life: ((view.width + 240) / speed) * 1000 });
  }

  destroy() {
    for (const st of this.burning.values()) for (const f of st.flames) f.destroy();
    this.burning.clear();
    for (const f of this.flocks) for (const b of f.birds) { b.shadow.destroy(); b.destroy(); }
    this.flocks = [];
  }
}

