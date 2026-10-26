import type { AngleCut, BandType, Board, CurveCut, CutFrom, Dimension, HoleRow, ProfileSide, RoundTenon, Span } from './types';
import { holeInstances, tiltedHole, type Hole } from './holes';
import { holeLine } from './holeText';
import { DIMENSION_ORDER } from './geometry';
import { pocketCells, clippedRegion, cutShape, cutRemovesNothing, type CutKind } from './cuts';
import { buildDepthField, type FaceCell } from './depthField';
import { formatLengthBare, type Units } from '../units/length';
import { angleCutsThatRemoveStock, keptHalfSpace, throughOf } from './angleCuts';
import { angleLine } from './angleText';
import { curveOutline, spanOf, squareSpan, twiceArea, uvDims } from './curves';
import { builtTenons, endCutOf, shoulderAt } from './roundTenons';
import { curveLineEntries } from './curveText';
import { DRAWING_CURVE_TOLERANCE, DRAWING_CURVE_SEGMENTS_MAX } from './curveDrawing';
import { geometryBoard } from './profiles';
import { builtSwept, sweptInnerLine } from './sweep';
import { bandFaults, sameSide, stripBoard, type Strip } from './banding';
import { bandLine, coreNote } from './bandText';
import { faceOutline, sideStretch } from './profilePath';

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

/**
 * A hole seen down its axis (spec §4.3): a circle, board inches, in the view's (h, v). A TILTED bore's mouth (and a
 * through bore's exit) is an ellipse (angled holes spec §8), and only then carries `rx`, `ry` and `rot`: `rx = r` across
 * the tilt, `ry = r / cos θ` along it, and `rot` the degrees SVG's `rotate()` turns the ellipse's rx axis by from +h
 * toward +v, in (−90, 90] — so the ry axis lies along the bit's lateral travel, at the sightline. A square hole's entry
 * has none of them (diagramIdentity).
 */
export interface DiagramHole { row: string; index: number; h: number; v: number; r: number; rx?: number; ry?: number; rot?: number }
/** A hole seen across its axis: the box of its depth, drawn dashed (the two walls and, when blind, the bottom). */
export interface DiagramHoleSide {
  row: string; index: number; h: Span; v: Span;
  /** Which in-plane axis the hole's depth runs along: its two walls are lines along it. */
  axis: 'h' | 'v';
  /** Where the bottom line is drawn (blind holes only); null for a through hole. */
  bottomAt: 'hmin' | 'hmax' | 'vmin' | 'vmax' | null;
  /**
   * A TILTED bore only (angled holes spec §8): the slanted band's four corners in (h, v) — `[mouth₊, far₊, far₋, mouth₋]`.
   * The walls are mouth₊→far₊ and mouth₋→far₋, the silhouette generators r either side of the bit's projected line; the
   * mouths sit on the entry face, a through bore's far corners on the exit face, a blind bore's at the ends of its bottom
   * disc's projected diameter (square to the bit), the bottom drawn between them. `h` and `v` are then the band's box.
   */
  quad?: [[number, number], [number, number], [number, number], [number, number]];
}

/** A tilted bore's entry or exit ellipse (DiagramHole's doc): the view draws `hi` horizontal, `vi` vertical. */
function tiltedEllipse(h: Hole, hi: number, vi: number): { rx: number; ry: number; rot: number } {
  let rot = (Math.atan2(h.bit[vi]!, h.bit[hi]!) * 180) / Math.PI - 90;
  if (rot <= -90) rot += 180;
  return { rx: h.radius, ry: h.radius * Math.hypot(h.bit[0], h.bit[1], h.bit[2]), rot };
}

/**
 * A tilted bore seen across its axis, in the view of (axial `a`, in-plane `d`): the cylinder's orthographic silhouette is
 * a band 2r wide square to the bit's projection `(dir, bit[d])`, whatever the bit's component along the view. Its walls
 * are the lines ±r·n off the projected axis (n the unit normal to it); each meets the entry face at a mouth corner, a
 * through bore's exit face `reach` further along the bit, and a blind bore's bottom disc at its projected centre ± r·n.
 * Corners as `[axial, d]`.
 */
