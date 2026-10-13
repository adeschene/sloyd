import type { FlatDocument, SloydDocument, TaperConflict } from '../../document/document';
import { angledRefusal, flatDocument, taperJointRefusal } from '../../document/document';
import { taperFields } from '../../document/angleCuts';
import { axisDimensions, endFacing, spanFromWorldOffset } from '../../document/geometry';
import { taperJointViolations } from '../../document/designCheck';
import type { Violation } from '../../document/designCheck';
import { boxOf } from './pocket';
import { findSites } from './sites';
import type { Site } from './sites';

/**
 * The taper-at-joint rule (AI-tapers spec §4.1): every site's contact patch on a tapered
 * part must lie on square wood — outside each taper's `[0, start)` from its thin end
 * (`start` itself allowed). Sites stay on BOX contacts on purpose: on flat-wood contacts a
 * rail meeting a taper would lose its contact and be left a silent butt. One conflict per
 * tapered part — the smallest `nearest` — sorted by part. Pure.
 */
export function taperConflicts(flat: FlatDocument, sites: readonly Site[]): TaperConflict[] {
  const best = new Map<number, TaperConflict>();
  for (const s of sites) {
    const e = boxOf(flat.boards[s.enter]!);
    const r = boxOf(flat.boards[s.receive]!);
    // `Site.side` is the ENTERING part's touching face; the receiver touches with the opposite one.
    const sides: [number, number, -1 | 1][] = [[s.enter, s.receive, s.side], [s.receive, s.enter, (-s.side) as -1 | 1]];
    for (const [part, other, side] of sides) {
      const b = flat.boards[part]!;
      const tapers = b.angleCuts.filter((c) => c.kind === 'taper').map((c) => taperFields(c, b)).filter((t) => t.amount > 0);
      if (tapers.length === 0) continue;
      const L = axisDimensions(b).indexOf('length');
      // The patch's span along the part's length, as stations from its min end.
      let s0: number;
      let s1: number;
      if (L === s.axis) {
        // The joint is ON an end: which one faces the other part.
        s0 = s1 = endFacing(b, L, side) === 'min' ? 0 : b.length;
      } else {
        const lo = Math.max(e.min[L]!, r.min[L]!) - b.position[L]!;
        const hi = Math.min(e.max[L]!, r.max[L]!) - b.position[L]!;
        [s0, s1] = spanFromWorldOffset(b, L, [lo, hi]);
      }
      for (const t of tapers) {
        const nearest = Math.max(0, t.end === 'min' ? s0 : b.length - s1);
        // `nearest` is computed (a world difference), `start` is typed: allow float noise only (invariant 22).
        if (nearest >= t.start - 1e-9) continue;
        const prev = best.get(part);
        if (!prev || nearest < prev.nearest) best.set(part, { part, other, end: t.end, nearest });
      }
    }
  }
  return [...best.values()].sort((x, y) => x.part - y.part);
}

/**
 * THE joinery refusal (spec §4.2): the angled refusal (non-taper kinds), else the
 * taper-at-joint refusal, else null. `runJoinery` and the dialog both call it, so the
 * dialog shows exactly what a run would refuse. Decided before any call or mutation.
 */
export function joineryRefusal(doc: SloydDocument, flat: FlatDocument = flatDocument(doc), sites: readonly Site[] = findSites(flat)): string | null {
  return angledRefusal(doc, 'joinery') ?? taperJointRefusal(flat, taperConflicts(flat, sites));
}

/** The taper-at-joint rule on a DESIGN (spec section 5.3): every conflict as a `taper-joint` fault, for evaluateDesign and Refine's preexisting set. */
export function taperFaults(flat: FlatDocument): Violation[] {
  return taperJointViolations(flat, taperConflicts(flat, findSites(flat)));
}
