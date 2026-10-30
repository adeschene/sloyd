import { keptHalfSpace } from './angleCuts';
import { partGeometry } from './bodies';
import { localSegments, spanOf, squareSpan, uvDims } from './curves';
import { builtTenons, onTenonSurface, shoulderAt } from './roundTenons';
import { builtDovetails, dovetailCorners } from './dovetails';
import type { P2 } from './curves';
import { clippedRegion, cutRemovesNothing, stockProbe } from './cuts';
import type { Point } from './cuts';
import { DIMENSION_ORDER, axisFrame, boardExtents, fromWorldOffset, positionAxisOf, toWorldOffset } from './geometry';
import type { Board, Cut, Guide, TapeAxis } from './types';
import { isGuideLine, isGuidePoint } from './types';
import { canonicalLine, lineThrough, newLineOf, sameLine, sameNewLine } from './lineModel';
import type { NewLine, Vec3 } from './lineModel';

export { canonicalLine, lineThrough, newLineOf, sameLine, sameNewLine };
export type { NewLine, Vec3 };
import { geometryBoard, shapedPart } from './profiles';
import { builtSwept, keptSection, oneSideCurve, sweptStops } from './sweep';
import { sectionFrame } from './runout';
import { leanMap } from './lean';
import { tiltedHole } from './holes';

/**
 * What a snap point sits on. Drives the marker's colour, and nothing else —
 * every kind snaps identically.
 */
export type SnapKind = 'corner' | 'edge-mid' | 'face-center' | 'guide' | 'line' | 'line-cross';

/**
 * What a snap point belongs to.
 *
 * A discriminated union rather than a bare board id — see the snap-move
 * design's §2.3. The guide-points round is the first member to arrive, and it
 * arrived exactly as predicted: a new provider, no change to pickSnapPoint.
 *
 * READ THE TYPE, NOT THE ID. Both members carry `id: string`, so `owner.id`
 * typechecks on the union while meaning two different things. Every consumer
 * that means "this board" must narrow on `owner.type === 'board'` first.
 *
 * `cross` exists only on a line crossing (construction-lines spec §4.2): `id` is
 * the first line in array order, `cross` the second. "Owned by guide G" then
 * means `ownedByGuide`, never `owner.id === G` alone.
 */
export type SnapOwner =
  | { type: 'board'; id: string }
  | { type: 'guide'; id: string; cross?: string };

export interface SnapPoint {
  kind: SnapKind;
  /** World position, inches. */
  at: [number, number, number];
  owner: SnapOwner;
}

/**
 * A snap point that belongs to a board — the box lattice and the cut-owned
 * points, which is everything both providers in this module produce.
 *
 * Exists so `grabbed` can be typed as one. The Move tool grabs boards and
 * targets anything (design §3.1), and this is what makes the grab half of that
 * rule CHECKABLE rather than remembered: eight reads in store.ts assume
 * `owner.id` names a board, seven of them are correct only because MoveTool's
 * candidate memo never offers a guide as a grab source, and an invariant
 * enforced two modules away is what the next round breaks. Narrowing the field
 * is the least accidental form available.
 *
 * `tapeAnchor` is deliberately NOT this type. The difference between the two
 * fields is now the documentation of which one can hold a guide.
 */
export type BoardSnapPoint = SnapPoint & { owner: { type: 'board'; id: string } };

/**
 * Whether two picks are the same point, by value.
 *
 * `boardSnapPoints` rebuilds its array on every call, so two picks of the same
 * corner are never reference-equal. This is what lets the hover state be
 * committed to React only when the pick actually changes rather than on every
 * pointermove — the same "re-evaluate continuously, commit only on change"
 * pattern AdaptiveGrid uses for grid tiers.
 *
 * Lives here rather than beside pickSnapPoint because the store needs it too
 * (invariant 24's cut-edit clause) and the store cannot import from viewport.
 * One home, not a re-export from two.
 */
