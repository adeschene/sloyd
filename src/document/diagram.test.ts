import { buildDiagrams, createBoard } from './document';
import type { Board, Cut } from './document';

/** The canonical cut from the joinery work: 3/4" wide, 3/8" deep, 6" along. */
const dado = (over: Partial<Cut> = {}): Cut => ({
  id: 'c1', face: 'thickness', from: 'min', across: 'width',
  offset: 6, width: 0.75, depth: 0.375, ...over,
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

  it('puts the in-plane dimensions on horizontal and vertical', () => {
    const views = buildDiagrams(board(dado()), 16);
    expect(views).toHaveLength(1);
    expect(views[0].horizontal).toBe('length');
    expect(views[0].vertical).toBe('width');
    expect(views[0].h).toBe(24);
    expect(views[0].v).toBe(5.5);
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
      { id: 'a', face: 'thickness', from: 'min', across: 'width',  offset: 6, width: 0.75, depth: 0.375 },
      { id: 'b', face: 'thickness', from: 'min', across: 'length', offset: 4, width: 0.75, depth: 0.125 },
    ]});
    const views = buildDiagrams(board, 16);
    expect(views).toHaveLength(1);
    expect(views[0].cuts).toHaveLength(2);
  });

  it('splits the two sides of one face into separate views', () => {
    const board = createBoard({ cuts: [
      { id: 'a', face: 'thickness', from: 'min', across: 'width', offset: 6, width: 0.75, depth: 0.375 },
      { id: 'b', face: 'thickness', from: 'max', across: 'width', offset: 6, width: 0.75, depth: 0.375 },
    ]});
    const views = buildDiagrams(board, 16);
    expect(views).toHaveLength(2);
    expect(views.map((v) => v.from).sort()).toEqual(['max', 'min']);
  });

  it('puts the earlier DIMENSION_ORDER dimension on the horizontal axis', () => {
    const views = buildDiagrams(createBoard({ cuts: [
      { id: 'a', face: 'thickness', from: 'min', across: 'width', offset: 6, width: 0.75, depth: 0.375 },
    ]}), 16);
    expect(views[0].horizontal).toBe('length');
    expect(views[0].vertical).toBe('width');
  });

  it('tags each cut with the axis its offset is measured along', () => {
    const views = buildDiagrams(createBoard({ length: 24, width: 12, cuts: [
      { id: 'a', face: 'thickness', from: 'min', across: 'width',  offset: 6, width: 0.75, depth: 0.375 },
      { id: 'b', face: 'thickness', from: 'min', across: 'length', offset: 4, width: 0.75, depth: 0.125 },
    ]}), 16);
    const byId = Object.fromEntries(views[0].cuts.map((c) => [c.id, c]));
    expect(byId.a.axis).toBe('h');   // across the width -> positioned along the length
    expect(byId.b.axis).toBe('v');   // across the length -> positioned along the width
  });

  it('reports one legend line per distinct crossing depth', () => {
    const views = buildDiagrams(createBoard({ length: 24, width: 12, cuts: [
      { id: 'a', face: 'thickness', from: 'min', across: 'width',  offset: 6, width: 0.75, depth: 0.125 },
      { id: 'b', face: 'thickness', from: 'min', across: 'length', offset: 4, width: 0.75, depth: 0.375 },
    ]}), 16);
    expect(views[0].crossings).toEqual(['crossing: 3/8" deep governs']);
  });

  it('reports NO legend line when crossing cuts share a depth', () => {
    const views = buildDiagrams(createBoard({ length: 24, width: 12, cuts: [
      { id: 'a', face: 'thickness', from: 'min', across: 'width',  offset: 6, width: 0.75, depth: 0.375 },
      { id: 'b', face: 'thickness', from: 'min', across: 'length', offset: 4, width: 0.75, depth: 0.375 },
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
