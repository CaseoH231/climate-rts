// Buildings: what they cost, what they do, and how they're drawn.
import { TILE, TEAM_COLORS } from './config.js';
import { UNIT_TYPES } from './unit.js';

export const BUILDING_TYPES = {
  town_centre: {
    name: 'Town Centre', icon: '🏛️', w: 3, h: 3, hp: 600, cost: {}, buildTime: 60,
    pop: 10, dropOff: true, trains: ['worker'],
    desc: 'Trains workers. Drop off any resource here.',
  },
  house: {
    name: 'House', icon: '🏠', w: 2, h: 2, hp: 200, cost: { wood: 30 }, buildTime: 10,
    pop: 5, desc: '+5 population',
  },
  farm: {
    name: 'Farm', icon: '🌾', w: 2, h: 2, hp: 100, cost: { wood: 60 }, buildTime: 8,
    walkable: true, food: 300, desc: 'One worker farms 300 food here',
  },
  storage: {
    name: 'Storage Shed', icon: '📦', w: 2, h: 2, hp: 300, cost: { wood: 100 }, buildTime: 14,
    dropOff: true, desc: 'Drop off any resource here — build near forests and stone',
  },
  barracks: {
    name: 'Barracks', icon: '⚔️', w: 3, h: 3, hp: 500, cost: { wood: 125, stone: 50 }, buildTime: 22,
    trains: ['soldier'], desc: 'Trains soldiers',
  },
};

// What a worker can build, in button order (keys 1, 2, 3…).
export const WORKER_BUILDS = ['house', 'farm', 'storage', 'barracks'];

// ---------- Drawing ----------
// Draws a building into Graphics `g` with its top-left at (0, 0).
export function drawBuildingArt(g, type, colors, { progress = 1, foodFrac = 1, alpha = 1 } = {}) {
  const def = BUILDING_TYPES[type];
  const W = def.w * TILE;
  const H = def.h * TILE;
  let a = alpha;

  if (progress < 1) {
    // Foundation + scaffolding while under construction.
    g.fillStyle(0x8b6b43, 0.55 * alpha).fillRect(0, 0, W, H);
    g.lineStyle(2, 0x5c4326, 0.9 * alpha).strokeRect(1, 1, W - 2, H - 2);
    g.lineStyle(2, 0x5c4326, 0.6 * alpha).lineBetween(0, 0, W, H).lineBetween(W, 0, 0, H);
    a = alpha * (0.15 + 0.6 * progress);
  }

  switch (type) {
    case 'town_centre': {
      g.fillStyle(0x000000, 0.25 * a).fillRect(8, 14, 88, 82);
      g.fillStyle(0x8f8f8f, a).fillRect(4, 40, 88, 52);
      g.lineStyle(2, 0x5e5e5e, a).strokeRect(4, 40, 88, 52);
      g.lineStyle(1, 0x6f6f6f, a);
      for (const y of [52, 64, 76]) g.lineBetween(6, y, 90, y);
      g.fillStyle(0xc8a165, a).fillRect(14, 28, 68, 22);
      g.fillStyle(colors.main, a).fillTriangle(6, 34, 48, 4, 90, 34);
      g.fillStyle(colors.dark, a).fillTriangle(48, 4, 90, 34, 48, 34);
      g.fillStyle(0x5b3a1e, a).fillRect(40, 66, 16, 26);
      g.fillStyle(0x9fc5e8, a).fillRect(16, 58, 12, 10).fillRect(68, 58, 12, 10);
      g.fillStyle(0x5b3a1e, a).fillRect(47, -14, 2, 20);
      g.fillStyle(colors.main, a).fillTriangle(49, -14, 62, -9, 49, -4);
      break;
    }
    case 'house': {
      g.fillStyle(0x000000, 0.25 * a).fillRect(10, 12, 54, 52);
      g.fillStyle(0xe0cfa9, a).fillRect(8, 28, 48, 32);
      g.lineStyle(2, 0x8b7355, a).strokeRect(8, 28, 48, 32);
      g.fillStyle(0x6b4423, a).fillRect(27, 42, 10, 18);
      g.fillStyle(0x9fc5e8, a).fillRect(13, 36, 9, 8).fillRect(42, 36, 9, 8);
      g.fillStyle(0x6b6b6b, a).fillRect(44, 8, 6, 14);
      g.fillStyle(0xa0522d, a).fillTriangle(2, 32, 32, 4, 62, 32);
      g.fillStyle(0x7f3f1f, a).fillTriangle(32, 4, 62, 32, 32, 32);
      g.fillStyle(colors.main, a).fillRect(8, 58, 48, 2);
      break;
    }
    case 'farm': {
      g.fillStyle(0x7a4f2a, a).fillRect(1, 1, 62, 62);
      const rows = 6;
      const shown = Math.ceil(rows * Math.max(0, foodFrac));
      for (let i = 0; i < rows; i++) {
        const col = i < shown ? (i % 2 ? 0xd4b83a : 0x9bbf3a) : 0x5e3d20;
        g.fillStyle(col, a).fillRect(5, 5 + i * 10, 54, 5);
      }
      g.lineStyle(2, 0x5c3d1e, a).strokeRect(1, 1, 62, 62);
      g.fillStyle(0x5c3d1e, a).fillRect(0, 0, 4, 4).fillRect(60, 0, 4, 4).fillRect(0, 60, 4, 4).fillRect(60, 60, 4, 4);
      break;
    }
    case 'storage': {
      g.fillStyle(0x000000, 0.25 * a).fillRect(10, 16, 54, 48);
      g.fillStyle(0x9c6b3c, a).fillRect(6, 22, 52, 38);
      g.lineStyle(1, 0x7a522c, a);
      for (let x = 14; x < 58; x += 8) g.lineBetween(x, 26, x, 60);
      g.fillStyle(0x5c3d1e, a).fillRect(2, 12, 60, 14);
      g.fillStyle(colors.main, a).fillRect(6, 26, 52, 3);
      g.fillStyle(0x3b2614, a).fillRect(24, 38, 16, 22);
      g.fillStyle(0xc9a26b, a).fillRect(8, 48, 12, 12).fillRect(44, 48, 12, 12);
      g.lineStyle(1, 0x7a522c, a).strokeRect(8, 48, 12, 12).strokeRect(44, 48, 12, 12);
      break;
    }
    case 'barracks': {
      g.fillStyle(0x000000, 0.25 * a).fillRect(10, 22, 86, 72);
      g.fillStyle(0x7d6b57, a).fillRect(6, 34, 84, 56);
      g.lineStyle(2, 0x4e4134, a).strokeRect(6, 34, 84, 56);
      g.fillStyle(0x4a3b2a, a).fillRect(0, 18, 96, 22);
      g.fillStyle(0x3a2d20, a).fillRect(0, 36, 96, 4);
      g.fillStyle(0x2e2216, a).fillRect(40, 62, 16, 28);
      g.fillStyle(colors.main, a).fillRect(14, 46, 12, 22).fillTriangle(14, 68, 26, 68, 20, 74);
      g.fillStyle(colors.main, a).fillRect(70, 46, 12, 22).fillTriangle(70, 68, 82, 68, 76, 74);
      g.lineStyle(3, 0xdddddd, a).lineBetween(38, 44, 58, 58).lineBetween(58, 44, 38, 58);
      break;
    }
  }
}

