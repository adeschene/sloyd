import type { Board, Shape, ShapedBoard, SloydDocument, StoredBoard } from './types';
import { SHARED_KEYS } from './links';
import { copyAngleCut } from './angleCuts';
import { copyCurve } from './curves';
import { copyProfile } from './profiles';
import { copyHoleRow } from './holes';
import type { SharedField } from './links';

/** A stored part that uses a Shape. A plain part always has `length`; a shaped one never does. */
export function isShaped(b: StoredBoard): b is ShapedBoard {
  return !('length' in b);
}

export function shapeMap(doc: Pick<SloydDocument, 'shapes'>): Map<string, Shape> {
  return new Map(doc.shapes.map((s) => [s.id, s]));
}

/**
 * THE place a shape is read into a part (components spec §2.1). A plain part
 * comes back as the same object; a shaped part as a full Board carrying
 * `shape`, its cuts copied so no two parts hold one Cut object. Null when the
 * shape is missing (the load repair drops such a part).
 */
export function resolveBoard(shapes: ReadonlyMap<string, Shape>, b: StoredBoard): Board | null {
  if (!isShaped(b)) return b;
  const s = shapes.get(b.shape);
  if (!s) return null;
  // The shared part from THE table (invariant 45's LINK_FIELDS), never a hand
  // list: a future shared field reaches every user without an edit here. An
  // optional field the shape lacks stays absent rather than `undefined`.
  // The own fields are the stored part's own, so the literal stays checked by tsc.
  const shared: Record<string, unknown> = {};
  for (const k of SHARED_KEYS) {
    if (!(k in s)) continue;
    shared[k] = k === 'cuts' ? s.cuts.map((c) => ({ ...c })) : k === 'angleCuts' ? s.angleCuts.map(copyAngleCut) : k === 'holes' ? s.holes.map(copyHoleRow) : k === 'curves' ? s.curves.map(copyCurve) : k === 'profiles' ? s.profiles.map(copyProfile) : s[k];
  }
  const { shape, ...own } = b;
  return { ...own, ...(shared as Pick<Board, SharedField>), shape };
}

/** Stored users per shape id (a part placed by several copies counts once). */
export function shapeUsers(doc: Pick<SloydDocument, 'boards' | 'definitions'>): Map<string, number> {
  const n = new Map<string, number>();
  for (const b of [...doc.boards, ...doc.definitions.flatMap((d) => d.boards)]) {
    if (isShaped(b)) n.set(b.shape, (n.get(b.shape) ?? 0) + 1);
  }
  return n;
}

export function pruneShapes(doc: SloydDocument): SloydDocument {
  const used = shapeUsers(doc);
  const kept = doc.shapes.filter((s) => used.has(s.id));
  return kept.length === doc.shapes.length ? doc : { ...doc, shapes: kept };
}

/** A resolved part as a stored plain part: no `shape` key. */
export function plainOf(b: Board): Board {
  const { shape: _shape, ...rest } = b;
  return rest;
}

/** A shape with ONE stored user is not shared: the user becomes plain (cut ids kept). */
export function dissolveShapes(doc: SloydDocument): SloydDocument {
  const used = shapeUsers(doc);
  const lone = new Set([...used].filter(([, n]) => n === 1).map(([id]) => id));
  if (lone.size === 0) return doc;
  const shapes = shapeMap(doc);
  const fix = (bs: StoredBoard[]) => bs.map((b) => (isShaped(b) && lone.has(b.shape) ? plainOf(resolveBoard(shapes, b)!) : b));
  return pruneShapes({ ...doc, boards: fix(doc.boards), definitions: doc.definitions.map((d) => ({ ...d, boards: fix(d.boards) })) });
}
