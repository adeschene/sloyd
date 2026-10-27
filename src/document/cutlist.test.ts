import { buildCutList, createBoard, createDocument, cornerCurve } from './document';
import type { Board, FlatDocument, SloydDocument } from './document';
import { flatDocument } from './tree';
import { sharedOf } from './links';
import { chiralPart } from './turnFixtures';
import type { Cut } from './types';
import { cutRegion } from './cuts';
import { ARCH } from './curveFixtures';
import { loop, topCorners } from './sweepFixtures';
import { axisFrame, spanToWorldOffset } from './geometry';
import { fingerLayout, notchCuts, boxJointPlan, applyBoxJoints } from './boxJoints';
import { migrateDocument, worldParts, writeBackFlat } from './document';
import { designToDocument, parseDesign } from './generated';
import { SHAKER_TABLE_JSON } from './shakerTableFixture';
import { applyJoints } from '../generate/joints/recipes';
import { findSites } from '../generate/joints/sites';
import { defaultChoice } from '../generate/joints/choose';
import type { AngleCut, RoundTenon } from './types';

/** A document containing exactly these boards, with unique default names. */
const docWith = (...boards: Partial<Board>[]): FlatDocument => ({
  ...createDocument('Test'),
  boards: boards.map((b, i) => createBoard({ name: `P${i}`, ...b })),
});

