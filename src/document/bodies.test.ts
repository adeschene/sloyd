import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import type { AngleCut, Board, Cut, CurveCut } from './types';
import { splitBodiesForTest } from './bodies';
import { ARCH, CORNER } from './curveFixtures';
import { bowCurve, curveOutline, curvePlan } from './curves';
import { geometryKey, boardBodies, boardEdges, bodyEdges, bodyVerts, bodyVolume, partGeometry, PART_GEOMETRY_LIMIT } from './bodies';
import { pocketCells, pocketEdges } from './cuts';
import type { Segment } from './cuts';
import { chiralAngled, chiralPart } from './turnFixtures';

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

describe('partGeometry — the shared cache of bodies and edges', () => {
  const base = (): Board => ({ ...chiralAngled('flat'), id: 'p1', position: [1, 2, 3], rotation: 0 });

  it('computes what boardBodies and boardEdges compute', () => {
    const b = base();
    const g = partGeometry(b);
    expect(g.bodies).toEqual(boardBodies(b));
    expect(g.edges).toEqual(boardEdges(b));
    const plain = leg({ cuts: [{ id: 'c1', face: 'thickness', from: 'max', across: 'width', offset: 4, width: 0.75, depth: 0.5, stopMin: 0, stopMax: 0 }] });
    expect(partGeometry(plain).edges).toEqual(pocketEdges(plain));
  });

  it('returns the same object for the same geometry in another pose, part, name or material', () => {
    const g = partGeometry(base());
    for (const over of [
      { position: [40, -3, 7] as [number, number, number] }, { rotation: 90 as const }, { rotation: 270 as const },
      { posture: 'upright' as const }, { posture: 'on-edge' as const }, { id: 'other', name: 'Other' },
      { material: 'walnut' as const }, { grain: 'width' as const },
    ]) {
      expect(partGeometry({ ...base(), ...over })).toBe(g);
    }
  });

  it('recomputes after any dimension, cut or angle-cut change', () => {
    const b = base();
    const g = partGeometry(b);
    const changed: Board[] = [
      { ...b, length: 21 }, { ...b, width: 5 }, { ...b, thickness: 1.25 },
      { ...b, cuts: b.cuts.map((c, i) => (i === 0 ? { ...c, offset: c.offset + 0.25 } : c)) },
      { ...b, cuts: b.cuts.map((c, i) => (i === 0 ? { ...c, from: 'min' as const } : c)) },
      { ...b, cuts: b.cuts.map((c, i) => (i === 1 ? { ...c, stopMax: c.stopMax + 1 } : c)) },
      { ...b, cuts: b.cuts.slice(1) },
      { ...b, angleCuts: b.angleCuts.map((c, i) => (i === 0 ? { ...c, points: [[0, 1], [14, 0]] as AngleCut['points'] } : c)) },
      { ...b, angleCuts: b.angleCuts.map((c, i) => (i === 0 ? { ...c, from: 'max' as const } : c)) },
      { ...b, angleCuts: b.angleCuts.slice(0, 1) },
    ];
    for (const c of changed) {
      const h = partGeometry(c);
      expect(h).not.toBe(g);
      expect(h.bodies).toEqual(boardBodies(c));
    }
  });

  it('keys on the angle cut\'s id: a sloped face names THIS part\'s cut', () => {
    const b = base();
    partGeometry(b);
    const renamed: Board = { ...b, angleCuts: b.angleCuts.map((c) => ({ ...c, id: `${c.id}-x` })) };
    const ids = new Set(partGeometry(renamed).bodies.flatMap((body) => body.faces.flatMap((f) => (f.cut ? [f.cut] : []))));
    expect([...ids].sort()).toEqual(['a1-x', 'a2-x']);
  });

  it('is frozen all the way down: shared between parts, never mutated', () => {
    const g = partGeometry(base());
    expect(Object.isFrozen(g.bodies)).toBe(true);
    expect(Object.isFrozen(g.bodies[0]!.faces[0]!.verts[0])).toBe(true);
    expect(Object.isFrozen(g.edges)).toBe(true);
    expect(Object.isFrozen(g.edges[0]![0])).toBe(true);
  });

  it(`keeps at most ${PART_GEOMETRY_LIMIT} entries, evicting the least recently used`, () => {
    const at = (k: number) => leg({ length: 100 + k });
    const first = partGeometry(at(0));
    const second = partGeometry(at(1));
    for (let k = 2; k < PART_GEOMETRY_LIMIT; k += 1) partGeometry(at(k));
    expect(partGeometry(at(0))).toBe(first); // a hit: the oldest becomes the most recent
    partGeometry(at(PART_GEOMETRY_LIMIT)); // one past the limit: evicts the least recent, now at(1)
    expect(partGeometry(at(0))).toBe(first);
    expect(partGeometry(at(1))).not.toBe(second);
  });
});

