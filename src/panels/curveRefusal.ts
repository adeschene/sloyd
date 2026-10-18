import {
  bowFields, archFields, cornerFields, curveFaults, holeFaults, uvDims, CURVE_EPS, profileFields,
} from '../document/document';
import type { Board, CurveCut, Dimension } from '../document/document';
import { profileFaults } from '../document/profiles';
import type { ProfileFault } from '../document/profiles';
import type { ProfileCut } from '../document/document';
import { profileFaultText } from '../document/curveText';
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
 *  names the field the user changed, for "reduce the … first"; a select change passes null. `curve` is the stored curve,
 *  or null when there is none to compare with (a swept profile made straight, profile runs b1: every fault of `next` is
 *  then added); `after` is then required. */
export function refusalFor(board: Board, curve: CurveCut | null, next: Draft, control: Control | null, after?: Board): string | null {
  if (pastHalfCircle(next)) return HALF_CIRCLE;
  const had = new Set(curve ? curveFaults(board, curve).map((f) => f.kind) : []);
  const added = curveFaults(board, next).find((f) => !had.has(f.kind));
  if (added?.kind === 'cuts-through') return `Removes more than the ${cutDim(board, next)} — reduce the ${control ?? 'Rise'} first.`;
  if (added) {
    // A select change (no control) names the field that sizes this kind: a Bow has no Span (its Rise), a corner its
    // Radius (finding 3).
    const prof = profileFields(next) ?? (curve && profileFields(curve));
    const sizer: Control = control ?? (prof ? (prof.kind === 'ogee' ? 'Size' : prof.kind === 'thumbnail' ? 'Reach' : 'Radius')
      : bowFields(next) || (curve && bowFields(curve)) ? 'Rise' : cornerFields(next) || (curve && cornerFields(curve)) ? 'Radius' : 'Span');
    return sizer === 'Radius'
      ? `A radius can't run past ${edgeName(added.edge!)} — reduce it first.`
      : `Runs past ${edgeName(added.edge!)} — reduce the ${sizer} first.`;
  }
  const post: Board = after ?? { ...board, curves: board.curves.map((c) => (c.id === curve!.id ? { ...next, id: curve!.id } : c)) };
  return holeRefusal(board, post);
}

/** The refusal for a profile fault an edit would ADD (P12; b1's Q6): THE one home, read by the Profiles row and by Curves
 *  (an edit of the curve under a profile, Review Focus 2). */
export const PROFILE_REFUSAL: Record<ProfileFault['kind'], string> = {
  'stop-off': 'A stop runs off the part — move it first.',
  overlap: 'Overlaps another profile on this edge — move it first.',
  'runs-off': 'Runs off the part — reduce the size first.',
  'too-tight': 'Too tight for the curve — reduce the size first.',
};

/** Each stored profile's fault kinds as JUDGED (`profileFaults`, swept where swept-shaped — never the view's straight
 *  faults, or a profile that runs straight would lose its too-tight), by id: what `profileRefusal` compares against.
 *  Computed once by a caller trying several edits of one part (Curves' presets; final review M1). */
export type ProfileFaultsBefore = ReadonlyMap<string, ReadonlySet<ProfileFault['kind']>>;
export function profileFaultsBefore(board: Board): ProfileFaultsBefore {
  return new Map(board.profiles.map((p) => [p.id, new Set(profileFaults(board, p).map((f) => f.kind))]));
}

/** The first profile fault `after` ADDS (by kind, per profile, matched by id) that `board` lacks, as its refusal; or null.
 *  Both are STORED parts (curves included): Curves' edits change the curves under the profiles, so every profile is judged
 *  before and after (Review Focus 2) — a fault a resize already caused is kept, never a reason to refuse an unrelated edit. */
export function profileRefusal(board: Board, after: Board, before: ProfileFaultsBefore = profileFaultsBefore(board)): string | null {
  for (const p of board.profiles) {
    const q = after.profiles.find((x) => x.id === p.id);
    if (!q) continue;
    const had = before.get(p.id)!;
    const added = profileFaults(after, q).find((f) => !had.has(f.kind));
    if (added) return curveEditRefusal(added, q);
  }
  return null;
}

/**
 * A profile fault a CURVE edit would add, in the Curves row's words (Task 9 fix round 1, the user's ruling): the profile
 * named by `curveWord` (THE home of "the roundover", "the cove", …), and the remedy aimed at it — in the Curves row "the
 * size" would read as the curve's. Built from `profileFaultText` where its words fit. A stop runs off only through a
 * station and the part's dimensions, which no curve edit changes: unreachable here, so it keeps the row's own words.
 */
export function curveEditRefusal(f: ProfileFault, p: ProfileCut): string {
  const w = curveWord({ kind: null, profile: p.kind });
  const said = (t: string) => `${w[0]!.toUpperCase()}${w.slice(1)}${t.replace(/^it/, '')}`;
  switch (f.kind) {
    case 'too-tight': return `Too tight for ${w} — reduce ${w} first.`;
    case 'runs-off': return `${said(profileFaultText(f))} — reduce ${w} first.`;
    case 'overlap': return `${said(profileFaultText(f))} — move ${w} first.`;
    case 'stop-off': return PROFILE_REFUSAL['stop-off'];
  }
}

/** A greyed select option's reason: the refusal's own words up to its dash (presets minors 2; fu 388), so
 *  `Puts hole 1 into the cove — move it first.` reads `Cove — puts hole 1 into the cove`. */
export function optionReason(refused: string): string {
  return refused.split(' — ')[0]!.replace(/^./, (c) => c.toLowerCase()).replace(/\.$/, '');
}
