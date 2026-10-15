import { createHash } from 'node:crypto';
import { createBoard, defaultHingeCup, defaultShelfPinRow } from './document';
import { drawView, FRONT, SIDE, TOP, ISO } from './drawing';
import { chiralAngled } from './turnFixtures';

/** Parts WITHOUT curves draw byte-for-byte what they drew before curves chunk 2 (spec §5.1): a holed, a dadoed and an
 *  angled part in one scene, every sheet view, hashed on master 54ea740. They must not move. */
const sha = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const dado = { id: 'c1', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 10, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
const side = createBoard({ id: 'side', length: 30, width: 11.25, thickness: 0.75, cuts: [dado] });
const sidePins = { ...side, holes: [{ id: 'r1', ...defaultShelfPinRow(side)! }] };
const door = createBoard({ id: 'door', length: 24, width: 15, thickness: 0.75, position: [0, 0, 12] });
const doorCup = { ...door, holes: [{ id: 'h1', ...defaultHingeCup(door) }] };
const angled = { ...chiralAngled('upright'), id: 'ang', position: [40, 0, 0] as [number, number, number] };
const scene = [sidePins, doorCup, angled];

describe('drawView of parts without curves is unchanged (byte-for-byte)', () => {
  it.each([
    [FRONT, 'f5d35b9cbb6a504743f6a1ff74ea72c1f3ba1edd89d37d5c867505670fc92545'],
    [SIDE, 'e66ce2a4c2e9b1ef6e62e81c3a2c7460e0d4829af2d7915f3cc82b8013562191'],
    [TOP, 'a69502032b83e3680b13927be187e55d02b92f62c4179367ec8e5a0617318583'],
    [ISO, '9192f4759448270933c830bc06b0b859ba705c6eaa97d3a91ec351506ffda228'],
  ])('%#: %o', (view, hash) => {
    expect(sha(drawView(scene, view))).toBe(hash);
  });
});
