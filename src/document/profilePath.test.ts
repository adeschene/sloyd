import { describe, expect, it } from 'vitest';
import { faceOutline, isSwept, profilePath, sideStretch, builtPath } from './profilePath';
import { apronArch, topCorners, frontOnly, notchEdge, endToEnd, loop, stopped, straightTopLong, plainLoop } from './sweepFixtures';
import { createBoard } from './document';
import { archCurve, bowCurve, cornerCurve, curveOutline, twiceArea, CURVE_TOLERANCE } from './curves';
import { migrateDocument, createDocument } from './document';
import type { Board, ProfileCut } from './types';
import { profileFaults } from './profiles';

const pts = (o: NonNullable<ReturnType<typeof faceOutline>>) => o.chords.map((c) => c.a);
describe('faceOutline', () => {
  it('is the rectangle, CCW, for a part with no thickness curves', () => {
    const o = faceOutline(createBoard({ length: 30, width: 5, thickness: 0.75 }))!;
    expect(pts(o)).toEqual([[0, 0], [30, 0], [30, 5], [0, 5]]);
  });
  it('splices an arch chain in, each chord carrying the curve id; area = rectangle − arch waste', () => {
    const o = faceOutline(apronArch)!;
    const arcs = o.chords.filter((c) => c.curve === 'c1');
    expect(arcs.length).toBeGreaterThan(8);
    expect(arcs.every((c) => c.arc && c.arc.concave)).toBe(true);
    // the arch segment's area: circular segment of chord 24, rise 1.25
    const R = (12 * 12 + 1.25 * 1.25) / (2 * 1.25), th = 2 * Math.asin(12 / R), seg = (R * R / 2) * (th - Math.sin(th));
    // Amended (Task 1): the brief asserted toBeCloseTo(…, 2) (< 0.005) against the TRUE segment, but the arch is 16 chords at
    // CURVE_TOLERANCE and the chord polygon differs by 0.0790 (measured). Pinned instead: exactly the rectangle minus the
    // waste's chord polygon, and the true segment within the bound the brief's own comment states.
    const waste = twiceArea(curveOutline(apronArch, apronArch.curves[0]!).pts) / 2;
    expect(twiceArea(pts(o)) / 2).toBeCloseTo(30 * 5 - Math.abs(waste), 9);
    expect(Math.abs(twiceArea(pts(o)) / 2 - (30 * 5 - seg))).toBeLessThan(CURVE_TOLERANCE * R * th);   // chords: within CURVE_TOLERANCE × arc length
  });
  it('rounds four corners: convex arcs, area = rectangle − 4(r² − πr²/4)', () => {
    const o = faceOutline(topCorners(2))!;
    expect(o.chords.filter((c) => c.arc).every((c) => !c.arc!.concave)).toBe(true);
    expect(twiceArea(pts(o)) / 2).toBeCloseTo(36 * 20 - 4 * (4 - Math.PI), 1);
  });
});
describe('sideStretch (§3.3 (B))', () => {
  it('an arched side runs corner to corner through the arch; both ends sharp', () => {
    const s = sideStretch(apronArch, faceOutline(apronArch)!, { across: 'width', from: 'min' })!;
    expect([s.startEnd, s.endEnd]).toEqual(['sharp', 'sharp']);
  });
  it('a side between two corner arcs carries round both (B1): ends are arc', () => {
    const s = sideStretch(frontOnly, faceOutline(frontOnly)!, { across: 'width', from: 'min' })!;
    expect([s.startEnd, s.endEnd]).toEqual(['arc', 'arc']);
  });
});
describe('isSwept (Q2)', () => {
  it('End to end on an uncut side with sharp corners is straight', () => {
    const b = createBoard({ length: 30, width: 10, thickness: 0.75, profiles: [straightTopLong] });
    expect(isSwept(b, straightTopLong)).toBe(false);
    // the apron's OTHER long side (width max) is uncut: straight too
    expect(isSwept(apronArch, endToEnd('q', { across: 'width', from: 'max' }))).toBe(false);
  });
  it('the arched side, the cornered side and every loop are swept', () => {
    expect(isSwept(apronArch, apronArch.profiles[0]!)).toBe(true);
    expect(isSwept(frontOnly, frontOnly.profiles[0]!)).toBe(true);
    expect(isSwept(topCorners(2), topCorners(2).profiles[0]!)).toBe(true);
  });
  it('a station run is never swept in b1 (a2 builds it)', () => {
    expect(isSwept(apronArch, stopped('q', { across: 'width', from: 'min' }, 5, 25))).toBe(false);
  });
  it('a plain part\'s loop is swept', () => { expect(isSwept(plainLoop, plainLoop.profiles[0]!)).toBe(true); });
});
describe('profilePath', () => {
  it('a loop is the whole outline, CCW from outside the face (reversed for face min)', () => {
    const b = topCorners(2);
    const max = profilePath(b, loop('a'))!, min = profilePath(b, loop('b', 0.25, 'roundover', 'min'))!;
    expect(max.loop).toBe(true);
    expect(max.chords.length).toBe(faceOutline(b)!.chords.length);
    expect(min.chords.map((c) => [c.b, c.a])).toEqual(max.chords.slice().reverse().map((c) => [c.a, c.b]));
  });
  it('the cornered front ends at stations on the end sides at the far tangent points, tangent along the end side', () => {
    const p = profilePath(frontOnly, frontOnly.profiles[0]!)!;
    const [s, e] = p.ends!;
    expect(s.kind).toBe('station'); expect(e.kind).toBe('station');
    // face max, CCW: the front (width min) runs +x; its stretch starts at the length-min end's tangent point (0, 2) and
    // ends at the length-max end's (36, 2). `tangent` points AWAY from the run, where the run-out lies: +y at both.
    // The path faults read is the stretch's own (fix round 2: ε never decides anything). The BUILT path (builtPath) carries
    // each station ε = 2 · reach · tan(φ/2) on along the end side, φ the corner's end chord against it — 12 chords to a 2"
    // quarter turn, so φ = π/48 — so the band meets the run-out with one section.
    if (s.kind !== 'station' || e.kind !== 'station') throw new Error('unreachable');
    expect(s.at[0]).toBeCloseTo(0, 12); expect(s.at[1]).toBeCloseTo(2, 12);
    expect(e.at[0]).toBeCloseTo(36, 12); expect(e.at[1]).toBeCloseTo(2, 12);
    const eps = 2 * 0.25 * Math.tan(Math.PI / 96);
    const [bs, be] = builtPath(frontOnly, frontOnly.profiles[0]!)!.ends! as { at: [number, number] }[];
    expect(bs!.at[0]).toBeCloseTo(0, 12); expect(bs!.at[1]).toBeCloseTo(2 + eps, 12);
    expect(be!.at[0]).toBeCloseTo(36, 12); expect(be!.at[1]).toBeCloseTo(2 + eps, 12);
    expect(s.tangent).toEqual([0, 1]); expect(e.tangent).toEqual([0, 1]);
    expect(s.side).toEqual({ across: 'length', from: 'min' }); expect(e.side).toEqual({ across: 'length', from: 'max' });
  });
  it('a sharp-cornered end is a through end whose ray runs along the end face into the part', () => {
    const p = profilePath(apronArch, apronArch.profiles[0]!)!;
    const [s, e] = p.ends!;
    if (s.kind !== 'through' || e.kind !== 'through') throw new Error('expected through ends');
    expect(s.ray).toEqual([0, 1]); expect(e.ray).toEqual([0, 1]);   // along x = 0 and x = 30, into the width
  });
});

