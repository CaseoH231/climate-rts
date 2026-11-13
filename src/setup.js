// Who is in a game, set up like the Age of Empires II lobby: four seats (Blue, Red, Green, Yellow), each
// one empty ("closed"), a person, or a computer player (ai = 'easy' | 'normal' | 'hard'), and each on a
// team: 1–4, or 0 ("–") for nobody's ally. Sides with the same team number are allies.
//
// A game's `setup` is { mode, teams: [{ id, alliance, ai, name, you? }] } with one entry per side in it.
import { TEAM_IDS, TEAM_NAMES } from './config.js';

// Seat kinds: 'you' (this computer's player, playing alone), 'human' / 'open' (online), 'ai', 'closed'.
const S = (kind, team, ai) => ({ kind, team, ai });

// Quick set-ups, like AoE2's. Seats are Blue, Red, Green, Yellow; you sit in Blue.
export const PRESETS = {
  '1v1':     { name: '1 v 1',     desc: 'You against one computer opponent.', seats: [S('you', 1), S('ai', 2), S('closed', 0), S('closed', 0)] },
  '1v2':     { name: '1 v 2',     desc: 'You alone against two computer players on one team. A real challenge.', seats: [S('you', 1), S('ai', 2), S('ai', 2), S('closed', 0)] },
  '1v3':     { name: '1 v 3',     desc: 'You alone against three computer players working together. Very hard.', seats: [S('you', 1), S('ai', 2), S('ai', 2), S('ai', 2)] },
  '2v1':     { name: '2 v 1',     desc: 'You and a computer ally against one computer opponent. A gentle start.', seats: [S('you', 1), S('ai', 2), S('ai', 1), S('closed', 0)] },
  '2v2':     { name: '2 v 2',     desc: 'You and a computer ally against two computer opponents.', seats: [S('you', 1), S('ai', 2), S('ai', 1), S('ai', 2)] },
  '3v1':     { name: '3 v 1',     desc: 'You and two computer allies gang up on one computer opponent.', seats: [S('you', 1), S('ai', 2), S('ai', 1), S('ai', 1)] },
  'ffa3':    { name: '1v1v1',     desc: 'Three sides, everyone for themselves. Last town standing wins.', seats: [S('you', 0), S('ai', 0), S('ai', 0), S('closed', 0)] },
  'ffa4':    { name: '1v1v1v1',   desc: 'Four sides, one in each corner, everyone for themselves. Last town standing wins.', seats: [S('you', 0), S('ai', 0), S('ai', 0), S('ai', 0)] },
  'free':    { name: 'Freeplay',  desc: 'Just you, no enemies: practise building the best economy you can, and beat your best times.', seats: [S('you', 1), S('closed', 0), S('closed', 0), S('closed', 0)] },
};
// (older saves and replays used these names)
export const MODES = PRESETS;

// Copy a preset's seats, with every computer player at `difficulty`.
export function presetSeats(name, difficulty = 'normal') {
  const p = PRESETS[name] || PRESETS['1v1'];
  return p.seats.map((s) => ({ ...s, ai: s.kind === 'ai' ? difficulty : undefined }));
}

// Seat i's alliance: its team number, or a team of its own for "–".
export function allianceOf(team, i) {
  return team > 0 ? team - 1 : 10 + i;
}

// Seats → setup.
export function seatsSetup(seats, mode = 'custom') {
  const teams = [];
  seats.forEach((s, i) => {
    if (!s || s.kind === 'closed' || s.kind === 'open') return;
    const id = TEAM_IDS[i];
    const team = Number.isInteger(s.team) ? s.team : Number.isInteger(s.alliance) ? s.alliance + 1 : i + 1;
    teams.push({
      id,
      alliance: allianceOf(team, i),
      ai: s.kind === 'ai' ? s.ai || 'normal' : null,
      name: s.kind === 'ai' ? `${TEAM_NAMES[id]} (computer)` : s.kind === 'you' ? 'You' : s.name || TEAM_NAMES[id],
      you: s.kind === 'you' || undefined,
      civ: s.civ || 'random', // (settled at the start of the game: see civs.js resolveCiv)
    });
  });
  // on your own, it's a practice game
  if (teams.length === 1 && teams[0].you) mode = 'freeplay';
  return { mode, teams };
}

export function soloSetup(mode = '1v1', difficulty = 'normal') {
  return seatsSetup(presetSeats(mode, difficulty), mode);
}

// Online: the lobby's seats (kind 'human' | 'ai' | 'closed') → setup.
export function setupFromSlots(slots) {
  return seatsSetup(slots, 'online');
}

// What's wrong with a set of seats (or null if it can be played).
// (playing alone is fine on this computer — that's Freeplay — but not online)
export function seatsProblem(seats, allowSolo = true) {
  const used = seats.map((s, i) => [s, i]).filter(([s]) => s && s.kind !== 'closed');
  if (allowSolo && used.length === 1 && used[0][0].kind === 'you') return null;
  if (used.length < 2) return 'You need at least two sides.';
  if (new Set(used.map(([s, i]) => allianceOf(s.team, i))).size < 2) return 'Everyone is on the same team. Put at least one side on another team (or on "–").';
  return null;
}

