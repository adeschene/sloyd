// No `import ... from 'vitest'` — `globals: true` is set in vite.config.ts.
import type { AnyLine, GuideLine, SnapPoint } from '../document/document';
import { PICK_RADIUS_PX, pickGuided, pickOnLine, pickSnapPoint } from './snapPick';
import type { Projector } from './snapPick';
import { snapToGrid } from '../document/geometry';
import { IMPERIAL } from '../units/length';
import type { Units } from '../units/length';

const METRIC: Units = { display: 'metric-mm', precision: 16 };

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

describe('pickOnLine / pickGuided', () => {
  // Top-down orthographic: world x,z -> pixels x10, looking down -Y.
  const project: Projector = (at) => ({ x: at[0] * 10, y: at[2] * 10, depth: -at[1] });
  const rayAt = (cx: number, cy: number) => ({
    origin: [cx / 10, 100, cy / 10] as [number, number, number],
    dir: [0, -1, 0] as [number, number, number],
  });
  const xLine = (z: number, id = 'L'): GuideLine => ({ id, at: [0, 0, z], axis: 'x' });
  const pick = (lines: GuideLine[], cx: number, cy: number, units: Units = IMPERIAL, extent = 120) =>
    pickOnLine(lines, project, { x: cx, y: cy }, rayAt(cx, cy), PICK_RADIUS_PX, units, extent);

  it('slides along an X line and rounds to the grid', () => {
    const hit = pick([xLine(2)], 73.6, 20)!;
    expect(hit.kind).toBe('line');
    expect(hit.owner).toEqual({ type: 'guide', id: 'L' });
    expect(hit.at[0]).toBe(118 / 16);
    expect(hit.at[1]).toBe(0);
    expect(hit.at[2]).toBe(2);
  });

  it('rounds to whole mm in a metric project', () => {
    const hit = pick([xLine(2)], 73.6, 20, METRIC)!;
    expect(hit.at[0]).toBe(Math.round(7.36 * 25.4) / 25.4);
  });

  it('offers nothing 13 px from the line', () => {
    expect(pick([xLine(2)], 73.4, 33)).toBeNull();
  });

  it('picks the nearer of two lines', () => {
    const a = xLine(2, 'A');
    const b = xLine(2.5, 'B');
    expect(pick([a, b], 50, 24)!.owner).toEqual({ type: 'guide', id: 'B' });
  });

  it('offers nothing for a line parallel to the ray, and no NaN', () => {
    const yLine: GuideLine = { id: 'Y', at: [5, 0, 5], axis: 'y' };
    expect(pick([yLine], 50, 50)).toBeNull();
  });

  it('slides on an OBLIQUE ray (the b*q term): origin [3,5,1], dir [0.2,-1,0] meets the line at x = 4', () => {
    // Hand-checked: w = P-O = [-3,-5,0]; b = 0.2, c = 1.04, p = -3, q = 4.4, t = (0.88+3.12)/(1.04-0.04) = 4.
    const line: GuideLine = { id: 'O', at: [0, 0, 1], axis: 'x' };
    const ray = { origin: [3, 5, 1] as [number, number, number], dir: [0.2, -1, 0] as [number, number, number] };
    const hit = pickOnLine([line], project, { x: 40, y: 10 }, ray, PICK_RADIUS_PX, IMPERIAL, 120)!;
    expect(hit.at).toEqual([4, 0, 1]);
  });

  it('offers nothing for a NEAR-parallel ray (not exactly parallel), and no NaN', () => {
    const yLine: GuideLine = { id: 'Y', at: [5, 0, 5], axis: 'y' };
    const ray = { origin: [5, 100, 5] as [number, number, number], dir: [1e-6, -1, 0] as [number, number, number] };
    expect(pickOnLine([yLine], project, { x: 50, y: 50 }, ray, PICK_RADIUS_PX, IMPERIAL, 120)).toBeNull();
  });

  it('clamps to the extent and rounds; a cursor past the end offers nothing', () => {
    expect(pick([xLine(2)], 1199.8, 20)!.at[0]).toBe(120);
    expect(pick([xLine(2)], 1300, 20)).toBeNull();
  });

  it('pickGuided prefers a discrete candidate in range, else slides', () => {
    const corner = point([7, 0, 2]);
    const args = (cands: SnapPoint[]) =>
      pickGuided(cands, [xLine(2)], project, { x: 73, y: 20 }, rayAt(73, 20), PICK_RADIUS_PX, IMPERIAL, 120);
    expect(args([corner])).toBe(corner);
    const far = point([30, 0, 2]);
    expect(args([far])!.kind).toBe('line');
  });
});

