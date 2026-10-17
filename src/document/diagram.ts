import type { Board, CurveCut, CutFrom, Dimension, HoleRow, Span } from './types';
import { holeInstances } from './holes';
import { holeLine } from './holeText';
import { DIMENSION_ORDER } from './geometry';
import { pocketCells, clippedRegion, cutShape, cutRemovesNothing, type CutKind } from './cuts';
import { buildDepthField, type FaceCell } from './depthField';
import { formatLengthBare, type Units } from '../units/length';
import { angleCutsThatRemoveStock, keptHalfSpace, throughOf } from './angleCuts';
import { angleLine } from './angleText';
import { curveOutline, twiceArea, uvDims } from './curves';
import { curveLineEntries } from './curveText';
import { DRAWING_CURVE_TOLERANCE, DRAWING_CURVE_SEGMENTS_MAX } from './curveDrawing';
import { geometryBoard } from './profiles';

/** One angle cut in a view (spec §4.3): the wedge it removes, in (h, v) board inches, and its bench line. */
export interface DiagramAngle { id: string; poly: [number, number][]; label: string }

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
  /** [min, max] along the view's HORIZONTAL axis, board inches: the cut's box clipped to the board (fu 197). */
  h: Span;
  /** [min, max] along the view's VERTICAL axis, board inches: the cut's box clipped to the board (fu 197). */
  v: Span;
  /** Which axis the cut's position is measured along (`CutShape.pos`). */
  axis: 'h' | 'v';
  /** e.g. `3/8" deep`, already formatted. */
  depthLabel: string;
  /** e.g. `6"` — where the opening starts, from the position axis's min end. */
  offsetLabel: string;
  /** e.g. `3/4"` — the opening's extent along the position axis. */
  widthLabel: string;
  /**
   * The word from `cutShape` (the same `CutShape` the setup line formats). Representative of its
   * row, not consensus — see follow-up 55a in docs/follow-ups.md.
   */
  kind: CutKind;
  /** e.g. `1"` — how far short of the RUN axis's min end; present only where that end is closed. */
  stopMinLabel?: string;
  /** How far short of the RUN axis's max end; present only where that end is closed. */
  stopMaxLabel?: string;
  /** The opening's extent along its run axis; present exactly when a stop is. */
  lengthLabel?: string;
}

/** A hole seen down its axis (spec §4.3): a circle, board inches, in the view's (h, v). */
export interface DiagramHole { row: string; index: number; h: number; v: number; r: number }
/** A hole seen across its axis: the box of its depth, drawn dashed (the two walls and, when blind, the bottom). */
export interface DiagramHoleSide {
  row: string; index: number; h: Span; v: Span;
  /** Which in-plane axis the hole's depth runs along: its two walls are lines along it. */
  axis: 'h' | 'v';
  /** Where the bottom line is drawn (blind holes only); null for a through hole. */
  bottomAt: 'hmin' | 'hmax' | 'vmin' | 'vmax' | null;
}

/** A curve's waste outline seen down its `through`, clipped to the face, board inches. */
export interface DiagramCurve { id: string; poly: [number, number][] }
/** A line across the part at a curve's sharp outline vertex on this face (`along` the axis it runs, `at` on the other). */
export interface DiagramCurveLine { id: string; along: 'h' | 'v'; at: number }

export interface DiagramView {
  /** Holes seen down their axis in this view (circles). */
  holes: DiagramHole[];
  /** Holes seen across their axis in this view (dashed depth boxes). */
  holeSides: DiagramHoleSide[];
  /** One bench line per hole row drawn in this view (inv 19: built in holeText.ts). */
  holeNotes: { row: string; text: string }[];
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
  /**
   * The vertical is drawn UPWARD (page v grows up from the bottom edge) rather
   * than down. Geometry (`v`, cells) stays in board inches; only the drawing
   * flips. One hand in the model since schema 12, so under "later dimension
   * runs down" exactly these three sides are mirror images; flipping them makes
   * every view a true view of its face from outside. Derived in the fu 215
   * probe and pinned by the true-view test in diagram.test.ts.
   */
  vUp: boolean;
  /** This face's depth field, from `buildDepthField`. */
  cells: FaceCell[];
  /** Angle cuts seen edge-on as a line: drawn in every view looking along their through dimension (the min side opened when neither exists). Empty for most views. */
  angles: DiagramAngle[];
  /** One line per distinct crossing depth, already formatted. Empty when none. */
  crossings: string[];
  /** Curve waste outlines seen down a curve's `through`, clipped to the face, board inches. */
  curves: DiagramCurve[];
  /** Lines across the part at a curve's sharp outline vertices on this face (Q5). */
  curveLines: DiagramCurveLine[];
  /** Bench lines of the curves drawn here (inv 19, Q6): built in curveText.ts. */
  curveNotes: { key: string; text: string }[];
}

const capitalise = (d: Dimension): string => d[0].toUpperCase() + d.slice(1);

