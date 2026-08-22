/**
 * Seeded PRNG. Every gameplay random draw goes through this rather than
 * Math.random, so a level plays out identically given the same seed -- which
 * is what makes spread patterns, pain chance and enemy hesitation testable at
 * all. A test that calls Math.random can only assert ranges; one that calls
 * this can assert values.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Uniform float in [min, max). */
export const range = (rng: () => number, min: number, max: number) => min + rng() * (max - min)

/** Uniform integer in [min, max]. */
export const rangeInt = (rng: () => number, min: number, max: number) =>
  Math.floor(range(rng, min, max + 1))

export const clamp = (v: number, min: number, max: number) => (v < min ? min : v > max ? max : v)

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/**
 * Shortest signed angular distance from `a` to `b`, in radians, always in
 * (-PI, PI]. Enemy turning and mouse-look both need this: subtracting raw
 * angles makes a creature that is 5 degrees off its target spin the long way
 * round when the values straddle the +/-PI wrap.
 */
export function angleDelta(a: number, b: number): number {
  const TAU = Math.PI * 2
  let d = (b - a) % TAU
  if (d > Math.PI) d -= TAU
  if (d <= -Math.PI) d += TAU
  return d
}
