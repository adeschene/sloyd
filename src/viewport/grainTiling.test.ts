import { createBoard } from '../document/document';
import { boardUVOffset, boardUVs, facePlans } from './grainTiling';

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
    const small = facePlans({ ...flat, length: 12 })[PY].repeat[0];
    const large = facePlans({ ...flat, length: 24 })[PY].repeat[0];
    expect(large).toBeCloseTo(small * 2);
  });

  it('fits one ring pattern across an end, however big the end is', () => {
    expect(facePlans(flat)[PX].repeat).toEqual([1, 1]);
    expect(facePlans({ ...flat, width: 11 })[PX].repeat).toEqual([1, 1]);
  });

  it('fits exactly one ply stack across the thickness of a plywood edge', () => {
    const plywood = { ...flat, material: 'plywood' };
    // +Z is the edge face when flat and unrotated; its v axis carries the
    // thickness, and the drawn ply stack has to span it exactly whether the
    // sheet is 1/2in or 3/4in.
    expect(facePlans(plywood)[PZ].repeat[1]).toBe(1);
    expect(facePlans({ ...plywood, thickness: 0.5 })[PZ].repeat[1]).toBe(1);
  });

  it('fits one ply stack across the thickness of a standing plywood end too', () => {
    // The rank rule is what makes this work — on an end face the in-plane
    // dimensions are width and thickness, and width outranks thickness, so v
    // lands on the thickness whichever way the board is turned. Standing and
    // rotated is the orientation where that stops being obvious, and it is the
    // case that would silently paint plies across the length if the rule were
    // ever "simplified".
    const plywood = { ...flat, material: 'plywood', posture: 'on-edge' as const, rotation: 90 as const };
    expect(facePlans(plywood)[PZ].kind).toBe('end');
    expect(facePlans(plywood)[PZ].repeat[1]).toBe(1);
  });

  it('tiles a plywood edge along its length like any other long face', () => {
    const plywood = { ...flat, material: 'plywood' };
    expect(facePlans(plywood)[PZ].repeat[0])
      .toBeGreaterThan(facePlans({ ...plywood, length: 12 })[PZ].repeat[0]);
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
    expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(plan.repeat[0]);
    expect(Math.max(...vs) - Math.min(...vs)).toBeCloseTo(plan.repeat[1]);
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
