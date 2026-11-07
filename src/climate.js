// The climate: CO₂ in the air, global temperature, and the disasters that get worse as it heats up.
import { TILE, TERRAIN, CLIMATE } from './config.js';

const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];

export class Climate {
  constructor(world) {
    this.world = world;
    this.map = world.map;
    this.co2 = CLIMATE.baseCO2;
    this.temp = 0;
    this.forestTiles = this.map.countTiles(TERRAIN.FOREST);
    this.fires = new Map();   // burning tiles
    this.fireBudget = 0;      // how many more tiles the current wildfires may spread to
    this.ash = new Map();     // burnt tiles waiting to regrow
    this.drought = 0;         // seconds of drought left
    this.seaStage = 0;
    this.warnedStage = -1;
    this.secondTimer = 0;
    this.disasterTimer = 0;
    this.emittedTotal = 0;
    this.fireGfx = world.add.graphics().setDepth(5e5);
  }

  // Temperature the planet is heading towards for the current CO₂.
  get targetTemp() {
    return CLIMATE.sensitivity * Math.log2(this.co2 / CLIMATE.baseCO2);
  }

  addCO2(ppm) {
    this.co2 += ppm;
    if (ppm > 0) this.emittedTotal += ppm;
  }

  update(dt) {
    const s = dt / 1000;
    this.temp += (this.targetTemp - this.temp) * Math.min(1, s / CLIMATE.tempLag);

    this.secondTimer += s;
    if (this.secondTimer >= 1) {
      this.secondTimer -= 1;
      this.tickSecond();
    }

    if (this.drought > 0) {
      this.drought = Math.max(0, this.drought - s);
      if (this.drought === 0) this.world.toast('🌧️ The rain is back — the drought is over', '#9fc5e8');
    }

    this.disasterTimer += s;
    if (this.disasterTimer >= CLIMATE.disasterCheck) {
      this.disasterTimer = 0;
      this.rollDisasters();
    }

    this.checkSea();
    this.drawFires();
  }

  // Things that happen once a second.
  tickSecond() {
    this.forestTiles = this.map.countTiles(TERRAIN.FOREST);
    const excess = Math.max(0, this.co2 - CLIMATE.baseCO2);
    this.co2 -= Math.min(excess, this.forestTiles * CLIMATE.forestAbsorb);
    this.updateFires();
    this.updateAsh();
  }

  // ---------- Disasters ----------
  rollDisasters() {
    const T = Math.max(0, this.temp);
    const r = Math.random;
    if (r() < Math.min(0.5, 0.02 + 0.08 * T)) this.startWildfire();
    if (T > 1 && this.drought <= 0 && r() < 0.07 * T) this.startDrought();
    if (T > 1.5 && r() < 0.05 * (T - 1)) this.startStorm();
  }

  // ----- Wildfires -----
  startWildfire() {
    const tile = this.pickFireTile();
    if (!tile) return;
    // Hotter planet = bigger fires.
    this.fireBudget += Math.round(10 + 12 * Math.max(0, this.temp));
    this.ignite(tile.x, tile.y, true);
    this.world.toast('🔥 Wildfire! A forest is burning', '#ff8a50');
    this.world.events.emit('alert', tile.x, tile.y);
  }

  pickFireTile() {
    // Usually near the player's town, so they see it.
    const bs = this.world.buildings.filter((b) => b.team === 'player');
    if (bs.length && Math.random() < 0.75) {
      const b = bs[Math.floor(Math.random() * bs.length)];
      const near = this.map.resourceTilesNear('wood', b.tx, b.ty, 14);
      if (near.length) return near[Math.floor(Math.random() * near.length)];
    }
    for (let i = 0; i < 300; i++) {
      const x = Math.floor(Math.random() * this.map.w);
      const y = Math.floor(Math.random() * this.map.h);
      if (this.map.get(x, y) === TERRAIN.FOREST) return { x, y };
    }
    return null;
  }

  ignite(x, y, first = false) {
    const t = this.map.get(x, y);
    if (t !== TERRAIN.FOREST && t !== TERRAIN.BERRIES) return;
    const k = y * this.map.w + x;
    if (this.fires.has(k) || (!first && this.fireBudget <= 0)) return;
    if (!first) this.fireBudget--;
    this.fires.set(k, { x, y, t: 4 + Math.random() * 2 });
  }

