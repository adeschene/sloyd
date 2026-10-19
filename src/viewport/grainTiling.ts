import { ShapeUtils, Vector2 } from 'three';
import {
  angleCutValues, axialOffset, axisFrame, boardExtents, bodyPlanes, clipPlan, clipPolygon, CUT_GEOMETRY_KEYS, DIMENSION_ORDER,
  HOLE_EPS, holeInStock, holePrism, stockChecks, holeRing, holeRowValues, curveValues, holeTouches, holeTouchesBox, isSheetGood, minusCover, minusPrism, ringInside, spanToWorldOffset, toWorldOffset,
  wholeBoard, arcChords, curveOutline, CURVE_SEGMENTS_MAX, CURVE_TOLERANCE, localSegments, SMOOTH_EPS, unionLoops, uvDims,
} from '../document/document';
import type { Board, Body, BodyFace, CurveCut, Hole, LocalArc, P2, Plane, Region, Span, StockChecks, V3 } from '../document/document';
import { geometryBoard, profileValues, shapedPart, sweptProfiles } from '../document/profiles';
import { profileEdgeOf } from '../document/bodies';
import { runoutAxis, runoutNormals, sectionFrame, stopAxis, stopRunoutNormals } from '../document/runout';
import { oneSideCurve, sweptNormals, sweptRunouts, sweptStops } from '../document/sweep';
import { spanOf } from '../document/curves';
import { axisDimensions, faceGrainKinds, grainFamily } from './grainFaces';
import type { Dimension, GrainFamily, GrainKind } from './grainFaces';
import { candidates as sortedCandidates, centroidFan, CONFORM_EPS, insertOnEdges, welder } from './conform';
import type { Candidates } from './conform';

/** A world axis: 0 = X, 1 = Y, 2 = Z. */
type Axis = 0 | 1 | 2;

/**
 * One of a face's two default UV axes: which world axis it runs along, and
 * whether it runs WITH that axis (+1) or against it (-1).
 *
 * THE SIGN IS LOAD-BEARING, and the comment that used to stand here said the
 * opposite: "signs are irrelevant — grain is mirror-symmetric, so all that
 * matters is which axis carries u and which carries v." That is true of a
 * whole board and false of a solid, which is why it survived until joinery
 * met plywood. Reversing an axis maps [0, 1] to [1, 0] — the same full tile,
 * mirrored, and a mirrored tile is still a tile. But `boardUVs` looks a SOLID
 * up in the BOARD's tiling (invariant 17), so a solid's span is a sub-range,
 * and reversing puts that sub-range on the wrong side of the face. Two solids
 * meeting at a split plane then disagree about the v there: a 3/4in plywood
 * panel with a 1/4in dado drew the outer third as v 0.33 -> 0 and the inner
 * two thirds as v 1 -> 0.33, so the shared plane carried v = 0 from one side
 * and v = 1 from the other and the outermost ply landed against the innermost
 * — one double-width light band in the middle of the stack and a part-ply at
 * each edge. Invisible on solid wood, whose figure is near-random; plain on
 * plywood, whose edge texture is a STRUCTURE where position means something.
 *
 * Read off a real BoxGeometry rather than reasoned about, and pinned that way
 * by a test — three.js owns this table, not us.
 */
type UVAxis = [Axis, 1 | -1];

/**
 * Each face's default UV axes, in BoxGeometry's material-group order
 * (+X, -X, +Y, -Y, +Z, -Z). One table, carrying both the axis and its sign:
 * a parallel sign table would be a second thing indexed by face that has to
 * agree with this one.
 */
const FACE_AXES: Array<[UVAxis, UVAxis]> = [
  [[2, -1], [1,  1]], // +X
  [[2,  1], [1,  1]], // -X
  [[0,  1], [2, -1]], // +Y
  [[0,  1], [2,  1]], // -Y
  [[0,  1], [1,  1]], // +Z
  [[0, -1], [1,  1]], // -Z
];

/**
 * The grain dimension ranks first, then the rest in [length, width, thickness]
 * order. Whichever of a face's two in-plane dimensions ranks lower takes the
 * drawn texture's u.
 *
 * That covers all three kinds. Wherever the grain is in the face's plane, u
 * follows it — which is the direction the figure is drawn running. On an end
 * face, where it is not, the fallback order still puts thickness last, so v
 * crosses the thickness and plywood's plies stack the way a sheet's do.
 *
 * With grain along the length this is the old fixed rank, unchanged.
 *
 * That reasoning only holds unmodified for solid wood, where the grain figure
 * is drawn on the board itself. A sheet good's ply stack is a property of the
 * *sheet*, not of the figure on its face — it always spans the sheet
 * thickness, whatever the grain says. So thickness must rank last for sheet
 * goods no matter what. But the veneer figure on the broad face still has to
 * turn with the grain, the same as solid wood's does — that is the whole
 * point of the grain control existing on plywood at all. So a sheet good
 * promotes the grain dimension exactly like solid wood does, but only among
 * the other *two* dimensions, with thickness pinned last: [grain, the other
 * non-thickness dimension, 'thickness'].
 *
 * 'Through thickness' is not offered for sheet goods (see isSheetGood's
 * comment) and is normalised away by validateBoard, so board.grain should
 * never be 'thickness' here for a sheet good — but this function makes itself
 * total by normalizing grain locally instead of relying on that invariant.
 * That way a future refactor cannot break this function from a distance
 * by rearranging where validation happens.
 */
function ranks(board: Board): Record<Dimension, number> {
  // Normalize grain locally: sheet goods never use 'thickness' grain, so if
  // we encounter it on a sheet good, treat it as 'length'. This makes the
  // function total on its own rather than relying on guarantees enforced
  // elsewhere, so it cannot be broken by changes to the validator.
  const g = isSheetGood(board.material) && board.grain === 'thickness' ? 'length' : board.grain;
  const order = isSheetGood(board.material)
    ? [g, DIMENSION_ORDER.find((d) => d !== g && d !== 'thickness')!, 'thickness']
    : [g, ...DIMENSION_ORDER.filter((d) => d !== g)];
  return {
    length: order.indexOf('length'),
    width: order.indexOf('width'),
    thickness: order.indexOf('thickness'),
  };
}

/** One tile spans the whole extent, whatever that extent is. */
const FIT = 'fit';
type Tile = number | typeof FIT;

/**
 * Inches per tile, as [along u, along v].
 *
 * Ends use FIT on both axes so the ring pattern reads as one cross-section
 * rather than a repeating motif. Plywood edges and ends use FIT on v so the
 * drawn ply stack spans the sheet thickness exactly — a 1/2in sheet and a 3/4in
 * sheet each show five plies, which is what they look like.
 */
const TILES: Record<GrainFamily, Record<GrainKind, [Tile, Tile]>> = {
  // face v is 6in, not the more obvious 10-12: with BANDS=16 the cathedral
  // region (where bandOffset can close, see grainLog.bandOffset) only spans
  // roughly the innermost couple of bands either side of the pith line — about
  // an eighth of the tile's v extent. A typical board (5.5in wide) sampling a
  // 10in tile only sees 55% of it, so a random per-board UV offset has a real
  // chance (~33%, measured) of landing a window that misses that region
  // entirely, showing flowing lines with no arch at all. At 6in a 5.5in board
  // sees over 90% of the tile, which is provably enough that no offset can
  // miss the region (it's wider than what could be excluded) — every board
  // shows at least a hint of the figure regardless of its id.
  wood:    { face: [16, 6], edge: [16, 4],   end: [FIT, FIT] },
  plywood: { face: [24, 16], edge: [16, FIT], end: [16, FIT] },
  mdf:     { face: [8, 8],   edge: [8, 8],    end: [8, 8] },
};

