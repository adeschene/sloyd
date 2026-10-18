import { describe, expect, it, vi } from 'vitest';
import { IMPERIAL } from '../units/length';
import { buildDiagrams } from './diagram';
import { createBoard } from './document';
import { faceOutline } from './profilePath';
import { apronArch, endToEnd, frontOnly, loop, straightTopLong, topCorners } from './sweepFixtures';
import type { Board } from './types';

// The notes are curveLineEntries' (Task 8 adds a swept profile's words): here an entry naming the profile stands in, so a
// view's note shows exactly when the profile's id is in that view's `drawn` set (the pre-flight ruling on T6 ↔ T8).
vi.mock('./curveText', async (orig) => {
  const actual = await orig<typeof import('./curveText')>();
  return { ...actual, curveLineEntries: (...a: Parameters<typeof actual.curveLineEntries>) => [...actual.curveLineEntries(...a), { ids: ['p1'], text: 'SWEPT p1' }] };
});

/*
 * A swept profile on the part diagrams (profile runs b1, Task 6; spec §5 Part diagrams, Q8): it opens its face's thickness
 * view (after the holes' entry views, before the curves' rule) and draws its INNER line there — the path offset into the wood
 * by the reach — thin and solid. Expectations from the fixtures' own numbers: every point of the line lies the reach in from
 * the face outline.
 */
type P2 = [number, number];
const distSeg = (q: P2, a: P2, b: P2) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy);
};
const toOutline = (b: Board, q: P2) => Math.min(...faceOutline(b)!.chords.map((c) => distSeg(q, c.a, c.b)));
const viewOf = (b: Board, key: string) => buildDiagrams(b, IMPERIAL).find((v) => v.key === key);

describe('a swept profile on the part diagrams', () => {
  it('a loop on the top of the 2" corner part: the top\'s thickness view opens and draws one closed line the reach in', () => {
    const b = topCorners(2);
    const views = buildDiagrams(b, IMPERIAL);
    expect(views.map((v) => v.key)).toEqual(['thickness|max']);
    const [w] = views[0]!.sweeps!;
    expect(w!.id).toBe('p1');
    expect(w!.closed).toBe(true);
    expect(w!.pts.length).toBeGreaterThanOrEqual(52);
    for (const q of w!.pts) expect(toOutline(b, q)).toBeCloseTo(0.25, 9);
    expect(views[0]!.curveNotes.map((n) => n.text)).toContain('SWEPT p1');   // p1 is in the view's drawn set
  });
  it('the arched apron: an open line, from end face to end face, the reach in from the arched edge', () => {
    const v = viewOf(apronArch, 'thickness|max')!;
    const [w] = v.sweeps!;
    expect(w!.closed).toBe(false);
    const xs = w!.pts.map((q) => q[0]);
    expect(Math.min(...xs)).toBeCloseTo(0, 9);
    expect(Math.max(...xs)).toBeCloseTo(30, 9);
    // The reach in from the profiled side's chords (the end faces' are where the line leaves the part).
    const side = faceOutline(apronArch)!.chords.filter((c) => !(c.a[0] === c.b[0] && (c.a[0] === 0 || c.a[0] === 30)) && c.a[1] < 2);
    // (At the arch's two sharp ends the offset vertex lies the reach from both chords' LINES, a hair more from the segments.)
    for (const q of w!.pts) {
      const d = Math.min(...side.map((c) => distSeg(q, c.a, c.b)));
      expect(d).toBeGreaterThanOrEqual(0.25 - 1e-9);
      expect(d).toBeLessThanOrEqual(0.25 + 1e-4);
    }
    expect(v.curveNotes.map((n) => n.text)).toContain('SWEPT p1');
  });
  it('B1 stations: the line stops on the stations\' planes', () => {
    const [w] = viewOf(frontOnly, 'thickness|max')!.sweeps!;
    const ys = [w!.pts[0]![1], w!.pts[w!.pts.length - 1]![1]];
    const y0 = 2 + 2 * 0.25 * Math.tan(Math.PI / 96);   // the station, ε past the corner's tangent point (fix round 1)
    for (const y of ys) expect(y).toBeCloseTo(y0, 9);
  });
  it('face min opens the bottom\'s thickness view', () => {
    const b = topCorners(2, loop('p1', 0.25, 'roundover', 'min'));
    expect(viewOf(b, 'thickness|min')!.sweeps!.map((w) => w.id)).toEqual(['p1']);
    expect(viewOf(b, 'thickness|max')).toBeUndefined();
  });
  it('a hole\'s entry view comes first, then the sweep\'s, before the curves\' rule (no thickness min side opened)', () => {
    // A hole on the front (width face, min side) opens its own view; the sweep then opens the top's thickness view, so the
    // corners (curves through the thickness) find a thickness view and open no min side. Were the sweep's view opened after
    // the curves' rule, 'thickness|min' would appear too.
    const b: Board = { ...topCorners(2), holes: [{ id: 'h', face: 'width', from: 'min', along: 'length', alongFrom: 'min', station: 10, acrossFrom: 'min', inset: 0.375, diameter: 0.25, depth: 0.25, through: false, count: 1, pitch: 0 } as Board['holes'][number]] };
    expect(buildDiagrams(b, IMPERIAL).map((v) => v.key)).toEqual(['width|min', 'thickness|max']);
  });
  it('a part with no swept profile has no `sweeps` on any view (byte for byte)', () => {
    const straight = createBoard({ length: 30, width: 10, thickness: 0.75, profiles: [straightTopLong] });
    for (const v of buildDiagrams(straight, IMPERIAL)) expect('sweeps' in v).toBe(false);
    for (const v of buildDiagrams(topCorners(2, { ...endToEnd('p1', { across: 'width', from: 'min' }), size: 3 }), IMPERIAL)) expect('sweeps' in v).toBe(false);   // faulted: builds nothing
  });
});
