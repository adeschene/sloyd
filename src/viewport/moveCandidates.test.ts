import { createBoard, createGuide, snapPointsFor } from '../document/document';
import { moveCandidates } from './moveCandidates';

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
