import type { Dir } from './taperWorld';

/**
 * World directions as the bench says them (shop-words spec §1–2), for text a PERSON reads (Refine's change list). Model-
 * facing text keeps the schema's `+x`. Numbers only in, words out: no `units` (the `→ units` edge rule).
 */
export interface Box { min: readonly number[]; max: readonly number[] }

const AXES = 'xyz';
/** A part this close to its frame's middle on an axis is centred there: neither inside nor outside. */
const EPS = 1e-6;
/** Absolute words; +z is the front (the Front view looks at it, `drawing.ts` `FRONT`), +x the right as seen from it. */
const ABSOLUTE: Record<Dir, string> = { '+x': 'right', '-x': 'left', '+y': 'top', '-y': 'bottom', '+z': 'front', '-z': 'back' };

/** The middle of the boxes' union: a frame's centre. */
export function centreOf(boxes: readonly Box[]): number[] {
  return [0, 1, 2].map((k) => (Math.min(...boxes.map((b) => b.min[k]!)) + Math.max(...boxes.map((b) => b.max[k]!))) / 2);
}

/** An end or a direction: always absolute (a miter's end, a taper's thin end, a row's run, a move). */
export const endWord = (d: Dir): string => ABSOLUTE[d];

/**
 * A face of `part` looking along `d`: up and down are top and bottom; an x or z face is inside when it looks toward
 * `centre`, outside when it looks away, and its absolute word when the part is centred on that axis.
 */
export function faceWord(d: Dir, part: Box, centre: readonly number[]): string {
  const k = AXES.indexOf(d[1]!);
  if (k === 1) return ABSOLUTE[d];
  const toward = (d[0] === '+' ? 1 : -1) * (centre[k]! - (part.min[k]! + part.max[k]!) / 2);
  return toward > EPS ? 'inside' : toward < -EPS ? 'outside' : ABSOLUTE[d];
}

/** Several faces' words on one line: `inside face`, `2 inside faces`, `inside and outside faces`, `2 inside and 1 outside faces`. */
export function facesText(words: readonly string[]): string {
  const tally = new Map<string, number>();
  for (const w of words) tally.set(w, (tally.get(w) ?? 0) + 1);
  const counted = [...tally.values()].some((n) => n > 1);
  const parts = [...tally].map(([w, n]) => (counted ? `${n} ${w}` : w));
  return `${parts.join(' and ')} face${words.length > 1 ? 's' : ''}`;
}
