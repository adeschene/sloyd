/** Degrees about the vertical axis, applied after posture. */
export type Rotation = 0 | 90;

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
 * A rectangular through-cut: stock removed from a board, running fully across
 * one of its dimensions. A dado is this cut taken in the middle of a face; a
 * rabbet is the same cut taken at an edge, so the distinction is derived from
 * the geometry (see cutLabel) rather than stored.
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
  /** The dimension it runs fully across. Always differs from `face`. */
  across: Dimension;
  /** Where the cut starts along the implied position axis, in inches. */
  offset: number;
  /** How wide the cut is along that axis, in inches. */
  width: number;
  /** How far into `face` it goes, in inches. */
  depth: number;
}

/** An inclusive [min, max] interval, in inches. */
export type Span = [number, number];

/**
 * An axis-aligned box in a board's own coordinate space, keyed by dimension
 * rather than by axis index — there is no world here, and keying by dimension
 * is what stops the two from being confused.
 */
export type Region = Record<Dimension, Span>;

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
  /** Key into MATERIALS. */
  material: string;
  /** Stock removed from this board. Empty for a board with no joinery. */
  cuts: Cut[];
}

export interface SloydDocument {
  version: number;
  name: string;
  units: { display: 'imperial-fractional'; precision: number };
  boards: Board[];
}

export const MATERIALS: Record<string, { label: string; color: string; sheet?: boolean }> = {
  pine:    { label: 'Pine',     color: '#d9b98a' },
  oak:     { label: 'Oak',      color: '#c69c6d' },
  maple:   { label: 'Maple',    color: '#e6d2b5' },
  walnut:  { label: 'Walnut',   color: '#6b4630' },
  cherry:  { label: 'Cherry',   color: '#a4552f' },
  plywood: { label: 'Plywood',  color: '#cbb391', sheet: true },
  mdf:     { label: 'MDF',      color: '#a89a86', sheet: true },
};

export const DEFAULT_MATERIAL = 'pine';

/**
 * Sheet goods (plywood, MDF) are a different domain thing from solid stock:
 * their "grain" is a face-veneer direction that always lies in the sheet
 * plane, so 'Through thickness' is not a meaningful value for one — see the
 * comment on grainFamily in viewport/grainFaces.ts. Lives here, not in
 * viewport, because panels must not import from viewport, and this is a fact
 * about the material, not about how it's drawn.
 */
export function isSheetGood(material: string): boolean {
  return MATERIALS[material]?.sheet === true;
}
