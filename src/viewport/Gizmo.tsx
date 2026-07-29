import { useEffect, useRef } from 'react';
import { TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store/store';
import { boardCenter, boardExtents } from '../document/document';

export const SNAP_INCHES = 1 / 16;

const snap = (v: number) => Math.round(v / SNAP_INCHES) * SNAP_INCHES;

export function Gizmo() {
  const selectedId = useStore((s) => s.selectedId);
  const board = useStore((s) => s.doc.boards.find((b) => b.id === s.selectedId));
  const updateBoard = useStore((s) => s.updateBoard);
  const proxy = useRef<THREE.Object3D>(new THREE.Object3D());
  const dragging = useRef(false);

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
        object={proxy.current}
        mode="translate"
        translationSnap={SNAP_INCHES}
        onMouseDown={() => {
          // Task 8 adds gesture coalescing (beginGesture/endGesture) here so a
          // whole drag becomes a single undo step. Until then each frame's
          // commit is its own undo entry.
          dragging.current = true;
        }}
        onObjectChange={commit}
        onMouseUp={() => {
          dragging.current = false;
          commit();
        }}
      />
    </>
  );
}
