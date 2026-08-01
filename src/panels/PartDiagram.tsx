import { useId } from 'react';
import type { DiagramView } from '../document/document';
import { band, fitView, DRAW_WIDTH } from './diagramScale';
import { labelWidth, packRow, LABEL_SIZE } from './diagramLabels';

/** Stroke clearance above the outline. Nothing is DRAWN above it any more. */
const TOP = 4;
/** Clearance between the outline and the leader stack. */
const GAP = 16;
/** One stacked leader row per cut. */
const ROW = 26;
/** The overall-length run along the bottom. */
const BOTTOM = 34;
/** Room to the right of the outline for the overall-width label. */
const RIGHT = 90;
/** Minimum clearance between two labels in a row, and band-to-depth-label. */
const GAP_X = 8;
/** Half-length of a run's end tick. Runs abut, so without these the offset run
 *  and the band run fuse into one line and the offset label appears to measure
 *  to the far side of the cut. */
const TICK = 4;
/** The full drawable interval — the viewBox, not the outline. */
const VIEW_W = DRAW_WIDTH + RIGHT;

/**
 * One view of a part, as a schematic.
 *
 * Formats NOTHING — every string arrives from `buildDiagrams`, which is the
 * rule `CutList.tsx` already follows and the reason display rounding lives in
 * one place.
 *
 * SVG rather than canvas: it prints as vectors at printer resolution, and the
 * hatch is an SVG `<pattern>` fill, which is FOREGROUND content. A CSS
 * background would be dropped whenever Chrome's "Background graphics" is off —
 * the existing print block already carries a comment about that — and the
 * near/far distinction would silently collapse to solid-versus-dashed on a
 * default print.
 *
 * NO TEXT HANGS OFF THE OUTLINE'S TOP OR BOTTOM EDGE THE WAY IT DID IN THE OLD
 * TOP/FAR BANDS. The leader rows and the overall-length run are still drawn
 * below the outline — that geometry is the point — but every number a cut
 * owns now lives in that cut's own stacked leader row, which is what makes a
 * collision BETWEEN cuts impossible by construction — rows are ROW units apart
 * vertically, so no arithmetic is involved. Only the three labels WITHIN a row
 * can collide, and `packRow` settles those (follow-up 59).
 *
 * Depth moved into the row for a better reason than the collision that prompted
 * it: depth runs PERPENDICULAR to this view. It has no position on the page, so
 * centring it on its band was never spatially meaningful — placing it beside the
 * band is honest about that.
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
  // back to a bare `useId()`.
  const hatch = `hatch${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const fit = fitView(view.h, view.v);

  const top = TOP;
  const bottom = top + fit.drawnV;
  const leaders = bottom + GAP;
  const height = leaders + ROW * view.cuts.length + BOTTOM;
  const baseline = height - BOTTOM / 2;

  // The overall-width label always sits BESIDE the outline, never pulled back
  // across it. When the RIGHT gutter cannot hold the label, the viewBox grows
  // to make room rather than the label moving inward — the label overlapping
  // the drawing is a worse failure than the figure rendering slightly smaller,
  // and pulling it left satisfied the viewBox bound by violating the thing the
  // bound existed to protect.
  const vw = labelWidth(view.vLabel);
  const right = fit.offsetX + fit.drawnH;
  const viewW = Math.max(VIEW_W, right + 12 + vw);
  const vx = right + 12;

  // The overall-length label is a one-item row, so it clamps into the viewBox
  // by the same rule as everything else rather than by being assumed to fit.
  const [hx] = packRow(
    [{ centre: fit.offsetX + fit.drawnH / 2, width: labelWidth(view.hLabel) }],
    fit.offsetX, viewW, GAP_X,
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
        </defs>

        <rect
          className="cutlist-diagram-outline"
          x={fit.offsetX}
          y={top}
          width={fit.drawnH}
          height={fit.drawnV}
        />

        {view.cuts.map((cut) => {
          const b = band(cut.h, fit);
          const near = cut.side === 'min';
          return (
            <rect
              key={cut.id}
              className={near ? 'cutlist-diagram-near' : 'cutlist-diagram-far'}
              x={b.x}
              y={top}
              width={b.width}
              height={fit.drawnV}
              fill={near ? `url(#${hatch})` : 'none'}
            />
          );
        })}

        {view.cuts.map((cut, i) => {
          const b = band(cut.h, fit);
          const y = leaders + ROW * i + ROW / 2;
          const depthW = labelWidth(cut.depthLabel);
          // In board order, left to right: the offset run, the band, then depth
          // just clear of the band. `packRow` preserves that order.
          //
          // Bound at the board's left edge, not the viewBox's. A label centred
          // on a run shorter than itself would otherwise start left of the
          // board — harmless in isolation, but the row's leader LINE already
          // starts at fit.offsetX, so a label drifting left of its own line's
          // origin reads as belonging to nothing.
          const [ox, wx, dx] = packRow(
            [
              { centre: (fit.offsetX + b.x) / 2, width: labelWidth(cut.offsetLabel) },
              { centre: b.x + b.width / 2, width: labelWidth(cut.widthLabel) },
              { centre: b.x + b.width + GAP_X + depthW / 2, width: depthW },
            ],
            fit.offsetX, viewW, GAP_X,
          );
          return (
            <g
              className={
                cut.side === 'min'
                  ? 'cutlist-diagram-leader'
                  : 'cutlist-diagram-leader cutlist-diagram-leader-far'
              }
              key={cut.id}
            >
              <line x1={fit.offsetX} y1={y} x2={b.x} y2={y} />
              <line x1={b.x} y1={y} x2={b.x + b.width} y2={y} />
              <line x1={fit.offsetX} y1={y - TICK} x2={fit.offsetX} y2={y + TICK} />
              <line x1={b.x} y1={y - TICK} x2={b.x} y2={y + TICK} />
              <line x1={b.x + b.width} y1={y - TICK} x2={b.x + b.width} y2={y + TICK} />
              <text x={ox} y={y - 6} textAnchor="middle">{cut.offsetLabel}</text>
              <text x={wx} y={y - 6} textAnchor="middle">{cut.widthLabel}</text>
              <text x={dx} y={y - 6} textAnchor="middle">{cut.depthLabel}</text>
            </g>
          );
        })}

        <g className="cutlist-diagram-leader">
          <line x1={fit.offsetX} y1={baseline} x2={fit.offsetX + fit.drawnH} y2={baseline} />
          <line x1={fit.offsetX} y1={baseline - TICK} x2={fit.offsetX} y2={baseline + TICK} />
          <line
            x1={fit.offsetX + fit.drawnH}
            y1={baseline - TICK}
            x2={fit.offsetX + fit.drawnH}
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

      <p className="cutlist-diagram-note">
        Schematic — not to scale
        {view.hasFar && ' · hatched: this side · dashed: far side'}
      </p>
    </figure>
  );
}
