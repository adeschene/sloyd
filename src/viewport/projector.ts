import * as THREE from 'three';
import type { ProjectedPoint, Projector } from './snapPick';

/** Reused rather than allocated per candidate per pointer event. */
const projected = new THREE.Vector3();

/**
 * World position -> canvas pixels, or null for a point the camera cannot see. The ONE projector the screen-space
 * pickers use (MoveTool, TapeTool, GuidePicker), so a guide's depth and the occluder depth GuidePicker compares it with
 * are on one scale by construction, not by two copies agreeing (the drift shape fu 64 recorded).
 *
 * `width`/`height` are CSS pixels (R3F's `size`), as the bounding rect is. The canvas renders at dpr 2-3, and none of
 * that belongs here.
 */
export function projectorFor(camera: THREE.Camera, width: number, height: number): Projector {
  return (at): ProjectedPoint | null => {
    projected.set(at[0], at[1], at[2]).project(camera);
    // Outside the normalised depth range means behind the camera (or beyond
    // the far plane). This is the whole of the culling pickSnapPoint relies
    // on: without it, a point behind a perspective camera projects to a
    // mirrored position in FRONT of the cursor and reads as a near miss.
    if (projected.z < -1 || projected.z > 1) return null;
    return {
      x: (projected.x * 0.5 + 0.5) * width,
      y: (-projected.y * 0.5 + 0.5) * height,
      // NDC z, not distance to the camera position: it is monotonic in view
      // depth for both projections, where a radial distance is not.
      depth: projected.z,
    };
  };
}

/** The NDC depth `projectorFor` reports for `at`, WITHOUT its culling: an occluder depth past the far plane still compares. */
export function ndcDepth(camera: THREE.Camera, at: THREE.Vector3): number {
  return projected.copy(at).project(camera).z;
}
