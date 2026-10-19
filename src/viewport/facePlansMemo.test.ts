import { describe, expect, it } from 'vitest';
import { createBoard, partGeometry } from '../document/document';
import type { Board } from '../document/document';
import { ARCH } from '../document/curveFixtures';
import { bodyMesh } from './grainTiling';

// Chunk c1 review M1: bodyMesh keeps facePlans / curveChords per board OBJECT, with the fields they read. The store is
// immutable, so nothing mutates a meshed board today; these checks are the memo's only defence if a writer ever does.
// Each case meshes an unfrozen board, changes one checked field IN PLACE (same object), meshes again, and expects exactly
// what a fresh object with that field gives. (A swept board is meshed through its geometry view, a different object from
// the stored part, so the curved part carries the object-keyed memo here; both memos are consulted for it.)
const meshes = (board: Board) => {
  const g = partGeometry(board);
  return g.bodies.map((b) => {
    const m = bodyMesh(board, b, g.holes, g.bodies);
    return { p: Array.from(m.positions), u: Array.from(m.uvs), n: m.normals ? Array.from(m.normals) : null, g: m.groups };
  });
};
const base = () => createBoard({ id: 'memo', length: 30, width: 5, thickness: 0.75, curves: [{ ...ARCH }] });

describe('bodyMesh memo key (facePlans, curveChords)', () => {
  const cases: [string, (b: Board) => void][] = [
    ['length', (b) => { b.length = 36; }],
    ['width', (b) => { b.width = 6; }],
    ['thickness', (b) => { b.thickness = 1; }],
    ['grain', (b) => { b.grain = b.grain === 'length' ? 'width' : 'length'; }],
    ['posture', (b) => { b.posture = 'upright'; }],
  ];
  for (const [field, change] of cases) {
    it(`a ${field} changed in place on a meshed board meshes as a fresh board`, () => {
      const used = base();
      const before = meshes(used);
      change(used);
      const fresh = { ...base() };
      change(fresh);
      const after = meshes(used);
      expect(after).toEqual(meshes(fresh));
      expect(after).not.toEqual(before);
    });
  }
});
