import type { Board, CutFrom, Dimension, HoleRow, Region } from './types';
import type { V3 } from './angleCuts';
import { DIMENSION_ORDER, MAX_MAGNITUDE } from './geometry';
import { acrossOf, bitVector, isTilted } from './holeTilt';

export { acrossOf };

/**
 * Every field of `HoleRow` that decides "same hole row": all but `id` (holes spec §4.2). A TABLE CHECKED AGAINST THE
 * TYPE (invariant 40's pattern): a new `HoleRow` field fails `tsc` here until it is listed.
 */
export const HOLE_FIELDS = {
  face: true, from: true, diameter: true, depth: true, along: true, alongFrom: true,
  station: true, count: true, pitch: true, acrossFrom: true, inset: true, tiltAlong: true, tiltAcross: true,
  head: true, headDiameter: true, headDepth: true, headAngle: true,
} as const satisfies Record<Exclude<keyof HoleRow, 'id'>, true>;

export const HOLE_KEYS = Object.keys(HOLE_FIELDS) as (keyof typeof HOLE_FIELDS)[];

/** Holes per row, at most. A hand-edited count above it is dropped on load (expanding it would freeze the view). */
export const HOLE_COUNT_MAX = 500;

/** One row's comparable values, in HOLE_KEYS order. A single bore's `pitch` reads 0: stored and ignored at count 1, it
 *  places nothing, so two single bores that once had different pitches are the same row (fu 338, the user's ruling) —
 *  on the cut list, in a link, as a no-op edit. Every other value exact. A tilt (schema 23) is appended as its key NAME then
 *  its value, only when present: a square row's array is exactly as before, and a tiltAlong-only row can never equal a
 *  tiltAcross-only one of the same value. A head (schema 30) is appended the same way, key NAME then value, so a headless row's
 *  array is exactly as before and a counterbore never equals a countersink of the same `headDiameter`. */
export function holeRowValues(r: Omit<HoleRow, 'id'>): (string | number)[] {
  const out: (string | number)[] = [];
  for (const k of HOLE_KEYS) {
    const v = r[k];
    if (v === undefined) continue;
    if (k === 'tiltAlong' || k === 'tiltAcross' || k === 'head' || k === 'headDiameter' || k === 'headDepth' || k === 'headAngle') out.push(k);
    out.push(k === 'pitch' && r.count === 1 ? 0 : v);
  }
  return out;
}

export type HeadKind = 'counterbore' | 'countersink';
/** A countersink's legal included angles, degrees (counterbores spec §3.1). */
export const HEAD_ANGLES = [82, 90] as const;

export function hasHead(r: Pick<HoleRow, 'head'>): boolean {
  return r.head !== undefined;
}

/** The head's AXIAL depth from the face, or null for a headless row: a counterbore's `headDepth`; a countersink's is
 *  DERIVED, `(headDiameter - diameter) / 2 / tan(headAngle / 2)`, never stored. The ONE home of that formula. */
export function headReach(
  r: Pick<HoleRow, 'diameter' | 'head' | 'headDiameter' | 'headDepth' | 'headAngle'>,
): number | null {
  if (r.head === 'counterbore') return r.headDepth ?? null;
  if (r.head === 'countersink' && r.headDiameter !== undefined && r.headAngle !== undefined) {
    const half = (r.headDiameter - r.diameter) / 2;
    return r.headAngle === 90 ? half : half / Math.tan((r.headAngle / 2) * Math.PI / 180);
  }
  return null;
}

/** THE legality decider for a row's head (counterbores spec §3.2), shared by the loader and the store. `malformed`: the
 *  keys disagree with the kind (a counterbore with an angle or without a depth, a countersink with a depth or without an
 *  angle, any head key without `head`), a number that is not finite, positive and within MAX_MAGNITUDE, or an angle outside
 *  HEAD_ANGLES. Then `not-wider`, `too-deep` (a blind row only: the head must stop short of the bottom) and `tilted`.
 *  Null when legal, and for a headless row. */
export function headProblem(r: Omit<HoleRow, 'id'>): 'malformed' | 'not-wider' | 'too-deep' | 'tilted' | null {
  const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= MAX_MAGNITUDE;
  if (r.head === undefined) {
    return r.headDiameter !== undefined || r.headDepth !== undefined || r.headAngle !== undefined ? 'malformed' : null;
  }
  if (r.head !== 'counterbore' && r.head !== 'countersink') return 'malformed';
  if (!ok(r.headDiameter)) return 'malformed';
  if (r.head === 'counterbore') {
    if (r.headAngle !== undefined || !ok(r.headDepth)) return 'malformed';
  } else if (r.headDepth !== undefined || !(HEAD_ANGLES as readonly unknown[]).includes(r.headAngle)) {
    return 'malformed';
  }
  if (!(r.headDiameter > r.diameter)) return 'not-wider';
  const reach = headReach(r);
  if (r.depth !== 'through' && (reach === null || !(reach < r.depth))) return 'too-deep';
  if (isTilted(r)) return 'tilted';
  return null;
}

