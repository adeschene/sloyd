/**
 * The log a board was cut from, as much of it as a texture needs.
 *
 * Growth rings are nested cylinders about the pith. Everything visible on a
 * board is where those rings meet a cut plane: far from the pith the plane
 * grazes them and they close into cathedral arches; through the pith it slices
 * them lengthways into the straight lines of quartersawn stock; across them it
 * shows the rings themselves. Three cuts, one model — which is also why the
 * three faces of one board look like the same board.
 *
 * Pure, and deliberately separate from the canvas work in grainTexture.ts:
 * this is the part that can be tested without a 2D context.
 *
 * Units are tile-relative. The tile spans 1 across the grain, with the pith
 * line down its middle.
 */

/** Bands drawn across one tile. Even, so the pith line lands at the middle. */
export const BANDS = 16;

export interface Harmonic {
  /** Whole periods across the tile — fractional periods would leave a seam. */
  periods: number;
  amplitude: number;
  phase: number;
}

/**
 * The radius of ring k, chosen so the ring lands a mean distance k*delta from
 * the pith line *in the cut plane*.
 *
 * This is the load-bearing choice in the whole module. Because
 * r = hypot(d, k*delta), the in-plane offset sqrt(r^2 - d^2) comes out as
 * exactly k*delta — evenly spaced, whatever the cut distance — so the pattern
 * is periodic across the grain and the tile has no seam. Choosing radii any
 * other way puts one back.
 */
export function bandRadius(k: number, d: number, delta: number): number {
  return Math.hypot(d, k * delta);
}

/**
 * Where band k crosses the cut plane, as a distance from the pith line, or null
 * where the band does not reach the plane at all — which is exactly where a
 * cathedral arch closes.
 *
 * The wobble moves the pith rather than the rings: a log is never perfectly
 * straight, so the distance from pith to cut varies along the board. That keeps
 * the distant bands evenly spaced (they barely notice) while the near ones open
 * and close into arches, which is what flatsawn figure actually looks like.
 */
export function bandOffset(
  k: number,
  d: number,
  delta: number,
  wobble: number,
): number | null {
  const wandered = d * (1 + wobble);
  const inside = bandRadius(k, d, delta) ** 2 - wandered ** 2;
  return inside <= 0 ? null : Math.sqrt(inside);
}

/**
 * A wobble that tiles along the grain: sinusoids with whole periods across the
 * tile, so value and slope both match at the ends.
 */
export function wobbleAt(z: number, harmonics: Harmonic[]): number {
  let sum = 0;
  for (const h of harmonics) {
    sum += h.amplitude * Math.sin(2 * Math.PI * h.periods * z + h.phase);
  }
  return sum;
}

/**
 * Harmonics with whole periods and falling amplitude — one slow bend with
 * finer detail on top, which is how grain reads.
 *
 * `peakAmplitude` is the first (i = 0) harmonic's amplitude; the rest fall off
 * from it. It is the knob that decides how many bands close into cathedral
 * arches: `bandOffset` drops a band once `(k*delta)^2 < d^2 * w * (2 + w)`
 * (see its doc comment), so for a given cut distance `d` a bigger wobble
 * closes more bands, further from the pith. The face cut (`d` well off the
 * pith) wants only the innermost two or three bands to close — that is what
 * flatsawn cathedral figure looks like — which needs a small amplitude, on
 * the order of a twentieth of the band spacing. The edge cut (`d` near zero)
 * barely feels the wobble at all regardless of amplitude, since the whole
 * `d^2 * w * (2 + w)` term shrinks with `d`, so it can afford a larger value
 * for visible waviness without spuriously closing bands.
 */
export function makeHarmonics(rand: () => number, count = 3, peakAmplitude = 0.02): Harmonic[] {
  const harmonics: Harmonic[] = [];
  for (let i = 0; i < count; i += 1) {
    harmonics.push({
      periods: 1 + i + Math.floor(rand() * 2),
      amplitude: peakAmplitude / (i + 1) ** 1.6,
      phase: rand() * Math.PI * 2,
    });
  }
  return harmonics;
}

/** Deterministic PRNG (mulberry32). Never Math.random: the same board must look
 *  the same on every load. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a. Turns a cache key into a seed. */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