  updateFires() {
    if (!this.fires.size) return;
    const spread = 0.12 + 0.03 * Math.max(0, this.temp) + (this.drought > 0 ? 0.08 : 0);
    const toIgnite = [];
    const scorched = new Set();
    for (const [k, f] of this.fires) {
      f.t -= 1;
      for (const [dx, dy] of N8) {
        const nx = f.x + dx;
        const ny = f.y + dy;
        const nt = this.map.get(nx, ny);
        if ((nt === TERRAIN.FOREST || nt === TERRAIN.BERRIES) && Math.random() < spread * (dx && dy ? 0.6 : 1)) {
          toIgnite.push([nx, ny]);
        }
        const b = this.map.buildingAt(nx, ny);
        if (b) scorched.add(b);
      }
      if (f.t <= 0 || this.map.get(f.x, f.y) !== TERRAIN.FOREST && this.map.get(f.x, f.y) !== TERRAIN.BERRIES) {
        this.fires.delete(k);
        if (this.map.resourceAt(f.x, f.y)) {
          this.map.setTerrain(f.x, f.y, TERRAIN.ASH);
          this.addCO2(CLIMATE.co2PerBurntTile);
          this.ash.set(k, { x: f.x, y: f.y, t: 90 + Math.random() * 60 });
        }
      }
    }
    for (const [x, y] of toIgnite) if (this.fires.size < 90) this.ignite(x, y);
    for (const b of scorched) this.world.damageBuilding(b, 15, 'fire');
    if (!this.fires.size) {
      this.fireBudget = 0;
      this.world.toast('The wildfire has burnt out', '#c9c6ad');
    }
  }

  updateAsh() {
    for (const [k, a] of this.ash) {
      a.t -= 1;
      if (a.t <= 0) {
        this.ash.delete(k);
        if (this.map.get(a.x, a.y) === TERRAIN.ASH) this.map.setTerrain(a.x, a.y, TERRAIN.GRASS);
      }
    }
  }

  drawFires() {
    const g = this.fireGfx;
    g.clear();
    if (!this.fires.size) return;
    const now = this.world.time.now;
    for (const f of this.fires.values()) {
      const cx = f.x * TILE + TILE / 2;
      const cy = f.y * TILE + TILE / 2;
      const w1 = Math.sin(now / 90 + f.x * 3 + f.y) * 2;
      const w2 = Math.cos(now / 70 + f.x + f.y * 5) * 2;
      g.fillStyle(0x333333, 0.25).fillCircle(cx + 4 + w2, cy - 16 - (now / 40 + f.x * 7) % 10, 8);
      g.fillStyle(0xd84315, 0.85).fillCircle(cx + w1, cy + 2, 11 + w2);
      g.fillStyle(0xff9800, 0.9).fillCircle(cx - w2, cy - 2, 7 + w1);
      g.fillStyle(0xffeb3b, 0.9).fillCircle(cx + w1 * 0.5, cy - 5, 3 + w2 * 0.5);
    }
  }

  // ----- Drought -----
  startDrought() {
    this.drought = 60 + 20 * this.temp;
    this.world.toast('☀️ Drought! Farms and berry bushes give half as much food', '#ffb74d');
  }

  // ----- Storms -----
  startStorm() {
    const bs = this.world.buildings.filter((b) => b.team === 'player');
    if (!bs.length) return;
    const centre = bs[Math.floor(Math.random() * bs.length)];
    const radius = 5 * TILE;
    const hit = bs.filter((b) => Math.hypot(b.cx - centre.cx, b.cy - centre.cy) <= radius);
    this.world.toast(`🌪️ A severe storm hit your town! ${hit.length} building${hit.length === 1 ? '' : 's'} damaged`, '#9fc5e8');
    this.world.stormEffect(centre.cx, centre.cy, radius);
    for (const b of hit) this.world.damageBuilding(b, Math.round(b.maxHp * (0.25 + Math.random() * 0.2)), 'a storm');
  }

  // ----- Sea-level rise -----
  checkSea() {
    const steps = CLIMATE.seaSteps;
    if (this.seaStage >= steps.length) return;
    const next = steps[this.seaStage];
    if (this.temp >= next - 0.3 && this.warnedStage < this.seaStage) {
      this.warnedStage = this.seaStage;
      this.world.toast('🌊 Warning: sea levels are about to rise — move away from the coast!', '#9fc5e8');
    }
    if (this.temp >= next) {
      this.seaStage++;
      this.floodCoast();
    }
  }

  floodCoast() {
    const flooded = this.map.raiseSea(CLIMATE.seaRise);
    const w = this.world;
    // Buildings standing on flooded land are lost.
    const lost = new Set();
    for (const t of flooded) {
      const b = this.map.buildingAt(t.x, t.y);
      if (b) lost.add(b);
      const k = t.y * this.map.w + t.x;
      this.fires.delete(k);
      this.ash.delete(k);
    }
    for (const b of lost) {
      w.toast(`🌊 Your ${b.def.name} was swallowed by the sea`, '#9fc5e8');
      w.removeBuilding(b);
    }
    // Redraw flooded tiles and their neighbours (for the new beaches).
    const redraw = new Set();
    for (const t of flooded) {
      for (const [dx, dy] of [[0, 0], ...N8]) {
        if (this.map.inBounds(t.x + dx, t.y + dy)) redraw.add((t.y + dy) * this.map.w + t.x + dx);
      }
    }
    for (const k of redraw) w.redrawTile(k % this.map.w, Math.floor(k / this.map.w));
    for (const u of w.units) u.rescue();
    w.toast(`🌊 Sea levels rose! ${flooded.length} tiles of coastline are now underwater`, '#9fc5e8');
    w.events.emit('seaRise', flooded.length);
  }
}