describe('buildCutList', () => {
  it('hardware never groups the cut list: parts differing only in hardware stay one row (spec 2.2, inv 55)', () => {
    const doc = { ...docWith({ id: 'ha' }, { id: 'hb', hardware: [{ type: 'h1', count: 4 }] }),
      hardwareTypes: [{ id: 'h1', name: 'Hinge', packSize: 1, pricePerPack: null }] };
    const list = buildCutList(doc);
    expect(list.groups).toHaveLength(1);
    expect(list.groups[0].rows).toHaveLength(1);
    expect(list.groups[0].rows[0].qty).toBe(2);
    expect(list.groups[0].rows[0].boardIds).toEqual(['ha', 'hb']);
  });

  it('returns no groups for an empty document', () => {
    expect(buildCutList(createDocument('Test'))).toEqual({ groups: [], notes: [] });
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
    offset: 6, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0, ...over,
  });

  // Follow-up 215. Before v12 a flat and an on-edge part with the SAME stored stopped dado shared a
  // row but were mirror images in the world (on-edge's frame had the other hand), so the row was a
  // lie for a one-handed cut. Since v12 every posture has one hand, so the same stored cut IS the
  // same physical cut.
  it('groups a flat and an on-edge part with one stopped dado, and they are the same physical part', () => {
    const stopped = [dado({ stopMin: 1.5 })]; // runs across the width, stopped at its min end only
    const flat = createBoard({ name: 'F', posture: 'flat', length: 24, width: 6, thickness: 0.75, cuts: stopped });
    const edge = createBoard({ name: 'E', posture: 'on-edge', length: 24, width: 6, thickness: 0.75, cuts: stopped });
    const list = buildCutList({ ...createDocument('T'), boards: [flat, edge] });
    expect(list.groups.flatMap((g) => g.rows)).toHaveLength(1);
    expect(list.groups[0].rows[0].qty).toBe(2);

    // Part-local removed boxes (min-corner relative) are equal.
    const rf = cutRegion(flat, stopped[0]);
    const re = cutRegion(edge, stopped[0]);
    expect(re).toEqual(rf);

    // World boxes relative to each part's own min corner, per world axis [x, y, z].
    const worldBox = (b: Board) => axisFrame(b).map((a, i) => spanToWorldOffset(b, i, rf[a.dim]));
    const [fx, fy, fz] = worldBox(flat);
    const [ex, ey, ez] = worldBox(edge);
    // By hand (turn 0, L=24 W=6 T=0.75; dado: thickness [0,0.25], width [1.5,6], length [6,6.75]):
    //   flat:    X=length, Y=thickness,           Z=width
    //   on-edge: X=length, Y=width, Z=thickness REVERSED (v12).
    expect(fx).toEqual([6, 6.75]);
    expect(fy).toEqual([0, 0.25]);
    expect(fz).toEqual([1.5, 6]);
    expect(ex).toEqual([6, 6.75]);
    expect(ey).toEqual([1.5, 6]);
    expect(ez).toEqual([0.5, 0.75]);
    // The proper rotation about X taking flat to on-edge: (x, y, z) -> (x, z, T - y). Applied to
    // the flat box it gives exactly the on-edge box; a mirror could not (the pre-v12 Z was [0, 0.25]).
    expect([fx, fz, [0.75 - fy[1], 0.75 - fy[0]]]).toEqual([ex, ey, ez]);
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

  it('prints an unstopped rabbet exactly as before', () => {
    const list = buildCutList(docWith({ cuts: [dado({ offset: 0 })] }));
    expect(list.groups[0].rows[0].setup).toEqual([
      '3/4" rabbet, 1/4" deep — into the thickness face (min side), ' +
      '0" from the length min end, running across the width',
    ]);
  });

  it('adds a clause for a stop at the max end', () => {
    const list = buildCutList(docWith({ cuts: [dado({ stopMax: 1 })] }));
    expect(list.groups[0].rows[0].setup).toEqual([
      '3/4" stopped dado, 1/4" deep — into the thickness face (min side), ' +
      '6" from the length min end, running across the width, stopped 1" short of the max end',
    ]);
  });

  it('adds a clause for a stop at the min end', () => {
    const list = buildCutList(docWith({ cuts: [dado({ stopMin: 0.5 })] }));
    expect(list.groups[0].rows[0].setup[0]).toMatch(
      /, running across the width, stopped 1\/2" short of the min end$/,
    );
  });

  it('names both stops of a blind dado', () => {
    // Cut-words spec §2.2 (closed pocket, depth 1/4 not deeper than its 3/4 smaller extent): 'blind dado', formerly 'mortise'.
    const list = buildCutList(docWith({ cuts: [dado({ stopMin: 1, stopMax: 1.5 })] }));
    expect(list.groups[0].rows[0].setup).toEqual([
      '3/4" blind dado, 1/4" deep — into the thickness face (min side), ' +
      '6" from the length min end, running across the width, ' +
      'stopped 1" short of the min end and 1-1/2" short of the max end',
    ]);
  });

  it('omits a cut a board shrink has left removing nothing (fu 178)', () => {
    const list = buildCutList(docWith({ length: 10, cuts: [dado({ offset: 20 })] }));
    expect(list.groups[0].rows[0].setup).toEqual([]);
  });

  it('omits a cut whose stops cross, and keeps a live cut beside it', () => {
    // The default board is 5-1/2" wide: stops of 3 and 3 cross.
    const list = buildCutList(docWith({ cuts: [dado({ stopMin: 3, stopMax: 3 }), dado({ id: 'c2', offset: 12 })] }));
    expect(list.groups[0].rows[0].setup).toEqual([
      '3/4" dado, 1/4" deep — into the thickness face (min side), ' +
      '12" from the length min end, running across the width',
    ]);
  });

  it('groups a board carrying such a cut with an otherwise identical clean board', () => {
    const list = buildCutList(docWith({ length: 10, cuts: [dado({ offset: 20 })] }, { length: 10 }));
    expect(list.groups[0].rows).toHaveLength(1);
    expect(list.groups[0].rows[0].qty).toBe(2);
  });

  it('splits two parts that differ only in a stop into two rows', () => {
    const list = buildCutList(docWith({ cuts: [dado()] }, { cuts: [dado({ stopMax: 1 })] }));
    expect(list.groups[0].rows).toHaveLength(2);
  });

  it('splits two parts that differ only in which end is stopped', () => {
    const list = buildCutList(docWith(
      { cuts: [dado({ stopMin: 1 })] },
      { cuts: [dado({ stopMax: 1 })] },
    ));
    expect(list.groups[0].rows).toHaveLength(2);
  });

  it('keeps two parts with identical stopped cuts in one row', () => {
    const list = buildCutList(docWith(
      { cuts: [dado({ stopMin: 1, stopMax: 1 })] },
      { cuts: [dado({ stopMin: 1, stopMax: 1 })] },
    ));
    expect(list.groups[0].rows).toHaveLength(1);
    expect(list.groups[0].rows[0].qty).toBe(2);
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
                       offset: 6, width: 0.75, depth: 0.375, stopMin: 0, stopMax: 0 };
    const [row] = buildCutList(docWith({ cuts: [cut] })).groups[0].rows;
    expect(row.diagrams[0].cuts[0].h).toEqual([6, 6.75]);
  });

  it('agrees with the setup line it is printed beside', () => {
    // The picture and the prose are two renderings of one Cut, and nothing
    // else would catch them drifting: a change to setupLine's formatting that
    // skipped buildDiagrams would leave a sheet contradicting itself in print.
    // Assert on the STRINGS, not the numbers.
    const cut: Cut = { id: 'c1', face: 'thickness', from: 'min', across: 'width',
                       offset: 6, width: 0.75, depth: 0.375, stopMin: 0, stopMax: 0 };
    const [row] = buildCutList(docWith({ cuts: [cut] })).groups[0].rows;
    const line = row.setup[0];
    const drawn = row.diagrams[0].cuts[0];

    expect(line.startsWith(`${drawn.widthLabel} ${drawn.kind},`)).toBe(true);
    expect(line).toContain(`${drawn.depthLabel} —`);
    expect(line).toContain(`${drawn.offsetLabel} from the`);
  });

  it('agrees with the setup line for a cut stored across the other axis (spec §2.4)', () => {
    const cut: Cut = { id: 'c1', face: 'thickness', from: 'min', across: 'length',
                       offset: 0, width: 4.5, depth: 0.25, stopMin: 6, stopMax: 17.25 };
    const [row] = buildCutList(docWith({ cuts: [cut] })).groups[0].rows;
    const line = row.setup[0];
    const drawn = row.diagrams[0].cuts[0];
    expect(line.startsWith(`${drawn.widthLabel} ${drawn.kind},`)).toBe(true);
    expect(line).toContain(`${drawn.offsetLabel} from the`);
    expect(line).toContain(`stopped ${drawn.stopMaxLabel} short of the max end`);
    expect(drawn.stopMinLabel).toBeUndefined();
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
                       offset: 12, width: 0.75, depth: 0.375, stopMin: 0, stopMax: 0 };
    const near: Cut = { id: 'near', face: 'thickness', from: 'min', across: 'width',
                        offset: 6, width: 0.5, depth: 0.25, stopMin: 0, stopMax: 0 };
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
                       offset: 6.03, width: 0.75, depth: 0.375, stopMin: 0, stopMax: 0 };
    const doc = docWith({ cuts: [cut] });
    doc.units = { display: 'imperial-fractional', precision: 32 };
    const [row] = buildCutList(doc).groups[0].rows;
    const line = row.setup[0];
    const drawn = row.diagrams[0].cuts[0];
    expect(line.startsWith(`${drawn.widthLabel} ${drawn.kind},`)).toBe(true);
    expect(line).toContain(`${drawn.depthLabel} —`);
    expect(line).toContain(`${drawn.offsetLabel} from the`);
  });

  it('reports board feet for a row, quantity included', () => {
    // 24 * 5.5 * 0.75 = 99 cubic inches each; two of them = 198; /144 = 1.375
    const list = buildCutList(docWith(
      { length: 24, width: 5.5, thickness: 0.75 },
      { length: 24, width: 5.5, thickness: 0.75 },
    ));
    expect(list.groups[0].rows[0].stock).toBe('1.38 bd ft');
    expect(list.groups[0].rows[0].stockInches).toBeCloseTo(198, 10);
  });

  it('sums each board EXACTLY, not the row representative times quantity', () => {
    // These two print identically at 1/16" and so share a row (invariant 18),
    // but they are not the same purchase. The row must total 99 + 99.0825 =
    // 198.0825 cubic inches, NOT 2 x 99. This is spec section 2, and it is the
    // test that fails if someone later "simplifies" this to qty * volume.
    const list = buildCutList(docWith(
      { length: 24, width: 5.5, thickness: 0.75 },
      { length: 24.02, width: 5.5, thickness: 0.75 },
    ));
    expect(list.groups[0].rows).toHaveLength(1);
    expect(list.groups[0].rows[0].qty).toBe(2);
    expect(list.groups[0].rows[0].stockInches).toBeCloseTo(198.0825, 6);
    expect(list.groups[0].rows[0].stockInches).not.toBeCloseTo(198, 6);
  });

  it('ignores cuts — board feet is stock bought, not stock remaining', () => {
    // A dado does not reduce the board you buy. Spec section 1. If someone
    // "fixes" this by subtracting removed stock, this test is what stops them.
    const dado: Cut = {
      id: 'c1', face: 'thickness', from: 'max', across: 'width',
      offset: 6, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0,
    };
    const plain = buildCutList(docWith({ length: 24, width: 5.5, thickness: 0.75 }));
    const dadoed = buildCutList(docWith({ length: 24, width: 5.5, thickness: 0.75, cuts: [dado] }));
    expect(dadoed.groups[0].rows[0].stockInches)
      .toBeCloseTo(plain.groups[0].rows[0].stockInches, 10);
    expect(dadoed.groups[0].rows[0].stock).toBe('0.69 bd ft');
  });

  it('reports square feet for sheet goods, with thickness absent from the maths', () => {
    // 24 * 30 = 720 square inches; /144 = 5.00. Thickness must not appear.
    const list = buildCutList(docWith(
      { material: 'plywood', length: 24, width: 30, thickness: 0.75 },
    ));
    expect(list.groups[0].rows[0].stock).toBe('5.00 sq ft');
    expect(list.groups[0].rows[0].stockInches).toBeCloseTo(720, 10);
  });

  it('reports square feet for MDF too', () => {
    const list = buildCutList(docWith(
      { material: 'mdf', length: 12, width: 12, thickness: 0.5 },
    ));
    expect(list.groups[0].rows[0].stock).toBe('1.00 sq ft');
  });

  it('subtotals a group as the sum of its rows', () => {
    const list = buildCutList(docWith(
      { length: 24, width: 5.5, thickness: 0.75 },   // 99
      { length: 36, width: 7.25, thickness: 0.75 },  // 195.75
    ));
    const group = list.groups[0];
    expect(group.rows).toHaveLength(2);
    const summed = group.rows.reduce((n, r) => n + r.stockInches, 0);
    expect(group.stockInches).toBeCloseTo(summed, 10);
    expect(group.stockInches).toBeCloseTo(294.75, 10);
    expect(group.stock).toBe('2.05 bd ft');
  });

  it('gives a sheet-goods group its own unit', () => {
    const list = buildCutList(docWith(
      { material: 'plywood', length: 24, width: 30, thickness: 0.75 },
      { material: 'pine', length: 24, width: 5.5, thickness: 0.75 },
    ));
    const ply = list.groups.find((g) => g.material === 'plywood')!;
    const pine = list.groups.find((g) => g.material === 'pine')!;
    expect(ply.stock).toBe('5.00 sq ft');
    expect(pine.stock).toBe('0.69 bd ft');
  });
});

