import { IMPERIAL } from '../units/length';
import { createBoard } from './document';
import { packOnto } from './nesting';

const part = (id: string, length: number, width: number) => createBoard({ id, name: id, length, width, thickness: 0.75 });
// Sizes in list order: C 72×5½, B 96×7¼, A 96×5½.
const C = { id: 'C', length: 72, width: 5.5 };
const B = { id: 'B', length: 96, width: 7.25 };
const A = { id: 'A', length: 96, width: 5.5 };

describe('packOnto', () => {
  it('opens the largest size that holds the next part — by length, then width', () => {
    // Two 40×5 parts: 40 + ⅛ + 40 = 80⅛ fits one 96" board. Largest: length 96 (A, B) then width 7¼ → B.
    const r = packOnto([part('p', 40, 5), part('q', 40, 5)], [C, B, A], 0.125, IMPERIAL);
    expect(r.bins.map((b) => [b.bin.id, b.parts.map((p) => p.boardId)])).toEqual([['B', ['p', 'q']]]);
    expect(r.unplaceable).toEqual([]);
  });

  it('keeps grain along the board: a part longer than every size is unplaceable, never turned', () => {
    // 100 × 3: would fit across a 96 × 7¼ board only if turned; grain forbids it.
    const r = packOnto([part('long', 100, 3), part('ok', 30, 3)], [C, B, A], 0.125, IMPERIAL);
    expect(r.unplaceable.map((b) => b.id)).toEqual(['long']);
    expect(r.bins.flatMap((b) => b.parts.map((p) => p.turned))).toEqual([false]);
  });

  it('fills open boards before opening another', () => {
    // 60 then 30 (sorted by width desc, then length desc): 60 opens B; 30 fits beside it (60 + ⅛ + 30 = 90⅛).
    const r = packOnto([part('s', 30, 5), part('l', 60, 5)], [C, B, A], 0.125, IMPERIAL);
    expect(r.bins).toHaveLength(1);
  });
});
