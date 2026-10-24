import type { Board } from './types';
import type { Vec3 } from './frames';
import { partsBounds } from './worldBounds';
import { DRAW_EPS, FRONT, SIDE, TOP, type CapDrawing, type Drawing, type P2, type Seg2, type View } from './drawing';
import { sectionAxisIndex, type Section, type SectionAxis } from './section';
import { formatLength, type Units } from '../units/length';

/** Section views on the Plans sheet (section views spec §2.3–2.4): the view, title, cutting line and hatches. Pure. */

const STANDARD: Readonly<Record<SectionAxis, View>> = { front: FRONT, side: SIDE, top: TOP };
const OPPOSITE: Readonly<Record<SectionAxis, string>> = { front: 'Back', side: 'Left side', top: 'Underside' };
/** Negation without -0, so the views compare cleanly. */
const neg = (v: readonly number[]): Vec3 => [v[0] === 0 ? 0 : -v[0]!, v[1] === 0 ? 0 : -v[1]!, v[2] === 0 ? 0 : -v[2]!];

/** Seen from the removed side into the kept wood: the standard view, or (flipped) its proper opposite (right × up = toward). */
export function sectionViewOf(s: Section): View {
  const v = STANDARD[s.axis];
  if (!s.flip) return v;
  return s.axis === 'top'
    ? { ...v, toward: neg(v.toward), up: neg(v.up), title: OPPOSITE.top }
    : { ...v, toward: neg(v.toward), right: neg(v.right), title: OPPOSITE[s.axis] };
}

/** The ONE elevation that carries the cutting line (spec §2.4): one that sees the plane edge-on. */
export function markedView(s: Section): 'front' | 'top' {
  return s.axis === 'top' ? 'front' : 'top';
}

const AXIS_WORD: Readonly<Record<SectionAxis, string>> = { front: 'Front', side: 'Side', top: 'Plan' };
const REFERENCE: Readonly<Record<SectionAxis, string>> = { front: 'back', side: 'left', top: 'bottom' };
const LOOKING: Readonly<Record<SectionAxis, readonly [string, string]>> = {
  front: ['toward the back', 'toward the front'], side: ['toward the left', 'toward the right'], top: ['down', 'up'],
};

/** The section's heading (spec §2.3): measured from the assembled piece's own min along the axis — paper has no origin. */
export function sectionTitle(s: Section, parts: readonly Board[], units: Units): string {
  const k = sectionAxisIndex(s.axis);
  const lo = partsBounds(parts)?.min[k] ?? 0;
  return `Section A–A — ${AXIS_WORD[s.axis]} cut ${formatLength(s.at - lo, units)} from the ${REFERENCE[s.axis]}, looking ${LOOKING[s.axis][s.flip ? 1 : 0]}`;
}

export interface CuttingLine { a: P2; b: P2; sight: P2 }
const dot = (p: readonly number[], v: readonly number[]) => p[0]! * v[0]! + p[1]! * v[1]! + p[2]! * v[2]!;

/** The cutting line across `view`'s drawing `d` (drawing coordinates, before the panel's overrun) and the unit direction
 *  of sight in that view (−toward of the section's view), or null when `view` does not see the plane edge-on or the plane
 *  lies off the piece. */
export function cuttingLine(s: Section, view: View, d: Drawing): CuttingLine | null {
  const k = sectionAxisIndex(s.axis);
  if (Math.abs(view.toward[k]!) > DRAW_EPS) return null;
  const sv = sectionViewOf(s);
  const sight: P2 = [-dot(sv.toward, view.right) || 0, -dot(sv.toward, view.up) || 0];
  // A plane off the piece draws no line (review M2): it would land in the dimension bands or over another view.
  const off = (v: number, i: 0 | 1) => v < d.bounds.min[i] - DRAW_EPS || v > d.bounds.max[i] + DRAW_EPS;
  if (Math.abs(view.right[k]!) > DRAW_EPS) {
    const x = s.at * view.right[k]!;
    return off(x, 0) ? null : { a: [x, d.bounds.min[1]], b: [x, d.bounds.max[1]], sight };
  }
  const y = s.at * view.up[k]!;
  return off(y, 1) ? null : { a: [d.bounds.min[0], y], b: [d.bounds.max[0], y], sight };
}

export type Hatch = 0 | 1 | 2 | 3;
/** SVG user units (≈ 0.72 px at print width): 4 ≈ 3 px, 8 ≈ 6 px. */
export const HATCHES: readonly { angle: number; gap: number }[] = [
  { angle: 45, gap: 4 }, { angle: 135, gap: 4 }, { angle: 45, gap: 8 }, { angle: 135, gap: 8 },
];

const onSeg = (p: P2, s: Seg2) => {
  const dx = s.b[0] - s.a[0];
  const dy = s.b[1] - s.a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - s.a[0]) * dx + (p[1] - s.a[1]) * dy) / l2));
  return Math.hypot(p[0] - (s.a[0] + t * dx), p[1] - (s.a[1] + t * dy)) <= DRAW_EPS;
};
type Box2 = { min: P2; max: P2 };
const segBox = (s: Seg2): Box2 => ({
  min: [Math.min(s.a[0], s.b[0]) - DRAW_EPS, Math.min(s.a[1], s.b[1]) - DRAW_EPS],
  max: [Math.max(s.a[0], s.b[0]) + DRAW_EPS, Math.max(s.a[1], s.b[1]) + DRAW_EPS],
});
const meets = (p: Box2, q: Box2) => p.min[0] <= q.max[0] && q.min[0] <= p.max[0] && p.min[1] <= q.max[1] && q.min[1] <= p.max[1];
const boxOf = (segs: readonly Seg2[]): Box2 => segs.map(segBox).reduce((p, q) => ({
  min: [Math.min(p.min[0], q.min[0]), Math.min(p.min[1], q.min[1])], max: [Math.max(p.max[0], q.max[0]), Math.max(p.max[1], q.max[1])],
}));
/** Outlines meet (within DRAW_EPS). Boxes first (review M1): a drilled cap's outline has thousands of segments, and a
 *  pair compare blocked the sheet for seconds; only the segments inside the other cap's box are compared. */
const touching = (x: CapDrawing, y: CapDrawing, bx: Box2, by: Box2) => {
  if (!meets(bx, by)) return false;
  const xs = x.outline.filter((s) => meets(segBox(s), by));
  const ys = y.outline.filter((t) => meets(segBox(t), bx));
  return xs.some((s) => ys.some((t) => onSeg(s.a, t) || onSeg(s.b, t) || onSeg(t.a, s) || onSeg(t.b, s)));
};

/** One hatch per part (spec §2.3): in drawing order, the first its touching neighbours have not used (four never run
 *  out on rectangular parts; a fifth falls back to the first — a recorded residue). */
export function hatchPatterns(caps: readonly CapDrawing[]): Map<string, Hatch> {
  const out = new Map<string, Hatch>();
  const boxes = caps.map((c) => (c.outline.length > 0 ? boxOf(c.outline) : null));
  caps.forEach((c, i) => {
    const used = new Set(caps.slice(0, i)
      .filter((o, j) => boxes[i] && boxes[j] && touching(c, o, boxes[i]!, boxes[j]!)).map((o) => out.get(o.part)));
    out.set(c.part, ([0, 1, 2, 3] as const).find((n) => !used.has(n)) ?? 0);
  });
  return out;
}
