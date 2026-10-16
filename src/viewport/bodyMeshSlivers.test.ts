import { createBoard, archCurve, cornerCurve, miterCut, bevelCut, chamferCut, taperCut, miterRatio, defaultShelfPinRow, partGeometry, defaultBow, defaultNotch } from '../document/document';
import type { Board } from '../document/document';
import { bodyMesh } from './grainTiling';
import { chiralAngled, chiralCurved, chiralHoled } from '../document/turnFixtures';
const dims = { length: 30, width: 5, thickness: 0.75 };
const dado = { id: 'd', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 12, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
const arch = { id: 'a', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1.5 }) };
const corners = (['min', 'max'] as const).flatMap((uf) => (['min', 'max'] as const).map((vf) => ({ id: `${uf}${vf}`, ...cornerCurve({ through: 'thickness', uFrom: uf, vFrom: vf, radius: 2 }) })));
const b0 = createBoard(dims);
const cases: Board[] = [
  createBoard({ ...dims, curves: [arch], cuts: [dado] }), createBoard({ length: 36, width: 20, thickness: 0.75, curves: corners }),
  createBoard({ ...dims, length: 36, curves: [{ id: 'b', ...defaultBow(b0) }] }), createBoard({ ...dims, curves: [{ id: 'n', ...defaultNotch(b0)! }] }),
  createBoard({ ...dims, curves: [arch], holes: [{ id: 'p', ...defaultShelfPinRow(b0)!, inset: 2.5 }] }),
  ...(['flat', 'on-edge', 'upright'] as const).flatMap((p) => [chiralAngled(p), chiralCurved(p), chiralHoled(p)]),
  createBoard({ length: 24, width: 2.5, thickness: 0.75, angleCuts: [{ id: 'm', ...miterCut({ end: 'max', across: 'width', longSide: 'min', ratio: 1 }, { length: 24, width: 2.5, thickness: 0.75 }) }, { id: 'v', ...bevelCut({ face: 'width', from: 'max', longSide: 'min', ratio: miterRatio(30) }, { length: 24, width: 2.5, thickness: 0.75 }) }], cuts: [dado] }),
  createBoard({ length: 28, width: 2, thickness: 2, angleCuts: [{ id: 't', ...taperCut({ face: 'width', from: 'min', end: 'min', start: 20, amount: 0.5 }) }, { id: 'c', ...chamferCut({ face: 'width', from: 'max', along: 'thickness', alongFrom: 'max', legFace: 0.25, legAlong: 0.25 }, { length: 28, width: 2, thickness: 2 }) }] }),
];
/**
 * fu 290: bodyMesh skips a triangle whose area is under 1e-12 in Float64, but the GPU gets Float32 — a ~BODY_EPS sliver
 * could survive the skip and collapse there. Measured 2026-10-16 over these fixtures (curved, split, holed, angled, every
 * posture): 5788 triangles, none with two equal Float32 vertices or zero Float32 area. This pins it.
 */
it('no emitted triangle collapses at Float32 (fu 290)', () => {
  let tris = 0, dup = 0, flat = 0;
  for (const b of cases) {
    const g = partGeometry(b);
    for (const body of g.bodies) {
      const p = bodyMesh(b, body, g.holes, g.bodies).positions;   // Float32
      for (let t = 0; t < p.length / 9; t += 1) {
        tris += 1;
        const v = [0, 1, 2].map((k) => [p[9 * t + 3 * k]!, p[9 * t + 3 * k + 1]!, p[9 * t + 3 * k + 2]!]);
        const same = (a: number[], c: number[]) => a[0] === c[0] && a[1] === c[1] && a[2] === c[2];
        if (same(v[0]!, v[1]!) || same(v[1]!, v[2]!) || same(v[0]!, v[2]!)) { dup += 1; continue; }
        const e1 = v[1]!.map((x, i) => x - v[0]![i]!), e2 = v[2]!.map((x, i) => x - v[0]![i]!);
        const c = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
        if (Math.hypot(...c) === 0) flat += 1;
      }
    }
  }
  expect(tris).toBeGreaterThan(5000);
  expect(dup).toBe(0);
  expect(flat).toBe(0);
});