export function sameSnapPoint(a: SnapPoint | null, b: SnapPoint | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.kind === b.kind &&
    a.owner.type === b.owner.type &&
    a.owner.id === b.owner.id &&
    // Two crossings on the same first line differ only here.
    (a.owner.type === 'guide' && b.owner.type === 'guide' ? a.owner.cross === b.owner.cross : true) &&
    a.at[0] === b.at[0] &&
    a.at[1] === b.at[1] &&
    a.at[2] === b.at[2]
  );
}

/**
 * A board's 26 snap candidates: 8 corners, 12 edge midpoints, 6 face centres.
 *
 * A board is always an axis-aligned box (rotation is one of four quarter turns
 * about Y, posture only names which dimension points up), so the candidates
 * are the 3x3x3
 * lattice of {min, mid, max} on each world axis. The number of axes sitting at
 * `mid` is exactly what names the kind: none is a corner, one is an edge
 * midpoint, two is a face centre — and three is the volume centre, which is
 * skipped. It is the one lattice point with no feature under it to draw a
 * marker against, so an indicator there would appear to hang in mid-air.
 *
 * Holes add their centres (entry face, and exit when through); the mouth withholds lattice points through
 * `stockProbe`.
 *
 * Pure, and derived on demand: nothing about snap points is stored, the same
 * way the cut list, the diagrams and the nesting are derived.
 *
 * Filtered through `stockProbe` too, not just `cutSnapPoints` — added after a
 * browser pass found a rabbet's flush end (`offset === 0`) reaches the
 * board's own surface, so the three mouth positions the cut provider
 * correctly withholds are, by construction, box-lattice points too. This
 * function never consulted `cuts` before that pass, so it kept offering them:
 * markers sitting a quarter-inch out in the air (design §5.1). The one
 * exception is the same one `cutSnapPoints`/`stockProbe` already make: when
 * `boardBodies` is empty (a board its own cuts consumed entirely), all 26
 * stay, because `BoardMesh` still draws a translucent ghost box at the AABB
 * (invariant 21) — the box points sit on a drawn feature even though every
 * cell is empty. That is an explicit `partGeometry(board).bodies.length === 0` check
 * rather than "the filtered set came back empty": a board could in principle
 * have every box point sit in removed stock while stock remains in its
 * middle, and those are not the same condition.
 *
 * A board with no cuts and no angle cuts returns before either check runs any grid arithmetic
 * at all, the same zero-cost guarantee `pocketCells`/`cutSnapPoints` make in
 * their first line. Bodies and edges come from `partGeometry`, cached by board-local geometry:
 * a gizmo drag rebuilds every world part each frame (new objects, new positions), and only the
 * part whose dimensions or cuts changed recomputes them (angle-cuts final review measured
 * ~17 ms per frame for four tapered, mortised legs and four aprons without the cache, ~1 ms
 * with it). `stockProbe` still builds its own cell grid per call — reusing one grid would mean
 * reaching into `cuts.ts`'s private `grid()`, which stays unexported on purpose — and that
 * remainder was measured, not assumed, to be small.
 */
export function boardSnapPoints(board: Board): BoardSnapPoint[] {
  const points = preLeanSnapPoints(board);
  // Splayed legs §6.2: built and filtered in the pre-lean placement, where `stockProbe`'s closed spans are exact, then
  // mapped through the lean. Not filtered after `fromWorld`: the inverse's round-trip noise (~1e-15) would drop a point
  // on a face out of a closed span. An unleaned part returns today's array itself.
  const lean = leanMap(board);
  return lean ? points.map((p) => ({ ...p, at: lean.apply(p.at) })) : points;
}

