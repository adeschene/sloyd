import type { Board, FlatDocument, HoleRow, RoundTenon } from './types';
import type { V3 } from './angleCuts';
import { depthAt } from './angleCuts';
import { clipConvex, type BodyFace } from './bodies';
import { builtTenons, endCutOf, sameTenon, shoulderAt, tenonAt } from './roundTenons';
import { boreAlongAxis, boreEnds, partAxis } from './legSockets';
import { toWorld } from './snapPoints';
import { TOUCH } from './checkTolerances';

/**
 * The tenon JOINT (round tenons spec §5, invs 38, 39): which round tenons sit in which bores, structurally, in the WORLD
 * (`worldParts` entries, so the two parts may sit in different assemblies or under mirrors). The design checks read it:
 * a seated tenon's round wood is not measured against its socket's part (overlap), and a seated tenon holds and grounds
 * both parts (held clause (d), `groundedSet`).
 *
 * THE ONE EXCEPTION to "holes are ignored by every check" (inv 38): a part's bodies stay hole-free (inv 50), so a bore
 * never decides an overlap, a contact, the footprint or the weight — except that a single bore a seated tenon fills
 * (`seatedIn`) makes that tenon a joint. Nothing else about a hole reaches the checks.
 *
 * Comparisons at 1e-9 (the axis, the diameter: `boreAlongAxis`) and at `TOUCH` (how far the tenon enters, how far its tip
 * may stand past a blind bottom: the checks' own contact tolerance).
 */

export interface TenonJoint {
  /** The part with the tenon (board index). */
  a: number;
  /** The part with the bore. */
  b: number;
  tenon: string;
  row: string;
}

const EPS = 1e-9;
const dot = (p: readonly number[], q: readonly number[]) => p[0]! * q[0]! + p[1]! * q[1]! + p[2]! * q[2]!;
const sub = (p: readonly number[], q: readonly number[]): V3 => [p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!];
const neg = (p: readonly number[]): V3 => [0 - p[0]!, 0 - p[1]!, 0 - p[2]!];

/** The world point on `b`'s axis (the section's centre) at local length `l`. */
const onAxis = (b: Board, l: number): V3 => toWorld(b, { length: l, width: b.width / 2, thickness: b.thickness / 2 });

/** The tenon's outward direction in the world: from its shoulder toward its tip (unit). */
function outward(b: Board, t: RoundTenon): V3 {
  const { u } = partAxis(b);
  return t.end === 'max' ? u : neg(u);
}

/**
 * The local length of the tip's FURTHEST point along the axis (spec §5.1 (4)): the length coordinate IS the axial one, so
 * this is exact. A square end: the end face itself. A mitered tip (the end's one miter, §3.3): its depth is linear in the
 * station along the miter's `along`, so over the tenon's disc it is least at the disc's edge, `r` either side of the
 * centre — the centre's depth less r·tan φ, φ the angle between the miter's normal and the axis — never below the end (a
 * miter that reaches depth 0 inside the disc leaves that part of the tip square). A compound miter's least depth is the
 * centre's less r·hypot(k, rise), k its along slope (square-set legs spec §4).
 */
export function tipFarthest(b: Board, t: RoundTenon): number {
  const c = endCutOf(b, t.end);
  let d = 0;
  if (c && c !== 'other' && c.across) {
    // A compound miter (square-set legs spec §4): the full depth is affine over the disc, gradient (k, rise) in the
    // section's (along, through) plane, so its least value is the centre's less r·|gradient| — never the least of ±r
    // probes along each axis, which reports a shallower minimum and seats a tip that passes a blind bottom.
    const [[s1, q1], [s2, q2]] = c.points;
    const k = (q2 - q1) / (s2 - s1);
    const centre = depthAt(c, b[c.along] / 2);
    d = Math.max(0, centre - (t.diameter / 2) * Math.hypot(k, c.across.rise));
  } else if (c && c !== 'other') {
    const mid = b[c.along] / 2;
    const r = t.diameter / 2;
    d = Math.max(0, Math.min(depthAt(c, mid - r), depthAt(c, mid + r)));
  }
  return t.end === 'max' ? b.length - d : d;
}

