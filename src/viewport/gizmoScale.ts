import * as THREE from 'three';

/**
 * How large the transform gizmo is allowed to get, relative to the board it is
 * attached to.
 *
 * three-stdlib sizes the gizmo to be constant on SCREEN, so its world size
 * grows with viewing distance:
 *
 *   perspective:  factor = |worldPosition - cameraPosition|
 *                          * min(1.9 * tan(fov*PI/360) / zoom, 7)
 *   orthographic: factor = (camera.top - camera.bottom) / camera.zoom
 *   then          handle.scale = factor * size / 7
 *
 * (TransformControls.js:528-536.) Screen-constant is the intent, but the
 * consequence is that pulling the camera back shrinks the board on screen
 * while the gizmo stays put, so a 24in board ends up wearing a gizmo whose arms
 * are twice its length. These functions compute the `size` that stops that.
 *
 * Kept here, apart from Gizmo.tsx, for the same reason gridDensity and
 * screenScale are: it is arithmetic, it is worth testing, and testing it should
 * not require standing up a renderer.
 */

/** Ceiling on the gizmo's world size, as a multiple of the board's longest edge. */
export const GIZMO_MAX_BOARD_MULTIPLE = 0.75;

/**
 * Floor on `size`, as a fraction of the library's default.
 *
 * The clamp has to be two-sided. A ceiling alone would shrink the gizmo along
 * with the board as the camera pulls back, and past some distance there would
 * be no grabbable axis left — trading a cosmetic complaint for a functional
 * one, since the invisible picker cones scale with the visible arrows. Below
 * roughly this fraction the arrows stop being a comfortable click target.
 */
export const GIZMO_MIN_SIZE = 0.3;

/**
 * Floor on the ceiling itself, in inches — the smallest world size the gizmo
 * will ever be held down to, regardless of how small the board is.
 *
 * Without this, the ceiling stops being about zooming out and starts governing
 * close range too. `0.75 * extent` on a 4in cleat is a 3in cap, and the gizmo
 * is nowhere near 3in at the default view — so the cleat's gizmo comes out
 * shrunk the moment you select it, and a 3/4in offcut sits pinned at the floor
 * at EVERY zoom. Cleats, spacers and blocks are real parts, and their gizmo
 * should look stock until the camera actually pulls back.
 *
 * Seven inches is not a taste call: it is the gizmo's own world size at the
 * default framing. Measured in the browser, the library's factor there is
 * 43.5 for a 24in board and 48.9 for a 4in one (the camera sits at
 * [40, 30, 40] looking at the origin), and stock world size is `factor / 7` —
 * so a 7in cap is exactly the point at which small parts come out unclamped at
 * the default view and start clamping as soon as the camera pulls back. For a
 * board of 9-1/3in or longer the board-relative cap is the larger of the two
 * and this constant never enters.
 */
export const GIZMO_MIN_CAP_INCHES = 7;

/** The library's default `size`, and the largest this clamp will ever ask for. */
export const GIZMO_DEFAULT_SIZE = 1;

/** The divisor in three-stdlib's `handle.scale = factor * size / 7`. */
export const GIZMO_SCALE_DIVISOR = 7;

/**
 * The library's own distance/zoom factor for the current frame, or null if the
 * camera isn't one of the two kinds it handles — including the null camera the
 * controls carry before one is attached.
 *
 * Duplicating the formula is deliberate: reading the factor back off a handle
 * would mean reading a value the library has already baked into that frame's
 * matrices, which is exactly the trap the flip fix in Gizmo.tsx documents. If a
 * future three-stdlib changes the formula, this clamp becomes slightly
 * mistuned rather than broken.
 *
 * Both branches matter. The orthographic one has no distance term at all —
 * zooming out in orthographic is `camera.zoom` decreasing — so implementing
 * only the perspective case would leave the whole Orthographic toggle
 * unclamped.
 */
export function gizmoDistanceFactor(
  camera: THREE.Camera | null | undefined,
  worldPosition: THREE.Vector3,
  cameraPosition: THREE.Vector3,
): number | null {
  if (!camera) return null;
  if (camera instanceof THREE.OrthographicCamera) {
    return (camera.top - camera.bottom) / camera.zoom;
  }
  if (camera instanceof THREE.PerspectiveCamera) {
    return (
      worldPosition.distanceTo(cameraPosition) *
      Math.min((1.9 * Math.tan((Math.PI * camera.fov) / 360)) / camera.zoom, 7)
    );
  }
  return null;
}

/**
 * The `size` that holds the gizmo's world size at or below
 * `GIZMO_MAX_BOARD_MULTIPLE * boardMaxExtent`, floored so it stays grabbable
 * and never raised above the library's own default — this only ever shrinks a
 * gizmo that has outgrown its board, it never inflates a small one.
 *
 * Falls back to the default whenever there is nothing meaningful to clamp
 * against: an unknown camera, a degenerate board, a non-finite factor.
 */
export function gizmoSizeForExtent(
  factor: number | null,
  boardMaxExtent: number,
): number {
  if (factor === null || !Number.isFinite(factor) || factor <= 0) return GIZMO_DEFAULT_SIZE;
  if (!Number.isFinite(boardMaxExtent) || boardMaxExtent <= 0) return GIZMO_DEFAULT_SIZE;
  const cap = Math.max(GIZMO_MAX_BOARD_MULTIPLE * boardMaxExtent, GIZMO_MIN_CAP_INCHES);
  const sizeForCap = (GIZMO_SCALE_DIVISOR * cap) / factor;
  return Math.min(GIZMO_DEFAULT_SIZE, Math.max(GIZMO_MIN_SIZE, sizeForCap));
}

/**
 * The world size the gizmo's handles end up at for a given factor and size —
 * the library's own `factor * size / 7`. Exported so tests can assert on the
 * thing the user actually sees rather than on the intermediate knob.
 */
export function gizmoWorldSize(factor: number, size: number): number {
  return (factor * size) / GIZMO_SCALE_DIVISOR;
}
