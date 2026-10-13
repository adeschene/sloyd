import { createBoard, createDocument, worldParts } from '../document/document';
import type { SloydDocument } from '../document/document';
import type { Vec3 } from '../document/frames';
import { FRONT, ISO, SIDE, TOP } from '../document/drawing';
import { explodeOffsets } from '../document/explode';
import {
  STANDARD_VIEWS, TOP_TILT, orthoDistance, orthoZoom, perspectiveDistance, subsetBounds, viewDirection,
} from './framing';
import type { StandardView } from './framing';

const cube = (id: string, position: Vec3, size = 2) =>
  createBoard({ id, name: id, length: size, width: size, thickness: size, position });
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v: Vec3): Vec3 => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; };
const expectVec = (got: Vec3, want: Vec3, digits = 12) => want.forEach((w, k) => expect(got[k]).toBeCloseTo(w, digits));

describe('the standard views are the Plans sheet views', () => {
  it('maps each button to the sheet constant of the same name', () => {
    expect(STANDARD_VIEWS).toEqual({ front: FRONT, side: SIDE, top: TOP, iso: ISO });
  });

  // The camera's up stays +Y (spec §2.2), so lookAt gives screen right = unit(Y × toward) and
  // screen up = unit(toward × right). Computed HERE from the direction, never read from the module.
  it.each<StandardView>(['front', 'side', 'top', 'iso'])('%s: camera direction and screen axes match the sheet', (v) => {
    const sheet = { front: FRONT, side: SIDE, top: TOP, iso: ISO }[v]; // the sheet itself, not the module's table
    const d = viewDirection(v);
    expect(Math.hypot(...d)).toBeCloseTo(1, 12);
    const right = unit(cross([0, 1, 0], d));
    const up = unit(cross(d, right));
    const digits = v === 'top' ? 3 : 12; // Top is off its axis by TOP_TILT
    expectVec(d, sheet.toward, digits);
    expectVec(right, sheet.right, digits);
    expectVec(up, sheet.up, digits);
  });

  it('tilts Top toward +Z by TOP_TILT, so screen right is +X, not undefined', () => {
    const d = viewDirection('top');
    expect(Math.atan2(d[2], d[1])).toBeCloseTo(TOP_TILT, 12);
    expect(d[0]).toBe(0);
  });
});

describe('subsetBounds', () => {
  it('is null for an empty subset', () => {
    expect(subsetBounds([])).toBeNull();
  });

  it('boxes the parts: two 2in cubes at x 0 and x 10 → centre (6,1,1), radius max(|(12,2,2)|/2, 1)', () => {
    const b = subsetBounds([cube('a', [0, 0, 0]), cube('b', [10, 0, 0])])!;
    expectVec(b.center, [6, 1, 1]);
    expect(b.radius).toBeCloseTo(Math.sqrt(144 + 4 + 4) / 2, 12);
  });

  it('floors the radius at 1in', () => {
    expect(subsetBounds([cube('a', [0, 0, 0], 0.5)])!.radius).toBe(1);
  });

  it('fu 260: boxes the parts where they are DRAWN when offsets are given', () => {
    const parts = [cube('a', [0, 0, 0]), cube('b', [10, 0, 0])];
    const offsets = new Map<string, Vec3>([['b', [5, 0, 3]]]);
    const b = subsetBounds(parts, offsets)!;
    // a: x 0..2, z 0..2; b drawn at x 15..17, z 3..5 → x 0..17, y 0..2, z 0..5
    expectVec(b.center, [8.5, 1, 2.5]);
    expect(b.radius).toBeCloseTo(Math.sqrt(17 * 17 + 2 * 2 + 5 * 5) / 2, 12);
    expect(subsetBounds(parts, null)).toEqual(subsetBounds(parts));
  });

  it('fu 260: explodeOffsets keys every world part by the id worldParts gives it', () => {
    const doc: SloydDocument = {
      ...createDocument('Explode'),
      boards: [cube('r', [10, 0, 0])],
      instances: [{ id: 'i', name: 'Box', definition: 'd', position: [0, 0, 0], rotation: 0 }],
      definitions: [{ id: 'd', boards: [cube('p', [0, 0, 0]), cube('q', [4, 0, 0])], instances: [] }],
    };
    const parts = worldParts(doc);
    const offsets = explodeOffsets(doc, 1);
    for (const p of parts) expect(offsets.has(p.id)).toBe(true);
    expect(subsetBounds(parts, offsets)).not.toEqual(subsetBounds(parts));
  });
});

describe('camera distance and zoom (today\'s formulas, hand values)', () => {
  it('orthographic: zoom = min(w, h) / (2.3 r); distance = 4r + 100', () => {
    expect(orthoZoom(10, 800, 460)).toBeCloseTo(460 / 23, 12);
    expect(orthoDistance(10)).toBe(140);
  });

  it('perspective: the larger of the vertical and horizontal fits, × 1.15', () => {
    // fov 90°, aspect 1: both half-angles 45°, so r / sin 45° = r·√2; × 1.15
    expect(perspectiveDistance(10, 90, 1)).toBeCloseTo(10 * Math.SQRT2 * 1.15, 9);
    // aspect 0.5 (tall): hfov = 2·atan(tan 45° · 0.5) = 2·atan(0.5); sin(atan 0.5) = 1/√5 → r·√5 wins
    expect(perspectiveDistance(10, 90, 0.5)).toBeCloseTo(10 * Math.sqrt(5) * 1.15, 9);
  });
});
