// A SWEPT profile on the Plans sheet (profile runs b1, Task 7; spec B8, Q5; invariants 16, 47, 53). Along-path creases on a
// path ARC are drawn as fine paths on the TRUE offset arc (the outline arc offset by the crease's section s, at its t), with
// visibility judged on the model chord; the doubly curved surface round a corner outlines itself by a facet chain
// (`profileSilhouettes`); every line the profile makes carries its feature tag, so planKeys can anchor its letter.
import { describe, expect, it } from 'vitest';
import { createBoard, partGeometry } from './document';
import { archCurve } from './curves';
import type { Board } from './types';
import { curveDrawEdges, profileSilhouettes, silhouetteLines, DRAWING_CURVE_SEGMENTS_MAX, DRAWING_CURVE_TOLERANCE, type DrawEdge } from './curveDrawing';
import { featureTag } from './featureKeys';
import { drawView, FRONT, ISO, SIDE, TOP, type View } from './drawing';
import { toWorld } from './snapPoints';
import { apronArch, endToEnd, frontOnly, loop, topCorners } from './sweepFixtures';

type V3 = [number, number, number];
const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const VIEWS = [FRONT, SIDE, TOP, ISO];
const T = 0.75;

const cove = topCorners(2, loop('p1', 0.375, 'cove'));
const roundover = topCorners(2);
/** The arched apron with a 3/8" cove End to end along the arched side: the arch is CONCAVE (it bows into the wood). */
const archCove: Board = createBoard({ length: 30, width: 5, thickness: T,
  curves: [{ id: 'c1', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1.25 }) }],
  profiles: [endToEnd('p1', { across: 'width', from: 'min' }, 0.375, 'cove')] });
/** The same parts with no profile: what the profile adds is what these do not draw. */
const plainOf = (b: Board): Board => createBoard({ length: b.length, width: b.width, thickness: b.thickness, curves: b.curves });

// The cove's two creases, by hand from its section (size 3/8, no fillet; face max, the top at t = 3/4): the REACH crease
// on the top face (t = 3/4, s = 3/8 in from the outline) and the SIDE crease where the cove meets the side (t = 3/4 − 3/8,
// s = 0). Both junctions are sharp (task 6's count: 3 × 52).
// On face MIN the section is measured up from the bottom: the reach crease on the bottom face (t = 0), the side crease at
// t = 3/8. The other broad face's outline (t = 0 for face max, 3/4 for face min) is the plain part's, never a crease.
const CREASE_MAX = new Map([[T, 0.375], [T - 0.375, 0]]);
const CREASE_MIN = new Map([[0, 0.375], [0.375, 0]]);

/** An edge's ends lie at one t: an along-path line on the face's plan (its t, or null). */
const alongAt = (e: DrawEdge) => (Math.abs(e.p[2] - e.q[2]) <= 1e-9 ? e.p[2] : null);
const mid2 = (e: DrawEdge): [number, number] => [(e.p[0] + e.q[0]) / 2, (e.p[1] + e.q[1]) / 2];

/** The corner arcs of the 36 × 20 top, r = 2: CONVEX, centre in from each corner. */
function cornerCentre(m: [number, number]): [number, number] | null {
  const cu = m[0] < 2 ? 2 : m[0] > 34 ? 34 : null;
  const cv = m[1] < 2 ? 2 : m[1] > 18 ? 18 : null;
  return cu !== null && cv !== null ? [cu, cv] : null;
}
/** The apron's arch (span 24 from u = 3, rise 1.25): R = (12² + 1.25²) / 2.5, the centre BELOW the part (the waste side). */
const ARCH_R = (144 + 1.5625) / 2.5;
const ARCH_C: [number, number] = [15, 1.25 - ARCH_R];

/** The crease edges along an arc, each with its true offset arc (centre, radius) derived from the geometry: a CONVEX arc's
 *  wood lies toward its centre, so an offset s in is radius r − s; a CONCAVE arc's wood lies away from it, r + s. */
