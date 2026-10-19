/**
 * TEST-ONLY fixtures for profile runs chunk b1 (a profile follows the outline): every b1 task builds on these. Built with
 * `createBoard` only, never through `migrateDocument` (b1's Task 2 lifted the loader's `{ loop: true }` refusal; the
 * fixtures stay loader-free). Never import a test module from here (it would re-register its suite).
 */
import { createBoard } from './document';
import { archCurve, bowCurve, cornerCurve } from './curves';
import { chiralCurved } from './turnFixtures';
import { faceOutline } from './profilePath';
import type { Board, Posture, ProfileCut, ProfileSide } from './types';

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

// --- profile runs chunk b2: stops on a turned path and two-side runs (TEST-ONLY) ---
export const twoSide = (id: string, sA: ProfileSide, atA: number, sB: ProfileSide, atB: number, size = 0.25, kind: ProfileCut['kind'] = 'roundover'): ProfileCut =>
  ({ ...endToEnd(id, sA, size, kind), run: { start: { side: { ...sA }, from: 'min', at: atA }, end: { side: { ...sB }, from: 'min', at: atB } } });
const stoppedAs = (id: string, s: ProfileSide, lo: number, hi: number, size: number, kind: ProfileCut['kind']): ProfileCut =>
  ({ ...endToEnd(id, s, size, kind), run: { start: { side: s, from: 'min', at: lo }, end: { side: { ...s }, from: 'min', at: hi } } });
/** A stop on the front from 1.1 (on the min-u corner arc, mid-chord) to 30. */
export const stopOnCorner = (kind: ProfileCut['kind'] = 'roundover', size = 0.25): Board => topCorners(2, stoppedAs('p1', side('width', 'min'), 1.1, 30, size, kind));
/** Roundover 1/4, stopped on the arched side from 10 to 20 (both on the arch). */
export const stopOnArch: Board = { ...apronArch, profiles: [stopped('p1', side('width', 'min'), 10, 20)] };
/** Roundover 3/8, stopped from 14.5 (on the notch) to 25. */
export const stopOnNotch: Board = { ...notchEdge, profiles: [stoppedAs('p1', side('width', 'min'), 14.5, 25, 0.375, 'roundover')] };
/** A bowed front (rise 1/2 over 30), roundover 1/4 stopped from 5 to 25. */
export const bowFront: Board = createBoard({ length: 30, width: 5, thickness: 0.75,
  curves: [{ id: 'c1', ...bowCurve({ through: 'thickness', along: 'length', side: 'min', span: 30, rise: 0.5 }) }],
  profiles: [stopped('p1', side('width', 'min'), 5, 25)] });
/** A rounded top profiled front and ends (B3): the length min end at 4 round the front to the length max end at 4. */
export const frontAndEnds = (kind: ProfileCut['kind'] = 'roundover', size = 0.25): Board =>
  topCorners(2, twoSide('p1', side('length', 'min'), 4, side('length', 'max'), 4, size, kind));
/** Two sides round a SHARP corner (R6's mitre): the front at 20 to the length max end at 5. */
export const twoSideSharp: Board = createBoard({ length: 30, width: 10, thickness: 0.75,
  profiles: [twoSide('p1', side('width', 'min'), 20, side('length', 'max'), 5)] });
/** chiralCurved with a two-side run round its 1" corner (k2, max/max): the length max end at 3 to the width max side at 14. */
export const chiralTwoSide = (posture: Posture): Board =>
  ({ ...chiralCurved(posture), profiles: [twoSide('p1', side('length', 'max'), 3, side('width', 'max'), 14)] });
/** Q13: a front stop half the end-chord zone short of the 2" corner arc's 45° chord vertex (12 chords: the turn there is
 *  π/24, the zone 0.25·tan(π/48)), to 30". Read off the outline, so it is exactly where the zone says. */
export const zoneStop = (): Board => {
  const b = topCorners(2), o = faceOutline(b)!;
  const arc = o.chords.filter((c) => c.curve === 'cminmin'), c = arc[5]!;
  const l = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]);
  const t = 1 - (0.5 * 0.25 * Math.tan(Math.PI / 48)) / l;
  return topCorners(2, stopped('p1', side('width', 'min'), c.a[0] + t * (c.b[0] - c.a[0]), 30));
};
/** Task 5 fix round 1 (I1): runs that wrap back into a stop's half-plane. A plain 30 × 4 board, the front at 20 round the
 *  length max end to the back (width max) at 10: three sides. */
export const wrapThree = (): Board => createBoard({ length: 30, width: 4, thickness: 0.75,
  profiles: [twoSide('p1', side('width', 'min'), 20, side('width', 'max'), 10)] });
/** topCorners(2): the front at 20 round the length max end and the back to the length min end at 10: four sides, three arcs. */
export const wrapFour = (): Board => topCorners(2, twoSide('p1', side('width', 'min'), 20, side('length', 'min'), 10));
