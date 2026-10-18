import { createHash } from 'node:crypto';
import { createBoard, defaultHingeCup, defaultShelfPinRow } from './document';
import { drawView, FRONT, SIDE, TOP, ISO, type Seg2 } from './drawing';
import { chiralAngled } from './turnFixtures';
import { cornerCurve } from './curves';
import { canonicalRun, geometryBoard, shapedPart, sweptProfiles } from './profiles';
import type { Section } from './section';

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
    // Feature callouts (spec §4.1) only TAG segments: with the tags removed, the drawing is still master's, byte for byte.
    const strip = (segs: Seg2[]) => segs.map(({ feature: _f, ...s }) => s);
    const d = drawView(scene, view);
    expect(sha({ ...d, visible: strip(d.visible), hidden: strip(d.hidden) })).toBe(hash);
  });
});

/** Curved parts WITHOUT a swept profile (profile runs b1, Task 8): a part with four rounded corners, an a2 stopped profile
 *  and a straight chunk 1 profile, each on its own part, every sheet view and a section — hashed on a731625's src (the last
 *  commit before b1's drawing task), tags stripped AND kept. Swept profiles must not move them. */
describe('drawView of curved parts without a swept profile is unchanged (byte-for-byte, tags too)', () => {
  const B = { length: 30, width: 10, thickness: 0.75 };
  const top = createBoard({ id: 'top', length: 36, width: 20, thickness: 0.75,
    curves: (['min', 'max'] as const).flatMap((u) => (['min', 'max'] as const).map((v) => ({ id: `k${u}${v}`, ...cornerCurve({ through: 'thickness', uFrom: u, vFrom: v, radius: 2 }) }))) });
  const sideMax = { across: 'width', from: 'max' } as const;
  const base = { face: 'max' as const, kind: 'roundover' as const, size: 0.25, fillet: 0, facing: 'face' as const };
  const stopped = createBoard({ id: 'stop', ...B, position: [40, 0, 0],
    profiles: [{ id: 'p', ...base, run: canonicalRun(B, 'max', { start: { side: sideMax, from: 'min', at: 3 }, end: { side: sideMax, from: 'min', at: 27 } }) }] });
  const straight = createBoard({ id: 'str', ...B, position: [0, 0, 30],
    profiles: [{ id: 'q', ...base, kind: 'ogee', size: 0.5, run: { start: { side: sideMax, through: 'min' }, end: { side: { ...sideMax }, through: 'max' } } }] });
  const curved = [top, stopped, straight];
  const strip = (segs: Seg2[]) => segs.map(({ feature: _f, ...s }) => s);
  const SECTION: Section = { axis: 'side', at: 10, flip: false };
  it('the scene is what it says: every part shaped, none swept', () => {
    for (const b of curved) {
      expect(shapedPart(geometryBoard(b))).toBe(true);
      expect(sweptProfiles(b)).toEqual([]);
    }
  });
  it.each([
    ['front', FRONT, undefined, '59b6f1d1c910a95dad1499ce1dab8b9a235f8424ed32ebae968ecdce264a2d95', '947de293da1dd6f74d71e04a4b4c0ca382a68ec7e1d01788fa68917ac3ed5b3c'],
    ['side', SIDE, undefined, '7bfb16d676f88e05a53e5067d46fc90d3ea8d4e7b5d6d41165c9325d39d8baaa', '35141f20884f919e39667231a6c77d05e5d899ce7eeacd667771fcc2ac6f9a14'],
    ['top', TOP, undefined, '26759f05802020748f02f86ea47ec53cbdcaa22b3a6bf622b364fe59dd25499c', '160da1fc22fa3b7470288a7398b98e526cc4a9f5ffa5512d4865963286b208a0'],
    ['iso', ISO, undefined, '3eea196809764ce9825c15a1c02a2ec46c044e41a9d0066a38a5373b5f5095e4', '119141092d3ec5d77f3fd8d8ce3958dbf36b351bfbfd833b3a637986a6cfae20'],
    ['front, sectioned', FRONT, SECTION, 'e3ea039e1c023c101453834127a71557f71b9dd85349d3e20ca3754770a80690', '226bf4be3809dd61f3d97f938f7ef05ac539c87ed40a651808b5ec555362deb0'],
  ] as const)('%s', (_name, view, section, stripped, kept) => {
    const d = drawView(curved, view, undefined, section ? { section } : {});
    expect(sha({ ...d, visible: strip(d.visible), hidden: strip(d.hidden) })).toBe(stripped);
    expect(d.visible.some((s) => s.feature !== undefined)).toBe(true);
    if (section) expect(d.caps!.length).toBeGreaterThan(0);   // the plane cuts wood
    expect(sha(d)).toBe(kept);
  });
});
