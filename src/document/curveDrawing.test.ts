// src/document/curveDrawing.test.ts
import { describe, expect, it } from 'vitest';
import { createBoard, archCurve, cornerCurve, partGeometry } from './document';
import type { Board, Cut } from './types';
import { curveDrawEdges, curveSilhouettes, silhouetteLines, DRAWING_CURVE_SEGMENTS_MAX } from './curveDrawing';
import { drawView, ISO } from './drawing';
import { chiralCurved } from './turnFixtures';
import { mirrorPart } from './frames';

// Flat at turn 0. Arch on a 30 x 5 x 3/4 apron, width min side, 3" in from each end, 1-1/2" rise:
// R = (12^2 + 1.5^2) / (2 * 1.5) = 48.75, centre (15, 1.5 - 48.75) = (15, -47.25), sweep 2 asin(12/48.75) = 0.49742.
// Model chords: step 2 acos(1 - 0.005/48.75) = 0.028645 -> ceil(17.37) = 18. Fine: step 2 acos(1 - 0.001/48.75) =
// 0.012810 -> ceil(38.83) = 39; m = min(ceil(39/18) = 3, floor(96/18) = 5) = 3.
const arch = { id: 'a', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1.5 }) };
const apron = (over: Partial<Board> = {}) => createBoard({ id: 'ap', length: 30, width: 5, thickness: 0.75, curves: [arch], ...over });
const onArc = (p: readonly number[]) => Math.abs(Math.hypot(p[0]! - 15, p[1]! + 47.25) - 48.75);

describe('curveDrawEdges (curves spec §5.1; Q2, Q4)', () => {
  it('a part without curves: its edges, no paths, and the same array for the same geometry', () => {
    const b = createBoard({ length: 20, width: 6, thickness: 0.75 });
    const e = curveDrawEdges(b);
    expect(e).toHaveLength(partGeometry(b).edges.length);
    expect(e.every((x) => x.path === undefined)).toBe(true);
    expect(curveDrawEdges({ ...b })).toBe(e);
  });

  it('the arch: 18 model chords on each face plane, each 3 fine pieces on the true arc, ends kept exactly', () => {
    const b = apron();
    const paths = curveDrawEdges(b).filter((x) => x.path);
    expect(paths).toHaveLength(36); // 18 chords x 2 planes (thickness 0 and 3/4)
    for (const { p, q, path } of paths) {
      expect(path!.k).toBe(2);
      expect(path!.pts).toHaveLength(4);
      expect(path!.pts[0]).toEqual(p);
      expect(path!.pts[3]).toEqual(q);
      for (const x of path!.pts) { expect(onArc(x)).toBeLessThan(1e-9); expect(x[2]).toBe(p[2]); }
      expect(path!.at[0]).toBe(0);
      expect(path!.at[3]).toBe(1);
      for (let i = 1; i < 4; i += 1) expect(path!.at[i]!).toBeGreaterThan(path!.at[i - 1]!);
    }
  });

  it('a 2" rounded corner: 12 model chords per plane, 3 pieces each (N = 25: m = min(3, 8))', () => {
    // Quarter circle r = 2: model step 2 acos(1 - 0.005/2) = 0.14146 -> ceil(11.10) = 12; fine 2 acos(1 - 0.001/2) =
    // 0.063249 -> ceil(24.83) = 25.
    const b = createBoard({ length: 36, width: 20, thickness: 0.75, curves: [{ id: 'c', ...cornerCurve({ through: 'thickness', uFrom: 'min', vFrom: 'min', radius: 2 }) }] });
    const paths = curveDrawEdges(b).filter((x) => x.path);
    expect(paths).toHaveLength(24);
    expect(paths.every((x) => x.path!.pts.length === 4)).toBe(true);
  });

  it('an arc never exceeds 96 pieces: a 10" half-round notch draws exactly 96 (n = 24, m = 4)', () => {
    // r = 10, sweep pi: model step 2 acos(1 - 0.0005) = 0.063249 -> 49.67 -> capped 24; fine step 2 acos(1 - 0.0001) =
    // 0.028285 -> 111.07 -> capped 96; m = min(4, 4) = 4.
    const notch = { id: 'n', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 5, span: 20, rise: 10 }) };
    const b = createBoard({ length: 30, width: 12, thickness: 0.75, curves: [notch] });
    const onPlane0 = curveDrawEdges(b).filter((x) => x.path && x.p[2] === 0);
    expect(onPlane0.reduce((n, x) => n + x.path!.pts.length - 1, 0)).toBe(DRAWING_CURVE_SEGMENTS_MAX);
  });

  it('a chord a dado splits keeps its split end on the chord; only interior nodes move to the arc (Q4)', () => {
    // A 1" dado 1/4" deep across the width at length 14.5..15.5, from the thickness max face: the max-face outline stops at
    // the dado walls. u = 14.5 is inside chord 8 (theta = asin(-0.5/48.75) = -0.010257; chords are 0.027634 wide, the crown
    // vertex at theta = 0), so that chord's piece on the max face ends off the arc.
    const dado: Cut = { id: 'd', face: 'thickness', from: 'max', across: 'width', offset: 14.5, width: 1, depth: 0.25, stopMin: 0, stopMax: 0 };
    const b = apron({ cuts: [dado] });
    const split = curveDrawEdges(b).filter((x) => x.path && (Math.abs(x.p[0] - 14.5) < 1e-9 || Math.abs(x.q[0] - 14.5) < 1e-9));
    expect(split.length).toBeGreaterThan(0);
    for (const { p, q, path } of split) {
      const end = Math.abs(p[0] - 14.5) < 1e-9 ? p : q;
      expect(onArc(end)).toBeGreaterThan(1e-6); // on the chord, off the arc
      expect(onArc(end)).toBeLessThan(0.005);
      expect(path!.pts[0]).toEqual(p);
      expect(path!.pts[path!.pts.length - 1]).toEqual(q);
      for (const x of path!.pts.slice(1, -1)) expect(onArc(x)).toBeLessThan(1e-9);
    }
  });
});

