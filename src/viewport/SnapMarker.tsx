import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { SnapKind, SnapPoint } from '../document/document';
import { screenPixelsPerInch } from './screenScale';

/**
 * Marker colour by kind. These are OFF-PALETTE on purpose, with the user's
 * explicit approval, and that is worth defending rather than quietly fixing:
 * CLAUDE.md records brass (#c99a4e) as "the one live colour in the app."
 *
 * An inference marker is transient chrome, not part of the model, and it has
 * exactly one job — telling you which KIND of point you are about to snap to,
 * before you commit. Shape cannot carry that at the ~9px a marker has to be to
 * sit on a corner without hiding it. Hue can.
 *
 * All three are cool and saturated against a palette that is entirely warm and
 * desaturated (ground #e6e3dd, grid #c6c1b8/#958f84, brass #c99a4e), so they
 * read as not-part-of-the-model rather than as a clashing member of it. The
 * hues are spread far enough apart to stay mutually distinct, and they echo
 * SketchUp's own endpoint/midpoint convention closely enough to be read
 * without a legend — muted well below SketchUp's pure primaries, which would
 * look like error states here.
 *
 * Browser-settled in the sense of follow-up 60: verified against pine, walnut
 * and plywood on this app's own ground, not argued from theory.
 */
export const SNAP_COLORS: Record<SnapKind, string> = {
  corner: '#2e9e5b',
  'edge-mid': '#22b8d4',
  'face-center': '#8a5fd0',
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
 */
export function SnapMarker({ point }: { point: SnapPoint }) {
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
      <mesh renderOrder={MARKER_RENDER_ORDER + 1} raycast={() => null}>
        <circleGeometry args={[MARKER_PX / 2, SEGMENTS]} />
        <meshBasicMaterial
          color={SNAP_COLORS[point.kind]}
          depthTest={false}
          depthWrite={false}
          transparent
          // toneMapped off keeps the three hues exactly the values above
          // rather than whatever the renderer's tone curve makes of them —
          // these are chrome, not lit surfaces.
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
