import type { FlatDocument } from './types';

/** Flat (display) names of the placed parts carrying any curve. */
export function curvedParts(flat: FlatDocument): string[] {
  return flat.boards.filter((b) => b.curves.length > 0 || b.profiles.length > 0).map((b) => b.name);
}

const list = (names: string[]) => `${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}`;

/**
 * The refusal for a document with curves or profiles (curves spec §7), or null. Decided at entry, before any mutation or
 * paid call. Refine cannot describe a curve. (Add joinery no longer refuses: it rules out only the joints a curve or
 * profile is in the way of.)
 */
export function curvedRefusal(flat: FlatDocument, _action: 'refine'): string | null {
  const names = curvedParts(flat);
  if (names.length === 0) return null;
  return `Refine doesn't handle parts with curves yet (${list(names)}). Refine before cutting the curves, or remove them first.`;
}
