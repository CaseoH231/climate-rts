// Buildings, eras and research: what they cost, what they unlock, and how they behave.
import { TILE } from './config.js';
import { UNIT_TYPES } from './unit.js';
import { buildingKey, buildingTexInfo, BUILDING_POINTS, ART_RES } from './art.js';
import { toIso } from './iso.js';

// Local isometric point inside a building (footprint grid px + height) → container coordinates.
const P = (x, y, z = 0) => ({ x: x - y, y: (x + y) / 2 - z });

// ---------- Eras ----------
export const ERAS = [
  { name: 'Coal Age', short: 'I' },
  { name: 'Industrial Age', short: 'II', cost: { food: 400, wood: 300, energy: 150 }, time: 40,
    desc: 'Unlocks Workshops, Coal Power Plants and Riflemen.' },
  { name: 'Transition Age', short: 'III', cost: { food: 700, stone: 300, energy: 400 }, time: 60,
    desc: 'Unlocks Solar Farms, Carbon Capture and Armoured Cars.' },
  { name: 'Green Age', short: 'IV', cost: { food: 1000, wood: 600, clean: 500 }, time: 80,
    desc: 'Unlocks the Climate Restoration Project. Must be paid for with clean energy.' },
];

// ---------- Buildings ----------
// era = first era (0–3) in which it can be built.
export const BUILDING_TYPES = {
  town_centre: {
    name: 'Town Centre', w: 3, h: 3, hp: 1200, cost: {}, buildTime: 60, era: 0,
    attack: { dmg: 6, range: 230, cooldown: 2 }, garrison: 15,
    pop: 10, dropOff: true, trains: ['worker'], research: ['steel_axes', 'mining_carts', 'plough', 'wheelbarrow', 'fish_farming'], advancesEra: true,
    desc: 'Trains workers, advances your era and researches basic upgrades. Drop off any resource here.',
  },
  house: {
    name: 'House', w: 2, h: 2, hp: 200, cost: { wood: 30 }, buildTime: 10, era: 0,
    pop: 5, desc: '+5 population.',
  },
  farm: {
    name: 'Farm', w: 2, h: 2, hp: 100, cost: { wood: 60 }, buildTime: 8, era: 0,
    walkable: true, food: 300, desc: 'One worker farms 300 food here.',
  },
  storage: {
    name: 'Storage Shed', w: 2, h: 2, hp: 300, cost: { wood: 100 }, buildTime: 14, era: 0,
    dropOff: true, desc: 'Drop off any resource here. Build near forests, stone and coal.',
  },
  barracks: {
    name: 'Barracks', w: 3, h: 3, hp: 500, cost: { wood: 125, stone: 50 }, buildTime: 22, era: 0,
    trains: ['soldier', 'archer', 'scout', 'rifleman', 'medic', 'cannon', 'armoured_car', 'e_tank'], desc: 'Trains your army.',
  },
  tower: {
    name: 'Watch Tower', w: 2, h: 2, hp: 500, cost: { wood: 60, stone: 100 }, buildTime: 20, era: 0,
    attack: { dmg: 8, range: 250, cooldown: 1.6 }, garrison: 5,
    desc: 'Shoots at enemies that come close. Workers can shelter inside (more arrows).',
  },
  market: {
    name: 'Market', w: 3, h: 3, hp: 900, cost: { wood: 175 }, buildTime: 35, era: 0,
    desc: 'Trade one resource for another. Prices move as you buy and sell.',
  },
  wall: {
    name: 'Stone Wall', w: 1, h: 1, hp: 350, cost: { stone: 5 }, buildTime: 4, era: 0, wall: true, line: true,
    desc: 'Blocks enemies. Click and drag to lay a whole line of wall.',
  },
  gate: {
    name: 'Gate', w: 1, h: 1, hp: 450, cost: { stone: 25 }, buildTime: 10, era: 0, wall: true, gate: true,
    desc: 'A door in your wall: your people walk through, enemies have to break it down.',
  },
  wind_turbine: {
    name: 'Wind Turbine', w: 2, h: 2, hp: 150, cost: { wood: 80, stone: 30 }, buildTime: 15, era: 0,
    produces: { clean: 0.2 }, desc: 'Makes 0.2 clean energy per second. No pollution.',
  },
  trees: {
    name: 'Plant Trees', w: 2, h: 2, hp: 40, cost: { food: 25 }, buildTime: 4, era: 0,
    walkable: true, growTime: 45, desc: 'Saplings grow into forest, which soaks up CO₂.',
  },
  workshop: {
    name: 'Workshop', w: 3, h: 3, hp: 600, cost: { wood: 175, stone: 75 }, buildTime: 30, era: 1,
    research: ['chainsaws', 'iron_weapons', 'field_medicine', 'electric_tools', 'smart_grid', 'reforestation', 'cool_roofs', 'climate_shields'],
    desc: 'Researches advanced technology.',
  },
  power_plant: {
    name: 'Coal Power Plant', w: 3, h: 3, hp: 600, cost: { wood: 150, stone: 100 }, buildTime: 30, era: 1,
    produces: { fuel: 0.6 }, smoke: 'coal',
    desc: 'Burns coal for 0.6 energy per second — and pumps out lots of CO₂.',
  },
  fishing_dock: {
    name: 'Fishing Dock', w: 2, h: 2, hp: 250, cost: { wood: 100 }, buildTime: 16, era: 0, needsWater: 3,
    produces: { food: 0.25 }, desc: 'Must be built on the shore. Catches 0.25 food per second, no workers needed.',
  },
  hydro_dam: {
    name: 'Hydro Dam', w: 2, h: 2, hp: 600, cost: { wood: 100, stone: 200 }, buildTime: 30, era: 2, needsWater: 4,
    produces: { clean: 0.55 }, smoke: 'spray',
    desc: 'Must be built against water. Makes 0.55 clean energy per second — the best early clean power.',
  },
  geothermal: {
    name: 'Geothermal Plant', w: 3, h: 3, hp: 800, cost: { wood: 200, stone: 300, clean: 100 }, buildTime: 45, era: 3,
    produces: { clean: 0.9 }, smoke: 'steam',
    desc: 'Taps the heat of the earth for 0.9 clean energy per second. The steam is just water.',
  },
  solar: {
    name: 'Solar Farm', w: 2, h: 2, hp: 150, cost: { wood: 60, stone: 80 }, buildTime: 18, era: 2,
    produces: { clean: 0.35 }, desc: 'Makes 0.35 clean energy per second. No pollution.',
  },
  carbon_capture: {
    name: 'Carbon Capture', w: 3, h: 3, hp: 500, cost: { stone: 250, clean: 150 }, buildTime: 35, era: 2,
    capture: { clean: 0.25, co2: 0.06 },
    desc: 'Uses 0.25 clean energy per second to pull CO₂ out of the air.',
  },
  restoration: {
    name: 'Climate Restoration Project', w: 4, h: 4, hp: 2500, cost: { food: 1000, wood: 1000, stone: 800, clean: 800 },
    buildTime: 180, era: 3, wonder: true, removesCO2: 0.3,
    desc: 'A huge project that heals the planet. Keep it standing for 3 minutes to win a Green Victory.',
  },
};