/**
 * Whether tenon `t` of world part `a` is SEATED in single bore `row` of world part `b` (spec §5.1), all in the world:
 * 1. `t` builds (fault-free, `builtTenons`): a faulted tenon cuts no wood, so it fills no bore;
 * 2. the row is a single bore (`count` 1);
 * 3. matching: the bore's diameter is the tenon's, to 1e-9;
 * 4. coaxial: the bore lies along `a`'s axis (`boreAlongAxis(b, row, partAxis(a))`), through or blind, from any face;
 * 5. it ENTERS the bore: along the tenon's outward direction, the tenon (shoulder to the tip's furthest point) and the bore
 *    (mouth to far centre) share more than `TOUCH`. A tenon short of the mouth is in no socket, however its line runs
 *    (spec §5.1's "seated in"; builder's call: without it a collinear bore further along the line would seat it);
 * 6. inside, for a BLIND bore: no point of the tip passes the bottom's plane by more than `TOUCH` — the tip's furthest
 *    point (`tipFarthest`: the centre advanced by r·tan φ on a mitered tip, by r·hypot(k, rise) of depth on a compound
 *    one), never the centre alone. A through bore takes
 *    any tenon. A blind bore that opens AWAY from the tenon never passes 5 and 6 together (its bottom is the bore's near
 *    end: entering by more than TOUCH puts the tip that far past it), so no separate direction test is needed.
 */
export function seatedIn(a: Board, t: RoundTenon, b: Board, row: HoleRow): boolean {
  if (a === b || a.id === b.id || row.count !== 1) return false;
  if (Math.abs(row.diameter - t.diameter) > EPS) return false;
  if (!builtTenons(a).some((x) => x === t || (x.id === t.id && sameTenon(x, t)))) return false;
  if (!boreAlongAxis(b, row, partAxis(a))) return false;
  const out = outward(a, t);
  const shoulder = onAxis(a, shoulderAt(a, t));
  const along = (p: readonly number[]) => dot(sub(p, shoulder), out);
  const tip = along(onAxis(a, tipFarthest(a, t)));
  const [mouth, far] = boreEnds(b, row).map(along) as [number, number];
  if (Math.min(tip, Math.max(mouth, far)) - Math.max(0, Math.min(mouth, far)) <= TOUCH) return false;
  return row.depth === 'through' || tip <= far + TOUCH;
}

/**
 * `leg`'s TOP tenon (its length's `max` end, the end Level the ends and Bore leg sockets treat as the top) when it is
 * seated in none of `seat`'s bores (`seatedIn`), or null: no top tenon, or seated. The seat's Holes section notes it
 * (round tenons spec §6.4, `tenonStale`) for a leg found under the seat (`legsUnder`). A faulted tenon builds nothing, so
 * it is never seated: it is noted too.
 */
export function staleTenonOf(seat: Board, leg: Board): RoundTenon | null {
  const t = tenonAt(leg, 'max');
  if (!t) return null;
  return seat.holes.some((r) => seatedIn(leg, t, seat, r)) ? null : t;
}

/**
 * Every seated tenon in `doc` (spec §5.1), in one pass in world order: each part's fault-free tenons (`builtTenons`), each
 * matched against every OTHER part's single bores in world order, row order within a part; the first match wins (one
 * joint per tenon). Board indices into `doc.boards`. Empty for a document with no tenon.
 */
