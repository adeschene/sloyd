import { createBoard } from './document';
import type { Board, Posture, Rotation } from './document';
import { boardExtents } from './geometry';

/**
 * A part whose cuts have a HAND: a stopped dado stopped at one end only, and
 * an off-centre mortise stopped unequally, and a stopped rabbet that takes
 * one box corner. A mirror of it is a different part,
 * so a reflection anywhere in the part↔world mapping shows up. Used only by
 * tests (quarter-turns plan, Tasks 2-4).
 */
export function chiralPart(posture: Posture): Board {
  return createBoard({
    name: 'Chiral', length: 20, width: 6, thickness: 1.5, posture,
    cuts: [
      { id: 'c1', face: 'thickness', from: 'max', across: 'width', offset: 4, width: 0.75, depth: 0.5, stopMin: 0, stopMax: 1.5 },
      { id: 'c2', face: 'width', from: 'min', across: 'length', offset: 0.375, width: 0.5, depth: 1, stopMin: 2, stopMax: 12 },
      // A stopped rabbet flush at width 0, running out at length 0 only: it
      // removes a box corner, so boardSnapPoints' filter withholds lattice
      // points and its equivariance test has something to see.
      { id: 'c3', face: 'thickness', from: 'max', across: 'length', offset: 0, width: 1, depth: 0.5, stopMin: 0, stopMax: 5 },
    ],
  });
}

export function turnedAbout(board: Board, rotation: Rotation, centre: [number, number, number]): Board {
  const b = { ...board, rotation };
  const e = boardExtents(b);
  return { ...b, position: [centre[0] - e[0] / 2, centre[1], centre[2] - e[2] / 2] };
}

export function rotateQuarter(p: [number, number, number], c: [number, number, number]): [number, number, number] {
  return [c[0] + (p[2] - c[2]), p[1], c[2] - (p[0] - c[0])];
}

const key = (p: number[]) => p.map((v) => Math.round(v * 1e9)).join(',');
export function sameSet(a: number[][], b: number[][]): boolean {
  if (a.length !== b.length) return false;
  const ka = a.map(key).sort();
  const kb = b.map(key).sort();
  return ka.every((k, i) => k === kb[i]);
}

/**
 * chiralPart plus angle cuts with a HAND (angle-cuts spec 8): a taper that
 * starts off-centre on one face and a miter at one end only. A reflection
 * anywhere in the angle-cut mapping shows up as different world vertices.
 */
export function chiralAngled(posture: Posture): Board {
  return {
    ...chiralPart(posture),
    angleCuts: [
      { id: 'a1', kind: 'taper', face: 'width', from: 'min', along: 'length', alongFrom: 'min', points: [[0, 1.25], [14, 0]] },
      { id: 'a2', kind: 'miter', face: 'length', from: 'max', along: 'thickness', alongFrom: 'min', points: [[0, 0], [1.5, 1.5]] },
    ],
  };
}

/**
 * chiralPart plus hole rows with a HAND (holes spec §8): a row off-centre on one face measured from the min end, and a
 * single bore into one end, off-centre across. A reflection anywhere in the hole mapping shows up as different world
 * centres.
 */
export function chiralHoled(posture: Posture): Board {
  return {
    ...chiralPart(posture),
    holes: [
      { id: 'h1', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.375, along: 'length', alongFrom: 'min', station: 7, count: 3, pitch: 1.5, acrossFrom: 'min', inset: 4.5 },
      { id: 'h2', face: 'length', from: 'max', diameter: 0.375, depth: 1, along: 'width', alongFrom: 'min', station: 4.25, count: 1, pitch: 0, acrossFrom: 'max', inset: 0.5 },
    ],
  };
}
