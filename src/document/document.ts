import { MATERIALS, DEFAULT_MATERIAL, isSheetGood } from './types';
import type { Board, Rotation, Posture, Grain, SloydDocument } from './types';
import { dedupeNames } from './names';

export * from './types';
export { boardExtents, boardCenter, reorientedPosition, axisDimensions, DIMENSION_ORDER } from './geometry';
export { uniqueName, dedupeNames } from './names';

export const CURRENT_VERSION = 3;

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
    ...partial,
  };
}

export function createDocument(name = 'Untitled'): SloydDocument {
  return {
    version: CURRENT_VERSION,
    name,
    units: { display: 'imperial-fractional', precision: 16 },
    boards: [],
  };
}

const VALID_ROTATIONS = [0, 90];
const VALID_POSTURES: Posture[] = ['flat', 'on-edge', 'upright'];
const VALID_GRAINS: Grain[] = ['length', 'width', 'thickness'];

function isPositiveFinite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
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

  return {
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

  const units = d.units as SloydDocument['units'] | undefined;
  const precision =
    units && typeof units.precision === 'number' && units.precision > 0
      ? units.precision
      : 16;

  return {
    version: CURRENT_VERSION,
    name: typeof d.name === 'string' && d.name ? d.name : 'Untitled',
    units: { display: 'imperial-fractional', precision },
    boards: dedupeNames(rawBoards.map(validateBoard)),
  };
}
