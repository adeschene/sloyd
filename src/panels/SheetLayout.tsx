import type { Nesting, NestedSheet, SheetStock } from '../document/document';
import { DRAW_WIDTH } from './diagramScale';
import { fitLabel, holdsIndex, labelHeight, labelWidth, packRow, LABEL_ASCENT, LABEL_BOX_H, LABEL_DESCENT, LABEL_SIZE } from './diagramLabels';

/**
 * Clearance between a label and its rectangle's edge, in drawing units.
 *
 * Exported for `SheetLayout.test.tsx`, which sizes its parts from
 * `labelWidth` and has to subtract the same padding this does. A second copy
 * of the number in the test is the drift invariant 19 argues against for
 * `LABEL_SIZE`, one constant over.
 */
export const PAD = 6;

/** Fu 96: the clearance between the drawing's edge and a callout number's box, and between numbers in a row. */
export const CALLOUT_GAP = 8;
/** One callout row: the gap, a label's height, and the gap again before anything beyond the drawing. */
const CALLOUT_ROW = CALLOUT_GAP + LABEL_BOX_H + CALLOUT_GAP;

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
function Sheet({ sheet, stock, index, noun, numbers }: {
  sheet: NestedSheet; stock: SheetStock; index: number; noun: string; numbers?: ReadonlyMap<string, number>;
}) {
  const s = DRAW_WIDTH / stock.length;
  const h = stock.width * s;

  const keyed: { id: string; n: number; name: string }[] = [];
  // Counts only parts that actually fall to the index tier, so the key list
  // reads 1, 2, 3, ... — not the sparse sheet.parts positions of whichever
  // parts happened to need it (finding 4). Incremented, not `keyed.length + 1`,
  // so it stays correct even though `keyed.push` happens after this read.
  let nextIndex = 1;

  // One pass decides every part's tier, number and whether that number is a callout; the drawing reads it below.
  const placed = sheet.parts.map((p) => {
    const x = p.x * s;
    const y = p.y * s;
    const w = p.w * s;
    const ph = p.h * s;
    // `requireDetail: p.turned` — follow-up 161. The `name` tier prints
    // the name alone, so a turned part whose rect fits its name but not
    // its dimension line would print neither its dimensions nor the word
    // 92 put on that line. Demoting it to `index` trades a name in place
    // for a key entry carrying all three, which is strictly more.
    // The BOOLEAN is what travels, never a search of `p.dims` for the
    // word: `nesting.ts` keeps the fact beside the string so nobody has
    // to parse it back out.
    const tier = fitLabel([p.name, p.dims], w - 2 * PAD, ph - 2 * PAD, {
      requireDetail: p.turned,
    });
    let indexLabel: number | null = null;
    if (tier === 'index') {
      // The part's CUT-LIST ROW number when the caller has one (plans balloons, the user's ruling): one series on the
      // cut list, its layouts and the Plans sheet; two parts of one row share it. Else this sheet's own counter.
      const row = numbers?.get(p.boardId);
      if (row !== undefined) indexLabel = row;
      else {
        indexLabel = nextIndex;
        nextIndex += 1;
      }
      keyed.push({ id: p.boardId, n: indexLabel, name: `${p.name} — ${p.dims}` });
    }
    // Fu 96: a rectangle that cannot hold even its number calls it out beside the drawing, on the nearer long edge.
    const callout: 'above' | 'below' | null = indexLabel !== null && !holdsIndex(String(indexLabel), w - 2 * PAD, ph - 2 * PAD)
      ? (y + ph / 2 > h / 2 ? 'below' : 'above')
      : null;
    return { p, x, y, w, ph, tier, indexLabel, callout };
  });

  // The callout rows: each number packed along its edge (`packRow`: measured boxes, left-to-right by the part's centre, so
  // a crowded row cascades instead of overlapping), a leader from the part's near edge to its own number.
  const rows = (['above', 'below'] as const).map((side) => {
    const items = placed
      .filter((q) => q.callout === side)
      .sort((a, b) => (a.x + a.w / 2) - (b.x + b.w / 2));
    const centres = packRow(
      items.map((q) => ({ centre: q.x + q.w / 2, width: labelWidth(String(q.indexLabel)) })),
      0, DRAW_WIDTH, CALLOUT_GAP,
    );
    return { side, items, centres };
  });
  const above = rows[0].items.length > 0 ? CALLOUT_ROW : 0;
  const below = rows[1].items.length > 0 ? CALLOUT_ROW : 0;

  return (
    <figure className="cutlist-layout">
      <figcaption className="cutlist-layout-head">{noun} {index + 1}</figcaption>
      <svg
        viewBox={`0 ${-above} ${DRAW_WIDTH} ${h + above + below}`}
        fontSize={LABEL_SIZE}
        role="img"
        aria-label={`${noun} ${index + 1}, ${sheet.parts.length} part${sheet.parts.length === 1 ? '' : 's'}`}
      >
        <rect className="cutlist-layout-sheet" x={0} y={0} width={DRAW_WIDTH} height={h} />
        {placed.map(({ p, x, y, w, ph, tier, indexLabel, callout }) => {
          const cx = x + w / 2;
          const cy = y + ph / 2;
          // (LABEL_ASCENT - LABEL_DESCENT) / 2 centres the measured glyph box
          // (ASCENT above the baseline, DESCENT below) on cy. LABEL_ASCENT/2
          // alone — the earlier arithmetic here — biased every label toward
          // the bottom of its box by DESCENT/2 (finding 3).
          const base = cy + (LABEL_ASCENT - LABEL_DESCENT) / 2;
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
              {tier === 'index' && callout === null && <text x={cx} y={base} textAnchor="middle">{indexLabel}</text>}
            </g>
          );
        })}
        {rows.map(({ side, items, centres }) => items.map((q, i) => {
          // The number's measured box sits CALLOUT_GAP outside the sheet's edge; the leader runs from the part's near edge
          // to the box's near edge.
          const top = side === 'below' ? h + CALLOUT_GAP : -CALLOUT_GAP - labelHeight();
          const partEdge = side === 'below' ? q.y + q.ph : q.y;
          const boxEdge = side === 'below' ? top : top + labelHeight();
          return (
            <g key={`callout-${q.p.boardId}`}>
              <line className="cutlist-layout-leader" x1={q.x + q.w / 2} y1={partEdge} x2={centres[i]} y2={boxEdge} />
              <text x={centres[i]} y={top + LABEL_ASCENT} textAnchor="middle">{q.indexLabel}</text>
            </g>
          );
        }))}
      </svg>
      {keyed.length > 0 && (
        <ul className="cutlist-layout-key">
          {keyed.map((k) => <li key={k.id}>{k.n}. {k.name}</li>)}
        </ul>
      )}
    </figure>
  );
}

/**
 * `noun` names each drawing: `Sheet 1` for sheet goods; the by-the-piece Buying section passes the stock
 * size, e.g. `3/4" × 5-1/2" × 96" — board`, so a board strip reads as what it is (lumber yield spec §4).
 */
export function SheetLayout({ nesting, stock, noun = 'Sheet', numbers }: {
  nesting: Nesting; stock: SheetStock; noun?: string;
  /** A part's cut-list row number, by board id (plans balloons): labels and key entries use it when present. */
  numbers?: ReadonlyMap<string, number>;
}) {
  return (
    <>
      {nesting.sheets.map((sheet, i) => (
        <Sheet key={i} sheet={sheet} stock={stock} index={i} noun={noun} numbers={numbers} />
      ))}
    </>
  );
}
