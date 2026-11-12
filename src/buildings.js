// Buildings, eras and research: what they cost, what they unlock, and how they behave.
import { TILE } from './config.js';
import { UNIT_TYPES } from './unit.js';
import { buildingKey, buildingTexInfo, BUILDING_POINTS, ART_RES, ensureBuildingTex, emitterPoints } from './art.js';
import { toIso } from './iso.js';

// A patch of bare, trodden earth for a w×h building, with a ragged edge that fades into the grass.
function groundTex(scene, w, h) {
  const key = `bground_${w}x${h}`;
  const o = toIso(0, 0);
  const ax = toIso(TILE, 0).x - o.x, ay = toIso(TILE, 0).y - o.y;
  const bx = toIso(0, TILE).x - o.x, by = toIso(0, TILE).y - o.y;
  const at = (u, v) => ({ x: u * ax + v * bx, y: u * ay + v * by });
  const M = 0.38; // how far the earth spreads past the walls, in tiles
  const corners = [at(-M, -M), at(w + M, -M), at(w + M, h + M), at(-M, h + M)];
  const minX = Math.min(...corners.map((c) => c.x)) - 4;
  const minY = Math.min(...corners.map((c) => c.y)) - 4;
  const W = Math.ceil(Math.max(...corners.map((c) => c.x)) - minX + 8);
  const H = Math.ceil(Math.max(...corners.map((c) => c.y)) - minY + 8);
  if (!scene.textures.exists(key)) {
    const tex = scene.textures.createCanvas(key, W, H);
    const ctx = tex.getContext();
    let seed = w * 7919 + h * 104729;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    // a few rings from the outside in: faint and ragged at the edge, solid in the middle
    for (const [m, alpha] of [[M, 0.22], [M * 0.7, 0.3], [M * 0.35, 0.38], [0.05, 0.42]]) {
      const pts = [];
      const per = 10;
      const edge = [[-m, -m, w + m, -m], [w + m, -m, w + m, h + m], [w + m, h + m, -m, h + m], [-m, h + m, -m, -m]];
      for (const [u0, v0, u1, v1] of edge) {
        for (let i = 0; i < per; i++) {
          const t = i / per;
          const j = (rnd() - 0.5) * 0.22;
          const p = at(u0 + (u1 - u0) * t + j, v0 + (v1 - v0) * t - j);
          pts.push([p.x - minX, p.y - minY]);
        }
      }
      ctx.fillStyle = `rgba(108,88,60,${alpha})`;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fill();
    }
    // gravel, pebbles and tufts
    const n = Math.round(W * H / 40);
    for (let i = 0; i < n; i++) {
      const p = at(-M * 0.6 + rnd() * (w + M * 1.2), -M * 0.6 + rnd() * (h + M * 1.2));
      const x = p.x - minX, y = p.y - minY;
      const k = rnd();
      ctx.fillStyle = k < 0.45 ? 'rgba(70,56,38,0.5)' : k < 0.85 ? 'rgba(150,132,100,0.45)' : 'rgba(84,104,52,0.5)';
      ctx.fillRect(x, y, 1 + rnd(), 1);
    }
    tex.refresh();
  }
  return { key, ox: -minX, oy: -minY };
}

// Local isometric point inside a building (footprint grid px + height) → container coordinates.
const P = (x, y, z = 0) => ({ x: x - y, y: (x + y) / 2 - z });

