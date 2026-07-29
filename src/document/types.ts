export type Rotation = 0 | 90 | 180 | 270;

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
  /** false = lying flat (face up), true = on edge. */
  standing: boolean;
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
