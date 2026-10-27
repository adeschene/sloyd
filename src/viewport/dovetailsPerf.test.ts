import { createBoard, createDocument, partGeometry } from '../document/document';
import type { Board, SloydDocument } from '../document/document';
import { applyDovetails, builtDovetails, dovetailPlan } from '../document/dovetails';
import { geometryBoard, shapedPart } from '../document/profiles';
import { partMesh } from './grainTiling';

/**
 * Dovetail rebuild performance with the MESH (final review, 2026-10-27; inv 50). A resize drag rebuilds a dovetailed part
 * every frame — bodies, edges and the mesh BoardMesh draws (a dovetailed part is shaped: ONE `partMesh`). The document
 * guard in `dovetailGeometry.test.ts` (bodies + edges) stays as it is; this one adds the mesh, beside the holes and curves
 * guards (a document test does not import the viewport).
 *
 * The fixture: a 6" drawer (3/4" front and back, 1/2" sides), dovetailed by the planner at 1:8, Auto (4 tails, 1/4" pins),
 * the four parts rebuilt per run. Each run's parts are NEW objects with the length moved by a micro-inch, so neither
 * `geometryBoard`'s memo nor `partGeometry`'s key is hit. The MINIMUM of 9 runs (load only inflates a run).
 *
 * Bound: 3 × the median of the minimum-of-9 on a quiet machine. Measured 2026-10-27 (this file alone, `uptime` 1-min load
 * 0.81–0.86, no browser running; `DOVETAIL_PERF_LOG=1` prints the minimum), seven runs: 13.33, 13.13, 13.24, 14.90, 13.45,
 * 14.01, 13.53 ms — median 13.45 → 3× = 40.35 → 41 ms. Lowered only, never raised (inv 50).
 */
const PERF_BOUND = 41;

function drawer(): SloydDocument {
  const fb = (id: string, name: string, z: number) => createBoard({ id, name, posture: 'on-edge', rotation: 0, length: 12, width: 6, thickness: 0.75, position: [0.5, 0, z] });
  const side = (id: string, name: string, x: number) => createBoard({ id, name, posture: 'on-edge', rotation: 90, length: 17.5, width: 6, thickness: 0.5, position: [x, 0, 0] });
  const doc = { ...createDocument('Drawer'), boards: [fb('f', 'Front', 0), fb('b', 'Back', 16.75), side('l', 'Side left', 0), side('r', 'Side right', 12.5)] };
  const plan = dovetailPlan(doc, ['f', 'b', 'l', 'r'], { slope: 8, count: null, swap: false });
  if (typeof plan === 'string') throw new Error(plan);
  return applyDovetails(doc, plan);
}
const PARTS = drawer().boards as Board[];

let tick = 0;
function rebuild(): number {
  tick += 1;
  const parts = PARTS.map((b) => ({ ...b, length: b.length + tick * 1e-6 }));
  const start = performance.now();
  for (const b of parts) {
    const g = partGeometry(b);
    void g.edges;
    partMesh(b, g.bodies, g.holes);
  }
  return performance.now() - start;
}

describe('dovetails perf: a dovetailed drawer rebuilds, mesh included, inside a frame', () => {
  it('the fixture: four parts, each with two BUILT dovetails of 4 tails, drawn as one shaped mesh', () => {
    expect(PARTS).toHaveLength(4);
    for (const b of PARTS) {
      expect(builtDovetails(b).map((d) => d.count)).toEqual([4, 4]);
      expect(shapedPart(geometryBoard(b))).toBe(true);
    }
  });
  it(`at most ${PERF_BOUND} ms (the minimum of 9)`, () => {
    for (let i = 0; i < 3; i += 1) rebuild();
    const min = Math.min(...Array.from({ length: 9 }, rebuild));
    if (process.env.DOVETAIL_PERF_LOG) console.log(`DOVETAIL_PERF_MIN ${min.toFixed(2)}`);
    expect(min).toBeLessThanOrEqual(PERF_BOUND);
  });
});
