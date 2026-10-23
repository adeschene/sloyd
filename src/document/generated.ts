import { linkByRole } from './roleLinks';
import { createDocument, migrateDocument } from './document';
import type { SloydDocument } from './document';
import { DIMENSION_ORDER, MAX_MAGNITUDE, SNAP_INCHES, axisDimensions } from './geometry';
import { nextId } from './ids';
import { cleanName as clean, uniqueName } from './names';
import { NAME_SEPARATOR } from './tree';
import { DIRS, taperCutsFor } from './taperWorld';
import type { Dir, WorldTaper } from './taperWorld';
import { angleCutsFor, sortAngleCuts } from './angleWorld';
import type { WorldBevel, WorldChamfer, WorldMiter } from './angleWorld';
import { boardBodies } from './bodies';
import { builtInCatalog } from './materials';
import type { MaterialCatalog } from './materials';
import { holeRowsFor, sameHoles, sortHoleRows } from './holeWorld';
import { copyCurve } from './curves';
import { copyProfile } from './profiles';
import { copyBand } from './bandModel';
import { copyHardwareUse } from './hardwareModel';
import type { Band, BandType, Board, CornerRule, CurveCut, CustomMaterial, Definition, Dimension, Grain, HardwareType, HardwareUse, HoleRow, Instance, Posture, ProfileCut, Rotation } from './types';

/**
 * What the model sends back (spec §4.1). The model thinks in WORLD BOXES —
 * a min-corner and an extent along each world axis — and never in Sloyd's
 * length/width/thickness + posture + rotation encoding, which is ours to
 * derive (`orient`). Vectors are objects, not tuples, because structured
 * outputs cannot constrain an array's length.
 */
export interface Vec3 { x: number; y: number; z: number }
export type MaterialKey = string;
/** TS-only (never in the schema; parseDesign's fresh object drops it). Set by Refine's carryFromOriginal. */
export interface PartCarry {
  /** Present iff the original has any hole, curve, profile or band: the ORIGINAL part's encoding (spec §3.2). */
  frame?: { posture: Posture; rotation: Rotation };
  /** The original's stored hole rows, for the exact-row map only (AI-holes spec §3.3): never written to the output as
   *  such — the model authors holes; a returned row that IS one of these, on the new part, is restored as it was. */
  originalHoles: HoleRow[];
  curves: CurveCut[]; profiles: ProfileCut[]; bands: Band[]; cornerRule: CornerRule; hardware: HardwareUse[];
}
/** `role` is REQUIRED from the model (parseDesign checks it); optional here so
 *  hand-built fixtures stay terse. Conversion input only — never stored. */
export interface GeneratedPart {
  name: string; role?: string; material: MaterialKey; at: Vec3; size: Vec3;
  /** TS-only, never in the schema: set by Refine's carryFromOriginal from the original part of the same name. parseDesign drops it. */
  grain?: Grain;
  /** TS-only, never in the schema: the original part's features (Refine's carryFromOriginal). parseDesign drops it. */
  carry?: PartCarry;
  /** Required from the model (parseDesign checks it); optional here like `role`. */
  tapers?: WorldTaper[];
  /** Required from the model (parseDesign checks them); optional here like `tapers` (AI-angles spec §5.1). */
  miters?: WorldMiter[];
  bevels?: WorldBevel[];
  chamfers?: WorldChamfer[];
  /** Required from the model (parseDesign checks it); optional here like `tapers` (AI-holes spec §2.1). */
  holes?: WorldHoleRow[];
}
/**
 * One hole row in world words (AI-holes spec §2.1): drilled into `face`, the FIRST centre at `offset` from the part's
 * `at` along the world axes (on the face plane), continuing `toward` for `count` holes `pitch` apart. `through` means
 * `depth` is ignored. The converter (holeWorld.ts) derives the stored `HoleRow` and checks every number.
 */
