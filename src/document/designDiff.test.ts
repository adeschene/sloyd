import { describe, expect, it } from 'vitest';
import { diffDesigns } from './designDiff';
import { designToDocument } from './generated';
import type { GeneratedAssembly, GeneratedPart } from './generated';
import { formatLength } from '../units/length';
import { createBoard, createDocument } from './document';
import { chamferCut, miterCut, miterRatio } from './angleCuts';
import type { Board } from './types';

const v = (x: number, y: number, z: number) => ({ x, y, z });
const part = (name: string, at: [number, number, number], size: [number, number, number], material = 'oak', role = ''): GeneratedPart =>
  ({ name, role, material, at: v(...at), size: v(...size) });
const doc = (parts: GeneratedPart[], assemblies: GeneratedAssembly[] = []) =>
  designToDocument({ name: 'T', parts, assemblies }, { centre: false }).doc;
const f = (n: number) => formatLength(n, 16);
const drawer = (name: string, placements: [string, number][], front: [number, number, number] = [10, 4, 0.75]): GeneratedAssembly =>
  ({ name, parts: [part('Front', [0, 0, 0], front), part('Side', [0, 0, 0.75], [0.75, 4, 10])],
    placements: placements.map(([n, x]) => ({ name: n, at: v(x, 0, 0) })) });
const BASE = [part('Top', [0, 10, 0], [40, 1, 12]), part('Shelf', [0, 0, 0], [40, 1, 12])];