/** `boardSnapPoints` before the lean: today's lattice and feature points, in world inches of the pre-lean placement. */
function preLeanSnapPoints(board: Board): BoardSnapPoint[] {
  const stored = board;
  board = geometryBoard(board);
  const [ex, ey, ez] = boardExtents(board);
  const [px, py, pz] = board.position;
  // `position` is the min-corner, not the centre — see invariant 2.
  const xs = [px, px + ex / 2, px + ex];
  const ys = [py, py + ey / 2, py + ey];
  const zs = [pz, pz + ez / 2, pz + ez];
  // Annotated as BoardSnapPoint['owner'], not as the wide SnapOwner: the wide
  // annotation would not narrow, and the return type is what would fail.
  const owner: BoardSnapPoint['owner'] = { type: 'board', id: board.id };

  const points: BoardSnapPoint[] = [];
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      for (let k = 0; k < 3; k += 1) {
        const mids = (i === 1 ? 1 : 0) + (j === 1 ? 1 : 0) + (k === 1 ? 1 : 0);
        if (mids === 3) continue;
        const kind: SnapKind =
          mids === 0 ? 'corner' : mids === 1 ? 'edge-mid' : 'face-center';
        points.push({ kind, at: [xs[i], ys[j], zs[k]], owner });
      }
    }
  }

  if (board.cuts.length === 0 && board.angleCuts.length === 0 && board.holes.length === 0 && !shapedPart(board)) return points;
  const geometry = partGeometry(board);
  if (geometry.bodies.length === 0) return points;

  // World → part goes through fromWorldOffset: a turn may reverse any
  // horizontal axis, so a world offset is not the part coordinate there.
  const frame = axisFrame(board);
  const touchesStock = stockProbe(board);
  const lattice = points.filter((p) => {
    // Complete only because `axisFrame` is a full permutation of the three dimensions — the cast cannot check it (fu 128).
    const local = {} as Point;
    for (let i = 0; i < 3; i += 1) {
      local[frame[i]!.dim] = fromWorldOffset(board, i, p.at[i]! - board.position[i]!);
    }
    return touchesStock(local);
  });
  // Hole centres (holes spec §3.5, amended): on the entry face, and the exit face when through, kind 'face-center',
  // owned by the board. A centre sits in AIR — a deliberate exception to invariant 16's marker rule: it is the centre
  // of a drawn rim, and the Tape tool measures centre to centre from it. Deduped by distance against the lattice.
  const close = (a: readonly number[], b: readonly number[]) => a.every((v, i) => Math.abs(v - b[i]!) <= 1e-9);
  // A tilted bore's exit centre is where the bit's line meets the exit face (angled holes spec §8): `reach` along the bit.
  for (const h of geometry.holes) {
    const ends = h.through ? [0, h.depth] : [0];
    for (const t of ends) {
      const c = [...h.centre];
      if (t !== 0 && tiltedHole(h)) for (let i = 0; i < 3; i += 1) c[i] = h.centre[i]! + h.reach * h.bit[i]!;
      else c[DIMENSION_ORDER.indexOf(h.axis)] += h.dir * t;
      const at = placed(board, { length: c[0]!, width: c[1]!, thickness: c[2]! });
      if (!lattice.some((q) => close(q.at, at))) lattice.push({ kind: 'face-center', at, owner });
    }
  }
  // A counterbore's FLOOR centre (counterbores spec §6.2): on the axis at `headDepth` (= its head's reach), beside the mouth
  // centre; the rim of the step is drawn, so the centre is a drawn ring's, in air. A countersink adds nothing.
  for (const h of geometry.holes) {
    if (h.head?.kind !== 'counterbore' || tiltedHole(h) || h.head.reach >= h.depth) continue;   // no floor past the far face
    const c = [...h.centre];
    c[DIMENSION_ORDER.indexOf(h.axis)] += h.dir * h.head.reach;
    const at = placed(board, { length: c[0]!, width: c[1]!, thickness: c[2]! });
    if (!lattice.some((q) => close(q.at, at))) lattice.push({ kind: 'face-center', at, owner });
  }
  // Curve points (curves spec §3.5, P5): each arc's ends ('corner'), crown ('edge-mid') and centre ('face-center', which
  // may sit in air — the hole-centre exception to invariant 16: it is the centre of a drawn arc), on both faces square to
  // `through`; a point outside the face rectangle is not offered. Deduped by distance against the lattice.
  // A swept profile's waste (profile runs b1, invariant 16): an arc's end or crown on the profiled face is in it and is not
  // offered (its centre keeps the hole-centre exception). Judged only when the view builds a swept profile, so every other
  // part's marks are byte for byte as before.
  const swept = board.profiles.length > 0 && builtSwept(board).length > 0;
  for (const c of board.curves) {
    // A round tenon's view curves (round tenons spec §7) are not curves to the user: its own two points follow.
    if (squareSpan(c)) continue;
    const [u, v] = uvDims(c.through);
    const inFace = (q: P2) => q[0] >= -1e-9 && q[0] <= board[u] + 1e-9 && q[1] >= -1e-9 && q[1] <= board[v] + 1e-9;
    for (const s of localSegments(board, c)) {
      if (s.kind !== 'arc') continue;
      const marks: [P2, SnapKind][] = [[s.a, 'corner'], [s.b, 'corner'], [s.crown, 'edge-mid'], [s.centre, 'face-center']];
      for (const [q, kind] of marks) {
        if (!inFace(q)) continue;
        // A stopped profile (P17): marks on an end face only where it runs out through that end; its arc ends sit on the stops.
        const sp = spanOf(c);
        const ts = sp
          ? [...(sp.stopLo ? [] : [0]), ...(sp.stopHi ? [] : [board[c.through]]), ...(kind === 'corner' ? [...(sp.stopLo ? [sp.lo] : []), ...(sp.stopHi ? [sp.hi] : [])] : [])]
          : [0, board[c.through]];
        for (const t of ts) {
          const local = { [u]: q[0], [v]: q[1], [c.through]: t } as Point;
          if (swept && kind !== 'face-center' && !touchesStock(local)) continue;
          const at = placed(board, local);
          if (!lattice.some((x) => close(x.at, at))) lattice.push({ kind, at, owner });
        }
      }
    }
  }
  // A swept profile's stops (profile runs b2, P17, Q25): at each stop the section's two junction points on the stop plane —
  // (s, t) = (reach, 0) on the broad face and (0, depth) on the side face, `keptSection`'s — are 'corner's, at `at + s·N` in
  // plan and `vFace + vIn·t` through the thickness (`sectionFrame`). Only a stop has frames (`sweptStops`: a loop, an End to
  // end and a B1 station none), so every other part's marks are byte for byte as before. Kept only on stock (invariant 16).
  if (swept) {
    for (const p of builtSwept(board)) {
      const frames = sweptStops(board, p);
      if (frames.length === 0) continue;
      const { reach, depth } = keptSection(board, p);
      const f = sectionFrame(board, oneSideCurve(p));
      for (const fr of frames) {
        for (const [s, t] of [[reach, 0], [0, depth]] as const) {
          const local: Point = { length: fr.at[0] + s * fr.N[0], width: fr.at[1] + s * fr.N[1], thickness: f.vFace + f.vIn * t };
          if (!touchesStock(local)) continue;
          const at = placed(board, local);
          if (!lattice.some((x) => close(x.at, at))) lattice.push({ kind: 'corner', at, owner });
        }
      }
    }
  }
  // A round tenon's two points (round tenons spec §7), 'face-center', on the axis (the section's centre): the TIP's centre,
  // where the axis meets the end face, square or mitered (the tenon's length out from the shoulder), and the shoulder RING's
  // centre, which sits inside the tenon's wood — the hole-centre exception to invariant 16 (the centre of a drawn ring), so
  // it is not put to `touchesStock`. Only a tenon that builds (a faulted one draws no ring). Deduped against the lattice.
  for (const t of builtTenons(stored)) {
    const shoulder = shoulderAt(board, t);
    for (const length of [shoulder, t.end === 'max' ? shoulder + t.length : shoulder - t.length]) {
      const at = placed(board, { length, width: board.width / 2, thickness: board.thickness / 2 });
      if (!lattice.some((x) => close(x.at, at))) lattice.push({ kind: 'face-center', at, owner });
    }
  }
  // A dovetail's corners at the outside plane (a half-blind pin's sit on the lap plane; dovetails spec §3.5), 'corner': each tail's end corners (tails) and each pin's
  // narrow corners (pins), on wood by construction (`dovetailCorners`); the sockets are air to `stockProbe`, so the lattice
  // above offers nothing in one. Only a dovetail that builds. Deduped against the lattice.
  for (const d of builtDovetails(stored)) {
    for (const p of dovetailCorners(board, d)) {
      const at = placed(board, p);
      if (!lattice.some((x) => close(x.at, at))) lattice.push({ kind: 'corner', at, owner });
    }
  }
  if (board.angleCuts.length === 0) return lattice;

  // A sloped face's corners (angle-cuts spec §3.6) are the endpoints of drawn edges lying on an angle cut's
  // plane — a marker on a drawn feature (invariant 16's general rule).
  const planes = board.angleCuts.flatMap((c) => { const h = keptHalfSpace(board, c); return h ? [h] : []; });
  const onSlope = (p: Point) => planes.some((h) => Math.abs(h.n[0] * p.length + h.n[1] * p.width + h.n[2] * p.thickness + h.d) <= 1e-9);
  // Dedupe by distance, not by exact key: clipped body vertices carry ~1e-14 noise, so a sloped corner that
  // coincides with a lattice corner would never match its exact coordinates. The first point found wins.
  const near = (a: readonly number[], b: readonly number[]) => a.every((v, i) => Math.abs(v - b[i]!) <= 1e-9);
  // A built tenon's mitered tip is a ring of chords ON the miter's plane: its vertices are the tenon's, not the sloped
  // face's corners (ruling T4b; fix round 1), so they are not offered. Asked only of a tenoned part, so every other part's
  // marks (a curved part with an angle cut included) are as before.
  const tenoned = builtTenons(stored).length > 0;
  for (const [a, b] of geometry.edges) {
    for (const p of [a, b]) {
      if (!onSlope(p)) continue;
      if (tenoned && onTenonSurface(stored, p)) continue;
      const at = placed(board, p);
      if (lattice.some((q) => near(q.at, at))) continue;
      lattice.push({ kind: 'corner', at, owner });
    }
  }
  return lattice;
}

