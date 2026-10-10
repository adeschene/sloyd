import { describe, expect, it } from 'vitest';
import { collapseViolations, distinctParts, distinctPartsViolation } from './assemblyChecks';
import type { Violation } from './designCheck';
import { designToDocument } from './generated';
import type { Authored, AuthoredPart } from './generated';

const S = ' › ';
const v3 = (x: number, y: number, z: number) => ({ x, y, z });
const P = (name: string) => ({ name, role: '', material: 'pine', at: v3(0, 0, 0), size: v3(4, 4, 4) });

/** Drawer placed as D1..Dn (each with Front, Side), plus loose parts. */
function index(placements: string[], loose: string[] = [], extra: [string, string[]][] = []): Authored {
  const parts = new Map<string, AuthoredPart>();
  for (const l of loose) parts.set(l, { label: l, assembly: null, placement: null });
  const add = (asm: string, pls: string[]) => {
    for (const pl of pls) for (const pt of ['Front', 'Side']) parts.set(`${pl}${S}${pt}`, { label: `${asm}${S}${pt}`, assembly: asm, placement: pl });
  };
  add('Drawer', placements);
  for (const [asm, pls] of extra) add(asm, pls);
  return { parts, placements: new Map([['Drawer', placements], ...extra]) };
}
const overlap = (a: string, b: string): Violation => ({ kind: 'overlap', message: `${a} passes 0.5in into ${b} along X.`, parts: [a, b] });

describe('distinctParts', () => {
  it('counts loose parts plus each definition once', () => {
    const { doc } = designToDocument({ name: 'T', parts: [P('Top')], assemblies: [
      { name: 'Drawer', parts: [P('Front'), P('Side')], placements: [{ name: 'A', at: v3(0, 0, 0) }, { name: 'B', at: v3(10, 0, 0) }, { name: 'C', at: v3(20, 0, 0) }] },
    ] });
    expect(distinctParts(doc)).toBe(3);
  });
  it('does not count a definition no placement reaches (fu 239)', () => {
    const { doc } = designToDocument({ name: 'T', parts: [P('Top')], assemblies: [
      { name: 'Drawer', parts: [P('Front'), P('Side')], placements: [{ name: 'A', at: v3(0, 0, 0) }] },
    ] });
    const orphan = { id: 'orphan', boards: doc.definitions[0]!.boards.map((b) => ({ ...b, id: `o-${b.id}` })), instances: [] };
    expect(distinctParts({ ...doc, definitions: [...doc.definitions, orphan] })).toBe(3);
    expect(distinctParts({ ...doc, instances: [] })).toBe(1);
  });
  it('counts a definition reached only through another definition, once (fu 239)', () => {
    const { doc } = designToDocument({ name: 'T', parts: [P('Top')], assemblies: [
      { name: 'Drawer', parts: [P('Front'), P('Side')], placements: [{ name: 'A', at: v3(0, 0, 0) }] },
    ] });
    const inner = doc.definitions[0]!;
    const outer = { id: 'outer', boards: [{ ...inner.boards[0]!, id: 'ob' }], instances: [{ id: 'oi', name: 'In', definition: inner.id, position: [0, 0, 0] as [number, number, number], rotation: 0 as const }] };
    const root = { id: 'ri', name: 'Out', definition: 'outer', position: [0, 0, 0] as [number, number, number], rotation: 0 as const };
    // inner is no longer placed at the root; only outer is, and it reaches inner. A cycle must not loop.
    const nested = { ...doc, instances: [root], definitions: [inner, outer] };
    expect(distinctParts(nested)).toBe(1 + 1 + 2);
    const cyc = { ...nested, definitions: [inner, { ...outer, instances: [...outer.instances, { ...root, id: 'self' }] }] };
    expect(distinctParts(cyc)).toBe(4);
  });
  it('reports at cap + 1 and not at cap', () => {
    const parts = Array.from({ length: 12 }, (_, i) => P(`P${i}`));
    const at = designToDocument({ name: 'T', parts, assemblies: [] }).doc;
    const over = designToDocument({ name: 'T', parts: [...parts, P('P12')], assemblies: [] }).doc;
    expect(distinctPartsViolation(at, 12)).toBeNull();
    expect(distinctPartsViolation(over, 12)).toEqual({
      kind: 'too-many-parts', message: "13 distinct parts; the limit is 12 (an assembly's parts count once).", parts: [],
    });
  });
});

