import * as THREE from 'three';
import {
  axisDimensions, boardExtents, boardSolids, createBoard, solidWorldBox, wholeBoard,
} from '../document/document';
import type { Region } from '../document/document';
import { boardUVOffset, boardUVs, boardUVSignature, facePlans } from './grainTiling';

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
    for (const solid of boardSolids(board)) {
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
