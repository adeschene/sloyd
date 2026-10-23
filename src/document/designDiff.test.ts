import { describe, expect, it } from 'vitest';
import { diffDesigns } from './designDiff';
import { designToDocument } from './generated';
import type { GeneratedAssembly, GeneratedPart } from './generated';
import { formatLength, IMPERIAL } from '../units/length';
import { createBoard, createDocument } from './document';
import { bevelCut, chamferCut, miterCut, miterRatio } from './angleCuts';
import type { BandType, Board, HoleRow, SloydDocument } from './types';
import { bandsFor } from './bandWorld';
import { BUILT_IN_BAND, BUILT_IN_BAND_ID } from './bandModel';
import type { Dir } from './taperWorld';
import { profilesFor } from './profileWorld';
import type { WorldProfile } from './generated';

const v = (x: number, y: number, z: number) => ({ x, y, z });
const part = (name: string, at: [number, number, number], size: [number, number, number], material = 'oak', role = ''): GeneratedPart =>
  ({ name, role, material, at: v(...at), size: v(...size) });
const doc = (parts: GeneratedPart[], assemblies: GeneratedAssembly[] = []) =>
  designToDocument({ name: 'T', parts, assemblies }, { centre: false }).doc;
const f = (n: number) => formatLength(n, IMPERIAL);
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
    expect(diffDesigns(tdoc([]), tdoc([T])).map((c) => c.text)).toEqual([`Leg: taper added (right and front faces; ${f(22)} from the bottom end, ${f(0.375)} off)`]);
  });
  it('changed', () => {
    expect(diffDesigns(tdoc([T]), tdoc([{ ...T, start: 20 }])).map((c) => c.text)).toEqual([`Leg: taper changed (right and front faces; ${f(20)} from the bottom end, ${f(0.375)} off)`]);
  });
  it('removed', () => {
    expect(diffDesigns(tdoc([T]), tdoc([])).map((c) => c.text)).toEqual(['Leg: taper removed (right and front faces)']);
  });
  it('face order is not a change', () => {
    expect(diffDesigns(tdoc([T]), tdoc([{ ...T, faces: ['+z', '+x'] }]))).toEqual([]);
  });

  // fu 310: tapers are compared face by face, at display precision; only what changed gets a line.
  const U = { faces: ['-x'], toward: '+y', start: 10, amount: 0.25 };
  const texts = (a: unknown[], b: unknown[], exact?: number[]) =>
    diffDesigns(tdoc(a, exact), tdoc(b, exact)).map((c) => c.text);
  it('an unchanged taper beside a changed one gets no line', () => {
    expect(texts([T, U], [{ ...T, start: 20 }, U])).toEqual([`Leg: taper changed (right and front faces; ${f(20)} from the bottom end, ${f(0.375)} off)`]);
  });
  it('removing one of two tapers reads "removed", naming only its faces', () => {
    expect(texts([T, U], [T])).toEqual(['Leg: taper removed (left face)']);
  });
  it('a face added to an existing taper reads "added" for that face only', () => {
    expect(texts([{ ...T, faces: ['+x'] }], [T])).toEqual([`Leg: taper added (front face; ${f(22)} from the bottom end, ${f(0.375)} off)`]);
  });
  it('one face of a shared taper changed: only that face', () => {
    expect(texts([T], [{ ...T, faces: ['+x'] }, { ...T, faces: ['+z'], start: 20 }])).toEqual([`Leg: taper changed (front face; ${f(20)} from the bottom end, ${f(0.375)} off)`]);
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
      ['angle', 3, `L1 › Leg: taper added (right and front faces; ${f(22)} from the bottom end, ${f(0.375)} off) (×3)`],
    ]);
  });
});