describe('sheet nesting on the cut list', () => {
  it('gives a sheet-goods group a nesting', () => {
    const list = buildCutList(docWith(
      { material: 'plywood', thickness: 0.75, length: 24, width: 12 },
    ));
    expect(list.groups[0].nesting?.label).toBe('1 sheet (96" × 48")');
    expect(list.groups[0].nesting?.sheets).toHaveLength(1);
  });

  it('gives a solid-stock group none', () => {
    const list = buildCutList(docWith({ material: 'pine' }));
    expect(list.groups[0].nesting).toBeUndefined();
  });

  // Every board in the group is packed, not one rectangle per ROW: a row is
  // representative, and four identical parts still need four rectangles.
  it('packs every board, not every row', () => {
    const list = buildCutList(docWith(
      ...Array.from({ length: 4 }, () => ({ material: 'plywood', thickness: 0.75, length: 24, width: 12 })),
    ));
    expect(list.groups[0].rows).toHaveLength(1);
    expect(list.groups[0].rows[0].qty).toBe(4);
    expect(list.groups[0].nesting!.sheets.flatMap((s) => s.parts)).toHaveLength(4);
  });

  it('packs each thickness onto its own sheets', () => {
    const list = buildCutList(docWith(
      { material: 'plywood', thickness: 0.75, length: 24, width: 12 },
      { material: 'plywood', thickness: 0.5, length: 24, width: 12 },
    ));
    expect(list.groups).toHaveLength(2);
    for (const g of list.groups) expect(g.nesting!.sheets).toHaveLength(1);
  });

  it("uses the document's kerf", () => {
    const four = Array.from({ length: 4 }, () => (
      { material: 'plywood', thickness: 0.75, length: 24, width: 12 }));
    const tight = { ...docWith(...four), stock: { kerf: 0 } };
    const wide = { ...docWith(...four), stock: { kerf: 0.125 } };
    expect(buildCutList(tight).groups[0].nesting!.sheets[0].parts.map((p) => p.x))
      .toEqual([0, 24, 48, 72]);
    expect(buildCutList(wide).groups[0].nesting!.sheets[0].parts.map((p) => p.y))
      .toEqual([0, 0, 0, 12.125]);
  });
});

describe('tenons on the sheet (fu 180)', () => {
  const dado = (): Cut => ({
    id: 'c1', face: 'thickness', from: 'min', across: 'width',
    offset: 6, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0,
  });
  const cheek = (id: string, from: 'min' | 'max', end: 'min' | 'max'): Cut => ({
    id, face: 'thickness', from, across: 'width', offset: end === 'min' ? 0 : 23, width: 1, depth: 0.25, stopMin: 0, stopMax: 0,
  });
  const shoulder = (id: string, from: 'min' | 'max', end: 'min' | 'max'): Cut => ({
    id, face: 'width', from, across: 'thickness', offset: end === 'min' ? 0 : 23, width: 1, depth: 0.5, stopMin: 0, stopMax: 0,
  });
  const tenon = (end: 'min' | 'max', p: string) =>
    [cheek(`${p}1`, 'min', end), cheek(`${p}2`, 'max', end), shoulder(`${p}3`, 'min', end), shoulder(`${p}4`, 'max', end)];

  it('prints one line per tenon, replacing its shoulder lines', () => {
    // The default board is 24 × 5-1/2 × 3/4: tenon 1 long, 1/4 thick, 4-1/2 wide.
    const list = buildCutList(docWith({ cuts: [...tenon('min', 'a'), ...tenon('max', 'b')] }));
    expect(list.groups[0].rows[0].setup).toEqual([
      '1" tenon, 1/4" thick × 4-1/2" wide — at the length min end',
      '1" tenon, 1/4" thick × 4-1/2" wide — at the length max end',
    ]);
  });

  it('puts the tenon line where its first cut stood (spec 4.1)', () => {
    const [a1, a2, a3, a4] = tenon('min', 'a');
    const list = buildCutList(docWith({ cuts: [a1, a2, dado(), a3, a4] }));
    expect(list.groups[0].rows[0].setup).toEqual([
      '1" tenon, 1/4" thick × 4-1/2" wide — at the length min end',
      '3/4" dado, 1/4" deep — into the thickness face (min side), 6" from the length min end, running across the width',
    ]);
  });

  it('prints a dado beside a tenon exactly as before', () => {
    const list = buildCutList(docWith({ cuts: [...tenon('min', 'a'), dado()] }));
    expect(list.groups[0].rows[0].setup).toEqual([
      '1" tenon, 1/4" thick × 4-1/2" wide — at the length min end',
      '3/4" dado, 1/4" deep — into the thickness face (min side), 6" from the length min end, running across the width',
    ]);
  });
});

describe('a stop with no stock in its gap is not printed (cut-words spec §2.4)', () => {
  const backRabbet: Cut = { id: 'r', face: 'width', from: 'min', across: 'length', offset: 0.375, width: 0.375, depth: 0.25, stopMin: 0, stopMax: 0 };
  const housing: Cut = { id: 'h', face: 'thickness', from: 'max', across: 'width', offset: 24, width: 0.75, depth: 0.25, stopMin: 0.25, stopMax: 0 };
  const setup = (cuts: Cut[]) => buildCutList(docWith({ length: 72, width: 11.25, thickness: 0.75, cuts })).groups[0].rows[0].setup;
  it('a housing running out into the back rabbet prints as a plain dado', () => {
    expect(setup([backRabbet, housing])[1]).toBe(
      '3/4" dado, 1/4" deep — into the thickness face (max side), 24" from the length min end, running across the width');
  });
  const frontRabbet: Cut = { ...backRabbet, id: 'f', from: 'max' };
  it('a housing running out into a rabbet at the max side prints no stop clause', () => {
    expect(setup([frontRabbet, { ...housing, stopMin: 0, stopMax: 0.25 }])[1]).toBe(
      '3/4" dado, 1/4" deep — into the thickness face (max side), 24" from the length min end, running across the width');
  });
  it('with the min end stopped 3/4 it prints only the min stop', () => {
    expect(setup([frontRabbet, { ...housing, stopMin: 0.75, stopMax: 0.25 }])[1]).toBe(
      '3/4" stopped dado, 1/4" deep — into the thickness face (max side), 24" from the length min end, running across the width, stopped 3/4" short of the min end');
  });
  it('with no rabbet, the stop still prints', () => {
    expect(setup([housing])[0]).toBe(
      '3/4" stopped dado, 1/4" deep — into the thickness face (max side), 24" from the length min end, running across the width, stopped 1/4" short of the min end');
  });
});

