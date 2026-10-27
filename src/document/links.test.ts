import { createBoard } from './document';
import type { Board } from './document';
import type { AngleCut, HoleRow } from './types';
import { LINK_ACROSS_MIRROR, LINK_FIELDS, SHARED_KEYS, linkPlan, sameShared, sharedOf, sharedPatch } from './links';
import type { LinkPlan } from './links';
import { ARCH } from './curveFixtures';
import { linkByRole } from './roleLinks';
import { resolveBoard } from './shapes';
import { createDocument } from './document';
import type { RoundTenon, Shape, SloydDocument } from './types';

/** The plan, failing the test when linkPlan gave none or refused. */
const ok = (p: ReturnType<typeof linkPlan>): LinkPlan => {
  if (!p || 'refused' in p) throw new Error(`no plan: ${JSON.stringify(p)}`);
  return p;
};

const leg = (over: Partial<Board> = {}): Board =>
  ({ ...createBoard({ name: 'Leg', length: 28, width: 1.75, thickness: 1.75, posture: 'upright' }), ...over });
const cut = { id: 'c1', face: 'width', from: 'max', across: 'length', offset: 0.5, width: 0.75, depth: 1, stopMin: 22, stopMax: 2 } as const;

describe('LINK_FIELDS', () => {
  it('shares exactly the spec\'s ten fields plus profiles, bands, cornerRule, hardware, lean, tenons and dovetails', () => {
    expect([...SHARED_KEYS].sort()).toEqual(['angleCuts', 'bands', 'cornerRule', 'curves', 'cuts', 'dovetails', 'grain', 'hardware', 'holes', 'lean', 'length', 'material', 'posture', 'profiles', 'tenons', 'thickness', 'width']);
    expect(LINK_FIELDS.rotation).toBe('own');
    expect(LINK_FIELDS.position).toBe('own');
    expect(LINK_FIELDS.shape).toBe('own');
    expect('link' in LINK_FIELDS).toBe(false);
  });
});

describe('sameShared: tenons', () => {
  const t = { id: 't1', end: 'min' as const, diameter: 1, length: 1.5 };
  it('compares ids too (inv 40), and every field', () => {
    const a = leg({ tenons: [t] });
    expect(sameShared(a, leg({ tenons: [{ ...t }] }))).toBe(true);
    expect(sameShared(a, leg({ tenons: [{ ...t, id: 't2' }] }))).toBe(false);
    expect(sameShared(a, leg({ tenons: [{ ...t, length: 2 }] }))).toBe(false);
    expect(sameShared(a, leg())).toBe(false);
  });
});

describe('sameShared', () => {
  it('is false when any shared field differs, true when only own fields differ', () => {
    const a = leg({ cuts: [cut] });
    expect(sameShared(a, { ...a, id: 'x', name: 'Other', position: [9, 9, 9], rotation: 180, shape: 's1' })).toBe(true);
    for (const patch of [{ length: 29 }, { width: 2 }, { thickness: 2 }, { material: 'walnut' }, { grain: 'width' as const }, { posture: 'flat' as const }]) {
      expect(sameShared(a, { ...a, ...patch })).toBe(false);
    }
    expect(sameShared(a, { ...a, cuts: [] })).toBe(false);
    expect(sameShared(a, { ...a, cuts: [{ ...cut, id: 'c2' }] })).toBe(false);
    expect(sameShared(a, { ...a, cuts: [{ ...cut, stopMax: 3 }] })).toBe(false);
  });
});

describe('sharedPatch', () => {
  it('drops own keys, passes shared ones, and copies cuts so no Cut object is shared', () => {
    const cuts = [cut];
    const out = sharedPatch({
      id: 'x', name: 'N', position: [1, 2, 3], rotation: 90, shape: 's1',
      length: 30, material: 'walnut', cuts,
    });
    expect(Object.keys(out).sort()).toEqual(['cuts', 'length', 'material']);
    expect(out.length).toBe(30);
    expect(out.material).toBe('walnut');
    expect(out.cuts).toEqual(cuts);
    expect(out.cuts).not.toBe(cuts);
    expect(out.cuts![0]).not.toBe(cuts[0]);
  });
});

