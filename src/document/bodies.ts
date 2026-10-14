import type { Board, Region } from './types';
import { CUT_GEOMETRY_KEYS, pocketCells, pocketEdges, type Point, type Segment } from './cuts';
import { boardHoles, holeRowValues, type Hole } from './holes';
import { angleCutValues, keptHalfSpace, type V3 } from './angleCuts';

/** Inches. Below any bench precision, above float drift on part-sized numbers. */
export const BODY_EPS = 1e-9;

/** One face of a body: outward unit normal and a convex polygon, board-local. Winding is NOT meaningful —
 *  a consumer that needs it orients against `n` (BoardMesh does). `cut` names the angle cut whose plane
 *  the face lies on. */
export interface BodyFace { n: V3; verts: V3[]; cut?: string }

/**
 * A convex piece of a part's remaining stock (angle-cuts spec §3.1): one pocket
 * cell clipped by every angle cut's kept half-space. `box` is the cell itself
 * exactly when no angle cut clipped it — the signal every consumer uses to keep
 * today's box path byte-for-byte.
 */
export interface Body { box: Region | null; faces: BodyFace[] }

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };

function boxFaces(r: Region): BodyFace[] {
  const [l0, l1] = r.length;
  const [w0, w1] = r.width;
  const [t0, t1] = r.thickness;
  return [
    { n: [-1, 0, 0], verts: [[l0, w0, t0], [l0, w0, t1], [l0, w1, t1], [l0, w1, t0]] },
    { n: [1, 0, 0], verts: [[l1, w0, t0], [l1, w1, t0], [l1, w1, t1], [l1, w0, t1]] },
    { n: [0, -1, 0], verts: [[l0, w0, t0], [l1, w0, t0], [l1, w0, t1], [l0, w0, t1]] },
    { n: [0, 1, 0], verts: [[l0, w1, t0], [l0, w1, t1], [l1, w1, t1], [l1, w1, t0]] },
    { n: [0, 0, -1], verts: [[l0, w0, t0], [l0, w1, t0], [l1, w1, t0], [l1, w0, t0]] },
    { n: [0, 0, 1], verts: [[l0, w0, t1], [l1, w0, t1], [l1, w1, t1], [l0, w1, t1]] },
  ];
}

/** Points on one plane, de-duplicated and ordered around their centroid: a convex ring. */
function ring(points: V3[], n: V3): V3[] {
  const pts: V3[] = [];
  for (const p of points) if (!pts.some((q) => Math.hypot(...sub(p, q)) <= BODY_EPS)) pts.push(p);
  if (pts.length < 3) return [];
  const c: V3 = [0, 1, 2].map((i) => pts.reduce((s, p) => s + p[i]!, 0) / pts.length) as V3;
  const helper: V3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = unit(cross(n, helper));
  const w = cross(n, u);
  return pts
    .map((p) => ({ p, a: Math.atan2(dot(sub(p, c), w), dot(sub(p, c), u)) }))
    .sort((x, y) => x.a - y.a)
    .map((x) => x.p);
}

/**
 * Keep the part of a convex body on the side n·x + d >= 0 (one saw pass).
 * Returns the SAME array when nothing is removed, so the caller can tell a
 * clipped body from an untouched one. A face lying on the plane is kept as is
 * and no cap is added (the plane is already a face).
 */
function clip(faces: BodyFace[], h: { n: V3; d: number }, cut: string): BodyFace[] {
  const g = (p: V3) => dot(h.n, p) + h.d;
  const side = (p: V3) => { const v = g(p); return v > BODY_EPS ? 1 : v < -BODY_EPS ? -1 : 0; };
  if (!faces.some((f) => f.verts.some((p) => side(p) < 0))) return faces;
  const out: BodyFace[] = [];
  const cap: V3[] = [];
  let onPlane = false;
  for (const f of faces) {
    if (f.verts.every((p) => side(p) === 0)) onPlane = true;
    const kept: V3[] = [];
    for (let i = 0; i < f.verts.length; i += 1) {
      const a = f.verts[i]!;
      const b = f.verts[(i + 1) % f.verts.length]!;
      const sa = side(a);
      const sb = side(b);
      if (sa >= 0) kept.push(a);
      if (sa === 0) cap.push(a);
      if (sa * sb < 0) {
        const t = g(a) / (g(a) - g(b));
        const p: V3 = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])];
        kept.push(p);
        cap.push(p);
      }
    }
    if (kept.length >= 3) out.push({ ...f, verts: kept });
  }
  if (!onPlane) {
    const r = ring(cap, h.n);
    if (r.length >= 3) out.push({ n: [-h.n[0], -h.n[1], -h.n[2]], verts: r, cut });
  }
  return out;
}

