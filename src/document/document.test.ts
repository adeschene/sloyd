import { worldParts, flatDocument, onEdgeToV12 } from './document';
import {
  createBoard, createDocument, createGuide, migrateDocument, DocumentError, CURRENT_VERSION,
} from './document';
import { boardExtents, boardCenter, reorientedPosition, axisDimensions, boardsBounds, spanToWorldOffset } from './geometry';
import { buildCutList } from './cutlist';
import type { Board, Posture, Rotation } from './types';
import type { Cut } from './document';
import { pocketCells, FLUSH_EPSILON, cutRegion } from './cuts';
import { worldSolids } from './designCheck';
import { chiralPart, sameSet } from './turnFixtures';

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
    expect(b.grain).toBe('length');
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
    expect(worldParts(doc)[0].material).toBe('pine');
  });

  it.each(['toString', 'constructor', '__proto__'])(
    'treats an INHERITED key (%s) as an unknown material, not a material',
    (material) => {
      const raw = {
        version: 1,
        units: { display: 'imperial-fractional', precision: 16 },
        boards: [{ ...createBoard(), material }],
      };
      expect(worldParts(migrateDocument(raw))[0].material).toBe('pine');
    },
  );

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
    expect(worldParts(migrateDocument(raw)).map((b) => b.name))
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
    expect(worldParts(migrateDocument(raw)).map((b) => b.name)).toEqual(['Leg', 'Apron']);
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
    expect(worldParts(migrateDocument(raw)).map((b) => b.name)).toEqual(['Board', 'Board (1)']);
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
    expect(worldParts(migrateDocument(raw)).map((b) => b.name)).toEqual(['Board', 'Board (1)']);
  });
});

