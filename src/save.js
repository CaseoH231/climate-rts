// Saving and loading games. Saves live in the browser's local storage (3 slots).

export const SAVE_SLOTS = [1, 2, 3];
const key = (slot) => `climate-rts-save-${slot}`;

function storage() {
  try {
    return window.localStorage;
  } catch (e) {
    return null;
  }
}

// Short info about each slot for the save/load menus.
// Version 10 added the Modern Age as era 2, so older saves in era 2+ move up one.
const SAVE_VERSION = 10;
function migrate(d) {
  if (!d || (d.version || 0) >= SAVE_VERSION) return d;
  for (const t of Object.values(d.teams || {})) if (t.era >= 2) t.era += 1;
  d.version = SAVE_VERSION;
  return d;
}

export function listSaves() {
  const ls = storage();
  return SAVE_SLOTS.map((slot) => {
    try {
      const raw = ls && ls.getItem(key(slot));
      if (!raw) return { slot, empty: true };
      const d = migrate(JSON.parse(raw));
      return { slot, empty: false, savedAt: d.savedAt, gameTime: d.gameTime, era: d.teams.player.era, difficulty: d.difficulty };
    } catch (e) {
      return { slot, empty: true };
    }
  });
}

export function readSave(slot) {
  const ls = storage();
  const raw = ls && ls.getItem(key(slot));
  return raw ? migrate(JSON.parse(raw)) : null;
}

export function writeSave(slot, world) {
  const ls = storage();
  if (!ls) return false;
  try {
    ls.setItem(key(slot), JSON.stringify(serialize(world)));
    return true;
  } catch (e) {
    return false;
  }
}

// Turn the whole game into plain data.
export function serialize(w) {
  const bIndex = new Map(w.buildings.map((b, i) => [b, i]));
  const uIndex = new Map(w.units.map((u, i) => [u, i]));
  const ref = (t) => (!t || t.dead ? null : t.isBuilding ? { b: bIndex.get(t) } : { u: uIndex.get(t) });
  const orderOut = (o) => {
    if (!o) return null;
    if (o.kind === 'garrison') return { kind: 'garrison', building: bIndex.get(o.building), prev: orderOut(o.prev) };
    if (o.kind === 'gather') return { kind: 'gather', res: o.res, tx: o.tx, ty: o.ty, farm: o.farm ? bIndex.get(o.farm) : null };
    if (o.kind === 'build') return { kind: 'build', building: bIndex.get(o.building) };
    if (o.kind === 'attack') return { kind: 'attack', target: ref(o.target), resume: o.resume || null };
    if (o.kind === 'amove') return { kind: 'amove', dest: o.dest };
    return null;
  };
  const c = w.climate;
  const cam = w.cameras.main;
  return {
    version: 1,
    savedAt: Date.now(),
    version: SAVE_VERSION,
    seed: w.map.seed,
    difficulty: w.difficulty,
    mapType: w.mapType,
    market: { ...w.market },
    gameTime: w.gameTime,
    map: {
      tiles: Array.from(w.map.tiles),
      amount: Array.from(w.map.amount, (v) => Math.round(v * 10) / 10),
      elev: Array.from(w.map.elev, (v) => Math.round(v * 1000) / 1000),
      seaLevel: w.map.seaLevel,
    },
    teams: Object.fromEntries(Object.entries(w.teams).map(([k, t]) => [k, {
      resources: { ...t.resources }, upgrades: [...t.upgrades], era: t.era,
    }])),
    buildings: w.buildings.map((b) => ({
      type: b.type, team: b.team, tx: b.tx, ty: b.ty, progress: b.progress, hp: b.hp,
      queue: [...b.queue], trainTimer: b.trainTimer, research: b.research ? { ...b.research } : null,
      food: b.food, grow: b.grow, wonderTime: b.wonderTime, rally: b.rally,
      garrison: b.garrison.map((u) => ({ type: u.type, hp: u.hp, prev: orderOut(u.prevOrder) })),
    })),
    units: w.units.map((u) => ({
      type: u.type, team: u.team, x: u.px, y: u.py, hp: u.hp, carry: u.carry, carryType: u.carryType, order: orderOut(u.order),
    })),
    climate: {
      co2: c.co2, temp: c.temp, drought: c.drought, heatwave: c.heatwave, seaStage: c.seaStage, warnedStage: c.warnedStage,
      fireBudget: c.fireBudget, disasterTimer: c.disasterTimer, emittedTotal: c.emittedTotal,
      fires: [...c.fires.values()].map((f) => ({ x: f.x, y: f.y, t: f.t })),
      ash: [...c.ash.values()].map((a) => ({ x: a.x, y: a.y, t: a.t })),
    },
    ai: {
      nextWave: w.ai.nextWave, waveSize: w.ai.waveSize, waveNum: w.ai.waveNum,
      assault: [...w.ai.assault].map((u) => uIndex.get(u)).filter((i) => i !== undefined),
    },
    stats: w.stats ? w.stats.serialize() : null,
    wildlife: w.wildlife ? w.wildlife.serialize() : [],
    groups: (w.groups || []).map((g) => g.map((u) => uIndex.get(u)).filter((i) => i !== undefined)),
    camera: { x: cam.midPoint.x, y: cam.midPoint.y, zoom: cam.zoom },
    fog: w.fog ? w.fog.serialize() : null,
  };
}