export function tenonJoints(doc: FlatDocument): TenonJoint[] {
  const out: TenonJoint[] = [];
  doc.boards.forEach((a, i) => {
    for (const t of builtTenons(a)) {
      find: for (let j = 0; j < doc.boards.length; j += 1) {
        if (j === i) continue;
        const b = doc.boards[j]!;
        for (const row of b.holes) {
          if (seatedIn(a, t, b, row)) {
            out.push({ a: i, b: j, tenon: t.id, row: row.id });
            break find;
          }
        }
      }
    }
  });
  return out;
}

/**
 * `b`'s world bodies (`worldBodyFaces`) clipped to tenon `t`'s shoulder's kept half-space — the side toward the part's
 * interior. Exactly the wood that is not the tenon: the zone past the shoulder holds nothing but the tenon (any other
 * feature there is a `meets-feature` fault, and a faulted tenon is never seated). The shoulder is square to the axis
 * (spec §3.1), so its world plane is normal to the world axis through the shoulder's centre. A body clipped away entirely
 * (fewer than 4 faces left) is dropped.
 */
export function withoutTenon(faces: BodyFace[][], b: Board, t: RoundTenon): BodyFace[][] {
  const out = outward(b, t);
  const s = onAxis(b, shoulderAt(b, t));
  // Kept: (s − x)·out ≥ 0, i.e. (−out)·x + s·out ≥ 0 (clipConvex keeps n·x + d ≥ 0).
  const h = { n: neg(out), d: dot(s, out) };
  return faces.map((body) => clipConvex(body, h)).filter((body) => body.length >= 4);
}

/**
 * Whether tenon `t` of `a`, not seated in `b`, runs where one of `b`'s single bores is (spec §5.2's hint): a bore on its
 * axis (any diameter) that it enters by more than `TOUCH`, or one of its diameter on another line whose axis segment
 * comes within the two radii of the tenon's (the two cylinders can meet). A bore elsewhere in `b` is not "there".
 */
export function tenonMeetsBore(a: Board, t: RoundTenon, b: Board): boolean {
  const ax = partAxis(a);
  const out = outward(a, t);
  const shoulder = onAxis(a, shoulderAt(a, t));
  const tipPoint = onAxis(a, tipFarthest(a, t));
  const along = (p: readonly number[]) => dot(sub(p, shoulder), out);
  const tip = along(tipPoint);
  return b.holes.some((row) => {
    if (row.count !== 1) return false;
    const [m, f] = boreEnds(b, row);
    if (boreAlongAxis(b, row, ax)) {
      const [sm, sf] = [along(m), along(f)];
      return Math.min(tip, Math.max(sm, sf)) - Math.max(0, Math.min(sm, sf)) > TOUCH;
    }
    return Math.abs(row.diameter - t.diameter) <= EPS && segmentDistance(shoulder, tipPoint, m, f) < (row.diameter + t.diameter) / 2;
  });
}

/** The least distance between segments [p0, p1] and [q0, q1] (closest points, clamped; Ericson §5.1.9). */
function segmentDistance(p0: V3, p1: V3, q0: V3, q1: V3): number {
  const d1 = sub(p1, p0);
  const d2 = sub(q1, q0);
  const r = sub(p0, q0);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  let s = 0;
  let u = 0;
  if (a <= EPS && e <= EPS) return Math.hypot(...r);
  if (a <= EPS) u = clamp(f / e);
  else {
    const c = dot(d1, r);
    if (e <= EPS) s = clamp(-c / a);
    else {
      const bb = dot(d1, d2);
      const den = a * e - bb * bb;
      s = den > EPS ? clamp((bb * f - c * e) / den) : 0;
      u = (bb * s + f) / e;
      if (u < 0) { u = 0; s = clamp(-c / a); } else if (u > 1) { u = 1; s = clamp((bb - c) / a); }
    }
  }
  const cp = [p0[0] + d1[0] * s - q0[0] - d2[0] * u, p0[1] + d1[1] * s - q0[1] - d2[1] * u, p0[2] + d1[2] * s - q0[2] - d2[2] * u];
  return Math.hypot(cp[0]!, cp[1]!, cp[2]!);
}
