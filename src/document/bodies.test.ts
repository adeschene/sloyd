import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import type { AngleCut, Board, Cut } from './types';
import { boardBodies, bodyVerts, bodyVolume } from './bodies';
import { pocketCells } from './cuts';

const taper: AngleCut = { id: 'a1', kind: 'taper', face: 'width', from: 'min', along: 'length', alongFrom: 'min', points: [[0, 0.625], [24, 0]] };
const leg = (over: Partial<Board> = {}) => createBoard({ length: 29, width: 1.75, thickness: 1.75, ...over });
const total = (b: Board) => boardBodies(b).reduce((v, body) => v + bodyVolume(body), 0);
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-9);

describe('boardBodies (angle-cuts spec §3.1)', () => {
  it('is the pocket cells, as boxes, when there are no angle cuts', () => {
    const b = leg();
    const bodies = boardBodies(b);
    expect(bodies.map((x) => x.box)).toEqual(pocketCells(b));
    expect(bodies[0]!.faces).toHaveLength(6);
    near(total(b), 29 * 1.75 * 1.75);
  });

  it('removes the taper wedge: ½ · depth · run · through', () => {
    const b = leg({ angleCuts: [taper] });
    near(total(b), 29 * 1.75 * 1.75 - 0.5 * 0.625 * 24 * 1.75);
    expect(boardBodies(b).every((x) => x.box === null)).toBe(true);
  });

  it('labels the sloped face with its cut and tilts its normal away from the from face', () => {
    const b = leg({ angleCuts: [taper] });
    const slope = boardBodies(b).flatMap((x) => x.faces).filter((f) => f.cut === 'a1');
    expect(slope.length).toBeGreaterThan(0);
    for (const f of slope) {
      expect(f.n[1]).toBeLessThan(0);       // outward points back toward the width min face
      expect(f.n[2]).toBeCloseTo(0, 12);             // straight through thickness (-0 or 0)
      expect(Math.hypot(...f.n)).toBeCloseTo(1, 12);
    }
  });

  it('keeps a mortise and a taper together', () => {
    const mortise: Cut = { id: 'c1', face: 'width', from: 'max', across: 'thickness', offset: 24, width: 3, depth: 1, stopMin: 0.5, stopMax: 0.5 };
    const b = leg({ cuts: [mortise], angleCuts: [taper] });
    near(total(b), 29 * 1.75 * 1.75 - 0.5 * 0.625 * 24 * 1.75 - 3 * 1 * 0.75);
  });

  it('leaves a cell the slope does not reach as its box', () => {
    const mortise: Cut = { id: 'c1', face: 'width', from: 'max', across: 'thickness', offset: 25, width: 3, depth: 1, stopMin: 0.5, stopMax: 0.5 };
    const b = leg({ cuts: [mortise], angleCuts: [taper] });
    // Cells wholly above station 24 are untouched by the taper.
    expect(boardBodies(b).some((x) => x.box !== null && x.box.length[0] >= 24)).toBe(true);
  });

  it('a cut that removes nothing leaves the board whole and boxed', () => {
    const b = leg({ angleCuts: [{ ...taper, points: [[30, 0], [40, 1]] }] });
    near(total(b), 29 * 1.75 * 1.75);
    expect(boardBodies(b).every((x) => x.box !== null)).toBe(true);
  });

  it('is empty when the angle cuts take everything (invariant 21 placeholder)', () => {
    const b = leg({ angleCuts: [{ ...taper, points: [[0, 5], [29, 5]] }] });
    expect(boardBodies(b)).toEqual([]);
  });

  it('a 45° miter removes a right triangle prism (spec §2.2 table)', () => {
    const rail = createBoard({ length: 24, width: 2.5, thickness: 0.75, angleCuts: [
      { id: 'm', kind: 'miter', face: 'length', from: 'max', along: 'width', alongFrom: 'min', points: [[0, 0], [2.5, 2.5]] },
    ] });
    near(total(rail), 24 * 2.5 * 0.75 - 0.5 * 2.5 * 2.5 * 0.75);
    const xs = boardBodies(rail).flatMap(bodyVerts).map((p) => p[0]);
    near(Math.max(...xs), 24);
  });

  it('a chamfer removes ½ · a · b along the full length', () => {
    const b = createBoard({ length: 20, width: 3, thickness: 0.75, angleCuts: [
      { id: 'ch', kind: 'chamfer', face: 'thickness', from: 'max', along: 'width', alongFrom: 'min', points: [[0, 0.125], [0.125, 0]] },
    ] });
    near(total(b), 20 * 3 * 0.75 - 0.5 * 0.125 * 0.125 * 20);
  });
});
