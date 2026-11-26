// SKYFERRY — seeded random numbers. One file, one job: every random
// choice in the game (terrain detail, tree placement, gusts, cloud drift)
// comes from a seeded generator, so the same seed always builds the same
// islands and the same screenshot always shows the same frame.

/** Mulberry32: a small, fast, seedable PRNG with a clean 32-bit state. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic 2D value noise: smooth, repeatable bumps in [-1, 1]. */
export function makeNoise2D(seed) {
  const rand = mulberry32(seed);
  const perm = new Uint8Array(512);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) base[i] = i;
  for (let i = 255; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = base[i];
    base[i] = base[j];
    base[j] = tmp;
  }
  for (let i = 0; i < 512; i += 1) perm[i] = base[i & 255];
  const fade = (t) => t * t * (3 - 2 * t);
  const grad = (h, x, z) => {
    const u = h < 8 ? x : z;
    const v = h < 4 ? z : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  };
  return function noise2D(x, z) {
    const xi = Math.floor(x) & 255;
    const zi = Math.floor(z) & 255;
    const xf = x - Math.floor(x);
    const zf = z - Math.floor(z);
    const u = fade(xf);
    const v = fade(zf);
    const aa = grad(perm[perm[xi] + zi], xf, zf);
    const ba = grad(perm[perm[xi + 1] + zi], xf - 1, zf);
    const ab = grad(perm[perm[xi] + zi + 1], xf, zf - 1);
    const bb = grad(perm[perm[xi + 1] + zi + 1], xf - 1, zf - 1);
    const x1 = aa + (ba - aa) * u;
    const x2 = ab + (bb - ab) * u;
    return (x1 + (x2 - x1) * v) * 0.7071;
  };
}

/** Pick an element of `items` with the seeded generator. */
export function pick(rand, items) {
  return items[Math.floor(rand() * items.length)];
}
