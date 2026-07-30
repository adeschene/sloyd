import { createBoard } from './document';
import { uniqueName, dedupeNames } from './names';

const named = (...names: string[]) => names.map((name) => createBoard({ name }));

describe('uniqueName', () => {
  it('returns the base unchanged when nothing has that name', () => {
    expect(uniqueName('Leg', named('Apron', 'Top'))).toBe('Leg');
  });

  it('returns the base unchanged when there are no boards at all', () => {
    expect(uniqueName('Leg', [])).toBe('Leg');
  });

  it('appends (1) on a collision', () => {
    expect(uniqueName('Leg', named('Leg'))).toBe('Leg (1)');
  });

  it('picks the next free number', () => {
    expect(uniqueName('Leg', named('Leg', 'Leg (1)', 'Leg (2)'))).toBe('Leg (3)');
  });

  it('reuses a gap rather than counting upward', () => {
    // "Leg (1)" was deleted; the next board should fill the hole.
    expect(uniqueName('Leg', named('Leg', 'Leg (2)'))).toBe('Leg (1)');
  });

  it('strips an existing suffix instead of nesting it', () => {
    // Duplicating "Leg (1)" must not produce "Leg (1) (1)".
    expect(uniqueName('Leg (1)', named('Leg', 'Leg (1)'))).toBe('Leg (2)');
  });

  it('honors an explicitly typed suffix when it happens to be free', () => {
    expect(uniqueName('Leg (1)', named('Leg'))).toBe('Leg (1)');
  });

  it('lets a board keep its own name when renaming', () => {
    const boards = named('Leg', 'Apron');
    expect(uniqueName('Leg', boards, boards[0].id)).toBe('Leg');
  });

  it('still deduplicates against boards other than the excluded one', () => {
    const boards = named('Leg', 'Apron');
    expect(uniqueName('Apron', boards, boards[0].id)).toBe('Apron (1)');
  });

  it('trims surrounding whitespace', () => {
    expect(uniqueName('  Leg  ', named('Apron'))).toBe('Leg');
  });

  it('treats a trimmed name as colliding', () => {
    expect(uniqueName('  Leg  ', named('Leg'))).toBe('Leg (1)');
  });

  it('is case-sensitive — "leg" and "Leg" are different parts', () => {
    expect(uniqueName('leg', named('Leg'))).toBe('leg');
  });
});

describe('dedupeNames', () => {
  it('leaves already-unique names alone', () => {
    const boards = named('Leg', 'Apron', 'Top');
    expect(dedupeNames(boards).map((b) => b.name)).toEqual(['Leg', 'Apron', 'Top']);
  });

  it('renames repeats, first occurrence keeping its name', () => {
    const boards = named('Leg', 'Leg', 'Leg');
    expect(dedupeNames(boards).map((b) => b.name)).toEqual(['Leg', 'Leg (1)', 'Leg (2)']);
  });

  it('does not collide with a suffix that already exists later in the list', () => {
    const boards = named('Leg', 'Leg (1)', 'Leg');
    expect(dedupeNames(boards).map((b) => b.name)).toEqual(['Leg', 'Leg (1)', 'Leg (2)']);
  });

  it('does not mutate the input', () => {
    const boards = named('Leg', 'Leg');
    dedupeNames(boards);
    expect(boards.map((b) => b.name)).toEqual(['Leg', 'Leg']);
  });

  it('preserves every other field and the ids', () => {
    const boards = named('Leg', 'Leg');
    const result = dedupeNames(boards);
    expect(result.map((b) => b.id)).toEqual(boards.map((b) => b.id));
    expect(result[1].length).toBe(boards[1].length);
  });
});
