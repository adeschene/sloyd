// No `import ... from 'vitest'` — `globals: true` is set in vite.config.ts.
import type { AnyLine, Guide, GuideLine, SnapPoint } from '../document/document';
import { PICK_RADIUS_PX, closestOnLine, pickGuide, pickGuided, pickOnLine, pickSnapPoint } from './snapPick';
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

describe('closestOnLine', () => {
  const line: GuideLine = { id: 'L', at: [0, 5, 0], axis: 'x' };
  const down = (x: number) => ({ origin: [x, 0, 10] as [number, number, number], dir: [0, 0, -1] as [number, number, number] });
  it('finds the closest approach on an axis line', () => {
    const hit = closestOnLine(line, down(3), 120)!;
    expect(hit.t).toBeCloseTo(3, 12);
    expect(hit.at[0]).toBeCloseTo(3, 12);
    expect(hit.at[1]).toBe(5);
    expect(hit.at[2]).toBe(0);
  });
  it('clamps t to the extent', () => {
    expect(closestOnLine(line, down(50), 10)!.t).toBe(10);
    expect(closestOnLine(line, down(-50), 10)!.t).toBe(-10);
  });
  it('is null for a ray parallel to the line', () => {
    expect(closestOnLine(line, { origin: [0, 0, 0], dir: [1, 0, 0] }, 120)).toBeNull();
  });
});

describe('pickGuide', () => {
  // Orthographic, looking down -Z: world (x, y) -> pixel (x, -y); depth = -z (smaller is nearer).
  const project: Projector = (at) => ({ x: at[0], y: -at[1], depth: -at[2] });
  const cursor = { x: 100, y: -100 };
  const ray = { origin: [100, 100, 50] as [number, number, number], dir: [0, 0, -1] as [number, number, number] };
  const pick = (guides: Guide[], occ: number | null = null) =>
    pickGuide(guides, project, cursor, ray, PICK_RADIUS_PX, 1000, occ);
  const pt = (x: number, y: number, id = 'P'): Guide => ({ id, at: [x, y, 0] });
  const axisLine = (y: number, id = 'A'): Guide => ({ id, at: [0, y, 0], axis: 'x' });

  it('picks a point 5 px off', () => expect(pick([pt(105, 100)])).toBe('P'));
  it('ignores a point 13 px off', () => expect(pick([pt(113, 100)])).toBeNull());
  it('picks an axis line 4 px off', () => expect(pick([axisLine(104)])).toBe('A'));
  it('picks an oblique line 4 px off', () => {
    // through (0,104,0) and (200,104,0): horizontal in screen, 4 px off, though not axis-parallel by construction
    const o: Guide = { id: 'O', at: [0, 104, 0], to: [200, 104.0001, 0.0001] };
    expect(pick([o])).toBe('O');
  });
  it('prefers a point to a line at an equal distance', () => {
    expect(pick([axisLine(104), pt(104, 100)])).toBe('P');
    expect(pick([pt(104, 100), axisLine(104)])).toBe('P');
  });
  it('prefers a point within reach to a nearer line (browser check)', () => {
    // point 6 px off, line 1 px off: both in radius; the point wins whatever the order or the line's depth
    expect(pick([axisLine(101), pt(106, 100)])).toBe('P');
    expect(pick([pt(106, 100), axisLine(101)])).toBe('P');
  });
  it('picks the nearer of two points, ties to depth', () => {
    expect(pick([pt(108, 100, 'far'), pt(103, 100, 'near')])).toBe('near');
    const deep: Guide = { id: 'deep', at: [104, 100, -5] };
    const shallow: Guide = { id: 'shallow', at: [104, 100, 5] };
    expect(pick([deep, shallow])).toBe('shallow');
  });
  it('drops a line with a nearer occluder', () => {
    const l: Guide = { id: 'A', at: [0, 104, -3], axis: 'x' }; // depth 3
    expect(pick([l], 0)).toBeNull();
    expect(pick([l], 10)).toBe('A');
  });
  it('keeps a point whatever the occluder', () => expect(pick([pt(105, 100)], -100)).toBe('P'));
  it('breaks a line-line tie by nearer depth', () => {
    const far: Guide = { id: 'far', at: [0, 104, -5], axis: 'x' };
    const near: Guide = { id: 'near', at: [0, 104, 5], axis: 'x' };
    expect(pick([far, near])).toBe('near');
    expect(pick([near, far])).toBe('near');
  });
});