describe('diffDesigns — miters, bevels and chamfers (AI-angles spec §6.4)', () => {
  const rail = (name = 'Rail') => createBoard({ name, length: 18, width: 3, thickness: 0.75, position: [0, 0, 0] });
  const doc = (b: Board) => ({ ...createDocument('T'), boards: [b] });
  const miter = (b: Board, ratio: number) => ({ id: 'm', ...miterCut({ end: 'max', across: 'width', longSide: 'min', ratio }, b) });
  const ch = (b: Board, leg: number) => ({ id: 'c', ...chamferCut({ face: 'width', from: 'max', along: 'thickness', alongFrom: 'max', legFace: leg, legAlong: leg }, b) });
  it('added, changed and removed, one line each, in shop words at display precision', () => {
    const b = rail();
    const lines = (before: Board, after: Board) => diffDesigns(doc(before), doc(after)).filter((c) => c.kind === 'angle').map((c) => c.text);
    const m45 = { ...b, angleCuts: [miter(b, 1)] };
    const m30 = { ...b, angleCuts: [miter(b, miterRatio(30))] };
    const c8 = { ...b, angleCuts: [ch(b, 0.125)] };
    expect(lines(b, m45)).toEqual(['Rail: miter added (right end; 45.0°, long point on the back face)']);
    expect(lines(m45, m30)).toEqual(['Rail: miter changed (right end; 30.0°, long point on the back face)']);
    expect(lines(m45, b)).toEqual(['Rail: miter removed (right end)']);
    expect(lines(b, c8)).toEqual(['Rail: chamfer added (top/front edge; 1/8" × 1/8")']);
    // Below display precision: no line.
    expect(lines(m45, { ...b, angleCuts: [miter(b, 1.0000000001)] })).toEqual([]);
  });
  it('taper lines are kind angle too', () => {
    const leg = createBoard({ name: 'Leg', length: 28, width: 1.75, thickness: 1.75, posture: 'upright', position: [0, 0, 0] });
    const tapered = { ...leg, angleCuts: [{ id: 't', kind: 'taper' as const, face: 'width' as const, from: 'min' as const, along: 'length' as const, alongFrom: 'min' as const, points: [[0, 0.5], [20, 0]] as [[number, number], [number, number]] }] };
    const c = diffDesigns({ ...createDocument('T'), boards: [leg] }, { ...createDocument('T'), boards: [tapered] });
    expect(c.map((x) => x.kind)).toEqual(['angle']);
    expect(c[0]!.text).toContain('taper added');
  });
});

describe('diffDesigns — two bevels on one face (final review I3)', () => {
  it('a knife edge: changing or removing one of the two bevels is reported', () => {
    const p = createBoard({ name: 'Blade', length: 20, width: 3, thickness: 0.75, position: [0, 0, 0] });
    const v = (id: string, longSide: 'min' | 'max', deg: number) => ({ id, ...bevelCut({ face: 'width', from: 'max', longSide, ratio: miterRatio(deg) }, p) });
    const d = (cuts: ReturnType<typeof v>[]) => ({ ...createDocument('T'), boards: [{ ...p, angleCuts: cuts }] });
    const lines = (a: ReturnType<typeof v>[], b: ReturnType<typeof v>[]) => diffDesigns(d(a), d(b)).filter((c) => c.kind === 'angle').map((c) => c.text);
    const before = [v('a', 'min', 15), v('b', 'max', 15)];
    expect(lines(before, [v('a', 'min', 15), v('b', 'max', 20)])).toHaveLength(1);
    expect(lines(before, [v('a', 'min', 15)])).toHaveLength(1);
    expect(lines(before, before)).toEqual([]);
  });
});

describe('custom materials in the diff (custom materials spec §3)', () => {
  const ash = { id: 'm-s-ash1', label: 'Ash', color: '#d8c8a8', kind: 'solid' as const };
  const withMaterials = (d: ReturnType<typeof doc>, materials: typeof ash[]) => ({ ...d, materials });
  it('reads a custom label from the after side', () => {
    const before = doc([part('Top', [0, 0, 0], [40, 1, 12])]);
    const after = withMaterials(doc([part('Top', [0, 0, 0], [40, 1, 12])]), [ash]);
    after.boards = after.boards.map((b) => ({ ...b, material: 'm-s-ash1' }));
    expect(diffDesigns(before, after).map((c) => c.text)).toEqual(['Top: Oak → Ash']);
  });
  it('reads a custom label from the before side', () => {
    const before = withMaterials(doc([part('Top', [0, 0, 0], [40, 1, 12])]), [ash]);
    before.boards = before.boards.map((b) => ({ ...b, material: 'm-s-ash1' }));
    const after = doc([part('Top', [0, 0, 0], [40, 1, 12])]);
    expect(diffDesigns(before, after).map((c) => c.text)).toEqual(['Top: Ash → Oak']);
  });
});

