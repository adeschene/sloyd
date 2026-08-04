import { useEffect, useMemo, useRef } from 'react';
import { Line } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { guideSnapPoints, offsetPoint, sameSnapPoint, snapPointsFor, towardFor } from '../document/document';
import type { SnapPoint } from '../document/document';
// THE FIRST `viewport -> units` IMPORT in the repo. Legal under CLAUDE.md's
// layer order — `units` is the bottom layer, `viewport` sits well above it —
// but new, so it is worth saying why it is not a shortcut. The preview has to
// know what the user typed MEANS in inches, and `parseLength` is the one
// function in the app that decides that. Re-deriving it here (or passing the
// parsed number down through the store) would put a second answer to "how long
// is `1-1/2`" in the codebase, which is the class of duplication the three
// `document -> units` edges were each opened to avoid.
import { parseLength } from '../units/length';
import { useStore } from '../store/store';
import { CLICK_DRAG_SLOP_PX } from './pointer';
import { PICK_RADIUS_PX, pickSnapPoint } from './snapPick';
import type { ProjectedPoint } from './snapPick';
import { SnapMarker, SNAP_COLORS } from './SnapMarker';

/** Reused rather than allocated per candidate per pointer event. */
const projected = new THREE.Vector3();

/**
 * The measuring line's colour — the guide marker's hue, so the two read as
 * one tool. Taken from `SNAP_COLORS.guide` rather than hard-coded a second
 * time: that constant is browser-settled and retunable (SnapMarker.tsx), so a
 * second literal here would silently desynchronise from it the next time it
 * moves.
 */
const TAPE_COLOR = SNAP_COLORS.guide;

/**
 * The Tape tool: click a snap point to anchor, hover a second to read the
 * distance, click to place a guide point there (or type a length in the
 * readout to place one at that distance along the same ray).
 *
 * Structurally a sibling of MoveTool — same raw-DOM pointer handling on
 * gl.domElement, same pointerId-tagged down slot, same drag-slop test, same
 * re-pick at the release position. Read MoveTool's comments for why each of
 * those is shaped the way it is; every one names a real failure mode.
 *
 * Renders nothing and listens to nothing unless `tool === 'tape'`.
 */
