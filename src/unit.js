// Units: workers and soldiers. Workers can gather resources and construct buildings.
import { findPath, smoothPath } from './pathfinding.js';
import { unitKey, ART_RES, UNIT_SPRITE_SCALE, unitTier, ensureUnitTex, ensureJobTex, jobContact, ensureCarryTex } from './art.js';
import { toIso, fromIso } from './iso.js';
import { TERRAIN, TILE } from './config.js';

// attack = damage per hit, range in pixels, cooldown in seconds between hits,
// sight = how far idle units notice enemies, vsBuilding = damage multiplier against buildings.
// era = first era it can be trained in.
// bonus = damage multiplier against particular unit types (the counter system).
export const UNIT_TYPES = {
  worker:  { name: 'Worker',  era: 0, speed: 75, hp: 25, cost: { food: 50 },           trainTime: 8,
             attack: 3, range: 24, cooldown: 1.5, sight: 0,   vsBuilding: 0.3,
             desc: 'Gathers resources and constructs buildings.' },
  soldier: { name: 'Soldier', era: 0, speed: 85, hp: 60, cost: { food: 60, wood: 20 }, trainTime: 10,
             attack: 8, range: 26, cooldown: 1.1, sight: 210, vsBuilding: 0.6,
             bonus: { rifleman: 1.5, scout: 1.6, cannon: 1.5 },
             desc: 'Tough close-range fighter. Strong against riflemen and buildings; archers can wear it down.' },
  archer:  { name: 'Archer',  era: 0, speed: 80, hp: 40, cost: { food: 40, wood: 45 }, trainTime: 11,
             attack: 6, range: 150, cooldown: 1.3, sight: 230, vsBuilding: 0.25,
             bonus: { soldier: 2, worker: 1.25, armoured_car: 0.4, e_tank: 0.3 },
             desc: 'Shoots from range. Strong against soldiers, useless against armour, fragile up close.' },
  scout:   { name: 'Scout Rider', era: 0, speed: 135, hp: 50, cost: { food: 80 }, trainTime: 10, mounted: true,
             attack: 6, range: 28, cooldown: 1.0, sight: 330, vsBuilding: 0.15,
             bonus: { archer: 1.75, worker: 1.5, cannon: 2.5, medic: 1.5 },
             desc: 'Fast rider that sees far. Great for exploring and raiding workers, archers and cannons. Weak to soldiers.' },
  medic:   { name: 'Field Medic', era: 1, speed: 80, hp: 45, cost: { food: 60, energy: 30 }, trainTime: 12,
             attack: 0, range: 0, cooldown: 1, sight: 200, vsBuilding: 0, heals: 3,
             desc: 'Heals hurt soldiers nearby (3 health per second). Does not fight.' },
  cannon:  { name: 'Field Cannon', era: 1, speed: 48, hp: 120, cost: { wood: 150, stone: 80, energy: 60 }, trainTime: 22, vehicle: true,
             attack: 40, range: 230, cooldown: 4.2, sight: 240, vsBuilding: 2.5, vsUnits: 0.35,
             desc: 'Slow siege gun that smashes buildings and walls from long range. Nearly useless against units.' },
  rifleman: { name: 'Rifleman', era: 1, speed: 80, hp: 55, cost: { food: 60, wood: 20, energy: 20 }, trainTime: 13,
             attack: 11, range: 170, cooldown: 1.8, sight: 240, vsBuilding: 0.35,
             bonus: { armoured_car: 2, e_tank: 1.7, soldier: 1.2 },
             desc: 'Long-range gunner. Strong against armoured cars. Needs energy to equip.' },
  armoured_car: { name: 'Armoured Car', era: 2, speed: 95, hp: 220, cost: { wood: 80, stone: 60, energy: 80 }, trainTime: 20,
             attack: 14, range: 120, cooldown: 1.4, sight: 240, vsBuilding: 1.0, vehicle: true,
             bonus: { archer: 1.5, soldier: 1.3 },
             desc: 'Fast, tough and great against buildings, soldiers and archers. Weak to riflemen. Runs on energy.' },
  e_tank: { name: 'Electric Tank', era: 4, speed: 82, hp: 380, cost: { wood: 100, stone: 120, clean: 160 }, trainTime: 26, vehicle: true,
             attack: 24, range: 150, cooldown: 1.6, sight: 260, vsBuilding: 1.4,
             bonus: { archer: 1.5, soldier: 1.4, scout: 1.4, armoured_car: 1.3 },
             desc: 'Silent solar-charged tank. The strongest unit in the game — riflemen are its only real counter. Needs clean energy.' },
};

// Foot soldiers that Body Armour protects.
export const INFANTRY = ['soldier', 'archer', 'rifleman', 'scout', 'medic'];

// Colour of the "+10" that floats up when a worker drops off a load.
const RES_TEXT_COLOR = { food: '#f0d77a', wood: '#d9b07a', stone: '#d8d4cc', fuel: '#b8b0a8' };

// How much damage `attacker` does to `target` per hit, before upgrades.
export function hitDamage(def, target) {
  if (target.isBuilding) return def.attack * def.vsBuilding;
  return def.attack * ((def.bonus && def.bonus[target.type]) || def.vsUnits || 1);
}

const GATHER_RATE = { wood: 0.9, stone: 0.7, food: 0.8, fuel: 1.1 }; // per second (coal is quick to mine!)
const CARRY_MAX = 10;
// (visual) how each worker job's work cycle goes: ms per cycle, and when in it the blow lands
const JOB_TIMING = {
  pick: [780, 540], axe: [660, 430], hammer: [440, 270], hoe: [840, 580], knife: [440, 260],
  forage: [900, 520], spear: [600, 300], chainsaw: [260, 130], drill: [280, 140],
};
// (visual) what flies off when a blow lands
const HIT_FX = { wood: 'wood', stone: 'stone', fuel: 'coal', berries: 'berries', meat: 'meat', grain: 'soil', build: 'build' };
const GATHER_WORD = { wood: 'chopping wood', stone: 'mining stone', food: 'foraging', fuel: 'mining coal' };

