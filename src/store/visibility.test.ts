import { createBoard } from '../document/document';
import { visibleBoards } from './visibility';

const a = createBoard({});
const b = createBoard({});
const c = createBoard({});

describe('visibleBoards', () => {
  it('drops hidden parts and keeps document order', () => {
    expect(visibleBoards([a, b, c], [c.id, a.id])).toEqual([b]);
  });

  it('returns the SAME array when nothing is hidden, so a memo over it stays stable', () => {
    const boards = [a, b];
    expect(visibleBoards(boards, [])).toBe(boards);
  });

  it('ignores an id that names no part', () => {
    expect(visibleBoards([a, b], ['nope'])).toEqual([a, b]);
  });
});
