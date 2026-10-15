import { createHash } from 'node:crypto';
import { createBoard, defaultHingeCup, defaultHole, defaultShelfPinRow, partGeometry } from '../document/document';
import type { Board } from '../document/document';
import { bodyMesh } from './grainTiling';

/**
 * Parts WITHOUT curves draw byte-for-byte what they drew before the curves round (curves spec §3.2/§3.4; invariants 35,
 * 50): bodyMesh's positions, uvs and groups over every body of a few holed, multi-body parts, hashed. The hashes were
 * computed by running this file on `master` (before curves) and on `curves` at 7e93a5d (before its watertightness fix):
 * the same four. They must not move. No curve, no `normals` stream.
 */
function meshHash(board: Board): string {
  const { bodies, holes } = partGeometry(board);
  const h = createHash('sha256');
  for (const body of bodies) {
    const m = bodyMesh(board, body, holes, bodies);
    expect(m.normals).toBeUndefined();
    h.update(Buffer.from(m.positions.buffer, m.positions.byteOffset, m.positions.byteLength));
    h.update(Buffer.from(m.uvs.buffer, m.uvs.byteOffset, m.uvs.byteLength));
    h.update(JSON.stringify(m.groups));
  }
  return h.digest('hex');
}

const dado = { id: 'c1', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 10, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
const stopped = { ...dado, id: 'c2', offset: 20, stopMin: 0, stopMax: 3 };
const side = createBoard({ id: 'side', length: 30, width: 11.25, thickness: 0.75, cuts: [dado, stopped] });
const sidePins = { ...side, holes: [{ id: 'r1', ...defaultShelfPinRow(side)! }] };
const door = createBoard({ id: 'door', length: 24, width: 15, thickness: 0.75 });
const doorCup = { ...door, cuts: [dado], holes: [{ id: 'h1', ...defaultHingeCup(door) }] };
const plain = createBoard({ id: 'p', length: 20, width: 6, thickness: 0.75, cuts: [dado] });
const plainHole = { ...plain, holes: [{ id: 'h1', ...defaultHole(plain) }] };
const upright = { ...sidePins, id: 'up', posture: 'upright' as const, rotation: 90 as const };

describe('bodyMesh of a part without curves is unchanged (byte-for-byte)', () => {
  it.each([
    ['a dado and a stopped dado with a shelf-pin row', sidePins, '0218d02f28d42fd7d82641d0aa68d2c35856805da07a82331facdc5589919b37'],
    ['a hinge cup beside a dado', doorCup, 'f8206db4eae547b7bfed54809222fa1f12d6d93f07dd1955b133fcab9187c9a3'],
    ['a plain hole beside a dado', plainHole, 'f4384b82631797d3df5ce8a8cc71001a4faa142933974bc7e9e57418ea90f81f'],
    ['an upright, turned part with the dadoes and pins', upright, 'fadf5046bffc01be8e0775a8008f3f58c298b87d63bdb7b1e446a43e617f1622'],
  ])('%s', (_name, board, hash) => {
    expect(partGeometry(board).bodies.length).toBeGreaterThan(1);
    expect(partGeometry(board).holes.length).toBeGreaterThan(0);
    expect(meshHash(board)).toBe(hash);
  });
});