describe('curveDrawEdges: frozen and strictly increasing (final review)', () => {
  it('the memoised result is deep-frozen', () => {
    const e = curveDrawEdges(apron()).find((x) => x.path)!;
    expect(Object.isFrozen(e.p)).toBe(true);
    expect(Object.isFrozen(e.path)).toBe(true);
    expect(Object.isFrozen(e.path!.pts)).toBe(true);
    expect(Object.isFrozen(e.path!.pts[1])).toBe(true);
    expect(Object.isFrozen(e.path!.at)).toBe(true);
  });

  it('beside a dado-split end every interior at lies strictly in (0, 1)', () => {
    const dado: Cut = { id: 'd', face: 'thickness', from: 'max', across: 'width', offset: 14.5, width: 1, depth: 0.25, stopMin: 0, stopMax: 0 };
    for (const e of curveDrawEdges(apron({ cuts: [dado] }))) {
      if (!e.path) continue;
      const { at } = e.path;
      expect(at[0]).toBe(0);
      expect(at[at.length - 1]).toBe(1);
      for (let i = 1; i < at.length; i += 1) expect(at[i]!).toBeGreaterThan(at[i - 1]!);
      for (const x of at.slice(1, -1)) { expect(x).toBeGreaterThan(0); expect(x).toBeLessThan(1); }
    }
  });
});

describe('silhouettes through mirrors and turns', () => {
  const POSTURES = ['flat', 'on-edge', 'upright'] as const;
  const TURNS = [0, 90, 180, 270] as const;
  const ends = (segs: [number[], number[]][]) => segs.flatMap(([a, b]) => [[...a], [...b]]);
  // One-to-one match by distance (1e-9), not rounding buckets (which split equal points straddling a boundary).
  const near = (a: number[][], b: number[][]) => {
    if (a.length !== b.length) return false;
    const used = new Array<boolean>(b.length).fill(false);
    return a.every((p) => {
      const k = b.findIndex((q, i) => !used[i] && Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!) < 1e-9);
      if (k < 0) return false;
      used[k] = true;
      return true;
    });
  };
  const VIEWS = [[0, 0, 1], [1, 0, 0], [0.5773502691896258, 0.5773502691896258, 0.5773502691896258]];
  it.each(POSTURES.flatMap((posture) => TURNS.map((rotation) => ({ posture, rotation }))))(
    '%o: mirrorPart\'s silhouettes are the reflection across x = 0',
    ({ posture, rotation }) => {
      const b = { ...chiralCurved(posture), rotation, position: [2, 1, -3] as [number, number, number] };
      for (const T of VIEWS) {
        const R = [-T[0]!, T[1]!, T[2]!]; // the mirrored part seen from the mirrored direction
        const reflected = ends(curveSilhouettes(b, T)).map(([x, y, z]) => [0 - x!, y!, z!]);
        expect(near(ends(curveSilhouettes(mirrorPart(b), R)), reflected)).toBe(true);
      }
    },
  );
  it('the chiral fixture draws silhouettes in some view (the test above is not vacuous)', () => {
    expect(VIEWS.some((T) => curveSilhouettes(chiralCurved('flat'), T).length > 0)).toBe(true);
  });
});

