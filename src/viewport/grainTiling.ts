import { ShapeUtils, Vector2 } from 'three';
import {
  angleCutValues, axialOffset, axisFrame, boardExtents, bodyPlanes, clipPlan, clipPolygon, CUT_GEOMETRY_KEYS, DIMENSION_ORDER,
  HOLE_EPS, holePrism, holeRing, holeRowValues, holeTouches, holeTouchesBox, isSheetGood, minusCover, minusPrism, ringInside, spanToWorldOffset, toWorldOffset,
  wholeBoard,
} from '../document/document';
import type { Board, Body, BodyFace, Hole, Plane, Region, Span, V3 } from '../document/document';
import { axisDimensions, faceGrainKinds, grainFamily } from './grainFaces';
import type { Dimension, GrainFamily, GrainKind } from './grainFaces';

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
 */
export function bodyMesh(board: Board, body: Body, holes: readonly Hole[] = [], bodies?: readonly Body[]): { positions: Float32Array; uvs: Float32Array; groups: { start: number; count: number; materialIndex: number }[] } {
  const plans = facePlans(board);
  const frame = axisFrame(board);
  const extents = boardExtents(board);
  const [ou, ov] = boardUVOffset(board.id);
  const dimIndex = (d: Dimension) => DIMENSION_ORDER.indexOf(d);
  const offsetOf = worldOffsets(board);
  const byMaterial: { pos: number[]; uv: number[] }[] = Array.from({ length: 6 }, () => ({ pos: [], uv: [] }));
  const faces = bodies && holed(body, holes) ? body.faces.flatMap((f) => uncovered(f, body, bodies)) : body.faces;
  for (const f of faces) {
    const n = [0, 1, 2].map((i) => f.n[dimIndex(frame[i]!.dim)]! * (frame[i]!.reversed ? -1 : 1));
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
    for (const t of faceTriangles(f, holes)) {
      const w0 = offsetOf(t[0]!); const w1 = offsetOf(t[1]!); const w2 = offsetOf(t[2]!);
      const d = facing(w0, w1, w2, n);
      // Near-duplicate vertices from clipping make zero-area fans; emit nothing for them.
      if (d === null) continue;
      put(w0);
      if (d < 0) { put(w2); put(w1); } else { put(w1); put(w2); }
    }
  }
  const { groups, out: [positions, uvs] } = packGroups(byMaterial.map((m) => [m.pos, m.uv]));
  return { positions: positions!, uvs: uvs!, groups };
}

/** A hole's box meets the body's (holeTouchesBox over the body's vertex bounds): the body is HOLED (ruling R11). */
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
 * covers comes back as the same object.
 */
function uncovered(f: BodyFace, body: Body, bodies: readonly Body[]): BodyFace[] {
  let pieces: V3[][] = [f.verts];
  for (const other of bodies) {
    if (other === body) continue;
    for (const g of other.faces) {
      if (f.n[0] * g.n[0] + f.n[1] * g.n[1] + f.n[2] * g.n[2] > -1 + HOLE_EPS) continue;
      const p = g.verts[0]!;
      const q = f.verts[0]!;
      if (Math.abs(f.n[0] * (p[0] - q[0]) + f.n[1] * (p[1] - q[1]) + f.n[2] * (p[2] - q[2])) > HOLE_EPS) continue;
      pieces = pieces.flatMap((piece) => minusCover(piece, f.n, g.verts));
    }
  }
  if (pieces.length === 1 && pieces[0] === f.verts) return [f];
  return pieces.map((verts) => ({ ...f, verts }));
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
 * far ring, each clipped to every body (so a seam splits it and a faulted hole's wall stops at the stock); the bottom
 * ring clipped likewise. Explicit normals — radial toward the axis on the wall (smooth), back toward the mouth on the
 * bottom — because BoardMesh's computeVertexNormals would facet them. Triangles wound to face along their normals
 * (the materials are FrontSide). UVs and materials as bodyMesh's sloped faces: each facet takes the plan of the world
 * axis its normal is nearest.
 */
export function holeMesh(board: Board, h: Hole, bodies: readonly Body[]): { positions: Float32Array; normals: Float32Array; uvs: Float32Array; groups: { start: number; count: number; materialIndex: number }[] } {
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
  const rings = [...top, ...far];
  const plan = planes.map((ps) => clipPlan(ps, rings)).filter((ps): ps is Plane[] => ps !== null);
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
