import { describe, expect, it } from 'vitest';
import { CURRENT_VERSION, DocumentError, createBoard, createDocument, migrateDocument, partGeometry, bodyVolume, profileCurve, profileFromFields, archCurve, geometryBoard } from './document';
import type { Board, ProfileCut } from './types';

const v17 = (boards: object[], shapes: object[] = []) => JSON.parse(JSON.stringify({ ...createDocument('T'), version: 17, boards, shapes }));
const ro = { through: 'length', uFrom: 'max', vFrom: 'max', kind: 'roundover', size: 0.25, fillet: 0, facing: 'v' } as const;
const part = (over: object) => ({ ...createBoard({ id: 'b1', name: 'Top', length: 36, width: 20, thickness: 0.75 }), ...over });
const load = (raw: object) => migrateDocument(raw);
const board0 = (doc: ReturnType<typeof migrateDocument>) => doc.boards[0] as Board;
const p1 = (over: Partial<ProfileCut> = {}): ProfileCut => ({ id: 'p1', ...profileFromFields(ro), ...over });

describe('loading schema 18 (profile runs spec §3.2, chunk a1)', () => {
  it('this build writes 18', () => expect(CURRENT_VERSION).toBe(18));
  it('a v17 profile curve moves into profiles, keeping its id; other curves stay', () => {
    const arch = { id: 'c2', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1.25 }) };
    const b = board0(load(v17([part({ curves: [{ id: 'c1', ...profileCurve(ro) }, arch] })])));
    expect(b.curves).toEqual([arch]);
    expect(b.profiles).toEqual([p1({ id: 'c1' })]);
  });
  it('the move runs on every load (spec P8): a v18 file with a profile curve in curves is moved too', () => {
    const raw = { ...v17([part({ curves: [{ id: 'c1', ...profileCurve(ro) }] })]), version: 18 };
    expect(board0(load(raw)).profiles.map((p) => p.id)).toEqual(['c1']);
  });
  it('a stored v18 profile is kept; moved ones follow it', () => {
    const raw = { ...v17([part({ curves: [{ id: 'c1', ...profileCurve({ ...ro, uFrom: 'min' }) }], profiles: [p1()] })]), version: 18 };
    expect(board0(load(raw)).profiles.map((p) => p.id)).toEqual(['p1', 'c1']);
  });
  it('profile ids share the part\'s curve id scope (spec P7): a profile repeating a curve id is re-minted', () => {
    const arch = { id: 'x', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1.25 }) };
    const raw = { ...v17([part({ curves: [arch], profiles: [p1({ id: 'x' })] })]), version: 18 };
    const b = board0(load(raw));
    expect(b.curves[0]!.id).toBe('x');
    expect(b.profiles[0]!.id).not.toBe('x');
  });
  it('the migrated part holds the same wood (spec §3.2 pin)', () => {
    const before = createBoard({ length: 36, width: 20, thickness: 0.75, curves: [{ id: 'c1', ...profileCurve(ro) }] });
    const after = board0(load(v17([part({ curves: [{ id: 'c1', ...profileCurve(ro) }] })])));
    const vol = (b: Board) => partGeometry(geometryBoard(b)).bodies.reduce((s, x) => s + bodyVolume(x), 0);
    expect(vol(after)).toBeCloseTo(vol(before), 8);
  });
  it('a hand-made symmetric facing-u curve migrates to facing face, the same wood (spec P5)', () => {
    const u = { id: 'c1', ...profileCurve({ ...ro, facing: 'u' }) };
    const b = board0(load(v17([part({ curves: [u] })])));
    expect(b.profiles[0]!.facing).toBe('face');
    const vol = (x: Board) => partGeometry(geometryBoard(x)).bodies.reduce((s, y) => s + bodyVolume(y), 0);
    expect(vol(b)).toBeCloseTo(vol(createBoard({ length: 36, width: 20, thickness: 0.75, curves: [u] })), 8);
  });
  it('a shape\'s profile curves move too', () => {
    const shape = { id: 's1', length: 36, width: 20, thickness: 0.75, material: 'pine', grain: 'length', posture: 'flat', cuts: [], angleCuts: [], holes: [], curves: [{ id: 'c1', ...profileCurve(ro) }] };
    const doc = load(v17([{ id: 'b1', name: 'Top', position: [0, 0, 0], rotation: 0, shape: 's1' }, { id: 'b2', name: 'Top 2', position: [0, 0, 5], rotation: 0, shape: 's1' }], [shape]));
    expect(doc.shapes[0]!.profiles.map((p) => p.id)).toEqual(['c1']);
    expect(doc.shapes[0]!.curves).toEqual([]);
  });
  it('malformed entries are dropped; a faulted well-formed one is kept', () => {
    const bad = [
      { ...p1(), id: 'a', size: -1 }, { ...p1(), id: 'b', size: Number.NaN }, { ...p1(), id: 'c', face: 'up' },
      { ...p1(), id: 'd', facing: 'sideways' }, { ...p1(), id: 'e', fillet: -0.1 },
      { ...p1(), id: 'f', kind: 'thumbnail', depth: 0.5, size: 0.25, fillet: undefined }, { ...p1(), id: 'g', kind: 'bead', fillet: 0 },
      { ...p1(), id: 'h', run: { start: { side: { across: 'thickness', from: 'max' }, through: 'min' }, end: { side: { across: 'width', from: 'max' }, through: 'max' } } },
      { ...p1(), id: 'i', run: 'all' },
    ];
    const faulted = { ...p1(), id: 'k', size: 15 };          // a 15" roundover on a 20 x 3/4 top runs off: kept
    const raw = { ...v17([part({ profiles: [...bad, faulted] })]), version: 18 };
    expect(board0(load(raw)).profiles.map((p) => p.id)).toEqual(['k']);
  });
  it('an End to end run stored max to min is normalised to min to max', () => {
    const r = p1().run as { start: object; end: object };
    const raw = { ...v17([part({ profiles: [{ ...p1(), run: { start: r.end, end: r.start } }] })]), version: 18 };
    expect(board0(load(raw)).profiles[0]).toEqual(p1());
  });
  it('a symmetric kind stored facing edge is normalised to face', () => {
    const raw = { ...v17([part({ profiles: [{ ...p1(), facing: 'edge' }] })]), version: 18 };
    expect(board0(load(raw)).profiles[0]!.facing).toBe('face');
  });
  // Spec P2: a later build's run must never be drawn full length here.
  const side = { across: 'width', from: 'max' } as const;
  for (const [why, run] of [
    ['all round', { loop: true }],
    ['stopped', { start: { side, from: 'min', at: 3 }, end: { side, through: 'max' } }],
    ['ends on two sides', { start: { side, through: 'min' }, end: { side: { across: 'length', from: 'max' }, through: 'max' } }],
  ] as const) {
    it(`a run this build cannot build refuses the document: ${why}`, () => {
      const raw = { ...v17([part({ profiles: [{ ...p1(), run }] })]), version: 18 };
      expect(() => load(raw)).toThrow(DocumentError);
      expect(() => load(raw)).toThrow(`This project has an edge profile this version of Sloyd can't build (${why}) — it was saved by a newer version of Sloyd.`);
    });
  }
  it('an unknown profile kind string refuses the document', () => {
    const raw = { ...v17([part({ profiles: [{ ...p1(), kind: 'chamfer' }] })]), version: 18 };
    expect(() => load(raw)).toThrow('This project has an edge profile this version of Sloyd can\'t build (kind "chamfer") — it was saved by a newer version of Sloyd.');
  });
  it('a v19 file is refused by the version gate', () => {
    expect(() => load({ ...v17([part({})]), version: 19 })).toThrow(/newer version/);
  });
});