/**
 * A point in the board's own space, in world inches.
 *
 * `position` is the min-corner (invariant 2) and axisFrame says which board
 * dimension runs along each world axis and in which direction, so this is the
 * corner plus toWorldOffset — a bare addition only on an axis the turn does
 * not reverse.
 *
 * Deliberately NOT pointToLocalXYZ or solidWorldBox: both of those return
 * coordinates relative to the board's CENTRE, because BoardMesh hangs solids
 * in a <group> at boardCenter(board). Using either here puts every point off
 * by half the board — which looks entirely plausible in a screenshot, and is
 * why the tests pose the fixture rather than sitting it flat at the origin.
 * Two distinct poses are exercised with hand-derived coordinates (not just
 * one): a second pose with a different axisFrame mapping on all three
 * axes is what actually proves this reads the mapping rather than
 * hard-coding one board's arrangement of it.
 *
 * Exported as the ONE home of the part→world point mapping; `drawing.ts` reads edges through it (plans-sheet spec §2.1).
 */
export function toWorld(board: Board, p: Point): [number, number, number] {
  const at = placed(board, p);
  // Splayed legs §6.1 R1: then the lean, for a leaning part; an unleaned part takes today's mapping alone.
  const lean = leanMap(board);
  return lean ? lean.apply(at) : at;
}

