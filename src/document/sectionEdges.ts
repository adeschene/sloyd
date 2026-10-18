import type { P2 } from './curves';

/**
 * A profile section's edge names (profile runs a2, T6 fix 1; shared with b1's swept profiles): THE one builder and parser of
 * a cap's `profileEdge` (`BodyFace`), and the collinear-run namer both a stopped profile's pieces and a swept profile's kept
 * section use, so a run-out's faces and a swept band's faces name the same section edge the same way. A leaf module (imports
 * only types), so `bodies.ts` and `sweep.ts` can both use it without an import cycle; `bodies.ts` re-exports the two names.
 */

/** A cap's `profileEdge` (BodyFace): the curve's id and the first and last index [a, b] of the collinear run of section-
 *  outline edges it lies on. THE one builder; `profileEdgeOf` is its one parser. */
export function profileEdgeName(curve: string, a: number, b: number): string {
  return `${curve}:${a}:${b}`;
}
/** `profileEdgeName`'s inverse: the curve id (which may itself hold a ':') and the run [a, b], or null for an untagged face. */
export function profileEdgeOf(f: { profileEdge?: string }): { curve: string; a: number; b: number } | null {
  if (f.profileEdge === undefined) return null;
  const parts = f.profileEdge.split(':');
  const b = Number(parts.pop()), a = Number(parts.pop());
  return { curve: parts.join(':'), a, b };
}

/**
 * The namer of a section's edges (`profileSection(...).pts`, (s, t)): an edge run [a, b] (first and last index, mod the
 * outline's length) grown to its whole collinear run — collinear neighbouring edges lie on ONE plane, so one cap may cover
 * parts of several (the ogee's inflection chords, cut by two pieces) — and named with `profileEdgeName(id, a, b)`, or null
 * when every edge of the run lies on the part's faces (s = 0 or t = 0 at both ends: it caps nothing drawn apart from the face
 * itself), or for no run (a diagonal).
 */
export function sectionEdgeNamer(pts: readonly P2[], id: string): (r0: [number, number] | null) => string | null {
  const m = pts.length;
  const dir = (j: number): P2 => { const p = pts[j]!, q = pts[(j + 1) % m]!; const l = Math.hypot(q[0] - p[0], q[1] - p[1]); return [(q[0] - p[0]) / l, (q[1] - p[1]) / l]; };
  const collinear = (i: number, j: number) => { const x = dir(i), y = dir(j); return Math.abs(x[0] * y[1] - x[1] * y[0]) <= 1e-12 && x[0] * y[0] + x[1] * y[1] > 0; };
  return (r0) => {
    if (!r0) return null;
    const r: [number, number] = [r0[0], r0[1]];
    for (let n = 0; n < m && collinear((r[0] - 1 + m) % m, r[0]) && (r[0] - 1 + m) % m !== r[1]; n += 1) r[0] = (r[0] - 1 + m) % m;
    for (let n = 0; n < m && collinear(r[1], (r[1] + 1) % m) && (r[1] + 1) % m !== r[0]; n += 1) r[1] = (r[1] + 1) % m;
    for (let j = r[0]; ; j = (j + 1) % m) {
      const p = pts[j]!, q = pts[(j + 1) % m]!;
      if (!((p[0] === 0 && q[0] === 0) || (p[1] === 0 && q[1] === 0))) return profileEdgeName(id, r[0], r[1]);
      if (j === r[1]) return null;
    }
  };
}
