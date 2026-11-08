// The enemy computer player: gathers, builds, trains an army and sends attack waves.
import { TILE } from './config.js';
import { BUILDING_TYPES, ERAS } from './buildings.js';
import { UNIT_TYPES } from './unit.js';
import { findPath } from './pathfinding.js';

// Tweak these to make the enemy easier or harder.
export const AI_SETTINGS = {
  maxWorkers: 20,
  firstWave: 420,      // seconds before the first attack
  waveGap: 150,        // seconds between attacks
  firstWaveSize: 4,    // soldiers/archers in the first attack
  waveGrowth: 2,       // extra units each wave
  eraTimes: [0, 480, 960],   // earliest game time (s) the enemy tries to reach each era (it never goes Green)
  research: ['steel_axes', 'mining_carts', 'plough', 'chainsaws', 'iron_weapons'],
  // Share of workers on each resource. This enemy loves coal — it pollutes a lot!
  gatherMix: { food: 0.4, wood: 0.35, fuel: 0.15, stone: 0.1 },
};

// Difficulty levels change how fast and hard the enemy attacks, and how big its economy gets.
export const DIFFICULTY = {
  easy:   { name: 'Easy',   firstWave: 600, waveGap: 210, firstWaveSize: 3, waveGrowth: 1, maxWorkers: 14, bonus: 0, counterChance: 0.15 },
  normal: { name: 'Normal', firstWave: 420, waveGap: 150, firstWaveSize: 4, waveGrowth: 2, maxWorkers: 20, bonus: 0, counterChance: 0.45 },
  hard:   { name: 'Hard',   firstWave: 300, waveGap: 115, firstWaveSize: 6, waveGrowth: 3, maxWorkers: 26, bonus: 250, counterChance: 0.75 },
};

// What beats what (best answer first, falling back if that unit isn't available yet).
const COUNTERS = {
  soldier: ['archer'],
  archer: ['armoured_car', 'rifleman', 'soldier'],
  rifleman: ['soldier'],
  armoured_car: ['rifleman', 'soldier'],
};

export class EnemyAI {
  constructor(world, team = 'enemy', difficulty = 'normal') {
    this.world = world;
    this.team = team;
    this.cfg = { ...AI_SETTINGS, ...DIFFICULTY[difficulty] };
    this.timer = 0;
    this.nextWave = this.cfg.firstWave;
    this.waveSize = this.cfg.firstWaveSize;
    this.waveNum = 0;
    this.assault = new Set();
    this.storageTimer = 30;
    this.rebalanceTimer = 20;
    this.unreachable = new Set(); // resource tiles our workers can't get to
  }

  // Look at the opponent's army and pick the unit that beats the most common type in it.
  counterPick(era) {
    const seen = {};
    for (const u of this.world.units) {
      if (u.team !== this.team && u.isMilitary && !u.dead) seen[u.type] = (seen[u.type] || 0) + 1;
    }
    const common = Object.keys(seen).sort((a, b) => seen[b] - seen[a])[0];
    if (!common || seen[common] < 3) return null;
    return (COUNTERS[common] || []).find((t) => UNIT_TYPES[t].era <= era) || null;
  }

  update(dt) {
    this.timer += dt / 1000;
    if (this.timer < 1) return;
    this.timer = 0;
    this.think();
  }

