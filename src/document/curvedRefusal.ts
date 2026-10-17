import type { FlatDocument } from './types';

/** Flat (display) names of the placed parts carrying any curve. */
export function curvedParts(flat: FlatDocument): string[] {
  return flat.boards.filter((b) => b.curves.length > 0 || b.profiles.length > 0).map((b) => b.name);
}

const list = (names: string[]) => `${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}`;

/**
 * The refusal for a document with curves (curves spec §7), or null. Decided at entry, before any mutation or paid call.
 * Joinery is box-based and would cut a pocket through a curve's waste; Refine cannot describe a curve.
 */
export function curvedRefusal(flat: FlatDocument, action: 'joinery' | 'refine'): string | null {
  const names = curvedParts(flat);
  if (names.length === 0) return null;
  return action === 'joinery'
    ? `Add joinery doesn't handle parts with curves yet (${list(names)}). Add joinery before cutting the curves, or remove them first.`
    : `Refine doesn't handle parts with curves yet (${list(names)}). Refine before cutting the curves, or remove them first.`;
}
