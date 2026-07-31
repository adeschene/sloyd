import {
  createBoard, createDocument, migrateDocument, DocumentError, CURRENT_VERSION,
} from './document';
import { boardExtents, boardCenter, reorientedPosition, axisDimensions } from './geometry';
import type { Board, Posture, Rotation } from './types';

describe('axisDimensions', () => {
  const b = (posture: Posture, rotation: Rotation) =>
    createBoard({ posture, rotation });

  it('flat puts the thickness up', () => {
    expect(axisDimensions(b('flat', 0))).toEqual(['length', 'thickness', 'width']);
    expect(axisDimensions(b('flat', 90))).toEqual(['width', 'thickness', 'length']);
  });

  it('on edge puts the width up', () => {
    expect(axisDimensions(b('on-edge', 0))).toEqual(['length', 'width', 'thickness']);
    expect(axisDimensions(b('on-edge', 90))).toEqual(['thickness', 'width', 'length']);
  });

  it('upright puts the length up — the case v2 could not express at all', () => {
    expect(axisDimensions(b('upright', 0))).toEqual(['width', 'length', 'thickness']);
    expect(axisDimensions(b('upright', 90))).toEqual(['thickness', 'length', 'width']);
  });

  it('reaches all six ways three dimensions can be assigned to three axes', () => {
    const seen = new Set<string>();
    for (const posture of ['flat', 'on-edge', 'upright'] as const) {
      for (const rotation of [0, 90] as const) {
        seen.add(axisDimensions(b(posture, rotation)).join(','));
      }
    }
    expect(seen.size).toBe(6);
  });
});

describe('boardExtents', () => {
  const base = createBoard({ length: 36, width: 9, thickness: 0.75 });

  // These four are v2's table, verbatim. They are the evidence that the posture
  // rule generalises what v2 did rather than replacing it — if any of them
  // moves, every document ever saved changes shape.
  it('lies flat, unrotated: length on X, thickness on Y, width on Z', () => {
    expect(boardExtents({ ...base, posture: 'flat', rotation: 0 })).toEqual([36, 0.75, 9]);
  });

  it('lies flat, rotated 90: width on X, thickness on Y, length on Z', () => {
    expect(boardExtents({ ...base, posture: 'flat', rotation: 90 })).toEqual([9, 0.75, 36]);
  });

  it('stands on edge, unrotated: length on X, width on Y, thickness on Z', () => {
    expect(boardExtents({ ...base, posture: 'on-edge', rotation: 0 })).toEqual([36, 9, 0.75]);
  });

  it('stands on edge, rotated 90: thickness on X, width on Y, length on Z', () => {
    expect(boardExtents({ ...base, posture: 'on-edge', rotation: 90 })).toEqual([0.75, 9, 36]);
  });

  it('stands upright: the length is vertical, which is what makes a leg', () => {
    expect(boardExtents({ ...base, posture: 'upright', rotation: 0 })).toEqual([9, 36, 0.75]);
    expect(boardExtents({ ...base, posture: 'upright', rotation: 90 })).toEqual([0.75, 36, 9]);
  });
});

describe('boardCenter', () => {
  it('is the min-corner plus half the extents', () => {
    const b = createBoard({
      length: 36, width: 9, thickness: 0.75,
      position: [10, 0, 5], posture: 'flat', rotation: 0,
    });
    expect(boardCenter(b)).toEqual([10 + 18, 0 + 0.375, 5 + 4.5]);
  });

  it('keeps the min-corner fixed when orientation changes', () => {
    const flat = createBoard({ length: 36, width: 9, thickness: 0.75, position: [2, 3, 4] });
    const stood = { ...flat, posture: 'on-edge' as const };
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
    expect(b.posture).toBe('flat');
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

  it('stamps the current version', () => {
    expect(migrateDocument(v1(180)).version).toBe(CURRENT_VERSION);
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

describe('migrateDocument, v2 to v3', () => {
  const v2 = (standing: boolean) => ({
    version: 2,
    name: 'Old',
    units: { display: 'imperial-fractional', precision: 16 },
    boards: [{
      id: 'b1', name: 'Leg', length: 24, width: 5.5, thickness: 0.75,
      position: [1, 2, 3], rotation: 0, standing, material: 'pine',
    }],
  });

  it('maps a flat board to the flat posture', () => {
    expect(migrateDocument(v2(false)).boards[0].posture).toBe('flat');
  });

  it('maps a standing board to on-edge, not flat', () => {
    // validateBoard's posture fallback is 'flat', so a board that reached it
    // without this step would lie down — a different shape on screen.
    expect(migrateDocument(v2(true)).boards[0].posture).toBe('on-edge');
  });

  it('gives every migrated board grain along its length', () => {
    expect(migrateDocument(v2(true)).boards[0].grain).toBe('length');
  });

  it('moves nothing and changes no extents', () => {
    const board = migrateDocument(v2(true)).boards[0];
    expect(board.position).toEqual([1, 2, 3]);
    expect(boardExtents(board)).toEqual([24, 5.5, 0.75]);
  });

  it('drops the old field', () => {
    expect('standing' in migrateDocument(v2(true)).boards[0]).toBe(false);
  });

  it('stamps version 3', () => {
    expect(CURRENT_VERSION).toBe(3);
    expect(migrateDocument(v2(false)).version).toBe(3);
  });
});

describe('migrateDocument chains v1 all the way to v3', () => {
  // The promise CLAUDE.md has made since v1 — that upgrades step forward one
  // version at a time — was never exercised until there were two steps. A v1
  // board must have its rotation folded BEFORE it gains a posture.
  const v1chain = {
    version: 1,
    name: 'Ancient',
    units: { display: 'imperial-fractional', precision: 16 },
    boards: [{
      id: 'b1', name: 'Rail', length: 24, width: 5.5, thickness: 0.75,
      position: [0, 0, 0], rotation: 270, standing: true, material: 'oak',
    }],
  };

  it('folds the rotation and then adds the posture', () => {
    const board = migrateDocument(v1chain).boards[0];
    expect(board.rotation).toBe(90);
    expect(board.posture).toBe('on-edge');
    expect(board.grain).toBe('length');
  });

  it('lands on the shape v1 drew', () => {
    // v1 drew a 270-rotated standing board as [thickness, width, length].
    expect(boardExtents(migrateDocument(v1chain).boards[0])).toEqual([0.75, 5.5, 24]);
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
    const position = reorientedPosition(base, { posture: 'on-edge' });
    expect(centreXZ({ ...base, posture: 'on-edge', position }))
      .toEqual(centreXZ(base));
  });

  it('leaves a board being stood on edge resting on the floor', () => {
    // Y-min, not Y-centre: preserving the centre would sink half the board
    // through the ground as it grows from 3/4in tall to 5-1/2in.
    expect(reorientedPosition(base, { posture: 'on-edge' })).toEqual([10, 0, 6.375]);
  });

  it('returns the position unchanged when the orientation does not change', () => {
    expect(reorientedPosition(base, { rotation: 0 })).toEqual(base.position);
    expect(reorientedPosition(base, {})).toEqual(base.position);
  });
});
