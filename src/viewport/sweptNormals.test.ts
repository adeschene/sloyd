import { vi } from 'vitest';
import { axisFrame, cornerFields, partGeometry } from '../document/document';
import type { Board, BodyFace, V3 } from '../document/document';
import { geometryBoard } from '../document/profiles';
import { runoutNormal } from '../document/runout';
import { spanOf } from '../document/curves';
import { sweptNormals, sweptRunouts } from '../document/sweep';
import { frontOnly, loop, topCorners } from '../document/sweepFixtures';
import { bodyMesh } from './grainTiling';

// Counts sweptNormals' builds (the real function runs): a2 fix F1's lesson, a per-call rebuild failed the perf guard.
const calls = vi.hoisted(() => ({ n: 0 }));
vi.mock('../document/sweep', async (orig) => {
  const actual = await orig<typeof import('../document/sweep')>();
  return { ...actual, sweptNormals: (...a: Parameters<typeof actual.sweptNormals>) => { calls.n += 1; return actual.sweptNormals(...a); } };
});

/*
 * Profile runs b1, Task 5 (spec §5 Shading): a swept face's vertex normals are the TRUE swept surface's — the profile arc's
 * (s, t) normal turned by the path's inward direction at the vertex. The expectations below are written from the fixture's
 * own numbers (a 1/4" roundover: its arc's centre 1/4" in from the edge and 1/4" down from the face; the corner's centre
 * `radius` in from both sides, read off `cornerCurve`'s fields), never from the path chords or the pieces.
 */
const R = 0.25;
const unit = (v: V3): V3 => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
/** The roundover's outward normal at a point with (s, t) in from the edge and the face, the plan inward direction `inward`
 *  and the thickness axis's inward sign `vIn` (−1 for a face-max profile: t grows downward). */
function roundover(s: number, t: number, inward: [number, number], vIn: 1 | -1): V3 {
  const ds = s - R, dt = t - R;
  const l = Math.hypot(ds, dt);
  return [(ds / l) * inward[0], (ds / l) * inward[1], (dt / l) * vIn];
}
const extentX = (f: BodyFace) => Math.max(...f.verts.map((v) => v[0])) - Math.min(...f.verts.map((v) => v[0]));
function sweptFaces(board: Board, id = 'p1'): BodyFace[] {
  return partGeometry(board).bodies.flatMap((b) => b.faces).filter((f) => f.sweep !== undefined && f.profileEdge?.startsWith(`${id}:`));
}