describe('sharedOf', () => {
  it('copies cuts with the same ids, never the same objects', () => {
    const a = leg({ cuts: [cut] });
    const s = sharedOf(a);
    expect(s.cuts).toEqual(a.cuts);
    expect(s.cuts[0]).not.toBe(a.cuts[0]);
  });
});

describe('linkPlan', () => {
  it('refuses members that are all placements of ONE stored part (fu 231), and still plans distinct ones', () => {
    const a = leg({ id: 'i1/b1' });
    const b = leg({ id: 'i2/b1', length: 30 });
    const c = leg({ id: 'i2/b2', length: 30 });
    const keyOf = (p: string) => `d1:${p.split('/')[1]}`;
    expect(linkPlan([a, b], ['i1/b1', 'i2/b1'], keyOf)).toBeNull();
    expect(linkPlan([a, c], ['i1/b1', 'i2/b2'], keyOf)).not.toBeNull();
    expect(linkPlan([a, b], ['i1/b1', 'i2/b1'])).not.toBeNull(); // no keyOf: ids are distinct parts
  });
  it('first selected is the source; changing lists the members that differ', () => {
    const a = leg({ id: 'a', length: 30 });
    const b = leg({ id: 'b' });
    const c = leg({ id: 'c', length: 30 });
    const plan = ok(linkPlan([a, b, c], ['c', 'b', 'a']));
    expect(plan.source.id).toBe('c');
    expect(plan.members).toEqual(['a', 'b', 'c']);
    expect(plan.changing).toEqual(['b']);
    expect(plan.shape).toBeNull();
  });
  it('brings the WHOLE shape of an already-linked part, unselected members included', () => {
    const a = leg({ id: 'a', length: 30 });
    const b = leg({ id: 'b', shape: 'L' });
    const c = leg({ id: 'c', shape: 'L' });
    const plan = ok(linkPlan([a, b, c], ['a', 'b']));
    expect(plan.members).toEqual(['a', 'b', 'c']);
    expect(plan.changing).toEqual(['b', 'c']);
    expect(plan.shape).toBe('L');
  });
  it('is not a no-op when one shape is shared but a member differs', () => {
    const plan = ok(linkPlan([leg({ id: 'b', shape: 'L' }), leg({ id: 'c', shape: 'L', length: 30 })], ['b', 'c']));
    expect(plan.changing).toEqual(['c']);
  });
  it('is null for fewer than two parts, or when nothing would change', () => {
    const b = leg({ id: 'b', shape: 'L' });
    const c = leg({ id: 'c', shape: 'L' });
    expect(linkPlan([b, c], ['b'])).toBeNull();
    expect(linkPlan([b, c], ['b', 'c'])).toBeNull();
  });
  it('reuses the SOURCE\'s shape over a selected member\'s, and a member\'s when the source has none', () => {
    const a = leg({ id: 'a', shape: 'S1' });
    const b = leg({ id: 'b', shape: 'S1' });
    const c = leg({ id: 'c', shape: 'S2' });
    const d = leg({ id: 'd', shape: 'S2' });
    const e = leg({ id: 'e' });
    expect(ok(linkPlan([a, b, c, d, e], ['c', 'a'])).shape).toBe('S2');
    expect(ok(linkPlan([a, b, c, d, e], ['c', 'a'])).members).toEqual(['a', 'b', 'c', 'd']);
    expect(ok(linkPlan([a, b, c, d, e], ['e', 'a'])).shape).toBe('S1');
  });
  it('refuses members on opposite sides of a mirror, in either order; same side is a plan', () => {
    const a = leg({ id: 'i1/a', length: 30 });
    const b = leg({ id: 'b' });
    const m = (p: string) => p.startsWith('i1/');
    expect(linkPlan([a, b], ['i1/a', 'b'], undefined, m)).toEqual({ refused: LINK_ACROSS_MIRROR });
    expect(linkPlan([a, b], ['b', 'i1/a'], undefined, m)).toEqual({ refused: LINK_ACROSS_MIRROR });
    expect(ok(linkPlan([a, b], ['i1/a', 'b'], undefined, () => true)).members).toEqual(['i1/a', 'b']);
  });
  it('allows a member whose stored part also sits on the source\'s side (a live mirrored copy) and does not count it as changing', () => {
    // Keys: `b` and `i1/b` are two placements of ONE stored part (a definition placed plain and mirrored).
    const keyOf = (p: string) => p.replace(/^i\d\//, 'd:');
    const m = (p: string) => p.startsWith('i1/');
    const a = leg({ id: 'i0/a', length: 30 });
    const b = leg({ id: 'i0/b', shape: 'L' });
    const b2 = leg({ id: 'i0/b2', shape: 'L' });
    const mb = leg({ id: 'i1/b', shape: 'L', cuts: [cut] }); // what the mirror shows differs; it is not compared
    const mb2 = leg({ id: 'i1/b2', shape: 'L', cuts: [cut] });
    const plan = ok(linkPlan([a, b, b2, mb, mb2], ['i0/a', 'i0/b'], keyOf, m));
    expect(plan.changing).toEqual(['i0/b', 'i0/b2']);
    expect(plan.members).toEqual(['i0/a', 'i0/b', 'i0/b2', 'i1/b', 'i1/b2']);
    // Already one Shape, matching on the source's side: a no-op, not a refusal.
    expect(linkPlan([a, b, b2, mb, mb2], ['i0/b', 'i0/b2'], keyOf, m)).toBeNull();
  });
  it('refuses a member, brought along by its shape, whose stored part has no occurrence on the source\'s side', () => {
    const keyOf = (p: string) => (p.startsWith('i1/') ? `d:${p.slice(3)}` : `root:${p}`);
    const a = leg({ id: 'a', length: 30 });
    const b = leg({ id: 'b', shape: 'L' });
    const c = leg({ id: 'i1/c', shape: 'L' });
    expect(linkPlan([a, b, c], ['a', 'b'], keyOf, (p) => p.startsWith('i1/'))).toEqual({ refused: LINK_ACROSS_MIRROR });
  });
  it('refuses a PICKED part on the other side even when its stored part also sits on the source\'s side', () => {
    const keyOf = (p: string) => p.replace(/^i\d\//, 'd:');
    const m = leg({ id: 'M' });
    const plainS = leg({ id: 'i0/S' });
    const mirroredS = leg({ id: 'i1/S' });
    const mirrored = (p: string) => p.startsWith('i1/');
    expect(linkPlan([m, plainS, mirroredS], ['M', 'i1/S'], keyOf, mirrored)).toEqual({ refused: LINK_ACROSS_MIRROR });
    expect(linkPlan([m, plainS, mirroredS], ['i1/S', 'M'], keyOf, mirrored)).toEqual({ refused: LINK_ACROSS_MIRROR });
  });
});

describe('angle cuts are a shared field (angle-cuts spec §5.2)', () => {
  const taper: AngleCut = { id: 'a1', kind: 'taper', face: 'width', from: 'min', along: 'length', alongFrom: 'min', points: [[0, 0.625], [24, 0]] };
  const a = createBoard({ id: 'p', length: 29, width: 1.75, thickness: 1.75, angleCuts: [taper] });
  const b = createBoard({ id: 'q', length: 29, width: 1.75, thickness: 1.75, angleCuts: [{ ...taper }] });

  it('is classified shared', () => {
    expect(LINK_FIELDS.angleCuts).toBe('shared');
  });
  it('makes a tapered part and a plain one differ', () => {
    expect(sameShared(a, { ...b, angleCuts: [] })).toBe(false);
    expect(sameShared(a, b)).toBe(true);
    expect(sameShared(a, { ...b, angleCuts: [{ ...taper, kind: 'bevel' }] })).toBe(false);
    expect(sameShared(a, { ...b, angleCuts: [{ ...taper, id: 'other' }] })).toBe(false); // by id, like cuts
  });
  it('copies the cuts and their points in sharedOf and sharedPatch', () => {
    const s = sharedOf(a);
    expect(s.angleCuts).toEqual(a.angleCuts);
    expect(s.angleCuts[0]).not.toBe(a.angleCuts[0]);
    expect(s.angleCuts[0]!.points).not.toBe(a.angleCuts[0]!.points);
    const p = sharedPatch({ angleCuts: a.angleCuts });
    expect(p.angleCuts![0]!.points).not.toBe(a.angleCuts[0]!.points);
  });
});

describe('links see holes (holes spec §5.2)', () => {
  const PIN: HoleRow = {
    id: 'h1', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.375, along: 'length', alongFrom: 'min',
    station: 2, count: 21, pitch: 32 / 25.4, acrossFrom: 'min', inset: 1.5,
  };
  const a = createBoard({ id: 'a', holes: [PIN] });
  it('a holed part and a plain one are not the same shared part', () => {
    expect(sameShared(a, { ...a, id: 'b', holes: [] })).toBe(false);
  });
  it('equal rows with equal ids are the same; a changed field is not', () => {
    expect(sameShared(a, { ...a, id: 'b', holes: [{ ...PIN }] })).toBe(true);
    expect(sameShared(a, { ...a, id: 'b', holes: [{ ...PIN, inset: 2 }] })).toBe(false);
  });
  it('sharedOf copies the rows', () => {
    expect(sharedOf(a).holes).toEqual([PIN]);
    expect(sharedOf(a).holes[0]).not.toBe(PIN);
  });
  it('sharedPatch copies the rows too: no two members ever hold one HoleRow object (final review 6)', () => {
    const p = sharedPatch({ holes: a.holes });
    expect(p.holes).toEqual([PIN]);
    expect(p.holes).not.toBe(a.holes);
    expect(p.holes![0]).not.toBe(PIN);
  });
});

describe('links see curves (curves spec §6.2)', () => {
  const a = createBoard({ id: 'a', curves: [ARCH] });
  it('a curved part and a plain one are not the same shared part', () => {
    expect(sameShared(a, { ...a, id: 'b', curves: [] })).toBe(false);
  });
  it('equal curves with equal ids are the same; a changed rise or id is not', () => {
    expect(sameShared(a, { ...a, id: 'b', curves: [{ ...ARCH }] })).toBe(true);
    expect(sameShared(a, { ...a, id: 'b', curves: [{ ...ARCH, id: 'zz' }] })).toBe(false);
    expect(sameShared(a, { ...a, id: 'b', curves: [{ ...ARCH, segments: [{ type: 'arc', to: [27, 0], side: 'left', rise: 1 }, { type: 'line', to: [3, 0] }] }] })).toBe(false);
  });
  it('sharedOf copies the curves', () => {
    expect(sharedOf(a).curves).toEqual([ARCH]);
    expect(sharedOf(a).curves[0]).not.toBe(ARCH);
  });
});

describe('the link note\'s claim (fu 411)', () => {
  it('only name, position, turn and Mirrored (and the ids) are a part\'s own — Properties says "every edit but name, position, turn and Mirrored"', () => {
    // If this fails, a field became own or shared: reword the note in Properties.tsx to match.
    const own = (Object.keys(LINK_FIELDS) as (keyof typeof LINK_FIELDS)[]).filter((k) => LINK_FIELDS[k] === 'own').sort();
    // `mirrored` (fu 432) is the Mirrored checkbox's, which changes this part alone (mirrored links Task 3).
    expect(own).toEqual(['id', 'mirrored', 'name', 'position', 'rotation', 'shape']);
  });
});

describe('lean in links (splayed legs spec §3.1)', () => {
  const leaning = (z: number, over: Partial<Board> = {}): Board => leg({ lean: { x: 0.1, z, face: 'width' }, ...over });

  it('sameShared compares lean by value: equal leans are same, a differing z is not, absent equals absent only', () => {
    expect(sameShared(leaning(0.2), leaning(0.2))).toBe(true);
    expect(sameShared(leaning(0.2), leaning(0.25))).toBe(false);
    expect(sameShared(leaning(0.2), leg())).toBe(false);
    expect(sameShared(leg(), leaning(0.2))).toBe(false);
    expect(sameShared(leg(), leg())).toBe(true);
    expect(sameShared(leaning(0.2), leaning(0.2, { lean: { x: 0.1, z: 0.2, face: 'thickness' } }))).toBe(false);
    expect(sameShared(leaning(0.2), leaning(0.2, { lean: { x: 0.3, z: 0.2, face: 'width' } }))).toBe(false);
  });

  it('sharedOf copies the lean (a fresh object) and omits the key when absent', () => {
    const b = leaning(0.2);
    const s = sharedOf(b);
    expect(s.lean).toEqual(b.lean);
    expect(s.lean).not.toBe(b.lean);
    expect('lean' in sharedOf(leg())).toBe(false);
  });

  it('sharedPatch copies a lean it propagates', () => {
    const lean = { x: 0.1, z: 0.2, face: 'width' as const };
    const p = sharedPatch({ lean });
    expect(p.lean).toEqual(lean);
    expect(p.lean).not.toBe(lean);
  });

  it('a patch whose `lean` key is present and undefined is a REMOVAL; absent means untouched (controller ruling 1)', () => {
    const p = sharedPatch({ lean: undefined });
    expect('lean' in p).toBe(true);
    expect(p.lean).toBeUndefined();
    expect('lean' in sharedPatch({ name: 'Leg' })).toBe(false);
    expect('lean' in sharedPatch({ length: 20 })).toBe(false);
  });
});

describe('tenons in links (round tenons spec §3.1)', () => {
  const t: RoundTenon = { id: 't1', end: 'max', diameter: 0.75, length: 1.25 };

  it('linking two legs stores their tenons once on the Shape', () => {
    // Two legs made apart: equal tenons under different ids (ids are not geometry; alignedTo adopts the first's).
    const a = { ...leg({ tenons: [t] }), id: 'a', name: 'Leg 1' };
    const b = { ...leg({ tenons: [{ ...t, id: 't9' }] }), id: 'b', name: 'Leg 2', position: [10, 0, 0] as [number, number, number] };
    const doc: SloydDocument = { ...createDocument('T'), boards: [a, b] };
    const out = linkByRole(doc, new Map([['a', 'leg'], ['b', 'leg']]));
    expect(out.shapes).toHaveLength(1);
    expect(out.shapes[0]!.tenons).toEqual([t]);
    // Stored ONCE: neither user's record carries the field.
    expect(out.boards.map((x) => 'tenons' in x)).toEqual([false, false]);
    // A fresh copy per user (copyTenon), never the Shape's object.
    const shapes = new Map(out.shapes.map((s) => [s.id, s]));
    const users = out.boards.map((x) => resolveBoard(shapes, x)!);
    expect(users.map((u) => u.tenons)).toEqual([[t], [t]]);
    expect(users[0]!.tenons![0]).not.toBe(out.shapes[0]!.tenons![0]);
    expect(users[0]!.tenons![0]).not.toBe(users[1]!.tenons![0]);
  });

  it('legs whose tenons differ by a field do not link', () => {
    const a = { ...leg({ tenons: [t] }), id: 'a' };
    const b = { ...leg({ tenons: [{ ...t, id: 't9', diameter: 1 }] }), id: 'b', position: [10, 0, 0] as [number, number, number] };
    const out = linkByRole({ ...createDocument('T'), boards: [a, b] }, new Map([['a', 'leg'], ['b', 'leg']]));
    expect(out.shapes).toHaveLength(0);
  });

  it('sharedOf copies the tenons and stores no key for none, absent or empty (never [])', () => {
    const s = sharedOf(leg({ tenons: [t] }));
    expect(s.tenons).toEqual([t]);
    expect(s.tenons![0]).not.toBe(t);
    expect('tenons' in sharedOf(leg())).toBe(false);
    expect('tenons' in sharedOf(leg({ tenons: [] }))).toBe(false);
  });

  it('sharedPatch copies tenons it propagates; a present key undefined or [] is a REMOVAL; absent is untouched', () => {
    const p = sharedPatch({ tenons: [t] });
    expect(p.tenons).toEqual([t]);
    expect(p.tenons![0]).not.toBe(t);
    for (const removal of [{ tenons: undefined }, { tenons: [] }]) {
      const q = sharedPatch(removal);
      expect('tenons' in q).toBe(true);
      expect(q.tenons).toBeUndefined();
    }
    expect('tenons' in sharedPatch({ length: 20 })).toBe(false);
  });

  it('resolveBoard: a Shape with no tenons, or a key present as undefined, gives a user with no key; never throws', () => {
    const { tenons: _t, ...bare } = { id: 's1', ...sharedOf(leg()) } as Shape;
    const user = { id: 'u', name: 'U', position: [0, 0, 0] as [number, number, number], rotation: 0 as const, shape: 's1' };
    expect('tenons' in resolveBoard(new Map([['s1', bare]]), user)!).toBe(false);
    const undef = { ...bare, tenons: undefined } as Shape;
    expect(() => resolveBoard(new Map([['s1', undef]]), user)).not.toThrow();
    expect('tenons' in resolveBoard(new Map([['s1', undef]]), user)!).toBe(false);
  });
});
