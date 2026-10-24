import { useEffect, useMemo, useRef } from 'react';
import { TransformControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { TransformControls as TransformControlsImpl } from 'three-stdlib';
import { useStore } from '../store/store';
import { boardCenter, boardExtents, partsBounds, isCovered, partAt, worldParts } from '../document/document';
import { snapStep, snapToGrid } from '../document/geometry';
import { stabilizeTranslateGizmo, type ControlsInternals } from './gizmoPatch';

export function Gizmo({ hidden = false }: { hidden?: boolean } = {}) {
  // Bare fields, derived below — a selector returning a fresh array would
  // re-render on every set() (invariant 34's selector rule).
  const boards = useStore((s) => worldParts(s.doc));
  const selectedIds = useStore((s) => s.selectedIds);
  const doc = useStore((s) => s.doc);
  const step = snapStep(doc.units);
  const snap = (v: number) => snapToGrid(v, doc.units);
  const updateBoard = useStore((s) => s.updateBoard);
  const moveGroupTo = useStore((s) => s.moveGroupTo);
  const selected = useMemo(() => {
    const set = new Set(selectedIds);
    return boards.filter((b) => isCovered(b.id, set));
  }, [boards, selectedIds]);
  // ONE part selected: the original single-board path, byte for byte. It is
  // deliberately NOT routed through moveGroupTo — `old + (snap(t) - old)` is
  // not bit-identical to `snap(t)` for a non-dyadic `old`, and the spec says
  // one selected part changes nothing.
  // The single-part path ONLY when exactly one selected id is a PART (assemblies
  // plan, Review Focus): an assembly holding one part must move its origin,
  // through moveGroupTo, never the part.
  const singlePart = selectedIds.length === 1 && partAt(doc, selectedIds[0]!) !== null;
  const board = singlePart ? selected[0] : undefined;
  const bounds = !singlePart && selected.length >= 1 ? partsBounds(selected) : null;
  const size: [number, number, number] | null = board
    ? boardExtents(board)
    : bounds
      ? [bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]]
      : null;
  const center: [number, number, number] | null = board
    ? boardCenter(board)
    : bounds
      ? [(bounds.min[0] + bounds.max[0]) / 2, (bounds.min[1] + bounds.max[1]) / 2, (bounds.min[2] + bounds.max[2]) / 2]
      : null;
  // A string, so the effects below re-run on a real selection change and not
  // on every render (an array dep is a new identity each time — invariant 15).
  const selectionKey = selectedIds.join('|');
  const proxy = useRef<THREE.Object3D>(new THREE.Object3D());
  const dragging = useRef(false);
  // True from a mid-drag selection change until the mouse comes up. See the
  // effect that sets it.
  const abandoned = useRef(false);
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
  // drei's OTHER recreation key (fu 18): its memo is keyed on the camera AND `domElement || events.connected ||
  // gl.domElement`. Sloyd passes no domElement and never reconnects events, so this is stable today; it is a dep so a
  // future reconnect re-applies the patch instead of silently dropping it.
  const eventTarget = useThree((s) => s.events.connected || s.gl.domElement);

  // The longest edge of what the gizmo moves, kept current every render so the size ceiling
  // tracks edits made in the Properties panel while the board stays selected.
  // The effect below deliberately does not depend on it — reinstalling the
  // whole patch on every keystroke in a dimension field would be absurd.
  const boardMaxExtent = useRef(0);
  boardMaxExtent.current = size ? Math.max(...size) : 0;

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    return stabilizeTranslateGizmo(controls as unknown as ControlsInternals, { boardMaxExtent });
    // `hidden` because the capture's clean frame unmounts <TransformControls>, and drei builds a FRESH
    // controls instance when it comes back: without it the gizmo returns unpatched (no size ceiling, the
    // 'bwd' handles, the flip) until the selection or camera next changes (standard-views final review).
  }, [selectionKey, camera, eventTarget, hidden]);

  // A selection change mid-drag ENDS the drag. Ctrl/Cmd+A or Delete can land
  // while an arrow is held. With one part selected the old code got this by
  // unmounting (`board` became undefined), but a group keeps a target, so the
  // controls stay mounted and would keep dragging a proxy positioned for the
  // OLD selection while `commit` read the NEW selection's size and ids. The
  // parts would jump by the difference between the two centres. So: end the
  // gesture here, the same endGesture path as Routes 1 and 2 below (invariant
  // 4), and mark the drag abandoned so `commit` and `onMouseUp` ignore the rest
  // of it. Declared BEFORE the proxy sync so `dragging` is already false when
  // that effect runs for the same selection change and moves the proxy to the
  // new centre. That does NOT stop three-stdlib's own drag state: the control
  // keeps dragging until mouse-up, so the gizmo follows the pointer near the
  // OLD selection for the rest of the gesture. Nothing is committed meanwhile
  // (follow-up 207).
  // Runs only when the key changes; on mount `dragging` is false.
  useEffect(() => {
    if (!dragging.current) return;
    dragging.current = false;
    abandoned.current = true;
    useStore.getState().endGesture();
  }, [selectionKey]);

  // Keep the invisible proxy object in step with the document. The gizmo drags
  // the proxy; the document is what the drag ultimately writes to.
  //
  // The `dragging` guard is essential, not defensive. TransformControls computes
  // its motion from the object state it captured at drag start, so writing to
  // that object's position mid-drag makes the control fight itself — the symptom
  // is jitter or drift rather than clean stepping. During a drag the control owns
  // the proxy; the document only reads back from it on release.
  useEffect(() => {
    if (center && !dragging.current) proxy.current.position.set(...center);
  }, [selectionKey, center?.[0], center?.[1], center?.[2]]);

  // Invariant 4's gesture-leak guard, closing both routes by which
  // TransformControls can go away mid-drag without ever firing onMouseUp.
  // beginGesture()/endGesture() are meant to bracket exactly one drag; if
  // endGesture() is skipped, the store's `gesturing` flag stays true until
  // the next replaceDocument, and edit()'s "skip the snapshot after the first
  // one per gesture" rule (store.ts) skips every undo snapshot from that
  // point on — a single Ctrl+Z reverts everything since, with no error and no
  // visible cause. Follow-up 148 moved that flag into the store's state, so
  // an open/import/restore now ends a leaked gesture; these two effects stay
  // the primary guard, because nothing about a mid-drag unmount implies a
  // document is about to be replaced. Unmounting mid-drag skips `onMouseUp`: both effects below exist
  // because unmount runs cleanup, never the mouse handlers.
  //
  // Route 1 (pre-existing): the selection empties (a delete, an undo, a deselect), which trips
  // the early `return null` below and unmounts <TransformControls> while
  // Gizmo itself stays mounted. Runs on every render so it catches the
  // transition the render after it happens.
  const hasTarget = center !== null;
  useEffect(() => {
    if (hasTarget) return;
    if (dragging.current) {
      dragging.current = false;
      useStore.getState().endGesture();
    }
  }, [hasTarget]);

  // Route 2 (this branch): Gizmo itself unmounts, e.g. pressing M while
  // holding a gizmo arrow switches tools and tears the whole component down.
  // Empty deps: this is cleanup for the component's own unmount, not for any
  // prop change, so it must run exactly once on teardown.
  useEffect(() => () => {
    if (dragging.current) {
      dragging.current = false;
      useStore.getState().endGesture();
    }
  }, []);

  // `hidden` is the capture's clean frame (standard-views spec §3.2): Gizmo itself stays mounted (its unmount
  // cleanup above would end an in-flight gesture), but its <TransformControls> child does unmount, which is
  // why the stabilize effect above lists `hidden`.
  if (!center || !size || hidden) return null;

  const commit = () => {
    if (abandoned.current) return;
    const p = proxy.current.position;
    if (board) {
      const extents = boardExtents(board);
      // Gizmo works in centers; the document stores min-corners. Convert back,
      // then snap — snapping the corner, not the center, is what makes a board
      // land flush on a 1/16" boundary. `translationSnap` already steps the
      // control itself; this second snap keeps the stored corner exact after the
      // center-to-corner conversion.
      updateBoard(board.id, {
        position: [
          snap(p.x - extents[0] / 2),
          snap(p.y - extents[1] / 2),
          snap(p.z - extents[2] / 2),
        ],
      });
      return;
    }
    // Two or more parts, or any assembly: hand the store the group's wanted min corner, UNROUNDED.
    // moveGroupTo rounds it once and moves every part by one delta, so the
    // layout survives exactly even for an off-grid part (invariant 25).
    moveGroupTo(selectedIds, [
      p.x - size[0] / 2,
      p.y - size[1] / 2,
      p.z - size[2] / 2,
    ]);
  };

  return (
    <>
      <primitive object={proxy.current} />
      <TransformControls
        ref={controlsRef}
        object={proxy.current}
        mode="translate"
        translationSnap={step}
        onMouseDown={() => { abandoned.current = false; dragging.current = true; useStore.getState().beginGesture(); }}
        onObjectChange={commit}
        onMouseUp={() => {
          if (abandoned.current) {
            // The gesture already ended at the selection change. Commit nothing,
            // and put back the proxy the controls kept moving after that.
            abandoned.current = false;
            proxy.current.position.set(...center);
            return;
          }
          dragging.current = false; commit(); useStore.getState().endGesture();
        }}
      />
    </>
  );
}