describe('diffDesigns in metric', () => {
  it('a length change reads in mm', () => {
    const mm = (d: ReturnType<typeof doc>) => ({ ...d, units: { display: 'metric-mm' as const, precision: 16 } });
    const out = diffDesigns(mm(doc(BASE)), mm(doc([BASE[0], part('Shelf', [0, 0, 0], [40, 1, 14])])));
    expect(out[0]!.text).toBe('Shelf: 1016 × 305 × 25 mm → 1016 × 356 × 25 mm');
  });
});

describe('diffDesigns — hole rows (AI-holes spec §4)', () => {
  const side = (name = 'Side', position: [number, number, number] = [0, 0, 0]) => createBoard({ name, length: 20, width: 4, thickness: 1, position });
  const row = (over: Partial<HoleRow> = {}): HoleRow => ({ id: 'h1', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.375, along: 'length', alongFrom: 'min', station: 2, count: 1, pitch: 0, acrossFrom: 'min', inset: 1.5, ...over });
  const holed = (rows: HoleRow[], b: Board = side()): Board => ({ ...b, holes: rows });
  const dd = (a: Board, b: Board) => diffDesigns({ ...createDocument('T'), boards: [a] }, { ...createDocument('T'), boards: [b] });
  const lines = (a: Board, b: Board) => dd(a, b).filter((c) => c.kind === 'holes').map((c) => c.text);
  it('added, removed and changed rows, one line each, in shop words', () => {
    expect(lines(side(), holed([row({ count: 3, pitch: 2 })]))).toEqual(['Side: 3 holes added on the top face, 1/4" Ø']);
    expect(lines(side(), holed([row()]))).toEqual(['Side: 1 hole added on the top face, 1/4" Ø']);
    expect(lines(holed([row()]), side())).toEqual(['Side: hole row on the top face removed']);
    expect(lines(holed([row()]), holed([row({ depth: 0.5 })]))).toEqual(['Side: hole row on the top face now 1/2" deep']);
    expect(lines(holed([row()]), holed([row({ depth: 'through' })]))).toEqual(['Side: hole row on the top face now through']);
    expect(lines(holed([row()]), holed([row({ diameter: 0.375 })]))).toEqual(['Side: hole row on the top face now 3/8" Ø']);
    expect(lines(holed([row({ count: 3, pitch: 2 })]), holed([row({ count: 4, pitch: 3 })]))).toEqual(['Side: hole row on the top face now 4 holes, 3" apart']);
    expect(lines(holed([row()]), holed([row()]))).toEqual([]);
  });
  it('a row shrunk to one hole reads "1 hole", singular (final review M2)', () => {
    expect(lines(holed([row({ count: 3, pitch: 2 })]), holed([row()]))).toEqual(['Side: hole row on the top face now 1 hole']);
  });
  it('a single bore grown into a row is not "moved"; a direction change alone reads "running toward" (final review M1)', () => {
    // The same first centre (length 2, width 1.5), the row now running along the width.
    const across = { along: 'width' as const, station: 1.5, inset: 2 };
    expect(lines(holed([row()]), holed([row({ ...across, count: 3, pitch: 0.5 })]))).toEqual(['Side: hole row on the top face now 3 holes, 1/2" apart']);
    expect(lines(holed([row({ count: 3, pitch: 1 })]), holed([row({ ...across, count: 3, pitch: 1 })]))).toEqual(['Side: hole row on the top face now running toward the front']);
  });
  it('a row whose first centre moved, otherwise the same, reads as one "moved" line (shop-words spec §5)', () => {
    expect(lines(holed([row()]), holed([row({ station: 5 })]))).toEqual(['Side: hole row on the top face moved 3" toward the right']);
    expect(lines(holed([row()]), holed([row({ station: 1, inset: 2 })]))).toEqual(['Side: hole row on the top face moved 1" toward the left, 1/2" toward the front']);
  });
  it('a moved row that also changed is still a removal plus an addition', () => {
    expect(lines(holed([row()]), holed([row({ station: 5, diameter: 0.375 })]))).toEqual(['Side: 1 hole added on the top face, 3/8" Ø', 'Side: hole row on the top face removed']);
    expect(lines(holed([row({ count: 3, pitch: 1 })]), holed([row({ station: 5, count: 3, pitch: 2 })]))).toEqual(['Side: 3 holes added on the top face, 1/4" Ø', 'Side: hole row on the top face removed']);
    // Another face is never a move.
    expect(lines(holed([row()]), holed([row({ from: 'min' })]))).toEqual(['Side: 1 hole added on the bottom face, 1/4" Ø', 'Side: hole row on the top face removed']);
  });
  it('a move below display precision prints nothing, like the other lines', () => {
    expect(lines(holed([row()]), holed([row({ station: 2.001 })]))).toEqual([]);
  });
  it('two moved rows pair nearest-first: the bookcase\'s "move the pins 1 inch" (the live check\'s rows)', () => {
    const two = (a: number, b: number) => [row({ id: 'a', count: 3, pitch: 1, inset: a }), row({ id: 'b', count: 3, pitch: 1, inset: b })];
    expect(lines(holed(two(1.5, 3.5)), holed(two(1, 3)))).toEqual([
      'Side: hole row on the top face moved 1/2" toward the back', 'Side: hole row on the top face moved 1/2" toward the back',
    ]);
  });
  it('a moved part changes no offset, so yields no hole line', () => {
    const c = dd(holed([row()]), holed([row()], side('Side', [5, 3, 1])));
    expect(c.filter((x) => x.kind === 'holes')).toEqual([]);
    expect(c.map((x) => x.kind)).toEqual(['moved']);
  });
});

