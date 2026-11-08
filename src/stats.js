// Match statistics: what each side gathered, built, trained and lost, plus a timeline
// of the climate and army sizes for the end-of-game charts.

const SAMPLE_EVERY = 15; // seconds of game time between timeline samples

function blankTeam() {
  return {
    gathered: { food: 0, wood: 0, stone: 0, fuel: 0, clean: 0 },
    trained: 0,
    lost: 0,
    kills: 0,
    built: 0,
    buildingsLost: 0,
    razed: 0,
    co2: 0,
  };
}

export class Stats {
  constructor(saved) {
    this.teams = { player: blankTeam(), enemy: blankTeam() };
    this.timeline = [];
    this.sampleTimer = 0;
    if (saved) {
      for (const k of ['player', 'enemy']) Object.assign(this.teams[k], saved.teams[k], { gathered: { ...blankTeam().gathered, ...saved.teams[k].gathered } });
      this.timeline = saved.timeline || [];
    }
  }

  gather(team, res, n) {
    const t = this.teams[team];
    if (t && n > 0 && res in t.gathered) t.gathered[res] += n;
  }

  emit(team, ppm) { if (this.teams[team]) this.teams[team].co2 += ppm; }
  trained(team) { if (this.teams[team]) this.teams[team].trained++; }
  built(team) { if (this.teams[team]) this.teams[team].built++; }

  unitDied(u, killer) {
    if (this.teams[u.team]) this.teams[u.team].lost++;
    if (killer && this.teams[killer] && killer !== u.team) this.teams[killer].kills++;
  }

  buildingDied(b, killer) {
    if (this.teams[b.team]) this.teams[b.team].buildingsLost++;
    if (killer && this.teams[killer] && killer !== b.team) this.teams[killer].razed++;
  }

  update(dt, world) {
    this.sampleTimer -= dt / 1000;
    if (this.sampleTimer > 0) return;
    this.sampleTimer = SAMPLE_EVERY;
    this.sample(world);
  }

  sample(world) {
    const count = (team, fn) => world.units.filter((u) => u.team === team && fn(u)).length;
    this.timeline.push({
      t: Math.round(world.gameTime),
      co2: Math.round(world.climate.co2),
      temp: Math.round(world.climate.temp * 100) / 100,
      pop: { player: count('player', () => true), enemy: count('enemy', () => true) },
      army: { player: count('player', (u) => u.isMilitary), enemy: count('enemy', (u) => u.isMilitary) },
    });
    // Long games: keep every other sample once there are a lot of them.
    if (this.timeline.length > 400) this.timeline = this.timeline.filter((_, i) => i % 2 === 0 || i === this.timeline.length - 1);
  }

  serialize() {
    return { teams: this.teams, timeline: this.timeline };
  }
}
