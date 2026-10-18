import { describe, expect, it } from 'vitest';
import { createBoard, createDocument, partGeometry, boardEdges, boardBodies, geometryKey } from './document';
import { curvedEdges } from './bodies';
import { geometryBoard, profileAsCurve, shapedPart, sweptProfiles } from './profiles';
import { apronArch, endToEnd, frontOnly, loop, notchEdge, plainLoop, straightTopLong, topCorners } from './sweepFixtures';
import { curveDrawEdges, curveEdgeLifts, curveSilhouettes, silhouetteLines } from './curveDrawing';
import { curveLineEntries, profileFaultNote, profileFaultText } from './curveText';
import { boardSnapPoints } from './snapPoints';
import { pocketEdges, stockProbe } from './cuts';
import { buildDiagrams } from './diagram';
import { drawView, FRONT, SIDE, TOP, ISO } from './drawing';
import { partFeatures } from './featureKeys';
import { buildCutList } from './cutlist';
import { sectionCaps } from './section';
import { bodyMesh, boardUVSignature, drawsAsBox } from '../viewport/grainTiling';
import { boardHoles } from './holes';
import type { Board } from './types';

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
