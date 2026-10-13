import { describe, expect, it } from 'vitest';
import { checkDesign, partMass, worldBodyFaces, worldBox } from './designCheck';
import { partGeometry } from './bodies';
import { createBoard, createDocument } from './document';
import type { Board, Posture, Rotation } from './document';
import { taperCut } from './angleCuts';
import { pocketCells } from './cuts';
import { designToDocument } from './generated';
import { flatDocument } from './tree';

// fu 302 / 303: overlap and the centre of mass read a TAPERED part's real solids; untapered parts keep their boxes.
type V = [number, number, number];
const part = (name: string, at: V, size: V, tapers: unknown[] = []) =>
  ({ name, role: '', material: 'oak', at: { x: at[0], y: at[1], z: at[2] }, size: { x: size[0], y: size[1], z: size[2] }, tapers });
const flat = (...parts: ReturnType<typeof part>[]) => flatDocument(designToDocument({ name: 'T', parts, assemblies: [] } as never, { centre: false }).doc);
const limits = { width: null, depth: null, height: null, maxParts: 20 };
const kinds = (k: string, ...parts: ReturnType<typeof part>[]) => checkDesign(flat(...parts), limits).filter((v) => v.kind === k);

// An upright leg 1.75 x 28 x 1.75 at the origin; its +x face tapers 3/4in toward the floor from 20in up.
const LEG = part('Leg', [0, 0, 0], [1.75, 28, 1.75], [{ faces: ['+x'], toward: '-y', start: 20, amount: 0.75 }]);

describe('overlap reads a tapered part\'s real solid (fu 302)', () => {
  it('a block in the space the taper removed is not an overlap', () => {
    // Inside the leg's BOX (x 1.25..1.75), outside its wood (the sloped face is at x <= 1.075 below y = 2).
    expect(kinds('overlap', LEG, part('Block', [1.25, 0, 0], [2, 2, 1.75]))).toEqual([]);
  });
  it('a real overlap with a tapered leg still reports, by the depth of the intersection', () => {
    const v = kinds('overlap', LEG, part('Block', [0.5, 0, 0], [2, 2, 1.75]));
    expect(v).toHaveLength(1);
    expect([...v[0]!.parts].sort()).toEqual(['Block', 'Leg']);
    // The intersection runs from x 0.5 to the sloped face at y = 2 (1.0 + 0.75 * 2/20 = 1.075): 0.575in along X.
    expect(v[0]!.message).toContain('0.575in');
    expect(v[0]!.message).toContain('along X');
  });
  it('an untapered pair reports exactly as before', () => {
    const plainLeg = part('Leg', [0, 0, 0], [1.75, 28, 1.75]);
    expect(kinds('overlap', plainLeg, part('Block', [1.25, 0, 0], [2, 2, 1.75])).map((v) => v.message))
      .toEqual(['Block passes 0.5in into Leg along X.']);
  });
});

describe('partMass: a tapered part\'s real volume and centre (fu 303)', () => {
  it('matches a hand-computed wedge', () => {
    // Full-length taper on the +x face toward the floor, removing 0.875 at y = 0: the x width runs 0.875 → 1.75.
    const b = flat(part('Wedge', [0, 0, 0], [1.75, 28, 1.75], [{ faces: ['+x'], toward: '-y', start: 28, amount: 0.875 }])).boards[0]!;
    const m = partMass(b);
    expect(m.v).toBeCloseTo(64.3125, 9);           // 1.75 * ∫ w dy = 1.75 * 36.75
    expect(m.c[0]).toBeCloseTo(0.6805555556, 9);   // ½ ∫ w² dy / ∫ w dy
    expect(m.c[1]).toBeCloseTo(15.5555555556, 9);  // ∫ y w dy / ∫ w dy
    expect(m.c[2]).toBeCloseTo(0.875, 9);
  });
  it('an untapered part is its box', () => {
    const b = flat(part('Box', [1, 0, 3], [2, 4, 6])).boards[0]!;
    expect(partMass(b)).toEqual({ v: 48, c: [2, 2, 6] });
  });
});

