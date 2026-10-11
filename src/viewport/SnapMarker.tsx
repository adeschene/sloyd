import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { SnapKind } from '../document/document';
import { screenPixelsPerInch } from './screenScale';

/**
 * Marker colour by kind. Off the UI palette on purpose (oak #c8955a is the
 * one live colour in the app, snap-move design §6.1): an inference marker is
 * transient chrome, not part of the model, and its one job is telling you
 * which KIND of point you are about to snap to, before you commit. Shape
 * cannot carry that at the ~9px a marker has to be to sit on a corner without
 * hiding it. Hue and lightness can.
 *
 * Retuned 2026-10-11 (follow-up 249, at the user's request) from saturated
 * SketchUp-style primaries (#2e9e5b, #22b8d4, #8a5fd0, #4f6fd0) to muted
 * milk-paint tones that sit with the walnut/maple palette: moss, verdigris,
 * mulberry, slate blue. The hue families are kept (green corner, cyan-ish
 * midpoint, violet-ish face, blue guide), so the convention still reads. The
 * values came from a search, not from taste alone, with these floors — keep
 * them if you retune again:
 *   - every fill ≥ 3:1 against the maple ground #ebe3d4 (the old cyan was
 *     1.86:1) and ≥ 3.4:1 against the ring, which is what carries a marker on
 *     walnut and cherry;
 *   - mutual CIEDE2000 ≥ 25, and ≥ 14 under simulated deuteranopia and
 *     protanopia (the old violet/blue pair was 3 — indistinguishable). The
 *     distinctness comes from lightness as much as hue: moss and mulberry are
 *     dark, verdigris and slate lighter;
 *   - ≥ 35 ΔE from the selected-board oak, so a marker never reads as part of
 *     a selection.
 * Measured values: docs/follow-ups.md, 249.
 *
 * Browser-settled in the sense of follow-up 60: checked live against pine,
 * walnut and plywood on this app's own ground, not argued from theory alone.
 */
export const SNAP_COLORS: Record<SnapKind, string> = {
  corner: '#3a6028',
  'edge-mid': '#378988',
  'face-center': '#753c60',
  // A guide is not a corner, an edge midpoint or a face centre, and colouring
  // it as one would tell the user something false about what they are about
  // to snap to — the marker's only job. Also the tape's colour (TapeTool).
  guide: '#5469a6',
};

/**
 * The ring around each marker. It exists because a flat fill legible on the
 * near-white ground is not reliably legible on walnut — the ring gives every
 * marker a light border whatever it is sitting on.
 */
export const RING_COLOR = '#f5f2ec';

/** Marker diameter, in screen pixels. */
export const MARKER_PX = 9;

/** Ring thickness beyond the marker's edge, in screen pixels. */
export const RING_PX = 2;

/**
 * A resting guide's marker, in screen pixels — smaller than MARKER_PX, and
 * drawn without the ring.
 *
 * Guides are the only points drawn when nothing is hovering them, so this is
 * what keeps "the marker grew" as the confirmation that a point is picked —
 * the signal every other kind gets for free by appearing at all. It has to
 * stay big enough to aim at and quiet enough that a dozen guides do not read
 * as noise, which makes it browser-settled in the sense of follow-up 60. Task
 * 10 confirms or retunes it; do not "fix" it from theory.
 */
export const RESTING_PX = 6;

/**
 * Everything drawn by the Move tool renders after the boards. depthTest is off
 * (see the materials below), so this is what orders the ring behind the fill.
 */
const MARKER_RENDER_ORDER = 10;

/** Enough segments that a 9px disc reads as round rather than as a polygon. */
const SEGMENTS = 24;

/**
 * One snap indicator: a coloured disc with a light ring, held at a constant
 * size on screen and drawn on top of everything.
 *
 * Constant screen size uses the same screenPixelsPerInch helper the grid tier
 * ladder does. Drawing on top (depthTest false) is what makes the design's
 * decision to keep occluded candidates pickable usable rather than merely
 * permitted: a back corner can be picked, so its marker has to be visible.
 *
 * `resting`, when set, draws the guide-only small variant (RESTING_PX, no
 * ring) instead of the normal hovered/grabbed size — see RESTING_PX's own
 * comment for why. Every other call site leaves this unset, and must keep
 * rendering at full size: the growth from resting to full size on hover is
 * the whole point, and it only works if the full-size path is untouched.
 */
/**
 * What this component actually needs: a position and a kind.
 *
 * DELIBERATELY NOT `SnapPoint`, even though every SnapPoint satisfies it. The
 * tape's typed preview is a position derived from the anchor, the hover and a
 * parsed number — it belongs to nothing, it is in no candidate list, and it
 * cannot be picked. Typing it as a SnapPoint would have meant inventing an
 * `owner` for it, and an owner is not decoration: the store's point-precise
 * clearing (invariant 24) and `pickSnapPoint` both read it, so a fabricated one
 * invites handing the preview to logic that would be meaningless for it — or
 * worse, to logic that would act on it. A narrower prop makes tsc say no
 * instead. SnapMarker never read `owner`; this only stops writing one down.
 */
type MarkerPoint = { at: [number, number, number]; kind: SnapKind };

export function SnapMarker({ point, resting = false }: { point: MarkerPoint; resting?: boolean }) {
  const group = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  const at = useMemo(
    () => new THREE.Vector3(point.at[0], point.at[1], point.at[2]),
    [point.at[0], point.at[1], point.at[2]],
  );

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const ppi = screenPixelsPerInch(camera, at, size.height);
    // screenPixelsPerInch returns NaN for a camera type it cannot measure.
    // Falling back to 1 inch per pixel keeps a (large, obvious) marker on
    // screen rather than writing NaN into the matrix, which would make the
    // whole group vanish with no clue why.
    const inchesPerPx = Number.isFinite(ppi) && ppi > 0 ? 1 / ppi : 1;
    g.scale.setScalar(inchesPerPx);
    // Face the camera. The geometry below is authored in pixels on the XY
    // plane, so the group's own rotation is the whole billboarding step.
    g.quaternion.copy(camera.quaternion);
  });

  return (
    <group ref={group} position={point.at}>
      {/* Not raycastable. The tool reads raw DOM pointer events and never
          needs a hit here, and leaving it pickable would put an invisible
          obstacle in front of the boards it sits on. Same treatment as the
          shadow-receiver plane in Viewport. */}
      {!resting && (
        <mesh renderOrder={MARKER_RENDER_ORDER} raycast={() => null}>
          <circleGeometry args={[MARKER_PX / 2 + RING_PX, SEGMENTS]} />
          <meshBasicMaterial
            color={RING_COLOR}
            depthTest={false}
            depthWrite={false}
            transparent
            opacity={0.95}
            toneMapped={false}
          />
        </mesh>
      )}
      <mesh renderOrder={MARKER_RENDER_ORDER + 1} raycast={() => null}>
        <circleGeometry args={[(resting ? RESTING_PX : MARKER_PX) / 2, SEGMENTS]} />
        <meshBasicMaterial
          color={SNAP_COLORS[point.kind]}
          depthTest={false}
          depthWrite={false}
          transparent
          // toneMapped off keeps the four hues exactly the values above
          // rather than whatever the renderer's tone curve makes of them —
          // these are chrome, not lit surfaces.
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
