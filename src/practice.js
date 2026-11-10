// Freeplay: practise on your own and build the best economy you can.
// Tracks gather rates and milestones (with your personal bests, kept in this browser).
// Nothing here changes the game itself — it only watches, so replays stay in sync.
import { ERAS } from './buildings.js';

const PB_KEY = 'age-of-emissions-practice';
const SAMPLE_EVERY = 5;  // seconds of game time between rate samples
const RATE_WINDOW = 60;  // gather rates are averaged over the last minute

export const RES_KEYS = ['food', 'wood', 'stone', 'fuel', 'clean'];

// Milestones, in the order they usually happen.
export const MILESTONES = [
  ...[10, 20, 30, 50, 75].map((n) => ({ id: `w${n}`, kind: 'workers', n, name: `${n} workers` })),
  ...[1, 2, 3, 4].map((e) => ({ id: `e${e}`, kind: 'era', n: e, name: ERAS[e].name })),
  ...[1000, 5000, 10000, 25000, 50000].map((n) => ({ id: `g${n}`, kind: 'gathered', n, name: `${n.toLocaleString('en')} gathered` })),
];

function readBests() {
  try { return JSON.parse(localStorage.getItem(PB_KEY) || '{}') || {}; } catch (e) { return {}; }
}
function writeBests(b) {
  try { localStorage.setItem(PB_KEY, JSON.stringify(b)); } catch (e) { /* ignore */ }
}

export function fmtClock(s) {
  s = Math.max(0, Math.round(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class Practice {
  constructor(world, saved = null) {
    this.world = world;
    // personal bests are kept per starting set-up (resources + starting age), so they're comparable
    this.pbKey = `${world.rules.resources}|${world.rules.era}`;
    this.reached = (saved && saved.reached) || {}; // milestone id → game time
    this.samples = [];
    this.timer = 0;
    this.newBests = (saved && saved.newBests) || 0;
    this.peakWorkers = (saved && saved.peakWorkers) || 0;
    const all = readBests();
    this.bests = { ...(all[this.pbKey] || {}) }; // as they were when this game started
  }

  serialize() {
    return { reached: this.reached, newBests: this.newBests, peakWorkers: this.peakWorkers };
  }

  totalGathered() {
    const g = this.world.stats.teams[this.world.self].gathered;
    return RES_KEYS.reduce((s, k) => s + g[k], 0);
  }

  workers() {
    const team = this.world.self;
    const ws = this.world.units.filter((u) => u.team === team && u.type === 'worker');
    return { n: ws.length, idle: ws.filter((u) => u.isIdle).length };
  }

  // Resources gathered per minute over the last minute (or since the start, early on).
  rates() {
    const s = this.samples;
    const out = Object.fromEntries(RES_KEYS.map((k) => [k, 0]));
    if (s.length < 2) return out;
    const last = s[s.length - 1];
    let first = s[0];
    for (const x of s) if (last.t - x.t <= RATE_WINDOW) { first = x; break; }
    const dt = (last.t - first.t) / 60;
    if (dt <= 0) return out;
    for (const k of RES_KEYS) out[k] = (last.g[k] - first.g[k]) / dt;
    return out;
  }

  update(dt) {
    this.timer += dt / 1000;
    if (this.timer < 1) return;
    this.timer = 0;
    const w = this.world;
    if (w.gameOver) return;
    const t = w.gameTime;
    if (!this.samples.length || t - this.samples[this.samples.length - 1].t >= SAMPLE_EVERY) {
      this.samples.push({ t, g: { ...w.stats.teams[w.self].gathered } });
      while (this.samples.length > 2 && t - this.samples[1].t > RATE_WINDOW) this.samples.shift();
    }
    const { n } = this.workers();
    this.peakWorkers = Math.max(this.peakWorkers, n);
    const value = { workers: this.peakWorkers, era: w.eraOf(w.self), gathered: this.totalGathered() };
    for (const m of MILESTONES) {
      if (this.reached[m.id] != null || value[m.kind] < m.n) continue;
      this.reached[m.id] = t;
      const best = this.bests[m.id];
      let note = '';
      if (best == null) note = '  —  first time!';
      else if (t < best) note = `  —  new best! (was ${fmtClock(best)})`;
      else note = `  (best ${fmtClock(best)})`;
      if (!w.replay) {
        if (best == null || t < best) {
          this.newBests++;
          const all = readBests();
          all[this.pbKey] = { ...(all[this.pbKey] || {}), [m.id]: Math.round(t) };
          writeBests(all);
        }
        w.toast(`🏁 ${m.name} at ${fmtClock(t)}${note}`, best == null || t < best ? '#f0d878' : '#d8c9a0');
      }
      w.events.emit('practice');
    }
  }

  // The next few milestones still to reach, with your best time for each.
  upcoming(count = 3) {
    return MILESTONES.filter((m) => this.reached[m.id] == null).slice(0, count)
      .map((m) => ({ ...m, best: this.bests[m.id] }));
  }

  summary() {
    const w = this.world;
    const total = Math.round(this.totalGathered());
    const reached = Object.keys(this.reached).length;
    return `Gathered ${total.toLocaleString('en')} in ${fmtClock(w.gameTime)}  ·  up to ${this.peakWorkers} workers  ·  ` +
      `${ERAS[w.eraOf(w.self)].name}  ·  ${reached} milestone${reached === 1 ? '' : 's'}` +
      (this.newBests ? `, ${this.newBests} new best${this.newBests === 1 ? '' : 's'}` : '');
  }
}
