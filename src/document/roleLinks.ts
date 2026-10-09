import type { Board, SloydDocument, StoredBoard } from './types';
import { sameShared } from './links';
import { linksToShapes } from './linksToShapes';
import { dissolveShapes, isShaped, pruneShapes } from './shapes';

/**
 * Generation's components (generate-assemblies spec §4): parts the model gave
 * the same ROLE whose shared fields are EXACTLY equal (`sameShared`, invariant
 * 18) become users of one Shape. Each role is split into classes of equal
 * parts, labelled `role#k`, and the labels go to `linksToShapes` — the ONE
 * label→shape builder (invariant 45) — so nothing here decides equality but
 * `sameShared`. Users are STORED parts: a part inside a definition counts once
 * however often it is placed, and a one-user shape dissolves.
 *
 * `roles` maps a stored part id to its normalised role. Runs on a migrated
 * document; nothing in it is stored, so the role never reaches the file.
 */
export function linkByRole(doc: SloydDocument, roles: ReadonlyMap<string, string>): SloydDocument {
  if (roles.size === 0) return doc;
  const stored: StoredBoard[] = [...doc.boards, ...doc.definitions.flatMap((x) => x.boards)];
  const classes = new Map<string, Board[]>(); // role → one representative per class
  const labels = new Map<StoredBoard, string>();
  for (const b of stored) {
    if (isShaped(b)) continue;
    const role = roles.get(b.id);
    if (!role) continue;
    const reps = classes.get(role) ?? [];
    classes.set(role, reps);
    let k = reps.findIndex((r) => sameShared(r, b));
    if (k < 0) { k = reps.length; reps.push(b); }
    labels.set(b, `${role}#${k}`);
  }
  return dissolveShapes(pruneShapes(linksToShapes(doc, labels)));
}
