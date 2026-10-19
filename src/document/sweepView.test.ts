import { describe, expect, it } from 'vitest';
import { createBoard, createDocument, partGeometry, boardEdges, boardBodies, geometryKey } from './document';
import { curvedEdges } from './bodies';
import { fallbackCause, geometryBoard, profileAsCurve, profileFaults, runsStraight, shapedPart, stopFallsBack, sweptProfiles, viewProfileFaults } from './profiles';
import { builtSwept, sweptPieces } from './sweep';
import { archCurve, bowCurve, cornerCurve, spanOf } from './curves';
import { apronArch, endToEnd, frontOnly, loop, notchEdge, plainLoop, straightTopLong, stopped, topCorners, twoSide, frontAndEnds, twoSideSharp } from './sweepFixtures';
import { curveDrawEdges, curveEdgeLifts, curveSilhouettes, silhouetteLines } from './curveDrawing';
import { curveLineEntries, curveLines, profileFaultNote, profileFaultText, runsStraightNote, RUNS_STRAIGHT_NOTE } from './curveText';
import { boardSnapPoints } from './snapPoints';
import { pocketEdges, stockProbe } from './cuts';
import { buildDiagrams } from './diagram';
import { drawView, FRONT, SIDE, TOP, ISO } from './drawing';
import { partFeatures } from './featureKeys';
import { buildCutList } from './cutlist';
import { sectionCaps } from './section';
import { bodyMesh, boardUVSignature, drawsAsBox } from '../viewport/grainTiling';
import { boardHoles } from './holes';
import type { Board, ProfileCut, ProfileSide } from './types';

const UNITS = { display: 'imperial-fractional', precision: 16 } as const;

describe('the geometry view with swept profiles (profile runs b1, Q1/Q2)', () => {
  it('the view keeps straight profiles as view curves and swept ones in profiles (Q1)', () => {
    const b = { ...apronArch, profiles: [...apronArch.profiles, straightTopLong] };   // End to end on the uncut width-max side
    const v = geometryBoard(b);
    expect(v.profiles.map((p) => p.id)).toEqual(['p1']);
    expect(v.curves.map((c) => c.id)).toEqual(['c1', straightTopLong.id]);
    expect(geometryBoard(v)).toBe(v);                       // idempotent: memoised to itself
    expect(geometryBoard(b)).toBe(v);                       // memoised per stored part
  });
  it('a swept profile in the view is a copy of the stored one, in stored order (no object shared between parts)', () => {
    const b = topCorners(2, loop('a'));
    const two = { ...b, profiles: [loop('a'), loop('z', 0.375)] };
    const v = geometryBoard(two);
    expect(v.profiles).toEqual(two.profiles);
    expect(v.profiles[0]).not.toBe(two.profiles[0]);
    expect(sweptProfiles(v)).toBe(v.profiles);
  });
  it('a part with no swept profile builds profiles: [] exactly as a1/a2 did', () => {
    const b = createBoard({ length: 30, width: 10, thickness: 0.75, profiles: [straightTopLong] });
    const v = geometryBoard(b);
    expect(v.profiles).toEqual([]);
    expect(v.curves.map((c) => c.id)).toEqual(['s1']);
    expect(sweptProfiles(v)).toEqual([]);
    expect(sweptProfiles(createBoard({ length: 30, width: 10, thickness: 0.75 }))).toEqual([]);
  });
  it('shapedPart is true for a swept-only rectangle', () => {
    expect(shapedPart(geometryBoard(plainLoop))).toBe(true);
    expect(shapedPart(geometryBoard(createBoard({ length: 30, width: 10, thickness: 0.75, profiles: [straightTopLong] })))).toBe(true);
    expect(shapedPart(createBoard({ length: 30, width: 10, thickness: 0.75 }))).toBe(false);
  });
  it('geometryKey, boardUVSignature and the cut list signature change with a swept profile and its size', () => {
    const a = topCorners(2), b = topCorners(2, loop('p1', 0.375)), plain = createBoard({ length: 36, width: 20, thickness: 0.75, curves: topCorners(2).curves });
    for (const key of [geometryKey, boardUVSignature] as ((x: Board) => string)[]) {
      expect(key(a)).not.toBe(key(b)); expect(key(a)).not.toBe(key(plain));
      expect(key(plain)).toBe(key({ ...plain, profiles: [] }));            // a part with no swept profile: today's key
    }
    // two parts differing only in the swept profile's size are two cut-list rows
    expect(buildCutList({ ...createDocument(), boards: [{ ...a, id: 'x' }, { ...b, id: 'y' }] }).groups.flatMap((g) => g.rows).length).toBe(2);
    // ...and identical swept parts are one row (ids ignored)
    expect(buildCutList({ ...createDocument(), boards: [{ ...a, id: 'x' }, { ...topCorners(2, loop('other')), id: 'y' }] }).groups.flatMap((g) => g.rows).length).toBe(1);
  });
  it('a part with no swept profile keeps its key byte for byte: no swept section appended', () => {
    const straight = createBoard({ length: 30, width: 10, thickness: 0.75, profiles: [straightTopLong] });
    const asA1 = createBoard({ id: straight.id, length: 30, width: 10, thickness: 0.75, curves: [profileAsCurve(straightTopLong)] });   // chunk 1's stored form
    for (const key of [geometryKey, boardUVSignature] as ((x: Board) => string)[]) expect(key(straight)).toBe(key(asA1));
    const bare = createBoard({ length: 30, width: 10, thickness: 0.75 });
    expect(geometryKey(plainLoop).startsWith(`${geometryKey(bare)}|`)).toBe(true);
    expect(boardUVSignature({ ...plainLoop, id: bare.id }).startsWith(`${boardUVSignature(bare)}|`)).toBe(true);
  });
});