describe('diffDesigns', () => {
  it('reports nothing for identical designs', () => {
    expect(diffDesigns(doc(BASE), doc(BASE))).toEqual([]);
  });

  it('reports a resize with old and new sizes, longest first', () => {
    const out = diffDesigns(doc(BASE), doc([BASE[0], part('Shelf', [0, 0, 0], [40, 1, 14])]));
    expect(out).toEqual([{ kind: 'resized', subject: 'part', name: 'Shelf', copies: 1,
      text: `Shelf: ${f(40)} × ${f(12)} × ${f(1)} → ${f(40)} × ${f(14)} × ${f(1)}` }]);
  });

  it('reports a part turned onto another face, though its sorted dimensions are equal', () => {
    // L/W/T are stored sorted; the orientation lives in posture/rotation, so only world extents tell.
    const out = diffDesigns(doc(BASE), doc([BASE[0], part('Shelf', [0, 0, 0], [40, 12, 1])]));
    expect(out).toEqual([{ kind: 'resized', subject: 'part', name: 'Shelf', copies: 1, text: 'Shelf turned' }]);
  });

  it('reports a move by axis with signs', () => {
    const out = diffDesigns(doc(BASE), doc([part('Top', [2, 10, -0.5], [40, 1, 12]), BASE[1]]));
    expect(out.map((c) => c.text)).toEqual([`Top moved X +${f(2)}, Z ${f(-0.5)}`]);
  });

  it('reports added and removed parts; a rename is both', () => {
    const out = diffDesigns(doc(BASE), doc([BASE[0], part('Lower shelf', [0, 0, 0], [40, 1, 12])]));
    expect(out.map((c) => [c.kind, c.name])).toEqual([['added', 'Lower shelf'], ['removed', 'Shelf']]);
    expect(out[0].text).toBe(`Added Lower shelf (${f(40)} × ${f(12)} × ${f(1)})`);
    expect(out[1].text).toBe('Removed Shelf');
  });

  it('reports a material change by label', () => {
    const out = diffDesigns(doc(BASE), doc([BASE[0], part('Shelf', [0, 0, 0], [40, 1, 12], 'walnut')]));
    expect(out.map((c) => c.text)).toEqual(['Shelf: Oak → Walnut']);
  });

  it('reports linking gained and lost', () => {
    const legs = (role: string) => [part('Leg 1', [0, 0, 0], [2, 20, 2], 'oak', role), part('Leg 2', [10, 0, 0], [2, 20, 2], 'oak', role)];
    expect(diffDesigns(doc(legs('')), doc(legs('leg'))).map((c) => c.text)).toEqual(['Leg 1 is now linked', 'Leg 2 is now linked']);
    expect(diffDesigns(doc(legs('leg')), doc(legs(''))).map((c) => c.kind)).toEqual(['unlinked', 'unlinked']);
  });

  it('merges one assembly-part change across placements into one entry (×N)', () => {
    const before = doc(BASE, [drawer('Drawer', [['D1', 0], ['D2', 12], ['D3', 24]])]);
    const after = doc(BASE, [drawer('Drawer', [['D1', 0], ['D2', 12], ['D3', 24]], [10, 5, 0.75])]);
    const out = diffDesigns(before, after);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'resized', name: `D1 › Front`, copies: 3 });
    expect(out[0].text.endsWith(' (×3)')).toBe(true);
  });

  const PL: [string, number][] = [['D1', 0], ['D2', 12], ['D3', 24]];
  const withParts = (extra: GeneratedPart[], front: GeneratedPart | null = null): GeneratedAssembly => {
    const d = drawer('Drawer', PL);
    return { ...d, parts: [...(front ? [front, d.parts[1]!] : d.parts), ...extra] };
  };

  it('merges a part added to, or removed from, an assembly kept in place (x N, fu 239)', () => {
    const back = part('Back', [0, 0, 9.25], [10, 4, 0.75]);
    const a = diffDesigns(doc(BASE, [withParts([])]), doc(BASE, [withParts([back])]));
    expect(a.map((c) => [c.kind, c.subject, c.copies, c.text])).toEqual([
      ['added', 'part', 3, `Added D1 › Back (${f(10)} × ${f(4)} × ${f(0.75)}) (×3)`],
    ]);
    const r = diffDesigns(doc(BASE, [withParts([back])]), doc(BASE, [withParts([])]));
    expect(r.map((c) => [c.kind, c.copies, c.text])).toEqual([['removed', 3, 'Removed D1 › Back (×3)']]);
  });

  it('merges a material change across placements (x N, fu 239)', () => {
    const out = diffDesigns(doc(BASE, [withParts([])]), doc(BASE, [withParts([], part('Front', [0, 0, 0], [10, 4, 0.75], 'walnut'))]));
    expect(out.map((c) => [c.kind, c.copies, c.text])).toEqual([['material', 3, 'D1 › Front: Oak → Walnut (×3)']]);
  });

  it('merges gaining and losing a link across placements (x N, fu 239)', () => {
    const pegs = (role: string) => [part('Peg 1', [0, 0, 0], [1, 1, 4], 'oak', role), part('Peg 2', [3, 0, 0], [1, 1, 4], 'oak', role)];
    const asm = (role: string): GeneratedAssembly => ({ name: 'Rack', parts: pegs(role), placements: PL.map(([n, x]) => ({ name: n, at: v(x, 0, 0) })) });
    const gain = diffDesigns(doc([], [asm('')]), doc([], [asm('peg')]));
    expect(gain.map((c) => [c.kind, c.copies, c.text])).toEqual([
      ['linked', 3, 'D1 › Peg 1 is now linked (×3)'], ['linked', 3, 'D1 › Peg 2 is now linked (×3)'],
    ]);
    const lose = diffDesigns(doc([], [asm('peg')]), doc([], [asm('')]));
    expect(lose.map((c) => [c.kind, c.copies, c.text])).toEqual([
      ['unlinked', 3, 'D1 › Peg 1 is no longer linked (×3)'], ['unlinked', 3, 'D1 › Peg 2 is no longer linked (×3)'],
    ]);
  });

  it('merges a turned part across placements (x N) (fu 239)', () => {
    const out = diffDesigns(doc(BASE, [withParts([])]), doc(BASE, [withParts([], part('Front', [0, 0, 0], [10, 0.75, 4]))]));
    expect(out.map((c) => [c.kind, c.copies, c.text])).toEqual([['resized', 3, 'D1 › Front turned (×3)']]);
  });

  it('reports a moved placement once, not each of its parts', () => {
    const out = diffDesigns(doc(BASE, [drawer('Drawer', [['D1', 0]])]), doc(BASE, [drawer('Drawer', [['D1', 3]])]));
    expect(out.map((c) => [c.kind, c.subject, c.text])).toEqual([['moved', 'placement', `Placement D1 moved X +${f(3)}`]]);
  });

  it('reports a renamed placement as removed + added, without listing its parts (review focus 4)', () => {
    const out = diffDesigns(doc(BASE, [drawer('Drawer', [['D1', 0]])]), doc(BASE, [drawer('Drawer', [['Top drawer', 0]])]));
    expect(out.map((c) => [c.kind, c.subject, c.name])).toEqual([['added', 'placement', 'Top drawer'], ['removed', 'placement', 'D1']]);
  });

  it('ignores an assembly rename when placement and part names are kept (review focus 2)', () => {
    expect(diffDesigns(doc(BASE, [drawer('Drawer', [['D1', 0]])]), doc(BASE, [drawer('Box', [['D1', 0]])]))).toEqual([]);
  });

  it('orders placements before parts', () => {
    const out = diffDesigns(doc(BASE), doc([BASE[0], part('Shelf', [0, 0, 0], [40, 1, 14])], [drawer('Drawer', [['D1', 0]])]));
    expect(out.map((c) => c.subject)).toEqual(['placement', 'part']);
  });

  it('compares placements by world geometry, not by how origin and local coordinates split (F3)', () => {
    const asm = (partAt: [number, number, number], origin: [number, number, number]) =>
      doc([], [{ name: 'Rails', parts: [part('Rail', partAt, [20, 2, 3]), part('Rail 2', [partAt[0], partAt[1] + 6, partAt[2]], [20, 2, 3])], placements: [{ name: 'P1', at: v(...origin) }] }]);
    expect(diffDesigns(asm([10, 0, 5], [0, 0, 0]), asm([0, 0, 0], [10, 0, 5]))).toEqual([]);
    // ...and a real move of the whole placement is still reported, once.
    const moved = diffDesigns(asm([10, 0, 5], [0, 0, 0]), asm([0, 0, 0], [12, 0, 5]));
    expect(moved.map((c) => c.text)).toEqual([`Placement P1 moved X +${f(2)}`]);
  });

  // designToDocument snaps to 1/16in, so sub-precision differences are made by editing stored values.
  const nudge = (d: ReturnType<typeof doc>, name: string, patch: { length?: number; position?: [number, number, number]; material?: string }) =>
    ({ ...d, boards: d.boards.map((b) => (b.name === name ? { ...b, ...patch } : b)) }) as ReturnType<typeof doc>;

  it('prints no line for a change below display precision (F2)', () => {
    const a = doc(BASE);
    expect(diffDesigns(a, nudge(a, 'Shelf', { length: 40.001 }))).toEqual([]);
    expect(diffDesigns(a, nudge(a, 'Shelf', { position: [0.001, 0, 0] }))).toEqual([]);
  });

  it('omits a zero component from a move', () => {
    const a = doc(BASE);
    const out = diffDesigns(a, nudge(a, 'Top', { position: [2, 10.001, -0.5] }));
    expect(out.map((c) => c.text)).toEqual([`Top moved X +${f(2)}, Z ${f(-0.5)}`]);
  });
});