describe('diffDesigns — inside and outside (shop-words spec §1, §3)', () => {
  const pins = { face: '+x', diameter: 0.25, depth: 0.375, through: false, offset: v(0.75, 8, 2), toward: '+y', count: 45, pitch: 1.25 };
  const mirror = { ...pins, face: '-x', offset: v(0, 8, 2) };
  const sides = (l: unknown[], r: unknown[]) => doc([
    { ...part('Left side', [0, 0, 0], [0.75, 72, 12]), holes: l as never },
    { ...part('Right side', [35.25, 0, 0], [0.75, 72, 12]), holes: r as never },
  ]);
  const holeTexts = (a: ReturnType<typeof doc>, b: ReturnType<typeof doc>) => diffDesigns(a, b).filter((c) => c.kind === 'holes').map((c) => c.text);
  it('a case side\'s pins read "the inside face" on both sides', () => {
    expect(holeTexts(sides([], []), sides([pins], [mirror]))).toEqual([
      'Left side: 45 holes added on the inside face, 1/4" Ø', 'Right side: 45 holes added on the inside face, 1/4" Ø',
    ]);
    const out = { ...pins, face: '-x', offset: v(0, 8, 2) };
    expect(holeTexts(sides([], []), sides([out], []))).toEqual(['Left side: 45 holes added on the outside face, 1/4" Ø']);
  });
  it('a removal is worded in the BEFORE frame; an unchanged cut is not "changed" because the frame moved', () => {
    // The right side goes: alone, the left side is centred, so its +x face would read "right" in the after frame.
    const alone = (l: unknown[]) => doc([{ ...part('Left side', [0, 0, 0], [0.75, 72, 12]), holes: l as never }]);
    expect(holeTexts(sides([pins], []), alone([]))).toEqual(['Left side: hole row on the inside face removed']);
    expect(holeTexts(sides([pins], []), alone([pins]))).toEqual([]);
    const { angleCuts } = doc([{ ...part('Left side', [0, 0, 0], [0.75, 72, 12]), chamfers: [{ edge: ['+x', '+z'], legs: [0.125, 0.125] }] as never }]).boards[0] as Board;
    const chamfered = (d: ReturnType<typeof doc>) => ({ ...d, boards: d.boards.map((b) => (b.name === 'Left side' ? { ...(b as Board), angleCuts } : b)) });
    const before = chamfered(sides([], [])), after = chamfered(alone([]));
    expect((before.boards[0] as Board).angleCuts).toHaveLength(1);
    expect(diffDesigns(before, after).filter((c) => c.kind === 'angle')).toEqual([]);
  });
  it('a part in a placement takes its placement as the frame, so copies still merge (×N)', () => {
    // A drawer front whose knob hole is drilled on its -z face (the face away from the drawer's sides: outside).
    const knob = { face: '-z', diameter: 0.1875, depth: 0.75, through: true, offset: v(5, 2, 0), toward: '+x', count: 1, pitch: 0 };
    const asm = (holes: unknown[]): GeneratedAssembly => ({ ...drawer('Drawer', [['D1', 0], ['D2', 12], ['D3', 24]]),
      parts: [{ ...part('Front', [0, 0, 0], [10, 4, 0.75]), holes: holes as never }, part('Side', [0, 0, 0.75], [0.75, 4, 10])] });
    const out = diffDesigns(doc([], [asm([])]), doc([], [asm([knob])]));
    expect(out.map((c) => [c.copies, c.text])).toEqual([[3, 'D1 › Front: 1 hole added on the outside face, 3/16" Ø (×3)']]);
  });
});

