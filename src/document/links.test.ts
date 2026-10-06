import { createBoard } from './document';
import type { Board } from './document';
import { LINK_FIELDS, SHARED_KEYS, dissolveSingletons, linkPlan, repairLinks, sameShared, sharedOf, withoutLink } from './links';

const leg = (over: Partial<Board> = {}): Board =>
  ({ ...createBoard({ name: 'Leg', length: 28, width: 1.75, thickness: 1.75, posture: 'upright' }), ...over });
const cut = { id: 'c1', face: 'width', from: 'max', across: 'length', offset: 0.5, width: 0.75, depth: 1, stopMin: 22, stopMax: 2 } as const;

describe('LINK_FIELDS', () => {
  it('shares exactly the spec\'s seven fields', () => {
    expect([...SHARED_KEYS].sort()).toEqual(['cuts', 'grain', 'length', 'material', 'posture', 'thickness', 'width']);
    expect(LINK_FIELDS.rotation).toBe('own');
    expect(LINK_FIELDS.position).toBe('own');
  });
});

describe('sameShared', () => {
  it('is false when any shared field differs, true when only own fields differ', () => {
    const a = leg({ cuts: [cut] });
    expect(sameShared(a, { ...a, id: 'x', name: 'Other', position: [9, 9, 9], rotation: 180, link: 'L' })).toBe(true);
    for (const patch of [{ length: 29 }, { width: 2 }, { thickness: 2 }, { material: 'walnut' }, { grain: 'width' as const }, { posture: 'flat' as const }]) {
      expect(sameShared(a, { ...a, ...patch })).toBe(false);
    }
    expect(sameShared(a, { ...a, cuts: [] })).toBe(false);
    expect(sameShared(a, { ...a, cuts: [{ ...cut, id: 'c2' }] })).toBe(false);
    expect(sameShared(a, { ...a, cuts: [{ ...cut, stopMax: 3 }] })).toBe(false);
  });
});

describe('sharedOf / withoutLink', () => {
  it('copies cuts with the same ids, never the same objects', () => {
    const a = leg({ cuts: [cut] });
    const s = sharedOf(a);
    expect(s.cuts).toEqual(a.cuts);
    expect(s.cuts[0]).not.toBe(a.cuts[0]);
  });
  it('withoutLink removes the key entirely', () => {
    expect('link' in withoutLink(leg({ link: 'L' }))).toBe(false);
  });
});

describe('repairLinks', () => {
  it('unlinks members that differ from the FIRST member, never changing their geometry', () => {
    const a = leg({ id: 'a', link: 'L' });
    const b = leg({ id: 'b', link: 'L' });
    const c = leg({ id: 'c', link: 'L', length: 30 });
    const out = repairLinks([a, b, c]);
    expect(out.map((x) => x.link)).toEqual(['L', 'L', undefined]);
    expect('link' in out[2]!).toBe(false);
    expect(out[2]!.length).toBe(30);
  });
  it('compares against the FIRST member, not the previous one', () => {
    const out = repairLinks([leg({ id: 'a', link: 'L' }), leg({ id: 'b', length: 30, link: 'L' }), leg({ id: 'c', length: 30, link: 'L' })]);
    expect(out.every((x) => !('link' in x))).toBe(true);
  });
  it('clears a label left on one part', () => {
    const out = repairLinks([leg({ id: 'a', link: 'L' }), leg({ id: 'b', length: 30, link: 'L' })]);
    expect(out.every((x) => !('link' in x))).toBe(true);
  });
  it('never merges two labels, even on identical parts (Review Focus 4)', () => {
    const out = repairLinks([leg({ id: 'a', link: 'L1' }), leg({ id: 'b', link: 'L1' }), leg({ id: 'c', link: 'L2' }), leg({ id: 'd', link: 'L2' })]);
    expect(out.map((x) => x.link)).toEqual(['L1', 'L1', 'L2', 'L2']);
  });
  it('returns the same array when nothing changes', () => {
    const boards = [leg({ id: 'a' }), leg({ id: 'b', link: 'L' }), leg({ id: 'c', link: 'L' })];
    expect(repairLinks(boards)).toBe(boards);
    expect(dissolveSingletons(boards)).toBe(boards);
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
    expect(plan.label).toBeNull();
  });
  it('brings the WHOLE link of an already-linked part, unselected members included', () => {
    const a = leg({ id: 'a', length: 30 });
    const b = leg({ id: 'b', link: 'L' });
    const c = leg({ id: 'c', link: 'L' });
    const plan = linkPlan([a, b, c], ['a', 'b'])!;
    expect(plan.members).toEqual(['a', 'b', 'c']);
    expect(plan.changing).toEqual(['b', 'c']);
    expect(plan.label).toBe('L');
  });
  it('is not a no-op when one label is shared but a member differs', () => {
    const plan = linkPlan([leg({ id: 'b', link: 'L' }), leg({ id: 'c', link: 'L', length: 30 })], ['b', 'c'])!;
    expect(plan.changing).toEqual(['c']);
  });
  it('is null for fewer than two parts, or when nothing would change', () => {
    const b = leg({ id: 'b', link: 'L' });
    const c = leg({ id: 'c', link: 'L' });
    expect(linkPlan([b, c], ['b'])).toBeNull();
    expect(linkPlan([b, c], ['b', 'c'])).toBeNull();
  });
});
