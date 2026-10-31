import { useMemo } from 'react';
import { Line, Html } from '@react-three/drei';
import { useStore } from '../store/store';
import { isCovered, worldParts } from '../document/document';
import { DIM_EPS, dimensionValue, resolveAnchor } from '../document/placedDims';
import { formatLength } from '../units/length';

/** The colour is the CSS token `--dim-placed` (styles.css), read once; the fallback only serves a DOM without styles. */
function placedColor(): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--dim-placed').trim();
    return v || '#d9822b';
  } catch {
    return '#d9822b';
  }
}

const TICK = 0.5;
// Hoisted: nothing allocated per render may reach drei (its Line rebuilds geometry on a new `points`).
const noRaycast = () => null;
const COMMON = { depthTest: false, depthWrite: false, transparent: true, toneMapped: false, renderOrder: 9, raycast: noRaycast } as const;
type P = [number, number, number];

interface Drawn {
  id: string;
  seg: [P, P];
  legPts: [P, P];
  value: number;
  ticks: [P, P][];
  mid: P;
  leg: boolean;
}

/**
 * Placed dimensions in the viewport (placed-dimensions spec §4): the segment A to A' (A with B's coordinate on the axis),
 * a dashed leg A' to B when they differ, a tick across each end of the segment, and the value at its midpoint.
 * Mounted under `explode === 0` only, and NOT under the Guides toggle. Skipped when detached or when an anchor's part is
 * hidden (draw-only, inv 43: the hidden set is filtered in a memo, never in a selector). Not a raycast target and not a
 * snap source (`raycast={() => null}`; the label is `pointer-events: none`). The section cut does not clip it.
 */
export function PlacedDims() {
  const doc = useStore((s) => s.doc);
  const hiddenIds = useStore((s) => s.hiddenIds);
  const hovered = useStore((s) => s.hoveredDimension);
  const color = useMemo(placedColor, []);

  const drawn = useMemo<Drawn[]>(() => {
    const parts = worldParts(doc);
    const hidden = new Set(hiddenIds);
    const out: Drawn[] = [];
    for (const d of doc.dimensions) {
      if (hidden.size > 0 && [d.a, d.b].some((x) => 'part' in x && isCovered(x.part, hidden))) continue;
      const value = dimensionValue(parts, d);
      const a = resolveAnchor(parts, d.a);
      const b = resolveAnchor(parts, d.b);
      if (value === null || !a || !b) continue;
      const i = d.axis === 'x' ? 0 : d.axis === 'y' ? 1 : 2;
      const a2: P = [a[0], a[1], a[2]];
      a2[i] = b[i];
      // A tick runs across the segment along a world axis other than its own.
      const j = i === 1 ? 0 : 1;
      const tick = (p: P): [P, P] => {
        const lo: P = [p[0], p[1], p[2]];
        const hi: P = [p[0], p[1], p[2]];
        lo[j] -= TICK / 2;
        hi[j] += TICK / 2;
        return [lo, hi];
      };
      out.push({
        id: d.id, seg: [a, a2], legPts: [a2, b], value,
        ticks: [tick(a), tick(a2)],
        mid: [(a[0] + a2[0]) / 2, (a[1] + a2[1]) / 2, (a[2] + a2[2]) / 2],
        leg: Math.hypot(a2[0] - b[0], a2[1] - b[1], a2[2] - b[2]) > DIM_EPS,
      });
    }
    return out;
  }, [doc, hiddenIds]);

  return (
    <>
      {drawn.map((d) => {
        const on = hovered === d.id;
        const width = on ? 3 : 1.6;
        return (
          <group key={d.id}>
            <Line points={d.seg} lineWidth={width} color={color} {...COMMON} />
            {d.ticks.map((t, k) => <Line key={k} points={t} lineWidth={width} color={color} {...COMMON} />)}
            {d.leg && <Line points={d.legPts} lineWidth={on ? 2 : 1} dashed dashSize={0.4} gapSize={0.4} color={color} {...COMMON} />}
            <Html position={d.mid} center className={on ? 'dim-label dim-label-hover' : 'dim-label'} style={{ pointerEvents: 'none' }}>
              {formatLength(d.value, doc.units)}
            </Html>
          </group>
        );
      })}
    </>
  );
}
