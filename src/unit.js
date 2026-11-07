// Units: workers and soldiers that can be selected and moved.
import { TEAM_COLORS } from './config.js';
import { findPath } from './pathfinding.js';

export const UNIT_TYPES = {
  worker:  { name: 'Worker',  speed: 75, hp: 25 },
  soldier: { name: 'Soldier', speed: 85, hp: 45 },
};

export class Unit {
  constructor(scene, map, tx, ty, type, team = 'player') {
    const def = UNIT_TYPES[type];
    this.scene = scene;
    this.map = map;
    this.type = type;
    this.team = team;
    this.name = def.name;
    this.speed = def.speed;
    this.maxHp = def.hp;
    this.hp = def.hp;
    this.path = [];
    this.selected = false;

    const colors = TEAM_COLORS[team];
    const c = map.tileCenter(tx, ty);
    this.container = scene.add.container(c.x, c.y);

    const shadow = scene.add.ellipse(0, 9, 22, 9, 0x000000, 0.3);
    this.ring = scene.add.ellipse(0, 9, 30, 13).setStrokeStyle(2, 0x7cfc00).setVisible(false);

    let body;
    if (type === 'worker') {
      body = [
        scene.add.rectangle(9, 0, 3, 13, 0x8b5a2b),                 // tool handle
        scene.add.circle(0, 0, 8, colors.main).setStrokeStyle(2, colors.dark),
        scene.add.circle(0, -6, 4, 0xe6b85c),                        // straw hat
      ];
    } else {
      body = [
        scene.add.rectangle(11, -2, 3, 16, 0xdddddd),                // sword
        scene.add.rectangle(0, 0, 16, 16, colors.main).setStrokeStyle(2, colors.dark),
        scene.add.rectangle(0, -7, 12, 5, 0x9a9a9a),                 // helmet
      ];
    }

    this.hpBg = scene.add.rectangle(-12, -20, 24, 4, 0x000000, 0.6).setOrigin(0, 0.5).setVisible(false);
    this.hpFill = scene.add.rectangle(-12, -20, 24, 4, 0x6aff4d).setOrigin(0, 0.5).setVisible(false);

    this.container.add([shadow, this.ring, ...body, this.hpBg, this.hpFill]);
    this.container.setDepth(c.y);
  }

  get x() { return this.container.x; }
  get y() { return this.container.y; }
  get tile() { return this.map.worldToTile(this.x, this.y); }
  get isMoving() { return this.path.length > 0; }

  setSelected(v) {
    this.selected = v;
    this.ring.setVisible(v);
    this.hpBg.setVisible(v);
    this.hpFill.setVisible(v);
    this.hpFill.width = 24 * (this.hp / this.maxHp);
  }

  moveTo(goal) {
    const t = this.tile;
    const p = findPath(this.map, t.x, t.y, goal.x, goal.y);
    if (p === null) return false;
    this.path = p.map((n) => this.map.tileCenter(n.x, n.y));
    if (!this.path.length) this.path = [this.map.tileCenter(t.x, t.y)];
    return true;
  }

  update(dt) {
    if (!this.path.length) return;
    const target = this.path[0];
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
  }
}