describe('partGeometry and holes (holes spec §3.1)', () => {
  const row = { id: 'h1', face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.375, along: 'length' as const, alongFrom: 'min' as const, station: 2, count: 3, pitch: 1.25, acrossFrom: 'min' as const, inset: 1.5 };
  it('a row changes the key; its id is in it', () => {
    const b = createBoard({ length: 30, width: 11.25, thickness: 0.75 });
    expect(geometryKey({ ...b, holes: [row] })).not.toBe(geometryKey(b));
    expect(geometryKey({ ...b, holes: [{ ...row, id: 'h2' }] })).not.toBe(geometryKey({ ...b, holes: [row] }));
    expect(geometryKey({ ...b, holes: [{ ...row, pitch: 1.3 }] })).not.toBe(geometryKey({ ...b, holes: [row] }));
  });
  it('carries the instances; bodies are unchanged (hole-free, inv 50)', () => {
    const b = createBoard({ length: 30, width: 11.25, thickness: 0.75 });
    const g = partGeometry({ ...b, holes: [row] });
    expect(g.holes).toHaveLength(3);
    expect(Object.isFrozen(g.holes)).toBe(true);
    expect(g.bodies).toEqual(boardBodies(b));
  });
});

/** The exact area of an arc's segment (between chord and arc): R²·acos((R−h)/R) − (R−h)·√(2Rh − h²). */
const segmentArea = (R: number, h: number) => R * R * Math.acos((R - h) / R) - (R - h) * Math.sqrt(2 * R * h - h * h);

