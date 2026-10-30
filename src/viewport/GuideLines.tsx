import { useCallback, useMemo, useRef } from 'react';
import { Line } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { LineMaterial } from 'three-stdlib';
import { isAnyLine, lineDir, lineSpan, newLineOf } from '../document/document';
import type { NewLine } from '../document/document';
import { useStore } from '../store/store';
import { visibleGuides } from '../store/visibility';
import { SCENE_EXTENT } from './extent';
import { AXIS_COLOR, GROUND_LIFT } from './OriginAxes';
import { dashScaleForScreenPeriod, screenPixelsPerInch } from './screenScale';

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
const PLACED_WIDTH = 1.2;
const PREVIEW_WIDTH = 1.6;
// A SELECTED line (selectable-guides spec §6): full opacity and heavier than the preview, still dashed. For the user to
// judge by eye.
const SELECTED_OPACITY = 1;
const SELECTED_WIDTH = 2.4;

// An oblique line has no axis hue; a neutral violet-grey, distinct from the three axis colours. For the user to judge by eye.
export const OBLIQUE_COLOR = '#8a7fb0';

/**
 * One construction line (construction-lines spec §5; oblique lines: construction-lines-2 spec §2.5). An AXIS line runs
 * `±SCENE_EXTENT` along its axis through `at`, dashed in the axis hue (AXIS_COLOR, shared with OriginAxes so the two
 * cannot drift). An oblique line runs the part of it inside that box (`lineSpan`; none, if it misses), in
 * OBLIQUE_COLOR. An oblique line lying wholly on the ground (both points at y = 0) is lifted by GROUND_LIFT at both ends,
 * the same display-only rule as an axis line at y = 0 (round 1's Amended B3; spec §2.5: every other rule is round 1's). Depth-tested and not clipped by the section plane, like the guide markers.
 * Never a RAYCAST target (`raycast={() => null}`): the Line raycast threshold is a bad hit target (inv 21's lesson).
 * Selection is a SCREEN-SPACE pick instead, by pixel distance to the projected line (`GuidePicker`, `pickGuide`;
 * selectable-guides spec §2). `selected` draws it emphasised (spec §6).
 */
export function ConstructionLine({ line, preview, selected }: { line: NewLine; preview?: boolean; selected?: boolean }) {
  const axis = 'axis' in line ? line.axis : undefined;
  const to = 'to' in line ? line.to : undefined;
  const points = useMemo(() => {
    if (axis === undefined) {
      const span = lineSpan({ at: line.at, to: to! }, SCENE_EXTENT);
      if (!span) return null;
      const u = lineDir({ at: line.at, to: to! });
      const end = (t: number) => new THREE.Vector3(line.at[0] + t * u[0], line.at[1] + t * u[1], line.at[2] + t * u[2]);
      const [p0, p1] = [end(span[0]), end(span[1])];
      // Display only: a line on the ground plane would z-fight the grid and shadow receiver (round 1's B3, as for axis lines).
      if (line.at[1] === 0 && to![1] === 0) {
        p0.y = GROUND_LIFT;
        p1.y = GROUND_LIFT;
      }
      return [p0, p1] as [THREE.Vector3, THREE.Vector3];
    }
    const index = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    // Lifted off the ground plane exactly as OriginAxes lifts its ground axes, so a
    // line at y = 0 wins the depth test against the grid and shadow receiver.
    const y = axis !== 'y' && line.at[1] === 0 ? GROUND_LIFT : line.at[1];
    const a = new THREE.Vector3(line.at[0], y, line.at[2]);
    const b = a.clone();
    a.setComponent(index, -SCENE_EXTENT);
    b.setComponent(index, SCENE_EXTENT);
    return [a, b] as [THREE.Vector3, THREE.Vector3];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line.at[0], line.at[1], line.at[2], axis, to?.[0], to?.[1], to?.[2]]);

  const material = useRef<LineMaterial | null>(null);
  const setLine = useCallback((line: { material: unknown } | null) => {
    material.current = (line?.material as LineMaterial | undefined) ?? null;
  }, []);
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

  if (!points) return null;
  return (
    <Line
      points={points}
      color={axis === undefined ? OBLIQUE_COLOR : AXIS_COLOR[axis]}
      lineWidth={selected ? SELECTED_WIDTH : preview ? PREVIEW_WIDTH : PLACED_WIDTH}
      transparent
      opacity={selected ? SELECTED_OPACITY : preview ? PREVIEW_OPACITY : PLACED_OPACITY}
      depthWrite={false}
      renderOrder={3}
      raycast={() => null}
      dashed
      dashSize={DASH_SIZE}
      gapSize={GAP_SIZE}
      ref={setLine}
    />
  );
}

/**
 * Every construction line in the document that is not HIDDEN, drawn whenever guides are shown (hidden: through
 * `visibleGuides`, in the memo, never a selector; selectable-guides spec §3.5). A selected one is drawn emphasised.
 */
export function GuideLines({ emphasise }: { emphasise: boolean }) {
  const guides = useStore((s) => s.doc.guides);
  const hiddenGuideIds = useStore((s) => s.hiddenGuideIds);
  const selectedGuideIds = useStore((s) => s.selectedGuideIds);
  const lines = useMemo(() => visibleGuides(guides, hiddenGuideIds).filter(isAnyLine), [guides, hiddenGuideIds]);
  // None in the capture's clean frame (`emphasise` false): a selected look is chrome, as a part's is.
  const selected = useMemo(() => new Set(emphasise ? selectedGuideIds : []), [emphasise, selectedGuideIds]);
  return (
    <>
      {lines.map((g) => (
        <ConstructionLine key={g.id} line={newLineOf(g)} selected={selected.has(g.id)} />
      ))}
    </>
  );
}
