// Civilisations: each side plays one, picked in the game set-up (or Random). Each has two bonuses and one
// unique unit trained at the Barracks. Everything here is simulation data: same numbers on every computer.

export const CIVS = {
  ironvale: {
    name: 'Ironvale',
    motto: 'Steel, steam and stubborn walls.',
    bonuses: ['Stone and coal mining +20%', 'Buildings have +20% health'],
    unique: 'grenadier',
    gather: { stone: 1.2, fuel: 1.2 },
    buildingHp: 1.2,
  },
  greenhollow: {
    name: 'Greenhollow',
    motto: 'People of the deep woods.',
    bonuses: ['Wood gathering +15%', 'Planted trees grow twice as fast'],
    unique: 'ranger',
    gather: { wood: 1.15 },
    treeGrow: 2,
  },
  saltmarsh: {
    name: 'Saltmarsh',
    motto: 'Fishers and boat-builders of the coast.',
    bonuses: ['Fishing Docks and Hydro Dams make +40%', 'Workers walk 10% faster'],
    unique: 'marine',
    produce: { fishing_dock: 1.4, hydro_dam: 1.4 },
    workerSpeed: 1.1,
  },
  sunreach: {
    name: 'Sunreach',
    motto: 'Engineers chasing the sun and the wind.',
    bonuses: ['Research and new ages 25% faster', 'Wind Turbines and Solar Farms make +30%'],
    unique: 'sapper',
    produce: { wind_turbine: 1.3, solar: 1.3 },
    research: 1.25,
  },
};
export const CIV_IDS = Object.keys(CIVS);

// The civ a seat plays: its choice, or for 'random' (or anything unknown) one picked from the game's seed
// and the seat — the same on every computer, without touching the game's random numbers.
export function resolveCiv(choice, seed, index) {
  if (CIVS[choice]) return choice;
  let h = (Math.floor(seed || 0) ^ ((index + 1) * 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return CIV_IDS[h % CIV_IDS.length];
}

// "Random" plus every civ, for the set-up buttons.
export const CIV_CHOICES = ['random', ...CIV_IDS];
export const civName = (c) => (CIVS[c] ? CIVS[c].name : 'Random civ');
