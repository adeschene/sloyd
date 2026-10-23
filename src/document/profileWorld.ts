import type { Board, CutFrom, ProfileCut, ProfileEnd, ProfileSide } from './types';
import { axisDimensions, endFacing, fromWorldOffset, toWorldOffset } from './geometry';
import { PROFILE_KINDS, canonicalRun, endPos, oneSide, profileAsymmetric, runDim } from './profiles';
import { holeSnap } from './holeWorld';
import { DIRS, dirToLocal, localToDir } from './taperWorld';
import type { Dir } from './taperWorld';
import type { WorldProfile } from './generated';

/**
 * Edge profiles in WORLD words (AI-profiles spec §2.1, §3.2–3.3, R6.2, R6.5): the design schema's form. The ONE place a
 * design profile crosses to a stored `ProfileCut` and back. Directions go through `dirToLocal`/`localToDir`, stations
 * through `fromWorldOffset`/`toWorldOffset` and `endFacing` (inv 44). A station's distance from its end of the run
 * (`at`) is the stored encoding within the part's own frame (as `endPos` reads it), not a part↔world crossing.
 * Model-facing text only (no `→ units`): every number in a fault is decimal inches.
 */

type Profile = Omit<ProfileCut, 'id'>;
const AXES = 'xyz';
const axisOf = (d: Dir) => AXES.indexOf(d[1]!);
/** How near 0 or the part's extent a model's own end value may sit and still be a THROUGH end (spec §2.1). */
const THROUGH_TOLERANCE = 1 / 32;
/** How near a hole-grid value a COMPUTED stored distance must be to be float noise: it takes the grid value (as holeWorld). */
const GRID_NOISE = 1e-9;
/** World stations compared by `sameWorldProfile`: the world → part → `L − at` chain drifts by an ulp or so. */
const STATION_EPS = 1e-9;

/** The part's two broad faces (on its thickness axis), in DIRS order. */
const broadFaces = (b: Board): [Dir, Dir] => {
  const pair = [localToDir(b, 'thickness', 'min'), localToDir(b, 'thickness', 'max')];
  return pair.sort((p, q) => DIRS.indexOf(p) - DIRS.indexOf(q)) as [Dir, Dir];
};

/**
 * Design profiles → stored profiles on `b` (oriented), each run in `canonicalRun` order and the list sorted in
 * PROFILE_FIELDS order; or the first SHAPE fault, as a phrase the caller prefixes with the part's name ("has a profile
 * on +x/+z, but its broad faces are +y and -y").
 *
 * `edge` is exactly two faces: one broad face (the stored `face`) and one side (the stored `ProfileSide`), in either
 * order. A side is any face off the thickness axis, so it is always perpendicular to the broad face; two faces on the
 * thickness axis (`+y/-y`, or one named twice) are the "two broad faces" fault, which is also every edge whose faces do
 * not meet. `allRound` is `{ loop: true }` (the side then only completes the edge; `start`/`end` are ignored).
 *
 * Ends (Global Constraints): EXACTLY 0 or EXACTLY the part's extent along the run is a THROUGH end; within 1/32in of either
 * is THROUGH only for a value not in `exact`; anything else is a station measured from the NEARER end of the run (ties
 * the part's `min`; a station past one end is measured from the other, so no position is a shape fault), its distance put on the hole grid (`holeSnap`) unless its source is in `exact` — but a COMPUTED
 * distance within 1e-9 of its grid value takes it even then. `size`, `fillet` and `depth` take the hole grid unless in
 * `exact`. Fields a kind ignores (a thumbnail's `fillet`, any other kind's `depth`, a symmetric kind's `facing`) are not
 * judged and not stored, as the loader stores them.
 *
 * The shape faults are exactly the loader's drop rules (`validateProfiles`), judged on the STORED values, plus the
 * design-form edge rules above; a fault quotes the value judged (after the grid). A zero-length or reversed station run, or a station past an end, is not one: it stores (`canonicalRun` orders it;
 * a zero-length one is the strict `stop-off`). Strict faults (`profileFaults`) are not judged here.
 */