function tiltedBand(h: Hole, a: number, d: number): [number, number][] {
  const bd = h.bit[d]!;
  const L = Math.hypot(1, bd);
  const n = [-bd / L, h.dir / L];
  const s0 = h.centre[a]!; const c = h.centre[d]!;
  const wall = (k: 1 | -1): [[number, number], [number, number]] => {
    const t = (-k * h.radius * n[0]!) / h.dir;   // slide the offset point along the bit back onto the entry face
    const mouth: [number, number] = [s0, c + k * h.radius * n[1]! + t * bd];
    const far: [number, number] = h.through
      ? [s0 + h.dir * h.reach, mouth[1] + h.reach * bd]
      // A blind bottom is the straight chord between the disc's two silhouette points: exact when the bit lies in the
      // view plane; otherwise the disc's shallow projected bulge is omitted, as a square hole's bottom is a straight line.
      : [s0 + h.dir * h.reach + k * h.radius * n[0]!, c + h.reach * bd + k * h.radius * n[1]!];
    return [mouth, far];
  };
  const [[m1, f1], [m2, f2]] = [wall(1), wall(-1)];
  return [m1, f1, f2, m2];
}

/**
 * A round tenon drawn in a view (round tenons spec §8), board inches: `end` the end of the length it sits on, `diameter`
 * its diameter, `shoulder` the shoulder's length coordinate. Coaxial with the length, so an END view (face `length`) draws a
 * circle of the diameter at the section's centre, and a SIDE view (face width or thickness: `horizontal` is the length)
 * the narrowed outline — the shoulder line across the section at h = `shoulder`, and the tenon's two sides at v = V/2 ± r
 * from the shoulder to the end. Only a tenon that builds is drawn (a faulted one builds nothing).
 */
export interface DiagramTenon {
  end: 'min' | 'max'; diameter: number; shoulder: number;
  /**
   * A SIDE view of a tenon whose end is mitered (fix round 1): where each side stops, the length station at which the
   * side's silhouette generator (v = V/2 − r, then V/2 + r, at the section's centre in depth) meets the end's miter plane.
   * Absent on a square end (the sides run to the end) and on an end view, so the brief's three fields are all a square
   * tenon carries.
   */
  tip?: [number, number];
}

/** A side view's tip stations for a tenon on a mitered end (`DiagramTenon.tip`): each side's generator against the miter's
 *  plane, n·p + d = 0, solved for the length. Null on a square end. */
function tipStations(b: Board, t: RoundTenon, vertical: Dimension): [number, number] | null {
  const cut = endCutOf(b, t.end);
  if (!cut || cut === 'other') return null;   // 'other' never builds (a meets-feature fault); square: no tip
  const h = keptHalfSpace(b, cut);
  if (!h) return null;
  const vi = DIMENSION_ORDER.indexOf(vertical);
  const di = 3 - vi;                          // the view's depth axis (length is 0; width 1, thickness 2)
  const depth = DIMENSION_ORDER[di]!;
  const at = (v: number) => -(h.d + h.n[vi]! * v + h.n[di]! * (b[depth] / 2)) / h.n[0];
  const c = b[vertical] / 2, r = t.diameter / 2;
  return [at(c - r), at(c + r)];
}

/** A curve's waste outline seen down its `through`, clipped to the face, board inches. */
export interface DiagramCurve { id: string; poly: [number, number][] }
/** A line across the part at a curve's sharp outline vertex on this face (`along` the axis it runs, `at` on the other).
 *  A stopped profile's line runs over [lo, hi] along `along` only (its full-profile stretch, P16); absent, end to end. */
export interface DiagramCurveLine { id: string; along: 'h' | 'v'; at: number; lo?: number; hi?: number }

/** Whether a curve reaches its `through` dimension's `from` end face: always, unless a stopped profile stops short of it
 *  (profile runs a2, P16). Only a view of an end the curve reaches shows its waste. */