export function TapeTool({ showGuides = true }: { showGuides?: boolean }) {
  const tool = useStore((s) => s.tool);
  const boards = useStore((s) => s.doc.boards);
  const guides = useStore((s) => s.doc.guides);
  const anchor = useStore((s) => s.tapeAnchor);
  // The raw text from the readout's box, parsed below. Subscribed here rather
  // than passed in: TapeReadout is a DOM sibling outside the Canvas, so there
  // is no props route between the two — see `tapeTyped` in store.ts.
  const typed = useStore((s) => s.tapeTyped);
  // Subscribed, not merely added to a dep list: this component reads `typed`
  // off the store rather than as a prop, and the axis has to arrive the same
  // way. A dep-list entry over a value nothing subscribes to is invariant 15's
  // failure mode wearing the right clothes — the memo would be correct and
  // would simply never re-run.
  const axis = useStore((s) => s.tapeAxis);

  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  /**
   * The hover lives in the STORE, not in a useState here, and the marker below
   * is drawn from that same value.
   *
   * It has to be in the store regardless — the readout is a DOM overlay
   * outside the Canvas and cannot read component state — and the first version
   * of this file kept a local copy beside it, publishing to the store in an
   * effect. That copy was a divergence waiting to happen: the store clears the
   * hover point-precisely (invariant 24's third instance) and a local copy
   * hears nothing about it, so the viewport would go on drawing a marker and a
   * measuring line for a target the readout had already dropped — the tool
   * saying "here it is" and the readout saying "no target" at the same moment.
   * One source, so there is nothing to keep in sync.
   *
   * `hoveredRef` survives that as the pointermove comparison (committing to
   * React only when the pick changes, since pointermove fires far more often).
   * It is synced FROM the store below rather than only written here, which is
   * what makes a store-side clear re-pickable: without that sync the ref would
   * still name the cleared point, sameSnapPoint would match it, and the next
   * pointermove over the same position would publish nothing.
   */
  const hovered = useStore((s) => s.tapeHover);
  const setHovered = useStore((s) => s.setTapeHover);
  const hoveredRef = useRef<SnapPoint | null>(null);
  useEffect(() => {
    hoveredRef.current = hovered;
  }, [hovered]);

  const downAt = useRef<{ x: number; y: number; pointerId: number } | null>(null);

  /**
   * Every candidate: boards and guides alike, with no exclusions.
   *
   * Unlike MoveTool this withholds nothing, in EITHER direction. There is no
   * self-snap case to exclude — measuring from one corner of a board to
   * another corner of the SAME board is an ordinary thing to want, and placing
   * a guide there is exactly what the tool is for — and there is no
   * selected-board restriction either, because the tape measures BETWEEN
   * boards and restricting it to one would remove most of what it is for.
   * (That is also why tapeAnchor is deliberately absent from the two
   * selection-based clears — design §4.2.)
   *
   * snapPointsFor, NOT boardSnapPoints: a board's candidates are the box
   * lattice plus its cuts' shoulders since the cut-points round. Reaching for
   * boardSnapPoints here would silently make the tape unable to measure to a
   * dado shoulder — half of what this round and the last one unlock together.
   */
  const candidates = useMemo(
    () => [...boards.flatMap(snapPointsFor), ...(showGuides ? guideSnapPoints(guides) : [])],
    [boards, guides, showGuides],
  );

  useEffect(() => {
    if (tool !== 'tape') {
      setHovered(null);
      return;
    }

    const el = gl.domElement;

    /** World position -> canvas pixels, or null for a point the camera cannot see. */
    const project = (at: [number, number, number]): ProjectedPoint | null => {
      projected.set(at[0], at[1], at[2]).project(camera);
      // Outside the normalised depth range means behind the camera (or beyond
      // the far plane) — without this a point behind a perspective camera
      // projects to a mirrored position in FRONT of the cursor and reads as a
      // near miss. See MoveTool's own copy for the full account.
      if (projected.z < -1 || projected.z > 1) return null;
      return {
        x: (projected.x * 0.5 + 0.5) * size.width,
        y: (-projected.y * 0.5 + 0.5) * size.height,
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
      // Tagged with the pointerId that set it, for the same multi-touch reason
      // MoveTool's is: a pinch fires pointerdown for both fingers, and an
      // untagged slot would measure one finger's travel against the other's
      // position and spuriously pass the slop test below.
      downAt.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    };

    const onPointerMove = (e: PointerEvent) => {
      const next = pickSnapPoint(candidates, project, cursorOf(e), PICK_RADIUS_PX);
      // Committed to React only when the pick actually changes — pointermove
      // fires far more often than that.
      if (sameSnapPoint(next, hoveredRef.current)) return;
      hoveredRef.current = next;
      setHovered(next);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const down = downAt.current;
      // A release whose pointerId doesn't match the down on file isn't this
      // pointer's click. Leave downAt alone rather than clearing it: the
      // finger that owns it still needs it on its own pointerup.
      if (down && down.pointerId !== e.pointerId) return;
      downAt.current = null;
      if (!down) return;
      // A release that travelled is an orbit, a pan or a zoom — not a click.
      // This is what leaves OrbitControls ungated: the camera stays fully
      // usable between anchoring and placing.
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_DRAG_SLOP_PX) return;

      // Re-picked at the release position rather than trusting the last
      // pointermove: a pen or touch click can produce no pointermove at all.
      const hit = pickSnapPoint(candidates, project, cursorOf(e), PICK_RADIUS_PX);
      // Read imperatively: the render closure's `anchor` would be stale for
      // any event arriving between a store write and the next commit.
      const store = useStore.getState();
      if (!store.tapeAnchor) {
        if (hit) store.setTapeAnchor(hit);
        return;
      }
      // A second click with no candidate under it cancels, the same as
      // MoveTool's empty-space release. Placing a guide would need a position,
      // and there is none.
      if (!hit) {
        store.clearTapeAnchor();
        return;
      }
      // LOCKED: a click re-anchors and KEEPS the axis (design §5.2). Placing a
      // guide here instead would mean a click and Enter placing guides in two
      // different positions while one direction is drawn on screen, which is
      // the disagreement the lock exists to prevent.
      //
      // The CLICK/COMMIT ASYMMETRY, stated here because this branch is exactly
      // half of it and reading it alone invites the wrong conclusion — which is
      // the one this comment's first version drew. A click retargets the lock
      // for free: aim at the wrong corner, click the right one, the axis is
      // still armed. A successful ENTER does not, because commit() ends with
      // clearTapeAnchor(), which drops the axis with the anchor — the structural
      // rule at `tapeAxis`'s declaration in store.ts, not an oversight here. So
      // walking a row of corners costs one axis press per PLACEMENT, and
      // `click, type, Enter, click, type, Enter` places one guide along the axis
      // and then refuses the second. Whether it should is follow-up 147.
      if (store.tapeAxis) {
        store.setTapeAnchor(hit);
        return;
      }
      store.addGuide(hit.at);
      store.clearTapeAnchor();
    };

    /**
     * THE LATCH, and it is load-bearing rather than an optimisation.
     *
     * MoveTool clears its hover on leave, because a grab needs no hover to
     * survive — the next click re-picks. The tape does: the typed distance
     * runs along the anchor -> hover direction, and the ONLY way to type is to
     * move the pointer off the canvas and into the readout input. Clearing on
     * leave would therefore destroy the direction on the way to entering the
     * number, and every typed offset would fail with "no target" — the round's
     * central feature, dead.
     *
     * So while anchored, the last target stands until a new one replaces it.
     */
    const onPointerLeave = () => {
      if (useStore.getState().tapeAnchor) return;
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
    // already depends on `boards`, `guides` and `showGuides` — so none of
    // those belongs here again. `size.width`/`.height` rather than `size` so a
    // re-created size object does not resubscribe. `setHovered` is listed
    // because the handlers close over it; it is a zustand action and so stable
    // for the store's lifetime, which makes listing it free rather than
    // churn — the same reason a useState setter is safe to list.
  }, [tool, candidates, gl, camera, size.width, size.height, setHovered]);

  // Clearing the anchor ends the measurement, so the latched target goes with
  // it — otherwise a stale marker would sit on screen after Escape. Redundant
  // with the store for the paths that null both in one statement (setTool,
  // clearGuides, undo, redo, replaceDocument); load-bearing for clearTapeAnchor
  // itself, which nulls only the anchor.
  useEffect(() => {
    if (anchor) return;
    setHovered(null);
  }, [anchor, setHovered]);

  /**
   * WHERE THE GUIDE WILL ACTUALLY LAND, given what is typed so far.
   *
   * DERIVED EVERY RENDER, NEVER STORED, and that is the whole design rather
   * than an implementation preference. A stored preview position would be a
   * FOURTH held world position — captured at one moment, describing the world
   * as it was then — and would therefore need every clearing rule invariant 24
   * spells out for `grabbed`, `tapeAnchor` and `tapeHover`: drop it when the
   * anchor's board moves, when the hovered board is edited, on undo, on
   * replaceDocument, on removeGuide. Derived, it needs none of them, because it
   * is a pure function of things that already have those rules (plus the axis,
   * which is store state with no world position to go stale at all). Delete
   * the anchor and it evaluates to null on the very next render; move a board
   * and it moves with the point it is measured from. It cannot go stale,
   * because it is never a fact — the same reason nothing about snap points is
   * stored anywhere in this app.
   *
   * `offsetPoint` returns null for a zero-length direction (anchor and hover on
   * the same position) and for a non-finite distance, so the two degenerate
   * cases the readout refuses on Enter simply draw nothing here — the preview
   * and the commit agree because they call the same function, not because two
   * pieces of code were written to match.
   *
   * `towardFor` is now what supplies the direction, and it is the SAME call
   * TapeReadout's commit() makes — anchor, axis, hover, in that order — so the
   * marker and the placement cannot disagree about which ray a typed number
   * runs along. That is also what keeps this a derivation rather than a fourth
   * held point even now that a lock exists: the axis lives in the store
   * already (tapeAxis), so nothing new is captured here, only read.
   */
  // Memoised on object identities, unlike the coordinate-keyed `line` memo just
  // below — the two dependency styles differ on purpose and it is worth saying
  // so, because invariant 15 is about exactly this kind of hand-written list.
  // `line` is keyed on coordinates because drei rebuilds a LineGeometry on a
  // new array identity, so an over-invalidation there costs real work. This one
  // exists only to hold the array stable FOR that memo, and a new `anchor` or
  // `hovered` object always means a new point, so over-invalidating costs one
  // pure recomputation and nothing else. Under-invalidation is what invariant
  // 15 warns about, and neither list can under-invalidate: all four inputs —
  // anchor, hovered, typed and axis — are listed.
  const preview = useMemo(() => {
    if (!anchor) return null;
    // The SAME call TapeReadout's commit() makes. The `!hovered` gate this
    // replaces is exactly what made axis mode draw nothing — the direction no
    // longer has to come from a second feature.
    const toward = towardFor(anchor.at, axis, hovered?.at ?? null);
    if (!toward) return null;
    const distance = parseLength(typed);
    if (distance === null) return null;
    return offsetPoint(anchor.at, toward, distance);
  }, [anchor, hovered, typed, axis]);

  // The far end of the measuring line: the preview when there is one, the
  // hovered point otherwise.
  //
  // Drawing to the HOVER while a preview exists would leave the marker floating
  // free of the line for any typed distance longer than the measured one — and
  // for a negative one it would put the marker on the opposite side of the
  // anchor entirely, with the line pointing away from it. The line's job is to
  // say "this is the measurement you are making", and once a number is typed
  // the measurement ends at the number.
  //
  // Locked with nothing typed yet draws NO line, and that is a decision rather
  // than an omission: the honest thing to draw would be a semi-infinite axis
  // line, which is follow-up 130's construction line and is out of this round's
  // scope (design §8). The readout's axis chip is what confirms the lock. If
  // the browser pass finds this reads as broken rather than as waiting, §9.1
  // names the remedy — a 1" stub to offsetPoint(anchor, toward, 1) — rather
  // than reopening §8.
  const lineEnd = preview ?? (axis ? null : hovered?.at) ?? null;

  // Memoised on the six coordinates rather than rebuilt inline: drei's <Line>
  // keys its LineGeometry (and the computeLineDistances call) on the `points`
  // identity, so a fresh array per render would rebuild both on every commit.
  // Same shape as SnapMarker's own position memo.
  const line = useMemo(
    () => (anchor && lineEnd ? [anchor.at, lineEnd] : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [anchor?.at[0], anchor?.at[1], anchor?.at[2], lineEnd?.[0], lineEnd?.[1], lineEnd?.[2]],
  );

  if (tool !== 'tape') return null;

  return (
    <>
      {anchor && <SnapMarker point={anchor} />}
      {hovered && <SnapMarker point={hovered} />}
      {preview && (
        // The guide hue, at FULL marker size — honest on both counts. This is
        // not a resting guide (RESTING_PX is what says "placed, not picked"),
        // it is the point Enter is about to create, so it is drawn the size a
        // point under active consideration is drawn everywhere else in the app.
        // The hue is `guide` because that is what it will BE — colouring it by
        // the kind of the point it was measured from would say something false
        // about the thing being placed.
        //
        // Not a SnapPoint, deliberately — see MarkerPoint in SnapMarker.tsx.
        // It is owned by nothing and can never be picked.
        <SnapMarker point={{ at: preview, kind: 'guide' }} />
      )}
      {line && (
        // drei's <Line> rather than a native <line>, for the reason OriginAxes
        // states at length: native GL lines are always exactly one
        // render-target pixel wide and ignore `linewidth`, so under the
        // viewport's dpr floor of 2 they downsample to half weight and wash
        // out. <Line> is mesh-based (Line2), so lineWidth is a real,
        // dpr-independent width. It also sidesteps both of the traps the task
        // brief budgeted an attempt for — no `<line>`-versus-SVG-`line` JSX
        // ambiguity, and no hand-called computeLineDistances (which is a
        // method of THREE.Line, NOT of BufferGeometry, so the brief's
        // geometry-ref spelling could not have worked).
        //
        // SOLID rather than dashed, which is the fallback the brief
        // authorises. Dashes here are decoration — there is only ever one such
        // line on screen, so nothing distinguishes it from — and OriginAxes
        // records what fixed world-unit dashes cost: the pattern is measured
        // in world units, shrinks toward sub-pixel as the line recedes, and
        // "cuts in and out randomly" unless a per-frame dashScale holds it at
        // a constant length on screen. Not worth that machinery for a
        // connector.
        //
        // depthTest off so the line is visible where it passes through a
        // board, matching SnapMarker: both ends are pickable even when
        // occluded, so the line joining them has to be readable there too.
        // renderOrder just under the markers keeps the discs on top of it.
        <Line
          points={line}
          color={TAPE_COLOR}
          lineWidth={1.6}
          depthTest={false}
          // Off the depth buffer as well as the depth test, so a line drawn on
          // top of a board cannot then occlude anything drawn after it.
          depthWrite={false}
          transparent
          // Not decoration: the Canvas passes no `flat`, so r3f applies ACES
          // tone mapping by default, and SnapMarker sets toneMapped={false} on
          // its discs for exactly this reason. Without it the line renders a
          // tone-mapped guide hue beside an untone-mapped one, and TAPE_COLOR's
          // claim that the two read as one tool is simply false. Named rather
          // than spelled: the literal lives once, in SNAP_COLORS.guide.
          toneMapped={false}
          renderOrder={9}
          raycast={() => null}
        />
      )}
    </>
  );
}
