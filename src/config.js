// Global settings for the game. Change numbers here to tweak the game.

export const TILE = 32;      // size of one map tile in pixels
export const MAP_W = 64;     // map width in tiles
export const MAP_H = 64;     // map height in tiles
export const MAP_SEED = 20261107; // change this for a different map

export const PLAYER_START = { x: 12, y: 12 }; // tile where the player's base starts

export const TERRAIN = {
  GRASS: 0,
  WATER: 1,
  FOREST: 2,
  STONE: 3,
};

export const TERRAIN_INFO = {
  [TERRAIN.GRASS]:  { name: 'Grassland', walkable: true,  colors: [0x6aa84f, 0x70ae54, 0x649f49], minimap: 0x6aa84f },
  [TERRAIN.WATER]:  { name: 'Water',     walkable: false, colors: [0x3d85c6, 0x4189ca, 0x3a80bf], minimap: 0x3d85c6 },
  [TERRAIN.FOREST]: { name: 'Forest',    walkable: false, colors: [0x4f7a30, 0x527d33, 0x4b752d], minimap: 0x274e13 },
  [TERRAIN.STONE]:  { name: 'Stone',     walkable: false, colors: [0x6aa84f, 0x70ae54, 0x649f49], minimap: 0x999999 },
};

export const TEAM_COLORS = {
  player: { main: 0x3c78d8, dark: 0x1c4587 },
};
