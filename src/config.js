// Global settings for the game. Change numbers here to tweak the game.

export const GAME_VERSION = 'v12';
export const TICK_MS = 50;   // the simulation moves in fixed 50 ms steps (20 per second)
export const TILE = 32;      // size of one map tile in pixels
export const MAP_W = 64;     // map width in tiles
export const MAP_H = 64;     // map height in tiles
export const MAP_SEED = 20261107; // change this for a different map

export const PLAYER_START = { x: 12, y: 12 }; // centre tile of the player's Town Centre
export const ENEMY_START = { x: 51, y: 50 };  // centre tile of the enemy's Town Centre

export const START_RESOURCES = { food: 200, wood: 200, stone: 100, fuel: 0, clean: 0 };
export const POP_MAX = 200;

export const TERRAIN = {
  GRASS: 0,
  WATER: 1,
  FOREST: 2,
  STONE: 3,
  BERRIES: 4,
  COAL: 5,
  ASH: 6,   // burnt ground after a wildfire — turns back into grass over time
  MEAT: 7,  // a hunted deer, ready to butcher for food
};

const GRASS_COLORS = [0x6aa84f, 0x70ae54, 0x649f49];

export const TERRAIN_INFO = {
  [TERRAIN.GRASS]:   { name: 'Grassland',    walkable: true,  colors: GRASS_COLORS, minimap: 0x6aa84f },
  [TERRAIN.WATER]:   { name: 'Water',        walkable: false, colors: [0x3d85c6, 0x4189ca, 0x3a80bf], minimap: 0x3d85c6 },
  [TERRAIN.FOREST]:  { name: 'Forest',       walkable: false, colors: [0x4f7a30, 0x527d33, 0x4b752d], minimap: 0x274e13 },
  [TERRAIN.STONE]:   { name: 'Stone',        walkable: false, colors: GRASS_COLORS, minimap: 0x999999 },
  [TERRAIN.BERRIES]: { name: 'Berry bushes', walkable: false, colors: GRASS_COLORS, minimap: 0xc2185b },
  [TERRAIN.COAL]:    { name: 'Coal',         walkable: false, colors: GRASS_COLORS, minimap: 0x1a1a1a },
  [TERRAIN.ASH]:     { name: 'Burnt ground', walkable: true,  colors: [0x4a4038, 0x51463c, 0x463c34], minimap: 0x5d4e37 },
  [TERRAIN.MEAT]:    { name: 'Hunted deer',  walkable: false, colors: GRASS_COLORS, minimap: 0x8d5a3a },
};

// Which resource each terrain gives, and how much is in one tile.
export const TERRAIN_RESOURCE = {
  [TERRAIN.FOREST]: 'wood',
  [TERRAIN.STONE]: 'stone',
  [TERRAIN.BERRIES]: 'food',
  [TERRAIN.COAL]: 'fuel',
  [TERRAIN.MEAT]: 'food',
};
export const RESOURCE_AMOUNT = { wood: 100, stone: 150, food: 125, fuel: 200 };
// Some terrains hold a different amount than their resource's default.
export const TERRAIN_AMOUNT = { [TERRAIN.MEAT]: 200 };

// Climate tuning. Bigger numbers = faster/harsher climate change.
export const CLIMATE = {
  baseCO2: 280,          // ppm at the start (pre-industrial)
  sensitivity: 3,        // °C of warming each time CO₂ doubles
  tempLag: 40,           // seconds for temperature to catch up with CO₂
  co2PerFuel: 0.06,      // ppm added for every 1 fossil fuel burned (gathered)
  forestAbsorb: 0.00008, // ppm each forest tile soaks up per second
  co2PerBurntTile: 0.6,  // ppm released when a forest tile burns
  disasterCheck: 15,     // seconds between disaster dice-rolls
  seaSteps: [1.5, 2.5, 3.5], // °C at which the sea rises
  seaRise: 0.025,        // how much land each rise floods (bigger = more)
};

export const TEAM_COLORS = {
  player: { main: 0x3f6296, dark: 0x253c5e },
  enemy:  { main: 0x93382f, dark: 0x5c201b },
};

// Game speeds the player can pick (+ / - keys or the ×1 button in the top bar).
export const GAME_SPEEDS = [0.5, 1, 1.5, 2, 3];

// Starting market prices (relative value of one unit of each resource).
export const MARKET_BASE = { food: 1, wood: 1, stone: 1.3, fuel: 1.2 };
