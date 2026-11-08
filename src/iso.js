// Isometric projection. The game logic works on a flat grid (TILE px per tile);
// everything is *drawn* on diamond tiles twice as wide as they are tall.
import { TILE, MAP_W, MAP_H } from './config.js';

export const ISO_OX = MAP_H * TILE;                 // shift so the whole map has x ≥ 0
export const ISO_W = (MAP_W + MAP_H) * TILE;        // size of the drawn world
export const ISO_H = ((MAP_W + MAP_H) * TILE) / 2;

// Grid pixel position → screen (world) position.
export function toIso(x, y) {
  return { x: x - y + ISO_OX, y: (x + y) / 2 };
}

// Screen (world) position → grid pixel position.
export function fromIso(ix, iy) {
  const dx = ix - ISO_OX;
  return { x: iy + dx / 2, y: iy - dx / 2 };
}

// Depth for sorting: things lower on screen are drawn in front.
export function isoDepth(x, y) {
  return (x + y) / 2;
}