// Where each side's town goes. Allies get neighbouring corners (like AoE2's "teams together"); with only
// two sides they get opposite corners.
export function computeStarts(setup, w, h) {
  const corners = [{ x: 12, y: 12 }, { x: w - 13, y: 12 }, { x: w - 13, y: h - 14 }, { x: 12, y: h - 14 }]; // around the map
  const out = {};
  const teams = setup.teams;
  if (teams.length <= 2) {
    out[teams[0].id] = corners[0];
    if (teams[1]) out[teams[1].id] = corners[2];
    return out;
  }
  // group allies (in seat order) so each team's towns sit in neighbouring corners
  const groups = [];
  for (const t of teams) {
    let g = groups.find((x) => x.alliance === t.alliance);
    if (!g) { g = { alliance: t.alliance, ids: [] }; groups.push(g); }
    g.ids.push(t.id);
  }
  const order = groups.flatMap((g) => g.ids);
  order.forEach((id, i) => { out[id] = corners[i]; });
  return out;
}

// A short description like "Blue & Green vs Red & Yellow", "1 v 3" or "4-way free-for-all".
export function describeSetup(setup) {
  const groups = new Map();
  for (const t of setup.teams) {
    if (!groups.has(t.alliance)) groups.set(t.alliance, []);
    groups.get(t.alliance).push(TEAM_NAMES[t.id]);
  }
  const list = [...groups.values()];
  if (setup.teams.length === 1) return 'Freeplay: just you and your economy';
  if (list.length <= 1) return 'Everyone on one team';
  if (list.every((g) => g.length === 1)) return list.length === 2 ? `${list[0][0]} vs ${list[1][0]}` : `${list.length}-way free-for-all`;
  return `${list.map((g) => g.join(' & ')).join(' vs ')}  (${list.map((g) => g.length).join(' v ')})`;
}

// ---------- Game settings (like AoE2's lobby settings) ----------
// Each setting: a label, its choices [value, text], the default and a one-line explanation.
export const RULES = {
  size:      { label: 'Map size', def: 'auto', tip: 'Auto picks Small for 2 sides and Large for 3–4.',
    options: [['auto', 'Auto'], ['tiny', 'Tiny'], ['small', 'Small'], ['medium', 'Medium'], ['large', 'Large'], ['huge', 'Huge']] },
  resources: { label: 'Resources', def: 'standard', tip: 'What every side starts with.',
    options: [['low', 'Low'], ['standard', 'Standard'], ['high', 'High'], ['vhigh', 'Very high']] },
  era:       { label: 'Starting age', def: 0, tip: 'Skip the early ages.',
    options: [[0, 'Coal'], [1, 'Industrial'], [2, 'Modern']] },
  pop:       { label: 'Population', def: 200, tip: 'The most units each side can have.',
    options: [[50, '50'], [100, '100'], [150, '150'], [200, '200'], [300, '300']] },
  reveal:    { label: 'Reveal map', def: 'fog', tip: 'Normal: fog of war. Explored: you know the land but not where armies are.',
    options: [['fog', 'Normal'], ['explored', 'Explored'], ['visible', 'All visible']] },
  peace:     { label: 'Peace time', def: 0, tip: 'Nobody can attack until this runs out.',
    options: [[0, 'None'], [5, '5 min'], [10, '10 min'], [20, '20 min']] },
  victory:   { label: 'Victory', def: 'standard', tip: 'Conquest: only knocking out every rival wins (no Climate Restoration win).',
    options: [['standard', 'Standard'], ['conquest', 'Conquest']] },
  climate:   { label: 'Climate', def: 'normal', tip: 'How hard pollution heats the planet.',
    options: [['gentle', 'Gentle'], ['normal', 'Normal'], ['harsh', 'Harsh']] },
};

export const MAP_SIZES = { tiny: 48, small: 64, medium: 76, large: 88, huge: 100 };
export const START_AMOUNTS = {
  low: { food: 100, wood: 100, stone: 50 },
  standard: { food: 200, wood: 200, stone: 100 },
  high: { food: 500, wood: 500, stone: 300 },
  vhigh: { food: 1000, wood: 1000, stone: 700 },
};
export const CLIMATE_PRESSURE = { gentle: 0.6, normal: 1, harsh: 1.5 };

// Any settings object → a complete, valid one (unknown or missing values fall back to the default).
export function cleanRules(r = {}) {
  const out = {};
  for (const [k, def] of Object.entries(RULES)) {
    const v = r && r[k];
    out[k] = def.options.some(([o]) => o === v) ? v : def.def;
  }
  // older games only had fog on/off
  if (r && r.fog === false && !r.reveal) out.reveal = 'visible';
  return out;
}

export function mapSizeFor(rules, numSides) {
  if (rules.size === 'auto') return numSides > 2 ? MAP_SIZES.large : MAP_SIZES.small;
  return MAP_SIZES[rules.size] || MAP_SIZES.small;
}

// "Large · High resources · Peace 10 min" — only what differs from the usual.
export function describeRules(r) {
  const parts = [];
  for (const [k, def] of Object.entries(RULES)) {
    if (r[k] === def.def) continue;
    const text = (def.options.find(([o]) => o === r[k]) || [])[1];
    parts.push(k === 'size' ? `${text} map` : k === 'era' ? `${text} Age start` : `${def.label}: ${text}`);
  }
  return parts.length ? parts.join('  ·  ') : 'Standard settings';
}
