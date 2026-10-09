import { createDocument, migrateDocument } from './document';
import type { SloydDocument } from './document';
import { DIMENSION_ORDER, SNAP_INCHES, axisDimensions } from './geometry';
import { nextId } from './ids';
import { uniqueName } from './names';
import { NAME_SEPARATOR } from './tree';
import { MATERIALS } from './types';
import type { Board, Definition, Dimension, Instance, Posture, Rotation } from './types';

/**
 * What the model sends back (spec §4.1). The model thinks in WORLD BOXES —
 * a min-corner and an extent along each world axis — and never in Sloyd's
 * length/width/thickness + posture + rotation encoding, which is ours to
 * derive (`orient`). Vectors are objects, not tuples, because structured
 * outputs cannot constrain an array's length.
 */
export interface Vec3 { x: number; y: number; z: number }
export type MaterialKey = string;
/** `role` is REQUIRED from the model (parseDesign checks it); optional here so
 *  hand-built fixtures stay terse. Conversion input only — never stored. */
export interface GeneratedPart { name: string; role?: string; material: MaterialKey; at: Vec3; size: Vec3 }
/** Where an assembly's local origin goes in the world. No turn (spec §2). */
export interface GeneratedPlacement { name: string; at: Vec3 }
/** Parts in the assembly's OWN frame, placed by translation; one level, parts only. */
export interface GeneratedAssembly { name: string; parts: GeneratedPart[]; placements: GeneratedPlacement[] }
/** `assemblies` is REQUIRED from the model; optional here for the same reason as `role`. */
export interface GeneratedDesign { name: string; parts: GeneratedPart[]; assemblies?: GeneratedAssembly[] }
export interface RejectedPart { name: string; reason: 'not-finite' | 'too-small' | 'unplaced' | 'empty' }

const vec3Schema = {
  type: 'object',
  properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
  required: ['x', 'y', 'z'],
  additionalProperties: false,
};

/** Built from MATERIALS at load, so a new material reaches the model with no second edit. */
const partSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    role: { type: 'string' },
    material: { type: 'string', enum: Object.keys(MATERIALS) },
    at: vec3Schema,
    size: vec3Schema,
  },
  required: ['name', 'role', 'material', 'at', 'size'],
  additionalProperties: false,
};

export const DESIGN_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    parts: { type: 'array', items: partSchema },
    assemblies: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          parts: { type: 'array', items: partSchema },
          placements: {
            type: 'array',
            items: {
              type: 'object',
              properties: { name: { type: 'string' }, at: vec3Schema },
              required: ['name', 'at'],
              additionalProperties: false,
            },
          },
        },
        required: ['name', 'parts', 'placements'],
        additionalProperties: false,
      },
    },
  },
  required: ['name', 'parts', 'assemblies'],
  additionalProperties: false,
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isVec3 = (v: unknown): v is Vec3 =>
  isObj(v) && (['x', 'y', 'z'] as const).every((k) => typeof v[k] === 'number');

const isPart = (p: unknown): boolean =>
  isObj(p) && typeof p.name === 'string' && typeof p.role === 'string' && typeof p.material === 'string' &&
  Object.hasOwn(MATERIALS, p.material) && isVec3(p.at) && isVec3(p.size);
const isPlacement = (p: unknown): boolean => isObj(p) && typeof p.name === 'string' && isVec3(p.at);
const isAssembly = (a: unknown): boolean =>
  isObj(a) && typeof a.name === 'string' && Array.isArray(a.parts) && a.parts.every(isPart) &&
  Array.isArray(a.placements) && a.placements.every(isPlacement);

/**
 * Shape check on the parsed output. The API enforces the schema, but this is
 * the client's own gate — a provider without structured outputs, or a
 * truncated stream, must not reach the converter. Numbers are only checked
 * for TYPE here; non-finite values are the converter's to reject per part.
 * A design with no parts anywhere (loose or in an assembly) is unusable.
 */
