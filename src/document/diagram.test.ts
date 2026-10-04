import { buildDiagrams, createBoard } from './document';
import type { Board, Cut } from './document';

/** The canonical cut from the joinery work: 3/4" wide, 3/8" deep, 6" along. */
const dado = (over: Partial<Cut> = {}): Cut => ({
  id: 'c1', face: 'thickness', from: 'min', across: 'width',
  offset: 6, width: 0.75, depth: 0.375, stopMin: 0, stopMax: 0, ...over,
});

/** A default board is 24" x 5-1/2" x 3/4". */
const board = (...cuts: Cut[]): Board => createBoard({ cuts });

describe('buildDiagrams', () => {
  it('gives a cut-free board one broad-face view with no cuts', () => {
    const views = buildDiagrams(board(), 16);
    expect(views).toHaveLength(1);
    expect(views[0].face).toBe('thickness');
    expect(views[0].from).toBe('min');
    expect(views[0].horizontal).toBe('length');
    expect(views[0].vertical).toBe('width');
    expect(views[0].cuts).toEqual([]);
  });

  it('always puts the earlier DIMENSION_ORDER dimension horizontal', () => {
    const views = buildDiagrams(board(
      dado(),
      dado({ id: 'c2', face: 'width', across: 'length', offset: 0.1, width: 0.2 }),
      dado({ id: 'c3', face: 'length', across: 'thickness', offset: 1, width: 0.5 }),
    ), 16);
    expect(views.map((v) => [v.face, v.horizontal, v.vertical])).toEqual([
      ['length', 'width', 'thickness'],
      ['width', 'length', 'thickness'],
      ['thickness', 'length', 'width'],
    ]);
  });

  it('draws a cut as a band spanning the full height', () => {
    const views = buildDiagrams(board(dado()), 16);
    expect(views[0].cuts[0].h).toEqual([6, 6.75]);
    expect(views[0].cuts[0].v).toEqual([0, 5.5]);
  });

  it('draws ONE view per physical face, not per (face, across) pair', () => {
    // The defect this round exists to fix: two perpendicular cuts on the same
    // face used to produce two diagrams, each showing one cut and neither
    // showing where they cross.
    const board = createBoard({ length: 24, width: 12, cuts: [
      { id: 'a', face: 'thickness', from: 'min', across: 'width',  offset: 6, width: 0.75, depth: 0.375, stopMin: 0, stopMax: 0 },
      { id: 'b', face: 'thickness', from: 'min', across: 'length', offset: 4, width: 0.75, depth: 0.125, stopMin: 0, stopMax: 0 },
    ]});
    const views = buildDiagrams(board, 16);
    expect(views).toHaveLength(1);
    expect(views[0].cuts).toHaveLength(2);
  });

  it('splits the two sides of one face into separate views', () => {
    const board = createBoard({ cuts: [
      { id: 'a', face: 'thickness', from: 'min', across: 'width', offset: 6, width: 0.75, depth: 0.375, stopMin: 0, stopMax: 0 },
      { id: 'b', face: 'thickness', from: 'max', across: 'width', offset: 6, width: 0.75, depth: 0.375, stopMin: 0, stopMax: 0 },
    ]});
    const views = buildDiagrams(board, 16);
    expect(views).toHaveLength(2);
    // Asserts the ACTUAL emitted order, not an alphabetised one: 'min' before
    // 'max' regardless of insertion order, per FROM_ORDER in buildDiagrams —
    // the near side reads first, matching the "(min side)" prose phrasing.
    expect(views.map((v) => v.from)).toEqual(['min', 'max']);
  });

  it('tags each cut with the axis its offset is measured along', () => {
    const views = buildDiagrams(createBoard({ length: 24, width: 12, cuts: [
      { id: 'a', face: 'thickness', from: 'min', across: 'width',  offset: 6, width: 0.75, depth: 0.375, stopMin: 0, stopMax: 0 },
      { id: 'b', face: 'thickness', from: 'min', across: 'length', offset: 4, width: 0.75, depth: 0.125, stopMin: 0, stopMax: 0 },
    ]}), 16);
    const byId = Object.fromEntries(views[0].cuts.map((c) => [c.id, c]));
    expect(byId.a.axis).toBe('h');   // across the width -> positioned along the length
    expect(byId.b.axis).toBe('v');   // across the length -> positioned along the width
  });

  it('reports one legend line per distinct crossing depth', () => {
    const views = buildDiagrams(createBoard({ length: 24, width: 12, cuts: [
      { id: 'a', face: 'thickness', from: 'min', across: 'width',  offset: 6, width: 0.75, depth: 0.125, stopMin: 0, stopMax: 0 },
      { id: 'b', face: 'thickness', from: 'min', across: 'length', offset: 4, width: 0.75, depth: 0.375, stopMin: 0, stopMax: 0 },
    ]}), 16);
    expect(views[0].crossings).toEqual(['overlap: 3/8" deep governs']);
  });

  it('collapses two SEPARATE crossings at the same governing depth to one legend line', () => {
    // Four cuts forming a criss-cross grid: two full-width bands (across
    // width, positioned along length) and two full-length bands (across
    // length, positioned along width). Every across-width band crosses every
    // across-length band, giving FOUR distinct, non-adjacent crossing cells —
    // but all four are governed by the same 1/2" cut, so there must be
    // exactly one legend line, not four. A naive `filter+map` without a
    // dedup step would print it once per crossing CELL instead of once per
    // distinct depth.
    const views = buildDiagrams(createBoard({ length: 24, width: 12, cuts: [
      { id: 'a', face: 'thickness', from: 'min', across: 'width',  offset: 2,  width: 1, depth: 0.5, stopMin: 0, stopMax: 0 },
      { id: 'c', face: 'thickness', from: 'min', across: 'width',  offset: 16, width: 1, depth: 0.5, stopMin: 0, stopMax: 0 },
      { id: 'b', face: 'thickness', from: 'min', across: 'length', offset: 2,  width: 1, depth: 0.25, stopMin: 0, stopMax: 0 },
      { id: 'd', face: 'thickness', from: 'min', across: 'length', offset: 8,  width: 1, depth: 0.1, stopMin: 0, stopMax: 0 },
    ]}), 16);
    expect(views[0].cells.filter((c) => c.crossing).length).toBeGreaterThan(1);
    expect(views[0].crossings).toEqual(['overlap: 1/2" deep governs']);
  });

  it('reports NO legend line when crossing cuts share a depth', () => {
    const views = buildDiagrams(createBoard({ length: 24, width: 12, cuts: [
      { id: 'a', face: 'thickness', from: 'min', across: 'width',  offset: 6, width: 0.75, depth: 0.375, stopMin: 0, stopMax: 0 },
      { id: 'b', face: 'thickness', from: 'min', across: 'length', offset: 4, width: 0.75, depth: 0.375, stopMin: 0, stopMax: 0 },
    ]}), 16);
    expect(views[0].crossings).toEqual([]);
  });

  it('does not move a band when the cut enters from the far side', () => {
    // `from` now selects a different VIEW; within that view a band still
    // reads out the same region spans. If this fails, the region span is
    // being read out by the wrong key.
    const near = buildDiagrams(board(dado()), 16)[0].cuts[0];
    const far = buildDiagrams(board(dado({ from: 'max' })), 16)[0].cuts[0];
    expect(far.h).toEqual(near.h);
    expect(far.v).toEqual(near.v);
  });

  it('orders views by DIMENSION_ORDER on face, then from', () => {
    const views = buildDiagrams(board(
      dado({ id: 'c3', face: 'length', across: 'thickness', offset: 1, width: 0.5 }),
      dado(),
      dado({ id: 'c2', face: 'width', across: 'length', offset: 0.1, width: 0.2 }),
    ), 16);
    expect(views.map((v) => v.face)).toEqual(['length', 'width', 'thickness']);
  });

  it('orders cuts within a view by their position along the horizontal', () => {
    const views = buildDiagrams(board(
      dado({ id: 'late', offset: 18 }),
      dado({ id: 'early', offset: 2 }),
    ), 16);
    expect(views[0].cuts.map((c) => c.id)).toEqual(['early', 'late']);
  });

  it('heads a view with its face and side', () => {
    expect(buildDiagrams(board(dado()), 16)[0].heading)
      .toBe('Thickness face — min side');
  });

  it('formats every label at the given precision', () => {
    const [view] = buildDiagrams(board(dado()), 16);
    expect(view.hLabel).toBe('24"');
    expect(view.vLabel).toBe('5-1/2"');
    expect(view.cuts[0].offsetLabel).toBe('6"');
    expect(view.cuts[0].widthLabel).toBe('3/4"');
    expect(view.cuts[0].depthLabel).toBe('3/8" deep');
  });

  it('follows the document precision rather than assuming 1/16', () => {
    // 3/8 is unrepresentable at 1/4, so it rounds — proving precision is used.
    const [view] = buildDiagrams(board(dado()), 4);
    expect(view.cuts[0].depthLabel).toBe('1/2" deep');
  });

  it('carries the cut kind from cutLabel', () => {
    const flush = dado({ offset: 23.25 });   // reaches the far end: a rabbet
    expect(buildDiagrams(board(dado()), 16)[0].cuts[0].kind).toBe('dado');
    expect(buildDiagrams(board(flush), 16)[0].cuts[0].kind).toBe('rabbet');
  });

  it('keeps each cut its own id, so two identical cuts stay distinct', () => {
    // cutSignature and setupLine both exclude `id`, so identical cuts collapse
    // there. Here the Cut objects are in hand and the real id costs nothing.
    const views = buildDiagrams(board(dado(), dado({ id: 'c2' })), 16);
    expect(views[0].cuts.map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it('skips a degenerate cut naming one dimension twice', () => {
    // validateCuts drops these on load, but a Board built in code can hold one
    // and this function must not depend on validation having run.
    const views = buildDiagrams(board(dado({ across: 'thickness' })), 16);
    expect(views).toHaveLength(1);
    expect(views[0].face).toBe('thickness');
    expect(views[0].cuts).toEqual([]);
  });
});

describe('buildDiagrams — stopped cuts', () => {
  const only = (cut: Cut) => buildDiagrams(board(cut), 16)[0].cuts[0];

  it('adds no stop labels to a cut that is not stopped', () => {
    const c = only(dado());
    expect(c.stopMinLabel).toBeUndefined();
    expect(c.stopMaxLabel).toBeUndefined();
    expect(c.lengthLabel).toBeUndefined();
  });

  it('labels one stop and the cut\'s own length', () => {
    const c = only(dado({ stopMax: 1 }));
    expect(c.stopMinLabel).toBeUndefined();
    expect(c.stopMaxLabel).toBe('1"');
    expect(c.lengthLabel).toBe('4-1/2"');
  });

  it('labels both stops of a blind dado', () => {
    const c = only(dado({ stopMin: 1, stopMax: 1.5 }));
    expect(c.stopMinLabel).toBe('1"');
    expect(c.stopMaxLabel).toBe('1-1/2"');
    expect(c.lengthLabel).toBe('3"');
    // Cut-words spec §2.2: closed pocket 3/4 x 3, depth 3/8 not deeper than 3/4 -> 'blind dado', formerly 'mortise'.
    expect(c.kind).toBe('blind dado');
  });

  it('draws a stopped cut as its rectangle', () => {
    // Broad face: horizontal = length, vertical = width (the across axis here).
    const c = only(dado({ stopMin: 1, stopMax: 1.5 }));
    expect(c.h).toEqual([6, 6.75]);
    expect(c.v).toEqual([1, 4]);
  });
});

describe('buildDiagrams — a cut that removes nothing (follow-up 178)', () => {
  it('draws no band for it, and keeps a live cut beside it', () => {
    const views = buildDiagrams(board(dado({ stopMin: 3, stopMax: 3 }), dado({ id: 'c2', offset: 12 })), 16);
    expect(views.flatMap((v) => v.cuts.map((c) => c.id))).toEqual(['c2']);
  });

  it('falls back to the plain broad-face drawing when every cut removes nothing', () => {
    const views = buildDiagrams(board(dado({ face: 'width', across: 'length', offset: 30 })), 16);
    expect(views).toHaveLength(1);
    expect(views[0].face).toBe('thickness');
    expect(views[0].cuts).toEqual([]);
  });
});
