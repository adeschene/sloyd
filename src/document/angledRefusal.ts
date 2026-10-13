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
 * Why Refine will not run on this document, or null (angle-cuts spec §6; AI-tapers spec §4.3). Refine's checks and joints
 * are box-based (invariants 38, 41): it accepts tapers it can describe exactly (`documentToDesign` refuses the rest) and
 * refuses every other kind (AI-angles chunk 2 lifts that). Decided before any call. Joinery no longer reads this: its
 * refusal is `jointRefusal` (AI-angles spec §3).
 */
export function angledRefusal(doc: SloydDocument, _action: 'refine'): string | null {
  const names = angledParts(doc, ['taper']);
  if (names.length === 0) return null;
  return `Refine doesn't handle mitered, beveled or chamfered parts yet (${shown(names)}). Refine before cutting those angles, or remove them.`;
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
  const p = flat.units.precision;
  return conflicts.map(({ part, other, end, nearest }) => {
    const name = flat.boards[part]!.name;
    const joint = flat.boards[other]!.name;
    // The advice is a LIMIT, so it is floored to the display grid (ticks of 1/p in), never
    // rounded: a patch at 23.47 must read 23-7/16", not 23-1/2" (which would be refused again).
    // The 1e-9 is float noise only (invariant 22). Within one tick of the end, the joint is
    // read as joining at that end.
    const limit = Math.floor(nearest * p + 1e-9) / p;
    return limit === 0
      ? `${name}'s taper runs to ${faceName('length', end)}, where it joins ${joint} — taper the other end, or remove it.`
      : `${name}'s taper runs into its joint with ${joint} — start it at ${formatLength(limit, p)} or less from ${faceName('length', end)}, or remove it.`;
  }).join(' ');
}

/** One miter, bevel or chamfer reaching into a joint (AI-angles spec §3). Indices are flat-document board indices. */
export interface AngleConflict {
  part: number;
  other: number;
  kind: 'miter' | 'bevel' | 'chamfer';
}

/**
 * THE person-facing joint refusal (AI-angles spec §3): one sentence per part, in part order — a taper conflict's sentence
 * (`taperJointRefusal`, unchanged) when the part has one, else its angle conflict's. Null when there is neither.
 */
export function jointRefusal(flat: FlatDocument, tapers: readonly TaperConflict[], angles: readonly AngleConflict[]): string | null {
  const text = new Map<number, string>();
  for (const c of tapers) text.set(c.part, taperJointRefusal(flat, [c])!);
  for (const c of angles) {
    if (text.has(c.part)) continue;
    text.set(c.part, `${flat.boards[c.part]!.name}'s ${c.kind} runs into its joint with ${flat.boards[c.other]!.name} — add joinery before cutting it, or remove it.`);
  }
  if (text.size === 0) return null;
  return [...text.keys()].sort((a, b) => a - b).map((p) => text.get(p)!).join(' ');
}
