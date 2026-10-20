import type { Drawing, P2, Seg2 } from '../document/drawing';
import { labelHeight, labelWidth, packRow } from './diagramLabels';
import { ISO_MARGIN, ISO_MAX_HEIGHT, MAX_PLAN_SCALE, PLAN_WIDTH, TRIO_MAX_HEIGHT, type Placement } from './planLayout';

/**
 * Part balloons on the Plans sheet's exploded view (plans balloons spec §3): one balloon per cut-list row, in a column
 * left or right of the figure, with a leader to a point on a line DRAWN for one of the row's parts. Pure arithmetic;
 * `ExplodedFigure` draws what this returns.
 */

/** Clearance between a balloon's number box and its circle. */
export const BALLOON_PAD = 4;
/** Between two balloons in a column. */
export const BALLOON_GAP = 6;
/** Between a column and the drawing: room for a leader to turn toward its anchor. */
export const COLUMN_CLEAR = 24;

export interface BalloonRow { number: number; boardIds: readonly string[] }
export type BalloonSide = 'left' | 'right';
/** A row's anchor, in DRAWING coordinates. */
export interface Anchor { number: number; side: BalloonSide; at: P2 }
export interface Anchors { anchors: Anchor[]; hidden: number[] }
/**
 * A placed balloon, in SVG coordinates: its centre, the ELBOW its leader turns at, and the anchor it ends on. The leader
 * runs level from the circle to the elbow — in the COLUMN_CLEAR strip between the column and the drawing — then straight
 * to the anchor, so it never passes through another balloon of its column (final review #1: a straight leader from a
 * cascaded balloon cut through its neighbours).
 */
export interface PlacedBalloon { number: number; side: BalloonSide; centre: P2; elbow: P2; anchor: P2 }
export interface BalloonLayout {
  scale: number; width: number; height: number; at: Placement;
  radius: number; placed: PlacedBalloon[]; unplaced: number[];
}

const length = (s: Seg2) => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);

/**
 * Each row's anchor (§3.1): among its parts, the one with the most visible line (a tie: the first listed); the midpoint
 * of that part's longest visible segment (a tie: the first drawn). A row with no visible segment is `hidden`; a row with
 * no parts at all (an edging strip row, edge banding spec §4.2) is skipped, neither anchored nor hidden. A
 * zero-length segment adds nothing to a total and loses to any real one, so it can never be the anchor.
 */
export function anchorsFor(d: Drawing, rows: readonly BalloonRow[]): Anchors {
  const byPart = new Map<string, Seg2[]>();
  for (const s of d.visible) {
    const list = byPart.get(s.part);
    if (list) list.push(s);
    else byPart.set(s.part, [s]);
  }
  const midX = (d.bounds.min[0] + d.bounds.max[0]) / 2;
  const anchors: Anchor[] = [];
  const hidden: number[] = [];
  for (const row of rows) {
    if (row.boardIds.length === 0) continue; // a strip row draws no part (edge banding spec §4.2): no balloon, not hidden
    let best: Seg2[] | null = null;
    let bestLength = 0;
    for (const id of row.boardIds) {
      const segs = byPart.get(id);
      if (!segs) continue;
      const total = segs.reduce((t, s) => t + length(s), 0);
      if (total > bestLength) { best = segs; bestLength = total; }
    }
    if (!best) { hidden.push(row.number); continue; }
    let longest = best[0]!;
    for (const s of best) if (length(s) > length(longest)) longest = s;
    const at: P2 = [(longest.a[0] + longest.b[0]) / 2, (longest.a[1] + longest.b[1]) / 2];
    anchors.push({ number: row.number, side: at[0] < midX ? 'left' : 'right', at });
  }
  return { anchors, hidden };
}

/** One radius for every balloon on a figure: the widest number's measured box, plus the pad (inv 19). */
export function balloonRadius(anchors: readonly Anchor[]): number {
  const widest = Math.max(0, ...anchors.map((a) => labelWidth(String(a.number))));
  return Math.max(widest, labelHeight()) / 2 + BALLOON_PAD;
}

