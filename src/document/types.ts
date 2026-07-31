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
}

export interface SloydDocument {
  version: number;
  name: string;
  units: { display: 'imperial-fractional'; precision: number };
  boards: Board[];
}

export const MATERIALS: Record<string, { label: string; color: string }> = {
  pine:    { label: 'Pine',     color: '#d9b98a' },
  oak:     { label: 'Oak',      color: '#c69c6d' },
  maple:   { label: 'Maple',    color: '#e6d2b5' },
  walnut:  { label: 'Walnut',   color: '#6b4630' },
  cherry:  { label: 'Cherry',   color: '#a4552f' },
  plywood: { label: 'Plywood',  color: '#cbb391' },
  mdf:     { label: 'MDF',      color: '#a89a86' },
};

export const DEFAULT_MATERIAL = 'pine';
