import type { SavedViewCamera } from '../document/types';

/**
 * Saved views' camera helpers (saved views spec §2, §5). Pure, so the viewport's camera writes have something
 * tested under them; the viewport itself is verified in a real browser.
 *
 * An orthographic view stores the visible world HEIGHT, not three's pixel `zoom`: `zoom` is pixels per world
 * unit, so the same zoom in a taller window shows more of the model. `top`/`bottom` are the camera's frustum
 * (drei sizes them in CSS pixels from the canvas), read at save time and again at restore time.
 */
export function orthoHeight(top: number, bottom: number, zoom: number): number {
  return (top - bottom) / zoom;
}

/** The inverse of `orthoHeight` for the camera at restore time: the zoom that shows `height` inches. */
export function orthoZoomFor(top: number, bottom: number, height: number): number {
  return (top - bottom) / height;
}

/**
 * Whether a pending restore can be applied now: there is one, the live camera is the projection it was saved
 * in, and OrbitControls already drive that camera (`controls.object === camera`). drei rebuilds the controls a
 * render after a projection swap; writing the target before then lands it in the OUTGOING controls.
 */
export function pendingPoseReady(
  pending: SavedViewCamera | null,
  isOrtho: boolean,
  controlsOnCamera: boolean,
): boolean {
  return pending !== null && pending.ortho === isOrtho && controlsOnCamera;
}
