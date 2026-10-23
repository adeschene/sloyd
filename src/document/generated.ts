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
import { builtInCatalog, catalogOf } from './materials';
import type { MaterialCatalog } from './materials';
import { holeRowsFor, sameHoles, sortHoleRows } from './holeWorld';
import { copyCurve } from './curves';
import { PROFILE_KINDS, copyProfile } from './profiles';
import { BUILT_IN_BAND, BUILT_IN_BAND_ID, copyBand } from './bandModel';
import { bandsFor, mintBandTypes } from './bandWorld';
import { copyHardwareUse } from './hardwareModel';
import type { Band, BandType, Board, CornerRule, CurveCut, CustomMaterial, Definition, Dimension, Grain, HardwareType, HardwareUse, HoleRow, Instance, Posture, ProfileCut, ProfileKind, Rotation } from './types';

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
  /** Present iff the original has any hole, curve, profile or band: the ORIGINAL part's encoding (spec §3.2) and its world
   *  extents (`boardExtents`), which `keptFrame` ranks a holes-only part's returned box against (residual R1). */
  frame?: { posture: Posture; rotation: Rotation; extents: [number, number, number] };
  /** The original's stored hole rows, for the exact-row map only (AI-holes spec §3.3): never written to the output as
   *  such — the model authors holes; a returned row that IS one of these, on the new part, is restored as it was. */
  originalHoles: HoleRow[];
  curves: CurveCut[]; profiles: ProfileCut[]; bands: Band[]; cornerRule: CornerRule; hardware: HardwareUse[];
}
/** One edge band in world words (AI-bands spec §2.2): the side face banded and an edging key (`edgingKeys`). */
export interface WorldBand { edge: Dir; edging: string }
/**
 * One angle cut as the model writes it (AI-profiles spec R2): the four angle kinds share ONE item shape, because the API's
 * compiled grammar pays per distinct object shape (fu 322). `parseDesign` splits it into the internal `tapers`, `miters`,
 * `bevels` and `chamfers`; `toWireDesign` merges them back. Per kind: a taper's `dirs` are its sloping faces (1–4),
 * `toward` the thin end, `values` [start, amount]; a miter's `dirs` [end], a bevel's [face], `toward` the long point,
 * `values` [angle]; a chamfer's `dirs` the edge's two faces, `values` its legs in that order, `toward` ignored (written
 * as `dirs[0]`).
 */
export interface WorldAngle { kind: 'taper' | 'miter' | 'bevel' | 'chamfer'; dirs: Dir[]; toward: Dir; values: number[] }
/**
 * One edge profile in world words (AI-profiles spec §2.1): `edge` the two faces meeting at the routed edge (one broad face,
 * one side), `start`/`end` along the edge from the part's `at`. Parsed here; converted by profileWorld.ts.
 */
export interface WorldProfile { edge: Dir[]; kind: ProfileKind; size: number; fillet: number; depth: number; facing: 'face' | 'edge'; allRound: boolean; start: number; end: number }

/** `role` is REQUIRED from the model (parseDesign checks it); optional here so
 *  hand-built fixtures stay terse. Conversion input only — never stored. */