// ---------- Eras ----------
export const ERAS = [
  { name: 'Coal Age', short: 'I' },
  { name: 'Industrial Age', short: 'II', cost: { food: 400, wood: 300, energy: 150 }, time: 40,
    desc: 'Unlocks Workshops, Coal Power Plants and Riflemen.' },
  { name: 'Modern Age', short: 'III', cost: { food: 550, wood: 350, stone: 200, energy: 250 }, time: 50,
    desc: 'Concrete and glass. Unlocks Apartment Blocks, Office Towers, Factories, Radar Stations and Armoured Cars.' },
  { name: 'Transition Age', short: 'IV', cost: { food: 700, stone: 300, energy: 400 }, time: 60,
    desc: 'Unlocks Solar Farms, Hydro Dams and Carbon Capture.' },
  { name: 'Green Age', short: 'V', cost: { food: 1000, wood: 600, clean: 500 }, time: 80,
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
  // Small drop-off camps: build them right next to what your workers are gathering.
  lumber_camp: {
    name: 'Lumber Camp', w: 1, h: 1, hp: 200, cost: { wood: 50 }, buildTime: 8, era: 0,
    dropOff: ['wood'], desc: 'Workers drop off wood here. Build it at the edge of a forest.',
  },
  mining_camp: {
    name: 'Mining Camp', w: 1, h: 1, hp: 200, cost: { wood: 50 }, buildTime: 8, era: 0,
    dropOff: ['stone', 'fuel'], desc: 'Workers drop off stone and coal here. Build it next to a quarry or coal seam.',
  },
  mill: {
    name: 'Mill', w: 2, h: 2, hp: 300, cost: { wood: 75 }, buildTime: 12, era: 0,
    dropOff: ['food'], desc: 'Workers drop off food here. Build it among your farms or near berry bushes.',
  },
  bridge: {
    name: 'Bridge', w: 1, h: 1, hp: 180, cost: { wood: 15 }, buildTime: 5, era: 0, line: true, bridge: true, walkable: true,
    desc: 'Drag a line across water, rock, coal or trees. Each section opens up as it is finished, so workers build out from the edge. Anyone can cross.',
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
    research: ['chainsaws', 'iron_weapons', 'field_medicine', 'electric_tools', 'body_armour', 'automation',
      'smart_grid', 'reforestation', 'cool_roofs', 'climate_shields'],
    desc: 'Researches advanced technology.',
  },
  power_plant: {
    name: 'Coal Power Plant', w: 3, h: 3, hp: 600, cost: { wood: 150, stone: 100 }, buildTime: 30, era: 1,
    produces: { fuel: 0.6 }, smoke: 'coal',
    desc: 'Burns coal for 0.6 energy per second — and pumps out lots of CO₂.',
  },
  apartments: {
    name: 'Apartment Block', w: 2, h: 2, hp: 450, cost: { wood: 60, stone: 140 }, buildTime: 25, era: 2,
    pop: 15, desc: '+15 population in one building.',
  },
  office: {
    name: 'Office Tower', w: 2, h: 2, hp: 500, cost: { wood: 100, stone: 250, energy: 100 }, buildTime: 40, era: 2,
    produces: { food: 0.12, wood: 0.12, stone: 0.08 }, desc: 'Trade and services bring in a little food, wood and stone every second.',
  },
  factory: {
    name: 'Factory', w: 3, h: 3, hp: 700, cost: { wood: 150, stone: 150 }, buildTime: 35, era: 2,
    produces: { wood: 0.25, stone: 0.2 }, pollutes: 0.02, smoke: 'coal',
    desc: 'Makes 0.25 wood and 0.2 stone per second — but belches out CO₂.',
  },
  radar: {
    name: 'Radar Station', w: 2, h: 2, hp: 300, cost: { stone: 150, energy: 100 }, buildTime: 25, era: 2,
    desc: 'Sees through the fog of war for 20 tiles around it.',
  },
  fishing_dock: {
    name: 'Fishing Dock', w: 2, h: 2, hp: 250, cost: { wood: 100 }, buildTime: 16, era: 0, needsWater: 3,
    produces: { food: 0.25 }, desc: 'Must be built on the shore. Catches 0.25 food per second, no workers needed.',
  },
  hydro_dam: {
    name: 'Hydro Dam', w: 2, h: 2, hp: 600, cost: { wood: 100, stone: 200 }, buildTime: 30, era: 3, needsWater: 4,
    produces: { clean: 0.55 }, smoke: 'spray',
    desc: 'Must be built against water. Makes 0.55 clean energy per second — the best early clean power.',
  },
  geothermal: {
    name: 'Geothermal Plant', w: 3, h: 3, hp: 800, cost: { wood: 200, stone: 300, clean: 100 }, buildTime: 45, era: 4,
    produces: { clean: 0.9 }, smoke: 'steam',
    desc: 'Taps the heat of the earth for 0.9 clean energy per second. The steam is just water.',
  },
  solar: {
    name: 'Solar Farm', w: 2, h: 2, hp: 150, cost: { wood: 60, stone: 80 }, buildTime: 18, era: 3,
    produces: { clean: 0.35 }, desc: 'Makes 0.35 clean energy per second. No pollution.',
  },
  carbon_capture: {
    name: 'Carbon Capture', w: 3, h: 3, hp: 500, cost: { stone: 250, clean: 150 }, buildTime: 35, era: 3,
    capture: { clean: 0.25, co2: 0.06 },
    desc: 'Uses 0.25 clean energy per second to pull CO₂ out of the air.',
  },
  restoration: {
    name: 'Climate Restoration Project', w: 4, h: 4, hp: 2500, cost: { food: 1000, wood: 1000, stone: 800, clean: 800 },
    buildTime: 180, era: 4, wonder: true, removesCO2: 0.3,
    desc: 'A huge project that heals the planet. Keep it standing for 3 minutes to win a Green Victory.',
  },
};

// What a worker can build, in button order: an economy page and a military page.
export const WORKER_PAGES = [
  ['house', 'apartments', 'farm', 'mill', 'lumber_camp', 'mining_camp', 'fishing_dock', 'market', 'trees', 'office', 'factory'],
  ['wind_turbine', 'power_plant', 'hydro_dam', 'solar', 'geothermal', 'carbon_capture'],
  ['barracks', 'tower', 'wall', 'gate', 'bridge', 'radar', 'workshop', 'restoration'],
];
export const WORKER_PAGE_NAMES = ['Town & economy', 'Energy', 'Military & science'];
export const WORKER_BUILDS = WORKER_PAGES.flat();

// ---------- Research ----------
// "energy" can be paid with fossil fuel or clean energy; "clean" must be clean energy.
export const UPGRADES = {
  steel_axes:      { name: 'Steel Axes', era: 0, time: 20, cost: { energy: 40 }, desc: '+30% wood gathering.' },
  mining_carts:    { name: 'Mining Carts', era: 0, time: 25, cost: { energy: 60, wood: 50 }, desc: '+30% stone and coal mining.' },
  plough:          { name: 'Plough', era: 0, time: 25, cost: { energy: 60, wood: 75 }, desc: '+30% food from farms.' },
  chainsaws:       { name: 'Chainsaws', era: 1, time: 30, cost: { energy: 100, wood: 100 }, desc: 'Another +30% wood gathering.' },
  iron_weapons:    { name: 'Iron Weapons', era: 1, time: 35, cost: { energy: 120, stone: 100 }, desc: '+25% attack for all units.' },
  electric_tools:  { name: 'Electric Tools', era: 2, time: 40, cost: { energy: 150, food: 200 }, desc: '+20% gathering of everything.' },
  smart_grid:      { name: 'Smart Grid', era: 3, time: 40, cost: { clean: 200, stone: 150 }, desc: 'Wind turbines and solar farms make 50% more.' },
  reforestation:   { name: 'Reforestation', era: 3, time: 40, cost: { food: 300, wood: 200 }, desc: 'Forests soak up twice as much CO₂.' },
  wheelbarrow:     { name: 'Wheelbarrow', era: 0, time: 25, cost: { wood: 100, food: 50 }, desc: 'Workers carry 50% more each trip.' },
  fish_farming:    { name: 'Fish Farming', era: 1, time: 30, cost: { food: 150, wood: 100 }, desc: 'Fishing Docks catch 60% more.' },
  field_medicine:  { name: 'Field Medicine', era: 1, time: 30, cost: { food: 150, energy: 80 }, desc: 'Medics heal twice as fast.' },
  cool_roofs:      { name: 'Cool Roofs', era: 3, time: 35, cost: { stone: 150, clean: 120 }, desc: 'Heatwaves no longer slow your workers down.' },
  body_armour:     { name: 'Body Armour', era: 2, time: 40, cost: { food: 200, stone: 150, energy: 150 }, desc: '+30% health for soldiers, archers, riflemen, scouts and medics — and modern kit.' },
  automation:      { name: 'Automation', era: 2, time: 40, cost: { stone: 200, energy: 200 }, desc: 'Factories, Office Towers and Fishing Docks produce 50% more.' },
  climate_shields: { name: 'Climate Shields', era: 4, time: 50, cost: { clean: 400, stone: 300 }, desc: 'Disasters do half damage to your buildings.' },
};

const CROP_ROWS = 9;

export class Building {
  constructor(scene, map, type, tx, ty, team = 'player', complete = false) {
    this.id = scene.newId ? scene.newId() : 0;
    if (scene.ents) scene.ents.set(this.id, this);
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
    // drawn in the look of the owner's era (Coal stone & timber … Green Age grass roofs)
    this.style = scene.styleFor ? scene.styleFor(type, team) : 0;
    const key = ensureBuildingTex(scene, type, team, this.style, def);
    this.image = scene.add.image(-this.tex.ox, -this.tex.oy, key).setOrigin(0).setScale(1 / ART_RES);
    this.overlay = scene.add.graphics();
    this.ui = scene.add.graphics();
    this.container.add([this.foundation, this.image, this.overlay, this.ui]);
    // (for show) trodden earth around the building, so it sits in the land rather than on the grass
    if (!def.walkable && !def.line && !def.bridge) {
      const g = groundTex(scene, def.w, def.h);
      this.ground = scene.add.image(iso.x - g.ox, iso.y - g.oy, g.key).setOrigin(0).setDepth(-0.5);
    }

    map.placeBuilding(this);
    this.redraw();
  }

  // Switch to the look of a new era.
  restyle(style) {
    if (style === this.style || this.dead) return;
    this.style = style;
    this.image.setTexture(ensureBuildingTex(this.scene, this.type, this.team, style, this.def));
    this.redraw();
  }

  // For 3D-rendered farms, plantations and wind turbines: lay the rendered crop stage, growing saplings or
  // spinning rotor over the building. Returns false (and hides them) when the building is hand-drawn.
  overlay3d() {
    const rendered = this.image.texture.key.startsWith('b3d_') && ['farm', 'trees', 'wind_turbine'].includes(this.type);
    const tm = this.scene.textures;
    let key = null;
    if (rendered && this.complete) {
      if (this.type === 'farm') {
        const frac = this.def.food ? this.food / this.def.food : 1;
        const st = Math.ceil(6 * Math.max(0, Math.min(1, frac)));
        key = st > 0 ? `b3d_crops_${st}` : null;
      } else if (this.type === 'trees') {
        key = `b3d_saplings_${Math.max(1, Math.ceil(5 * this.grow))}`;
      } else {
        key = 'b3d_rotor';
      }
    }
    if (key && !tm.exists(key)) key = null;
    if (!key) {
      if (this.top3d) this.top3d.setVisible(false);
      return rendered && !!this.top3d;
    }
    if (!this.top3d) {
      this.top3d = this.scene.add.image(0, 0, key).setScale(1 / ART_RES);
      this.container.addAt(this.top3d, this.container.getIndex(this.image) + 1);
    }
    const t = this.top3d.setVisible(true);
    if (t.texture.key !== key) t.setTexture(key);
    if (this.type === 'wind_turbine') {
      const hub = emitterPoints('wind_turbine', this.image.texture.key)[0] || [0, -80];
      t.setOrigin(0.5).setPosition(hub[0], hub[1]).setRotation(this.angle);
    } else {
      t.setOrigin(0).setPosition(-this.tex.ox, -this.tex.oy);
    }
    return true;
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
    if (this.complete && this.def.bridge) this.map.setBridge(this, true); // now people can walk on it
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
    if (this.overlay3d()) {
      // (3D-rendered: the crop, saplings or rotor are rendered sprites, handled in overlay3d)
    } else if (this.complete) {
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
            world.shoot(this.cx + (i ? (world.rand() - 0.5) * 30 : 0), this.cy, e, this.def.attack.dmg, this, this.type === 'tower' ? 60 : 50);
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
        world.addResource(res, rate * world.productionMultiplier(res, this.team, this.type) * s, this.team);
      }
      if (this.type === 'wind_turbine') {
        this.angle += dt * 0.003;
        if (this.top3d && this.top3d.visible) this.top3d.setRotation(this.angle); // (just turn the rotor sprite)
        else this.redraw();
      }
    }

    // Factories pollute while they run.
    if (this.def.pollutes && this.complete) {
      world.climate.addCO2(this.def.pollutes * s);
      world.stats.emit(this.team, this.def.pollutes * s);
    }

    // Smoke from coal power plants, steam from geothermal, spray from dams.
    if (this.def.smoke && this.complete) {
      this.smokeTimer -= s;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = this.def.smoke === 'coal' ? 0.35 : 0.5;
        const col = { coal: undefined, steam: 0xeef2f4, spray: 0xd8eef8 }[this.def.smoke];
        if (this.container.visible) {
          for (const [sx, sy] of emitterPoints(this.type, this.image.texture.key)) world.smoke(this.container.x + sx, this.container.y + sy, col);
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
    if (this.ground) { this.ground.destroy(); this.ground = null; }
    this.map.removeBuilding(this);
    this.container.destroy();
  }
}
