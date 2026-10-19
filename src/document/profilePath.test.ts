import { describe, expect, it } from 'vitest';
import { faceOutline, isSwept, profilePath, sideStretch, builtPath, judgedPath, stationPoint, stopZone, throughConsistent, type PathEnd, type StationPoint } from './profilePath';
import { apronArch, topCorners, frontOnly, notchEdge, endToEnd, loop, stopped, straightTopLong, plainLoop, stopOnCorner, stopOnArch, frontAndEnds, twoSideSharp, chiralTwoSide, bowFront, twoSide } from './sweepFixtures';
import { createBoard } from './document';
import { archCurve, bowCurve, cornerCurve, curveOutline, twiceArea, CURVE_TOLERANCE } from './curves';
import { migrateDocument, createDocument } from './document';
import type { Board, ProfileCut, ProfileEnd, ProfileSide } from './types';
import { mirrorProfile, profileFaults, reachDepth } from './profiles';
import { mirrorPart } from './frames';
import { pathSkeleton, planChain } from './skeleton';
import type { P2 } from './curves';

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
  it('a station run whose path turns is swept (b2); on one straight chord it is not', () => {
    expect(isSwept(apronArch, stopped('q', { across: 'width', from: 'min' }, 0.5, 2.5))).toBe(false);   // before the arch
    expect(isSwept(stopOnArch, stopOnArch.profiles[0]!)).toBe(true);
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
  it('a station run and ends on two sides have paths (b2)', () => {
    expect(profilePath(apronArch, stopped('q', W_MIN, 5, 25))).not.toBeNull();
    const two = { ...endToEnd('t', W_MIN), run: { start: { side: W_MIN, through: 'min' as const }, end: { side: { across: 'length' as const, from: 'max' as const }, through: 'max' as const } } };
    expect(throughConsistent(two)).toBe(true);   // Q17: enters the front at its min end, leaves the length max end at its max
    const path = profilePath(apronArch, two)!;
    const o = faceOutline(apronArch)!;
    // along the front (its arch included) and up the length max end
    const front = sideStretch(apronArch, o, W_MIN)!, end = sideStretch(apronArch, o, { across: 'length', from: 'max' })!;
    const want = [front.from, front.to, end.from, end.to];
    expect(path.cover.map((c) => c.chord)).toEqual(Array.from({ length: want[3]! - want[0]! + 1 }, (_, i) => want[0]! + i));
    expect(path.cover.every((c) => c.t0 === 0 && c.t1 === 1)).toBe(true);
    expect(path.chords[path.chords.length - 1]!.b).toEqual([30, 5]);
    expect(path.ends!.map((e) => e.kind)).toEqual(['through', 'through']);
    expect(isSwept(apronArch, two)).toBe(true);
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

describe('b2: stops and two-side paths', () => {
  const W_MIN = { across: 'width', from: 'min' } as const, L_MIN = { across: 'length', from: 'min' } as const, L_MAX = { across: 'length', from: 'max' } as const;
  it('stationPoint: a station on a corner arc is the model chord point at its run coordinate (B2)', () => {
    const b = stopOnCorner(), o = faceOutline(b)!;
    const sp = stationPoint(b, o, W_MIN, 1.1)!;
    expect(o.chords[sp.chord]!.curve).toBe('cminmin');
    expect(Math.abs(sp.at[0] - 1.1)).toBeLessThanOrEqual(1e-12);
    expect(sp.t).toBeGreaterThan(0); expect(sp.t).toBeLessThan(1);
    expect(stationPoint(b, o, W_MIN, 0)).not.toBeNull();                  // the far tangent point is ON the stretch
    expect(stationPoint(b, o, W_MIN, -0.1)).toBeNull();
    expect(stationPoint(b, o, W_MIN, 36.1)).toBeNull();
  });
  it('a stop path starts mid-chord on the arc and ends on the front; both ends are stops on their own chords (Q11, Q12)', () => {
    const b = stopOnCorner(), path = profilePath(b, b.profiles[0]!)!, o = faceOutline(b)!;
    const [s, e] = path.ends!;
    if (s.kind !== 'stop' || e.kind !== 'stop') throw new Error('expected stops');
    const c0 = o.chords[path.cover[0]!.chord]!, cl = o.chords[path.cover[path.cover.length - 1]!.chord]!;
    expect(c0.curve).toBe('cminmin'); expect(cl.curve).toBeUndefined();
    const u = (c: { a: readonly number[]; b: readonly number[] }) => { const l = Math.hypot(c.b[0]! - c.a[0]!, c.b[1]! - c.a[1]!); return [(c.b[0]! - c.a[0]!) / l, (c.b[1]! - c.a[1]!) / l]; };
    expect(s.tangent[0]).toBeCloseTo(-u(c0)[0]!, 12); expect(s.tangent[1]).toBeCloseTo(-u(c0)[1]!, 12);
    expect(e.tangent).toEqual([1, 0]); expect(e.normal).toEqual([0, 1]);
    expect(e.at[0]).toBeCloseTo(30, 12);
  });
  it('a station exactly on a chord vertex belongs to the run-side chord (Q11)', () => {
    const b = stopOnCorner(), o = faceOutline(b)!;
    const arc = o.chords.map((c, i) => ({ c, i })).filter(({ c }) => c.curve === 'cminmin');
    const v = arc[6]!;   // the 45° vertex of the 12-chord arc
    const at = v.c.a[0]!;
    const q = { ...b.profiles[0]!, run: { ...(b.profiles[0]!.run as { start: ProfileEnd; end: ProfileEnd }), start: { side: W_MIN, from: 'min' as const, at } } };
    expect(profilePath(b, q)!.cover[0]).toEqual({ chord: v.i, t0: 0, t1: 1 });
  });
  it('a one-side stop stored REVERSED (a mirrored copy, edited: fu 392(5)) walks as its canonical form, never round the outline', () => {
    const b = stopOnCorner(), p = b.profiles[0]!, run = p.run as { start: ProfileEnd; end: ProfileEnd };
    const rev = { ...p, run: { start: run.end, end: run.start } };
    const r = { ...b, profiles: [rev] };
    expect(profilePath(r, rev)).toEqual(profilePath(b, p));
    expect(builtPath(r, rev)).toEqual(builtPath(b, p));
    expect(isSwept(r, rev)).toBe(isSwept(b, p));
    // and a reversed half-stopped run keeps its through end (throughConsistent reads the canonical order)
    const half = { ...p, run: { start: { side: W_MIN, from: 'min' as const, at: 20 }, end: { side: { ...W_MIN }, through: 'min' as const } } };
    expect(profilePath({ ...b, profiles: [half] }, half)!.ends![0]!.kind).toBe('station');
  });
  it('two sides: the length min end at 4 round the front to the length max end at 4 (B3), every corner chord covered once', () => {
    const b = frontAndEnds(), path = profilePath(b, b.profiles[0]!)!, o = faceOutline(b)!;
    expect(path.loop).toBe(false);
    expect(path.ends!.map((e) => e.kind)).toEqual(['stop', 'stop']);
    const ids = path.cover.map((c) => o.chords[c.chord]!.curve ?? '-');
    expect(ids.filter((x) => x === 'cminmin')).toHaveLength(12);
    expect(ids.filter((x) => x === 'cmaxmin')).toHaveLength(12);
    expect(ids.filter((x) => x === 'cmaxmax' || x === 'cminmax')).toHaveLength(0);   // the back is left plain
    expect(new Set(path.cover.map((c) => c.chord)).size).toBe(path.cover.length);
    const [s, e] = path.ends! as [Extract<PathEnd, { kind: 'stop' }>, Extract<PathEnd, { kind: 'stop' }>];
    expect(s.at).toEqual([0, 4]); expect(e.at).toEqual([36, 4]);
    expect(s.side).toEqual(L_MIN); expect(e.side).toEqual(L_MAX);
  });
  it('face min: the same stored run is the plan path reversed, its ends swapped (§3.1)', () => {
    const b = frontAndEnds(), p = { ...b.profiles[0]!, face: 'min' as const };
    // On the bottom, CCW from below from the length min end goes round the BACK to the length max end.
    const ids = profilePath(b, p)!.cover.map((c) => faceOutline(b)!.chords[c.chord]!.curve ?? '-');
    expect(ids.filter((x) => x === 'cminmax' || x === 'cmaxmax')).toHaveLength(24);
    expect(ids.filter((x) => x === 'cminmin' || x === 'cmaxmin')).toHaveLength(0);
  });
  it('a through end in a stopped run carries round its corner arc to the far tangent point as End to end (Q17, B1)', () => {
    const b = topCorners(2, { ...endToEnd('p1', W_MIN), run: { start: { side: W_MIN, through: 'min' }, end: { side: { ...W_MIN }, from: 'min', at: 20 } } });
    const path = profilePath(b, b.profiles[0]!)!;
    expect(path.ends![0]).toEqual({ kind: 'station', at: [0, 2], tangent: [0, 1], side: L_MIN });
    expect(path.ends![1]!.kind).toBe('stop');
    // built: B1's ε along the length min end, as frontOnly's
    expect((builtPath(b, b.profiles[0]!)!.ends![0] as { at: P2 }).at[1]).toBeCloseTo(2 + 2 * 0.25 * Math.tan(Math.PI / 96), 12);
  });
  it('an inconsistent through end (the side\'s LEAVING end as a Start) has no path (Q17)', () => {
    const p = { ...endToEnd('p1', W_MIN), run: { start: { side: W_MIN, through: 'max' as const }, end: { side: L_MAX, from: 'min' as const, at: 4 } } };
    expect(throughConsistent(p)).toBe(false);
    expect(profilePath(topCorners(2, p), p)).toBeNull();
  });
  it('the end-chord zone: the typed stop is the fault path\'s, the BUILT one sits at the vertex (Q13)', () => {
    const b0 = stopOnCorner(), o = faceOutline(b0)!;
    const arc = o.chords.map((c, i) => ({ c, i })).filter(({ c }) => c.curve === 'cminmin');
    const prev = arc[5]!, v = arc[6]!;
    const sp0: StationPoint = { chord: prev.i, t: 0, at: prev.c.a };
    const limit = stopZone(o, sp0, true, 0.25);
    expect(limit).toBeCloseTo(0.25 * Math.tan(Math.PI / 48), 12);   // 12 chords: the turn is π/24
    const l = Math.hypot(prev.c.b[0] - prev.c.a[0], prev.c.b[1] - prev.c.a[1]);
    const t = 1 - (0.5 * limit) / l;
    const x = prev.c.a[0] + t * (prev.c.b[0] - prev.c.a[0]);
    const p = { ...b0.profiles[0]!, run: { start: { side: W_MIN, from: 'min' as const, at: x }, end: { side: { ...W_MIN }, from: 'min' as const, at: 30 } } };
    const b = { ...b0, profiles: [p] };
    expect(profilePath(b, p)!.cover[0]!.chord).toBe(prev.i);
    expect(builtPath(b, p)!.cover[0]).toEqual({ chord: v.i, t0: 0, t1: 1 });
    expect(judgedPath(b, p)!.cover[0]).toEqual({ chord: v.i, t0: 0, t1: 1 });
    expect(judgedPath(frontOnly, frontOnly.profiles[0]!)).toEqual(profilePath(frontOnly, frontOnly.profiles[0]!));   // never ε
  });
  it('B1a widened (Q18): a stop\'s through end at a corner arc mitres with an End to end neighbour; a stop in the middle does not', () => {
    const half = { ...endToEnd('a', W_MIN), run: { start: { side: W_MIN, through: 'min' as const }, end: { side: { ...W_MIN }, from: 'min' as const, at: 20 } } };
    const b = createBoard({ ...topCorners(2), profiles: [half, endToEnd('l', L_MIN)] });
    expect(profilePath(b, b.profiles[0]!)!.ends![0]!.kind).toBe('mitre');
    expect(profilePath(b, b.profiles[1]!)!.ends![1]!.kind).toBe('mitre');
    const mid = createBoard({ ...topCorners(2), profiles: [stopOnCorner().profiles[0]!, endToEnd('l', L_MIN)] });
    expect(profilePath(mid, mid.profiles[1]!)!.ends!.map((e) => e.kind)).toEqual(['station', 'station']);
  });
  it('Q9: a stop whose path is one straight chord is straight; one on a curve, round a corner or on two sides is swept', () => {
    expect(isSwept(apronArch, stopped('q', W_MIN, 0.5, 2.5))).toBe(false);   // before the arch
    expect(isSwept(stopOnArch, stopOnArch.profiles[0]!)).toBe(true);
    expect(isSwept(stopOnCorner(), stopOnCorner().profiles[0]!)).toBe(true);
    expect(isSwept(topCorners(2), stopped('q', W_MIN, 3, 33))).toBe(false);   // the front's straight stretch only
    expect(isSwept(frontAndEnds(), frontAndEnds().profiles[0]!)).toBe(true);
    expect(isSwept(twoSideSharp, twoSideSharp.profiles[0]!)).toBe(true);
  });
  it('throughConsistent: a one-side run is consistent in either stored order; a two-side Stop through where travel ENTERS is not (Q17)', () => {
    const half = { ...endToEnd('h', W_MIN), run: { start: { side: W_MIN, from: 'min' as const, at: 20 }, end: { side: { ...W_MIN }, through: 'min' as const } } };
    expect(throughConsistent(half)).toBe(true);   // stored reversed: its canonical order puts the through end first
    const bad = { ...endToEnd('b', W_MIN), run: { start: { side: W_MIN, from: 'min' as const, at: 20 }, end: { side: L_MAX, through: 'min' as const } } };
    expect(throughConsistent(bad)).toBe(false);   // travel leaves the length max end at its MAX
    expect(throughConsistent({ ...bad, run: { ...bad.run, end: { side: L_MAX, through: 'max' as const } } })).toBe(true);
    // face min: travel (seen from below) runs the front toward its length MIN end, so a Start through on the front enters
    // at its MAX end (in plan order the stored Start is the walk's END, leaving the plan-CCW front at u = L)
    const onMin = { ...endToEnd('m', L_MAX), face: 'min' as const, run: { start: { side: W_MIN, through: 'max' as const }, end: { side: L_MAX, from: 'min' as const, at: 3 } } };
    expect(throughConsistent(onMin)).toBe(true);
    expect(throughConsistent({ ...onMin, run: { ...onMin.run, start: { side: W_MIN, through: 'min' as const } } })).toBe(false);
  });
  it('the zone snaps only to a vertex strictly inside the walk: a short stop wholly inside one chord\'s end zone keeps its typed ends (Q13; review I2)', () => {
    const b0 = stopOnCorner(), o = faceOutline(b0)!;
    const prev = o.chords.map((c, i) => ({ c, i })).filter(({ c }) => c.curve === 'cminmin')[5]!;
    const limit = stopZone(o, { chord: prev.i, t: 0, at: prev.c.a }, true, 0.25);
    const l = Math.hypot(prev.c.b[0] - prev.c.a[0], prev.c.b[1] - prev.c.a[1]);
    const x = (k: number) => prev.c.a[0] + (1 - (k * limit) / l) * (prev.c.b[0] - prev.c.a[0]);
    const p = { ...b0.profiles[0]!, run: { start: { side: W_MIN, from: 'min' as const, at: x(0.5) }, end: { side: { ...W_MIN }, from: 'min' as const, at: x(0.25) } } };
    const b = { ...b0, profiles: [p] };
    const typed = profilePath(b, p)!;
    expect(typed.cover).toHaveLength(1);   // one piece of one chord: no path vertex to swallow
    expect(builtPath(b, p)).toEqual(typed);
    expect(judgedPath(b, p)).toEqual(typed);
  });
  it('bowFront 29.8 → 29.95 (the Bow preset, review I2): both ends in the bow-to-end corner\'s zone, yet it builds as typed', () => {
    const p = stopped('p1', W_MIN, 29.8, 29.95), b = { ...bowFront, profiles: [p] }, o = faceOutline(b)!;
    const typed = profilePath(b, p)!;
    expect(typed.cover).toHaveLength(1);
    expect(o.chords[typed.cover[0]!.chord]!.curve).toBe('c1');
    const sp = stationPoint(b, o, W_MIN, 29.95)!;
    expect((1 - sp.t) * Math.hypot(o.chords[sp.chord]!.b[0] - o.chords[sp.chord]!.a[0], o.chords[sp.chord]!.b[1] - o.chords[sp.chord]!.a[1]))
      .toBeLessThan(stopZone(o, sp, true, 0.25));   // inside the zone: before the fix the snap crossed the ends
    expect(builtPath(b, p)).toEqual(typed);
    expect(judgedPath(b, p)).toEqual(typed);
    const chain = planChain(b, builtPath(b, p)!, 'max')!;
    expect(pathSkeleton(chain.chords, chain.loop, reachDepth(p)[0], chain.rays)).not.toBeNull();   // the band exists
  });
  it('a two-side stop straddling a vertex the path passes, both ends in its zone: typed path, no built or judged path (Q13; Task 3: too-tight)', () => {
    const p = twoSide('p1', W_MIN, 29.85, L_MAX, 0.15), b = createBoard({ length: 30, width: 10, thickness: 0.75, profiles: [p] });
    expect(profilePath(b, p)!.cover).toHaveLength(2);
    expect(builtPath(b, p)).toBeNull();
    expect(judgedPath(b, p)).toBeNull();
  });
  it('stopZone: zero at a concave vertex (an arch: nothing to swallow), reach·tan(φ/2) at a convex one, from either end', () => {
    const o = faceOutline(stopOnArch)!;
    const arch = o.chords.map((c, i) => ({ c, i })).filter(({ c }) => c.curve === 'c1');
    const k = arch[4]!.i;
    expect(stopZone(o, { chord: k, t: 0.5, at: o.chords[k]!.a }, true, 0.25)).toBe(0);
    expect(stopZone(o, { chord: k, t: 0.5, at: o.chords[k]!.a }, false, 0.25)).toBe(0);
    const oc = faceOutline(stopOnCorner())!;
    const v = oc.chords.map((c, i) => ({ c, i })).filter(({ c }) => c.curve === 'cminmin')[6]!;
    expect(stopZone(oc, { chord: v.i, t: 0.5, at: v.c.a }, false, 0.25)).toBeCloseTo(0.25 * Math.tan(Math.PI / 48), 12);
  });
  it('B1a reads a neighbour\'s through end in its canonical order (a half-stopped run stored reversed still mitres)', () => {
    const rev = { ...endToEnd('a', W_MIN), run: { start: { side: W_MIN, from: 'min' as const, at: 20 }, end: { side: { ...W_MIN }, through: 'min' as const } } };
    const b = createBoard({ ...topCorners(2), profiles: [rev, endToEnd('l', L_MIN)] });
    expect(profilePath(b, b.profiles[0]!)!.ends![0]!.kind).toBe('mitre');
    expect(profilePath(b, b.profiles[1]!)!.ends![1]!.kind).toBe('mitre');
  });
  it('planChain: a stop clips across its own model chord, its ray that chord\'s inward normal; lo/hi by face (Q12)', () => {
    const b = stopOnCorner(), p = b.profiles[0]!, o = faceOutline(b)!;
    const path = builtPath(b, p)!, chain = planChain(b, path, 'max')!;
    expect(chain.stations).toHaveLength(2);
    const [s0, s1] = chain.stations;
    const src = o.chords[path.cover[0]!.chord]!, l = Math.hypot(src.b[0] - src.a[0], src.b[1] - src.a[1]);
    const u: P2 = [(src.b[0] - src.a[0]) / l, (src.b[1] - src.a[1]) / l];
    expect(s0!.tangent).toEqual((path.ends![0] as Extract<PathEnd, { kind: 'stop' }>).tangent);
    expect(s0!.stop).toEqual({ N: [-u[1], u[0]], end: 'lo' });
    expect(chain.rays![0]).toEqual([-u[1], u[0]]);
    expect(s0!.n[0] * s0!.at[0] + s0!.n[1] * s0!.at[1] + s0!.d).toBeCloseTo(0, 12);
    expect(s1!.stop).toEqual({ N: [0, 1], end: 'hi' });
    expect(chain.rays![1]).toEqual([0, 1]);
    expect(s1!.at[0]).toBeCloseTo(30, 12);
    // kept where n·x + d >= 0: the run side of each plane
    expect(s1!.n[0] * 29 + s1!.n[1] * 0 + s1!.d).toBeGreaterThan(0);
    const q = { ...p, face: 'min' as const };
    const mc = planChain(b, builtPath(b, q)!, 'min')!;
    expect(mc.stations.map((x) => x.stop!.end)).toEqual(['hi', 'lo']);   // plan start is the face-frame end 1
  });
  it('a stop on the arc chord holding a B1a mitre point keeps its own extent; past the mitre point it takes no mitre (review I1)', () => {
    // 3/4" corners: an odd chord count, so the arc's true midpoint lies INSIDE its middle chord.
    const mk = (start: ProfileEnd, end: ProfileEnd, nb: ProfileSide) =>
      createBoard({ ...topCorners(0.75), profiles: [{ ...endToEnd('a', W_MIN), run: { start, end } }, endToEnd('l', nb)] });
    const o = faceOutline(topCorners(0.75))!;
    const mid = (id: string) => { const arc = o.chords.map((c, i) => ({ c, i })).filter(({ c }) => c.curve === id); expect(arc.length % 2).toBe(1); return arc[(arc.length - 1) / 2]!; };
    const at = (c: { a: P2; b: P2 }, t: number) => c.a[0] + t * (c.b[0] - c.a[0]);
    // The END corner (cmaxmin) beside an End to end on the length max end: Start on its middle chord.
    const k = mid('cmaxmin');
    const before = mk({ side: W_MIN, from: 'min', at: at(k.c, 0.25) }, { side: { ...W_MIN }, through: 'max' }, L_MAX);
    const pb = profilePath(before, before.profiles[0]!)!;
    expect(pb.cover).toHaveLength(1);
    expect(pb.cover[0]!.chord).toBe(k.i);
    expect(pb.cover[0]!.t0).toBeCloseTo(0.25, 12); expect(pb.cover[0]!.t1).toBeCloseTo(0.5, 9);
    expect(pb.ends![0]!.kind).toBe('stop'); expect(pb.ends![1]!.kind).toBe('mitre');
    expect((pb.ends![0] as { at: P2 }).at).toEqual(pb.chords[0]!.a);   // the end and the path agree
    expect(pb.chords[0]!.a[0]).toBeCloseTo(at(k.c, 0.25), 12);
    const past = mk({ side: W_MIN, from: 'min', at: at(k.c, 0.75) }, { side: { ...W_MIN }, through: 'max' }, L_MAX);
    const pp = profilePath(past, past.profiles[0]!)!;
    expect(pp.cover[0]).toEqual({ chord: k.i, t0: pp.cover[0]!.t0, t1: 1 });
    expect(pp.cover[0]!.t0).toBeCloseTo(0.75, 12);
    expect(pp.ends!.map((e) => e.kind)).toEqual(['stop', 'station']);   // no mitre: the run starts past the mitre point
    expect(profileFaults(past, past.profiles[0]!)).toContainEqual({ kind: 'overlap', other: 'l' });
    // The START corner (cminmin) beside an End to end on the length min end: Stop on its middle chord.
    const j = mid('cminmin');
    const after = mk({ side: W_MIN, through: 'min' }, { side: { ...W_MIN }, from: 'min', at: at(j.c, 0.75) }, L_MIN);
    const pa = profilePath(after, after.profiles[0]!)!;
    expect(pa.cover).toHaveLength(1);
    expect(pa.cover[0]!.t0).toBeCloseTo(0.5, 9); expect(pa.cover[0]!.t1).toBeCloseTo(0.75, 12);
    expect(pa.ends!.map((e) => e.kind)).toEqual(['mitre', 'stop']);
    expect((pa.ends![1] as { at: P2 }).at).toEqual(pa.chords[0]!.b);
    const short = mk({ side: W_MIN, through: 'min' }, { side: { ...W_MIN }, from: 'min', at: at(j.c, 0.25) }, L_MIN);
    const ps = profilePath(short, short.profiles[0]!)!;
    expect(ps.ends!.map((e) => e.kind)).toEqual(['station', 'stop']);   // the run stops before the mitre point
    expect(ps.cover[ps.cover.length - 1]!.t1).toBeCloseTo(0.25, 12);
  });
  it('a two-side walk never comes back onto a side it left (Q16, review M-d): Start after Stop on a shared corner arc is no path', () => {
    const p = twoSide('p1', L_MIN, 1, W_MIN, 0.1), b = topCorners(2, p), o = faceOutline(b)!;
    const a = stationPoint(b, o, L_MIN, 1)!, z = stationPoint(b, o, W_MIN, 0.1)!;
    expect([o.chords[a.chord]!.curve, o.chords[z.chord]!.curve]).toEqual(['cminmin', 'cminmin']);   // both on the shared arc
    expect(profilePath(b, p)).toBeNull();
    // seen from below the same ends make a hop on the arc that the sides' order reads as the long way round: CROSSED (the b2
    // final review's I1, the controller's ruling), no path either (was a path before that ruling)
    expect(profilePath(b, { ...p, face: 'min' })).toBeNull();
    // its mirror image on the other face reads the same: Stop's side ahead of Start's
    const q = twoSide('q', W_MIN, 0.1, L_MIN, 1), qb = topCorners(2, q);
    expect(profilePath(qb, { ...q, face: 'min' })).toBeNull();
    expect(profilePath(qb, q)).toBeNull();   // crossed (I1): was a hop on cminmin before that ruling
    // each half of the rule alone: the walk comes back onto Start's side ahead (its shared arc), or onto Stop's behind
    expect(profilePath(b, twoSide('f', W_MIN, 10, L_MIN, 1))).toBeNull();    // ends on cminmin, which the front's stretch holds
    expect(profilePath(b, twoSide('g', W_MIN, 0.1, L_MIN, 10))).toBeNull();   // starts on cminmin, which the end's stretch holds
    // two sides between Start and Stop (Q21's `<side> and <side>`) never re-enter either: allowed
    expect(profilePath(b, twoSide('h', W_MIN, 10, L_MIN, 10))).not.toBeNull();
    // three sides are fine: the front at 10, round the length max end, to the back at 20
    expect(profilePath(twoSideSharp, twoSide('t', W_MIN, 10, { across: 'width', from: 'max' }, 20))).not.toBeNull();
  });
  it('a two-side Stop at its stretch\'s FIRST vertex ends on the run-side chord (Q11, review M-a)', () => {
    const p = twoSide('p1', W_MIN, 20, L_MAX, 0), b = createBoard({ length: 30, width: 10, thickness: 0.75, profiles: [p] });
    const path = profilePath(b, p)!;
    expect(path.cover).toHaveLength(1);
    expect(path.chords[0]!.b).toEqual([30, 0]);
    expect(path.ends![1]).toEqual({ kind: 'stop', at: [30, 0], tangent: [1, 0], normal: [0, 1], side: L_MAX });
  });
  it('two ends at one point have no path (Q16, review M-b)', () => {
    const plain = createBoard({ length: 30, width: 10, thickness: 0.75 });
    const one = stopped('p1', W_MIN, 10, 10);
    expect(profilePath({ ...plain, profiles: [one] }, one)).toBeNull();
    const two = twoSide('p2', W_MIN, 30, L_MAX, 0);   // the front's end and the length max end's start: the corner (30, 0)
    expect(profilePath({ ...plain, profiles: [two] }, two)).toBeNull();
  });
  it('mirroring a two-side run (Q20, inv 44): the mirrored part\'s path is the mirror image of the original\'s', () => {
    const b = chiralTwoSide('flat');
    const m = mirrorPart(b);   // along length
    const P = (x: Board) => profilePath(x, x.profiles[0]!)!.chords.flatMap((c) => [c.a, c.b]);
    const mirrored = P(b).map(([u, v]) => [b.length - u!, v!]);
    const mp = P(m);
    for (const q of mirrored) expect(mp.some((r) => Math.hypot(r[0]! - q[0]!, r[1]! - q[1]!) <= 1e-9)).toBe(true);
    const t = { ...b, profiles: [mirrorProfile(b.profiles[0]!, 'thickness')] };
    expect(new Set(P(t).map((q) => q.join()))).toEqual(new Set(P(b).map((q) => q.join())));   // the same plan stretch
  });
});
