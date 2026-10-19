/**
 * TEST-ONLY fixtures for profile runs chunk b1 (a profile follows the outline): every b1 task builds on these. Built with
 * `createBoard` only, never through `migrateDocument` (b1's Task 2 lifted the loader's `{ loop: true }` refusal; the
 * fixtures stay loader-free). Never import a test module from here (it would re-register its suite).
 */
import { createBoard } from './document';
import { archCurve, bowCurve, cornerCurve } from './curves';
import { chiralCurved } from './turnFixtures';
import { faceOutline } from './profilePath';
import { mirrorPart } from './frames';
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
/** Task 5 fix round 2 (N1): two-side runs with a THROUGH end at a corner arc, so a B1 station (and its ε extension) at
 *  that end, wrapping away from the station's half-plane. All on topCorners(2). */
const throughEnd = (s: ProfileSide, through: 'min' | 'max') => ({ side: { ...s }, through });
const stopEnd = (s: ProfileSide, at: number) => ({ side: { ...s }, from: 'min' as const, at });
const runOf = (start: object, end: object): ProfileCut => ({ ...endToEnd('p1', side('width', 'min')), run: { start, end } as ProfileCut['run'] });
/** The right end through min (the front-right arc: a station on the front) round to the back, stopped at 10. */
export const stationRightToBack = (): Board => topCorners(2, runOf(throughEnd(side('length', 'max'), 'min'), stopEnd(side('width', 'max'), 10)));
/** The front stopped at 20 round to the back through min (the back-left arc: a station on the left end). */
export const stationFrontToBack = (): Board => topCorners(2, runOf(stopEnd(side('width', 'min'), 20), throughEnd(side('width', 'max'), 'min')));
/** The front stopped at 20 round to the right end through max (the back-right arc: a station on the back). */
export const stationFrontToRight = (): Board => topCorners(2, runOf(stopEnd(side('width', 'min'), 20), throughEnd(side('length', 'max'), 'max')));
/** Fix round 2: an End to end on the front of a 36 × 4.02 part with 2" corners: each end's straight side is 0.02", under 2ε (0.0327),
 *  so its B1 stations take NO ε extension and the band's end ray is the arc's bisector, not the station plane (the clip acts). */
export const shortEnds = (): Board => createBoard({ length: 36, width: 4.02, thickness: 0.75, curves: corners(2), profiles: [endToEnd('p1', side('width', 'min'))] });
/** Task 6 fix round 1 (the review's I2, M1): a plain 30 × 10 run from the right end at `a` (from the front) round the back and
 *  the left end to the front at 30 − `gap`: four sides, both stops near the SHARP front-right corner. Within the reach of it
 *  on both sides, the two ends' bands overlap there. */
export const cornerGap = (a: number, gap: number): Board => createBoard({ length: 30, width: 10, thickness: 0.75,
  profiles: [twoSide('p1', side('length', 'max'), a, side('width', 'min'), 30 - gap)] });
/** Task 6 fix round 2 (N2): `cornerGap` for every section kind. Face max: the right end at `a` round to the front at
 *  30 − `gap` (as cornerGap); face min: the front at 30 − `gap` round to the right end at `a` (the same stops, walked the
 *  other way, as the face-min frame needs). */
export const cornerGapAs = (kind: ProfileCut['kind'], size: number, extra: Partial<ProfileCut>, a: number, gap: number, face: 'min' | 'max' = 'max'): Board => {
  const run = face === 'max'
    ? twoSide('p1', side('length', 'max'), a, side('width', 'min'), 30 - gap, size, kind)
    : twoSide('p1', side('width', 'min'), 30 - gap, side('length', 'max'), a, size, kind);
  return createBoard({ length: 30, width: 10, thickness: 0.75, profiles: [{ ...run, ...extra, face } as ProfileCut] });
};
/** N2's cases: every section kind at two gap pairs, plus a face-min part (the mirrored part is mirrorPart of the first). */
export const overlapKinds: [string, ProfileCut['kind'], number, Partial<ProfileCut>][] = [
  ['roundover 1/4', 'roundover', 0.25, {}],
  ['cove 3/8 + 1/16 fillet', 'cove', 0.375, { fillet: 1 / 16 }],
  ['ogee 3/8', 'ogee', 0.375, {}],
  ['ogee 3/8 facing the edge', 'ogee', 0.375, { facing: 'edge' }],
  ['bead 1/4 + 1/16 quirk', 'bead', 0.25, { fillet: 1 / 16 }],
  ['thumbnail 3/4 × 1/4', 'thumbnail', 0.75, { depth: 0.25 }],
];
/** N2's committed set: every kind at (0.1, 0.1) and (0.2, 0.05) on face max; the ogee facing the edge mirrored along its
 *  length; the bead on face min. Each with its corner (x of the profiled corner: 30, or 0 mirrored), `a` and `gap`. */
export const overlapCases = (): { name: string; board: Board; cornerX: number; a: number; gap: number }[] => [
  ...overlapKinds.flatMap(([name, kind, size, extra]) => ([[0.1, 0.1], [0.2, 0.05]] as const).map(([a, gap]) =>
    ({ name: `${name}, stops ${a}" and ${gap}" from the corner`, board: cornerGapAs(kind, size, extra, a, gap), cornerX: 30, a, gap }))),
  { name: 'ogee 3/8 facing the edge, mirrored along its length (mirrorPart)', board: mirrorPart(cornerGapAs('ogee', 0.375, { facing: 'edge' }, 0.2, 0.05)), cornerX: 0, a: 0.2, gap: 0.05 },
  { name: 'bead 1/4 + 1/16 quirk on face min', board: cornerGapAs('bead', 0.25, { fillet: 1 / 16 }, 0.1, 0.1, 'min'), cornerX: 30, a: 0.1, gap: 0.1 },
];
