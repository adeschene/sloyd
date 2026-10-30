import { useMemo, useRef } from 'react';
import { Line } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { LineMaterial } from 'three-stdlib';
import { isGuideLine } from '../document/document';
import type { TapeAxis } from '../document/document';
import { useStore } from '../store/store';
import { SCENE_EXTENT } from './extent';
import { AXIS_COLOR, GROUND_LIFT } from './OriginAxes';
import { dashScaleForScreenPeriod, screenPixelsPerInch } from './screenScale';
import type { Vec3 } from './snapPick';

const ORIGIN = new THREE.Vector3(0, 0, 0);

/**
 * Dash and gap in inches before dashScale rescales them (see OriginAxes: the
 * pattern must be held at a constant length ON SCREEN every frame, or dashes
 * shrink to sub-pixel with distance and flicker — a real bug there).
 */
const DASH_SIZE = 1;
const GAP_SIZE = 1;
const PATTERN_LENGTH = DASH_SIZE + GAP_SIZE;

// Builder's values, for the user to judge by eye. A placed line is quieter
// than the origin axes; the preview (the line Enter is about to create) is
// stronger, in the way a hovered marker is stronger than a resting one.
const PLACED_OPACITY = 0.55;
const PREVIEW_OPACITY = 0.9;

/**
 * One construction line, `±SCENE_EXTENT` along `axis` through `at` (construction-lines
 * spec §3.5). Dashed in the axis hue (AXIS_COLOR, shared with OriginAxes so the two
 * cannot drift). Depth-tested and not clipped by the section plane, like the guide
 * markers; never a click target (inv 21 — the Line raycast threshold is a bad hit
 * target, and a line is removed from the Guides list).
 */
export function ConstructionLine({ at, axis, preview }: { at: Vec3; axis: TapeAxis; preview?: boolean }) {
  const index = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  const points = useMemo(() => {
    // Lifted off the ground plane exactly as OriginAxes lifts its ground axes, so a
    // line at y = 0 wins the depth test against the grid and shadow receiver.
    const y = axis !== 'y' && at[1] < GROUND_LIFT ? GROUND_LIFT : at[1];
    const a = new THREE.Vector3(at[0], y, at[2]);
    const b = a.clone();
    a.setComponent(index, -SCENE_EXTENT);
    b.setComponent(index, SCENE_EXTENT);
    return [a, b] as [THREE.Vector3, THREE.Vector3];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at[0], at[1], at[2], axis, index]);

  const material = useRef<LineMaterial | null>(null);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3 } | null;
  useFrame(() => {
    if (!material.current) return;
    material.current.dashScale = dashScaleForScreenPeriod(
      PATTERN_LENGTH,
      screenPixelsPerInch(camera, controls ? controls.target : ORIGIN, size.height),
    );
  });

  return (
    <Line
      points={points}
      color={AXIS_COLOR[axis]}
      lineWidth={preview ? 1.6 : 1.2}
      transparent
      opacity={preview ? PREVIEW_OPACITY : PLACED_OPACITY}
      depthWrite={false}
      renderOrder={3}
      raycast={() => null}
      dashed
      dashSize={DASH_SIZE}
      gapSize={GAP_SIZE}
      ref={(line) => { material.current = (line?.material as LineMaterial | undefined) ?? null; }}
    />
  );
}

/** Every construction line in the document, drawn whenever guides are shown. */
export function GuideLines() {
  const guides = useStore((s) => s.doc.guides);
  const lines = useMemo(() => guides.filter(isGuideLine), [guides]);
  return (
    <>
      {lines.map((g) => (
        <ConstructionLine key={g.id} at={g.at} axis={g.axis} />
      ))}
    </>
  );
}