function creases(b: Board, arc: (m: [number, number]) => { c: [number, number]; r: number; convex: boolean } | null, map = CREASE_MAX) {
  return curveDrawEdges(b).flatMap((e) => {
    const t = alongAt(e);
    if (t === null) return [];
    const s = map.get(Math.round(t * 1e9) / 1e9);
    const a = arc(mid2(e));
    if (s === undefined || !a) return [];
    return [{ e, t, c: a.c, R: a.convex ? a.r - s : a.r + s }];
  });
}
const coveCreases = () => creases(cove, (m) => { const c = cornerCentre(m); return c ? { c, r: 2, convex: true } : null; });
/** The cove all round FACE MIN (the path reversed: the sweep index's other order). */
const coveMin = topCorners(2, loop('p1', 0.375, 'cove', 'min'));
const coveMinCreases = () => creases(coveMin, (m) => { const c = cornerCentre(m); return c ? { c, r: 2, convex: true } : null; }, CREASE_MIN);
/** The cove End to end on the front of the 2" top: round both front corners to B1 stations (builtPath leads with the
 *  station extension chord, so every sweep index is one on from the outline's). */
const coveFront = topCorners(2, endToEnd('p1', { across: 'width', from: 'min' }, 0.375, 'cove'));
const coveFrontCreases = () => creases(coveFront, (m) => { const c = cornerCentre(m); return c && c[1] === 2 ? { c, r: 2, convex: true } : null; });
const archCreases = () => creases(archCove, (m) => (m[0] > 3 + 1e-6 && m[0] < 27 - 1e-6 && Math.abs(Math.hypot(m[0] - ARCH_C[0], m[1] - ARCH_C[1]) - ARCH_R) < 0.5 ? { c: ARCH_C, r: ARCH_R, convex: false } : null));

describe('along-path creases on a path arc are fine paths on the true offset arc (B8)', () => {
  it('a roundover loop draws no along-path crease: its tangent joins are smooth (only the bottom outline)', () => {
    const e = curveDrawEdges(roundover);
    expect(e).toHaveLength(52);
    expect(e.filter((x) => (alongAt(x) ?? 0) > 1e-9)).toEqual([]);
  });
  for (const [name, get, perArc] of [['the cove loop (convex corners)', coveCreases, 4 * 2 * 12], ['the arched cove (a concave path arc)', archCreases, 2 * 16],
    ['the cove loop on face min', coveMinCreases, 4 * 2 * 12], ['the cove End to end round the front corners (B1)', coveFrontCreases, 2 * 2 * 12]] as const) {
    it(`${name}: every crease along the arc is a fine path, its nodes ON the offset arc within 1e-9, its ends on the model chord`, () => {
      const cs = get();
      // Two creases (reach, side) on each model chord of each arc: 4 corners × 12 chords, or the arch's 16.
      expect(cs).toHaveLength(perArc);
      for (const { e, c, R } of cs) {
        expect(e.path, JSON.stringify(e.p)).toBeDefined();
        const pts = e.path!.pts;
        expect(pts[0]).toEqual(e.p);
        expect(pts[pts.length - 1]).toEqual(e.q);
        expect(pts.length).toBeGreaterThan(2);
        for (const x of pts.slice(1, -1)) {
          expect(Math.abs(Math.hypot(x[0] - c[0], x[1] - c[1]) - R)).toBeLessThanOrEqual(1e-9);
          expect(Math.abs(x[2] - e.p[2])).toBeLessThanOrEqual(1e-12);
        }
        // `at` runs strictly 0 .. 1 along the chord.
        const at = e.path!.at;
        expect(at[0]).toBe(0);
        expect(at[at.length - 1]).toBe(1);
        for (let i = 1; i < at.length; i++) expect(at[i]!).toBeGreaterThan(at[i - 1]!);
      }
    });
  }
  it('the count: within DRAWING_CURVE_SEGMENTS_MAX per arc, every fine piece within DRAWING_CURVE_TOLERANCE of the true arc', () => {
    for (const [cs, arcs, map] of [[coveCreases(), 4, CREASE_MAX], [archCreases(), 1, CREASE_MAX], [coveMinCreases(), 4, CREASE_MIN], [coveFrontCreases(), 2, CREASE_MAX]] as const) {
      for (const t of map.keys()) {
        const on = cs.filter((x) => Math.abs(x.t - t) <= 1e-9);
        // One crease line per arc: the fine pieces of all its model chords together.
        const pieces = on.reduce((n, x) => n + x.e.path!.pts.length - 1, 0) / arcs;
        expect(pieces).toBeLessThanOrEqual(DRAWING_CURVE_SEGMENTS_MAX);
        for (const { e, c, R } of on) {
          const ps = e.path!.pts;
          // Between two nodes on the arc the chord's sagitta is the gap: R (1 − cos(Δθ / 2)).
          for (let i = 1; i + 2 < ps.length; i++) {
            const a0 = Math.atan2(ps[i]![1] - c[1], ps[i]![0] - c[0]);
            const a1 = Math.atan2(ps[i + 1]![1] - c[1], ps[i + 1]![0] - c[0]);
            expect(R * (1 - Math.cos(Math.abs(a1 - a0) / 2))).toBeLessThanOrEqual(DRAWING_CURVE_TOLERANCE + 1e-12);
          }
        }
      }
    }
  });
  it('the TOP view draws the cove\'s creases as those fine paths (each node a drawn vertex), tagged with the profile', () => {
    const d = drawView([cove], TOP);
    const tag = featureTag(cove.id, 'curve', 'p1');
    const W = (p: readonly number[]) => toWorld(cove, { length: p[0]!, width: p[1]!, thickness: p[2]! });
    const ends = new Set([...d.visible, ...d.hidden].filter((s) => s.feature === tag).flatMap((s) => [s.a, s.b]).map((p) => p.map((x) => x.toFixed(9)).join()));
    for (const { e } of coveCreases()) for (const x of e.path!.pts) {
      const w = W(x);
      expect(ends.has([dot(w, TOP.right), dot(w, TOP.up)].map((v) => v.toFixed(9)).join()), JSON.stringify(x)).toBe(true);
    }
  });
});

