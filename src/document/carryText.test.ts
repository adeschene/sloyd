import { describe, expect, it } from 'vitest';
import { carriedSummary } from './carryText';
import { ARCH } from './curveFixtures';
import { designToDocument } from './generated';
import type { GeneratedPart } from './generated';
import type { Board, BandType, ProfileCut, HoleRow, SloydDocument, StoredBoard } from './types';

const v = (x: number, y: number, z: number) => ({ x, y, z });
const part = (name: string, at: [number, number, number], size: [number, number, number]): GeneratedPart =>
  ({ name, role: '', material: 'oak', at: v(...at), size: v(...size) });
const HOLE: HoleRow = { id: 'h1', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.375, along: 'length', alongFrom: 'min', station: 8, count: 1, pitch: 0, acrossFrom: 'min', inset: 1.5 };
const docOf = (parts: GeneratedPart[], holed: string[] = []): SloydDocument => {
  const d = designToDocument({ name: 'G', parts }).doc;
  return { ...d, boards: d.boards.map((b) => (holed.includes(b.name) ? ({ ...b, holes: [HOLE] } as StoredBoard) : b)) };
};
const withHole = (d: SloydDocument): SloydDocument => ({ ...d, boards: d.boards.map((b) => ({ ...b, holes: [HOLE] }) as StoredBoard) });

const PROFILE: ProfileCut = { id: 'p1', face: 'max', kind: 'roundover', size: 0.25, facing: 'face',
  run: { start: { side: { across: 'width', from: 'min' }, from: 'min', at: 8 }, end: { side: { across: 'width', from: 'min' }, from: 'min', at: 15 } } };
const MAPLE: BandType = { id: 'e1', name: 'Maple', kind: 'solid', thickness: 1.5, lengthAllowance: 0, material: 'oak', widthAllowance: 0 };
const BANDS = [{ side: { across: 'width', from: 'min' }, type: 'e1' }, { side: { across: 'width', from: 'max' }, type: 'e1' }];
const withExtra = (d: SloydDocument, extra: Partial<Board>): SloydDocument =>
  ({ ...d, bandTypes: [MAPLE], boards: d.boards.map((b) => ({ ...b, ...extra }) as StoredBoard) });

describe('carriedSummary: a resize that causes a new fault, per kind', () => {
  // [kind, features, original size, resized size that causes the fault, still-broken size, words]
  const cases: [string, Partial<Board>, [number, number, number], [number, number, number], [number, number, number], string][] = [
    ['curve', { curves: [ARCH] }, [30, 5, 1], [20, 5, 1], [21, 5, 1], 'curve'],
    ['edge profile', { profiles: [PROFILE] }, [20, 4, 1], [10, 4, 1], [11, 4, 1], 'edge profile'],
    ['edging', { bands: BANDS as Board['bands'] }, [20, 4, 1], [20, 3, 1], [20, 2.5, 1], 'edging'],
  ];
  for (const [kind, extra, a, b, c, noun] of cases) {
    it(`${kind}: a resize that breaks it reads "no longer fits"; resized again, still broken, reads "stays measured"`, () => {
      const o = withExtra(docOf([part('Side', [0, 0, 0], a)]), extra);
      const broken = withExtra(docOf([part('Side', [0, 0, 0], b)]), extra);
      const again = withExtra(docOf([part('Side', [0, 0, 0], c)]), extra);
      expect(carriedSummary(o, broken).check).toEqual([`Side was resized — its ${noun} no longer fits; see Properties.`]);
      expect(carriedSummary(broken, again).check).toEqual([`Side was resized — its ${noun} stays measured from where it was placed; check it.`]);
    });
  }
});