/** Exact equality on every HOLE_FIELDS field (stored values, invariant 18), a single bore's pitch aside (fu 338). */
export function sameHoleRow(a: Omit<HoleRow, 'id'>, b: Omit<HoleRow, 'id'>): boolean {
  const x = holeRowValues(a);
  const y = holeRowValues(b);
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/** A copy that is not the same object, so no two parts ever hold one row. */
export function copyHoleRow(r: HoleRow): HoleRow {
  return { ...r };
}

const flip = (f: CutFrom): CutFrom => (f === 'min' ? 'max' : 'min');

/** A row reflected along dimension `d` (inv 44): a FLAG FLIP, never arithmetic on positions — the flag on whichever of
 *  face / along / across is `d`. Its own inverse. */
export function mirrorHoleRow(r: HoleRow, d: Dimension): HoleRow {
  if (r.face === d) return { ...r, from: flip(r.from) };
  if (r.along === d) return { ...r, alongFrom: flip(r.alongFrom) };
  return { ...r, acrossFrom: flip(r.acrossFrom) };
}

/** Millimetres to inches, DIVIDED by 25.4 exactly as parseLength stores a typed mm (`n / MM_PER_INCH`), so a preset's
 *  32 mm and a typed "32mm" are the same number — multiplying by 1/25.4 differs in the last bit for 5 and 22.5. Not
 *  rounded. (The 25.4 is written here rather than imported: this module produces no text, so it does not import units.) */
export const mm = (n: number) => n / 25.4;

/** The broad face: the smallest dimension (a tie goes to the later of DIMENSION_ORDER: thickness, then width). */
export function broadFace(b: Pick<Board, Dimension>): Dimension {
  return DIMENSION_ORDER.reduce((best, d) => (b[d] <= b[best] ? d : best), 'length' as Dimension);
}
/** The two others, the longer first (a row runs along the longer; length on a tie). Bore leg sockets lays its rows out
 *  the same way (legSockets.ts), so every copy of a seat stores one layout. */
export function othersOf(b: Pick<Board, Dimension>, face: Dimension): [Dimension, Dimension] {
  const [x, y] = DIMENSION_ORDER.filter((d) => d !== face) as [Dimension, Dimension];
  return b[y] > b[x] ? [y, x] : [x, y];
}

/** "Hole" (spec §7): ¼" dia, ½" deep (through when the face dimension is ½" or less), centred on the broad face. */
export function defaultHole(b: Board): Omit<HoleRow, 'id'> {
  const face = broadFace(b);
  const [along, across] = othersOf(b, face);
  return {
    face, from: 'max', diameter: 0.25, depth: b[face] <= 0.5 ? 'through' : 0.5,
    along, alongFrom: 'min', station: b[along] / 2, count: 1, pitch: 0, acrossFrom: 'min', inset: b[across] / 2,
  };
}

/** "Shelf-pin row" (spec §7): ¼" × ⅜" deep in the broad face, along the longer side from its min end, first at 2",
 *  every 32 mm, as many as leave the last at least 2" from the far end; 1½" in (or centred, on stock under 3" wide).
 *  Null when not even one hole fits. */
export function defaultShelfPinRow(b: Board): Omit<HoleRow, 'id'> | null {
  const face = broadFace(b);
  const [along, across] = othersOf(b, face);
  const pitch = mm(32);
  const room = b[along] - 4;
  if (room < 0) return null;
  const count = Math.min(HOLE_COUNT_MAX, Math.floor(room / pitch + 1e-9) + 1);
  return {
    face, from: 'max', diameter: 0.25, depth: 0.375, along, alongFrom: 'min', station: 2, count, pitch,
    acrossFrom: 'min', inset: b[across] >= 3 ? 1.5 : b[across] / 2,
  };
}

/** "Hinge cup" (spec §7): a 35 mm Forstner cup, 1/2" deep, in the broad face, 3" from the min end of the longer side,
 *  22.5 mm in from the min side (the common cup-hinge spec puts the cup's edge 3–6 mm from the door edge).
 *  Orientation follows the shelf-pin convention: along the LONGER non-face dimension, whichever of length/width that is. */
export function defaultHingeCup(b: Board): Omit<HoleRow, 'id'> {
  const face = broadFace(b);
  const [along] = othersOf(b, face);
  return {
    face, from: 'max', diameter: mm(35), depth: 0.5, along, alongFrom: 'min', station: 3, count: 1, pitch: 0,
    acrossFrom: 'min', inset: mm(22.5),
  };
}

/** "Cam lock" (cam-and-bolt spec §4.1): a 15 mm cam bore in the broad face, 24 mm in from `end`, and its 8 mm bolt bore 24 mm
 *  deep into that end, at the same stations (37 mm from each side, two when the width is at least 150 mm, else one centred; a given `count` overrides that, and
 *  `camFrom` picks which broad face the cam enters, `max` by default).
 *  The cam is deep enough for the half-thickness plus 4.5 mm, rounded up to the next half millimetre. Null when the broad
 *  face is the length (a part that short has no end to join). Assumes a given `count` is an integer ≥ 1, and, when it is
 *  2 or more, that the part is wider than 2 × 37 mm along the row (else the pitch is zero or negative, which the loader
 *  drops): the caller decides both (the joint planner refuses them, ruling R17). */
export function defaultCamLock(
  b: Board, end: CutFrom, count?: number, camFrom?: CutFrom,
): [Omit<HoleRow, 'id'>, Omit<HoleRow, 'id'>] | null {
  const face = broadFace(b);
  if (face === 'length') return null;
  // Spec Amended R12 (the user's ruling 2026-10-30): only on stock thicker than 1/2" (a 15 mm housing wants depth).
  if (b[face] <= 0.5 + 1e-9) return null;
  const along: Dimension = face === 'thickness' ? 'width' : 'thickness';
  // A given count (cam-and-bolt joint spec §3.2) overrides the width rule: one is centred, two or more start 37 mm in and
  // divide the rest in ONE division, so the last lands exactly 37 mm from the far side.
  const n = count ?? (b[along] * 25.4 >= 150 - 1e-9 ? 2 : 1);
  const station = n >= 2 ? mm(37) : b[along] / 2;
  const pitch = n >= 2 ? (b[along] - 2 * mm(37)) / (n - 1) : 0;
  const cam: Omit<HoleRow, 'id'> = {
    face, from: camFrom ?? 'max', diameter: mm(15), depth: mm(Math.ceil((b[face] * 25.4 / 2 + 4.5) * 2 - 1e-9) / 2),
    along, alongFrom: 'min', station, count: n, pitch, acrossFrom: end, inset: mm(24),
  };
  const bolt: Omit<HoleRow, 'id'> = {
    face: 'length', from: end, diameter: mm(8), depth: mm(24), along, alongFrom: 'min', station, count: n, pitch,
    acrossFrom: 'min', inset: b[face] / 2,
  };
  return [cam, bolt];
}

/** "Cam bolt bore" (cam-and-bolt spec §4.2): the default hole's place, 5 mm × 12 mm deep. */
export function defaultCamBoltBore(b: Board): Omit<HoleRow, 'id'> {
  return { ...defaultHole(b), diameter: mm(5), depth: mm(12) };
}

/** "Countersunk screw" (counterbores spec §5): the default hole's place, a 3/16" bore (through in stock of 1-1/2" or less,
 *  else 1-1/4" deep) under a 3/8" countersink at 82° (metric: 4.5 mm under 9 mm at 90°). */
export function defaultCountersunkScrew(b: Board, metric: boolean): Omit<HoleRow, 'id'> {
  const base = defaultHole(b);
  return {
    ...base, diameter: metric ? mm(4.5) : 3 / 16, depth: b[base.face] <= 1.5 ? 'through' : 1.25,
    head: 'countersink', headDiameter: metric ? mm(9) : 3 / 8, headAngle: metric ? 90 : 82,
  };
}

/** "Counterbored screw" (counterbores spec §5): as the countersunk screw, under a 3/8" × 3/8" deep counterbore
 *  (metric: 10 mm × 10 mm). */
export function defaultCounterboredScrew(b: Board, metric: boolean): Omit<HoleRow, 'id'> {
  const base = defaultHole(b);
  return {
    ...base, diameter: metric ? mm(4.5) : 3 / 16, depth: b[base.face] <= 1.5 ? 'through' : 1.25,
    head: 'counterbore', headDiameter: metric ? mm(10) : 3 / 8, headDepth: metric ? mm(10) : 3 / 8,
  };
}

/** Board-local half-space; the kept side is n·x + d ≥ 0. */
export interface Plane { n: V3; d: number }

/** One flat-bottomed cylinder, board-local `[length, width, thickness]` inches. `axis` and `dir` name the ENTRY face:
 *  `centre` (the mouth centre) lies on its plane; `dir` is +1 when the hole runs toward +axis (entered from the min face).
 *  `bit` is the drill's direction (holeTilt's `bitVector`: its `axis` component exactly `dir`, so a square hole's is the
 *  face axis). `depth` is the face dimension for a through hole and ALONG THE BIT for a blind one; `reach` is the AXIAL
 *  distance from the entry plane to the far ring's plane (through) or the bottom disc's centre (blind) — `depth` itself
 *  on a square hole (angled holes spec §3.2, §6.1). */
export interface Hole {
  row: string; index: number; axis: Dimension; dir: 1 | -1;
  centre: V3; radius: number; depth: number; through: boolean;
  bit: V3; reach: number;
  /** A headed row's head (counterbores spec §6.1), set by holeInstances ONLY for a headed row — a headless hole has no
   *  `head` key at all (the square snapshot compares with toEqual). `radius` the head's at the face, `reach` its axial
   *  depth (headReach). A headed row is never tilted. Every geometry reader of a whole headed hole goes through holePieces. */
  head?: { kind: HeadKind; radius: number; reach: number };
  /** ON PIECES ONLY (holePieces): a frustum's far-end radius, the countersink's cone narrowing from `radius` at the mouth to
   *  `tip` at `depth`. Never set by holeInstances. */
  tip?: number;
  /** ON A PAIRED HOLE ONLY (cam-and-bolt spec §3.3; set by partGeometry's `withMates`, never by holeInstances): the PARTNER's
   *  geometry, so a hole's rim and loop are a pure function of the hole itself. `role` is the PARTNER's role. An unpaired hole
   *  has no `mate` key at all. Frozen with the hole; the per-hole memo is safe because the partner's geometry is part of the
   *  hole's identity (a different partner is a different hole object). */
  mate?: { role: 'cam' | 'bolt'; axis: Dimension; dir: 1 | -1; centre: V3; radius: number; depth: number };
}

/** The polygon a hole is rendered as, vertices on the true circle (spec §3.2). */
export const HOLE_SEGMENTS = 48;
/** Inches: comparisons, as BODY_EPS (holes.ts cannot import bodies.ts — bodies → cuts → holes). */
export const HOLE_EPS = 1e-9;
/** Inches the prism's caps are pushed out, so a face ON the entry plane (or a seam inside the depth) is strictly inside
 *  and is punched. Well above HOLE_EPS (clipPolygon's on-plane band), far below anything visible. */
export const PRISM_EPS = 1e-7;

const idx = (d: Dimension) => DIMENSION_ORDER.indexOf(d);
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The axis index and the two in-plane indices, in DIMENSION_ORDER. */
function frameOf(h: Pick<Hole, 'axis'>): { a: number; u: number; v: number } {
  const a = idx(h.axis);
  const [u, v] = [0, 1, 2].filter((i) => i !== a) as [number, number];
  return { a, u, v };
}

/** The bit leaves the face axis. Every square hole takes the code paths it always did (Global Constraints). Exported
 *  as `tiltedHole` for holeFaults' branches. */
export const tiltedHole = (h: Pick<Hole, 'axis' | 'bit'>): boolean => tilted(h);
const tilted = (h: Pick<Hole, 'axis' | 'bit'>): boolean => {
  const { u, v } = frameOf(h);
  return h.bit[u] !== 0 || h.bit[v] !== 0;
};

/**
 * A tilted bore's frame: `b` the unit bit, `w1`/`w2` the orthonormal pair square to it — Gram–Schmidt from the face's +u
 * then +v, so θ = 0 leans toward +u and a ring winds from +u toward +v seen down the face axis, as a square ring does.
 */
function boreFrame(h: Hole): { b: V3; w1: V3; w2: V3 } {
  const { u, v } = frameOf(h);
  const l = Math.hypot(h.bit[0], h.bit[1], h.bit[2]);
  const b: V3 = [h.bit[0] / l, h.bit[1] / l, h.bit[2] / l];
  const unit = (p: V3): V3 => { const m = Math.hypot(p[0], p[1], p[2]); return [p[0] / m, p[1] / m, p[2] / m]; };
  const eu: V3 = [0, 0, 0]; eu[u] = 1;
  const w1 = unit([eu[0] - b[u] * b[0], eu[1] - b[u] * b[1], eu[2] - b[u] * b[2]]);
  const ev: V3 = [0, 0, 0]; ev[v] = 1;
  const p = b[v]; const q = w1[v];
  const w2 = unit([ev[0] - p * b[0] - q * w1[0], ev[1] - p * b[1] - q * w1[1], ev[2] - p * b[2] - q * w1[2]]);
  return { b, w1, w2 };
}

/** The far end of a bore's axis: the exit ring's centre (through) or the bottom disc's (blind), `reach` along the bit. */
const farCentre = (h: Hole): V3 => [h.centre[0] + h.reach * h.bit[0], h.centre[1] + h.reach * h.bit[1], h.centre[2] + h.reach * h.bit[2]];

/**
 * A tilted bore's axis-aligned box, exact for the true cylinder: a cylinder cut by two planes is the convex hull of its two
 * end curves, so the box is the union of theirs. A face-parallel ring (the mouth; a through exit) is the circle slid to
 * the plane, `r·M·w` with `M = I − dir·bit·e_aᵀ` — on axis i a sinusoid of half-extent `r·hypot(M_i·w1, M_i·w2)`, 0 on the
 * face axis; a blind bottom (the disc square to the bit) has `r·hypot(w1_i, w2_i)`.
 */
function tiltedBox(h: Hole): { lo: V3; hi: V3 } {
  const { a } = frameOf(h);
  const { w1, w2 } = boreFrame(h);
  const end = farCentre(h);
  const lo: V3 = [0, 0, 0]; const hi: V3 = [0, 0, 0];
  for (let i = 0; i < 3; i += 1) {
    const slid = i === a ? 0 : h.radius * Math.hypot(w1[i]! - h.dir * h.bit[i]! * w1[a]!, w2[i]! - h.dir * h.bit[i]! * w2[a]!);
    const far = h.through ? slid : h.radius * Math.hypot(w1[i]!, w2[i]!);
    lo[i] = Math.min(h.centre[i]! - slid, end[i]! - far);
    hi[i] = Math.max(h.centre[i]! + slid, end[i]! + far);
  }
  return { lo, hi };
}

export function holeInstances(board: Pick<Board, Dimension>, row: HoleRow): Hole[] {
  const across = acrossOf(row);
  const through = row.depth === 'through';
  const depth = row.depth === 'through' ? board[row.face] : row.depth;
  const bit = bitVector(row);
  // Axial: the face dimension through; a blind depth runs along the bit. A square row's reach IS its depth.
  const reach = through || !isTilted(row) ? depth : depth / Math.hypot(bit[0], bit[1], bit[2]);
  const headAt = headReach(row);
  const head = row.head !== undefined && row.headDiameter !== undefined && headAt !== null
    ? { kind: row.head, radius: row.headDiameter / 2, reach: headAt } : null;
  const out: Hole[] = [];
  for (let k = 0; k < row.count; k += 1) {
    const s = row.station + k * row.pitch;
    const c: V3 = [0, 0, 0];
    c[idx(row.face)] = row.from === 'min' ? 0 : board[row.face];
    c[idx(row.along)] = row.alongFrom === 'min' ? s : board[row.along] - s;
    c[idx(across)] = row.acrossFrom === 'min' ? row.inset : board[across] - row.inset;
    const h: Hole = { row: row.id, index: k, axis: row.face, dir: row.from === 'min' ? 1 : -1, centre: c, radius: row.diameter / 2, depth, through, bit: [bit[0], bit[1], bit[2]], reach };
    if (head) h.head = { ...head };
    out.push(h);
  }
  return out;
}

/**
 * A hole as the union of its CONVEX pieces (counterbores spec §6.1). Headless: `[h]`, the same object. Headed: `[head,
 * bore]`, neither with a `head` key — the head a cylinder of radius R over `[0, reach]` (a countersink's a frustum, R at
 * the mouth to `tip` = r at `reach`), always blind; the bore the original radius from the step (its mouth plane) to the
 * original far end. Over the head's span the bore lies inside the head, so the union is the stepped bore. For a FROZEN
 * hole the pieces are frozen and memoised by its identity, so each piece's own prism and ring memos apply.
 */
export function holePieces(h: Hole): readonly Hole[] {
  if (!h.head) return [h];
  if (!frozen(h)) return piecesOf(h, false);
  const memo = memoOf(h);
  if (!memo.pieces) memo.pieces = Object.freeze(piecesOf(h, true));
  return memo.pieces;
}
function piecesOf(h: Hole, freeze: boolean): Hole[] {
  const { head: hd, tip: _t, ...plain } = h;
  if (!hd) return [h];
  const { a } = frameOf(h);
  const step: V3 = [h.centre[0], h.centre[1], h.centre[2]];
  step[a] += h.dir * hd.reach;
  const head: Hole = { ...plain, centre: [...h.centre], bit: [...h.bit], radius: hd.radius, depth: hd.reach, reach: hd.reach, through: false };
  if (hd.kind === 'countersink') head.tip = h.radius;
  const bore: Hole = { ...plain, centre: step, bit: [...h.bit], depth: h.depth - hd.reach, reach: h.reach - hd.reach };
  return freeze ? [freezePiece(head), freezePiece(bore)] : [head, bore];
}
const freezePiece = (p: Hole): Hole => { Object.freeze(p.centre); Object.freeze(p.bit); return Object.freeze(p); };

/** holePieces with every frustum judged as its MOUTH cylinder (`tip` dropped): the conservative form the fault rules read
 *  for a countersink (spec §6.3). Headless: `[h]`; a counterbore's are its pieces (the same array). Memoised as they are. */
export function holeEnvelope(h: Hole): readonly Hole[] {
  if (!h.head) return [h];
  const ps = holePieces(h);
  if (!ps.some((p) => p.tip !== undefined)) return ps;
  const env = () => ps.map((p) => {
    if (p.tip === undefined) return p;
    const { tip: _t, ...cyl } = p;
    return frozen(h) ? freezePiece({ ...cyl, centre: [...cyl.centre], bit: [...cyl.bit] }) : cyl;
  });
  if (!frozen(h)) return env();
  const memo = memoOf(h);
  if (!memo.envelope) memo.envelope = Object.freeze(env());
  return memo.envelope;
}

/** Every row's holes, rows in stored order. */
export function boardHoles(board: Pick<Board, Dimension | 'holes'>): Hole[] {
  return board.holes.flatMap((r) => holeInstances(board, r));
}

/**
 * Per-hole derived geometry at the default HOLE_SEGMENTS, memoised by Hole OBJECT identity (Task 11b: a rebuild asks for
 * the same prism once per face and the same ring once per wall and face). Only a FROZEN hole is memoised — the hole, its
 * `centre` and its `bit`, its nested fields, as partGeometry's deep freeze leaves them — so a hole that could still change
 * never answers from a stale entry; any other hole, or another `n`, computes
 * fresh. A memoised result is shared, so it is returned frozen (array, planes, normals and points alike).
 */
interface HoleMemo { loop?: V3[]; prism?: Plane[]; bottom?: V3[]; rings: Map<number, V3[]>; pieces?: readonly Hole[]; envelope?: readonly Hole[] }
const holeMemo = new WeakMap<Hole, HoleMemo>();
/**
 * What touchesPrism knows of a prism built here, beside its planes: the hole's in-plane axes and centre (to try the
 * facet facing a polygon first) and the hole's bounding box — axially the caps' span (PRISM_EPS out), across ±radius,
 * which holds every facet's vertices.
 */
interface PrismInfo { u: number; v: number; cu: number; cv: number; lo: V3; hi: V3 }
const prismInfo = new WeakMap<Plane[], PrismInfo>();
function memoOf(h: Hole): HoleMemo {
  let m = holeMemo.get(h);
  if (!m) { m = { rings: new Map() }; holeMemo.set(h, m); }
  return m;
}
const frozen = (h: Hole) => Object.isFrozen(h) && Object.isFrozen(h.centre) && Object.isFrozen(h.bit) && (h.head === undefined || Object.isFrozen(h.head));
const freezeRing = (r: V3[]): V3[] => { r.forEach((p) => Object.freeze(p)); return Object.freeze(r) as V3[]; };
const freezePrism = (ps: Plane[]): Plane[] => {
  ps.forEach((q) => { Object.freeze(q.n); Object.freeze(q); });
  return Object.freeze(ps) as Plane[];
};

/**
 * The ring at axial distance `t` from the entry plane: `n` points on the true circle, θ_k = 2πk/n from +u toward +v. A
 * tilted bore's ring is where its cylinder meets that face-parallel plane, an ellipse: the circle square to the bit,
 * `c + t·bit + r·w_k`, each vertex slid along the bit back onto the plane, `+ λ_k·bit` with `λ_k = −dir·(r·w_k)[a]` (the
 * bit's axial component is exactly `dir`), so the vertex stays `r` from the bit's line and the face, wall and rim share it.
 */
export function holeRing(h: Hole, t: number, n = HOLE_SEGMENTS): V3[] {
  if (n !== HOLE_SEGMENTS || !frozen(h)) return ringOf(h, t, n);
  const memo = memoOf(h);
  let r = memo.rings.get(t);
  if (!r) { r = freezeRing(ringOf(h, t, n)); memo.rings.set(t, r); }
  return r;
}
function ringOf(h: Hole, t: number, n: number): V3[] {
  if (tilted(h)) return tiltedRingOf(h, t, n, true);
  const { a, u, v } = frameOf(h);
  const r = radiusAt(h, t);
  return Array.from({ length: n }, (_, k) => {
    const th = (2 * Math.PI * k) / n;
    const p: V3 = [h.centre[0], h.centre[1], h.centre[2]];
    p[a] += h.dir * t;
    p[u] += r * Math.cos(th);
    p[v] += r * Math.sin(th);
    return p;
  });
}

/**
 * The intersection loop of a BOLT bore with its cam's cylinder (cam-and-bolt spec §3.3): each vertex k of the mouth ring has
 * its `b`-coordinate (the bolt's axis) moved to where the cam's wall is, `F.centre[b] − dir·√(R² − (p[c] − F.centre[c])²)`.
 * Index-aligned with `holeRing(bolt, 0, n)`, so a band from ring to loop is ruled along the bit. A pure function of the
 * bolt's geometry and `bolt.mate` (row and index are never read), memoised per frozen hole at the default `n`.
 */
export function camLoop(bolt: Hole, n = HOLE_SEGMENTS): V3[] {
  if (n !== HOLE_SEGMENTS || !frozen(bolt)) return loopOf(bolt, n);
  const memo = memoOf(bolt);
  if (!memo.loop) memo.loop = freezeRing(loopOf(bolt, n));
  return memo.loop;
}
function loopOf(bolt: Hole, n: number): V3[] {
  const F = bolt.mate!;
  const b = idx(bolt.axis);
  const c = 3 - idx(F.axis) - b;
  return ringOf(bolt, 0, n).map((p) => {
    p[b] = F.centre[b]! - bolt.dir * Math.sqrt(F.radius * F.radius - (p[c]! - F.centre[c]!) ** 2);
    return p;
  });
}

/**
 * The partner of a paired hole, rebuilt from `h.mate`: square, blind, `bit` the unit vector `dir` along its `axis`,
 * `reach = depth`, carrying its own `mate` back at `h` (role flipped). `row` is '' and `index` -1: PLACEHOLDERS, nothing that
 * reads a mate hole may use them. Not frozen, so never memoised. `camLoop(mateHole(cam))` is bit for bit `camLoop(bolt)`.
 */
export function mateHole(h: Hole): Hole {
  const m = h.mate!;
  const bit: V3 = [0, 0, 0];
  bit[idx(m.axis)] = m.dir;
  return {
    row: '', index: -1, axis: m.axis, dir: m.dir, centre: [m.centre[0], m.centre[1], m.centre[2]], radius: m.radius,
    depth: m.depth, through: false, bit, reach: m.depth,
    mate: { role: m.role === 'cam' ? 'bolt' : 'cam', axis: h.axis, dir: h.dir, centre: [h.centre[0], h.centre[1], h.centre[2]], radius: h.radius, depth: h.depth },
  };
}

/** The radius at axial `t`: `radius` for a cylinder; a frustum piece's interpolated linearly from `radius` (t = 0) to `tip`
 *  (t = depth), each end EXACT (a cone's far ring and the bore's mouth ring are the same points). */
function radiusAt(h: Hole, t: number): number {
  if (h.tip === undefined || t === 0) return h.radius;
  if (t === h.depth) return h.tip;
  return h.radius + ((h.tip - h.radius) * t) / h.depth;
}

/** A tilted bore's ring: slid to the face-parallel plane at axial `t` (`slide`), or the circle square to the bit at `t`. */
function tiltedRingOf(h: Hole, t: number, n: number, slide: boolean): V3[] {
  const { a } = frameOf(h);
  const { w1, w2 } = boreFrame(h);
  const c = h.centre; const m = h.bit;
  return Array.from({ length: n }, (_, k) => {
    const th = (2 * Math.PI * k) / n;
    const co = h.radius * Math.cos(th); const si = h.radius * Math.sin(th);
    const w: V3 = [co * w1[0] + si * w2[0], co * w1[1] + si * w2[1], co * w1[2] + si * w2[2]];
    const s = t + (slide ? -h.dir * w[a]! : 0);
    return [c[0] + s * m[0] + w[0], c[1] + s * m[1] + w[1], c[2] + s * m[2] + w[2]];
  });
}

/**
 * A blind bore's bottom ring, the circle square to the bit at the bottom disc's centre (`reach` along the bit, `depth`
 * from the mouth centre). A square hole's IS `holeRing(h, h.depth)`, the same array. Memoised in its own slot.
 */
export function holeBottom(h: Hole, n = HOLE_SEGMENTS): V3[] {
  if (!tilted(h)) return holeRing(h, h.depth, n);
  if (n !== HOLE_SEGMENTS || !frozen(h)) return tiltedRingOf(h, h.reach, n, false);
  const memo = memoOf(h);
  if (!memo.bottom) memo.bottom = freezeRing(tiltedRingOf(h, h.reach, n, false));
  return memo.bottom;
}

/**
 * The rendered cylinder as half-spaces whose kept sides are its inside: one per side facet (facet k between ring vertices
 * k and k+1, at distance r·cos(π/n) from the axis), then the entry cap, then the bottom cap — each cap pushed OUT by
 * PRISM_EPS (see there). A tilted bore's facets are parallel to its bit (facet k still between ring vertices k and k+1);
 * its entry cap is the face plane, its far cap the exit face (through) or the bottom disc's plane, square to the bit.
 */
export function holePrism(h: Hole, n = HOLE_SEGMENTS): Plane[] {
  if (n !== HOLE_SEGMENTS || !frozen(h)) return prismOf(h, n);
  const memo = memoOf(h);
  if (!memo.prism) memo.prism = freezePrism(prismOf(h, n));
  return memo.prism;
}
function prismOf(h: Hole, n: number): Plane[] {
  if (tilted(h)) return tiltedPrismOf(h, n);
  const { a, u, v } = frameOf(h);
  const out: Plane[] = [];
  const ax: V3 = [0, 0, 0];
  ax[a] = h.dir;
  if (h.tip !== undefined) return frustumPrismOf(h, n, out, ax);
  const inner = h.radius * Math.cos(Math.PI / n);
  for (let k = 0; k < n; k += 1) {
    const phi = (2 * Math.PI * (k + 0.5)) / n;
    const radial: V3 = [0, 0, 0];
    radial[u] = Math.cos(phi);
    radial[v] = Math.sin(phi);
    out.push({ n: [-radial[0], -radial[1], -radial[2]], d: inner + dot(radial, h.centre) });
  }
  out.push({ n: ax, d: -h.dir * h.centre[a] + PRISM_EPS });                                         // t ≥ -ε
  out.push({ n: [-ax[0], -ax[1], -ax[2]], d: h.dir * h.centre[a] + h.depth + PRISM_EPS });          // t ≤ depth + ε
  const lo: V3 = [h.centre[0] - h.radius, h.centre[1] - h.radius, h.centre[2] - h.radius];
  const hi: V3 = [h.centre[0] + h.radius, h.centre[1] + h.radius, h.centre[2] + h.radius];
  const end = h.centre[a] + h.dir * h.depth;
  lo[a] = Math.min(h.centre[a], end) - PRISM_EPS;
  hi[a] = Math.max(h.centre[a], end) + PRISM_EPS;
  prismInfo.set(out, { u, v, cu: h.centre[u], cv: h.centre[v], lo, hi });
  return out;
}
/**
 * A frustum piece's prism (a countersink's head): facet k the plane through ring vertices k and k+1 at the mouth (radius
 * R) and at the far end (radius `tip`), so the polygon is inscribed in the true cone as a cylinder's is in its circle —
 * inside means `s ≤ cos(π/n)·ρ(t)` with `s` the radial offset and ρ the interpolated radius, normalised to a unit normal.
 * The caps as a cylinder's. The box is ±max(R, tip) across, widened by what a facet gains over the caps' ε, so it holds
 * every vertex of the polytope (the mouth ring included).
 */
function frustumPrismOf(h: Hole, n: number, out: Plane[], ax: V3): Plane[] {
  const { a, u, v } = frameOf(h);
  const c = Math.cos(Math.PI / n);
  const slope = (h.tip! - h.radius) / h.depth;                                 // dρ/dt
  const m = Math.hypot(1, c * slope);
  for (let k = 0; k < n; k += 1) {
    const phi = (2 * Math.PI * (k + 0.5)) / n;
    const radial: V3 = [0, 0, 0];
    radial[u] = Math.cos(phi);
    radial[v] = Math.sin(phi);
    // c·R + c·slope·t − s ≥ 0, with t = dir·(x_a − c_a) and s = radial·(x − centre).
    const nv: V3 = [-radial[0], -radial[1], -radial[2]];
    nv[a] += c * slope * h.dir;
    const d = c * h.radius + dot(radial, h.centre) - c * slope * h.dir * h.centre[a];
    out.push({ n: [nv[0] / m, nv[1] / m, nv[2] / m], d: d / m });
  }
  out.push({ n: ax, d: -h.dir * h.centre[a] + PRISM_EPS });                                         // t ≥ -ε
  out.push({ n: [-ax[0], -ax[1], -ax[2]], d: h.dir * h.centre[a] + h.depth + PRISM_EPS });          // t ≤ depth + ε
  const w = Math.max(h.radius, h.tip!) + Math.abs(slope) * PRISM_EPS;
  const lo: V3 = [h.centre[0] - w, h.centre[1] - w, h.centre[2] - w];
  const hi: V3 = [h.centre[0] + w, h.centre[1] + w, h.centre[2] + w];
  const end = h.centre[a] + h.dir * h.depth;
  lo[a] = Math.min(h.centre[a], end) - PRISM_EPS;
  hi[a] = Math.max(h.centre[a], end) + PRISM_EPS;
  prismInfo.set(out, { u, v, cu: h.centre[u], cv: h.centre[v], lo, hi });
  return out;
}

function tiltedPrismOf(h: Hole, n: number): Plane[] {
  const { a, u, v } = frameOf(h);
  const { b, w1, w2 } = boreFrame(h);
  const out: Plane[] = [];
  const inner = h.radius * Math.cos(Math.PI / n);
  for (let k = 0; k < n; k += 1) {
    const phi = (2 * Math.PI * (k + 0.5)) / n;
    const co = Math.cos(phi); const si = Math.sin(phi);
    const radial: V3 = [co * w1[0] + si * w2[0], co * w1[1] + si * w2[1], co * w1[2] + si * w2[2]];
    out.push({ n: [-radial[0], -radial[1], -radial[2]], d: inner + dot(radial, h.centre) });
  }
  const ax: V3 = [0, 0, 0];
  ax[a] = h.dir;
  out.push({ n: ax, d: -h.dir * h.centre[a] + PRISM_EPS });                                         // t ≥ -ε
  if (h.through) out.push({ n: [-ax[0], -ax[1], -ax[2]], d: h.dir * h.centre[a] + h.reach + PRISM_EPS });
  else out.push({ n: [-b[0], -b[1], -b[2]], d: dot(b, h.centre) + h.depth + PRISM_EPS });           // along the bit ≤ depth + ε
  // The true cylinder's box holds every facet vertex (they lie on it); a cap pushed ε out moves a vertex ε·|bit_i| ≤ ε.
  const { lo, hi } = tiltedBox(h);
  for (let i = 0; i < 3; i += 1) { lo[i] -= PRISM_EPS; hi[i] += PRISM_EPS; }
  prismInfo.set(out, { u, v, cu: h.centre[u], cv: h.centre[v], lo, hi });
  return out;
}

/** Keep the part of a convex planar polygon where n·x + d ≥ 0 (Sutherland–Hodgman). A vertex within HOLE_EPS of the
 *  plane is ON it and kept. Fewer than three points: []. Returns the SAME array when nothing is cut away. */
export function clipPolygon(verts: V3[], h: Plane): V3[] {
  return clipScalar(verts, h.n[0], h.n[1], h.n[2], h.d);
}

/**
 * clipPolygon on a plane given as four numbers (chunk c1: minusCover's planes need no Plane object). Each vertex's side is
 * `n0 * p[0] + n1 * p[1] + n2 * p[2] + d` — the expression clipPolygon always used, so the same float every time it is
 * evaluated: the first pass stops at the first vertex cut away (all kept: the same array back), and the second evaluates
 * each vertex's side again rather than keeping an array of them (Task 11b's `gs`; recomputing gives the same numbers).
 */
function clipScalar(verts: V3[], n0: number, n1: number, n2: number, d: number): V3[] {
  const len = verts.length;
  let kept = true;
  for (let i = 0; i < len; i += 1) {
    const p = verts[i]!;
    if (!(n0 * p[0] + n1 * p[1] + n2 * p[2] + d >= -HOLE_EPS)) { kept = false; break; }
  }
  if (kept) return verts;
  const out: V3[] = [];
  const p0 = verts[0]!;
  let a = p0;
  let ga = n0 * a[0] + n1 * a[1] + n2 * a[2] + d;
  for (let i = 0; i < len; i += 1) {
    const b = i + 1 < len ? verts[i + 1]! : p0;
    const gb = n0 * b[0] + n1 * b[1] + n2 * b[2] + d;
    if (ga >= -HOLE_EPS) out.push(a);
    if ((ga > HOLE_EPS && gb < -HOLE_EPS) || (ga < -HOLE_EPS && gb > HOLE_EPS)) {
      const t = ga / (ga - gb);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])]);
    }
    a = b;
    ga = gb;
  }
  return out.length >= 3 ? out : [];
}

