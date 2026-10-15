import * as THREE from 'three';
import {
  axisDimensions, axisFrame, boardExtents, DIMENSION_ORDER, fromWorldOffset, holeInStock, pocketCells, createBoard, solidWorldBox, wholeBoard,
} from '../document/document';
import type { Region } from '../document/document';
import { chiralAngled, chiralPart, turnedAbout } from '../document/turnFixtures';
import { mirrorPart } from '../document/frames';
import { ARCH } from '../document/curveFixtures';
import { boardBodies } from '../document/document';
import { boardUVOffset, boardUVs, boardUVSignature, bodyMesh, facePlans, faceTriangles, holeMesh, holesMesh } from './grainTiling';
import { boardHoles, holeRing, holeTouchesBox, HOLE_SEGMENTS, partGeometry, stockChecks } from '../document/document';

const flat = createBoard({ length: 24, width: 5.5, thickness: 0.75, material: 'oak' });

// BoxGeometry's material-group order.
const PX = 0, PY = 2, PZ = 4;

describe('facePlans', () => {
  it('describes six faces', () => {
    expect(facePlans(flat)).toHaveLength(6);
  });

  it('runs the drawn grain along the length on a broad face', () => {
    // Flat and unrotated, the +Y face's geometry UVs run u along X and v along
    // Z. Length is on X, so u already follows the grain: no swap.
    expect(facePlans(flat)[PY].swap).toBe(false);
  });

  it('swaps u and v when the grain runs the other way across a face', () => {
    // Rotated, length is on Z, which is the +Y face's v axis — so the drawn
    // texture has to be turned a quarter turn to follow it.
    expect(facePlans({ ...flat, rotation: 90 })[PY].swap).toBe(true);
  });

  it('scales with the world size of the face', () => {
    // Tile size is fixed regardless of face size — that fixed size is what
    // makes a bigger face necessarily show more tiles.
    expect(facePlans({ ...flat, length: 12 })[PY].tileInches[0]).toBe(16);
    expect(facePlans({ ...flat, length: 24 })[PY].tileInches[0]).toBe(16);
  });

  it('fits one ring pattern across an end, however big the end is', () => {
    // FIT resolves tileInches to the board's own extent on that axis, so
    // repeat (extent / tileInches) always comes out to 1 whatever the size.
    expect(facePlans(flat)[PX].tileInches).toEqual([flat.width, flat.thickness]);
    const wide = { ...flat, width: 11 };
    expect(facePlans(wide)[PX].tileInches).toEqual([wide.width, wide.thickness]);
  });

  it('fits exactly one ply stack across the thickness of a plywood edge', () => {
    const plywood = { ...flat, material: 'plywood' };
    // +Z is the edge face when flat and unrotated; its v axis carries the
    // thickness, and the drawn ply stack has to span it exactly whether the
    // sheet is 1/2in or 3/4in.
    expect(facePlans(plywood)[PZ].tileInches[1]).toBe(plywood.thickness);
    const thin = { ...plywood, thickness: 0.5 };
    expect(facePlans(thin)[PZ].tileInches[1]).toBe(thin.thickness);
  });

  it('fits one ply stack across the thickness of a standing plywood end too', () => {
    // The sheet-goods branch of ranks() is what makes this work: plywood
    // always uses the unmodified [length, width, thickness] order (never the
    // grain-first order solid wood gets), so on an end face — where the
    // in-plane dimensions are width and thickness — width outranks thickness
    // and v lands on the thickness whichever way the board is turned. Standing
    // and rotated is the orientation where that stops being obvious, and it is
    // the case that would silently paint plies across the length if that
    // branch were ever "simplified" back to one rule for every material (see
    // the grain: 'thickness' case below for what that simplification breaks).
    const plywood = { ...flat, material: 'plywood', posture: 'on-edge' as const, rotation: 90 as const };
    expect(facePlans(plywood)[PZ].kind).toBe('end');
    expect(facePlans(plywood)[PZ].tileInches[1]).toBe(plywood.thickness);
  });

  it('tiles a plywood edge along its length like any other long face', () => {
    const plywood = { ...flat, material: 'plywood' };
    const short = { ...plywood, length: 12 };
    // Tile size (u) is fixed at 16in for both; the longer board's extent
    // covers more of it, i.e. a bigger effective repeat.
    expect(facePlans(plywood)[PZ].tileInches[0]).toBe(facePlans(short)[PZ].tileInches[0]);
    expect(plywood.length / facePlans(plywood)[PZ].tileInches[0])
      .toBeGreaterThan(short.length / facePlans(short)[PZ].tileInches[0]);
  });
});

