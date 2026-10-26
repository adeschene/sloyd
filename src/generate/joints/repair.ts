import { definitionAt, flatDocument, instanceAt, itemPaths, lastSegment, migrateDocument, NAME_SEPARATOR, parentPath, PATH_SEPARATOR, worldParts, writeBackFlat } from '../../document/document';
import type { Board, Cut, FlatDocument, SloydDocument } from '../../document/document';
import { TOUCH, worldSolids } from '../../document/designCheck';
import { cutBox, gateUnjoin, readJoints, rejoin, sameCut } from './unjoin';
import { compoundRefusal, leaningRefusal, tenonRefusal } from './tapers';

/**
 * Repairing what joinery did before a899b51 (repair-joints spec §2, follow-up 240): twin
 * placements of one definition shared one `cuts` array, so every copy of a receiving part
 * carries every copy's pockets — duplicates, and phantoms where only one copy had the joint.
 * Subtractive: the stored parts with the bug's cuts removed and the rest put in re-join order,
 * proved by Refine's own gate. Pure; no model call.
 */
export const REPAIR_REFUSAL = "Sloyd can't repair this project's joints automatically — re-run Add joinery from the unjoined original.";

const ownName = (b: Board) => b.name.split(NAME_SEPARATOR).pop()!;
const refused = { refused: REPAIR_REFUSAL } as const;

/**
 * One storage key per part of `flatDocument(doc).boards`, in that order: the container's definition id
 * (empty for the root) and the part's leaf id. Two flat parts with equal keys are the SAME stored part
 * under different placements (ids are unique per container, invariant 33); a root part has no twin.
 */
export function storedKeys(doc: SloydDocument): string[] {
  return worldParts(doc).map((b) => {
    const parent = parentPath(b.id);
    return `${parent === null ? '' : definitionAt(doc, parent)?.id ?? `?${parent}`}\u0000${lastSegment(b.id)}`;
  });
}

/**
 * `stored` is `storedKeys` of the document `flat` came from, aligned with `flat.boards`: the flat list
 * alone cannot tell copies stored together from copies stored apart (spec §2 step 4).
 */
export function repairJoints(flat: FlatDocument, stored: readonly string[]): null | { boards: Board[]; dropped: number } | { refused: string } {
  if (stored.length !== flat.boards.length) throw new Error('repairJoints: one storage key per part');
  // Twins: the same stored part under different placements (ids kept through splits); the name
  // guards against unrelated parts sharing an id (ids are unique per container only).
  const key = (b: Board) => `${lastSegment(b.id)}\u0000${ownName(b)}`;
  const groups = new Map<string, number[]>();
  flat.boards.forEach((b, i) => groups.set(key(b), [...(groups.get(key(b)) ?? []), i]));
  const twins = flat.boards.map((b, i) => groups.get(key(b))!.filter((j) => j !== i));
  // 1. Pre-check.
  if (!flat.boards.some((b, i) => twins[i]!.length > 0 && b.cuts.length > 0)) return null;
  // 2. De-duplicate (first kept). Before the read-back: a doubled pocket hides its joint from it.
  let dropped = 0;
  const deduped = flat.boards.map((b, i) => {
    if (twins[i]!.length === 0) return b;
    const cuts = b.cuts.filter((c, k) => !b.cuts.slice(0, k).some((d) => sameCut(c, d)));
    dropped += b.cuts.length - cuts.length;
    return { ...b, cuts };
  });
  // 3. Lenient read-back.
  const read = readJoints({ ...flat, boards: deduped });
  if ('refused' in read) return dropped > 0 ? refused : null;
  const isUnexplained = (i: number, k: number) => read.unexplained.some((u) => u.part === i && u.cut === k);
  // 4. Twin strays: equal to a cut the reader explained on a twin that is the SAME STORED part (the
  // bug wrote the phantom into the part its twin's joint went into; a copy stored apart — Made Unique,
  // then edited — is not the bug's), AND empty — a phantom is a pocket nothing enters (a
  // hand-resized part's own pocket is filled, and must not be deleted).
  const solids = deduped.map(worldSolids);
  const empty = (part: number, c: Cut) => {
    const box = cutBox(deduped[part]!, c);
    return !solids.some((ss, j) => j !== part && ss.some((s) => [0, 1, 2].every((i) => Math.min(box.max[i]!, s.max[i]!) - Math.max(box.min[i]!, s.min[i]!) > TOUCH)));
  };
  const strays = read.unexplained.filter(({ part, cut }) => {
    const c = deduped[part]!.cuts[cut]!;
    return twins[part]!.some((t) => stored[t] === stored[part] && deduped[t]!.cuts.some((d, k) => !isUnexplained(t, k) && sameCut(c, d))) && empty(part, c);
  });
  // 7. Evidence first: no duplicate and no twin stray → not this bug's damage.
  if (dropped === 0 && strays.length === 0) return null;
  if (strays.length !== read.unexplained.length) return refused;
  dropped += strays.length;
  // 5. Prune, then put each part's surviving STORED cuts in the re-join's order.
  const again = rejoin({ ...flat, boards: read.plain }, read.joints);
  if (!again) return refused;
  const boards: Board[] = [];
  for (let i = 0; i < deduped.length; i++) {
    const left = deduped[i]!.cuts.filter((_, k) => !isUnexplained(i, k));
    const order = again.boards[i]!.cuts;
    if (order.length !== left.length) return refused;
    const cuts: Cut[] = [];
    for (const o of order) {
      const k = left.findIndex((c) => sameCut(c, o));
      if (k < 0) return refused;
      cuts.push(left.splice(k, 1)[0]!);
    }
    boards.push({ ...deduped[i]!, cuts });
  }
  // 6. Prove: Refine's gate, unchanged.
  if ('refused' in gateUnjoin({ ...flat, boards })) return refused;
  return { boards, dropped };
}