describe('the setup line is written from the shape (cut-lines spec §2.2)', () => {
  const dado = (over: Partial<Cut> = {}): Cut => ({
    id: 'c1', face: 'thickness', from: 'min', across: 'width',
    offset: 6, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0, ...over,
  });
  const line = (c: Cut) => buildCutList(docWith({ cuts: [c] })).groups[0].rows[0].setup[0];
  const both = (a: Cut, b: Cut, expected: string) => { expect(line(a)).toBe(expected); expect(line(b)).toBe(expected); };

  it('a dado prints one line whichever way it is stored', () => {
    both(dado(), dado({ across: 'length', offset: 0, width: 5.5, stopMin: 6, stopMax: 17.25 }),
      '3/4" dado, 1/4" deep — into the thickness face (min side), 6" from the length min end, running across the width');
  });

  it('a square edge notch prints one line whichever way it is stored (cut-storage §2)', () => {
    both(dado({ stopMin: 4.75 }), dado({ across: 'length', offset: 4.75, width: 0.75, stopMin: 6, stopMax: 17.25 }),
      '3/4" notch, 1/4" deep — into the thickness face (min side), 6" from the length min end, running across the width, stopped 4-3/4" short of the min end');
  });

  it('a rabbet, either storage', () => {
    both(dado({ offset: 0 }), dado({ across: 'length', offset: 0, width: 5.5, stopMin: 0, stopMax: 23.25 }),
      '3/4" rabbet, 1/4" deep — into the thickness face (min side), 0" from the length min end, running across the width');
  });

  it('a stopped dado, either storage', () => {
    both(dado({ stopMax: 1 }), dado({ across: 'length', offset: 0, width: 4.5, stopMin: 6, stopMax: 17.25 }),
      '3/4" stopped dado, 1/4" deep — into the thickness face (min side), 6" from the length min end, running across the width, stopped 1" short of the max end');
  });

  it('a mortise, either storage', () => {
    both(dado({ across: 'length', offset: 2, width: 0.5, depth: 0.625, stopMin: 6, stopMax: 15 }),
      dado({ across: 'width', offset: 6, width: 3, depth: 0.625, stopMin: 2, stopMax: 3 }),
      '1/2" mortise, 5/8" deep — into the thickness face (min side), 2" from the width min end, running across the length, stopped 6" short of the min end and 15" short of the max end');
  });

  it('a cut hanging past the end prints where it really is, never a negative distance', () => {
    expect(line(dado({ offset: -0.25, width: 1 }))).toBe(
      '3/4" rabbet, 1/4" deep — into the thickness face (min side), 0" from the length min end, running across the width');
  });

  it('a housing opened by another cut prints the same line with the cuts in either order', () => {
    const backRabbet: Cut = { id: 'r', face: 'width', from: 'min', across: 'length', offset: 0.375, width: 0.375, depth: 0.25, stopMin: 0, stopMax: 0 };
    const housing: Cut = { id: 'h', face: 'thickness', from: 'max', across: 'length', offset: 0.25, width: 10.25, depth: 0.25, stopMin: 24, stopMax: 47.25 };
    const setup = (cuts: Cut[]) => buildCutList(docWith({ length: 72, width: 11.25, thickness: 0.75, cuts })).groups[0].rows[0].setup;
    const expected = '3/4" stopped dado, 1/4" deep — into the thickness face (max side), 24" from the length min end, running across the width, stopped 3/4" short of the max end';
    expect(setup([backRabbet, housing])[1]).toBe(expected);
    expect(setup([housing, backRabbet])[0]).toBe(expected);
  });

  it('never prints a stop after a through word (seeded search)', () => {
    let seed = 192; // mulberry32, deterministic
    const rnd = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const DIMS = ['length', 'width', 'thickness'] as const;
    const size = { length: 24, width: 5.5, thickness: 0.75 };
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
    const sixteenths = (max: number) => Math.max(1, Math.round(rnd() * max * 16)) / 16;
    let through = 0;
    for (let i = 0; i < 2000; i++) {
      const face = pick(DIMS);
      const across = pick(DIMS.filter((d) => d !== face));
      const pos = DIMS.find((d) => d !== face && d !== across)!;
      const c: Cut = {
        id: 'c', face, from: pick(['min', 'max'] as const), across,
        offset: sixteenths(size[pos]) - 1 / 16, width: sixteenths(size[pos]), depth: sixteenths(size[face]),
        stopMin: rnd() < 0.5 ? 0 : sixteenths(size[across] / 2), stopMax: rnd() < 0.5 ? 0 : sixteenths(size[across] / 2),
      };
      const setup = buildCutList(docWith({ cuts: [c] })).groups[0].rows[0].setup;
      if (setup.length === 0) continue;
      if (/^\S+ (dado|groove|rabbet),/.test(setup[0])) {
        through++;
        expect(setup[0]).not.toContain('stopped');
      }
    }
    expect(through).toBeGreaterThan(100);
  });
});

describe('mirrored copies on the cut list (mirrored-instances spec §6)', () => {
  const pair = (b: Board): SloydDocument => ({
    ...createDocument('Pair'),
    instances: [
      { id: 'l', name: 'Left', definition: 'd', position: [0, 0, 0], rotation: 0 },
      { id: 'r', name: 'Right', definition: 'd', position: [40, 0, 0], rotation: 0, mirrored: true },
    ],
    definitions: [{ id: 'd', boards: [{ ...b, id: 'p' }], instances: [], hardware: [] }],
  });
  const rowsOf = (d: SloydDocument) => buildCutList(flatDocument(d)).groups.flatMap((g) => g.rows);
  it('a one-handed part and its mirror are two rows; a symmetric part is one row of 2', () => {
    expect(rowsOf(pair(chiralPart('flat')))).toHaveLength(2);
    const plain = createBoard({ name: 'Plain', length: 20, width: 6, thickness: 0.75 });
    const rows = rowsOf(pair(plain));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.qty).toBe(2);
  });
});

describe('mirrored links on the cut list (mirrored-links spec §6.1, fu 432)', () => {
  // One Shape, two users, the second its mirror image (schema 21): the cut list reads the RESOLVED flat parts, so the
  // mirrored user's features are in its own hand and the row split is the same as two plain parts'.
  const linkedPair = (b: Board): SloydDocument => ({
    ...createDocument('Linked pair'),
    shapes: [{ id: 'sh', ...sharedOf(b) }],
    boards: [
      { id: 'l', name: 'Left', position: [0, 0, 0], rotation: b.rotation, shape: 'sh' },
      { id: 'r', name: 'Right', position: [40, 0, 0], rotation: b.rotation, shape: 'sh', mirrored: true },
    ],
  });
  const rowsOf = (d: SloydDocument) => buildCutList(flatDocument(d)).groups.flatMap((g) => g.rows);
  it('a one-handed mirrored pair is two rows, one part each', () => {
    const rows = rowsOf(linkedPair(chiralPart('flat')));
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.qty)).toEqual([1, 1]);
    expect(rows.flatMap((r) => r.boardIds).sort()).toEqual(['l', 'r']);
  });
  it('a symmetric mirrored pair is one row of 2', () => {
    const rows = rowsOf(linkedPair(createBoard({ name: 'Plain', length: 20, width: 6, thickness: 0.75 })));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.qty).toBe(2);
    expect([...rows[0]!.boardIds].sort()).toEqual(['l', 'r']);
  });
});

