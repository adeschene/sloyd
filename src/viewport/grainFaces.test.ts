import { createBoard } from '../document/document';
import { faceGrainKinds, grainFamily } from './grainFaces';

describe('faceGrainKinds', () => {
  const base = createBoard({ length: 36, width: 9, thickness: 0.75 });

  // Order is BoxGeometry's material groups: +X, -X, +Y, -Y, +Z, -Z.
  it('grain along the length, flat: ends on X, faces up and down, edges on Z', () => {
    expect(faceGrainKinds({ ...base, posture: 'flat', rotation: 0 }))
      .toEqual(['end', 'end', 'face', 'face', 'edge', 'edge']);
  });

  it('grain across the width: the ends move to the faces normal to the width', () => {
    // A cross-grain part — the one that makes continuous grain across a
    // right-angle butt joint possible. Length now shows edge grain.
    expect(faceGrainKinds({ ...base, posture: 'flat', rotation: 0, grain: 'width' }))
      .toEqual(['edge', 'edge', 'face', 'face', 'end', 'end']);
  });

  it('grain through the thickness: an end-grain board shows rings on its broad faces', () => {
    expect(faceGrainKinds({ ...base, posture: 'flat', rotation: 0, grain: 'thickness' }))
      .toEqual(['edge', 'edge', 'end', 'end', 'face', 'face']);
  });

  it('follows the board when the posture changes', () => {
    expect(faceGrainKinds({ ...base, posture: 'upright', rotation: 0 }))
      .toEqual(['edge', 'edge', 'end', 'end', 'face', 'face']);
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
