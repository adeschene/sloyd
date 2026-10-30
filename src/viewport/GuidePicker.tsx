import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { isAnyLine } from '../document/document';
import type { Guide } from '../document/document';
import { useStore } from '../store/store';
import { visibleGuides } from '../store/visibility';
import { isToggleModifier } from '../store/selectionGesture';
import { isPartMesh } from './BoardMesh';
import { CLICK_DRAG_SLOP_PX } from './pointer';
import { projectorFor, ndcDepth } from './projector';
import { PICK_RADIUS_PX, pickGuide } from './snapPick';
import type { Vec3 } from './snapPick';
import { SCENE_EXTENT } from './extent';

/**
 * How far BEYOND the first part hit the occluder depth is taken, in world inches. A line lying ON a part's face (a
 * line-face hit's line, an edge line) must stay pickable, but `pickGuide` compares the line's closest point with the
 * occluder, two different points; 1/16" behind the face lets the line on it win while a line inside or behind the part
 * still loses (the controller's ruling; a line within 1/16" behind a face is pickable through it, negligibly).
 */
const OCCLUDER_BEYOND_INCHES = 0.0625;

/** Reused for every pick: a per-event allocation would churn on each pointermove. */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const beyond = new THREE.Vector3();
const hits: THREE.Intersection[] = [];

/**
 * The guide selection's viewport pick (selectable-guides spec §4): a click in the Select tool on a guide point or a
 * construction line selects it (Shift, Ctrl or Cmd toggles). Renders nothing; mounted beside GuideMarkers under the
 * same condition (`showGuides && explode === 0`), and listens only while `enabled` (the Select tool).
 *
 * ONE DECIDER for guide, part and miss (spec §4.1). R3F connects its DOM handlers, `click` and `dblclick` among them,
 * to the Canvas's WRAPPING DIV in the bubble phase, and one `click` drives both a mesh's `onClick` and the Canvas's
 * `onPointerMissed` (`handlePointer` in @react-three/fiber's events module). These listeners are CAPTURE-phase on the
 * canvas element inside that div, so they run first; on a guide hit `stopPropagation` keeps the click from ever
 * reaching the div, so neither the part click nor the miss runs for it. On a miss they do nothing and R3F proceeds as
 * before. `watchClickPairs`' own capture listeners sit on the same element and still run (stopPropagation does not stop
 * listeners on the current target).
 *
 * The guide is chosen by `pickGuide` (screen space, never a raycast of a line: spec §2). The occluder is the first PART
 * the cursor ray hits, raycast directly against the meshes `isPartMesh` tags (their section-aware raycast applies, inv
 * 51; hidden parts are not mounted). A point is never occluded (its marker draws `depthTest: false`).
 */
