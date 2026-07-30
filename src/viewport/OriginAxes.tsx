import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

/**
 * How far the axes run, in inches. Matches SHADOW_EXTENT in Viewport — the
 * same ten-foot working volume. Finite on purpose: an infinite axis outruns
 * the grid's own fade and reads as a stray line across an empty sky.
 */
const AXIS_EXTENT = 120;

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

/** Inches. Long enough to read as "dashed" at furniture scale. */
const DASH_SIZE = 1.5;
const GAP_SIZE = 1.5;

type Axis = keyof typeof AXIS_COLOR;

/** A point `distance` along `axis`, lifted if it lies in the ground plane. */
function point(axis: Axis, distance: number): THREE.Vector3 {
  if (axis === 'x') return new THREE.Vector3(distance, GROUND_LIFT, 0);
  if (axis === 'z') return new THREE.Vector3(0, GROUND_LIFT, distance);
  return new THREE.Vector3(0, distance, 0);
}

/**
 * Axis lines through the world origin: solid in the positive direction,
 * dashed in the negative, so both the origin and the sense of each axis read
 * at a glance.
 */
export function OriginAxes() {
  const segments = useMemo(() => {
    const axes: Axis[] = ['x', 'y', 'z'];
    return axes.flatMap((axis) =>
      ([1, -1] as const).map((sign) => {
        const geometry = new THREE.BufferGeometry().setFromPoints([
          point(axis, 0),
          point(axis, AXIS_EXTENT * sign),
        ]);
        // A dashed material measures its dashes along the line via the
        // geometry's `lineDistance` attribute, which computeLineDistances
        // lives on THREE.Line/LineSegments, not BufferGeometry — so this
        // wraps the geometry just long enough to compute it. Without this
        // step the attribute is missing and the dashes never appear.
        new THREE.LineSegments(geometry).computeLineDistances();
        return { key: `${axis}${sign}`, axis, positive: sign > 0, geometry };
      }),
    );
  }, []);

  // Same discipline as BoardMesh's edge geometry: built once, disposed on
  // unmount, never constructed inline where it would leak on every render.
  useEffect(
    () => () => segments.forEach((s) => s.geometry.dispose()),
    [segments],
  );

  return (
    <>
      {segments.map(({ key, axis, positive, geometry }) => (
        // renderOrder 3 puts these after the grid (0) and the shadow
        // receiver (2), so they draw over the grid lines they cross rather
        // than being painted over by them. raycast is disabled explicitly:
        // an axis must never be a click target, for the same
        // belt-and-braces reason the shadow plane says so.
        <lineSegments key={key} geometry={geometry} renderOrder={3} raycast={() => null}>
          {positive ? (
            <lineBasicMaterial
              color={AXIS_COLOR[axis]}
              depthWrite={false}
              transparent
              opacity={0.9}
            />
          ) : (
            <lineDashedMaterial
              color={AXIS_COLOR[axis]}
              dashSize={DASH_SIZE}
              gapSize={GAP_SIZE}
              depthWrite={false}
              transparent
              opacity={0.55}
            />
          )}
        </lineSegments>
      ))}
    </>
  );
}
