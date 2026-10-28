import type { SloydDocument } from './document';
import type { Lift, Rekey } from './treeOps';

/**
 * Saved views follow Group / Ungroup (saved views spec §2): every view's `hidden` ids are re-keyed exactly as the
 * live hidden set is (`rekeyHeld`) — per id `lift(id) ?? [rekey(id)]`, deduplicated, order kept. Returns the SAME
 * document when no view's `hidden` changes (inv 4: no work for nothing).
 */
export function rekeyViews(doc: SloydDocument, rekey: Rekey, lift: Lift = () => null): SloydDocument {
  let changed = false;
  const views = doc.views.map((v) => {
    const hidden = [...new Set(v.hidden.flatMap((id) => lift(id) ?? [rekey(id)]))];
    if (hidden.length === v.hidden.length && hidden.every((id, i) => id === v.hidden[i])) return v;
    changed = true;
    return { ...v, hidden };
  });
  return changed ? { ...doc, views } : doc;
}