/** The pre-lean placement: the min corner plus `toWorldOffset` on each world axis (invariants 2, 44). */
function placed(board: Board, p: Point): [number, number, number] {
  const frame = axisFrame(board);
  return [0, 1, 2].map(
    (i) => board.position[i]! + toWorldOffset(board, i, p[frame[i]!.dim]),
  ) as [number, number, number];
}

/**
 * A world point in the board's own space: `toWorld`'s inverse, exact for an unleaned part (splayed legs §6.2). The
 * lean's `inverse` first, for a leaning part, then `fromWorldOffset` on each world axis (a turn may reverse any horizontal
 * axis, inv 44). On a leaning part the round trip carries float noise (~1e-15): never feed it to an exact closed-span test where the
 * pre-lean point is to hand (`boardSnapPoints` filters before it maps).
 */
export function fromWorld(board: Board, at: readonly number[]): Point {
  const lean = leanMap(board);
  const q = lean ? lean.inverse([at[0]!, at[1]!, at[2]!]) : at;
  const frame = axisFrame(board);
  // Complete only because `axisFrame` is a full permutation of the three dimensions — the cast cannot check it (fu 128).
  const local = {} as Point;
  for (let i = 0; i < 3; i += 1) local[frame[i]!.dim] = fromWorldOffset(board, i, q[i]! - board.position[i]!);
  return local;
}

