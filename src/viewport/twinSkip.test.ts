import { boardBodiesForTest } from '../document/bodies';
import { partGeometry } from '../document/document';
import type { Body, BodyFace } from '../document/document';
import { faceCover, twinFaces } from '../document/seams';
import { geometryBoard, shapedPart } from '../document/profiles';
import { CURVED_CASES, SWEPT_CASES } from '../document/meshCases';
import { loop, stopOnCorner, topCorners } from '../document/sweepFixtures';
import { partMesh, type PartMeshData } from './grainTiling';

/**
 * Chunk c2, stage 2 (spec §2.2, amendment A1): a face another body's face covers EXACTLY — opposite, coplanar, the same
 * polygon within BODY_EPS (withoutSeams' twin test) — has stock on both sides and draws nothing, without minusCover. The
 * criterion is not byte-identity: the visible surface per material keeps its area within 1e-9, every drawn point keeps its
 * material, uv and normal, and the mesh stays watertight (curvesWatertight reads partMesh). The reference is today's route
 * for every face (`twins: false`).
 */
// Every shaped part: the swept fixtures and the plain curved ones (a split arch, the four-edge sets, a holed arched side —
// mergeHoledPlanes reads faceCover's per-body faces too).
const shaped = [...SWEPT_CASES, ...CURVED_CASES].filter(([, b]) => shapedPart(geometryBoard(b)));
const ogee = topCorners(2, loop('p1', 0.375, 'ogee'));

type T = { p: number[]; uv: number[]; n: number[] };
function triangles(m: PartMeshData): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const g of m.groups) {
    const list: T[] = [];
    for (let t = g.start; t < g.start + g.count; t += 3) {
      list.push({ p: Array.from(m.positions.subarray(t * 3, t * 3 + 9)), uv: Array.from(m.uvs.subarray(t * 2, t * 2 + 6)), n: Array.from(m.normals.subarray(t * 3, t * 3 + 9)) });
    }
    out.set(g.materialIndex, list);
  }
  return out;
}
const area = (p: number[]) => {
  const ax = p[3]! - p[0]!, ay = p[4]! - p[1]!, az = p[5]! - p[2]!, bx = p[6]! - p[0]!, by = p[7]! - p[1]!, bz = p[8]! - p[2]!;
  return Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx) / 2;
};
const areas = (m: PartMeshData) => new Map([...triangles(m)].map(([k, ts]) => [k, ts.reduce((s, t) => s + area(t.p), 0)]));

/** Barycentric weights of q in triangle p (3 × xyz), or null when q is off its plane (1e-6) or outside (−1e-7). */
function bary(p: number[], q: number[]): [number, number, number] | null {
  const v0 = [p[3]! - p[0]!, p[4]! - p[1]!, p[5]! - p[2]!], v1 = [p[6]! - p[0]!, p[7]! - p[1]!, p[8]! - p[2]!], v2 = [q[0]! - p[0]!, q[1]! - p[1]!, q[2]! - p[2]!];
  const n = [v0[1]! * v1[2]! - v0[2]! * v1[1]!, v0[2]! * v1[0]! - v0[0]! * v1[2]!, v0[0]! * v1[1]! - v0[1]! * v1[0]!];
  const nl = Math.hypot(n[0]!, n[1]!, n[2]!);
  if (nl === 0 || Math.abs((n[0]! * v2[0]! + n[1]! * v2[1]! + n[2]! * v2[2]!) / nl) > 1e-6) return null;
  const d = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  const d00 = d(v0, v0), d01 = d(v0, v1), d11 = d(v1, v1), d20 = d(v2, v0), d21 = d(v2, v1);
  const den = d00 * d11 - d01 * d01;
  const v = (d11 * d20 - d01 * d21) / den, w = (d00 * d21 - d01 * d20) / den, u = 1 - v - w;
  return u < -1e-7 || v < -1e-7 || w < -1e-7 ? null : [u, v, w];
}
/** Every drawn triangle's centroid lies in a reference triangle of the same material, where the reference's interpolated uv
 *  and normal equal the drawn ones' (1e-5: Float32 rounding). Reference triangles bucketed by their plane. */
