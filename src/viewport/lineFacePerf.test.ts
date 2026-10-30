import { appendFileSync } from 'node:fs';
import { lineFaceCandidates, partsBounds, worldParts } from '../document/document';
import type { Guide } from '../document/document';
import { designToDocument, parseDesign } from '../document/generated';
import { SHAKER_TABLE_JSON } from '../document/shakerTableFixture';
import { SCENE_EXTENT } from './extent';

/**
 * Where a line meets a part (construction-lines-2 spec §3.1): the candidate list is lines × parts × bodies, rebuilt when
 * the document or the guides change (both tools' candidate memos). 20 lines — 10 axis lines spread through the piece and
 * 10 oblique ones across it — against every part of the shaker-table fixture. Part geometry is memoised by the document
 * layer (`partGeometry`), as it is in the app, so a run times the clipping, probing and bore tests, not body building.
 * The fixture has NO holes, so the guard does not time the bore test (`insideHole` per hit); it times clipping and probing.
 * The MINIMUM of 9 runs (load only inflates a run). Bound 40 ms, the guard budget's default; lowered only, never raised.
 */
const parts = worldParts(designToDocument(parseDesign(SHAKER_TABLE_JSON)!, { centre: false }).doc);
const box = partsBounds(parts)!;
const lerp = (i: number, f: number) => box.min[i]! + f * (box.max[i]! - box.min[i]!);
const at = (fx: number, fy: number, fz: number): [number, number, number] => [lerp(0, fx), lerp(1, fy), lerp(2, fz)];
const lines: Guide[] = [
  ...[0.1, 0.3, 0.5, 0.7, 0.9].map((f, k) => ({ id: `y${k}`, at: [lerp(0, f), 0, lerp(2, 1 - f)] as [number, number, number], axis: 'y' as const })),
  ...[0.2, 0.5, 0.8].map((f, k) => ({ id: `x${k}`, at: [0, lerp(1, f), lerp(2, 0.05 + f * 0.9)] as [number, number, number], axis: 'x' as const })),
  ...[0.3, 0.95].map((f, k) => ({ id: `z${k}`, at: [lerp(0, 0.04), lerp(1, f), 0] as [number, number, number], axis: 'z' as const })),
  ...Array.from({ length: 10 }, (_, k) => ({ id: `o${k}`, at: at(0, k / 10, 0.05 * k), to: at(1, 1 - k / 12, 1 - 0.07 * k) })),
];

describe('line-face candidates rebuild inside a frame', () => {
  it('20 lines against the shaker table: at most 40 ms', () => {
    // The fixture is what it claims: 20 lines, and they meet parts (a guard over no hits times nothing).
    expect(lines).toHaveLength(20);
    const hits = lineFaceCandidates(lines, parts, SCENE_EXTENT);
    expect(hits.length).toBeGreaterThan(20);
    const run = () => { const start = performance.now(); lineFaceCandidates(lines, parts, SCENE_EXTENT); return performance.now() - start; };
    for (let i = 0; i < 3; i += 1) run();
    const min = Math.min(...Array.from({ length: 9 }, run));
    if (process.env.SLOYD_PERF_LOG) appendFileSync(process.env.SLOYD_PERF_LOG, `${expect.getState().currentTestName}\t${min.toFixed(1)}\n`);
    expect(min).toBeLessThanOrEqual(40);
  });
});
