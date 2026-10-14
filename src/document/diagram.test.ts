import { buildDiagrams, createBoard } from './document';
import type { Board, Cut } from './document';
import { axisFrame } from './geometry';
import type { Dimension } from './types';

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

describe('an overhanging cut is drawn by its clipped box (fu 197)', () => {
  const rabbet = (over: Partial<Cut>): Cut => dado({ across: 'width', offset: 0, width: 0.5, depth: 0.25, ...over });
  const shown = (c: Cut) => {
    const cuts = buildDiagrams(board(c), 16).flatMap((v) => v.cuts);
    expect(cuts).toHaveLength(1);
    const { h, v, axis, offsetLabel, widthLabel, kind } = cuts[0];
    return { h, v, axis, offsetLabel, widthLabel, kind };
  };

  it('past the MIN end draws the same as its flush twin', () => {
    const over = shown(rabbet({ offset: -0.5, width: 1 }));
    expect(over).toEqual(shown(rabbet({ offset: 0, width: 0.5 })));
    expect([over.h, over.v]).toContainEqual([0, 0.5]);
  });

  it('past the MAX end draws the same as its flush twin', () => {
    const over = shown(rabbet({ offset: 23.75, width: 1 }));
    expect(over).toEqual(shown(rabbet({ offset: 23.75, width: 0.25 })));
    expect([over.h, over.v]).toContainEqual([23.75, 24]);
  });
});

describe('true views (fu 215)', () => {
  const dirOf = (b: Board, d: Dimension): [number, number, number] => {
    const v: [number, number, number] = [0, 0, 0];
    axisFrame(b).forEach((a, i) => { if (a.dim === d) v[i] = a.reversed ? -1 : 1; });
    return v;
  };
  const det3 = (a: number[], b: number[], c: number[]) =>
    a[0]! * (b[1]! * c[2]! - b[2]! * c[1]!) - a[1]! * (b[0]! * c[2]! - b[2]! * c[0]!) + a[2]! * (b[0]! * c[1]! - b[1]! * c[0]!);

  it('every view is a TRUE view of its face seen from outside, in every posture and turn', () => {
    for (const posture of ['flat', 'on-edge', 'upright'] as const) for (const rotation of [0, 90, 180, 270] as const)
      for (const face of ['thickness', 'width', 'length'] as const) for (const from of ['min', 'max'] as const) {
        const other = (['length', 'width', 'thickness'] as const).filter((x) => x !== face);
        const b: Board = { ...createBoard({ length: 20, width: 6, thickness: 0.75, posture, rotation }),
          cuts: [{ id: 'c', face, from, across: other[0]!, offset: 0.1, width: 0.1, depth: 0.1, stopMin: 0, stopMax: 0 }] };
        const v = buildDiagrams(b, 16).find((x) => x.face === face && x.from === from)!;
        const right = dirOf(b, v.horizontal);
        const up = dirOf(b, v.vertical).map((x) => (v.vUp ? x : -x)); // page v grows DOWN unless vUp
        const toward = dirOf(b, face).map((x) => (from === 'max' ? x : -x)); // outward normal
        expect(det3(right, up, toward)).toBe(1);
      }
  });

  it('vUp exactly on thickness|min, width|max, length|min', () => {
    const cuts: Cut[] = [];
    for (const face of ['thickness', 'width', 'length'] as const) for (const from of ['min', 'max'] as const) {
      const other = (['length', 'width', 'thickness'] as const).filter((x) => x !== face);
      cuts.push({ id: `${face}${from}`, face, from, across: other[0]!, offset: 0.1, width: 0.1, depth: 0.1, stopMin: 0, stopMax: 0 });
    }
    const views = buildDiagrams(createBoard({ length: 20, width: 6, thickness: 0.75, cuts }), 16);
    expect(views).toHaveLength(6);
    expect(Object.fromEntries(views.map((v) => [v.key, v.vUp]))).toEqual({
      'thickness|min': true, 'thickness|max': false,
      'width|min': false, 'width|max': true,
      'length|min': true, 'length|max': false,
    });
  });
});