describe('sweptNormals: the true swept surface\'s normals (profile runs b1)', () => {
  const board = topCorners(2);
  const view = geometryBoard(board);
  const p = view.profiles[0]!;
  const normal = sweptNormals(view, p);
  const T = board.thickness;

  it('the fixture is what it claims: a roundover loop on the top, a 2" corner at the min/min corner', () => {
    expect(p).toMatchObject({ kind: 'roundover', size: R, face: 'max', run: { loop: true } });
    const c = view.curves.find((x) => x.id === 'cminmin')!;
    expect(cornerFields(c)).toEqual({ through: 'thickness', uFrom: 'min', vFrom: 'min', radius: 2 });
  });

  it('a vertex on the front straight stretch\'s band has chunk 1\'s normal for that straight edge (1e-9)', () => {
    let n = 0;
    for (const f of sweptFaces(board)) {
      // The front straight chord's band: every vertex within the reach of the front side, running the stretch's length.
      if (!(f.verts.every((v) => v[1] < R + 1e-9) && extentX(f) > 30)) continue;
      for (const v of f.verts) {
        // The front side: s = y in from it (inward +y), t = T − z down from the top.
        const want = roundover(v[1], T - v[2], [0, 1], -1);
        expect(dist(normal(f, v)!, want)).toBeLessThanOrEqual(1e-9);
        n += 1;
      }
    }
    expect(n).toBeGreaterThan(4);
  });

  it('a vertex on a corner band has the profile arc\'s normal turned by the radial direction from the corner\'s centre', () => {
    const r = cornerFields(view.curves.find((x) => x.id === 'cminmin')!)!.radius;
    const c: [number, number] = [r, r];   // uFrom min, vFrom min: `radius` in from both sides
    let n = 0;
    for (const f of sweptFaces(board)) {
      // A face wholly in the corner's quadrant, inside its arc's angle (both coordinates under the centre's).
      if (!f.verts.every((v) => v[0] < r - 1e-3 && v[1] < r - 1e-3)) continue;
      for (const v of f.verts) {
        const d = Math.hypot(v[0] - c[0], v[1] - c[1]);
        const inward: [number, number] = [(c[0] - v[0]) / d, (c[1] - v[1]) / d];   // convex: toward the centre
        const want = roundover(r - d, T - v[2], inward, -1);
        expect(dist(normal(f, v)!, want)).toBeLessThanOrEqual(1e-9);
        n += 1;
      }
    }
    expect(n).toBeGreaterThan(20);
  });

  it('normals are continuous across the corner\'s chord vertices (1e-6)', () => {
    const faces = sweptFaces(board);
    let shared = 0, step = 0, junctions = 0;
    for (let i = 0; i < faces.length; i += 1) {
      for (let j = i + 1; j < faces.length; j += 1) {
        const a = faces[i]!, b = faces[j]!;
        if (a.sweep === b.sweep || a.profileEdge !== b.profileEdge) continue;
        // Two chords of ONE corner arc: both faces wholly in one corner's quadrant (no straight stretch's band).
        const inCorner = (f: BodyFace) => extentX(f) < 2.1 && Math.max(...f.verts.map((v) => v[1])) - Math.min(...f.verts.map((v) => v[1])) < 2.1;
        for (const v of a.verts) {
          const w = b.verts.find((x) => dist(x, v) <= 1e-12);
          if (!w) continue;
          const d = dist(normal(a, v)!, normal(b, w)!);
          if (inCorner(a) && inCorner(b)) { expect(d).toBeLessThanOrEqual(1e-6); shared += 1; }
          else { step = Math.max(step, d); junctions += 1; }
        }
      }
    }
    expect(shared).toBeGreaterThan(50);
    // At a tangent point a straight band keeps chunk 1's normal and the arc's first band the radial one (spec §5: a straight
    // band's normals equal chunk 1's), so their shared vertex — on the skeleton's bisector, a little inside the arc's angle —
    // steps by about the band's depth × δ/4 over (r − s) (δ the chord angle, ~8.2° at 2"): a few thousandths, never more.
    expect(junctions).toBeGreaterThan(0);
    expect(step).toBeGreaterThan(0);
    expect(step).toBeLessThan(0.01);
  });

  it('a face with no `sweep` tag returns null, and so does another profile\'s face', () => {
    const untagged = partGeometry(board).bodies.flatMap((b) => b.faces).filter((f) => f.sweep === undefined);
    expect(untagged.length).toBeGreaterThan(0);
    for (const f of untagged) expect(normal(f, f.verts[0]!)).toBeNull();
    const both: Board = { ...topCorners(2), profiles: [loop('t'), loop('m', R, 'roundover', 'min')] };
    const bv = geometryBoard(both);
    const top = sweptNormals(bv, bv.profiles[0]!);
    const bottom = sweptFaces(both, 'm');
    expect(bottom.length).toBeGreaterThan(0);
    for (const f of bottom) expect(top(f, f.verts[0]!)).toBeNull();
  });

  it('an ogee: across its section\'s smooth vertices (the inflection) normals agree within one band (1e-6)', () => {
    // Each pair of faces of one path chord meeting along a section vertex: the ogee's arcs meet tangent, so the surface's
    // normal is one there — a run whose plane spans both arcs (the collinear inflection chords) takes each point's nearest.
    const og = topCorners(2, loop('p1', 0.375, 'ogee'));
    const ov = geometryBoard(og);
    const nf = sweptNormals(ov, ov.profiles[0]!);
    const faces = sweptFaces(og);
    let shared = 0;
    for (let i = 0; i < faces.length; i += 1) for (let j = i + 1; j < faces.length; j += 1) {
      const a = faces[i]!, b = faces[j]!;
      if (a.sweep !== b.sweep || a.profileEdge === b.profileEdge) continue;
      for (const v of a.verts) {
        const w = b.verts.find((x) => dist(x, v) <= 1e-12);
        if (!w) continue;
        expect(dist(nf(a, v)!, nf(b, w)!), `${a.profileEdge} ${b.profileEdge}`).toBeLessThanOrEqual(1e-6);
        shared += 1;
      }
    }
    expect(shared).toBeGreaterThan(20);
    expect(faces.some((f) => { const [, a, b] = f.profileEdge!.split(':').map(Number); return a !== b; })).toBe(true);
  });

  it.each([['thumbnail', 0.75, 'max', 0, 'face'], ['bead', 0.25, 'max', 1 / 16, 'face'], ['bead', 0.25, 'min', 1 / 16, 'face'],
    ['cove', 0.375, 'max', 0, 'face'], ['ogee', 0.375, 'max', 0, 'face'], ['ogee', 0.5, 'max', 1 / 16, 'face'], ['ogee', 0.5, 'max', 1 / 16, 'edge']] as const)(
    'a %s loop (%s, face %s, fillet %s, facing %s): every swept vertex normal is unit and points out of the wood', (kind, size, face, fillet, facing) => {
      // Face min, facing 'edge' (an asymmetric section stored the other way round) and straight section edges (a fillet's, a
      // quirk's): every normal comes out of the wood.
      const b = topCorners(2, { ...loop('p1', size, kind, face), ...(kind === 'thumbnail' ? {} : { fillet }), facing });
      const v0 = geometryBoard(b);
      const nf = sweptNormals(v0, v0.profiles[0]!);
      let lines = 0;
      for (const f of sweptFaces(b)) {
        const [, a, z] = f.profileEdge!.split(':').map(Number);
        for (const v of f.verts) {
          const N = nf(f, v)!;
          expect(Math.abs(Math.hypot(...N) - 1)).toBeLessThanOrEqual(1e-12);
          expect(N[0] * f.n[0] + N[1] * f.n[1] + N[2] * f.n[2]).toBeGreaterThan(0);
        }
        // A straight section edge's face (a bead's quirk floor; this thumbnail is all arc): its normal is its own plane's, the flat
        // face's along a straight path chord.
        if (a === z && extentX(f) > 30) {
          const N = nf(f, f.verts[0]!)!;
          if (dist(N, f.n) <= 1e-9) lines += 1;
        }
      }
      if (fillet > 0 && facing === 'face') expect(lines).toBeGreaterThan(0);
    });

  it('face min: a loop on the bottom, its straight stretch\'s band (t grows upward)', () => {
    const both: Board = { ...topCorners(2), profiles: [loop('t'), loop('m', R, 'roundover', 'min')] };
    const bv = geometryBoard(both);
    const bottom = sweptNormals(bv, bv.profiles[1]!);
    let n = 0;
    for (const f of sweptFaces(both, 'm')) {
      if (!(f.verts.every((v) => v[1] < R + 1e-9) && extentX(f) > 30)) continue;
      for (const v of f.verts) {
        expect(dist(bottom(f, v)!, roundover(v[1], v[2], [0, 1], 1))).toBeLessThanOrEqual(1e-9);
        n += 1;
      }
    }
    expect(n).toBeGreaterThan(4);
  });
});