describe('angle cuts on the cut list (spec §4)', () => {
  const taper = { id: 'a1', kind: 'taper' as const, face: 'width' as const, from: 'min' as const, along: 'length' as const, alongFrom: 'min' as const, points: [[0, 0.625], [24, 0]] as [[number, number], [number, number]] };
  const legs = (extra: Partial<Board>[]) => ({ ...createDocument('T'), boards: extra.map((x, i) => createBoard({ id: `l${i}`, name: `Leg ${i}`, length: 29, width: 1.75, thickness: 1.75, material: 'oak', ...x })) });

  it('a tapered leg and a straight one are two rows', () => {
    expect(buildCutList(legs([{ angleCuts: [taper] }, {}]) as FlatDocument).groups[0]!.rows).toHaveLength(2);
  });
  it('two identical tapers are one row, whatever their ids', () => {
    const rows = buildCutList(legs([{ angleCuts: [taper] }, { angleCuts: [{ ...taper, id: 'zz' }] }]) as FlatDocument).groups[0]!.rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.setup).toContain('Taper 5/8" off the width face (min side), from 24" from the length min end to that end');
  });
  it('a taper that removes nothing neither prints nor splits the row (Review Focus 3)', () => {
    const none = { ...taper, points: [[40, 0], [50, 1]] as [[number, number], [number, number]] };
    const rows = buildCutList(legs([{ angleCuts: [none] }, {}]) as FlatDocument).groups[0]!.rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.setup).toEqual([]);
  });
  it('a mortised, tapered leg prints both, the angle after the pocket', () => {
    const mortise = { id: 'c1', face: 'width' as const, from: 'max' as const, across: 'thickness' as const, offset: 24, width: 3, depth: 1, stopMin: 0.5, stopMax: 0.5 };
    const setup = buildCutList(legs([{ cuts: [mortise], angleCuts: [taper] }]) as FlatDocument).groups[0]!.rows[0]!.setup;
    expect(setup).toHaveLength(2);
    expect(setup[1]).toMatch(/^Taper /);
  });
  it('two rails mitered alike but for the long-point side are two rows with different lines (fu 294)', () => {
    const m = (alongFrom: 'min' | 'max') => ({ id: 'm', kind: 'miter' as const, face: 'length' as const, from: 'max' as const, along: 'width' as const, alongFrom, points: [[0, 0], [2.5, 2.5]] as [[number, number], [number, number]] });
    const rows = buildCutList(legs([{ length: 24, width: 2.5, thickness: 0.75, angleCuts: [m('min')] }, { length: 24, width: 2.5, thickness: 0.75, angleCuts: [m('max')] }]) as FlatDocument).groups[0]!.rows;
    expect(rows).toHaveLength(2);
    const lines = rows.map((r) => r.setup.find((l) => l.startsWith('Miter ')));
    expect(lines).toContain('Miter 45.0° across the width at the length max end, long point on the width min side');
    expect(lines).toContain('Miter 45.0° across the width at the length max end, long point on the width max side');
  });
  it('stock is unchanged by an angle cut (inv 18)', () => {
    const a = buildCutList(legs([{ angleCuts: [taper] }]) as FlatDocument).groups[0]!.stockInches;
    const b = buildCutList(legs([{}]) as FlatDocument).groups[0]!.stockInches;
    expect(a).toBe(b);
  });
  const m = (from: 'min' | 'max', kind: 'miter' | 'bevel' = 'miter') => ({ id: `m${from}`, kind, face: 'length' as const, from, along: 'width' as const, alongFrom: 'min' as const, points: [[0, 0], [2.5, 2.5]] as [[number, number], [number, number]] });
  const rails = (x: Partial<Board>[]) => buildCutList(legs(x.map((b) => ({ length: 24, width: 2.5, thickness: 0.75, ...b }))) as FlatDocument).groups[0]!.rows;
  it('angle cuts added in either order are one row', () => {
    expect(rails([{ angleCuts: [m('min'), m('max')] }, { angleCuts: [m('max'), m('min')] }])).toHaveLength(1);
  });
  it('the same geometry with a different kind is two rows', () => {
    expect(rails([{ angleCuts: [m('max')] }, { angleCuts: [m('max', 'bevel')] }])).toHaveLength(2);
  });
  it('a mitered rail ends its setup with the short point', () => {
    const setup = rails([{ angleCuts: [m('min'), m('max')] }])[0]!.setup;
    expect(setup[setup.length - 1]).toBe('Short point 19"');
  });
});

describe('holes on the cut list (spec §4)', () => {
  const r1 = { id: 'h1', face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.375, along: 'length' as const, alongFrom: 'min' as const, station: 2, count: 3, pitch: 1.25, acrossFrom: 'min' as const, inset: 1.5 };
  const r2 = { ...r1, id: 'h2', acrossFrom: 'max' as const };
  const sides = (extra: Partial<Board>[]) => ({ ...createDocument('T'), boards: extra.map((x, i) => createBoard({ id: `s${i}`, name: `Side ${i}`, length: 30, width: 11.25, thickness: 0.75, material: 'oak', ...x })) });
  it('a drilled side and a plain one are two rows', () => {
    expect(buildCutList(sides([{ holes: [r1] }, {}]) as FlatDocument).groups[0]!.rows).toHaveLength(2);
  });
  it('two single bores that once had different pitches are one row (fu 338)', () => {
    const one = { ...r1, count: 1, pitch: 0 };
    expect(buildCutList(sides([{ holes: [one] }, { holes: [{ ...one, pitch: 1.25 }] }]) as FlatDocument).groups[0]!.rows).toHaveLength(1);
  });
  it('the same rows in another order, other ids, are one row (Review Focus 5)', () => {
    const rows = buildCutList(sides([{ holes: [r1, r2] }, { holes: [{ ...r2, id: 'x' }, { ...r1, id: 'y' }] }]) as FlatDocument).groups[0]!.rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.setup.filter((l) => l.startsWith('Row of 3 holes'))).toHaveLength(2);
  });
  it('hole lines print after the angle lines', () => {
    const taper = { id: 'a1', kind: 'taper' as const, face: 'width' as const, from: 'min' as const, along: 'length' as const, alongFrom: 'min' as const, points: [[0, 0.625], [24, 0]] as [[number, number], [number, number]] };
    const setup = buildCutList(sides([{ angleCuts: [taper], holes: [r1] }]) as FlatDocument).groups[0]!.rows[0]!.setup;
    expect(setup.findIndex((l) => l.startsWith('Row of'))).toBeGreaterThan(setup.findIndex((l) => l.startsWith('Taper')));
  });
  it('a faulted row prints as stored, with its fault (Review Focus 2)', () => {
    const off = { ...r1, station: 29, count: 3 };
    const line = buildCutList(sides([{ holes: [off] }]) as FlatDocument).groups[0]!.rows[0]!.setup.find((l) => l.startsWith('Row of'))!;
    expect(line).toContain('last at 31-1/2"');
    expect(line).toMatch(/ — check: hole 2 runs past the length max end \(and 1 more\)$/);
  });
});

