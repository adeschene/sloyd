import { createBoard, boardExtents } from '../document/document';
import { axisDimensions, faceGrainKinds, grainFamily } from './grainFaces';

const base = createBoard({ length: 36, width: 9, thickness: 0.75 });

describe('axisDimensions', () => {
  // This mirrors boardExtents exactly, and the two must not drift apart: the
  // grain kind on a face is decided by which dimension runs along its normal,
  // so a disagreement would paint end grain on a face.
  it('agrees with boardExtents in every orientation', () => {
    for (const rotation of [0, 90] as const) {
      for (const standing of [false, true]) {
        const board = { ...base, rotation, standing };
        const extents = boardExtents(board);
        axisDimensions(board).forEach((dimension, axis) => {
          expect(extents[axis]).toBe(board[dimension]);
        });
      }
    }
  });
});

describe('faceGrainKinds', () => {
  // Order is BoxGeometry's material groups: +X, -X, +Y, -Y, +Z, -Z.
  it('flat, grain along X: ends on X, faces up and down, edges on Z', () => {
    expect(faceGrainKinds({ ...base, standing: false, rotation: 0 }))
      .toEqual(['end', 'end', 'face', 'face', 'edge', 'edge']);
  });

  it('flat, grain along Z: edges on X, faces up and down, ends on Z', () => {
    expect(faceGrainKinds({ ...base, standing: false, rotation: 90 }))
      .toEqual(['edge', 'edge', 'face', 'face', 'end', 'end']);
  });

  it('standing, grain along X: ends on X, edges up and down, faces on Z', () => {
    expect(faceGrainKinds({ ...base, standing: true, rotation: 0 }))
      .toEqual(['end', 'end', 'edge', 'edge', 'face', 'face']);
  });

  it('standing, grain along Z: faces on X, edges up and down, ends on Z', () => {
    expect(faceGrainKinds({ ...base, standing: true, rotation: 90 }))
      .toEqual(['face', 'face', 'edge', 'edge', 'end', 'end']);
  });

  it('always describes six faces', () => {
    expect(faceGrainKinds(base)).toHaveLength(6);
  });
});

describe('grainFamily', () => {
  it('gives plywood and MDF their own treatment', () => {
    expect(grainFamily('plywood')).toBe('plywood');
    expect(grainFamily('mdf')).toBe('mdf');
  });

  it('treats every species as wood, including one it has never heard of', () => {
    expect(grainFamily('oak')).toBe('wood');
    expect(grainFamily('walnut')).toBe('wood');
    expect(grainFamily('purpleheart')).toBe('wood');
  });
});
