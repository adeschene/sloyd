/**
 * TEST-ONLY fixtures for profile runs chunk b1 (a profile follows the outline): every b1 task builds on these. Built with
 * `createBoard` only, never through `migrateDocument` (b1's Task 2 lifted the loader's `{ loop: true }` refusal; the
 * fixtures stay loader-free). Never import a test module from here (it would re-register its suite).
 */
import { createBoard } from './document';
import { archCurve, cornerCurve } from './curves';
import type { Board, ProfileCut, ProfileSide } from './types';

const side = (across: 'length' | 'width', from: 'min' | 'max'): ProfileSide => ({ across, from });
export const endToEnd = (id: string, s: ProfileSide, size = 0.25, kind: ProfileCut['kind'] = 'roundover'): ProfileCut =>
  ({ id, face: 'max', kind, size, fillet: 0, facing: 'face', run: { start: { side: s, through: 'min' }, end: { side: { ...s }, through: 'max' } } });
export const loop = (id: string, size = 0.25, kind: ProfileCut['kind'] = 'roundover', face: 'min' | 'max' = 'max'): ProfileCut =>
  ({ id, face, kind, size, ...(kind === 'thumbnail' ? { depth: 0.25 } : { fillet: kind === 'bead' ? 1 / 16 : 0 }), facing: 'face', run: { loop: true } });
export const stopped = (id: string, s: ProfileSide, lo: number, hi: number): ProfileCut =>
  ({ ...endToEnd(id, s), run: { start: { side: s, from: 'min', at: lo }, end: { side: { ...s }, from: 'min', at: hi } } });
export const apronArch: Board = createBoard({ length: 30, width: 5, thickness: 0.75,
  curves: [{ id: 'c1', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1.25 }) }],
  profiles: [endToEnd('p1', side('width', 'min'))] });
const corners = (r: number) => (['min', 'max'] as const).flatMap((u) => (['min', 'max'] as const).map((v) =>
  ({ id: `c${u}${v}`, ...cornerCurve({ through: 'thickness', uFrom: u, vFrom: v, radius: r }) })));
export const topCorners = (r: number, p: ProfileCut = loop('p1')): Board =>
  createBoard({ length: 36, width: 20, thickness: 0.75, curves: corners(r), profiles: [p] });
export const notchEdge: Board = createBoard({ length: 30, width: 5, thickness: 0.75,
  curves: [{ id: 'c1', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 14, span: 2, rise: 1 }) }],
  profiles: [endToEnd('p1', side('width', 'min'), 0.375)] });
export const frontOnly: Board = topCorners(2, endToEnd('p1', side('width', 'min')));
/** A plain 30 × 10 × 3/4 part: an End to end on its uncut top long edge (straight) and a loop (swept: the mitred rectangle). */
export const straightTopLong = endToEnd('s1', side('width', 'max'));
export const plainLoop: Board = createBoard({ length: 30, width: 10, thickness: 0.75, profiles: [loop('w1')] });