/**
 * The planes that can change ANY convex polygon whose vertices are among `verts` or on segments between them, when it is
 * clipped by `planes` in turn (clipPolygon) — or null when such a polygon always clips to nothing (Task 11b: one answer
 * for all of a hole's wall quads and its bottom, per body). Clipping by the returned planes, in order, gives exactly
 * what clipping by all of them gives:
 * - a plane keeping every vertex within -HOLE_EPS / 2 keeps every point between them within -HOLE_EPS / 2 too (up to
 *   rounding, far below the margin), inside clipPolygon's -HOLE_EPS band, so clipPolygon returns such a polygon
 *   unchanged — it is left out;
 * - a plane with every vertex beyond -2·HOLE_EPS has every such point beyond -HOLE_EPS, where clipPolygon keeps nothing
 *   (and stops) — null.
 */
export function clipPlan(planes: readonly Plane[], verts: readonly V3[]): Plane[] | null {
  const out: Plane[] = [];
  for (const q of planes) {
    let allOut = true;
    let allIn = true;
    for (const p of verts) {
      const g = dot(q.n, p) + q.d;
      if (!(g >= -HOLE_EPS / 2)) allIn = false;
      if (!(g < -2 * HOLE_EPS)) allOut = false;
    }
    if (allOut) return null;
    if (!allIn) out.push(q);
  }
  return out;
}