describe('diffDesigns — edging (AI-bands spec §4.1)', () => {
  const OAK: BandType = { id: 'e-oak', name: 'Oak edging', kind: 'solid', thickness: 0.25, lengthAllowance: 0.5, material: 'oak', widthAllowance: 0.0625 };
  const mk = (name: string, edges: [Dir, string][], position: [number, number, number] = [0, 0, 0]): Board => {
    const b = createBoard({ name, length: 20, width: 4, thickness: 1, position });
    const made = bandsFor(b, edges.map(([edge, edging]) => ({ edge, edging })), (k) => (k === 'veneer' ? BUILT_IN_BAND_ID : k));
    if ('fault' in made) throw new Error(made.fault);
    return { ...b, bands: made.bands };
  };
  const D = (boards: Board[], bandTypes = [BUILT_IN_BAND, OAK]): SloydDocument => ({ ...createDocument('T'), boards, bandTypes });
  const lines = (a: Board, b: Board, ta?: BandType[], tb?: BandType[]) =>
    diffDesigns(D([a], ta), D([b], tb)).filter((c) => c.kind === 'bands').map((c) => c.text);

  it('added, removed and changed-type lines, the edge in absolute words, the type by its own name', () => {
    expect(lines(mk('Shelf', []), mk('Shelf', [['+z', 'e-oak']]))).toEqual(['Shelf: edging added on the front edge (Oak edging)']);
    expect(lines(mk('Shelf', [['+z', 'e-oak']]), mk('Shelf', []))).toEqual(['Shelf: edging on the front edge removed']);
    expect(lines(mk('Shelf', [['+z', 'e-oak']]), mk('Shelf', [['+z', 'veneer']]))).toEqual(['Shelf: edging on the front edge now Iron-on veneer']);
    expect(lines(mk('Shelf', [['-z', 'veneer']]), mk('Shelf', [['-z', 'veneer']]))).toEqual([]);
  });
  it('matches by side: an untouched band beside a changed one gets no line; the order is the directions\'', () => {
    expect(lines(mk('Shelf', [['+z', 'veneer'], ['-z', 'e-oak']]), mk('Shelf', [['+z', 'veneer'], ['-z', 'veneer'], ['+x', 'e-oak']])))
      .toEqual(['Shelf: edging added on the right edge (Oak edging)', 'Shelf: edging on the back edge now Iron-on veneer']);
  });
  it('a type renamed in place (same id) is not a change; names come from each document\'s own types', () => {
    expect(lines(mk('Shelf', [['+z', 'e-oak']]), mk('Shelf', [['+z', 'e-oak']]), [BUILT_IN_BAND, OAK], [BUILT_IN_BAND, { ...OAK, name: 'Red oak edging' }])).toEqual([]);
    expect(lines(mk('Shelf', []), mk('Shelf', [['+z', 'e-oak']]), [BUILT_IN_BAND], [BUILT_IN_BAND, { ...OAK, name: 'Red oak edging' }])).toEqual(['Shelf: edging added on the front edge (Red oak edging)']);
  });
  it('an assembly part\'s line merges across placements', () => {
    const def = () => designToDocument({ name: 'T', parts: [], assemblies: [{ name: 'Drawer', parts: [part('Front', [0, 0, 0], [10, 4, 0.75])],
      placements: [0, 1, 2].map((i) => ({ name: `D${i}`, at: v(i * 12, 0, 0) })) }] }, { centre: false }).doc;
    const base = def();
    const banded: SloydDocument = { ...base, bandTypes: [BUILT_IN_BAND, OAK], definitions: base.definitions.map((d) => ({ ...d,
      boards: d.boards.map((b) => ({ ...b, bands: [{ side: { across: 'width' as const, from: 'min' as const }, type: 'e-oak' }] })) })) };
    const out = diffDesigns(base, banded).filter((c) => c.kind === 'bands');
    expect(out).toHaveLength(1);
    expect(out[0]!.copies).toBe(3);
    expect(out[0]!.text).toMatch(/^D0 › Front: edging added on the \w+ edge \(Oak edging\) \(×3\)$/);
  });
});