export type RepairCheck = null | { refused: string } | { doc: SloydDocument; dropped: number; splits: string[][] };

/** The repair written back into the tree (invariant 46), with the placements it un-shared. */
export function repairDocument(doc: SloydDocument): RepairCheck {
  // Runs inside the dialogs' memos: a throw would break their render, so it refuses instead and
  // keeps the cause on the console (follow-up 244).
  try {
    const flat = flatDocument(doc);
    // A leaning part (splayed legs spec §8): the read-back and re-join are box-based, so a project with joints to read and
    // a leaning part is refused in Repair's own words before either runs, by joinery's ONE decider (inv 41). One with no
    // cuts has nothing to repair (null), so a leaning prototype never shows a second refusal beside joinery's.
    // A part with a round tenon likewise (round tenons spec §9), after the lean, and then a part with a compound end cut
    // (square-set legs spec §4), as in `joineryRefusal`.
    const joined = flat.boards.some((b) => b.cuts.length > 0);
    const leaning = joined
      ? leaningRefusal('repair', flat) ?? tenonRefusal('repair', flat) ?? compoundRefusal('repair', flat)
      : null;
    if (leaning) return { refused: leaning };
    const r = repairJoints(flat, storedKeys(doc));
    if (r === null || 'refused' in r) return r;
    const out = migrateDocument(writeBackFlat(doc, flat.boards, r.boards));
    return { doc: out, dropped: r.dropped, splits: splitCopies(doc, out) };
  } catch (e) {
    console.error('Sloyd: repairing joints threw', e);
    return { refused: REPAIR_REFUSAL };
  }
}

const instanceName = (doc: SloydDocument, path: string) => {
  const segs = path.split(PATH_SEPARATOR);
  return segs.map((_, i) => instanceAt(doc, segs.slice(0, i + 1).join(PATH_SEPARATOR))!.name).join(NAME_SEPARATOR);
};

export function splitCopies(before: SloydDocument, after: SloydDocument): string[][] {
  const byDef = new Map<string, string[]>();
  for (const p of itemPaths(before)) {
    if (!instanceAt(before, p)) continue;
    const d = definitionAt(before, p)!.id;
    byDef.set(d, [...(byDef.get(d) ?? []), p]);
  }
  const out: string[][] = [];
  for (const paths of byDef.values()) {
    if (paths.length < 2) continue;
    if (new Set(paths.map((p) => definitionAt(after, p)?.id)).size > 1) out.push(paths.map((p) => instanceName(before, p)));
  }
  return out;
}
