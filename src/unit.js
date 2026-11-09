// Units: workers and soldiers. Workers can gather resources and construct buildings.
import { findPath } from './pathfinding.js';
import { unitKey, ART_RES } from './art.js';
import { toIso } from './iso.js';
import { TERRAIN } from './config.js';

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
  e_tank: { name: 'Electric Tank', era: 3, speed: 82, hp: 380, cost: { wood: 100, stone: 120, clean: 160 }, trainTime: 26, vehicle: true,
             attack: 24, range: 150, cooldown: 1.6, sight: 260, vsBuilding: 1.4,
             bonus: { archer: 1.5, soldier: 1.4, scout: 1.4, armoured_car: 1.3 },
             desc: 'Silent solar-charged tank. The strongest unit in the game — riflemen are its only real counter. Needs clean energy.' },
};

// Colour of the "+10" that floats up when a worker drops off a load.
const RES_TEXT_COLOR = { food: '#f0d77a', wood: '#d9b07a', stone: '#d8d4cc', fuel: '#b8b0a8' };

// How much damage `attacker` does to `target` per hit, before upgrades.
export function hitDamage(def, target) {
  if (target.isBuilding) return def.attack * def.vsBuilding;
  return def.attack * ((def.bonus && def.bonus[target.type]) || def.vsUnits || 1);
}

const GATHER_RATE = { wood: 0.9, stone: 0.7, food: 0.8, fuel: 1.1 }; // per second (coal is quick to mine!)
const CARRY_MAX = 10;
const CARRY_COLOR = { wood: 0x8a6440, stone: 0xa9a59b, food: 0xc9a94e, fuel: 0x1f1f1f };
const GATHER_WORD = { wood: 'chopping wood', stone: 'mining stone', food: 'foraging', fuel: 'mining coal' };

let nextId = 1;

