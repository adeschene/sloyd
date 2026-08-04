import { MATERIALS, DEFAULT_MATERIAL, DEFAULT_KERF, isSheetGood } from './types';
import type {
  Board, Cut, CutFrom, Dimension, Rotation, Posture, Grain, SloydDocument, GuidePoint,
} from './types';
import { dedupeNames } from './names';
import { positionAxisOf } from './geometry';

export * from './types';
export {
  boardExtents, boardCenter, reorientedPosition, axisDimensions, DIMENSION_ORDER, positionAxisOf,
} from './geometry';
export { uniqueName, dedupeNames } from './names';
export { boardEdges, boardSolids, cutLabel, cutRegion, pointToLocalXYZ, solidWorldBox, wholeBoard } from './cuts';
export type { Point, Segment } from './cuts';
export { buildCutList } from './cutlist';
export type { CutList, CutListGroup, CutListRow } from './cutlist';
export { buildDiagrams } from './diagram';
export type { DiagramCut, DiagramView } from './diagram';
export { buildDepthField } from './depthField';
export type { FaceCell } from './depthField';
export { buildNesting, footprintsOf } from './nesting';
export type { Nesting, NestedSheet, PlacedPart, UnplaceablePart, Footprint } from './nesting';
export { boardSnapPoints, cutSnapPoints, guideSnapPoints, offsetPoint, sameSnapPoint, snapPointsFor } from './snapPoints';
export type { BoardSnapPoint, SnapKind, SnapOwner, SnapPoint } from './snapPoints';

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
 */
export const CURRENT_VERSION = 6;

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

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `b_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

// Exported so store.ts can mint a cut id the same way validateCuts re-mints
// one for a cut missing (or duplicating) an id on load — a monotonic
// counter, not a `Date.now()` + array-length scheme, because the latter can
// repeat: add a cut, remove it (array length back to 0), add another within
// the same millisecond, and both would get the same id. The `b_` prefix is
// cosmetic; validateCuts already hands cut ids this same generator.
export { nextId };

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
    ...partial,
  };
}

export function createDocument(name = 'Untitled'): SloydDocument {
  return {
    version: CURRENT_VERSION,
    name,
    units: { display: 'imperial-fractional', precision: 16 },
    stock: { kerf: DEFAULT_KERF },
    guides: [],
    boards: [],
  };
}

/**
 * A guide point at a world position. Unlike createBoard this needs no
 * dedupe step from its caller — a guide has no name to collide.
 */
export function createGuide(at: [number, number, number]): GuidePoint {
  return { id: nextId(), at: [at[0], at[1], at[2]] };
}

const VALID_ROTATIONS = [0, 90];
const VALID_POSTURES: Posture[] = ['flat', 'on-edge', 'upright'];
const VALID_GRAINS: Grain[] = ['length', 'width', 'thickness'];

function isPositiveFinite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

const VALID_DIMENSIONS: Dimension[] = ['length', 'width', 'thickness'];
const VALID_FROMS: CutFrom[] = ['min', 'max'];

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

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
function validateCuts(raw: unknown, board: Omit<Board, 'cuts'>): Cut[] {
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

    // Full depth AND the full position axis, with `across` always spanning
    // fully, means nothing survives.
    if (depth === faceDim && offset === 0 && width === posDim) continue;

    const id = typeof c.id === 'string' && c.id && !seen.has(c.id) ? c.id : nextId();
    seen.add(id);
    out.push({ id, face, from: c.from as CutFrom, across, offset, width, depth });
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
 * Ids are NOT deduplicated. Follow-up 97 records that board id uniqueness
 * became load-bearing while never being enforced the way dedupeNames enforces
 * names; guides inherit the same exposure, and closing it here alone would be
 * the inconsistent half-measure. See design §2.3.
 */
export function validateGuides(raw: unknown): GuidePoint[] {
  if (!Array.isArray(raw)) return [];
  const guides: GuidePoint[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const g = item as Record<string, unknown>;
    if (typeof g.id !== 'string' || !g.id) continue;
    const at = g.at;
    if (!Array.isArray(at) || at.length !== 3) continue;
    if (!at.every((n) => typeof n === 'number' && Number.isFinite(n))) continue;
    guides.push({ id: g.id, at: [at[0] as number, at[1] as number, at[2] as number] });
  }
  return guides;
}

function validateBoard(raw: unknown, index: number): Board {
  const where = `board ${index + 1}`;
  if (typeof raw !== 'object' || raw === null) {
    throw new DocumentError(`${where} is not an object`);
  }
  const b = raw as Record<string, unknown>;

  for (const key of ['length', 'width', 'thickness'] as const) {
    if (!isPositiveFinite(b[key])) {
      throw new DocumentError(`${where} has an invalid ${key} — must be a positive number`);
    }
  }

  const pos = b.position;
  if (
    !Array.isArray(pos) || pos.length !== 3 ||
    !pos.every((n) => typeof n === 'number' && Number.isFinite(n))
  ) {
    throw new DocumentError(`${where} has an invalid position — expected three numbers`);
  }

  const rotation = VALID_ROTATIONS.includes(b.rotation as number)
    ? (b.rotation as Rotation)
    : 0;

  const material =
    typeof b.material === 'string' && b.material in MATERIALS
      ? b.material
      : DEFAULT_MATERIAL;

  const name = typeof b.name === 'string' ? b.name.trim() : '';

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

  const board: Omit<Board, 'cuts'> = {
    id: typeof b.id === 'string' && b.id ? b.id : nextId(),
    name: name || 'Board',
    length: b.length as number,
    width: b.width as number,
    thickness: b.thickness as number,
    position: [pos[0], pos[1], pos[2]] as [number, number, number],
    rotation,
    posture: VALID_POSTURES.includes(b.posture as Posture)
      ? (b.posture as Posture)
      : 'flat',
    grain: normalizedGrain,
    material,
  };
  return { ...board, cuts: validateCuts(b.cuts, board) };
}

/**
 * v1 -> v2: the rotation select collapsed from four values to two, so 180 and
 * 270 fold onto 0 and 90.
 *
 * This runs on the RAW board data, before validateBoard. That ordering is
 * load-bearing: validateBoard falls back to 0 for any rotation outside
 * VALID_ROTATIONS, which is now [0, 90], so a stored 270 validated first would
 * come out as 0 rather than 90 — and unlike 0-vs-180, that is a different shape
 * on screen. Folding first leaves validateBoard's fallback as what it was meant
 * to be: last-resort handling for garbage.
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

  return {
    version: CURRENT_VERSION,
    name: typeof d.name === 'string' && d.name ? d.name : 'Untitled',
    units: { display: 'imperial-fractional', precision },
    stock: { kerf },
    guides,
    boards: dedupeNames(rawBoards.map(validateBoard)),
  };
}