export class Unit {
  constructor(scene, map, tx, ty, type, team = 'player') {
    // permanent ID: commands, replays and (later) multiplayer refer to units by this
    this.id = scene.newId ? scene.newId() : 0;
    if (scene.ents) scene.ents.set(this.id, this);
    const def = UNIT_TYPES[type];
    this.scene = scene;
    this.map = map;
    this.type = type;
    this.def = def;
    this.team = team;
    this.name = def.name;
    this.speed = def.speed;
    const ups = scene.teams ? scene.teams[team].upgrades : new Set();
    this.maxHp = Math.round(def.hp * (ups.has('body_armour') && INFANTRY.includes(type) ? 1.3 : 1));
    this.hp = this.maxHp;
    this.hp = def.hp;
    this.path = [];
    this.dest = null;
    this.order = null;       // what the unit is doing: gather / build
    this.carry = 0;
    this.carryType = null;
    this.workAnim = 0;
    this.cooldown = 0;
    this.sfxTimer = Math.random() * 600;
    this.scanTimer = scene.rand ? scene.rand() * 500 : 0;
    this.isBuilding = false;
    this.dead = false;
    this.selected = false;

    const c = map.tileCenter(tx, ty);
    this.px = c.x; // position on the game grid (pixels); the sprite is drawn isometrically
    this.py = c.y;
    const iso = toIso(c.x, c.y);
    this.container = scene.add.container(iso.x, iso.y);
    this.walkPhase = Math.random() * 6;

    const big = def.vehicle || def.mounted;
    const shadow = scene.add.ellipse(0, 1, big ? 26 : 13, big ? 9 : 5.5, 0x000000, 0.3);
    this.ring = scene.add.ellipse(0, 1, big ? 34 : 20, big ? 13 : 9).setStrokeStyle(1.5, 0xe0d8b0, 0.9).setVisible(false);
    this.tier = unitTier(type, ups);
    ensureUnitTex(scene, type, team, this.tier);
    this.sprite = scene.add.image(0, 0, unitKey(type, team, 0, this.tier)).setOrigin(0.5, def.mounted ? 0.9 : big ? 0.72 : 0.86).setScale(UNIT_SPRITE_SCALE);
    this.frame = 0;
    this.baseScale = this.sprite.scaleY;
    this.strikeT = 0;   // (visual) how long to keep showing the strike pose
    this.tool = null;
    // (visual only) the tool in hand, a short step to line up with the work, and the held pose
    this.job = 'pick';
    this.vox = 0;
    this.voy = 0;
    this.workSpot = null;
    this.stepping = false;
    this.holdT = 0;
    this.carryLook = null;
    const body = [this.sprite];

    this.body = body;

    ensureCarryTex(scene);
    this.carryIcon = scene.add.image(-5, -20, 'carry_wood').setScale(UNIT_SPRITE_SCALE).setVisible(false);
    const barY = big ? -24 : -32; // above the head (units are drawn at UNIT_SCALE)
    this.hpBg = scene.add.rectangle(-11, barY, 22, 4, 0x000000, 0.65).setOrigin(0, 0.5).setVisible(false);
    this.hpFill = scene.add.rectangle(-10, barY, 20, 2, 0x8fb04a).setOrigin(0, 0.5).setVisible(false);

    this.container.add([shadow, this.ring, ...body, this.carryIcon, this.hpBg, this.hpFill]);
    this.depthQ = iso.y | 0;
    this.container.setDepth(this.depthQ);
  }

  get x() { return this.px; }
  get y() { return this.py; }
  get isoX() { return this.container.x; }
  get isoY() { return this.container.y; }

  setPos(x, y) {
    this.px = x;
    this.py = y;
    const iso = toIso(x, y);
    this.container.setPosition(iso.x, iso.y);
    const q = iso.y | 0;
    if (this.depthQ !== q) { this.depthQ = q; this.container.setDepth(q); }
  }
  get tile() { return this.map.worldToTile(this.x, this.y); }
  get isMoving() { return this.path.length > 0; }
  get isIdle() { return !this.order && !this.isMoving; }
  get isMilitary() { return this.type !== 'worker'; }

  get statusText() {
    const o = this.order;
    if (!o) return this.isMoving ? 'moving' : 'idle';
    if (o.kind === 'attack') return 'fighting';
    if (o.kind === 'amove') return 'advancing';
    if (o.kind === 'garrison') return 'running for shelter';
    if (o.kind === 'hunt') return 'hunting';
    if (o.kind === 'build') return `building ${o.building.def.name}`;
    if (o.phase === 'return') return `carrying ${o.res === 'fuel' ? 'coal' : o.res}`;
    return o.farm ? 'farming' : GATHER_WORD[o.res];
  }

  // Move to the nearest safe tile (used when land floods or a forest grows on top of us).
  rescue() {
    const t = this.tile;
    if (this.map.isWalkable(t.x, t.y, this.team)) return;
    const safe = this.map.nearestWalkable(t.x, t.y, 20, this.team);
    this.stop();
    if (safe) {
      const c = this.map.tileCenter(safe.x, safe.y);
      this.setPos(c.x, c.y);
    }
  }

  setSelected(v) {
    this.selected = v;
    this.ring.setVisible(v);
    this.updateHpBar();
  }

