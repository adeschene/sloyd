import { createBoard } from './document';
import type { Board } from './document';
import type { AngleCut } from './types';
import { LINK_ACROSS_MIRROR, LINK_FIELDS, SHARED_KEYS, linkPlan, sameShared, sharedOf, sharedPatch } from './links';
import type { LinkPlan } from './links';

/** The plan, failing the test when linkPlan gave none or refused. */
const ok = (p: ReturnType<typeof linkPlan>): LinkPlan => {
  if (!p || 'refused' in p) throw new Error(`no plan: ${JSON.stringify(p)}`);
  return p;
};

const leg = (over: Partial<Board> = {}): Board =>
  ({ ...createBoard({ name: 'Leg', length: 28, width: 1.75, thickness: 1.75, posture: 'upright' }), ...over });
const cut = { id: 'c1', face: 'width', from: 'max', across: 'length', offset: 0.5, width: 0.75, depth: 1, stopMin: 22, stopMax: 2 } as const;

describe('LINK_FIELDS', () => {
  it('shares exactly the spec\'s eight fields', () => {
    expect([...SHARED_KEYS].sort()).toEqual(['angleCuts', 'cuts', 'grain', 'length', 'material', 'posture', 'thickness', 'width']);
    expect(LINK_FIELDS.rotation).toBe('own');
    expect(LINK_FIELDS.position).toBe('own');
    expect(LINK_FIELDS.shape).toBe('own');
    expect('link' in LINK_FIELDS).toBe(false);
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