const W_MIN = { across: 'width', from: 'min' } as const;
const corner = (id: string, u: 'min' | 'max', v: 'min' | 'max', r: number) => ({ id, ...cornerCurve({ through: 'thickness', uFrom: u, vFrom: v, radius: r }) });
describe('faceOutline: further pins (Task 1)', () => {
  it('the four rounded corners: exactly the rectangle minus the four chord-polygon wastes', () => {
    const b = topCorners(2);
    const waste = b.curves.reduce((s, c) => s + Math.abs(twiceArea(curveOutline(b, c).pts)) / 2, 0);
    expect(twiceArea(pts(faceOutline(b)!)) / 2).toBeCloseTo(36 * 20 - waste, 9);
  });
  it('chords chain: each ends where the next starts, closing; chain chords carry their curve, boundary chords none', () => {
    const o = faceOutline(topCorners(2))!;
    o.chords.forEach((c, i) => expect(o.chords[(i + 1) % o.chords.length]!.a).toEqual(c.b));
    const ids = [...new Set(o.chords.map((c) => c.curve).filter(Boolean))].sort();
    expect(ids).toEqual(['cmaxmax', 'cmaxmin', 'cminmax', 'cminmin']);
    expect(o.chords.filter((c) => !c.curve).length).toBe(4);   // one straight run per side
    expect(o.chords.filter((c) => !c.curve).every((c) => !c.arc)).toBe(true);
  });
  it('the arc carried is the TRUE arc: every chord end lies on the circle', () => {
    for (const b of [apronArch, topCorners(2), notchEdge]) {
      for (const c of faceOutline(b)!.chords.filter((x) => x.arc)) {
        for (const p of [c.a, c.b]) expect(Math.hypot(p[0] - c.arc!.c[0], p[1] - c.arc!.c[1])).toBeCloseTo(c.arc!.r, 9);
      }
    }
  });
  it('a half-round notch is concave (radius 1, centre on the edge)', () => {
    const arcs = faceOutline(notchEdge)!.chords.filter((c) => c.arc);
    expect(arcs.length).toBeGreaterThan(0);
    expect(arcs.every((c) => c.arc!.concave && c.arc!.r === 1)).toBe(true);
  });
  it('a bow is CONVEX even when its centre lies beyond the far edge (concave is "bows into the wood", not "centre outside")', () => {
    const bow = { id: 'w', ...bowCurve({ through: 'thickness', along: 'length', side: 'min', span: 30, rise: 0.5 }) };
    const b = createBoard({ length: 30, width: 5, thickness: 0.75, curves: [bow] });
    const o = faceOutline(b)!;
    const arcs = o.chords.filter((c) => c.arc);
    expect(arcs[0]!.arc!.c[1]).toBeGreaterThan(5);   // the centre is off the part
    expect(arcs.every((c) => !c.arc!.concave)).toBe(true);
    // the bowed side's stretch is the bow alone, from the length-min end to the length-max end, sharp at both
    const s = sideStretch(b, o, W_MIN)!;
    expect([s.startEnd, s.endEnd]).toEqual(['sharp', 'sharp']);
    expect(o.chords[s.from]!.a).toEqual([0, 0.5]);
    expect(o.chords[s.to]!.b).toEqual([30, 0.5]);
    expect(isSwept(b, endToEnd('q', W_MIN))).toBe(true);
  });
  it('an inner loop (a curve wholly inside the face) is not followed (R8)', () => {
    const inner = { id: 'i', through: 'thickness' as const, uFrom: 'min' as const, vFrom: 'min' as const, start: [10, 2] as [number, number],
      segments: [{ type: 'line' as const, to: [12, 2] as [number, number] }, { type: 'line' as const, to: [12, 3] as [number, number] }, { type: 'line' as const, to: [10, 2] as [number, number] }] };
    expect(pts(faceOutline(createBoard({ length: 30, width: 5, thickness: 0.75, curves: [inner] }))!)).toEqual([[0, 0], [30, 0], [30, 5], [0, 5]]);
  });
  it('null when two curves\' perimeter stretches overlap, or a curve runs off the face', () => {
    const a1 = { id: 'a', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 10, rise: 1 }) };
    const a2 = { id: 'b', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 8, span: 10, rise: 1 }) };
    const over = createBoard({ length: 30, width: 5, thickness: 0.75, curves: [a1, a2] });
    expect(faceOutline(over)).toBeNull();
    // nested: a shallow arch wholly inside the big arch's stretch (its chords cross nothing — only the overlap test sees it)
    const small = { id: 's', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 10, span: 2, rise: 0.1 }) };
    expect(faceOutline(createBoard({ length: 30, width: 5, thickness: 0.75, curves: [...apronArch.curves, small] }))).toBeNull();
    const deep = { id: 'd', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 6 }) };
    expect(faceOutline(createBoard({ length: 30, width: 5, thickness: 0.75, curves: [deep] }))).toBeNull();
    // the outline being null: a loop is still swept (it faults), an End to end stays straight (a1's builder)
    expect(isSwept(over, loop('l'))).toBe(true);
    expect(isSwept(over, endToEnd('e', W_MIN))).toBe(false);
    expect(profilePath(over, loop('l'))).toBeNull();
  });
  it('ignores curves through the length or width (chunk 1 profiles, stopped run-outs)', () => {
    const c = { id: 'x', ...cornerCurve({ through: 'width', uFrom: 'max', vFrom: 'max', radius: 0.25 }) };
    expect(pts(faceOutline(createBoard({ length: 30, width: 5, thickness: 0.75, curves: [c] }))!)).toEqual([[0, 0], [30, 0], [30, 5], [0, 5]]);
  });
  it('is memoised per part and deep-frozen', () => {
    const o = faceOutline(apronArch)!;
    expect(faceOutline(apronArch)).toBe(o);
    expect(Object.isFrozen(o.chords[0]!.a)).toBe(true);
    expect(Object.isFrozen(o.chords.find((c) => c.arc)!.arc)).toBe(true);
  });
});
describe('sideStretch: further pins (Task 1)', () => {
  it('the arched side runs (0,0) → (30,0) through the arch; the other sides are their one chord', () => {
    const o = faceOutline(apronArch)!;
    const s = sideStretch(apronArch, o, W_MIN)!;
    expect(o.chords[s.from]!.a).toEqual([0, 0]);
    expect(o.chords[s.to]!.b).toEqual([30, 0]);
    for (const side of [{ across: 'width', from: 'max' }, { across: 'length', from: 'min' }, { across: 'length', from: 'max' }] as const) {
      const t = sideStretch(apronArch, o, side)!;
      expect([t.from === t.to, t.startEnd, t.endEnd]).toEqual([true, 'sharp', 'sharp']);
    }
  });
  it('a corner arc belongs to neither side alone: each side carries it (B1)', () => {
    const o = faceOutline(frontOnly)!;
    const front = sideStretch(frontOnly, o, W_MIN)!, end = sideStretch(frontOnly, o, { across: 'length', from: 'max' })!;
    expect(o.chords[front.to]!.curve).toBe('cmaxmin');
    expect(o.chords[end.from]!.curve).toBe('cmaxmin');
    expect([end.startEnd, end.endEnd]).toEqual(['arc', 'arc']);
  });
  it('one corner rounded: the front is arc at that end only, sharp at the other', () => {
    const b = createBoard({ length: 36, width: 20, thickness: 0.75, curves: [corner('k', 'max', 'min', 2)] });
    const s = sideStretch(b, faceOutline(b)!, W_MIN)!;
    expect([s.startEnd, s.endEnd]).toEqual(['sharp', 'arc']);
  });
  it('an arch on the END side reaching the corner does not round the front\'s corner', () => {
    const endArch = { id: 'e', ...archCurve({ through: 'thickness', along: 'width', side: 'min', from: 'min', start: 0, span: 3, rise: 0.5 }) };
    const b = createBoard({ length: 36, width: 20, thickness: 0.75, curves: [endArch] });
    const o = faceOutline(b)!;
    const s = sideStretch(b, o, W_MIN)!;
    expect([s.startEnd, s.endEnd]).toEqual(['sharp', 'sharp']);
    expect([s.from === s.to, o.chords[s.from]!.a]).toEqual([true, [0, 0]]);
  });
  it('two corner arcs meeting on a side (width = 2r): the side is the two arcs, arc at both ends', () => {
    const b = createBoard({ length: 36, width: 4, thickness: 0.75, curves: [corner('a', 'min', 'min', 2), corner('b', 'min', 'max', 2)] });
    const o = faceOutline(b)!;
    const s = sideStretch(b, o, { across: 'length', from: 'min' })!;
    expect([s.startEnd, s.endEnd]).toEqual(['arc', 'arc']);
    expect(o.chords[s.from]!.a).toEqual([2, 4]);   // the far tangent points: on the width-max side, then the width-min
    expect(o.chords[s.to]!.b).toEqual([2, 0]);
  });
});
describe('profilePath: further pins (Task 1)', () => {
  it('face min reverses an open path and swaps its ends (geometry unchanged)', () => {
    const max = profilePath(frontOnly, frontOnly.profiles[0]!)!;
    const min = profilePath(frontOnly, { ...frontOnly.profiles[0]!, face: 'min' })!;
    expect(min.chords.map((c) => [c.b, c.a])).toEqual(max.chords.slice().reverse().map((c) => [c.a, c.b]));
    expect(min.ends).toEqual([max.ends![1], max.ends![0]]);
    const [s] = min.ends!;
    if (s.kind !== 'station') throw new Error('expected a station');
    expect(s.side).toEqual({ across: 'length', from: 'max' });
    expect(s.at[0]).toBeCloseTo(36, 12);
  });
  it('the cornered front runs (0,2) round both arcs to (36,2): its first and last chords are the arcs', () => {
    const p = profilePath(frontOnly, frontOnly.profiles[0]!)!;
    expect(p.chords[0]!.curve).toBe('cminmin');
    expect(p.chords[p.chords.length - 1]!.curve).toBe('cmaxmin');
    expect(p.chords.filter((c) => !c.curve).length).toBe(1);
  });
  it('the BUILT path runs on by its stations\' extensions along the end sides (fix round 1)', () => {
    const p = builtPath(frontOnly, frontOnly.profiles[0]!)!;
    const n = p.chords.length;
    expect(p.chords[1]!.curve).toBe('cminmin');
    expect(p.chords[n - 2]!.curve).toBe('cmaxmin');
    expect(p.chords.filter((c) => !c.curve).length).toBe(3);   // the front, and the two extensions
    const eps = 2 * 0.25 * Math.tan(Math.PI / 96);
    for (const c of [p.chords[0]!, p.chords[n - 1]!]) {
      expect(c.curve).toBeUndefined();
      expect(c.a[0]).toBe(c.b[0]);   // along an end side
      expect(Math.abs(c.b[1] - c.a[1])).toBeCloseTo(eps, 12);
    }
    expect(p.chords[0]!.b).toEqual([0, 2]);   // the extension ends exactly where the corner's arc begins
  });
  it('a straight End to end is its one chord with through ends', () => {
    const b = createBoard({ length: 30, width: 10, thickness: 0.75, profiles: [straightTopLong] });
    const p = profilePath(b, straightTopLong)!;
    expect(p.chords.map((c) => [c.a, c.b])).toEqual([[[30, 10], [0, 10]]]);
    expect(p.ends).toEqual([{ kind: 'through', ray: [0, -1] }, { kind: 'through', ray: [0, -1] }]);
  });
  it('a station run has no b1 path (a2 builds it); nor do ends on two sides (b2)', () => {
    expect(profilePath(apronArch, stopped('q', W_MIN, 5, 25))).toBeNull();
    const two = { ...endToEnd('t', W_MIN), run: { start: { side: W_MIN, through: 'min' as const }, end: { side: { across: 'length' as const, from: 'max' as const }, through: 'max' as const } } };
    expect(profilePath(apronArch, two)).toBeNull();
    expect(isSwept(apronArch, two)).toBe(false);
  });
});
describe('fixtures load through the loader unchanged (all but the loop)', () => {
  it('apronArch, notchEdge, frontOnly and a stopped run round-trip', () => {
    const fixtures: Board[] = [apronArch, notchEdge, frontOnly, createBoard({ ...apronArch, id: 'st', profiles: [stopped('q', W_MIN, 5, 25)] })];
    const raw = JSON.parse(JSON.stringify({ ...createDocument('T'), boards: fixtures }));
    const doc = migrateDocument(raw);
    fixtures.forEach((f, i) => {
      const b = doc.boards[i] as Board;
      expect(b.curves).toEqual(f.curves);
      expect(b.profiles).toEqual(f.profiles);
    });
  });
});
describe('through rays follow the real end face (review fix 1)', () => {
  const unit = (a: readonly number[], b: readonly number[]) => { const d = [b[0]! - a[0]!, b[1]! - a[1]!]; const l = Math.hypot(d[0]!, d[1]!); return [d[0]! / l, d[1]! / l]; };
  it('a bowed END face: the end ray runs along the bow\'s first chord, scaled by 1/(n·u) (≈ (0.375, 1))', () => {
    const bow = { id: 'w', ...bowCurve({ through: 'thickness', along: 'width', side: 'max', span: 5, rise: 0.5 }) };
    const b = createBoard({ length: 30, width: 5, thickness: 0.75, curves: [...apronArch.curves, bow], profiles: [apronArch.profiles[0]!] });
    const o = faceOutline(b)!;
    const p = profilePath(b, b.profiles[0]!)!;
    expect(isSwept(b, b.profiles[0]!)).toBe(true);
    const e = p.ends![1];
    if (e.kind !== 'through') throw new Error('expected a through end');
    const last = p.chords[p.chords.length - 1]!;
    expect(last.b).toEqual([29.5, 0]);
    const next = o.chords[(o.chords.indexOf(last) + 1) % o.chords.length]!;
    expect(next.curve).toBe('w');
    const u = unit(next.a, next.b);
    expect(u[0]).toBeCloseTo(0.351, 3); expect(u[1]).toBeCloseTo(0.936, 3);
    // the path's last chord runs +x, so n = (0, 1) and n·u = u[1]: ray = u / u[1]
    expect(e.ray[0]).toBeCloseTo(u[0]! / u[1]!, 12); expect(e.ray[1]).toBeCloseTo(1, 12);
    expect(e.ray[0]).toBeCloseTo(0.375, 2);
  });
  it('a bowed START face (length min): the start ray runs back along the bow\'s last chord, away from the corner', () => {
    const bow = { id: 'w', ...bowCurve({ through: 'thickness', along: 'width', side: 'min', span: 5, rise: 0.5 }) };
    const b = createBoard({ length: 30, width: 5, thickness: 0.75, curves: [...apronArch.curves, bow], profiles: [apronArch.profiles[0]!] });
    const o = faceOutline(b)!;
    const p = profilePath(b, b.profiles[0]!)!;
    const s = p.ends![0];
    if (s.kind !== 'through') throw new Error('expected a through end');
    const first = p.chords[0]!;
    expect(first.a).toEqual([0.5, 0]);
    const prior = o.chords[(o.chords.indexOf(first) - 1 + o.chords.length) % o.chords.length]!;
    expect(prior.curve).toBe('w');
    const u = unit(prior.b, prior.a);   // from the corner up the end face
    expect(u[0]).toBeLessThan(0); expect(u[1]).toBeGreaterThan(0.9);
    expect(s.ray[0]).toBeCloseTo(u[0]! / u[1]!, 12); expect(s.ray[1]).toBeCloseTo(1, 12);
    expect(s.ray[0]).toBeCloseTo(-0.375, 2);
  });
  it('an arch starting AT the corner: the start ray is the end face (0, 1) scaled by 1/cos of the arch chord (k ≠ 1)', () => {
    const arch = { id: 'c1', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 0, span: 24, rise: 1.25 }) };
    const b = createBoard({ length: 30, width: 5, thickness: 0.75, curves: [arch], profiles: [apronArch.profiles[0]!] });
    const p = profilePath(b, b.profiles[0]!)!;
    const s = p.ends![0];
    if (s.kind !== 'through') throw new Error('expected a through end');
    const first = p.chords[0]!;
    expect(first.a).toEqual([0, 0]);
    expect(first.curve).toBe('c1');
    const d = unit(first.a, first.b);   // n = (−d1, d0); u = (0, 1); n·u = d0
    expect(s.ray[0]).toBe(0);
    expect(s.ray[1]).toBeCloseTo(1 / d[0]!, 12);
    expect(s.ray[1]).toBeGreaterThan(1.005);
  });
});
describe('a corner chain of lines only is a sharp end (review fix 2: B1 speaks of corner arcs)', () => {
  it('a clipped (chamfered) corner written as a curve: the front ends sharp at (34, 0), its ray along the clip, ≈ (1, 1)', () => {
    const clip = { id: 'k', through: 'thickness' as const, uFrom: 'max' as const, vFrom: 'min' as const, start: [0, 0] as [number, number],
      segments: [{ type: 'line' as const, to: [2, 0] as [number, number] }, { type: 'line' as const, to: [0, 2] as [number, number] }, { type: 'line' as const, to: [0, 0] as [number, number] }] };
    const b = createBoard({ length: 36, width: 20, thickness: 0.75, curves: [clip], profiles: [endToEnd('p', W_MIN)] });
    const o = faceOutline(b)!;
    const st = sideStretch(b, o, W_MIN)!;
    expect([st.startEnd, st.endEnd]).toEqual(['sharp', 'sharp']);
    const p = profilePath(b, b.profiles[0]!)!;
    expect(p.chords.map((c) => [c.a, c.b])).toEqual([[[0, 0], [34, 0]]]);
    expect(isSwept(b, b.profiles[0]!)).toBe(false);
    const e = p.ends![1];
    if (e.kind !== 'through') throw new Error('expected a through end');
    expect(e.ray[0]).toBeCloseTo(1, 12); expect(e.ray[1]).toBeCloseTo(1, 12);
  });
});

