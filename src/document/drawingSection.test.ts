import { createBoard, defaultHole } from './document';
import type { Board } from './types';
import { ARCH } from './curveFixtures';
import { chiralAngled } from './turnFixtures';
import { boardExtents } from './geometry';
import { drawView, FRONT, SIDE, TOP, type Seg2, type P2 } from './drawing';
import type { Section } from './section';

const len = (s: Seg2) => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
const total = (segs: Seg2[], part?: string) =>
  segs.filter((s) => part === undefined || s.part === part).reduce((n, s) => n + len(s), 0);
const area = (polys: P2[][]) => polys.reduce((sum, p) => {
  let a = 0;
  for (let i = 0; i < p.length; i += 1) { const [x0, y0] = p[i]!; const [x1, y1] = p[(i + 1) % p.length]!; a += x0 * y1 - x1 * y0; }
  return sum + Math.abs(a) / 2;
}, 0);
// Flat at turn 0: length on X, thickness on Y (up), width on Z.
const box = (id: string, length: number, width: number, thickness: number, position: [number, number, number] = [0, 0, 0], extra: Partial<Board> = {}) =>
  createBoard({ id, name: id, length, width, thickness, position, ...extra });

describe('drawView with a section', () => {
  it('without a section the drawing carries no caps key (the identity hash holds)', () => {
    expect('caps' in drawView([box('b', 10, 4, 2)], FRONT)).toBe(false);
    expect('caps' in drawView([box('b', 10, 4, 2)], FRONT, undefined, {})).toBe(false);
  });

  it('keeps exactly the kept part of each crossing edge and drops the removed edges', () => {
    // X 0..10, Y 0..2, Z 0..4; cut at x = 4. Front view: X-edges 4 + 4 kept, the x = 0 Y-edge (2) kept, x = 10 gone.
    const b = box('b', 10, 4, 2);
    const kept = drawView([b], FRONT, undefined, { section: { axis: 'side', at: 4, flip: false } });
    expect(total(kept.visible)).toBeCloseTo(10, 9);
    expect(total(kept.hidden)).toBeCloseTo(10, 9);
    expect(kept.bounds).toEqual({ min: [0, 0], max: [4, 2] });
    const flipped = drawView([b], FRONT, undefined, { section: { axis: 'side', at: 4, flip: true } });
    expect(total(flipped.visible)).toBeCloseTo(14, 9);
    expect(flipped.bounds).toEqual({ min: [4, 0], max: [10, 2] });
  });

  it('a part on the removed side no longer hides; a kept part still does', () => {
    // R: X 0..10, Y 0..2, Z 0..4. F: X 3..7, Y 0..2, Z 10..11, in front. Unsectioned, F hides 8 of R's front edges.
    const R = box('R', 10, 4, 2);
    const F = box('F', 4, 1, 2, [3, 0, 10]);
    const away = drawView([R, F], FRONT, undefined, { section: { axis: 'front', at: 5, flip: false } });
    expect(total(away.hidden, 'R')).toBeCloseTo(24, 5);
    expect(total(away.visible, 'R')).toBeCloseTo(24, 5);
    expect(total(away.visible, 'F') + total(away.hidden, 'F')).toBe(0);
    const through = drawView([R, F], FRONT, undefined, { section: { axis: 'front', at: 10.5, flip: false } });
    expect(total(through.hidden, 'R')).toBeCloseTo(32, 5);
  });

  it('an angled (planes) body on the removed side no longer hides', () => {
    const A = { ...chiralAngled('upright'), id: 'A' };
    const ext = boardExtents(A);
    const R = box('R', ext[0], 4, ext[1], [A.position[0], A.position[1], A.position[2] - 10]);
    const s: Section = { axis: 'front', at: A.position[2] - 1, flip: false };
    const cut = drawView([R, A], FRONT, undefined, { section: s });
    const alone = drawView([R], FRONT);
    expect(total(cut.visible, 'R')).toBeCloseTo(total(alone.visible, 'R'), 6);
    // Unsectioned, A hides some of R: the comparison above can fail.
    expect(total(drawView([R, A], FRONT).visible, 'R')).toBeLessThan(total(alone.visible, 'R') - 1e-3);
  });

  it('a cut on a face draws the part whole and caps that face', () => {
    // Z 0..11.25; the plane at the front face, keeping z <= 11.25: nothing removed.
    const b = box('b', 30, 11.25, 0.75);
    const d = drawView([b], FRONT, undefined, { section: { axis: 'front', at: 11.25, flip: false } });
    expect(total(d.visible)).toBeCloseTo(total(drawView([b], FRONT).visible), 9);
    expect(d.caps).toHaveLength(1);
    expect(area(d.caps![0]!.polys)).toBeCloseTo(30 * 0.75, 6);
  });

  it('caps a dadoed part with its notch, and gives no cap to a part the plane misses', () => {
    const dado = { id: 'c1', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 10, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
    const side = box('side', 30, 11.25, 0.75, [0, 0, 0], { cuts: [dado] });
    const far = box('far', 5, 5, 1, [0, 0, 40]);
    const d = drawView([side, far], FRONT, undefined, { section: { axis: 'front', at: 5, flip: false } });
    expect(d.caps!.map((c) => c.part)).toEqual(['side']);
    // 30 x 0.75 less the 0.75 x 0.25 groove; perimeter 30 + .75 + .75 + 10 + 19.25 + 2(.25) + .75 = 62.
    expect(area(d.caps![0]!.polys)).toBeCloseTo(22.5 - 0.1875, 6);
    expect(total(d.caps![0]!.outline)).toBeCloseTo(62, 6);
  });

  it('a through bore reads as a ring across its axis and as a slot along it', () => {
    const base = box('p', 30, 5, 0.75);
    const plate = { ...base, holes: [{ id: 'h', ...defaultHole(base), depth: 'through' as const }] };
    // The bore runs along Y at x = 15, z = 2.5, diameter 1/4.
    const across = drawView([plate], TOP, undefined, { section: { axis: 'top', at: 0.3, flip: false } });
    expect(area(across.caps![0]!.polys)).toBeCloseTo(150 - Math.PI * 0.125 ** 2, 2);
    expect(total(across.caps![0]!.outline)).toBeGreaterThan(2 * (30 + 5) + 0.7);
    const along = drawView([plate], FRONT, undefined, { section: { axis: 'front', at: 2.5, flip: false } });
    expect(area(along.caps![0]!.polys)).toBeCloseTo(30 * 0.75 - 0.25 * 0.75, 2);
  });

  it('angled and curved parts: no visible line passes the plane, and some end on it', () => {
    const angled = { ...chiralAngled('upright'), id: 'ang', position: [0, 0, 0] as [number, number, number] };
    const apron = box('a', 30, 5, 0.75, [0, 0, 0], { curves: [ARCH] });
    for (const [part, tol] of [[angled, 1e-6], [apron, 0.005]] as const) {
      const at = part.position[0] + boardExtents(part)[0] / 2;
      for (const view of [FRONT, TOP]) {
        // FRONT and TOP both have right = +X, so screen x is world x.
        const d = drawView([part], view, undefined, { section: { axis: 'side', at, flip: false } });
        const xs = d.visible.flatMap((s) => [s.a[0], s.b[0]]);
        expect(Math.max(...xs)).toBeLessThanOrEqual(at + tol);
        expect(Math.max(...xs)).toBeGreaterThan(at - tol);
      }
    }
  });

  it('applies offsets to lines and caps alike (the viewport frame), so the sheet must pass none', () => {
    const b = box('b', 10, 4, 2);
    const off = new Map([['b', [0, 0, 20] as [number, number, number]]]);
    const d = drawView([b], SIDE, off, { section: { axis: 'front', at: 22, flip: false } });
    expect(d.caps).toHaveLength(1);
    expect(drawView([b], SIDE, undefined, { section: { axis: 'front', at: 22, flip: false } }).caps).toEqual([]);
  });
});
