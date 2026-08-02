import { buildNesting, footprintsOf } from './nesting';
import { createBoard } from './document';
import type { SheetStock } from './types';
import type { Nesting } from './nesting';

const PLY: SheetStock = { length: 96, width: 48, rotate: 'grain' };
const MDF: SheetStock = { length: 96, width: 48, rotate: 'free' };

describe('footprintsOf', () => {
  // Under 'grain' the part's grain field DETERMINES its orientation — it is
  // not merely a veto on rotating. A part whose veneer runs across its width
  // is laid on the sheet that way, which is what makes the drawing true.
  it('lays a length-grained part along the sheet', () => {
    const b = createBoard({ length: 30, width: 20, grain: 'length', material: 'plywood' });
    expect(footprintsOf(b, PLY)).toEqual([{ w: 30, h: 20, turned: false }]);
  });

  it('lays a width-grained part across the sheet', () => {
    const b = createBoard({ length: 30, width: 20, grain: 'width', material: 'plywood' });
    expect(footprintsOf(b, PLY)).toEqual([{ w: 20, h: 30, turned: true }]);
  });

  it('offers one orientation only under a grain policy', () => {
    const b = createBoard({ length: 30, width: 20, grain: 'width', material: 'plywood' });
    expect(footprintsOf(b, PLY)).toHaveLength(1);
  });

  // Free rotation prefers the orientation that opens the SHORTER shelf: a
  // shelf's height is fixed by its first part, so lying parts down wastes
  // less sheet width.
  it('offers both orientations for a free-rotating material, shortest shelf first', () => {
    const b = createBoard({ length: 30, width: 20, grain: 'length', material: 'mdf' });
    expect(footprintsOf(b, MDF)).toEqual([
      { w: 30, h: 20, turned: false },
      { w: 20, h: 30, turned: true },
    ]);
  });

  it('prefers the same orientation regardless of which way grain points', () => {
    const b = createBoard({ length: 30, width: 20, grain: 'width', material: 'mdf' });
    expect(footprintsOf(b, MDF)[0]).toEqual({ w: 30, h: 20, turned: false });
  });

  // Not reachable through the UI (validateBoard normalises it away for sheet
  // goods) but a Board built in code can carry it. Defaulting beats throwing,
  // same narrow scope as materialLabel's `??`.
  it('treats a thickness-grained sheet part as length-grained', () => {
    const b = createBoard({ length: 30, width: 20, material: 'plywood' });
    expect(footprintsOf({ ...b, grain: 'thickness' }, PLY)).toEqual([
      { w: 30, h: 20, turned: false },
    ]);
  });
});

/** A plywood part of exactly these dimensions, grain along its length. */
const part = (length: number, width: number, name: string) =>
  createBoard({ name, length, width, thickness: 0.75, grain: 'length', material: 'plywood' });

/** Every pair of parts on one sheet, as [a, b]. */
const pairs = (n: Nesting) =>
  n.sheets.flatMap((s) =>
    s.parts.flatMap((a, i) => s.parts.slice(i + 1).map((b) => [a, b] as const)),
  );

