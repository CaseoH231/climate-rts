// A small, fast random-number generator that gives the same sequence for the same seed.
// Everything that can change the outcome of a game (AI choices, disasters, deer, arrow spread)
// draws from one of these, so two computers — or a replay — play out exactly the same.
// Purely visual randomness (smoke, birds, sounds) still uses Math.random.

export class Rng {
  constructor(seed) {
    this.state = seed >>> 0;
  }

  // Uniform number in [0, 1).
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Shuffle an array in place (Fisher–Yates), the same way every time.
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

// Mix a list of numbers into one 32-bit checksum (used to check two games are identical).
export function hashNumbers(nums) {
  let h = 0x811c9dc5;
  for (const n of nums) {
    // fold the number in as an integer at 1/100 precision
    let v = Math.round(n * 100) | 0;
    for (let k = 0; k < 4; k++) {
      h ^= v & 0xff;
      h = Math.imul(h, 0x01000193);
      v >>= 8;
    }
  }
  return h >>> 0;
}