// What a worker can build, in button order: an economy page and a military page.
export const WORKER_PAGES = [
  ['house', 'farm', 'storage', 'fishing_dock', 'market', 'trees',
    'wind_turbine', 'power_plant', 'hydro_dam', 'solar', 'geothermal'],
  ['barracks', 'tower', 'wall', 'gate', 'workshop', 'carbon_capture', 'restoration'],
];
export const WORKER_BUILDS = WORKER_PAGES.flat();

// ---------- Research ----------
// "energy" can be paid with fossil fuel or clean energy; "clean" must be clean energy.
export const UPGRADES = {
  steel_axes:      { name: 'Steel Axes', era: 0, time: 20, cost: { energy: 40 }, desc: '+30% wood gathering.' },
  mining_carts:    { name: 'Mining Carts', era: 0, time: 25, cost: { energy: 60, wood: 50 }, desc: '+30% stone and coal mining.' },
  plough:          { name: 'Plough', era: 0, time: 25, cost: { energy: 60, wood: 75 }, desc: '+30% food from farms.' },
  chainsaws:       { name: 'Chainsaws', era: 1, time: 30, cost: { energy: 100, wood: 100 }, desc: 'Another +30% wood gathering.' },
  iron_weapons:    { name: 'Iron Weapons', era: 1, time: 35, cost: { energy: 120, stone: 100 }, desc: '+25% attack for all units.' },
  electric_tools:  { name: 'Electric Tools', era: 2, time: 40, cost: { clean: 150, food: 200 }, desc: '+20% gathering of everything.' },
  smart_grid:      { name: 'Smart Grid', era: 2, time: 40, cost: { clean: 200, stone: 150 }, desc: 'Wind turbines and solar farms make 50% more.' },
  reforestation:   { name: 'Reforestation', era: 2, time: 40, cost: { food: 300, wood: 200 }, desc: 'Forests soak up twice as much CO₂.' },
  wheelbarrow:     { name: 'Wheelbarrow', era: 0, time: 25, cost: { wood: 100, food: 50 }, desc: 'Workers carry 50% more each trip.' },
  fish_farming:    { name: 'Fish Farming', era: 1, time: 30, cost: { food: 150, wood: 100 }, desc: 'Fishing Docks catch 60% more.' },
  field_medicine:  { name: 'Field Medicine', era: 1, time: 30, cost: { food: 150, energy: 80 }, desc: 'Medics heal twice as fast.' },
  cool_roofs:      { name: 'Cool Roofs', era: 2, time: 35, cost: { stone: 150, clean: 120 }, desc: 'Heatwaves no longer slow your workers down.' },
  climate_shields: { name: 'Climate Shields', era: 3, time: 50, cost: { clean: 400, stone: 300 }, desc: 'Disasters do half damage to your buildings.' },
};