  // Health bar shows when selected or hurt.
  updateHpBar() {
    const show = this.selected || this.hp < this.maxHp;
    this.hpBg.setVisible(show);
    this.hpFill.setVisible(show);
    const f = Math.max(0, this.hp / this.maxHp);
    this.hpFill.width = 20 * f;
    this.hpFill.setFillStyle(f > 0.6 ? 0x8fb04a : f > 0.3 ? 0xd0a63a : 0xb8433a);
  }

  orderAttack(target) {
    if (!target || target.dead || !this.scene.isEnemy(target.team, this.team)) return;
    if (this.def.heals) { // medics tag along instead of fighting
      this.moveTo(target.isBuilding ? { x: target.tx, y: target.ty } : target.tile);
      return;
    }
    this.stop();
    this.order = { kind: 'attack', target, repath: 0 };
  }

  // Chase a deer; when caught it turns into food that we then gather.
  orderHunt(deer) {
    this.stop();
    this.order = { kind: 'hunt', deer, repath: 0 };
    this.setJob('spear');
  }

  // Run to a building and shelter inside it. `prev` is the job to go back to afterwards.
  orderGarrison(b, prev) {
    this.stop();
    this.order = { kind: 'garrison', building: b, prev, phase: 'goto' };
  }

  // Walk somewhere, but stop to fight any enemy met on the way, then carry on.
  orderAttackMove(dest) {
    if (!this.isMilitary) { this.moveTo(dest); return; }
    this.stop();
    this.order = { kind: 'amove', dest, scan: 0 };
    if (!this.walkTo(dest)) this.stop();
  }

  // ---------- Walking ----------
  walkTo(goal, raw = false) {
    const t = this.tile;
    const p = findPath(this.map, t.x, t.y, goal.x, goal.y, this.team);
    if (p === null) return false;
    this.dest = goal;
    const pts = p.map((n) => this.map.tileCenter(n.x, n.y));
    this.path = raw ? pts : smoothPath(this.map, this.x, this.y, pts, this.team, TILE);
    if (!this.path.length) this.path = [this.map.tileCenter(t.x, t.y)];
    return true;
  }

  walkToAny(spots) {
    for (const s of spots.slice(0, 4)) if (this.walkTo(s)) return true;
    return false;
  }

  isNextTo(tx, ty, w, h) {
    const t = this.tile;
    return t.x >= tx - 1 && t.x <= tx + w && t.y >= ty - 1 && t.y <= ty + h;
  }

  // ---------- Orders from the player ----------
  stop() {
    if (this.order && this.order.farm && this.order.farm.farmer === this) this.order.farm.farmer = null;
    this.order = null;
    this.path = [];
    this.workSpot = null;
    this.sprite.rotation = 0;
    this.sprite.y = 0;
    this.setFrame(0);
  }

  // Walking animation: switch between standing and two stride poses.
  // New look after an upgrade (e.g. Iron Weapons gives soldiers steel armour).
  setTier(tier) {
    if (tier === this.tier) return;
    this.tier = tier;
    ensureUnitTex(this.scene, this.type, this.team, tier);
    if (this.type === 'worker') ensureJobTex(this.scene, this.team, tier, this.job);
    this.sprite.setTexture(this.texKey(this.def.vehicle ? 0 : this.frame));
  }

  texKey(f) {
    return unitKey(this.type, this.team, f, this.tier, this.type === 'worker' ? this.job : null);
  }

  setFrame(f) {
    if (this.def.vehicle || f === this.frame || this.holdT > 0) return;
    if (f > 2 && (this.type === 'scout' || this.def.mounted)) f = f === 3 ? 1 : f === 4 ? 2 : 0; // riders only have 3 frames
    this.frame = f;
    this.sprite.setTexture(this.texKey(f));
  }

  // (visual) Pick up the right tool for a job: axe for wood, pick for stone and coal, and so on.
  setJob(job) {
    if (this.type !== 'worker' || !job || job === this.job) return;
    this.job = job;
    ensureJobTex(this.scene, this.team, this.tier, job);
    this.sprite.setTexture(this.texKey(this.frame));
  }

  jobForOrder(o) {
    if (!o) return null;
    if (o.kind === 'build') return 'hammer';
    if (o.kind === 'hunt') return 'spear';
    if (o.kind !== 'gather') return null;
    if (o.farm) return 'hoe';
    if (o.res === 'wood') return 'axe';
    if (o.res === 'stone' || o.res === 'fuel') return 'pick';
    const t = this.map.get(o.tx, o.ty);
    return t === TERRAIN.MEAT ? 'knife' : 'forage';
  }

  // (visual) Where to stand so the blow lands on the thing being worked: beside the nearest trunk,
  // rock or bush (or the edge of the building), with the tool's working end on it.
  // Returns false if there's nowhere sensible to stand on this side.
  aimAt(point, side = null) {
    const home = toIso(this.px, this.py);
    if (side == null) side = home.x <= point.x ? 1 : -1;
    const c = jobContact(this.job, this.tier);
    // stand beside it (feet level with its base), so the blow reaches across to it,
    // on open ground (not in among other trees, rocks or buildings) and not inside another worker
    // Start at the ideal spot (where the tool's end lands right on it) and, if that's blocked, slide back
    // towards where we really stand until there's clear ground, so we always end up as close as we can.
    const MAX = 50; // never more than a short step from where we really are
    // (the 3D-rendered workers come with where their blow lands over the ground — gx, gy — which is
    //  what decides where to stand; the older drawn ones only know the sideways reach)
    const ix = point.x - side * (c.gx != null ? c.gx : c.x);
    const iy = point.base + (c.gy != null ? -c.gy + 1 : 2);
    for (const t of [0, 0.12, 0.24, 0.36, 0.5, 0.65, 0.8]) {
      // (a little up or down the screen keeps the sideways reach; that's tried before giving ground)
      for (const dy of [0, 5, -5, 10, -10, 15, -15]) {
        const x = ix + (home.x - ix) * t;
        const y = iy + (home.y - iy) * t + dy;
        if (Math.hypot(x - home.x, y - home.y) > MAX) continue;
        if (!this.spotClear(x, y, point) || this.spotTaken(x, y)) continue;
        this.workSpot = { x, y, side };
        return true;
      }
    }
    return false;
  }