export interface FacePlan {
  kind: GrainKind;
  /** True when the drawn texture must be turned a quarter turn to follow the grain. */
  swap: boolean;
  /** The world axes carrying the drawn texture's u and v, after any swap. */
  axes: [Axis, Axis];
  /**
   * Inches per tile along the drawn u and v.
   *
   * A FIT axis resolves to the BOARD's extent on that axis, which is what
   * makes "show the whole tile" and "tile every N inches" one formula:
   * u = coordinate / tileInches. It is also why a sub-box of a board shows
   * the fraction of the tile it actually occupies — fitting the tile to the
   * sub-box instead would squeeze plywood's whole ply stack into the stock
   * that survived a dado.
   */
  tileInches: [number, number];
  /**
   * Whether each axis (u, v) is FIT. The per-board offset is zeroed on a FIT
   * axis: the whole tile is shown either way, so the offset buys no
   * variation and only shifts the pattern's seam into the middle of the
   * face — exactly what FIT exists to avoid on wood ends and plywood's ply
   * stack.
   */
  fit: [boolean, boolean];
}

export function facePlans(board: Board): FacePlan[] {
  const extents = boardExtents(board);
  const dims = axisDimensions(board);
  const kinds = faceGrainKinds(board);
  const tiles = TILES[grainFamily(board.material)];
  const rank = ranks(board);

  return FACE_AXES.map(([[gu], [gv]], face) => {
    const kind = kinds[face];
    const swap = rank[dims[gv]] < rank[dims[gu]];
    const [du, dv] = swap ? [gv, gu] : [gu, gv];
    const [tu, tv] = tiles[kind];
    return {
      kind,
      swap,
      axes: [du, dv] as [Axis, Axis],
      tileInches: [
        tu === FIT ? extents[du] : tu,
        tv === FIT ? extents[dv] : tv,
      ],
      fit: [tu === FIT, tv === FIT],
    };
  });
}

/** BoxGeometry emits four vertices per face, with these default UVs. */
const CORNERS: Array<[number, number]> = [[0, 1], [1, 1], [0, 0], [1, 0]];

/**
 * The `uv` attribute for one solid of a board: 48 floats, four (u, v) pairs per
 * face in BoxGeometry's own vertex order.
 *
 * UVs are PARENT-RELATIVE. A solid's coordinates are looked up in the board's
 * tiling, not in its own, so the figure runs continuously across a dado instead
 * of restarting at it — which is what makes a cut read as stock removed from
 * one board rather than two boards pushed together. Passing no solid gives the
 * whole board, identical to what this returned before joinery existed.
 *
 * The per-board offset stays the BOARD's (invariant 12) for the same reason. A
 * per-solid offset would break exactly the continuity this exists to get.
 */
export function boardUVs(board: Board, solid: Region = wholeBoard(board)): Float32Array {
  const plans = facePlans(board);
  const frame = axisFrame(board);
  const [ou, ov] = boardUVOffset(board.id);
  const uv = new Float32Array(48);
  let i = 0;
  for (let face = 0; face < plans.length; face += 1) {
    const plan = plans[face];
    const [[, su], [, sv]] = FACE_AXES[face];
    const spans = plan.axes.map((axis) => spanToWorldOffset(board, axis, solid[frame[axis]!.dim])) as [Span, Span];
    for (const [cu, cv] of CORNERS) {
      // Resolve each geometry corner into a fraction that runs WITH its world
      // axis, so that 0 means the span's min and 1 means its max. The span is
      // in world-offset space (spanToWorldOffset), so that holds on every
      // turn. `at` below reads the fraction that way, and three of the box's twelve UV axes run
      // the other way (see FACE_AXES).
      //
      // THIS MUST HAPPEN BEFORE THE SWAP, and that is the half a tidying pass
      // gets backwards. A sign belongs to the pair (face, GEOMETRY axis), not
      // to the drawn u/v — those are the same thing only when swap is false.
      // Flipping after the swap would apply +X's u sign to the drawn v, which
      // is precisely the upright faces the original defect showed on.
      const gu = su > 0 ? cu : 1 - cu;
      const gv = sv > 0 ? cv : 1 - cv;
      const [fu, fv] = plan.swap ? [gv, gu] : [gu, gv];
      const at = (f: number, s: Span, tile: number, off: number, isFit: boolean) =>
        (s[0] + f * (s[1] - s[0])) / tile + (isFit ? 0 : off);
      uv[i++] = at(fu, spans[0], plan.tileInches[0], ou, plan.fit[0]);
      uv[i++] = at(fv, spans[1], plan.tileInches[1], ov, plan.fit[1]);
    }
  }
  return uv;
}

/**
 * A board-local point's world offsets (toWorldOffset on each world axis), memoised per CALL by the point's identity: a
 * fan, an earcut triangulation and a wall share each vertex object among several triangles (Task 11b). The memo lives
 * only as long as one mesh build — never module-level: partGeometry shares one set of points between parts in
 * different poses. Points are never mutated (frozen bodies and rings, or fresh clip output), so identity decides value.
 * The crossing is toWorldOffset's, bound to this board's frame computed once (ruling R12).
 */
function worldOffsets(board: Board): (p: V3) => V3 {
  const frame = axisFrame(board);
  const dims = frame.map((a) => DIMENSION_ORDER.indexOf(a.dim));
  const memo = new Map<V3, V3>();
  return (p) => {
    let w = memo.get(p);
    if (!w) {
      w = [toWorldOffset(board, 0, p[dims[0]!]!, frame), toWorldOffset(board, 1, p[dims[1]!]!, frame), toWorldOffset(board, 2, p[dims[2]!]!, frame)];
      memo.set(p, w);
    }
    return w;
  };
}

/** For a triangle given by its world offsets: null when its area is under 1e-12 (a near-duplicate vertex from clipping
 *  makes such a fan; it is not drawn), else its (unnormalised) normal dotted with `n` — negative means wound against
 *  `n`. Scalars only: it runs once per drawn triangle. */
function facing(w0: V3, w1: V3, w2: V3, n: readonly number[]): number | null {
  const e10 = w1[0] - w0[0]; const e11 = w1[1] - w0[1]; const e12 = w1[2] - w0[2];
  const e20 = w2[0] - w0[0]; const e21 = w2[1] - w0[1]; const e22 = w2[2] - w0[2];
  const c0 = e11 * e22 - e12 * e21; const c1 = e12 * e20 - e10 * e22; const c2 = e10 * e21 - e11 * e20;
  return Math.hypot(c0, c1, c2) / 2 < 1e-12 ? null : c0 * n[0]! + c1 * n[1]! + c2 * n[2]!;
}

/** Per-material vertex streams (each a list of attributes) packed into one typed array per attribute, materials in
 *  BoxGeometry order, an empty material skipped; `groups` counts vertices by the FIRST attribute (positions, 3 each). */
function packGroups(byMaterial: number[][][]): { groups: { start: number; count: number; materialIndex: number }[]; out: Float32Array[] } {
  const attrs = byMaterial[0]!.length;
  const out = Array.from({ length: attrs }, (_, j) => new Float32Array(byMaterial.reduce((s, m) => s + m[j]!.length, 0)));
  const at = new Array<number>(attrs).fill(0);
  const groups: { start: number; count: number; materialIndex: number }[] = [];
  byMaterial.forEach((m, materialIndex) => {
    if (m[0]!.length === 0) return;
    groups.push({ start: at[0]! / 3, count: m[0]!.length / 3, materialIndex });
    m.forEach((xs, j) => { out[j]!.set(xs, at[j]!); at[j]! += xs.length; });
  });
  return { groups, out };
}

type RunoutNormals = ReturnType<typeof runoutNormals>;
const runoutMemos = new WeakMap<readonly Body[], Map<string, RunoutNormals | null>>();
/**
 * A part's run-out normals by curve id, memoised on its bodies (final fix F1). Keyed ONLY on a FROZEN bodies array —
 * partGeometry's, shared by every part with one geometryKey, which fixes the dimensions and every curve's values (span
 * included), all runoutNormals reads; the normals are board-local, so the pose is irrelevant. Unfrozen or absent bodies
 * get a fresh map per call: an array that can change is never a memo key.
 */
function runoutMemo(bodies: readonly Body[] | undefined): Map<string, RunoutNormals | null> {
  if (!bodies || !Object.isFrozen(bodies)) return new Map();
  let m = runoutMemos.get(bodies);
  if (!m) { m = new Map(); runoutMemos.set(bodies, m); }
  return m;
}