const CROP_ROWS = 9;

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
    this.research = null;     // { kind: 'upgrade' | 'era', id, time, t }
    this.food = def.food || 0;
    this.farmer = null;
    this.angle = Math.random() * Math.PI; // turbine blades
    this.grow = 0;                         // sapling growth 0 → 1
    this.smokeTimer = Math.random();
    this.wonderTime = 0;
    this.capturing = false;
    this.rally = null;        // tile where newly trained units gather
    this.garrison = [];       // workers sheltering inside
    this.cooldown = 1;
    this.isBuilding = true;
    this.selected = false;
    this.dead = false;

    // The container sits at the footprint's top corner (in isometric world space).
    const iso = toIso(tx * TILE, ty * TILE);
    this.container = scene.add.container(iso.x, iso.y);
    this.container.setDepth(def.walkable ? iso.y : iso.y + (this.W + this.H) / 2);
    this.tex = buildingTexInfo(def);
    this.foundation = scene.add.graphics();
    this.image = scene.add.image(-this.tex.ox, -this.tex.oy, buildingKey(type, team)).setOrigin(0).setScale(1 / ART_RES);
    this.overlay = scene.add.graphics();
    this.ui = scene.add.graphics();
    this.container.add([this.foundation, this.image, this.overlay, this.ui]);

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

  // Footprint diamond as a list of points (container coordinates).
  diamondPts(z = 0, inset = 0) {
    const W = this.W - inset;
    const H = this.H - inset;
    return [P(inset, inset, z), P(W, inset, z), P(W, H, z), P(inset, H, z)];
  }

  redraw() {
    const W = this.W;
    const H = this.H;

    // Foundation & scaffolding while under construction; the building "rises" as it's built.
    const f = this.foundation;
    f.clear();
    if (!this.complete) {
      f.fillStyle(0x6b5640, 0.85).fillPoints(this.diamondPts(), true);
      f.lineStyle(1, 0x3e2f22, 0.9).strokePoints(this.diamondPts(), true);
      f.lineStyle(2, 0x8a6b45, 0.9);
      const hgt = 10 + 30 * this.progress;
      for (const p of this.diamondPts(0, 4)) f.lineBetween(p.x, p.y, p.x, p.y - hgt);
      const top = this.diamondPts(hgt, 4);
      f.strokePoints(top, true);
    }
    const fullH = this.tex.height;
    const visible = this.complete ? fullH : Math.max(2, fullH * this.progress);
    this.image.setCrop(0, (fullH - visible) * ART_RES, this.tex.width * ART_RES, visible * ART_RES);
    this.image.setAlpha(this.complete ? 1 : 0.92);

    // Moving / changing parts drawn on top.
    const o = this.overlay;
    o.clear();
    if (this.complete) {
      if (this.type === 'farm') {
        const frac = this.def.food ? this.food / this.def.food : 1;
        const rows = 11;
        const shown = Math.ceil(rows * Math.max(0, frac));
        for (let i = 0; i < shown; i++) {
          const y = 5 + i * 5;
          const a = P(4, y), b = P(60, y);
          o.lineStyle(3, i % 2 ? 0xb39a4e : 0x86973f, 1).lineBetween(a.x, a.y - 1.5, b.x, b.y - 1.5);
          o.lineStyle(1, 0x000000, 0.18).lineBetween(a.x, a.y, b.x, b.y);
        }
      } else if (this.type === 'wind_turbine') {
        const [hx, hy] = BUILDING_POINTS.wind_turbine.hub;
        for (let i = 0; i < 3; i++) {
          const a = this.angle + (i * Math.PI * 2) / 3;
          o.lineStyle(3, 0x000000, 0.12).lineBetween(hx + 3, hy + 4, hx + 3 + Math.cos(a) * 24, hy + 4 + Math.sin(a) * 24);
          o.lineStyle(2.5, 0xeaeae6, 1).lineBetween(hx, hy, hx + Math.cos(a) * 24, hy + Math.sin(a) * 24);
        }
        o.fillStyle(0xcfcfcb, 1).fillCircle(hx, hy, 2.5);
      } else if (this.type === 'trees') {
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 4; j++) {
            const q = P(9 + i * 15, 9 + j * 15);
            const r = 2 + 5 * this.grow;
            o.fillStyle(0x000000, 0.25).fillEllipse(q.x + r * 0.6, q.y, r * 2, r * 0.8);
            o.fillStyle(0x3b2a1a, 1).fillRect(q.x - 0.75, q.y - r * 1.2, 1.5, r * 1.2);
            o.fillStyle(0x2f4a24, 1).fillCircle(q.x, q.y - r * 1.6, r);
            o.fillStyle(0x6f9a4c, 1).fillCircle(q.x - r * 0.3, q.y - r * 1.9, r * 0.55);
          }
        }
      }
    }

    // Selection outline and progress / health bars (shown just below the building).
    const u = this.ui;
    u.clear();
    if (this.selected) {
      u.lineStyle(1.5, 0xe8dca0, 0.95).strokePoints(this.diamondPts(), true);
    }
    let frac = null;
    let col = 0;
    if (!this.complete) { frac = this.progress; col = 0xc8a960; }
    else if (this.research) { frac = this.research.t / this.research.time; col = 0x9c86c9; }
    else if (this.queue.length) { frac = this.trainProgress; col = 0x7fa6d6; }
    else if (this.hp < this.maxHp || this.selected) { frac = this.hp / this.maxHp; col = frac > 0.5 ? 0x5fb04a : frac > 0.25 ? 0xd0a63a : 0xb8433a; }
    if (frac !== null) {
      const bw = Math.min(70, (W + H) * 0.45);
      const cx = (W - H) / 2;
      const y = (W + H) / 2 + 6;
      u.fillStyle(0x000000, 0.7).fillRect(cx - bw / 2, y, bw, 5);
      u.fillStyle(col, 1).fillRect(cx - bw / 2 + 1, y + 1, (bw - 2) * Math.max(0, Math.min(1, frac)), 3);
    }
  }

  setSelected(v) {
    this.selected = v;
    this.redraw();
  }

  // Per-frame work for buildings that do things on their own.
  update(dt, world) {
    if (!this.complete || this.dead) return;
    const s = dt / 1000;

    // Town Centres and towers shoot arrows at nearby enemy units.
    if (this.def.attack) {
      this.cooldown -= s;
      if (this.cooldown <= 0) {
        const e = world.findEnemyUnitNear(this.cx, this.cy, this.def.attack.range, this.team);
        if (e) {
          // one extra arrow for every 3 people sheltering inside
          const arrows = 1 + Math.floor(this.garrison.length / 3);
          for (let i = 0; i < arrows; i++) {
            world.shoot(this.cx + (i ? (Math.random() - 0.5) * 30 : 0), this.cy, e, this.def.attack.dmg, this, this.type === 'tower' ? 60 : 50);
          }
          this.cooldown = this.def.attack.cooldown;
        } else {
          this.cooldown = 0.5;
        }
      }
    }

    // Research in progress (upgrades / new era).
    if (this.research) {
      this.research.t += s;
      if (this.research.t >= this.research.time) world.finishResearch(this);
      this.redraw();
    }

    // Energy producers.
    if (this.def.produces) {
      for (const [res, rate] of Object.entries(this.def.produces)) {
        world.addResource(res, rate * world.productionMultiplier(res, this.team) * s, this.team);
      }
      if (this.type === 'wind_turbine') {
        this.angle += dt * 0.003;
        this.redraw();
      }
    }

    // Smoke from coal power plants, steam from geothermal, spray from dams.
    if (this.def.smoke && this.complete) {
      this.smokeTimer -= s;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = this.def.smoke === 'coal' ? 0.35 : 0.5;
        const col = { coal: undefined, steam: 0xeef2f4, spray: 0xd8eef8 }[this.def.smoke];
        if (this.container.visible) {
          for (const [sx, sy] of BUILDING_POINTS[this.type].smoke) world.smoke(this.container.x + sx, this.container.y + sy, col);
        }
      }
    }

    // Carbon capture uses clean energy to remove CO₂.
    if (this.def.capture) {
      const need = this.def.capture.clean * s;
      const r = world.teams[this.team].resources;
      this.capturing = r.clean >= need;
      if (this.capturing) {
        r.clean -= need;
        world.climate.addCO2(-this.def.capture.co2 * s);
      }
    }

    // The wonder heals the planet and counts down to a Green Victory.
    if (this.def.wonder) {
      this.wonderTime += s;
      world.climate.addCO2(-this.def.removesCO2 * s);
    }

    if (this.type === 'trees') {
      const before = Math.floor(this.grow * 20);
      this.grow = Math.min(1, this.grow + s / this.def.growTime);
      if (Math.floor(this.grow * 20) !== before) this.redraw();
      if (this.grow >= 1) world.growForest(this);
    }
  }

  destroy() {
    this.map.removeBuilding(this);
    this.container.destroy();
  }
}
