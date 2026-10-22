import { describe, expect, it } from 'vitest';
import { carriedSummary } from './carryText';
import { designToDocument } from './generated';
import type { GeneratedPart } from './generated';
import type { HoleRow, SloydDocument, StoredBoard } from './types';

const v = (x: number, y: number, z: number) => ({ x, y, z });
const part = (name: string, at: [number, number, number], size: [number, number, number]): GeneratedPart =>
  ({ name, role: '', material: 'oak', at: v(...at), size: v(...size) });
const HOLE: HoleRow = { id: 'h1', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.375, along: 'length', alongFrom: 'min', station: 8, count: 1, pitch: 0, acrossFrom: 'min', inset: 1.5 };
const docOf = (parts: GeneratedPart[], holed: string[] = []): SloydDocument => {
  const d = designToDocument({ name: 'G', parts }).doc;
  return { ...d, boards: d.boards.map((b) => (holed.includes(b.name) ? ({ ...b, holes: [HOLE] } as StoredBoard) : b)) };
};
const withHole = (d: SloydDocument): SloydDocument => ({ ...d, boards: d.boards.map((b) => ({ ...b, holes: [HOLE] }) as StoredBoard) });

describe('carriedSummary', () => {
  const orig = withHole(docOf([part('Side', [0, 0, 0], [20, 4, 1])]));

  it('lists a renamed holed part as not kept, with the exact line', () => {
    const refined = withHole(docOf([part('Panel', [0, 0, 0], [20, 4, 1])]));
    expect(carriedSummary(orig, refined)).toEqual({ notKept: ["Side's holes — no part named Side in the result."], check: [] });
  });

  it('names every kind in the line, hardware included', () => {
    const o = { ...orig, boards: orig.boards.map((b) => ({ ...b, hardware: [{ type: 'hw-1', count: 1 }] }) as StoredBoard) };
    const out = carriedSummary(o, docOf([part('Panel', [0, 0, 0], [20, 4, 1])]));
    expect(out.notKept).toEqual(["Side's holes, hardware — no part named Side in the result."]);
  });

  it('lists a side made taller under check with the stay-measured line', () => {
    const refined = withHole(docOf([part('Side', [0, 0, 0], [20, 6, 1])]));
    expect(carriedSummary(orig, refined)).toEqual({ notKept: [], check: ["Side was resized — its holes stay measured from where they were placed; check them."] });
  });

  it('says no longer fit when a resize makes a row break out', () => {
    const refined = withHole(docOf([part('Side', [0, 0, 0], [5, 4, 1])]));
    expect(carriedSummary(orig, refined).check).toEqual(['Side was resized — holes no longer fit; see Properties.']);
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