const flipPlane = (h: Plane): Plane => ({ n: [-h.n[0], -h.n[1], -h.n[2]], d: -h.d });

/** Twice-area > this: a piece thinner than a sliver is no piece (bodies.ts' SLIVER, squared). */
const MIN_AREA = 1e-12;
function twiceArea(p: V3[]): number {
  // Chunk c1: the same expressions as before (e = p[i] − p[0], f = p[i+1] − p[0], x += e1·f2 − e2·f1, …), as scalars.
  let x = 0; let y = 0; let z = 0;
  const q = p[0]!;
  const q0 = q[0], q1 = q[1], q2 = q[2];
  for (let i = 1; i + 1 < p.length; i += 1) {
    const a = p[i]!, b = p[i + 1]!;
    const e0 = a[0] - q0, e1 = a[1] - q1, e2 = a[2] - q2;
    const f0 = b[0] - q0, f1 = b[1] - q1, f2 = b[2] - q2;
    x += e1 * f2 - e2 * f1; y += e2 * f0 - e0 * f2; z += e0 * f1 - e1 * f0;
  }
  return Math.hypot(x, y, z);
}

/** True when the hole reaches into the polygon: their bounding boxes meet (closed, HOLE_EPS), and no plane of the
 *  prism has the whole polygon on or outside it. */
