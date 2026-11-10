// The climate: CO₂ in the air, global temperature, and the disasters that get worse as it heats up.
import { TILE, TERRAIN, CLIMATE } from './config.js';
import { toIso } from './iso.js';

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
    this.heatwave = 0;        // seconds of heatwave left (everyone works slower)
    this.seaStage = 0;
    this.warnedStage = -1;
    this.secondTimer = 0;
    this.disasterTimer = 0;
    this.emittedTotal = 0;
    this.fireGfx = world.add.graphics().setDepth(2);
    this.fireGlow = world.add.graphics().setDepth(3);
    if (this.fireGlow.setBlendMode && typeof Phaser !== 'undefined' && Phaser.BlendModes) this.fireGlow.setBlendMode(Phaser.BlendModes.ADD);
  }

  // Temperature the planet is heading towards for the current CO₂.
  get targetTemp() {
    return CLIMATE.sensitivity * Math.log2(this.co2 / CLIMATE.baseCO2);
  }

  addCO2(ppm) {
    // With more than two sides there's more pollution to go round, so each side's share counts a bit less
    // (four sides warm the planet about 40% faster than two, instead of twice as fast).
    if (ppm > 0) ppm *= Math.sqrt(2 / Math.max(2, this.world.teamIds.length));
    this.co2 = Math.max(CLIMATE.baseCO2, this.co2 + ppm);
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
      if (this.drought === 0) {
        this.world.toast('🌧️ The rain is back — the drought is over', '#9fc5e8');
        this.world.rainTime = Math.max(this.world.rainTime || 0, 8);
      }
    }

    if (this.heatwave > 0) {
      this.heatwave = Math.max(0, this.heatwave - s);
      if (this.heatwave === 0) this.world.toast('🌤️ The heatwave has broken', '#9fc5e8');
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
    const teams = this.world.teams || {};
    const boost = Object.values(teams).some((t) => t.upgrades.has('reforestation')) ? 2 : 1;
    this.co2 -= Math.min(excess, this.forestTiles * CLIMATE.forestAbsorb * boost);
    this.updateFires();
    this.updateAsh();
  }

  // ---------- Disasters ----------
  rollDisasters() {
    const T = Math.max(0, this.temp);
    const r = () => this.world.rand();
    if (r() < Math.min(0.5, 0.02 + 0.08 * T)) this.startWildfire();
    if (T > 1 && this.drought <= 0 && r() < 0.07 * T) this.startDrought();
    if (T > 1.5 && r() < 0.05 * (T - 1)) this.startStorm();
    if (T > 1.3 && this.heatwave <= 0 && r() < 0.05 * T) this.startHeatwave();
  }

  // ----- Wildfires -----
  startWildfire() {
    const tile = this.pickFireTile();
    if (!tile) return;
    // Hotter planet = bigger fires.
    this.fireBudget += Math.round(10 + 12 * Math.max(0, this.temp));
    this.ignite(tile.x, tile.y, true);
    if (this.world.sfx) this.world.sfx('whoosh', tile.x * TILE + 16, tile.y * TILE + 16);
    this.world.toast('🔥 Wildfire! A forest is burning', '#ff8a50');
    this.world.events.emit('alert', tile.x, tile.y);
  }

  // Whose town a fire or storm lands near. Against the computer it's always yours; online it's either.
  victimTeam() {
    const w = this.world;
    if (!w.mp && w.teamIds.length === 2) return w.me;
    const live = w.liveTeams();
    return live[Math.floor(w.rand() * live.length)] || w.me;
  }

  pickFireTile() {
    // Usually near someone's town, so they see it. (Online, either town.)
    const bs = this.world.buildings.filter((b) => b.team === this.victimTeam());
    if (bs.length && this.world.rand() < 0.75) {
      const b = bs[Math.floor(this.world.rand() * bs.length)];
      const near = this.map.resourceTilesNear('wood', b.tx, b.ty, 14);
      if (near.length) return near[Math.floor(this.world.rand() * near.length)];
    }
    for (let i = 0; i < 300; i++) {
      const x = Math.floor(this.world.rand() * this.map.w);
      const y = Math.floor(this.world.rand() * this.map.h);
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
    this.fires.set(k, { x, y, t: 4 + this.world.rand() * 2 });
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
        if ((nt === TERRAIN.FOREST || nt === TERRAIN.BERRIES) && this.world.rand() < spread * (dx && dy ? 0.6 : 1)) {
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
          this.ash.set(k, { x: f.x, y: f.y, t: 90 + this.world.rand() * 60 });
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
    const glow = this.fireGlow;
    g.clear();
    glow.clear();
    if (!this.fires.size) return;
    const now = this.world.time.now;
    for (const f of this.fires.values()) {
      const iso = toIso(f.x * TILE + TILE / 2, f.y * TILE + TILE / 2);
      const cx = iso.x;
      const cy = iso.y - 4;
      // smoke drifting up
      for (let k = 0; k < 2; k++) {
        const life = ((now / 1600 + f.x * 0.37 + f.y * 0.61 + k * 0.5) % 1);
        g.fillStyle(0x2b2724, 0.35 * (1 - life)).fillCircle(cx + 6 + life * 14, cy - 8 - life * 40, 5 + life * 10);
      }
      // scorched base + flickering flame tongues (additive glow)
      g.fillStyle(0x140d08, 0.4).fillEllipse(cx, cy + 6, 26, 9);
      const flick = (a, k) => Math.sin(now / a + f.x * 3.1 + f.y * 1.7 + k * 2.3);
      glow.fillStyle(0xff5a14, 0.08).fillCircle(cx, cy, 22 + flick(150, 0) * 3);
      for (let k = 0; k < 5; k++) {
        const bx = cx - 10 + k * 5 + flick(120, k) * 1.5;
        const h = 9 + (k % 2 ? 6 : 3) + flick(70 + k * 13, k) * 4;
        const lean = flick(200, k) * 2;
        glow.fillStyle(0xb8360c, 0.55).fillTriangle(bx - 3.5, cy + 5, bx + 3.5, cy + 5, bx + lean, cy + 5 - h);
        glow.fillStyle(0xe8891c, 0.45).fillTriangle(bx - 2, cy + 5, bx + 2, cy + 5, bx + lean * 0.6, cy + 5 - h * 0.6);
      }
      // embers
      for (let k = 0; k < 2; k++) {
        const life = ((now / 900 + f.x * 0.53 + f.y * 0.29 + k * 0.5) % 1);
        glow.fillStyle(0xffb04a, 0.8 * (1 - life)).fillRect(cx - 6 + k * 10 + flick(90, k) * 3, cy - life * 26, 1.5, 1.5);
      }
    }
  }

  // ----- Drought -----
  startDrought() {
    this.drought = 60 + 20 * this.temp;
    this.world.toast('☀️ Drought! Farms and berry bushes give half as much food', '#ffb74d');
  }

  // ----- Heatwave -----
  startHeatwave() {
    this.heatwave = 40 + 12 * this.temp;
    const shielded = this.world.teams && this.world.teams.player.upgrades.has('cool_roofs');
    this.world.toast(shielded ? '🌡️ Heatwave! Your Cool Roofs keep your workers going.'
      : '🌡️ Heatwave! Everyone works 30% slower until it breaks (research Cool Roofs)', '#ffb74d');
  }

  // ----- Storms -----
  startStorm() {
    const team = this.victimTeam();
    const bs = this.world.buildings.filter((b) => b.team === team);
    if (!bs.length) return;
    const centre = bs[Math.floor(this.world.rand() * bs.length)];
    const radius = 5 * TILE;
    const hit = bs.filter((b) => Math.hypot(b.cx - centre.cx, b.cy - centre.cy) <= radius);
    this.world.toast(`🌪️ A severe storm hit ${team === this.world.me ? 'your' : `${this.world.teamName(team)}'s`} town! ${hit.length} building${hit.length === 1 ? '' : 's'} damaged`, '#9fc5e8');
    this.world.stormEffect(centre.cx, centre.cy, radius);
    if (this.world.sfx) this.world.sfx('thunder');
    for (const b of hit) this.world.damageBuilding(b, Math.round(b.maxHp * (0.25 + this.world.rand() * 0.2)), 'a storm');
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
      if (b.team === w.me) w.toast(`🌊 Your ${b.def.name} was swallowed by the sea`, '#9fc5e8');
      w.removeBuilding(b);
    }
    // Redraw flooded tiles and their neighbours (for the new beaches).
    for (const t of flooded) w.redrawTile(t.x, t.y); // each redraw also repaints neighbours
    for (const u of w.units) u.rescue();
    w.toast(`🌊 Sea levels rose! ${flooded.length} tiles of coastline are now underwater`, '#9fc5e8');
    if (w.sfx) w.sfx('wave');
    w.events.emit('seaRise', flooded.length);
  }
}
