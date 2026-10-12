import type { SloydDocument } from './types';
import { flatDocument } from './tree';

/** Flat display names of every placed part carrying an angle cut, in document order. */
export function angledParts(doc: SloydDocument): string[] {
  return flatDocument(doc).boards.filter((b) => b.angleCuts.length > 0).map((b) => b.name);
}

const WHAT = { joinery: 'Add joinery', refine: 'Refine' } as const;

/**
 * Why Add joinery or Refine will not run on this document, or null (angle-cuts
 * spec §6). Their checks and joints are box-based throughout (invariants 38,
 * 41): a mitered frame's stock boxes overlap at its corners, so a run would
 * report a false overlap or cut into air. Decided before any mutation or call.
 */
export function angledRefusal(doc: SloydDocument, action: 'joinery' | 'refine'): string | null {
  const names = angledParts(doc);
  if (names.length === 0) return null;
  const shown = names.length > 3 ? `${names.slice(0, 3).join(', ')}…` : names.join(', ');
  return `${WHAT[action]} doesn't handle angled parts yet (${shown}). ${WHAT[action]} before tapering, or remove the angles first.`;
}