describe('the routing gate (Q1: shapedPart replaces every curves.length === 0 test)', () => {
  it('a swept-only rectangle routes its edges through curvedEdges, not the plain box\'s pocketEdges', () => {
    const pt = (v: readonly number[]) => ({ length: v[0]!, width: v[1]!, thickness: v[2]! });
    const viaCurved = curvedEdges(plainLoop, boardBodies(plainLoop)).map(([p, q]) => [pt(p), pt(q)]);
    expect(boardEdges(plainLoop)).toEqual(viaCurved);
    expect(boardEdges(plainLoop)).not.toEqual(pocketEdges(plainLoop));
  });
});

describe('every reader runs on a swept part without throwing (b1 Task 2: no swept bodies yet)', () => {
  const parts: [string, Board][] = [
    ['a loop on a plain rectangle', plainLoop],
    ['a loop round four 2" corners', topCorners(2)],
    ['End to end along an arched apron', apronArch],
    ['End to end round the notch', notchEdge],
    ['End to end round the front corners', frontOnly],
    ['a loop on face min', topCorners(0.5, loop('m', 0.25, 'roundover', 'min'))],
    ['a loop with a straight profile beside it', { ...plainLoop, profiles: [...plainLoop.profiles, endToEnd('e', { across: 'width', from: 'max' })] }],
  ];
  for (const [name, board] of parts) {
    it(name, () => {
      const v = geometryBoard(board);
      expect(shapedPart(v)).toBe(true);
      const g = partGeometry(board);
      expect(g.bodies.length).toBeGreaterThan(0);
      void g.edges;
      boardEdges(board); boardBodies(board);
      curveDrawEdges(board);
      for (const view of [FRONT, SIDE, TOP, ISO]) {
        silhouetteLines(board, view.toward); curveSilhouettes(board, view.toward); curveEdgeLifts(board, view.toward);
        drawView([board], view);
        drawView([board], view, undefined, { section: { axis: 'front', at: 5, flip: false } });
      }
      boardSnapPoints(board);
      const probe = stockProbe(board);
      probe({ length: 1, width: 1, thickness: 0.5 });
      buildDiagrams(board, UNITS);
      curveLineEntries(board, UNITS);
      partFeatures(board, UNITS);
      const holes = boardHoles(board);
      for (const body of g.bodies) {
        expect(drawsAsBox(board, body, holes)).toBe(false);   // the routing gate: a swept part is a shaped part
        bodyMesh(board, body, holes, g.bodies);
      }
      boardUVSignature(board);
      sectionCaps(board, { axis: 'front', at: 2, flip: false });
      buildCutList({ ...createDocument(), boards: [board] });
    });
  }
});