  think() {
    const w = this.world;
    const team = this.team;
    const tc = w.buildings.find((b) => b.team === team && b.type === 'town_centre');
    if (!tc) return; // defeated
    this.tc = tc;

    const units = w.units.filter((u) => u.team === team);
    const workers = units.filter((u) => u.type === 'worker');
    const army = units.filter((u) => u.isMilitary);
    const mine = w.buildings.filter((b) => b.team === team);
    const count = (type) => mine.filter((b) => b.type === type).length;
    const queued = mine.reduce((sum, b) => sum + b.queue.length, 0);
    const popUsed = w.popUsedOf(team);
    const popCap = w.popCapOf(team);
    const era = w.eraOf(team);

    // 0. Advance to the next era when it's time (and save food for it).
    const nextEra = ERAS[era + 1];
    const wantsEra = era < AI_SETTINGS.eraTimes.length - 1 && w.gameTime >= AI_SETTINGS.eraTimes[era + 1];
    const advancing = !!(tc.research && tc.research.kind === 'era');
    this.saving = wantsEra && !advancing ? nextEra.cost : null;
    if (wantsEra && !tc.research && w.canAfford(nextEra.cost, team)) w.startResearch(tc, 'era');

    // 1. Keep making workers.
    const workersQueued = tc.queue.filter((q) => q === 'worker').length;
    if (!tc.research && workers.length + workersQueued < this.cfg.maxWorkers && tc.queue.length < 2 && !this.saving) w.trainAt(tc, 'worker');

    // 2. Build: houses when nearly full, then barracks, farms, more barracks.
    const houseUnderway = mine.some((b) => b.type === 'house' && !b.complete);
    const farmUnderway = mine.some((b) => b.type === 'farm' && !b.complete);
    const berriesLeft = w.map.nearestResource('food', tc.tx + 1, tc.ty + 1, 10);
    // Wish list in priority order — the first one that can actually be placed gets built.
    const wishes = [];
    if (popCap < 200 && popCap - popUsed - queued <= 3 && !houseUnderway) wishes.push('house');
    if (count('barracks') === 0 && workers.length >= 7) wishes.push('barracks');
    if (!berriesLeft && !farmUnderway && count('farm') < Math.ceil(workers.length * AI_SETTINGS.gatherMix.food)) wishes.push('farm');
    if (era >= 1 && count('workshop') === 0) wishes.push('workshop');
    if (era >= 1 && count('power_plant') < 2 && !this.saving) wishes.push('power_plant');
    if (count('barracks') === 1 && w.gameTime > 600 && workers.length >= 14) wishes.push('barracks');
    if (count('tower') < 2 && w.gameTime > 420 && this.res.stone > 150 && !this.saving) wishes.push('tower');
    for (const type of wishes) if (this.build(type, workers)) break;

    // 3. Storage sheds next to far-away resources.
    this.storageTimer -= 1;
    if (Math.floor(w.gameTime) % 90 === 0) this.unreachable.clear(); // things change — check again sometimes
    if (this.storageTimer <= 0) {
      this.storageTimer = 45;
      this.buildStorageIfNeeded(workers, mine);
    }

    // 4. Put idle workers to work, and every so often move a worker to whatever is most needed.
    for (const u of workers) if (u.isIdle) this.assignWorker(u, workers);
    this.rebalanceTimer -= 1;
    if (this.rebalanceTimer <= 0) {
      this.rebalanceTimer = 8;
      this.rebalance(workers);
    }

    // 5. Train soldiers and archers (keep some food for workers early on).
    for (const b of mine) {
      if (b.type !== 'barracks' || !b.complete || b.queue.length >= 2) continue;
      let type = Math.random() < 0.55 ? 'soldier' : era >= 1 ? 'rifleman' : 'archer';
      if (era >= 2 && Math.random() < 0.3) type = 'armoured_car';
      if (Math.random() < this.cfg.counterChance) type = this.counterPick(era) || type;
      const reserve = (workers.length < 12 ? 60 : 0) + (this.saving ? this.saving.food || 0 : 0);
      if (this.res.food - reserve >= (UNIT_TYPES[type].cost.food || 0)) w.trainAt(b, type);
    }

    // 6. Upgrades when there's spare energy (not while saving for an era).
    if (!this.saving) {
      for (const id of AI_SETTINGS.research) {
        if (w.researchFor(team, id)) break;
      }
    }

    // 7. Defend the base.
    const intruder = w.findEnemyNear(tc.cx, tc.cy, 12 * TILE, team);
    if (intruder) {
      for (const u of army) {
        if (!this.assault.has(u) && (!u.order || u.order.kind !== 'attack')) u.orderAttack(intruder);
      }
    }

    // 8. Attack waves.
    for (const u of [...this.assault]) if (u.dead) this.assault.delete(u);
    if (w.gameTime >= this.nextWave) {
      const home = army.filter((u) => !this.assault.has(u));
      if (home.length >= this.waveSize) {
        // Send the wave (keep any extras at home to defend).
        home.slice(0, Math.ceil(this.waveSize * 1.5)).forEach((u) => this.assault.add(u));
        const sent = Math.min(home.length, Math.ceil(this.waveSize * 1.5));
        this.waveNum++;
        this.waveSize += this.cfg.waveGrowth;
        this.nextWave = w.gameTime + this.cfg.waveGap;
        w.toast(`Enemy attack wave ${this.waveNum} is on its way! (${sent} units)`, '#d9a39b');
      }
    }
    for (const u of this.assault) {
      if (u.isIdle) {
        const t = w.nearestEnemyTarget(u.x, u.y, team);
        if (t) u.orderAttack(t);
      }
    }
  }

  get res() {
    return this.world.teams[this.team].resources;
  }

  currentMix() {
    const mix = { ...AI_SETTINGS.gatherMix };
    // Don't keep piling up a resource there's already plenty of — or one we're saving for.
    const want = this.saving || {};
    for (const res of Object.keys(mix)) {
      const need = (want[res] || 0) + (want.energy && res === 'fuel' ? want.energy : 0);
      if (this.res[res] > 900 && this.res[res] > need) {
        mix.food += mix[res] - 0.03;
        mix[res] = 0.03;
      } else if (need > this.res[res]) {
        mix[res] += 0.15;
      }
    }
    return mix;
  }

