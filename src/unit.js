// Units: workers and soldiers. Workers can gather resources and construct buildings.
import { TEAM_COLORS } from './config.js';
import { findPath } from './pathfinding.js';

export const UNIT_TYPES = {
  worker:  { name: 'Worker',  icon: '👷', speed: 75, hp: 25, cost: { food: 50 },           trainTime: 8 },
  soldier: { name: 'Soldier', icon: '🗡️', speed: 85, hp: 45, cost: { food: 60, wood: 20 }, trainTime: 10 },
};

const GATHER_RATE = { wood: 0.9, stone: 0.7, food: 0.8 }; // per second
const CARRY_MAX = 10;
const CARRY_COLOR = { wood: 0x8b5a2b, stone: 0xb0b0b0, food: 0xf1c232 };
const GATHER_WORD = { wood: 'chopping wood', stone: 'mining stone', food: 'foraging' };

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
    this.selected = false;

    const colors = TEAM_COLORS[team];
    const c = map.tileCenter(tx, ty);
    this.container = scene.add.container(c.x, c.y);

    const shadow = scene.add.ellipse(0, 9, 22, 9, 0x000000, 0.3);
    this.ring = scene.add.ellipse(0, 9, 30, 13).setStrokeStyle(2, 0x7cfc00).setVisible(false);

    let body;
    if (type === 'worker') {
      this.tool = scene.add.rectangle(9, 0, 3, 13, 0x8b5a2b);
      body = [
        this.tool,
        scene.add.circle(0, 0, 8, colors.main).setStrokeStyle(2, colors.dark),
        scene.add.circle(0, -6, 4, 0xe6b85c),                        // straw hat
      ];
    } else {
      this.tool = null;
      body = [
        scene.add.rectangle(11, -2, 3, 16, 0xdddddd),                // sword
        scene.add.rectangle(0, 0, 16, 16, colors.main).setStrokeStyle(2, colors.dark),
        scene.add.rectangle(0, -7, 12, 5, 0x9a9a9a),                 // helmet
      ];
    }

    this.carryIcon = scene.add.rectangle(-9, -7, 7, 7, 0xffffff).setStrokeStyle(1, 0x000000).setVisible(false);
    this.hpBg = scene.add.rectangle(-12, -20, 24, 4, 0x000000, 0.6).setOrigin(0, 0.5).setVisible(false);
    this.hpFill = scene.add.rectangle(-12, -20, 24, 4, 0x6aff4d).setOrigin(0, 0.5).setVisible(false);

    this.container.add([shadow, this.ring, ...body, this.carryIcon, this.hpBg, this.hpFill]);
    this.container.setDepth(c.y);
  }

  get x() { return this.container.x; }
  get y() { return this.container.y; }
  get tile() { return this.map.worldToTile(this.x, this.y); }
  get isMoving() { return this.path.length > 0; }
  get isIdle() { return !this.order && !this.isMoving; }

  get statusText() {
    const o = this.order;
    if (!o) return this.isMoving ? 'moving' : 'idle';
    if (o.kind === 'build') return `building ${o.building.def.name}`;
    if (o.phase === 'return') return `carrying ${o.res}`;
    return o.farm ? 'farming' : GATHER_WORD[o.res];
  }

  setSelected(v) {
    this.selected = v;
    this.ring.setVisible(v);
    this.hpBg.setVisible(v);
    this.hpFill.setVisible(v);
    this.hpFill.width = 24 * (this.hp / this.maxHp);
  }

  // ---------- Walking ----------
  walkTo(goal) {
    const t = this.tile;
    const p = findPath(this.map, t.x, t.y, goal.x, goal.y);
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
    if (this.tool) this.tool.rotation = 0;
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
    const d = world.nearestDropOff(this.x, this.y);
    if (!d) {
      world.toast('Nowhere to drop off resources — build a Storage Shed');
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
    const other = world.nearestUnfinished(this.x, this.y, 10);
    if (other) this.orderBuild(other);
  }

  animateWork(dt) {
    if (!this.tool) return;
    this.workAnim += dt;
    this.tool.rotation = Math.sin(this.workAnim / 110) * 0.7;
  }

  updateCarryIcon() {
    const show = this.carry >= 0.5;
    this.carryIcon.setVisible(show);
    if (show) this.carryIcon.setFillStyle(CARRY_COLOR[this.carryType]);
  }

  // ---------- Every frame ----------
  update(dt, world) {
    // 1. Walk along the path.
    if (this.path.length) {
      const target = this.path[0];
      const nt = this.map.worldToTile(target.x, target.y);
      if (!this.map.isWalkable(nt.x, nt.y) && this.dest) {
        // Something was built in the way — find a new route.
        if (!this.walkTo(this.dest)) this.path = [];
        return;
      }
      const dx = target.x - this.x;
      const dy = target.y - this.y;
      const dist = Math.hypot(dx, dy);
      const step = (this.speed * dt) / 1000;
      if (dist <= step) {
        this.container.setPosition(target.x, target.y);
        this.path.shift();
      } else {
        this.container.x += (dx / dist) * step;
        this.container.y += (dy / dist) * step;
      }
      this.container.setDepth(this.container.y);
      return;
    }

    // 2. Carry out the current order.
    const o = this.order;
    if (!o) return;
    if (o.kind === 'build') this.updateBuild(dt, world);
    else if (o.kind === 'gather') this.updateGather(dt, world);
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
    this.animateWork(dt);
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
      this.animateWork(dt);
      const want = (GATHER_RATE[o.res] * dt) / 1000;
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
      if (this.carry >= CARRY_MAX || exhausted) {
        if (exhausted) {
          if (o.farm) {
            o.noMore = true;
          } else {
            const next = this.map.nearestResource(o.res, o.tx, o.ty, 8);
            if (next) { o.tx = next.x; o.ty = next.y; } else o.noMore = true;
          }
        }
        if (this.carry >= CARRY_MAX || o.noMore) this.returnCargo(world);
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
      world.addResource(o.res, Math.round(this.carry));
      this.carry = 0;
      this.updateCarryIcon();
      if (o.noMore) { this.stop(); return; }
      this.goToResource();
    }
  }
}
