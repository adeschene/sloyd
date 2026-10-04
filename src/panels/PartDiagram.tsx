import { useId } from 'react';
import type { DiagramCut, DiagramView, Span } from '../document/document';
import { bandOn, fitView, DRAW_WIDTH } from './diagramScale';
import { labelWidth, labelHeight, packRow, LABEL_ASCENT, LABEL_SIZE } from './diagramLabels';

/** Stroke clearance above the outline. Nothing is DRAWN above it any more. */
const TOP = 4;
/** Clearance between the outline and the leader stack. */
const GAP = 16;
/** One stacked leader row per horizontal-axis cut. */
const ROW = 26;
/** The overall-length run along the bottom. */
const BOTTOM = 34;
/** Room to the right of the outline for the overall-width label. */
const RIGHT = 90;
/** Minimum clearance between two labels in a row (or column), and band-to-depth-label. */
const GAP_X = 8;
/** Half-length of a run's end tick. Runs abut, so without these the offset run
 *  and the band run fuse into one line and the offset label appears to measure
 *  to the far side of the cut. */
export const TICK = 4;
/** Clearance between a rotated column label's own box and its leader line. */
const COL_GAP = 6;
/** Clearance between the last leader column's tick marks and the outline. */
export const LEFT_PAD = 12;
/**
 * One leader column's width, DERIVED rather than hard-coded.
 *
 * A rotated label's box is `labelHeight()` wide (see the module doc comment on
 * `labelHeight` for why: ascent + descent become the ROTATED extent). A fixed
 * COL narrower than `labelHeight() + 2 * TICK + COL_GAP` would clip the very
 * thing it exists to hold — the tick marks need `2 * TICK`, the label needs
 * `labelHeight()`, and COL_GAP is the breathing room between the label and its
 * own line. (A first draft hard-coded COL = 26, which is less than
 * `labelHeight()` alone at 25 plus the ticks — the same "plan-supplied
 * constant that doesn't fit the geometry" shape as follow-up 64 and joinery's
 * lesson about code supplied verbatim.)
 */
const COL = labelHeight() + 2 * TICK + COL_GAP;
/** The full drawable interval — the viewBox, not the outline. */
const VIEW_W = DRAW_WIDTH + RIGHT;

/**
 * One measured run beside the outline. A cut's POSITION leader (offset run,
 * band, then depth with no run of its own) or, for a stopped cut, its STOP
 * leader in the other orientation (near-stop run, band, far-stop run) — the
 * stops measure along `across`, perpendicular to the position.
 *
 * Every string arrives from `buildDiagrams`; this formats nothing.
 */
interface Leader {
  key: string;
  /** Board inches along this leader's own axis. */
  span: Span;
  /** Labels the run from the outline's near edge to the band. Absent: no run is drawn. */
  before?: string;
  band: string;
  /** Labels the run from the band to the outline's far edge. Absent: no run is drawn. */
  after?: string;
  /** A label just past the band with no run of its own (depth). */
  trailing?: string;
}

const positionLeader = (cut: DiagramCut, span: Span): Leader => ({
  key: cut.id, span, before: cut.offsetLabel, band: cut.widthLabel, trailing: cut.depthLabel,
});

/** Null for a cut that is not stopped — `lengthLabel` is present exactly when it is. */
const stopLeader = (cut: DiagramCut, span: Span): Leader | null =>
  cut.lengthLabel === undefined
    ? null
    : { key: `${cut.id}-stop`, span, before: cut.stopMinLabel, band: cut.lengthLabel, after: cut.stopMaxLabel };

const present = <T,>(x: T | null): x is T => x !== null;

/**
 * A leader's labels in drawing order, each centred on what it measures. `lo`
 * and `hi` are the outline's edges on the leader's axis, `b` its band. The
 * position leader's three centres are exactly the ones this file used before
 * stops existed — the characterisation test pins that.
 */
const labelItems = (l: Leader, lo: number, hi: number, b: { start: number; size: number }) => {
  const items: { text: string; centre: number; width: number }[] = [];
  if (l.before !== undefined) {
    items.push({ text: l.before, centre: (lo + b.start) / 2, width: labelWidth(l.before) });
  }
  items.push({ text: l.band, centre: b.start + b.size / 2, width: labelWidth(l.band) });
  if (l.after !== undefined) {
    items.push({ text: l.after, centre: (b.start + b.size + hi) / 2, width: labelWidth(l.after) });
  }
  if (l.trailing !== undefined) {
    const w = labelWidth(l.trailing);
    items.push({ text: l.trailing, centre: b.start + b.size + GAP_X + w / 2, width: w });
  }
  return items;
};

