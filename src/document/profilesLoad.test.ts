import { describe, expect, it } from 'vitest';
import { CURRENT_VERSION, DocumentError, createBoard, createDocument, migrateDocument, partGeometry, bodyVolume, profileCurve, profileFromFields, archCurve, geometryBoard } from './document';
import { travelSign } from './profiles';
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
  // b1 lifted the a1 'all round' case ({ loop: true } now loads: see the b1 block below); two sides still refuse (b2).
  for (const [why, run] of [
    ['ends on two sides', { start: { side, through: 'min' }, end: { side: { across: 'length', from: 'max' }, through: 'max' } }],
  ] as const) {
    it(`a run this build cannot build refuses the document: ${why}`, () => {
      const raw = { ...v17([part({ profiles: [{ ...p1(), run }] })]), version: 18 };
      expect(() => load(raw)).toThrow(DocumentError);
      expect(() => load(raw)).toThrow(`This project has an edge profile this version of Sloyd can't build (${why}) — it was saved by a newer version of Sloyd.`);
    });
  }
  // Spec §3.2: an unknown key, a non-true loop and a station end each refuse; a refusal outranks any drop.
  const through = (m: 'min' | 'max') => ({ side, through: m });
  const okRun = { start: through('min'), end: through('max') };
  const refuses = (why: string, over: object, run: unknown = okRun) => {
    const raw = { ...v17([part({ profiles: [{ ...p1(), ...over, run }] })]), version: 18 };
    expect(() => load(raw)).toThrow(`(${why})`);
  };
  it('an unknown run key refuses the document', () => refuses('run "via"', {}, { ...okRun, via: 'outline' }));
  it('a loop that is not exactly true refuses the document', () => refuses('all round', {}, { ...okRun, loop: 'inner' }));
  it('an end with an unknown key refuses the document', () => refuses('run "mitre"', {}, { start: { ...through('min'), mitre: 1 }, end: through('max') }));
  it('a one-side station run beside a through end loads (was the a1 stopped refusal)', () => {
    const raw = { ...v17([part({ profiles: [{ ...p1(), run: { start: { side, from: 'min', at: 3 }, end: { side, through: 'max' } } }] })]), version: 18 };
    expect(board0(load(raw)).profiles).toHaveLength(1);
  });
  it('a station end beside an unreadable end drops the profile (a2: a station alone no longer refuses)', () => {
    const raw = { ...v17([part({ profiles: [{ ...p1(), run: { start: { side, from: 'min', at: 3 }, end: { side: { across: 'depth', from: 'max' }, through: 'max' } } }] })]), version: 18 };
    expect(board0(load(raw)).profiles).toEqual([]);
  });
  it('a station end with a half-valid from/at drops the profile (a2)', () => {
    const raw = { ...v17([part({ profiles: [{ ...p1(), run: { start: { side, from: 'min' }, end: through('max') } }] })]), version: 18 };
    expect(board0(load(raw)).profiles).toEqual([]);
  });
  it('a refusal outranks a drop: unknown kind with a bad size', () => refuses('kind "chamfer"', { kind: 'chamfer', size: -1 }));
  it('a refusal outranks a drop: a through-and-at end with size -1', () =>
    refuses('stopped', { size: -1 }, { start: { side, through: 'min', at: 3 }, end: through('max') }));
  it('a run that is a string, or an end missing its side, still drops', () => {
    const raw = { ...v17([part({ profiles: [{ ...p1(), id: 'a', run: 'all' }, { ...p1(), id: 'b', run: { start: { through: 'min' }, end: through('max') } }, { ...p1(), id: 'c' }] })]), version: 18 };
    expect(board0(load(raw)).profiles.map((p) => p.id)).toEqual(['c']);
  });
  it('an unknown profile kind string refuses the document', () => {
    const raw = { ...v17([part({ profiles: [{ ...p1(), kind: 'chamfer' }] })]), version: 18 };
    expect(() => load(raw)).toThrow('This project has an edge profile this version of Sloyd can\'t build (kind "chamfer") — it was saved by a newer version of Sloyd.');
  });
  it('a one-side station run loads, ordered along travel (a2, P10/P11)', () => {
    const side = { across: 'width', from: 'max' } as const;
    const face = p1().face;
    const fwd = travelSign(face, side) > 0;
    const stored = (x: number, y: number) => {
      const raw = { ...v17([part({ profiles: [{ ...p1(), run: { start: { side, from: 'min', at: x }, end: { side, from: 'min', at: y } } }] })]), version: 18 };
      return board0(load(raw)).profiles;
    };
    for (const [x, y] of [[27, 3], [3, 27]] as const) {
      const r = stored(x, y)[0]!.run;
      if ('loop' in r) throw new Error('loop');
      expect([r.start, r.end].map((e) => ('at' in e ? e.at : e.through))).toEqual(fwd ? [3, 27] : [27, 3]);
    }
    expect(stored(27, 3)).toEqual(stored(3, 27));
  });
  it('a station beside a through end loads', () => {
    const side = { across: 'width', from: 'max' } as const;
    const raw = { ...v17([part({ profiles: [{ ...p1(), run: { start: { side, through: 'min' }, end: { side, from: 'min', at: 20 } } }] })]), version: 18 };
    expect(board0(load(raw)).profiles).toHaveLength(1);
  });
  // fu 391(1): a later build's end must never be misread.
  it('an end carrying both through and from/at refuses (stopped)', () => {
    const side = { across: 'width', from: 'max' } as const;
    const raw = { ...v17([part({ profiles: [{ ...p1(), run: { start: { side, through: 'min', at: 3 }, end: { side, through: 'max' } } }] })]), version: 18 };
    expect(() => load(raw)).toThrow('This project has an edge profile this version of Sloyd can\'t build (stopped) — it was saved by a newer version of Sloyd.');
  });
  it('an end with a readable side and an unreadable through refuses', () => {
    const side = { across: 'width', from: 'max' } as const;
    const raw = { ...v17([part({ profiles: [{ ...p1(), run: { start: { side, through: 'middle' }, end: { side, through: 'max' } } }] })]), version: 18 };
    expect(() => load(raw)).toThrow(/can't build \(run "through"\)/);
  });
  it('a station with a non-finite or negative `at` is dropped, not refused', () => {
    const side = { across: 'width', from: 'max' } as const;
    for (const at of [Number.NaN, -1]) {
      const raw = { ...v17([part({ profiles: [{ ...p1(), run: { start: { side, from: 'min', at }, end: { side, through: 'max' } } }] })]), version: 18 };
      expect(board0(load(JSON.parse(JSON.stringify(raw)))).profiles).toEqual([]);
    }
  });
  // Profile runs b1: All round loads; anything else under `loop` still refuses.
  it('a { loop: true } profile loads, keeps run { loop: true } and round-trips byte for byte (b1)', () => {
    const raw = { ...v17([part({ profiles: [{ ...p1(), run: { loop: true } }] })]), version: 18 };
    const doc = load(raw);
    expect(board0(doc).profiles).toHaveLength(1);
    expect(board0(doc).profiles[0]!.run).toEqual({ loop: true });
    expect(board0(doc).profiles[0]!.run).not.toBe(raw.boards[0].profiles[0].run);
    const again = load(JSON.parse(JSON.stringify(doc)));
    expect(JSON.stringify(again)).toBe(JSON.stringify(doc));
  });
  it('a loop keeps the shared fields and is dropped like any profile for a bad size (refusals outrank drops)', () => {
    const raw = { ...v17([part({ profiles: [{ ...p1({ id: 'a' }), run: { loop: true } }, { ...p1({ id: 'b' }), size: -1, run: { loop: true } }] })]), version: 18 };
    expect(board0(load(raw)).profiles).toEqual([{ ...p1({ id: 'a' }), run: { loop: true } }]);
  });
  for (const [name, run] of [
    ['loop: false', { loop: false }],
    ['loop: 1', { loop: 1 }],
    ['loop beside start', { loop: true, start: { side, through: 'min' } }],
    ['loop beside start and end', { loop: true, ...okRun }],
  ] as const) {
    it(`a run with ${name} refuses the document (all round, b1)`, () => {
      const raw = { ...v17([part({ profiles: [{ ...p1(), run }] })]), version: 18 };
      expect(() => load(raw)).toThrow('This project has an edge profile this version of Sloyd can\'t build (all round) — it was saved by a newer version of Sloyd.');
    });
  }
  it('ends on two sides still refuse beside a loading loop (b2)', () => {
    const two = { start: { side, through: 'min' }, end: { side: { across: 'length', from: 'max' }, through: 'max' } };
    const raw = { ...v17([part({ profiles: [{ ...p1({ id: 'a' }), run: { loop: true } }, { ...p1({ id: 'b' }), run: two }] })]), version: 18 };
    expect(() => load(raw)).toThrow('(ends on two sides)');
  });
  it('a v19 file is refused by the version gate', () => {
    expect(() => load({ ...v17([part({})]), version: 19 })).toThrow(/newer version/);
  });
});
