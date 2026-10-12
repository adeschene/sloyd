import { MATERIALS, DEFAULT_MATERIAL, DEFAULT_KERF, isSheetGood } from './types';
import type {
  Board, Instance, Definition, Cut, AngleCut, AngleKind, CutFrom, Dimension, Rotation, Posture, Grain, SloydDocument, FlatDocument, GuidePoint,
  Shape, StoredBoard,
} from './types';
import type { SharedField } from './links';
import { dissolveShapes, pruneShapes, isShaped } from './shapes';
import { linksToShapes } from './linksToShapes';
import { ROOT_STORAGE_ID } from './treeEdit';
import { nextId } from './ids';
import { ANGLE_KINDS, deriveKind } from './angleCuts';
import { clamp, mirrorCutAlong } from './mirrorCut';
import { dropUnresolved, repairTree } from './treeRepair';
import { positionAxisOf, horizontalOf } from './geometry';

export * from './types';
export * from './links';
export * from './shapes';
export * from './frames';
export * from './tree';
export * from './treeEdit';
export * from './treeOps';
export {
  boardExtents, boardCenter, boardsBounds, reorientedPosition, axisDimensions, DIMENSION_ORDER, positionAxisOf,
  horizontalOf, axisFrame, toWorldOffset, fromWorldOffset, spanToWorldOffset, spanFromWorldOffset, endFacing,
} from './geometry';
export type { Bounds, AxisMap } from './geometry';
export { mirrorCut } from './mirrorCut';
export { CHAMFER_EDGES, bevelAcross, bevelCut, bevelFields, chamferCut, chamferFields, defaultBevel, defaultChamfer, ANGLE_CUT_FIELDS, ANGLE_CUT_KEYS, angleCutRemovesNothing, angleCutValues, angleCutsThatRemoveStock, copyAngleCut, defaultMiter, defaultMiterPair, defaultTaper, depthAt, keptHalfSpace, miterCut, miterDegrees, miterFields, miterRatio, sameAngleCut, taperCut, taperFields, throughOf, zeroStation } from './angleCuts';
export type { BevelFields, ChamferEdge, ChamferFields, MiterFields, TaperFields, V3 } from './angleCuts';
export { angledParts, angledRefusal } from './angledRefusal';
export { cleanName, uniqueName, dedupeNames } from './names';
export type { Named } from './names';
export { pocketEdges, pocketCells, CUT_GEOMETRY_FIELDS, CUT_GEOMETRY_KEYS, cutLabel, cutRegion, clippedRegion, cutShape, storedAsShape, cutRemovesNothing, cutsThatRemoveStock, pointToLocalXYZ, solidWorldBox, wholeBoard } from './cuts';
export type { CutKind, CutShape, Point, Segment } from './cuts';
export { BODY_EPS, boardBodies, boardEdges, bodyEdges, bodyVerts, bodyVolume, geometryKey, partGeometry, PART_GEOMETRY_LIMIT } from './bodies';
export type { PartGeometry } from './bodies';
export type { Body, BodyFace } from './bodies';
export { buildCutList } from './cutlist';
export { findTenons } from './tenons';
export type { Tenon } from './tenons';
export type { CutList, CutListGroup, CutListRow } from './cutlist';
export { buildDiagrams } from './diagram';
export type { DiagramCut, DiagramView } from './diagram';
export { buildDepthField } from './depthField';
export type { FaceCell } from './depthField';
export { buildNesting, footprintsOf } from './nesting';
export type { Nesting, NestedSheet, PlacedPart, UnplaceablePart, Footprint } from './nesting';
export { boardSnapPoints, cutSnapPoints, guideSnapPoints, offsetPoint, sameSnapPoint, snapPointsFor, tapeAxisFromKey, towardFor } from './snapPoints';
export type { BoardSnapPoint, SnapKind, SnapOwner, SnapPoint, TapeAxis } from './snapPoints';