export function profilesFor(b: Board, entries: readonly WorldProfile[], exact?: ReadonlySet<number>): { profiles: Profile[] } | { fault: string } {
  const snap = (v: number) => (exact?.has(v) === true ? v : holeSnap(v));
  /** A stored distance computed from world value `src`; never -0. */
  const dist = (v: number, src: number) => {
    const g = holeSnap(v);
    // An exact source keeps its value; the L − at chain's ulp of drift is rounded off (1e-12 of an inch), so a turn and its
    // turn back return the same number.
    const out = Math.abs(g - v) <= GRID_NOISE || exact?.has(src) !== true ? g : Math.round(v * 1e12) / 1e12;
    return out === 0 ? 0 : out;
  };
  const out: Profile[] = [];
  for (const e of entries) {
    const edge: unknown[] = Array.isArray(e.edge) ? e.edge : [];
    if (!edge.every((d) => DIRS.includes(d as Dir))) return { fault: `has a profile on ${edge.map(String).join('/')}, which is not a pair of directions` };
    const dirs = edge as Dir[];
    const on = `has a profile on ${dirs.join('/')}`;
    const [b0, b1] = broadFaces(b);
    const broad = dirs.filter((d) => dirToLocal(b, d).dim === 'thickness');
    if (dirs.length !== 2) return { fault: `${on}, but an edge is two faces: one broad face (${b0} or ${b1}) and one side` };
    if (broad.length === 0) return { fault: `${on}, but its broad faces are ${b0} and ${b1}` };
    if (broad.length === 2) return { fault: `${on}, two broad faces that meet at no edge; an edge is one broad face (${b0} or ${b1}) and one side` };
    if (!PROFILE_KINDS.includes(e.kind)) return { fault: `${on} of kind ${String(e.kind)}, which is not a profile kind` };
    if (e.facing !== 'face' && e.facing !== 'edge') return { fault: `${on} facing ${String(e.facing)}, which is neither face nor edge` };
    const thumb = e.kind === 'thumbnail';
    const raw = [e.size, thumb ? e.depth : e.fillet, ...(e.allRound ? [] : [e.start, e.end])];
    if (!raw.every((v) => typeof v === 'number' && Number.isFinite(v))) return { fault: `${on} with a number that is not finite` };
    const size = snap(e.size);
    const detail = snap(thumb ? e.depth : e.fillet);
    // After the grid (as holeRowsFor): a huge finite input snaps to Infinity, which the loader would drop without a word.
    if (!Number.isFinite(size) || !Number.isFinite(detail)) return { fault: `${on} with a number too large to store` };
    if (!(size > 0)) return { fault: `${on} whose size (${size}) is not above 0` };
    if (thumb && !(detail > 0 && detail < size)) return { fault: `${on} whose depth (${detail}) is not above 0 and below its size (${size})` };
    if (!thumb && !(detail >= 0)) return { fault: `${on} whose fillet (${detail}) is negative` };
    if (e.kind === 'bead' && !(detail > 0)) return { fault: `${on} whose fillet (${detail}) is not above 0; a bead's quirk must be` };
    const fields = { kind: e.kind, size, ...(thumb ? { depth: detail } : { fillet: detail }) };
    const facing = profileAsymmetric(fields) ? e.facing : 'face';
    const sideDir = dirs.find((d) => d !== broad[0])!;
    const faceLocal = dirToLocal(b, broad[0]!);
    const sideLocal = dirToLocal(b, sideDir);
    const side: ProfileSide = { across: sideLocal.dim as ProfileSide['across'], from: sideLocal.from };
    if (e.allRound) {
      out.push({ face: faceLocal.from, ...fields, facing, run: { loop: true } });
      continue;
    }
    const rd = runDim(side);
    const axis = axisDimensions(b).indexOf(rd);
    const L = b[rd];
    const endOf = (v: number): ProfileEnd | { fault: string } => {
      const nearMin = Math.abs(v) <= Math.abs(v - L);
      const through = v === 0 || v === L || (exact?.has(v) !== true && Math.abs(nearMin ? v : v - L) <= THROUGH_TOLERANCE);
      if (through) return { side: { ...side }, through: endFacing(b, axis, nearMin ? -1 : 1) };
      // Measured from the nearer end of the run, in the part's own frame; both distances on the grid before the choice. A
      // station PAST one end (a resize can leave one: stations are kept, the fault noted) is measured from the other end, so
      // its `at` is never negative and the loader keeps it (B3); the strict `stop-off`/`runs-off` checks judge it, never this.
      const u = fromWorldOffset(b, axis, v);
      const fromMin = dist(u, v);
      const fromMax = dist(L - u, v);
      const [from, at]: [CutFrom, number] = fromMin < 0 ? ['max', fromMax] : fromMax < 0 ? ['min', fromMin]
        : fromMin <= fromMax ? ['min', fromMin] : ['max', fromMax];
      if (!Number.isFinite(at)) return { fault: `${on} with a number too large to store` };
      return { side: { ...side }, from, at };
    };
    const start = endOf(e.start);
    if ('fault' in start) return start;
    const end = endOf(e.end);
    if ('fault' in end) return end;
    if ('through' in start && 'through' in end && start.through === end.through) {
      return { fault: `${on} whose start (${e.start}) and end (${e.end}) are both at the same end of the edge` };
    }
    out.push({ face: faceLocal.from, ...fields, facing, run: canonicalRun(b, faceLocal.from, { start, end }) });
  }
  return { profiles: sortProfiles(out) };
}