export class Unit {
  constructor(scene, map, tx, ty, type, team = 'player') {
    const def = UNIT_TYPES[type];
    this.id = nextId++;
    this.scene = scene;
    this.map = map;
    this.type = type;
    this.def = def;
    this.team = team;
    this.name = def.name;
    this.speed = def.speed;
    this.maxHp = def.hp;
    this.hp = def.hp;
    this.path = [];
    this.dest = null;
    this.order = null;       // what the unit is doing: gather / build
    this.carry = 0;
    this.carryType = null;
    this.workAnim = 0;
    this.cooldown = 0;
    this.sfxTimer = Math.random() * 600;
    this.scanTimer = Math.random() * 500;
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
    const shadow = scene.add.ellipse(0, 1, big ? 34 : 18, big ? 12 : 8, 0x000000, 0.32);
    this.ring = scene.add.ellipse(0, 1, big ? 42 : 26, big ? 16 : 12).setStrokeStyle(1.5, 0xe0d8b0, 0.9).setVisible(false);
    this.sprite = scene.add.image(0, 0, unitKey(type, team)).setOrigin(0.5, def.mounted ? 0.9 : big ? 0.72 : 0.86).setScale(1 / ART_RES);
    this.frame = 0;
    this.tool = null;
    const body = [this.sprite];

    this.body = body;

    this.carryIcon = scene.add.rectangle(-9, -6, 6, 6, 0xffffff).setStrokeStyle(1, 0x1a1a1a).setVisible(false);
    const barY = big ? -26 : -32;
    this.hpBg = scene.add.rectangle(-11, barY, 22, 4, 0x000000, 0.65).setOrigin(0, 0.5).setVisible(false);
    this.hpFill = scene.add.rectangle(-10, barY, 20, 2, 0x8fb04a).setOrigin(0, 0.5).setVisible(false);

    this.container.add([shadow, this.ring, ...body, this.carryIcon, this.hpBg, this.hpFill]);
    this.container.setDepth(iso.y);
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
    this.container.setDepth(iso.y);
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
    if (!target || target.dead || target.team === this.team) return;
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
  walkTo(goal) {
    const t = this.tile;
    const p = findPath(this.map, t.x, t.y, goal.x, goal.y, this.team);
    if (p === null) return false;
    this.dest = goal;
    this.path = p.map((n) => this.map.tileCenter(n.x, n.y));
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
    this.sprite.rotation = 0;
    this.sprite.y = 0;
    this.setFrame(0);
  }

  // Walking animation: switch between standing and two stride poses.
  setFrame(f) {
    if (this.def.vehicle || f === this.frame) return;
    this.frame = f;
    this.sprite.setTexture(unitKey(this.type, this.team, f));
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
    if (!this.walkToAny(this.map.standSpots(b.tx, b.ty, b.w, b.h, this.tile))) this.stop();
  }

  // ---------- Gathering helpers ----------
  goToResource() {
    const o = this.order;
    o.phase = 'goto';
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
    const d = world.nearestDropOff(this.x, this.y, this.team);
    if (!d) {
      if (this.team === 'player') world.toast('Nowhere to drop off resources — build a Storage Shed');
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

  animateWork(dt) {
    this.workAnim += dt;
    this.sprite.rotation = Math.sin(this.workAnim / 140) * 0.12;
    this.sprite.y = -Math.max(0, Math.sin(this.workAnim / 140)) * 1.5;
  }

  updateCarryIcon() {
    const show = this.carry >= 0.5;
    this.carryIcon.setVisible(show);
    if (show) this.carryIcon.setFillStyle(CARRY_COLOR[this.carryType]);
  }

  // ---------- Every frame ----------
  stepPath(dt) {
    if (!this.path.length) return;
    const target = this.path[0];
    const nt = this.map.worldToTile(target.x, target.y);
    if (!this.map.isWalkable(nt.x, nt.y, this.team) && this.dest) {
      // Something was built in the way — find a new route.
      if (!this.walkTo(this.dest)) this.path = [];
      return;
    }
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    const step = (this.speed * dt) / 1000;
    this.face(target.x, target.y);
    this.sprite.rotation = 0;
    this.walkPhase += dt * 0.014;
    this.sprite.y = this.def.vehicle ? 0 : -Math.abs(Math.sin(this.walkPhase)) * 1.6;
    const sw = Math.sin(this.walkPhase);
    this.setFrame(sw > 0.35 ? 1 : sw < -0.35 ? 2 : 0);
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
    this.setFrame(0);
    this.face(t.isBuilding ? t.cx : t.x, t.isBuilding ? t.cy : t.y);
    if (this.cooldown <= 0) {
      this.cooldown = this.def.cooldown;
      const dmg = hitDamage(this.def, t) * world.attackMultiplier(this.team);
      if (this.def.range > 60) {
        world.shoot(this.x, this.y, t, dmg, this, 18);
      } else {
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
      if (u.team !== this.team || u === this || u.dead || u.hp >= u.maxHp || u.def.vehicle) continue;
      const d = Math.hypot(u.x - this.x, u.y - this.y);
      const frac = u.hp / u.maxHp;
      if (d < 80 && frac < worst) { worst = frac; best = u; }
      else if (d < this.def.sight && d < farD) { farD = d; far = u; }
    }
    if (best) {
      const amount = this.def.heals * (world.teams[this.team].upgrades.has('field_medicine') ? 2 : 1);
      best.hp = Math.min(best.maxHp, best.hp + amount);
      best.updateHpBar();
      if (this.team === 'player' && world.fx && best.container.visible) world.fx.floatText(best.isoX, best.isoY - 26, `+${amount}`, '#8fd18a');
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
    }
    this.face(b.cx, b.cy);
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
    }

    if (o.phase === 'work') {
      if (!o.farm) { const c = this.map.tileCenter(o.tx, o.ty); this.face(c.x, c.y); }
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
      if (this.team === 'player' && world.fx && this.container.visible) {
        world.fx.floatText(this.isoX, this.isoY - 30, `+${Math.round(this.carry)}`, RES_TEXT_COLOR[o.res]);
      }
      this.carry = 0;
      this.updateCarryIcon();
      if (o.noMore) { this.stop(); return; }
      this.goToResource();
    }
  }
}