/**
 * The exploded figure's layout with its balloon columns (§3.2–3.4). With no balloons this IS `layoutSingle` (same
 * scale, size and placement). A column exists only on a side with balloons; the drawing scales down to make room.
 * The figure grows past ISO_MAX_HEIGHT only for a column that needs it, up to TRIO_MAX_HEIGHT; rows past that are
 * `unplaced` (the lowest anchors in their column), listed in the figure's note.
 */
export function layoutBalloons(d: Drawing, plan: Anchors): BalloonLayout {
  const w = d.bounds.max[0] - d.bounds.min[0];
  const h = d.bounds.max[1] - d.bounds.min[1];
  const radius = balloonRadius(plan.anchors);
  const column = 2 * radius + COLUMN_CLEAR;
  const count = (side: BalloonSide) => plan.anchors.filter((a) => a.side === side).length;
  const left = count('left') > 0 ? column : 0;
  const right = count('right') > 0 ? column : 0;
  const byW = w > 0 ? (PLAN_WIDTH - 2 * ISO_MARGIN - left - right) / w : Infinity;
  const byH = h > 0 ? ISO_MAX_HEIGHT / h : Infinity;
  const scale = Math.min(byW, byH, MAX_PLAN_SCALE);
  const drawnH = h * scale;
  const pitch = 2 * radius + BALLOON_GAP;
  const need = (n: number) => (n > 0 ? n * pitch - BALLOON_GAP : 0);
  const contentH = Math.min(TRIO_MAX_HEIGHT - 2 * ISO_MARGIN, Math.max(drawnH, need(count('left')), need(count('right'))));
  const at: Placement = { x: ISO_MARGIN + left, y: ISO_MARGIN + (contentH - drawnH) / 2 };
  const width = 2 * ISO_MARGIN + left + w * scale + right;
  const height = 2 * ISO_MARGIN + contentH;
  const toSvg = (p: P2): P2 => [at.x + (p[0] - d.bounds.min[0]) * scale, at.y + (d.bounds.max[1] - p[1]) * scale];
  const fit = Math.max(0, Math.floor((contentH + BALLOON_GAP) / pitch));

  const placed: PlacedBalloon[] = [];
  const unplaced: number[] = [];
  for (const side of ['left', 'right'] as const) {
    const col = plan.anchors
      .filter((a) => a.side === side)
      .map((a) => ({ a, svg: toSvg(a.at) }))
      .sort((p, q) => p.svg[1] - q.svg[1] || p.a.number - q.a.number);
    const kept = col.slice(0, fit);
    for (const x of col.slice(fit)) unplaced.push(x.a.number);
    const ys = packRow(kept.map((x) => ({ centre: x.svg[1], width: 2 * radius })), ISO_MARGIN, ISO_MARGIN + contentH, BALLOON_GAP);
    const cx = side === 'left' ? ISO_MARGIN + radius : width - ISO_MARGIN - radius;
    const ex = side === 'left' ? ISO_MARGIN + 2 * radius + COLUMN_CLEAR / 2 : width - ISO_MARGIN - 2 * radius - COLUMN_CLEAR / 2;
    kept.forEach((x, i) => placed.push({ number: x.a.number, side, centre: [cx, ys[i]!], elbow: [ex, ys[i]!], anchor: x.svg }));
  }
  unplaced.sort((a, b) => a - b);
  return { scale, width, height, at, radius, placed, unplaced };
}

/** `7, 9` / `33–36, 40, 41`: runs of three or more collapse with an en dash. */
export function numberList(ns: readonly number[]): string {
  const sorted = [...new Set(ns)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j += 1;
    if (j - i >= 2) out.push(`${sorted[i]}–${sorted[j]}`);
    else for (let k = i; k <= j; k += 1) out.push(String(sorted[k]));
    i = j + 1;
  }
  return out.join(', ');
}
