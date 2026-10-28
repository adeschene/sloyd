// Type-only: links.ts's table classifies Board's fields, and Shape/ShapedBoard derive from it.
import type { OwnField, SharedField } from './links';
import type { Units } from '../units/length';

/** Degrees about the vertical axis, counter-clockwise seen from above, applied after posture. */
export type Rotation = 0 | 90 | 180 | 270;

/** One of a board's three dimensions. */
export type Dimension = 'length' | 'width' | 'thickness';

/**
 * Which of a board's dimensions points up. That is the whole orientation model:
 * posture picks the vertical dimension, rotation orders the other two.
 *
 * `on-edge` is what v2 called `standing: true`. `upright` — the length vertical —
 * was unreachable before v3, which is why a leg, a post or a stile could not be
 * modelled at all.
 */
export type Posture = 'flat' | 'on-edge' | 'upright';

/** Which of a board's own dimensions the fibres run along. Part-local, so grain
 *  turns with the board the way real stock does. */
export type Grain = Dimension;

/** Which end of a cut's `face` dimension the cut enters from. */
export type CutFrom = 'min' | 'max';

/**
 * A rectangular cut: stock removed from a board. It runs across one of the
 * board's dimensions — fully, unless `stopMin`/`stopMax` stop it short of an
 * end. Its name (dado, rabbet, stopped dado, mortise, ...) is never stored: cutLabel
 * derives it from the opening the cut makes on its face — which sides reach the
 * board's edge, and its proportions (cut-words spec §2) — so one shape gets one
 * word however its fields happen to be stored.
 *
 * Every field is part-local — named in length/width/thickness, never in world
 * axes — so a cut survives posture and rotation exactly the way `grain` does,
 * and so the numbers are already the ones you take to the bench.
 *
 * `face` and `across` name two of the three dimensions. The third — the
 * POSITION AXIS, which `offset` and `width` are measured along — is implied
 * rather than stored, so a cut cannot name the same dimension twice.
 */
export interface Cut {
  /** Unique within its board. */
  id: string;
  /** The dimension the cut goes into. 'thickness' is a dado in the broad face. */
  face: Dimension;
  /** Which end of `face` it enters from. */
  from: CutFrom;
  /**
   * The dimension the cut runs across, fully unless `stopMin`/`stopMax` stop it
   * short. Always differs from `face`.
   */
  across: Dimension;
  /** Where the cut starts along the implied position axis, in inches. */
  offset: number;
  /** How wide the cut is along that axis, in inches. */
  width: number;
  /** How far into `face` it goes, in inches. */
  depth: number;
  /**
   * How far short of the `across` dimension's MIN end the cut stops, in
   * inches. 0 means it runs out at that end. Same min/max words as `from`.
   */
  stopMin: number;
  /** How far short of the `across` dimension's MAX end the cut stops. 0 = runs out. */
  stopMax: number;
}

/** An inclusive [min, max] interval, in inches. */
export type Span = [number, number];

/** The word an angle cut's preset chose (angle-cuts spec §2.4). Names the cut and picks
 *  its row's controls; never decides geometry. */
export type AngleKind = 'taper' | 'miter' | 'bevel' | 'chamfer';

/**
 * A single-angle plane cut (angle-cuts spec §2): a straight line in the
 * `face` × `along` plane, running straight through the third dimension; the
 * stock on the `from` side of the line is removed. One half-space, unbounded:
 * a line that runs negative removes nothing there by construction.
 *
 * Board-local like `Cut`, so turns and postures cost nothing.
 */
export interface AngleCut {
  /** Unique within its board (per shape for a shape) — invariant 33's scopes. */
  id: string;
  kind: AngleKind;
  /** The dimension the cut goes into … */
  face: Dimension;
  /** … entering from its min or max face. Depths are measured from that face. */
  from: CutFrom;
  /** The second dimension of the sloped line's plane. Always differs from `face`. */
  along: Dimension;
  /** Which end of `along` stations are measured from. */
  alongFrom: CutFrom;
  /** Two points on the line: [station along `along`, depth into `face`], inches. Stations differ. */
  points: [[number, number], [number, number]];
  /** Schema 25 (square-set legs spec §3.1): a second slope, legal only on an end miter (`kind 'miter'`, `face 'length'`).
   *  The depth also grows by `rise` (> 0, finite) per inch across `throughOf(c)`, measured from that dimension's CENTRE,
   *  increasing away from its `from` side: depth(s, t) = depthAt(c, s) + rise · (t − T/2). Absent = a single slope. */
  across?: { rise: number; from: CutFrom };
}

