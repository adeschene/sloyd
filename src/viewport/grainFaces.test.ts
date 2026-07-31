import { createBoard } from '../document/document';
import { faceGrainKinds, grainFamily } from './grainFaces';

const base = createBoard({ length: 36, width: 9, thickness: 0.75 });

describe('faceGrainKinds', () => {
  // Order is BoxGeometry's material groups: +X, -X, +Y, -Y, +Z, -Z.
  it('flat, grain along X: ends on X, faces up and down, edges on Z', () => {
    expect(faceGrainKinds({ ...base, posture: 'flat', rotation: 0 }))
      .toEqual(['end', 'end', 'face', 'face', 'edge', 'edge']);
  });

  it('flat, grain along Z: edges on X, faces up and down, ends on Z', () => {
    expect(faceGrainKinds({ ...base, posture: 'flat', rotation: 90 }))
      .toEqual(['edge', 'edge', 'face', 'face', 'end', 'end']);
  });

  it('on edge, grain along X: ends on X, edges up and down, faces on Z', () => {
    expect(faceGrainKinds({ ...base, posture: 'on-edge', rotation: 0 }))
      .toEqual(['end', 'end', 'edge', 'edge', 'face', 'face']);
  });

  it('on edge, grain along Z: faces on X, edges up and down, ends on Z', () => {
    expect(faceGrainKinds({ ...base, posture: 'on-edge', rotation: 90 }))
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