export function holeTouches(h: Hole, poly: V3[]): boolean {
  return touchesPrism(holePrism(h), poly);
}
/**
 * The prism-touch test (Task 11b). First a bounding-box reject for a prism built here (ruling R10): a polygon whose box
 * misses the hole's by more than HOLE_EPS is untouched. The plane test alone over-reports — a long face beside a hole
 * but clear of it is on the inside of every single plane — and such a face used to be split for nothing (ruling R10
 * accepts the new, unsplit triangulation there; the covered area is the same). Then the separating-plane test, whose
 * answer does not depend on the order the planes are tried in, so the likeliest separators go first: the caps
 * (holePrism puts them last), then the facet facing the polygon's centroid, then the rest.
 */
function touchesPrism(prism: Plane[], poly: V3[]): boolean {
  const m = prism.length;
  const info = prismInfo.get(prism);
  if (info) {
    for (let i = 0; i < 3; i += 1) {
      let min = Infinity; let max = -Infinity;
      for (const p of poly) { if (p[i]! < min) min = p[i]!; if (p[i]! > max) max = p[i]!; }
      if (min > info.hi[i]! + HOLE_EPS || max < info.lo[i]! - HOLE_EPS) return false;
    }
  }
  if (m >= 2 && (separates(prism[m - 1]!, poly) || separates(prism[m - 2]!, poly))) return false;
  let best = -1;
  if (info) {
    const { u, v } = info;
    let cu = 0; let cv = 0;
    for (const p of poly) { cu += p[u]!; cv += p[v]!; }
    const th = Math.atan2(cv / poly.length - info.cv, cu / poly.length - info.cu);
    const k = Math.floor(((th < 0 ? th + 2 * Math.PI : th) * (m - 2)) / (2 * Math.PI));
    best = k >= 0 && k < m - 2 ? k : -1;
  }
  if (best >= 0 && separates(prism[best]!, poly)) return false;
  for (let i = 0; i < m - 2; i += 1) if (i !== best && separates(prism[i]!, poly)) return false;
  return true;
}
function separates(q: Plane, poly: V3[]): boolean {
  for (const p of poly) if (!(dot(q.n, p) + q.d <= HOLE_EPS)) return false;
  return true;
}

