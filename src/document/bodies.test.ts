import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import type { AngleCut, Board, Cut } from './types';
import { boardBodies, boardEdges, bodyEdges, bodyVerts, bodyVolume } from './bodies';
import { pocketCells, pocketEdges } from './cuts';
import type { Segment } from './cuts';
import { chiralPart } from './turnFixtures';

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

const segKey = ([a, b]: Segment) => {
  const p = [a.length, a.width, a.thickness].map((v) => Math.round(v * 1e6));
  const q = [b.length, b.width, b.thickness].map((v) => Math.round(v * 1e6));
  return (p.join(',') < q.join(',') ? [p, q] : [q, p]).map((x) => x.join(',')).join('|');
};
const asSegments = (b: Board): Segment[] => bodyEdges(boardBodies(b)).map(([p, q]) =>
  [{ length: p[0], width: p[1], thickness: p[2] }, { length: q[0], width: q[1], thickness: q[2] }]);

describe('bodyEdges agrees with pocketEdges on every rectangular fixture (inv 16 generalised)', () => {
  const fixtures: [string, Board][] = [
    ['plain', createBoard({})],
    ['chiral', chiralPart('flat')],
    ['dado', createBoard({ cuts: [{ id: 'c', face: 'thickness', from: 'max', across: 'width', offset: 6, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 }] })],
    ['rabbet', createBoard({ cuts: [{ id: 'c', face: 'thickness', from: 'max', across: 'length', offset: 0, width: 0.5, depth: 0.375, stopMin: 0, stopMax: 0 }] })],
    ['mortise', createBoard({ cuts: [{ id: 'c', face: 'width', from: 'min', across: 'thickness', offset: 3, width: 2, depth: 1, stopMin: 0.25, stopMax: 0.25 }] })],
    ['diagonal', createBoard({ cuts: [
      { id: 'c', face: 'thickness', from: 'max', across: 'width', offset: 0, width: 12, depth: 0.375, stopMin: 0, stopMax: 0 },
      { id: 'd', face: 'thickness', from: 'min', across: 'width', offset: 12, width: 12, depth: 0.375, stopMin: 0, stopMax: 0 },
    ] })],
    // A merged pocket cell's face straddles an edge line and ends part-way along it, with no polygon edge
    // ending there: only the coplanar-boundary crossings split the line at that point (Task 5 mutation 3).
    ['t-junction', createBoard({ length: 8, width: 4, thickness: 2, cuts: [
      { id: 'c0', face: 'width', from: 'min', across: 'length', offset: 0, width: 1, depth: 2, stopMin: 0, stopMax: 0 },
      { id: 'c1', face: 'length', from: 'min', across: 'thickness', offset: 0, width: 1, depth: 2, stopMin: 0, stopMax: 0 },
      { id: 'c2', face: 'thickness', from: 'max', across: 'width', offset: 4, width: 3.75, depth: 0.25, stopMin: 1, stopMax: 1.25 },
    ] })],
  ];
  for (const [name, b] of fixtures) {
    it(name, () => {
      expect(asSegments(b).map(segKey).sort()).toEqual(pocketEdges(b).map(segKey).sort());
    });
  }

  it('on 200 seeded random boards of one to four quarter-inch rectangular cuts', () => {
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]!;
    const q = (m: number) => Math.round(rnd() * m * 4) / 4;
    const dims = ['length', 'width', 'thickness'] as const;
    const size = { length: 8, width: 4, thickness: 2 };
    const wrong: string[] = [];
    for (let n = 0; n < 200; n += 1) {
      const cuts: Cut[] = Array.from({ length: 1 + Math.floor(rnd() * 4) }, (_, c) => {
        const face = pick(dims);
        const across = pick(dims.filter((d) => d !== face));
        const along = dims.find((d) => d !== face && d !== across)!;
        const offset = q(size[along] * 0.75);
        return {
          id: `c${c}`, face, from: pick(['min', 'max'] as const), across, offset,
          width: Math.max(0.25, Math.min(size[along] - offset, q(size[along] / 2))),
          depth: Math.max(0.25, q(size[face] * 0.6)),
          stopMin: rnd() < 0.5 ? 0 : q(size[across] / 3),
          stopMax: rnd() < 0.5 ? 0 : q(size[across] / 3),
        };
      });
      const b = createBoard({ ...size, cuts });
      if (JSON.stringify(asSegments(b).map(segKey).sort()) !== JSON.stringify(pocketEdges(b).map(segKey).sort())) {
        wrong.push(JSON.stringify(cuts));
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe('boardEdges with angle cuts', () => {
  it('a 45° miter: the removed corner draws nothing, the slope draws its outline', () => {
    const rail = createBoard({ length: 24, width: 2.5, thickness: 0.75, angleCuts: [
      { id: 'm', kind: 'miter', face: 'length', from: 'max', along: 'width', alongFrom: 'min', points: [[0, 0], [2.5, 2.5]] },
    ] });
    const keys = boardEdges(rail).map(segKey);
    // The square end's edge at length 24 across the width is gone…
    expect(keys).not.toContain(segKey([{ length: 24, width: 0, thickness: 0 }, { length: 24, width: 2.5, thickness: 0 }]));
    // …and the miter's long edges run from the long point (width 0) to the short point (width 2.5).
    expect(keys).toContain(segKey([{ length: 24, width: 0, thickness: 0 }, { length: 21.5, width: 2.5, thickness: 0 }]));
    expect(keys).toContain(segKey([{ length: 24, width: 0, thickness: 0.75 }, { length: 21.5, width: 2.5, thickness: 0.75 }]));
    // A box has 12 edges; a mitered end still has 12 (two replaced by two, one end edge shorter): count them.
    expect(boardEdges(rail)).toHaveLength(12);
  });

  it('a taper crossing several pocket cells draws no seams across its slope', () => {
    const mortise: Cut = { id: 'c1', face: 'width', from: 'max', across: 'thickness', offset: 2, width: 3, depth: 1, stopMin: 0.5, stopMax: 0.5 };
    const b = leg({ cuts: [mortise], angleCuts: [taper] });
    // Every edge lying in the slope's plane must be one of its four outline edges: the two long edges, the
    // foot edge across the thickness, and the crease where the slope meets the width face at station 24.
    // The pocket grid splits at length 2 and 5 and thickness 0.5 and 1.25 cross the slope: no seam may appear.
    const onSlope = boardEdges(b).filter(([p, q]) => [p, q].every((x) => Math.abs(x.width - 0.625 * (1 - x.length / 24)) < 1e-9 && x.length <= 24));
    expect(onSlope.map(segKey).sort()).toEqual([
      segKey([{ length: 0, width: 0.625, thickness: 0 }, { length: 24, width: 0, thickness: 0 }]),
      segKey([{ length: 0, width: 0.625, thickness: 1.75 }, { length: 24, width: 0, thickness: 1.75 }]),
      segKey([{ length: 0, width: 0.625, thickness: 0 }, { length: 0, width: 0.625, thickness: 1.75 }]),
      segKey([{ length: 24, width: 0, thickness: 0 }, { length: 24, width: 0, thickness: 1.75 }]),
    ].sort());
  });
});

describe('bodyEdges tolerates near-coincident vertices (clip keeps a corner ~1e-9 off its plane)', () => {
  // A notch from the width min face whose floor sits at the slope's depth at station 12: the cell
  // corner (12, depth) lies exactly on, just above or just below the taper's plane. Above, clip keeps
  // the corner AND its crossing ~2e-9 away — a sliver edge with a noise direction.
  const notched = (depth: number) => leg({
    cuts: [{ id: 'n', face: 'width', from: 'min', across: 'thickness', offset: 12, width: 3, depth, stopMin: 0, stopMax: 0 }],
    angleCuts: [taper],
  });
  const exact = boardEdges(notched(0.3125)).map(segKey).sort();
  for (const delta of [2e-9, -2e-9, 5e-9]) {
    it(`draws the same edges with the floor ${delta} off the plane, and no specks`, () => {
      const segs = boardEdges(notched(0.3125 + delta));
      expect(segs.map(segKey).sort()).toEqual(exact);
      for (const [p, q] of segs) {
        expect(Math.hypot(p.length - q.length, p.width - q.width, p.thickness - q.thickness)).toBeGreaterThan(1e-6);
      }
    });
  }
});
