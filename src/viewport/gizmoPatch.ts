import * as THREE from 'three';
import { gizmoDistanceFactor, gizmoSizeForExtent } from './gizmoScale';

// Moved verbatim out of Gizmo.tsx (fu 17: one responsibility per file).

// --- Gizmo axis-flip fix -----------------------------------------------
//
// drei's <TransformControls> wraps three-stdlib's TransformControls, NOT
// three's own examples/jsm copy. three-stdlib's gizmo bakes two arrow meshes
// per axis ("fwd" and "bwd", both tagged) plus a shaft line and an invisible
// picker cone, all sharing the axis name ("X"/"Y"/"Z"). Every frame, its
// TransformControlsGizmo.updateMatrixWorld picks which arrow to show and
// mirrors the shaft/picker scale to match, based on the sign of
// (axis direction) . (eye direction) — see
// node_modules/three-stdlib/controls/TransformControls.js:642-674. That sign
// flips the instant the camera crosses the plane perpendicular to the axis,
// swapping the visible arrow (and the side its invisible drag target sits
// on) with no interpolation — this is the "inverts awkwardly" the report
// describes. (The premise that nothing flips, and the depthTest/plane-handle
// candidates, were diagnosed against the wrong file; three's own examples/jsm
// copy has no flip logic, but it isn't what's on the page. See
// .superpowers/sdd/2026-07-30-sloyd-v1-polish/task-8-report.md for the full
// trail.)
//
// Fix: pin every translate-axis handle (arrow, shaft, picker) to its "fwd"
// orientation and permanently hide the "bwd" duplicate, so there is exactly
// one arrow per axis and it never swaps sides. The near-camera-aligned hide
// (an axis foreshortened to a point) is preserved by recomputing the same
// threshold the library uses — only the discrete swap is removed.
//
// This has to run *after* the library's own updateMatrixWorld, every frame:
// that method rewrites the same visibility/scale on every call (it is not
// optional/cached), so a one-shot effect cannot hold against it. Wrapping the
// gizmo's own updateMatrixWorld is the only hook point that runs at the right
// time, every frame, without patching three-stdlib itself.
//
// Un-mirroring `scale` is not enough on its own. `original(force)` above ends
// in `Object3D.prototype.updateMatrixWorld`, which composes every handle's
// `matrix`/`matrixWorld` from whatever `scale` holds *at that instant* — i.e.
// from the library's own (possibly mirrored) value, before this patch ever
// runs. Writing a corrected `handle.scale` after that point changes a number
// that has already been baked into this frame's matrices and will be reset
// from scratch by the library before the next frame's bake. So after fixing
// every handle's scale below, the two translate groups' matrices have to be
// explicitly recomposed (`updateMatrixWorld(true)`) so the correction
// actually reaches what gets rendered and raycast against — otherwise the
// shaft/picker silently keep rendering from the mirrored geometry while only
// the (render-list-time, not baked) `visible` flag looks fixed.
//
// Upgrade coupling: this reaches into three-stdlib internals
// (`gizmo.picker.translate` / `gizmo.gizmo.translate`, the `tag` property,
// the per-frame reset/flip behavior at TransformControls.js:508-722) that
// aren't part of any public API or type. `three-stdlib` is a transitive dep
// of `@react-three/drei` under a caret range, so it can change on a plain
// `npm install` with no version bump visible in this repo. The shape is
// checked once before patching (see `stabilizeTranslateGizmo`'s guard) and
// the per-frame body is defensive, so a shape change degrades to the
// library's native (flippy) behavior instead of throwing inside three's
// render traversal — but it should still be re-verified after any dependency
// bump touching `three`, `three-stdlib`, or `@react-three/drei`.
type TaggedHandle = THREE.Object3D & { tag?: string };
interface HandleGroup {
  translate: THREE.Object3D;
}
interface GizmoInternals {
  updateMatrixWorld: (force?: boolean) => void;
  picker: HandleGroup;
  gizmo: HandleGroup;
  /**
   * The library's own scale knob, read (not written) inside its
   * updateMatrixWorld — which is what makes it the one internal here that can
   * be driven safely. See the write site in the wrapper, and gizmoScale.ts.
   */
  size: number;
  camera: THREE.Camera | null;
  worldPosition: THREE.Vector3;
  cameraPosition: THREE.Vector3;
}
export interface ControlsInternals {
  gizmo: GizmoInternals;
  eye: THREE.Vector3;
  worldQuaternion: THREE.Quaternion;
  space: 'world' | 'local';
  mode: 'translate' | 'rotate' | 'scale';
}

const AXIS_HIDE_THRESHOLD = 0.99; // matches three-stdlib's own near-aligned cutoff
const AXIS_UNIT: Record<'X' | 'Y' | 'Z', THREE.Vector3> = {
  X: new THREE.Vector3(1, 0, 0),
  Y: new THREE.Vector3(0, 1, 0),
  Z: new THREE.Vector3(0, 0, 1),
};
const IDENTITY_QUATERNION = new THREE.Quaternion();
const tempAxisVector = new THREE.Vector3();

