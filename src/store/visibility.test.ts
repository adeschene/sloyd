import { createBoard, guideCandidates, lineFaceCandidates } from '../document/document';
import type { Guide } from '../document/document';
import { SCENE_EXTENT } from '../viewport/extent';
import { visibleBoards, visibleGuides } from './visibility';

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

// Selectable guides spec §3.5 (fu 591): ONE filter; a hidden guide is not a snap candidate, nor is a crossing involving
// a hidden line, nor any face hit of a hidden line.
describe('visibleGuides', () => {
  const g1: Guide = { id: 'g1', at: [1, 1, 1] };
  const g2: Guide = { id: 'g2', at: [0, 0.375, 3], axis: 'x' };
  const g3: Guide = { id: 'g3', at: [3, 0.375, 0], axis: 'z' };

  it('returns the SAME array when nothing is hidden', () => {
    const gs = [g1, g2];
    expect(visibleGuides(gs, [])).toBe(gs);
  });

  it('omits the hidden guide only, keeping order', () => {
    expect(visibleGuides([g1, g2, g3], ['g2'])).toEqual([g1, g3]);
  });

  it('a crossing with a hidden line is not a candidate (Review Focus 4)', () => {
    const crossings = (hidden: string[]) =>
      guideCandidates(visibleGuides([g2, g3], hidden), SCENE_EXTENT).filter((p) => p.kind === 'line-cross');
    expect(crossings([])).toHaveLength(1);
    expect(crossings(['g3'])).toEqual([]);
  });

  it('a hidden line offers no face hits', () => {
    const part = createBoard({ length: 24, width: 5.5, thickness: 0.75, posture: 'flat', position: [0, 0, 0] });
    expect(lineFaceCandidates(visibleGuides([g3], []), [part], SCENE_EXTENT).length).toBeGreaterThan(0);
    expect(lineFaceCandidates(visibleGuides([g3], ['g3']), [part], SCENE_EXTENT)).toEqual([]);
  });
});
