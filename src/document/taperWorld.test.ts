import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import type { Board, Posture, Rotation } from './document';
import { taperCut } from './angleCuts';
import { axisDimensions, toWorldOffset } from './geometry';
import { DIRS, dirToLocal, isStandardTaper, localToDir, taperCutsFor, worldTapers } from './taperWorld';
import type { WorldTaper } from './taperWorld';

const POSTURES: Posture[] = ['flat', 'on-edge', 'upright'];
const TURNS: Rotation[] = [0, 90, 180, 270];
const poses = (size: Partial<Board>) => POSTURES.flatMap((posture) => TURNS.map((rotation) => createBoard({ ...size, posture, rotation })));

describe('dirToLocal / localToDir (invariant 44)', () => {
  for (const b of [...poses({ length: 20, width: 3, thickness: 1.5 }), ...poses({ length: 28, width: 1.75, thickness: 1.75 })]) {
    it(`${b.posture} ${b.rotation} ${b.width}x${b.thickness}: every world face maps to the stored face that lies there`, () => {
      for (const d of DIRS) {
        const { dim, from } = dirToLocal(b, d);
        expect(localToDir(b, dim, from)).toBe(d);
        // The meaning, not just the involution: the local face `from` sits at the world side `d` names.
        const axis = 'xyz'.indexOf(d[1]!);
        expect(axisDimensions(b)[axis]).toBe(dim);
        const w = toWorldOffset(b, axis, from === 'min' ? 0 : b[dim]);
        expect(w).toBe(d[0] === '-' ? 0 : b[dim]);
      }
    });
  }
});

const leg = () => createBoard({ name: 'Leg', length: 28, width: 1.75, thickness: 1.75, posture: 'upright', rotation: 0 });
const lengthAxisDir = (b: Board, sign: '-' | '+') => `${sign}${'xyz'[axisDimensions(b).indexOf('length')]}` as WorldTaper['toward'];

describe('taperCutsFor', () => {
  it('writes one taperCut per face, in canonical order, whatever order the faces came in', () => {
    const b = leg();
    const a = taperCutsFor(b, [{ faces: ['+z', '+x'], toward: '-y', start: 22, amount: 0.5 }]);
    const c = taperCutsFor(b, [{ faces: ['+x', '+z'], toward: '-y', start: 22, amount: 0.5 }]);
    expect(a).toEqual(c);
    if (!('cuts' in a)) throw new Error(a.fault);
    expect(a.cuts).toHaveLength(2);
    for (const cut of a.cuts) {
      expect(cut).toEqual(taperCut({ face: cut.face as 'width' | 'thickness', from: cut.from, end: dirToLocal(b, '-y').from, start: 22, amount: 0.5 }));
    }
  });
  it('refuses a taper not along the length', () => {
    expect('fault' in taperCutsFor(leg(), [{ faces: ['+z'], toward: '-x', start: 1, amount: 0.25 }])).toBe(true);
  });
  it('refuses no faces, five faces, a repeated face, and an end face', () => {
    const b = leg();
    const t = (faces: WorldTaper['faces']) => taperCutsFor(b, [{ faces, toward: '-y', start: 20, amount: 0.25 }]);
    expect('fault' in t([])).toBe(true);
    expect('fault' in t(['+x', '-x', '+z', '-z', '+x'])).toBe(true);
    expect('fault' in t(['+x', '+x'])).toBe(true);
    expect('fault' in t(['+y'])).toBe(true);
    expect('fault' in t(['-y'])).toBe(true);
    expect('cuts' in t(['+x', '-x', '+z', '-z'])).toBe(true);
  });
  it('refuses a start outside (0, length] and an amount not above 0', () => {
    const b = leg();
    const t = (start: number, amount: number) => taperCutsFor(b, [{ faces: ['+x'], toward: '-y', start, amount }]);
    expect('fault' in t(0, 0.25)).toBe(true);
    expect('fault' in t(28.0625, 0.25)).toBe(true);
    expect('cuts' in t(28, 0.25)).toBe(true);
    expect('fault' in t(20, 0)).toBe(true);
    expect('fault' in t(20, -0.25)).toBe(true);
  });
  it('refuses tapers that leave no wood at an end, alone or with the opposite face', () => {
    const b = leg();
    expect('fault' in taperCutsFor(b, [{ faces: ['+x'], toward: '-y', start: 20, amount: 1.75 }])).toBe(true);
    expect('cuts' in taperCutsFor(b, [{ faces: ['+x'], toward: '-y', start: 20, amount: 1.6875 }])).toBe(true);
    expect('fault' in taperCutsFor(b, [{ faces: ['+x', '-x'], toward: '-y', start: 20, amount: 0.875 }])).toBe(true);
    expect('cuts' in taperCutsFor(b, [{ faces: ['+x', '-x'], toward: '-y', start: 20, amount: 0.8125 }])).toBe(true);
    // Opposite faces tapered toward OPPOSITE ends never stack at one end.
    expect('cuts' in taperCutsFor(b, [
      { faces: ['+x'], toward: '-y', start: 10, amount: 1 }, { faces: ['-x'], toward: '+y', start: 10, amount: 1 },
    ])).toBe(true);
  });
});

describe('worldTapers', () => {
  const withCuts = (b: Board, t: WorldTaper[]) => {
    const r = taperCutsFor(b, t);
    if (!('cuts' in r)) throw new Error(r.fault);
    return { ...b, angleCuts: r.cuts.map((c, i) => ({ id: `a${i}`, ...c })) };
  };
  it('reads back what taperCutsFor wrote, faces merged and in DIRS order, in every pose', () => {
    for (const b of poses({ length: 20, width: 3, thickness: 1.5 })) {
      const toward = lengthAxisDir(b, '-');
      const sides = DIRS.filter((d) => d[1] !== toward[1]);
      const t: WorldTaper[] = [{ faces: [sides[2]!, sides[0]!], toward, start: 12, amount: 0.5 }, { faces: [sides[1]!], toward, start: 12, amount: 0.25 }];
      expect(worldTapers(withCuts(b, t))).toEqual([
        { faces: [sides[0]!, sides[2]!], toward, start: 12, amount: 0.5 },
        { faces: [sides[1]!], toward, start: 12, amount: 0.25 },
      ].sort((x, y) => x.amount - y.amount));
    }
  });
  it('is exact for a float-hostile number (spec §5.1: no zeroStation)', () => {
    const b = withCuts(leg(), [{ faces: ['+x'], toward: '-y', start: 13.7, amount: 0.1 }]);
    expect(worldTapers(b)).toEqual([{ faces: ['+x'], toward: '-y', start: 13.7, amount: 0.1 }]);
  });
  it('returns [] for an untapered part and null for a taper not in standard form', () => {
    expect(worldTapers(leg())).toEqual([]);
    const odd = { ...leg(), angleCuts: [{ id: 'a', kind: 'taper' as const, face: 'width' as const, from: 'min' as const, along: 'length' as const, alongFrom: 'min' as const, points: [[0, 0], [20, 0.5]] as [[number, number], [number, number]] }] };
    expect(isStandardTaper(odd.angleCuts[0]!)).toBe(false);
    expect(worldTapers(odd)).toBeNull();
  });
});
