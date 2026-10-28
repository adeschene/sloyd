import { describe, expect, it } from 'vitest';
import { alignDeltas, distributeDeltas, itemExtents, type AlignItem } from './align';
import { createBoard, createDocument, partBounds } from './document';
import type { Definition, Instance, SloydDocument } from './types';

const item = (id: string, min: number[], max: number[], name = id): AlignItem => ({ id, name, min, max });
const Z: [number, number, number] = [0, 0, 0];

describe('alignDeltas (align spec §3)', () => {
  const items = [item('a', [0, 0, 0], [2, 1, 1]), item('b', [5, 3, 4], [6, 4, 7]), item('c', [1.25, 0, 0], [1.5, 9, 1])];
  it('min X, centre Y, max Z, by hand; the anchor never moves', () => {
    expect(alignDeltas(items, 0, 'min')).toEqual([Z, [-5, 0, 0], [-1.25, 0, 0]]);
    expect(alignDeltas(items, 1, 'centre')).toEqual([Z, [0, -3, 0], [0, -4, 0]]);
    expect(alignDeltas(items, 2, 'max')).toEqual([Z, [0, 0, -6], Z]);
  });
  it('already aligned: every delta 0', () => {
    expect(alignDeltas([item('a', [0, 0, 0], [1, 1, 1]), item('b', [0, 5, 5], [3, 6, 6])], 0, 'min')).toEqual([Z, Z]);
  });
});

describe('distributeDeltas (align spec §4)', () => {
  const bottom = item('b', [0, 0, 0], [1, 0.75, 1], 'Bottom');
  const top = item('t', [0, 30, 0], [1, 30.75, 1], 'Top');
  const shelf = (id: string, y: number) => item(id, [0, y, 0], [1, y + 0.75, 1], id);
  it('five in a carcase: g = 6.75; shelves to 7.5, 15, 22.5; the outer two stay', () => {
    const d = distributeDeltas([bottom, shelf('s1', 3), shelf('s2', 4), shelf('s3', 20), top], 1);
    expect(d).toEqual([Z, [0, 4.5, 0], [0, 11, 0], [0, 2.5, 0], Z]);
  });
  it('the same deltas whatever the selection order (by item)', () => {
    const d = distributeDeltas([shelf('s3', 20), top, shelf('s1', 3), bottom, shelf('s2', 4)], 1) as number[][];
    expect(d).toEqual([[0, 2.5, 0], Z, [0, 4.5, 0], Z, [0, 11, 0]]);
  });
  it('ten 0.1 parts: equal gaps to 1e-12, the last placed from the first, not by a running sum', () => {
    const first = item('f', [0, 0, 0], [0.1, 1, 1]);
    const last = item('l', [1.7, 0, 0], [1.8, 1, 1]);
    const inner = Array.from({ length: 10 }, (_, i) => item(`i${i}`, [0.13 + i * 0.137, 0, 0], [0.23 + i * 0.137, 1, 1]));
    const all = [first, ...inner, last];
    const d = distributeDeltas(all, 0) as number[][];
    const g = (1.7 - 0.1 - 10 * 0.1) / 11;
    const moved = all.map((it, i) => ({ min: it.min[0]! + d[i]![0]!, max: it.max[0]! + d[i]![0]! }));
    for (let i = 1; i < moved.length; i += 1) expect(Math.abs(moved[i]!.min - moved[i - 1]!.max - g)).toBeLessThan(1e-12);
    expect(Math.abs(moved[11]!.min - moved[10]!.max - g)).toBeLessThan(1e-12);
    expect(d[0]).toEqual(Z);
    expect(d[11]).toEqual(Z);
    // Spec §4's formula, exactly: inner k's new min is first.max + k·g + Σ_{j<k} size_j — placed from the FIRST item, never
    // by a running position (whose last bits drift: the mutation that sums `pos += g; pos += size` fails here).
    let before = 0;
    inner.forEach((it, j) => {
      expect(d[j + 1]![0], `inner ${j}`).toBe(0.1 + (j + 1) * g + before - it.min[0]!);
      before += it.max[0]! - it.min[0]!;
    });
  });
  it('refuses when the inner parts do not fit, naming the outer two; a zero gap is allowed', () => {
    const big = item('x', [0, 2, 0], [1, 32, 1]); // 30 high in a 29.25 space
    expect(distributeDeltas([bottom, big, top], 1)).toEqual({ refused: "These parts don't fit between Bottom and Top along Y." });
    const exact = item('e', [0, 5, 0], [1, 5 + 29.25, 1]);
    expect(distributeDeltas([bottom, exact, top], 1)).toEqual([Z, [0, -4.25, 0], Z]);
  });
});

describe('itemExtents (align spec §2)', () => {
  it('a leaning leg by its leaned bounds; a turned part by its world size; an assembly by its parts', () => {
    const leg = createBoard({ id: 'leg', name: 'Leg', posture: 'upright', length: 18, width: 1.5, thickness: 1.5, lean: { x: 0.1, z: 0, face: 'width' } } as never);
    const turned = createBoard({ id: 'r', name: 'Rail', length: 20, width: 3, thickness: 0.75, rotation: 90 });
    const p1 = createBoard({ id: 'p1', name: 'A', length: 10, width: 2, thickness: 1, position: [0, 0, 0] });
    const p2 = createBoard({ id: 'p2', name: 'B', length: 10, width: 2, thickness: 1, position: [0, 5, 0] });
    const d1: Definition = { id: 'd1', boards: [p1, p2], instances: [], hardware: [] };
    const i1: Instance = { id: 'i1', name: 'Frame', definition: 'd1', position: [3, 0, 0], rotation: 0 };
    const doc = { ...createDocument('T'), boards: [leg, turned], definitions: [d1], instances: [i1] } as unknown as SloydDocument;
    const [L, R, F] = itemExtents(doc, ['leg', 'r', 'i1']);
    const lb = partBounds(leg);
    expect(L).toMatchObject({ id: 'leg', name: 'Leg', min: lb.min, max: lb.max });
    expect(R!.max[0]! - R!.min[0]!).toBe(3);
    expect(F).toMatchObject({ id: 'i1', name: 'Frame' });
    expect(F!.min[1]).toBe(0);
    expect(F!.max[1]! - F!.min[1]!).toBeGreaterThan(5);
  });
});
