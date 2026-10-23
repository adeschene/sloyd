import type { Board, Rotation, SloydDocument, StoredBoard } from './types';
import { sameShared } from './links';
import { linksToShapes } from './linksToShapes';
import { dissolveShapes, isShaped, pruneShapes } from './shapes';
import { sameAngleCut } from './angleCuts';
import { axisDimensions, boardExtents } from './geometry';
import { nextId } from './ids';
import { taperCutsFor, worldTapers } from './taperWorld';
import { angleCutsFor, angleRatiosOf, worldAngles } from './angleWorld';
import { holeRowsFor, sortHoleRows, worldHoles } from './holeWorld';
import { sameHoleRow } from './holes';
import { BUILT_IN_BAND_ID } from './bandModel';
import { bandsFor, worldBands } from './bandWorld';

const TURNS: readonly Rotation[] = [0, 90, 180, 270];

/**
 * The part re-stored at each OTHER quarter turn that leaves the world part unchanged (turned-links spec §2.2): the same
 * world box (so the same min corner, inv 2), the grain on the same world axis, and its tapers, miters, bevels and chamfers
 * re-stored on the same world faces through taperWorld and angleWorld (inv 44), and its hole rows through worldHoles and
 * holeRowsFor (AI-holes spec §5): canonical, every number kept exactly as the part's world reading gives it (never put on
 * the hole grid), each row taking an id by index from the part's own rows sorted canonically — POSITIONAL only: the turned
 * frame's canonical order can differ from the original's, so an id may land on another row; harmless, because `alignedTo`
 * overwrites every hole id with the representative's before the candidate is used (final review M4). None for a part with
 * rectangular cuts, curves or profiles. Bands (AI-bands spec §5) are re-stored on the same world edges through worldBands
 * and bandsFor (inv 44; bands carry no ids, so alignedTo needs no alignment for them). No candidate at a turn where a
 * cut, hole row or band has no stored form.
 */
export function turnCandidates(b: Board): Board[] {
  if (b.cuts.length > 0 || b.curves.length > 0 || b.profiles.length > 0) return [];
  const world = worldTapers(b);
  const angles = worldAngles(b);
  if (world === null || angles === null) return [];
  // Re-stored with the part's OWN slopes (exact-angle map), so a turned candidate can equal its representative exactly.
  const exact = angleRatiosOf([b]);
  const holes = worldHoles(b);
  const holeExact = new Set(holes.flatMap((r) => [r.diameter, r.depth, r.pitch, r.offset.x, r.offset.y, r.offset.z]));
  const bandEntries = worldBands(b);
  const bandId = (key: string) => (key === 'veneer' ? BUILT_IN_BAND_ID : key);
  const holeIds = sortHoleRows(b.holes).map((r) => r.id);
  const box = boardExtents(b);
  const grainAxis = axisDimensions(b).indexOf(b.grain);
  return TURNS.filter((r) => r !== b.rotation).flatMap((rotation): Board[] => {
    const t: Board = { ...b, rotation };
    if (boardExtents(t).some((v, i) => v !== box[i]) || axisDimensions(t).indexOf(b.grain) !== grainAxis) return [];
    const made = taperCutsFor(t, world);
    if ('fault' in made) return [];
    const more = angleCutsFor(t, angles, exact);
    if ('fault' in more) return [];
    const rows = holeRowsFor(t, holes, holeExact);
    if ('fault' in rows) return [];
    const edged = bandsFor(t, bandEntries, bandId);
    if ('fault' in edged) return [];
    return [{ ...t, bands: edged.bands, angleCuts: [...made.cuts, ...more.cuts].map((c, i) => ({ id: b.angleCuts[i]?.id ?? nextId(), ...c })),
      holes: rows.rows.map((r, i) => ({ id: holeIds[i] ?? nextId(), ...r })) }];
  });
}

/**
 * `b` judged against a class representative (spec §2.3, amended; AI-holes spec §5): ids are not geometry, so a part whose
 * angle cuts (sameAngleCut) and hole rows (sameHoleRow, HOLE_FIELDS without `id`) equal the representative's, index by
 * index, takes its ids first. Null when `sameShared` still says no. A part with no angle cuts and no hole rows is judged
 * as it is: the same object, so plain linking is unchanged.
 */
export function alignedTo(rep: Board, b: Board): Board | null {
  if (b.angleCuts.length === 0 && b.holes.length === 0) return sameShared(rep, b) ? b : null;
  if (b.angleCuts.length !== rep.angleCuts.length || !b.angleCuts.every((c, i) => sameAngleCut(c, rep.angleCuts[i]!))) return null;
  if (b.holes.length !== rep.holes.length || !b.holes.every((r, i) => sameHoleRow(r, rep.holes[i]!))) return null;
  const a: Board = { ...b, angleCuts: b.angleCuts.map((c, i) => ({ ...c, id: rep.angleCuts[i]!.id })),
    holes: b.holes.map((r, i) => ({ ...r, id: rep.holes[i]!.id })) };
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
 * Each part is judged with its angle-cut and hole-row ids aligned to the class representative's (ids are not geometry) and, when it
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