/**
 * One convex body (faces in any one frame) kept on the side n·x + d >= 0: `clip`, for a caller with no cut to name.
 * The checks intersect two world bodies with it (fu 302): a body clipped by each of the other's inside half-spaces.
 */
export function clipConvex(faces: BodyFace[], h: { n: V3; d: number }): BodyFace[] {
  return clip(faces, h, '');
}

/**
 * THE place angle cuts become geometry (angle-cuts spec §3.1): each pocket cell
 * clipped by every angle cut's kept half-space. With no angle cuts this is the
 * pocket cells as boxes, so a part without angle cuts costs nothing. Can return
 * `[]` (a part its cuts consumed) — BoardMesh draws invariant 21's ghost then.
 */
export function boardBodies(board: Board): Body[] {
  const cells = pocketCells(board);
  const planes = board.angleCuts.flatMap((c) => {
    const h = keptHalfSpace(board, c);
    return h ? [{ h, id: c.id }] : [];
  });
  const out: Body[] = [];
  for (const r of cells) {
    const start = boxFaces(r);
    let faces = start;
    for (const { h, id } of planes) {
      faces = clip(faces, h, id);
      if (faces.length === 0) break;
    }
    if (faces.length >= 4) out.push({ box: faces === start ? r : null, faces });
  }
  return out;
}

/** Distinct vertices of a body. */
export function bodyVerts(body: Body): V3[] {
  const out: V3[] = [];
  for (const f of body.faces) for (const p of f.verts) if (!out.some((q) => Math.hypot(...sub(p, q)) <= BODY_EPS)) out.push(p);
  return out;
}

/** Volume by the divergence theorem: ⅓ Σ (n·v₀)·area. */
export function bodyVolume(body: Body): number {
  let v = 0;
  for (const f of body.faces) {
    const p0 = f.verts[0]!;
    let area: V3 = [0, 0, 0];
    for (let i = 1; i + 1 < f.verts.length; i += 1) {
      const c = cross(sub(f.verts[i]!, p0), sub(f.verts[i + 1]!, p0));
      area = [area[0] + c[0], area[1] + c[1], area[2] + c[2]];
    }
    v += (dot(f.n, p0) * Math.abs(dot(area, f.n))) / 2;
  }
  return v / 3;
}

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);

/**
 * Inches. A polygon edge this short is a sliver, not a feature: `clip` keeps
 * a vertex sitting just over BODY_EPS off a plane next to the crossing point it
 * computes on that plane, so a kept polygon can carry an edge ~1e-9 long whose
 * direction is noise, and a cell corner just above a plane survives as a
 * sub-micro wedge of its own. A sliver edge makes no line and is no wall in
 * the inside test, and a face without three real edges is not a face — so a
 * sliver can neither draw a speck nor claim every point on a line. Far below
 * bench precision (1/64in). The price: a feature between BODY_EPS and this —
 * reachable only from a hand-edited file, since every entry is fractional
 * inches — is drawn approximately (a 1e-7 riser is dropped and its neighbour's
 * edge stands in, a few micro-inches off), never as specks.
 */
const SLIVER = 1e-6;

/** An in-plane direction from a line into a face that holds it, with that face's normal. */
interface Wing { n: V3; w: V3 }

/**
 * The edges of a union of convex bodies (angle-cuts spec §3.4, invariant 16
 * generalised): a segment is drawn where faces of the remaining stock meet and
 * are NOT coplanar, and nowhere else.
 *
 * Candidate lines are every face polygon's edges, grouped by the line they lie
 * on and split at every endpoint and every crossing with a coplanar face's
 * boundary, so a face either contains a whole interval or none of it. At each
 * interval's midpoint, every face containing it contributes WINGS — the
 * in-plane direction from the line into the face (two for a face the line
 * crosses the interior of, one for a face it bounds). A wing pair with the
 * same direction and opposite normals is an internal wall between two bodies
 * and cancels. What is left is no edge when it is empty or one flat surface
 * continuing through (two wings, same normal, opposite directions); anything
 * else is an edge. That is pocketEdges' four-cell rule restated without a grid:
 * four filled cells cancel to nothing, two sharing a face leave a flat pair,
 * and one, three or a diagonal two leave a crease.
 *
 * Every comparison is within BODY_EPS (or SLIVER, for lengths): a crossing two
 * neighbouring faces share is computed twice and the two values differ in the
 * last bits, so nothing here assumes exact equality.
 */
