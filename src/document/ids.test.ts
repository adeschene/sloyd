import { nextId } from './ids';

describe('nextId', () => {
  it('mints distinct ids with no slash', () => {
    const ids = Array.from({ length: 50 }, () => nextId());
    expect(new Set(ids).size).toBe(50);
    for (const id of ids) expect(id).not.toContain('/');
  });

  // Fu 51: every kind of id — part, cut, guide, assembly, project — comes from here, so the prefix names no kind.
  it('carries a neutral prefix, not the old board-only `b_`', () => {
    expect(nextId()).toMatch(/^id_[0-9a-z]+_[0-9a-z]+$/);
  });
});