function reachesEnd(c: CurveCut, from: CutFrom): boolean {
  const span = spanOf(c);
  return !span || !(from === 'min' ? span.stopLo : span.stopHi);
}
/** A stopped profile that reaches neither end face: it is drawn (and noted) in the view of its SIDE face instead. */
function sideOnly(c: CurveCut): CutFrom | null {
  return reachesEnd(c, 'min') || reachesEnd(c, 'max') ? null : c.uFrom;
}

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
  /** Angle cuts seen edge-on as a line: drawn in every view looking along their through dimension (the min side opened when neither exists); a compound miter also in its along dimension's views, each side its own face's wedge (square-set legs §4). Empty for most views. */
  angles: DiagramAngle[];
  /** One line per distinct crossing depth, already formatted. Empty when none. */
  crossings: string[];
  /** Curve waste outlines seen down a curve's `through`, clipped to the face, board inches. */
  curves: DiagramCurve[];
  /** Lines across the part at a curve's sharp outline vertices on this face (Q5). */
  curveLines: DiagramCurveLine[];
  /** Bench lines of the curves drawn here (inv 19, Q6): built in curveText.ts. */
  curveNotes: { key: string; text: string }[];
  /** Swept profiles' inner lines (profile runs b1, Q8): the path offset by the reach, in this face's (h, v), board inches.
   *  Present only on a view that draws one, so every other part's views are byte for byte as they were. */
  sweeps?: { id: string; pts: [number, number][]; closed: boolean }[];
  /** A banded part's heavy marks (edge banding 2, Q1), on every thickness view: each unfaulted band's side stretch along
   *  the FINISHED outline, in (h, v) = (length, width) board inches. Present only on a banded view. */
  bands?: { side: ProfileSide; points: [number, number][] }[];
  /** The band line, then the core note when the core differs (Q1): on the first thickness view only (inv 19: built in
   *  bandText.ts). Present only on a banded part's view. */
  bandNotes?: string[];
  /** A strip's mitred ends' waste (Q7), in the strip's own (h, v) = (cut length, band thickness). Present only on a mitred strip's view. */
  mitres?: { poly: [number, number][] }[];
  /** Round tenons drawn here (round tenons spec §8): on the tenon's own end view and every side view. Present only on a
   *  tenoned part's view, so every other part's views are byte for byte as they were (diagramIdentity). */
  tenons?: DiagramTenon[];
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
 * An angle cut's removed side on one face's rectangle (n·x + d < 0), in the face's (horizontal, vertical) board inches:
 * Sutherland–Hodgman, one edge. `at` is the face's own coordinate along `face` (0 on the min side, the dimension on the
 * max side), read only for a compound cut, whose plane is not square to the face (square-set legs §4); a single-slope
 * cut's plane holds `face`'s direction, so both sides share one polygon and `at` is never read. Null when under 3 vertices remain.
 */
function wedgeOn(board: Board, h: { n: readonly number[]; d: number }, face: Dimension, at?: number): [number, number][] | null {
  const [horizontal, vertical] = DIMENSION_ORDER.filter((d) => d !== face);
  const hi = DIMENSION_ORDER.indexOf(horizontal!);
  const vi = DIMENSION_ORDER.indexOf(vertical!);
  const W = board[horizontal!];
  const H = board[vertical!];
  const off = at === undefined ? h.d : h.n[DIMENSION_ORDER.indexOf(face)]! * at + h.d;
  const rect: [number, number][] = [[0, 0], [W, 0], [W, H], [0, H]];
  const g = ([x, y]: [number, number]) => -(h.n[hi]! * x + h.n[vi]! * y + off);
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
  return clean.length < 3 ? null : clean;
}

/**
 * A compound miter's wedges (square-set legs §4): it slopes across BOTH cross dimensions, so it shows in the views of its
 * through face AND of its along face, each side drawing the plane's own boundary on that side's face (the two sides
 * differ). Per face, every existing view with a non-empty wedge takes it; when neither side exists, the min side is
 * opened, or the max side when only it shows the cut (a cut biting at one corner).
 */
