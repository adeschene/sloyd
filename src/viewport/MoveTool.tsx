import { useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { boardSnapPoints } from '../document/document';
import type { SnapPoint } from '../document/document';
import { useStore } from '../store/store';
import { CLICK_DRAG_SLOP_PX } from './pointer';
import { PICK_RADIUS_PX, pickSnapPoint, sameSnapPoint } from './snapPick';
import type { ProjectedPoint } from './snapPick';
import { SnapMarker } from './SnapMarker';

/** Reused rather than allocated per candidate per pointer event. */
const projected = new THREE.Vector3();

/**
 * The Move tool: click a snap point to grab it, click another to drop the
 * grabbed board so the two points coincide exactly.
 *
 * Renders nothing and listens to nothing unless `tool === 'move'`.
 */
export function MoveTool() {
  const tool = useStore((s) => s.tool);
  const boards = useStore((s) => s.doc.boards);
  const grabbed = useStore((s) => s.grabbed);

  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  const [hovered, setHovered] = useState<SnapPoint | null>(null);
  // Mirrors `hovered` so the pointermove handler can compare against the
  // current pick without re-subscribing the listener on every hover change.
  const hoveredRef = useRef<SnapPoint | null>(null);
  // Where the pointer went down, for the click-versus-drag test.
  const downAt = useRef<{ x: number; y: number } | null>(null);

  /**
   * Every board's candidates, minus the grabbed board's own.
   *
   * Withholding same-board candidates is what makes the exclusion legible: an
   * ineligible point draws no marker, so the case is never offered rather than
   * being offered and then silently ignored on click. (commitSnapMove guards
   * it too — that guard makes the rule true of the action, this makes it true
   * of the UI.)
   */
  const candidates = useMemo(() => {
    const all = boards.flatMap(boardSnapPoints);
    return grabbed ? all.filter((p) => p.owner.id !== grabbed.owner.id) : all;
  }, [boards, grabbed]);

  useEffect(() => {
    if (tool !== 'move') {
      hoveredRef.current = null;
      setHovered(null);
      return;
    }

    const el = gl.domElement;

    /** World position -> canvas pixels, or null for a point the camera cannot see. */
    const project = (at: [number, number, number]): ProjectedPoint | null => {
      projected.set(at[0], at[1], at[2]).project(camera);
      // Outside the normalised depth range means behind the camera (or beyond
      // the far plane). This is the whole of the culling pickSnapPoint relies
      // on: without it, a point behind a perspective camera projects to a
      // mirrored position in FRONT of the cursor and reads as a near miss.
      if (projected.z < -1 || projected.z > 1) return null;
      return {
        x: (projected.x * 0.5 + 0.5) * size.width,
        y: (-projected.y * 0.5 + 0.5) * size.height,
        // NDC z, not distance to the camera position: it is monotonic in view
        // depth for both projections, where a radial distance is not.
        depth: projected.z,
      };
    };

    const cursorOf = (e: PointerEvent) => {
      // size.width/height are CSS pixels and so is the bounding rect. The
      // canvas renders at dpr 2-3, and none of that belongs here.
      const rect = el.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      downAt.current = { x: e.clientX, y: e.clientY };
    };

    const onPointerMove = (e: PointerEvent) => {
      const next = pickSnapPoint(candidates, project, cursorOf(e), PICK_RADIUS_PX);
      // Committed to React only when the pick actually changes. pointermove
      // fires far more often than that — the same "re-evaluate continuously,
      // commit only on change" pattern AdaptiveGrid uses for grid tiers.
      if (sameSnapPoint(next, hoveredRef.current)) return;
      hoveredRef.current = next;
      setHovered(next);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const down = downAt.current;
      downAt.current = null;
      if (!down) return;
      // A release that travelled is an orbit, a pan or a zoom — not a click.
      // OrbitControls needs no gate precisely because of this test: the camera
      // stays fully usable between grabbing a point and dropping it.
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_DRAG_SLOP_PX) return;

      // Re-picked at the release position rather than trusting the last
      // pointermove: a pen or touch click can produce no pointermove at all.
      const hit = pickSnapPoint(candidates, project, cursorOf(e), PICK_RADIUS_PX);
      // Read imperatively: `grabbed` from the render closure would be stale
      // for any event arriving between a store write and the next commit.
      const store = useStore.getState();
      if (!store.grabbed) {
        if (hit) store.grabSnapPoint(hit);
        return;
      }
      if (hit) store.commitSnapMove(hit);
      else store.cancelGrab();
    };

    const onPointerLeave = () => {
      hoveredRef.current = null;
      setHovered(null);
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointerleave', onPointerLeave);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointerleave', onPointerLeave);
    };
    // `candidates` is in the list because the handlers close over it, and it
    // already depends on both `boards` and `grabbed`. `size.width`/`.height`
    // rather than `size` so a re-created size object does not resubscribe.
  }, [tool, candidates, gl, camera, size.width, size.height]);

  if (tool !== 'move') return null;

  return (
    <>
      {/* The grabbed point stays marked while carrying it, so the user can
          see what they picked up. Both can be on screen at once. */}
      {grabbed && <SnapMarker point={grabbed} />}
      {hovered && <SnapMarker point={hovered} />}
    </>
  );
}
