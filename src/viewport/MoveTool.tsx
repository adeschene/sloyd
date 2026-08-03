import { useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { guideSnapPoints, sameSnapPoint, snapPointsFor } from '../document/document';
import type { BoardSnapPoint, SnapPoint } from '../document/document';
import { useStore } from '../store/store';
import { CLICK_DRAG_SLOP_PX } from './pointer';
import { PICK_RADIUS_PX, pickSnapPoint } from './snapPick';
import type { ProjectedPoint } from './snapPick';
import { SnapMarker } from './SnapMarker';

/** Reused rather than allocated per candidate per pointer event. */
const projected = new THREE.Vector3();

/**
 * Narrows a picked candidate to a board-owned one, for the grab call.
 *
 * A written-out predicate rather than an inline `hit.owner.type === 'board'`,
 * and the reason is a TypeScript fact worth recording rather than rediscovering:
 * `SnapPoint` is an INTERFACE whose `owner` is the union — it is not itself a
 * discriminated union — so the inline test narrows `hit.owner` and leaves `hit`
 * a plain `SnapPoint`. tsc then rejects the call with "Type 'SnapPoint' is not
 * assignable to parameter of type 'BoardSnapPoint'" even though the test
 * directly in front of it has just established the fact. There is nothing for
 * the compiler to narrow `hit` TO without being told, which is what this is.
 *
 * So the ownership test here is REQUIRED, not a redundant echo of the candidate
 * memo: the memo's two branches have different element types (BoardSnapPoint[]
 * pre-grab, a mixed array post-grab), the memo's inferred type is their union,
 * and the pre-grab branch's board-ownership does not survive that. This is the
 * one place a picked point becomes the store's BoardSnapPoint. Contrast
 * commitSnapMove's self-snap guard, which IS deliberately redundant with the
 * memo.
 */
const isBoardOwned = (p: SnapPoint): p is BoardSnapPoint => p.owner.type === 'board';

/**
 * The Move tool: click a snap point to grab it, click another to drop the
 * grabbed board so the two points coincide exactly.
 *
 * Renders nothing and listens to nothing unless `tool === 'move'`.
 */
export function MoveTool({ showGuides = true }: { showGuides?: boolean }) {
  const tool = useStore((s) => s.tool);
  const boards = useStore((s) => s.doc.boards);
  const guides = useStore((s) => s.doc.guides);
  const grabbed = useStore((s) => s.grabbed);
  const selectedId = useStore((s) => s.selectedId);

  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  const [hovered, setHovered] = useState<SnapPoint | null>(null);
  // Mirrors `hovered` so the pointermove handler can compare against the
  // current pick without re-subscribing the listener on every hover change.
  const hoveredRef = useRef<SnapPoint | null>(null);
  // Where the pointer went down, for the click-versus-drag test. Tagged with
  // the pointerId that set it: a multi-touch pinch fires pointerdown for both
  // fingers, and without the id, the second finger's down would overwrite the
  // first's, so releasing the first finger measures its travel against the
  // second finger's position and can spuriously pass the slop test — grabbing
  // or committing a point the user never aimed at. Requiring the matching id
  // on pointerup (rather than just ignoring a second concurrent pointerdown)
  // means each finger's own down/up pair still works correctly on its own;
  // it's only cross-finger measurement that's excluded. Latent and
  // touch-only — this tool has never been driven by real touch input
  // (follow-up 106) — but closed per the working agreement to fix latent bugs
  // reachable only on a future platform.
  const downAt = useRef<{ x: number; y: number; pointerId: number } | null>(null);

  /**
   * The points on offer, which are two different sets rather than one set
   * with a filter.
   *
   * BEFORE a grab: only the SELECTED board's points. Boards in a real project
   * touch — that is what the tool is for — so two of them routinely share a
   * corner, and offering both meant pickSnapPoint's depth tie-break silently
   * decided which board was about to move. The marker sits at a position both
   * boards share, so nothing on screen said which one it named. With nothing
   * selected this is empty, and nothing is grabbable at all — which is what
   * the toolbar's "Select a part to move" hint exists to explain.
   *
   * AFTER a grab: every board's points minus the grabbed board's own.
   * Deliberately NOT restricted the same way — two coincident TARGET points
   * produce the identical delta, so which one wins is unobservable, and the
   * board being moved is by definition the selected one, so a selected-only
   * target set would leave nothing to snap to. See design §3.
   *
   * Withholding the grabbed board's own candidates is what makes the
   * self-snap exclusion legible: an ineligible point draws no marker, so the
   * case is never offered rather than being offered and then silently ignored
   * on click. (commitSnapMove guards it too — that guard makes the rule true
   * of the action, this makes it true of the UI.)
   *
   * Both branches go through snapPointsFor, which is the box lattice plus the
   * cut-owned points. BOTH is load-bearing, not symmetry: the operation cut
   * points exist for grabs a corner on the shelf and clicks the shoulder on
   * the side panel, so a cut point is most often a TARGET, on the board that
   * is not selected. One function rather than two concatenations so the
   * branches cannot drift (follow-up 113).
   *
   * GUIDES ARE TARGETS, NEVER GRAB SOURCES, so they appear in the post-grab
   * branch only — you snap a board onto a guide, never a guide onto a board.
   * The pre-grab branch needs no filter to make that true: it is one selected
   * board's points, which are board-owned by construction. Stacking a
   * board-owned filter on a rule that is already narrower would be two
   * predicates that agree today and two places for a future rule to disagree
   * (follow-ups 113 and 125). Hidden guides offer no candidates either — a
   * marker over an invisible point is an indicator with nothing under it
   * (design §6).
   */
  const candidates = useMemo(() => {
    if (grabbed) {
      return [
        ...boards.flatMap(snapPointsFor).filter((p) => p.owner.id !== grabbed.owner.id),
        ...(showGuides ? guideSnapPoints(guides) : []),
      ];
    }
    const selected = boards.find((b) => b.id === selectedId);
    return selected ? snapPointsFor(selected) : [];
  }, [boards, grabbed, selectedId, guides, showGuides]);

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
      downAt.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
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
      // A release whose pointerId doesn't match the down that's on file isn't
      // this pointer's click — its own down either hasn't happened (single
      // slot already held by another finger) or was itself overwritten. Leave
      // downAt alone rather than clearing it: the finger that actually owns
      // it still needs it on its own pointerup.
      if (down && down.pointerId !== e.pointerId) return;
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
        // Required by the compiler, not a redundant echo of the memo — see
        // isBoardOwned's comment for why it is a predicate rather than the
        // inline test the design sketched.
        if (hit && isBoardOwned(hit)) store.grabSnapPoint(hit);
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
    // already depends on `boards`, `grabbed`, `selectedId`, `guides` and
    // `showGuides` — so none of those belongs here again. `size.width`/
    // `.height` rather than `size` so a re-created size object does not
    // resubscribe.
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