describe('the tip check weighs a tapered part by its real solid (fu 303)', () => {
  // A thin base on the floor and a tall post overhanging its +x edge by 2in.
  const base = part('Base', [0, 0, 0], [10, 0.5, 10]);
  const post = (tapers: unknown[]) => part('Post', [8, 0.5, 3], [4, 20, 4], tapers);
  it('a post tapered away from the edge no longer tips the piece (its box would)', () => {
    expect(kinds('tips', base, post([{ faces: ['+x'], toward: '+y', start: 20, amount: 3.5 }]))).toEqual([]);
  });
  it('the same post untapered still tips', () => {
    expect(kinds('tips', base, post([]))).toHaveLength(1);
  });
});

describe('the checks\' world bodies (review of fu 302/303)', () => {
  it('a box body maps exactly as worldBox in every posture and turn, normals outward', () => {
    for (const posture of ['flat', 'on-edge', 'upright'] as Posture[]) for (const rotation of [0, 90, 180, 270] as Rotation[]) {
      // The taper reaches 0.5in into the length, so the part has clipped bodies AND (on a notched part) box bodies.
      const b: Board = { ...createBoard({ name: 'P', length: 20, width: 3, thickness: 1.5, posture, rotation, position: [2, 1, 3],
        cuts: [{ id: 'n', face: 'thickness', from: 'max', across: 'width', offset: 8, width: 2, depth: 0.5, stopMin: 0, stopMax: 0 }] }),
        angleCuts: [{ id: 't', ...taperCut({ face: 'width', from: 'max', end: 'min', start: 0.5, amount: 0.25 }) }] };
      const bodies = partGeometry(b).bodies;
      const world = worldBodyFaces(b);
      let boxes = 0;
      bodies.forEach((body, i) => {
        const vs = world[i]!.flatMap((f) => f.verts);
        if (body.box) {
          boxes += 1;
          const w = worldBox(b, body.box);
          for (let k = 0; k < 3; k += 1) {
            expect(Math.min(...vs.map((v) => v[k]!))).toBeCloseTo(w.min[k]!, 12);
            expect(Math.max(...vs.map((v) => v[k]!))).toBeCloseTo(w.max[k]!, 12);
          }
        }
        // Outward: no vertex of the body lies outside any of its own faces.
        for (const f of world[i]!) for (const v of vs) {
          expect((v[0]! - f.verts[0]![0]!) * f.n[0] + (v[1]! - f.verts[0]![1]!) * f.n[1] + (v[2]! - f.verts[0]![2]!) * f.n[2]).toBeLessThan(1e-9);
        }
      });
      expect(boxes).toBeGreaterThan(0);
    }
  });
  it('a tapered part its cuts consumed weighs nothing, and does not poison the tip check', () => {
    const leg = (cuts: Board['cuts']): Board => ({ ...createBoard({ name: 'Ghost', length: 10, width: 1.5, thickness: 1.5, posture: 'upright', position: [3, 0, 3], cuts }),
      angleCuts: [{ id: 't', ...taperCut({ face: 'width', from: 'max', end: 'min', start: 5, amount: 0.25 }) }] });
    const all = [{ id: 'c', face: 'width' as const, from: 'max' as const, across: 'length' as const, offset: 0, width: 1.5, depth: 1.5, stopMin: 0, stopMax: 0 }];
    expect(pocketCells(leg(all))).toEqual([]);
    expect(partMass(leg(all)).v).toBe(0);
    const base = createBoard({ name: 'Base', length: 10, width: 10, thickness: 0.5, posture: 'flat', position: [0, 0, 0] });
    const tipsOf = (boards: Board[]) => checkDesign(flatDocument({ ...createDocument('T'), boards }), limits).filter((v) => v.kind === 'tips');
    // A heavy post overhanging the base's +x edge tips the piece; the empty part must not hide that (a NaN centre would).
    const post = createBoard({ name: 'Post', length: 20, width: 4, thickness: 4, posture: 'upright', position: [8, 0.5, 3] });
    expect(tipsOf([base, post])).toHaveLength(1);
    expect(tipsOf([base, post, leg(all)])).toEqual(tipsOf([base, post]));
  });
});
