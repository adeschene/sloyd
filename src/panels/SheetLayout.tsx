import type { Nesting, NestedSheet, SheetStock } from '../document/document';
import { DRAW_WIDTH } from './diagramScale';
import { fitLabel, labelHeight, LABEL_ASCENT, LABEL_DESCENT, LABEL_SIZE } from './diagramLabels';

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
 * Formats nothing. Every string arrives from `buildNesting` — including
 * `PlacedPart.dims`, formatted at placement time in `nesting.ts` from the
 * board's own `length`/`width` (never re-derived here from the placed `w`/`h`,
 * which are swapped for a turned part) — the rule CutList.tsx and
 * PartDiagram.tsx already follow.
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
  // Counts only parts that actually fall to the index tier, so the key list
  // reads 1, 2, 3, ... — not the sparse sheet.parts positions of whichever
  // parts happened to need it (finding 4). Incremented, not `keyed.length + 1`,
  // so it stays correct even though `keyed.push` happens after this read.
  let nextIndex = 1;

  return (
    <figure className="cutlist-layout">
      <figcaption className="cutlist-layout-head">Sheet {index + 1}</figcaption>
      <svg
        viewBox={`0 0 ${DRAW_WIDTH} ${h}`}
        fontSize={LABEL_SIZE}
        role="img"
        aria-label={`Sheet ${index + 1}, ${sheet.parts.length} part${sheet.parts.length === 1 ? '' : 's'}`}
      >
        <rect className="cutlist-layout-sheet" x={0} y={0} width={DRAW_WIDTH} height={h} />
        {sheet.parts.map((p) => {
          const x = p.x * s;
          const y = p.y * s;
          const w = p.w * s;
          const ph = p.h * s;
          const tier = fitLabel([p.name, p.dims], w - 2 * PAD, ph - 2 * PAD);
          const cx = x + w / 2;
          const cy = y + ph / 2;
          // (LABEL_ASCENT - LABEL_DESCENT) / 2 centres the measured glyph box
          // (ASCENT above the baseline, DESCENT below) on cy. LABEL_ASCENT/2
          // alone — the earlier arithmetic here — biased every label toward
          // the bottom of its box by DESCENT/2 (finding 3).
          const base = cy + (LABEL_ASCENT - LABEL_DESCENT) / 2;
          let indexLabel: number | null = null;
          if (tier === 'index') {
            indexLabel = nextIndex;
            nextIndex += 1;
            keyed.push({ n: indexLabel, name: `${p.name} — ${p.dims}` });
          }
          return (
            <g key={p.boardId}>
              <rect className="cutlist-layout-part" x={x} y={y} width={w} height={ph} />
              {tier === 'full' && (
                <>
                  <text x={cx} y={base - labelHeight() / 2} textAnchor="middle">{p.name}</text>
                  <text x={cx} y={base + labelHeight() / 2} textAnchor="middle">{p.dims}</text>
                </>
              )}
              {tier === 'name' && <text x={cx} y={base} textAnchor="middle">{p.name}</text>}
              {tier === 'index' && <text x={cx} y={base} textAnchor="middle">{indexLabel}</text>}
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
