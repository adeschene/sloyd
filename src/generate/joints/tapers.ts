import type { AngleConflict, AngleCut, Board, FlatDocument, Region, SloydDocument, TaperConflict } from '../../document/document';
import { flatDocument, jointRefusal } from '../../document/document';
import { taperFields, throughOf, touchedRegion } from '../../document/angleCuts';
import { axisDimensions, endFacing, spanFromWorldOffset } from '../../document/geometry';
import { TOUCH, taperJointViolations, worldBox } from '../../document/designCheck';
import type { Violation } from '../../document/designCheck';
import { boxOf } from './pocket';
import { tenonSection } from './recipes';
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
 * Spec §3's tenon-clearance exception: a cut running straight through the entering part's joined end (its `through` is
 * the part's dimension along the site's axis) whose touched box's cross-section is disjoint from the tenon's — thickness
 * [cheek, thickness − cheek] × width [shoulder, width − shoulder] — touching allowed (cheek is computed: float noise only,
 * invariant 22). The tenon is the narrowest joint joinery can choose at that site, so every joint kind stays whole.
 */
function clearsTenon(b: Board, c: AngleCut, t: Region, axis: number): boolean {
  if (throughOf(c) !== axisDimensions(b)[axis]) return false;
  const { cheek, shoulder } = tenonSection(b.thickness, b.width);
  const section = { thickness: [cheek, b.thickness - cheek], width: [shoulder, b.width - shoulder] } as const;
  return (['width', 'thickness'] as const).some((d) => t[d][1] <= section[d][0] + 1e-9 || t[d][0] >= section[d][1] - 1e-9);
}

/**
 * The angle-at-joint rule for miters, bevels and chamfers (AI-angles spec §3): a cut conflicts with a site when its
 * touched box (in world space through `worldBox`) reaches the contact plane and overlaps the site's box-contact patch with
 * positive area (both in-plane spans above TOUCH, the box contacts' own tolerance). Tapers are `taperConflicts`' job and
 * skipped here; so is a cut on the ENTERING part of an end-into-face site that clears the tenon (`clearsTenon`). One
 * conflict per part (its first site in site order), sorted by part. Pure.
 */
export function angleConflicts(flat: FlatDocument, sites: readonly Site[]): AngleConflict[] {
  const found = new Map<number, AngleConflict>();
  for (const s of sites) {
    const e = boxOf(flat.boards[s.enter]!);
    const r = boxOf(flat.boards[s.receive]!);
    const plane = s.side === 1 ? e.max[s.axis]! : e.min[s.axis]!;
    const inPlane = [0, 1, 2].filter((k) => k !== s.axis);
    for (const part of [s.enter, s.receive]) {
      if (found.has(part)) continue;
      const b = flat.boards[part]!;
      for (const c of b.angleCuts) {
        if (c.kind === 'taper') continue;
        const t = touchedRegion(b, c);
        if (!t) continue;
        if (part === s.enter && s.kind === 'end-into-face' && clearsTenon(b, c, t, s.axis)) continue;
        const w = worldBox(b, t);
        const reaches = plane >= w.min[s.axis]! - 1e-9 && plane <= w.max[s.axis]! + 1e-9;
        const overlaps = inPlane.every((k) =>
          Math.min(e.max[k]!, r.max[k]!, w.max[k]!) - Math.max(e.min[k]!, r.min[k]!, w.min[k]!) > TOUCH);
        if (reaches && overlaps) {
          found.set(part, { part, other: part === s.enter ? s.receive : s.enter, kind: c.kind });
          break;
        }
      }
    }
  }
  return [...found.values()].sort((x, y) => x.part - y.part);
}

/**
 * THE joinery refusal (AI-tapers spec §4.2; AI-angles spec §3): every taper or other angle cut running into a joint, one
 * sentence per part, else null. `runJoinery`, the dialog and a joined Refine all call it, so they refuse in the same
 * words. Decided before any call or mutation. `doc` is kept for the callers; only `flat` is read.
 */
export function joineryRefusal(doc: SloydDocument, flat: FlatDocument = flatDocument(doc), sites: readonly Site[] = findSites(flat)): string | null {
  return jointRefusal(flat, taperConflicts(flat, sites), angleConflicts(flat, sites));
}

/** The taper-at-joint rule on a DESIGN (spec section 5.3): every conflict as a `taper-joint` fault, for evaluateDesign and Refine's preexisting set. */
export function taperFaults(flat: FlatDocument): Violation[] {
  return taperJointViolations(flat, taperConflicts(flat, findSites(flat)));
}
