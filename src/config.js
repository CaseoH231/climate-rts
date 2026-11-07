// Global settings for the game. Change numbers here to tweak the game.

export const TILE = 32;      // size of one map tile in pixels
export const MAP_W = 64;     // map width in tiles
export const MAP_H = 64;     // map height in tiles
export const MAP_SEED = 20261107; // change this for a different map

export const PLAYER_START = { x: 12, y: 12 }; // centre tile of the player's Town Centre

export const START_RESOURCES = { food: 200, wood: 200, stone: 100, fuel: 0, clean: 0 };
export const POP_MAX = 200;

export const TERRAIN = {
  GRASS: 0,
  WATER: 1,
  FOREST: 2,
  STONE: 3,
  BERRIES: 4,
};

const GRASS_COLORS = [0x6aa84f, 0x70ae54, 0x649f49];

export const TERRAIN_INFO = {
  [TERRAIN.GRASS]:   { name: 'Grassland',    walkable: true,  colors: GRASS_COLORS, minimap: 0x6aa84f },
  [TERRAIN.WATER]:   { name: 'Water',        walkable: false, colors: [0x3d85c6, 0x4189ca, 0x3a80bf], minimap: 0x3d85c6 },
  [TERRAIN.FOREST]:  { name: 'Forest',       walkable: false, colors: [0x4f7a30, 0x527d33, 0x4b752d], minimap: 0x274e13 },
  [TERRAIN.STONE]:   { name: 'Stone',        walkable: false, colors: GRASS_COLORS, minimap: 0x999999 },
  [TERRAIN.BERRIES]: { name: 'Berry bushes', walkable: false, colors: GRASS_COLORS, minimap: 0xc2185b },
};

// Which resource each terrain gives, and how much is in one tile.
export const TERRAIN_RESOURCE = {
  [TERRAIN.FOREST]: 'wood',
  [TERRAIN.STONE]: 'stone',
  [TERRAIN.BERRIES]: 'food',
};
export const RESOURCE_AMOUNT = { wood: 100, stone: 150, food: 125 };

export const TEAM_COLORS = {
  player: { main: 0x3c78d8, dark: 0x1c4587 },
};