/**
 * A convex planar polygon minus a convex prism, as DISJOINT convex pieces: piece i is the polygon outside plane i and
 * inside planes 0…i-1. A polygon the prism misses comes back whole (the same array). The fallback split (spec §3.2,
 * amended): it leaves T-junctions where a piece's edge passes ring vertices, so a face whose rings sit strictly inside
 * it is triangulated with them as holes instead (grainTiling's faceTriangles).
 */
export function minusPrism(poly: V3[], prism: Plane[]): V3[][] {
  if (!touchesPrism(prism, poly)) return [poly];
  const out: V3[][] = [];
  let rest = poly;
  for (const q of prism) {
    const outside = clipPolygon(rest, flipPlane(q));
    if (outside.length && twiceArea(outside) > MIN_AREA) out.push(outside);
    rest = clipPolygon(rest, q);
    if (!rest.length) break;
  }
  return out;
}

/**
 * A convex planar polygon minus a convex COPLANAR polygon `cover` (the face normal `n` is shared), as disjoint convex
 * pieces: piece i is the polygon outside cover edge i and inside edges 0…i-1, a piece under MIN_AREA dropped (an edge
 * the two share would otherwise leave an on-the-line sliver). A polygon the cover does not overlap comes back as the
 * same array, alone. Each edge's inside is decided by the cover's centroid, not its winding (a seam's cover faces the
 * other way). Ruling R11's seam faces (grainTiling's bodyMesh).
 */