/**
 * v5 added `stock.kerf`.
 *
 * Note the bump is NOT needed to upgrade an old file — an absent `stock`
 * simply defaults, exactly as an absent `units.precision` does. It is needed
 * for the gate at the OTHER end: without it, a v4 build would open a file
 * where the user set a 1/4" kerf, silently drop the field, and print a
 * different sheet count than the build that saved it. A wrong purchasing
 * number with no indication anything was lost.
 *
 * v6 added `guides`.
 *
 * v6's bump argument is NOT v5's, and the difference is worth keeping: v5
 * existed because a v4 build would drop a user-set kerf and print a DIFFERENT
 * SHEET COUNT — a wrong purchasing number with nothing indicating loss.
 * Guides produce no number at all; nothing on the cut list reads them. The
 * argument here is plain silent data loss on round-trip: a v5 build opens a
 * v6 file, drops every guide the user placed, autosaves, and they are gone.
 * Weaker consequence, same class, still exactly what the gate is for.
 *
 * v7 added `Cut.stopMin`/`stopMax` (stopped cuts: mortises, stopped dados).
 * Document-level in shape — no rawBoards.map step — because 0 is the correct
 * value for every older cut, all of which run fully across; validateCuts
 * defaults it. The bump's argument is WRONG GEOMETRY, stronger than v6's data
 * loss: a v6 build opening a v7 file would ignore the stops, show a blind
 * mortise as a through-dado with nothing saying so, and autosave that shape
 * back. The gate makes it refuse the file instead.
 *
 * v8 made rotation 90 a TRUE quarter turn and legalised 180 and 270 (quarter-turns
 * spec §4). `trueTurnsToV8` mirrors the cuts of 90° parts so they look exactly as
 * before. The bump's argument is WRONG GEOMETRY: a v7 build reads 180 and 270 as
 * invalid, falls back to 0, shows a different part and autosaves it.
 *
 * v9 added `Board.link`, the label of a linked-parts group (linking spec §2).
 * Document-level: no per-board step, an absent label is an unlinked part. The
 * bump's argument is SILENT DATA LOSS on round-trip: a v8 build drops every
 * `link` on open and autosaves, and the links are gone with nothing saying so.
 * (Links are now shapes: components spec §2.)
 *
 * v10 added assemblies: `instances` and `definitions` (assemblies spec §2.5).
 * Document-level: both default to `[]`, so no file needs upgrading. The bump's
 * argument is SILENT DATA LOSS on round-trip, stronger than v9's: a v9 build
 * drops both fields, so every part inside an assembly vanishes, and it
 * autosaves. `repairTree` runs after validation on every load (invariant 46).
 *
 * v11 added `shapes` and shared definitions (components spec §2.4): a shaped
 * part stores only its own fields and names a Shape, and several instances may
 * name one definition. The bump's argument is SILENT DATA LOSS, the strongest
 * yet: a v10 build would see shaped parts with no size and copy every shared
 * definition, silently un-sharing every component, then autosave. The v10 ->
 * v11 step turns each `link` label into one Shape (`linksToShapes`): members
 * equal to the label's first member in worldParts order use it, a differing
 * member stays plain and unlinked, and nothing moves. It runs AFTER validation
 * but BEFORE repairTree, because its input map is keyed by the stored objects
 * validateBoard returned and repairTree's name dedupe replaces renamed ones.
 * Guarded by `version < 11` (a v11 file's `link` is ignored), but unlike v8's
 * mirror it is not idempotence-sensitive: a v11 file carries no links, so
 * there is nothing a second run could change. Below v11, repairTree still
 * copies a definition placed twice (step 4); from v11 it keeps the sharing.
 *
 * v12 (follow-up 215): `axisFrame` reverses an on-edge part's thickness axis so
 * every posture has one hand. Same shape of harm as v8: a v11 build reads the
 * mirrored cuts in the old frame and silently shows wrong geometry. The v11 ->
 * v12 step (`onEdgeToV12`) mirrors each on-edge part's, definition's and
 * Shape's stored cuts along thickness, so world solids do not move. It runs
 * AFTER validation and `linksToShapes`, BEFORE repairTree, guarded by
 * `version < 12`, and like v8's mirror it is NOT idempotent.
 *
 * v13 (mirrored instances): `Instance.mirrored`, kept only when literally
 * `true`. No step: an absent flag is an unmirrored placement, so no file needs
 * upgrading. The bump's argument is WRONG GEOMETRY: a v12 build would drop
 * `mirrored` and draw the mirrored copy unmirrored, a second left cabinet where
 * the right one was, and autosave it.
 *
 * v14 added `Board.angleCuts` (angle-cuts spec §5.1): document-level, no step — an absent field defaults to [].
 * The harm of a v13 build is silent loss on round trip: it drops every angle cut and autosaves.
 */
export const CURRENT_VERSION = 14;

export class DocumentError extends Error {
  /**
   * Set when this error represents the user backing out of a picker
   * (e.g. cancelling the file-open dialog) rather than a genuine failure.
   * Callers should branch on this field, not on the message text — the
   * message is prose for humans and is not a stable contract.
   */
  readonly cancelled: boolean;

  constructor(message: string, options: { cancelled?: boolean } = {}) {
    super(message);
    this.name = 'DocumentError';
    this.cancelled = options.cancelled ?? false;
  }
}

// Exported so store.ts can mint a cut id the same way validateCuts re-mints
// one for a cut missing (or duplicating) an id on load — a monotonic
// counter, not a `Date.now()` + array-length scheme, because the latter can
// repeat: add a cut, remove it (array length back to 0), add another within
// the same millisecond, and both would get the same id. The `b_` prefix is
// cosmetic; validateCuts already hands cut ids this same generator.
export { nextId };