function compoundWedges(board: Board, c: AngleCut, h: { n: readonly number[]; d: number }, label: string,
  views: Map<string, DiagramView>, ensure: (face: Dimension, from: CutFrom) => DiagramView): void {
  for (const face of [throughOf(c), c.along]) {
    const polys = { min: wedgeOn(board, h, face, 0), max: wedgeOn(board, h, face, board[face]) };
    const existing = (['min', 'max'] as const).filter((from) => views.has(`${face}|${from}`));
    const sides = existing.length > 0 ? existing : polys.min ? ['min' as const] : polys.max ? ['max' as const] : [];
    for (const from of sides) {
      const poly = polys[from];
      if (poly) ensure(face, from).angles.push({ id: c.id, poly, label });
    }
  }
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
export function buildDiagrams(board: Board, units: Units, bandTypes: readonly BandType[] = []): DiagramView[] {
  const stored = board;
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

  // Round tenons (round tenons spec §8): only a tenon that builds. Each opens its own END view here, before the angle cuts
  // (so an end's own wedge and a hole's circle are drawn in it), and a side view is opened after every other feature's
  // (below), only when none exists.
  const tenons = builtTenons(stored);
  for (const t of tenons) ensure('length', t.end);

  // Angle cuts: each wedge is drawn in EVERY view whose face is the cut's through dimension (spec §4.3,
  // "each face view where a slope shows"), and only the min-side view is opened when neither side exists.
  // Decided after the pocket cuts' views, so a dado's far-side view takes the wedge without a second view.
  for (const c of angleCutsThatRemoveStock(board)) {
    const h = keptHalfSpace(board, c);
    if (!h) continue;
    if (c.across) { compoundWedges(board, c, h, angleLine(board, c, u), views, ensure); continue; }
    const face = throughOf(c);
    // Both sides of one face share (horizontal, vertical) and the outline: the polygon, in board inches,
    // is the same in either view (vUp, the far side's flip, is the panel's job).
    const clean = wedgeOn(board, h, face);
    if (!clean) continue;
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
  // A stopped profile (P16) counts only the end views it runs out through — the min one opened when neither exists — and,
  // reaching neither, opens its side face's view instead.
  // Swept profiles (profile runs b1, Q8): each opens its face's thickness view — after the holes', before the curves' rule
  // (so a curve whose through face is the thickness takes that view rather than opening the min side). A FAULTED one opens
  // it too and is noted there (Task 8: as a faulted curve lists its line in the view it opened); only a built one draws.
  const swept = board.profiles.length > 0 ? builtSwept(board) : [];
  for (const p of board.profiles) ensure('thickness', p.face);
  // A round tenon's waste rides in the geometry view as view curves (round tenons spec §7): never drawn, lined or noted as a
  // curve here (it is not one to the user); the tenon draws itself below. Every curve loop reads THIS list.
  const curves = board.curves.filter((c) => !squareSpan(c));
  for (const c of curves) {
    const side = sideOnly(c);
    if (side) { ensure(uvDims(c.through)[0], side); continue; }
    const ends = (['min', 'max'] as const).filter((from) => reachesEnd(c, from));
    if (!ends.some((from) => views.has(`${c.through}|${from}`))) ensure(c.through, ends[0]!);
  }
  // A tenoned part with no side view opens the thickness view (the band precedent), so it always shows its shoulder —
  // after every feature has opened its views and before the holes and curves are drawn into them.
  if (tenons.length > 0 && ![...views.values()].some((v) => v.face !== 'length')) ensure('thickness', 'min');
  for (const r of board.holes) for (const h of holeInstances(board, r)) {
    const entry = views.get(`${r.face}|${r.from}`);
    const exit = h.through ? views.get(`${r.face}|${r.from === 'min' ? 'max' : 'min'}`) : undefined;
    for (const view of [entry, exit]) {
      if (!view) continue;
      const hi = DIMENSION_ORDER.indexOf(view.horizontal);
      const vi = DIMENSION_ORDER.indexOf(view.vertical);
      if (tiltedHole(h)) {
        // The exit ellipse sits `reach` along the bit: T·tan θ along the tilt (angled holes spec §8).
        const k = view === exit ? h.reach : 0;
        view.holes.push({ row: r.id, index: h.index, h: h.centre[hi]! + k * h.bit[hi]!, v: h.centre[vi]! + k * h.bit[vi]!, r: h.radius, ...tiltedEllipse(h, hi, vi) });
      } else view.holes.push({ row: r.id, index: h.index, h: h.centre[hi]!, v: h.centre[vi]!, r: h.radius });
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
      if (tiltedHole(h)) {
        const d = DIMENSION_ORDER.indexOf(axisIsH ? view.vertical : view.horizontal);
        const quad = tiltedBand(h, a, d).map(([s, t]) => (axisIsH ? [s, t] : [t, s]) as [number, number]);
        const box = (i: 0 | 1): Span => [Math.min(...quad.map((p) => p[i])), Math.max(...quad.map((p) => p[i]))];
        view.holeSides.push({ row: r.id, index: h.index, h: box(0), v: box(1), axis: axisIsH ? 'h' : 'v', bottomAt, quad: quad as NonNullable<DiagramHoleSide['quad']> });
        mark(view, r);
        continue;
      }
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
    for (const c of curves) {
      if (view.face === c.through) {
        if (!reachesEnd(c, view.from)) continue;   // a stopped end: the end face is whole (P16)
        const poly = wasteOnFace(board, c, view.h, view.v);
        if (poly) view.curves.push({ id: c.id, poly });
        drawn.add(c.id); // a curve run wholly off its face still lists its (faulted) bench line
        continue;
      }
      const [cu, cv] = uvDims(c.through);
      const F = view.face;
      if (F === cu && view.from === sideOnly(c)) drawn.add(c.id);   // noted on its side face (P16)
      const span = spanOf(c);
      if (F !== cu && F !== cv) continue;
      const G = F === cu ? cv : cu;
      const { pts, smooth } = curveOutline(board, c);
      pts.forEach((q, i) => {
        if (smooth[i]) return;
        const qF = F === cu ? q[0] : q[1];
        const qG = G === cu ? q[0] : q[1];
        const onFace = view.from === 'min' ? Math.abs(qF) <= 1e-9 : Math.abs(qF - board[F]) <= 1e-9;
        if (!onFace || qG <= 1e-9 || qG >= board[G] - 1e-9) return;
        view.curveLines.push({ id: c.id, along: view.horizontal === c.through ? 'h' : 'v', at: qG, ...(span ? { lo: span.lo, hi: span.hi } : {}) });
        drawn.add(c.id);
      });
    }
    if (view.face === 'thickness') for (const p of board.profiles) {
      if (p.face !== view.from) continue;
      drawn.add(p.id);   // a faulted (unbuilt) one still lists its bench line here
      if (!swept.includes(p)) continue;
      const line = sweptInnerLine(board, p);
      if (!line) continue;
      // The thickness view's horizontal is length and its vertical width: plan (u, v) as they are.
      (view.sweeps ??= []).push({ id: p.id, pts: line.pts.map(([x, y]) => [x, y] as [number, number]), closed: line.closed });
    }
    for (const e of curveEntries) if (e.ids.some((id) => drawn.has(id))) view.curveNotes.push({ key: e.ids[0]!, text: e.text });
  }

  // A banded part's marks (edge banding 2, Q1): every thickness view carries them, a thickness view opened when there is
  // none. The part is drawn at its FINISHED size, so the marks are the finished outline's side stretches (model points,
  // judged on the STORED part as banding.ts does). A faulted band is not marked; it still shows in the band line.
  const banded = bandTypes.length > 0 && stored.bands.length > 0 && bandLine(stored, bandTypes, units) !== null;
  if (banded) {
    const faults = bandFaults(stored, bandTypes);
    const outline = faceOutline(stored);
    const marks: NonNullable<DiagramView['bands']> = [];
    for (const b of stored.bands) {
      if (!bandTypes.some((t) => t.id === b.type) || faults.some((f) => sameSide(f.side, b.side))) continue;
      const st = outline ? sideStretch(stored, outline, b.side) : null;
      if (!outline || !st) continue;
      const n = outline.chords.length;
      const points: [number, number][] = [];
      for (let i = st.from; ; i = (i + 1) % n) {
        const c = outline.chords[i]!;
        if (points.length === 0) points.push([c.a[0] + 0, c.a[1] + 0]);
        points.push([c.b[0] + 0, c.b[1] + 0]);
        if (i === st.to) break;
      }
      marks.push({ side: b.side, points });
    }
    if (![...views.values()].some((v) => v.face === 'thickness')) ensure('thickness', 'min');
    if (marks.length > 0) {
      for (const v of views.values()) if (v.face === 'thickness') v.bands = marks.map((m) => ({ side: m.side, points: m.points.map((p) => [p[0], p[1]] as [number, number]) }));
    }
  }

  // Round tenons drawn (round tenons spec §8): on each tenon's own end view and on every side view.
  if (tenons.length > 0) {
    for (const v of views.values()) {
      const here = tenons.filter((t) => v.face !== 'length' || v.from === t.end);
      if (here.length === 0) continue;
      v.tenons = here.map((t) => {
        const tip = v.face === 'length' ? null : tipStations(stored, t, v.vertical);
        return { end: t.end, diameter: t.diameter, shoulder: shoulderAt(stored, t), ...(tip ? { tip } : {}) };
      });
    }
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
  if (banded) {
    // The notes ride on the FIRST thickness view in the final order, once (Q1).
    const note = [bandLine(stored, bandTypes, units)!, coreNote(stored, bandTypes, units)].filter((x): x is string => x !== null);
    out.find((v) => v.face === 'thickness')!.bandNotes = note;
  }
  return out;
}

/**
 * A strip's diagrams (edge banding 2, Q7): its blank (chunk 1's view: cut length × band thickness) with each mitred
 * end's waste as a polygon. The long point sits on v = 0 (the strip's finished edge), half the length allowance in from
 * the blank's end; the short point on v = width, `width · tan(mitre)` further in. A square-ended strip is exactly
 * `buildDiagrams(stripBoard(s), units)`.
 */
export function stripDiagrams(s: Strip, units: Units): DiagramView[] {
  const views = buildDiagrams(stripBoard(s), units);
  if (s.ends.every((e) => e.mitre === null)) return views;
  const w = s.width, h = s.length, a = (s.length - s.finished) / 2;
  const mitres: NonNullable<DiagramView['mitres']> = [];
  s.ends.forEach((e, k) => {
    if (e.mitre === null) return;
    const n = w * Math.tan(e.mitre);
    mitres.push({ poly: k === 0 ? [[0, 0], [a, 0], [a + n, w], [0, w]] : [[h, 0], [h - a, 0], [h - a - n, w], [h, w]] });
  });
  views[0]!.mitres = mitres;
  return views;
}