/**
 * The up-to-17 points one cut defines, in the board's own space, before any
 * test of whether the stock under them still exists.
 *
 * Two rectangles at the two ends of the cut's depth axis. The FLOOR gets all
 * nine combinations of {min, mid, max} on the position and across axes. The
 * MOUTH — the plane at the board's own surface — gets the eight around its
 * opening, every combination but the centre, which sits in the hole rather
 * than on wood. That is the volume-centre exclusion of design §2.1, one
 * dimension down. A through-cut's two across-end midpoints are on no wood and
 * stockProbe drops them, which is why a dado still offers 15.
 *
 * The exclusion is definitional — it says what a cut OFFERS — and is a
 * separate question from whether stock remains, which stockProbe answers. On a
 * plain dado the two happen to agree (the cells above the mouth's middle row
 * are the cut's own, and empty), but they are not the same rule and neither is
 * a substitute for the other.
 *
 * Kind comes from counting the mids among the two IN-PLANE axes, which is
 * boardSnapPoints' rule applied in the rectangle rather than in the box.
 */
function pointsOfCut(board: Board, cut: Cut): { at: Point; kind: SnapKind }[] {
  // No position axis exists when a cut names one dimension twice, so it
  // defines no rectangle. cutRegion guards the same case for the same reason,
  // and neither may lean on document.ts's validator dropping such a cut on
  // load: a Board built directly can reach here without being validated. It also carries the `as unknown as Point` cast
  // below: with face === across that object would set only two of the three dimensions (fu 128).
  if (cut.face === cut.across) return [];

  const pos = positionAxisOf(cut.face, cut.across);
  // The CLIPPED box: a marker must sit on a feature that is drawn (invariant 16, fu 197).
  const region = clippedRegion(board, cut);
  const [faceLo, faceHi] = region[cut.face];
  // `from` names the surface the cut enters, so the floor is the far side.
  const mouth = cut.from === 'min' ? faceLo : faceHi;
  const floor = cut.from === 'min' ? faceHi : faceLo;

  const spread = (span: readonly [number, number]) => [span[0], (span[0] + span[1]) / 2, span[1]];
  const poss = spread(region[pos]);
  const acrosses = spread(region[cut.across]);

  const out: { at: Point; kind: SnapKind }[] = [];
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      const mids = (i === 1 ? 1 : 0) + (j === 1 ? 1 : 0);
      const kind: SnapKind =
        mids === 0 ? 'corner' : mids === 1 ? 'edge-mid' : 'face-center';
      // The mouth offers its whole opening except the centre, which sits in
      // the hole. On a stopped cut the stopped ends are wood and their
      // midpoints are real features; on a through-cut those two points sit
      // where the opening meets the board's edge, and stockProbe removes them
      // (pinned: every through-cut offers exactly what it did before stops).
      const planes = i === 1 && j === 1 ? [floor] : [floor, mouth];
      for (const plane of planes) {
        out.push({
          at: {
            [pos]: poss[i],
            [cut.across]: acrosses[j],
            [cut.face]: plane,
          } as unknown as Point,
          kind,
        });
      }
    }
  }
  return out;
}

/**
 * A board's cut-owned snap candidates: up to 17 per cut (15 for a plain through
 * dado), minus any whose stock is gone.
 *
 * The second provider the snap-move design's §2.3 was built for — pickSnapPoint
 * consumes SnapPoint[] and never sees a Board, so this is an addition rather
 * than a change to the picker. The owner stays the BOARD: a shoulder belongs to
 * the part it was cut into, which is what keeps commitSnapMove's ownership
 * guard and MoveTool's self-snap filter working unchanged.
 *
 * A board with no cuts returns immediately without building a grid, so joinery
 * still costs nothing at all for the boards that do not use it — the same
 * guarantee pocketCells makes in its first line.
 */
