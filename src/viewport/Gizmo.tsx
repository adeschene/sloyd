import { useEffect, useRef } from 'react';
import { TransformControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { TransformControls as TransformControlsImpl } from 'three-stdlib';
import { useStore } from '../store/store';
import { boardCenter, boardExtents } from '../document/document';

export const SNAP_INCHES = 1 / 16;

const snap = (v: number) => Math.round(v / SNAP_INCHES) * SNAP_INCHES;

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
type TaggedHandle = THREE.Object3D & { tag?: string };
interface HandleGroup {
  translate: THREE.Object3D;
}
interface GizmoInternals {
  updateMatrixWorld: (force?: boolean) => void;
  picker: HandleGroup;
  gizmo: HandleGroup;
}
interface ControlsInternals {
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

function stabilizeTranslateGizmo(controls: ControlsInternals): () => void {
  const gizmoObj = controls.gizmo;
  const original = gizmoObj.updateMatrixWorld.bind(gizmoObj);

  gizmoObj.updateMatrixWorld = (force?: boolean) => {
    original(force);
    if (controls.mode !== 'translate') return;
    const quaternion = controls.space === 'local' ? controls.worldQuaternion : IDENTITY_QUATERNION;
    for (const group of [gizmoObj.picker.translate, gizmoObj.gizmo.translate]) {
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
  };

  return () => {
    gizmoObj.updateMatrixWorld = original;
  };
}
// -------------------------------------------------------------------------

export function Gizmo() {
  const selectedId = useStore((s) => s.selectedId);
  const board = useStore((s) => s.doc.boards.find((b) => b.id === s.selectedId));
  const updateBoard = useStore((s) => s.updateBoard);
  const proxy = useRef<THREE.Object3D>(new THREE.Object3D());
  const dragging = useRef(false);
  // Typed as the real drei ref target so it satisfies <TransformControls ref>;
  // narrowed to ControlsInternals only at the point stabilizeTranslateGizmo
  // touches it, since that's the only internal surface this file relies on.
  const controlsRef = useRef<TransformControlsImpl | null>(null);
  // Switching projection (Toolbar's Orthographic/Perspective toggle) swaps
  // the default camera object, which makes drei recreate the underlying
  // TransformControls instance (its `controls` is a `useMemo` keyed on the
  // camera). The patch below is applied to that specific instance, so it has
  // to reapply whenever the camera identity changes — not just on selection
  // change — or a projection toggle silently drops the fix.
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    return stabilizeTranslateGizmo(controls as unknown as ControlsInternals);
  }, [board?.id, camera]);

  // Keep the invisible proxy object in step with the document. The gizmo drags
  // the proxy; the document is what the drag ultimately writes to.
  //
  // The `dragging` guard is essential, not defensive. TransformControls computes
  // its motion from the object state it captured at drag start, so writing to
  // that object's position mid-drag makes the control fight itself — the symptom
  // is jitter or drift rather than clean stepping. During a drag the control owns
  // the proxy; the document only reads back from it on release.
  useEffect(() => {
    if (board && !dragging.current) proxy.current.position.set(...boardCenter(board));
  }, [board?.id, board?.position[0], board?.position[1], board?.position[2],
      board?.length, board?.width, board?.thickness, board?.rotation, board?.standing]);

  if (!board || !selectedId) return null;

  const commit = () => {
    const extents = boardExtents(board);
    const p = proxy.current.position;
    // Gizmo works in centers; the document stores min-corners. Convert back,
    // then snap — snapping the corner, not the center, is what makes a board
    // land flush on a 1/16" boundary. `translationSnap` already steps the
    // control itself; this second snap keeps the stored corner exact after the
    // center-to-corner conversion.
    updateBoard(selectedId, {
      position: [
        snap(p.x - extents[0] / 2),
        snap(p.y - extents[1] / 2),
        snap(p.z - extents[2] / 2),
      ],
    });
  };

  return (
    <>
      <primitive object={proxy.current} />
      <TransformControls
        ref={controlsRef}
        object={proxy.current}
        mode="translate"
        translationSnap={SNAP_INCHES}
        onMouseDown={() => { dragging.current = true; useStore.getState().beginGesture(); }}
        onObjectChange={commit}
        onMouseUp={() => { dragging.current = false; commit(); useStore.getState().endGesture(); }}
      />
    </>
  );
}
