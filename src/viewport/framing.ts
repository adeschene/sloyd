import { boardExtents } from '../document/document';
import type { Board } from '../document/document';
import type { Vec3 } from '../document/frames';
import { FRONT, ISO, SIDE, TOP } from '../document/drawing';
import type { View } from '../document/drawing';

/**
 * The pure half of the viewport's framing (standard-views spec §2.3): what box a set of parts occupies,
 * and how far / how zoomed a camera must be to see it. `CameraKeys` does the three.js half.
 */

export type StandardView = 'front' | 'side' | 'top' | 'iso';

/** The Plans sheet's views. The viewport never restates their axes (spec §2.1). */
export const STANDARD_VIEWS: Readonly<Record<StandardView, View>> = { front: FRONT, side: SIDE, top: TOP, iso: ISO };

/**
 * Top's tilt toward +Z, in radians (spec §2.2). Straight down, `Y × toward` is zero and both the screen
 * orientation and OrbitControls' azimuth are decided by float noise; the tilt makes them "front at the bottom".
 */
export const TOP_TILT = 1e-4;

/** Unit vector from the target TO the camera. */
export function viewDirection(view: StandardView): Vec3 {
  const [x, y, z] = STANDARD_VIEWS[view].toward;
  if (Math.abs(y) < 1 - 1e-9) return [x, y, z];
  return [0, Math.cos(TOP_TILT), Math.sin(TOP_TILT)];
}

export interface Bounds { center: Vec3; radius: number }

/**
 * The box around `subset`, each part translated by its `offsets` entry when there is one (fu 260: while
 * exploded the parts are framed where they are DRAWN). Same arithmetic as the THREE.Box3 it replaces, so
 * framing at explode 0 is unchanged.
 */
export function subsetBounds(subset: readonly Board[], offsets?: ReadonlyMap<string, Vec3> | null): Bounds | null {
  if (subset.length === 0) return null;
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const b of subset) {
    const e = boardExtents(b);
    const o = offsets?.get(b.id);
    for (let k = 0; k < 3; k++) {
      const min = b.position[k]! + (o ? o[k]! : 0);
      lo[k] = Math.min(lo[k]!, min);
      hi[k] = Math.max(hi[k]!, min + e[k]!);
    }
  }
  const size: Vec3 = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  return {
    center: [(lo[0] + hi[0]) * 0.5, (lo[1] + hi[1]) * 0.5, (lo[2] + hi[2]) * 0.5],
    radius: Math.max(Math.sqrt(size[0] * size[0] + size[1] * size[1] + size[2] * size[2]) / 2, 1),
  };
}

/** Ortho size comes from zoom, not distance: drei sizes the frustum to the canvas in pixels. */
export function orthoZoom(radius: number, width: number, height: number): number {
  return Math.min(width, height) / (radius * 2.3);
}

export function orthoDistance(radius: number): number {
  return radius * 4 + 100;
}

export function perspectiveDistance(radius: number, fovDeg: number, aspect: number): number {
  const vfov = (fovDeg * Math.PI) / 180;
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
  return Math.max(radius / Math.sin(vfov / 2), radius / Math.sin(hfov / 2)) * 1.15;
}