export interface WorldHoleRow { face: Dir; diameter: number; depth: number; through: boolean; offset: Vec3; toward: Dir; count: number; pitch: number }
/** Where an assembly's local origin goes in the world. No turn (spec §2). */
export interface GeneratedPlacement { name: string; at: Vec3 }
/** Parts in the assembly's OWN frame, placed by translation; one level, parts only. */
/** TS-only (never in the schema): the original definition's hardware, set by Refine's carryFromOriginal. */
export interface AssemblyCarry { hardware: HardwareUse[] }
export interface GeneratedAssembly { name: string; parts: GeneratedPart[]; placements: GeneratedPlacement[]; carry?: AssemblyCarry }
/** `assemblies` is REQUIRED from the model; optional here for the same reason as `role`. */
export interface GeneratedDesign { name: string; parts: GeneratedPart[]; assemblies?: GeneratedAssembly[] }
/** `detail` is the whole message, set for `'taper'`, `'angle'` and `'hole'`. */
export interface RejectedPart { name: string; reason: 'not-finite' | 'too-small' | 'unplaced' | 'empty' | 'taper' | 'angle' | 'hole'; detail?: string }

const vec3Schema = {
  type: 'object',
  properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
  required: ['x', 'y', 'z'],
  additionalProperties: false,
};

/** A world direction: defined ONCE in `$defs` and referenced (see DESIGN_SCHEMA). */
const dirSchema = { $ref: '#/$defs/dir' };
/** One taper in world words (AI-tapers spec §2): the faces that slope, the end that gets thinner, where it starts
 *  (from that end) and how much it removes there. Counts and duplicates are the converter's to check. */
const taperSchema = {
  type: 'object',
  properties: { faces: { type: 'array', items: dirSchema }, toward: dirSchema, start: { type: 'number' }, amount: { type: 'number' } },
  required: ['faces', 'toward', 'start', 'amount'],
  additionalProperties: false,
};

/** One miter, bevel or chamfer in world words (AI-angles spec §5.1); the converter checks directions and numbers. */
const miterSchema = {
  type: 'object',
  properties: { end: dirSchema, longPoint: dirSchema, angle: { type: 'number' } },
  required: ['end', 'longPoint', 'angle'],
  additionalProperties: false,
};
const bevelSchema = {
  type: 'object',
  properties: { face: dirSchema, longPoint: dirSchema, angle: { type: 'number' } },
  required: ['face', 'longPoint', 'angle'],
  additionalProperties: false,
};
const chamferSchema = {
  type: 'object',
  properties: { edge: { type: 'array', items: dirSchema }, legs: { type: 'array', items: { type: 'number' } } },
  required: ['edge', 'legs'],
  additionalProperties: false,
};
/** One hole row in world words (AI-holes spec §2.1); the converter checks directions and numbers. */
const holeSchema = {
  type: 'object',
  properties: {
    face: dirSchema, diameter: { type: 'number' }, depth: { type: 'number' }, through: { type: 'boolean' },
    offset: vec3Schema, toward: dirSchema, count: { type: 'number' }, pitch: { type: 'number' },
  },
  required: ['face', 'diameter', 'depth', 'through', 'offset', 'toward', 'count', 'pitch'],
  additionalProperties: false,
};

/** The part, its material enum from a catalog's ids: the built-ins (from MATERIALS, so a new built-in reaches the model
 *  with no second edit), then a project's custom materials for Refine. Key order is pinned byte for byte (fu 322). */
const partSchemaFor = (materials: readonly string[]) => ({
  type: 'object',
  properties: {
    name: { type: 'string' },
    role: { type: 'string' },
    material: { type: 'string', enum: [...materials] },
    at: vec3Schema,
    size: vec3Schema,
    tapers: { type: 'array', items: taperSchema },
    miters: { type: 'array', items: miterSchema },
    bevels: { type: 'array', items: bevelSchema },
    chamfers: { type: 'array', items: chamferSchema },
    holes: { type: 'array', items: holeSchema },
  },
  required: ['name', 'role', 'material', 'at', 'size', 'tapers', 'miters', 'bevels', 'chamfers', 'holes'],
  additionalProperties: false,
});