export function parseDesign(json: unknown): GeneratedDesign | null {
  if (!isObj(json) || typeof json.name !== 'string' || !Array.isArray(json.parts) || !Array.isArray(json.assemblies)) return null;
  if (!json.parts.every(isPart) || !json.assemblies.every(isAssembly)) return null;
  const total = json.parts.length + (json.assemblies as { parts: unknown[] }[]).reduce((n, a) => n + a.parts.length, 0);
  if (total === 0) return null;
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

export interface AuthoredPart { label: string; assembly: string | null; placement: string | null }
/** What the model wrote, for naming violations back to it (spec §5.3). */
export interface Authored {
  /** Flat display name (as flatDocument names it) → what the model wrote. */
  parts: Map<string, AuthoredPart>;
  /** Assembly label → its placements' STORED (deduped) names, in order. */
  placements: Map<string, string[]>;
}

type Vec = [number, number, number];

/** Snap, check, encode one part; null (and a rejection) when unusable. */
function convertPart(p: GeneratedPart, label: string, rejected: RejectedPart[]): Omit<Board, 'id'> | null {
  // Checked AFTER the snap: a finite value near Number.MAX_VALUE overflows
  // to Infinity on the division by SNAP_INCHES. Covers NaN/±Infinity too.
  const snapped = [p.at.x, p.at.y, p.at.z, p.size.x, p.size.y, p.size.z].map(snap);
  if (!snapped.every(Number.isFinite)) {
    rejected.push({ name: label, reason: 'not-finite' });
    return null;
  }
  const [ax, ay, az, sx, sy, sz] = snapped;
  if (sx <= 0 || sy <= 0 || sz <= 0) {
    rejected.push({ name: label, reason: 'too-small' });
    return null;
  }
  return { name: p.name, material: p.material, grain: 'length', cuts: [], position: [ax, ay, az], ...orient([sx, sy, sz]) };
}

/**
 * Model output → a trusted TREE document (spec §3). Round first (invariant 25:
 * model output is a FREE value, like a drag), then encode, then build one
 * Definition per assembly and one unturned Instance per placement, then
 * translate the whole design onto the floor with its footprint centred — by a
 * multiple of SNAP_INCHES, shifting loose parts and instance ORIGINS only,
 * never definition-local coordinates — then migrateDocument, the same gate an
 * imported file passes, which dedupes names (inv 8) and checks ids (inv 33).
 *
 * Every id is minted here with nextId so `roles` (stored part id → role) and
 * the definition → assembly label map survive the load gate.
 */
export function designToDocument(design: GeneratedDesign): {
  doc: SloydDocument; rejected: RejectedPart[]; authored: Authored; roles: Map<string, string>;
} {
  const rejected: RejectedPart[] = [];
  const roles = new Map<string, string>();
  const mint = (p: GeneratedPart, board: Omit<Board, 'id'>): Board => {
    const b: Board = { id: nextId(), ...board };
    const role = (p.role ?? '').trim().toLowerCase();
    if (role) roles.set(b.id, role);
    return b;
  };

  const loose: Board[] = design.parts.flatMap((p) => {
    const b = convertPart(p, p.name, rejected);
    return b ? [mint(p, b)] : [];
  });

  const definitions: Definition[] = [];
  const instances: Instance[] = [];
  const labelOf = new Map<string, string>(); // definition id → assembly label
  const taken: { id: string; name: string }[] = [];
  for (const a of design.assemblies ?? []) {
    // Assembly names are the model's handle in feedback, so they are unique
    // among themselves (they are not stored: a Definition has no name).
    const label = uniqueName(a.name.trim() || 'Assembly', taken);
    taken.push({ id: label, name: label });
    const parts = a.parts.flatMap((p) => {
      const b = convertPart(p, `${p.name} (in assembly ${label})`, rejected);
      return b ? [mint(p, b)] : [];
    });
    const origins = a.placements.flatMap((pl) => {
      const at = [pl.at.x, pl.at.y, pl.at.z].map(snap) as Vec;
      if (at.every(Number.isFinite)) return [{ name: pl.name, at }];
      rejected.push({ name: `${pl.name} (placement of ${label})`, reason: 'not-finite' });
      return [];
    });
    if (parts.length === 0) { rejected.push({ name: label, reason: 'empty' }); continue; }
    if (origins.length === 0) { rejected.push({ name: label, reason: 'unplaced' }); continue; }
    const def: Definition = { id: nextId(), boards: parts, instances: [] };
    definitions.push(def);
    labelOf.set(def.id, label);
    for (const o of origins) instances.push({ id: nextId(), name: o.name, definition: def.id, position: o.at, rotation: 0 });
  }

  // Bounds over the PLACED world parts. Unturned, so world = origin + local.
  const placed: [Vec, Vec][] = [
    ...loose.map((b) => [b.position, extentsOf(b)] as [Vec, Vec]),
    ...instances.flatMap((i) => definitions.find((d) => d.id === i.definition)!.boards.map((b) => {
      const p = (b as Board).position;
      return [[i.position[0] + p[0], i.position[1] + p[1], i.position[2] + p[2]], extentsOf(b as Board)] as [Vec, Vec];
    })),
  ];
  if (placed.length > 0) {
    const min = [0, 1, 2].map((k) => Math.min(...placed.map(([p]) => p[k])));
    const max = [0, 1, 2].map((k) => Math.max(...placed.map(([p, e]) => p[k] + e[k])));
    const shift = [snap(-(min[0] + max[0]) / 2), -min[1], snap(-(min[2] + max[2]) / 2)];
    const move = (p: Vec): Vec => [p[0] + shift[0], p[1] + shift[1], p[2] + shift[2]];
    for (const b of loose) b.position = move(b.position);
    for (const i of instances) i.position = move(i.position);
  }

  const name = design.name.trim() || 'Generated design';
  const doc = migrateDocument({ ...createDocument(name), boards: loose, instances, definitions });
  return { doc, rejected, authored: authoredIndex(doc, labelOf), roles };
}

/**
 * Flat display name → authored label. Built from the MIGRATED document's stored
 * (deduped) names with flatDocument's naming rule (`Instance › Part`, one level),
 * so it agrees with displayNames — a test pins the agreement.
 */
function authoredIndex(doc: SloydDocument, labelOf: ReadonlyMap<string, string>): Authored {
  const parts = new Map<string, AuthoredPart>();
  const placements = new Map<string, string[]>();
  for (const b of doc.boards) parts.set(b.name, { label: b.name, assembly: null, placement: null });
  const defs = new Map(doc.definitions.map((d) => [d.id, d]));
  for (const inst of doc.instances) {
    const d = defs.get(inst.definition);
    const label = labelOf.get(inst.definition);
    if (!d || label === undefined) continue;
    placements.set(label, [...(placements.get(label) ?? []), inst.name]);
    for (const b of d.boards) {
      parts.set(`${inst.name}${NAME_SEPARATOR}${b.name}`, { label: `${label}${NAME_SEPARATOR}${b.name}`, assembly: label, placement: inst.name });
    }
  }
  return { parts, placements };
}

function extentsOf(b: Omit<Board, 'id'>): [number, number, number] {
  const [x, y, z] = axisDimensions(b as Board);
  return [b[x], b[y], b[z]];
}
