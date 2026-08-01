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
    expect(views[0].across).toBe('width');
    expect(views[0].along).toBe('length');
    expect(views[0].cuts).toEqual([]);
    expect(views[0].hasFar).toBe(false);
  });

  it('puts the position axis on the horizontal and `across` on the vertical', () => {
    const views = buildDiagrams(board(dado()), 16);
    expect(views).toHaveLength(1);
    expect(views[0].along).toBe('length');
    expect(views[0].h).toBe(24);
    expect(views[0].v).toBe(5.5);
  });

  it('always sets `along` to positionAxisOf(face, across)', () => {
    const views = buildDiagrams(board(
      dado(),
      dado({ id: 'c2', face: 'width', across: 'length', offset: 0.1, width: 0.2 }),
      dado({ id: 'c3', face: 'length', across: 'thickness', offset: 1, width: 0.5 }),
    ), 16);
    expect(views.map((v) => [v.face, v.across, v.along])).toEqual([
      ['length', 'thickness', 'width'],
      ['width', 'length', 'thickness'],
      ['thickness', 'width', 'length'],
    ]);
  });

  it('draws a cut as a band spanning the full height', () => {
    const views = buildDiagrams(board(dado()), 16);
    expect(views[0].cuts[0].h).toEqual([6, 6.75]);
    expect(views[0].cuts[0].v).toEqual([0, 5.5]);
  });

  it('splits one face into two views when `across` differs', () => {
    // Both cuts go into the thickness face, but their position axes differ —
    // this is the case the (face, across) key exists for. Spec section 2.
    const views = buildDiagrams(board(
      dado(),
      dado({ id: 'c2', across: 'length', offset: 1, width: 0.75 }),
    ), 16);
    expect(views).toHaveLength(2);
    expect(views.map((v) => v.along)).toEqual(['width', 'length']);
  });

  it('keeps both sides of one face in a single view', () => {
    const views = buildDiagrams(board(dado(), dado({ id: 'c2', from: 'max' })), 16);
    expect(views).toHaveLength(1);
    expect(views[0].cuts.map((c) => c.side)).toEqual(['min', 'max']);
    expect(views[0].hasFar).toBe(true);
  });

  it('does not move a band when the cut enters from the far side', () => {
    // `from` moves the cut along the FACE axis, which no view shows. If this
    // fails, the region span is being read out by the wrong key.
    const near = buildDiagrams(board(dado()), 16)[0].cuts[0];
    const far = buildDiagrams(board(dado({ from: 'max' })), 16)[0].cuts[0];
    expect(far.h).toEqual(near.h);
    expect(far.v).toEqual(near.v);
  });

  it('orders views by DIMENSION_ORDER on face, then across', () => {
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

  it('heads a view with its face and direction', () => {
    expect(buildDiagrams(board(dado()), 16)[0].heading)
      .toBe('Thickness face — across the width');
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