/**
 * The id this thing keeps, or a fresh one if it is missing or ALREADY TAKEN.
 *
 * The one home for the id-uniqueness rule, called by `validateBoard`,
 * `validateGuides` and `validateCuts` (follow-ups 97 and 131). `validateCuts`
 * had it inline first and the other two did not have it at all, which is the
 * gap this closes: `validateBoard` minted only when an id was MISSING, so two
 * boards both arriving as `id: 'a'` both kept it. That is not cosmetic —
 * `buildNesting`'s tiebreak (`a.id.localeCompare(b.id)`) needs a total order or
 * the sheet layout can reorder between renders, `SheetLayout` keys its groups by
 * board id, and for guides a duplicate makes `removeGuide` delete two rows at
 * once.
 *
 * THE FIRST OCCURRENCE KEEPS ITS ID; later duplicates are re-minted. Re-minting
 * ALL of them would satisfy every distinctness test just as well and would
 * quietly rewrite the ids in every file that was already correct — so the tests
 * pin the survivor by its literal value, not just the set's size.
 *
 * Re-minting a duplicate is safe precisely because nothing INSIDE a document
 * references a board or guide id: `Board.cuts` is inline and `GuidePoint` is
 * `{ id, at }`. Every id lookup in the app (`selectedIds`, `grabbed.owner.id`,
 * the `find` calls in the store and the viewport) reads runtime state that is
 * set after a load, so a re-mint cannot leave a dangling reference. A future
 * field that points at a board BY ID would break that and would need this to
 * become a two-pass rewrite instead.
 *
 * An id containing '/', the occurrence-path separator, is treated as taken
 * (assemblies spec §2.2).
 *
 * `seen.add` happens HERE rather than at the call sites. A caller that forgets
 * it turns the whole rule into a no-op — every id looks unseen — and no test
 * of the caller's own behaviour would notice.
 *
 * Not needed at creation time, unlike the four-place name enforcement of
 * invariant 8: `nextId` is a monotonic counter (see its comment) and import
 * replaces a document rather than merging into one, so load is the only place
 * two ids can collide.
 */
function takeId(raw: unknown, seen: Set<string>): string {
  const id = typeof raw === 'string' && raw && !raw.includes('/') && !seen.has(raw) ? raw : nextId();
  seen.add(id);
  return id;
}

/**
 * A board with defaults filled in. Deliberately unaware of the document, so
 * it cannot deduplicate its own name — the caller must pass a name through
 * uniqueName (see store.addBoard / store.duplicateBoard) or accept that the
 * default 'Board' may collide.
 */
export function createBoard(partial: Partial<Board> = {}): Board {
  return {
    id: nextId(),
    name: 'Board',
    length: 24,
    width: 5.5,
    thickness: 0.75,
    position: [0, 0, 0],
    rotation: 0,
    posture: 'flat',
    grain: 'length',
    material: DEFAULT_MATERIAL,
    cuts: [],
    angleCuts: [],
    ...partial,
  };
}

export function createDocument(name = 'Untitled'): FlatDocument {
  return {
    version: CURRENT_VERSION,
    name,
    units: { display: 'imperial-fractional', precision: 16 },
    stock: { kerf: DEFAULT_KERF },
    guides: [],
    boards: [],
    instances: [],
    definitions: [],
    shapes: [],
  };
}

/**
 * A guide point at a world position. Unlike createBoard this needs no
 * dedupe step from its caller — a guide has no name to collide.
 */
export function createGuide(at: [number, number, number]): GuidePoint {
  return { id: nextId(), at: [at[0], at[1], at[2]] };
}

const VALID_ROTATIONS = [0, 90, 180, 270];
const VALID_POSTURES: Posture[] = ['flat', 'on-edge', 'upright'];
const VALID_GRAINS: Grain[] = ['length', 'width', 'thickness'];

function isPositiveFinite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

const VALID_DIMENSIONS: Dimension[] = ['length', 'width', 'thickness'];
const VALID_FROMS: CutFrom[] = ['min', 'max'];

/**
 * Cuts that fit the board, with unique ids.
 *
 * Clamps rather than rejects, because a saved document must always open and a
 * board whose length was later shrunk below an existing cut is a real case,
 * not a corrupt file. The panel is the half that refuses bad entry (see
 * Properties.tsx); this half brings an existing cut back inside the board.
 *
 * The clamp ORDER is load-bearing: offset into [0, dim] first, then width into
 * [0, dim - offset]. The other order gives different results for a cut that
 * starts past the end.
 *
 * Three things are dropped rather than clamped: a cut with nothing left after
 * clamping, a cut whose `across` is its own `face` (unrepresentable through
 * the panel, reachable in a hand-edited file), and a cut that would remove ALL
 * the stock — there is no nearest legal cut for that one, and a board coming
 * back whole is unmistakable where a board coming back invisible is not.
 */
