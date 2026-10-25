import type { Board, Rotation, SloydDocument, StoredBoard } from './types';
import { sameShared } from './links';
import { linksToShapes } from './linksToShapes';
import { dissolveShapes, isShaped, pruneShapes, shapeUsers } from './shapes';
import { mirrorFeatures } from './frames';
import { CUT_GEOMETRY_KEYS } from './cuts';
import { sameAngleCut } from './angleCuts';
import { axisDimensions, boardExtents } from './geometry';
import { nextId } from './ids';
import { taperCutsFor, worldTapers } from './taperWorld';
import { angleCutsFor, angleRatiosOf, worldAngles } from './angleWorld';
import { holeRowsFor, sortHoleRows, worldHoles } from './holeWorld';
import { sameHoleRow } from './holes';
import { hasTenons, sameTenon } from './roundTenons';
import { BUILT_IN_BAND_ID } from './bandModel';
import { bandsFor, worldBands } from './bandWorld';
import { profilesFor, sortProfiles, worldProfiles } from './profileWorld';
import { carriesProfiles } from './featureCarry';
import { keepsExactly } from './leanKeep';
import { sameCurve } from './curves';
import { runDim, sameProfile } from './profiles';

const TURNS: readonly Rotation[] = [0, 90, 180, 270];

/**
 * The part re-stored at each OTHER quarter turn that leaves the world part unchanged (turned-links spec §2.2): the same
 * world box (so the same min corner, inv 2), the grain on the same world axis, and its tapers, miters, bevels and chamfers
 * re-stored on the same world faces through taperWorld and angleWorld (inv 44), and its hole rows through worldHoles and
 * holeRowsFor (AI-holes spec §5): canonical, every number kept exactly as the part's world reading gives it (never put on
 * the hole grid), each row taking an id by index from the part's own rows sorted canonically — POSITIONAL only: the turned
 * frame's canonical order can differ from the original's, so an id may land on another row; harmless, because `alignedTo`
 * overwrites every hole id with the representative's before the candidate is used (final review M4). None for a part with
 * rectangular cuts, curves, carried profiles or a lean (final review M1) (AI-profiles spec §5: a one-side run or a loop turns, re-stored through
 * worldProfiles and profilesFor with an exact set, ids by index; a two-side run never). Bands (AI-bands spec §5) are re-stored on the same world edges through worldBands
 * and bandsFor (inv 44; bands carry no ids, so alignedTo needs no alignment for them). No candidate at a turn where a
 * cut, hole row or band has no stored form.
 */
export function turnCandidates(b: Board): Board[] {
  // A leaning part has none (final review M1): its lean is stored in the turn-0 frame, so `{ ...b, rotation }` would
  // re-aim the leg; it links by its own form and its mirror only (splayed legs §3.4).
  // A tenoned part has none, through `keepsExactly` (round tenons spec §3.1; plan Task 10): its tenons name ends of the stored length, so a turn
  // that reverses the length in the world (a flat part's 180°) would carry each tenon to the other world end.
  if (b.cuts.length > 0 || carriesProfiles(b) || keepsExactly(b)) return [];
  const shown = worldProfiles(b);
  if (shown === null) return [];
  const profileExact = new Set(shown.flatMap((p) => [p.size, p.fillet, p.depth, p.start, p.end]));
  // The part's own stored station distances and their L − at counterparts: a turn re-stores an exact one as itself.
  const known = b.profiles.flatMap((p) => ('loop' in p.run ? [] : [p.run.start, p.run.end].flatMap((e) =>
    ('at' in e ? [e.at, b[runDim(e.side)] - e.at] : []))));
  const profileIds = sortProfiles(b.profiles).map((p) => p.id);
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
    const made2 = profilesFor(t, shown, profileExact, known);
    if ('fault' in made2) return [];
    return [{ ...t, bands: edged.bands, profiles: made2.profiles.map((p, i) => ({ id: profileIds[i] ?? nextId(), ...p })), angleCuts: [...made.cuts, ...more.cuts].map((c, i) => ({ id: b.angleCuts[i]?.id ?? nextId(), ...c })),
      holes: rows.rows.map((r, i) => ({ id: holeIds[i] ?? nextId(), ...r })) }];
  });
}

/**
 * The part as a MIRRORED user would store it (mirrored-links spec §5.1, fu 432; controller Ruling 1): the part itself and
 * each of its turn candidates, its features reflected along `mirrorDim` (flag flips, `mirrorFeatures`) and flagged. A
 * flagged part at turn r' draws R(r')·M·S; with S = M·(t's features) that is R(r')·t, the turn candidate's world, which is
 * `b`'s own world. So a candidate that `alignedTo` a representative makes `b` a mirrored user of its Shape with nothing in
 * the world moved. A curved or carried-profile part has no turns, so only its unturned candidate. A part whose rectangular
 * cuts do not come back EXACTLY through two mirrors (`mirrorCut` is size-based) has none: the round trip would move wood.
 */
export function mirrorCandidates(b: Board): Board[] {
  const twice = mirrorFeatures(mirrorFeatures(b));
  if (!b.cuts.every((c, i) => CUT_GEOMETRY_KEYS.every((k) => c[k] === twice.cuts[i]![k]))) return [];
  return [b, ...turnCandidates(b)].map((t): Board => ({ ...mirrorFeatures(t), mirrored: true }));
}

