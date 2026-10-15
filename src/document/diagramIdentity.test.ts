import { createHash } from 'node:crypto';
import { createBoard, defaultHingeCup, defaultShelfPinRow } from './document';
import { buildDiagrams } from './diagram';
import { chiralAngled } from './turnFixtures';
import { IMPERIAL } from '../units/length';

/** Parts WITHOUT curves build the diagrams they built before curves chunk 2 (spec §5.2), hashed on master 54ea740 with
 *  the chunk's three new (empty) lists set aside — JSON key order of the rest is unchanged. */
const sha = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const dado = { id: 'c1', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 10, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
const side = createBoard({ id: 'side', length: 30, width: 11.25, thickness: 0.75, cuts: [dado] });
const sidePins = { ...side, holes: [{ id: 'r1', ...defaultShelfPinRow(side)! }] };
const door = createBoard({ id: 'door', length: 24, width: 15, thickness: 0.75, position: [0, 0, 12] });
const doorCup = { ...door, holes: [{ id: 'h1', ...defaultHingeCup(door) }] };
const angled = { ...chiralAngled('upright'), id: 'ang', position: [40, 0, 0] as [number, number, number] };

it('buildDiagrams of parts without curves is unchanged (byte-for-byte)', () => {
  const views = [sidePins, doorCup, angled].map((b) => buildDiagrams(b, IMPERIAL).map((v) => {
    const { curves, curveLines, curveNotes, ...rest } = v as typeof v & { curves?: unknown[]; curveLines?: unknown[]; curveNotes?: unknown[] };
    for (const list of [curves, curveLines, curveNotes]) expect(list ?? []).toEqual([]);
    return rest;
  }));
  expect(sha(views)).toBe('4c787da06364616a4b71a0f3a72c26dd4c7a4b007132f09611be2c8db72f38bc');
});
