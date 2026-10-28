import type { SavedViewCamera } from '../document/types';
import { orthoHeight, orthoZoomFor, pendingPoseReady } from './viewCamera';

describe('ortho height ↔ zoom (saved views spec §2: a view stores a visible height, not three\'s pixel zoom)', () => {
  it('reads the visible world height off the frustum and zoom', () => {
    expect(orthoHeight(400, -400, 20)).toBe(40);
  });

  it('restores the same visible height at another canvas size', () => {
    expect(orthoZoomFor(300, -300, 40)).toBe(15);
    expect(orthoHeight(300, -300, 15)).toBe(40);
    expect(orthoZoomFor(400, -400, 40)).toBe(20);
    expect(orthoHeight(400, -400, orthoZoomFor(400, -400, 40))).toBe(40);
  });
});

describe('pendingPoseReady (a restore applies only to the camera it was saved for, once its controls drive it)', () => {
  const ortho: SavedViewCamera = { ortho: true, position: [1, 2, 3], target: [0, 0, 0], height: 40 };
  const persp: SavedViewCamera = { ortho: false, position: [1, 2, 3], target: [0, 0, 0] };

  it('is false with nothing pending', () => {
    expect(pendingPoseReady(null, true, true)).toBe(false);
    expect(pendingPoseReady(null, false, true)).toBe(false);
  });

  it('is false while the camera is still the other projection', () => {
    expect(pendingPoseReady(ortho, false, true)).toBe(false);
    expect(pendingPoseReady(persp, true, true)).toBe(false);
  });

  it('is false in the matching projection until the controls are on the camera', () => {
    expect(pendingPoseReady(ortho, true, false)).toBe(false);
  });

  it('is true in the matching projection with the controls on the camera', () => {
    expect(pendingPoseReady(ortho, true, true)).toBe(true);
    expect(pendingPoseReady(persp, false, true)).toBe(true);
  });
});
