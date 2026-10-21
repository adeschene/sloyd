import type { FlatDocument } from './types';

/** Flat (display) names of the placed parts carrying any hole row. */
export function holedParts(flat: FlatDocument): string[] {
  return flat.boards.filter((b) => b.holes.length > 0).map((b) => b.name);
}

const list = (names: string[]) => `${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}`;

/**
 * The refusal for a document with holes (holes spec §6), or null. Decided at entry, before any mutation or paid call.
 * Refine cannot describe a hole. (Add joinery no longer refuses: it rules out only the joints a hole is in the way of.)
 */
export function holedRefusal(flat: FlatDocument, _action: 'refine'): string | null {
  const names = holedParts(flat);
  if (names.length === 0) return null;
  return `Refine doesn't handle parts with holes yet (${list(names)}). Refine before drilling, or remove the holes first.`;
}