type Key = (string | number)[];
const compareKeys = (a: Key, c: Key): number => {
  for (let i = 0; i < Math.max(a.length, c.length); i += 1) {
    const p = a[i];
    const q = c[i];
    if (p === q) continue;
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    if (typeof p === 'number' && typeof q === 'number') return p - q;
    if (typeof p === 'number') return -1;
    if (typeof q === 'number') return 1;
    return p < q ? -1 : 1;
  }
  return 0;
};
const endKey = (e: ProfileEnd): Key => ['through' in e ? `${e.side.across}:${e.side.from}:t${e.through}` : `${e.side.across}:${e.side.from}:${e.from}`, 'at' in e ? e.at : -1];
/** PROFILE_FIELDS order (face, kind, size, depth, fillet, facing, run): strings lexicographically, numbers numerically,
 *  an absent number first; a loop before any run with ends. */
const storedKey = (p: Profile): Key => [
  p.face, p.kind, p.size, p.depth ?? -1, p.fillet ?? -1, p.facing,
  ...('loop' in p.run ? [0] : [1, ...endKey(p.run.start), ...endKey(p.run.end)]),
];
export function sortProfiles<T extends Profile>(ps: readonly T[]): T[] {
  return [...ps].sort((x, y) => compareKeys(storedKey(x), storedKey(y)));
}

/** One stored profile in design form, or null for a run with ends on two sides (carried, never authored: spec R6.3). */
function worldOf(b: Board, p: Profile): WorldProfile | null {
  const fields = { kind: p.kind, size: p.size, fillet: p.fillet ?? 0, depth: p.depth ?? 0, facing: p.facing };
  const face = localToDir(b, 'thickness', p.face);
  if ('loop' in p.run) {
    // A loop's side only completes the edge: the first direction (DIRS order) off the thickness axis.
    const side = DIRS.find((d) => axisOf(d) !== axisOf(face))!;
    return { edge: [face, side], ...fields, allRound: true, start: 0, end: 0 };
  }
  if (!oneSide(p.run)) return null;
  const side = p.run.start.side;
  const axis = axisDimensions(b).indexOf(runDim(side));
  const ws = toWorldOffset(b, axis, endPos(b, p.run.start));
  const we = toWorldOffset(b, axis, endPos(b, p.run.end));
  return { edge: [face, localToDir(b, side.across, side.from)], ...fields, allRound: false, start: Math.min(ws, we), end: Math.max(ws, we) };
}

const designKey = (w: WorldProfile): Key => [
  DIRS.indexOf(w.edge[0]!), DIRS.indexOf(w.edge[1]!), PROFILE_KINDS.indexOf(w.kind), w.size, w.fillet, w.depth, w.facing,
  w.allRound ? 1 : 0, w.start, w.end,
];

/**
 * A part's profiles in design form (spec §3.3), sorted canonically; null when any run has ends on two sides (spec §4.2,
 * R6.3: such a part's profiles are carried). `edge` is [broad face, side]; `start` ≤ `end`, world offsets from the part's
 * min corner along the axis the edge runs on (a THROUGH end exactly 0 or the extent). A loop is `allRound` with
 * `start`/`end` 0. A field the kind ignores reads 0 (`fillet` on a thumbnail, `depth` elsewhere).
 */
export function worldProfiles(b: Board): WorldProfile[] | null {
  const out: WorldProfile[] = [];
  for (const p of b.profiles) {
    const w = worldOf(b, p);
    if (!w) return null;
    out.push(w);
  }
  return out.sort((x, y) => compareKeys(designKey(x), designKey(y)));
}

/**
 * The same profile in WORLD words on `board` (spec §3.4, B1): equal design forms, stations within 1e-9. Never
 * `sameProfile` on the stored fields — a station's `from` is not in the design form, so one station measured from either
 * end is the same profile here. A loop's side and ends are not compared (the design form ignores them). False when
 * either run has ends on two sides (those are carried, never matched). `aBoard` (default `board`) is the part `a` is read
 * on: Refine passes the ORIGINAL part to match an entry the model echoed with the old numbers (Ruling 10).
 */
export function sameWorldProfile(a: Profile, c: Profile, board: Board, aBoard: Board = board): boolean {
  const x = worldOf(aBoard, a);
  const y = worldOf(board, c);
  if (!x || !y) return false;
  if (x.edge[0] !== y.edge[0] || x.kind !== y.kind || x.size !== y.size || x.fillet !== y.fillet || x.depth !== y.depth
    || x.facing !== y.facing || x.allRound !== y.allRound) return false;
  if (x.allRound) return true;
  return x.edge[1] === y.edge[1] && Math.abs(x.start - y.start) <= STATION_EPS && Math.abs(x.end - y.end) <= STATION_EPS;
}
