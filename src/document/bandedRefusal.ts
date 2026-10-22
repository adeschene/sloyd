import type { FlatDocument } from './types';

/** Flat (display) names of the placed parts carrying any band. */
export function bandedParts(flat: FlatDocument): string[] {
  return flat.boards.filter((b) => b.bands.length > 0).map((b) => b.name);
}

const list = (names: string[]) => `${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}`;

/**
 * The refusal for a document with bands (edge banding spec §6), or null. Decided at entry, before any mutation or paid
 * call: Refine would drop the bands silently. (Add joinery and Repair no longer refuse: joinery rules out only the joints
 * a band is in the way of, joinery-features spec §3.)
 */
export function bandedRefusal(flat: FlatDocument, _action: 'refine'): string | null {
  const names = bandedParts(flat);
  if (names.length === 0) return null;
  return `Refine doesn't handle banded parts yet (${list(names)}). Refine before banding, or remove the bands first.`;
}