type SweptNormals = ReturnType<typeof sweptNormals>;
const sweptMemos = new WeakMap<readonly Body[], Map<string, SweptNormals | null>>();
/** A part's swept normals by profile id, memoised on its FROZEN bodies exactly as `runoutMemo` (unfrozen: fresh per call). */
function sweptMemo(bodies: readonly Body[] | undefined): Map<string, SweptNormals | null> {
  if (!bodies || !Object.isFrozen(bodies)) return new Map();
  let m = sweptMemos.get(bodies);
  if (!m) { m = new Map(); sweptMemos.set(bodies, m); }
  return m;
}

/**
 * Whether BoardMesh draws `body` through a BoxGeometry (today's path, byte-for-byte: angle-cuts spec §3.3, holes spec
 * §3.2) rather than bodyMesh: a box no hole reaches, on a part WITHOUT curves. Every body of a curved part goes through
 * bodyMesh, a box cell beside a curve's slices included, so its faces take the slices' vertices (no T-junction, finding 1)
 * and its walls against them drop as seams.
 */
export function drawsAsBox(board: Board, body: Body, holes: readonly Hole[]): body is Body & { box: Region } {
  board = geometryBoard(board);
  return !shapedPart(board) && body.box !== null && !holes.some((h) => holeTouchesBox(h, body.box!));
}

/**
 * Triangles for one CLIPPED body (angle-cuts spec §3.3): positions relative
 * to the board's centre, UVs from the SAME face plans as boardUVs (invariant
 * 17: board-relative, FIT against the board), grouped by BoxGeometry's
 * material order so the six grain materials apply unchanged.
 *
 * An axis-aligned face takes its own material and plan. A sloped face takes
 * the plan of the world axis its normal is closest to; a tie goes to the axis
 * carrying the cut's `face` dimension, so a 45° miter reads as end grain and a
 * taper as long grain. UVs are read straight off each vertex's world offset
 * along the plan's axes — which is what boardUVs' CORNERS-and-sign dance
 * computes for a box, so the two agree (pinned by test, invariant 35).
 *
 * Holes are cut out of the faces they reach (faceTriangles); a part without
 * holes draws exactly what it drew before.
 *
 * A curved part (curves spec §3.4) also returns `normals`: a face lying on one of an arc's chords takes the RADIAL
 * normal of that arc at each vertex (so the facets shade as one smooth surface, and run into a tangent straight face
 * without a crease), every other face its flat normal. A part without curves returns none — byte-for-byte what it
 * returned before — and BoardMesh computes its normals as it always did. Every body of a curved part drops its seams
 * as a holed body does (`uncovered`): the internal walls on its chord planes and diagonals, and a box cell's walls against
 * the slices, are never drawn. And its faces are conformed (conformedTriangles): the merged mesh is watertight.
 */
export function bodyMesh(board: Board, body: Body, holes: readonly Hole[] = [], bodies?: readonly Body[]): { positions: Float32Array; uvs: Float32Array; normals?: Float32Array; groups: { start: number; count: number; materialIndex: number }[] } {
  board = geometryBoard(board);
  const plans = facePlans(board);
  const frame = axisFrame(board);
  const extents = boardExtents(board);
  const [ou, ov] = boardUVOffset(board.id);
  const dimIndex = (d: Dimension) => DIMENSION_ORDER.indexOf(d);
  const offsetOf = worldOffsets(board);
  const curved = shapedPart(board);
  const byMaterial: { pos: number[]; uv: number[]; nor: number[] }[] = Array.from({ length: 6 }, () => ({ pos: [], uv: [], nor: [] }));
  // A curved part's faces come from curvedPart: seams dropped, vertices welded, and every part vertex lying inside one of
  // their edges inserted when triangulated (conform.ts: no T-junctions between a split curve's slices, or a slice and a
  // box cell beside it). A part without curves never reaches it.
  const part = curved && bodies ? curvedPart(board, bodies, holes) : null;
  const seams = !part && bodies && holed(body, holes) ? seamIndex(bodies) : null;
  const faces = part?.faces.get(body) ?? (seams ? body.faces.flatMap((f) => uncovered(f, body, seams)) : body.faces);
  const candidates = part?.points ?? null;
  const toWorld = (local: readonly number[]): V3 => [0, 1, 2].map((i) => local[dimIndex(frame[i]!.dim)]! * (frame[i]!.reversed ? -1 : 1)) as V3;
  const chordsOf = curved ? curveChords(board) : null;
  // A stopped profile's run-out normals, built per curve on its first run-out face (a part with none never builds one), and
  // shared by every body of the part through partGeometry's frozen bodies (final fix F1: was rebuilt per call, ~48× an ogee).
  const runouts = curved ? runoutMemo(bodies) : new Map<string, RunoutNormals | null>();
  const sweeps = curved ? sweptMemo(bodies) : new Map<string, SweptNormals | null>();
  const runoutOf = (id: string) => {
    if (!runouts.has(id)) {
      const c = board.curves.find((x) => x.id === id);
      runouts.set(id, c ? runoutNormals(board, c) : null);
    }
    return runouts.get(id)!;
  };
  // A swept profile's B1 station run-out (profile runs b1, Task 5): its caps carry the PROFILE's id, which names no view
  // curve, and its two stations may share an end ('hi' on both end sides): the run-out curve is the one of the profile's
  // `sweptRunouts` stopping at that end whose bit axis the face lies nearest. A view curve's id resolves as above, unchanged.
  const runoutFor = (id: string, end: 'lo' | 'hi', verts: readonly V3[]): RunoutNormals | null => {
    if (board.curves.some((x) => x.id === id)) return runoutOf(id);
    const p = board.profiles.find((x) => x.id === id);
    if (!p) return null;
    const cs = sweptRunouts(board, p);
    let best: RunoutNormals | null = null, bestD = Infinity;
    cs.forEach((c, i) => {
      const sp = spanOf(c);
      if (!sp || !(end === 'lo' ? sp.stopLo : sp.stopHi)) return;
      const key = `${id}#${i}`;
      if (!runouts.has(key)) runouts.set(key, runoutNormals(board, c));
      const f = sectionFrame(board, c);
      const a = runoutAxis(board, c, end);
      const v = verts[0]!;
      const d = Math.hypot(v[f.k]! - a.run, v[f.iu]! - a.u);
      if (d < bestD) { bestD = d; best = runouts.get(key)!; }
    });
    // A b2 STOP's run-out (profile runs b2, Task 6): its faces carry the path's FACE-FRAME end, which need not be a2's
    // run-dimension end a B1 station's carries ('lo' on both of stationFrontToBack's), so a stop is matched by its own
    // frame's tag and, among every candidate with that tag, the nearest bit axis wins. A part with no stop builds no frame.
    sweptStops(board, p).forEach((fr, i) => {
      if (fr.end !== end) return;
      const key = `${id}@stop${i}`;
      if (!runouts.has(key)) runouts.set(key, stopRunoutNormals(board, oneSideCurve(p), fr));
      const a = stopAxis(fr);
      const v = verts[0]!;
      const d = Math.hypot(v[0]! - a[0], v[1]! - a[1]);
      if (d < bestD) { bestD = d; best = runouts.get(key)!; }
    });
    return best;
  };
  // A swept face's normals (profile runs b1, Task 5): the true swept surface's (sweptNormals), one per profile per part,
  // memoised with the run-outs' on the frozen bodies (a2 fix F1's rule). A part with no swept profile never builds one.
  const sweptOf = (id: string) => {
    const key = `sweep:${id}`;
    if (!sweeps.has(key)) {
      const p = board.profiles.find((x) => x.id === id);
      sweeps.set(key, p ? sweptNormals(board, p) : null);
    }
    return sweeps.get(key)!;
  };
  // A curved part's holed planes, merged (fu 369): this body draws each plane it was given whole, with its rings cut out.
  const jobs: [BodyFace, V3[][] | null][] = faces.map((f) => [f, null]);
  for (const m of part?.merged.get(body) ?? []) jobs.push([m.face, m.tris]);
  for (const [f, given] of jobs) {
    const n = toWorld(f.n);
    let axis = 0;
    for (let i = 1; i < 3; i += 1) if (Math.abs(n[i]!) > Math.abs(n[axis]!) + 1e-9) axis = i;
    const cut = f.cut ? board.angleCuts.find((c) => c.id === f.cut) : undefined;
    if (cut) {
      const pref = frame.findIndex((a) => a.dim === cut.face);
      if (Math.abs(Math.abs(n[pref]!) - Math.abs(n[axis]!)) <= 1e-9) axis = pref;
    }
    const material = axis * 2 + (n[axis]! > 0 ? 0 : 1);
    const plan = plans[material]!;
    const out = byMaterial[material]!;
    const put = (p: V3) => {
      out.pos.push(p[0] - extents[0] / 2, p[1] - extents[1] / 2, p[2] - extents[2] / 2);
      out.uv.push(
        p[plan.axes[0]]! / plan.tileInches[0] + (plan.fit[0] ? 0 : ou),
        p[plan.axes[1]]! / plan.tileInches[1] + (plan.fit[1] ? 0 : ov),
      );
    };
    // The vertex normal stream (curved parts only): the arc this face lies on, if any, gives a radial normal per vertex.
    // A run-out face (profile runs a2) takes the cutter surface's normal (runoutNormals), its arc chosen once from all its
    // vertices, flipped to agree with the face's outward normal; tested BEFORE chordArc — a face near the station projects
    // onto the band's prism chord.
    const ro = chordsOf && f.runout !== undefined && f.curve !== undefined ? runoutFor(f.curve, f.runout, f.verts) : null;
    const roArc = ro ? ro.arcOf(f.runout!, f.verts) : null;
    const arc = !ro && chordsOf && f.curve !== undefined ? chordArc(chordsOf.get(f.curve), f) : null;
    // T6 fix 1: a run-out face of a STRAIGHT section edge (a bead's quirk wall: a revolved line, a cylinder or cone) takes
    // the revolved edge's normal, so its sectors shade as one surface; tagged faces only, so no other part is touched.
    let line: ((p: readonly number[]) => V3) | null = null;
    const pe = chordsOf && f.runout !== undefined && f.curve === undefined ? profileEdgeOf(f) : null;
    if (pe) line = runoutFor(pe.curve, f.runout!, f.verts)?.lineNormals(f.runout!, f.verts, pe.a, pe.b) ?? null;
    // Profile runs b1: a swept section face takes the swept surface's normal (already oriented outward).
    const swept = chordsOf && f.sweep !== undefined ? profileEdgeOf(f) : null;
    const sw = swept ? sweptOf(swept.curve) : null;
    const nor = (p: V3) => {
      if (!chordsOf) return;
      const sn = sw ? sw(f, p) : null;
      if (sn) {
        const w = toWorld(sn);
        out.nor.push(w[0], w[1], w[2]);
        return;
      }
      if ((ro && roArc !== null) || line) {
        const local = line ? line(p) : ro!.normal(f.runout!, p, roArc!);
        if (local[0] * f.n[0] + local[1] * f.n[1] + local[2] * f.n[2] < 0) { local[0] = -local[0]; local[1] = -local[1]; local[2] = -local[2]; }
        const w = toWorld(local);
        out.nor.push(w[0], w[1], w[2]);
        return;
      }
      if (!arc) { out.nor.push(n[0], n[1], n[2]); return; }
      const ru = p[arc.iu]! - arc.arc.centre[0];
      const rv = p[arc.iv]! - arc.arc.centre[1];
      const l = Math.hypot(ru, rv);
      const s = (ru * f.n[arc.iu]! + rv * f.n[arc.iv]!) < 0 ? -1 / l : 1 / l;
      const local: V3 = [0, 0, 0];
      local[arc.iu] = ru * s;
      local[arc.iv] = rv * s;
      const w = toWorld(local);
      out.nor.push(w[0], w[1], w[2]);
    };
    for (const t of given ?? (candidates ? conformedTriangles(f, holes, candidates) : faceTriangles(f, holes))) {
      const w0 = offsetOf(t[0]!); const w1 = offsetOf(t[1]!); const w2 = offsetOf(t[2]!);
      const d = facing(w0, w1, w2, n);
      // Near-duplicate vertices from clipping make zero-area fans; emit nothing for them.
      if (d === null) continue;
      put(w0); nor(t[0]!);
      if (d < 0) { put(w2); nor(t[2]!); put(w1); nor(t[1]!); } else { put(w1); nor(t[1]!); put(w2); nor(t[2]!); }
    }
  }
  if (!curved) {
    const { groups, out: [positions, uvs] } = packGroups(byMaterial.map((m) => [m.pos, m.uv]));
    return { positions: positions!, uvs: uvs!, groups };
  }
  const { groups, out: [positions, uvs, normals] } = packGroups(byMaterial.map((m) => [m.pos, m.uv, m.nor]));
  return { positions: positions!, uvs: uvs!, normals: normals!, groups };
}