/**
 * One view of a part, as a schematic.
 *
 * Formats NOTHING — every string arrives from `buildDiagrams`, which is the
 * rule `CutList.tsx` already follows and the reason display rounding lives in
 * one place.
 *
 * SVG rather than canvas: it prints as vectors at printer resolution, and both
 * fills — the hatch for an ordinary cut cell and the cross-hatch for a cell
 * where two cuts of differing depth overlap — are SVG `<pattern>` fills, which
 * are FOREGROUND content. A CSS background would be dropped whenever Chrome's
 * "Background graphics" is off — the existing print block already carries a
 * comment about that — and the crossing distinction would silently vanish on
 * a default print.
 *
 * NO TEXT HANGS OFF THE OUTLINE'S TOP OR BOTTOM EDGE THE WAY IT DID IN THE OLD
 * TOP/FAR BANDS. The leader rows and the overall-length run are still drawn
 * below the outline — that geometry is the point — but every number a cut
 * owns now lives in that cut's own stacked leader row (horizontal-axis cuts)
 * or leader column (vertical-axis cuts), which is what makes a collision
 * BETWEEN cuts impossible by construction — rows are ROW units apart
 * vertically and columns are COL units apart horizontally, so no arithmetic is
 * involved. Only the three labels WITHIN a row or column can collide, and
 * `packRow` settles those (follow-up 59).
 *
 * A row's labels pack along X, bounded by the viewBox width, which is already
 * generous (DRAW_WIDTH + RIGHT). A column's labels pack along Y instead, and
 * there is no equivalent headroom to assume — a sliver-clamped view can be as
 * short as the MIN_WIDTH floor. So a column's three labels are packed
 * UNBOUNDED (`packRow(..., top, Infinity, GAP_X)`) and the figure's overall
 * height grows to fit the deepest column, the same principle the
 * overall-width label already uses on the other axis (see the comment by
 * `viewW` below): the label overlapping something is a worse failure than the
 * figure being taller than its nominal size.
 *
 * Depth moved into the row (and, now, the column) for a better reason than the
 * collision that prompted it: depth runs PERPENDICULAR to this view. It has no
 * position on the page, so centring it on its band was never spatially
 * meaningful — placing it beside the band is honest about that.
 *
 * A STOPPED cut adds a second leader in the OTHER orientation — its stops
 * measure along `across`, which is perpendicular to its position — so a
 * stopped horizontal-axis cut gets a column and a stopped vertical-axis cut a
 * row. Leaders, not cuts, are what get a row or a column now; position leaders
 * come first, so a diagram with no stopped cut draws exactly as it did before
 * (pinned by the characterisation test, by layout hash).
 */
