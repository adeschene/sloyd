import { boardSolids, cutRegion, stockProbe } from './cuts';
import type { Point } from './cuts';
import { axisDimensions, boardExtents, positionAxisOf } from './geometry';
import type { Board, Cut } from './types';

/**
 * What a snap point sits on. Drives the marker's colour, and nothing else —
 * every kind snaps identically.
 */
export type SnapKind = 'corner' | 'edge-mid' | 'face-center';

/**
 * What a snap point belongs to.
 *
 * A discriminated union rather than a bare board id, deliberately: guide
 * points, guide lines and the tape measure are the named follow-ups to this
 * round, and every one of them produces candidates owned by something that is
 * not a board. Adding a member here is how they land; the picker's signature
 * never has to change. See the design's §2.3.
 */
export type SnapOwner = { type: 'board'; id: string };

export interface SnapPoint {
  kind: SnapKind;
  /** World position, inches. */
  at: [number, number, number];
  owner: SnapOwner;
}

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
    a.at[0] === b.at[0] &&
    a.at[1] === b.at[1] &&
    a.at[2] === b.at[2]
  );
}

/**
 * A board's 26 snap candidates: 8 corners, 12 edge midpoints, 6 face centres.
 *
 * A board is always an axis-aligned box (rotation is 0 or 90 about Y, posture
 * only names which dimension points up), so the candidates are the 3x3x3
 * lattice of {min, mid, max} on each world axis. The number of axes sitting at
 * `mid` is exactly what names the kind: none is a corner, one is an edge
 * midpoint, two is a face centre — and three is the volume centre, which is
 * skipped. It is the one lattice point with no feature under it to draw a
 * marker against, so an indicator there would appear to hang in mid-air.
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
 * `boardSolids` is empty (a board its own cuts consumed entirely), all 26
 * stay, because `BoardMesh` still draws a translucent ghost box at the AABB
 * (invariant 21) — the box points sit on a drawn feature even though every
 * cell is empty. That is an explicit `boardSolids(board).length === 0` check
 * rather than "the filtered set came back empty": a board could in principle
 * have every box point sit in removed stock while stock remains in its
 * middle, and those are not the same condition.
 *
 * A board with no cuts returns before either check runs any grid arithmetic
 * at all, the same zero-cost guarantee `boardSolids`/`cutSnapPoints` make in
 * their first line. A cut board therefore builds the cell grid twice here —
 * once inside `stockProbe`, once inside `boardSolids` — which is accepted:
 * both run when the document changes, never per frame, and reusing one grid
 * across the two would mean reaching into `cuts.ts`'s private `grid()`, which
 * stays unexported on purpose.
 */
export function boardSnapPoints(board: Board): SnapPoint[] {
  const [ex, ey, ez] = boardExtents(board);
  const [px, py, pz] = board.position;
  // `position` is the min-corner, not the centre — see invariant 2.
  const xs = [px, px + ex / 2, px + ex];
  const ys = [py, py + ey / 2, py + ey];
  const zs = [pz, pz + ez / 2, pz + ez];
  const owner: SnapOwner = { type: 'board', id: board.id };

  const points: SnapPoint[] = [];
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

  if (board.cuts.length === 0) return points;
  if (boardSolids(board).length === 0) return points;

  const dims = axisDimensions(board);
  const touchesStock = stockProbe(board);
  return points.filter((p) => {
    const local = {} as Point;
    local[dims[0]] = p.at[0] - px;
    local[dims[1]] = p.at[1] - py;
    local[dims[2]] = p.at[2] - pz;
    return touchesStock(local);
  });
}

/**
 * A point in the board's own space, in world inches.
 *
 * `position` is the min-corner (invariant 2) and axisDimensions says which
 * board dimension runs along each world axis, so this is a bare addition.
 *
 * Deliberately NOT pointToLocalXYZ or solidWorldBox: both of those return
 * coordinates relative to the board's CENTRE, because BoardMesh hangs solids
 * in a <group> at boardCenter(board). Using either here puts every point off
 * by half the board — which looks entirely plausible in a screenshot, and is
 * why the tests pose the fixture rather than sitting it flat at the origin.
 * Two distinct poses are exercised with hand-derived coordinates (not just
 * one): a second pose with a different axisDimensions mapping on all three
 * axes is what actually proves this reads the mapping rather than
 * hard-coding one board's arrangement of it.
 */
function toWorld(board: Board, p: Point): [number, number, number] {
  const dims = axisDimensions(board);
  return [
    board.position[0] + p[dims[0]],
    board.position[1] + p[dims[1]],
    board.position[2] + p[dims[2]],
  ];
}

/**
 * The 15 points one cut defines, in the board's own space, before any test of
 * whether the stock under them still exists.
 *
 * Two rectangles at the two ends of the cut's depth axis. The FLOOR gets all
 * nine combinations of {min, mid, max} on the position and across axes. The
 * MOUTH — the plane at the board's own surface — gets only the two shoulder
 * lines: its middle row spans the OPENING, so those three points (the mouth's
 * own face centre among them) would sit in the hole rather than on wood. That
 * is the volume-centre exclusion of design §2.1, one dimension down.
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
  // load: a Board built directly can reach here without being validated.
  if (cut.face === cut.across) return [];

  const pos = positionAxisOf(cut.face, cut.across);
  const region = cutRegion(board, cut);
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
      const planes = i === 1 ? [floor] : [floor, mouth];
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
 * A board's cut-owned snap candidates: 15 per cut, minus any whose stock is
 * gone.
 *
 * The second provider the snap-move design's §2.3 was built for — pickSnapPoint
 * consumes SnapPoint[] and never sees a Board, so this is an addition rather
 * than a change to the picker. The owner stays the BOARD: a shoulder belongs to
 * the part it was cut into, which is what keeps commitSnapMove's ownership
 * guard and MoveTool's self-snap filter working unchanged.
 *
 * A board with no cuts returns immediately without building a grid, so joinery
 * still costs nothing at all for the boards that do not use it — the same
 * guarantee boardSolids makes in its first line.
 */
export function cutSnapPoints(board: Board): SnapPoint[] {
  if (board.cuts.length === 0) return [];
  const touchesStock = stockProbe(board);
  const owner: SnapOwner = { type: 'board', id: board.id };

  const out: SnapPoint[] = [];
  for (const cut of board.cuts) {
    for (const { at, kind } of pointsOfCut(board, cut)) {
      if (!touchesStock(at)) continue;
      out.push({ kind, at: toWorld(board, at), owner });
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
export function snapPointsFor(board: Board): SnapPoint[] {
  return [...boardSnapPoints(board), ...cutSnapPoints(board)];
}
