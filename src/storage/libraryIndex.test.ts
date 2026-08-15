import { describe, it, expect } from 'vitest';
import { LAYOUT_VERSION, parseIndex, sortEntries, touchEntry, removeEntry } from './libraryIndex';
import type { LibraryIndex } from './types';

const entry = (id: string, savedAt: number, createdAt = 0) => ({
  id, name: id, savedAt, createdAt,
});

const index = (...projects: ReturnType<typeof entry>[]): LibraryIndex => ({
  layout: LAYOUT_VERSION,
  activeId: projects[0]?.id ?? '',
  projects,
});

describe('parseIndex', () => {
  it('accepts a well-formed index', () => {
    const parsed = parseIndex(index(entry('a', 5)));
    expect(parsed?.projects).toHaveLength(1);
    expect(parsed?.activeId).toBe('a');
  });

  it('returns null for a non-object', () => {
    expect(parseIndex(null)).toBeNull();
    expect(parseIndex('nope')).toBeNull();
    expect(parseIndex(42)).toBeNull();
  });

  it('returns null for a layout it does not understand', () => {
    expect(parseIndex({ ...index(entry('a', 1)), layout: 99 })).toBeNull();
  });

  it('returns null when layout is absent entirely', () => {
    // Both other layout cases above use a NUMBER greater than LAYOUT_VERSION,
    // so `i.layout !== LAYOUT_VERSION` could be narrowed to
    // `typeof i.layout === 'number' && i.layout !== LAYOUT_VERSION` with every
    // test still green — and under that narrowing a foreign or truncated
    // `{ projects: [...] }` blob sitting at LIBRARY_KEY parses as a VALID
    // index, which is exactly the clobber invariant 30 exists to prevent.
    // This case and the wrong-type one below are what pin the check.
    expect(parseIndex({ activeId: '', projects: [] })).toBeNull();
    expect(parseIndex({ activeId: 'a', projects: [entry('a', 1)] })).toBeNull();
  });

  it('returns null for a layout of the wrong type', () => {
    expect(parseIndex({ ...index(entry('a', 1)), layout: '1' })).toBeNull();
    expect(parseIndex({ ...index(entry('a', 1)), layout: null })).toBeNull();
  });

  it('drops a malformed entry rather than refusing the whole index', () => {
    // Same argument as validateGuides: a saved library must always open.
    const raw = {
      layout: LAYOUT_VERSION,
      activeId: 'a',
      projects: [entry('a', 1), { id: '', name: 'x', savedAt: 1, createdAt: 0 }, null, { nope: true }],
    };
    expect(parseIndex(raw)?.projects.map((p) => p.id)).toEqual(['a']);
  });

  it('defaults a non-numeric timestamp to 0 instead of dropping the project', () => {
    // Losing a timestamp costs sort position. Losing the project costs work.
    const raw = {
      layout: LAYOUT_VERSION,
      activeId: 'a',
      projects: [{ id: 'a', name: 'A', savedAt: 'soon', createdAt: undefined }],
    };
    expect(parseIndex(raw)?.projects).toEqual([{ id: 'a', name: 'A', savedAt: 0, createdAt: 0 }]);
  });
});

describe('sortEntries', () => {
  it('puts the most recently saved first', () => {
    const sorted = sortEntries([entry('old', 1), entry('new', 9), entry('mid', 5)]);
    expect(sorted.map((p) => p.id)).toEqual(['new', 'mid', 'old']);
  });

  it('breaks a savedAt tie by createdAt, newest first', () => {
    const sorted = sortEntries([entry('first', 5, 1), entry('second', 5, 2)]);
    expect(sorted.map((p) => p.id)).toEqual(['second', 'first']);
  });

  it('does not mutate its argument', () => {
    const input = [entry('a', 1), entry('b', 2)];
    sortEntries(input);
    expect(input.map((p) => p.id)).toEqual(['a', 'b']);
  });
});

describe('touchEntry', () => {
  it('updates savedAt and adopts the current document name', () => {
    const next = touchEntry(index(entry('a', 1)), 'a', 'Renamed', 500);
    expect(next.projects[0]).toMatchObject({ name: 'Renamed', savedAt: 500 });
  });

  it('leaves other projects alone', () => {
    const next = touchEntry(index(entry('a', 1), entry('b', 2)), 'a', 'A', 500);
    expect(next.projects[1]).toEqual(entry('b', 2));
  });

  it('is a no-op for an unknown id', () => {
    const before = index(entry('a', 1));
    expect(touchEntry(before, 'ghost', 'G', 500)).toEqual(before);
  });
});

describe('removeEntry', () => {
  it('drops the named project', () => {
    const next = removeEntry(index(entry('a', 1), entry('b', 2)), 'a');
    expect(next.projects.map((p) => p.id)).toEqual(['b']);
  });

  it('leaves activeId alone - choosing the next active is the adapter\'s job', () => {
    // Kept deliberately dumb: the adapter has to load a document to make that
    // choice, and this module must stay testable without one.
    const next = removeEntry(index(entry('a', 1), entry('b', 2)), 'a');
    expect(next.activeId).toBe('a');
  });
});
