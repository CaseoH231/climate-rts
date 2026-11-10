// Isometric projection. The game logic works on a flat grid (TILE px per tile);
// everything is *drawn* on diamond tiles twice as wide as they are tall.
import { TILE, MAP_W, MAP_H, setMapSize } from './config.js';

// These depend on the map size, which changes between games (call setWorldSize before building a map).
export let ISO_OX = MAP_H * TILE;                 // shift so the whole map has x ≥ 0
export let ISO_W = (MAP_W + MAP_H) * TILE;        // size of the drawn world
export let ISO_H = ((MAP_W + MAP_H) * TILE) / 2;

export function setWorldSize(w, h) {
  setMapSize(w, h);
  ISO_OX = h * TILE;
  ISO_W = (w + h) * TILE;
  ISO_H = ((w + h) * TILE) / 2;
}

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