describe('swept profile fault words (one home: curveText, b1 Q6)', () => {
  it('the text and the row note for every kind', () => {
    expect(profileFaultText({ kind: 'runs-off' })).toBe('it runs off the part');
    expect(profileFaultText({ kind: 'too-tight' })).toBe('it is too tight for the curve');
    expect(profileFaultNote({ kind: 'runs-off' })).toBe('It runs off the part at this size.');
    expect(profileFaultNote({ kind: 'too-tight' })).toBe('Too tight for the curve at this size.');
    // a2's words, unchanged
    expect(profileFaultText({ kind: 'stop-off' })).toBe('a stop runs off the part');
    expect(profileFaultText({ kind: 'overlap', other: 'x' })).toBe('it overlaps another profile on this edge');
    expect(profileFaultNote({ kind: 'stop-off' })).toBe('A stop runs off the part at this size.');
    expect(profileFaultNote({ kind: 'overlap', other: 'x' })).toBe('Overlaps another profile on this edge.');
  });
});

describe('sweptProfiles is safe on a stored part (review minor 1)', () => {
  it('a stored part reads its view\'s swept profiles, never its straight ones', () => {
    const b = { ...apronArch, profiles: [...apronArch.profiles, straightTopLong] };
    expect(sweptProfiles(b).map((p) => p.id)).toEqual(['p1']);
    expect(sweptProfiles(b)).toBe(geometryBoard(b).profiles);
    expect(sweptProfiles(createBoard({ length: 30, width: 10, thickness: 0.75, profiles: [straightTopLong] }))).toEqual([]);
  });
});

describe('Q10 in the view (profile runs b2): a fallen-back stop is a2\'s view curve; a fitting one is swept', () => {
  const W_MIN: ProfileSide = { across: 'width', from: 'min' }, L_MIN: ProfileSide = { across: 'length', from: 'min' };
  const tightStop = topCorners(0.25, { ...stopped('s', W_MIN, 0.1, 30), size: 0.375 });
  const i2Pair = { ...topCorners(2), profiles: [stopped('a', W_MIN, 1, 30), endToEnd('b', L_MIN)] };
  it('the fallen-back stop\'s view curve carries its span and runsStraight; fallbackCause names the cause', () => {
    const v = geometryBoard(tightStop), c = v.curves.find((x) => x.id === 's')!;
    expect(v.profiles).toEqual([]);
    expect(spanOf(c)).toEqual({ lo: 0.1, hi: 30, stopLo: true, stopHi: true });
    expect(runsStraight(c)).toBe(true);
    expect(fallbackCause(c)).toBe('too-tight');
    const a = geometryBoard(i2Pair).curves.find((x) => x.id === 'a')!;
    expect(runsStraight(a)).toBe(true);
    expect(fallbackCause(a)).toBe('overlap');
  });
  it('a fitting stop is in view.profiles, not a curve, and has no fallback cause', () => {
    const fits = { ...apronArch, profiles: [stopped('a', W_MIN, 10, 20)] };
    const v = geometryBoard(fits);
    expect(v.profiles.map((p) => p.id)).toEqual(['a']);
    expect(v.curves.some((c) => c.id === 'a')).toBe(false);
    expect(fallbackCause(v.profiles[0]!)).toBeNull();
    expect(runsStraight(v.profiles[0]!)).toBe(false);
  });
  it('runsStraightNote words the note by cause (one home)', () => {
    expect(runsStraightNote('too-tight')).toBe(RUNS_STRAIGHT_NOTE);
    expect(RUNS_STRAIGHT_NOTE).toBe('Runs straight: too tight to follow the curve.');
    expect(runsStraightNote('overlap')).toBe('Runs straight: it would overlap another profile if it followed the curve.');
    expect(runsStraightNote('runs-off')).toBe('Runs straight: it would run off the part if it followed the curve.');
    expect(runsStraightNote('stop-off')).toBe('Runs straight: it would run off the part if it followed the curve.');
  });
});