describe('pickOnLine: an oblique line (construction-lines-2 spec §2.4)', () => {
  const project: Projector = (at) => ({ x: at[0] * 10, y: at[2] * 10, depth: -at[1] });
  const rayAt = (cx: number, cy: number) => ({
    origin: [cx / 10, 100, cy / 10] as [number, number, number],
    dir: [0, -1, 0] as [number, number, number],
  });
  const line: AnyLine = { id: 'R', at: [0, 0, 0], to: [3, 4, 0] };
  const pick = (cx: number, cy: number, units: Units = IMPERIAL, extent = 120, lines: AnyLine[] = [line]) =>
    pickOnLine(lines, project, { x: cx, y: cy }, rayAt(cx, cy), PICK_RADIUS_PX, units, extent);

  it('rounds the distance along the line, not the world coordinates', () => {
    const hit = pick(2.03 * 0.6 * 10, 0)!;
    expect(hit.kind).toBe('line');
    expect(hit.owner).toEqual({ type: 'guide', id: 'R' });
    expect(hit.at[0]).toBeCloseTo(1.2, 12);
    expect(hit.at[1]).toBeCloseTo(1.6, 12);
    expect(hit.at[2]).toBe(0);
  });
  it('rounds to the nearest mm in a metric project', () => {
    const t = snapToGrid(2.03, METRIC);
    expect(t).toBe(Math.round(2.03 * 25.4) / 25.4);
    const hit = pick(2.03 * 0.6 * 10, 0, METRIC)!;
    expect(hit.at[0]).toBeCloseTo(0.6 * t, 12);
    expect(hit.at[1]).toBeCloseTo(0.8 * t, 12);
  });
  it('offers nothing for a ray parallel to the line', () => {
    const along = { origin: [0, 0, 5] as [number, number, number], dir: [0.6, 0.8, 0] as [number, number, number] };
    expect(pickOnLine([line], project, { x: 0, y: 50 }, along, PICK_RADIUS_PX, IMPERIAL, 120)).toBeNull();
  });
  it('offers nothing when the clamped end is far from the cursor', () => {
    // extent 0.2 ends the line at t = 0.25; the cursor is aimed at t = 4.
    expect(pick(4 * 0.6 * 10, 0, IMPERIAL, 0.2)).toBeNull();
  });
  it('clamps a point just past the end back onto it', () => {
    // extent 1: the line ends at t = 1.25 (y = 1). Aimed at t = 1.5, the hit is the end, not a point beyond it.
    const hit = pick(1.5 * 0.6 * 10, 0, IMPERIAL, 1)!;
    expect(hit.at[0]).toBeCloseTo(0.75, 12);
    expect(hit.at[1]).toBeCloseTo(1, 12);
  });
  it('offers nothing for a line that misses the box', () => {
    expect(pick(10, 0, IMPERIAL, 120, [{ id: 'F', at: [200, 0, 0], to: [200, 1, 0] }])).toBeNull();
  });
  it('lets pickGuided prefer a discrete candidate', () => {
    const c = point([0.6, 1.6, 0]);
    const hit = pickGuided([c], [line], project, { x: 6, y: 0 }, rayAt(6, 0), PICK_RADIUS_PX, IMPERIAL, 120);
    expect(hit).toBe(c);
  });
});