/**
 * A curved part's face as triangles with no T-junction (whole-branch review, finding 1): every part vertex lying inside
 * one of its edges inserted (`insertOnEdges`) and the polygon fanned from its centroid. A face that takes no vertex is
 * fanned as it always was. A face a hole reaches is normally not here: its plane is merged (curvedPart, fu 369). One
 * that is — a plane a faulted hole reaches, or whose rings overlap — keeps faceTriangles' path unchanged, T-junctions
 * and all (the accepted residue: a faulted hole is drawn approximately).
 */
function conformedTriangles(f: BodyFace, holes: readonly Hole[], candidates: Candidates): V3[][] {
  if (holes.some((h) => holeTouches(h, f.verts))) return faceTriangles(f, holes);
  const poly = insertOnEdges(f.verts, f.n, candidates);
  return poly === f.verts ? faceTriangles(f, holes) : centroidFan(poly);
}

/**
 * A curved part's drawn faces, per body, and the vertices its faces conform to (whole-branch review, finding 1): every
 * body's faces minus the seams other bodies cover (`uncovered`, for EVERY body of the part — a box cell beside the slices
 * included), each vertex WELDED to one representative (conform.ts' welder), and the representatives of every drawn
 * face's vertices — a seam remainder's new corners included, since a neighbour's edge in another plane may pass through
 * one. Built once per FROZEN bodies array (partGeometry's) and kept by its identity, as seamIndex is: bodyMesh runs once
 * per body, so building it per call would be quadratic. An unfrozen array is built afresh (invariant 50's rule).
 */
interface CurvedPart { holes: readonly Hole[]; faces: Map<Body, BodyFace[]>; points: Candidates; merged: Map<Body, MergedPlane[]> }
const curvedParts = new WeakMap<readonly Body[], CurvedPart>();
function curvedPart(board: Board, bodies: readonly Body[], holes: readonly Hole[]): CurvedPart {
  const hit = curvedParts.get(bodies);
  if (hit && hit.holes === holes) return hit;
  const index = seamIndex(bodies);
  const { points, canon } = welder();
  const faces = new Map<Body, BodyFace[]>();
  for (const body of bodies) {
    faces.set(body, body.faces.flatMap((f) => uncovered(f, body, index)).map((f) => {
      const verts = f.verts.map(canon);
      return verts.every((p, i) => p === f.verts[i]) ? f : { ...f, verts };
    }));
  }
  const cands = sortedCandidates(points);
  const merged = holes.length > 0 ? mergeHoledPlanes(board, bodies, holes, faces, cands, canon) : new Map<Body, MergedPlane[]>();
  const part = { holes, faces, points: cands, merged };
  if (Object.isFrozen(bodies)) curvedParts.set(bodies, part);
  return part;
}

/**
 * fu 369: a split curve cuts a part's broad faces into coplanar strips, so a bore's mouth nearly always straddles a seam
 * between two of them — faceTriangles' disjoint-convex fallback then wedge-splits every strip it crosses, and neither the
 * wedges' corners nor the strips' T-junctions match the neighbouring strip or the wall's rim: pinholes, and most of the
 * rebuild (51 ms of mesh for an arched side with two pin rows, measured). So each plane a CLEAN hole (holeInStock) opens
 * into — its entry plane, and a through hole's exit plane — is drawn as ONE region: its drawn faces' union (unionLoops,
 * chained into loops; counter-clockwise loops are outer boundaries, clockwise ones inner), triangulated with every ring
 * on it as a hole (the SAME ring vertices the wall uses, so the rim matches exactly), each triangle then conformed to the
 * part's vertices (earcut drops collinear points, and the union drops the strips' corners along a straight run: both
 * come back as insertions, so the plane's edges meet its neighbours' vertex for vertex). A plane whose region cannot be
 * trusted is left to the per-face path: a faulted hole reaching any face on it, rings that overlap (ruling R4's test;
 * holeInStock does not judge meets-hole), or a ring not strictly inside one outer loop and outside its inner ones (a
 * clean hole's mouth always is — no breaks-out, no off-flat — so that guard is defensive; no fixture reaches it). The merged plane is drawn by the first body,
 * in body order, owning one of its faces; its faces are dropped from every body's list.
 */
