import * as THREE from 'three';

/**
 * How many screen pixels one world inch covers, at a given point of interest.
 *
 * Perspective scales with distance: the further the point, the fewer pixels an
 * inch covers. Orthographic does not move the camera to zoom, so its scale is
 * the zoom factor itself — drei sizes the ortho frustum to the canvas in
 * pixels, which makes world-units-across equal pixels/zoom.
 *
 * Returns NaN for a camera type it cannot measure, which callers treat as
 * "unknown" rather than as a number.
 */
export function screenPixelsPerInch(
  camera: THREE.Camera,
  target: THREE.Vector3,
  viewportHeightPx: number,
): number {
  if (camera instanceof THREE.OrthographicCamera) return camera.zoom;
  if (camera instanceof THREE.PerspectiveCamera) {
    const distance = camera.position.distanceTo(target);
    const worldHeightAtTarget = 2 * distance * Math.tan((camera.fov * Math.PI) / 360);
    return viewportHeightPx / worldHeightAtTarget;
  }
  return Number.NaN;
}

/** Target on-screen length of one dash-plus-gap pair, in CSS pixels. */
export const DASH_PERIOD_PX = 11;

/**
 * `dashScale` for a Line2/LineMaterial that keeps its dash pattern a constant
 * length on screen instead of a constant length in the world.
 *
 * LineMaterial repeats its pattern every `(dashSize + gapSize)` units of
 * `dashScale * worldDistanceAlongLine`, so the world-space period is
 * `(dashSize + gapSize) / dashScale`. Setting that equal to the world distance
 * that covers DASH_PERIOD_PX pixels and solving gives the expression below.
 *
 * This is the whole reason the axes can be dashed at all. World-space dashes
 * shrink toward sub-pixel as a line recedes, and then land on and off pixel
 * centres as the camera moves — which is exactly the "segments cut in and out
 * randomly" that made the first dashed implementation unusable.
 *
 * Falls back to 1 when the density is unknown or degenerate, which yields the
 * material's plain world-space behaviour rather than a NaN uniform.
 */
export function dashScaleForScreenPeriod(
  patternWorldLength: number,
  pixelsPerInch: number,
): number {
  if (!Number.isFinite(pixelsPerInch) || pixelsPerInch <= 0) return 1;
  if (!Number.isFinite(patternWorldLength) || patternWorldLength <= 0) return 1;
  return (patternWorldLength * pixelsPerInch) / DASH_PERIOD_PX;
}