describe('custom materials (custom materials spec §3)', () => {
  const ash = { id: 'm-s-ash1', label: 'Ash', color: '#d8c8a8', kind: 'solid' as const };
  const birch = { id: 'm-v-bb55', label: 'Baltic birch 5×5', color: '#e8d8b8', kind: 'sheet-veneered' as const, sheet: { length: 60, width: 60, rotate: 'grain' as const } };
  const cdoc = (boards: Board[], materials = [ash, birch]) => ({ ...createDocument(), boards, materials }) as FlatDocument;

  it('labels a custom group and counts it in board feet', () => {
    const list = buildCutList(cdoc([createBoard({ id: 'a', name: 'A', material: 'm-s-ash1', length: 12, width: 12, thickness: 1 })]));
    expect(list.groups[0]!.label).toMatch(/^Ash — /);
    expect(list.groups[0]!.stock).toMatch(/bd ft/);
    expect(list.groups[0]!.sheet).toBeUndefined();
  });
  it('nests a custom sheet on ITS sheet size', () => {
    const list = buildCutList(cdoc([createBoard({ id: 'a', name: 'A', material: 'm-v-bb55', length: 50, width: 50, thickness: 0.5 })]));
    const g = list.groups[0]!;
    expect(g.sheet).toEqual({ length: 60, width: 60, rotate: 'grain' });
    expect(g.nesting!.sheets).toHaveLength(1);
    // A 50 × 50 part fits a 60 × 60 sheet; on a 96 × 48 sheet it would not.
    expect(g.nesting!.unplaceable).toHaveLength(0);
  });
  it('sorts groups by LABEL, so Ash sorts before Oak', () => {
    const list = buildCutList(cdoc([createBoard({ id: 'o', name: 'O', material: 'oak' }), createBoard({ id: 'a', name: 'A', material: 'm-s-ash1' })]));
    expect(list.groups.map((g) => g.material)).toEqual(['m-s-ash1', 'oak']);
  });
});

describe('nominal names on rows (custom materials spec §5.3)', () => {
  const spf = { id: 'm-s-spf1', label: 'SPF', color: '#e0c890', kind: 'solid' as const, nominal: true as const };
  const list = (boards: Board[], materials = [spf]) => buildCutList({ ...createDocument(), boards, materials } as FlatDocument);
  const part = (id: string, material: string, width: number, thickness: number, length = 36) =>
    createBoard({ id, name: id, material, width, thickness, length });

  it('a pine 3/4 × 3-1/2 row reads 1×4; the same oak row has no name', () => {
    const l = list([part('a', 'pine', 3.5, 0.75), part('b', 'oak', 3.5, 0.75)]);
    const row = (m: string) => l.groups.find((g) => g.material === m)!.rows[0]!;
    expect(row('pine').nominal).toBe('1×4');
    expect(row('oak').nominal).toBeNull();
  });
  it('a nominal custom material names 2×4, either way round', () => {
    expect(list([part('a', 'm-s-spf1', 3.5, 1.5)]).groups[0]!.rows[0]!.nominal).toBe('2×4');
    expect(list([part('a', 'm-s-spf1', 1.5, 3.5)]).groups.flatMap((g) => g.rows)[0]!.nominal).toBe('2×4');
  });
  it('a row whose boards print alike but are not all the section has NO name', () => {
    const l = list([part('a', 'm-s-spf1', 3.5, 1.5), part('b', 'm-s-spf1', 3.5 + 1e-6, 1.5)]);
    const rows = l.groups[0]!.rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.qty).toBe(2);
    expect(rows[0]!.nominal).toBeNull();
  });
  it('switching the material off clears the name', () => {
    expect(list([part('a', 'm-s-spf1', 3.5, 1.5)], [{ ...spf, nominal: undefined } as never]).groups[0]!.rows[0]!.nominal).toBeNull();
  });
  it('3/8 short is no name', () => {
    expect(list([part('a', 'pine', 3.375, 0.75)]).groups[0]!.rows[0]!.nominal).toBeNull();
  });
});

describe('metric display (units chunk 1)', () => {
  const MMU = { display: 'metric-mm' as const, precision: 16 };
  it('a metric project: rows, label and lines in whole mm', () => {
    const doc = { ...createDocument('M'), units: MMU,
      boards: [createBoard({ name: 'Side', length: 30, width: 11.25, thickness: 0.75 })] };
    const list = buildCutList(doc);
    expect(list.groups[0]!.label).toMatch(/— 19 mm$/);
    expect(list.groups[0]!.rows[0]!.dims).toBe('762 × 286 mm');
  });
  it('metric collapses at whole mm (inv 18): 24" and 24.034" share a row (imperial 1/16 would split them)', () => {
    const doc = { ...createDocument('M'), units: MMU,
      boards: [createBoard({ name: 'A', length: 24 }), createBoard({ name: 'B', length: 24.034 })] };
    expect(buildCutList(doc).groups[0]!.rows).toHaveLength(1);
  });
  it('imperial keeps 24" and 24.2" apart at 1/16 (the metric collapse is whole mm only)', () => {
    const doc = { ...createDocument('M'),
      boards: [createBoard({ name: 'A', length: 24 }), createBoard({ name: 'B', length: 24.2 })] };
    expect(buildCutList(doc).groups[0]!.rows).toHaveLength(2);
  });
});

describe('metric part diagram notes (units chunk 1)', () => {
  const MMU = { display: 'metric-mm' as const, precision: 16 };
  it('a holed part: the hole note reads in mm', () => {
    const hole = { id: 'h', face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.375, along: 'length' as const,
      alongFrom: 'min' as const, station: 2, count: 1, pitch: 0, acrossFrom: 'min' as const, inset: 1.5 };
    const doc = { ...createDocument('M'), units: MMU, boards: [createBoard({ name: 'Side', length: 30, width: 11.25, thickness: 0.75, holes: [hole] })] };
    const notes = buildCutList(doc).groups[0]!.rows[0]!.diagrams.flatMap((d) => d.holeNotes);
    expect(notes.length).toBeGreaterThan(0);
    expect(notes[0]!.text).toContain(' mm');
    expect(notes[0]!.text).not.toContain('"');
  });
});

describe('curves on the cut list (spec §4)', () => {
  const aprons = (extra: Partial<Board>[]) => ({ ...createDocument('T'), boards: extra.map((x, i) => createBoard({ id: `a${i}`, name: `Apron ${i}`, length: 30, width: 5, thickness: 0.75, material: 'oak', ...x })) });
  const corner = { id: 'k', ...cornerCurve({ through: 'thickness', uFrom: 'max', vFrom: 'max', radius: 1 }) };
  it('an arched apron and a plain one are two rows', () => {
    expect(buildCutList(aprons([{ curves: [ARCH] }, {}]) as FlatDocument).groups[0]!.rows).toHaveLength(2);
  });
  it('the same curves in another order, other ids, are one row (Review Focus 5)', () => {
    const rows = buildCutList(aprons([{ curves: [ARCH, corner] }, { curves: [{ ...corner, id: 'x' }, { ...ARCH, id: 'y' }] }]) as FlatDocument).groups[0]!.rows;
    expect(rows).toHaveLength(1);
  });
  it('curve lines print after the hole lines, and the stock is the box (inv 18)', () => {
    const pin = { id: 'h1', face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.375, along: 'length' as const, alongFrom: 'min' as const, station: 1, count: 1, pitch: 0, acrossFrom: 'max' as const, inset: 1 };
    const row = buildCutList(aprons([{ holes: [pin], curves: [ARCH] }]) as FlatDocument).groups[0]!.rows[0]!;
    expect(row.setup.findIndex((l) => l.startsWith('Arch'))).toBeGreaterThan(row.setup.findIndex((l) => l.startsWith('Hole')));
    expect(row.length).toBe(30);
    expect(row.width).toBe(5);
  });
});

