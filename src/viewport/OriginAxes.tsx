import { useMemo, useRef } from 'react';
import { Line } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { LineMaterial } from 'three-stdlib';
import { SCENE_EXTENT } from './extent';
import { dashScaleForScreenPeriod, screenPixelsPerInch } from './screenScale';

/** Reused rather than allocated per frame in the dash-scale frame loop. */
const ORIGIN = new THREE.Vector3(0, 0, 0);

/**
 * How far the axes run, in inches. Shares SCENE_EXTENT with SHADOW_EXTENT in
 * Viewport — the same ten-foot working volume — rather than a local literal,
 * so the two cannot drift apart. Finite on purpose: an infinite axis outruns
 * the grid's own fade and reads as a stray line across an empty sky.
 */
const AXIS_EXTENT = SCENE_EXTENT;

/**
 * Lift for the two ground axes, in inches. They are coplanar with both the
 * grid and the shadow receiver at y=0, and polygonOffset — the fix used for
 * the shadow plane — does not apply to lines. 1/64" is visually zero at any
 * usable zoom and enough to win the depth test outright.
 *
 * Lifting rather than disabling depthTest is what keeps occlusion correct: a
 * board resting on the ground spans y=0 upward, so it hides the axis running
 * underneath it instead of having the axis bleed through it.
 */
const GROUND_LIFT = 1 / 64;

/**
 * three.js convention — red X, green Y (up), blue Z — because that is what
 * the rest of the code speaks. Muted rather than saturated so they sit inside
 * the wood palette instead of shouting over it.
 */
const AXIS_COLOR = { x: '#b6483c', y: '#4e8b46', z: '#3f6ea8' } as const;

/**
 * The negative half of each axis is dashed and slightly dimmer, so "behind the
 * origin" reads two ways at once.
 *
 * The dashes are the part with history. A first attempt used
 * LineDashedMaterial on native lines with a fixed 1.5in dash and gap, and that
 * caused the reported "segments cut in and out randomly": the pattern is
 * measured in WORLD units, so it shrinks toward sub-pixel as the axis recedes
 * and then lands on and off pixel centres as the camera moves. It was never an
 * occlusion or depth problem — verified by toggling both grid visibility and
 * the axes' depthTest, neither of which changed anything.
 *
 * Dashes are viable here only because dashScale is recomputed every frame to
 * hold the pattern at a constant length ON SCREEN rather than in the world —
 * see dashScaleForScreenPeriod. Without that, this is the same bug again.
 */
const POSITIVE_OPACITY = 0.9;
const NEGATIVE_OPACITY = 0.7;

/**
 * Dash and gap, in inches, before dashScale rescales them. Their sum is the
 * pattern length the screen-space correction is computed against; the ratio is
 * what makes a dash and its gap equal length.
 */
const DASH_SIZE = 1;
const GAP_SIZE = 1;
const DASH_PATTERN_WORLD_LENGTH = DASH_SIZE + GAP_SIZE;

type Axis = keyof typeof AXIS_COLOR;

/** A point `distance` along `axis`, lifted if it lies in the ground plane. */
function point(axis: Axis, distance: number): THREE.Vector3 {
  if (axis === 'x') return new THREE.Vector3(distance, GROUND_LIFT, 0);
  if (axis === 'z') return new THREE.Vector3(0, GROUND_LIFT, distance);
  return new THREE.Vector3(0, distance, 0);
}

/**
 * Axis lines through the world origin: solid in the positive direction, dashed
 * and slightly dimmed in the negative, so both the origin and the sense of
 * each axis read at a glance.
 */
export function OriginAxes() {
  const segments = useMemo(() => {
    const axes: Axis[] = ['x', 'y', 'z'];
    return axes.flatMap((axis) =>
      ([1, -1] as const).map((sign) => ({
        key: `${axis}${sign}`,
        axis,
        positive: sign > 0,
        points: [point(axis, 0), point(axis, AXIS_EXTENT * sign)] as [
          THREE.Vector3,
          THREE.Vector3,
        ],
      })),
    );
  }, []);

  // The dashed halves, so the frame loop below can retune just those.
  const dashedMaterials = useRef<LineMaterial[]>([]);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3 } | null;

  // Hold the dash pattern at a fixed length on screen. Written straight to the
  // material uniforms rather than through props, because this changes on
  // essentially every frame and re-rendering React that often to set a number
  // would be wasteful — and because LineMaterial reads dashScale per draw
  // anyway.
  useFrame(() => {
    if (dashedMaterials.current.length === 0) return;
    const target = controls ? controls.target : ORIGIN;
    const scale = dashScaleForScreenPeriod(
      DASH_PATTERN_WORLD_LENGTH,
      screenPixelsPerInch(camera, target, size.height),
    );
    for (const material of dashedMaterials.current) {
      if (material) material.dashScale = scale;
    }
  });

  return (
    <>
      {segments.map(({ key, axis, positive, points }) => (
        // drei's <Line> rather than a native <lineSegments>: native GL lines
        // are always exactly one render-target pixel wide and ignore
        // `linewidth` entirely, so under the viewport's dpr floor of 2 they
        // downsample to half weight and the axes wash out. <Line> is
        // mesh-based (Line2), so lineWidth is a real, dpr-independent width.
        //
        // renderOrder 3 puts these after the grid (0) and the shadow receiver
        // (2), so they draw over the grid lines they cross rather than being
        // painted over. raycast is disabled explicitly: an axis must never be
        // a click target, for the same belt-and-braces reason the shadow plane
        // says so.
        <Line
          key={key}
          points={points}
          color={AXIS_COLOR[axis]}
          lineWidth={positive ? 1.6 : 1.3}
          transparent
          opacity={positive ? POSITIVE_OPACITY : NEGATIVE_OPACITY}
          depthWrite={false}
          renderOrder={3}
          raycast={() => null}
          dashed={!positive}
          dashSize={DASH_SIZE}
          gapSize={GAP_SIZE}
          ref={
            positive
              ? undefined
              : (line) => {
                  // Collect the dashed halves' materials for the frame loop.
                  // A null ref means unmount, so drop it rather than holding a
                  // disposed material.
                  const material = line?.material as LineMaterial | undefined;
                  dashedMaterials.current = dashedMaterials.current.filter(Boolean);
                  if (material && !dashedMaterials.current.includes(material)) {
                    dashedMaterials.current.push(material);
                  }
                }
          }
        />
      ))}
    </>
  );
}
