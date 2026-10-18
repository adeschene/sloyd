import { it } from 'vitest';
import { createBoard, partGeometry } from '../document/document';
import type { Board } from '../document/document';
import { bodyMesh } from './grainTiling';
import { loop, topCorners } from '../document/sweepFixtures';
let tick = 0;
function one(make: (k: number) => Board) {
  tick += 1; const board = make(1 + tick * 1e-6);
  const t0 = performance.now(); const g = partGeometry(board); void g.bodies; const t1 = performance.now();
  void g.edges; const t2 = performance.now();
  for (const b of g.bodies) bodyMesh(board, b, g.holes, g.bodies); const t3 = performance.now();
  return [t1 - t0, t2 - t1, t3 - t2, t3 - t0, g.bodies.length, g.bodies.reduce((s, b) => s + b.faces.length, 0)];
}
const at = (b: Board) => (k: number) => createBoard({ ...b, length: b.length * k });
it('split', () => {
  for (const [n, b] of [['bead', topCorners(2, loop('p1', 0.25, 'bead'))], ['ro2', topCorners(2)]] as const) {
    for (let i = 0; i < 3; i++) one(at(b));
    const rs = Array.from({ length: 9 }, () => one(at(b)));
    console.log(n, [0, 1, 2, 3].map((k) => Math.min(...rs.map((r) => r[k]!)).toFixed(1)).join(' '), 'bodies', rs[0]![4], 'faces', rs[0]![5]);
  }
}, 120000);