// Fu 54: a group's key is its rows' key prefix, so no field can split boards into two groups while one row holds them —
// which would print a group heading with no rows under it.
describe('every group has its rows (fu 54)', () => {
  it('no group is empty and every board is counted once, across materials, thicknesses, names and grain', () => {
    const doc = createDocument('Mix');
    const b = (o: Partial<Board>) => createBoard({ length: 24, width: 6, thickness: 0.75, ...o });
    doc.boards.push(
      b({ name: 'Left', material: 'pine' }), b({ name: 'Right', material: 'pine' }),
      b({ name: 'Thick', material: 'pine', thickness: 1.5 }),
      b({ name: 'Oak', material: 'oak' }), b({ name: 'Oak across', material: 'oak', grain: 'width' }),
      b({ name: 'Panel', material: 'plywood', length: 30, width: 20 }), b({ name: 'Panel 2', material: 'plywood', length: 30, width: 20 }),
    );
    const list = buildCutList(doc);
    for (const g of list.groups) expect(g.rows.length, g.label).toBeGreaterThan(0);
    expect(list.groups.flatMap((g) => g.rows).reduce((n, r) => n + r.qty, 0)).toBe(doc.boards.length);
  });
});

// Plans balloons spec §2: one number per row, in display order, assigned once by buildCutList.
describe('row numbers and board ids (plans balloons §2)', () => {
  const mixed = () => {
    const doc = createDocument('Numbers');
    const b = (o: Partial<Board>) => createBoard({ length: 24, width: 6, thickness: 0.75, ...o });
    // Document order is NOT display order (pine first): numbering before the group sort would show.
    doc.boards.push(
      b({ name: 'Pine long', material: 'pine', length: 30 }),
      b({ name: 'Oak short', material: 'oak', length: 12 }),
      b({ name: 'Oak long', material: 'oak', length: 30 }),
      b({ name: 'Pine long 2', material: 'pine', length: 30 }),
      b({ name: 'Panel', material: 'plywood', length: 30, width: 20 }),
    );
    return doc;
  };
  it('numbers rows 1..N in the order the cut list displays them, across groups', () => {
    const list = buildCutList(mixed());
    const rows = list.groups.flatMap((g) => g.rows);
    expect(rows.map((r) => r.number)).toEqual(rows.map((_, i) => i + 1));
    // Display order: groups by material label (Oak, Pine, Plywood), rows by length descending.
    expect(rows.map((r) => r.names.join('+'))).toEqual(['Oak long', 'Oak short', 'Pine long+Pine long 2', 'Panel']);
  });
  it('lists every board in exactly one row, by id, in document order', () => {
    const doc = mixed();
    const rows = buildCutList(doc).groups.flatMap((g) => g.rows);
    expect(rows.flatMap((r) => r.boardIds).sort()).toEqual(doc.boards.map((b) => b.id).sort());
    const pine = rows.find((r) => r.qty === 2)!;
    expect(pine.boardIds).toEqual([doc.boards[0].id, doc.boards[3].id]);
  });
  it('renumbers when an edit re-sorts the rows', () => {
    const doc = mixed();
    const before = buildCutList(doc).groups.flatMap((g) => g.rows).find((r) => r.names[0] === 'Oak short')!.number;
    doc.boards[1] = { ...doc.boards[1], length: 40 }; // Oak short becomes the longest oak row
    const after = buildCutList(doc).groups.flatMap((g) => g.rows).find((r) => r.names[0] === 'Oak short')!.number;
    expect([before, after]).toEqual([2, 1]);
  });
});
it('two ogee loops differing only in facing are two rows with different words (profile runs b1, Task 8 fix round 1)', () => {
  const { curves, length, width, thickness } = topCorners(2);
  const ogee = (facing: 'face' | 'edge') => ({ ...loop('p1', 0.5, 'ogee'), facing });
  const list = buildCutList(docWith({ length, width, thickness, curves, profiles: [ogee('face')] }, { length, width, thickness, curves, profiles: [ogee('edge')] }));
  const rows = list.groups.flatMap((g) => g.rows);
  expect(rows).toHaveLength(2);
  expect(rows.map((r) => r.setup.at(-1)).sort()).toEqual([
    'Roman ogee 1/2" all round the thickness face (max side)',
    'Roman ogee 1/2" all round the thickness face (max side), top on the edge',
  ]);
});

