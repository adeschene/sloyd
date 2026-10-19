import { describe, expect, it } from 'vitest';
import { IMPERIAL } from '../units/length';
import { buildDiagrams } from './diagram';
import { createBoard } from './document';
import { faceOutline } from './profilePath';
import { curveLines } from './curveText';
import { apronArch, endToEnd, frontOnly, loop, straightTopLong, topCorners, stopOnCorner, frontAndEnds } from './sweepFixtures';
import { geometryBoard } from './profiles';
import { sweptStops } from './sweep';
import type { Board } from './types';

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
    // The notes are curveLineEntries' (Task 8): the corners' collapsed line, then the loop's bench line (inv 19: one home).
    expect(views[0]!.curveNotes).toEqual([
      { key: 'cminmin', text: 'Round all four corners to a 2" radius' },
      { key: 'p1', text: 'Roundover 1/4" all round the thickness face (max side)' },
    ]);
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
    expect(v.curveNotes).toEqual(curveLines(apronArch, IMPERIAL).map((text, i) => ({ key: i === 0 ? 'c1' : 'p1', text })));
    expect(v.curveNotes[1]!.text).toBe('Roundover 1/4" on the edge between the width face (min side) and the thickness face (max side), along the length');
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
  it('a faulted swept profile opens the same view as an unfaulted one and lists its bench line there, check and all', () => {
    // Too tight: 1/8" corners under a 1/4" roundover's reach. It builds nothing (no inner line), but the top's thickness view
    // opens as it would for the built loop, and the corners take it (no thickness min side), as curves keep a faulted note.
    const views = buildDiagrams(topCorners(0.125), IMPERIAL);
    expect(views.map((v) => v.key)).toEqual(['thickness|max']);
    expect('sweeps' in views[0]!).toBe(false);
    expect(views[0]!.curveNotes.map((n) => n.text)).toEqual([
      'Round all four corners to a 1/8" radius',
      'Roundover 1/4" all round the thickness face (max side) — check: it is too tight for the curve',
    ]);
    // A face-min one opens the bottom's.
    expect(buildDiagrams(topCorners(0.125, loop('p1', 0.25, 'roundover', 'min')), IMPERIAL).map((v) => v.key)).toEqual(['thickness|min']);
  });
});

/*
 * Profile runs b2 (Task 7; Q24, P16): a swept STOP on the part diagrams. Q8 for every swept stop: the face's thickness view
 * opens and its inner line runs up to each stop's plane (no run-out arc drawn: the line is the band's wavefront, which the
 * skeleton ends on each stop's ray N, in the stop plane); no end view opens to hatch the profile (P16).
 */
describe('a swept stop on the part diagrams (profile runs b2, Q24)', () => {
  /** The stop planes (through `at`, normal F: the plane holds N and the thickness axis), as plan lines. */
  const planes = (b: Board) => { const v = geometryBoard(b); return sweptStops(v, v.profiles[0]!); };
  const offPlane = (q: P2, fr: { at: readonly number[]; F: readonly number[] }) => Math.abs((q[0] - fr.at[0]!) * fr.F[0]! + (q[1] - fr.at[1]!) * fr.F[1]!);
  it('stopOnCorner: only the top\'s thickness view opens; its open inner line ends on each stop\'s plane; no end-view hatch', () => {
    const b = stopOnCorner();
    const views = buildDiagrams(b, IMPERIAL);
    expect(views.map((v) => v.key)).toEqual(['thickness|max']);
    const [w, ...more] = views[0]!.sweeps!;
    expect(more).toEqual([]);
    expect(w!.id).toBe('p1');
    expect(w!.closed).toBe(false);
    const [lo, hi] = planes(b);
    expect(offPlane(w!.pts[0]!, lo!)).toBeLessThanOrEqual(1e-9);
    expect(offPlane(w!.pts[w!.pts.length - 1]!, hi!)).toBeLessThanOrEqual(1e-9);
    // Every point of it lies the reach in from the outline (the line runs to the stop plane, never round the run-out).
    for (const q of w!.pts) expect(toOutline(b, q)).toBeCloseTo(0.25, 9);
    // The hatch is the corners' waste only, never the profile's.
    expect(views[0]!.curves.map((c) => c.id).sort()).toEqual(['cmaxmax', 'cmaxmin', 'cminmax', 'cminmin']);
  });
  it('frontAndEnds: ONE open inner line round the front and both corners, ending on the two stop planes', () => {
    const b = frontAndEnds();
    const views = buildDiagrams(b, IMPERIAL);
    expect(views.map((v) => v.key)).toEqual(['thickness|max']);
    expect(views[0]!.sweeps).toHaveLength(1);
    const [w] = views[0]!.sweeps!;
    expect(w!.closed).toBe(false);
    const [lo, hi] = planes(b);
    expect(offPlane(w!.pts[0]!, lo!)).toBeLessThanOrEqual(1e-9);
    expect(offPlane(w!.pts[w!.pts.length - 1]!, hi!)).toBeLessThanOrEqual(1e-9);
    for (const q of w!.pts) expect(toOutline(b, q)).toBeCloseTo(0.25, 9);
    // Round both front corners: points inside each front corner's arc square, and along the front between them.
    expect(w!.pts.some((q) => q[0] < 2 && q[1] < 2 && q[0] > 0.25 + 1e-6)).toBe(true);
    expect(w!.pts.some((q) => q[0] > 34 && q[1] < 2 && q[0] < 35.75 - 1e-6)).toBe(true);
    expect(views[0]!.curves.map((c) => c.id).sort()).toEqual(['cmaxmax', 'cmaxmin', 'cminmax', 'cminmin']);
  });
});