describe('no silent empty build (the b2 Task 2 review, I2): a swept profile that builds nothing always has a fault', () => {
  const S: ProfileSide[] = [{ across: 'width', from: 'min' }, { across: 'length', from: 'max' }, { across: 'width', from: 'max' }, { across: 'length', from: 'min' }];
  const lineCorner = createBoard({ length: 30, width: 10, thickness: 0.75,
    curves: [{ id: 'k', through: 'thickness', uFrom: 'min', vFrom: 'min', start: [0, 0], segments: [{ type: 'line', to: [2, 0] }, { type: 'line', to: [0, 2] }, { type: 'line', to: [0, 0] }] }] });
  const parts: [string, Board][] = [
    ['2" corners', topCorners(2)], ['1/4" corners', topCorners(0.25)], ['arch', { ...apronArch, profiles: [] }], ['notch', { ...notchEdge, profiles: [] }],
    ['bow', createBoard({ length: 30, width: 5, thickness: 0.75, curves: [{ id: 'c1', ...bowCurve({ through: 'thickness', along: 'length', side: 'min', span: 30, rise: 0.5 }) }] })],
    ['plain', createBoard({ length: 30, width: 10, thickness: 0.75 })], ['line corner', lineCorner],
    ['corner + notch', createBoard({ length: 30, width: 5, thickness: 0.75, curves: [
      { id: 'k', ...cornerCurve({ through: 'thickness', uFrom: 'min', vFrom: 'min', radius: 2 }) },
      { id: 'n', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 14, span: 0.4, rise: 0.2 }) }] })],
  ];
  it.each(parts)('%s: every station run on a grid, one side and two, both faces', (_n, part) => {
    let swept = 0, empty = 0;
    for (const face of ['max', 'min'] as const) for (const [i, sA] of S.entries()) for (const sB of [S[i]!, S[(i + 1) % 4]!, S[(i + 2) % 4]!]) {
      const LA = part[sA.across === 'width' ? 'length' : 'width'], LB = part[sB.across === 'width' ? 'length' : 'width'];
      const at = (L: number) => [0.15, 1.1, 2.5, L / 2, L - 2.5, L - 1.1, L - 0.15];
      for (const a of at(LA)) for (const b of at(LB)) {
        if (sA === sB && b <= a) continue;
        const p: ProfileCut = { ...twoSide('t', sA, a, sB, b), face };
        const board = { ...part, profiles: [p] };
        const v = geometryBoard(board);
        for (const q of v.profiles) {
          swept += 1;
          if (sweptPieces(v, q).length > 0) continue;
          empty += 1;
          expect(viewProfileFaults(q), JSON.stringify({ face, run: p.run })).not.toEqual([]);
          expect(profileFaults(board, p).length).toBeGreaterThan(0);
        }
      }
    }
    expect(empty).toBeGreaterThan(0);
    expect(swept).toBeGreaterThan(empty);   // measured 2026-10-18: 4 to 219 of ~800 per part build nothing, each faulted
  });
  // Fix round 1 (the controller's ruling M6, with I1): bead and thumbnail, each facing, alone and beside an End to end on the
  // side before Start's (the corner the run enters), on a coarser grid; 29.7 → 27.9 on the bow is the reviewer's bead.
  const kinds: [string, Partial<ProfileCut>][] = [
    ['bead facing the face', { kind: 'bead', size: 0.25, fillet: 1 / 16, facing: 'face' }],
    ['bead facing the edge', { kind: 'bead', size: 0.25, fillet: 1 / 16, facing: 'edge' }],
    ['thumbnail facing the face', { kind: 'thumbnail', size: 0.375, depth: 0.25, fillet: undefined, facing: 'face' }],
    ['thumbnail facing the edge', { kind: 'thumbnail', size: 0.375, depth: 0.25, fillet: undefined, facing: 'edge' }],
  ];
  const cases = parts.flatMap(([n, part]) => kinds.flatMap(([k, over]) => [false, true].map((nb) => [`${n}, ${k}${nb ? ', beside an End to end' : ''}`, part, over, nb] as const)));
  it.each(cases)('%s', (_n, part, over, nb) => {
    let swept = 0;
    for (const face of ['max', 'min'] as const) for (const [i, sA] of S.entries()) for (const sB of [S[i]!, S[(i + 1) % 4]!, S[(i + 2) % 4]!]) {
      const LA = part[sA.across === 'width' ? 'length' : 'width'], LB = part[sB.across === 'width' ? 'length' : 'width'];
      const at = (L: number) => [0.3, L / 2, L - 2.1, L - 0.3];
      for (const a of at(LA)) for (const b of at(LB)) {
        if (sA === sB && b <= a) continue;
        const raw: ProfileCut = { ...twoSide('t', sA, a, sB, b), ...over, face };
        if (raw.fillet === undefined) delete (raw as { fillet?: number }).fillet;
        const profiles = nb ? [raw, { ...endToEnd('e', S[(i + 3) % 4]!), face }] : [raw];
        const board = { ...part, profiles };
        const v = geometryBoard(board);
        for (const q of v.profiles) {
          swept += 1;
          if (sweptPieces(v, q).length > 0) continue;
          expect(viewProfileFaults(q), JSON.stringify({ face, id: q.id, run: raw.run })).not.toEqual([]);
        }
      }
    }
    expect(swept).toBeGreaterThan(0);
  });
});

