import { createBoard, createDocument, createGuide, itemKey, snapPointsFor } from '../document/document';
import type { SloydDocument } from '../document/document';
import { moveCandidates } from './moveCandidates';
import { assemblyDoc } from '../document/treeFixtures';
import { worldParts } from '../document/tree';

const a = createBoard({ position: [0, 0, 0] });
const b = createBoard({ position: [0, 0, 10] });
const c = createBoard({ position: [40, 0, 0] });
const boards = [a, b, c];
const guides = [createGuide([5, 5, 5])];
const owners = (points: { owner: { id: string } }[]) => new Set(points.map((p) => p.owner.id));

describe('moveCandidates', () => {
  it('before a grab: the points of EVERY selected part, and nothing else', () => {
    const points = moveCandidates(boards, guides, [a.id, b.id], [], false, true);
    expect(owners(points)).toEqual(new Set([a.id, b.id]));
    expect(points).toHaveLength(snapPointsFor(a).length + snapPointsFor(b).length);
  });

  it('before a grab with nothing selected: nothing is grabbable', () => {
    expect(moveCandidates(boards, guides, [], [], false, true)).toEqual([]);
  });

  // Review Focus 5, viewport half: a part toggled OUT of the selection during
  // a grab stops moving with it and becomes a target.
  it('after a grab: every UNSELECTED part and the guides — no selected part is a target', () => {
    const points = moveCandidates(boards, guides, [a.id, b.id], [], true, true);
    expect(owners(points)).toEqual(new Set([c.id, guides[0]!.id]));
    const afterToggleOut = moveCandidates(boards, guides, [a.id], [], true, true);
    expect(owners(afterToggleOut)).toEqual(new Set([b.id, c.id, guides[0]!.id]));
  });

  it('hidden guides offer no target', () => {
    const points = moveCandidates(boards, guides, [a.id], [], true, false);
    expect(owners(points)).toEqual(new Set([b.id, c.id]));
  });

  it('a hidden part is never a target, and never a grab source', () => {
    const after = moveCandidates(boards, guides, [a.id], [c.id], true, true);
    expect(owners(after)).toEqual(new Set([b.id, guides[0]!.id]));
    // Defensive: a selected id that is also hidden offers nothing (the store
    // never produces this state; the filter is one rule, not two).
    const before = moveCandidates(boards, guides, [a.id], [a.id], false, true);
    expect(before).toEqual([]);
  });
});

describe('moveCandidates with assemblies', () => {
  it('a selected assembly offers its parts’ points before a grab and none after', () => {
    const doc = assemblyDoc();
    const world = worldParts(doc);
    const pre = moveCandidates(world, [], ['i1'], [], false, false);
    expect(new Set(pre.map((p) => p.owner.id))).toEqual(new Set(['i1/b1', 'i1/b2', 'i1/i2/b3']));
    const post = moveCandidates(world, [], ['i1'], [], true, false);
    expect(new Set(post.map((p) => p.owner.id))).toEqual(new Set(['r1']));
  });
});

describe('moveCandidates with shared definitions (components spec §4.1)', () => {
  const part = (id: string, x: number) => ({ id, name: `P ${id}`, length: 10, width: 4, thickness: 0.75,
    position: [x, 0, 0] as [number, number, number], rotation: 0 as const, posture: 'flat' as const,
    grain: 'length' as const, material: 'oak', cuts: [], angleCuts: [], holes: [] });
  const doc: SloydDocument = {
    ...createDocument(),
    instances: [
      { id: 'i1', name: 'Box', definition: 'd1', position: [0, 0, 0], rotation: 0 },
      { id: 'i2', name: 'Box (1)', definition: 'd1', position: [50, 0, 0], rotation: 0 },
    ],
    definitions: [
      { id: 'd1', boards: [part('b1', 0), part('b2', 12)], instances: [{ id: 'g', name: 'Inner', definition: 'dg', position: [0, 5, 0], rotation: 0 }] },
      { id: 'dg', boards: [part('b3', 0)], instances: [] },
    ],
  };
  const world = worldParts(doc);
  const keyOf = (p: string) => itemKey(doc, p);

  it('after a grab, another occurrence of the selected part is no target', () => {
    const post = moveCandidates(world, [], ['i1/b1'], [], true, false, keyOf);
    expect(owners(post)).toEqual(new Set(['i1/b2', 'i1/g/b3', 'i2/b2', 'i2/g/b3']));
  });

  it('after a grab, every part under another occurrence of a selected nested assembly is no target', () => {
    const post = moveCandidates(world, [], ['i1/g'], [], true, false, keyOf);
    expect(owners(post)).toEqual(new Set(['i1/b1', 'i1/b2', 'i2/b1', 'i2/b2']));
  });

  it('a selected ROOT assembly moves alone: the other copy stays a target', () => {
    const post = moveCandidates(world, [], ['i1'], [], true, false, keyOf);
    expect(owners(post)).toEqual(new Set(['i2/b1', 'i2/b2', 'i2/g/b3']));
  });
});
