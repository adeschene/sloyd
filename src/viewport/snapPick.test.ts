// No `import ... from 'vitest'` — `globals: true` is set in vite.config.ts.
import type { SnapPoint } from '../document/document';
import { PICK_RADIUS_PX, pickSnapPoint, sameSnapPoint } from './snapPick';
import type { Projector } from './snapPick';

let n = 0;
const point = (at: [number, number, number], id = `b${(n += 1)}`): SnapPoint => ({
  kind: 'corner',
  at,
  owner: { type: 'board', id },
});

/**
 * A projector driven by a lookup table keyed on the point's x coordinate, so
 * each test states screen positions directly instead of simulating a camera.
 */
const projectorFrom = (
  table: Record<number, { x: number; y: number; depth: number } | null>,
): Projector => (at) => table[at[0]] ?? null;

describe('pickSnapPoint', () => {
  it('returns null for an empty candidate list', () => {
    expect(pickSnapPoint([], () => ({ x: 0, y: 0, depth: 0 }), { x: 0, y: 0 }, 12))
      .toBeNull();
  });

  it('returns the nearest candidate within the radius', () => {
    const near = point([1, 0, 0]);
    const far = point([2, 0, 0]);
    const project = projectorFrom({
      1: { x: 103, y: 100, depth: 0 },
      2: { x: 110, y: 100, depth: 0 },
    });
    expect(pickSnapPoint([far, near], project, { x: 100, y: 100 }, 12)).toBe(near);
  });

  it('returns null when every candidate is outside the radius', () => {
    const p = point([1, 0, 0]);
    const project = projectorFrom({ 1: { x: 100, y: 113, depth: 0 } });
    expect(pickSnapPoint([p], project, { x: 100, y: 100 }, 12)).toBeNull();
  });

  it('includes a candidate exactly at the radius', () => {
    const p = point([1, 0, 0]);
    const project = projectorFrom({ 1: { x: 112, y: 100, depth: 0 } });
    expect(pickSnapPoint([p], project, { x: 100, y: 100 }, 12)).toBe(p);
  });

  it('culls a candidate the projector rejects, even when it is nearest', () => {
    const behind = point([1, 0, 0]);
    const visible = point([2, 0, 0]);
    const project = projectorFrom({
      1: null,
      2: { x: 105, y: 100, depth: 0 },
    });
    expect(pickSnapPoint([behind, visible], project, { x: 100, y: 100 }, 12))
      .toBe(visible);
  });

  it('returns null when the only candidate in range is culled', () => {
    const behind = point([1, 0, 0]);
    expect(pickSnapPoint([behind], projectorFrom({ 1: null }), { x: 100, y: 100 }, 12))
      .toBeNull();
  });

  it('breaks an exact screen-distance tie by depth, nearer to the camera first', () => {
    const back = point([1, 0, 0]);
    const front = point([2, 0, 0]);
    const project = projectorFrom({
      1: { x: 104, y: 100, depth: 0.9 },
      2: { x: 104, y: 100, depth: 0.1 },
    });
    // Listed back-first so a naive "first one wins" implementation fails.
    expect(pickSnapPoint([back, front], project, { x: 100, y: 100 }, 12)).toBe(front);
  });

  it('prefers a nearer-on-screen candidate over a nearer-to-camera one', () => {
    const close = point([1, 0, 0]);
    const deep = point([2, 0, 0]);
    const project = projectorFrom({
      1: { x: 101, y: 100, depth: 0.9 },
      2: { x: 108, y: 100, depth: 0.1 },
    });
    expect(pickSnapPoint([deep, close], project, { x: 100, y: 100 }, 12)).toBe(close);
  });

  it('measures distance in both axes, not just x', () => {
    const p = point([1, 0, 0]);
    const project = projectorFrom({ 1: { x: 109, y: 109, depth: 0 } });
    // 9,9 is 12.7px away — outside a 12px radius despite each axis being inside.
    expect(pickSnapPoint([p], project, { x: 100, y: 100 }, 12)).toBeNull();
  });

  it('ships a 12px default radius', () => {
    expect(PICK_RADIUS_PX).toBe(12);
  });
});

describe('sameSnapPoint', () => {
  it('treats two nulls as the same', () => {
    expect(sameSnapPoint(null, null)).toBe(true);
  });

  it('treats null and a point as different', () => {
    const p = point([1, 0, 0]);
    expect(sameSnapPoint(p, null)).toBe(false);
    expect(sameSnapPoint(null, p)).toBe(false);
  });

  it('compares by owner, kind and position rather than by reference', () => {
    const a: SnapPoint = { kind: 'corner', at: [1, 2, 3], owner: { type: 'board', id: 'x' } };
    const b: SnapPoint = { kind: 'corner', at: [1, 2, 3], owner: { type: 'board', id: 'x' } };
    expect(a).not.toBe(b);
    expect(sameSnapPoint(a, b)).toBe(true);
  });

  it('separates two points that differ only in kind', () => {
    const a: SnapPoint = { kind: 'corner', at: [1, 2, 3], owner: { type: 'board', id: 'x' } };
    const b: SnapPoint = { ...a, kind: 'face-center' };
    expect(sameSnapPoint(a, b)).toBe(false);
  });

  it('separates two points that differ only in owner', () => {
    const a: SnapPoint = { kind: 'corner', at: [1, 2, 3], owner: { type: 'board', id: 'x' } };
    const b: SnapPoint = { ...a, owner: { type: 'board', id: 'y' } };
    expect(sameSnapPoint(a, b)).toBe(false);
  });

  it('separates two points that differ only in position', () => {
    const a: SnapPoint = { kind: 'corner', at: [1, 2, 3], owner: { type: 'board', id: 'x' } };
    const b: SnapPoint = { ...a, at: [1, 2, 4] };
    expect(sameSnapPoint(a, b)).toBe(false);
  });
});
