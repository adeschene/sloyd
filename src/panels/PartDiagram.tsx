import { useId } from 'react';
import type { DiagramView } from '../document/document';
import { band, fitView, DRAW_WIDTH } from './diagramScale';

/** Room above the outline for near-side depth labels. */
const TOP = 26;
/** Room below the outline for far-side depth labels, when there are any. */
const FAR = 22;
/** Clearance between the outline (or the far-side depth labels) and the leader stack. */
const GAP = 16;
/** One stacked leader row per cut. */
const ROW = 26;
/** The overall-length run along the bottom. */
const BOTTOM = 34;
/** Room to the right of the outline for the overall-width label. */
const RIGHT = 90;

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
 * Leaders STACK, one row per cut, rather than being placed inline. That is
 * what avoids a collision solver; it costs vertical space linear in the cut
 * count, which is acceptable because a part with six cuts is a part whose
 * prose was the actual problem.
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
  const far = view.hasFar ? FAR : 0;
  const leaders = bottom + far + GAP;
  const height = leaders + ROW * view.cuts.length + BOTTOM;
  const baseline = height - BOTTOM / 2;

  return (
    <figure className="cutlist-diagram">
      <figcaption className="cutlist-diagram-head">{view.heading}</figcaption>

      <svg viewBox={`0 0 ${DRAW_WIDTH + RIGHT} ${height}`} role="img" aria-label={view.heading}>
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
            <g key={cut.id}>
              <rect
                className={near ? 'cutlist-diagram-near' : 'cutlist-diagram-far'}
                x={b.x}
                y={top}
                width={b.width}
                height={fit.drawnV}
                fill={near ? `url(#${hatch})` : 'none'}
              />
              {/* Above for near, below for far: the same distinction the line
                  style makes, encoded a second time and redundantly on
                  purpose. */}
              <text
                className="cutlist-diagram-depth"
                x={b.x + b.width / 2}
                y={near ? top - 8 : bottom + 16}
                textAnchor="middle"
              >
                {cut.depthLabel}
              </text>
            </g>
          );
        })}

        {view.cuts.map((cut, i) => {
          const b = band(cut.h, fit);
          const y = leaders + ROW * i + ROW / 2;
          return (
            <g className="cutlist-diagram-leader" key={cut.id}>
              <line x1={fit.offsetX} y1={y} x2={b.x} y2={y} />
              <text x={(fit.offsetX + b.x) / 2} y={y - 6} textAnchor="middle">
                {cut.offsetLabel}
              </text>
              <line x1={b.x} y1={y} x2={b.x + b.width} y2={y} />
              <text x={b.x + b.width / 2} y={y - 6} textAnchor="middle">
                {cut.widthLabel}
              </text>
            </g>
          );
        })}

        <g className="cutlist-diagram-leader">
          <line x1={fit.offsetX} y1={baseline} x2={fit.offsetX + fit.drawnH} y2={baseline} />
          <text x={fit.offsetX + fit.drawnH / 2} y={baseline - 6} textAnchor="middle">
            {view.hLabel}
          </text>
        </g>

        <text
          className="cutlist-diagram-depth"
          x={DRAW_WIDTH + 12}
          y={top + fit.drawnV / 2}
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
