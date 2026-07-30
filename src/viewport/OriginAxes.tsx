import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { SCENE_EXTENT } from './extent';

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
 * Opacity for the positive and negative half of each axis. The negative half
 * is dimmer, which is what distinguishes the two directions.
 *
 * This was dashed at 1.5in dash/gap, and that was the cause of the reported
 * "segments cut in and out randomly" as the camera moved. LineDashedMaterial
 * measures its pattern in WORLD units, so a 3in dash+gap pair shrinks toward
 * sub-pixel as the axis recedes; past roughly 200in the pattern lands on and
 * off pixel centres and the line breaks up differently on every frame. It was
 * never an occlusion or depth problem — verified by toggling both grid
 * visibility and the axes' depthTest, neither of which changed anything.
 *
 * Opacity carries the same "which way is positive" information with nothing
 * that can alias: the geometry is one continuous segment per half-axis.
 */
const POSITIVE_OPACITY = 0.9;
/**
 * Not lower than this: at the default camera the positive halves run toward
 * the viewer and leave the frame within a few pixels of the origin, so the
 * negative halves are the ones actually on screen. Dim enough to read as
 * "behind the origin", strong enough to still be the visible axis.
 */
const NEGATIVE_OPACITY = 0.45;

type Axis = keyof typeof AXIS_COLOR;

/** A point `distance` along `axis`, lifted if it lies in the ground plane. */
function point(axis: Axis, distance: number): THREE.Vector3 {
  if (axis === 'x') return new THREE.Vector3(distance, GROUND_LIFT, 0);
  if (axis === 'z') return new THREE.Vector3(0, GROUND_LIFT, distance);
  return new THREE.Vector3(0, distance, 0);
}

/**
 * Axis lines through the world origin: full strength in the positive
 * direction, dimmed in the negative, so both the origin and the sense of each
 * axis read at a glance.
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
          lineWidth={positive ? 1.6 : 1.2}
          transparent
          opacity={positive ? POSITIVE_OPACITY : NEGATIVE_OPACITY}
          depthWrite={false}
          renderOrder={3}
          raycast={() => null}
        />
      ))}
    </>
  );
}