/** Is WORLD point P hidden in `view`? (profileDrawing.test's oracle: the part's closed bodies at 1e-9, no growth, no lift.) */
function oracleHidden(b: Board, P: V3, view: View): boolean {
  const W = (p: readonly number[]) => toWorld(b, { length: p[0]!, width: p[1]!, thickness: p[2]! }) as V3;
  const o = W([0, 0, 0]);
  for (const body of partGeometry(b).bodies) {
    let lo = 1e-7;
    let hi = 1e3;
    for (const f of body.faces) {
      const n = sub(W(f.n), o);
      const f0 = dot(n, sub(P, W(f.verts[0]!))) - 1e-9;
      const ft = dot(n, view.toward);
      if (Math.abs(ft) <= 1e-12) { if (f0 > 0) { lo = 1; hi = 0; break; } continue; }
      const s = -f0 / ft;
      if (ft > 0) hi = Math.min(hi, s); else lo = Math.max(lo, s);
      if (lo > hi) break;
    }
    if (hi - lo > 1e-6) return true;
  }
  return false;
}
const dist2 = (p: readonly number[], a: readonly number[], b: readonly number[]) => {
  const dx = b[0]! - a[0]!, dy = b[1]! - a[1]!;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0]! - a[0]!) * dx + (p[1]! - a[1]!) * dy) / l2));
  return Math.hypot(p[0]! - a[0]! - t * dx, p[1]! - a[1]! - t * dy);
};