function validateCuts(raw: unknown, board: Pick<Board, Dimension>): Cut[] {
  if (!Array.isArray(raw)) return [];
  const out: Cut[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const c = item as Record<string, unknown>;

    const face = c.face as Dimension;
    const across = c.across as Dimension;
    if (!VALID_DIMENSIONS.includes(face) || !VALID_DIMENSIONS.includes(across)) continue;
    if (face === across) continue;
    if (!VALID_FROMS.includes(c.from as CutFrom)) continue;
    if (!['offset', 'width', 'depth'].every(
      (k) => typeof c[k] === 'number' && Number.isFinite(c[k]),
    )) continue;

    const posDim = board[positionAxisOf(face, across)];
    const faceDim = board[face];

    const offset = clamp(c.offset as number, 0, posDim);
    const width = clamp(c.width as number, 0, posDim - offset);
    const depth = clamp(c.depth as number, 0, faceDim);
    if (width <= 0 || depth <= 0) continue;

    // Defaulted, not refused, like stock.kerf: a missing or bogus stop is "no
    // stop", which is what every pre-v7 cut means. A pair that leaves no length
    // is dropped like a zero-width cut — never clamped toward each other,
    // because no nearest legal value keeps both numbers and guessing which stop
    // to shorten moves the mortise.
    const acrossDim = board[across];
    const stopOf = (v: unknown) =>
      typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(v, acrossDim) : 0;
    const stopMin = stopOf(c.stopMin);
    const stopMax = stopOf(c.stopMax);
    if (stopMin + stopMax >= acrossDim) continue;

    // The cut's box is the whole board: full depth, the full position axis,
    // and — only when neither end is stopped — the full across axis.
    if (depth === faceDim && offset === 0 && width === posDim &&
        stopMin === 0 && stopMax === 0) continue;

    // Scoped to THIS board's `seen`, not the document's: `Properties.tsx` keys
    // CutRow by cut id within one board and the store looks a cut up by
    // (boardId, cutId), so two boards may each carry a cut called 'c1' and
    // neither is wrong.
    const id = takeId(c.id, seen);
    out.push({ id, face, from: c.from as CutFrom, across, offset, width, depth, stopMin, stopMax });
  }
  return out;
}

/**
 * The well-formed angle cuts out of raw data, in order (angle-cuts spec §2.3).
 * Dropped, never clamped: equal stations, a non-finite number, `along === face`,
 * an unknown dimension or side. A missing or unknown `kind` is DERIVED
 * (`deriveKind`), not dropped — the geometry is good and only the word is
 * missing. A cut that removes nothing is KEPT (unlike fu 178): keeping it loses
 * nothing and restores the cut if the part grows back. Ids are scoped to this
 * board, or this shape (invariant 33).
 */
function validateAngleCuts(raw: unknown, board: Pick<Board, Dimension>): AngleCut[] {
  if (!Array.isArray(raw)) return [];
  const out: AngleCut[] = [];
  const seen = new Set<string>();
  const finitePair = (q: unknown): q is [number, number] =>
    Array.isArray(q) && q.length === 2 && q.every((v) => typeof v === 'number' && Number.isFinite(v));
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const c = item as Record<string, unknown>;
    const face = c.face as Dimension;
    const along = c.along as Dimension;
    if (!VALID_DIMENSIONS.includes(face) || !VALID_DIMENSIONS.includes(along) || face === along) continue;
    if (!VALID_FROMS.includes(c.from as CutFrom) || !VALID_FROMS.includes(c.alongFrom as CutFrom)) continue;
    const p = c.points;
    if (!Array.isArray(p) || p.length !== 2 || !finitePair(p[0]) || !finitePair(p[1])) continue;
    const points: AngleCut['points'] = [[p[0][0], p[0][1]], [p[1][0], p[1][1]]];
    if (points[0][0] === points[1][0]) continue;
    // Finite inputs can still overflow (stations 1e-308 apart, values near ±1e308). keptHalfSpace and
    // zeroStation divide by the station span or the slope, so a line whose slope or span is not finite
    // has no geometry to keep (an overflowed span even gives a finite slope, x / Infinity = 0). This
    // does NOT bound depthAt, which multiplies (q2 − q1)(s − s1) before dividing: a finite but huge
    // slope can still overflow there at a far station — reachable only from a hand-edited file.
    const ds = points[1][0] - points[0][0];
    if (!Number.isFinite(ds) || !Number.isFinite((points[1][1] - points[0][1]) / ds)) continue;
    const base = { face, from: c.from as CutFrom, along, alongFrom: c.alongFrom as CutFrom, points };
    const kind = ANGLE_KINDS.includes(c.kind as AngleKind) ? (c.kind as AngleKind) : deriveKind(base, board);
    out.push({ id: takeId(c.id, seen), kind, ...base });
  }
  return out;
}