interface MergedPlane { face: BodyFace; tris: V3[][] }
function mergeHoledPlanes(board: Board, bodies: readonly Body[], holes: readonly Hole[], faces: Map<Body, BodyFace[]>, cands: Candidates, canon: (p: V3) => V3): Map<Body, MergedPlane[]> {
  const out = new Map<Body, MergedPlane[]>();
  const checks = stockChecks(board);
  const clean = new Set(holes.filter((h) => holeInStock(board, h, checks)));
  const faulted = holes.filter((h) => !clean.has(h));
  // Every plane a clean hole opens into: axis, outward sign, coordinate, and the holes on it.
  const planes: { a: number; sign: number; at: number; holes: Hole[] }[] = [];
  const planeOf = (a: number, sign: number, at: number) => {
    let p = planes.find((q) => q.a === a && q.sign === sign && Math.abs(q.at - at) <= CONFORM_EPS);
    if (!p) { p = { a, sign, at, holes: [] }; planes.push(p); }
    return p;
  };
  for (const h of clean) {
    const a = DIMENSION_ORDER.indexOf(h.axis);
    planeOf(a, -h.dir, h.centre[a]!).holes.push(h);
    if (h.through) planeOf(a, h.dir, h.centre[a]! + h.dir * h.depth).holes.push(h);
  }
  for (const pl of planes) {
    const { a } = pl;
    const [u, v] = [0, 1, 2].filter((k) => k !== a) as [number, number];
    const members: { body: Body; f: BodyFace }[] = [];
    for (const body of bodies) {
      for (const f of faces.get(body) ?? []) {
        if (Math.abs(f.n[a]! - pl.sign) <= HOLE_EPS && Math.abs(f.verts[0]![a]! - pl.at) <= CONFORM_EPS) members.push({ body, f });
      }
    }
    if (members.length === 0) continue;
    // Only a faulted hole can reach a plane it does not open into: a clean one's wall meets no face (touching is a
    // breaks-out), and its own planes are the ones it is listed on.
    if (faulted.some((h) => members.some(({ f }) => holeTouches(h, f.verts)))) continue;
    const disjoint = pl.holes.every((h, i) => pl.holes.slice(i + 1).every((g) =>
      Math.hypot(h.centre[u]! - g.centre[u]!, h.centre[v]! - g.centre[v]!) > h.radius + g.radius + HOLE_EPS));
    if (!disjoint) continue;
    // Pieces wound counter-clockwise in (u, v), as unionLoops wants.
    const area2 = (poly: readonly V3[]) => poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]!; return s + p[u]! * q[v]! - q[u]! * p[v]!; }, 0);
    const pieces = members.map(({ f }) => (area2(f.verts) < 0 ? [...f.verts].reverse() : f.verts));
    const loops = chainLoops(unionLoops(pieces, a), canon);
    if (!loops) continue;
    const outer = loops.filter((l) => area2(l) > 0);
    const inner = loops.filter((l) => area2(l) < 0);
    const inside = (p: V3, loop: readonly V3[]) => {
      let c = false;
      for (let i = 0, j = loop.length - 1; i < loop.length; j = i, i += 1) {
        const pi = loop[i]!, pj = loop[j]!;
        if ((pi[v]! > p[v]!) !== (pj[v]! > p[v]!) && p[u]! < ((pj[u]! - pi[u]!) * (p[v]! - pi[v]!)) / (pj[v]! - pi[v]!) + pi[u]!) c = !c;
      }
      return c;
    };
    const home = (p: V3) => {
      const hits = outer.filter((l) => inside(p, l));
      return hits.length === 1 ? hits[0]! : null;   // nested islands: left to the per-face path
    };
    const rings = pl.holes.map((h) => { const t = axialOffset(h, { n: members[0]!.f.n, verts: members[0]!.f.verts }); return t === null ? null : holeRing(h, t); });
    if (rings.some((r) => r === null)) continue;
    // A ring is clear of every loop when its centre is inside its outer loop, outside every inner one, and farther than
    // its radius (+ HOLE_EPS) from every loop edge: the ring's vertices lie on that circle.
    const clear = (c: V3, r: number, loop: readonly V3[]) => loop.every((a, i) => {
      const b = loop[(i + 1) % loop.length]!;
      const du = b[u]! - a[u]!, dv = b[v]! - a[v]!;
      const t = Math.max(0, Math.min(1, ((c[u]! - a[u]!) * du + (c[v]! - a[v]!) * dv) / (du * du + dv * dv)));
      return Math.hypot(c[u]! - a[u]! - t * du, c[v]! - a[v]! - t * dv) > r + HOLE_EPS;
    });
    const ringHome = pl.holes.map((h) => {
      const l = home(h.centre);
      return l && !inner.some((i) => inside(h.centre, i)) && clear(h.centre, h.radius, l) && inner.every((i) => clear(h.centre, h.radius, i)) ? l : null;
    });
    if (ringHome.some((l) => l === null)) continue;
    const tris: V3[][] = [];
    const flat = (p: V3) => new Vector2(p[u], p[v]);
    for (const l of outer) {
      const holesIn = [...inner.filter((i) => home(i[0]!) === l), ...(rings as V3[][]).filter((_, k) => ringHome[k] === l)];
      const all = [...l, ...holesIn.flat()];
      // Loop vertices (outer, then inner) come before the rings in `all`: a part vertex can lie only on an edge between
      // two of them — the plane meets the rest of the part only along its loops — so only such a triangle is conformed.
      const onLoop = l.length + holesIn.slice(0, holesIn.length - rings.filter((_, q) => ringHome[q] === l).length).reduce((n, h) => n + h.length, 0);
      for (const [i, j, k] of ShapeUtils.triangulateShape(l.map(flat), holesIn.map((r) => r.map(flat)))) {
        const t = [all[i!]!, all[j!]!, all[k!]!];
        const loops = (i! < onLoop ? 1 : 0) + (j! < onLoop ? 1 : 0) + (k! < onLoop ? 1 : 0);
        if (loops < 2) { tris.push(t); continue; }
        const poly = insertOnEdges(t, members[0]!.f.n, cands);
        if (poly === t) tris.push(t); else tris.push(...centroidFan(poly));
      }
    }
    const drop = new Set(members.map(({ f }) => f));
    for (const body of bodies) { const fs = faces.get(body); if (fs?.some((f) => drop.has(f))) faces.set(body, fs.filter((f) => !drop.has(f))); }
    const first = members[0]!;
    const list = out.get(first.body) ?? [];
    list.push({ face: { n: first.f.n, verts: outer[0] ?? first.f.verts }, tris });
    out.set(first.body, list);
  }
  return out;
}

/** Directed boundary stretches chained into closed loops, every corner WELDED to the part's vertex there (canon); null
 *  when they do not close (a stretch with no successor) — the caller then leaves the plane to the per-face path. */