  // (visual) Can a worker stand here? Open, walkable ground, and not right on another tree trunk.
  // The ground may be the tree / rock / bush tile itself (we step up to the edge of a wood or a quarry),
  // but never water or a building, and never right on top of another trunk, rock or bush.
  spotClear(x, y, target = null) {
    const w = fromIso(x, y);
    const tx = Math.floor(w.x / TILE);
    const ty = Math.floor(w.y / TILE);
    if (!this.map.inBounds(tx, ty)) return false;
    const o = this.order;
    const ownTile = o && o.tx === tx && o.ty === ty;
    if (!ownTile && !this.map.isWalkable(tx, ty, this.team)) return false;
    if (ownTile && this.map.buildingAt && this.map.buildingAt(tx, ty)) return false;
    const trees = this.scene.trees;
    for (let yy = ty - 1; yy <= ty + 1; yy++) for (let xx = tx - 1; xx <= tx + 1; xx++) {
      if (!this.map.inBounds(xx, yy)) continue;
      const t = this.map.get(xx, yy);
      const things = t === TERRAIN.FOREST ? (trees ? trees.standingAnchors(xx, yy) : []) : this.map.objectAnchors(xx, yy);
      for (const a of things) {
        if (target && target.anchor && Math.abs(a.x - target.anchor.x) < 0.6 && Math.abs(a.y - target.anchor.y) < 0.6) continue; // (the one we're working)
        // trunks are thin; bushes and rocks are as wide as they're drawn
        const r = t === TERRAIN.FOREST ? 8 : 6 + (a.w || 4) * 1.3;
        if (Math.hypot(a.x - x, (a.y - 2 - y) * 1.6) < r) return false;
      }
    }
    return true;
  }

  spotTaken(x, y) {
    for (const u of this.scene.units) {
      if (u !== this && u.workSpot && u.order && u.order.phase === 'work' && Math.hypot((u.workSpot.x - x) * 0.8, (u.workSpot.y - y) * 1.4) < 15) return true;
    }
    return false;
  }

  // (visual) Farmers work their way around the field.
  aimAtFarm(f) {
    const p = toIso((f.tx + 0.6 + Math.random() * (f.w - 1.2)) * TILE, (f.ty + 0.6 + Math.random() * (f.h - 1.2)) * TILE);
    const home = toIso(this.px, this.py);
    let dx = p.x - home.x;
    let dy = p.y - home.y;
    const d = Math.hypot(dx, dy);
    if (d > 40) { dx *= 40 / d; dy *= 40 / d; }
    this.workSpot = { x: home.x + dx, y: home.y + dy, side: Math.random() < 0.5 ? 1 : -1 };
    this.workTarget = null;
  }

  aimAtTile(tx, ty) {
    const trees = this.scene.trees;
    const anchors = trees && this.map.get(tx, ty) === TERRAIN.FOREST ? trees.standingAnchors(tx, ty) : this.map.objectAnchors(tx, ty);
    if (!anchors.length) { this.workSpot = null; return; }
    const home = toIso(this.px, this.py);
    // one of the nearest two (so two workers on one tree don't stand inside each other)
    const near = anchors.map((a) => ({ a, d: Math.hypot(a.x - home.x, a.y - home.y) })).sort((p, q) => p.d - q.d);
    // try the nearest things first (staggered so two workers don't pick the same one), from
    // either side, and use the first with clear ground to stand on
    const first = (Number(this.id) || 0) % Math.min(2, near.length);
    const order = [...near.slice(first), ...near.slice(0, first)].map((n) => n.a);
    for (const a of order) {
      const pref = home.x <= a.x ? 1 : -1;
      for (const side of [pref, -pref]) {
        // aim at the near side of a rock or bush, the trunk of a tree
        if (this.aimAt({ x: a.x - side * a.w, base: a.y, anchor: a }, side)) { this.workTarget = a; return; }
      }
    }
    // nowhere good: just work from where we stand, facing it
    const a = order[0];
    this.workSpot = { x: home.x, y: home.y, side: home.x <= a.x ? 1 : -1 };
    this.workTarget = a;
  }

  aimAtBuilding(b) {
    // the nearest point on the building's footprint, a little way up its wall
    const x = Math.max(b.tx * TILE, Math.min(this.px, (b.tx + b.w) * TILE));
    const y = Math.max(b.ty * TILE, Math.min(this.py, (b.ty + b.h) * TILE));
    const p = toIso(x, y);
    this.workSpot = null;
    if (!this.aimAt({ x: p.x, base: p.y })) {
      const home = toIso(this.px, this.py);
      this.workSpot = { x: home.x, y: home.y, side: home.x <= p.x ? 1 : -1 };
    }
    this.workTarget = null;
  }

