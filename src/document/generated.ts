import { createDocument, migrateDocument } from './document';
import type { SloydDocument } from './document';
import { DIMENSION_ORDER, SNAP_INCHES, axisDimensions } from './geometry';
import { MATERIALS } from './types';
import type { Board, Dimension, Posture, Rotation } from './types';

/**
 * What the model sends back (spec §4.1). The model thinks in WORLD BOXES —
 * a min-corner and an extent along each world axis — and never in Sloyd's
 * length/width/thickness + posture + rotation encoding, which is ours to
 * derive (`orient`). Vectors are objects, not tuples, because structured
 * outputs cannot constrain an array's length.
 */
export interface Vec3 { x: number; y: number; z: number }
export type MaterialKey = string;
export interface GeneratedPart { name: string; material: MaterialKey; at: Vec3; size: Vec3 }
export interface GeneratedDesign { name: string; parts: GeneratedPart[] }
export interface RejectedPart { name: string; reason: 'not-finite' | 'too-small' }

const vec3Schema = {
  type: 'object',
  properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
  required: ['x', 'y', 'z'],
  additionalProperties: false,
};

/** Built from MATERIALS at load, so a new material reaches the model with no second edit. */
export const DESIGN_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    parts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          material: { type: 'string', enum: Object.keys(MATERIALS) },
          at: vec3Schema,
          size: vec3Schema,
        },
        required: ['name', 'material', 'at', 'size'],
        additionalProperties: false,
      },
    },
  },
  required: ['name', 'parts'],
  additionalProperties: false,
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isVec3 = (v: unknown): v is Vec3 =>
  isObj(v) && (['x', 'y', 'z'] as const).every((k) => typeof v[k] === 'number');

/**
 * Shape check on the parsed output. The API enforces the schema, but this is
 * the client's own gate — a provider without structured outputs, or a
 * truncated stream, must not reach the converter. Numbers are only checked
 * for TYPE here; non-finite values are the converter's to reject per part.
 * An empty parts list is unusable, not a design.
 */
export function parseDesign(json: unknown): GeneratedDesign | null {
  if (!isObj(json) || typeof json.name !== 'string' || !Array.isArray(json.parts)) return null;
  if (json.parts.length === 0) return null;
  for (const p of json.parts) {
    if (!isObj(p) || typeof p.name !== 'string' || typeof p.material !== 'string') return null;
    if (!Object.hasOwn(MATERIALS, p.material) || !isVec3(p.at) || !isVec3(p.size)) return null;
  }
  return json as unknown as GeneratedDesign;
}

const snap = (v: number) => Math.round(v / SNAP_INCHES) * SNAP_INCHES;

const POSTURE_FOR_UP: Record<Dimension, Posture> = {
  thickness: 'flat',
  width: 'on-edge',
  length: 'upright',
};

/**
 * World extents → Sloyd's encoding. Longest side is length, shortest is
 * thickness. Three postures × two rotations cover all six assignments of
 * dimensions to axes, so this is total; the rotation is found by asking the
 * ONE mapping (`axisDimensions`) which of the two reproduces the target,
 * rather than restating that mapping here. Ties sort by axis index, so the
 * choice is deterministic — and any choice has identical extents.
 */
export function orient(size: [number, number, number]): Pick<Board, 'length' | 'width' | 'thickness' | 'posture' | 'rotation'> {
  const order = [0, 1, 2].sort((a, b) => size[b] - size[a] || a - b);
  const onAxis: Dimension[] = [];
  onAxis[order[0]] = 'length';
  onAxis[order[1]] = 'width';
  onAxis[order[2]] = 'thickness';
  const dims = { length: size[order[0]], width: size[order[1]], thickness: size[order[2]] };
  const posture = POSTURE_FOR_UP[onAxis[1]];
  for (const rotation of [0, 90] as Rotation[]) {
    const probe = { ...dims, posture, rotation } as Board;
    const got = axisDimensions(probe);
    if (got[0] === onAxis[0] && got[2] === onAxis[2]) return { ...dims, posture, rotation };
  }
  // Unreachable: DIMENSION_ORDER has three entries and two rotations swap the
  // two horizontals. Kept as a loud failure rather than a silent default.
  throw new Error(`orient: no encoding for ${DIMENSION_ORDER.join('/')} ${size.join('x')}`);
}

/**
 * Model output → a trusted document (spec §4.2). Round first (invariant 25:
 * model output is a FREE value, like a drag), then encode, then translate the
 * whole design onto the floor with its footprint centred — by a multiple of
 * SNAP_INCHES, so the translation keeps every part on the grid — then
 * migrateDocument, the same gate an imported file passes, which dedupes
 * names (inv 8) and mints ids (inv 33).
 */
export function designToDocument(design: GeneratedDesign): { doc: SloydDocument; rejected: RejectedPart[] } {
  const rejected: RejectedPart[] = [];
  const boards: Omit<Board, 'id'>[] = [];
  for (const p of design.parts) {
    const raw = [p.at.x, p.at.y, p.at.z, p.size.x, p.size.y, p.size.z];
    if (!raw.every(Number.isFinite)) {
      rejected.push({ name: p.name, reason: 'not-finite' });
      continue;
    }
    const [ax, ay, az, sx, sy, sz] = raw.map(snap);
    if (sx <= 0 || sy <= 0 || sz <= 0) {
      rejected.push({ name: p.name, reason: 'too-small' });
      continue;
    }
    boards.push({
      name: p.name,
      material: p.material,
      grain: 'length',
      cuts: [],
      position: [ax, ay, az],
      ...orient([sx, sy, sz]),
    });
  }

  if (boards.length > 0) {
    const ext = boards.map((b) => [b.position, extentsOf(b)] as const);
    const min = [0, 1, 2].map((i) => Math.min(...ext.map(([p]) => p[i])));
    const max = [0, 1, 2].map((i) => Math.max(...ext.map(([p, e]) => p[i] + e[i])));
    const shift = [snap(-(min[0] + max[0]) / 2), -min[1], snap(-(min[2] + max[2]) / 2)];
    for (const b of boards) {
      b.position = [b.position[0] + shift[0], b.position[1] + shift[1], b.position[2] + shift[2]];
    }
  }

  const name = design.name.trim() || 'Generated design';
  const doc = migrateDocument({ ...createDocument(name), boards });
  return { doc, rejected };
}

function extentsOf(b: Omit<Board, 'id'>): [number, number, number] {
  const [x, y, z] = axisDimensions(b as Board);
  return [b[x], b[y], b[z]];
}