/**
 * The well-formed guides out of raw data, in order.
 *
 * Drops rather than refuses, the same rule validateCuts follows and for the
 * same reason: a saved document must always open. Unlike a cut there is
 * nothing to clamp toward — a guide with a NaN coordinate has no nearest
 * legal position — so dropping is the only available repair.
 *
 * Duplicate ids ARE repaired, via `takeId` — the first guide with a given id
 * keeps it and later ones are re-minted (follow-ups 97 and 131, closed
 * together because closing either alone was the inconsistent half-measure).
 */
export function validateGuides(raw: unknown): GuidePoint[] {
  if (!Array.isArray(raw)) return [];
  const guides: GuidePoint[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const g = item as Record<string, unknown>;
    // A MISSING id still drops the guide; only a DUPLICATE of a well-formed one
    // is repaired. The two are different failures: a guide with no id is
    // malformed data, which this function drops by its stated rule, while a
    // duplicate is a perfectly good guide wearing a taken label.
    if (typeof g.id !== 'string' || !g.id) continue;
    const at = g.at;
    if (!Array.isArray(at) || at.length !== 3) continue;
    if (!at.every((n) => typeof n === 'number' && Number.isFinite(n))) continue;
    guides.push({ id: takeId(g.id, seen), at: [at[0] as number, at[1] as number, at[2] as number] });
  }
  return guides;
}