/**
 * A row of round holes drilled square to one face (holes spec §2): `count` flat-bottomed cylinders `pitch` apart along
 * `along`, the first `station` from `alongFrom`'s end and all `inset` from `acrossFrom`'s side of the third dimension.
 * A single bore is a row of one. Board-local like `Cut`, so turns and postures cost nothing. No `kind`: the stored
 * geometry fully names what the drill does; presets only choose defaults.
 */
export interface HoleRow {
  /** Unique within its board (per shape for a shape) — invariant 33's scopes. */
  id: string;
  /** The dimension the holes go into (the drill axis) … */
  face: Dimension;
  /** … entering from its min or max face. Depth is measured from that face. */
  from: CutFrom;
  /** Inches, exact (a metric entry stores mm / 25.4 unrounded). */
  diameter: number;
  /** Inches from the `from` face, or right through the `face` dimension. */
  depth: number | 'through';
  /** The row's direction: one of the two dimensions that are not `face`. */
  along: Dimension;
  /** Which end of `along` stations are measured from. */
  alongFrom: CutFrom;
  /** The first hole's centre, from that end. */
  station: number;
  /** Integer, 1 to HOLE_COUNT_MAX. */
  count: number;
  /** Centre to centre, toward the far end. Stored, and ignored, when count is 1. */
  pitch: number;
  /** The third dimension's side the centres are measured from … */
  acrossFrom: CutFrom;
  /** … and how far. */
  inset: number;
  /** Schema 23 (angled holes spec §3.1): the bit's travel along `along` per inch of axial travel (along the face's normal), positive toward the far end
   *  from `alongFrom`. Absent = square; stored only when non-zero. */
  tiltAlong?: number;
  /** Likewise along the third dimension, positive toward the far side from `acrossFrom`. */
  tiltAcross?: number;
}

/**
 * One step of a curve cut's outline (curves spec §2.1), from the previous point to `to`, in STORED (u, v): each
 * coordinate measured from its named end (`uFrom`, `vFrom`). An arc is the MINOR arc (at most a half circle) bowing
 * toward `side` of its chord — left or right of travel from its start to `to`, in stored (u, v) with u to the right and v
 * up — fixed by `rise` (the sagitta) or by `radius`, whichever the user typed; the other is derived, never stored. A later
 * round adds segment types; a build that meets one it does not know refuses the document (spec §2.4).
 */
export type CurveSegment =
  | { type: 'line'; to: [number, number] }
  | { type: 'arc'; to: [number, number]; side: 'left' | 'right'; rise: number; radius?: never }
  | { type: 'arc'; to: [number, number]; side: 'left' | 'right'; radius: number; rise?: never };

/**
 * A cut clean through one dimension of a part along a curved outline (curves spec §2): the WASTE is the region the
 * closed outline encloses — `start`, then each segment, the last ending exactly at `start` — extruded through `through`.
 * u and v are the other two dimensions in DIMENSION_ORDER (`uvDims`). Board-local, so turns and postures cost nothing.
 * No `kind`: the preset (Arch, Bow, Rounded corner) is derived from the stored form (`deriveCurveKind`).
 */
export interface CurveCut {
  /** Unique within its board (per shape for a shape) — invariant 33's scopes. */
  id: string;
  through: Dimension;
  uFrom: CutFrom;
  vFrom: CutFrom;
  start: [number, number];
  segments: CurveSegment[];
}


/**
 * An axis-aligned box in a board's own coordinate space, keyed by dimension
 * rather than by axis index — there is no world here, and keying by dimension
 * is what stops the two from being confused.
 */
export type Region = Record<Dimension, Span>;