/** A curve's waste outline at the drawing tolerance, clipped to the face rectangle [0, W] x [0, H] (Sutherland–Hodgman:
 *  a non-convex subject against a convex window), consecutive repeats dropped; null when nothing is left. */
function wasteOnFace(board: Board, c: CurveCut, W: number, H: number): [number, number][] | null {
  let poly: [number, number][] = curveOutline(board, c, DRAWING_CURVE_TOLERANCE, DRAWING_CURVE_SEGMENTS_MAX).pts.map(([x, y]) => [x, y]);
  const sides: ((p: [number, number]) => number)[] = [(p) => p[0], (p) => W - p[0], (p) => p[1], (p) => H - p[1]];
  for (const g of sides) {
    const next: [number, number][] = [];
    for (let i = 0; i < poly.length; i += 1) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      if (g(p) >= 0) next.push(p);
      if ((g(p) >= 0) !== (g(q) >= 0)) {
        const t = g(p) / (g(p) - g(q));
        next.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    }
    poly = next;
    if (poly.length === 0) return null;
  }
  const clean = poly.filter((p, i) => { const q = poly[(i + poly.length - 1) % poly.length]!; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-9; });
  return clean.length >= 3 && Math.abs(twiceArea(clean)) > 1e-12 ? clean : null;
}

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
export function buildDiagrams(board: Board, units: Units): DiagramView[] {
  board = geometryBoard(board);
  const u = units;
  const f = (n: number) => formatLengthBare(n, units);
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
        vUp: (face === 'thickness' && from === 'min') || (face === 'width' && from === 'max') || (face === 'length' && from === 'min'),
        cuts: [],
        holes: [],
        holeSides: [],
        holeNotes: [],
        angles: [],
        cells: [],
        crossings: [],
        curves: [],
        curveLines: [],
        curveNotes: [],
      };
      views.set(key, view);
    }
    return view;
  };

  const solids = pocketCells(board);
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
    const region = clippedRegion(board, cut);
    const s = cutShape(board, cut, solids);
    view.cuts.push({
      id: cut.id,
      h: region[view.horizontal],
      v: region[view.vertical],
      // Every label from the same CutShape the setup line formats (cut-lines
      // spec §2.4), so the drawing and the prose cannot disagree.
      axis: s.pos === view.horizontal ? 'h' : 'v',
      depthLabel: `${f(cut.depth)} deep`,
      offsetLabel: f(s.at[0]),
      widthLabel: f(s.at[1] - s.at[0]),
      kind: s.word,
      // Assembled here, never in the panel: the measured string and the drawn
      // string must be the same string (invariant 19).
      ...(s.stopMin !== null ? { stopMinLabel: f(s.stopMin) } : {}),
      ...(s.stopMax !== null ? { stopMaxLabel: f(s.stopMax) } : {}),
      ...(s.stopMin !== null || s.stopMax !== null
        ? { lengthLabel: f(s.along[1] - s.along[0]) }
        : {}),
    });
  }

  // Angle cuts: each wedge is drawn in EVERY view whose face is the cut's through dimension (spec §4.3,
  // "each face view where a slope shows"), and only the min-side view is opened when neither side exists.
  // Decided after the pocket cuts' views, so a dado's far-side view takes the wedge without a second view.
  for (const c of angleCutsThatRemoveStock(board)) {
    const h = keptHalfSpace(board, c);
    if (!h) continue;
    const face = throughOf(c);
    // Both sides of one face share (horizontal, vertical) and the outline: the polygon, in board inches,
    // is the same in either view (vUp, the far side's flip, is the panel's job).
    const [horizontal, vertical] = DIMENSION_ORDER.filter((d) => d !== face);
    const hi = DIMENSION_ORDER.indexOf(horizontal!);
    const vi = DIMENSION_ORDER.indexOf(vertical!);
    const W = board[horizontal!];
    const H = board[vertical!];
    // The face's rectangle, clipped to the REMOVED side (n·x + d < 0): Sutherland–Hodgman, one edge.
    const rect: [number, number][] = [[0, 0], [W, 0], [W, H], [0, H]];
    const g = ([x, y]: [number, number]) => -(h.n[hi]! * x + h.n[vi]! * y + h.d);
    const poly: [number, number][] = [];
    for (let i = 0; i < rect.length; i += 1) {
      const p = rect[i]!;
      const q = rect[(i + 1) % rect.length]!;
      if (g(p) >= 0) poly.push(p);
      if ((g(p) >= 0) !== (g(q) >= 0)) {
        const t = g(p) / (g(p) - g(q));
        poly.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    }
    // A vertex exactly on the line is kept AND is its own crossing point: drop consecutive repeats.
    const clean = poly.filter((p, i) => { const q = poly[(i + poly.length - 1) % poly.length]!; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-9; });
    if (clean.length < 3) continue;
    const existing = (['min', 'max'] as const).map((from) => views.get(`${face}|${from}`)).filter((v): v is DiagramView => v !== undefined);
    const targets = existing.length > 0 ? existing : [ensure(face, 'min')];
    const label = angleLine(board, c, u);
    for (const view of targets) view.angles.push({ id: c.id, poly: clean.map(([x, y]) => [x, y] as [number, number]), label });
  }

  // Holes (holes spec §4.3, amended). Down the axis: a circle in the ENTRY face's view (opened, like a cut's), and on the
  // exit side of a through hole only when that view already exists. Across the axis: the depth box, only in views that
  // exist for another reason (a hole opens no view of its own across its axis). The note is the row's bench line (inv 19).
  // Three passes so the result never depends on row order: (1) every row opens its entry view; (2) circles, then sides,
  // over the views that now exist; (3) notes, per view, in STORED row order.
  const used = new Map<DiagramView, Set<string>>();
  const mark = (view: DiagramView, r: HoleRow) => {
    if (!used.has(view)) used.set(view, new Set());
    used.get(view)!.add(r.id);
  };
  for (const r of board.holes) ensure(r.face, r.from);
  // Curves (curves spec §5.2, ruling Q5): a curve opens its through face's min side when neither side exists — after
  // every hole has opened its entry view, so a hole's view takes the curve instead of a second view appearing.
  for (const c of board.curves) if (!views.has(`${c.through}|min`) && !views.has(`${c.through}|max`)) ensure(c.through, 'min');
  for (const r of board.holes) for (const h of holeInstances(board, r)) {
    const entry = views.get(`${r.face}|${r.from}`);
    const exit = h.through ? views.get(`${r.face}|${r.from === 'min' ? 'max' : 'min'}`) : undefined;
    for (const view of [entry, exit]) {
      if (!view) continue;
      const hi = DIMENSION_ORDER.indexOf(view.horizontal);
      const vi = DIMENSION_ORDER.indexOf(view.vertical);
      view.holes.push({ row: r.id, index: h.index, h: h.centre[hi]!, v: h.centre[vi]!, r: h.radius });
      mark(view, r);
    }
  }
  for (const r of board.holes) for (const h of holeInstances(board, r)) {
    for (const view of views.values()) {
      if (view.face === r.face) continue;
      const a = DIMENSION_ORDER.indexOf(r.face);
      const s0 = h.centre[a]!;
      const s1 = s0 + h.dir * h.depth;
      const axial: Span = [Math.min(s0, s1), Math.max(s0, s1)];
      const spanOf = (d: Dimension): Span => {
        if (d === r.face) return axial;
        const i = DIMENSION_ORDER.indexOf(d);
        return [h.centre[i]! - h.radius, h.centre[i]! + h.radius];
      };
      const axisIsH = view.horizontal === r.face;
      const bottomAt = h.through ? null : axisIsH ? (h.dir > 0 ? 'hmax' : 'hmin') : (h.dir > 0 ? 'vmax' : 'vmin');
      view.holeSides.push({ row: r.id, index: h.index, h: spanOf(view.horizontal), v: spanOf(view.vertical), axis: axisIsH ? 'h' : 'v', bottomAt });
      mark(view, r);
    }
  }
  for (const [view, ids] of used) for (const r of board.holes) if (ids.has(r.id)) view.holeNotes.push({ row: r.id, text: holeLine(board, r, u) });

  // Curves drawn (spec §5.2; Q5, Q6): the waste in every view of the through face; a line at each SHARP vertex on the
  // viewed face of another view, never along the outline's own edges; the bench lines of whatever this view draws.
  const curveEntries = curveLineEntries(board, u);
  for (const view of views.values()) {
    const drawn = new Set<string>();
    for (const c of board.curves) {
      if (view.face === c.through) {
        const poly = wasteOnFace(board, c, view.h, view.v);
        if (poly) view.curves.push({ id: c.id, poly });
        drawn.add(c.id); // a curve run wholly off its face still lists its (faulted) bench line
        continue;
      }
      const [cu, cv] = uvDims(c.through);
      const F = view.face;
      if (F !== cu && F !== cv) continue;
      const G = F === cu ? cv : cu;
      const { pts, smooth } = curveOutline(board, c);
      pts.forEach((q, i) => {
        if (smooth[i]) return;
        const qF = F === cu ? q[0] : q[1];
        const qG = G === cu ? q[0] : q[1];
        const onFace = view.from === 'min' ? Math.abs(qF) <= 1e-9 : Math.abs(qF - board[F]) <= 1e-9;
        if (!onFace || qG <= 1e-9 || qG >= board[G] - 1e-9) return;
        view.curveLines.push({ id: c.id, along: view.horizontal === c.through ? 'h' : 'v', at: qG });
        drawn.add(c.id);
      });
    }
    for (const e of curveEntries) if (e.ids.some((id) => drawn.has(id))) view.curveNotes.push({ key: e.ids[0]!, text: e.text });
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