describe('M-e: every reader runs on a loaded two-side run without throwing (profile runs b2)', () => {
  it.each([['front and ends', frontAndEnds()], ['round a sharp corner', twoSideSharp]] as const)('%s', (_n, b) => {
    expect(geometryBoard(b).profiles.map((p) => p.id)).toEqual(['p1']);
    expect(() => partGeometry(b)).not.toThrow();
    expect(() => [FRONT, SIDE, TOP, ISO].map((v) => drawView([b], v))).not.toThrow();
    expect(() => curveLines(b, UNITS)).not.toThrow();
    expect(() => partFeatures(b, UNITS)).not.toThrow();
    expect(() => boardSnapPoints(b)).not.toThrow();
    expect(() => stockProbe(b)({ length: 1, width: 1, thickness: 0.7 })).not.toThrow();
    expect(() => buildDiagrams(b, UNITS)).not.toThrow();
    expect(() => buildCutList({ ...createDocument('T'), boards: [b] })).not.toThrow();
  });
});

describe('Q10 is order-independent (Task 3 fix round 1): every stored order of a set of saved stops decides alike', () => {
  const W_MIN: ProfileSide = { across: 'width', from: 'min' }, W_MAX: ProfileSide = { across: 'width', from: 'max' };
  const L_MIN: ProfileSide = { across: 'length', from: 'min' }, L_MAX: ProfileSide = { across: 'length', from: 'max' };
  const half = (id: string, s: ProfileSide, at: number, out: 'min' | 'max', first: boolean): ProfileCut => ({ ...endToEnd(id, s),
    run: first ? { start: { side: s, through: out }, end: { side: { ...s }, from: 'min', at } } : { start: { side: s, from: 'min', at }, end: { side: { ...s }, through: out } } });
  const notch = { id: 'n', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 14, span: 0.4, rise: 0.2 }) };
  const sets: [string, Board][] = [
    ['1/4" corners: an End to end and two half-stops at its corners', { ...topCorners(0.25), profiles: [endToEnd('b', L_MIN), half('a', W_MIN, 0.1, 'min', true), half('c', W_MAX, 0.1, 'min', false)] }],
    ['2" corners: four half-stops sharing the corner arcs pairwise', { ...topCorners(2), profiles: [half('f', W_MIN, 30, 'min', true), half('r', L_MAX, 16, 'min', true), half('k', W_MAX, 6, 'max', true), half('l', L_MIN, 16, 'min', false)] }],
    ['2" corners and a notch: a half-stop through the notch, an End to end, a stop on the arc', { ...topCorners(2), curves: [...topCorners(2).curves, notch], profiles: [half('q', W_MIN, 30, 'min', true), endToEnd('p', L_MIN), stopped('s', L_MAX, 1, 10)] }],
    ['two stops sharing a corner arc beside an End to end', { ...topCorners(2), curves: [...topCorners(2).curves, notch], profiles: [stopped('A', L_MIN, 0.5, 4), stopped('B', W_MIN, 0.5, 20), endToEnd('e', W_MAX)] }],
  ];
  const perms = <T,>(xs: T[]): T[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r) => [x, ...r])));
  it.each(sets)('%s', (_n, base) => {
    const summary = (b: Board) => {
      const v = geometryBoard(b), built = builtSwept(v).map((p) => p.id);
      const probe = stockProbe(b), wood: boolean[] = [];
      for (let i = 0; i <= 36; i++) for (let j = 0; j <= 20; j++) wood.push(probe({ length: i * b.length / 36, width: j * b.width / 20, thickness: b.thickness - 0.02 }));
      const per = Object.fromEntries([...b.profiles].sort((x, y) => (x.id < y.id ? -1 : 1)).map((p) => {
        const vc = v.profiles.find((x) => x.id === p.id) ?? v.curves.find((x) => x.id === p.id)!;
        return [p.id, { swept: v.profiles.some((x) => x.id === p.id), built: built.includes(p.id), straight: runsStraight(vc), cause: fallbackCause(vc),
          falls: stopFallsBack(b, p), view: viewProfileFaults(vc), stored: profileFaults(b, p) }];
      }));
      return { per, wood: wood.map((w) => (w ? 1 : 0)).join('') };
    };
    const first = summary(base);
    for (const order of perms(base.profiles)) expect(summary({ ...base, profiles: order })).toEqual(first);
  });
});