export function cutSnapPoints(board: Board): BoardSnapPoint[] {
  if (board.cuts.length === 0) return [];
  const touchesStock = stockProbe(board);
  const owner: BoardSnapPoint['owner'] = { type: 'board', id: board.id };
  // `toWorld`'s two steps, the lean's map built once per part rather than once per point.
  const lean = leanMap(board);
  const world = (p: Point) => (lean ? lean.apply(placed(board, p)) : placed(board, p));

  const out: BoardSnapPoint[] = [];
  for (const cut of board.cuts) {
    // A cut a board edit has left removing nothing draws nothing, so it offers
    // nothing (invariant 16). Without this, a cut sitting exactly at the board's
    // end put shoulder points on the end face that stockProbe's closed spans
    // keep, and crossed stops collapsed onto a box corner (follow-up 178).
    if (cutRemovesNothing(board, cut)) continue;
    for (const { at, kind } of pointsOfCut(board, cut)) {
      if (!touchesStock(at)) continue;
      out.push({ kind, at: world(at), owner });
    }
  }
  return out;
}

/**
 * Everything on a board that can be snapped to or from.
 *
 * ONE function rather than two concatenations at the call sites, because
 * MoveTool needs the same set in both branches of its candidate memo and two
 * expressions that agree today are two places for a future rule to disagree
 * (follow-up 113).
 */
export function snapPointsFor(board: Board): BoardSnapPoint[] {
  return [...boardSnapPoints(board), ...cutSnapPoints(board)];
}

/**
 * One candidate per guide point.
 *
 * The whole of what the guide-points round needed from this module. Boards
 * offer 26 derived points; a guide offers the one position it is.
 */
export function guideSnapPoints(guides: Guide[]): SnapPoint[] {
  return guides.filter(isGuidePoint).map((g) => ({
    kind: 'guide' as const,
    at: [g.at[0], g.at[1], g.at[2]] as [number, number, number],
    owner: { type: 'guide' as const, id: g.id },
  }));
}

/**
 * Where two construction lines of different axes meet (construction-lines
 * spec §4.2): they agree EXACTLY on the third axis `k`. Exact on purpose — a
 * crossing is a point the user can snap to, and an ulp of disagreement means
 * the lines miss. Each pair is offered once, first in array order as `id`.
 * A crossing with a coordinate beyond ±`extent` is not offered: the lines are
 * drawn only that far, and a marker past their end sits on nothing.
 */
export function lineCrossings(guides: Guide[], extent: number): SnapPoint[] {
  const lines = guides.filter(isGuideLine);
  const out: SnapPoint[] = [];
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i];
      const b = lines[j];
      if (a.axis === b.axis) continue;
      const ia = AXIS_INDEX[a.axis];
      const ib = AXIS_INDEX[b.axis];
      const k = 3 - ia - ib;
      if (a.at[k] !== b.at[k]) continue;
      const at: [number, number, number] = [0, 0, 0];
      at[ia] = b.at[ia];
      at[ib] = a.at[ib];
      at[k] = a.at[k];
      if (at.some((c) => Math.abs(c) > extent)) continue;
      out.push({ kind: 'line-cross', at, owner: { type: 'guide', id: a.id, cross: b.id } });
    }
  }
  return out;
}

/** The ONE list of guide-owned candidates both the Move and Tape tools offer. */
export function guideCandidates(guides: Guide[], extent: number): SnapPoint[] {
  return [...guideSnapPoints(guides), ...lineCrossings(guides, extent)];
}

/**
 * The line a tape would place (construction-lines spec §3.2; oblique-lines spec §2.1): an axis the user pressed and
 * nothing typed is that axis's line; no axis, nothing typed and a hovered point is the line through the anchor and the
 * hover. Typed text means a distance instead.
 */
export function tapeLineFor(
  anchor: Vec3 | null,
  axis: TapeAxis | null,
  typed: string,
  hover: Vec3 | null,
): NewLine | null {
  if (!anchor || typed.trim() !== '') return null;
  if (axis) return canonicalLine(anchor, axis);
  return hover ? lineThrough(anchor, hover) : null;
}

/** Whether a snap point belongs to guide `id`, as a point or as either line of a crossing. */
export function ownedByGuide(p: SnapPoint | null, id: string): boolean {
  return !!p && p.owner.type === 'guide' && (p.owner.id === id || p.owner.cross === id);
}