describe('diffDesigns — edge profiles (AI-profiles spec §4.1)', () => {
  const W = (over: Partial<WorldProfile> = {}): WorldProfile =>
    ({ edge: ['+y', '+z'], kind: 'roundover', size: 0.25, fillet: 0, depth: 0, facing: 'face', allRound: false, start: 0, end: 20, ...over });
  const mk = (ws: WorldProfile[], name = 'Top'): Board => {
    const b = createBoard({ name, length: 20, width: 4, thickness: 1 });
    const made = profilesFor(b, ws);
    if ('fault' in made) throw new Error(made.fault);
    return { ...b, profiles: made.profiles.map((p, i) => ({ id: `p${i}`, ...p })) };
  };
  const lines = (a: Board, b: Board) =>
    diffDesigns({ ...createDocument('T'), boards: [a] }, { ...createDocument('T'), boards: [b] }).filter((c) => c.kind === 'profiles').map((c) => c.text);

  it('added, removed and resized lines, the edge in absolute words', () => {
    expect(lines(mk([]), mk([W()]))).toEqual(['Top: 1/4" roundover added on the top/front edge']);
    expect(lines(mk([W()]), mk([]))).toEqual(['Top: roundover on the top/front edge removed']);
    expect(lines(mk([W()]), mk([W({ size: 0.375 })]))).toEqual(['Top: roundover on the top/front edge now 3/8"']);
    expect(lines(mk([W()]), mk([W()]))).toEqual([]);
  });
  it('a changed run reads stopped, full length or all round; an ogee reads Roman ogee in lowercase', () => {
    expect(lines(mk([W()]), mk([W({ start: 2, end: 10 })]))).toEqual(['Top: roundover on the top/front edge now stopped']);
    expect(lines(mk([W({ start: 2, end: 10 })]), mk([W()]))).toEqual(['Top: roundover on the top/front edge now full length']);
    expect(lines(mk([W()]), mk([W({ allRound: true, start: 0, end: 0 })]))).toEqual(['Top: roundover all round the top face now all round']);
    expect(lines(mk([]), mk([W({ kind: 'ogee', size: 0.5 })]))).toEqual(['Top: 1/2" roman ogee added on the top/front edge']);
  });
  it('matches by edge: an untouched profile beside a changed one gets no line', () => {
    expect(lines(mk([W(), W({ edge: ['+y', '-z'] })]), mk([W(), W({ edge: ['+y', '-z'], size: 0.5 })]))).toEqual(['Top: roundover on the top/back edge now 1/2"']);
  });
  it('a part with curves has its profiles carried: no lines', () => {
    const c = { ...mk([]), curves: [{ id: 'c', face: 'thickness' as const, from: 'min' as const, start: [3, 0] as [number, number], segments: [] }] } as unknown as Board;
    expect(lines(c, { ...c, profiles: mk([W()]).profiles })).toEqual([]);
  });
});