describe('collapseViolations', () => {
  it('merges one definition defect in every placement into one "fix the assembly" report', () => {
    const pls = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'];
    const out = collapseViolations(pls.map((p) => overlap(`${p}${S}Front`, `${p}${S}Side`)), index(pls));
    expect(out).toEqual([{
      kind: 'overlap',
      message: `D1${S}Front passes 0.5in into D1${S}Side along X. (in every placement of Drawer — fix the assembly)`,
      parts: [`Drawer${S}Front`, `Drawer${S}Side`],
    }]);
  });

  it('names the placements when only some have the defect', () => {
    const out = collapseViolations(['D1', 'D3'].map((p) => overlap(`${p}${S}Front`, `${p}${S}Side`)), index(['D1', 'D2', 'D3']));
    expect(out).toHaveLength(1);
    expect(out[0].message.endsWith(' (in D1, D3)')).toBe(true);
  });

  it('never says "fix the assembly" when placements overlap EACH OTHER (review focus 4)', () => {
    const pls = ['D1', 'D2', 'D3'];
    const out = collapseViolations([overlap(`D1${S}Front`, `D2${S}Front`), overlap(`D2${S}Front`, `D3${S}Front`)], index(pls));
    expect(out).toHaveLength(1);
    expect(out[0].message).not.toContain('fix the assembly');
    expect(out[0].message.endsWith(' (in D1, D2, D3)')).toBe(true);
  });

  it('names the one placement of an assembly placed once (review focus 5)', () => {
    const out = collapseViolations([overlap(`D1${S}Front`, `D1${S}Side`)], index(['D1']));
    expect(out[0].message.endsWith(' (in D1)')).toBe(true);
  });

  it('keeps two different defects apart', () => {
    const pls = ['D1', 'D2'];
    const hang = (p: string): Violation => ({ kind: 'hangs', message: `${p}${S}Side is not held.`, parts: [`${p}${S}Side`] });
    const out = collapseViolations([...pls.map((p) => overlap(`${p}${S}Front`, `${p}${S}Side`)), ...pls.map(hang)], index(pls));
    expect(out.map((x) => x.kind)).toEqual(['overlap', 'hangs']);
  });

  it('keeps same-named assemblies apart (review focus 2)', () => {
    const idx = index(['D1'], [], [['Drawer 2', ['E1']]]);
    const out = collapseViolations([overlap(`D1${S}Front`, `D1${S}Side`), overlap(`E1${S}Front`, `E1${S}Side`)], idx);
    expect(out).toHaveLength(2);
  });

  it('passes loose-only and part-less violations through untouched', () => {
    const loose = overlap('Top', 'Shelf');
    const cap: Violation = { kind: 'too-many-parts', message: '49 parts; the limit is 48.', parts: [] };
    const out = collapseViolations([loose, cap], index(['D1'], ['Top', 'Shelf']));
    expect(out[0]).toBe(loose);
    expect(out[1]).toBe(cap);
  });

  it('keeps the original order of first appearance', () => {
    const loose = overlap('Top', 'Shelf');
    const out = collapseViolations([overlap(`D1${S}Front`, `D1${S}Side`), loose, overlap(`D2${S}Front`, `D2${S}Side`)], index(['D1', 'D2'], ['Top', 'Shelf']));
    expect(out.map((x) => x.parts[0])).toEqual([`Drawer${S}Front`, 'Top']);
  });

  it('keeps an inside-placement fault apart from between-placement faults (F1)', () => {
    const pls = ['D1', 'D2', 'D3'];
    const inside = pls.map((p) => overlap(`${p}${S}Front`, `${p}${S}Side`));
    const between = [overlap(`D2${S}Side`, `D1${S}Front`), overlap(`D3${S}Side`, `D2${S}Front`)];
    const out = collapseViolations([...inside, ...between], index(pls));
    expect(out).toHaveLength(2);
    expect(out[0].message.endsWith(' (in every placement of Drawer — fix the assembly)')).toBe(true);
    expect(out[1].message.endsWith(' (in D1, D2, D3)')).toBe(true);
  });

  it('lists placements in authored order whatever the arrival order (F1)', () => {
    const out = collapseViolations(
      [overlap(`D3${S}Front`, `D1${S}Front`), overlap(`D2${S}Front`, `D3${S}Front`)],
      index(['D1', 'D2', 'D3']),
    );
    expect(out).toHaveLength(1);
    expect(out[0].message.endsWith(' (in D1, D2, D3)')).toBe(true);
  });

  it.each(['unsupported', 'hangs'] as const)('lists placements for a repeated %s fault, never "fix the assembly" (F2)', (kind) => {
    const pls = ['D1', 'D2'];
    const fault = (p: string): Violation => ({ kind, message: `${p}${S}Side is not held.`, parts: [`${p}${S}Side`] });
    const out = collapseViolations(pls.map(fault), index(pls));
    expect(out).toHaveLength(1);
    expect(out[0].message).not.toContain('fix the assembly');
    expect(out[0].message.endsWith(' (in D1, D2)')).toBe(true);
  });

  it('lists the placement for a violation mixing a loose part and an assembly part (F7)', () => {
    const out = collapseViolations([overlap('Top', `D1${S}Front`), overlap('Top', `D2${S}Front`)], index(['D1', 'D2'], ['Top']));
    expect(out).toHaveLength(1);
    expect(out[0].message).not.toContain('fix the assembly');
    expect(out[0].message.endsWith(' (in D1, D2)')).toBe(true);
  });

  it('keeps a part missing from the authored index under its own name, as a between-placement fault (fu 235)', () => {
    const out = collapseViolations([overlap(`D1${S}Front`, 'Ghost'), overlap(`D2${S}Front`, 'Ghost')], index(['D1', 'D2']));
    expect(out).toEqual([{
      kind: 'overlap',
      message: `D1${S}Front passes 0.5in into Ghost along X. (in D1, D2)`,
      parts: [`Drawer${S}Front`, 'Ghost'],
    }]);
  });

  it('a violation spanning two assemblies lists both assemblies\' placements and never says "fix the assembly" (fu 235)', () => {
    // Two placements make the fault "between", so `internal` is already false here.
    const idx = index(['D1'], [], [['Door', ['E1']]]);
    const out = collapseViolations([overlap(`D1${S}Front`, `E1${S}Front`)], idx);
    expect(out).toHaveLength(1);
    expect(out[0].message).toBe(`D1${S}Front passes 0.5in into E1${S}Front along X. (in D1, E1)`);
    expect(out[0].parts).toEqual([`Drawer${S}Front`, `Door${S}Front`]);
  });
});