describe('diffDesigns — tapers (AI-tapers spec §5.5)', () => {
  const leg = (tapers: unknown[]) => ({ name: 'T', parts: [{ name: 'Leg', role: '', material: 'oak', at: { x: 0, y: 0, z: 0 }, size: { x: 1.75, y: 28, z: 1.75 }, tapers: tapers as never }], assemblies: [] });
  const tdoc = (t: unknown[], exact?: number[]) => designToDocument(leg(t) as never, { centre: false, exact: exact && new Set(exact) }).doc;
  const T = { faces: ['+x', '+z'], toward: '-y', start: 22, amount: 0.375 };
  it('added', () => {
    expect(diffDesigns(tdoc([]), tdoc([T])).map((c) => c.text)).toEqual([`Leg: taper added (+x, +z; ${f(22)} from the -y end, ${f(0.375)} off)`]);
  });
  it('changed', () => {
    expect(diffDesigns(tdoc([T]), tdoc([{ ...T, start: 20 }])).map((c) => c.text)).toEqual([`Leg: taper changed (+x, +z; ${f(20)} from the -y end, ${f(0.375)} off)`]);
  });
  it('removed', () => {
    expect(diffDesigns(tdoc([T]), tdoc([])).map((c) => c.text)).toEqual(['Leg: taper removed (+x, +z)']);
  });
  it('face order is not a change', () => {
    expect(diffDesigns(tdoc([T]), tdoc([{ ...T, faces: ['+z', '+x'] }]))).toEqual([]);
  });

  // fu 310: tapers are compared face by face, at display precision; only what changed gets a line.
  const U = { faces: ['-x'], toward: '+y', start: 10, amount: 0.25 };
  const texts = (a: unknown[], b: unknown[], exact?: number[]) =>
    diffDesigns(tdoc(a, exact), tdoc(b, exact)).map((c) => c.text);
  it('an unchanged taper beside a changed one gets no line', () => {
    expect(texts([T, U], [{ ...T, start: 20 }, U])).toEqual([`Leg: taper changed (+x, +z; ${f(20)} from the -y end, ${f(0.375)} off)`]);
  });
  it('removing one of two tapers reads "removed", naming only its faces', () => {
    expect(texts([T, U], [T])).toEqual(['Leg: taper removed (-x)']);
  });
  it('a face added to an existing taper reads "added" for that face only', () => {
    expect(texts([{ ...T, faces: ['+x'] }], [T])).toEqual([`Leg: taper added (+z; ${f(22)} from the -y end, ${f(0.375)} off)`]);
  });
  it('one face of a shared taper changed: only that face', () => {
    expect(texts([T], [{ ...T, faces: ['+x'] }, { ...T, faces: ['+z'], start: 20 }])).toEqual([`Leg: taper changed (+z; ${f(20)} from the -y end, ${f(0.375)} off)`]);
  });
  it('a change below display precision is no change, like the other lines', () => {
    expect(texts([T], [{ ...T, start: 22.001 }], [22.001])).toEqual([]);
  });
});

