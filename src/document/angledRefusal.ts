import type { AngleKind, SloydDocument } from './types';
import { flatDocument } from './tree';

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
