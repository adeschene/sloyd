import type { AnyLine, TapeAxis } from './types';

/**
 * The pure arithmetic of a construction line's identity (construction-lines specs §2). A leaf module: the loader
 * (`validateGuides`) needs `lineThrough`, and `snapPoints.ts` imports half the document layer, so it lives here and
 * `snapPoints.ts` re-exports it.
 */

export type Vec3 = [number, number, number];

/** A line about to be stored: parallel to an axis through `at`, or through two points. */
export type NewLine = { at: Vec3; axis: TapeAxis } | { at: Vec3; to: Vec3 };

const AXIS_AT: Record<TapeAxis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 };

/** A copy of a line's anchor with the coordinate along its axis zeroed (construction-lines spec §2). */
export function canonicalLine(at: Vec3, axis: TapeAxis): { at: Vec3; axis: TapeAxis } {
  const out: Vec3 = [at[0], at[1], at[2]];
  out[AXIS_AT[axis]] = 0;
  return { at: out, axis };
}

/** Whether two lines are the same line, exactly (never within a tolerance). */
export function sameLine(a: { at: Vec3; axis: TapeAxis }, b: { at: Vec3; axis: TapeAxis }): boolean {
  return a.axis === b.axis && a.at[0] === b.at[0] && a.at[1] === b.at[1] && a.at[2] === b.at[2];
}

/**
 * The line through two points (construction-lines-2 spec §2.1). Equal points are no line. Exactly two coordinates `===`
 * is an AXIS line, stored canonical, never an oblique line that happens to be parallel; anything else is oblique and
 * keeps both points, copied.
 */
export function lineThrough(a: Vec3, b: Vec3): NewLine | null {
  const same = [a[0] === b[0], a[1] === b[1], a[2] === b[2]];
  const n = same.filter(Boolean).length;
  if (n === 3) return null;
  if (n === 2) return canonicalLine(a, (['x', 'y', 'z'] as const)[same.indexOf(false)]);
  return { at: [a[0], a[1], a[2]], to: [b[0], b[1], b[2]] };
}

/**
 * Whether two lines to be stored are the same, exactly (spec §2.2). An oblique line is its unordered pair of points,
 * not a collinearity test; an axis line and an oblique one are never the same.
 */
export function sameNewLine(a: NewLine, b: NewLine): boolean {
  if ('axis' in a || 'axis' in b) return 'axis' in a && 'axis' in b && sameLine(a, b);
  const eq = (p: Vec3, q: Vec3) => p[0] === q[0] && p[1] === q[1] && p[2] === q[2];
  return (eq(a.at, b.at) && eq(a.to, b.to)) || (eq(a.at, b.to) && eq(a.to, b.at));
}

/** A stored line as the `NewLine` it would have been added as. */
export function newLineOf(g: AnyLine): NewLine {
  return g.axis !== undefined ? { at: g.at, axis: g.axis } : { at: g.at, to: g.to };
}