const overlaps = (a: { x: number; y: number; w: number; h: number },
                  b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('buildNesting', () => {
  it('returns no sheets for no parts', () => {
    const n = buildNesting([], PLY, 0.125, 16);
    expect(n.sheets).toEqual([]);
    expect(n.unplaceable).toEqual([]);
    expect(n.label).toBe('0 sheets (96" × 48")');
    expect(n.sheet).toBe('96" × 48"');
  });

  it('labels one sheet in the singular', () => {
    expect(buildNesting([part(24, 12, 'A')], PLY, 0.125, 16).label)
      .toBe('1 sheet (96" × 48")');
  });

  // THE EPSILON CASE. `remaining = sheetLength - used` compared against a
  // part's extent is a SUBTRACTION RESULT compared against a bound — the exact
  // shape that made cutLabel wrong 2.8% of the time. Reverting the fits-test
  // to an exact `<=` fails this and nothing else.
  it('fits four 24-inch parts on a 96-inch sheet at zero kerf', () => {
    const n = buildNesting(
      [part(24, 12, 'A'), part(24, 12, 'B'), part(24, 12, 'C'), part(24, 12, 'D')],
      PLY, 0, 16,
    );
    expect(n.sheets).toHaveLength(1);
    expect(n.sheets[0].parts.map((p) => p.x)).toEqual([0, 24, 48, 72]);
  });

  // Kerf is not decoration: the same four parts need 96.375" and no longer fit.
  it('spends a second sheet once kerf is counted', () => {
    const n = buildNesting(
      [part(24, 12, 'A'), part(24, 12, 'B'), part(24, 12, 'C'), part(24, 12, 'D')],
      PLY, 0.125, 16,
    );
    expect(n.sheets).toHaveLength(1);
    expect(n.sheets[0].parts).toHaveLength(4);
    // Three of them ride the first shelf; the fourth opens a second shelf on
    // the same sheet rather than a second sheet.
    expect(n.sheets[0].parts.map((p) => [p.x, p.y])).toEqual([
      [0, 0], [24.125, 0], [48.25, 0], [0, 12.125],
    ]);
  });

  it('leaves no kerf at a sheet or shelf edge', () => {
    const n = buildNesting([part(24, 12, 'A')], PLY, 0.125, 16);
    expect(n.sheets[0].parts[0]).toMatchObject({ x: 0, y: 0 });
  });

  it('opens a second sheet when the first is full', () => {
    const boards = Array.from({ length: 9 }, (_, i) => part(48, 24, `P${i}`));
    const n = buildNesting(boards, PLY, 0, 16);
    expect(n.sheets).toHaveLength(3);
    expect(n.sheets.flatMap((s) => s.parts)).toHaveLength(9);
  });

  it('never overlaps two parts and never leaves the sheet', () => {
    const boards = [
      part(30, 20, 'A'), part(30, 20, 'B'), part(18, 18, 'C'),
      part(48, 6, 'D'), part(12, 40, 'E'), part(7, 3, 'F'),
    ];
    const n = buildNesting(boards, PLY, 0.125, 16);
    for (const [a, b] of pairs(n)) expect(overlaps(a, b)).toBe(false);
    for (const s of n.sheets) {
      for (const p of s.parts) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.x + p.w).toBeLessThanOrEqual(96 + 1e-6);
        expect(p.y + p.h).toBeLessThanOrEqual(48 + 1e-6);
      }
    }
  });

  // THE GUILLOTINE PROPERTY. Cuttability is the entire justification for
  // choosing shelf packing over maxrects, so it is a test rather than a
  // comment: every part's across-sheet interval falls inside exactly one
  // shelf band, and the bands are disjoint. That is what lets a shop rip the
  // sheet into strips and then crosscut each strip.
  it('places every part inside exactly one disjoint shelf band', () => {
    const boards = [
      part(30, 20, 'A'), part(30, 20, 'B'), part(18, 18, 'C'),
      part(48, 6, 'D'), part(12, 40, 'E'), part(7, 3, 'F'),
    ];
    const n = buildNesting(boards, PLY, 0.125, 16);
    for (const s of n.sheets) {
      const bands: [number, number][] = [];
      for (const p of s.parts) {
        const band = bands.find(([lo]) => Math.abs(lo - p.y) < 1e-6);
        if (band) band[1] = Math.max(band[1], p.y + p.h);
        else bands.push([p.y, p.y + p.h]);
      }
      bands.sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < bands.length; i += 1) {
        expect(bands[i][0]).toBeGreaterThanOrEqual(bands[i - 1][1] - 1e-6);
      }
      // Every part starts on a band boundary — nothing floats mid-band.
      for (const p of s.parts) {
        expect(bands.some(([lo, hi]) => Math.abs(lo - p.y) < 1e-6 && p.y + p.h <= hi + 1e-6))
          .toBe(true);
      }
    }
  });

  it('records a part too big for any sheet without opening one', () => {
    const n = buildNesting([part(100, 30, 'Back Panel')], PLY, 0.125, 16);
    expect(n.sheets).toEqual([]);
    expect(n.unplaceable).toEqual([
      { boardId: expect.any(String), name: 'Back Panel', dims: '100" × 30"' },
    ]);
  });

  it('still packs the parts that do fit', () => {
    const n = buildNesting([part(100, 30, 'Oops'), part(24, 12, 'Fine')], PLY, 0.125, 16);
    expect(n.unplaceable).toHaveLength(1);
    expect(n.sheets).toHaveLength(1);
    expect(n.sheets[0].parts[0].name).toBe('Fine');
  });

  // `turned` follows the part's grain, not the packer's convenience: a
  // width-grained part on a tall sheet is laid across it, and the flag says so.
  it('reports a width-grained part as turned', () => {
    const ply = buildNesting(
      [createBoard({ name: 'X', length: 60, width: 40, grain: 'width', material: 'plywood' })],
      { length: 48, width: 96, rotate: 'grain' }, 0, 16,
    );
    expect(ply.sheets).toHaveLength(1);
    expect(ply.sheets[0].parts[0]).toMatchObject({ w: 40, h: 60, turned: true });
  });

  // DETERMINISM. Nothing else catches losing the boardId tiebreak, and losing
  // it produces a layout that reshuffles as parts are renamed.
  it('produces identical output whatever order the boards arrive in', () => {
    const boards = [
      part(30, 20, 'A'), part(30, 20, 'B'), part(18, 18, 'C'),
      part(48, 6, 'D'), part(12, 40, 'E'), part(7, 3, 'F'),
    ];
    const forward = buildNesting(boards, PLY, 0.125, 16);
    const reversed = buildNesting([...boards].reverse(), PLY, 0.125, 16);
    const shuffled = buildNesting([boards[3], boards[0], boards[5], boards[2], boards[4], boards[1]], PLY, 0.125, 16);
    expect(reversed).toEqual(forward);
    expect(shuffled).toEqual(forward);
  });

  it('packs free-rotating material at least as tightly as grain-locked', () => {
    const boards = Array.from({ length: 4 }, (_, i) =>
      createBoard({ name: `P${i}`, length: 40, width: 40, grain: 'length', material: 'mdf' }));
    expect(buildNesting(boards, MDF, 0, 16).sheets.length)
      .toBeLessThanOrEqual(buildNesting(boards, PLY, 0, 16).sheets.length);
  });
});