  // Nearest resource tile that a worker can actually walk to.
  findTile(res) {
    const m = this.world.map;
    const start = m.perimeter(this.tc.tx, this.tc.ty, this.tc.w, this.tc.h)[0];
    if (!start) return null;
    let checked = 0;
    for (const t of m.resourceTilesNear(res, this.tc.tx + 1, this.tc.ty + 1, 45)) {
      const key = t.y * m.w + t.x;
      if (this.unreachable.has(key)) continue;
      const spot = m.standSpots(t.x, t.y, 1, 1, start)[0];
      if (spot && findPath(m, start.x, start.y, spot.x, spot.y)) return t;
      this.unreachable.add(key);
      if (++checked > 8) break;
    }
    return null;
  }

  // Move one worker from the most over-staffed resource to the most under-staffed one.
  rebalance(workers) {
    const mix = this.currentMix();
    const n = workers.length;
    if (n < 4) return;
    const counts = { food: 0, wood: 0, stone: 0, fuel: 0 };
    for (const x of workers) if (x.order && x.order.res) counts[x.order.res]++;
    const gap = (r) => counts[r] - mix[r] * n;
    const keys = Object.keys(mix);
    const over = keys.reduce((a, b) => (gap(a) > gap(b) ? a : b));
    const under = keys.reduce((a, b) => (gap(a) < gap(b) ? a : b));
    if (over === under || gap(under) > -1 || gap(over) <= 0) return;
    const tile = this.findTile(under);
    if (!tile) return;
    const mover = workers.find((x) => x.order && x.order.res === over && x.order.kind === 'gather' && !x.order.farm) ||
      workers.find((x) => x.order && x.order.res === over && x.order.kind === 'gather');
    if (mover) mover.orderGather(tile);
  }

  assignWorker(u, workers) {
    const w = this.world;
    const mix = this.currentMix();
    const counts = { food: 0, wood: 0, stone: 0, fuel: 0 };
    for (const x of workers) if (x.order && x.order.res) counts[x.order.res]++;
    const n = Math.max(1, workers.length);
    // Most-needed resource first.
    const order = Object.keys(mix).sort((a, b) => (counts[a] / n - mix[a]) - (counts[b] / n - mix[b]));
    for (const res of order) {
      if (res === 'food') {
        const farm = w.buildings.find((b) => b.team === this.team && b.type === 'farm' && b.complete && !b.farmer);
        if (farm) { u.orderFarm(farm); return; }
      }
      const t = this.findTile(res);
      if (t) {
        u.orderGather(t);
        if (u.order) return;
      }
    }
  }

  build(type, workers, near) {
    const w = this.world;
    const def = BUILDING_TYPES[type];
    if (def.era > w.eraOf(this.team) || !w.canAfford(def.cost, this.team)) return false;
    const centre = near || { x: this.tc.tx + 1, y: this.tc.ty + 1 };
    const spot = this.findSpot(def, centre, near ? 1 : type === 'farm' ? 3 : 4);
    if (!spot) return false;
    const b = w.placeBuilding(type, spot.x, spot.y, this.team);
    const free = workers.filter((u) => !(u.order && u.order.kind === 'build'));
    free.sort((a, c) => Math.hypot(a.x - b.cx, a.y - b.cy) - Math.hypot(c.x - b.cx, c.y - b.cy));
    free.slice(0, type === 'barracks' ? 3 : 2).forEach((u) => u.orderBuild(b));
    return true;
  }

  // Look in rings around a centre for a free spot (with a 1-tile gap so paths stay open).
  findSpot(def, centre, minR) {
    return this.searchSpot(def, centre, minR, 1) || this.searchSpot(def, centre, minR, 0);
  }

  searchSpot(def, centre, minR, gap) {
    const w = this.world;
    for (let r = minR; r < 26; r++) {
      const cands = [];
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          cands.push({ x: centre.x + dx - Math.floor(def.w / 2), y: centre.y + dy - Math.floor(def.h / 2) });
        }
      }
      cands.sort(() => Math.random() - 0.5);
      for (const c of cands) {
        if (w.map.canPlace(c.x - gap, c.y - gap, def.w + gap * 2, def.h + gap * 2) && !w.unitsInRect(c.x, c.y, def.w, def.h)) return c;
      }
    }
    return null;
  }

  buildStorageIfNeeded(workers, mine) {
    const w = this.world;
    if (mine.some((b) => b.type === 'storage' && !b.complete) || mine.filter((b) => b.type === 'storage').length >= 4) return;
    for (const res of ['wood', 'fuel', 'stone']) {
      const t = w.map.nearestResource(res, this.tc.tx + 1, this.tc.ty + 1, 30);
      if (!t) continue;
      const drop = w.nearestDropOff(t.x * TILE, t.y * TILE, this.team);
      const far = !drop || Math.hypot(drop.cx - t.x * TILE, drop.cy - t.y * TILE) > 9 * TILE;
      if (far && this.build('storage', workers, t)) return;
    }
  }
}
