// The copy home FIRST (Task 5): it must load without an import cycle through `dovetails.ts`' copy table.
import { dovetailLine } from './dovetailText';
import { describe, expect, it } from 'vitest';
import { buildCutList, createBoard, createDocument, flatDocument } from './document';
import { applyDovetails, dovetailPlan } from './dovetails';
import { IMPERIAL } from '../units/length';
import { tenonLine } from './tenonText';
import type { Board, Dovetail, SloydDocument } from './types';
import type { CutListRow } from './cutlist';

/**
 * Dovetails Task 7 (spec §5.1–§5.2): the cut list's dovetail lines, the row identity, and the bench drawings on the TAIL
 * part's row. A dovetail-free list is byte for byte as before: no row carries a `benches` key.
 */

/** Task 4's drawer (copied, never imported from a test module). */
function drawer(): SloydDocument {
  const h = 6, tS = 0.5, tFB = 0.75, iw = 12, id = 16;
  const fb = (i: string, name: string, z: number) => createBoard({ id: i, name, posture: 'on-edge', rotation: 0, length: iw, width: h, thickness: tFB, position: [tS, 0, z] });
  const side = (i: string, name: string, x: number) => createBoard({ id: i, name, posture: 'on-edge', rotation: 90, length: id + 2 * tFB, width: h, thickness: tS, position: [x, 0, 0] });
  return { ...createDocument('Drawer'), boards: [fb('f', 'Front', 0), fb('b', 'Back', id + tFB), side('l', 'Side left', 0), side('r', 'Side right', iw + tS)] };
}
const dovetailed = (): SloydDocument => {
  const doc = drawer();
  const plan = dovetailPlan(doc, ['f', 'b', 'l', 'r'], { slope: 8, count: null, swap: false });
  if (typeof plan === 'string') throw new Error(plan);
  return applyDovetails(doc, plan);
};
const rows = (doc: SloydDocument): CutListRow[] => buildCutList(flatDocument(doc)).groups.flatMap((g) => g.rows);
const rowOf = (doc: SloydDocument, name: string) => rows(doc).find((r) => r.names.includes(name))!;

const HEAD = 'Through dovetails — 4 tails, 1:8, pins 1/4" at the narrow end, ';

describe('the cut list reads dovetails (spec §5.1)', () => {
  it("the drawer side's row: both ends' lines, verbatim (lengths are formatLength's, inv 52)", () => {
    const r = rowOf(dovetailed(), 'Side left');
    expect(r.setup).toEqual([
      `${HEAD}3/4" deep, at the length min end; this part has the tails, each 1-3/16" wide at the end.`,
      `${HEAD}3/4" deep, at the length max end; this part has the tails, each 1-3/16" wide at the end.`,
    ]);
  });

  it('the two sides, equal but for ids, are ONE row', () => {
    const r = rowOf(dovetailed(), 'Side left');
    expect(r.names).toEqual(['Side left', 'Side right']);
    expect(r.qty).toBe(2);
  });

  it("the front's pins lines end with its outside face; the back (outside min) is its own row", () => {
    const doc = dovetailed();
    const front = rowOf(doc, 'Front');
    expect(front.names).toEqual(['Front']);
    expect(front.setup).toEqual([
      `${HEAD}1/2" deep, at the length min end; this part has the pins, their narrow ends on its thickness max face.`,
      `${HEAD}1/2" deep, at the length max end; this part has the pins, their narrow ends on its thickness max face.`,
    ]);
    expect(rowOf(doc, 'Back').setup.every((l) => l.endsWith('their narrow ends on its thickness min face.'))).toBe(true);
  });

  const d: Dovetail = { id: 'd1', dim: 'length', end: 'max', role: 'tails', count: 4, slope: 8, pin: 0.25, depth: 0.75 };
  const two = (a: Partial<Dovetail>, b: Partial<Dovetail>) => ({
    ...createDocument('Two'),
    boards: [
      createBoard({ id: 'a', name: 'A', length: 18, width: 6, thickness: 0.5, dovetails: [{ ...d, ...a }] }),
      createBoard({ id: 'b', name: 'B', length: 18, width: 6, thickness: 0.5, dovetails: [{ ...d, ...b }] }),
    ],
  });

  it('a dovetail differing only in id does not split a row; a different slope does', () => {
    expect(rows(two({ id: 'x' }, { id: 'y' })).map((r) => r.names)).toEqual([['A', 'B']]);
    expect(rows(two({ id: 'x' }, { id: 'y', slope: 6 })).map((r) => r.names)).toHaveLength(2);
  });

  it('a dovetailed part and its dovetail-free twin are two rows', () => {
    const doc = two({}, {});
    const bare: SloydDocument = { ...doc, boards: [doc.boards[0]!, createBoard({ id: 'b', name: 'B', length: 18, width: 6, thickness: 0.5 })] };
    expect(rows(bare)).toHaveLength(2);
  });

  it('the dovetail lines sit after the finger-set lines and before the round-tenon lines', () => {
    // Stored by hand (the cut list reads what is stored; the planners never combine these on one part).
    const b: Board = createBoard({
      name: 'Mixed', length: 18, width: 6, thickness: 0.75, dovetails: [d],
      tenons: [{ id: 't1', end: 'min', diameter: 0.5, length: 1 }],
    });
    const setup = rows({ ...createDocument('M'), boards: [b] })[0]!.setup;
    const line = dovetailLine(b, d, IMPERIAL);
    expect(setup).toEqual([line, tenonLine(b, b.tenons![0]!, IMPERIAL)]);
  });
});

describe('the bench drawings ride on the TAIL part\'s row (spec §5.2)', () => {
  it('the side row carries one bench (`both ends`); the front row carries no `benches` key', () => {
    const doc = dovetailed();
    const side = rowOf(doc, 'Side left');
    expect(side.benches!.map((b) => b.ends)).toEqual(['both']);
    expect('benches' in rowOf(doc, 'Front')).toBe(false);
  });

  it('a faulted tails dovetail keeps its line, draws no bench, and leaves `benches` absent', () => {
    const b = createBoard({ name: 'F', length: 18, width: 6, thickness: 0.5, dovetails: [{ id: 'd', dim: 'length', end: 'max', role: 'tails', count: 4, slope: 20, pin: 0.25, depth: 0.75 }] });
    const r = rows({ ...createDocument('F'), boards: [b] })[0]!;
    expect(r.setup).toHaveLength(1);
    expect(r.setup[0]).toMatch(/^Through dovetails — 4 tails, 1:20,/);
    expect('benches' in r).toBe(false);
  });

  it('identity: a dovetail-free cut list has no `benches` key on any row', () => {
    const all = rows({
      ...createDocument('Free'),
      boards: [
        createBoard({ name: 'P', length: 24, width: 8, cuts: [{ id: 'c', face: 'thickness', from: 'min', across: 'width', offset: 6, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 }] }),
        createBoard({ name: 'Q', material: 'plywood', bands: [{ side: { across: 'width', from: 'min' }, type: 'band-iron-on' }] }),
      ],
    });
    expect(all.length).toBeGreaterThan(1);
    for (const r of all) expect('benches' in r).toBe(false);
  });
});