describe('angle cuts in part diagrams (spec §4.3)', () => {
  const taper = { id: 'a1', kind: 'taper' as const, face: 'width' as const, from: 'min' as const, along: 'length' as const, alongFrom: 'min' as const, points: [[0, 0.625], [24, 0]] as [[number, number], [number, number]] };
  const leg = () => createBoard({ length: 29, width: 1.75, thickness: 1.75, angleCuts: [taper] });

  it('draws the wedge in the view looking along the through dimension', () => {
    const views = buildDiagrams(leg(), 16);
    const v = views.find((x) => x.face === 'thickness' && x.from === 'min')!;
    expect(v.angles).toHaveLength(1);
    // h = length, v = width (DIMENSION_ORDER): a triangle (0,0) (0,0.625) (24,0).
    const pts = v.angles[0]!.poly.map(([h, w]) => `${Math.round(h * 1e9) / 1e9},${Math.round(w * 1e9) / 1e9}`).sort();
    expect(pts).toEqual(['0,0', '0,0.625', '24,0'].sort());
    expect(v.angles[0]!.label).toMatch(/^Taper 5\/8"/);
  });
  it('a cut-free board has no angles and still one view', () => {
    const views = buildDiagrams(createBoard({}), 16);
    expect(views).toHaveLength(1);
    expect(views[0]!.angles).toEqual([]);
  });
  it('an angle cut that removes nothing is not drawn', () => {
    const b = createBoard({ length: 29, width: 1.75, thickness: 1.75, angleCuts: [{ ...taper, points: [[40, 0], [50, 1]] }] });
    expect(buildDiagrams(b, 16).flatMap((v) => v.angles)).toEqual([]);
  });
  it('an angle cut that removes nothing does not even open its view', () => {
    const b = createBoard({ length: 29, width: 1.75, thickness: 1.75, angleCuts: [{ ...taper, face: 'thickness' as const, points: [[40, 0], [50, 1]] }] });
    expect(buildDiagrams(b, 16).map((v) => v.key)).toEqual(['thickness|min']);
  });
  it('a dado on the through face\'s max side: that view takes the wedge and no min view is opened (ruling 108)', () => {
    const dado: Cut = { id: 'c1', face: 'thickness', across: 'width', from: 'max', offset: 10, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
    const b = createBoard({ length: 29, width: 1.75, thickness: 1.75, cuts: [dado], angleCuts: [taper] });
    const views = buildDiagrams(b, 16);
    expect(views.map((v) => v.key)).toEqual(['thickness|max']);
    const pts = views[0]!.angles[0]!.poly.map(([h, w]) => `${Math.round(h * 1e9) / 1e9},${Math.round(w * 1e9) / 1e9}`).sort();
    expect(pts).toEqual(['0,0', '0,0.625', '24,0'].sort());
  });
  it('dadoes on both sides of the through face: both views take the same wedge', () => {
    const near: Cut = { id: 'c1', face: 'thickness', across: 'width', from: 'min', offset: 10, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
    const far: Cut = { ...near, id: 'c2', from: 'max' };
    const views = buildDiagrams(createBoard({ length: 29, width: 1.75, thickness: 1.75, cuts: [near, far], angleCuts: [taper] }), 16);
    expect(views.map((v) => v.key)).toEqual(['thickness|min', 'thickness|max']);
    expect(views[0]!.angles).toHaveLength(1);
    expect(views[1]!.angles).toEqual(views[0]!.angles);
  });
  it('a plain tapered part opens only the min-side through view', () => {
    expect(buildDiagrams(leg(), 16).map((v) => v.key)).toEqual(['thickness|min']);
  });
  it('draws in the other horizontal/vertical pairing (through = length: h = width, v = thickness)', () => {
    const bevel = { id: 'b1', kind: 'bevel' as const, face: 'thickness' as const, from: 'min' as const, along: 'width' as const, alongFrom: 'min' as const, points: [[0, 0.5], [1.75, 0]] as [[number, number], [number, number]] };
    const v = buildDiagrams(createBoard({ length: 29, width: 1.75, thickness: 1.75, angleCuts: [bevel] }), 16).find((x) => x.face === 'length' && x.from === 'min')!;
    expect([v.horizontal, v.vertical]).toEqual(['width', 'thickness']);
    const pts = v.angles[0]!.poly.map(([h, t]) => `${Math.round(h * 1e9) / 1e9},${Math.round(t * 1e9) / 1e9}`).sort();
    expect(pts).toEqual(['0,0', '0,0.5', '1.75,0'].sort());
  });
});

describe('holes in the part diagrams (holes spec §4.3, amended)', () => {
  const pins = { id: 'h1', face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.375, along: 'length' as const, alongFrom: 'min' as const, station: 2, count: 3, pitch: 1.25, acrossFrom: 'min' as const, inset: 1.5 };
  const side = (over: Record<string, unknown> = {}) => createBoard({ id: 's', length: 30, width: 11.25, thickness: 0.75, holes: [pins], ...over });

  it('a part without holes draws exactly what it drew before', () => {
    const plain = createBoard({ id: 's', length: 30, width: 11.25, thickness: 0.75 });
    expect(buildDiagrams({ ...plain, holes: [] }, 16)).toEqual(buildDiagrams(plain, 16));
    expect(buildDiagrams(plain, 16)[0]!.holes).toEqual([]);
  });
  it('a holed part with no cuts opens its ENTRY face view, with one circle per hole (Review Focus 4)', () => {
    const views = buildDiagrams(side(), 16);
    expect(views.map((v) => v.key)).toEqual(['thickness|max']);
    const v = views[0]!;
    expect(v.horizontal).toBe('length');
    expect(v.holes).toEqual([
      { row: 'h1', index: 0, h: 2, v: 1.5, r: 0.125 },
      { row: 'h1', index: 1, h: 3.25, v: 1.5, r: 0.125 },
      { row: 'h1', index: 2, h: 4.5, v: 1.5, r: 0.125 },
    ]);
    expect(v.holeNotes).toEqual([expect.stringMatching(/^Row of 3 holes 1\/4" dia × 3\/8" deep/)]);
  });
  it('a hole into an end opens the length view', () => {
    const dowel = { ...pins, id: 'd', face: 'length' as const, from: 'max' as const, diameter: 0.375, depth: 1, along: 'width' as const, station: 2, count: 1, acrossFrom: 'min' as const, inset: 0.375 };
    const views = buildDiagrams(side({ holes: [dowel] }), 16);
    expect(views.map((v) => v.key)).toEqual(['length|max']);
    expect(views[0]!.holes).toHaveLength(1);
  });
  it('a view across the axis that exists for another reason shows the depth outline (dashed), not a circle', () => {
    const rabbet = { id: 'c1', face: 'width' as const, from: 'min' as const, across: 'length' as const, offset: 0, width: 0.25, depth: 0.25, stopMin: 0, stopMax: 0 };
    const views = buildDiagrams(side({ cuts: [rabbet] }), 16);
    const w = views.find((v) => v.key === 'width|min')!;
    expect(w.holes).toEqual([]);
    expect(w.holeSides).toHaveLength(3);
    expect(w.holeSides[0]).toMatchObject({ row: 'h1', index: 0, h: [1.875, 2.125], v: [0.375, 0.75], axis: 'v', bottomAt: 'vmin' });
    expect(w.holeNotes).toHaveLength(1);
  });
  it('a through hole shows its circle on the far side only when that view exists, and has no bottom', () => {
    const thru = { ...pins, depth: 'through' as const, count: 1 };
    const dado = { id: 'c1', face: 'thickness' as const, from: 'min' as const, across: 'width' as const, offset: 10, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
    const views = buildDiagrams(side({ holes: [thru], cuts: [dado] }), 16);
    expect(views.find((v) => v.key === 'thickness|min')!.holes).toHaveLength(1);
    expect(views.find((v) => v.key === 'thickness|max')!.holes).toHaveLength(1);
  });
  it('a through hole does not open the far-side view by itself', () => {
    const views = buildDiagrams(side({ holes: [{ ...pins, depth: 'through' as const, count: 1 }] }), 16);
    expect(views.map((v) => v.key)).toEqual(['thickness|max']);
  });
  it('a faulted row\'s note is its bench line, check suffix included (Review Focus 5)', () => {
    const short = side({ length: 4 });
    const v = buildDiagrams(short, 16)[0]!;
    expect(v.holeNotes[0]).toMatch(/— check: hole 3 runs past the length max end$/);
  });
});