function sameGrain(got: PartMeshData, ref: PartMeshData): string | null {
  const key = (p: number[]) => {
    const n = [(p[4]! - p[1]!) * (p[8]! - p[2]!) - (p[5]! - p[2]!) * (p[7]! - p[1]!), (p[5]! - p[2]!) * (p[6]! - p[0]!) - (p[3]! - p[0]!) * (p[8]! - p[2]!), (p[3]! - p[0]!) * (p[7]! - p[1]!) - (p[4]! - p[1]!) * (p[6]! - p[0]!)];
    const l = Math.hypot(n[0]!, n[1]!, n[2]!);
    const u = n.map((x) => x / l);
    return `${u.map((x) => Math.round(x * 1e3)).join(',')}|${Math.round((u[0]! * p[0]! + u[1]! * p[1]! + u[2]! * p[2]!) * 1e4)}`;
  };
  const R = triangles(ref);
  const buckets = new Map<string, T[]>();
  for (const [m, ts] of R) for (const t of ts) { if (area(t.p) <= 1e-12) continue; const k = `${m}|${key(t.p)}`; { const l = buckets.get(k); if (l) l.push(t); else buckets.set(k, [t]); } }
  for (const [m, ts] of triangles(got)) {
    for (const t of ts) {
      if (area(t.p) <= 1e-12) continue;   // a zero-area sliver draws nothing: no plane, no point to find
      const c = [0, 1, 2].map((i) => (t.p[i]! + t.p[3 + i]! + t.p[6 + i]!) / 3);
      const cuv = [0, 1].map((i) => (t.uv[i]! + t.uv[2 + i]! + t.uv[4 + i]!) / 3);
      const cn = [0, 1, 2].map((i) => (t.n[i]! + t.n[3 + i]! + t.n[6 + i]!) / 3);
      // The very triangle (all 24 floats): no interpolation. A needle sliver's barycentric weights lose ~1e-4 to Float32.
      const same = (x: number[], y: number[]) => x.every((v, i) => v === y[i]);
      const hit = (buckets.get(`${m}|${key(t.p)}`) ?? []).find((r) => {
        if (same(r.p, t.p) && same(r.uv, t.uv) && same(r.n, t.n)) return true;
        const w = bary(r.p, c);
        if (!w) return false;
        const uv = [0, 1].map((i) => w[0] * r.uv[i]! + w[1] * r.uv[2 + i]! + w[2] * r.uv[4 + i]!);
        const nn = [0, 1, 2].map((i) => w[0] * r.n[i]! + w[1] * r.n[3 + i]! + w[2] * r.n[6 + i]!);
        return uv.every((x, i) => Math.abs(x - cuv[i]!) <= 1e-5) && nn.every((x, i) => Math.abs(x - cn[i]!) <= 1e-5);
      });
      if (!hit) return `material ${m}: no reference triangle carries the drawn point ${c.map((x) => x.toFixed(6)).join(',')} with its uv and normal`;
    }
  }
  return null;
}

describe('stage 2: exact twins draw nothing (chunk c2)', () => {
  it('the ogee loop has twins, and each draws nothing', () => {
    const { bodies } = partGeometry(ogee);
    const twins = twinFaces(bodies);
    expect(twins.size).toBeGreaterThan(100);
    const cover = faceCover(bodies);
    expect(cover.twins).toBe(twins.size);
    for (const f of twins) expect(cover.remains.get(f)).toEqual([]);
  });
  it('the reference route takes no shortcut (twins: false)', () => {
    const { bodies } = partGeometry(ogee);
    expect(faceCover(bodies, { twins: false }).twins).toBe(0);
  });
  // Review Focus 5: an unfrozen bodies array is never memoised.
  it('an unfrozen bodies array is covered afresh', () => {
    const bodies = boardBodiesForTest(ogee, {});
    expect(Object.isFrozen(bodies)).toBe(false);
    expect(faceCover(bodies)).not.toBe(faceCover(bodies));
    const frozen = partGeometry(ogee).bodies;
    expect(faceCover(frozen)).toBe(faceCover(frozen));
  });
  it.each(shaped)('%s: the same visible area per material (1e-9), material, uv and normal at every drawn point', (_name, board) => {
    const { bodies, holes } = partGeometry(board);
    const got = partMesh(board, bodies, holes);
    const ref = partMesh(board, bodies, holes, { twins: false });
    const a = areas(got), b = areas(ref);
    expect([...a.keys()]).toEqual([...b.keys()]);
    for (const [m, x] of b) expect(Math.abs(a.get(m)! - x), `material ${m}`).toBeLessThanOrEqual(1e-9);
    // Identical bytes carry the property trivially; only a differing mesh needs the point-by-point check.
    const same = (x: ArrayLike<number>, y: ArrayLike<number>) => x.length === y.length && Array.prototype.every.call(x, (v: number, i: number) => v === y[i]);
    if (same(got.positions, ref.positions) && same(got.uvs, ref.uvs) && same(got.normals, ref.normals) && JSON.stringify(got.groups) === JSON.stringify(ref.groups)) return;
    expect(sameGrain(got, ref)).toBeNull();
  }, 30_000);   // the reference route (minusCover on every seam) is itself 5-10 s on the ogee/cove loops
  // Spec §2.2's partner-removed fixtures: a stop's run-out and a dado reshape faces next to the band; nothing they touch is
  // a twin unless its partner still lies exactly against it.
  it('partner-removed parts (a stop, a dado through the band) are in the list and drop twins elsewhere', () => {
    const names = shaped.map(([n]) => n);
    expect(names).toContain('stopOnCorner');
    expect(names).toContain('loop over a dado and a chamfer');
    expect(twinFaces(partGeometry(stopOnCorner()).bodies).size).toBeGreaterThan(0);
  });

  // Review I1: keyOf buckets at 1e-6, `same` decides at 1e-9. A vertex 2e-7 off hashes alike but is no twin.
  describe('twinFaces decides at 1e-9, inside the 1e-6 hash bucket', () => {
    const quad = (z: number, n: [number, number, number], flip: boolean, dx = 0): BodyFace => {
      const v: [number, number, number][] = [[0, 0, z], [1, 0, z], [1, 1, z], [0 + dx, 1, z]];
      return { verts: flip ? [v[0]!, v[3]!, v[2]!, v[1]!] : v, n } as unknown as BodyFace;
    };
    const body = (f: BodyFace): Body => ({ faces: [f] } as unknown as Body);
    it('exact twins: both dropped', () => {
      expect(twinFaces([body(quad(0, [0, 0, 1], false)), body(quad(0, [0, 0, -1], true))]).size).toBe(2);
    });
    it('one vertex 2e-7 off (same hash bucket: 2e-7 rounds to 0 at 1e-6, 5e-7 would not): not twins', () => {
      expect(twinFaces([body(quad(0, [0, 0, 1], false)), body(quad(0, [0, 0, -1], true, 2e-7))]).size).toBe(0);
    });
  });
});
