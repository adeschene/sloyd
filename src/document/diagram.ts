import type { Board, CutFrom, Dimension, Span } from './types';
import { DIMENSION_ORDER, positionAxisOf } from './geometry';
import { boardSolids, cutLabel, cutRegion, cutRemovesNothing, type CutKind } from './cuts';
import { buildDepthField, type FaceCell } from './depthField';
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
  /** [min, max] along the view's HORIZONTAL axis, board inches. */
  h: Span;
  /** [min, max] along the view's VERTICAL axis, board inches. */
  v: Span;
  /** Which axis this cut's offset and width are measured along. */
  axis: 'h' | 'v';
  /** e.g. `3/8" deep`, already formatted. */
  depthLabel: string;
  /** e.g. `6"` — the offset from the position axis's min end. */
  offsetLabel: string;
  /** e.g. `3/4"` — the cut's own extent along the position axis. */
  widthLabel: string;
  /** From `cutLabel`. Representative, not consensus — see spec section 8. */
  kind: CutKind;
  /** e.g. `1"` — how far short of the across axis's min end. Present only when > 0. */
  stopMinLabel?: string;
  /** How far short of the across axis's max end. Present only when > 0. */
  stopMaxLabel?: string;
  /** The cut's own extent along `across`. Present exactly when the cut is stopped. */
  lengthLabel?: string;
}

export interface DiagramView {
  /** `${face}|${from}`. Stable across renders; the React key. */
  key: string;
  /** e.g. `Thickness face — min side` */
  heading: string;
  face: Dimension;
  from: CutFrom;
  /** The in-plane dimension drawn horizontal: the earlier in DIMENSION_ORDER. */
  horizontal: Dimension;
  /** The in-plane dimension drawn vertical: the later in DIMENSION_ORDER. */
  vertical: Dimension;
  /** Board inches. The outline is [0, h] x [0, v]. */
  h: number;
  v: number;
  hLabel: string;
  vLabel: string;
  /** In `h[0]`, `v[0]`, `id` order. Empty for a cut-free board. */
  cuts: DiagramCut[];
  /** This face's depth field, from `buildDepthField`. */
  cells: FaceCell[];
  /** One line per distinct crossing depth, already formatted. Empty when none. */
  crossings: string[];
}

const capitalise = (d: Dimension): string => d[0].toUpperCase() + d.slice(1);

/**
 * A board's setups, drawn.
 *
 * ONE VIEW PER PHYSICAL FACE — keyed on `(face, from)`, not `(face, across)`.
 * A face admits two `across` values with different position axes; keying on
 * `across` used to split a single physical face into two drawings whenever
 * both were used, each showing one cut and neither showing where they cross.
 * Keying on the face itself means both in-plane dimensions are always drawn —
 * the earlier in `DIMENSION_ORDER` horizontal, the later vertical — and every
 * cut is a band along whichever of the two is its `across` (fully across it
 * unless stopped),
 * positioned along whichever is its implied position axis (`axis: 'h' | 'v'`
 * on the cut records which). `from` DOES split a view now: near and far sides
 * of one face are physically different surfaces, so each gets its own
 * drawing — the reverse of the old `across` split.
 *
 * The geometry is entirely `cutRegion`'s. It is already the only place `from`
 * is consumed and it already returns the removed box keyed by dimension, so a
 * band is two of its three spans read out by name. No projection, no
 * `boardEdges`, no hidden-line computation.
 *
 * `cells` and `crossings` come from `buildDepthField`, one call per view —
 * this module does not recompute what counts as a crossing (see
 * `depthField.ts`'s own doc comment for that rule).
 */
export function buildDiagrams(board: Board, precision: number): DiagramView[] {
  const f = (n: number) => formatLength(n, precision);
  const views = new Map<string, DiagramView>();

  const ensure = (face: Dimension, from: CutFrom): DiagramView => {
    const key = `${face}|${from}`;
    let view = views.get(key);
    if (!view) {
      // Both in-plane dimensions; the earlier in DIMENSION_ORDER runs horizontal.
      const inPlane = DIMENSION_ORDER.filter((d) => d !== face);
      const [horizontal, vertical] = inPlane;
      view = {
        key,
        heading: `${capitalise(face)} face — ${from} side`,
        face,
        from,
        horizontal,
        vertical,
        h: board[horizontal],
        v: board[vertical],
        hLabel: f(board[horizontal]),
        vLabel: f(board[vertical]),
        cuts: [],
        cells: [],
        crossings: [],
      };
      views.set(key, view);
    }
    return view;
  };

  const solids = boardSolids(board);
  for (const cut of board.cuts) {
    // A cut a board edit has left removing nothing is not drawn: there is no
    // stock for it to remove, and the 3D view already shows none (fu 178).
    if (cutRemovesNothing(board, cut)) continue;
    // A cut naming one dimension twice has no position axis to draw against.
    // `validateCuts` drops it on load, but a Board built in code can still
    // reach here — the same totality reasoning `cutRegion`'s own doc comment
    // gives. Skip it; do not draw a view for it, and do not let it invent one.
    if (cut.face === cut.across) continue;

    const view = ensure(cut.face, cut.from);
    const region = cutRegion(board, cut);
    const pos = positionAxisOf(cut.face, cut.across);
    view.cuts.push({
      id: cut.id,
      h: region[view.horizontal],
      v: region[view.vertical],
      axis: pos === view.horizontal ? 'h' : 'v',
      depthLabel: `${f(cut.depth)} deep`,
      offsetLabel: f(cut.offset),
      widthLabel: f(cut.width),
      kind: cutLabel(board, cut, solids),
      // Assembled here, never in the panel: the measured string and the drawn
      // string must be the same string (invariant 19).
      ...(cut.stopMin > 0 ? { stopMinLabel: f(cut.stopMin) } : {}),
      ...(cut.stopMax > 0 ? { stopMaxLabel: f(cut.stopMax) } : {}),
      ...(cut.stopMin > 0 || cut.stopMax > 0
        ? { lengthLabel: f(region[cut.across][1] - region[cut.across][0]) }
        : {}),
    });
  }

  // A cut-free board still gets a drawing, for the "all parts" setting: broad
  // face on, length running horizontally — the view a woodworker draws by hand.
  if (views.size === 0) ensure('thickness', 'min');

  const out = [...views.values()];
  for (const view of out) {
    view.cuts.sort(
      (a, b) => a.h[0] - b.h[0] || a.v[0] - b.v[0] || a.id.localeCompare(b.id),
    );
    view.cells = buildDepthField(board, view.face, view.from, view.horizontal, view.vertical);
    const depths = [...new Set(view.cells.filter((c) => c.crossing).map((c) => c.depth))].sort(
      (a, b) => a - b,
    );
    view.crossings = depths.map((d) => `overlap: ${f(d)} deep governs`);
  }
  // 'min' before 'max' — the near side is the one a person reads first, it is
  // the default `from` for a new cut, and it matches the "(min side)" phrasing
  // the prose setup lines already use. NOT localeCompare: 'max' sorts before
  // 'min' alphabetically, which is the opposite of the intent and is what this
  // comment used to describe while the code did the reverse.
  const FROM_ORDER: CutFrom[] = ['min', 'max'];
  out.sort(
    (a, b) =>
      DIMENSION_ORDER.indexOf(a.face) - DIMENSION_ORDER.indexOf(b.face) ||
      FROM_ORDER.indexOf(a.from) - FROM_ORDER.indexOf(b.from),
  );
  return out;
}