describe('carriedSummary: person-facing nouns', () => {
  const resized = (extra: Partial<Board>) => carriedSummary(
    withExtra(docOf([part('Apron', [0, 0, 0], [30, 5, 1])]), extra), withExtra(docOf([part('Apron', [0, 0, 0], [30, 6, 1])]), extra)).check[0];
  const gone = (extra: Partial<Board>) => carriedSummary(withExtra(docOf([part('Apron', [0, 0, 0], [30, 5, 1])]), extra), docOf([])).notKept[0];
  const two = { curves: [ARCH, { ...ARCH, id: 'c9' }] };
  it('a single curve, a single edge profile and edging alone are singular', () => {
    expect(resized({ curves: [ARCH] })).toBe('Apron was resized — its curve stays measured from where it was placed; check it.');
    expect(resized({ profiles: [PROFILE] })).toBe('Apron was resized — its edge profile stays measured from where it was placed; check it.');
    expect(resized({ bands: [BANDS[0]] as Board['bands'] })).toBe('Apron was resized — its edging stays measured from where it was placed; check it.');
    expect(gone({ curves: [ARCH] })).toBe("Apron's curve — no part named Apron in the result.");
  });
  it('several curves, or two or three kinds, are plural with "and" before the last', () => {
    expect(resized(two)).toBe('Apron was resized — its curves stay measured from where they were placed; check them.');
    expect(resized({ curves: [ARCH], profiles: [PROFILE] })).toBe('Apron was resized — its curve and edge profile stay measured from where they were placed; check them.');
    expect(resized({ holes: [HOLE], curves: [ARCH], profiles: [PROFILE] })).toBe('Apron was resized — its holes, curve and edge profile stay measured from where they were placed; check them.');
    expect(gone({ curves: [ARCH], profiles: [PROFILE], bands: [BANDS[0]] as Board['bands'] })).toBe("Apron's curve, edge profile and edging — no part named Apron in the result.");
  });
});

describe('carriedSummary', () => {
  const orig = withHole(docOf([part('Side', [0, 0, 0], [20, 4, 1])]));

  it('lists a renamed holed part as not kept, with the exact line', () => {
    const refined = withHole(docOf([part('Panel', [0, 0, 0], [20, 4, 1])]));
    expect(carriedSummary(orig, refined)).toEqual({ notKept: ["Side's holes — no part named Side in the result."], check: [] });
  });

  it('names every kind in the line, hardware included', () => {
    const o = { ...orig, boards: orig.boards.map((b) => ({ ...b, hardware: [{ type: 'hw-1', count: 1 }] }) as StoredBoard) };
    const out = carriedSummary(o, docOf([part('Panel', [0, 0, 0], [20, 4, 1])]));
    expect(out.notKept).toEqual(["Side's holes and hardware — no part named Side in the result."]);
  });

  it('lists a side made taller under check with the stay-measured line', () => {
    const refined = withHole(docOf([part('Side', [0, 0, 0], [20, 6, 1])]));
    expect(carriedSummary(orig, refined)).toEqual({ notKept: [], check: ["Side was resized — its holes stay measured from where they were placed; check them."] });
  });

  it('says no longer fit when a resize makes a row break out', () => {
    const refined = withHole(docOf([part('Side', [0, 0, 0], [5, 4, 1])]));
    expect(carriedSummary(orig, refined).check).toEqual(['Side was resized — its holes no longer fit; see Properties.']);
  });

  it('does not list an untouched part whose row already broke out', () => {
    const broken = withHole(docOf([part('Side', [0, 0, 0], [5, 4, 1])]));
    expect(carriedSummary(broken, broken)).toEqual({ notKept: [], check: [] });
    // resized again, still broken the same way: "stay measured", not "no longer fit"
    const again = withHole(docOf([part('Side', [0, 0, 0], [6, 4, 1])]));
    expect(carriedSummary(broken, again).check[0]).toContain('stay measured');
  });

  it('does not list a part that only moved', () => {
    const refined = withHole(docOf([part('Side', [3, 2, 1], [20, 4, 1])]));
    expect(carriedSummary(orig, refined)).toEqual({ notKept: [], check: [] });
  });

  it('a hardware-only resized part is not a check line', () => {
    const o = docOf([part('Side', [0, 0, 0], [20, 4, 1])]);
    const hw = { ...o, boards: o.boards.map((b) => ({ ...b, hardware: [{ type: 'hw-1', count: 1 }] }) as StoredBoard) };
    const r = { ...docOf([part('Side', [0, 0, 0], [20, 6, 1])]) };
    r.boards = r.boards.map((b) => ({ ...b, hardware: [{ type: 'hw-1', count: 1 }] }) as StoredBoard);
    expect(carriedSummary(hw, r)).toEqual({ notKept: [], check: [] });
  });

  it('lists an assembly with hardware and no surviving placement', () => {
    const o = designToDocument({ name: 'G', parts: [], assemblies: [{ name: 'D', parts: [part('Front', [0, 0, 0], [10, 4, 1])], placements: [{ name: 'Top drawer', at: v(0, 5, 0) }] }] }).doc;
    const hw = { ...o, definitions: o.definitions.map((d) => ({ ...d, hardware: [{ type: 'hw-1', count: 2 }] })) } as SloydDocument;
    expect(carriedSummary(hw, docOf([])).notKept).toEqual(["Top drawer's hardware — no part named Top drawer in the result."]);
    expect(carriedSummary(hw, o).notKept).toEqual([]);
  });
});
