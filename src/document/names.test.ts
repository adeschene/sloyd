import { createBoard } from './document';
import { uniqueName, dedupeNames, derivedName } from './names';

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

describe('names over any { id, name } (assemblies spec §2.3)', () => {
  it('uniqueName counts instances as siblings', () => {
    expect(uniqueName('Drawer', [{ id: 'i1', name: 'Drawer' }])).toBe('Drawer (1)');
  });
  it('dedupeNames keeps the item type', () => {
    const out = dedupeNames([{ id: 'a', name: 'X', extra: 1 }, { id: 'b', name: 'X', extra: 2 }]);
    expect(out.map((o) => [o.name, o.extra])).toEqual([['X', 1], ['X (1)', 2]]);
  });
});

describe('derivedName (fu 237)', () => {
  const R = ' — refined';
  it('adds the suffix to a plain name', () => { expect(derivedName('Box', R)).toBe('Box — refined'); });
  it('counts the first repeat as 2, not a second suffix', () => { expect(derivedName('Box — refined', R)).toBe('Box — refined 2'); });
  it('counts on from N, past one digit', () => {
    expect(derivedName('Box — refined 2', R)).toBe('Box — refined 3');
    expect(derivedName('Box — refined 9', R)).toBe('Box — refined 10');
    expect(derivedName('Box — refined 41', R)).toBe('Box — refined 42');
  });
  it('a different step underneath stacks: the history is kept', () => {
    expect(derivedName('Box — joined', R)).toBe('Box — joined — refined');
    expect(derivedName('Box — refined', ' — joined')).toBe('Box — refined — joined');
  });
  it('a count below 2 or with a leading zero is not ours: the suffix is added', () => {
    expect(derivedName('Box — refined 1', R)).toBe('Box — refined 1 — refined');
    expect(derivedName('Box — refined 02', R)).toBe('Box — refined 02 — refined');
  });
  it('only a trailing suffix counts', () => {
    expect(derivedName('Shelf unit 2', R)).toBe('Shelf unit 2 — refined');
    expect(derivedName('Bench 3', ' copy')).toBe('Bench 3 copy');
    expect(derivedName('Box — refined top', R)).toBe('Box — refined top — refined');
    expect(derivedName('Box —refined', R)).toBe('Box —refined — refined');
  });
  it('the suffix is matched literally, not as a pattern', () => {
    expect(derivedName('Box (x)', ' (x)')).toBe('Box (x) 2');
    expect(derivedName('Box ax', ' (x)')).toBe('Box ax (x)');
  });
  it('Duplicate\'s plain-space suffix', () => {
    expect(derivedName('Bench', ' copy')).toBe('Bench copy');
    expect(derivedName('Bench copy', ' copy')).toBe('Bench copy 2');
    expect(derivedName('Bench copy 2', ' copy')).toBe('Bench copy 3');
  });
});
