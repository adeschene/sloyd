import { buildCutList, createBoard, createDocument } from './document';
import type { Board, SloydDocument } from './document';
import type { Cut } from './types';

/** A document containing exactly these boards, with unique default names. */
const docWith = (...boards: Partial<Board>[]): SloydDocument => ({
  ...createDocument('Test'),
  boards: boards.map((b, i) => createBoard({ name: `P${i}`, ...b })),
});

describe('buildCutList', () => {
  it('returns no groups for an empty document', () => {
    expect(buildCutList(createDocument('Test'))).toEqual({ groups: [] });
  });

  it('collapses two identical boards into one row of quantity 2', () => {
    const list = buildCutList(docWith({}, {}));
    expect(list.groups).toHaveLength(1);
    expect(list.groups[0].rows).toHaveLength(1);
    expect(list.groups[0].rows[0].qty).toBe(2);
    expect(list.groups[0].rows[0].names).toEqual(['P0', 'P1']);
  });

  it('labels a group with its material and thickness', () => {
    const list = buildCutList(docWith({ material: 'oak', thickness: 0.75 }));
    expect(list.groups[0].label).toBe('Oak — 3/4"');
  });

  it('formats a row as length by width', () => {
    const list = buildCutList(docWith({ length: 24, width: 3.5 }));
    expect(list.groups[0].rows[0].dims).toBe('24" × 3-1/2"');
  });

  it('collapses boards differing only in placement or name', () => {
    const list = buildCutList(docWith(
      { name: 'Leg A', posture: 'upright', position: [0, 0, 0] },
      { name: 'Leg B', posture: 'flat', rotation: 90, position: [10, 0, 4] },
    ));
    expect(list.groups[0].rows).toHaveLength(1);
    expect(list.groups[0].rows[0].qty).toBe(2);
  });

  it.each([
    ['material', { material: 'oak' }],
    ['thickness', { thickness: 1.5 }],
    ['length', { length: 30 }],
    ['width', { width: 7.25 }],
    ['grain', { grain: 'width' as const }],
  ])('splits boards differing in %s', (_field, difference) => {
    const list = buildCutList(docWith({}, difference));
    const rows = list.groups.flatMap((g) => g.rows);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.qty === 1)).toBe(true);
  });

  it('collapses lengths closer together than the display precision', () => {
    // 0.02" apart: both print as 24" at 1/16", so they are one row.
    //
    // NOT 24.03125 (a clean 1/32"), which looks like the obvious choice and is
    // wrong: it is exactly half a tick at 1/16", `Math.round` takes .5 upward,
    // and it prints as 24-1/16". Verified with the real arithmetic rather than
    // assumed — `formatLength`'s tick count for 24, 24.02 and 24.03125 at
    // precision 16 is 384, 384 and 385.
    const list = buildCutList(docWith({ length: 24 }, { length: 24.02 }));
    expect(list.groups[0].rows).toHaveLength(1);
    expect(list.groups[0].rows[0].qty).toBe(2);
  });

  it('splits those same lengths when the document asks for 1/32"', () => {
    const doc = docWith({ length: 24 }, { length: 24.02 });
    doc.units = { display: 'imperial-fractional', precision: 32 };
    expect(buildCutList(doc).groups[0].rows).toHaveLength(2);
  });

  it('orders groups by material label, then thickness descending', () => {
    const list = buildCutList(docWith(
      { material: 'pine', thickness: 0.75 },
      { material: 'oak', thickness: 0.75 },
      { material: 'oak', thickness: 1.5 },
    ));
    expect(list.groups.map((g) => g.label)).toEqual([
      'Oak — 1-1/2"', 'Oak — 3/4"', 'Pine — 3/4"',
    ]);
  });

  it('orders rows by length descending, then width descending', () => {
    const list = buildCutList(docWith(
      { length: 12, width: 6 },
      { length: 24, width: 3 },
      { length: 24, width: 6 },
    ));
    expect(list.groups[0].rows.map((r) => r.dims)).toEqual([
      '24" × 6"', '24" × 3"', '12" × 6"',
    ]);
  });

  const dado = (over: Partial<Cut> = {}): Cut => ({
    id: 'c1', face: 'thickness', from: 'min', across: 'width',
    offset: 6, width: 0.75, depth: 0.25, ...over,
  });

  it('has no setup lines for a board with no cuts', () => {
    expect(buildCutList(docWith({})).groups[0].rows[0].setup).toEqual([]);
  });

  it('phrases a dado part-locally', () => {
    const list = buildCutList(docWith({ cuts: [dado()] }));
    expect(list.groups[0].rows[0].setup).toEqual([
      '3/4" dado, 1/4" deep — into the thickness face (min side), ' +
      '6" from the length min end, running across the width',
    ]);
  });

  it('phrases a cut flush with an end as a rabbet', () => {
    const list = buildCutList(docWith({ cuts: [dado({ offset: 0 })] }));
    expect(list.groups[0].rows[0].setup[0]).toContain('3/4" rabbet');
    expect(list.groups[0].rows[0].setup[0]).toContain('0" from the length min end');
  });

  it('names the position axis from face and across, not from a stored field', () => {
    // face=length, across=thickness leaves width as the position axis. The
    // offset drops to 2" because the position axis is now the board's 5-1/2"
    // width — the default 6" would be off the end of it, and a test that
    // encoded an out-of-range cut as ordinary is one a future reader copies.
    const list = buildCutList(docWith({
      cuts: [dado({ face: 'length', across: 'thickness', from: 'max', offset: 2, depth: 0.5 })],
    }));
    expect(list.groups[0].rows[0].setup[0]).toBe(
      '3/4" dado, 1/2" deep — into the length face (max side), ' +
      '2" from the width min end, running across the thickness',
    );
  });

  it('collapses boards carrying the same cuts added in opposite orders', () => {
    const a = dado();
    const b = dado({ id: 'c2', offset: 12 });
    const list = buildCutList(docWith(
      { cuts: [a, b] },
      { cuts: [{ ...b, id: 'c3' }, { ...a, id: 'c4' }] },
    ));
    expect(list.groups[0].rows).toHaveLength(1);
    expect(list.groups[0].rows[0].qty).toBe(2);
    expect(list.groups[0].rows[0].setup).toHaveLength(2);
  });

  it('never collapses a cut-bearing board with a cut-free one', () => {
    const list = buildCutList(docWith({ cuts: [dado()] }, { cuts: [] }));
    expect(list.groups[0].rows).toHaveLength(2);
  });

  it.each([
    ['depth', { depth: 0.5 }],
    // `width` is the cut's own width (how wide the trench is), not the board's
    // — the split it must produce is a differently-sized dado, and the case
    // exists because it is the one Cut geometry field the rest of this list
    // would otherwise leave to `offset`'s tolerance test alone.
    ['width', { width: 0.5 }],
    // `face: 'length'` rather than `'width'`: `across` is already 'width', and
    // a cut naming the same dimension twice is degenerate — legal input to
    // `cutRegion`, which is total about it, but not something to assert on here.
    ['face', { face: 'length' as const }],
    ['from', { from: 'max' as const }],
    ['across', { across: 'length' as const }],
  ])('splits boards whose cuts differ in %s', (_field, difference) => {
    const list = buildCutList(docWith({ cuts: [dado()] }, { cuts: [dado(difference)] }));
    expect(list.groups[0].rows).toHaveLength(2);
  });

  it('groups dimensions at display precision but cuts exactly', () => {
    // The asymmetry IS the design: a stock dimension rounded to the precision
    // you cut to costs nothing, a dado location rounded the same way costs the
    // joint. Both halves in one test so neither can be relaxed alone.
    // The SAME 0.02" delta on both halves, which is what makes this a contrast
    // rather than two unrelated assertions.
    const loose = buildCutList(docWith({ length: 24 }, { length: 24.02 }));
    expect(loose.groups[0].rows).toHaveLength(1);

    const strict = buildCutList(docWith(
      { cuts: [dado({ offset: 6 })] },
      { cuts: [dado({ offset: 6.02 })] },
    ));
    expect(strict.groups[0].rows).toHaveLength(2);
  });

  it('carries a diagram on every row, including cut-free ones', () => {
    const list = buildCutList(docWith({}));
    expect(list.groups[0].rows[0].diagrams).toHaveLength(1);
    expect(list.groups[0].rows[0].diagrams[0].cuts).toEqual([]);
  });

  it('draws the row representative\'s cuts', () => {
    const cut: Cut = { id: 'c1', face: 'thickness', from: 'min', across: 'width',
                       offset: 6, width: 0.75, depth: 0.375 };
    const [row] = buildCutList(docWith({ cuts: [cut] })).groups[0].rows;
    expect(row.diagrams[0].cuts[0].h).toEqual([6, 6.75]);
  });

  it('agrees with the setup line it is printed beside', () => {
    // The picture and the prose are two renderings of one Cut, and nothing
    // else would catch them drifting: a change to setupLine's formatting that
    // skipped buildDiagrams would leave a sheet contradicting itself in print.
    // Assert on the STRINGS, not the numbers.
    const cut: Cut = { id: 'c1', face: 'thickness', from: 'min', across: 'width',
                       offset: 6, width: 0.75, depth: 0.375 };
    const [row] = buildCutList(docWith({ cuts: [cut] })).groups[0].rows;
    const line = row.setup[0];
    const drawn = row.diagrams[0].cuts[0];

    expect(line.startsWith(`${drawn.widthLabel} ${drawn.kind},`)).toBe(true);
    expect(line).toContain(`${drawn.depthLabel} —`);
    expect(line).toContain(`${drawn.offsetLabel} from the`);
  });

  it('agrees with each setup line even when the drawing reorders the cuts', () => {
    // `setup` stays in board.cuts order; `diagrams[i].cuts` sorts by h[0]. With
    // only one cut (the test above) that difference is invisible — the
    // correspondence holds trivially because there is nothing to reorder.
    // Enter two cuts on the SAME view (thickness face, across width) in
    // DESCENDING offset order, so the sort actually reorders the drawn cuts
    // relative to `setup`, and match each setup line to its cut by `id`
    // rather than by array position.
    const far: Cut = { id: 'far', face: 'thickness', from: 'min', across: 'width',
                       offset: 12, width: 0.75, depth: 0.375 };
    const near: Cut = { id: 'near', face: 'thickness', from: 'min', across: 'width',
                        offset: 6, width: 0.5, depth: 0.25 };
    const board = createBoard({ name: 'P0', cuts: [far, near] });
    const [row] = buildCutList({ ...createDocument('Test'), boards: [board] }).groups[0].rows;

    // The drawing sorts by h[0]: `near` (offset 6) comes before `far` (offset 12).
    expect(row.diagrams[0].cuts.map((c) => c.id)).toEqual(['near', 'far']);
    // `setup` stays in board.cuts order: `far` first, then `near`.
    expect(row.setup).toHaveLength(2);

    for (const [cutId, expectedIndex] of [['far', 0], ['near', 1]] as const) {
      const line = row.setup[expectedIndex];
      const drawn = row.diagrams[0].cuts.find((c) => c.id === cutId)!;
      expect(line.startsWith(`${drawn.widthLabel} ${drawn.kind},`)).toBe(true);
      expect(line).toContain(`${drawn.depthLabel} —`);
      expect(line).toContain(`${drawn.offsetLabel} from the`);
    }
  });

  it('keeps that agreement at a different precision', () => {
    const cut: Cut = { id: 'c1', face: 'thickness', from: 'min', across: 'width',
                       offset: 6.03, width: 0.75, depth: 0.375 };
    const doc = docWith({ cuts: [cut] });
    doc.units = { display: 'imperial-fractional', precision: 32 };
    const [row] = buildCutList(doc).groups[0].rows;
    const line = row.setup[0];
    const drawn = row.diagrams[0].cuts[0];
    expect(line.startsWith(`${drawn.widthLabel} ${drawn.kind},`)).toBe(true);
    expect(line).toContain(`${drawn.depthLabel} —`);
    expect(line).toContain(`${drawn.offsetLabel} from the`);
  });
});