export function bodyEdges(bodies: readonly Body[]): [V3, V3][] {
  const edgesOf = (f: BodyFace): [V3, V3][] =>
    f.verts.map((a, i) => [a, f.verts[(i + 1) % f.verts.length]!] as [V3, V3]).filter(([a, b]) => len(sub(b, a)) > SLIVER);
  // A face with fewer than three non-sliver edges has no area worth the name, and with its sliver edges
  // left out of the inside test it would "contain" every point on the line: it is not a face here.
  const faces = bodies.flatMap((b) => b.faces).filter((f) => edgesOf(f).length >= 3);
  const cents = faces.map((f) => scale(f.verts.reduce((s, p) => add(s, p), [0, 0, 0] as V3), 1 / f.verts.length));

  // 1. Lines: every polygon edge, grouped by the line it lies on (direction signed so grouping ignores winding).
  interface Line { o: V3; u: V3; ts: number[]; spans: [number, number][] }
  const lines: Line[] = [];
  for (const f of faces) {
    for (const [a, b] of edgesOf(f)) {
      let u = unit(sub(b, a));
      const lead = Math.abs(u[0]) > BODY_EPS ? u[0] : Math.abs(u[1]) > BODY_EPS ? u[1] : u[2];
      if (lead < 0) u = scale(u, -1);
      let line = lines.find((l) => len(cross(l.u, u)) <= BODY_EPS && len(cross(sub(a, l.o), l.u)) <= BODY_EPS);
      if (!line) { line = { o: a, u, ts: [], spans: [] }; lines.push(line); }
      const ta = dot(sub(a, line.o), line.u);
      const tb = dot(sub(b, line.o), line.u);
      line.ts.push(ta, tb);
      line.spans.push([Math.min(ta, tb), Math.max(ta, tb)]);
    }
  }

  const out: [V3, V3][] = [];
  for (const line of lines) {
    // 2. Faces whose plane holds the line, and where the line crosses their boundaries.
    const coplanar = faces.map((f, i) => ({ f, i })).filter(({ f }) =>
      Math.abs(dot(f.n, line.u)) <= BODY_EPS && Math.abs(dot(f.n, sub(line.o, f.verts[0]!))) <= BODY_EPS);
    const ts = [...line.ts];
    for (const { f } of coplanar) {
      for (const [a, b] of edgesOf(f)) {
        const e = sub(b, a);
        // In the face's plane, o + t·u meets a + s·e where (o + t·u − a)·(n × e) = 0.
        const m = unit(cross(f.n, e));
        const den = dot(line.u, m);
        if (Math.abs(den) <= BODY_EPS) continue; // parallel (a collinear edge already gave its endpoints)
        const t = dot(sub(a, line.o), m) / den;
        const s = dot(sub(add(line.o, scale(line.u, t)), a), e) / dot(e, e);
        if (s >= -BODY_EPS && s <= 1 + BODY_EPS) ts.push(t);
      }
    }
    ts.sort((x, y) => x - y);
    const cuts: number[] = [];
    for (const t of ts) if (!cuts.length || t - cuts[cuts.length - 1]! > BODY_EPS) cuts.push(t);

    // 3. Judge each interval at its midpoint; merge consecutive drawn intervals into one segment.
    const judge = (tm: number): boolean => {
      if (!line.spans.some(([lo, hi]) => lo - BODY_EPS <= tm && tm <= hi + BODY_EPS)) return false;
      const mid = add(line.o, scale(line.u, tm));
      const wings: Wing[] = [];
      for (const { f, i } of coplanar) {
        const c = cents[i]!;
        let inside = true;
        let onEdge = false;
        for (const [a, b] of edgesOf(f)) {
          let e = unit(cross(f.n, sub(b, a)));
          if (dot(e, sub(c, a)) < 0) e = scale(e, -1); // inward
          const dist = dot(e, sub(mid, a));
          if (dist < -BODY_EPS) { inside = false; break; }
          if (dist <= BODY_EPS) onEdge = true;
        }
        if (!inside) continue;
        const w = unit(cross(f.n, line.u));
        if (!onEdge) { wings.push({ n: f.n, w }, { n: f.n, w: scale(w, -1) }); continue; }
        wings.push({ n: f.n, w: dot(w, sub(c, mid)) >= 0 ? w : scale(w, -1) });
      }
      // Cancel internal walls: same direction, opposite normals.
      for (let a = 0; a < wings.length; a += 1) {
        for (let b = a + 1; b < wings.length; b += 1) {
          if (dot(wings[a]!.w, wings[b]!.w) > 1 - BODY_EPS && dot(wings[a]!.n, wings[b]!.n) < -1 + BODY_EPS) {
            wings.splice(b, 1);
            wings.splice(a, 1);
            a -= 1;
            break;
          }
        }
      }
      const flat = wings.length === 2
        && dot(wings[0]!.n, wings[1]!.n) > 1 - BODY_EPS && dot(wings[0]!.w, wings[1]!.w) < -1 + BODY_EPS;
      return wings.length > 0 && !flat;
    };

    let run: number | null = null;
    const flush = (end: number) => {
      if (run !== null) out.push([add(line.o, scale(line.u, run)), add(line.o, scale(line.u, end))]);
      run = null;
    };
    for (let k = 0; k + 1 < cuts.length; k += 1) {
      const drawn = judge((cuts[k]! + cuts[k + 1]!) / 2);
      if (drawn && run === null) run = cuts[k]!;
      if (!drawn) flush(cuts[k]!);
    }
    flush(cuts[cuts.length - 1] ?? 0);
  }
  return out;
}