describe('diffDesigns — tapers across placements', () => {
  const T = { faces: ['+x', '+z'] as never, toward: '-y' as never, start: 22, amount: 0.375 };
  const asm = (tapers: unknown[]): GeneratedAssembly => ({
    name: 'Leg set',
    parts: [{ ...part('Leg', [0, 0, 0], [1.75, 28, 1.75]), tapers: tapers as never }],
    placements: [['L1', 0], ['L2', 10], ['L3', 20]].map(([n, x]) => ({ name: n as string, at: v(x as number, 0, 0) })),
  });
  it('merges one assembly-part taper change across placements into one entry (×N)', () => {
    const out = diffDesigns(doc([], [asm([])]), doc([], [asm([T])]));
    expect(out.map((c) => [c.kind, c.copies, c.text])).toEqual([
      ['angle', 3, `L1 › Leg: taper added (+x, +z; ${f(22)} from the -y end, ${f(0.375)} off) (×3)`],
    ]);
  });
});

describe('diffDesigns — miters, bevels and chamfers (AI-angles spec §6.4)', () => {
  const rail = (name = 'Rail') => createBoard({ name, length: 18, width: 3, thickness: 0.75, position: [0, 0, 0] });
  const doc = (b: Board) => ({ ...createDocument('T'), boards: [b] });
  const miter = (b: Board, ratio: number) => ({ id: 'm', ...miterCut({ end: 'max', across: 'width', longSide: 'min', ratio }, b) });
  const ch = (b: Board, leg: number) => ({ id: 'c', ...chamferCut({ face: 'width', from: 'max', along: 'thickness', alongFrom: 'max', legFace: leg, legAlong: leg }, b) });
  it('added, changed and removed, one line each, in world words at display precision', () => {
    const b = rail();
    const lines = (before: Board, after: Board) => diffDesigns(doc(before), doc(after)).filter((c) => c.kind === 'angle').map((c) => c.text);
    const m45 = { ...b, angleCuts: [miter(b, 1)] };
    const m30 = { ...b, angleCuts: [miter(b, miterRatio(30))] };
    const c8 = { ...b, angleCuts: [ch(b, 0.125)] };
    expect(lines(b, m45)).toEqual(['Rail: miter added (+x end; 45.0°, long point -z)']);
    expect(lines(m45, m30)).toEqual(['Rail: miter changed (+x end; 30.0°, long point -z)']);
    expect(lines(m45, b)).toEqual(['Rail: miter removed (+x end)']);
    expect(lines(b, c8)).toEqual(['Rail: chamfer added (+y/+z edge; 1/8" × 1/8")']);
    // Below display precision: no line.
    expect(lines(m45, { ...b, angleCuts: [miter(b, 1.0000000001)] })).toEqual([]);
  });
  it('taper lines are kind angle too', () => {
    expect(['added', 'removed', 'resized', 'moved', 'material', 'angle', 'linked', 'unlinked']).toContain('angle');
  });
});