/** A raw position, or null when it is not three finite numbers. */
function validPosition(pos: unknown): [number, number, number] | null {
  if (!Array.isArray(pos) || pos.length !== 3 || !pos.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  return [pos[0], pos[1], pos[2]];
}

const validRotation = (r: unknown): Rotation => (VALID_ROTATIONS.includes(r as number) ? (r as Rotation) : 0);

/**
 * A part's SHARED fields (LINK_FIELDS), defaulted, with cuts validated against
 * them. The one rule set for a plain part's fields and a Shape's (components
 * spec §2.2), so the two cannot drift. Null when a dimension is not a positive
 * number: the caller decides whether that refuses the file (a part) or drops
 * the thing (a shape). `bad` names the first bad dimension.
 */
function validateSharedFields(b: Record<string, unknown>): { fields: Pick<Board, SharedField> } | { bad: Dimension } {
  for (const key of ['length', 'width', 'thickness'] as const) {
    if (!isPositiveFinite(b[key])) return { bad: key };
  }
  const material =
    typeof b.material === 'string' && Object.hasOwn(MATERIALS, b.material)
      ? b.material
      : DEFAULT_MATERIAL;
  const grain = VALID_GRAINS.includes(b.grain as Grain)
    ? (b.grain as Grain)
    : 'length';
  // 'Through thickness' is meaningless for a sheet good — plywood's grain is
  // its face-veneer direction, which always lies in the sheet plane. The
  // panel never offers it for plywood/MDF, but an imported or hand-edited
  // file could still carry it. A normalisation in the same family as the
  // name and material fallbacks above, not a migration — it does not bump
  // CURRENT_VERSION.
  const normalizedGrain = isSheetGood(material) && grain === 'thickness' ? 'length' : grain;
  const fields = {
    length: b.length as number,
    width: b.width as number,
    thickness: b.thickness as number,
    posture: VALID_POSTURES.includes(b.posture as Posture)
      ? (b.posture as Posture)
      : 'flat',
    grain: normalizedGrain,
    material,
  };
  // validateCuts reads only the dimensions; its `seen` set is its own, so a
  // shape's cut ids are scoped to the shape (invariant 33's per-board rule).
  return { fields: { ...fields, cuts: validateCuts(b.cuts, fields), angleCuts: validateAngleCuts(b.angleCuts, fields) } };
}

/**
 * A stored part. An object with a string `shape` and NO `length` key is a
 * shaped part (components spec §2): only its own fields are read, validated
 * exactly as a plain part's are. Anything else is a plain part, which refuses
 * the file on a bad dimension or position.
 *
 * `legacy` is passed only for a file below v11: a plain part carrying a
 * non-blank string `link` is recorded under the object returned, which is
 * what `linksToShapes` keys on. The key itself never reaches a stored part.
 */
function validateBoard(raw: unknown, index: number, seen: Set<string>, legacy?: Map<StoredBoard, string>): StoredBoard {
  const where = `board ${index + 1}`;
  if (typeof raw !== 'object' || raw === null) {
    throw new DocumentError(`${where} is not an object`);
  }
  const b = raw as Record<string, unknown>;
  const shaped = typeof b.shape === 'string' && b.shape !== '' && !('length' in b);

  const shared = shaped ? null : validateSharedFields(b);
  if (shared && 'bad' in shared) {
    throw new DocumentError(`${where} has an invalid ${shared.bad} — must be a positive number`);
  }

  const position = validPosition(b.position);
  if (!position) {
    throw new DocumentError(`${where} has an invalid position — expected three numbers`);
  }

  const name = typeof b.name === 'string' ? b.name.trim() : '';
  const own = { id: takeId(b.id, seen), name: name || 'Board', position, rotation: validRotation(b.rotation) };
  if (!shared) return { ...own, shape: b.shape as string };

  const board: Board = { ...own, ...shared.fields };
  if (legacy && typeof b.link === 'string' && b.link.trim() !== '') legacy.set(board, b.link);
  return board;
}

/**
 * Shapes (components spec §2.2, §2.3 step 1): not an object, no string id, a
 * duplicate id (the FIRST keeps it) or an invalid size is dropped, never
 * refusing the file. Fields are validated by the same rule set as a plain
 * part's. Nothing but a shaped part's `shape` references a shape id, so a
 * dropped duplicate leaves no reference to rewrite; a part naming a dropped
 * shape is dropped later (`dropUnresolved`, step 5).
 */
export function validateShapes(raw: unknown): Shape[] {
  if (!Array.isArray(raw)) return [];
  const ids = new Set<string>();
  const out: Shape[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const s = item as Record<string, unknown>;
    if (typeof s.id !== 'string' || !s.id || ids.has(s.id)) continue;
    // A shape with a bad size claims no id, so a later good one may keep it:
    // validateDefinitions' rule for a definition with no boards list.
    const shared = validateSharedFields(s);
    if ('bad' in shared) continue;
    ids.add(s.id);
    out.push({ id: s.id, ...shared.fields });
  }
  return out;
}

/** An assembly placement, or null for one that cannot be placed (spec §2.5).
 *  Shares the container's `seen` set with its parts (ids unique per container). */
function validateInstance(raw: unknown, seen: Set<string>): Instance | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const i = raw as Record<string, unknown>;
  if (typeof i.id !== 'string' || !i.id) return null;
  if (typeof i.definition !== 'string' || !i.definition) return null;
  const pos = i.position;
  if (!Array.isArray(pos) || pos.length !== 3 || !pos.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  const name = typeof i.name === 'string' && i.name.trim() ? i.name.trim() : 'Assembly';
  return {
    id: takeId(i.id, seen), name, definition: i.definition,
    position: [pos[0], pos[1], pos[2]] as [number, number, number],
    rotation: VALID_ROTATIONS.includes(i.rotation as number) ? (i.rotation as Rotation) : 0,
    ...(i.mirrored === true ? { mirrored: true } : {}),
  };
}

const validateInstances = (raw: unknown, seen: Set<string>): Instance[] =>
  Array.isArray(raw) ? raw.flatMap((x) => validateInstance(x, seen) ?? []) : [];

/**
 * Definitions (spec §2.4 step 1): not an object, no string id, or no boards
 * list is dropped; a duplicate id keeps the FIRST. A board inside goes through
 * validateBoard, which refuses the file on a bad board exactly as it does at
 * the root.
 *
 * A definition whose id is `ROOT_STORAGE_ID` is dropped like a malformed one
 * (its instances then name a missing definition and are dropped by
 * repairTree): treeEdit routes that id to the root container, so keeping it
 * would send every edit inside it to the root's parts.
 */
function validateDefinitions(raw: unknown, legacy?: Map<StoredBoard, string>): Definition[] {
  if (!Array.isArray(raw)) return [];
  const ids = new Set<string>();
  const out: Definition[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const d = item as Record<string, unknown>;
    if (typeof d.id !== 'string' || !d.id || d.id === ROOT_STORAGE_ID || ids.has(d.id) || !Array.isArray(d.boards)) continue;
    ids.add(d.id);
    const seen = new Set<string>();
    const boards = d.boards.map((b, i) => validateBoard(b, i, seen, legacy));
    out.push({ id: d.id, boards, instances: validateInstances(d.instances, seen) });
  }
  return out;
}

/**
 * v1 -> v2: the rotation select collapsed from four values to two, so 180 and
 * 270 fold onto 0 and 90.
 *
 * This runs on the RAW board data, before validateBoard. That ordering is
 * load-bearing: validateBoard falls back to 0 for any rotation outside
 * VALID_ROTATIONS, which was then [0, 90], so a stored 270 validated first would
 * come out as 0 rather than 90 — and unlike 0-vs-180, that is a different shape
 * on screen. Folding first leaves validateBoard's fallback as what it was meant
 * to be: last-resort handling for garbage.
 *
 * v1 had no cuts, so this fold is still right now that 180 and 270 exist again
 * (v8 restored them as true turns; migrating a v1 file never meets one).
 *
 * The fold is extent-neutral — boardExtents already treated 180 like 0 and 270
 * like 90 — so it must not adjust any position.
 *
 * The input is untrusted, so anything that is not an object passes straight
 * through for validateBoard to reject with its own message.
 */
function foldRotationToV2(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const b = raw as Record<string, unknown>;
  if (b.rotation === 180) return { ...b, rotation: 0 };
  if (b.rotation === 270) return { ...b, rotation: 90 };
  return raw;
}

/**
 * v2 -> v3: `standing` became `posture`, which names the dimension that points
 * up, and grain became a field of its own.
 *
 * `flat` and `on-edge` are exactly what the boolean meant, so this is
 * extent-neutral and adjusts no positions. Every v2 board had its fibres running
 * along its length, because that was the only thing v2 could express.
 *
 * Like the v1 -> v2 fold, it runs on raw board data before validateBoard, and
 * for the same reason: validateBoard's posture fallback is 'flat', so a board
 * with `standing: true` that reached it first would come out lying down.
 */
function addPostureToV3(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const { standing, ...rest } = raw as Record<string, unknown>;
  return {
    ...rest,
    posture: standing === true ? 'on-edge' : 'flat',
    grain: 'length',
  };
}

/**
 * v3 -> v4: boards gained a list of cuts.
 *
 * The mildest step in the chain — the default is empty and validateBoard's
 * fallback would be the same empty array — but it runs in the same place as
 * the other two on purpose. The chain's value is that every step has one
 * shape, so the next step that DOES have a divergent fallback inherits the
 * correct structure instead of relying on its author noticing. See invariant 11.
 */
function addCutsToV4(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const b = raw as Record<string, unknown>;
  return Array.isArray(b.cuts) ? raw : { ...b, cuts: [] };
}

/**
 * v7 -> v8: rotation 90 became a TRUE quarter turn (quarter-turns spec §4).
 * Before v8 it carried h0 on Z forward; now h0 runs reversed. So a 90° part's
 * cuts are mirrored along h0 and its world geometry is exactly what it was.
 * Only 90° parts WITH cuts change; everything else passes through untouched.
 * RAW data, before validateBoard (invariant 11): a malformed field is left for
 * validateCuts to judge, never thrown on here.
 */
function trueTurnsToV8(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const b = raw as Record<string, unknown>;
  if (b.rotation !== 90 || !Array.isArray(b.cuts) || b.cuts.length === 0) return raw;
  const posture = VALID_POSTURES.includes(b.posture as Posture) ? (b.posture as Posture) : 'flat';
  const [h0] = horizontalOf(posture);
  const size = b[h0];
  if (typeof size !== 'number' || !Number.isFinite(size)) return raw;
  return { ...b, cuts: b.cuts.map((c) => mirrorCutAlong(c, h0, size)) };
}

/**
 * v11 -> v12 (follow-up 215): on-edge's frame now reverses thickness (axisFrame), so every posture has
 * one hand. An on-edge part's stored cuts are mirrored along thickness so its world solids are unchanged.
 * Runs AFTER validation and linksToShapes (posture, thickness and cuts are validated, and a file below
 * v11 has its Shapes by now) and BEFORE repairTree. NOT idempotent: the `d.version < 12` guard is all
 * that stops a v12 file being mirrored again on every load (as v8's).
 */
export function onEdgeToV12(doc: SloydDocument): SloydDocument {
  const mirror = <T extends { posture: Posture; thickness: number; cuts: Cut[] }>(b: T): T =>
    b.posture === 'on-edge' && b.cuts.length > 0
      ? { ...b, cuts: b.cuts.map((c) => mirrorCutAlong(c, 'thickness', b.thickness) as Cut) }
      : b;
  const part = (b: StoredBoard): StoredBoard => (isShaped(b) ? b : mirror(b));
  return {
    ...doc,
    boards: doc.boards.map(part),
    definitions: doc.definitions.map((d) => ({ ...d, boards: d.boards.map(part) })),
    shapes: doc.shapes.map(mirror),
  };
}

/**
 * Validate and upgrade a parsed document to the current schema.
 * Throws DocumentError with a human-readable reason. Never partially loads:
 * either the whole document validates or nothing is returned.
 */
export function migrateDocument(raw: unknown): SloydDocument {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new DocumentError('This file is not a Sloyd project.');
  }
  const d = raw as Record<string, unknown>;

  if (typeof d.version !== 'number' || !Number.isFinite(d.version)) {
    throw new DocumentError('This file is missing a version and is not a Sloyd project.');
  }
  if (!Number.isInteger(d.version) || d.version < 1) {
    throw new DocumentError(
      `This file has an invalid version (${d.version}) and cannot be opened.`,
    );
  }
  if (d.version > CURRENT_VERSION) {
    throw new DocumentError(
      `This project was saved by a newer version of Sloyd (file version ${d.version}, ` +
      `this build understands up to ${CURRENT_VERSION}).`,
    );
  }

  if (!Array.isArray(d.boards)) {
    throw new DocumentError('This project has no boards list and cannot be opened.');
  }

  // Upgrade steps run one version at a time, on raw data, before validation.
  let rawBoards = d.boards;
  if (d.version < 2) rawBoards = rawBoards.map(foldRotationToV2);
  if (d.version < 3) rawBoards = rawBoards.map(addPostureToV3);
  if (d.version < 4) rawBoards = rawBoards.map(addCutsToV4);
  if (d.version < 8) rawBoards = rawBoards.map(trueTurnsToV8);

  const units = d.units as SloydDocument['units'] | undefined;
  const precision =
    units && typeof units.precision === 'number' && units.precision > 0
      ? units.precision
      : 16;

  // A DOCUMENT-level field, so unlike foldRotationToV2/addPostureToV3/
  // addCutsToV4 it has no per-board upgrade step: it is read defensively off
  // the raw document and defaulted, exactly as `precision` above is. Defaulted
  // to DEFAULT_KERF, not clamped to the nearest boundary, when absent,
  // non-numeric, or outside [0, 1) — because a saved document must always
  // open, but a rejected value has no boundary that means anything (a
  // negative kerf and a bogus string are equally not-a-kerf). The `< 1`
  // upper bound exists because an inch-wide kerf is a typo, not a saw.
  const rawStock = d.stock;
  const kerf =
    typeof rawStock === 'object' && rawStock !== null && !Array.isArray(rawStock) &&
    typeof (rawStock as { kerf?: unknown }).kerf === 'number' &&
    Number.isFinite((rawStock as { kerf: number }).kerf) &&
    (rawStock as { kerf: number }).kerf >= 0 &&
    (rawStock as { kerf: number }).kerf < 1
      ? (rawStock as { kerf: number }).kerf
      : DEFAULT_KERF;

  // Document-level, so — exactly like `stock` and unlike rotation, posture and
  // cuts — this has NO rawBoards.map step. There is no per-board version of a
  // guide, so invariant 11's hazard (validateBoard's fallback for a missing
  // field being a legal-but-wrong value rather than an absence) does not exist
  // here. Read defensively off the raw document; an absent field defaults
  // cleanly regardless of CURRENT_VERSION.
  const guides = validateGuides(d.guides);
  const boardIds = new Set<string>();

  // ONE `seen` set threaded across the whole list, which is why this is not
  // a `dedupeIds` pass beside `dedupeNames`. A name needs a replacement
  // computed FROM its siblings, so it cannot be decided one board at a time;
  // an id needs nothing from them but "is this taken", which a set answers as
  // it goes. A second pass would leave two deciders for one field — the
  // validator minting an id that the pass may then overwrite.
  // v10 -> v11: a file below v11 may carry `link` labels. validateBoard
  // records each plain part's label under the object it returns; a v11 file's
  // stray `link` is ignored (no map is passed).
  const legacy = d.version < 11 ? new Map<StoredBoard, string>() : undefined;
  const boards = rawBoards.map((b, i) => validateBoard(b, i, boardIds, legacy));
  const instances = validateInstances(d.instances, boardIds);
  const definitions = validateDefinitions(d.definitions, legacy);
  let doc: SloydDocument = {
    version: CURRENT_VERSION,
    name: typeof d.name === 'string' && d.name ? d.name : 'Untitled',
    units: { display: 'imperial-fractional', precision },
    stock: { kerf },
    guides,
    boards,
    instances,
    definitions,
    shapes: validateShapes(d.shapes),
  };
  // Links first, while each stored part is still the object validateBoard
  // built (the `legacy` map is keyed by object). worldParts tolerates missing
  // definitions and cycles, so it is safe before repairTree; a v10 definition
  // placed twice is visited twice but converted once (same stored object).
  if (legacy) doc = linksToShapes(doc, legacy);
  // v11 -> v12 (fu 215): after linksToShapes (a file below v11 gets its Shapes first), before repairTree.
  if (d.version < 12) doc = onEdgeToV12(doc);
  // The load repair (components spec §2.3): the tree, sharing kept from v11
  // (step 4 copies only below it), names per container (invariant 8,
  // restated); then a part naming a missing shape is dropped (5), unused
  // shapes go (6) and a one-user shape dissolves (7).
  doc = repairTree(doc, { copyShared: d.version < 11 });
  return dissolveShapes(pruneShapes(dropUnresolved(doc)));
}