const toPoint = (p: V3): Point => ({ length: p[0], width: p[1], thickness: p[2] });

/**
 * A part's edge lines (invariant 16): `pocketEdges`' exact grid rule for a part
 * without angle cuts, `bodyEdges` otherwise. The ONE name every edge drawer
 * (BoardMesh, the drawings) reads.
 */
export function boardEdges(board: Board): Segment[] {
  if (board.angleCuts.length === 0) return pocketEdges(board);
  return bodyEdges(boardBodies(board)).map(([a, b]) => [toPoint(a), toPoint(b)] as Segment);
}

/** A part's board-local geometry, shared by every part with the same geometry key. NEVER mutate it (frozen). */
export interface PartGeometry {
  readonly bodies: readonly Body[];
  readonly edges: readonly Segment[];
  /** Every row's instances (holes spec §3.1); bodies stay hole-free. */
  readonly holes: readonly Hole[];
}

/** Exact, and distinct for -0, NaN and ±Infinity (JSON would write all of the last three as `null`). */
const num = (n: number): string => (Object.is(n, -0) ? '-0' : String(n));

/**
 * Everything `boardBodies` and `boardEdges` read, as one string: the three dimensions, every cut's
 * CUT_GEOMETRY_KEYS values, and every angle cut's id and ANGLE_CUT_KEYS values, in stored order.
 *
 * Position, rotation, posture, grain, material and the part's id are NOT in it: the pocket grid
 * (`cutRegion`, `pocketCells`, `pocketEdges`) reads only the dimensions and cuts, and `keptHalfSpace`
 * only the dimensions and the angle cut — the geometry is board-local, and every pose is applied
 * after (toWorld, worldBodies, bodyMesh). Every hole row's id and HOLE_KEYS values are in it too (a hole carries
 * its row id, Hole.row). The angle cut's ID is in it because a clipped face carries
 * it (`BodyFace.cut`) and `bodyMesh` looks the cut up by it; a pocket cut's id is not (no output
 * carries one). Ids are JSON-quoted so an id holding a separator cannot collide.
 */
export function geometryKey(board: Board): string {
  const val = (v: string | number) => (typeof v === 'number' ? num(v) : v);
  const cuts = board.cuts.map((c) => CUT_GEOMETRY_KEYS.map((k) => val(c[k])).join(',')).join(';');
  const angles = board.angleCuts.map((c) => `${JSON.stringify(c.id)}:${angleCutValues(c).map(val).join(',')}`).join(';');
  const holes = board.holes.map((r) => `${JSON.stringify(r.id)}:${holeRowValues(r).map(val).join(',')}`).join(';');
  return `${num(board.length)},${num(board.width)},${num(board.thickness)}|${cuts}|${angles}|${holes}`;
}

function deepFreeze<T>(o: T): T {
  if (typeof o === 'object' && o !== null && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

/** Entries kept. A furniture piece has far fewer distinct part geometries; a drag mints at most one more per frame. */
export const PART_GEOMETRY_LIMIT = 256;
const cache = new Map<string, PartGeometry>();

/**
 * THE cached reader of a part's bodies and edges (angle-cuts final review): `boardBodies` and
 * `boardEdges`, computed once per distinct `geometryKey` and shared, so a drag frame — which
 * rebuilds every world part as a new object — recomputes only the part whose geometry changed.
 * Edges are computed on first read (a caller needing only bodies never pays for them). Least
 * recently used entries are evicted past PART_GEOMETRY_LIMIT. The result is deep-frozen: shared
 * between parts, it must never be mutated.
 */
export function partGeometry(board: Board): PartGeometry {
  const key = geometryKey(board);
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const bodies = deepFreeze(boardBodies(board));
  const holes = deepFreeze(boardHoles(board));
  let edges: readonly Segment[] | undefined;
  const entry: PartGeometry = {
    bodies,
    holes,
    get edges() {
      if (!edges) {
        edges = deepFreeze(board.angleCuts.length === 0
          ? pocketEdges(board)
          : bodyEdges(bodies).map(([a, b]) => [toPoint(a), toPoint(b)] as Segment));
      }
      return edges;
    },
  };
  cache.set(key, entry);
  if (cache.size > PART_GEOMETRY_LIMIT) cache.delete(cache.keys().next().value!);
  return entry;
}
