// Replays: a recorded game is just its starting settings plus every command the player gave,
// stamped with the tick it happened on. Because the simulation is deterministic (seeded random
// numbers, fixed 50 ms ticks), playing the same commands back on the same map rebuilds the
// exact same game. Every couple of seconds a fingerprint ("hash") of the game state is stored
// too, so playback can check it hasn't drifted — the same check online play will use.

const KEY = 'age-of-emissions-replays';
const MAX_REPLAYS = 6;

export function listReplays() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

export function saveReplay(replay) {
  let list = listReplays().filter((r) => r.id !== replay.id);
  list.unshift(replay);
  list = list.slice(0, MAX_REPLAYS);
  // If storage is full, drop the oldest replays until it fits.
  while (list.length) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      list.pop();
    }
  }
  return false;
}

export function deleteReplay(id) {
  try {
    localStorage.setItem(KEY, JSON.stringify(listReplays().filter((r) => r.id !== id)));
  } catch (e) { /* ignore */ }
}