export function minusCover(poly: V3[], n: V3, cover: readonly V3[]): V3[][] {
  // Chunk c1: scalars throughout, the same expressions in the same order (the centroid a sum from 0 then a division; m
  // = n × e, divided by its hypot, flipped toward the centroid by dot's left-to-right sum; d = −(m·a)); the flipped plane
  // is (−m, −d), the numbers flipPlane gave.
  const k = cover.length;
  let c0 = 0, c1 = 0, c2 = 0;
  for (let j = 0; j < k; j += 1) c0 += cover[j]![0];
  for (let j = 0; j < k; j += 1) c1 += cover[j]![1];
  for (let j = 0; j < k; j += 1) c2 += cover[j]![2];
  c0 /= k; c1 /= k; c2 /= k;
  const n0 = n[0], n1 = n[1], n2 = n[2];
  const out: V3[][] = [];
  let rest = poly;
  for (let i = 0; i < k; i += 1) {
    const a = cover[i]!;
    const b = cover[(i + 1) % k]!;
    const e0 = b[0] - a[0], e1 = b[1] - a[1], e2 = b[2] - a[2];
    let m0 = n1 * e2 - n2 * e1, m1 = n2 * e0 - n0 * e2, m2 = n0 * e1 - n1 * e0;
    const l = Math.hypot(m0, m1, m2);
    if (!(l > 0)) continue;
    m0 /= l; m1 /= l; m2 /= l;
    if (m0 * (c0 - a[0]) + m1 * (c1 - a[1]) + m2 * (c2 - a[2]) < 0) { m0 = -m0; m1 = -m1; m2 = -m2; }
    const d = -(m0 * a[0] + m1 * a[1] + m2 * a[2]);
    const outside = clipScalar(rest, -m0, -m1, -m2, -d);
    if (outside === rest) return out.length ? [...out, rest] : [poly];
    if (outside.length && twiceArea(outside) > MIN_AREA) out.push(outside);
    rest = clipScalar(rest, m0, m1, m2, d);
    if (!rest.length) return out;
  }
  return out;
}

/** The face's axial distance from the hole's entry plane when the face is perpendicular to the axis, else null. Faces
 *  square to the FACE axis: a tilted bore's rings lie on face-parallel planes too (holeRing), so it holds for them. */
export function axialOffset(h: Hole, face: { n: V3; verts: V3[] }): number | null {
  const { a } = frameOf(h);
  if (Math.abs(Math.abs(face.n[a]) - 1) > HOLE_EPS) return null;
  return h.dir * (face.verts[0]![a] - h.centre[a]);
}

/** Every ring vertex strictly inside the convex polygon (by more than HOLE_EPS from each edge). */
export function ringInside(poly: V3[], n: V3, ring: V3[]): boolean {
  const c: V3 = [0, 1, 2].map((k) => poly.reduce((s, p) => s + p[k]!, 0) / poly.length) as V3;
  return poly.every((a, i) => {
    const b = poly[(i + 1) % poly.length]!;
    const e: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    let m: V3 = [n[1] * e[2] - n[2] * e[1], n[2] * e[0] - n[0] * e[2], n[0] * e[1] - n[1] * e[0]];
    const l = Math.hypot(...m);
    m = [m[0] / l, m[1] / l, m[2] / l];
    if (dot(m, [c[0] - a[0], c[1] - a[1], c[2] - a[2]]) < 0) m = [-m[0], -m[1], -m[2]];
    // dot(m, p - a), written out: it runs for every ring vertex against every edge (Task 11b), the same arithmetic.
    for (const p of ring) if (!(m[0] * (p[0] - a[0]) + m[1] * (p[1] - a[1]) + m[2] * (p[2] - a[2]) > HOLE_EPS)) return false;
    return true;
  });
}