/** A routed edge profile's kind (edge profiles spec §2; profile runs spec §3.1). */
export type ProfileKind = 'roundover' | 'cove' | 'ogee' | 'bead' | 'thumbnail';
/** One side of a broad (thickness) face: the edge at `across`'s `from` end, running along the face's other dimension. */
export interface ProfileSide { across: 'length' | 'width'; from: CutFrom }
/** Where two banded sides with thickness meet (edge banding spec §3.2; Amended (planning) P1: always present). */
export type CornerRule = 'long' | 'ends' | 'mitre';
interface BandTypeBase { id: string; name: string; thickness: number; lengthAllowance: number }
export interface TapeBand extends BandTypeBase { kind: 'tape'; tapeWidth: number; pricePerFoot: number | null }
export interface SolidBand extends BandTypeBase { kind: 'solid'; material: string; widthAllowance: number }
export type BandType = TapeBand | SolidBand;
/** An edge band on one side of the broad face, of the band type `type` (by id). Bands carry no id: keyed by side. */
export interface Band { side: ProfileSide; type: string }
/** A run's end: a station along the side measured from the named end of its run dimension, or — at a side's sharp corner —
 *  out through that end face (chunk 1's full-length profile). Chunk a1 builds only `through` ends on one side. */
export type ProfileEnd = { side: ProfileSide; from: CutFrom; at: number } | { side: ProfileSide; through: CutFrom };
export type ProfileRun = { loop: true } | { start: ProfileEnd; end: ProfileEnd };
/** An edge profile (profile runs spec §3): routed from the broad face `face` along `run`; sizes as chunk 1's ProfileFields. */
export interface ProfileCut {
  id: string;
  face: CutFrom;
  kind: ProfileKind;
  /** roundover/cove/bead: radius; ogee: size; thumbnail: reach */
  size: number;
  /** thumbnail only (0 < depth < size) */
  depth?: number;
  /** roundover/cove/ogee: fillet (0 = none); bead: quirk (> 0); absent on a thumbnail */
  fillet?: number;
  /** asymmetric kinds: the profile's top on the broad face or on the side face; symmetric kinds: always 'face' */
  facing: 'face' | 'edge';
  run: ProfileRun;
}

/**
 * A part's lean (splayed legs spec §3.1): the foot's horizontal travel per inch of drop along world X (`x`) and world Z
 * (`z`), measured in the part's own frame at turn 0, before any mirror, so the lean turns and mirrors with the part.
 * `face` is which of the leg's two horizontal dimensions faces the sightline (§3.3): stored, never derived, chosen when
 * a lean is first set (the smaller twist, width on a tie) and kept by later edits. Stored ONLY when `x` or `z` is
 * non-zero, and only on an upright part (§3.2). Degrees exist only in display and typed input; every number derived
 * from a lean comes from `lean.ts`. `square` (schema 25, square-set legs spec §3.1) is present, only as `true`, when the
 * leg is square-set (tilted onto its lean, never turned about its own axis); absent means turned, as every lean stored
 * before schema 25. `face` is still stored on a square-set lean (switching back to turned uses it).
 */
export interface Lean { x: number; z: number; face: 'width' | 'thickness'; square?: true }

export interface Board {
  id: string;
  name: string;
  /** Inches. The long dimension. */
  length: number;
  /** Inches. The across-the-face dimension. */
  width: number;
  /** Inches. Stock thickness. */
  thickness: number;
  /** Min-corner of the world-space AABB, in inches. Y is up. */
  position: [number, number, number];
  /** Degrees about the vertical axis. */
  rotation: Rotation;
  /** Which dimension points up. */
  posture: Posture;
  /** Which dimension the fibres run along. */
  grain: Grain;
  /** A built-in MATERIALS key or a custom material id (custom materials spec §2.2). */
  material: string;
  /** Stock removed from this board. Empty for a board with no joinery. */
  cuts: Cut[];
  /** Single-angle plane cuts (tapers, miters, bevels, chamfers). Empty for most parts. */
  angleCuts: AngleCut[];
  /** Rows of round holes (holes spec §2). Empty for most parts. */
  holes: HoleRow[];
  /** Curve cuts through the part (curves spec §2). Empty for most parts. */
  curves: CurveCut[];
  /** Edge profiles (profile runs spec §3). Empty for most parts. Geometry reads them through `geometryBoard`. */
  profiles: ProfileCut[];
  /** Edge bands on the broad face's four sides (edge banding spec §2.2), canonical order, at most one per side. Empty for
   *  most parts. Numbers come only from `banding.ts`. */
  bands: Band[];
  /** Where two banded sides with thickness meet (spec §3.2; Amended (planning) P1: always present, default 'long'). */
  cornerRule: CornerRule;
  /** Hardware this part carries (hardware spec §2): per-type counts, canonical (sorted by type, one entry per type). Empty for most parts. */
  hardware: HardwareUse[];
  /** The part's lean (splayed legs spec §3.1); absent on a part that does not lean. A shared field (inv 45). */
  lean?: Lean;
  /** Round tenons on the part's ends (round tenons spec §3.1), at most one per end, `min` first. Absent on a part with none
   *  (never `[]`, so a tenon-free part keeps its bytes). */
  tenons?: RoundTenon[];
  /** Through dovetails on the part's ends (dovetails spec §3.4, schema 26), at most one per `(dim, end)`, canonical order
   *  (length min, length max, width min, width max). Absent on a part with none (never `[]`, never `undefined`), so a
   *  dovetail-free part keeps its bytes. A shared field (inv 45). */
  dovetails?: Dovetail[];
  /**
   * The Shape this part uses (components spec §2). Set ONLY on a RESOLVED part
   * (`resolveBoard`, `worldParts`); a stored plain part never has it, and a
   * stored shaped part is a `ShapedBoard`.
   */
  shape?: string;
  /** a shaped part only: its Shape reflected along mirrorDim; spec §3. Stored only when true; a plain part never carries
   *  it (the loader drops it, `plainOf` strips it). `resolveBoard` applies it and keeps it on the resolved part, so a
   *  writer knows to lower through it. */
  mirrored?: true;
}

