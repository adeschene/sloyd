import type { Board, Rotation, SloydDocument, StoredBoard } from './types';
import { sameShared } from './links';
import { linksToShapes } from './linksToShapes';
import { dissolveShapes, isShaped, pruneShapes } from './shapes';
import { sameAngleCut } from './angleCuts';
import { axisDimensions, boardExtents } from './geometry';
import { nextId } from './ids';
import { taperCutsFor, worldTapers } from './taperWorld';
import { angleCutsFor, angleRatiosOf, worldAngles } from './angleWorld';

const TURNS: readonly Rotation[] = [0, 90, 180, 270];

/**
 * The part re-stored at each OTHER quarter turn that leaves the world part unchanged (turned-links spec §2.2): the same
 * world box (so the same min corner, inv 2), the grain on the same world axis, and its tapers, miters, bevels and chamfers
 * re-stored on the same world faces through taperWorld and angleWorld (inv 44). None for a part with rectangular cuts or holes, or
 * a cut either cannot describe.
 */
export function turnCandidates(b: Board): Board[] {
  if (b.cuts.length > 0 || b.holes.length > 0) return [];
  const world = worldTapers(b);
  const angles = worldAngles(b);
  if (world === null || angles === null) return [];
  // Re-stored with the part's OWN slopes (exact-angle map), so a turned candidate can equal its representative exactly.
  const exact = angleRatiosOf([b]);
  const box = boardExtents(b);
  const grainAxis = axisDimensions(b).indexOf(b.grain);
  return TURNS.filter((r) => r !== b.rotation).flatMap((rotation): Board[] => {
    const t: Board = { ...b, rotation };
    if (boardExtents(t).some((v, i) => v !== box[i]) || axisDimensions(t).indexOf(b.grain) !== grainAxis) return [];
    const made = taperCutsFor(t, world);
    if ('fault' in made) return [];
    const more = angleCutsFor(t, angles, exact);
    if ('fault' in more) return [];
    return [{ ...t, angleCuts: [...made.cuts, ...more.cuts].map((c, i) => ({ id: b.angleCuts[i]?.id ?? nextId(), ...c })) }];
  });
}

/**
 * `b` judged against a class representative (spec §2.3, amended): ids are not geometry, so a part whose angle cuts equal
 * the representative's (sameAngleCut, index by index) takes its ids first. Null when `sameShared` still says no. A part
 * with no angle cuts is judged as it is: the same object, so untapered linking is unchanged.
 */
export function alignedTo(rep: Board, b: Board): Board | null {
  if (b.angleCuts.length === 0) return sameShared(rep, b) ? b : null;
  if (b.angleCuts.length !== rep.angleCuts.length || !b.angleCuts.every((c, i) => sameAngleCut(c, rep.angleCuts[i]!))) return null;
  const a: Board = { ...b, angleCuts: b.angleCuts.map((c, i) => ({ ...c, id: rep.angleCuts[i]!.id })) };
  return sameShared(rep, a) ? a : null;
}

/**
 * Generation's components (generate-assemblies spec §4): parts the model gave
 * the same ROLE whose shared fields are EXACTLY equal (`sameShared`, invariant
 * 18) become users of one Shape. Each role is split into classes of equal
 * parts, labelled `role#k`, and the labels go to `linksToShapes` — the ONE
 * label→shape builder (invariant 45) — so nothing here decides equality but
 * `sameShared`. Users are STORED parts: a part inside a definition counts once
 * however often it is placed, and a one-user shape dissolves.
 *
 * Each part is judged with its angle-cut ids aligned to the class representative's (ids are not geometry) and, when it
 * does not match as it stands, at each quarter turn that leaves the world part unchanged (turned-links spec, fu 301).
 *
 * `roles` maps a stored part id to its normalised role. Runs on a migrated
 * document; nothing in it is stored, so the role never reaches the file.
 */
export function linkByRole(doc: SloydDocument, roles: ReadonlyMap<string, string>): SloydDocument {
  if (roles.size === 0) return doc;
  const stored: StoredBoard[] = [...doc.boards, ...doc.definitions.flatMap((x) => x.boards)];
  const classes = new Map<string, Board[]>(); // role → one representative per class
  const labels = new Map<StoredBoard, string>();
  const replaced = new Map<StoredBoard, Board>(); // stored part → the aligned or turned part stored in its place
  for (const b of stored) {
    if (isShaped(b)) continue;
    const role = roles.get(b.id);
    if (!role) continue;
    const reps = classes.get(role) ?? [];
    classes.set(role, reps);
    let k = -1;
    let use: Board = b;
    for (let i = 0; i < reps.length && k < 0; i += 1) {
      // The part itself first, then each candidate in 0/90/180/270 order (spec §2.3).
      const hit = alignedTo(reps[i]!, b) ?? turnCandidates(b).map((c) => alignedTo(reps[i]!, c)).find((x) => x !== null) ?? null;
      if (hit) { k = i; use = hit; }
    }
    if (k < 0) { k = reps.length; reps.push(b); }
    if (use !== b) replaced.set(b, use);
    labels.set(use, `${role}#${k}`);
  }
  const swap = (bs: StoredBoard[]) => bs.map((b) => replaced.get(b) ?? b);
  const next: SloydDocument = replaced.size === 0 ? doc
    : { ...doc, boards: swap(doc.boards), definitions: doc.definitions.map((x) => ({ ...x, boards: swap(x.boards) })) };
  return dissolveShapes(pruneShapes(linksToShapes(next, labels)));
}