// Best-effort structural check that the internals this patch depends on are
// still shaped the way three-stdlib's current TransformControlsGizmo shapes
// them. Not exhaustive type-checking — just enough to fail closed (skip the
// patch) instead of throwing inside three's per-frame render traversal if a
// future three-stdlib version renames or restructures these fields.
function hasExpectedShape(controls: ControlsInternals | null | undefined): controls is ControlsInternals {
  const gizmoObj = controls?.gizmo;
  return (
    !!gizmoObj &&
    typeof gizmoObj.updateMatrixWorld === 'function' &&
    gizmoObj.picker?.translate instanceof THREE.Object3D &&
    gizmoObj.gizmo?.translate instanceof THREE.Object3D &&
    typeof gizmoObj.size === 'number' &&
    gizmoObj.worldPosition instanceof THREE.Vector3 &&
    gizmoObj.cameraPosition instanceof THREE.Vector3
  );
}

interface StabilizeOptions {
  /**
   * The longest edge of what the gizmo moves — the selected board, or with two
   * or more selected the selection's bounding box (invariant 10, multi-select
   * spec §4.1) — read fresh on every frame. A ref rather
   * than a captured value because the patch is installed per selection (and per
   * camera), not per dimension change — closing over a number would leave the
   * ceiling stale the moment the board is resized in the Properties panel while
   * still selected.
   */
  boardMaxExtent: { current: number };
}

export function stabilizeTranslateGizmo(
  controls: ControlsInternals,
  options: StabilizeOptions,
): () => void {
  if (!hasExpectedShape(controls)) {
    // Internals don't look like what this patch expects (e.g. a
    // three-stdlib upgrade restructured the gizmo). Leave the library's
    // native updateMatrixWorld untouched — the flip bug this patch fixes is
    // preferable to a viewport that throws every frame. No-op cleanup.
    return () => {};
  }

  const gizmoObj = controls.gizmo;
  const original = gizmoObj.updateMatrixWorld.bind(gizmoObj);
  const originalSize = gizmoObj.size;
  let patchFailed = false;

  gizmoObj.updateMatrixWorld = (force?: boolean) => {
    // Size ceiling (follow-up 29), applied BEFORE the bake. `size` is an input
    // to the scale computation inside `original`, so unlike the flip fix below
    // this correction is consumed by the library itself and needs no
    // recomposition — see gizmoScale.ts for the arithmetic and the reasoning.
    // It is written on the gizmo rather than on the controls because `size` is
    // declared on TransformControlsGizmo; TransformControls does mirror its own
    // `size` down through a defineProperty sync, but relying on that sync would
    // be one more undocumented internal than this needs.
    //
    // Recomputed every frame, drags included. Holding it fixed for the duration
    // of a drag was tried and is worse: with `size` frozen the gizmo grows
    // screen-constant as the board moves and then SNAPS to the clamped value on
    // release. Per-frame is continuous, which is the whole point of clamping an
    // input the library already recomputes per frame anyway.
    if (!patchFailed) {
      try {
        gizmoObj.size = gizmoSizeForExtent(
          gizmoDistanceFactor(gizmoObj.camera, gizmoObj.worldPosition, gizmoObj.cameraPosition),
          options.boardMaxExtent.current,
        );
      } catch {
        patchFailed = true;
      }
    }

    original(force);
    if (patchFailed || controls.mode !== 'translate') return;
    try {
      const quaternion = controls.space === 'local' ? controls.worldQuaternion : IDENTITY_QUATERNION;
      const translateGroups = [gizmoObj.picker.translate, gizmoObj.gizmo.translate];
      for (const group of translateGroups) {
        group.children.forEach((child) => {
          const handle = child as TaggedHandle;
          if (handle.name !== 'X' && handle.name !== 'Y' && handle.name !== 'Z') return;
          if (handle.tag === 'bwd') {
            handle.visible = false;
            return;
          }
          const axis = handle.name as 'X' | 'Y' | 'Z';
          const alignment = Math.abs(
            tempAxisVector.copy(AXIS_UNIT[axis]).applyQuaternion(quaternion).dot(controls.eye)
          );
          if (axis === 'X') handle.scale.x = Math.abs(handle.scale.x);
          else if (axis === 'Y') handle.scale.y = Math.abs(handle.scale.y);
          else handle.scale.z = Math.abs(handle.scale.z);
          handle.visible = alignment <= AXIS_HIDE_THRESHOLD;
        });
      }
      // `original(force)` above already composed every handle's matrix and
      // matrixWorld from the pre-patch (possibly mirrored) scale — that's
      // baked, not live, so mutating `scale` alone never reaches what's
      // rendered or raycast against. Recompose both translate groups now
      // that their children's scale is corrected, so the fix actually lands
      // in the matrices three uses this frame. Both groups' own parents were
      // already brought current by `original(force)`, so `force = true` here
      // only needs to (and does) recompute this subtree.
      for (const group of translateGroups) group.updateMatrixWorld(true);
    } catch {
      // Something about the internal shape didn't hold up at runtime (e.g.
      // a child was missing an expected property). Stop trying every frame
      // and fall back permanently to the library's own (flippy, unbounded)
      // behavior rather than repeatedly throwing. One flag covers both the
      // flip fix and the size ceiling deliberately: they read the same
      // internals, so a shape change that breaks one has no business being
      // trusted by the other.
      patchFailed = true;
    }
  };

  return () => {
    gizmoObj.updateMatrixWorld = original;
    // The effect reinstalls on selection and camera changes against the same
    // gizmo instance, so hand `size` back rather than leaving the last clamped
    // value behind for whatever runs next.
    gizmoObj.size = originalSize;
  };
}
// -------------------------------------------------------------------------