describe('a fine crease is hidden exactly where its MODEL chord is (invariant 47)', () => {
  for (const [name, b, get] of [['cove loop', cove, coveCreases], ['arched cove', archCove, archCreases], ['cove on face min', coveMin, coveMinCreases],
    ['cove front (B1)', coveFront, coveFrontCreases]] as const) {
    it(`${name}: every fine node is drawn as the chord point at its parameter reads, in all four views`, () => {
      const W = (p: readonly number[]) => toWorld(b, { length: p[0]!, width: p[1]!, thickness: p[2]! }) as V3;
      let hidden = 0, read = 0;
      const bad: string[] = [];
      for (const view of VIEWS) {
        const d = drawView([b], view);
        const proj = (p: readonly number[]) => [dot(p, view.right), dot(p, view.up)];
        for (const { e } of get()) {
          const { pts, at } = e.path!;
          for (let i = 1; i + 1 < pts.length; i++) {
            const sp = proj(W(pts[i]!));
            const onVis = d.visible.some((s) => dist2(sp, s.a, s.b) <= 1e-7);
            const onHid = d.hidden.some((s) => dist2(sp, s.a, s.b) <= 1e-7);
            if (onVis && onHid) continue; // a transition, or a coincident line drawn the other way
            const chord = e.p.map((v, k) => v + at[i]! * (e.q[k]! - v));
            const h = oracleHidden(b, W(chord), view);
            read += 1;
            if (h) hidden += 1;
            if (!onVis && !onHid) {
              // Edge-on (the plan's plane holds the view: FRONT/SIDE): the model chord is drawn, not the path.
              if (Math.abs(dot(sub(W([0, 0, 1]), W([0, 0, 0])), view.toward)) <= 1e-9) continue;
              bad.push(`${view.title} ${JSON.stringify(pts[i])}: not drawn`);
            } else if (onHid !== h) bad.push(`${view.title} ${JSON.stringify(pts[i])}: drawn ${onHid ? 'hidden' : 'visible'}, chord ${h ? 'hidden' : 'visible'}`);
          }
        }
      }
      expect(bad).toEqual([]);
      expect(read).toBeGreaterThan(100);
      expect(hidden).toBeGreaterThan(10);
      expect(read - hidden).toBeGreaterThan(10);
    });
  }
});

describe('the doubly curved corner outlines itself by a facet chain (profileSilhouettes)', () => {
  it('the cove in the isometric: a connected chain of facet edges round a corner, crossing the section, none along `through` above the side crease', () => {
    const W = (p: readonly number[]) => toWorld(cove, { length: p[0]!, width: p[1]!, thickness: p[2]! }) as V3;
    const o = W([0, 0, 0]);
    const up = sub(W([0, 0, 1]), o); // the board's thickness axis in world space
    const sil = profileSilhouettes(cove, ISO.toward);
    expect(sil.length).toBeGreaterThan(0);
    expect(sil.every((s) => s.curve === 'p1')).toBe(true);
    // The world point back to board-local (flat at turn 0: an affine map, the inverse of toWorld on the three axes).
    const L = (P: readonly number[]): V3 => {
      const ax = [W([1, 0, 0]), W([0, 1, 0]), W([0, 0, 1])].map((x) => sub(x, o));
      const r = sub(P, o);
      return [dot(r, ax[0]!), dot(r, ax[1]!), dot(r, ax[2]!)];
    };
    const corner = sil.filter((s) => { const a = L(s.A), e = L(s.E); return cornerCentre([(a[0] + e[0]) / 2, (a[1] + e[1]) / 2]); });
    expect(corner.length).toBeGreaterThan(3);
    // Not a line along `through`: every link moves in plan.
    for (const s of corner) {
      const a = L(s.A), e = L(s.E);
      expect(Math.hypot(e[0] - a[0], e[1] - a[1])).toBeGreaterThan(1e-6);
    }
    // Chains: the links meet end to end. Where the corner turns the cove's facets from the view across the section (the
    // two corners the isometric looks along), a chain crosses the section (t changes along it); where the turn is between
    // two strips (the near corner), the chain follows the corner arc at one t, every one of its 12 model chords.
    const key = (p: readonly number[]) => p.map((x) => x.toFixed(7)).join();
    const adj = new Map<string, number[]>();
    corner.forEach((s, i) => { for (const k of [key(s.A), key(s.E)]) adj.set(k, [...(adj.get(k) ?? []), i]); });
    const seen = new Set<number>();
    const comps: number[][] = [];
    for (let i = 0; i < corner.length; i++) {
      if (seen.has(i)) continue;
      const comp: number[] = [];
      const stack = [i];
      while (stack.length) {
        const j = stack.pop()!;
        if (seen.has(j)) continue;
        seen.add(j);
        comp.push(j);
        for (const k of [key(corner[j]!.A), key(corner[j]!.E)]) stack.push(...adj.get(k)!);
      }
      comps.push(comp);
    }
    const tRange = (c: number[]) => { const ts = c.flatMap((j) => [dot(sub(corner[j]!.A, o), up), dot(sub(corner[j]!.E, o), up)]); return Math.max(...ts) - Math.min(...ts); };
    expect(comps.filter((c) => c.length >= 3 && tRange(c) > 0.1).length).toBeGreaterThanOrEqual(2);
    expect(comps.some((c) => c.length >= 12 && tRange(c) <= 1e-9)).toBe(true);
    // Chunk 1's lines along `through` at the corner's smooth vertices stop at the wood: the side crease, t = 3/8.
    for (const s of silhouetteLines(cove, ISO.toward)) for (const P of [s.A, s.E]) expect(dot(sub(P, o), up)).toBeLessThanOrEqual(0.375 + 1e-9);
  });
});