/**
 * A round tenon turned on one end of a part (round tenons spec §3.1): coaxial with the length, centred on the section.
 * `length` runs along the axis from the shoulder (a plane of constant length coordinate) to the end's centre.
 */
export interface RoundTenon {
  id: string;
  /** An end of the part's `length` dimension. */
  end: 'min' | 'max';
  diameter: number;
  length: number;
}

/**
 * A through dovetail on one end of a part (dovetails spec §3.4, schema 26). The layout along J (the part's non-thickness
 * dimension other than `dim`) is `dovetails.ts`' `dovetailLayout`, from the part's own sizes: a palindrome, so a turn or a
 * mirror along J moves nothing. Every mirror is a flag flip (inv 44): along `dim` flips `end`; along the thickness flips
 * `outside` (pins only).
 */
export interface Dovetail {
  /** Invariant 33's scope: per board (per Shape for a Shape). */
  id: string;
  /** The run dimension (into the corner). */
  dim: 'length' | 'width';
  /** Which end of `dim`. */
  end: 'min' | 'max';
  role: 'tails' | 'pins';
  /** N, the tail count: an integer from 1 to DOVETAIL_COUNT_MAX (100; load drops more). */
  count: number;
  /** s, of the slope 1:s. */
  slope: number;
  /** p, the pin width at the narrow end, inches (fixed by the project's units at planning, never typed). */
  pin: number;
  /** Tails: the pins part's thickness (the baseline's distance from the end); pins: the tails part's thickness. */
  depth: number;
  /** Pins ONLY: the thickness face the pins are NARROW on (the corner's outside face). Absent on tails. */
  outside?: 'min' | 'max';
  /** Half-blind only (half-blind dovetails spec §3.3, schema 27), on BOTH entries of the corner, the same value: the pin
   *  part's lap, inches, > 0 — the solid wood kept in front of its sockets, from its `outside` face. ABSENT on a through
   *  dovetail (never 0, never undefined). Pins: read by the geometry and the fault (`X = thickness − lap`); tails: a record. */
  lap?: number;
}

/**
 * A position the user placed with the tape measure, as a snap target for
 * later work. Persistent — unlike a snap point, which is derived on demand
 * from a board — so it is document data and lands on the undo stack.
 *
 * No name. A guide's position is what identifies it, and inventing a naming
 * scheme would drag in uniqueName, invariant 8's four-place enforcement, and
 * a rename field, for a marker whose only job is to be somewhere.
 */
export interface GuidePoint {
  id: string;
  /** World position, inches. */
  at: [number, number, number];
}

/**
 * An assembly placed in its parent (assemblies spec §2). `position` is the
 * frame's ORIGIN in the parent's frame, NOT a min corner: invariant 2 is a
 * rule about parts. The frame is turned about the vertical through the
 * origin, then translated. Never constructed by hand outside treeOps.ts and
 * document.ts.
 */