  // (visual) Called every frame: step into place for the work, keep the load on the shoulder.
  updateVisual(delta) {
    if (this.holdT > 0) this.holdT -= delta;
    let tx = 0;
    let ty = 0;
    const busy = this.order && this.order.phase === 'work' && !this.path.length;
    const working = busy && this.workSpot;
    if (working) {
      const home = toIso(this.px, this.py);
      tx = this.workSpot.x - home.x;
      ty = this.workSpot.y - home.y;
    }
    const dx = tx - this.vox;
    const dy = ty - this.voy;
    const d = Math.hypot(dx, dy);
    const step = (this.speed || 70) * 1.1 * delta / 1000;
    if (d <= step || d < 0.5) {
      this.vox = tx; this.voy = ty;
      if (this.stepping && working) this.sprite.setFlipX(this.workSpot.side < 0);
      this.stepping = false;
    } else {
      this.vox += (dx / d) * step;
      this.voy += (dy / d) * step;
      // walk the little step (only when it's a step into place, not while walking off elsewhere)
      if (working) {
        this.stepping = true;
        if (Math.abs(dx) > 0.5) this.sprite.setFlipX(dx < 0);
        this.walkPhase += delta * 0.014;
        const WALK = [0, 3, 1, 3, 0, 4, 2, 4];
        const ph = ((this.walkPhase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        this.setFrame(WALK[Math.floor((ph / (Math.PI * 2)) * 8) % 8]);
        this.sprite.y = -Math.abs(Math.sin(this.walkPhase)) * 1.4;
      }
    }
    // the load rides on the back shoulder, bobbing with the walk (put down while working)
    const ci = this.carryIcon;
    if (ci.visible !== (this.carry >= 0.5 && !busy && !!this.carryLook)) ci.setVisible(!ci.visible);
    if (ci.visible) {
      const flip = this.sprite.flipX;
      ci.setFlipX(flip);
      ci.x = flip ? 5 : -5;
      ci.y = -20 + this.sprite.y;
    }
  }

  // Turn to face a point on the grid (left/right on screen).
  face(x, y) {
    const dx = (x - y) - (this.px - this.py);
    if (Math.abs(dx) > 1) this.sprite.setFlipX(dx < 0);
  }

  moveTo(goal) {
    this.stop();
    return this.walkTo(goal);
  }

  orderGather(tile) {
    const res = this.map.resourceAt(tile.x, tile.y);
    if (!res) return;
    this.stop();
    this.order = { kind: 'gather', res, tx: tile.x, ty: tile.y, phase: 'goto' };
    this.goToResource();
  }

  orderFarm(farm) {
    this.stop();
    farm.farmer = this;
    this.order = { kind: 'gather', res: 'food', farm, phase: 'goto' };
    this.goToResource();
  }

  orderBuild(b) {
    this.stop();
    this.order = { kind: 'build', building: b, phase: 'goto' };
    this.setJob('hammer');
    if (!this.walkToAny(this.map.standSpots(b.tx, b.ty, b.w, b.h, this.tile))) this.stop();
  }

  // ---------- Gathering helpers ----------
  goToResource() {
    const o = this.order;
    o.phase = 'goto';
    this.setJob(this.jobForOrder(o));
    o.retried = false;
    let ok;
    if (o.farm) {
      ok = this.walkTo({ x: o.farm.tx + (this.id % 2), y: o.farm.ty + 1 });
    } else {
      ok = this.walkToAny(this.map.standSpots(o.tx, o.ty, 1, 1, this.tile));
    }
    if (!ok) this.stop();
  }

  returnCargo(world) {
    const o = this.order;
    const d = world.nearestDropOff(this.x, this.y, this.team, this.carryType);
    if (!d) {
      const camp = { wood: 'Lumber Camp', stone: 'Mining Camp', fuel: 'Mining Camp', food: 'Mill' }[this.carryType] || 'Town Centre';
      if (this.team === world.me) world.toast(`Nowhere to drop off ${this.carryType === 'fuel' ? 'coal' : this.carryType || 'resources'} — build a ${camp}`);
      this.stop();
      return;
    }
    o.phase = 'return';
    o.dropOff = d;
    if (!this.walkToAny(this.map.standSpots(d.tx, d.ty, d.w, d.h, this.tile))) this.stop();
  }

  findNextResource(world) {
    const o = this.order;
    const next = this.map.nearestResource(o.res, o.tx, o.ty, 8);
    if (next) {
      o.tx = next.x;
      o.ty = next.y;
      this.goToResource();
    } else if (this.carry > 0) {
      o.noMore = true;
      this.returnCargo(world);
    } else {
      this.stop();
    }
  }

  finishBuild(b, world) {
    this.stop();
    if (b.dead) return;
    if (b.complete && b.type === 'farm' && !b.farmer) {
      this.orderFarm(b);
      return;
    }
    const other = world.nearestUnfinished(this.x, this.y, 10, this.team);
    if (other) this.orderBuild(other);
  }

  // Work noises (chopping, mining, hammering…) every so often.
  workSound(dt, world, name) {
    this.sfxTimer -= dt;
    if (this.sfxTimer > 0) return;
    this.sfxTimer = name === 'build' ? 450 + Math.random() * 250 : 700 + Math.random() * 500;
    world.sfx(name, this.x, this.y);
  }

  // Chopping / mining / hammering: raise the tool, then bring it down (with a few chips flying).
  animateWork(dt) {
    this.sprite.scaleY = this.baseScale;
    this.sprite.rotation = 0;
    if (this.stepping) return; // still stepping into place
    const tool = this.tier === 2 && this.job === 'axe' ? 'chainsaw' : this.tier === 2 && (this.job === 'pick' || this.job === 'hammer') ? 'drill' : this.job;
    const [CYCLE, HIT] = JOB_TIMING[tool] || [620, 400];
    const before = this.workAnim % CYCLE;
    this.workAnim += dt;
    const t = this.workAnim % CYCLE;
    const struck = before < HIT && t >= HIT; // the blow lands now
    const strike = t >= HIT;
    this.setFrame(strike ? 6 : 5);
    if (this.workSpot) this.sprite.setFlipX(this.workSpot.side < 0);
    // power tools judder rather than swing
    this.sprite.y = tool === 'chainsaw' || tool === 'drill' ? (Math.random() - 0.5) * 0.8 : strike ? 0.5 : -0.4;
    const o = this.order;
    if (struck && this.scene.renderShots && this.container.visible && this.scene.fx && this.scene.fx.workHit) {
      const kind = o && o.kind === 'build' ? 'build' : HIT_FX[this.carryLook] || null;
      if (kind) {
        // where the tool's end (or the reaching hand) is at the moment of the blow
        const c = jobContact(this.job, this.tier);
        const flip = this.sprite.flipX ? -1 : 1;
        this.scene.fx.workHit(kind, { x: this.isoX + flip * c.x, y: this.isoY + c.y }, this, this.workTarget);
        if (kind === 'wood' && this.scene.trees && this.workTarget && o) {
          // the tree we were chopping has fallen: move on to the next one
          if (!this.scene.trees.isStanding(o.tx, o.ty, this.workTarget)) this.aimAtTile(o.tx, o.ty);
          else this.scene.trees.shake(o.tx, o.ty, this.workTarget, this.workSpot ? this.workSpot.side : 1);
        }
      }
    }
    // farmers move on along the rows every few strokes
    if (struck && o && o.farm && ++this.strokes % 4 === 0) this.aimAtFarm(o.farm);
  }

  // Standing about: a slow breath so idle people don't look frozen.
  idleBreath(dt) {
    if (this.def.vehicle) return;
    this.breath = (this.breath || Math.random() * 6) + dt * 0.003;
    this.sprite.scaleY = this.baseScale * (1 + Math.sin(this.breath) * 0.018);
  }

  updateCarryIcon() {
    if (this.carry >= 0.5 && this.carryLook) this.carryIcon.setTexture(`carry_${this.carryLook}`);
  }

  // ---------- Every frame ----------
  stepPath(dt) {
    if (!this.path.length) return;
    const target = this.path[0];
    const nt = this.map.worldToTile(target.x, target.y);
    // (check the next waypoint, and the ground just ahead — waypoints can be a few tiles apart)
    const ahead = Math.hypot(target.x - this.x, target.y - this.y) || 1;
    const at = this.map.worldToTile(this.x + ((target.x - this.x) / ahead) * 12, this.y + ((target.y - this.y) / ahead) * 12);
    const aheadBlocked = !this.map.isWalkable(at.x, at.y, this.team) && this.map.isWalkable(this.tile.x, this.tile.y, this.team);
    if ((!this.map.isWalkable(nt.x, nt.y, this.team) || aheadBlocked) && this.dest) {
      // Something was built in the way — find a new route.
      // (if we just did this and it didn't help, follow the plain tile-by-tile route instead)
      const raw = this.repathTick === this.scene.tick - 1 || this.repathTick === this.scene.tick;
      this.repathTick = this.scene.tick;
      if (!this.walkTo(this.dest, raw)) this.path = [];
      return;
    }
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    const step = (this.speed * dt) / 1000;
    this.face(target.x, target.y);
    this.sprite.rotation = 0;
    this.walkPhase += dt * 0.014 * Math.min(1.6, Math.max(0.7, this.speed / 60));
    this.sprite.y = this.def.vehicle ? 0 : -Math.abs(Math.sin(this.walkPhase)) * 1.6;
    this.sprite.scaleY = this.baseScale;
    // 8-step walk cycle: stand, half stride, full stride, half, stand, half (other leg), full, half
    const WALK = [0, 3, 1, 3, 0, 4, 2, 4];
    const ph = ((this.walkPhase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    this.setFrame(WALK[Math.floor((ph / (Math.PI * 2)) * 8) % 8]);
    if (dist <= step) {
      this.setPos(target.x, target.y);
      this.path.shift();
      if (!this.path.length) { this.sprite.y = 0; this.setFrame(0); }
    } else {
      this.setPos(this.px + (dx / dist) * step, this.py + (dy / dist) * step);
    }
  }

  update(dt, world) {
    if (this.dead) return;
    this.cooldown = Math.max(0, this.cooldown - dt / 1000);
    if (this.def.heals) this.updateHealing(dt, world);

    if (this.order && this.order.kind === 'attack') {
      this.updateAttack(dt, world);
      return;
    }
    if (this.order && this.order.kind === 'hunt') {
      const o = this.order;
      const d = o.deer;
      if (d.dead) {
        if (d.meat && this.map.resourceAt(d.meat.x, d.meat.y)) this.orderGather(d.meat);
        else this.stop();
        return;
      }
      if (Math.hypot(d.x - this.x, d.y - this.y) < 100) { // close enough to throw a spear
        if (world.renderShots && this.container.visible && world.fx && world.fx.spear) {
          // (visual) the throw: hold the follow-through for a moment and send a spear flying
          this.setJob('spear');
          this.face(d.x, d.y);
          this.setFrame(6);
          this.holdT = 320;
          const to = toIso(d.x, d.y);
          const c = jobContact('spear', this.tier);
          world.fx.spear(this.isoX + (this.sprite.flipX ? -c.x : c.x), this.isoY + c.y, to.x, to.y - 4);
        }
        const t = world.wildlife.kill(d, world);
        d.meat = t;
        if (t) this.orderGather(t); else this.stop();
        return;
      }
      o.repath -= dt;
      if (o.repath <= 0) {
        o.repath = 500;
        const t = { x: Math.floor(d.x / 32), y: Math.floor(d.y / 32) };
        if (!this.walkTo(t)) { this.stop(); return; }
      }
    }
    if (this.order && this.order.kind === 'amove') {
      const o = this.order;
      o.scan -= dt;
      if (o.scan <= 0) {
        o.scan = 400;
        const e = world.findEnemyNear(this.x, this.y, this.def.sight, this.team);
        if (e) {
          this.orderAttack(e);
          this.order.resume = o.dest;
          return;
        }
      }
      if (!this.path.length) { this.stop(); return; }
    }

    // 1. Walk along the path.
    if (this.path.length) {
      this.stepPath(dt);
      return;
    }

    // 2. Carry out the current order.
    const o = this.order;
    if (!o) {
      this.idleBreath(dt);
      // Idle soldiers and archers watch for enemies.
      if (this.isMilitary && !this.def.heals) {
        this.scanTimer -= dt;
        if (this.scanTimer <= 0) {
          this.scanTimer = 500;
          const e = world.findEnemyNear(this.x, this.y, this.def.sight, this.team);
          if (e) this.orderAttack(e);
        }
      }
      return;
    }
    if (o.kind === 'build') this.updateBuild(dt, world);
    else if (o.kind === 'gather') this.updateGather(dt, world);
    else if (o.kind === 'garrison') this.updateGarrison(dt, world);
  }

  updateAttack(dt, world) {
    const o = this.order;
    let t = o.target;
    if (!t || t.dead) {
      // Finished breaking through a wall — carry on to what we were really after.
      if (o.after && !o.after.dead) { o.target = o.after; o.after = null; o.repath = 0; return; }
      // Target gone — soldiers look for the next enemy nearby.
      const next = this.isMilitary ? world.findEnemyNear(this.x, this.y, this.def.sight, this.team) : null;
      if (next) { o.target = next; o.repath = 0; return; }
      // On an attack-move: carry on to where we were heading.
      if (o.resume) { this.orderAttackMove(o.resume); return; }
      this.stop();
      return;
    }
    // Soldiers hitting a building switch to enemy soldiers that come close.
    if (t.isBuilding && this.isMilitary) {
      this.scanTimer -= dt;
      if (this.scanTimer <= 0) {
        this.scanTimer = 500;
        const e = world.findEnemyUnitNear(this.x, this.y, this.def.sight * 0.7, this.team);
        if (e) { o.target = e; o.repath = 0; return; }
      }
    }
    const d = world.distanceTo(this.x, this.y, t);
    if (d > this.def.range) {
      o.repath -= dt;
      if (o.repath <= 0 || !this.path.length) {
        o.repath = 700;
        const ok = t.isBuilding
          ? this.walkToAny(this.map.standSpots(t.tx, t.ty, t.w, t.h, this.tile))
          : this.walkTo(t.tile);
        if (!ok) {
          // No way round: break through the wall or gate that's in the way.
          const wall = this.isMilitary && !t.def?.wall ? world.wallInTheWay(this, t) : null;
          if (wall) { o.after = t; o.target = wall; o.repath = 0; return; }
          this.stop();
          return;
        }
      }
      this.stepPath(dt);
      return;
    }
    this.path = [];
    this.sprite.y = 0;
    this.sprite.rotation = 0;
    // (visual) melee: wind up as the next blow gets close, show the strike for a moment after
    this.strikeT = Math.max(0, this.strikeT - dt);
    const melee = this.def.range <= 60;
    if (melee && this.strikeT > 0) this.setFrame(6);
    else if (melee && this.cooldown < this.def.cooldown * 0.35) this.setFrame(5);
    else this.setFrame(0);
    this.face(t.isBuilding ? t.cx : t.x, t.isBuilding ? t.cy : t.y);
    if (this.cooldown <= 0) {
      this.cooldown = this.def.cooldown;
      const dmg = hitDamage(this.def, t) * world.attackMultiplier(this.team);
      if (this.def.range > 60) {
        world.shoot(this.x, this.y, t, dmg, this, 18);
        // (visual) a little kick back from the shot
        if (world.renderShots && this.container.visible) {
          const back = this.sprite.flipX ? 2 : -2;
          this.sprite.x = back;
          this.scene.tweens.add({ targets: this.sprite, x: 0, duration: 140, ease: 'Quad.easeOut' });
        }
      } else {
        this.strikeT = 160;
        this.setFrame(6);
        world.dealDamage(t, dmg, this);
        world.sfx(this.type === 'worker' ? 'build' : 'sword', this.x, this.y);
        // little lunge
        const tx = t.isBuilding ? t.cx : t.x;
        const ty = t.isBuilding ? t.cy : t.y;
        const ti = toIso(tx, ty);
        const a = Math.atan2(ti.y - this.isoY, ti.x - this.isoX);
        for (const part of this.body) {
          part.x += Math.cos(a) * 3;
          part.y += Math.sin(a) * 3;
        }
        this.scene.time.delayedCall(120, () => {
          if (this.dead) return;
          for (const part of this.body) {
            part.x -= Math.cos(a) * 3;
            part.y -= Math.sin(a) * 3;
          }
        });
      }
    }
  }

  // Medics patch up the most hurt friendly unit close by, and walk over to hurt friends when idle.
  updateHealing(dt, world) {
    this.healTimer = (this.healTimer || 0) - dt;
    if (this.healTimer > 0) return;
    this.healTimer = 1000;
    let best = null;
    let worst = 1;
    let far = null;
    let farD = Infinity;
    for (const u of world.units) {
      if (!world.isAlly(u.team, this.team) || u === this || u.dead || u.hp >= u.maxHp || u.def.vehicle) continue;
      const d = Math.hypot(u.x - this.x, u.y - this.y);
      const frac = u.hp / u.maxHp;
      if (d < 80 && frac < worst) { worst = frac; best = u; }
      else if (d < this.def.sight && d < farD) { farD = d; far = u; }
    }
    if (best) {
      const amount = this.def.heals * (world.teams[this.team].upgrades.has('field_medicine') ? 2 : 1);
      best.hp = Math.min(best.maxHp, best.hp + amount);
      best.updateHpBar();
      if (this.team === world.me && world.fx && best.container.visible) world.fx.floatText(best.isoX, best.isoY - 26, `+${amount}`, '#8fd18a');
    } else if (far && !this.order && !this.path.length) {
      const t = far.tile;
      this.walkTo({ x: t.x, y: t.y });
    }
  }

  updateGarrison(dt, world) {
    const o = this.order;
    const b = o.building;
    if (b.dead || b.garrison.length >= b.def.garrison) { world.resumeWork(this, o.prev); return; }
    if (!this.isNextTo(b.tx, b.ty, b.w, b.h)) {
      if (o.phase === 'walking') { world.resumeWork(this, o.prev); return; } // couldn't get there
      o.phase = 'walking';
      if (!this.walkToAny(this.map.standSpots(b.tx, b.ty, b.w, b.h, this.tile))) world.resumeWork(this, o.prev);
      return;
    }
    world.enterBuilding(this, b, o.prev);
  }

  updateBuild(dt, world) {
    const o = this.order;
    const b = o.building;
    if (b.dead || b.complete) { this.finishBuild(b, world); return; }
    if (o.phase === 'goto') {
      if (!this.isNextTo(b.tx, b.ty, b.w, b.h)) {
        if (o.retried) { this.stop(); return; }
        o.retried = true;
        if (!this.walkToAny(this.map.standSpots(b.tx, b.ty, b.w, b.h, this.tile))) this.stop();
        return;
      }
      o.phase = 'work';
      this.setJob('hammer');
      this.aimAtBuilding(b);
    }
    if (!this.workSpot) this.face(b.cx, b.cy);
    this.animateWork(dt);
    this.workSound(dt, world, 'build');
    if (b.addProgress(dt)) {
      world.onBuildingComplete(b);
      this.finishBuild(b, world);
    }
  }

  updateGather(dt, world) {
    const o = this.order;

    if (o.phase === 'goto') {
      if (o.farm) {
        if (o.farm.dead) { this.stop(); return; }
      } else {
        if (this.map.resourceAt(o.tx, o.ty) !== o.res) { this.findNextResource(world); return; }
        if (!this.isNextTo(o.tx, o.ty, 1, 1)) {
          if (o.retried) { this.stop(); return; }
          o.retried = true;
          if (!this.walkToAny(this.map.standSpots(o.tx, o.ty, 1, 1, this.tile))) this.stop();
          return;
        }
      }
      if (this.carryType !== o.res) { this.carry = 0; this.carryType = o.res; }
      o.phase = 'work';
      // (visual) the right tool, and a step to stand right at the tree / rock / bush
      const job = this.jobForOrder(o);
      this.setJob(job);
      this.carryLook = o.farm ? 'grain' : job === 'knife' ? 'meat' : job === 'forage' ? 'berries' : o.res;
      if (o.farm) this.aimAtFarm(o.farm); else this.aimAtTile(o.tx, o.ty);
      this.strokes = 0;
      o.aimed = `${o.tx},${o.ty}`;
    }

    if (o.phase === 'work') {
      if (!o.farm && !this.workSpot) { const c = this.map.tileCenter(o.tx, o.ty); this.face(c.x, c.y); }
      this.animateWork(dt);
      this.workSound(dt, world, o.res === 'wood' ? 'chop' : o.res === 'food' ? 'forage' : 'mine');
      const meat = !o.farm && this.map.get(o.tx, o.ty) === TERRAIN.MEAT; // butchering is quick work
      const want = (GATHER_RATE[o.res] * (meat ? 1.8 : 1) * world.gatherMultiplier(o.res, !!o.farm, this.team) * dt) / 1000;
      let got;
      if (o.farm) {
        got = Math.min(want, o.farm.food);
        o.farm.food -= got;
        o.farm.redraw();
        if (o.farm.food <= 0) world.removeBuilding(o.farm);
      } else {
        got = this.map.harvest(o.tx, o.ty, want);
      }
      this.carry += got;
      this.carryType = o.res;
      this.updateCarryIcon();

      const exhausted = o.farm ? o.farm.dead : this.map.resourceAt(o.tx, o.ty) !== o.res;
      const cap = CARRY_MAX * (world.teams[this.team].upgrades.has('wheelbarrow') ? 1.5 : 1);
      if (this.carry >= cap || exhausted) {
        if (exhausted) {
          if (o.farm) {
            o.noMore = true;
          } else {
            const next = this.map.nearestResource(o.res, o.tx, o.ty, 8);
            if (next) { o.tx = next.x; o.ty = next.y; } else o.noMore = true;
          }
        }
        if (this.carry >= cap || o.noMore) this.returnCargo(world);
        else this.goToResource();
      }
      return;
    }

    if (o.phase === 'return') {
      const d = o.dropOff;
      if (!d || d.dead) { this.returnCargo(world); return; }
      if (!this.isNextTo(d.tx, d.ty, d.w, d.h)) {
        if (o.retriedReturn) { this.stop(); return; }
        o.retriedReturn = true;
        this.returnCargo(world);
        return;
      }
      o.retriedReturn = false;
      world.addResource(o.res, Math.round(this.carry), this.team);
      if (this.team === world.me && world.fx && this.container.visible) {
        world.fx.floatText(this.isoX, this.isoY - 30, `+${Math.round(this.carry)}`, RES_TEXT_COLOR[o.res]);
      }
      this.carry = 0;
      this.updateCarryIcon();
      if (o.noMore) { this.stop(); return; }
      this.goToResource();
    }
  }
}
