import {
  createBoard, createDocument, migrateDocument, DocumentError, CURRENT_VERSION,
} from './document';
import { boardExtents, boardCenter } from './geometry';

describe('boardExtents', () => {
  const base = createBoard({ length: 36, width: 9, thickness: 0.75 });

  it('lies flat, unrotated: length on X, thickness on Y, width on Z', () => {
    expect(boardExtents({ ...base, standing: false, rotation: 0 })).toEqual([36, 0.75, 9]);
  });

  it('lies flat, rotated 90: width on X, thickness on Y, length on Z', () => {
    expect(boardExtents({ ...base, standing: false, rotation: 90 })).toEqual([9, 0.75, 36]);
  });

  it('stands, unrotated: length on X, width on Y, thickness on Z', () => {
    expect(boardExtents({ ...base, standing: true, rotation: 0 })).toEqual([36, 9, 0.75]);
  });

  it('stands, rotated 90: thickness on X, width on Y, length on Z', () => {
    expect(boardExtents({ ...base, standing: true, rotation: 90 })).toEqual([0.75, 9, 36]);
  });

  it('treats 180 like 0 and 270 like 90', () => {
    expect(boardExtents({ ...base, standing: false, rotation: 180 }))
      .toEqual(boardExtents({ ...base, standing: false, rotation: 0 }));
    expect(boardExtents({ ...base, standing: false, rotation: 270 }))
      .toEqual(boardExtents({ ...base, standing: false, rotation: 90 }));
  });
});

describe('boardCenter', () => {
  it('is the min-corner plus half the extents', () => {
    const b = createBoard({
      length: 36, width: 9, thickness: 0.75,
      position: [10, 0, 5], standing: false, rotation: 0,
    });
    expect(boardCenter(b)).toEqual([10 + 18, 0 + 0.375, 5 + 4.5]);
  });

  it('keeps the min-corner fixed when orientation changes', () => {
    const flat = createBoard({ length: 36, width: 9, thickness: 0.75, position: [2, 3, 4] });
    const stood = { ...flat, standing: true };
    // The corner is unchanged; only the extents (and thus the center) move.
    expect(flat.position).toEqual(stood.position);
    expect(boardCenter(flat)).not.toEqual(boardCenter(stood));
  });
});

describe('createBoard', () => {
  it('applies woodworking defaults', () => {
    const b = createBoard();
    expect(b.thickness).toBe(0.75);
    expect(b.width).toBe(5.5);
    expect(b.length).toBe(24);
    expect(b.position).toEqual([0, 0, 0]);
    expect(b.rotation).toBe(0);
    expect(b.standing).toBe(false);
    expect(b.material).toBe('pine');
  });

  it('generates a unique id each call', () => {
    expect(createBoard().id).not.toBe(createBoard().id);
  });

  it('honours overrides', () => {
    expect(createBoard({ name: 'Shelf', length: 23.25 }).length).toBe(23.25);
  });
});

describe('createDocument', () => {
  it('stamps the current version and 1/16 precision', () => {
    const doc = createDocument('Bookshelf');
    expect(doc.version).toBe(CURRENT_VERSION);
    expect(doc.name).toBe('Bookshelf');
    expect(doc.units).toEqual({ display: 'imperial-fractional', precision: 16 });
    expect(doc.boards).toEqual([]);
  });
});

describe('migrateDocument', () => {
  it('round-trips a document through JSON unchanged', () => {
    const doc = createDocument('Table');
    doc.boards.push(createBoard({ name: 'Leg' }));
    expect(migrateDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  });

  it.each<[unknown, string]>([
    [null, 'not an object'],
    ['a string', 'not an object'],
    [{}, 'missing version'],
    [{ version: 1 }, 'boards'],
    [{ version: 1, boards: 'nope' }, 'boards'],
    [{ version: 1, boards: [{ id: 'x' }] }, 'board'],
  ])('rejects malformed input %j', (raw) => {
    expect(() => migrateDocument(raw)).toThrow(DocumentError);
  });

  it('refuses a document from a future version by name', () => {
    const future = { ...createDocument(), version: CURRENT_VERSION + 1 };
    expect(() => migrateDocument(future)).toThrow(/newer version of Sloyd/i);
  });

  it('rejects non-positive dimensions', () => {
    const doc = createDocument();
    doc.boards.push({ ...createBoard(), thickness: 0 });
    expect(() => migrateDocument(JSON.parse(JSON.stringify(doc)))).toThrow(DocumentError);
  });

  it('fills a missing name and unknown material with defaults', () => {
    const raw = {
      version: 1,
      units: { display: 'imperial-fractional', precision: 16 },
      boards: [{ ...createBoard(), material: 'unobtanium' }],
    };
    const doc = migrateDocument(raw);
    expect(doc.name).toBe('Untitled');
    expect(doc.boards[0].material).toBe('pine');
  });

  it('deduplicates board names, first occurrence keeping its name', () => {
    const raw = {
      version: 1,
      name: 'Bench',
      units: { display: 'imperial-fractional', precision: 16 },
      boards: [
        { name: 'Leg', length: 24, width: 3, thickness: 3, position: [0, 0, 0] },
        { name: 'Leg', length: 24, width: 3, thickness: 3, position: [0, 0, 6] },
        { name: 'Leg', length: 24, width: 3, thickness: 3, position: [0, 0, 12] },
      ],
    };
    expect(migrateDocument(raw).boards.map((b) => b.name))
      .toEqual(['Leg', 'Leg (1)', 'Leg (2)']);
  });

  it('leaves already-unique names untouched', () => {
    const raw = {
      version: 1,
      name: 'Bench',
      units: { display: 'imperial-fractional', precision: 16 },
      boards: [
        { name: 'Leg', length: 24, width: 3, thickness: 3, position: [0, 0, 0] },
        { name: 'Apron', length: 40, width: 4, thickness: 0.75, position: [0, 0, 6] },
      ],
    };
    expect(migrateDocument(raw).boards.map((b) => b.name)).toEqual(['Leg', 'Apron']);
  });

  it('deduplicates the names it substitutes for blank ones', () => {
    // validateBoard turns a blank name into 'Board'; two blanks must not
    // both come out as 'Board'.
    const raw = {
      version: 1,
      name: 'Bench',
      units: { display: 'imperial-fractional', precision: 16 },
      boards: [
        { name: '', length: 24, width: 3, thickness: 3, position: [0, 0, 0] },
        { length: 24, width: 3, thickness: 3, position: [0, 0, 6] },
      ],
    };
    expect(migrateDocument(raw).boards.map((b) => b.name)).toEqual(['Board', 'Board (1)']);
  });
});
