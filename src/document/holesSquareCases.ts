import type { Board, HoleRow } from './types';

/** Square-row cases whose geometry `holesSquare.snapshot.json` holds, captured from the code before angled holes (Task 2):
 *  one blind and one through row in two postures. TEST-ONLY. */
export const SQUARE_CASES: { name: string; board: Partial<Board>; row: HoleRow }[] = [
  {
    name: 'blind, broad face from max',
    board: { length: 30, width: 11.25, thickness: 0.75 },
    row: { id: 'h1', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.375, along: 'length', alongFrom: 'min', station: 2, count: 3, pitch: 32 / 25.4, acrossFrom: 'min', inset: 1.5 },
  },
  {
    name: 'through, broad face from max',
    board: { length: 30, width: 11.25, thickness: 0.75 },
    row: { id: 'h2', face: 'thickness', from: 'max', diameter: 0.3125, depth: 'through', along: 'width', alongFrom: 'max', station: 3, count: 2, pitch: 1.25, acrossFrom: 'max', inset: 4.2 },
  },
  {
    name: 'blind, end face from min',
    board: { length: 18, width: 2.5, thickness: 1.75 },
    row: { id: 'h3', face: 'length', from: 'min', diameter: 0.375, depth: 1.5, along: 'width', alongFrom: 'min', station: 1.25, count: 1, pitch: 0, acrossFrom: 'max', inset: 0.8 },
  },
  {
    name: 'through, edge face from min',
    board: { length: 18, width: 2.5, thickness: 1.75 },
    row: { id: 'h4', face: 'width', from: 'min', diameter: 0.5, depth: 'through', along: 'thickness', alongFrom: 'max', station: 0.875, count: 2, pitch: 6, acrossFrom: 'min', inset: 3.3 },
  },
];
