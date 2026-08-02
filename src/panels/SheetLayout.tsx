import type { Nesting, NestedSheet, SheetStock } from '../document/document';
import { DRAW_WIDTH } from './diagramScale';
import { fitLabel, labelHeight, LABEL_ASCENT, LABEL_SIZE } from './diagramLabels';

/** Clearance between a label and its rectangle's edge, in drawing units. */
const PAD = 6;

/**
 * One sheet of stock with the parts laid out on it.
 *
 * NOT an extension of PartDiagram: a sheet with parts on it and a board with
 * cuts in it are different drawings that happen to both be SVG — the
 * (face, from) view model, the depth field, the hatch and the leader rows have
 * no meaning here.
 *
 * Formats nothing. Every string arrives from `buildNesting`, the rule
 * CutList.tsx and PartDiagram.tsx already follow.
 *
 * One uniform scale, and deliberately no `fitView`: that exists because a
 * board's cross-section can be too thin to draw a dado on and a square panel
 * can grow off the page. A sheet has a fixed aspect and neither problem.
 *
 * Part fills are SVG `fill` attributes — FOREGROUND content, exactly like the
 * diagram hatch — so they survive printing with Chrome's "Background graphics"
 * off. A CSS background would not.
 */
function Sheet({ sheet, stock, index }: { sheet: NestedSheet; stock: SheetStock; index: number }) {
  const s = DRAW_WIDTH / stock.length;
  const h = stock.width * s;

  const keyed: { n: number; name: string }[] = [];

  return (
    <figure className="cutlist-layout">
      <figcaption className="cutlist-layout-head">Sheet {index + 1}</figcaption>
      <svg
        viewBox={`0 0 ${DRAW_WIDTH} ${h}`}
        fontSize={LABEL_SIZE}
        role="img"
        aria-label={`Sheet ${index + 1}, ${sheet.parts.length} parts`}
      >
        <rect className="cutlist-layout-sheet" x={0} y={0} width={DRAW_WIDTH} height={h} />
        {sheet.parts.map((p, i) => {
          const x = p.x * s;
          const y = p.y * s;
          const w = p.w * s;
          const ph = p.h * s;
          const dims = `${p.w}" × ${p.h}"`;
          const tier = fitLabel([p.name, dims], w - 2 * PAD, ph - 2 * PAD);
          if (tier === 'index') keyed.push({ n: i + 1, name: `${p.name} — ${dims}` });
          const cx = x + w / 2;
          const cy = y + ph / 2;
          // LABEL_ASCENT/2 centres the glyph box on cy rather than sitting the
          // baseline on it — the same measured box PartDiagram's rotated
          // columns use.
          const base = cy + LABEL_ASCENT / 2;
          return (
            <g key={p.boardId}>
              <rect className="cutlist-layout-part" x={x} y={y} width={w} height={ph} />
              {tier === 'full' && (
                <>
                  <text x={cx} y={base - labelHeight() / 2} textAnchor="middle">{p.name}</text>
                  <text x={cx} y={base + labelHeight() / 2} textAnchor="middle">{dims}</text>
                </>
              )}
              {tier === 'name' && <text x={cx} y={base} textAnchor="middle">{p.name}</text>}
              {tier === 'index' && <text x={cx} y={base} textAnchor="middle">{i + 1}</text>}
            </g>
          );
        })}
      </svg>
      {keyed.length > 0 && (
        <ul className="cutlist-layout-key">
          {keyed.map((k) => <li key={k.n}>{k.n}. {k.name}</li>)}
        </ul>
      )}
    </figure>
  );
}

export function SheetLayout({ nesting, stock }: { nesting: Nesting; stock: SheetStock }) {
  return (
    <>
      {nesting.sheets.map((sheet, i) => (
        <Sheet key={i} sheet={sheet} stock={stock} index={i} />
      ))}
    </>
  );
}
