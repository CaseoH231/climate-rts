// Who is in a game: up to four sides, each with an alliance number (sides with the same number are on
// the same team) and either a person or the computer (ai = 'easy' | 'normal' | 'hard') in charge.
import { TEAM_IDS, TEAM_NAMES } from './config.js';

// Game modes for playing against the computer.
export const MODES = {
  '1v1': {
    name: '1 v 1',
    desc: 'You against one computer opponent.',
    teams: [['player', 0, false], ['enemy', 1, true]],
  },
  '2v2': {
    name: '2 v 2',
    desc: 'You and a computer ally (Green) against two computer opponents.',
    teams: [['player', 0, false], ['green', 0, true], ['enemy', 1, true], ['yellow', 1, true]],
  },
  ffa3: {
    name: '3-way free-for-all',
    desc: 'Three sides, everyone for themselves. Last town standing wins.',
    teams: [['player', 0, false], ['enemy', 1, true], ['green', 2, true]],
  },
  ffa4: {
    name: '4-way free-for-all',
    desc: 'Four sides, one in each corner. Last town standing wins.',
    teams: [['player', 0, false], ['enemy', 1, true], ['green', 2, true], ['yellow', 3, true]],
  },
};

export function soloSetup(mode = '1v1', difficulty = 'normal') {
  const m = MODES[mode] || MODES['1v1'];
  return {
    mode,
    teams: m.teams.map(([id, alliance, ai]) => ({ id, alliance, ai: ai ? difficulty : null, name: ai ? `${TEAM_NAMES[id]} (computer)` : 'You' })),
  };
}

// Online: turn the lobby's slots into a setup. slots[i] = { kind: 'human'|'ai'|'closed', name, alliance, ai }.
export function setupFromSlots(slots) {
  const teams = [];
  slots.forEach((s, i) => {
    if (!s || s.kind === 'closed') return;
    teams.push({
      id: TEAM_IDS[i],
      alliance: Number.isInteger(s.alliance) ? s.alliance : i,
      ai: s.kind === 'ai' ? s.ai || 'normal' : null,
      name: s.kind === 'ai' ? `${TEAM_NAMES[TEAM_IDS[i]]} (computer)` : s.name || TEAM_NAMES[TEAM_IDS[i]],
    });
  });
  return { mode: 'online', teams };
}

// A short description like "Blue & Green vs Red & Yellow" or "Free-for-all".
export function describeSetup(setup) {
  const groups = new Map();
  for (const t of setup.teams) {
    if (!groups.has(t.alliance)) groups.set(t.alliance, []);
    groups.get(t.alliance).push(TEAM_NAMES[t.id]);
  }
  const list = [...groups.values()];
  if (list.length <= 1) return 'Everyone on one team';
  if (list.every((g) => g.length === 1)) return list.length === 2 ? `${list[0][0]} vs ${list[1][0]}` : `${list.length}-way free-for-all`;
  return list.map((g) => g.join(' & ')).join(' vs ');
}
