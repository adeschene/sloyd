import { partGeometry } from '../document/document';
import type { Board } from '../document/document';
import { geometryBoard, shapedPart } from '../document/profiles';
import { CURVED_CASES, SWEPT_CASES } from '../document/meshCases';
import { topCorners, loop } from '../document/sweepFixtures';
import { bodyMesh, drawsAsBox, partMesh } from './grainTiling';

/**
 * Chunk c2, stage 1 (spec §2.1): a shaped part draws ONE geometry, its bodies' meshes concatenated material by material in
 * BoxGeometry face order, bodies in order within each material, one group per material. So the merged mesh is exactly
 * today's triangles, re-laid: every attribute's slice for material m equals the per-body slices for m, back to back.
 */
function concatenated(board: Board): Map<number, { positions: number[]; uvs: number[]; normals: number[] }> {
  const { bodies, holes } = partGeometry(board);
  const out = new Map<number, { positions: number[]; uvs: number[]; normals: number[] }>();
  for (const body of bodies) {
    const m = bodyMesh(board, body, holes, bodies);
    for (const g of m.groups) {
      const slot = out.get(g.materialIndex) ?? { positions: [], uvs: [], normals: [] };
      slot.positions.push(...m.positions.subarray(g.start * 3, (g.start + g.count) * 3));
      slot.uvs.push(...m.uvs.subarray(g.start * 2, (g.start + g.count) * 2));
      slot.normals.push(...m.normals!.subarray(g.start * 3, (g.start + g.count) * 3));
      out.set(g.materialIndex, slot);
    }
  }
  return out;
}

const shaped = [...SWEPT_CASES, ...CURVED_CASES].filter(([, b]) => shapedPart(geometryBoard(b)));

describe('partMesh: a shaped part\'s bodies in one geometry (chunk c2, stage 1)', () => {
  it('the fixtures are shaped parts, every body through bodyMesh', () => {
    expect(shaped.length).toBeGreaterThan(50 + CURVED_CASES.length);
    expect(CURVED_CASES.every(([, b]) => shapedPart(geometryBoard(b)))).toBe(true);
    for (const [name, b] of shaped) {
      const { bodies, holes } = partGeometry(b);
      expect(bodies.every((body) => !drawsAsBox(b, body, holes)), name).toBe(true);
    }
  });
  it.each(shaped)('%s: the per-body meshes, re-laid by material', (_name, board) => {
    const { bodies, holes } = partGeometry(board);
    const m = partMesh(board, bodies, holes);
    const want = concatenated(board);
    // One group per material present, ascending, contiguous from 0, covering every vertex.
    expect(m.groups.map((g) => g.materialIndex)).toEqual([...want.keys()].sort((a, b) => a - b));
    let at = 0;
    for (const g of m.groups) { expect(g.start).toBe(at); at += g.count; }
    expect(at * 3).toBe(m.positions.length);
    expect(m.uvs.length).toBe(at * 2);
    expect(m.normals.length).toBe(at * 3);
    for (const g of m.groups) {
      const w = want.get(g.materialIndex)!;
      expect(Array.from(m.positions.subarray(g.start * 3, (g.start + g.count) * 3))).toEqual(w.positions);
      expect(Array.from(m.uvs.subarray(g.start * 2, (g.start + g.count) * 2))).toEqual(w.uvs);
      expect(Array.from(m.normals.subarray(g.start * 3, (g.start + g.count) * 3))).toEqual(w.normals);
    }
  });
  // Review Focus 1: two parts with one geometry key share partGeometry's frozen bodies; each draws its own pose and grain offset.
  it('two parts sharing frozen bodies each get their own mesh (no memo on the bodies)', () => {
    const base = topCorners(2, loop('p1', 0.375, 'ogee'));
    const a: Board = { ...base, id: 'a' };
    const b: Board = { ...base, id: 'b', posture: 'upright', rotation: 90 };
    const ga = partGeometry(a), gb = partGeometry(b);
    expect(gb.bodies).toBe(ga.bodies);   // the fixture is what it claims: one shared, frozen array
    const ma = partMesh(a, ga.bodies, ga.holes);
    const mb = partMesh(b, gb.bodies, gb.holes);
    expect(Array.from(ma.positions)).not.toEqual(Array.from(mb.positions));
    expect(Array.from(ma.uvs)).not.toEqual(Array.from(mb.uvs));
    const wb = concatenated(b);
    for (const g of mb.groups) expect(Array.from(mb.positions.subarray(g.start * 3, (g.start + g.count) * 3))).toEqual(wb.get(g.materialIndex)!.positions);
  });
});