describe('boardBodies with curves (curves spec §3.2)', () => {
  const splitVolumeForTest = (b: Board, c: CurveCut) => splitBodiesForTest(b, c).reduce((s, x) => s + bodyVolume(x), 0);
  const apron = createBoard({ length: 30, width: 5, thickness: 0.75 });
  const top = createBoard({ length: 36, width: 20, thickness: 0.75 });
  const vol = (b: Board) => boardBodies(b).reduce((s, x) => s + bodyVolume(x), 0);

  it('an arch SPLITS: the volume is the box minus the true segment, within the chord tolerance', () => {
    const v = vol({ ...apron, curves: [ARCH] });
    const exact = (30 * 5 - segmentArea(48.75, 1.5)) * 0.75;
    const arcLength = 48.75 * 2 * Math.asin(12 / 48.75);
    expect(v).toBeGreaterThanOrEqual(exact - 1e-9);                     // inscribed chords leave MORE wood
    expect(v - exact).toBeLessThanOrEqual(0.005 * arcLength * 0.75);
    expect(boardBodies({ ...apron, curves: [ARCH] }).length).toBeGreaterThan(1);
  });
  it('a rounded corner CLIPS: one body, volume the box minus (r² − πr²/4), within the tolerance', () => {
    const bodies = boardBodies({ ...top, curves: [CORNER] });
    expect(bodies).toHaveLength(1);
    const exact = (36 * 20 - (4 - Math.PI)) * 0.75;
    expect(Math.abs(bodyVolume(bodies[0]!) - exact)).toBeLessThanOrEqual(0.005 * Math.PI * 0.75 + 1e-9);
    expect(bodies[0]!.box).toBeNull();
    // Every chord plane caps the one body, named by the curve (bodyMesh's smooth normals read it).
    const chords = curveOutline(top, CORNER).arcEdge.filter(Boolean).length;
    expect(bodies[0]!.faces.filter((f) => f.curve === 'c2')).toHaveLength(chords);
  });
  it('both paths give the same wood where both apply (a bow, forced down the split path)', () => {
    const bow = { id: 'w', ...bowCurve({ through: 'thickness', along: 'length', side: 'min', span: 30, rise: 0.5 }) };
    const b = { ...apron, curves: [bow] };
    const clipped = vol(b);
    const plan = curvePlan(b, bow)!;
    expect(plan.clip).toBe(true);
    expect(Math.abs(clipped - splitVolumeForTest(b, bow))).toBeLessThan(1e-9);
  });
  it('faces on an arc chord carry the curve id; a body no curve touches keeps its box', () => {
    const b = { ...apron, cuts: [{ id: 't', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 0.5, width: 1, depth: 0.25, stopMin: 0, stopMax: 0 }], curves: [ARCH] };
    const bodies = boardBodies(b);
    expect(bodies.some((x) => x.faces.some((f) => f.curve === 'c1'))).toBe(true);
    expect(bodies.some((x) => x.box !== null)).toBe(true);              // the cells around the dado at the far end
  });
  it('two arcs bowing into the waste that meet in a reflex WOOD corner split (the wood there is not convex)', () => {
    const k: CurveCut = { id: 'k', through: 'thickness', uFrom: 'min', vFrom: 'min', start: [0, 0], segments: [
      { type: 'line', to: [2, 0] }, { type: 'arc', to: [1.3, 1.3], side: 'left', rise: 0.2 },
      { type: 'arc', to: [0, 2], side: 'left', rise: 0.2 }, { type: 'line', to: [0, 0] }] };
    const b = { ...top, curves: [k] };
    expect(curvePlan(b, k)!.clip).toBe(false);
    expect(Math.abs(vol(b) - splitVolumeForTest(b, k))).toBeLessThan(1e-9);
  });
  it('two arc runs separated by boundary sides split (each keeps its own corner; their half-planes together keep nothing)', () => {
    const k: CurveCut = { id: 'k', through: 'thickness', uFrom: 'min', vFrom: 'min', start: [0, 0], segments: [
      { type: 'line', to: [10, 0] }, { type: 'line', to: [10, 3] }, { type: 'arc', to: [7, 10], side: 'left', rise: 1 },
      { type: 'line', to: [3, 10] }, { type: 'arc', to: [0, 3], side: 'left', rise: 1 }, { type: 'line', to: [0, 0] }] };
    const b = { ...createBoard({ length: 10, width: 10, thickness: 1 }), curves: [k] };
    expect(curvePlan(b, k)!.clip).toBe(false);
    expect(vol(b)).toBeGreaterThan(1);
    expect(Math.abs(vol(b) - splitVolumeForTest(b, k))).toBeLessThan(1e-9);
  });
  it('two arcs meeting ON the boundary in a convex waste corner split', () => {
    // One arc run, but its two arcs meet ON the top edge at (5, 10), where the waste's corner is convex: the wood is the two
    // top corners, apart. The guard checks an arc–arc junction even on the boundary.
    const k: CurveCut = { id: 'k', through: 'thickness', uFrom: 'min', vFrom: 'min', start: [0, 0], segments: [
      { type: 'line', to: [10, 0] }, { type: 'line', to: [10, 3] }, { type: 'arc', to: [5, 10], side: 'left', rise: 0.5 },
      { type: 'arc', to: [0, 3], side: 'left', rise: 0.5 }, { type: 'line', to: [0, 0] }] };
    const b = { ...createBoard({ length: 10, width: 10, thickness: 1 }), curves: [k] };
    expect(curvePlan(b, k)!.clip).toBe(false);
    expect(Math.abs(vol(b) - splitVolumeForTest(b, k))).toBeLessThan(1e-9);
  });
  it('a cell the waste only TOUCHES (its wall through the crown vertex) keeps its wood once', () => {
    // ARCH's 18 chords put a vertex at the crown (15, 1.5). A groove over v ∈ [0.5, 1.5] in the top quarter leaves a cell
    // above it starting at v = 1.5: it meets the piece only at the crown, so no piece plane has it wholly outside — it goes
    // through the split loop, and must come out once (all of its wood, exactly), not once per later plane.
    expect(curveOutline(apron, ARCH).pts).toContainEqual([expect.closeTo(15, 12), expect.closeTo(1.5, 12)]);
    const groove: Cut = { id: 'g', face: 'thickness', from: 'max', across: 'length', offset: 0.5, width: 1, depth: 0.25, stopMin: 0, stopMax: 0 };
    const bodies = boardBodies({ ...apron, cuts: [groove], curves: [ARCH] });
    const above = bodies.filter((x) => bodyVerts(x).every((p) => p[1] >= 1.5 - 1e-9 && p[2] >= 0.5 - 1e-9));
    near(above.reduce((s, x) => s + bodyVolume(x), 0), 30 * 3.5 * 0.25);
  });
  it('a part with no curves is byte-for-byte unchanged', () => {
    expect(boardBodies({ ...apron, curves: [] })).toEqual(boardBodies(apron));
  });
  it('geometryKey carries each curve\'s id and values', () => {
    expect(geometryKey({ ...apron, curves: [ARCH] })).not.toBe(geometryKey(apron));
    expect(geometryKey({ ...apron, curves: [{ ...ARCH, id: 'zz' }] })).not.toBe(geometryKey({ ...apron, curves: [ARCH] }));
    expect(geometryKey({ ...apron, curves: [{ ...ARCH, start: [3.5, 0] }] })).not.toBe(geometryKey({ ...apron, curves: [ARCH] }));
  });
});
