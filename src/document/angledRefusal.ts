import type { AngleKind, CutFrom, FlatDocument, SloydDocument } from './types';
import { flatDocument } from './tree';
import { faceName } from './angleText';
import { formatLength } from '../units/length';

/** Flat display names of every placed part carrying an angle cut whose kind is not in `allow`, in document order. */
export function angledParts(doc: SloydDocument, allow: readonly AngleKind[] = []): string[] {
  return flatDocument(doc).boards.filter((b) => b.angleCuts.some((c) => !allow.includes(c.kind))).map((b) => b.name);
}

const shown = (names: string[]) => (names.length > 3 ? `${names.slice(0, 3).join(', ')}…` : names.join(', '));

/**
 * Why Add joinery or Refine will not run on this document, or null (angle-cuts
 * spec §6; AI-tapers spec §4.3). Their checks and joints are box-based throughout
 * (invariants 38, 41): a mitered frame's stock boxes overlap at its corners, so a
 * run would report a false overlap or cut into air. Joinery accepts tapers — the
 * taper-at-joint rule (`generate/joints/tapers.ts`) guards those. Refine still
 * refuses every angle cut until AI-tapers chunk 2. Decided before any mutation or call.
 */
export function angledRefusal(doc: SloydDocument, action: 'joinery' | 'refine'): string | null {
  if (action === 'joinery') {
    const names = angledParts(doc, ['taper']);
    if (names.length === 0) return null;
    return `Add joinery doesn't handle mitered, bevelled or chamfered parts yet (${shown(names)}). Add joinery first, or remove those angles.`;
  }
  const names = angledParts(doc);
  if (names.length === 0) return null;
  return `Refine doesn't handle angled parts yet (${shown(names)}). Refine before tapering, or remove the angles first.`;
}

/** One tapered part whose taper runs into a joint (AI-tapers spec §4.1). Indices are flat-document board indices. */
export interface TaperConflict {
  part: number;
  other: number;
  /** The taper's thin end. */
  end: CutFrom;
  /** The joint's closest station to that end, inches; 0 when the joint is ON that end. */
  nearest: number;
}

/**
 * The person-facing refusal for taper conflicts (spec §4.1), one sentence per tapered part,
 * or null. Built here, not in generate/, because it is a string a person reads (→ units).
 */
export function taperJointRefusal(flat: FlatDocument, conflicts: readonly TaperConflict[]): string | null {
  if (conflicts.length === 0) return null;
  const f = (n: number) => formatLength(n, flat.units.precision);
  return conflicts.map(({ part, other, end, nearest }) => {
    const name = flat.boards[part]!.name;
    const joint = flat.boards[other]!.name;
    return nearest === 0
      ? `${name}'s taper runs to ${faceName('length', end)}, where it joins ${joint} — taper the other end, or remove it.`
      : `${name}'s taper runs into its joint with ${joint} — start it at ${f(nearest)} or less from ${faceName('length', end)}, or remove it.`;
  }).join(' ');
}
