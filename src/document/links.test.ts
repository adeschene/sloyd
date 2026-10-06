import { createBoard } from './document';
import type { Board } from './document';
import { LINK_FIELDS, SHARED_KEYS, linkPlan, sameShared, sharedOf, sharedPatch } from './links';

const leg = (over: Partial<Board> = {}): Board =>
  ({ ...createBoard({ name: 'Leg', length: 28, width: 1.75, thickness: 1.75, posture: 'upright' }), ...over });
const cut = { id: 'c1', face: 'width', from: 'max', across: 'length', offset: 0.5, width: 0.75, depth: 1, stopMin: 22, stopMax: 2 } as const;

describe('LINK_FIELDS', () => {
  it('shares exactly the spec\'s seven fields', () => {
    expect([...SHARED_KEYS].sort()).toEqual(['cuts', 'grain', 'length', 'material', 'posture', 'thickness', 'width']);
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
  it('first selected is the source; changing lists the members that differ', () => {
    const a = leg({ id: 'a', length: 30 });
    const b = leg({ id: 'b' });
    const c = leg({ id: 'c', length: 30 });
    const plan = linkPlan([a, b, c], ['c', 'b', 'a'])!;
    expect(plan.source.id).toBe('c');
    expect(plan.members).toEqual(['a', 'b', 'c']);
    expect(plan.changing).toEqual(['b']);
    expect(plan.shape).toBeNull();
  });
  it('brings the WHOLE shape of an already-linked part, unselected members included', () => {
    const a = leg({ id: 'a', length: 30 });
    const b = leg({ id: 'b', shape: 'L' });
    const c = leg({ id: 'c', shape: 'L' });
    const plan = linkPlan([a, b, c], ['a', 'b'])!;
    expect(plan.members).toEqual(['a', 'b', 'c']);
    expect(plan.changing).toEqual(['b', 'c']);
    expect(plan.shape).toBe('L');
  });
  it('is not a no-op when one shape is shared but a member differs', () => {
    const plan = linkPlan([leg({ id: 'b', shape: 'L' }), leg({ id: 'c', shape: 'L', length: 30 })], ['b', 'c'])!;
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
    expect(linkPlan([a, b, c, d, e], ['c', 'a'])!.shape).toBe('S2');
    expect(linkPlan([a, b, c, d, e], ['c', 'a'])!.members).toEqual(['a', 'b', 'c', 'd']);
    expect(linkPlan([a, b, c, d, e], ['e', 'a'])!.shape).toBe('S1');
  });
});
