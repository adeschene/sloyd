import { MATERIALS, DEFAULT_MATERIAL } from './types';
import type { Board, Rotation, SloydDocument } from './types';
import { dedupeNames } from './names';

export * from './types';
export { boardExtents, boardCenter } from './geometry';
export { uniqueName, dedupeNames } from './names';

export const CURRENT_VERSION = 1;

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
    standing: false,
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

const VALID_ROTATIONS = [0, 90, 180, 270];

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

  return {
    id: typeof b.id === 'string' && b.id ? b.id : nextId(),
    name: name || 'Board',
    length: b.length as number,
    width: b.width as number,
    thickness: b.thickness as number,
    position: [pos[0], pos[1], pos[2]] as [number, number, number],
    rotation,
    standing: b.standing === true,
    material,
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
  if (d.version > CURRENT_VERSION) {
    throw new DocumentError(
      `This project was saved by a newer version of Sloyd (file version ${d.version}, ` +
      `this build understands up to ${CURRENT_VERSION}).`,
    );
  }
  // v1 is the identity migration. Future versions add upgrade steps here,
  // each stepping the document forward one version at a time.

  if (!Array.isArray(d.boards)) {
    throw new DocumentError('This project has no boards list and cannot be opened.');
  }

  const units = d.units as SloydDocument['units'] | undefined;
  const precision =
    units && typeof units.precision === 'number' && units.precision > 0
      ? units.precision
      : 16;

  return {
    version: CURRENT_VERSION,
    name: typeof d.name === 'string' && d.name ? d.name : 'Untitled',
    units: { display: 'imperial-fractional', precision },
    boards: dedupeNames(d.boards.map(validateBoard)),
  };
}