/**
 * The part and the direction are defined ONCE, in `$defs`, and referenced: the API compiles the schema into a grammar
 * and refuses one that grows too large (400 "The compiled grammar is too large"). Measured 2026-10-14 with the miter,
 * bevel and chamfer arrays: written out inline (the part twice, loose and in assemblies) it was refused; with `$defs`
 * it compiled. A new part field or enum costs once here, not twice.
 *
 * `catalog`: Generate passes the built-ins (the schema it always had, byte for byte); Refine passes the project's
 * catalog so its custom materials are choosable (custom materials spec §6). Only the material enum differs.
 */
export function designSchema(catalog: MaterialCatalog = builtInCatalog()): Record<string, unknown> {
  return {
    $defs: { dir: { type: 'string', enum: [...DIRS] }, part: partSchemaFor(catalog.ids) },
    type: 'object',
    properties: {
      name: { type: 'string' },
      parts: { type: 'array', items: { $ref: '#/$defs/part' } },
      assemblies: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            parts: { type: 'array', items: { $ref: '#/$defs/part' } },
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
}
export const DESIGN_SCHEMA: Record<string, unknown> = designSchema();

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isVec3 = (v: unknown): v is Vec3 =>
  isObj(v) && (['x', 'y', 'z'] as const).every((k) => typeof v[k] === 'number');

const isDir = (v: unknown) => (DIRS as readonly unknown[]).includes(v);
const isTaper = (t: unknown): boolean =>
  isObj(t) && Array.isArray(t.faces) && t.faces.every(isDir) && isDir(t.toward) && typeof t.start === 'number' && typeof t.amount === 'number';

const isMiter = (m: unknown): boolean => isObj(m) && isDir(m.end) && isDir(m.longPoint) && typeof m.angle === 'number';
const isBevel = (m: unknown): boolean => isObj(m) && isDir(m.face) && isDir(m.longPoint) && typeof m.angle === 'number';
// Arrays cannot be length-constrained in the schema: exactly two of each here.
const isChamfer = (m: unknown): boolean => isObj(m) && Array.isArray(m.edge) && m.edge.length === 2 && m.edge.every(isDir) &&
  Array.isArray(m.legs) && m.legs.length === 2 && m.legs.every((n) => typeof n === 'number');
const isHole = (h: unknown): boolean => isObj(h) && isDir(h.face) && isDir(h.toward) && typeof h.through === 'boolean' &&
  isVec3(h.offset) && (['diameter', 'depth', 'count', 'pitch'] as const).every((k) => typeof h[k] === 'number');

const isPart = (p: unknown, catalog: MaterialCatalog): boolean =>
  isObj(p) && typeof p.name === 'string' && typeof p.role === 'string' && typeof p.material === 'string' &&
  catalog.get(p.material) !== undefined && isVec3(p.at) && isVec3(p.size) &&
  Array.isArray(p.tapers) && p.tapers.every(isTaper) &&
  Array.isArray(p.miters) && p.miters.every(isMiter) && Array.isArray(p.bevels) && p.bevels.every(isBevel) &&
  Array.isArray(p.chamfers) && p.chamfers.every(isChamfer) && Array.isArray(p.holes) && p.holes.every(isHole);
const isPlacement = (p: unknown): boolean => isObj(p) && typeof p.name === 'string' && isVec3(p.at);
const isAssembly = (a: unknown, catalog: MaterialCatalog): boolean =>
  isObj(a) && typeof a.name === 'string' && Array.isArray(a.parts) && a.parts.every((p) => isPart(p, catalog)) &&
  Array.isArray(a.placements) && a.placements.every(isPlacement);

const vec = (o: unknown): Vec3 => { const v = o as Vec3; return { x: v.x, y: v.y, z: v.z }; };
const partOf = (o: unknown): GeneratedPart => {
  const p = o as GeneratedPart;
  return { name: p.name, role: p.role, material: p.material, at: vec(p.at), size: vec(p.size),
    tapers: (p.tapers ?? []).map((t) => ({ faces: [...t.faces], toward: t.toward, start: t.start, amount: t.amount })),
    miters: (p.miters ?? []).map((m) => ({ end: m.end, longPoint: m.longPoint, angle: m.angle })),
    bevels: (p.bevels ?? []).map((m) => ({ face: m.face, longPoint: m.longPoint, angle: m.angle })),
    chamfers: (p.chamfers ?? []).map((m) => ({ edge: [m.edge[0], m.edge[1]] as WorldChamfer['edge'], legs: [m.legs[0], m.legs[1]] as [number, number] })),
    holes: (p.holes ?? []).map((h) => ({ face: h.face, diameter: h.diameter, depth: h.depth, through: h.through, offset: vec(h.offset),
      toward: h.toward, count: h.count, pitch: h.pitch })) };
};

/**
 * Shape check on the parsed output. The API enforces the schema, but this is
 * the client's own gate — a provider without structured outputs, or a
 * truncated stream, must not reach the converter. Numbers are only checked
 * for TYPE here; non-finite values are the converter's to reject per part.
 * A design with no parts anywhere (loose or in an assembly) is unusable.
 * A material must be in `catalog` (Refine: the project's, custom materials spec §6; otherwise the built-ins).
 */
export function parseDesign(json: unknown, catalog: MaterialCatalog = builtInCatalog()): GeneratedDesign | null {
  if (!isObj(json) || typeof json.name !== 'string' || !Array.isArray(json.parts) || !Array.isArray(json.assemblies)) return null;
  if (!json.parts.every((p) => isPart(p, catalog)) || !json.assemblies.every((a) => isAssembly(a, catalog))) return null;
  const total = json.parts.length + (json.assemblies as { parts: unknown[] }[]).reduce((n, a) => n + a.parts.length, 0);
  if (total === 0) return null;
  // A fresh object with ONLY the schema's fields, so nothing the model adds
  // (a `grain`, say) reaches the converter.
  return {
    name: json.name,
    parts: json.parts.map(partOf),
    assemblies: (json.assemblies as { name: string; parts: unknown[]; placements: { name: string; at: unknown }[] }[]).map((a) => ({
      name: a.name,
      parts: a.parts.map(partOf),
      placements: a.placements.map((pl) => ({ name: pl.name, at: vec(pl.at) })),
    })),
  };
}

const snap = (v: number) => Math.round(v / SNAP_INCHES) * SNAP_INCHES;

/** Re-exported: its home is geometry.ts, so holeWorld.ts can read it without an import cycle (final review I2). */
export { MAX_MAGNITUDE };
const usable = (v: number) => Number.isFinite(v) && Math.abs(v) <= MAX_MAGNITUDE;


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
 * World extents → Sloyd's encoding in a GIVEN frame (refine-features spec §3.2): a carried part keeps the original's
 * posture and rotation, and the dimension `axisDimensions` puts on world axis k takes `size[k]` — the same box, the
 * original's hand, so board-local features stay on the same wood. The turn table is read, never restated.
 */
export function frameFor(size: [number, number, number], frame: { posture: Posture; rotation: Rotation }): Pick<Board, 'length' | 'width' | 'thickness' | 'posture' | 'rotation'> {
  const dims = axisDimensions({ posture: frame.posture, rotation: frame.rotation } as Board);
  const out = { posture: frame.posture, rotation: frame.rotation } as Pick<Board, 'length' | 'width' | 'thickness' | 'posture' | 'rotation'>;
  dims.forEach((d, k) => { out[d] = size[k]!; });
  return out;
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

/** migrateDocument also coerces grain, so this guard is belt-and-braces. */
const isGrain = (g: unknown): g is Grain => (DIMENSION_ORDER as readonly unknown[]).includes(g);

/**
 * Snap, check, encode one part; null (and a rejection) when unusable. A value in
 * `exact` (Refine: the original's own numbers) is kept as it is (refine spec §4).
 */
function convertPart(p: GeneratedPart, label: string, rejected: RejectedPart[], exact?: ReadonlySet<number>, exactAngles?: ReadonlyMap<number, number>): Omit<Board, 'id'> | null {
  // Checked AFTER the snap: a finite value near Number.MAX_VALUE overflows
  // to Infinity on the division by SNAP_INCHES. Covers NaN/±Infinity too,
  // and anything beyond MAX_MAGNITUDE.
  const snapped = [p.at.x, p.at.y, p.at.z, p.size.x, p.size.y, p.size.z].map((v) => (exact?.has(v) ? v : snap(v)));
  if (!snapped.every(usable)) {
    rejected.push({ name: label, reason: 'not-finite' });
    return null;
  }
  const [ax, ay, az, sx, sy, sz] = snapped;
  if (sx <= 0 || sy <= 0 || sz <= 0) {
    rejected.push({ name: label, reason: 'too-small' });
    return null;
  }
  const fields = { name: clean(p.name), material: p.material, grain: isGrain(p.grain) ? p.grain : 'length', cuts: [], position: [ax, ay, az] as Vec,
    // A part carrying a board-local feature keeps the original's frame (spec §3.2); everything else is encoded by orient.
    ...(p.carry?.frame ? frameFor([sx, sy, sz], p.carry.frame) : orient([sx, sy, sz])) };
  // Tapers (spec §2.1): numbers snapped as size is, unless exact; checked after the snap; mapped through taperWorld.
  const tapers = (p.tapers ?? []).map((t) => ({ ...t, start: exact?.has(t.start) ? t.start : snap(t.start), amount: exact?.has(t.amount) ? t.amount : snap(t.amount) }));
  if (!tapers.every((t) => usable(t.start) && usable(t.amount))) {
    // Its own words (fu 313): the 'not-finite' text speaks of a position or size.
    rejected.push({ name: label, reason: 'taper', detail: `${label} has a taper whose start or amount is not a finite number or is beyond 10,000in.` });
    return null;
  }
  const made = taperCutsFor({ id: '', angleCuts: [], holes: [], curves: [], profiles: [], bands: [], cornerRule: 'long', hardware: [], ...fields } as Board, tapers);
  if ('fault' in made) {
    rejected.push({ name: label, reason: 'taper', detail: `${label} ${made.fault}.` });
    return null;
  }
  // Miters, bevels and chamfers (AI-angles spec §5.2): legs snapped as size is, unless exact; angles through ratioFor.
  const chamfers = (p.chamfers ?? []).map((c) => ({ ...c, legs: c.legs.map((l) => (exact?.has(l) ? l : snap(l))) as [number, number] }));
  if (!chamfers.every((c) => c.legs.every(usable)) || ![...(p.miters ?? []), ...(p.bevels ?? [])].every((m) => Number.isFinite(m.angle))) {
    rejected.push({ name: label, reason: 'angle', detail: `${label} has a miter, bevel or chamfer whose numbers are not finite or are beyond 10,000in.` });
    return null;
  }
  const board = { id: '', angleCuts: [], holes: [], curves: [], profiles: [], bands: [], cornerRule: 'long', hardware: [], ...fields } as Board;
  const angled = angleCutsFor(board, { miters: p.miters ?? [], bevels: p.bevels ?? [], chamfers }, exactAngles);
  if ('fault' in angled) {
    rejected.push({ name: label, reason: 'angle', detail: `${label} ${angled.fault}.` });
    return null;
  }
  const angleCuts = [...made.cuts, ...sortAngleCuts(angled.cuts)].map((c) => ({ id: nextId(), ...c }));
  // Together they must leave wood (spec §5.2): the part's real bodies are not empty.
  if (angleCuts.length > 0 && boardBodies({ ...board, angleCuts }).length === 0) {
    rejected.push({ name: label, reason: 'angle', detail: `${label} has angle cuts that together leave no wood.` });
    return null;
  }
  // Hole rows (AI-holes spec §3.1): converted on the part as encoded (the carried frame, or orient's); a SHAPE fault
  // rejects the part, a strict fault (holeFaults) does not — the row is stored and holeDesignFaults flags it.
  const derived = holeRowsFor({ ...board, angleCuts }, p.holes ?? [], exact);
  if ('fault' in derived) {
    rejected.push({ name: label, reason: 'hole', detail: `${label} ${derived.fault}.` });
    return null;
  }
  const holes = restoreHoles({ ...board, angleCuts }, derived.rows, p.carry);
  // The carried features, copied again (ids kept, numbers never snapped): on the part BEFORE migrateDocument and
  // linkByRole, so the load gate and sameShared judge the real values (spec §3.3).
  const c = p.carry;
  return {
    ...fields, angleCuts,
    holes, curves: c ? c.curves.map(copyCurve) : [], profiles: c ? c.profiles.map(copyProfile) : [],
    bands: c ? c.bands.map(copyBand) : [], cornerRule: c ? c.cornerRule : 'long', hardware: c ? c.hardware.map(copyHardwareUse) : [],
  };
}

/**
 * The exact-row map (AI-holes spec §3.3): each re-derived row is swapped for the first UNUSED original row of the same
 * part that drills the same holes on the NEW part (`sameHoles`), kept as it was — its id, `alongFrom`, `acrossFrom` and
 * numbers — so an untouched row (or one on a part that only moved) comes back exactly, however a person measured it.
 * Only in the original's frame (`carry.frame`; a holed original always sets it): the stored fields mean nothing in
 * another. Every other row gets a fresh id. Sorted canonically after the swap (a swapped row's fields can sort apart).
 */
function restoreHoles(board: Board, rows: readonly Omit<HoleRow, 'id'>[], carry: PartCarry | undefined): HoleRow[] {
  const originals = carry?.frame ? carry.originalHoles : [];
  const used = new Set<number>();
  return sortHoleRows(rows.map((r): HoleRow => {
    const i = originals.findIndex((o, k) => !used.has(k) && sameHoles(o, r, board));
    if (i < 0) return { id: nextId(), ...r };
    used.add(i);
    return { ...originals[i]! };
  }));
}

/**
 * Model output → a trusted TREE document (spec §3). Round first (invariant 25:
 * model output is a FREE value, like a drag), then encode, then build one
 * Definition per assembly and one unturned Instance per placement, then
 * translate the whole design onto the floor with its footprint centred — by a
 * multiple of SNAP_INCHES, shifting loose parts and instance ORIGINS only,
 * never definition-local coordinates (`opts.centre === false` skips the
 * horizontal centring and keeps only the floor rule; `opts.exact` lists values to keep unsnapped; `opts.exactAngles` maps a
 * degree value Refine wrote to the stored slope, AI-angles spec §6.2; `opts.materials`, Refine: the project's custom
 * materials, so the load gate keeps a part naming one instead of falling it back to pine, custom materials spec §6;
 * `opts.bandTypes` / `opts.hardwareTypes`, Refine: the project's, so carried bands and hardware survive the gate) —
 * then migrateDocument, the same gate an imported file passes, which dedupes names (inv 8), checks ids (inv 33) and
 * prunes a custom material no part uses.
 *
 * Every id is minted here with nextId so `roles` (stored part id → role) and
 * the definition → assembly label map survive the load gate.
 */
export function designToDocument(design: GeneratedDesign, opts: { centre?: boolean; exact?: ReadonlySet<number>; exactAngles?: ReadonlyMap<number, number>; materials?: readonly CustomMaterial[]; bandTypes?: readonly BandType[]; hardwareTypes?: readonly HardwareType[] } = {}): {
  doc: SloydDocument; rejected: RejectedPart[]; authored: Authored;
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
    const b = convertPart(p, clean(p.name), rejected, opts.exact, opts.exactAngles);
    return b ? [mint(p, b)] : [];
  });

  const definitions: Definition[] = [];
  const instances: Instance[] = [];
  const labelOf = new Map<string, string>(); // definition id → assembly label
  const taken: { id: string; name: string }[] = [];
  for (const a of design.assemblies ?? []) {
    // Assembly names are the model's handle in feedback, so they are unique
    // among themselves (they are not stored: a Definition has no name).
    const label = uniqueName(clean(a.name).trim() || 'Assembly', taken);
    taken.push({ id: label, name: label });
    const parts = a.parts.flatMap((p) => {
      const b = convertPart(p, `${clean(p.name)} (in assembly ${label})`, rejected, opts.exact, opts.exactAngles);
      return b ? [mint(p, b)] : [];
    });
    const origins = a.placements.flatMap((pl) => {
      const at = [pl.at.x, pl.at.y, pl.at.z].map((v) => (opts.exact?.has(v) ? v : snap(v))) as Vec;
      const plName = clean(pl.name);
      if (at.every(usable)) return [{ name: plName, at }];
      rejected.push({ name: `${plName} (placement of ${label})`, reason: 'not-finite' });
      return [];
    });
    if (parts.length === 0) { rejected.push({ name: label, reason: 'empty' }); continue; }
    if (origins.length === 0) { rejected.push({ name: label, reason: 'unplaced' }); continue; }
    const def: Definition = { id: nextId(), boards: parts, instances: [], hardware: a.carry ? a.carry.hardware.map(copyHardwareUse) : [] };
    definitions.push(def);
    labelOf.set(def.id, label);
    for (const o of origins) instances.push({ id: nextId(), name: o.name, definition: def.id, position: o.at, rotation: 0 });
  }

  // Bounds over the PLACED world parts. Unturned, so world = origin + local.
  const placed: [Vec, Vec][] = [
    ...loose.map((b) => [b.position, extentsOf(b)] as [Vec, Vec]),
    ...instances.flatMap((i) => definitions.find((d) => d.id === i.definition)!.boards.map((b) => {
      const p = b.position;
      return [[i.position[0] + p[0], i.position[1] + p[1], i.position[2] + p[2]], extentsOf(b as Board)] as [Vec, Vec];
    })),
  ];
  if (placed.length > 0) {
    const min = [0, 1, 2].map((k) => Math.min(...placed.map(([p]) => p[k])));
    const max = [0, 1, 2].map((k) => Math.max(...placed.map(([p, e]) => p[k] + e[k])));
    // Refine passes centre: false, so untouched parts keep the original's
    // coordinates (refine spec §4); the floor rule holds either way.
    const shift = opts.centre === false
      ? [0, -min[1], 0]
      : [snap(-(min[0] + max[0]) / 2), -min[1], snap(-(min[2] + max[2]) / 2)];
    const move = (p: Vec): Vec => [p[0] + shift[0], p[1] + shift[1], p[2] + shift[2]];
    for (const b of loose) b.position = move(b.position);
    for (const i of instances) i.position = move(i.position);
  }

  const name = design.name.trim() || 'Generated design';
  // Band and hardware types go in BEFORE the load gate, which drops a band or hardware use naming an unknown type
  // (spec §3.3); absent (Generate), createDocument's defaults stand.
  const doc = linkByRole(migrateDocument({
    ...createDocument(name), boards: loose, instances, definitions, materials: [...(opts.materials ?? [])],
    ...(opts.bandTypes ? { bandTypes: opts.bandTypes.map((t) => ({ ...t })) } : {}),
    ...(opts.hardwareTypes ? { hardwareTypes: opts.hardwareTypes.map((t) => ({ ...t })) } : {}),
  }), roles);
  return { doc, rejected, authored: authoredIndex(doc, labelOf) };
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
