import {
  bowFields, archFields, cornerFields, curveFaults, holeFaults, uvDims, CURVE_EPS, profileFields,
} from '../document/document';
import type { Board, CurveCut, Dimension } from '../document/document';
import { curveWord, distinctFaults, edgeName, faultKey } from '../document/holeText';

export type Draft = Omit<CurveCut, 'id'>;
export type Control = 'Rise' | 'Span' | 'Radius' | 'Start' | 'Size' | 'Reach' | 'Depth' | 'Fillet' | 'Quirk';

/** The dimension a cut-through crosses, for the refusal's words: an Arch's or Bow's depth dimension (the in-face one
 *  that is not `along`); otherwise the smaller of u and v. */
export function cutDim(board: Board, next: Draft): Dimension {
  const along = archFields(next)?.along ?? bowFields(next)?.along;
  const [u, v] = uvDims(next.through);
  if (along) return along === u ? v : u;
  return board[u] <= board[v] ? u : v;
}

/** The first hole fault `after` adds that the stored part lacks and that is a hole into a curve's waste, in words; or
 *  null. faultKey names the curve, so a hole already past an EDGE is still refused (finding 2). */
export function holeRefusal(board: Board, after: Board): string | null {
  for (const row of board.holes) {
    const was = new Set(distinctFaults(holeFaults(board, row)).map(faultKey));
    const hit = distinctFaults(holeFaults(after, row)).find((f) => !was.has(faultKey(f)) && f.curve);
    if (hit) return `Puts hole ${hit.index + 1} into ${curveWord(hit.curve!)} — move it first.`;
  }
  return null;
}

export const HALF_CIRCLE = 'An arc is at most a half circle — reduce the Rise first.';

/** True when an arc of `next` is one the loader drops (`validateCurveCuts`): a rise over half its chord, a radius under
 *  half its chord, or no chord. EXACT, the loader's own tests — a tolerance here would store an arc the next load drops
 *  (silent loss). Judged on EVERY candidate, typed or selected: a Bow re-seated onto a narrow dimension is refit to a
 *  short span at its old rise. */
export function pastHalfCircle(next: Draft): boolean {
  let at = next.start;
  for (const s of next.segments) {
    if (s.type === 'arc') {
      const chord = Math.hypot(s.to[0] - at[0], s.to[1] - at[1]);
      if (chord <= CURVE_EPS) return true;
      if (s.rise !== undefined ? s.rise > chord / 2 : s.radius! < chord / 2) return true;
    }
    at = s.to;
  }
  return false;
}

/** The refusal for an edit that ADDS a curve fault, or a hole fault, the stored state lacks (spec §8), or null. `control`
 *  names the field the user changed, for "reduce the … first"; a select change passes null. */
export function refusalFor(board: Board, curve: CurveCut, next: Draft, control: Control | null, after?: Board): string | null {
  if (pastHalfCircle(next)) return HALF_CIRCLE;
  const had = new Set(curveFaults(board, curve).map((f) => f.kind));
  const added = curveFaults(board, next).find((f) => !had.has(f.kind));
  if (added?.kind === 'cuts-through') return `Removes more than the ${cutDim(board, next)} — reduce the ${control ?? 'Rise'} first.`;
  if (added) {
    // A select change (no control) names the field that sizes this kind: a Bow has no Span (its Rise), a corner its
    // Radius (finding 3).
    const prof = profileFields(next) ?? profileFields(curve);
    const sizer: Control = control ?? (prof ? (prof.kind === 'ogee' ? 'Size' : prof.kind === 'thumbnail' ? 'Reach' : 'Radius')
      : bowFields(next) || bowFields(curve) ? 'Rise' : cornerFields(next) || cornerFields(curve) ? 'Radius' : 'Span');
    return sizer === 'Radius'
      ? `A radius can't run past ${edgeName(added.edge!)} — reduce it first.`
      : `Runs past ${edgeName(added.edge!)} — reduce the ${sizer} first.`;
  }
  const post: Board = after ?? { ...board, curves: board.curves.map((c) => (c.id === curve.id ? { ...next, id: curve.id } : c)) };
  return holeRefusal(board, post);
}

/** A greyed select option's reason: the refusal's own words up to its dash (presets minors 2; fu 388), so
 *  `Puts hole 1 into the cove — move it first.` reads `Cove — puts hole 1 into the cove`. */
export function optionReason(refused: string): string {
  return refused.split(' — ')[0]!.replace(/^./, (c) => c.toLowerCase()).replace(/\.$/, '');
}