describe('boardUVs', () => {
  it('gives every vertex of the box a uv pair', () => {
    expect(boardUVs(flat)).toHaveLength(48);
  });

  it('spans each face by that face\'s repeat', () => {
    const uv = boardUVs(flat);
    const face = Array.from(uv.slice(PY * 8, PY * 8 + 8));
    const us = face.filter((_, i) => i % 2 === 0);
    const vs = face.filter((_, i) => i % 2 === 1);
    const plan = facePlans(flat)[PY];
    const extents = boardExtents(flat);
    expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(extents[plan.axes[0]] / plan.tileInches[0]);
    expect(Math.max(...vs) - Math.min(...vs)).toBeCloseTo(extents[plan.axes[1]] / plan.tileInches[1]);
  });

  it('offsets boards differently so neighbours do not read as clones', () => {
    const a = boardUVs({ ...flat, id: 'b_one' });
    const b = boardUVs({ ...flat, id: 'b_two' });
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it('spans a wood end face exactly 0..1 on both axes, whatever the id', () => {
    // FIT means "show the whole tile" — an offset on a FIT axis buys nothing
    // and shifts the ring pattern's discontinuity into the middle of the face.
    for (const id of ['b_one', 'b_two']) {
      const uv = boardUVs({ ...flat, id });
      const face = Array.from(uv.slice(PX * 8, PX * 8 + 8));
      const us = face.filter((_, i) => i % 2 === 0);
      const vs = face.filter((_, i) => i % 2 === 1);
      expect(Math.min(...us)).toBeCloseTo(0);
      expect(Math.max(...us)).toBeCloseTo(1);
      expect(Math.min(...vs)).toBeCloseTo(0);
      expect(Math.max(...vs)).toBeCloseTo(1);
    }
  });

  it('spans a plywood edge\'s v axis exactly 0..1 — one whole ply stack starting at a glue line', () => {
    const plywood = { ...flat, material: 'plywood' };
    for (const id of ['b_one', 'b_two']) {
      const uv = boardUVs({ ...plywood, id });
      const face = Array.from(uv.slice(PZ * 8, PZ * 8 + 8));
      const vs = face.filter((_, i) => i % 2 === 1);
      expect(Math.min(...vs)).toBeCloseTo(0);
      expect(Math.max(...vs)).toBeCloseTo(1);
    }
  });

  it('still offsets a tiled (non-FIT) axis differently between boards', () => {
    const a = boardUVs({ ...flat, id: 'b_one' });
    const b = boardUVs({ ...flat, id: 'b_two' });
    // +Y face (broad face) tiles on both axes for this material — its u origin
    // should differ between two different ids.
    expect(a[PY * 8]).not.toBeCloseTo(b[PY * 8]);
  });
});

describe('the drawn texture follows the grain', () => {
  const flat = createBoard({ length: 24, width: 5.5, thickness: 0.75, material: 'oak' });
  const PY = 2, PZ = 4;

  it('runs u along the length when the grain does', () => {
    // +Y's geometry UVs run u along X and v along Z; flat and unrotated the
    // length is on X, so u already follows the grain.
    expect(facePlans(flat)[PY].swap).toBe(false);
  });

  it('runs u along the width when the grain runs across the board', () => {
    // Same face, same board, grain across the width — which is on Z here, the
    // face's v axis. The drawn texture has to turn a quarter turn to follow it.
    expect(facePlans({ ...flat, grain: 'width' })[PY].swap).toBe(true);
  });

  it('still crosses the thickness on a plywood narrow face when the grain runs across', () => {
    // The ply stack must span the sheet thickness whatever the grain does —
    // plies are a property of the sheet, not of the figure on its face. Note
    // this face shows a cut END once the grain runs across the width, not an
    // edge, which is exactly why the tiling must not key off the kind alone.
    const plywood = { ...flat, material: 'plywood', grain: 'width' as const };
    const plan = facePlans(plywood)[PZ];
    expect(plan.tileInches[1]).toBe(boardExtents(plywood)[plan.axes[1]]);
    expect(plan.fit[1]).toBe(true);
  });

  it('still crosses the thickness — not the width — on a plywood edge when the grain runs through the thickness', () => {
    // Traced failure (v3 review, finding 1): ranks() used to promote the grain
    // dimension to rank 0 unconditionally. For grain === 'thickness' that put
    // thickness first and width last, flipping this face's swap and handing
    // the FIT (stack) axis to the board's WIDTH instead of its THICKNESS —
    // a 5.5in board would show the five-ply stack stretched across 5.5in
    // instead of the true 0.75in. Plywood's plies are a property of the
    // sheet, not of the figure drawn on its face: they always stack across
    // the sheet thickness whatever the grain says.
    const plywood = { ...flat, material: 'plywood', grain: 'thickness' as const };
    const plan = facePlans(plywood)[PX];
    expect(plan.kind).toBe('edge');
    expect(plan.swap).toBe(false);
    expect(plan.fit[1]).toBe(true);
    expect(plan.tileInches[1]).toBe(boardExtents(plywood)[plan.axes[1]]);
    // The tiled (u) axis must carry the board's WIDTH (5.5in), not its
    // thickness (0.75in). Pre-fix this was 0.75 / 16 ≈ 0.047; correct is
    // 5.5 / 16 ≈ 0.344 — a value that only comes out right if the FIT axis
    // (v) landed on thickness, not width. tileInches[0] is the fixed 16in
    // tile either way; what must differ is which board dimension the u axis
    // carries.
    expect(axisDimensions(plywood)[plan.axes[0]]).toBe('width');
    expect(plan.tileInches[0]).toBe(16);
  });
});

describe('plywood grain direction is visible on the broad face (regression)', () => {
  // Traced failure: fe4deed fixed ranks() ignoring board.grain entirely for
  // sheet goods, to stop the ply stack spanning the board's width instead of
  // its thickness. That over-corrected — it also removed the veneer rotation
  // on the broad face, so no grain value changed anything visible on
  // plywood. facePlans(plywood)[PY] used to be byte-identical for
  // grain: 'length' and grain: 'width'; it must not be, while the ply stack
  // (the edge/end faces' FIT axis) must still land on the thickness either
  // way.
  const plywood = createBoard({ length: 24, width: 5.5, thickness: 0.75, material: 'plywood' });
  const PY = 2, PZ = 4;

  it('flips the broad face swap between grain: length and grain: width', () => {
    const lengthPlan = facePlans({ ...plywood, grain: 'length' })[PY];
    const widthPlan = facePlans({ ...plywood, grain: 'width' })[PY];
    expect(lengthPlan.swap).toBe(false);
    expect(widthPlan.swap).toBe(true);
  });

  it('keeps the ply stack spanning the thickness for both grain values', () => {
    for (const grain of ['length', 'width'] as const) {
      const board = { ...plywood, grain };
      const plan = facePlans(board)[PZ];
      expect(plan.tileInches[1]).toBe(boardExtents(board)[plan.axes[1]]);
      expect(plan.fit[1]).toBe(true);
    }
  });
});

describe('solid wood is unaffected by the sheet-goods grain fix', () => {
  // Pinned from the pre-fix implementation. Solid wood's ranks() branch is
  // untouched by the sheet-goods fix, so these must come out identical
  // before and after.
  const oak = createBoard({ length: 24, width: 5.5, thickness: 0.75, material: 'oak' });

  it('grain: length', () => {
    expect(facePlans({ ...oak, grain: 'length' })).toEqual([
      { kind: 'end', swap: false, axes: [2, 1], tileInches: [5.5, 0.75], fit: [true, true] },
      { kind: 'end', swap: false, axes: [2, 1], tileInches: [5.5, 0.75], fit: [true, true] },
      { kind: 'face', swap: false, axes: [0, 2], tileInches: [16, 6], fit: [false, false] },
      { kind: 'face', swap: false, axes: [0, 2], tileInches: [16, 6], fit: [false, false] },
      { kind: 'edge', swap: false, axes: [0, 1], tileInches: [16, 4], fit: [false, false] },
      { kind: 'edge', swap: false, axes: [0, 1], tileInches: [16, 4], fit: [false, false] },
    ]);
  });

  it('grain: width', () => {
    expect(facePlans({ ...oak, grain: 'width' })).toEqual([
      { kind: 'edge', swap: false, axes: [2, 1], tileInches: [16, 4], fit: [false, false] },
      { kind: 'edge', swap: false, axes: [2, 1], tileInches: [16, 4], fit: [false, false] },
      { kind: 'face', swap: true, axes: [2, 0], tileInches: [16, 6], fit: [false, false] },
      { kind: 'face', swap: true, axes: [2, 0], tileInches: [16, 6], fit: [false, false] },
      { kind: 'end', swap: false, axes: [0, 1], tileInches: [24, 0.75], fit: [true, true] },
      { kind: 'end', swap: false, axes: [0, 1], tileInches: [24, 0.75], fit: [true, true] },
    ]);
  });

  it('grain: thickness', () => {
    expect(facePlans({ ...oak, grain: 'thickness' })).toEqual([
      { kind: 'edge', swap: true, axes: [1, 2], tileInches: [16, 4], fit: [false, false] },
      { kind: 'edge', swap: true, axes: [1, 2], tileInches: [16, 4], fit: [false, false] },
      { kind: 'end', swap: false, axes: [0, 2], tileInches: [24, 5.5], fit: [true, true] },
      { kind: 'end', swap: false, axes: [0, 2], tileInches: [24, 5.5], fit: [true, true] },
      { kind: 'face', swap: true, axes: [1, 0], tileInches: [16, 6], fit: [false, false] },
      { kind: 'face', swap: true, axes: [1, 0], tileInches: [16, 6], fit: [false, false] },
    ]);
  });
});

describe('boardUVSignature', () => {
  const base = createBoard({ length: 24, width: 5.5, thickness: 0.75, material: 'oak' });

  // This is the regression test for the real bug: BoardMesh's geometry memo
  // used to key on a hand-written field list that never learned about
  // `grain`, so a board's grain silently stopped turning on screen. Every
  // field boardUVs reads, directly or transitively, must change the
  // signature — that is what keeps the memo from going stale again the next
  // time boardUVs learns to read something new.
  const changes: Array<[string, Partial<typeof base>]> = [
    ['grain', { grain: 'width' }],
    ['rotation', { rotation: 90 }],
    ['posture', { posture: 'on-edge' }],
    ['material', { material: 'plywood' }],
    ['id', { id: 'b_other' }],
    ['length', { length: 30 }],
    ['width', { width: 7.25 }],
    ['thickness', { thickness: 1.5 }],
  ];

  it.each(changes)('changes when %s changes', (_field, change) => {
    const changed = { ...base, ...change };
    expect(boardUVSignature(changed)).not.toBe(boardUVSignature(base));
  });

  it('does not change when position changes', () => {
    const moved = { ...base, position: [10, 20, 30] as [number, number, number] };
    expect(boardUVSignature(moved)).toBe(boardUVSignature(base));
  });

  it('does not change when name changes', () => {
    const renamed = { ...base, name: 'Something Else' };
    expect(boardUVSignature(renamed)).toBe(boardUVSignature(base));
  });

  it('produces identical boardUVs output for boards with the same signature', () => {
    const a = { ...base, position: [1, 2, 3] as [number, number, number], name: 'A' };
    const b = { ...base, position: [9, 8, 7] as [number, number, number], name: 'B' };
    expect(boardUVSignature(a)).toBe(boardUVSignature(b));
    expect(Array.from(boardUVs(a))).toEqual(Array.from(boardUVs(b)));
  });

  it('produces different boardUVs output whenever the signature changes', () => {
    for (const [, change] of changes) {
      const changed = { ...base, ...change };
      expect(boardUVSignature(changed)).not.toBe(boardUVSignature(base));
      expect(Array.from(boardUVs(changed))).not.toEqual(Array.from(boardUVs(base)));
    }
  });
});

describe('ranks() is total even with invalid grain', () => {
  // Totality guard: ranks() should not depend on external validation to be safe.
  // This test creates a plywood board with grain: 'thickness' *directly* via
  // createBoard, bypassing the store and validator that would normally fix it.
  // It asserts that facePlans still produces sane output: every repeat value is
  // finite and positive, and the ply stack still lands on the thickness.
  it('handles plywood with grain: thickness by normalizing locally', () => {
    const plywood = { ...flat, material: 'plywood' as const, grain: 'thickness' as const };
    const plans = facePlans(plywood);
    const extents = boardExtents(plywood);

    // Every effective repeat (extent / tileInches) must be finite and positive.
    for (const plan of plans) {
      const repeatU = extents[plan.axes[0]] / plan.tileInches[0];
      const repeatV = extents[plan.axes[1]] / plan.tileInches[1];
      expect(repeatU).toBeGreaterThan(0);
      expect(Number.isFinite(repeatU)).toBe(true);
      expect(repeatV).toBeGreaterThan(0);
      expect(Number.isFinite(repeatV)).toBe(true);
    }

    // Plywood's ply stack must span the thickness exactly on edges and ends,
    // regardless of which grain direction was requested. This mimics the
    // existing test for grain: 'thickness' that validates the fix stays correct.
    const plan = plans[PX];
    expect(plan.kind).toBe('edge');
    expect(plan.fit[1]).toBe(true);
    expect(plan.tileInches[1]).toBe(extents[plan.axes[1]]);
    // The tiled (u) axis must carry the board's WIDTH (5.5in), not its
    // thickness (0.75in) — the v axis (FIT) on thickness is what makes this right.
    expect(axisDimensions(plywood)[plan.axes[0]]).toBe('width');
    expect(plan.tileInches[0]).toBe(16);
  });
});

describe('boardUVOffset', () => {
  it('is stable — the same board offsets the same way on every load', () => {
    expect(boardUVOffset('b_abc')).toEqual(boardUVOffset('b_abc'));
  });

  it('differs between boards', () => {
    expect(boardUVOffset('b_abc')).not.toEqual(boardUVOffset('b_abd'));
  });

  it('stays inside one tile', () => {
    for (const id of ['a', 'b_xyz', 'b_kk_1', '']) {
      for (const n of boardUVOffset(id)) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThan(1);
      }
    }
  });
});

describe('boardUVs for a sub-box', () => {
  const board = createBoard({ cuts: [] });

  it('is unchanged for the whole board', () => {
    expect(boardUVs(board, wholeBoard(board))).toEqual(boardUVs(board));
  });

  // Parent-relative is the whole point: the figure runs continuously across a
  // dado instead of restarting at it, which is what makes the cut read as
  // stock removed from one board rather than two boards pushed together.
  it('maps a sub-box into the parent UV range, not into its own', () => {
    const half: Region = { length: [12, 24], width: [0, 5.5], thickness: [0, 0.75] };
    const whole = boardUVs(board);
    const sub = boardUVs(board, half);
    const maxWhole = Math.max(...whole);
    const maxSub = Math.max(...sub);
    expect(maxSub).toBeCloseTo(maxWhole, 6);

    // The min/max check above can't be scoped globally: the two end faces
    // (indices 0 and 1) are FIT on both axes and normal to length, so a
    // length-only restriction never reaches them — their UVs are 0..1 either
    // way, which would pin a global min to 0 on both sides regardless of the
    // mapping and make the assertion pass even for a self-relative mapping.
    // The +Y face (broad face, index PY) does carry length as its u axis, so
    // scope the check there: a self-relative mapping would restart this
    // face's u at the parent's own start; a parent-relative one begins
    // partway into the parent's u range instead.
    const uOf = (arr: Float32Array) =>
      Array.from(arr.slice(PY * 8, PY * 8 + 8)).filter((_, i) => i % 2 === 0);
    expect(Math.min(...uOf(sub))).toBeGreaterThan(Math.min(...uOf(whole)));
  });

  // FIT resolves against the BOARD's dimension, then the sub-range is taken
  // from that mapping. Fitting to the solid would squeeze the whole ply stack
  // into what survived the cut.
  it('resolves FIT against the board, so a dado floor shows the surviving plies', () => {
    const ply = createBoard({ material: 'plywood', cuts: [] });
    const floor: Region = { length: [0, 24], width: [0, 5.5], thickness: [0, 0.5] };
    const uvs = boardUVs(ply, floor);
    const wholeUvs = boardUVs(ply);

    // A global max over all 48 floats can't discriminate this: it's dominated
    // by the broad face's tiled (non-FIT) u, which a thickness-only
    // restriction never touches, so "max shrank" would hold even if FIT were
    // wrongly resolved against the solid. The edge face (+Z, index PZ) is
    // where the bug actually shows: its v axis is thickness and is FIT, so
    // tileInches there is the BOARD's full 0.75in thickness regardless of
    // the solid. A 0.5in floor should show 0.5/0.75 of the tile — the plies
    // the cut left behind — not 0..1 (all five plies squeezed into what
    // survived), which is what fitting the tile to the solid would produce.
    const vs = Array.from(uvs.slice(PZ * 8, PZ * 8 + 8)).filter((_, i) => i % 2 === 1);
    expect(Math.max(...vs)).toBeCloseTo(0.5 / 0.75, 6);
    expect(uvs).not.toEqual(wholeUvs);
  });
});

describe('boardUVSignature', () => {
  it('changes when a cut is added', () => {
    const plain = createBoard();
    const cut = { ...plain, cuts: [{
      id: 'c1', face: 'thickness' as const, from: 'max' as const,
      across: 'width' as const, offset: 6, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0,
    }] };
    expect(boardUVSignature(cut)).not.toBe(boardUVSignature(plain));
  });

  it('changes when a cut moves', () => {
    const a = createBoard({ cuts: [{
      id: 'c1', face: 'thickness', from: 'max', across: 'width',
      offset: 6, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0,
    }] });
    const b = { ...a, cuts: [{ ...a.cuts[0], offset: 12 }] };
    expect(boardUVSignature(b)).not.toBe(boardUVSignature(a));
  });

  it.each(['stopMin', 'stopMax'] as const)('changes when only %s changes', (key) => {
    const a = createBoard({ cuts: [{
      id: 'c1', face: 'thickness', from: 'max', across: 'width',
      offset: 6, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0,
    }] });
    const b = { ...a, cuts: [{ ...a.cuts[0], [key]: 1 }] };
    expect(boardUVSignature(b)).not.toBe(boardUVSignature(a));
  });

  it('boardUVSignature includes curves (inv 15)', () => {
    const b = createBoard({ length: 30, width: 5, thickness: 0.75 });
    expect(boardUVSignature({ ...b, curves: [ARCH] })).not.toBe(boardUVSignature(b));
    expect(boardUVSignature({ ...b, curves: [{ ...ARCH, start: [3.5, 0] }] })).not.toBe(boardUVSignature({ ...b, curves: [ARCH] }));
  });

  // Deliberately excluded: a board being dragged must not rebuild its
  // geometry every frame.
  it('ignores position and name', () => {
    const a = createBoard();
    expect(boardUVSignature({ ...a, position: [9, 9, 9], name: 'Other' }))
      .toBe(boardUVSignature(a));
  });
});

describe('UVs run WITH the world axis, so solids of one board agree (fu 163)', () => {
  // Traced failure: FACE_AXES recorded which world axis each of BoxGeometry's
  // UV axes runs along and explicitly discarded the SIGN, on the argument that
  // grain is mirror-symmetric. True of a whole board — reversing an axis maps
  // [0, 1] to [1, 0], the same tile mirrored. False of a SOLID, whose span is
  // a sub-range of the board's tiling (invariant 17): reversing puts that
  // sub-range on the wrong side of the face, and two solids meeting at a split
  // plane then disagree about the coordinate there. A 3/4in plywood panel with
  // a 1/4in dado drew v = 0 on one side of the shared plane and v = 1 on the
  // other, butting the outermost ply against the innermost — one double-width
  // light band mid-stack, and a part-ply at each edge.
  //
  // These tests use a real THREE.BoxGeometry rather than a fixture of vertex
  // positions. That is the point: the vertex layout and default UVs belong to
  // three.js, so a fixture would be this module's own belief about them, and
  // the bug WAS this module's own belief about them (invariant 23's rule —
  // bound against a value the thing under test does not produce). No WebGL is
  // involved; BoxGeometry is arithmetic.

  const dado = {
    id: 'c1', face: 'thickness' as const, from: 'min' as const,
    across: 'width' as const, offset: 10, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0,
  };

  it('agrees with the signs BoxGeometry actually emits', () => {
    // Read the table back off the library. FACE_AXES is not exported, so this
    // asserts the same three negatives the module encodes: +X's u, +Y's v and
    // -Z's u run against their world axis. A three.js bump that changed any of
    // them would silently un-fix the defect above; this is what notices.
    const geo = new THREE.BoxGeometry(2, 4, 6);
    const pos = geo.attributes.position.array;
    const uv = geo.attributes.uv.array;

    const signOf = (face: number, which: 0 | 1): [number, number] => {
      const at = (k: number) => {
        const i = face * 4 + k;
        return { p: [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]], c: uv[i * 2 + which] };
      };
      const vs = [0, 1, 2, 3].map(at);
      const lo = vs.filter((x) => x.c === 0);
      const hi = vs.filter((x) => x.c === 1);
      for (const axis of [0, 1, 2]) {
        const mLo = lo.reduce((s, x) => s + x.p[axis], 0) / lo.length;
        const mHi = hi.reduce((s, x) => s + x.p[axis], 0) / hi.length;
        if (Math.abs(mHi - mLo) > 1e-9) return [axis, mHi > mLo ? 1 : -1];
      }
      throw new Error('no axis varies with this UV coordinate');
    };

    expect([0, 1, 2, 3, 4, 5].map((f) => [signOf(f, 0), signOf(f, 1)])).toEqual([
      [[2, -1], [1, 1]], // +X
      [[2, 1], [1, 1]],  // -X
      [[0, 1], [2, -1]], // +Y
      [[0, 1], [2, 1]],  // -Y
      [[0, 1], [1, 1]],  // +Z
      [[0, -1], [1, 1]], // -Z
    ]);
  });

  /**
   * Every (vertex position, uv) pair of every solid of a board, for one face.
   *
   * Positions are put back into the board's own frame — solidWorldBox returns
   * a centre relative to the board's centre, which is how BoardMesh places
   * each solid inside its group — so two solids' samples are directly
   * comparable.
   */
  const samples = (board: Parameters<typeof boardUVs>[0], face: number) => {
    const plan = facePlans(board)[face];
    const out: Array<{ pu: number; pv: number; u: number; v: number }> = [];
    for (const solid of pocketCells(board)) {
      const { center, size } = solidWorldBox(board, solid);
      const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
      const pos = geo.attributes.position.array;
      const uv = boardUVs(board, solid);
      for (let k = 0; k < 4; k += 1) {
        const i = face * 4 + k;
        const world = [
          pos[i * 3] + center[0],
          pos[i * 3 + 1] + center[1],
          pos[i * 3 + 2] + center[2],
        ];
        out.push({
          pu: world[plan.axes[0]], pv: world[plan.axes[1]],
          u: uv[i * 2], v: uv[i * 2 + 1],
        });
      }
    }
    return out;
  };

  /**
   * The whole rule in one number.
   *
   * `boardUVs` is `coordinate / tileInches + constant`, so `uv - position /
   * tileInches` is that constant — the same for every vertex of every solid of
   * a board iff the mapping from world position to texture coordinate is ONE
   * mapping. It catches both halves at once and neither in isolation: a
   * reversed axis makes the slope negative so the residual varies WITHIN a
   * face, and a solid placed in the wrong half of the tile makes it differ
   * BETWEEN solids. Asserting the uv range instead cannot see either, which is
   * exactly why the range assertions above passed while this was broken.
   */
  const residuals = (board: Parameters<typeof boardUVs>[0], face: number) => {
    const plan = facePlans(board)[face];
    const ss = samples(board, face);
    // u and v have their own constant (different tile, different offset), so
    // they are compared within themselves, never against each other.
    return {
      u: ss.map((s) => s.u - s.pu / plan.tileInches[0]),
      v: ss.map((s) => s.v - s.pv / plan.tileInches[1]),
    };
  };

  const boards = {
    'plywood upright, dado': createBoard({
      material: 'plywood', posture: 'upright', length: 24, width: 12, thickness: 0.75, cuts: [dado],
    }),
    'plywood flat, dado': createBoard({
      material: 'plywood', posture: 'flat', length: 24, width: 12, thickness: 0.75, cuts: [dado],
    }),
    'plywood on-edge rotated, dado': createBoard({
      material: 'plywood', posture: 'on-edge', rotation: 90, length: 24, width: 12,
      thickness: 0.75, cuts: [dado],
    }),
    'oak flat, rabbet': createBoard({
      material: 'oak', length: 24, width: 5.5, thickness: 0.75,
      cuts: [{ id: 'r1', face: 'thickness', from: 'max', across: 'width', offset: 0, width: 2, depth: 0.25, stopMin: 0, stopMax: 0 }],
    }),
    'plywood upright, no cut': createBoard({
      material: 'plywood', posture: 'upright', length: 24, width: 12, thickness: 0.75,
    }),
  };

  for (const [name, board] of Object.entries(boards)) {
    it(`reads one mapping from position to texture coordinate — ${name}`, () => {
      for (let face = 0; face < 6; face += 1) {
        const { u, v } = residuals(board, face);
        for (const r of u) expect(r).toBeCloseTo(u[0], 6);
        for (const r of v) expect(r).toBeCloseTo(v[0], 6);
      }
    });
  }

  // Quarter-turns: the same one-mapping rule on a one-handed part at every
  // posture x turn. Vertex positions come from the drawn geometry (solidWorldBox),
  // so a span left in the part frame, or a reversal applied after the swap,
  // shows as a residual that varies within a face or between solids.
  for (const posture of ['flat', 'on-edge', 'upright'] as const) {
    for (const turn of [0, 90, 180, 270] as const) {
      it(`reads one mapping from position to texture coordinate — chiral ${posture} turn ${turn}`, () => {
        const board = turnedAbout(chiralPart(posture), turn, [30, 0, 17]);
        for (let face = 0; face < 6; face += 1) {
          const { u, v } = residuals(board, face);
          for (const r of u) expect(r).toBeCloseTo(u[0], 6);
          for (const r of v) expect(r).toBeCloseTo(v[0], 6);
        }
      });
    }
  }

  // fu 217: the sweep above is solid wood only, whose tiles are all finite
  // except the ends. Plywood has FIT on v of its edges and ends, so a span
  // reversed (or an axis swapped) wrongly shows there as well, and grain
  // 'width' makes broad faces swap, which is the pose a reflect-after-swap
  // mutation needs: a flat part at 180 turns reverses both horizontals and
  // is blind to it by symmetry.
  for (const grain of ['length', 'width'] as const) {
    for (const posture of ['flat', 'on-edge', 'upright'] as const) {
      for (const turn of [0, 90, 180, 270] as const) {
        it(`reads one mapping from position to texture coordinate — chiral plywood grain ${grain} ${posture} turn ${turn}`, () => {
          const board = turnedAbout({ ...chiralPart(posture), material: 'plywood', grain }, turn, [30, 0, 17]);
          for (let face = 0; face < 6; face += 1) {
            const { u, v } = residuals(board, face);
            for (const r of u) expect(r).toBeCloseTo(u[0], 6);
            for (const r of v) expect(r).toBeCloseTo(v[0], 6);
          }
        });
      }
    }
  }

  it('puts the outermost ply against the face of a dadoed plywood panel', () => {
    // The user-visible statement of the same thing, on the surface where it
    // showed: on the edge of a 3/4in panel with a 1/4in dado, the two solids
    // meeting at the dado floor must hand each other the SAME v, and the two
    // outer faces of the panel must be the two ends of the ply stack. Before
    // the fix the shared plane carried 0 from one side and 1 from the other.
    const board = boards['plywood upright, dado'];
    const face = 0; // +X, the panel's edge
    const plan = facePlans(board)[face];
    expect(plan.kind).toBe('edge');
    expect(plan.fit[1]).toBe(true);

    const ss = samples(board, face);
    const thickness = board.thickness;
    // v as a function of position across the thickness, with the board's own
    // min-face at pv = -thickness / 2.
    for (const s of ss) expect(s.v).toBeCloseTo(s.pv / thickness + 0.5, 6);

    // Both ends of the stack are present, and the dado floor is one third in.
    const vs = ss.map((s) => s.v).sort((a, b) => a - b);
    expect(vs[0]).toBeCloseTo(0, 6);
    expect(vs[vs.length - 1]).toBeCloseTo(1, 6);
    expect(vs.some((v) => Math.abs(v - 1 / 3) < 1e-6)).toBe(true);
  });
});