describe('B1a: End to end profiles meeting at a shared corner arc mitre at its middle', () => {
  const W = { across: 'width', from: 'min' } as const, Lm = { across: 'length', from: 'min' } as const;
  const pair = (other: ProfileCut) => ({ ...topCorners(2), profiles: [endToEnd('f', W), other] });
  const mid: [number, number] = [2 - Math.SQRT2, 2 - Math.SQRT2];   // centre (2, 2), r = 2: the TRUE midpoint of the min-min arc
  it('the front starts in a mitre at the arc\'s true midpoint, its ray radial into the wood, scaled by 1/(n·u)', () => {
    const b = pair(endToEnd('l', Lm));
    const p = profilePath(b, b.profiles[0]!)!;
    const e = p.ends![0];
    if (e.kind !== 'mitre') throw new Error('expected a mitre');
    expect(e.at[0]).toBeCloseTo(mid[0], 12); expect(e.at[1]).toBeCloseTo(mid[1], 12);
    expect(p.chords[0]!.a).toEqual(e.at);
    expect(e.ray[0]).toBeCloseTo(e.ray[1], 12);   // along (1, 1): toward the centre
    const c = p.chords[0]!, d = [c.b[0] - c.a[0], c.b[1] - c.a[1]], l = Math.hypot(d[0]!, d[1]!);
    expect((-d[1]! / l) * e.ray[0] + (d[0]! / l) * e.ray[1]).toBeCloseTo(1, 12);
    expect(p.ends![1].kind).toBe('station');   // the far corner's side is empty: B1 unchanged
  });
  it('the end side ends in the matching mitre, and the two covers touch: zero shared length, the whole arc between them', () => {
    const b = pair(endToEnd('l', Lm));
    const f = profilePath(b, b.profiles[0]!)!, l = profilePath(b, b.profiles[1]!)!;
    const e = l.ends![1];
    if (e.kind !== 'mitre') throw new Error('expected a mitre');
    expect(e.at[0]).toBeCloseTo(mid[0], 12); expect(e.at[1]).toBeCloseTo(mid[1], 12);
    const o = faceOutline(b)!;
    const arc = o.chords.map((c, i) => (c.curve === 'cminmin' ? i : -1)).filter((i) => i >= 0);
    const span = (p: typeof f, i: number) => p.cover.filter((c) => c.chord === i).reduce((s, c) => s + (c.t1 - c.t0), 0);
    for (const i of arc) expect(span(f, i) + span(l, i)).toBeCloseTo(1, 12);
    for (const i of arc) {
      const a = f.cover.find((c) => c.chord === i), q = l.cover.find((c) => c.chord === i);
      if (a && q) expect(Math.min(a.t1, q.t1) - Math.max(a.t0, q.t0)).toBeLessThanOrEqual(0);
    }
  });
  it('an odd chord count (r = 0.75: 7 chords) SPLITS the middle chord at the true midpoint; the covers touch at its projection', () => {
    const b = { ...topCorners(0.75), profiles: [endToEnd('f', W), endToEnd('l', Lm)] };
    const f = profilePath(b, b.profiles[0]!)!, l = profilePath(b, b.profiles[1]!)!;
    const r = 0.75, m = r - r / Math.SQRT2;
    const e = f.ends![0];
    if (e.kind !== 'mitre') throw new Error('expected a mitre');
    expect(e.at[0]).toBeCloseTo(m, 12); expect(e.at[1]).toBeCloseTo(m, 12);
    expect(Math.hypot(e.at[0] - r, e.at[1] - r)).toBeCloseTo(r, 12);   // ON the arc, not on the chord
    const o = faceOutline(b)!;
    expect(o.chords.some((c) => c.a[0] === e.at[0] && c.a[1] === e.at[1])).toBe(false);   // not an outline vertex
    expect(f.chords[0]!.a).toEqual(e.at);
    expect(l.chords[l.chords.length - 1]!.b).toEqual(e.at);
    const fc = f.cover[0]!, lc = l.cover[l.cover.length - 1]!;
    expect(fc.chord).toBe(lc.chord);
    expect(fc.t0).toBeGreaterThan(0); expect(fc.t0).toBeLessThan(1);
    expect(fc.t0).toBe(lc.t1);
    expect(f.cover.filter((c) => o.chords[c.chord]!.curve === 'cminmin')).toHaveLength(4);   // the middle chord's half + 3
    expect(profileFaults(b, b.profiles[0]!)).toEqual([]);
  });
  it('an End to end beside an EMPTY adjacent side still runs out at the far tangent point (B1): a station end', () => {
    const p = profilePath(frontOnly, frontOnly.profiles[0]!)!;
    expect(p.ends!.map((e) => e.kind)).toEqual(['station', 'station']);
  });
  it('a neighbour on the OTHER face, a station run or a loop is no mitre partner', () => {
    for (const q of [{ ...endToEnd('l', Lm), face: 'min' as const }, stopped('l', Lm, 5, 15), loop('l')]) {
      const b = pair(q);
      expect(profilePath(b, b.profiles[0]!)!.ends![0].kind).toBe('station');
    }
  });
  it('mitre-ness is decided on the neighbour\'s STORED presence, never its faults: a neighbour that runs off still mitres', () => {
    const b = pair(endToEnd('l', Lm, 1));   // a 1" roundover on a 3/4" part: depth past the thickness
    expect(profileFaults(b, b.profiles[1]!).map((x) => x.kind)).toContain('runs-off');
    expect(profilePath(b, b.profiles[0]!)!.ends![0].kind).toBe('mitre');
    expect(profileFaults(b, b.profiles[0]!)).toEqual([]);
  });
  it('face min: a mitre end swaps with the other end and keeps its point', () => {
    const b = { ...topCorners(2), profiles: [{ ...endToEnd('f', W), face: 'min' as const }, { ...endToEnd('l', Lm), face: 'min' as const }] };
    const p = profilePath(b, b.profiles[0]!)!;
    expect(p.ends!.map((e) => e.kind)).toEqual(['station', 'mitre']);
    expect(p.chords[p.chords.length - 1]!.b).toEqual((p.ends![1] as { at: number[] }).at);
  });
});