/** `xs` permuted into `ref`'s order when the two match one to one under `same`; else `xs` as it is. */
function permutedLike<T>(ref: readonly T[], xs: T[], same: (a: T, b: T) => boolean): T[] {
  if (ref.length !== xs.length) return xs;
  const left = [...xs];
  const out: T[] = [];
  for (const r of ref) {
    const j = left.findIndex((x) => same(r, x));
    if (j < 0) return xs;
    out.push(left.splice(j, 1)[0]!);
  }
  return out;
}

/**
 * A mirror candidate's feature lists in the representative's ORDER (mirrored-links spec §5.1): a mirror keeps each list's
 * order while reflecting its entries, so rows a canonical sort put first can come second. Order is not geometry; each list
 * is reordered only when it matches the representative's one to one, exactly, so `alignedTo` and `sameShared` judge it
 * as they judge any part.
 */
function inOrderOf(rep: Board, c: Board): Board {
  return { ...c, angleCuts: permutedLike(rep.angleCuts, c.angleCuts, sameAngleCut), holes: permutedLike(rep.holes, c.holes, sameHoleRow),
    curves: permutedLike(rep.curves, c.curves, sameCurve), profiles: permutedLike(rep.profiles, c.profiles, sameProfile) };
}

/**
 * `b` judged against a class representative (spec §2.3, amended; AI-holes spec §5): ids are not geometry, so a part whose
 * angle cuts (sameAngleCut) and hole rows (sameHoleRow, HOLE_FIELDS without `id`) equal the representative's, index by
 * index, takes its ids first. Null when `sameShared` still says no. A part with no angle cuts and no hole rows is judged
 * as it is: the same object, so plain linking is unchanged.
 */
export function alignedTo(rep: Board, b: Board): Board | null {
  if (b.angleCuts.length === 0 && b.holes.length === 0 && b.profiles.length === 0 && !hasTenons(b)) return sameShared(rep, b) ? b : null;
  if (b.angleCuts.length !== rep.angleCuts.length || !b.angleCuts.every((c, i) => sameAngleCut(c, rep.angleCuts[i]!))) return null;
  if (b.holes.length !== rep.holes.length || !b.holes.every((r, i) => sameHoleRow(r, rep.holes[i]!))) return null;
  if (b.profiles.length !== rep.profiles.length || !b.profiles.every((p, i) => sameProfile(p, rep.profiles[i]!))) return null;
  // Tenons (round tenons spec §3.1) in canonical order, so index pairing is end pairing.
  const bt = b.tenons ?? [];
  const rt = rep.tenons ?? [];
  if (bt.length !== rt.length || !bt.every((t, i) => sameTenon(t, rt[i]!))) return null;
  const a: Board = { ...b, ...(bt.length > 0 ? { tenons: bt.map((t, i) => ({ ...t, id: rt[i]!.id })) } : {}), profiles: b.profiles.map((p, i) => ({ ...p, id: rep.profiles[i]!.id })), angleCuts: b.angleCuts.map((c, i) => ({ ...c, id: rep.angleCuts[i]!.id })),
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
 * does not match as it stands, at each quarter turn that leaves the world part unchanged (turned-links spec, fu 301), and
 * then as each mirror candidate: a hit stores it as a MIRRORED user of the class's Shape (mirrored-links spec §5.1, fu 432).
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
      // The part itself first, then each candidate in 0/90/180/270 order (spec §2.3), then its mirror candidates
      // (mirrored-links spec §5.1): unmirrored always first, so a symmetric part is never stored mirrored.
      const hit = alignedTo(reps[i]!, b) ?? turnCandidates(b).map((c) => alignedTo(reps[i]!, c)).find((x) => x !== null)
        ?? mirrorCandidates(b).map((c) => alignedTo(reps[i]!, inOrderOf(reps[i]!, c))).find((x) => x !== null) ?? null;
      if (hit) { k = i; use = hit; }
    }
    if (k < 0) { k = reps.length; reps.push(b); }
    if (use !== b) replaced.set(b, use);
    labels.set(use, `${role}#${k}`);
  }
  const swap = (bs: StoredBoard[]) => bs.map((b) => replaced.get(b) ?? b);
  const next: SloydDocument = replaced.size === 0 ? doc
    : { ...doc, boards: swap(doc.boards), definitions: doc.definitions.map((x) => ({ ...x, boards: swap(x.boards) })) };
  const linked = pruneShapes(linksToShapes(next, labels));
  // A mirror candidate is stored only as a mirrored user of a SHARED Shape (spec §5.1): one left plain by linksToShapes, or
  // the lone user of its Shape, goes back to the ORIGINAL part, so no plain part carries reflected features or the flag.
  // linksToShapes keeps every array's order, so its records pair with `next`'s by index.
  const mirrored = new Map([...replaced].filter(([, c]) => c.mirrored === true).map(([b, c]) => [c as StoredBoard, b]));
  if (mirrored.size === 0) return dissolveShapes(linked);
  const users = shapeUsers(linked);
  const restore = (before: StoredBoard[], after: StoredBoard[]) => after.map((a, i) => {
    const original = mirrored.get(before[i]!);
    return original === undefined || (isShaped(a) && (users.get(a.shape) ?? 0) > 1) ? a : original;
  });
  return dissolveShapes(pruneShapes({ ...linked, boards: restore(next.boards, linked.boards),
    definitions: linked.definitions.map((x, j) => ({ ...x, boards: restore(next.definitions[j]!.boards, x.boards) })) }));
}