describe('validateBoard posture and grain fallbacks', () => {
  // Every migration test above hands the validator an already-legal posture,
  // so the 'flat' fallback (and grain's 'length' fallback) could be changed to
  // anything and the suite would stay green — and that fallback is the entire
  // load-bearing assumption behind the migration-ordering invariant (v2->v3
  // relies on validateBoard falling back to 'flat' for a v1 board that never
  // had a posture at all). These pin the fallback values directly.
  function rawBoard(overrides: Record<string, unknown>) {
    return {
      version: CURRENT_VERSION,
      name: 'Doc',
      units: { display: 'imperial-fractional', precision: 16 },
      boards: [{ ...createBoard(), ...overrides }],
    };
  }

  it('falls back an unrecognised posture to flat', () => {
    const doc = migrateDocument(rawBoard({ posture: 'sideways' }));
    expect(worldParts(doc)[0].posture).toBe('flat');
  });

  it('falls back a missing posture to flat', () => {
    const raw = rawBoard({});
    delete (raw.boards[0] as Record<string, unknown>).posture;
    expect(worldParts(migrateDocument(raw))[0].posture).toBe('flat');
  });

  it('falls back an unrecognised grain to length', () => {
    const doc = migrateDocument(rawBoard({ grain: 'sideways' }));
    expect(worldParts(doc)[0].grain).toBe('length');
  });

  it('falls back a missing grain to length', () => {
    const raw = rawBoard({});
    delete (raw.boards[0] as Record<string, unknown>).grain;
    expect(worldParts(migrateDocument(raw))[0].grain).toBe('length');
  });

  // 'Through thickness' is meaningless for a sheet good — plywood's grain is
  // its face-veneer direction, which always lies in the sheet plane. The
  // panel never offers it for plywood/MDF, but a hand-edited or older file
  // could still carry it, so validateBoard normalises rather than throwing.
  // This is a normalisation in the family of the name/material fallbacks
  // above, not a migration — CURRENT_VERSION does not change for it.
  it('normalises a sheet good carrying grain: thickness to length', () => {
    const doc = migrateDocument(rawBoard({ material: 'plywood', grain: 'thickness' }));
    expect(worldParts(doc)[0].grain).toBe('length');
  });

  it('normalises MDF carrying grain: thickness to length too', () => {
    const doc = migrateDocument(rawBoard({ material: 'mdf', grain: 'thickness' }));
    expect(worldParts(doc)[0].grain).toBe('length');
  });

  it('leaves solid wood carrying grain: thickness alone', () => {
    const doc = migrateDocument(rawBoard({ material: 'oak', grain: 'thickness' }));
    expect(worldParts(doc)[0].grain).toBe('thickness');
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
    expect(worldParts(migrateDocument(v1(180)))[0].rotation).toBe(0);
  });

  it('folds 270 to 90, not to 0', () => {
    // The regression this pins is an ordering one. validateBoard falls back to
    // 0 for any rotation outside VALID_ROTATIONS, which is now [0, 90] — so a
    // fold that ran after validation would turn every saved 270 board a quarter
    // turn the wrong way, and unlike 0-vs-180 that is a different shape.
    expect(worldParts(migrateDocument(v1(270)))[0].rotation).toBe(90);
  });

  it('does not move the boards it folds', () => {
    const folded = worldParts(migrateDocument(v1(270)))[0];
    expect(folded.position).toEqual([1, 2, 3]);
    expect(boardExtents(folded)).toEqual([5.5, 0.75, 24]);
  });

  it('stamps the current version', () => {
    expect(migrateDocument(v1(180)).version).toBe(CURRENT_VERSION);
  });

  it('leaves an unrecognised rotation to validateBoard, which falls back to 0', () => {
    expect(worldParts(migrateDocument(v1(45)))[0].rotation).toBe(0);
  });

  it('rejects a junk board entry rather than crashing inside the fold', () => {
    expect(() => migrateDocument({ ...v1(180), boards: [null] })).toThrow(DocumentError);
  });

  it('passes a v2 document through untouched', () => {
    const v2 = { ...v1(90), version: 2 };
    expect(worldParts(migrateDocument(v2))[0].rotation).toBe(90);
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
    expect(worldParts(migrateDocument(v2(false)))[0].posture).toBe('flat');
  });

  it('maps a standing board to on-edge, not flat', () => {
    // validateBoard's posture fallback is 'flat', so a board that reached it
    // without this step would lie down — a different shape on screen.
    expect(worldParts(migrateDocument(v2(true)))[0].posture).toBe('on-edge');
  });

  it('gives every migrated board grain along its length', () => {
    expect(worldParts(migrateDocument(v2(true)))[0].grain).toBe('length');
  });

  it('moves nothing and changes no extents', () => {
    const board = worldParts(migrateDocument(v2(true)))[0];
    expect(board.position).toEqual([1, 2, 3]);
    expect(boardExtents(board)).toEqual([24, 5.5, 0.75]);
  });

  it('drops the old field', () => {
    expect('standing' in worldParts(migrateDocument(v2(true)))[0]).toBe(false);
  });

  it('stamps the current version', () => {
    expect(migrateDocument(v2(false)).version).toBe(CURRENT_VERSION);
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
    const board = worldParts(migrateDocument(v1chain))[0];
    expect(board.rotation).toBe(90);
    expect(board.posture).toBe('on-edge');
    expect(board.grain).toBe('length');
  });

  it('lands on the shape v1 drew', () => {
    // v1 drew a 270-rotated standing board as [thickness, width, length].
    expect(boardExtents(worldParts(migrateDocument(v1chain))[0])).toEqual([0.75, 5.5, 24]);
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

describe('schema 4 — cuts', () => {
  it('defaults cuts to [] on a new board', () => {
    expect(createBoard().cuts).toEqual([]);
  });

  it('gives a v3 file an empty cuts list', () => {
    const doc = migrateDocument({
      version: 3,
      name: 'Old',
      units: { display: 'imperial-fractional', precision: 16 },
      boards: [{
        id: 'a', name: 'Shelf', length: 24, width: 5.5, thickness: 0.75,
        position: [0, 0, 0], rotation: 0, posture: 'flat', grain: 'length',
        material: 'pine',
      }],
    });
    expect(doc.version).toBe(15);
    expect(worldParts(doc)[0].cuts).toEqual([]);
  });

  // The chain is the point: a v1 file must walk 1 -> 2 -> ... -> 9,
  // folding 270 to 90 BEFORE it gains a posture, and gaining cuts before guides.
  it('walks a v1 file all the way to CURRENT_VERSION', () => {
    const doc = migrateDocument({
      version: 1,
      name: 'Ancient',
      units: { display: 'imperial-fractional', precision: 16 },
      boards: [{
        id: 'a', name: 'Leg', length: 30, width: 3, thickness: 3,
        position: [0, 0, 0], rotation: 270, standing: true, material: 'oak',
      }],
    });
    expect(doc.version).toBe(15);
    expect(worldParts(doc)[0].rotation).toBe(90);
    expect(worldParts(doc)[0].posture).toBe('on-edge');
    expect(worldParts(doc)[0].grain).toBe('length');
    expect(worldParts(doc)[0].cuts).toEqual([]);
  });

  it('preserves cuts already present in a v4 file', () => {
    const doc = migrateDocument({
      version: 4,
      name: 'New',
      units: { display: 'imperial-fractional', precision: 16 },
      boards: [{
        id: 'a', name: 'Side', length: 24, width: 5.5, thickness: 0.75,
        position: [0, 0, 0], rotation: 0, posture: 'flat', grain: 'length',
        material: 'pine',
        cuts: [{ id: 'c1', face: 'thickness', from: 'max', across: 'width',
                 offset: 6, width: 0.75, depth: 0.25 }],
      }],
    });
    expect(worldParts(doc)[0].cuts).toHaveLength(1);
    expect(worldParts(doc)[0].cuts[0]).toMatchObject({ offset: 6, width: 0.75, depth: 0.25 });
  });

  it('rejects a file from a newer schema', () => {
    expect(() => migrateDocument({ version: 16, name: 'x', boards: [] }))
      .toThrow(/newer version/);
  });
});

describe('cut validation', () => {
  const load = (cuts: unknown[]) => worldParts(migrateDocument({
    version: 4,
    name: 'x',
    units: { display: 'imperial-fractional', precision: 16 },
    boards: [{
      id: 'a', name: 'Side', length: 24, width: 5.5, thickness: 0.75,
      position: [0, 0, 0], rotation: 0, posture: 'flat', grain: 'length',
      material: 'pine', cuts,
    }],
  }))[0].cuts;

  const dado = (over: Partial<Cut> = {}): Cut => ({
    id: 'c1', face: 'thickness', from: 'max', across: 'width',
    offset: 6, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0, ...over,
  });

  it('keeps a cut that fits', () => {
    expect(load([dado()])).toEqual([dado()]);
  });

  // Clamp order is stated in the spec because the two orders disagree:
  // offset first into [0, dim], then width into [0, dim - offset].
  it('clamps offset, then width, in that order', () => {
    // Position axis is length (24). offset 30 clamps to 24, leaving no room,
    // so width clamps to 0 and the cut is dropped.
    expect(load([dado({ offset: 30, width: 4 })])).toEqual([]);
    // offset 22 clamps to itself; width 4 clamps to 2.
    expect(load([dado({ offset: 22, width: 4 })])[0]).toMatchObject({ offset: 22, width: 2 });
  });

  it('clamps depth to the face dimension', () => {
    expect(load([dado({ depth: 3 })])[0].depth).toBe(0.75);
  });

  it('drops a cut with a non-positive width or depth', () => {
    expect(load([dado({ width: 0 })])).toEqual([]);
    expect(load([dado({ depth: -1 })])).toEqual([]);
  });

  it('drops a cut whose across equals its face', () => {
    expect(load([dado({ across: 'thickness' })])).toEqual([]);
  });

  // A cut at full depth, full width, spanning its across axis leaves
  // pocketCells with nothing to return: a board that renders nothing, cannot
  // be clicked, and still sits in the parts list. There is no nearest legal
  // cut to clamp to, so this is the one case a drop beats a clamp.
  it('drops a cut that would remove all the stock', () => {
    expect(load([dado({ offset: 0, width: 24, depth: 0.75 })])).toEqual([]);
  });

  it('keeps a cut that severs the board but leaves stock', () => {
    const kept = load([dado({ offset: 6, width: 0.75, depth: 0.75 })]);
    expect(kept).toHaveLength(1);
    expect(kept[0].depth).toBe(0.75);
  });

  it('drops malformed cuts without throwing', () => {
    expect(load([null, 'nope', {}, dado({ face: 'sideways' as never })])).toEqual([]);
  });

  it('re-mints duplicate and missing ids', () => {
    const kept = load([dado({ id: 'same' }), dado({ id: 'same', offset: 10 })]);
    expect(kept).toHaveLength(2);
    expect(kept[0].id).not.toBe(kept[1].id);
  });
});

describe('schema v5 — stock.kerf', () => {
  it('gives a new document the default kerf', () => {
    expect(createDocument('Test').stock).toEqual({ kerf: 0.125 });
    expect(createDocument('Test').version).toBe(15);
  });

  it('defaults kerf on a v4 file that has none', () => {
    const doc = migrateDocument({ version: 4, name: 'Old', boards: [] });
    expect(doc.stock).toEqual({ kerf: 0.125 });
    expect(doc.version).toBe(15);
  });

  it('keeps a kerf the user set', () => {
    const doc = migrateDocument({ version: 5, name: 'X', stock: { kerf: 0.25 }, boards: [] });
    expect(doc.stock.kerf).toBe(0.25);
  });

  // A negative kerf places parts overlapping; an inch-wide kerf is a typo, not
  // a saw. Both fall back rather than throwing — a saved document must always
  // open, the same rule validateCuts follows.
  it.each([-0.1, 1, 2, Number.NaN, Infinity])('rejects an impossible kerf (%s)', (kerf) => {
    const doc = migrateDocument({ version: 5, name: 'X', stock: { kerf }, boards: [] });
    expect(doc.stock.kerf).toBe(0.125);
  });

  it('accepts a zero kerf', () => {
    const doc = migrateDocument({ version: 5, name: 'X', stock: { kerf: 0 }, boards: [] });
    expect(doc.stock.kerf).toBe(0);
  });

  it('ignores a stock field that is not an object', () => {
    for (const stock of ['x', 3, null, []]) {
      expect(migrateDocument({ version: 5, name: 'X', stock, boards: [] }).stock.kerf).toBe(0.125);
    }
  });

  // The whole reason the version is bumped: without it, a v4 build would open
  // a file carrying a 1/4" kerf, silently drop it, and print a different sheet
  // count than the build that saved it.
  it('refuses a file from a newer build', () => {
    expect(() => migrateDocument({ version: 16, name: 'X', boards: [] })).toThrow(DocumentError);
  });

  it('walks a v1 file all the way to CURRENT_VERSION, gaining every field on the way', () => {
    const doc = migrateDocument({
      version: 1,
      name: 'Ancient',
      boards: [{ name: 'A', length: 24, width: 4, thickness: 0.75, position: [0, 0, 0],
                 rotation: 270, standing: true, material: 'pine' }],
    });
    expect(doc.version).toBe(15);
    expect(doc.guides).toEqual([]);
    expect(doc.stock).toEqual({ kerf: 0.125 });
    expect(worldParts(doc)[0].rotation).toBe(90);
    expect(worldParts(doc)[0].posture).toBe('on-edge');
    expect(worldParts(doc)[0].grain).toBe('length');
    expect(worldParts(doc)[0].cuts).toEqual([]);
  });
});

describe('guides — schema v6', () => {
  it('a fresh document has an empty guides array at the current version', () => {
    const doc = createDocument('Test');
    expect(doc.version).toBe(15);
    expect(doc.guides).toEqual([]);
  });

  it('defaults guides to [] when a v5 file has none', () => {
    const doc = migrateDocument({
      version: 5,
      name: 'Old',
      units: { display: 'imperial-fractional', precision: 16 },
      stock: { kerf: 0.125 },
      boards: [],
    });
    expect(doc.guides).toEqual([]);
    expect(doc.version).toBe(15);
  });

  it('keeps well-formed guides', () => {
    const doc = migrateDocument({
      version: 6,
      name: 'G',
      units: { display: 'imperial-fractional', precision: 16 },
      stock: { kerf: 0.125 },
      guides: [{ id: 'g1', at: [1, 2, 3] }],
      boards: [],
    });
    expect(doc.guides).toEqual([{ id: 'g1', at: [1, 2, 3] }]);
  });

  // Dropped, never refused: a saved document must always open. Same rule
  // validateCuts follows. A guide has no nearest-legal-value to clamp toward,
  // so dropping is the only available repair. See design §2.3.
  it('drops malformed guides rather than throwing', () => {
    const doc = migrateDocument({
      version: 6,
      name: 'G',
      units: { display: 'imperial-fractional', precision: 16 },
      stock: { kerf: 0.125 },
      guides: [
        { id: 'ok', at: [1, 2, 3] },
        { id: 'nan', at: [1, NaN, 3] },
        { id: 'infinite', at: [1, Infinity, 3] },
        { id: 'short', at: [1, 2] },
        { id: 'notarray', at: 'nope' },
        { id: '', at: [0, 0, 0] },
        { at: [0, 0, 0] },
        null,
        'guide',
      ],
      boards: [],
    });
    expect(doc.guides).toEqual([{ id: 'ok', at: [1, 2, 3] }]);
  });

  it('defaults a non-array guides field to []', () => {
    const doc = migrateDocument({
      version: 6,
      name: 'G',
      units: { display: 'imperial-fractional', precision: 16 },
      stock: { kerf: 0.125 },
      guides: { id: 'g1' },
      boards: [],
    });
    expect(doc.guides).toEqual([]);
  });

  // The gate at the far end is the whole reason for the bump — see §2.2. The
  // argument is NOT v5's (a wrong purchasing number); it is silent data loss
  // on round-trip.
  it('still refuses a version above CURRENT_VERSION', () => {
    expect(() => migrateDocument({ version: 16, name: 'x', boards: [] }))
      .toThrow(DocumentError);
  });

  // A v1 file must still walk the whole chain, gaining guides on the way.
  it('a v1 file walks 1 -> CURRENT_VERSION', () => {
    const doc = migrateDocument({
      version: 1,
      name: 'Ancient',
      units: { display: 'imperial-fractional', precision: 16 },
      boards: [{
        id: 'b1', name: 'B', length: 24, width: 6, thickness: 1,
        position: [0, 0, 0], rotation: 270, standing: true, material: 'pine',
      }],
    });
    expect(doc.version).toBe(15);
    expect(doc.guides).toEqual([]);
    expect(doc.stock.kerf).toBe(0.125);
    expect(worldParts(doc)[0].rotation).toBe(90);
    expect(worldParts(doc)[0].posture).toBe('on-edge');
    expect(worldParts(doc)[0].cuts).toEqual([]);
  });
});

describe('id uniqueness on load — follow-ups 97 and 131', () => {
  // The gap: `validateBoard` mints an id only when one is MISSING, so two
  // boards that both arrive carrying `id: 'a'` both keep it. `buildNesting`'s
  // sort tiebreak (`a.id.localeCompare(b.id)`) then has no total order, so the
  // layout can reorder between renders, and `SheetLayout`'s `<g key={p.boardId}>`
  // hands React two identical keys. Guides inherit the same exposure: a
  // duplicate id makes `removeGuide` delete two rows at once.
  //
  // `validateCuts` already had the rule; this closes the other two. The FIRST
  // occurrence keeps its id and later ones are re-minted — and every test here
  // asserts that half explicitly, because "they are all distinct" alone is
  // satisfiable by re-minting all of them, which would silently rewrite ids in
  // every file that was already correct.
  const boardsWith = (ids: unknown[]) => migrateDocument({
    version: 6,
    name: 'Dup',
    units: { display: 'imperial-fractional', precision: 16 },
    stock: { kerf: 0.125 },
    guides: [],
    boards: ids.map((id, i) => ({
      id, name: `B${i}`, length: 24, width: 5.5, thickness: 0.75,
      position: [0, 0, 0], rotation: 0, posture: 'flat', grain: 'length',
      material: 'pine', cuts: [],
    })),
  }).boards;

  const guidesWith = (ids: unknown[]) => migrateDocument({
    version: 6,
    name: 'Dup',
    units: { display: 'imperial-fractional', precision: 16 },
    stock: { kerf: 0.125 },
    guides: ids.map((id) => ({ id, at: [1, 2, 3] })),
    boards: [],
  }).guides;

  it('re-mints a duplicate board id and leaves the first one alone', () => {
    const boards = boardsWith(['a', 'a', 'b']);
    expect(boards).toHaveLength(3);
    // The bound comes from the FIXTURE, not from the code under test
    // (invariant 23): 'a' and 'b' are values this loader cannot produce.
    expect(boards[0].id).toBe('a');
    expect(boards[2].id).toBe('b');
    expect(boards[1].id).not.toBe('a');
    expect(new Set(boards.map((b) => b.id)).size).toBe(3);
  });

  it('re-mints a duplicate guide id and leaves the first one alone', () => {
    const guides = guidesWith(['g', 'g']);
    expect(guides).toHaveLength(2);
    expect(guides[0].id).toBe('g');
    expect(guides[1].id).not.toBe('g');
    expect(guides[0].at).toEqual([1, 2, 3]);
    expect(guides[1].at).toEqual([1, 2, 3]);
  });

  it('leaves a document whose ids are already distinct completely alone', () => {
    // The other half of "re-mints the LATER one". A rule that re-minted
    // everything would pass every distinctness assertion above and quietly
    // rewrite the id of every board in every file that was already correct.
    expect(boardsWith(['a', 'b', 'c']).map((b) => b.id)).toEqual(['a', 'b', 'c']);
    expect(guidesWith(['g1', 'g2']).map((g) => g.id)).toEqual(['g1', 'g2']);
  });

  it('mints ids for boards and guides that have none, without colliding', () => {
    const boards = boardsWith([undefined, undefined, '']);
    expect(new Set(boards.map((b) => b.id)).size).toBe(3);
    expect(boards.every((b) => b.id.length > 0)).toBe(true);
  });

  // A guide with a bad id is DROPPED, not re-minted — validateGuides' existing
  // rule and unchanged by this round. Only a duplicate of a well-formed id is
  // repaired, because there the guide itself is fine and only its label is not.
  it('still drops a guide with no id rather than minting one', () => {
    expect(guidesWith(['g1', undefined, ''])).toHaveLength(1);
  });

  // Cut ids stay scoped to their own board: `Properties.tsx` keys CutRow by
  // cut id within one board, and the store looks a cut up by (boardId, cutId).
  // Two boards may each carry a cut called 'c1' and neither is wrong.
  it('scopes cut ids per board, so two boards may share a cut id', () => {
    const doc = migrateDocument({
      version: 6,
      name: 'Cuts',
      units: { display: 'imperial-fractional', precision: 16 },
      stock: { kerf: 0.125 },
      guides: [],
      boards: ['a', 'b'].map((id) => ({
        id, name: id, length: 24, width: 5.5, thickness: 0.75,
        position: [0, 0, 0], rotation: 0, posture: 'flat', grain: 'length',
        material: 'pine',
        cuts: [{
          id: 'c1', face: 'thickness', from: 'max', across: 'width',
          offset: 6, width: 0.75, depth: 0.25,
        }],
      })),
    });
    expect(worldParts(doc)[0].cuts[0].id).toBe('c1');
    expect(worldParts(doc)[1].cuts[0].id).toBe('c1');
  });

  // The pre-existing half of the rule, pinned here beside the two new ones so
  // all three live together: a duplicate WITHIN one board is still repaired.
  it('re-mints a duplicate cut id within one board', () => {
    const doc = migrateDocument({
      version: 6,
      name: 'Cuts',
      units: { display: 'imperial-fractional', precision: 16 },
      stock: { kerf: 0.125 },
      guides: [],
      boards: [{
        id: 'a', name: 'a', length: 24, width: 5.5, thickness: 0.75,
        position: [0, 0, 0], rotation: 0, posture: 'flat', grain: 'length',
        material: 'pine',
        cuts: [
          { id: 'c1', face: 'thickness', from: 'max', across: 'width', offset: 6, width: 0.75, depth: 0.25 },
          { id: 'c1', face: 'thickness', from: 'max', across: 'width', offset: 10, width: 0.75, depth: 0.25 },
        ],
      }],
    });
    const cuts = worldParts(doc)[0].cuts;
    expect(cuts[0].id).toBe('c1');
    expect(cuts[1].id).not.toBe('c1');
  });
});

describe('createGuide', () => {
  it('gives each guide a distinct id and copies the position', () => {
    const a = createGuide([1, 2, 3]);
    const b = createGuide([1, 2, 3]);
    expect(a.at).toEqual([1, 2, 3]);
    expect(a.id).not.toBe(b.id);
  });
});

describe('stopped cuts (v7)', () => {
  const rawDoc = (cut: Record<string, unknown>, version = 7) => ({
    version,
    name: 'x',
    boards: [{
      ...createBoard({ length: 24, width: 6, thickness: 1 }),
      cuts: [{
        id: 'c', face: 'thickness', from: 'min', across: 'width',
        offset: 6, width: 0.75, depth: 0.25, ...cut,
      }],
    }],
  });
  const loaded = (cut: Record<string, unknown>, version = 7) =>
    worldParts(migrateDocument(rawDoc(cut, version)))[0].cuts;

  it('is version 15', () => {
    expect(CURRENT_VERSION).toBe(15);
  });

  it('defaults missing stops to 0', () => {
    expect(loaded({})[0]).toMatchObject({ stopMin: 0, stopMax: 0 });
  });

  it.each([
    ['a string', '2'],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['a negative number', -1],
    ['null', null],
  ])('defaults %s stop to 0 rather than refusing the file', (_, v) => {
    expect(loaded({ stopMin: v, stopMax: v })[0]).toMatchObject({ stopMin: 0, stopMax: 0 });
  });

  it('keeps legal stops exactly', () => {
    expect(loaded({ stopMin: 1, stopMax: 2 })[0]).toMatchObject({ stopMin: 1, stopMax: 2 });
  });

  it('drops a cut whose stops pass each other', () => {
    expect(loaded({ stopMin: 4, stopMax: 3 })).toEqual([]);
  });

  it('drops a cut whose stops exactly use up the across dimension', () => {
    expect(loaded({ stopMin: 4, stopMax: 2 })).toEqual([]);
  });

  it('keeps a full-depth, full-width cut that stops short — a slot leaving a bridge', () => {
    expect(loaded({ offset: 0, width: 24, depth: 1, stopMax: 1 })).toHaveLength(1);
  });

  it('still drops a full-depth, full-width cut that is not stopped', () => {
    expect(loaded({ offset: 0, width: 24, depth: 1 })).toEqual([]);
  });

  it('loads a v6 cut with both stops at 0', () => {
    expect(loaded({}, 6)[0]).toMatchObject({ stopMin: 0, stopMax: 0 });
  });

  it('round-trips both stops through a save', () => {
    const doc = migrateDocument(rawDoc({ stopMin: 1, stopMax: 2 }));
    const again = migrateDocument(JSON.parse(JSON.stringify(doc)));
    expect(again.version).toBe(15);
    expect(worldParts(again)[0].cuts[0]).toMatchObject({ stopMin: 1, stopMax: 2 });
  });
});

describe('boardsBounds', () => {
  it('is null for no boards', () => {
    expect(boardsBounds([])).toBeNull();
  });

  it('spans every board from its min corner to its far corner, honouring orientation', () => {
    const flat = createBoard({ position: [2, 0, 1] }); // extents [24, 0.75, 5.5]
    const upright = createBoard({ position: [-3, 0, 10], posture: 'upright' }); // extents [5.5, 24, 0.75]
    expect(boardsBounds([flat, upright])).toEqual({
      min: [-3, 0, 1],
      max: [26, 24, 10.75],
    });
  });
});

describe('v7 -> v8: true quarter turns', () => {
  // The pre-v8 world mapping, written out independently: position plus the
  // part span on axisDimensions, no direction. At 90 it was a mirror.
  const oldWorld = (b: Board) => {
    const dims = axisDimensions(b);
    return pocketCells(b).map((s) => [0, 1, 2].map((i) => [b.position[i]! + s[dims[i]!][0], b.position[i]! + s[dims[i]!][1]]));
  };
  const newWorld = (b: Board) => worldSolids(b).map((s) => [0, 1, 2].map((i) => [s.min[i]!, s.max[i]!]));
  const v7 = (boards: unknown[]) => ({ version: 7, name: 'Old', units: { system: 'imperial', precision: 16 }, stock: { kerf: 0.125 }, guides: [], boards });
  const flatten = (w: number[][][]) => w.map((b) => b.flat());

  it('a 90° part with cuts keeps its exact world geometry, in every posture', () => {
    for (const posture of ['flat', 'on-edge', 'upright'] as const) {
      const before = { ...chiralPart(posture), rotation: 90 as const, position: [3, 0, 4] as [number, number, number] };
      const after = worldParts(migrateDocument(v7([before])))[0]!;
      expect(sameSet(flatten(newWorld(after)), flatten(oldWorld(before)))).toBe(true);
    }
  });

  it('touches only 90° parts with cuts: others come through byte-identical', () => {
    const flat0 = { ...chiralPart('flat'), rotation: 0 as const };
    const uncut90 = { ...chiralPart('flat'), rotation: 90 as const, cuts: [] };
    const doc = migrateDocument(v7([flat0, uncut90]));
    expect(worldParts(doc)[0]!.cuts).toEqual(flat0.cuts);
    expect(worldParts(doc)[1]!.cuts).toEqual([]);
  });

  it('mirrors each cut on exactly its own field', () => {
    const base = { ...chiralPart('flat'), rotation: 90 as const }; // h0 = length (20)
    const cuts = [
      { id: 'f', face: 'length', from: 'min', across: 'width', offset: 0, width: 1, depth: 2, stopMin: 0, stopMax: 0 },
      { id: 'a', face: 'thickness', from: 'max', across: 'length', offset: 1, width: 1, depth: 0.5, stopMin: 3, stopMax: 5 },
      { id: 'p', face: 'thickness', from: 'max', across: 'width', offset: 4, width: 0.75, depth: 0.5, stopMin: 0, stopMax: 0 },
    ];
    const got = worldParts(migrateDocument(v7([{ ...base, cuts }])))[0]!.cuts;
    expect(got.find((c) => c.id === 'f')).toMatchObject({ from: 'max', offset: 0, stopMin: 0, stopMax: 0 });
    expect(got.find((c) => c.id === 'a')).toMatchObject({ from: 'max', offset: 1, stopMin: 5, stopMax: 3 });
    expect(got.find((c) => c.id === 'p')).toMatchObject({ from: 'max', offset: 15.25, stopMin: 0, stopMax: 0 });
  });

  // The mirror must reflect what validateCuts would have KEPT, not the raw
  // interval: reflect-then-clamp differs from clamp-then-reflect whenever the
  // cut runs past an end. "Before" is loaded AT CURRENT_VERSION so NO mirror
  // runs (neither v8's nor v12's, which would also mirror an on-edge part along
  // thickness) while validateCuts still clamps it exactly as a v7 build did;
  // oldWorld, the pre-v8 mapping with the old UNREVERSED on-edge thickness, is
  // the independent pre-v8 mapping. Each case is written against S, the size of
  // h0 (length for flat and on-edge, width for upright), and the cut's
  // position axis is h0, so it is the branch that rewrites `offset`.
  const h0Cut = (posture: 'flat' | 'on-edge' | 'upright', offset: number, width: number) => ({
    id: 'r', face: 'thickness', from: 'max', across: posture === 'upright' ? 'length' : 'width',
    offset, width, depth: 0.5, stopMin: 0, stopMax: 0,
  });
  it.each([
    // [label, offset(S), width(S)]
    ['an overhanging cut keeps only what it removed', (S: number) => S - 2, () => 5],
    ['a cut wholly past the far end is still dropped', (S: number) => S + 2, () => 2],
    ['a cut hanging off the near end keeps only what it removed', () => -2, () => 3],
    // Decimal widths whose S - offset - width is a POSITIVE float residue
    // (7.2e-16 at S = 20, 2.2e-16 at S = 6): reflected raw, they leave a sliver
    // solid at the near end.
    ['a decimal cut flush with the far end migrates flush, with no sliver',
      (S: number) => S - (S === 20 ? 0.3 : 0.7), (S: number) => (S === 20 ? 0.3 : 0.7)],
    // A cut that stopped 3e-10 short of the far end left a real sliver in v7;
    // the migration keeps it at the near end rather than snapping it away.
    ['a cut stopping just short of the far end keeps its sliver', (S: number) => S - 3 - 3e-10, () => 3],
  ] as const)('the position-axis mirror clips before it reflects: %s', (_label, off, wid) => {
    for (const posture of ['flat', 'on-edge', 'upright'] as const) {
      const part = { ...chiralPart(posture), rotation: 90 as const, position: [3, 0, 4] as [number, number, number] };
      const S = posture === 'upright' ? part.width : part.length;
      const raw = { ...part, cuts: [...part.cuts, h0Cut(posture, off(S), wid(S))] };
      const before = worldParts(migrateDocument({ ...v7([raw]), version: CURRENT_VERSION }))[0]!;
      const after = worldParts(migrateDocument(v7([raw])))[0]!;
      expect(after.cuts.map((c) => c.id)).toEqual(before.cuts.map((c) => c.id));
      expect(newWorld(after).length).toBe(oldWorld(before).length);
      expect(sameSet(flatten(newWorld(after)), flatten(oldWorld(before)))).toBe(true);
    }
  });

  // Non-dyadic boards (millimetre entry). A cut flush with one end must migrate
  // flush with the other: offset + width EXACTLY the board's size, or the
  // remainder is a ~1e-15 sliver solid. sameSet rounds at 1e-9 and cannot see a
  // sliver, so these assert the solid COUNT against the v8-loaded "before".
  const flushPart = (length: number, offset: number, width: number) => ({
    ...createBoard({ name: 'Mm', length, width: 4, thickness: 0.75 }),
    rotation: 90 as const,
    cuts: [{ id: 'r', face: 'thickness', from: 'max', across: 'width', offset, width, depth: 0.25, stopMin: 0, stopMax: 0 }],
  });
  const beforeAfter = (raw: unknown) => ({
    before: worldParts(migrateDocument({ ...v7([raw]), version: CURRENT_VERSION }))[0]!,
    after: worldParts(migrateDocument(v7([raw])))[0]!,
  });

  it('a cut flush with the near end of a millimetre board migrates exactly flush with the far end', () => {
    const { before, after } = beforeAfter(flushPart(216 / 25.4, 0, 12 / 25.4));
    expect(oldWorld(before).length).toBe(2);
    expect(newWorld(after).length).toBe(2);
    expect(after.cuts[0]!.offset + after.cuts[0]!.width).toBe(after.length);
    expect(sameSet(flatten(newWorld(after)), flatten(oldWorld(before)))).toBe(true);
  });

  it('millimetre sweep: a cut flush with either end keeps its solid count', () => {
    const misses: string[] = [];
    for (let L = 150; L <= 400; L += 7) {
      for (let w = 3; w < L; w += 11) {
        const S = L / 25.4;
        const W = w / 25.4;
        for (const [end, offset] of [['near', 0], ['far', S - W]] as const) {
          const { before, after } = beforeAfter(flushPart(S, offset, W));
          if (newWorld(after).length !== oldWorld(before).length) misses.push(`${end} L=${L}mm w=${w}mm`);
        }
      }
    }
    expect(misses).toEqual([]);
  });

  // fu 217: spec section 4 says a migrated part's solids match within
  // FLUSH_EPSILON where the values are not dyadic. A one-handed part built in
  // millimetres, with one cut on each branch of the mirror (face, across and
  // the position axis all on h0), checked at every posture. Compared by sorted
  // coordinates with an explicit tolerance rather than sameSet, whose 1e-9
  // rounding can split two equal values that straddle a rounding boundary.
  it('a millimetre one-handed 90° part keeps its world solids within FLUSH_EPSILON, in every posture', () => {
    const mm = (v: number) => v / 25.4;
    for (const posture of ['flat', 'on-edge', 'upright'] as const) {
      const upright = posture === 'upright';
      // h0 is width for upright, length otherwise; the cuts name it by role.
      const h0 = upright ? 'width' : 'length';
      const other = upright ? 'length' : 'width';
      const raw = {
        ...createBoard({ name: 'Metric', length: mm(517), width: mm(143), thickness: mm(19), posture }),
        rotation: 90 as const, position: [3, 0, 4] as [number, number, number],
        cuts: [
          // position axis on h0: the clip-then-reflect branch
          { id: 'p', face: 'thickness', from: 'max', across: h0 === 'length' ? 'width' : 'length', offset: mm(61), width: mm(13), depth: mm(7), stopMin: 0, stopMax: mm(41) },
          // across on h0: stops swap
          { id: 'a', face: 'thickness', from: 'max', across: h0, offset: mm(5), width: mm(11), depth: mm(5), stopMin: mm(3), stopMax: mm(29) },
          // face on h0: from swaps
          { id: 'f', face: h0, from: 'min', across: other === 'width' ? 'width' : 'length', offset: mm(17), width: mm(9), depth: mm(23), stopMin: 0, stopMax: 0 },
        ],
      };
      const before = worldParts(migrateDocument({ ...v7([raw]), version: CURRENT_VERSION }))[0]!;
      const after = worldParts(migrateDocument(v7([raw])))[0]!;
      expect(after.cuts.map((c) => c.id)).toEqual(before.cuts.map((c) => c.id));
      // The migration really did mirror something (it is not vacuously a v8 load).
      expect(after.cuts).not.toEqual(before.cuts);
      const a = flatten(newWorld(after)).map((b) => [...b]);
      const b = flatten(oldWorld(before)).map((x) => [...x]);
      expect(a.length).toBe(b.length);
      const order = (w: number[][]) => [...w].sort((x, y) => {
        for (let i = 0; i < x.length; i += 1) if (Math.abs(x[i]! - y[i]!) > 1e-6) return x[i]! - y[i]!;
        return 0;
      });
      order(a).forEach((box, i) => box.forEach((v, j) => expect(Math.abs(v - order(b)[i]![j]!), `${posture} solid ${i} coord ${j}`).toBeLessThanOrEqual(FLUSH_EPSILON)));
    }
  });

  it('a malformed cut on a 90° part does not throw; validateCuts still decides (Review Focus 3)', () => {
    const good = { id: 'p', face: 'thickness', from: 'max', across: 'width', offset: 4, width: 0.75, depth: 0.5, stopMin: 0, stopMax: 0 };
    const bad = {
      ...chiralPart('flat'), rotation: 90,
      cuts: [{ id: 'x', face: 'nonsense', from: 'min' }, { id: 'y', face: 'thickness', from: 'max', across: 'width' }, good],
    };
    let cuts: Board['cuts'] = [];
    expect(() => { cuts = worldParts(migrateDocument(v7([bad])))[0]!.cuts; }).not.toThrow();
    // Both malformed cuts dropped; the well-formed sibling kept AND mirrored
    // along h0 = length (20): 20 - 4 - 0.75.
    expect(cuts.map((c) => c.id)).toEqual(['p']);
    expect(cuts[0]).toMatchObject({ offset: 15.25, width: 0.75 });
  });

  // Review Focus 3 of fu 215: v8's guard (`version < 8`) still stops a v8 file
  // being re-mirrored ALONG LENGTH. Since schema 12 an on-edge part's cuts are
  // mirrored along THICKNESS on load, so "exactly as saved" holds only for flat
  // and upright. chiralPart's cuts, T = 1.5, by hand for on-edge:
  //   c1 face thickness max -> min (offset/width/stops untouched: across is width)
  //   c3 face thickness max -> min (across length: stops untouched)
  //   c2 face width, across length: thickness is its position axis, so
  //      offset' = T - (offset + width) = 1.5 - (0.375 + 0.5) = 0.625, width 0.5.
  // Length is NOT mirrored (a v8 file): c2's stops stay 2 / 12.
  it('a version-8 file is never re-mirrored by v8: flat and upright come back as saved, on-edge only along thickness', () => {
    for (const posture of ['flat', 'on-edge', 'upright'] as const) {
      const saved = { ...chiralPart(posture), rotation: 90 as const, position: [3, 0, 4] as [number, number, number] };
      const loaded = worldParts(migrateDocument({ ...v7([saved]), version: 8 }))[0]!;
      if (posture !== 'on-edge') {
        expect(loaded.cuts).toEqual(saved.cuts);
        expect(sameSet(flatten(newWorld(loaded)), flatten(newWorld(saved)))).toBe(true);
        continue;
      }
      const byId = (id: string) => loaded.cuts.find((c) => c.id === id);
      expect(byId('c1')).toMatchObject({ face: 'thickness', from: 'min', across: 'width', offset: 4, width: 0.75, stopMin: 0, stopMax: 1.5 });
      expect(byId('c3')).toMatchObject({ face: 'thickness', from: 'min', across: 'length', offset: 0, width: 1, stopMin: 0, stopMax: 5 });
      expect(byId('c2')).toMatchObject({ face: 'width', from: 'min', across: 'length', offset: 0.625, width: 0.5, stopMin: 2, stopMax: 12 });
      // And the world solids are the v8-v11 build's (fu 246), written out by hand: that build's on-edge
      // turn 90 put thickness on X unreversed, width on Y, and length on Z REVERSED.
      const v11World = pocketCells(saved).map((sp) => [
        [saved.position[0] + sp.thickness[0], saved.position[0] + sp.thickness[1]],
        [saved.position[1] + sp.width[0], saved.position[1] + sp.width[1]],
        [saved.position[2] + saved.length - sp.length[1], saved.position[2] + saved.length - sp.length[0]],
      ]);
      expect(newWorld(loaded).length).toBe(v11World.length);
      expect(sameSet(flatten(newWorld(loaded)), flatten(v11World))).toBe(true);
    }
  });

  it('a v8 file opens; a version above CURRENT_VERSION is still refused', () => {
    expect(CURRENT_VERSION).toBe(15);
    expect(() => migrateDocument({ ...v7([]), version: 8 })).not.toThrow();
    expect(() => migrateDocument({ ...v7([]), version: 16 })).toThrow();
  });
});

describe('v9: linked parts', () => {
  const doc = (version: number, boards: unknown[]) => ({ version, name: 'D', units: { display: 'imperial-fractional', precision: 16 }, stock: { kerf: 0.125 }, guides: [], boards });
  const raw = (over: Record<string, unknown>) => ({ ...createBoard({ length: 10, width: 2, thickness: 1 }), ...over });

  it('CURRENT_VERSION is 15; a v8 file loads with no links; a version above 15 is refused', () => {
    expect(CURRENT_VERSION).toBe(15);
    const d = migrateDocument(doc(8, [raw({ id: 'a' }), raw({ id: 'b' })]));
    expect(worldParts(d).every((b) => !('link' in b))).toBe(true);
    expect(() => migrateDocument(doc(16, []))).toThrow();
  });

  // `Board.link` is retired (components spec §3.2): links load as shapes
  // (linksToShapes, the v10 -> v11 step; linksToShapes.test.ts). The raw key
  // never reaches a stored or world part.
  it('a v9 `link` key never reaches a stored or world part; the equal pair shares a shape', () => {
    const d = migrateDocument(doc(9, [raw({ id: 'a', link: 'L' }), raw({ id: 'b', link: 'L' }), raw({ id: 'c', link: 7 }), raw({ id: 'd', link: '' })]));
    expect(d.boards.some((b) => 'link' in b)).toBe(false);
    expect(worldParts(d).some((b) => 'link' in b)).toBe(false);
    expect(d.shapes).toHaveLength(1);
    expect(d.boards.map((b) => 'shape' in b)).toEqual([true, true, false, false]);
  });
});

describe('the v10 step: instances and definitions (assemblies spec §2.5)', () => {
  it('createDocument has no assemblies', () => {
    const d = createDocument('X');
    expect(d.instances).toEqual([]);
    expect(d.definitions).toEqual([]);
  });

  it('a v9 file loads with empty instance and definition lists', () => {
    const v9 = { version: 9, name: 'Old', units: { display: 'imperial-fractional', precision: 16 }, stock: { kerf: 0.125 }, guides: [], boards: [] };
    const d = migrateDocument(v9);
    expect(d.version).toBe(15);
    expect(d.instances).toEqual([]);
    expect(d.definitions).toEqual([]);
  });

  it('refuses a version above 15', () => {
    expect(() => migrateDocument({ version: 16, boards: [] })).toThrow(/newer version/);
  });
});

describe('v11 -> v12: on-edge cuts mirrored along thickness (fu 215)', () => {
  // Schema 12 reverses an on-edge part's thickness axis (axisFrame). Every expectation below is a world box
  // worked out BY HAND in the OLD (v11) frame, where on-edge's thickness runs unreversed, then read back
  // through the NEW frame from the migrated, stored cut.
  //
  // OLD on-edge frame: turn 0 is X = length, Y = width, Z = thickness (all unreversed); turn 90 is
  // X = thickness (unreversed), Y = width, Z = length REVERSED.
  const v11Doc = (boards: unknown[], extra: Record<string, unknown> = {}) => ({
    version: 11, name: 'D', units: { display: 'imperial-fractional', precision: 16 }, stock: { kerf: 0.125 },
    guides: [], boards, instances: [], definitions: [], shapes: [], ...extra,
  });
  const part = (over: Record<string, unknown> = {}) => ({
    id: 'p', name: 'P', posture: 'on-edge', rotation: 0, length: 20, width: 4, thickness: 0.75, position: [0, 0, 0],
    material: 'oak', grain: 'length', ...over,
  });
  // The worked-example groove: thickness MAX face, 1/4 deep, running the length (across length), on width [1, 1.5].
  const groove = { id: 'c', face: 'thickness', from: 'max', across: 'length', offset: 1, width: 0.5, depth: 0.25, stopMin: 0, stopMax: 0 };
  const worldBox = (b: Board, cut: Cut) => {
    const r = cutRegion(b, cut);
    return axisDimensions(b).map((dim, axis) => spanToWorldOffset(b, axis, r[dim]).map((x) => x + b.position[axis]!));
  };

  it('1. an on-edge groove keeps its world box: stored from max under v11, from min under v12', () => {
    // Old: thickness -> +Z, max face at z = 0.75, depth .25: z [0.5, 0.75]; x = length [0, 20]; y = width [1, 1.5].
    // New: thickness -> Z reversed, so the same box is the thickness MIN side: z = 0.75 - [0, .25] = [0.5, 0.75].
    const doc = migrateDocument(v11Doc([part({ cuts: [groove] })]));
    expect(doc.version).toBe(15);
    expect((doc.boards[0] as Board).cuts[0]).toMatchObject({ face: 'thickness', from: 'min', offset: 1, width: 0.5, depth: 0.25 });
    const b = doc.boards[0] as Board;
    expect(worldBox(b, b.cuts[0]!)).toEqual([[0, 20], [1, 1.5], [0.5, 0.75]]);
  });

  it('2. a 90-degree on-edge part with a cut positioned along thickness: offset\' = T - offset - width', () => {
    // Cut: face width min, 1 deep, across length (full), position axis = THICKNESS: offset .125, width .25.
    // OLD turn 90: X = thickness unreversed: [.125, .375]; Y = width [0, 1]; Z = length reversed, full [0, 20].
    // Stored: offset' = .75 - (.125 + .25) = .375 -> thickness [.375, .625]. NEW X = thickness reversed:
    // [.75 - .625, .75 - .375] = [.125, .375]. Same box.
    const cut = { id: 'c', face: 'width', from: 'min', across: 'length', offset: 0.125, width: 0.25, depth: 1, stopMin: 0, stopMax: 0 };
    const doc = migrateDocument(v11Doc([part({ rotation: 90, cuts: [cut] })]));
    const b = doc.boards[0] as Board;
    expect(b.cuts[0]).toMatchObject({ face: 'width', from: 'min', offset: 0.375, width: 0.25 });
    expect(worldBox(b, b.cuts[0]!)).toEqual([[0.125, 0.375], [0, 1], [0, 20]]);
  });

  it('3. an on-edge part inside a definition (placed once) is mirrored', () => {
    // Case 1's groove in a definition; the instance sits at x = 10, turn 0, so the old box shifts by 10 in x:
    // x [10, 30], y [1, 1.5], z [.5, .75].
    const raw = v11Doc([], {
      instances: [{ id: 'i', name: 'A', definition: 'd', position: [10, 0, 0], rotation: 0 }],
      definitions: [{ id: 'd', boards: [part({ cuts: [groove] })], instances: [] }],
    });
    const doc = migrateDocument(raw);
    expect((doc.definitions[0]!.boards[0] as Board).cuts[0]).toMatchObject({ from: 'min' });
    const b = worldParts(doc)[0]!;
    expect(worldBox(b, b.cuts[0]!)).toEqual([[10, 30], [1, 1.5], [0.5, 0.75]]);
  });

  it('4. a Shape with two users, one turned 90: mirrored ONCE on the Shape; both users\' boxes as by hand; one cut-list row', () => {
    // Shape: case 1's part. After one mirror: from min. (Mirrored twice it would be back to max.)
    // User A, turn 0 at x = 0: box [[0, 20], [1, 1.5], [.5, .75]] (case 1).
    // User B, turn 90 at x = 50. OLD: X = thickness [.5, .75] + 50 = [50.5, 50.75]; Y = width [1, 1.5];
    // Z = length reversed, full [0, 20].
    const shape = { id: 's', length: 20, width: 4, thickness: 0.75, material: 'oak', grain: 'length', posture: 'on-edge', cuts: [groove] };
    const users = [
      { id: 'a', name: 'A', shape: 's', position: [0, 0, 0], rotation: 0 },
      { id: 'b', name: 'B', shape: 's', position: [50, 0, 0], rotation: 90 },
    ];
    const doc = migrateDocument(v11Doc(users, { shapes: [shape] }));
    expect(doc.shapes).toHaveLength(1);
    expect(doc.shapes[0]!.cuts[0]).toMatchObject({ face: 'thickness', from: 'min' });
    const [a, b] = worldParts(doc);
    expect(worldBox(a!, a!.cuts[0]!)).toEqual([[0, 20], [1, 1.5], [0.5, 0.75]]);
    expect(worldBox(b!, b!.cuts[0]!)).toEqual([[50.5, 50.75], [1, 1.5], [0, 20]]);
    const rows = buildCutList(flatDocument(doc)).groups.flatMap((g) => g.rows);
    expect(rows.map((r) => r.qty)).toEqual([2]);
  });

  it('5. flat and upright parts with the same cuts come through byte-identical', () => {
    // Loading the same file stamped v12 runs no step; the v11 load must equal it exactly.
    const flatCut = { id: 'c', face: 'thickness', from: 'max', across: 'length', offset: 1, width: 0.5, depth: 0.25, stopMin: 0, stopMax: 0 };
    const boards = [
      part({ id: 'f', name: 'F', posture: 'flat', cuts: [flatCut] }),
      part({ id: 'u', name: 'U', posture: 'upright', cuts: [flatCut] }),
    ];
    expect(migrateDocument(v11Doc(boards))).toEqual(migrateDocument({ ...v11Doc(boards), version: 12 }));
    expect(migrateDocument(v11Doc(boards)).boards.map((b) => (b as Board).cuts[0])).toEqual([flatCut, flatCut]);
  });

  it('6. the load path is idempotent: a v11 file loaded, saved (v12) and reloaded is mirrored once', () => {
    const first = migrateDocument(v11Doc([part({ cuts: [groove] })]));
    const second = migrateDocument(JSON.parse(JSON.stringify(first)));
    expect(second).toEqual(first);
    expect((second.boards[0] as Board).cuts[0]).toMatchObject({ from: 'min' });
    // The step itself is not idempotent (as v8's), which is why the guard matters:
    expect((onEdgeToV12(first).boards[0] as Board).cuts[0]).toMatchObject({ from: 'max' });
  });

  it('7. a pre-v8 file: v8 mirrors along length, THEN v12 along thickness; the world box is the pre-v8 build\'s', () => {
    // v7 on-edge 90-degree part, cut: face thickness max, across LENGTH, offset 1 (width axis), width .5, depth .25,
    // stops 2 (min) / 5 (max).
    // PRE-v8 build (90 = mirror across X=Z: X = thickness, Y = width, Z = length, all unreversed):
    //   X thickness max face depth .25 = [.5, .75]; Y [1, 1.5]; Z length from stopMin 2 to 20 - 5 = [2, 15].
    // v8 (along length, h0): across === length, so the stops swap: stopMin 5, stopMax 2; from stays max.
    // v12 (along thickness): face === thickness, so from -> min.
    // Final: from min, stopMin 5, stopMax 2.
    // NEW frame check, turn 90: X = thickness reversed: [0, .25] -> [.5, .75]; Z = length reversed: stops 5 / 2 give
    // [5, 18] -> [20 - 18, 20 - 5] = [2, 15].
    const cut = { ...groove, stopMin: 2, stopMax: 5 };
    const raw = { ...v11Doc([part({ rotation: 90, cuts: [cut] })]), version: 7 };
    const doc = migrateDocument(raw);
    const b = doc.boards[0] as Board;
    expect(b.cuts[0]).toMatchObject({ face: 'thickness', from: 'min', across: 'length', stopMin: 5, stopMax: 2, offset: 1, width: 0.5 });
    expect(worldBox(b, b.cuts[0]!)).toEqual([[0.5, 0.75], [1, 1.5], [2, 15]]);
  });

  it('8. a link label on two on-edge parts (file below v11): the Shape is mirrored once; both users\' boxes as by hand', () => {
    // v10 members, equal, with the OLD-frame groove; A turn 0 at x = 0, B turn 90 at x = 50.
    // linksToShapes builds ONE shape from A; the step mirrors it once: from min. Boxes as in case 4.
    const members = [
      part({ id: 'a', name: 'A', link: 'L', cuts: [groove] }),
      part({ id: 'b', name: 'B', link: 'L', rotation: 90, position: [50, 0, 0], cuts: [groove] }),
    ];
    const doc = migrateDocument({ ...v11Doc(members), version: 10 });
    expect(doc.shapes).toHaveLength(1);
    expect(doc.shapes[0]!.cuts[0]).toMatchObject({ face: 'thickness', from: 'min' });
    const [a, b] = worldParts(doc);
    expect(worldBox(a!, a!.cuts[0]!)).toEqual([[0, 20], [1, 1.5], [0.5, 0.75]]);
    expect(worldBox(b!, b!.cuts[0]!)).toEqual([[50.5, 50.75], [1, 1.5], [0, 20]]);
  });
});

describe('v13: mirrored instances (mirrored-instances spec §2)', () => {
  const raw = (mirrored: unknown) => ({
    ...createDocument('M'), version: 13,
    instances: [{ id: 'i1', name: 'Case', definition: 'd1', position: [0, 0, 0], rotation: 0, mirrored }],
    definitions: [{ id: 'd1', boards: [createBoard({ id: 'b1' })], instances: [] }],
  });
  it('a v13 file round-trips the flag; only true is kept', () => {
    expect(migrateDocument(JSON.parse(JSON.stringify(raw(true)))).instances[0]!.mirrored).toBe(true);
    for (const bad of [false, 'yes', 1, null]) {
      const i = migrateDocument(JSON.parse(JSON.stringify(raw(bad)))).instances[0]!;
      expect('mirrored' in i, String(bad)).toBe(false);
    }
  });
  it('a v12 file loads unmirrored; a v16 file is refused', () => {
    const v12 = { ...raw(undefined), version: 12 };
    expect('mirrored' in migrateDocument(JSON.parse(JSON.stringify(v12))).instances[0]!).toBe(false);
    expect(() => migrateDocument({ ...raw(true), version: 16 })).toThrow(DocumentError);
  });
});

describe('schema 14: angleCuts (angle-cuts spec §5.1)', () => {
  const v13 = (boards: unknown[]) => ({ ...createDocument('A'), version: 13, boards });
  const plain = { id: 'b1', name: 'Leg', length: 29, width: 1.75, thickness: 1.75, position: [0, 0, 0], rotation: 0, posture: 'upright', grain: 'length', material: 'oak', cuts: [] };
  const good = { id: 'a1', kind: 'taper', face: 'width', from: 'min', along: 'length', alongFrom: 'min', points: [[0, 0.625], [24, 0]] };

  it('is version 15', () => {
    expect(CURRENT_VERSION).toBe(15);
  });

  it('defaults a v13 part to no angle cuts', () => {
    const doc = migrateDocument(v13([plain]));
    expect((doc.boards[0] as Board).angleCuts).toEqual([]);
  });

  it('keeps a well-formed angle cut exactly', () => {
    const doc = migrateDocument({ ...v13([{ ...plain, angleCuts: [good] }]), version: 14 });
    expect((doc.boards[0] as Board).angleCuts).toEqual([good]);
  });

  it('drops malformed entries and keeps the rest', () => {
    const bad = [
      { ...good, id: 'e1', points: [[3, 0], [3, 1]] },              // equal stations
      { ...good, id: 'e2', points: [[0, NaN], [24, 0]] },           // non-finite
      { ...good, id: 'e3', along: 'width' },                        // along === face
      { ...good, id: 'e4', from: 'top' },                           // unknown from
      { ...good, id: 'e5', points: [[0, 1]] },                      // one point
      'nonsense',
    ];
    const doc = migrateDocument({ ...v13([{ ...plain, angleCuts: [...bad, good] }]), version: 14 });
    expect((doc.boards[0] as Board).angleCuts.map((c) => c.id)).toEqual(['a1']);
  });

  it('drops a cut whose slope is not finite, and keeps a normal one', () => {
    const bad = [
      { ...good, id: 'n1', points: [[0, 0], [1e-308, 10]] },          // stations 1e-308 apart: slope 1e309 overflows
      { ...good, id: 'n2', points: [[0, -1e308], [1, 1e308]] },       // depths whose difference overflows
      { ...good, id: 'n3', points: [[-1e308, 0], [1e308, 1e308]] },   // station span overflows: slope 0, depthAt NaN
    ];
    const doc = migrateDocument({ ...v13([{ ...plain, angleCuts: [...bad, good] }]), version: 14 });
    expect((doc.boards[0] as Board).angleCuts.map((c) => c.id)).toEqual(['a1']);
  });

  it('derives a missing or unknown kind instead of dropping the cut', () => {
    const miter = { id: 'm1', face: 'length', from: 'max', along: 'width', alongFrom: 'min', points: [[0, 0], [1.75, 1.75]] };
    const doc = migrateDocument({ ...v13([{ ...plain, angleCuts: [miter, { ...good, kind: 'scarf' }] }]), version: 14 });
    expect((doc.boards[0] as Board).angleCuts.map((c) => c.kind)).toEqual(['miter', 'taper']);
  });

  it('repairs a duplicate id per board, the first keeping it (invariant 33)', () => {
    const doc = migrateDocument({ ...v13([{ ...plain, angleCuts: [good, { ...good, points: [[0, 0.5], [20, 0]] }] }]), version: 14 });
    const ids = (doc.boards[0] as Board).angleCuts.map((c) => c.id);
    expect(ids[0]).toBe('a1');
    expect(ids[1]).not.toBe('a1');
  });

  it('gives a Shape its own angle cuts', () => {
    const shaped = { id: 'b2', name: 'Leg 2', shape: 's1', position: [5, 0, 0], rotation: 0 };
    const doc = migrateDocument({
      ...v13([{ ...plain, shape: undefined }, shaped]), version: 14,
      shapes: [{ id: 's1', length: 29, width: 1.75, thickness: 1.75, posture: 'upright', grain: 'length', material: 'oak', cuts: [], angleCuts: [good] }],
    });
    // A one-user shape dissolves on load (inv 45); either way the part keeps its taper.
    const all = [...doc.boards, ...doc.shapes];
    expect(JSON.stringify(all)).toContain('"points":[[0,0.625],[24,0]]');
  });

  it('refuses a file from a newer build', () => {
    expect(() => migrateDocument({ ...v13([plain]), version: 16 })).toThrow(/newer version/);
  });
});

describe('schema 15: custom materials (custom materials spec §2.3)', () => {
  const ash = { id: 'm-s-ash1', label: 'Ash', color: '#d8c8a8', kind: 'solid' };
  const v14 = (over: Record<string, unknown> = {}) => ({
    version: 14, name: 'T', units: { display: 'imperial-fractional', precision: 16 }, stock: { kerf: 0.125 },
    guides: [], instances: [], definitions: [], shapes: [],
    boards: [{ id: 'a', name: 'A', length: 10, width: 4, thickness: 0.75, position: [0, 0, 0], rotation: 0,
      posture: 'flat', grain: 'length', material: 'oak', cuts: [], angleCuts: [] }],
    ...over,
  });
  const part = (material: string) => ({ ...(v14().boards as Record<string, unknown>[])[0]!, material });

  it('is version 15 and a v14 file loads with no materials', () => {
    expect(CURRENT_VERSION).toBe(15);
    const d = migrateDocument(v14());
    expect(d.version).toBe(15);
    expect(d.materials).toEqual([]);
    expect(createDocument().materials).toEqual([]);
  });
  it('keeps a used custom material and the part that names it', () => {
    const d = migrateDocument(v14({ version: 15, materials: [ash], boards: [part('m-s-ash1')] }));
    expect(d.materials).toEqual([ash]);
    expect((d.boards[0] as Board).material).toBe('m-s-ash1');
  });
  it('a part naming a material the file does not carry falls back to pine', () => {
    const d = migrateDocument(v14({ version: 15, materials: [], boards: [part('m-s-ash1')] }));
    expect((d.boards[0] as Board).material).toBe('pine');
  });
  it('a part naming a DROPPED (malformed) material falls back to pine', () => {
    const d = migrateDocument(v14({ version: 15, materials: [{ ...ash, color: 'red' }], boards: [part('m-s-ash1')] }));
    expect((d.boards[0] as Board).material).toBe('pine');
    expect(d.materials).toEqual([]);
  });
  it('validates materials BEFORE parts: a shape sees them too', () => {
    const shape = { id: 's1', length: 10, width: 4, thickness: 0.75, posture: 'flat', grain: 'length', material: 'm-s-ash1', cuts: [], angleCuts: [] };
    const d = migrateDocument(v14({
      version: 15, materials: [ash],
      boards: [{ id: 'a', name: 'A', position: [0, 0, 0], rotation: 0, shape: 's1' }, { id: 'b', name: 'B', position: [20, 0, 0], rotation: 0, shape: 's1' }],
      shapes: [shape],
    }));
    expect(d.shapes[0]!.material).toBe('m-s-ash1');
    expect(d.materials).toEqual([ash]);
  });
  it('validates materials BEFORE definitions: a definition part placed by an instance keeps its custom material', () => {
    const d = migrateDocument(v14({
      version: 15, materials: [ash], boards: [],
      instances: [{ id: 'i', name: 'Case', definition: 'd', position: [0, 0, 0], rotation: 0 }],
      definitions: [{ id: 'd', boards: [part('m-s-ash1')], instances: [] }],
    }));
    expect((d.definitions[0]!.boards[0] as Board).material).toBe('m-s-ash1');
    expect(d.materials).toEqual([ash]);
  });
  it('prunes unused entries on load', () => {
    const d = migrateDocument(v14({ version: 15, materials: [ash, { ...ash, id: 'm-s-unused', label: 'Unused' }], boards: [part('m-s-ash1')] }));
    expect(d.materials.map((m) => m.id)).toEqual(['m-s-ash1']);
  });
  it('a duplicate id keeps the first', () => {
    const d = migrateDocument(v14({ version: 15, materials: [ash, { ...ash, label: 'Second' }], boards: [part('m-s-ash1')] }));
    expect(d.materials).toEqual([ash]);
  });
});