export function GuidePicker({ enabled }: { enabled: boolean }) {
  const guides = useStore((s) => s.doc.guides);
  const hiddenGuideIds = useStore((s) => s.hiddenGuideIds);
  // Filtered in a memo, never in a selector (inv 43).
  const shown = useMemo(() => visibleGuides(guides, hiddenGuideIds), [guides, hiddenGuideIds]);

  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const size = useThree((s) => s.size);

  useEffect(() => {
    if (!enabled) return;
    const el = gl.domElement;
    const project = projectorFor(camera, size.width, size.height);

    /** The guide under the pointer, or null. */
    const pickAt = (clientX: number, clientY: number, list: Guide[]): string | null => {
      if (list.length === 0) return null;
      const rect = el.getBoundingClientRect();
      const cursor = { x: clientX - rect.left, y: clientY - rect.top };
      ndc.set((cursor.x / size.width) * 2 - 1, -(cursor.y / size.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const { origin, direction } = raycaster.ray;
      const ray = { origin: [origin.x, origin.y, origin.z] as Vec3, dir: [direction.x, direction.y, direction.z] as Vec3 };
      // The occluder only ever removes LINES, so a pick with none that finds nothing, or a point, is already the answer.
      // Only when a line wins is the scene raycast and the pick re-run (most hover frames never raycast).
      const first = pickGuide(list, project, cursor, ray, PICK_RADIUS_PX, SCENE_EXTENT, null);
      if (first === null || !list.some((g) => g.id === first && isAnyLine(g))) return first;
      return pickGuide(list, project, cursor, ray, PICK_RADIUS_PX, SCENE_EXTENT, occluderDepth());
    };

    /** NDC depth just beyond the first part the (already set) ray hits, or null when it hits none. */
    const occluderDepth = (): number | null => {
      const parts: THREE.Object3D[] = [];
      scene.traverse((o) => { if (isPartMesh(o)) parts.push(o); });
      hits.length = 0;
      raycaster.intersectObjects(parts, false, hits);
      const first = hits[0];
      hits.length = 0;
      if (!first) return null;
      beyond.copy(raycaster.ray.direction).multiplyScalar(first.distance + OCCLUDER_BEYOND_INCHES).add(raycaster.ray.origin);
      return ndcDepth(camera, beyond);
    };

    // Where the primary button last went down, for the click-versus-drag test.
    let press: { x: number; y: number } | null = null;
    // The guide the most recent click selected, so the dblclick that follows it is stopped too: a double-click on a
    // guide must never open the assembly behind it, nor reach `onPointerMissed` (a dblclick is a click event to R3F).
    let lastClickHit: string | null = null;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      press = { x: e.clientX, y: e.clientY };
    };

    const onClick = (e: MouseEvent) => {
      lastClickHit = null;
      if (e.button !== 0 || !press) return;
      // Read imperatively, as the tools read the store in their handlers: the render closure could be stale.
      if (useStore.getState().tool !== 'select') return;
      // A press that travelled is an orbit or a pan, not a click (the same slop BoardMesh and R3F's miss apply).
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > CLICK_DRAG_SLOP_PX) return;
      const id = pickAt(e.clientX, e.clientY, shown);
      if (id === null) return; // A miss: R3F decides part or nothing, as before.
      e.stopPropagation();
      lastClickHit = id;
      useStore.getState().selectGuide(id, isToggleModifier(e));
    };

    const onDoubleClick = (e: MouseEvent) => {
      if (lastClickHit !== null) e.stopPropagation();
    };

    // Hover (spec §4.3): a pointer cursor over a pickable guide. At most ONE pick per animation frame, from the latest
    // pointer position; none while a button is held (an orbit or pan).
    let frame = 0;
    let at: { x: number; y: number } | null = null;
    let pointing = false;
    const setPointing = (next: boolean) => {
      if (next === pointing) return;
      pointing = next;
      // The canvas's own style: '' falls back to what it inherits from the Canvas's wrapping div.
      el.style.cursor = next ? 'pointer' : '';
    };
    const hover = () => {
      frame = 0;
      if (!at) return;
      setPointing(pickAt(at.x, at.y, shown) !== null);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.buttons !== 0) {
        at = null;
        setPointing(false);
        return;
      }
      at = { x: e.clientX, y: e.clientY };
      if (frame === 0) frame = requestAnimationFrame(hover);
    };
    const onPointerLeave = () => {
      at = null;
      setPointing(false);
    };

    el.addEventListener('pointerdown', onPointerDown, true);
    el.addEventListener('click', onClick, true);
    el.addEventListener('dblclick', onDoubleClick, true);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerleave', onPointerLeave);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown, true);
      el.removeEventListener('click', onClick, true);
      el.removeEventListener('dblclick', onDoubleClick, true);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerleave', onPointerLeave);
      if (frame !== 0) cancelAnimationFrame(frame);
      setPointing(false);
    };
    // `size.width`/`.height` rather than `size`, so a re-created size object does not resubscribe. `shown` changes
    // with the guides; the press and the last hit are per-subscription and a guide edit between a press and its click
    // is not reachable by the pointer.
  }, [enabled, shown, gl, camera, scene, size.width, size.height]);

  return null;
}