export class Building {
  constructor(scene, map, type, tx, ty, team = 'player', complete = false) {
    const def = BUILDING_TYPES[type];
    this.scene = scene;
    this.map = map;
    this.type = type;
    this.def = def;
    this.team = team;
    this.tx = tx;
    this.ty = ty;
    this.w = def.w;
    this.h = def.h;
    this.W = def.w * TILE;
    this.H = def.h * TILE;
    this.progress = complete ? 1 : 0;
    this.maxHp = def.hp;
    this.hp = complete ? def.hp : Math.ceil(def.hp * 0.1);
    this.queue = [];          // units waiting to be trained
    this.trainTimer = 0;
    this.waitingForPop = false;
    this.food = def.food || 0;
    this.farmer = null;
    this.selected = false;
    this.dead = false;

    const px = tx * TILE;
    const py = ty * TILE;
    this.container = scene.add.container(px, py);
    this.container.setDepth(def.walkable ? py : py + this.H);
    this.gfx = scene.add.graphics();
    this.ui = scene.add.graphics();
    this.container.add([this.gfx, this.ui]);

    map.placeBuilding(this);
    this.redraw();
  }

  get complete() { return this.progress >= 1; }
  get cx() { return (this.tx + this.w / 2) * TILE; }
  get cy() { return (this.ty + this.h / 2) * TILE; }

  get trainProgress() {
    if (!this.queue.length) return 0;
    return Math.min(1, this.trainTimer / UNIT_TYPES[this.queue[0]].trainTime);
  }

  // Called by builders each frame. Returns true the moment the building is finished.
  addProgress(dt) {
    if (this.complete) return false;
    this.progress = Math.min(1, this.progress + dt / 1000 / this.def.buildTime);
    this.hp = Math.max(this.hp, Math.ceil(this.maxHp * (0.1 + 0.9 * this.progress)));
    this.redraw();
    return this.complete;
  }

  redraw() {
    const g = this.gfx;
    g.clear();
    drawBuildingArt(g, this.type, TEAM_COLORS[this.team], {
      progress: this.progress,
      foodFrac: this.def.food ? this.food / this.def.food : 1,
    });

    const u = this.ui;
    u.clear();
    if (this.selected) u.lineStyle(2, 0x7cfc00, 1).strokeRect(-3, -3, this.W + 6, this.H + 6);
    let frac = null;
    let col = 0;
    if (!this.complete) { frac = this.progress; col = 0xffb300; }
    else if (this.queue.length) { frac = this.trainProgress; col = 0x5fa8ff; }
    if (frac !== null) {
      u.fillStyle(0x000000, 0.6).fillRect(6, -12, this.W - 12, 6);
      u.fillStyle(col, 1).fillRect(7, -11, (this.W - 14) * frac, 4);
    }
  }

  setSelected(v) {
    this.selected = v;
    this.redraw();
  }

  destroy() {
    this.map.removeBuilding(this);
    this.container.destroy();
  }
}