/** A convex body's faces as inside half-spaces (closed): the wall and bottom are clipped to the stock with these. */
export function bodyPlanes(faces: readonly { n: V3; verts: V3[] }[]): Plane[] {
  // A frozen face list (partGeometry's bodies) is asked for once per hole of the part: memoised by identity, frozen.
  if (!Object.isFrozen(faces)) return planesOf(faces);
  let ps = planesMemo.get(faces);
  if (!ps) { ps = freezePrism(planesOf(faces)); planesMemo.set(faces, ps); }
  return ps;
}
const planesMemo = new WeakMap<readonly unknown[], Plane[]>();
function planesOf(faces: readonly { n: V3; verts: V3[] }[]): Plane[] {
  return faces.map((f) => ({ n: [-f.n[0], -f.n[1], -f.n[2]], d: dot(f.n, f.verts[0]!) }));
}

/** Rim segments (spec §3.3, amended): the entry ring, and the ring at the far end — the exit rim of a through hole, the
 *  bottom crease of a blind one (a tilted bore's bottom disc, square to the bit). Closed loops. A whole headed hole: every
 *  piece's rims (a counterbore's step adds the annulus' two rings), a countersink's cone/bore junction ring once. */
export function holeRims(h: Hole): [V3, V3][] {
  if (h.head) {
    // Every piece's rims; a countersink's cone ends on the bore's mouth ring (the same points), drawn once.
    // A bore piece with no length (a through head that outruns the part: a kept too-deep fault) is air: no rings (inv 16).
    const [head, bore] = holePieces(h) as [Hole, Hole];
    const bored = bore.depth > HOLE_EPS;
    const loops = head.tip !== undefined ? [holeRing(head, 0), holeRing(head, head.depth), ...(bored ? [holeRing(bore, bore.depth)] : [])]
      : [holeRing(head, 0), holeRing(head, head.depth), ...(bored ? [holeRing(bore, 0), holeRing(bore, bore.depth)] : [])];
    return loops.flatMap((r) => r.map((p, i) => [p, r[(i + 1) % r.length]!] as [V3, V3]));
  }
  // A bolt's far loop is the cam's wall, not its bottom ring (cam-and-bolt spec §3.3).
  if (h.mate?.role === 'cam') return [holeRing(h, 0), camLoop(h)].flatMap((r) => r.map((p, i) => [p, r[(i + 1) % r.length]!] as [V3, V3]));
  const far = !tilted(h) ? holeRing(h, h.depth) : h.through ? holeRing(h, h.reach) : holeBottom(h);
  return [holeRing(h, 0), far].flatMap((r) => r.map((p, i) => [p, r[(i + 1) % r.length]!] as [V3, V3]));
}

/** The bore's board-local box (joinery-holes spec §3.3): mouth to bottom along `axis`, centre ± radius across. Not clipped
 *  to the board; a through hole spans its whole dimension. A tilted bore's is its true cylinder's box (tiltedBox). */
export function holeRegion(h: Hole): Region {
  if (h.head) return headedRegion(h);
  const out = {} as Region;
  if (tilted(h)) {
    const { lo, hi } = tiltedBox(h);
    DIMENSION_ORDER.forEach((d, i) => { out[d] = [lo[i]!, hi[i]!]; });
    return out;
  }
  const { a } = frameOf(h);
  DIMENSION_ORDER.forEach((d, i) => {
    out[d] = i === a
      ? [Math.min(h.centre[a], h.centre[a] + h.dir * h.depth), Math.max(h.centre[a], h.centre[a] + h.dir * h.depth)]
      : [h.centre[i]! - h.radius, h.centre[i]! + h.radius];
  });
  return out;
}

/** A headed hole's box: the box of its pieces' boxes (±R across over the full depth). A reject test's box, conservative. */
function headedRegion(h: Hole): Region {
  const boxes = holePieces(h).map(holeRegion);
  const out = {} as Region;
  for (const d of DIMENSION_ORDER) {
    out[d] = [Math.min(...boxes.map((b) => b[d][0])), Math.max(...boxes.map((b) => b[d][1]))];
  }
  return out;
}

/** The hole's bounding box overlaps the region (closed). Conservative: it decides only whether a body leaves the box path.
 *  A headed hole's box is its pieces' (headedRegion). */
export function holeTouchesBox(h: Hole, r: Region): boolean {
  if (h.head) {
    const box = headedRegion(h);
    return DIMENSION_ORDER.every((d) => box[d][0] <= r[d][1] + HOLE_EPS && box[d][1] >= r[d][0] - HOLE_EPS);
  }
  if (tilted(h)) {
    const { lo, hi } = tiltedBox(h);
    return DIMENSION_ORDER.every((d, i) => lo[i]! <= r[d][1] + HOLE_EPS && hi[i]! >= r[d][0] - HOLE_EPS);
  }
  const { a } = frameOf(h);
  return DIMENSION_ORDER.every((d, i) => {
    const [lo, hi] = i === a
      ? [Math.min(h.centre[a], h.centre[a] + h.dir * h.depth), Math.max(h.centre[a], h.centre[a] + h.dir * h.depth)]
      : [h.centre[i]! - h.radius, h.centre[i]! + h.radius];
    return lo <= r[d][1] + HOLE_EPS && hi >= r[d][0] - HOLE_EPS;
  });
}

/** The mouth is air (spec §3.5, amended): within the radius (open: the rim is stock) and between the caps (closed). A
 *  frustum piece by its interpolated radius; a whole headed hole when inside ANY piece (exact). */
export function insideHole(h: Hole, p: V3): boolean {
  if (h.head) return holePieces(h).some((q) => insideHole(q, p));
  if (tilted(h)) return insideTilted(h, p);
  const { a, u, v } = frameOf(h);
  const t = h.dir * (p[a] - h.centre[a]);
  const r = h.tip === undefined ? h.radius : radiusAt(h, Math.min(Math.max(t, 0), h.depth));
  return t >= -HOLE_EPS && t <= h.depth + HOLE_EPS && Math.hypot(p[u] - h.centre[u], p[v] - h.centre[v]) < r - HOLE_EPS;
}

/** A tilted bore: past the entry plane, short of the far cap (the exit plane, or the bottom disc along the bit), and less
 *  than the radius from the bit's line — perpendicular distance, the line through the mouth centre. */
function insideTilted(h: Hole, p: V3): boolean {
  const { a } = frameOf(h);
  const q: V3 = [p[0] - h.centre[0], p[1] - h.centre[1], p[2] - h.centre[2]];
  const t = h.dir * q[a]!;
  if (t < -HOLE_EPS) return false;
  const mm2 = dot(h.bit, h.bit);
  const along = dot(q, h.bit);
  if (h.through ? t > h.reach + HOLE_EPS : along / Math.sqrt(mm2) > h.depth + HOLE_EPS) return false;
  const s = along / mm2;
  return Math.hypot(q[0] - s * h.bit[0], q[1] - s * h.bit[1], q[2] - s * h.bit[2]) < h.radius - HOLE_EPS;
}
