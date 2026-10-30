// TEST-ONLY. The cam-and-bolt fixture: a 30 × 11.25 × 0.75 part carrying a cam (face bore, 15 mm) and its bolt (edge bore,
// 8 mm), two pairs. Never import a test module instead; never import this from production code.
import { createBoard } from './document';
import { mm } from './holes';
import type { Board, HoleRow } from './types';

export const CAM: HoleRow = {
  id: 'cam', face: 'thickness', from: 'max', diameter: mm(15), depth: mm(14.5), along: 'width',
  alongFrom: 'min', station: mm(37), count: 2, pitch: 11.25 - 2 * mm(37), acrossFrom: 'min', inset: mm(24),
};

export const BOLT: HoleRow = {
  id: 'bolt', face: 'length', from: 'min', diameter: mm(8), depth: mm(24), along: 'width',
  alongFrom: 'min', station: mm(37), count: 2, pitch: 11.25 - 2 * mm(37), acrossFrom: 'min', inset: 0.375,
};

export function camPart(over: Partial<Board> = {}): Board {
  return { ...createBoard({ id: 'p', length: 30, width: 11.25, thickness: 0.75 }), holes: [{ ...CAM }, { ...BOLT }], ...over };
}