/**
 * A position `distance` from `anchor`, along the ray toward `toward`.
 *
 * One subtraction and one scale, and the three things a user might want are
 * NOT three code paths — they are three values of one free parameter:
 *
 *   distance <  |toward - anchor|  ->  between the two points
 *   distance >  |toward - anchor|  ->  past the target, same ray
 *   distance <  0                  ->  backward from the anchor
 *
 * Returns null for a zero-length direction rather than normalising it.
 * Normalising the zero vector yields NaN on every component, and that is not
 * a theoretical case: it is what happens the moment the cursor returns to the
 * point it started on. NaN coordinates would enter the document and pass every
 * downstream check as "a number". Same shape as commitSnapMove's zero-delta
 * guard — a guard with a named failure mode, not defensive habit — except that
 * one prevents a no-op undo entry and this one prevents corrupt geometry.
 *
 * A non-finite `distance` is refused for the same reason: parseLength returns
 * null for unparseable input, but a caller that skipped it must not be able to
 * write Infinity into a position.
 */
export function offsetPoint(
  anchor: [number, number, number],
  toward: [number, number, number],
  distance: number,
): [number, number, number] | null {
  if (!Number.isFinite(distance)) return null;
  const dx = toward[0] - anchor[0];
  const dy = toward[1] - anchor[1];
  const dz = toward[2] - anchor[2];
  const length = Math.hypot(dx, dy, dz);
  if (length === 0) return null;
  const k = distance / length;
  return [anchor[0] + dx * k, anchor[1] + dy * k, anchor[2] + dz * k];
}

export type { TapeAxis };

const AXIS_INDEX: Record<TapeAxis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 };

/**
 * The point a typed distance runs TOWARD, in either of the tape's two modes.
 *
 * ONE function called from BOTH `TapeTool`'s preview memo and `TapeReadout`'s
 * commit, which is the whole point of its existence. The round-2 guarantee was
 * that the marker and the placement agree by construction rather than by two
 * pieces of code being written to match, and it rested on both paths sharing
 * `offsetPoint`. Axis mode changes what `toward` IS, so if each side computed
 * its own the guarantee would be half true — arithmetic shared, direction not.
 *
 * Locked: the anchor plus one inch along the axis. The length is deliberately
 * exactly 1 and never 0, which is what makes `offsetPoint`'s zero-length
 * refusal unreachable in axis mode — the magnitude is normalised away there, so
 * any non-zero value would do and 1 is the one that reads as a unit vector.
 *
 * Unlocked: the hovered point, which is the round-1 behaviour unchanged.
 *
 * The axis WINS over a hover rather than falling back to it (§5.1). `TapeTool`
 * latches its hover while anchored, so a stale one can sit unreplaced across an
 * arbitrary number of events; a lock that a value the user cannot see can
 * override is not a lock.
 */
export function towardFor(
  anchor: [number, number, number],
  axis: TapeAxis | null,
  hover: [number, number, number] | null,
): [number, number, number] | null {
  if (!axis) return hover;
  // A copy, never a write into the caller's array: `anchor` is `tapeAnchor.at`,
  // read by the readout's distance, by the measuring line and by the commit.
  const out: [number, number, number] = [anchor[0], anchor[1], anchor[2]];
  out[AXIS_INDEX[axis]] += 1;
  return out;
}

/**
 * The axis a keystroke names, or null.
 *
 * Lives beside the type it produces rather than in either of the two keyboard
 * handlers that need it — `App`'s window keydown effect and `TapeReadout`'s own
 * `onKeyDown`, which exists because `isTextEntry` stops the window listener
 * seeing anything once the distance box has focus. Two copies of this mapping
 * that agree today are two places for a future rule to disagree, which is the
 * drift shape follow-up 64 recorded. Same reasoning that puts `canBeginLength`
 * in `units/length.ts` beside the grammar it is derived from.
 */
export function tapeAxisFromKey(key: string): TapeAxis | null {
  const lower = key.toLowerCase();
  return lower === 'x' || lower === 'y' || lower === 'z' ? lower : null;
}
