import { buildCutList, createBoard, createDocument } from './document';
import type { Board, SloydDocument } from './document';

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

  it('leaves setup empty at this stage', () => {
    expect(buildCutList(docWith({})).groups[0].rows[0].setup).toEqual([]);
  });
});