describe('silhouettes stay on the wood (fu 375)', () => {
  // Looking along the length (world X, flat at turn 0), the arch's crown (u = 15, v = 1.5) turns away from the viewer:
  // one silhouette line along the thickness there.
  const along = [1, 0, 0];
  const crown = (b: Board) => curveSilhouettes(b, along).filter(([p]) => Math.abs(p[0]! - 15) < 1e-9);
  const len = (s: readonly (readonly (readonly number[])[])[]) => s.reduce((n, [p, q]) => n + Math.hypot(q![0]! - p![0]!, q![1]! - p![1]!, q![2]! - p![2]!), 0);
  const dado = (offset: number): Cut => ({ id: 'd', face: 'thickness', from: 'max', across: 'width', offset, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 });
  it('a plain arch: the crown line runs the full 3/4"', () => {
    expect(crown(apron())).toHaveLength(1);
    expect(len(crown(apron()))).toBeCloseTo(0.75, 12);
  });
  it('a 1/4"-deep dado across the crown: the line runs only through the 1/2" of wood left under it', () => {
    const b = apron({ cuts: [dado(14.625)] });
    expect(len(crown(b))).toBeCloseTo(0.5, 9);
    for (const [p, q] of crown(b)) for (const x of [p!, q!]) expect(x[1]!).toBeLessThanOrEqual(0.5 + 1e-9);
  });
  it('a dado clear of the crown leaves the crown line whole', () => {
    expect(len(crown(apron({ cuts: [dado(20)] })))).toBeCloseTo(0.75, 12);
  });
});

// Fu 386. A 36 x 20 x 3/4 top with a 3/8" Rounded corner on all four top edges read as a few stray lines in the exploded
// isometric. The cause is NOT the second axis: a 3/8" radius has 5 model chords, so its middle chord face lies at exactly 45
// degrees, edge-on to ISO, and n.d read +2.8e-16 there — so the silhouette landed on that face's FAR vertex (zero lift,
// hidden by grazing) for one roundover as for four. With two axes the end profiles are gone (each end's roundover removes
// the plane the long edges' arcs would be drawn on), so the hidden silhouettes left nothing but the miters.
// (The brief's pins "every curve keeps a fine path" and "four draws >= two's segment count" were dropped: both are
// geometrically wrong for this top — see the task-1 report.)
describe('curves on two through axes keep their drawn lines (fu 386)', () => {
  const round = (id: string, through: 'length' | 'width', uFrom: 'min' | 'max', r = 0.375) =>
    ({ id, ...cornerCurve({ through, uFrom, vFrom: 'max', radius: r }) });
  const top = (curves: ReturnType<typeof round>[]) => createBoard({ id: 't', length: 36, width: 20, thickness: 0.75, curves });
  const four = (r: number) => top([round('a', 'length', 'min', r), round('b', 'length', 'max', r), round('c', 'width', 'min', r), round('d', 'width', 'max', r)]);
  const dot = (p: readonly number[], v: readonly number[]) => p[0]! * v[0]! + p[1]! * v[1]! + p[2]! * v[2]!;
  const proj = (p: readonly number[]) => [dot(p, ISO.right), dot(p, ISO.up)];
  const len = (segs: { a: number[]; b: number[] }[]) => segs.reduce((t, s) => t + Math.hypot(s.b[0]! - s.a[0]!, s.b[1]! - s.a[1]!), 0);
  // 0.375: 5 chords (a face at 45 degrees); 0.25 and 0.5: an even count (a vertex at 45 degrees).
  it.each([0.25, 0.375, 0.5])('radius %s: the roundovers facing the viewer show their silhouettes in the exploded isometric', (r) => {
    const b = four(r);
    const d = drawView([b], ISO, undefined, { hiddenLines: false });
    for (const id of ['a', 'c']) {
      const sil = silhouetteLines(b, ISO.toward).filter((s) => s.curve === id);
      expect(sil.length).toBeGreaterThan(0);
      // The curve's silhouette is drawn visible along its whole projected length (curve-tagged segments here are
      // silhouettes only: no outline plane of a or c is left on this top). An edge-on face gives a silhouette at both its
      // vertices, coincident on screen (one visible, one grazed hidden), so the longest one is the length to cover.
      const want = Math.max(...sil.map(({ A, E }) => len([{ a: proj(A), b: proj(E) }])));
      const got = len(d.visible.filter((s) => s.feature === `t:curve:${id}`));
      expect(got).toBeGreaterThan(want * 0.99);
    }
  });
  it('one roundover alone: its silhouette is visible too (the defect was never two-axis)', () => {
    const b = top([round('a', 'length', 'min')]);
    const d = drawView([b], ISO, undefined, { hiddenLines: false });
    const sil = silhouetteLines(b, ISO.toward);
    expect(sil.length).toBeGreaterThan(0);
    // The silhouette runs the full 36" length; a length-axis line projects at sqrt(2/3) in ISO, all of it visible.
    const visibleLong = d.visible.filter((s) => s.feature === 't:curve:a' && Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) > 1);
    expect(len(visibleLong)).toBeGreaterThan(36 * Math.sqrt(2 / 3) * 0.99);
  });
});