export interface GeneratedPart {
  name: string; role?: string; material: MaterialKey; at: Vec3; size: Vec3;
  /** TS-only, never in the schema: set by Refine's carryFromOriginal from the original part of the same name. parseDesign drops it. */
  grain?: Grain;
  /** TS-only, never in the schema: the original part's features (Refine's carryFromOriginal). parseDesign drops it. */
  carry?: PartCarry;
  /** Split by parseDesign from the model's required `angles` (AI-profiles spec R2); optional here like `role`. */
  tapers?: WorldTaper[];
  /** Split from `angles` likewise (AI-angles spec §5.1; AI-profiles spec R2); optional here like `tapers`. */
  miters?: WorldMiter[];
  bevels?: WorldBevel[];
  chamfers?: WorldChamfer[];
  /** TS-only, never in the schema: an `angles` entry with the wrong count of `dirs` or `values` for its kind (spec R2,
   *  R6.4), worded for the model; set by parseDesign only when there is one. convertPart rejects the part. */
  angleFaults?: string[];
  /** Required from the model (parseDesign checks it); optional here like `holes` (AI-profiles spec §2.1). */
  profiles?: WorldProfile[];
  /** Required from the model (parseDesign checks it); optional here like `holes` (AI-bands spec §2.2). Ignored for a part
   *  with carried curves (its carried bands stand). */
  bands?: WorldBand[];
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
/** `detail` is the whole message, set for `'taper'`, `'angle'`, `'hole'` and `'band'`. */
export interface RejectedPart { name: string; reason: 'not-finite' | 'too-small' | 'unplaced' | 'empty' | 'taper' | 'angle' | 'hole' | 'band'; detail?: string }

/** A world point/extent: defined ONCE in `$defs.vec3` and referenced (fu 322: the compiled-grammar cap, AI-bands probe 2). */
const vec3Def = {
  type: 'object',
  properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
  required: ['x', 'y', 'z'],
  additionalProperties: false,
};

/** A world direction: defined ONCE in `$defs` and referenced (see DESIGN_SCHEMA). */
const dirSchema = { $ref: '#/$defs/dir' };
const vec3Schema = { $ref: '#/$defs/vec3' };
const ANGLE_KINDS = ['taper', 'miter', 'bevel', 'chamfer'] as const;
/** One taper, miter, bevel or chamfer in world words, all four in ONE item shape (`WorldAngle`; AI-profiles spec R2).
 *  Counts are parseDesign's to check (a wrong count rejects the part, `angleFaults`); the rest is the converters'. */
const angleSchema = {
  type: 'object',
  properties: { kind: { type: 'string', enum: [...ANGLE_KINDS] }, dirs: { type: 'array', items: dirSchema }, toward: dirSchema, values: { type: 'array', items: { type: 'number' } } },
  required: ['kind', 'dirs', 'toward', 'values'],
  additionalProperties: false,
};

/** One profile in world words (AI-profiles spec §2.1); the converter checks directions and numbers. */
const profileSchema = {
  type: 'object',
  properties: {
    edge: { type: 'array', items: dirSchema }, kind: { type: 'string', enum: [...PROFILE_KINDS] }, size: { type: 'number' },
    fillet: { type: 'number' }, depth: { type: 'number' }, facing: { type: 'string', enum: ['face', 'edge'] },
    allRound: { type: 'boolean' }, start: { type: 'number' }, end: { type: 'number' },
  },
  required: ['edge', 'kind', 'size', 'fillet', 'depth', 'facing', 'allRound', 'start', 'end'],
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

/** One band in world words (AI-bands spec §2.2): the side face, and an edging from a closed enum (§3.1). */
const bandSchemaFor = (edgings: readonly string[]) => ({
  type: 'object',
  properties: { edge: dirSchema, edging: { type: 'string', enum: [...edgings] } },
  required: ['edge', 'edging'],
  additionalProperties: false,
});

/**
 * The edging choices (AI-bands spec §3.1), built per call as the material enum is: `veneer` (the built-in Iron-on),
 * the project's other band types by id (stored order), then `solid <id>` for every solid material in the catalog.
 */
export function edgingKeys(catalog: MaterialCatalog, bandTypes: readonly BandType[]): string[] {
  return [
    'veneer',
    ...bandTypes.filter((t) => t.id !== BUILT_IN_BAND_ID).map((t) => t.id),
    ...catalog.ids.filter((id) => catalog.get(id)?.kind === 'solid').map((id) => `solid ${id}`),
  ];
}

/** The part, its material enum from a catalog's ids: the built-ins (from MATERIALS, so a new built-in reaches the model
 *  with no second edit), then a project's custom materials for Refine. Key order is pinned byte for byte (fu 322). */
const partSchemaFor = (materials: readonly string[], edgings: readonly string[]) => ({
  type: 'object',
  properties: {
    name: { type: 'string' },
    role: { type: 'string' },
    material: { type: 'string', enum: [...materials] },
    at: vec3Schema,
    size: vec3Schema,
    angles: { type: 'array', items: angleSchema },
    holes: { type: 'array', items: holeSchema },
    bands: { type: 'array', items: bandSchemaFor(edgings) },
    profiles: { type: 'array', items: profileSchema },
  },
  required: ['name', 'role', 'material', 'at', 'size', 'angles', 'holes', 'bands', 'profiles'],
  additionalProperties: false,
});

/**
 * The part and the direction are defined ONCE, in `$defs`, and referenced: the API compiles the schema into a grammar
 * and refuses one that grows too large (400 "The compiled grammar is too large"). Measured 2026-10-14 with the miter,
 * bevel and chamfer arrays: written out inline (the part twice, loose and in assemblies) it was refused; with `$defs`
 * it compiled. A new part field or enum costs once here, not twice.
 *
 * `catalog`: Generate passes the built-ins (the schema it always had, byte for byte); Refine passes the project's
 * catalog so its custom materials are choosable (custom materials spec §6), and its band types (`edging` enum).
 */
export function designSchema(catalog: MaterialCatalog = builtInCatalog(), bandTypes: readonly BandType[] = [BUILT_IN_BAND]): Record<string, unknown> {
  return {
    $defs: { dir: { type: 'string', enum: [...DIRS] }, vec3: vec3Def, part: partSchemaFor(catalog.ids, edgingKeys(catalog, bandTypes)) },
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
// Types only: a wrong COUNT for the kind is a per-part shape fault (`angleFaultOf`), never a whole-response refusal.
const isAngle = (a: unknown): boolean => isObj(a) && (ANGLE_KINDS as readonly unknown[]).includes(a.kind) &&
  Array.isArray(a.dirs) && a.dirs.every(isDir) && isDir(a.toward) && Array.isArray(a.values) && a.values.every((n) => typeof n === 'number');
const isProfile = (p: unknown): boolean => isObj(p) && Array.isArray(p.edge) && p.edge.every(isDir) &&
  (PROFILE_KINDS as readonly unknown[]).includes(p.kind) && (p.facing === 'face' || p.facing === 'edge') && typeof p.allRound === 'boolean' &&
  (['size', 'fillet', 'depth', 'start', 'end'] as const).every((k) => typeof p[k] === 'number');

/** How many `dirs` and `values` each kind takes (spec R2's table): the counts the old four-array form accepted. */
const ANGLE_COUNTS: Record<WorldAngle['kind'], { dirs: [number, number]; values: number }> = {
  taper: { dirs: [1, 4], values: 2 }, miter: { dirs: [1, 1], values: 1 }, bevel: { dirs: [1, 1], values: 1 }, chamfer: { dirs: [2, 2], values: 2 },
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
/** The shape fault of a wrong count for its kind, worded for the model (`has a miter with 2 directions; a miter takes 1`), or null. */
function angleFaultOf(a: WorldAngle): string | null {
  const { dirs: [lo, hi], values } = ANGLE_COUNTS[a.kind];
  if (a.dirs.length < lo || a.dirs.length > hi) return `has a ${a.kind} with ${plural(a.dirs.length, 'direction')}; a ${a.kind} takes ${lo === hi ? lo : `${lo} to ${hi}`}`;
  if (a.values.length !== values) return `has a ${a.kind} with ${plural(a.values.length, 'value')}; a ${a.kind} takes ${values}`;
  return null;
}
/** A fault `angleFaultOf` wrote for a taper entry: its reason is `'taper'`, every other kind's `'angle'`. */
const isTaperFault = (f: string) => f.startsWith('has a taper ');
const isHole = (h: unknown): boolean => isObj(h) && isDir(h.face) && isDir(h.toward) && typeof h.through === 'boolean' &&
  isVec3(h.offset) && (['diameter', 'depth', 'count', 'pitch'] as const).every((k) => typeof h[k] === 'number');

const isBand = (b: unknown, edgings: ReadonlySet<string>): boolean => isObj(b) && isDir(b.edge) && typeof b.edging === 'string' && edgings.has(b.edging);

const isPart = (p: unknown, catalog: MaterialCatalog, edgings: ReadonlySet<string>): boolean =>
  isObj(p) && typeof p.name === 'string' && typeof p.role === 'string' && typeof p.material === 'string' &&
  catalog.get(p.material) !== undefined && isVec3(p.at) && isVec3(p.size) &&
  Array.isArray(p.angles) && p.angles.every(isAngle) && Array.isArray(p.holes) && p.holes.every(isHole) &&
  Array.isArray(p.bands) && p.bands.every((b) => isBand(b, edgings)) && Array.isArray(p.profiles) && p.profiles.every(isProfile);
const isPlacement = (p: unknown): boolean => isObj(p) && typeof p.name === 'string' && isVec3(p.at);
const isAssembly = (a: unknown, catalog: MaterialCatalog, edgings: ReadonlySet<string>): boolean =>
  isObj(a) && typeof a.name === 'string' && Array.isArray(a.parts) && a.parts.every((p) => isPart(p, catalog, edgings)) &&
  Array.isArray(a.placements) && a.placements.every(isPlacement);

const vec = (o: unknown): Vec3 => { const v = o as Vec3; return { x: v.x, y: v.y, z: v.z }; };
/** A part as the model writes it: `angles` merged (spec R2); `profiles` required. */
type WirePart = Omit<GeneratedPart, 'tapers' | 'miters' | 'bevels' | 'chamfers' | 'angleFaults' | 'grain' | 'carry'> & { angles: WorldAngle[] };
const partOf = (o: unknown): GeneratedPart => {
  const p = o as WirePart;
  // Split `angles` by kind, in array order (spec R2); an entry with the wrong count for its kind goes to angleFaults only.
  const tapers: WorldTaper[] = [], miters: WorldMiter[] = [], bevels: WorldBevel[] = [], chamfers: WorldChamfer[] = [], angleFaults: string[] = [];
  for (const a of p.angles) {
    const fault = angleFaultOf(a);
    if (fault) { angleFaults.push(fault); continue; }
    const [d0, d1] = a.dirs as [Dir, Dir];
    if (a.kind === 'taper') tapers.push({ faces: [...a.dirs], toward: a.toward, start: a.values[0]!, amount: a.values[1]! });
    else if (a.kind === 'miter') miters.push({ end: d0, longPoint: a.toward, angle: a.values[0]! });
    else if (a.kind === 'bevel') bevels.push({ face: d0, longPoint: a.toward, angle: a.values[0]! });
    else chamfers.push({ edge: [d0, d1], legs: [a.values[0]!, a.values[1]!] });
  }
  return { name: p.name, role: p.role, material: p.material, at: vec(p.at), size: vec(p.size),
    tapers, miters, bevels, chamfers, ...(angleFaults.length > 0 ? { angleFaults } : {}),
    holes: (p.holes ?? []).map((h) => ({ face: h.face, diameter: h.diameter, depth: h.depth, through: h.through, offset: vec(h.offset),
      toward: h.toward, count: h.count, pitch: h.pitch })),
    bands: (p.bands ?? []).map((b) => ({ edge: b.edge, edging: b.edging })),
    profiles: (p.profiles ?? []).map((f) => ({ edge: [...f.edge], kind: f.kind, size: f.size, fillet: f.fillet, depth: f.depth, facing: f.facing,
      allRound: f.allRound, start: f.start, end: f.end })) };
};

/** The wire form of one internal part (spec R6.4): schema key order; `angles` merged tapers, miters, bevels, chamfers. */
const wirePart = (p: GeneratedPart): WirePart => ({
  name: p.name, role: p.role ?? '', material: p.material, at: vec(p.at), size: vec(p.size),
  angles: [
    ...(p.tapers ?? []).map((t): WorldAngle => ({ kind: 'taper', dirs: [...t.faces], toward: t.toward, values: [t.start, t.amount] })),
    ...(p.miters ?? []).map((m): WorldAngle => ({ kind: 'miter', dirs: [m.end], toward: m.longPoint, values: [m.angle] })),
    ...(p.bevels ?? []).map((m): WorldAngle => ({ kind: 'bevel', dirs: [m.face], toward: m.longPoint, values: [m.angle] })),
    ...(p.chamfers ?? []).map((c): WorldAngle => ({ kind: 'chamfer', dirs: [c.edge[0], c.edge[1]], toward: c.edge[0], values: [c.legs[0], c.legs[1]] })),
  ],
  holes: (p.holes ?? []).map((h) => ({ face: h.face, diameter: h.diameter, depth: h.depth, through: h.through, offset: vec(h.offset),
    toward: h.toward, count: h.count, pitch: h.pitch })),
  bands: (p.bands ?? []).map((b) => ({ edge: b.edge, edging: b.edging })),
  profiles: (p.profiles ?? []).map((f) => ({ edge: [...f.edge], kind: f.kind, size: f.size, fillet: f.fillet, depth: f.depth, facing: f.facing,
    allRound: f.allRound, start: f.start, end: f.end })),
});

/**
 * The design as the model reads and writes it (AI-profiles spec R6.4), the ONE serialiser for `refineMessage` and the
 * estimate: the four angle arrays merged into `angles` (in the order tapers, miters, bevels, chamfers — each array's own
 * order kept, so an echo round-trips), every required array present, and the TS-only fields (`grain`, `carry`,
 * `angleFaults`, an assembly's `carry`) dropped. `parseDesign(toWireDesign(d))` gives `d`'s parts back.
 */
export function toWireDesign(d: GeneratedDesign): unknown {
  return {
    name: d.name,
    parts: d.parts.map(wirePart),
    assemblies: (d.assemblies ?? []).map((a) => ({ name: a.name, parts: a.parts.map(wirePart), placements: a.placements.map((pl) => ({ name: pl.name, at: vec(pl.at) })) })),
  };
}

/**
 * Shape check on the parsed output. The API enforces the schema, but this is
 * the client's own gate — a provider without structured outputs, or a
 * truncated stream, must not reach the converter. Numbers are only checked
 * for TYPE here; non-finite values are the converter's to reject per part.
 * A design with no parts anywhere (loose or in an assembly) is unusable.
 * A material must be in `catalog` (Refine: the project's, custom materials spec §6; otherwise the built-ins), and a band's
 * `edging` one of `edgingKeys(catalog, bandTypes)`.
 */
export function parseDesign(json: unknown, catalog: MaterialCatalog = builtInCatalog(), bandTypes: readonly BandType[] = [BUILT_IN_BAND]): GeneratedDesign | null {
  const edgings = new Set(edgingKeys(catalog, bandTypes));
  if (!isObj(json) || typeof json.name !== 'string' || !Array.isArray(json.parts) || !Array.isArray(json.assemblies)) return null;
  if (!json.parts.every((p) => isPart(p, catalog, edgings)) || !json.assemblies.every((a) => isAssembly(a, catalog, edgings))) return null;
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
function convertPart(p: GeneratedPart, label: string, rejected: RejectedPart[], idOf: (key: string) => string, exact?: ReadonlySet<number>, exactAngles?: ReadonlyMap<number, number>): Omit<Board, 'id'> | null {
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
  // A wrong count for its kind in `angles` (AI-profiles spec R2, R6.4): a shape fault, the part rejected and fed back. A taper
  // fault decides the reason first, as tapers are converted first below.
  if (p.angleFaults && p.angleFaults.length > 0) {
    const fault = p.angleFaults.find(isTaperFault) ?? p.angleFaults[0]!;
    rejected.push({ name: label, reason: isTaperFault(fault) ? 'taper' : 'angle', detail: `${label} ${fault}.` });
    return null;
  }
  // A part carrying a board-local feature keeps the original's frame (spec §3.2); everything else is encoded by orient.
  const frame = keptFrame(p.carry, [sx, sy, sz]);
  const fields = { name: clean(p.name), material: p.material, grain: isGrain(p.grain) ? p.grain : 'length', cuts: [], position: [ax, ay, az] as Vec,
    ...(frame ? frameFor([sx, sy, sz], frame) : orient([sx, sy, sz])) };
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
  const holes = restoreHoles({ ...board, angleCuts }, derived.rows, frame ? p.carry!.originalHoles : []);
  // Bands (AI-bands spec §3.2): from the model's world words on the part as encoded, unless the part carries curves — then
  // its carried bands stand and the model's are ignored (its design showed none). A SHAPE fault rejects the part; a
  // band fault (bandFaults) does not — the band is stored and bandDesignFaults flags it. No exact-band map: the canonical
  // bands of the same sides and types ARE the stored ones (controller ruling 2).
  const c = p.carry;
  let bands: Band[];
  if (carriesCurves(p)) bands = c!.bands.map(copyBand);
  else {
    const made = bandsFor({ ...board, angleCuts }, p.bands ?? [], idOf);
    if ('fault' in made) {
      rejected.push({ name: label, reason: 'band', detail: `${label} ${made.fault}.` });
      return null;
    }
    bands = made.bands;
  }
  // The carried features, copied again (ids kept, numbers never snapped): on the part BEFORE migrateDocument and
  // linkByRole, so the load gate and sameShared judge the real values (spec §3.3).
  return {
    ...fields, angleCuts,
    holes, curves: c ? c.curves.map(copyCurve) : [], profiles: c ? c.profiles.map(copyProfile) : [],
    bands, cornerRule: c?.cornerRule ?? 'long', hardware: c ? c.hardware.map(copyHardwareUse) : [],
  };
}

/** A part whose bands are CARRIED, not authored (AI-bands spec §3.2): one with carried curves. */
const carriesCurves = (p: GeneratedPart) => (p.carry?.curves.length ?? 0) > 0;

/**
 * The frame a returned part is encoded in (refine-features spec §3.2; final review C1, residual R1; AI-bands spec §4.1),
 * the ONE decision: the original's (`carry.frame`) for a part with carried curves or profiles, always (a turn of one is
 * `featureTurned`'s fault); for a part whose ONLY frame features are holes and/or bands (both authored in world words), only while (1) EVERY world extent keeps its rank against the
 * original's — no pair of world axes strictly ordered one way in the original and strictly the other way in the result
 * (a tie on either side may stay or swap) — and (2) the world axis carrying `thickness` is still a smallest extent of the
 * result (ties ok), or the original's thickness was not a smallest extent of the original. Otherwise the model turned it (onto another face, or about its thickness
 * axis in plan), and its holes and bands, written in world words, convert in the frame `orient` gives (the exact-row swap
 * skipped, its stored fields meaning nothing there). Undefined: `orient`.
 */
function keptFrame(carry: PartCarry | undefined, size: [number, number, number]): PartCarry['frame'] {
  const frame = carry?.frame;
  if (!frame || carry!.curves.length > 0 || carry!.profiles.length > 0) return frame;
  const e = frame.extents;
  // (1) The rank rule (residual R1): no pair of world axes strictly inverted; ties allowed both ways.
  if ([0, 1, 2].some((i) => [0, 1, 2].some((j) => e[i]! < e[j]! && size[i]! > size[j]!))) return undefined;
  // (2) The tie clause (re-review): an original TIED at its smallest extent passes (1) whatever comes back, so the
  // thickness's world axis must still be a smallest extent of the result (ties ok) — unless the original's thickness was
  // not a smallest extent of the original (an oddly encoded original stays as it was on an echo, fu 428 (9)).
  const k = axisDimensions({ posture: frame.posture, rotation: frame.rotation } as Board).indexOf('thickness');
  return size[k] === Math.min(...size) || e[k] !== Math.min(...e) ? frame : undefined;
}

/**
 * The exact-row map (AI-holes spec §3.3): each re-derived row is swapped for the first UNUSED original row of the same
 * part that drills the same holes on the NEW part (`sameHoles`), kept as it was — its id, `alongFrom`, `acrossFrom` and
 * numbers — so an untouched row (or one on a part that only moved) comes back exactly, however a person measured it.
 * `originals` is empty unless the part kept the original's frame (`keptFrame`): the stored fields mean nothing in
 * another. Every other row gets a fresh id. When EVERY row is restored and none is added or dropped, the ORIGINAL stored
 * order is kept (final review M3: Plans letters and the Holes panel follow `b.holes`' order); otherwise the rows are
 * sorted canonically after the swap (a swapped row's fields can sort apart).
 */
function restoreHoles(board: Board, rows: readonly Omit<HoleRow, 'id'>[], originals: readonly HoleRow[]): HoleRow[] {
  const used = new Set<number>();
  const out = rows.map((r): HoleRow => {
    const i = originals.findIndex((o, k) => !used.has(k) && sameHoles(o, r, board));
    if (i < 0) return { id: nextId(), ...r };
    used.add(i);
    return { ...originals[i]! };
  });
  if (originals.length > 0 && used.size === rows.length && rows.length === originals.length) return originals.map((o) => ({ ...o }));
  return sortHoleRows(out);
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
 * `opts.bandTypes` / `opts.hardwareTypes`, Refine: the project's, so carried bands and hardware survive the gate; the
 * band types are first widened by `mintBandTypes` over every `edging` the design names, AI-bands spec §3.1) —
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
  // Every edging key the design names, minted once design-wide BEFORE any part converts (AI-bands spec §3.1, builder check
  // B4), against the catalog parseDesign judged the keys by (controller ruling 1). A part with carried curves is skipped:
  // its bands are ignored, and an edging it names must not leave an orphan type in the project's list.
  const keys = [...design.parts, ...(design.assemblies ?? []).flatMap((a) => a.parts)]
    .filter((p) => !carriesCurves(p)).flatMap((p) => (p.bands ?? []).map((b) => b.edging));
  const minted = mintBandTypes(keys, opts.bandTypes ?? [BUILT_IN_BAND], catalogOf({ materials: opts.materials ?? [] }));
  const roles = new Map<string, string>();
  const mint = (p: GeneratedPart, board: Omit<Board, 'id'>): Board => {
    const b: Board = { id: nextId(), ...board };
    const role = (p.role ?? '').trim().toLowerCase();
    if (role) roles.set(b.id, role);
    return b;
  };

  const loose: Board[] = design.parts.flatMap((p) => {
    const b = convertPart(p, clean(p.name), rejected, minted.idOf, opts.exact, opts.exactAngles);
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
      const b = convertPart(p, `${clean(p.name)} (in assembly ${label})`, rejected, minted.idOf, opts.exact, opts.exactAngles);
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
  // (spec §3.3). Band types: always the minted list (the project's, or the built-in, plus any minted); hardware types,
  // absent (Generate), createDocument's default stands.
  const doc = linkByRole(migrateDocument({
    ...createDocument(name), boards: loose, instances, definitions, materials: [...(opts.materials ?? [])],
    bandTypes: minted.types.map((t) => ({ ...t })),
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
