import {
  createBoard, createDocument, migrateDocument, DocumentError, CURRENT_VERSION,
} from './document';
import { boardExtents, boardCenter, reorientedPosition } from './geometry';
import type { Board } from './types';

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

  it('deduplicates the names it substitutes for whitespace-only ones', () => {
    // A whitespace-only name is not "truthy-empty" but must still be treated
    // as blank: trimmed to nothing, then substituted, then deduped — not
    // stored as '' or leaked into a leading-space " (1)".
    const raw = {
      version: 1,
      name: 'Bench',
      units: { display: 'imperial-fractional', precision: 16 },
      boards: [
        { name: '   ', length: 24, width: 3, thickness: 3, position: [0, 0, 0] },
        { name: '  ', length: 24, width: 3, thickness: 3, position: [0, 0, 6] },
      ],
    };
    expect(migrateDocument(raw).boards.map((b) => b.name)).toEqual(['Board', 'Board (1)']);
  });
});

describe('migrateDocument, v1 to v2', () => {
  const v1 = (rotation: number) => ({
    version: 1,
    name: 'Old',
    units: { display: 'imperial-fractional', precision: 16 },
    boards: [{
      id: 'b1', name: 'Leg', length: 24, width: 5.5, thickness: 0.75,
      position: [1, 2, 3], rotation, standing: false, material: 'pine',
    }],
  });

  it('folds 180 to 0', () => {
    expect(migrateDocument(v1(180)).boards[0].rotation).toBe(0);
  });

  it('folds 270 to 90, not to 0', () => {
    // The regression this pins is an ordering one. validateBoard falls back to
    // 0 for any rotation outside VALID_ROTATIONS, which is now [0, 90] — so a
    // fold that ran after validation would turn every saved 270 board a quarter
    // turn the wrong way, and unlike 0-vs-180 that is a different shape.
    expect(migrateDocument(v1(270)).boards[0].rotation).toBe(90);
  });

  it('does not move the boards it folds', () => {
    const folded = migrateDocument(v1(270)).boards[0];
    expect(folded.position).toEqual([1, 2, 3]);
    expect(boardExtents(folded)).toEqual([5.5, 0.75, 24]);
  });

  it('stamps version 2', () => {
    expect(CURRENT_VERSION).toBe(2);
    expect(migrateDocument(v1(180)).version).toBe(2);
  });

  it('leaves an unrecognised rotation to validateBoard, which falls back to 0', () => {
    expect(migrateDocument(v1(45)).boards[0].rotation).toBe(0);
  });

  it('rejects a junk board entry rather than crashing inside the fold', () => {
    expect(() => migrateDocument({ ...v1(180), boards: [null] })).toThrow(DocumentError);
  });

  it('passes a v2 document through untouched', () => {
    const v2 = { ...v1(90), version: 2 };
    expect(migrateDocument(v2).boards[0].rotation).toBe(90);
  });
});

describe('migrateDocument version gate', () => {
  const withVersion = (version: unknown) => ({
    version, name: 'x', units: { display: 'imperial-fractional', precision: 16 }, boards: [],
  });

  it('rejects version 0', () => {
    expect(() => migrateDocument(withVersion(0))).toThrow(DocumentError);
  });

  it('rejects a fractional version', () => {
    expect(() => migrateDocument(withVersion(0.5))).toThrow(DocumentError);
  });

  it('rejects a negative version', () => {
    expect(() => migrateDocument(withVersion(-1))).toThrow(DocumentError);
  });

  it('still names a future version in its message', () => {
    expect(() => migrateDocument(withVersion(CURRENT_VERSION + 1)))
      .toThrow(/newer version of Sloyd/i);
  });

  it('still reports a missing version distinctly', () => {
    expect(() => migrateDocument({})).toThrow(/missing a version/i);
  });
});

describe('reorientedPosition', () => {
  // The board from the bug report: a 24 x 5-1/2 that jumped sideways when it turned.
  const base = createBoard({
    length: 24, width: 5.5, thickness: 0.75, position: [10, 0, 4],
  });
  const centreXZ = (b: Board) => {
    const c = boardCenter(b);
    return [c[0], c[2]];
  };

  it('keeps the footprint centred when a flat board turns', () => {
    const position = reorientedPosition(base, { rotation: 90 });
    expect(centreXZ({ ...base, rotation: 90, position }))
      .toEqual(centreXZ(base));
  });

  it('computes that turn as a concrete corner', () => {
    // extents 24 x 3/4 x 5-1/2 become 5-1/2 x 3/4 x 24, so the corner takes
    // half of each swap: X + 9-1/4, Z - 9-1/4.
    expect(reorientedPosition(base, { rotation: 90 })).toEqual([19.25, 0, -5.25]);
  });

  it('leaves a turning board on the floor', () => {
    expect(reorientedPosition(base, { rotation: 90 })[1]).toBe(base.position[1]);
  });

  it('keeps the footprint centred when a board is stood on edge', () => {
    const position = reorientedPosition(base, { standing: true });
    expect(centreXZ({ ...base, standing: true, position }))
      .toEqual(centreXZ(base));
  });

  it('leaves a board being stood on edge resting on the floor', () => {
    // Y-min, not Y-centre: preserving the centre would sink half the board
    // through the ground as it grows from 3/4in tall to 5-1/2in.
    expect(reorientedPosition(base, { standing: true })).toEqual([10, 0, 6.375]);
  });

  it('returns the position unchanged when the orientation does not change', () => {
    expect(reorientedPosition(base, { rotation: 0 })).toEqual(base.position);
    expect(reorientedPosition(base, {})).toEqual(base.position);
  });
});
