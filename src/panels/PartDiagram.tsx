import { useId } from 'react';
import type { DiagramView } from '../document/document';
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
const TICK = 4;
/** Clearance between a rotated column label's own box and its leader line. */
const COL_GAP = 6;
/** Clearance between the last leader column's tick marks and the outline. */
const LEFT_PAD = 12;
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
  // The left gutter: one COL-wide column per vertical-axis cut, plus a fixed
  // pad separating the last column's tick marks from the outline. Zero when
  // there are none, so a board with no vertical-axis cuts draws exactly as it
  // did before this round.
  const left = COL * vCuts.length + (vCuts.length ? LEFT_PAD : 0);

  const top = TOP;
  const bottom = top + fit.drawnV;
  const leaders = bottom + GAP;

  // Column labels, packed UNBOUNDED (see the module doc comment for why no
  // upper bound is assumed here). Computed before `height` because `height`
  // has to grow to fit whichever column runs deepest.
  const columns = vCuts.map((cut, i) => {
    const b = bandOn(cut.v, fit.sy, top, fit.drawnV);
    const depthW = labelWidth(cut.depthLabel);
    const [oy, wy, dy] = packRow(
      [
        { centre: (top + b.start) / 2, width: labelWidth(cut.offsetLabel) },
        { centre: b.start + b.size / 2, width: labelWidth(cut.widthLabel) },
        { centre: b.start + b.size + GAP_X + depthW / 2, width: depthW },
      ],
      top, Infinity, GAP_X,
    );
    return { cut, b, oy, wy, dy, depthW, x: COL * (i + 1) - TICK, labelX: COL * i + LABEL_ASCENT };
  });
  const maxColumnBottom = columns.length
    ? Math.max(...columns.map((c) => c.dy + c.depthW / 2))
    : 0;

  const height = Math.max(leaders + ROW * hCuts.length + BOTTOM, maxColumnBottom + BOTTOM);
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

        {hCuts.map((cut, i) => {
          const b = bandOn(cut.h, fit.sx, left + fit.offsetX, fit.drawnH);
          const y = leaders + ROW * i + ROW / 2;
          const depthW = labelWidth(cut.depthLabel);
          // In board order, left to right: the offset run, the band, then depth
          // just clear of the band. `packRow` preserves that order.
          //
          // Bound at the board's left edge, not the viewBox's. A label centred
          // on a run shorter than itself would otherwise start left of the
          // board — harmless in isolation, but the row's leader LINE already
          // starts at `left + fit.offsetX`, so a label drifting left of its own
          // line's origin reads as belonging to nothing.
          const [ox, wx, dx] = packRow(
            [
              { centre: (left + fit.offsetX + b.start) / 2, width: labelWidth(cut.offsetLabel) },
              { centre: b.start + b.size / 2, width: labelWidth(cut.widthLabel) },
              { centre: b.start + b.size + GAP_X + depthW / 2, width: depthW },
            ],
            left + fit.offsetX, viewW, GAP_X,
          );
          return (
            <g className="cutlist-diagram-leader" key={cut.id}>
              <line x1={left + fit.offsetX} y1={y} x2={b.start} y2={y} />
              <line x1={b.start} y1={y} x2={b.start + b.size} y2={y} />
              <line x1={left + fit.offsetX} y1={y - TICK} x2={left + fit.offsetX} y2={y + TICK} />
              <line x1={b.start} y1={y - TICK} x2={b.start} y2={y + TICK} />
              <line x1={b.start + b.size} y1={y - TICK} x2={b.start + b.size} y2={y + TICK} />
              <text x={ox} y={y - 6} textAnchor="middle">{cut.offsetLabel}</text>
              <text x={wx} y={y - 6} textAnchor="middle">{cut.widthLabel}</text>
              <text x={dx} y={y - 6} textAnchor="middle">{cut.depthLabel}</text>
            </g>
          );
        })}

        {columns.map(({ cut, b, oy, wy, dy, x, labelX }) => (
          <g className="cutlist-diagram-leader cutlist-diagram-leader-v" key={cut.id}>
            <line x1={x} y1={top} x2={x} y2={b.start} />
            <line x1={x} y1={b.start} x2={x} y2={b.start + b.size} />
            <line x1={x - TICK} y1={top} x2={x + TICK} y2={top} />
            <line x1={x - TICK} y1={b.start} x2={x + TICK} y2={b.start} />
            <line x1={x - TICK} y1={b.start + b.size} x2={x + TICK} y2={b.start + b.size} />
            <text x={labelX} y={oy} textAnchor="middle" transform={`rotate(-90 ${labelX} ${oy})`}>
              {cut.offsetLabel}
            </text>
            <text x={labelX} y={wy} textAnchor="middle" transform={`rotate(-90 ${labelX} ${wy})`}>
              {cut.widthLabel}
            </text>
            <text x={labelX} y={dy} textAnchor="middle" transform={`rotate(-90 ${labelX} ${dy})`}>
              {cut.depthLabel}
            </text>
          </g>
        ))}

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