describe('every line the swept profile makes carries its feature tag (Q5; planKeys anchors on it)', () => {
  const key = (p: readonly number[]) => p.map((x) => x.toFixed(7)).join();
  /** Does the profile-free part draw an edge holding p→q (collinear, p and q within it)? Then the profile did not make it. */
  const inPlain = (plain: readonly DrawEdge[], e: DrawEdge) => plain.find((x) => {
    const d = sub(x.q, x.p);
    const l = Math.hypot(...d);
    const t = (y: readonly number[]) => dot(sub(y, x.p), d) / (l * l);
    const off = (y: readonly number[]) => { const k = t(y); return Math.hypot(...sub(y, x.p.map((v, i) => v + k * d[i]!))); };
    return [e.p, e.q].every((y) => off(y) <= 1e-7 && t(y) >= -1e-9 && t(y) <= 1 + 1e-9);
  });
  const CASES: [string, Board][] = [['apronArch', apronArch], ['cove loop', cove], ['roundover loop', roundover], ['frontOnly', frontOnly], ['arched cove', archCove],
    ['cove on face min', coveMin], ['cove front (B1)', coveFront]];
  for (const [name, b] of CASES) {
    it(`${name}: an edge the profile-free part does not draw is the profile's; any other keeps the plain part's tag`, () => {
      const plain = curveDrawEdges(plainOf(b));
      let swept = 0;
      for (const e of curveDrawEdges(b)) {
        const x = inPlain(plain, e);
        if (x) expect(e.curve, `${key(e.p)}→${key(e.q)}`).toBe(x.curve);
        else { swept += 1; expect(e.curve, `${key(e.p)}→${key(e.q)}`).toBe('p1'); }
      }
      if (name !== 'roundover loop') expect(swept).toBeGreaterThan(0);
    });
    it(`${name}: on the sheet, the profile's tag is on exactly its edges' lines and its silhouettes, in every view`, () => {
      const tag = featureTag(b.id, 'curve', 'p1');
      for (const view of VIEWS) {
        const d = drawView([b], view);
        const len = (ss: { a: number[]; b: number[] }[]) => ss.reduce((n, s) => n + Math.hypot(s.b[0]! - s.a[0]!, s.b[1]! - s.a[1]!), 0);
        const all = [...d.visible, ...d.hidden];
        const proj = (p: readonly number[]) => [dot(p, view.right), dot(p, view.up)];
        const W = (p: readonly number[]) => toWorld(b, { length: p[0]!, width: p[1]!, thickness: p[2]! });
        const edgeOn = Math.abs(dot(sub(W([0, 0, 1]), W([0, 0, 0])), view.toward)) <= 1e-9;
        // Expected: each p1 edge's drawn polyline (the fine path, or the chord when edge-on or straight), plus every
        // silhouette of the profile — each projected; a line along the view is a point.
        let want = 0;
        for (const e of curveDrawEdges(b)) {
          if (e.curve !== 'p1') continue;
          const ps = e.path && !edgeOn ? e.path.pts : [e.p, e.q];
          for (let i = 0; i + 1 < ps.length; i++) { const a = proj(W(ps[i]!)), c = proj(W(ps[i + 1]!)); want += Math.hypot(c[0]! - a[0]!, c[1]! - a[1]!); }
        }
        for (const s of profileSilhouettes(b, view.toward)) { const a = proj(s.A), c = proj(s.E); want += Math.hypot(c[0]! - a[0]!, c[1]! - a[1]!); }
        // Within 1e-4: drawView drops a piece shorter than DRAW_EPS (1e-6) where a fine path meets a hidden span's end.
        expect(Math.abs(len(all.filter((s) => s.feature === tag)) - want), view.title).toBeLessThan(1e-4);
      }
    });
  }
});