describe('round tenons on the cut list (round tenons spec §8)', () => {
  const tenon: RoundTenon = { id: 't', end: 'max', diameter: 1, length: 3 };
  const foot: RoundTenon = { id: 'f', end: 'min', diameter: 1, length: 2 };
  const legs = (extra: Partial<Board>[]) => ({ ...createDocument('T'), boards: extra.map((x, i) => createBoard({ id: `l${i}`, name: `Leg ${i}`,
    length: 20, width: 2, thickness: 2, material: 'oak', ...x })) }) as FlatDocument;
  const rows = (extra: Partial<Board>[]) => buildCutList(legs(extra)).groups[0]!.rows;

  it('two identical tenoned legs are one row of 2, whatever their ids', () => {
    const r = rows([{ tenons: [tenon] }, { tenons: [{ ...tenon, id: 'other' }] }]);
    expect(r).toHaveLength(1);
    expect(r[0]!.qty).toBe(2);
  });
  it('a tenoned key: the curve field empty (its view curves are not curve cuts), the tenon field self-identifying, last', () => {
    expect(rows([{ tenons: [foot, tenon] }])[0]!.key).toBe('oak|2"|20"|2"|length|||||tenons:max:1:3;min:1:2');
  });
  it('a tenoned leg and a plain one are two rows', () => {
    expect(rows([{ tenons: [tenon] }, {}])).toHaveLength(2);
  });
  it('a FAULTED tenon (kept, not built) still splits the row: the signature reads the stored tenons', () => {
    const wide = { ...tenon, diameter: 2 };   // too-wide: no geometry, no view curves
    expect(rows([{ tenons: [wide] }, {}])).toHaveLength(2);
  });
  it('legs differing only in tenon length are two rows, EXACTLY: below display precision too (inv 18, 40)', () => {
    expect(rows([{ tenons: [tenon] }, { tenons: [{ ...tenon, length: 4 }] }])).toHaveLength(2);
    expect(rows([{ tenons: [tenon] }, { tenons: [{ ...tenon, length: 3 + 1 / 256 }] }])).toHaveLength(2);
  });
  it('the signature is order-independent: the same two tenons stored max-first are one row', () => {
    expect(rows([{ tenons: [foot, tenon] }, { tenons: [tenon, foot] }])).toHaveLength(1);
  });
  it('a tenoned leg\'s setup is its tenon line alone: no curve line for its view curves', () => {
    expect(rows([{ tenons: [tenon] }])[0]!.setup).toEqual(['1" round tenon, 3" long — at the length max end, shoulder 17" from the other end']);
  });
  it('the row\'s length is the blank\'s, tenon included (spec §3.1, inv 18)', () => {
    const r = rows([{ tenons: [tenon] }])[0]!;
    expect(r.length).toBe(20);
    expect(r.dims.startsWith('20" ')).toBe(true);
  });
  it('the bench line comes after the rectangular-cut lines and before the angle-cut lines', () => {
    const dado: Cut = { id: 'c1', face: 'width', from: 'max', across: 'thickness', offset: 8, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
    const miter: AngleCut = { id: 'm', kind: 'miter', face: 'length', from: 'min', along: 'width', alongFrom: 'min', points: [[0, 0.25], [2, 0.75]] };
    const setup = rows([{ tenons: [tenon], cuts: [dado], angleCuts: [miter] }])[0]!.setup;
    const at = setup.indexOf('1" round tenon, 3" long — at the length max end, shoulder 16-1/2" from the other end');
    expect(at, setup.join('\n')).toBe(1);
    expect(setup[2]).toMatch(/^Miter /);
  });

  it('a tenon-free row\'s key is unchanged: the joined Shaker table\'s keys as master computed them', () => {
    // Captured on master (df2cde7) before this task, from this same flow (bandFreeIdentity's shaker()). Never re-capture.
    const made = designToDocument(parseDesign(SHAKER_TABLE_JSON)!, { centre: false });
    const flat = flatDocument(made.doc);
    const sites = findSites(flat);
    const joined = applyJoints(flat, sites, sites.map((s) => defaultChoice(s, flat, sites)));
    const doc = flatDocument(migrateDocument(writeBackFlat(made.doc, flat.boards, worldParts(joined.doc))));
    expect(buildCutList(doc).groups.flatMap((g) => g.rows.map((r) => r.key))).toEqual([
      'oak|1-3/4"|28-1/4"|1-3/4"|length|thickness:max:length:0.25:0.75:0.5625:23.25:0;width:max:length:0.25:0.75:0.5625:23.25:0|taper:thickness:max:length:min:0:0.5:22.5:0;taper:width:max:length:min:0:0.5:22.5:0||',
      'oak|3/4"|32"|22"|length||||',
      'oak|3/4"|27-5/8"|5"|length||||',
      'oak|3/4"|17-5/8"|5"|length||||',
    ]);
  });
});

describe('box joints on the sheet (box joints spec §5.2)', () => {
  const layout = fingerLayout(4.5, 0.5)!;
  const notches = (fingerAtMin: boolean, end: 'min' | 'max', p: string): Cut[] =>
    notchCuts(layout, fingerAtMin, 'max', 'length', end, 'width', 0.5, Array.from({ length: fingerAtMin ? 4 : 5 }, (_, i) => `${p}${i}`));
  const cheek = (id: string, from: 'min' | 'max', end: 'min' | 'max'): Cut =>
    ({ id, face: 'thickness', from, across: 'width', offset: end === 'min' ? 0 : 17.5, width: 0.5, depth: 0.125, stopMin: 0, stopMax: 0 });
  const setupOf = (b: Partial<Board>) => buildCutList(docWith({ length: 18, width: 4.5, thickness: 0.5, ...b })).groups[0].rows[0].setup;
  const LINE = (who: string, end: string) => `Box joint — 9 fingers 1/2" wide, 1/2" deep, at the length ${end} end; this part has a ${who} at the width max edge.`;

  it('a planned drawer side: one Box joint line per jointed end, no notch, dado or rabbet line, the groove still listed', () => {
    const mk = (id: string, name: string, rotation: 0 | 90, length: number, pos: [number, number, number]) =>
      createBoard({ id, name, posture: 'on-edge', rotation, length, width: 4.5, thickness: 0.5, position: pos });
    const groove: Cut = { id: 'g', face: 'thickness', from: 'max', across: 'length', offset: 0.25, width: 0.25, depth: 0.25, stopMin: 0, stopMax: 0 };
    const side = (id: string, x: number) => ({ ...mk(id, id === 'l' ? 'Side left' : 'Side right', 90, 16, [x, 0, 0]), cuts: [groove] });
    const doc: SloydDocument = {
      ...createDocument('Drawer'),
      boards: [mk('f', 'Front', 0, 12.5, [0, 0, 0]), mk('b', 'Back', 0, 12.5, [0, 0, 15.5]), side('l', 0), side('r', 12)],
    };
    const plan = boxJointPlan(doc, ['f', 'b', 'l', 'r'], { width: 0.5, swap: false });
    if (typeof plan === 'string') throw new Error(plan);
    const out = applyBoxJoints(doc, plan);
    const row = buildCutList(flatDocument(out)).groups.flatMap((g) => g.rows).find((r) => r.names.includes('Side left'))!;
    const box = row.setup.filter((l) => l.startsWith('Box joint — '));
    expect(box).toHaveLength(2);
    expect(row.setup.filter((l) => /notch|dado|rabbet/.test(l))).toEqual([]);
    expect(row.setup.filter((l) => /groove/.test(l))).toHaveLength(1);
    expect(row.setup).toHaveLength(3);
  });

  it('prints the line before the tenon lines; a hand-made tenon at the other end is still printed', () => {
    expect(setupOf({ cuts: [...notches(true, 'min', 'n'), cheek('c1', 'min', 'max'), cheek('c2', 'max', 'max')] })).toEqual([
      LINE('finger', 'min'),
      '1/2" tenon, 1/4" thick × 4-1/2" wide — at the length max end',
    ]);
  });

  it('claims its notches BEFORE the tenon finder and the per-cut loop: cheeks at the finger end still make their own tenon', () => {
    // The cheeks alone are a tenon (ell 1/2); with the full-thickness notches in the finder's input they are not.
    expect(setupOf({ cuts: [...notches(false, 'min', 'n'), cheek('c1', 'min', 'min'), cheek('c2', 'max', 'min')] })).toEqual([
      LINE('notch', 'min'),
      '1/2" tenon, 1/4" thick × 4-1/2" wide — at the length min end',
    ]);
  });

  it('the line, literally: with an odd finger (named with its J edge), and an even count (the start edge read by parity)', () => {
    const odd = fingerLayout(4.25, 0.5)!;
    const oddCuts = notchCuts(odd, false, 'min', 'length', 'min', 'width', 0.5, ['a', 'b', 'c', 'd', 'e']);
    expect(buildCutList(docWith({ length: 18, width: 4.25, thickness: 0.5, cuts: oddCuts })).groups[0].rows[0].setup).toEqual([
      'Box joint — 9 fingers 1/2" wide (the odd one 1/4" at the width min edge), 1/2" deep, at the length min end; this part has a notch at the width max edge.',
    ]);
    const atMax = notchCuts(odd, true, 'max', 'length', 'max', 'width', 0.5, ['a', 'b', 'c', 'd']);
    expect(buildCutList(docWith({ length: 18, width: 4.25, thickness: 0.5, cuts: atMax })).groups[0].rows[0].setup).toEqual([
      'Box joint — 9 fingers 1/2" wide (the odd one 1/4" at the width max edge), 1/2" deep, at the length max end; this part has a finger at the width min edge.',
    ]);
    // 8 fingers, a finger at J's min: J's max (the start edge with no odd finger) is a notch.
    const even = notchCuts(fingerLayout(4, 0.5)!, true, 'max', 'length', 'min', 'width', 0.5, ['a', 'b', 'c', 'd']);
    expect(buildCutList(docWith({ length: 18, width: 4, thickness: 0.5, cuts: even })).groups[0].rows[0].setup).toEqual([
      'Box joint — 8 fingers 1/2" wide, 1/2" deep, at the length min end; this part has a notch at the width max edge.',
    ]);
  });

  it('a board with no finger set is unchanged', () => {
    expect(setupOf({ cuts: [cheek('c1', 'min', 'max'), cheek('c2', 'max', 'max')] })).toEqual([
      '1/2" tenon, 1/4" thick × 4-1/2" wide — at the length max end',
    ]);
  });
});