function chainLoops(segments: [V3, V3][], canon: (p: V3) => V3): V3[][] | null {
  const from = new Map<V3, number[]>();
  const segs = segments.map(([p, q]) => [canon(p), canon(q)] as [V3, V3]).filter(([p, q]) => p !== q);
  segs.forEach(([p], k) => { const l = from.get(p); if (l) l.push(k); else from.set(p, [k]); });
  const used = new Uint8Array(segs.length);
  const loops: V3[][] = [];
  for (let s0 = 0; s0 < segs.length; s0 += 1) {
    if (used[s0]) continue;
    const loop: V3[] = [];
    let k = s0;
    for (;;) {
      used[k] = 1;
      loop.push(segs[k]![0]);
      const end = segs[k]![1];
      if (end === segs[s0]![0]) break;
      const next = (from.get(end) ?? []).find((j) => !used[j]);
      if (next === undefined) return null;
      k = next;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

/** One arc chord of a curve, in board-local (u, v), with the arc it is a chord of and the u/v dimension indices. */
interface Chord { a: P2; b: P2; arc: LocalArc; iu: number; iv: number }

/**
 * Every curve's arc chords (curves spec §3.4), by curve id — the outline's own chord points (curveOutline), so a chord
 * face's vertices are these numbers. Built once per bodyMesh call.
 */
function curveChords(board: Board): Map<string, Chord[]> {
  const out = new Map<string, Chord[]>();
  for (const c of board.curves) out.set(c.id, chordsOfCurve(board, c));
  return out;
}

function chordsOfCurve(board: Board, c: CurveCut): Chord[] {
  const [u, v] = uvDims(c.through);
  const iu = DIMENSION_ORDER.indexOf(u);
  const iv = DIMENSION_ORDER.indexOf(v);
  const o = curveOutline(board, c);
  const chords: Chord[] = [];
  let at = 0;
  // The outline lists each segment's start, then (for an arc) its interior chord points: an arc's chords are the
  // outline edges at..at + n - 1 (curvePlan's walk).
  for (const s of localSegments(board, c)) {
    if (s.kind === 'line') { at += 1; continue; }
    const n = arcChords(s, CURVE_TOLERANCE, CURVE_SEGMENTS_MAX);
    for (let k = 0; k < n; k += 1) chords.push({ a: o.pts[at + k]!, b: o.pts[(at + k + 1) % o.pts.length]!, arc: s, iu, iv });
    at += n;
  }
  return chords;
}

/**
 * The chord a face lies on, if any: every vertex's (u, v) within SMOOTH_EPS of that one chord SEGMENT. A face tagged
 * with the curve but not on a chord (an internal wall on a chord plane's extension, a diagonal) gets null — its flat
 * normal. Not the centroid's distance to the circle: a chord face's centroid sits up to a sagitta inside it, and a
 * chord face clipped by another cut has vertices inside the chord, off the circle.
 */
function chordArc(chords: readonly Chord[] | undefined, f: BodyFace): Chord | null {
  if (!chords) return null;
  const near = (p: V3, ch: Chord) => {
    const pu = p[ch.iu]!; const pv = p[ch.iv]!;
    const du = ch.b[0] - ch.a[0]; const dv = ch.b[1] - ch.a[1];
    const t = Math.max(0, Math.min(1, ((pu - ch.a[0]) * du + (pv - ch.a[1]) * dv) / (du * du + dv * dv)));
    return Math.hypot(pu - ch.a[0] - t * du, pv - ch.a[1] - t * dv) <= SMOOTH_EPS;
  };
  return chords.find((ch) => f.verts.every((p) => near(p, ch))) ?? null;
}

/** A hole's box meets the body's (holeTouchesBox over the body's vertex bounds): the body is HOLED (ruling R11). A holed
 *  body — and a split curved body, curves spec §3.4 — draws only its `uncovered` faces. */
function holed(body: Body, holes: readonly Hole[]): boolean {
  if (holes.length === 0) return false;
  const lo: V3 = [Infinity, Infinity, Infinity];
  const hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (const f of body.faces) for (const p of f.verts) for (let i = 0; i < 3; i += 1) { lo[i] = Math.min(lo[i]!, p[i]!); hi[i] = Math.max(hi[i]!, p[i]!); }
  const r = Object.fromEntries(DIMENSION_ORDER.map((d, i) => [d, [lo[i]!, hi[i]!]])) as Region;
  return holes.some((h) => holeTouchesBox(h, r));
}

/**
 * A holed body's face minus every part of it another body of the part covers (ruling R11): a coplanar face of another
 * body facing the opposite way lies against it, so between them is stock — a seam inside the part, never seen, and
 * punching it with every ring that crosses it was most of a holed part's rebuild. Coincident faces drop entirely; a
 * face a neighbour only partly covers keeps the rest (a dado's floor, beside the bodies on either side). A face nothing
 * covers comes back as the same object. Also run on a split curved body (curves spec §3.4): the walls between the slices
 * of a curve's split lie against each other the same way.
 */
function uncovered(f: BodyFace, body: Body, index: SeamIndex): BodyFace[] {
  let pieces: V3[][] = [f.verts];
  const q = f.verts[0]!;
  for (const k of facingAgainst(index, body, f.n[0], f.n[1], f.n[2], q[0], q[1], q[2])) {
    const g = index.faces[k]!;
    pieces = pieces.flatMap((piece) => minusCover(piece, f.n, g.verts));
  }
  if (pieces.length === 1 && pieces[0] === f.verts) return [f];
  return pieces.map((verts) => ({ ...f, verts }));
}

/** The indices, in order, of every face of ANOTHER body lying against a face (normal n, first vertex q): coplanar and
 *  facing the opposite way, within HOLE_EPS (the test `uncovered` always made, unchanged). Only the faces whose normal
 *  KEY lies in the window that test allows are visited (see SeamIndex), so a part with hundreds of faces does not test
 *  every pair. */
function facingAgainst(index: SeamIndex, body: Body, n0: number, n1: number, n2: number, q0: number, q1: number, q2: number): number[] {
  const { num, owner, keys, order } = index;
  const want = -(n0 * KEY[0] + n1 * KEY[1] + n2 * KEY[2]);
  // First sorted position with key >= want − KEY_WINDOW.
  let lo = 0;
  let hi = keys.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (keys[mid]! < want - KEY_WINDOW) lo = mid + 1; else hi = mid; }
  const out: number[] = [];
  for (let j = lo; j < keys.length && keys[j]! <= want + KEY_WINDOW; j += 1) {
    const k = order[j]!;
    const o = k * 6;
    if (n0 * num[o]! + n1 * num[o + 1]! + n2 * num[o + 2]! > -1 + HOLE_EPS) continue;
    if (Math.abs(n0 * (num[o + 3]! - q0) + n1 * (num[o + 4]! - q1) + n2 * (num[o + 5]! - q2)) > HOLE_EPS) continue;
    if (owner[k] !== body) out.push(k);
  }
  return out.sort((a, b) => a - b);   // body order, then face order: the order the covers are subtracted in
}

/**
 * The normal key: n · KEY, a fixed unit direction leaning on no axis. Two (near-)unit normals with n·m <= −1 + HOLE_EPS
 * have |n + m|² = |n|² + |m|² + 2 n·m <= 2·HOLE_EPS (+ rounding), so their keys sum to at most √(2e-9) ≈ 4.5e-5 in
 * magnitude: KEY_WINDOW = 1e-4 cannot miss a face the full test would take.
 */
const KEY = (() => { const v = [1, 0.618, 0.382]; const l = Math.hypot(...v); return v.map((x) => x / l) as V3; })();
const KEY_WINDOW = 1e-4;

/**
 * Every face of a part's bodies, in body order then face order (the order `uncovered` subtracts in), with its normal
 * and first vertex as plain numbers, and sorted by normal key (`order`, `keys`): a split curved part has hundreds of
 * faces (an L-shaped notch's ear-clipped waste: 83 bodies, 477 faces — some 237 000 pairs per rebuild tested one by
 * one). Built once per FROZEN bodies array (partGeometry's, shared and never mutated) and kept by its identity; an
 * unfrozen array is indexed afresh on every call (invariant 50's rule: never memoise what can change). Module-level
 * is safe here, unlike `worldOffsets`' memo: the index holds no pose (board-local faces only), so every part sharing
 * those frozen bodies — in any pose — shares one correct index, and the WeakMap lets it go with the bodies.
 */
interface SeamIndex { owner: Body[]; faces: BodyFace[]; num: Float64Array; keys: Float64Array; order: Int32Array }
const seamIndexes = new WeakMap<readonly Body[], SeamIndex>();
function seamIndex(bodies: readonly Body[]): SeamIndex {
  const hit = seamIndexes.get(bodies);
  if (hit) return hit;
  const owner: Body[] = [];
  const faces: BodyFace[] = [];
  for (const b of bodies) for (const g of b.faces) { owner.push(b); faces.push(g); }
  const num = new Float64Array(faces.length * 6);
  const key = new Float64Array(faces.length);
  for (let k = 0; k < faces.length; k += 1) {
    const g = faces[k]!;
    const p = g.verts[0]!;
    const o = k * 6;
    num[o] = g.n[0]; num[o + 1] = g.n[1]; num[o + 2] = g.n[2]; num[o + 3] = p[0]; num[o + 4] = p[1]; num[o + 5] = p[2];
    key[k] = g.n[0] * KEY[0] + g.n[1] * KEY[1] + g.n[2] * KEY[2];
  }
  const order = Int32Array.from(faces.keys()).sort((a, b) => key[a]! - key[b]!);
  const keys = Float64Array.from(order, (k) => key[k]!);
  const index = { owner, faces, num, keys, order };
  if (Object.isFrozen(bodies)) seamIndexes.set(bodies, index);
  return index;
}

/**
 * One body face as triangles (board-local), with every hole that reaches into it cut out (holes spec §3.2, amended).
 * No hole: the fan bodyMesh always drew, vertex for vertex. Every reaching hole perpendicular to the face with its ring
 * STRICTLY inside it, and the rings PAIRWISE DISJOINT (ruling R4: centres more than r1 + r2 apart in the face plane):
 * triangulated with the rings as holes, from the SAME ring vertices the wall uses, so face and wall share every rim
 * vertex (no T-junctions). Otherwise (a tangent hole, a seam parallel to the axis, a faulted hole — overlapping or
 * coincident rings, which earcut would cover with face): the disjoint convex split, fanned — T-junctions accepted there.
 */
export function faceTriangles(f: BodyFace, holes: readonly Hole[]): V3[][] {
  const fan = (p: V3[]): V3[][] => p.slice(1, -1).map((_, i) => [p[0]!, p[i + 1]!, p[i + 2]!]);
  const reaching = holes.filter((h) => holeTouches(h, f.verts));
  if (reaching.length === 0) return fan(f.verts);
  const a = [0, 1, 2].reduce((m, k) => (Math.abs(f.n[k]!) > Math.abs(f.n[m]!) ? k : m), 0);
  const [u, v] = [0, 1, 2].filter((k) => k !== a) as [number, number];
  const rings = reaching.map((h) => { const t = axialOffset(h, f); return t === null ? null : holeRing(h, t); });
  // Holes on a perpendicular face share its axis, so their in-plane centre distance decides overlap.
  const disjoint = reaching.every((h, i) => reaching.slice(i + 1).every((g) =>
    Math.hypot(h.centre[u] - g.centre[u], h.centre[v] - g.centre[v]) > h.radius + g.radius + HOLE_EPS));
  if (disjoint && rings.every((r): r is V3[] => r !== null && ringInside(f.verts, f.n, r))) {
    const flat = (p: V3) => new Vector2(p[u], p[v]);
    const contour = f.verts.map(flat);
    const flatRings = rings.map((r) => r.map(flat));
    // triangulateShape drops a contour's last point when it equals the first (removeDupEndPts), which would shift every
    // index against `all`; such a contour takes the fallback split instead.
    const closed = (c: Vector2[]) => c.length > 2 && c[c.length - 1]!.equals(c[0]!);
    if (!closed(contour) && !flatRings.some(closed)) {
      const all = [...f.verts, ...rings.flat()];
      return ShapeUtils.triangulateShape(contour, flatRings)
        .map(([i, j, k]) => [all[i!]!, all[j!]!, all[k!]!]);
    }
  }
  let pieces: V3[][] = [f.verts];
  for (const h of reaching) { const prism = holePrism(h); pieces = pieces.flatMap((p) => minusPrism(p, prism)); }
  return pieces.flatMap(fan);
}

/** One hole-mesh vertex: position (centred), world normal, UV from the facet's plan (holeMesh's emit). */
interface WallSink { out: { pos: number[]; nor: number[]; uv: number[] }; plan: FacePlan; extents: [number, number, number]; ou: number; ov: number }
function putWall({ out, plan, extents, ou, ov }: WallSink, q: V3, nw: V3): void {
  out.pos.push(q[0] - extents[0] / 2, q[1] - extents[1] / 2, q[2] - extents[2] / 2);
  out.nor.push(nw[0], nw[1], nw[2]);
  out.uv.push(q[plan.axes[0]]! / plan.tileInches[0] + (plan.fit[0] ? 0 : ou), q[plan.axes[1]]! / plan.tileInches[1] + (plan.fit[1] ? 0 : ov));
}

/**
 * One hole's wall and (blind) bottom (holes spec §3.2): the wall's HOLE_SEGMENTS quads between the entry ring and the
 * far ring, and the bottom ring. A clean hole (holeInStock) draws them whole (ruling R15); a faulted one clips each to
 * every body, so its wall stops at the stock (and a seam splits it). `checks` is the board's stockChecks: a caller
 * drawing every hole of a part builds it once per rebuild and passes it. Explicit normals — radial toward the axis on the wall (smooth), back toward the mouth on the
 * bottom — because BoardMesh's computeVertexNormals would facet them. Triangles wound to face along their normals
 * (the materials are FrontSide). UVs and materials as bodyMesh's sloped faces: each facet takes the plan of the world
 * axis its normal is nearest.
 */
export function holeMesh(board: Board, h: Hole, bodies: readonly Body[], checks: StockChecks = stockChecks(board)): { positions: Float32Array; normals: Float32Array; uvs: Float32Array; groups: { start: number; count: number; materialIndex: number }[] } {
  const plans = facePlans(board);
  const frame = axisFrame(board);
  const extents = boardExtents(board);
  const [ou, ov] = boardUVOffset(board.id);
  const dimIndex = (d: Dimension) => DIMENSION_ORDER.indexOf(d);
  const offsetOf = worldOffsets(board);
  const [d0, d1, d2] = frame.map((f) => dimIndex(f.dim)) as [number, number, number];
  const [s0, s1, s2] = frame.map((f) => (f.reversed ? -1 : 1));
  const vecOf = (n: V3): V3 => [n[d0]! * s0!, n[d1]! * s1!, n[d2]! * s2!];
  const planes = bodies.map((b) => bodyPlanes(b.faces));
  const a = dimIndex(h.axis);
  const inward = (p: V3): V3 => {
    const r: V3 = [h.centre[0] - p[0], h.centre[1] - p[1], h.centre[2] - p[2]];
    r[a] = 0;
    const l = Math.hypot(...r);
    return [r[0] / l, r[1] / l, r[2] / l];
  };
  const byMaterial = Array.from({ length: 6 }, () => ({ pos: [] as number[], nor: [] as number[], uv: [] as number[] }));
  // One convex piece, fanned from its first vertex: `ws` its vertices' world offsets, `ns` their WORLD normals, `fw` the
  // facet's world normal (material, plan and winding).
  const emit = (ws: V3[], ns: V3[], fw: V3) => {
    let axis = 0;
    for (let i = 1; i < 3; i += 1) if (Math.abs(fw[i]!) > Math.abs(fw[axis]!) + 1e-9) axis = i;
    const material = axis * 2 + (fw[axis]! > 0 ? 0 : 1);
    const plan = plans[material]!;
    const out = byMaterial[material]!;
    const at = { out, plan, extents, ou, ov };
    for (let i = 1; i + 1 < ws.length; i += 1) {
      const d = facing(ws[0]!, ws[i]!, ws[i + 1]!, fw);
      if (d === null) continue;
      putWall(at, ws[0]!, ns[0]!);
      if (d < 0) { putWall(at, ws[i + 1]!, ns[i + 1]!); putWall(at, ws[i]!, ns[i]!); } else { putWall(at, ws[i]!, ns[i]!); putWall(at, ws[i + 1]!, ns[i + 1]!); }
    }
  };
  const wallNormals = new Map<V3, V3>();
  const wallNormal = (p: V3): V3 => {
    let nw = wallNormals.get(p);
    if (!nw) { nw = vecOf(inward(p)); wallNormals.set(p, nw); }
    return nw;
  };
  const top = holeRing(h, 0);
  const far = holeRing(h, h.depth);
  // Every wall quad and the bottom are made of ring vertices, so one test per body finds the planes that can change
  // them, or that nothing survives (clipPlan; Task 11b) — the same pieces as clipping by every plane. A body with no
  // such plane keeps every quad whole, so its quads are emitted from the rings' offsets and normals by index.
  // A CLEAN hole (holeInStock: no breaks-out, off-flat or too-deep — holeFaults' own checks) lies wholly in the stock,
  // so its wall and bottom are drawn whole, once, never split where they cross a seam between bodies (ruling R15).
  const rings = [...top, ...far];
  const plan: Plane[][] = holeInStock(board, h, checks)
    ? [[]]
    : planes.map((ps) => clipPlan(ps, rings)).filter((ps): ps is Plane[] => ps !== null);
  const clip = (poly: V3[], ps: Plane[]): V3[] => {
    let p = poly;
    for (const q of ps) { p = clipPolygon(p, q); if (!p.length) break; }
    return p;
  };
  const topW = top.map(offsetOf); const farW = far.map(offsetOf);
  const topN = top.map(wallNormal); const farN = far.map(wallNormal);
  for (let k = 0; k < top.length; k += 1) {
    const k1 = (k + 1) % top.length;
    const quad = [top[k]!, top[k1]!, far[k1]!, far[k]!];
    const mid: V3 = [0, 1, 2].map((i) => (top[k]![i]! + top[k1]![i]!) / 2) as V3;
    const fw = vecOf(inward(mid));
    for (const ps of plan) {
      if (ps.length === 0) { emit([topW[k]!, topW[k1]!, farW[k1]!, farW[k]!], [topN[k]!, topN[k1]!, farN[k1]!, farN[k]!], fw); continue; }
      const piece = clip(quad, ps);
      if (piece.length) emit(piece.map(offsetOf), piece.map(wallNormal), fw);
    }
  }
  if (!h.through) {
    const back: V3 = [0, 0, 0];
    back[a] = -h.dir;
    const backWorld = vecOf(back);
    for (const ps of plan) {
      const piece = ps.length === 0 ? far : clip(far, ps);
      if (piece.length) emit(piece === far ? farW : piece.map(offsetOf), piece.map(() => backWorld), backWorld);
    }
  }
  const { groups, out: [positions, normals, uvs] } = packGroups(byMaterial.map((m) => [m.pos, m.nor, m.uv]));
  return { positions: positions!, normals: normals!, uvs: uvs!, groups };
}

/**
 * Every hole of a part as ONE geometry (final review 2): each hole's holeMesh, unchanged, concatenated material by
 * material in hole order, so a part draws its holes in one mesh (one draw call per material) rather than one mesh per
 * hole. Every holeMesh is centred on the board, so concatenation needs no offset. Null for a part with no holes: it
 * adds no hole mesh. `checks` as holeMesh's (built once per rebuild by the caller).
 */
export function holesMesh(board: Board, holes: readonly Hole[], bodies: readonly Body[], checks: StockChecks = stockChecks(board)): { positions: Float32Array; normals: Float32Array; uvs: Float32Array; groups: { start: number; count: number; materialIndex: number }[] } | null {
  if (holes.length === 0) return null;
  const meshes = holes.map((h) => holeMesh(board, h, bodies, checks));
  // Vertices per material over every hole, then each material's run laid out back to back in BoxGeometry order (as
  // packGroups lays one mesh out), each hole's slice copied straight in: no intermediate number arrays (a 42-hole part
  // rebuilds every drag frame).
  const counts = new Array<number>(6).fill(0);
  for (const m of meshes) for (const g of m.groups) counts[g.materialIndex]! += g.count;
  const total = counts.reduce((a, b) => a + b, 0);
  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  const uvs = new Float32Array(total * 2);
  const groups: { start: number; count: number; materialIndex: number }[] = [];
  const at = new Array<number>(6).fill(0);
  let start = 0;
  counts.forEach((count, materialIndex) => {
    if (count === 0) return;
    groups.push({ start, count, materialIndex });
    at[materialIndex] = start;
    start += count;
  });
  for (const m of meshes) {
    for (const g of m.groups) {
      const v = at[g.materialIndex]!;
      positions.set(m.positions.subarray(g.start * 3, (g.start + g.count) * 3), v * 3);
      normals.set(m.normals.subarray(g.start * 3, (g.start + g.count) * 3), v * 3);
      uvs.set(m.uvs.subarray(g.start * 2, (g.start + g.count) * 2), v * 2);
      at[g.materialIndex] = v + g.count;
    }
  }
  return { positions, normals, uvs, groups };
}

/**
 * Everything boardUVs reads, as one string.
 *
 * BoardMesh memoises the geometry that carries the UV attribute, and a memo
 * keyed on a hand-written list of fields goes stale the moment boardUVs learns
 * to read a new one. That is not hypothetical: `grain` was added in v3 and the
 * list was not updated, so a board's grain silently stopped turning on screen
 * while the document was correct. Keying the memo on this instead means the
 * list lives next to the code that decides it.
 *
 * Walked from boardUVs itself: facePlans reads boardExtents (length, width,
 * thickness), axisDimensions (rotation, posture), faceGrainKinds (grain,
 * posture, rotation), grainFamily (material) and ranks (grain); boardUVs
 * itself also reads id via boardUVOffset, and board.cuts because they
 * determine which solids exist and therefore which `solid` argument
 * BoardMesh will call boardUVs with for each one. `position` and `name` are
 * deliberately absent — boardUVs never reads them, and a board being dragged
 * must not rebuild its geometry every frame.
 *
 * This signature describes the BOARD, not any one solid — it is identical
 * whichever solid boardUVs is asked for, since `solid` never appears in the
 * list above. That is correct for its actual job (keying BoardMesh's memo of
 * facePlans/tileInches/the offset, all of which are board-level), but it
 * means a caller rendering one mesh per solid must not key a per-solid cache
 * on this signature alone — every solid of a board shares one signature and
 * would collide.
 */
export function boardUVSignature(board: Board): string {
  board = geometryBoard(board);
  return [
    board.id,
    board.rotation,
    board.posture,
    board.material,
    board.grain,
    board.length,
    board.width,
    board.thickness,
    // Cuts change which solids exist and therefore which sub-ranges are
    // asked for. v3 shipped a bug of exactly this shape — `grain` was added
    // to what boardUVs reads without updating BoardMesh's memo, so grain
    // silently stopped turning on screen while the document stayed correct.
    // The cut part is read from the shared CUT_GEOMETRY_KEYS table (cuts.ts),
    // not a hand-written list: this list once omitted stopMin/stopMax, and the
    // 3D view kept drawing the old cut after a stop edit (invariant 40).
    board.cuts
      .map((c) => CUT_GEOMETRY_KEYS.map((k) => c[k]).join(','))
      .join(';'),
    // Angle cuts change which bodies exist and which faces are sloped
    // (angle-cuts spec §3.2; invariant 15).
    board.angleCuts.map((c) => angleCutValues(c).join(',')).join(';'),
    // Holes change which faces are opened and add walls (holes spec §3.2; invariant 15).
    board.holes.map((r) => holeRowValues(r).join(',')).join(';'),
    // Curves change which bodies exist and add chord faces (curves spec §3.2; invariant 15).
    board.curves.map((c) => `${c.id}:${curveValues(c)}`).join(';'),
    // Swept profiles (profile runs b1) change which bodies exist; appended only when the view holds one (byte for byte).
    ...(sweptProfiles(board).length > 0 ? [sweptProfiles(board).map((p) => `${p.id}:${profileValues(p)}`).join(';')] : []),
  ].join('|');
}

/**
 * A per-board offset into the shared texture, so two pine parts sitting edge to
 * edge do not read as clones. Derived from the id rather than drawn at random:
 * the same board must offset the same way on every load. FNV-1a, which is
 * plenty for shuffling a texture.
 */
export function boardUVOffset(id: string): [number, number] {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return [
    (h >>> 0) / 4294967296,
    (Math.imul(h ^ 0x9e3779b9, 48271) >>> 0) / 4294967296,
  ];
}