export interface Instance {
  id: string;
  name: string;
  /** A Definition id. */
  definition: string;
  position: [number, number, number];
  rotation: Rotation;
  /** Reflected across its own local X before its turn (mirrored-instances spec §2). Stored only when true. */
  mirrored?: boolean;
}

/**
 * The parts and nested assemblies of one assembly, in its own frame. Referenced
 * by id; in round 1 every definition has exactly one instance.
 */
export interface Definition {
  id: string;
  boards: StoredBoard[];
  instances: Instance[];
  /** Hardware of the assembly itself, once per copy (hardware spec §2). */
  hardware: HardwareUse[];
}

/** A kind of hardware (hardware spec §2.1): bought in packs of `packSize`, at `pricePerPack` when known. */
export interface HardwareType {
  id: string;
  name: string;
  packSize: number;
  pricePerPack: number | null;
}

/** `count` of hardware type `type` carried by a part, an assembly or the project. */
export interface HardwareUse {
  type: string;
  count: number;
}

/** A part's shared fields, stored once and used by every part naming it
 *  (components spec §2). Its cut ids are its own (invariant 33). */
export interface Shape extends Pick<Board, SharedField> {
  id: string;
}

/** A stored part that uses a Shape: its OWN fields and the shape's id, nothing
 *  else. Derived from LINK_FIELDS, so a field classified 'own' lands here. */
export type ShapedBoard = Pick<Board, Exclude<OwnField, 'shape'>> & { shape: string };

/** What a container stores: a plain part, or a shaped one. */
export type StoredBoard = Board | ShapedBoard;

export interface SloydDocument {
  version: number;
  name: string;
  units: Units;
  /**
   * Facts about the SHOP, not about the project's materials. A table saw takes
   * 1/8", a thin-kerf blade less, a CNC router 1/4" — that belongs to the
   * person, so it travels with their file and is undoable like anything else.
   * Sheet SIZE deliberately lives on MATERIALS instead; see SheetStock.
   */
  stock: { kerf: number };
  /**
   * Tape-measure guide points. Document-level like `stock`, so the v5 -> v6
   * migration step has no rawBoards.map — see document.ts.
   */
  guides: GuidePoint[];
  boards: StoredBoard[];
  /** The root's assemblies. The root is an implicit definition (spec §2). */
  instances: Instance[];
  /** Document-wide, referenced by Instance.definition. */
  definitions: Definition[];
  /** Document-wide shared part fields (components spec §2). */
  shapes: Shape[];
  /** Exactly the custom materials this document's parts and shapes use (custom materials spec §2.3). */
  materials: CustomMaterial[];
  /** This project's band types (edge banding spec §2.1); the built-in `band-iron-on` always present, first. Kept when unused. */
  bandTypes: BandType[];
  /** This project's hardware types (hardware spec §2.1). */
  hardwareTypes: HardwareType[];
  /** Hardware of the project itself (hardware spec §2), canonical. */
  hardware: HardwareUse[];
}

/**
 * A document whose parts are all resolved, plain Boards: what `flatDocument`
 * returns and what the cut list, `checkDesign` and joinery read.
 */
export interface FlatDocument extends SloydDocument {
  boards: Board[];
}

/**
 * The stock a sheet good is sold as.
 *
 * A property of the MATERIAL, not of the project: a 4x8 sheet is a fact about
 * plywood the same way `sheet: true` used to be, and Baltic birch comes 5x5
 * because of what it is rather than because of what you are building.
 *
 * This is deliberately the shape a later custom-materials round fills in — a
 * custom unveneered plywood is an entry with `rotate: 'free'`, Baltic birch is
 * one with `length: 60, width: 60` — so nothing in `nesting.ts` changes when
 * these entries move from a module constant into document data.
 */
export interface SheetStock {
  /** Inches. The long dimension of a full sheet. */
  length: number;
  /** Inches. */
  width: number;
  /**
   * 'grain' — the part's own `grain` field determines its orientation on the
   *   sheet and the packer never turns it. Correct for veneered plywood, where
   *   a part turned 90 degrees has its face veneer running the wrong way in
   *   the finished piece.
   * 'free'  — the packer may lay the part either way. Correct for MDF, which
   *   has no grain at all.
   */
  rotate: 'grain' | 'free';
}