/** The mesh's vertices and normals back in board-local terms, for a flat part with no turn (world X, Y, Z = length,
 *  thickness, width; positions about the centre). */
function meshPoints(board: Board): { p: V3; n: V3 }[] {
  expect(axisFrame(board).map((a) => [a.dim, a.reversed])).toEqual([['length', false], ['thickness', false], ['width', false]]);
  const g = partGeometry(board);
  const out: { p: V3; n: V3 }[] = [];
  for (const body of g.bodies) {
    const m = bodyMesh(board, body, g.holes, g.bodies);
    for (let i = 0; i < m.positions.length / 3; i += 1) {
      const P = [m.positions[3 * i]!, m.positions[3 * i + 1]!, m.positions[3 * i + 2]!];
      const N = [m.normals![3 * i]!, m.normals![3 * i + 1]!, m.normals![3 * i + 2]!];
      out.push({ p: [P[0]! + board.length / 2, P[2]! + board.width / 2, P[1]! + board.thickness / 2], n: [N[0]!, N[2]!, N[1]!] });
    }
  }
  return out;
}

describe('bodyMesh shades a swept face with its swept normals (profile runs b1)', () => {
  it('every mesh vertex strictly inside a corner band\'s roundover takes the swept roundover\'s normal (1e-5: Float32)', () => {
    // Clear of the corner's tangent points (10° and more inside its arc): only the corner's own chord bands' vertices.
    const board = topCorners(2);
    const T = board.thickness;
    const c = [2, 2];
    let n = 0;
    for (const { p, n: N } of meshPoints(board)) {
      const d = Math.hypot(p[0] - c[0]!, p[1] - c[1]!);
      const phi = Math.atan2(c[1]! - p[1], c[0]! - p[0]) * (180 / Math.PI);
      if (!(phi > 10 && phi < 80 && d > 2 - R + 1e-3 && d < 2 - 1e-3 && p[2] > T - R + 1e-3 && p[2] < T - 1e-3)) continue;
      const inward: [number, number] = [(c[0]! - p[0]) / d, (c[1]! - p[1]) / d];
      // Float32 positions about the centre (~1e-6 at 18") move (s, t) by that much: 1e-5 on the normal.
      expect(dist(N, roundover(2 - d, T - p[2], inward, -1))).toBeLessThanOrEqual(1e-5);
      n += 1;
    }
    expect(n).toBeGreaterThan(10);
  });
  it('a B1 station\'s run-out cap takes the cutter surface\'s normal (it carried the profile\'s id, no view curve: flat)', () => {
    const board = frontOnly;
    const view = geometryBoard(board);
    const p = view.profiles[0]!;
    const runouts = sweptRunouts(view, p);
    expect(runouts).toHaveLength(2);
    const T = board.thickness;
    let n = 0;
    for (const { p: q, n: N } of meshPoints(board)) {
      // Past a station on either end side (the corners' far tangent points at y = 2), in the band's depth, off the faces.
      if (!(q[1] > 2.05 && q[1] < 2.6 && q[2] > T - R + 1e-3 && q[2] < T - 1e-3)) continue;
      // Off the end faces (x = 0, x = L carry their flat normals), within an inch of them.
      if (!((q[0] > 1e-3 && q[0] < 1) || (q[0] > board.length - 1 && q[0] < board.length - 1e-3))) continue;
      // The cutter's normal of whichever run-out the vertex lies on (the other's arc test reads it as off its surface).
      const cand = runouts.map((x) => runoutNormal(view, x, spanOf(x)!.stopHi ? 'hi' : 'lo', q)).filter((x): x is V3 => x !== null);
      expect(cand.some((w) => dist(unit(w), N) <= 1e-5), `${q} ${N}`).toBe(true);
      // Not flat: a run-out vertex's normal is not an axis direction.
      expect(Math.max(...N.map(Math.abs))).toBeLessThan(1 - 1e-3);
      n += 1;
    }
    expect(n).toBeGreaterThan(4);
  });
});

let tick = 0;
describe('a swept profile\'s normals are built once per part (a2 fix F1\'s rule)', () => {
  it.each([['a roundover loop', topCorners(2)], ['two loops', { ...topCorners(2), profiles: [loop('t'), loop('m', R, 'roundover', 'min')] }]] as [string, Board][])(
    '%s: one build per profile over every body, none on a second pass', (_name, made) => {
      tick += 1;
      const board = { ...made, length: made.length + tick * 1e-6 };
      const g = partGeometry(board);
      calls.n = 0;
      for (const body of g.bodies) bodyMesh(board, body, g.holes, g.bodies);
      expect(calls.n).toBe(board.profiles.length);
      for (const body of g.bodies) bodyMesh(board, body, g.holes, g.bodies);
      expect(calls.n).toBe(board.profiles.length);
    });
});
