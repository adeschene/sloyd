import type { Board, CutFrom, Dimension, Span } from './types';
import { DIMENSION_ORDER, positionAxisOf } from './geometry';
import { cutLabel, cutRegion } from './cuts';
import { formatLength } from '../units/length';

/**
 * One cut as it appears in a view, in BOARD INCHES.
 *
 * No pixels, no drawing units — those belong to `panels/diagramScale.ts`.
 * Keeping them out is what lets this module be tested against measurements
 * rather than against a rendering.
 */
export interface DiagramCut {
  /** `Cut.id` verbatim. Stable within the view; the React key. */
  id: string;
  /** [min, max] along the view's horizontal (position) axis. */
  h: Span;
  /** [min, max] along the view's vertical (`across`) axis — the full height. */
  v: Span;
  /** 'min' draws near: solid, hatched. 'max' draws far: dashed. */
  side: CutFrom;
  /** e.g. `3/8" deep`, already formatted. */
  depthLabel: string;
  /** e.g. `6"` — the offset from the horizontal axis's min end. */
  offsetLabel: string;
  /** e.g. `3/4"` — the cut's own extent along the horizontal axis. */
  widthLabel: string;
  /** From `cutLabel`. Representative, not consensus — see spec section 8. */
  kind: 'dado' | 'rabbet';
}

export interface DiagramView {
  /** `face|across`. Stable across renders; the React key. */
  key: string;
  /** e.g. `Thickness face — across the width` */
  heading: string;
  face: Dimension;
  across: Dimension;
  /** The horizontal axis: `positionAxisOf(face, across)`. */
  along: Dimension;
  /** Board inches. The outline is [0, h] x [0, v]. */
  h: number;
  v: number;
  hLabel: string;
  vLabel: string;
  /** In `h[0]` order. Empty for a cut-free board. */
  cuts: DiagramCut[];
  /** True when any cut has `side: 'max'`; the renderer shows a legend only then. */
  hasFar: boolean;
}

const capitalise = (d: Dimension): string => d[0].toUpperCase() + d.slice(1);

/**
 * A board's setups, drawn.
 *
 * ONE VIEW PER `(face, across)` PAIR, not per face. A cut spans `across` fully
 * and sits at [offset, offset + width] along the implied position axis, so
 * within a view it is always a band touching two opposite edges — the visual
 * signature of a through-cut. But one face admits two `across` values, and
 * those two cuts have DIFFERENT position axes, so they cannot both be bands
 * along the same screen axis. Keying on the pair means the horizontal is
 * always the position axis, every band is vertical, every leader is a
 * horizontal run beneath the board, and there is one layout in the whole
 * feature. `from` does NOT split a view: near and far share one drawing, which
 * is what makes a board dadoed on both faces legible at a glance.
 *
 * The geometry is entirely `cutRegion`'s. It is already the only place `from`
 * is consumed and it already returns the removed box keyed by dimension, so a
 * band is two of its three spans read out by name. No projection, no
 * `boardEdges`, no hidden-line computation.
 */
export function buildDiagrams(board: Board, precision: number): DiagramView[] {
  const f = (n: number) => formatLength(n, precision);
  const views = new Map<string, DiagramView>();

  const ensure = (face: Dimension, across: Dimension): DiagramView => {
    const key = `${face}|${across}`;
    let view = views.get(key);
    if (!view) {
      const along = positionAxisOf(face, across);
      view = {
        key,
        heading: `${capitalise(face)} face — across the ${across}`,
        face,
        across,
        along,
        h: board[along],
        v: board[across],
        hLabel: f(board[along]),
        vLabel: f(board[across]),
        cuts: [],
        hasFar: false,
      };
      views.set(key, view);
    }
    return view;
  };

  for (const cut of board.cuts) {
    // A cut naming one dimension twice has no position axis to draw against.
    // `validateCuts` drops it on load and `cutRegion` returns a zero region for
    // it, but a Board built in code can still reach here — the same totality
    // reasoning `cutRegion`'s own doc comment gives. Skip it; do not draw a
    // view for it, and do not let it invent one.
    if (cut.face === cut.across) continue;

    const view = ensure(cut.face, cut.across);
    const region = cutRegion(board, cut);
    view.cuts.push({
      id: cut.id,
      h: region[view.along],
      v: region[view.across],
      side: cut.from,
      depthLabel: `${f(cut.depth)} deep`,
      offsetLabel: f(cut.offset),
      widthLabel: f(cut.width),
      kind: cutLabel(board, cut),
    });
    if (cut.from === 'max') view.hasFar = true;
  }

  // A cut-free board still gets a drawing, for the "all parts" setting: broad
  // face on, length running horizontally — the view a woodworker draws by hand.
  if (views.size === 0) ensure('thickness', 'width');

  const out = [...views.values()];
  // `id` as the final tiebreak so the order is total, the same reason
  // `mergeAlong` and `buildCutList`'s row sort both carry one.
  for (const view of out) {
    view.cuts.sort((a, b) => a.h[0] - b.h[0] || a.id.localeCompare(b.id));
  }
  out.sort(
    (a, b) =>
      DIMENSION_ORDER.indexOf(a.face) - DIMENSION_ORDER.indexOf(b.face) ||
      DIMENSION_ORDER.indexOf(a.across) - DIMENSION_ORDER.indexOf(b.across),
  );
  return out;
}