/**
 * `density`: lb/ft³, air-dry (about 12% moisture), from the USDA Wood Handbook and the Wood Database's averages (weight spec
 * §3.2). Pine is construction pine (ponderosa / SPF; eastern white is 25, southern yellow 36–42); oak is red oak (white is
 * 47); maple is hard maple. A built-in's density is fixed: white oak is a custom material.
 */
export const MATERIALS: Record<string, { label: string; color: string; density: number; nominal?: true; sheet?: SheetStock }> = {
  // Sold in nominal sizes (spec §5): a ¾ × 3½ pine part is a 1×4.
  pine:    { label: 'Pine',     color: '#d9b98a', density: 28, nominal: true },
  oak:     { label: 'Oak',      color: '#c69c6d', density: 44 },
  maple:   { label: 'Maple',    color: '#e6d2b5', density: 44 },
  walnut:  { label: 'Walnut',   color: '#6b4630', density: 38 },
  cherry:  { label: 'Cherry',   color: '#a4552f', density: 35 },
  // A 3/4" 4×8 sheet weighs about 70–75 lb (2 ft³).
  plywood: { label: 'Plywood',  color: '#cbb391', density: 36,
             sheet: { length: 96, width: 48, rotate: 'grain' } },
  // A 3/4" 4×8 sheet weighs about 95–100 lb.
  mdf:     { label: 'MDF',      color: '#a89a86', density: 48,
             sheet: { length: 96, width: 48, rotate: 'free' } },
};

/** lb/ft³: the most a stored density may be (weight spec §3.3; the densest commercial wood, lignum vitae, is about 80). */
export const DENSITY_MAX = 150;

export const DEFAULT_MATERIAL = 'pine';

/** Inches. A standard table-saw blade. */
export const DEFAULT_KERF = 0.125;

/** How a material is made, fixed at creation (custom materials spec §2.2). */
export type MaterialKind = 'solid' | 'sheet-veneered' | 'sheet-plain';

/**
 * A user-defined material (custom materials spec §2.2). Stored in the document (`materials`) and in the
 * browser library. The KIND is encoded in the id (amended §2.2), so a kind-only reader never needs a catalog.
 */
export interface CustomMaterial {
  id: string;
  label: string;
  /** Lower-case `#rrggbb`. */
  color: string;
  kind: MaterialKind;
  /** Sold in nominal sizes (chunk 2 reads it). Solid only; stored only when true. */
  nominal?: true;
  /** Inches. Present exactly when `kind` is a sheet kind. */
  sheet?: { length: number; width: number };
  /** lb/ft³, in (0, DENSITY_MAX] (weight spec §3.3). Any kind; stored only when known — never null, 0 or undefined. */
  density?: number;
}

/** `m-` + kind letter + `-` + 4–32 of [a-z0-9]: never a built-in key, never a `/`. */
export const CUSTOM_MATERIAL_ID = /^m-([svp])-[a-z0-9]{4,32}$/;
const LETTER_KIND: Record<string, MaterialKind> = { s: 'solid', v: 'sheet-veneered', p: 'sheet-plain' };

export function isCustomMaterialId(id: string): boolean {
  return CUSTOM_MATERIAL_ID.test(id);
}

/**
 * The kind of any material id: a custom one by its letter, a built-in by its `sheet` (MDF's free rotation is
 * the plain kind). Anything else reads as solid — the pine fallback (a part cannot carry one after load).
 */
export function materialKind(id: string): MaterialKind {
  const m = CUSTOM_MATERIAL_ID.exec(id);
  if (m) return LETTER_KIND[m[1]!]!;
  const sheet = Object.hasOwn(MATERIALS, id) ? MATERIALS[id]!.sheet : undefined;
  if (sheet === undefined) return 'solid';
  return sheet.rotate === 'free' ? 'sheet-plain' : 'sheet-veneered';
}

/**
 * Sheet goods are a different domain thing from solid stock: their "grain" is a face-veneer direction that
 * always lies in the sheet plane, so 'Through thickness' is not a meaningful value for one — see grainFamily
 * in viewport/grainFaces.ts. A fact about the material's KIND, read off its id.
 */
export function isSheetGood(material: string): boolean {
  return materialKind(material) !== 'solid';
}