export function PartDiagram({ view }: { view: DiagramView }) {
  // A `<pattern>` id must be unique in the document: two diagrams sharing one
  // would leave the second silently reusing the first's fill.
  //
  // Stripped of punctuation on purpose. `useId` returns a value wrapped in
  // reserved characters (`:r0:`, and `«r0»` in React 19), and BOTH are unsafe
  // inside a `url(#...)` reference — the fragment stops parsing at the
  // punctuation and the fill silently resolves to nothing. jsdom will not
  // catch this: the attribute still starts with `url(#`, so a naive test
  // passes while a real browser draws an unhatched rect. Do not simplify this
  // back to a bare `useId()`. The cross-hatch pattern gets the same treatment
  // for the same reason.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const hatch = `hatch${uid}`;
  const cross = `cross${uid}`;
  const fit = fitView(view.h, view.v);

  const hCuts = view.cuts.filter((c) => c.axis === 'h');
  const vCuts = view.cuts.filter((c) => c.axis === 'v');
  // Position leaders first, in their existing order, so every unstopped
  // diagram draws exactly as before; a stopped cut's stop leader is appended
  // in the OTHER orientation (its stops run along `across`).
  const rowLeaders: Leader[] = [
    ...hCuts.map((c) => positionLeader(c, c.h)),
    ...vCuts.map((c) => stopLeader(c, c.h)).filter(present),
  ];
  const colLeaders: Leader[] = [
    ...vCuts.map((c) => positionLeader(c, c.v)),
    ...hCuts.map((c) => stopLeader(c, c.v)).filter(present),
  ];
  // The left gutter: one COL-wide column per vertical leader, plus a fixed
  // pad separating the last column's tick marks from the outline. Zero when
  // there are none, so a board with no vertical leaders draws exactly as it
  // did before this round.
  const left = COL * colLeaders.length + (colLeaders.length ? LEFT_PAD : 0);

  const top = TOP;
  const bottom = top + fit.drawnV;
  const leaders = bottom + GAP;

  // Column labels, packed UNBOUNDED (see the module doc comment for why no
  // upper bound is assumed here). Computed before `height` because `height`
  // has to grow to fit whichever column runs deepest.
  const columns = colLeaders.map((l, i) => {
    const b = bandOn(l.span, fit.sy, top, fit.drawnV);
    const items = labelItems(l, top, bottom, b);
    const ys = packRow(items, top, Infinity, GAP_X);
    return {
      l, b, items, ys,
      // Anchored at `fit.offsetX`, not 0 — under the shrink branch (a tall
      // narrow board) `offsetX` can be several hundred units, and the gutter
      // has to sit immediately left of the OUTLINE, not left of the viewBox's
      // own left edge, or the leader line points at empty space instead of
      // the board (found by mutation review: a 450-unit gap on a 24" x
      // 100-15/16" panel).
      x: fit.offsetX + COL * (i + 1) - TICK,
      labelX: fit.offsetX + COL * i + LABEL_ASCENT,
    };
  });
  // The figure grows to fit whichever column's LAST label runs deepest — the
  // depth label for a position column, the far stop (or band) for a stop column.
  const maxColumnBottom = columns.length
    ? Math.max(...columns.map((c) => c.ys[c.ys.length - 1] + c.items[c.items.length - 1].width / 2))
    : 0;

  const height = Math.max(leaders + ROW * rowLeaders.length + BOTTOM, maxColumnBottom + BOTTOM);
  const baseline = height - BOTTOM / 2;

  // The overall-width label always sits BESIDE the outline, never pulled back
  // across it. When the RIGHT gutter cannot hold the label, the viewBox grows
  // to make room rather than the label moving inward — the label overlapping
  // the drawing is a worse failure than the figure rendering slightly smaller,
  // and pulling it left satisfied the viewBox bound by violating the thing the
  // bound existed to protect.
  const vw = labelWidth(view.vLabel);
  const right = left + fit.offsetX + fit.drawnH;
  const viewW = Math.max(VIEW_W + left, right + 12 + vw);
  const vx = right + 12;

  // The overall-length label is a one-item row, so it clamps into the viewBox
  // by the same rule as everything else rather than by being assumed to fit.
  const [hx] = packRow(
    [{ centre: left + fit.offsetX + fit.drawnH / 2, width: labelWidth(view.hLabel) }],
    left + fit.offsetX, viewW, GAP_X,
  );

  return (
    <figure className="cutlist-diagram">
      <figcaption className="cutlist-diagram-head">{view.heading}</figcaption>

      <svg
        viewBox={`0 0 ${viewW} ${height}`}
        fontSize={LABEL_SIZE}
        role="img"
        aria-label={view.heading}
      >
        <defs>
          <pattern
            id={hatch}
            patternUnits="userSpaceOnUse"
            width="8"
            height="8"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="8" stroke="currentColor" strokeWidth="1.5" />
          </pattern>
          <pattern
            id={cross}
            patternUnits="userSpaceOnUse"
            width="8"
            height="8"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="8" stroke="currentColor" strokeWidth="1.5" />
            <line x1="0" y1="0" x2="8" y2="0" stroke="currentColor" strokeWidth="1.5" />
          </pattern>
        </defs>

        <rect
          className="cutlist-diagram-outline"
          x={left + fit.offsetX}
          y={top}
          width={fit.drawnH}
          height={fit.drawnV}
        />

        {view.cells.map((cell, i) => {
          const hb = bandOn(cell.h, fit.sx, left + fit.offsetX, fit.drawnH);
          const vb = bandOn(cell.v, fit.sy, top, fit.drawnV);
          return (
            <rect
              key={i}
              className={
                cell.crossing
                  ? 'cutlist-diagram-cell cutlist-diagram-cross'
                  : 'cutlist-diagram-cell'
              }
              x={hb.start}
              y={vb.start}
              width={hb.size}
              height={vb.size}
              fill={cell.crossing ? `url(#${cross})` : `url(#${hatch})`}
            />
          );
        })}

        {rowLeaders.map((l, i) => {
          const lo = left + fit.offsetX;
          const hi = lo + fit.drawnH;
          const b = bandOn(l.span, fit.sx, lo, fit.drawnH);
          const end = b.start + b.size;
          const y = leaders + ROW * i + ROW / 2;
          const items = labelItems(l, lo, hi, b);
          // Bound at the board's left edge, not the viewBox's. A label centred
          // on a run shorter than itself would otherwise start left of the
          // board — harmless in isolation, but the row's leader LINE already
          // starts at `left + fit.offsetX`, so a label drifting left of its own
          // line's origin reads as belonging to nothing.
          const xs = packRow(items, lo, viewW, GAP_X);
          return (
            <g className="cutlist-diagram-leader" key={l.key}>
              {l.before !== undefined && <line x1={lo} y1={y} x2={b.start} y2={y} />}
              <line x1={b.start} y1={y} x2={end} y2={y} />
              {l.before !== undefined && <line x1={lo} y1={y - TICK} x2={lo} y2={y + TICK} />}
              <line x1={b.start} y1={y - TICK} x2={b.start} y2={y + TICK} />
              <line x1={end} y1={y - TICK} x2={end} y2={y + TICK} />
              {l.after !== undefined && <line x1={end} y1={y} x2={hi} y2={y} />}
              {l.after !== undefined && <line x1={hi} y1={y - TICK} x2={hi} y2={y + TICK} />}
              {items.map((it, k) => (
                <text key={k} x={xs[k]} y={y - 6} textAnchor="middle">{it.text}</text>
              ))}
            </g>
          );
        })}

        {columns.map(({ l, b, items, ys, x, labelX }) => {
          const end = b.start + b.size;
          return (
            <g className="cutlist-diagram-leader cutlist-diagram-leader-v" key={l.key}>
              {l.before !== undefined && <line x1={x} y1={top} x2={x} y2={b.start} />}
              <line x1={x} y1={b.start} x2={x} y2={end} />
              {l.before !== undefined && <line x1={x - TICK} y1={top} x2={x + TICK} y2={top} />}
              <line x1={x - TICK} y1={b.start} x2={x + TICK} y2={b.start} />
              <line x1={x - TICK} y1={end} x2={x + TICK} y2={end} />
              {l.after !== undefined && <line x1={x} y1={end} x2={x} y2={bottom} />}
              {l.after !== undefined && <line x1={x - TICK} y1={bottom} x2={x + TICK} y2={bottom} />}
              {items.map((it, k) => (
                <text key={k} x={labelX} y={ys[k]} textAnchor="middle" transform={`rotate(-90 ${labelX} ${ys[k]})`}>
                  {it.text}
                </text>
              ))}
            </g>
          );
        })}

        <g className="cutlist-diagram-leader">
          <line x1={left + fit.offsetX} y1={baseline} x2={left + fit.offsetX + fit.drawnH} y2={baseline} />
          <line x1={left + fit.offsetX} y1={baseline - TICK} x2={left + fit.offsetX} y2={baseline + TICK} />
          <line
            x1={left + fit.offsetX + fit.drawnH}
            y1={baseline - TICK}
            x2={left + fit.offsetX + fit.drawnH}
            y2={baseline + TICK}
          />
          <text x={hx} y={baseline - 6} textAnchor="middle">{view.hLabel}</text>
        </g>

        <text
          className="cutlist-diagram-overall"
          x={vx}
          y={top + fit.drawnV / 2}
          dominantBaseline="middle"
        >
          {view.vLabel}
        </text>
      </svg>

      <p className="cutlist-diagram-note">Schematic — not to scale</p>
      {view.crossings.map((line) => (
        <p className="cutlist-diagram-crossings" key={line}>{line}</p>
      ))}
    </figure>
  );
}
