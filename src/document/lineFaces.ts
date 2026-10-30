import type { AnyLine, Board, Guide } from './types';
import { isAnyLine } from './types';
import { worldBodies, type WorldBody } from './drawing';
import { partGeometry } from './bodies';
import { insideHole, type Hole } from './holes';
import { keptBySection, type Section } from './section';
import { fromWorld, lineDir, type SnapPoint, type Vec3 } from './snapPoints';

/**
 * Where a construction line meets a part (construction-lines-2 spec §3.1): every point where the line passes between air
 * and wood on the part's surface, a `line-face` snap candidate owned by the LINE with the part on `board` — so it can never
 * be a grab (inv 26). Computed on `worldBodies`, the ONE world-body source (hole-free, convex, posture and lean composed).
 * A document-layer leaf for the store (held-point survival) as much as the tools: nothing here imports viewport.
 */

/** Inches each side of an entry or exit the wood is probed at: far below any 1/64" feature, far above `DRAW_EPS`. */
export const FACE_PROBE = 1e-4;

/** A body's inside test, closed, with the bodies' own grazing slack on planes. */
const inBody = (w: WorldBody, p: Vec3): boolean =>
  w.box
    ? p.every((v, i) => v >= w.box!.min[i]! && v <= w.box!.max[i]!)
    : w.planes.every(({ m, c }) => m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + c >= -1e-9);

const AXIS_INDEX = { x: 0, y: 1, z: 2 } as const;

/** One end of a body's clip: its parameter, and (an axis line meeting a face square to it) the face's own constant. */
interface End { t: number; exact?: number }

/**
 * A body's clip of the line, `[enter, exit]`, or null when it misses. `t` as `lineSpan`'s: the world coordinate on the
 * axis for an axis line (its `at` there is 0), distance from `at` for an oblique one. A box clips by slabs; any other
 * body by Cyrus–Beck over its inside half-spaces `m·x + c ≥ 0`. A face parallel to the line constrains nothing when the
 * line lies on its inside (closed, so a line along an edge grazes); a tie in `t` prefers a square face, whose constant
 * is the exact value.
 */
function clip(w: WorldBody, at: Vec3, u: Vec3, axis: number): [End, End] | null {
  let lo: End = { t: -Infinity };
  let hi: End = { t: Infinity };
  const enter = (e: End) => { if (e.t > lo.t || (e.t === lo.t && e.exact !== undefined)) lo = e; };
  const leave = (e: End) => { if (e.t < hi.t || (e.t === hi.t && e.exact !== undefined)) hi = e; };
  if (w.box) {
    const { min, max } = w.box;
    for (let i = 0; i < 3; i++) {
      if (u[i] === 0) {
        if (at[i] < min[i]! || at[i] > max[i]!) return null;
        continue;
      }
      const a: End = { t: (min[i]! - at[i]) / u[i], ...(i === axis ? { exact: min[i]! } : {}) };
      const b: End = { t: (max[i]! - at[i]) / u[i], ...(i === axis ? { exact: max[i]! } : {}) };
      if (u[i] > 0) { enter(a); leave(b); } else { enter(b); leave(a); }
    }
  } else {
    for (const { m, c } of w.planes) {
      const den = m[0] * u[0] + m[1] * u[1] + m[2] * u[2];
      const num = m[0] * at[0] + m[1] * at[1] + m[2] * at[2] + c;
      if (Math.abs(den) < 1e-12) {
        if (num < -1e-9) return null;
        continue;
      }
      // Square to the axis line: the plane is `x[axis] = −c / m[axis]`, assigned, never computed back through t.
      const square = axis >= 0 && (m[axis] === 1 || m[axis] === -1) && m.every((v, i) => i === axis || v === 0);
      const e: End = { t: -num / den, ...(square ? { exact: -c / m[axis]! } : {}) };
      if (den > 0) enter(e); else leave(e);
    }
  }
  return lo.t <= hi.t ? [lo, hi] : null;
}

/** A part's world bodies and holes, read once for every line (the candidate list's cost is lines × parts × bodies). */
interface Prepared { board: Board; bodies: WorldBody[]; holes: readonly Hole[] }
const prepare = (board: Board): Prepared => ({ board, bodies: worldBodies(board), holes: partGeometry(board).holes });

function hitsOn(line: AnyLine, p: Prepared): SnapPoint[] {
  const axis: number = line.axis !== undefined ? AXIS_INDEX[line.axis] : -1;
  const at: Vec3 = [line.at[0], line.at[1], line.at[2]];
  const u = lineDir(line);
  const pointAt = (t: number): Vec3 => [at[0] + t * u[0], at[1] + t * u[1], at[2] + t * u[2]];
  const inWood = (t: number) => { const q = pointAt(t); return p.bodies.some((w) => inBody(w, q)); };
  const found: { t: number; at: Vec3 }[] = [];
  for (const w of p.bodies) {
    const span = clip(w, at, u, axis);
    if (!span) continue;
    for (const end of span) {
      // Only the true surface: a seam between two bodies of one part (pocket cells, a split curve's pieces) has wood on
      // both sides of it along the line.
      if (inWood(end.t - FACE_PROBE) === inWood(end.t + FACE_PROBE)) continue;
      let hit: Vec3;
      if (end.exact !== undefined) {
        // inv 25: the face's constant on the axis, the line's stored values on the other two.
        hit = [at[0], at[1], at[2]];
        hit[axis] = end.exact;
      } else hit = pointAt(end.t);
      // Not in a bore: a mouth is air in the drawn mesh. The holes module's own test, pieces and tilted caps included.
      const l = fromWorld(p.board, hit);
      if (p.holes.some((h) => insideHole(h, [l.length, l.width, l.thickness]))) continue;
      found.push({ t: end.t, at: hit });
    }
  }
  found.sort((a, b) => a.t - b.t);
  const out: SnapPoint[] = [];
  for (const f of found) {
    if (out.some((o) => o.at[0] === f.at[0] && o.at[1] === f.at[1] && o.at[2] === f.at[2])) continue;
    out.push({ kind: 'line-face', at: f.at, owner: { type: 'guide', id: line.id, board: p.board.id } });
  }
  return out;
}

/** Every point where `line` passes between air and wood on `board`'s surface, in ascending `t`. No extent: callers filter. */
export function lineFaceHits(line: AnyLine, board: Board): SnapPoint[] {
  return hitsOn(line, prepare(board));
}

/** Every line against every part (the parts the caller offers as snap sources), keeping hits inside ±`extent`. */
export function lineFaceCandidates(guides: Guide[], boards: readonly Board[], extent: number): SnapPoint[] {
  const lines = guides.filter(isAnyLine);
  if (lines.length === 0) return [];
  const parts = boards.map(prepare);
  return lines.flatMap((line) => parts.flatMap((p) => hitsOn(line, p)))
    .filter((q) => q.at.every((c) => Math.abs(c) <= extent));
}

/**
 * The section filter both tools apply (inv 51): a guide-owned point that sits on no part (a guide point, a crossing) is
 * exempt, as guides are; a face hit sits on a part, so it goes the way the part's own points go.
 */
export function keepsCandidate(section: Section | null, p: SnapPoint): boolean {
  return (p.owner.type === 'guide' && p.owner.board === undefined) || keptBySection(section, p.at);
}