describe('bodyMesh agrees with the box path (invariant 35, spec §3.3)', () => {
  const poses = [
    createBoard({ length: 24, width: 5.5, thickness: 0.75, material: 'oak' }),
    createBoard({ length: 24, width: 5.5, thickness: 0.75, material: 'plywood', rotation: 90, posture: 'on-edge', grain: 'width' }),
    createBoard({ length: 30, width: 2, thickness: 1.5, material: 'walnut', rotation: 270, posture: 'upright' }),
  ];
  for (const b of poses) {
    it(`${b.material} ${b.posture} ${b.rotation}°`, () => {
      const body = boardBodies(b)[0]!;
      const mine = bodyMesh(b, body);
      // Every (position, uv) pair bodyMesh emits must occur in the BoxGeometry + boardUVs pairs.
      const ref = new THREE.BoxGeometry(...boardExtents(b));
      ref.setAttribute('uv', new THREE.BufferAttribute(boardUVs(b), 2));
      const key = (x: number, y: number, z: number, u: number, v: number) => [x, y, z, u, v].map((n) => Math.round(n * 1e5)).join(',');
      const want = new Set<string>();
      const p = ref.getAttribute('position');
      const uv = ref.getAttribute('uv');
      for (let i = 0; i < p.count; i += 1) want.add(key(p.getX(i), p.getY(i), p.getZ(i), uv.getX(i), uv.getY(i)));
      expect(mine.positions.length).toBeGreaterThan(0);
      for (let i = 0; i < mine.positions.length / 3; i += 1) {
        expect(want.has(key(mine.positions[3 * i]!, mine.positions[3 * i + 1]!, mine.positions[3 * i + 2]!, mine.uvs[2 * i]!, mine.uvs[2 * i + 1]!))).toBe(true);
      }
    });
  }

  it('puts each axis face in its BoxGeometry material group', () => {
    const b = poses[0]!;
    const groups = bodyMesh(b, boardBodies(b)[0]!).groups;
    expect(groups.map((g) => g.materialIndex)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(groups.every((g) => g.count === 6)).toBe(true);
  });

  it('a miter face reads as end grain, a taper face as long grain (tie to face)', () => {
    const rail = createBoard({ length: 24, width: 2.5, thickness: 0.75, material: 'oak', angleCuts: [
      { id: 'm', kind: 'miter', face: 'length', from: 'max', along: 'width', alongFrom: 'min', points: [[0, 0], [2.5, 2.5]] },
    ] });
    const body = boardBodies(rail)[0]!;
    const slopeIndex = body.faces.findIndex((f) => f.cut === 'm');
    expect(slopeIndex).toBeGreaterThanOrEqual(0);
    const mesh = bodyMesh(rail, { ...body, faces: [body.faces[slopeIndex]!] });
    // Flat turn 0: length on world X (check axisFrame) — the miter's material is the +X face's.
    expect(mesh.groups.map((g) => g.materialIndex)).toEqual([0]);
  });

  it('a tie goes to the axis carrying the cut face even when it is not the first axis', () => {
    // face 'width' with along 'length': the 45 degree slope ties world X (length) and Z (width, flat turn 0).
    const b = createBoard({ length: 24, width: 5.5, thickness: 0.75, material: 'oak', angleCuts: [
      { id: 't', kind: 'bevel', face: 'width', from: 'max', along: 'length', alongFrom: 'min', points: [[0, 0], [0.75, 0.75]] },
    ] });
    const body = boardBodies(b)[0]!;
    const slope = body.faces.find((f) => f.cut === 't');
    expect(slope).toBeDefined();
    const mesh = bodyMesh(b, { ...body, faces: [slope!] });
    expect(mesh.groups).toHaveLength(1);
    expect(mesh.groups[0]!.materialIndex).toBeGreaterThanOrEqual(4);
  });

  it('the UV signature changes with an angle cut', () => {
    const b = poses[0]!;
    expect(boardUVSignature({ ...b, angleCuts: [{ id: 'a', kind: 'taper', face: 'width', from: 'min', along: 'length', alongFrom: 'min', points: [[0, 1], [10, 0]] }] }))
      .not.toBe(boardUVSignature(b));
  });
});

describe('bodyMesh — hand-mapped normals across every pose (invariant 44)', () => {
  const poses = (['flat', 'on-edge', 'upright'] as const).flatMap((posture) =>
    ([0, 90, 180, 270] as const).flatMap((rotation) =>
      [false, true].map((mirrored) => ({ posture, rotation, mirrored }))));
  it.each(poses)('%o: every triangle faces away from its body', ({ posture, rotation, mirrored }) => {
    const base = { ...chiralAngled(posture), rotation, position: [3, 1, -2] as [number, number, number] };
    const b = mirrored ? mirrorPart(base) : base;
    const bodies = boardBodies(b);
    expect(bodies.some((body) => body.box === null)).toBe(true);
    for (const body of bodies) {
      const { positions: p } = bodyMesh(b, body);
      const count = p.length / 3;
      expect(count).toBeGreaterThan(0);
      // The mean of the body's own triangle vertices: a convex combination touching every face, so inside.
      const c = [0, 1, 2].map((i) => { let s = 0; for (let k = 0; k < count; k += 1) s += p[k * 3 + i]!; return s / count; });
      for (let t = 0; t < count; t += 3) {
        const v = [0, 1, 2].map((j) => [p[(t + j) * 3]!, p[(t + j) * 3 + 1]!, p[(t + j) * 3 + 2]!]);
        const e1 = [0, 1, 2].map((k) => v[1]![k]! - v[0]![k]!);
        const e2 = [0, 1, 2].map((k) => v[2]![k]! - v[0]![k]!);
        const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
        const mid = [0, 1, 2].map((k) => (v[0]![k]! + v[1]![k]! + v[2]![k]!) / 3);
        expect(n[0]! * (mid[0]! - c[0]!) + n[1]! * (mid[1]! - c[1]!) + n[2]! * (mid[2]! - c[2]!)).toBeGreaterThan(0);
      }
    }
  });
});

const pinRow = { id: 'h1', face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.375, along: 'length' as const, alongFrom: 'min' as const, station: 2, count: 3, pitch: 32 / 25.4, acrossFrom: 'min' as const, inset: 1.5 };
const dado = { id: 'c1', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 10, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
const cabinetSide = createBoard({ id: 'side', length: 30, width: 11.25, thickness: 0.75, cuts: [dado], holes: [pinRow] });

describe('holes in the mesh (holes spec §3.2)', () => {
  it('boardUVSignature changes with a row (inv 15)', () => {
    expect(boardUVSignature(cabinetSide)).not.toBe(boardUVSignature({ ...cabinetSide, holes: [] }));
    expect(boardUVSignature(cabinetSide)).not.toBe(boardUVSignature({ ...cabinetSide, holes: [{ ...pinRow, inset: 2 }] }));
  });
  it('holeTouchesBox decides the box path: false for a cell no hole reaches, true for one it does', () => {
    const holes = boardHoles(cabinetSide);
    const cells = boardBodies(cabinetSide).map((b) => b.box!);
    const far = cells.find((r) => r.length[0] >= 10.75)!;                 // the cell beyond the dado
    const near = cells.find((r) => r.length[1] <= 10 && r.thickness[0] >= 0.5)!;   // under the pins, above the seam
    expect(holes.some((h) => holeTouchesBox(h, far))).toBe(false);
    expect(holes.some((h) => holeTouchesBox(h, near))).toBe(true);
  });
  it('the face is watertight against the wall: every top-ring vertex is a face-mesh vertex', () => {
    const holes = boardHoles(cabinetSide);
    const faces = boardBodies(cabinetSide).flatMap((body) => body.faces);
    const verts = faces.flatMap((f) => faceTriangles(f, holes)).flat();
    for (const h of holes) {
      for (const p of holeRing(h, 0)) expect(verts.some((q) => q.every((v, i) => v === p[i]))).toBe(true);
    }
  });
  it('no face triangle lies inside a hole between its caps — no membrane at the dado-floor seam (Review Focus 1)', () => {
    const holes = boardHoles(cabinetSide);
    const tris = boardBodies(cabinetSide).flatMap((body) => body.faces).flatMap((f) => faceTriangles(f, holes));
    for (const t of tris) {
      const c = [0, 1, 2].map((k) => (t[0]![k]! + t[1]![k]! + t[2]![k]!) / 3);
      for (const h of holes) {
        const tt = h.dir * (c[2]! - h.centre[2]);
        const r = Math.hypot(c[0]! - h.centre[0], c[1]! - h.centre[1]);
        expect(tt > 1e-6 && tt < h.depth - 1e-6 && r < h.radius * 0.9).toBe(false);
      }
    }
  });
  it('face area is the body face area less each hole polygon', () => {
    const b = createBoard({ id: 'p', length: 30, width: 11.25, thickness: 0.75, holes: [pinRow] });
    const holes = boardHoles(b);
    const top = boardBodies(b)[0]!.faces.find((f) => f.n[2] === 1)!;
    const triArea = (t: number[][]) => Math.abs((t[1]![0]! - t[0]![0]!) * (t[2]![1]! - t[0]![1]!) - (t[2]![0]! - t[0]![0]!) * (t[1]![1]! - t[0]![1]!)) / 2;
    const ngon = (HOLE_SEGMENTS / 2) * 0.125 ** 2 * Math.sin((2 * Math.PI) / HOLE_SEGMENTS);
    expect(faceTriangles(top, holes).reduce((s, t) => s + triArea(t), 0)).toBeCloseTo(30 * 11.25 - 3 * ngon, 9);
  });
  it('holeMesh: a wall facing the axis with radial normals, and a bottom facing the mouth', () => {
    const b = createBoard({ id: 'p', length: 30, width: 11.25, thickness: 0.75, holes: [{ ...pinRow, count: 1 }] });
    const [h] = boardHoles(b);
    const m = holeMesh(b, h!, boardBodies(b));
    expect(m.positions.length).toBe(m.normals.length);
    expect(m.uvs.length / 2).toBe(m.positions.length / 3);
    // Every triangle is wound so its geometric normal agrees with its vertex normals (FrontSide materials).
    for (let i = 0; i < m.positions.length; i += 9) {
      const p = [0, 1, 2].map((k) => [m.positions[i + 3 * k]!, m.positions[i + 3 * k + 1]!, m.positions[i + 3 * k + 2]!]);
      const e1 = [0, 1, 2].map((k) => p[1]![k]! - p[0]![k]!); const e2 = [0, 1, 2].map((k) => p[2]![k]! - p[0]![k]!);
      const cr = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
      const n = [m.normals[i]!, m.normals[i + 1]!, m.normals[i + 2]!];
      expect(cr[0]! * n[0]! + cr[1]! * n[1]! + cr[2]! * n[2]!).toBeGreaterThan(0);
    }
    // Every normal faces into the hole: toward the vertex centroid, which lies on the axis between mouth and bottom
    // (frame-independent — a wall normal is radial toward the axis, the bottom's points back at the mouth).
    const nv = m.positions.length / 3;
    const c = [0, 1, 2].map((k) => { let s = 0; for (let i = 0; i < nv; i += 1) s += m.positions[3 * i + k]!; return s / nv; });
    const shared = new Map<string, number>();
    for (let i = 0; i < nv; i += 1) {
      const n = [0, 1, 2].map((k) => m.normals[3 * i + k]!);
      expect(Math.hypot(n[0]!, n[1]!, n[2]!)).toBeCloseTo(1, 6);
      expect(n.reduce((s, x, k) => s + x * (c[k]! - m.positions[3 * i + k]!), 0)).toBeGreaterThan(0);
      shared.set(n.join(','), (shared.get(n.join(',')) ?? 0) + 1);
    }
    // The blind hole has a bottom: one flat HOLE_SEGMENTS-gon, fanned, every vertex carrying the same normal (a wall
    // vertex's normal is shared only by the triangles around one ring vertex).
    expect(Math.max(...shared.values()) / 3).toBeGreaterThanOrEqual(HOLE_SEGMENTS - 2);
  });
});

describe('seams inside a holed part are not drawn (ruling R11)', () => {
  // cabinetSide: three pins (to 4.65in) and a dado 10..10.75in, 1/4 deep. Bodies: the slab under the dado's floor
  // (thickness 0..0.5, full length) and the stock either side of the dado above it — so the plane thickness = 0.5 is a
  // seam everywhere but the dado's floor, and the 3/8-deep pins cross it.
  const bodies = boardBodies(cabinetSide);
  const holes = boardHoles(cabinetSide);
  /** Every body triangle's centroid, board-local (positions are centred world offsets; fromWorldOffset maps back). */
  const centroids = (board: typeof cabinetSide, meshes: ReturnType<typeof bodyMesh>[]) => {
    const frame = axisFrame(board);
    const ext = boardExtents(board);
    return meshes.flatMap((m) => {
      const out: number[][] = [];
      for (let t = 0; t < m.positions.length / 3; t += 3) {
        const w = [0, 1, 2].map((k) => (m.positions[t * 3 + k]! + m.positions[t * 3 + 3 + k]! + m.positions[t * 3 + 6 + k]!) / 3 + ext[k]! / 2);
        const local = [0, 0, 0];
        frame.forEach((a, i) => { local[DIMENSION_ORDER.indexOf(a.dim)] = fromWorldOffset(board, i, w[i]!); });
        out.push(local);
      }
      return out;
    });
  };
  // The bodies a pin reaches — the ones BoardMesh sends through bodyMesh; a body no hole reaches keeps its box path.
  const holedBodies = bodies.filter((b) => holes.some((h) => holeTouchesBox(h, b.box!)));
  const meshes = holedBodies.map((body) => bodyMesh(cabinetSide, body, holes, bodies));

  it('no triangle on the seam plane inside the stock: at thickness 1/2 a holed body draws only the dado floor', () => {
    expect(holedBodies.length).toBe(2);
    const onSeam = centroids(cabinetSide, meshes).filter((c) => Math.abs(c[2]! - 0.5) < 1e-6);
    expect(onSeam.length).toBeGreaterThan(0);                        // the floor is still there
    for (const c of onSeam) {
      expect(c[0]!).toBeGreaterThanOrEqual(10 - 1e-6);
      expect(c[0]!).toBeLessThanOrEqual(10.75 + 1e-6);
    }
  });
  it('no membrane through bodyMesh: no body triangle lies inside a hole between its caps', () => {
    for (const c of centroids(cabinetSide, meshes)) {
      for (const h of holes) {
        const tt = h.dir * (c[2]! - h.centre[2]);
        const r = Math.hypot(c[0]! - h.centre[0], c[1]! - h.centre[1]);
        expect(tt > 1e-6 && tt < h.depth - 1e-6 && r < h.radius * 0.9).toBe(false);
      }
    }
  });
  it('a part without holes, and a body no hole reaches, draw exactly what they drew before', () => {
    const same = (a: ReturnType<typeof bodyMesh>, b: ReturnType<typeof bodyMesh>) => {
      expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
      expect(Array.from(a.uvs)).toEqual(Array.from(b.uvs));
      expect(a.groups).toEqual(b.groups);
    };
    const plain = { ...cabinetSide, holes: [] };
    const plainBodies = boardBodies(plain);
    for (const body of plainBodies) same(bodyMesh(plain, body, [], plainBodies), bodyMesh(plain, body));
    for (const posture of ['flat', 'on-edge', 'upright'] as const) {
      const angled = { ...chiralAngled(posture), cuts: [dado] };
      const angledBodies = boardBodies(angled);
      for (const body of angledBodies) same(bodyMesh(angled, body, [], angledBodies), bodyMesh(angled, body));
    }
    const far = bodies.find((b) => b.box!.length[0] >= 10.75)!;          // beyond the dado: no pin reaches it
    same(bodyMesh(cabinetSide, far, holes, bodies), bodyMesh(cabinetSide, far, holes));
  });
});

describe('a clean hole draws its wall whole across a seam (ruling R15)', () => {
  // cabinetSide's pins are clean (holeInStock) and cross the seam at thickness 1/2 between two bodies.
  const bodies = boardBodies(cabinetSide);
  const holes = boardHoles(cabinetSide);
  const n = HOLE_SEGMENTS;
  const drill = axisFrame(cabinetSide).findIndex((a) => a.dim === 'thickness');
  it('every pin is clean and crosses the seam', () => {
    for (const h of holes) {
      expect(holeInStock(cabinetSide, h)).toBe(true);
      expect(h.centre[2] - h.depth).toBeLessThan(0.5);
    }
  });
  it('per hole: one quad per facet (no seam split, nothing doubled), wall area 48 x facet x depth, bottom the 48-gon', () => {
    const facet = 2 * 0.125 * Math.sin(Math.PI / n);                    // r = 1/8
    const ngon = (n / 2) * 0.125 ** 2 * Math.sin((2 * Math.PI) / n);
    for (const h of holes) {
      const m = holeMesh(cabinetSide, h, bodies);
      let wall = 0; let bottom = 0; let wallTris = 0; let bottomTris = 0;
      for (let t = 0; t < m.positions.length / 3; t += 3) {
        const v = [0, 1, 2].map((j) => [0, 1, 2].map((k) => m.positions[(t + j) * 3 + k]!));
        const e1 = [0, 1, 2].map((k) => v[1]![k]! - v[0]![k]!);
        const e2 = [0, 1, 2].map((k) => v[2]![k]! - v[0]![k]!);
        const area = Math.hypot(e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!) / 2;
        // A bottom vertex's normal runs along the drill axis (thickness); the wall's lies across it.
        if (Math.abs(m.normals[t * 3 + drill]!) > 0.999) { bottom += area; bottomTris += 1; } else { wall += area; wallTris += 1; }
      }
      expect(wallTris).toBe(2 * n);
      expect(bottomTris).toBe(n - 2);
      expect(wall).toBeCloseTo(n * facet * h.depth, 5);
      expect(bottom).toBeCloseTo(ngon, 5);
    }
  });
});

describe('faceTriangles: faulted and tangent holes take the fallback split (ruling R4; holes spec §3.2)', () => {
  // A 10 x 10 panel, 1in thick, holes r = 1 entered from the top (thickness max) face.
  const row = { id: 'h', face: 'thickness' as const, from: 'max' as const, diameter: 2, depth: 0.5, along: 'length' as const, alongFrom: 'min' as const, station: 4, count: 2, pitch: 1, acrossFrom: 'min' as const, inset: 5 };
  const panel = (r: typeof row) => createBoard({ id: 'q', length: 10, width: 10, thickness: 1, holes: [r] });
  const topOf = (b: ReturnType<typeof createBoard>) => boardBodies(b)[0]!.faces.find((f) => f.n[2] === 1)!;
  const area = (tris: number[][][]) => tris.reduce((s, t) => s + Math.abs((t[1]![0]! - t[0]![0]!) * (t[2]![1]! - t[0]![1]!) - (t[2]![0]! - t[0]![0]!) * (t[1]![1]! - t[0]![1]!)) / 2, 0);
  const ngon = (HOLE_SEGMENTS / 2) * Math.sin((2 * Math.PI) / HOLE_SEGMENTS);   // r = 1
  // No triangle's centroid inside a hole, from its mouth (inclusive) to its bottom.
  const noneInside = (tris: number[][][], holes: ReturnType<typeof boardHoles>) => {
    for (const t of tris) {
      const c = [0, 1, 2].map((k) => (t[0]![k]! + t[1]![k]! + t[2]![k]!) / 3);
      for (const h of holes) {
        const tt = h.dir * (c[2]! - h.centre[2]);
        expect(tt >= -1e-6 && tt < h.depth - 1e-6 && Math.hypot(c[0]! - h.centre[0], c[1]! - h.centre[1]) < h.radius * 0.9).toBe(false);
      }
    }
  };

  it('two overlapping holes (centres 1 apart, r = 1): the face loses their union', () => {
    const b = panel(row);
    const holes = boardHoles(b);
    const tris = faceTriangles(topOf(b), holes);
    // Union of two unit circles 1 apart: 2π − lens, lens = 2·acos(1/2) − (1/2)·√3. The 48-gons sit within ~0.02 of it.
    const union = 2 * Math.PI - (2 * Math.acos(0.5) - 0.5 * Math.sqrt(3));
    expect(Math.abs(area(tris) - (100 - union))).toBeLessThan(0.03);
    noneInside(tris, holes);
  });
  it('coincident holes (pitch 0): the mouth is not capped', () => {
    const b = panel({ ...row, pitch: 0 });
    const holes = boardHoles(b);
    const tris = faceTriangles(topOf(b), holes);
    expect(area(tris)).toBeCloseTo(100 - ngon, 9);
    noneInside(tris, holes);
  });
  it('a hole tangent to a face edge takes the fallback: face less the 48-gon', () => {
    const b = panel({ ...row, count: 1, inset: 1 });   // the ring touches the width-min edge
    const holes = boardHoles(b);
    const top = topOf(b);
    const tris = faceTriangles(top, holes);
    expect(area(tris)).toBeCloseTo(100 - ngon, 9);
    noneInside(tris, holes);
  });
  it('a hole centred on a face edge (ring not inside the face) loses exactly half its 48-gon', () => {
    // The tangent case above also triangulates correctly on the strict path; this one only the fallback can draw.
    const b = panel({ ...row, count: 1, inset: 0 });
    const holes = boardHoles(b);
    const tris = faceTriangles(topOf(b), holes);
    expect(area(tris)).toBeCloseTo(100 - ngon / 2, 9);
    noneInside(tris, holes);
  });
});

describe('holesMesh: every hole of a part in ONE geometry (final review 2: one draw call per part, not per hole)', () => {
  type M = { positions: Float32Array; normals: Float32Array; uvs: Float32Array; groups: { start: number; count: number; materialIndex: number }[] };
  // One material's slice of a mesh: positions, normals and uvs of its group (or empty when it has none).
  const slice = (m: M, material: number) => {
    const g = m.groups.find((x) => x.materialIndex === material);
    if (!g) return { pos: [] as number[], nor: [] as number[], uv: [] as number[] };
    return {
      pos: [...m.positions.subarray(g.start * 3, (g.start + g.count) * 3)],
      nor: [...m.normals.subarray(g.start * 3, (g.start + g.count) * 3)],
      uv: [...m.uvs.subarray(g.start * 2, (g.start + g.count) * 2)],
    };
  };
  // Two rows (42 holes) on a dadoed side whose dado crosses them: clean holes and faulted (clipped) ones both.
  const rows = [{ ...pinRow, id: 'r1', count: 21 }, { ...pinRow, id: 'r2', count: 21, acrossFrom: 'max' as const }];
  const side = createBoard({ id: 'side', length: 30, width: 11.25, thickness: 0.75, cuts: [dado], holes: rows });
  it('the merged geometry is the per-hole meshes concatenated, material by material, in hole order', () => {
    const { bodies, holes } = partGeometry(side);
    const checks = stockChecks(side);
    const each = holes.map((h) => holeMesh(side, h, bodies, checks));
    const merged = holesMesh(side, holes, bodies, checks)!;
    expect(holes).toHaveLength(42);
    // Triangle count: the sum of the per-hole meshes.
    const tris = (m: M) => m.positions.length / 9;
    expect(tris(merged)).toBe(each.reduce((s, m) => s + tris(m), 0));
    expect(merged.normals.length).toBe(merged.positions.length);
    expect(merged.uvs.length / 2).toBe(merged.positions.length / 3);
    // Per material: one group whose count is the sum of the per-hole groups', holding exactly their vertices in order.
    const used = [...new Set(each.flatMap((m) => m.groups.map((g) => g.materialIndex)))].sort();
    expect(merged.groups.map((g) => g.materialIndex)).toEqual(used);
    for (const material of used) {
      const g = merged.groups.find((x) => x.materialIndex === material)!;
      expect(g.count).toBe(each.reduce((s, m) => s + (m.groups.find((x) => x.materialIndex === material)?.count ?? 0), 0));
      const want = each.map((m) => slice(m, material));
      expect(slice(merged, material)).toEqual({ pos: want.flatMap((w) => w.pos), nor: want.flatMap((w) => w.nor), uv: want.flatMap((w) => w.uv) });
    }
    // Groups are packed back to back from 0, covering every vertex.
    let at = 0;
    for (const g of merged.groups) { expect(g.start).toBe(at); at += g.count; }
    expect(at).toBe(merged.positions.length / 3);
  });
  it('a part without holes adds no hole mesh', () => {
    const plain = createBoard({ id: 'p', length: 30, width: 11.25, thickness: 0.75 });
    const { bodies, holes } = partGeometry(plain);
    expect(holesMesh(plain, holes, bodies, stockChecks(plain))).toBeNull();
  });
});
