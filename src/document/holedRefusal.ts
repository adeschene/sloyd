import type { FlatDocument } from './types';

/** Flat (display) names of the placed parts carrying any hole row. */
export function holedParts(flat: FlatDocument): string[] {
  return flat.boards.filter((b) => b.holes.length > 0).map((b) => b.name);
}

const list = (names: string[]) => `${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}`;

/**
 * The refusal for a document with holes (holes spec §6), or null. Decided at entry, before any mutation or paid call.
 * Joinery is box-based and would cut a pocket through a hole; Refine cannot describe one.
 */
export function holedRefusal(flat: FlatDocument, action: 'joinery' | 'refine'): string | null {
  const names = holedParts(flat);
  if (names.length === 0) return null;
  return action === 'joinery'
    ? `Add joinery doesn't handle parts with holes yet (${list(names)}). Add joinery before drilling, or remove the holes first.`
    : `Refine doesn't handle parts with holes yet (${list(names)}). Refine before drilling, or remove the holes first.`;
}
