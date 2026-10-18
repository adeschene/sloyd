/**
 * A SWEPT profile's edge rule (profile runs b1, Task 6; spec §5 Lines, Q5; invariant 16): which two of its faces meet
 * WITHOUT a crease. `curvedEdges` hands this to `bodyEdges` as (part of) its `smoothPair`, so a stretch where those two
 * faces are all that meet is no edge, and anything else meeting the line there (a dado wall) still draws its crease.
 *
 * Two faces meet smoothly when, for one swept profile:
 * - both are SECTION faces (`profileEdge` and `sweep` tagged, sweep.ts's tag contract) and either
 *   - their path segments are ADJACENT at a path vertex that is smooth on the TRUE outline (the outline curves' own
 *     `smoothLines` judgement — a chord vertex of an arc, a tangent join), and their section runs are EQUAL: no line
 *     across the path between two chords of one arc; or
 *   - their segments are EQUAL and their section runs are ADJACENT at a smooth section vertex (`curveOutline`'s flags of
 *     the profile's own one-side curve, judged on the true arcs): no line along the path between two arc chords of the
 *     profile. (Equal segments and equal runs are one plane: a seam, flat already, and never a join.)
 * - or one is a section face and the other is the PART'S OWN FACE the section runs into at one of its two junction
 *   vertices — the broad face (t = 0) or the side face below the profile (s = 0) — and that section vertex is smooth: a
 *   roundover's tangent lines, which chunk 1 never draws either (smoothLines; the brief's "crease where the roundover meets
 *   the top face" is no line on a straight band and is none here). A cove's or a bead's junction is sharp: a crease.
 *   The part's face is told by its plane: horizontal for the broad face, the section face's own path chord's vertical plane
 *   for the side, and carrying no `profileEdge` (so never a run-out face, which a2's rule judges: its outline creases).
 *
 * Runtime imports: profiles' readers and curves only; `BodyFace` is a type.
 */
import type { BodyFace } from './bodies';
import { curveOutline, smoothLines } from './curves';
import { profilePath } from './profilePath';
import { profileSection } from './runout';
import { profileEdgeOf } from './sectionEdges';
import { oneSideCurve } from './sweep';
import type { Board, Dimension, ProfileCut } from './types';

type SweepView = Pick<Board, Dimension | 'curves'> & { profiles: readonly ProfileCut[] };
type P2 = [number, number];

/** Inches: a path vertex this near a smooth outline point is that point (bodies' SMOOTH_EPS). */
const NEAR = 1e-7;
/** A unit normal this near parallel to another (|n × m|) is the same plane's (bodies' SMOOTH_NORMAL_EPS). */
const PARALLEL = 1e-7;

interface SweptInfo {
  m: number;
  secSmooth: readonly boolean[];
  /** The two junction vertices of the section (1 and m − 1) and the part face each runs into. */
  junction: { v: number; on: 'broad' | 'side' }[];
  /** Broad face outward normal's thickness component (+1 face max, −1 face min). */
  out: 1 | -1;
  /** Each path chord's plan unit normal (either sign). */
  chordNormal: P2[];
  /** smoothAt[i]: the path is tangent-continuous at chord i's end (where chord i + 1, or chord 0 on a loop, starts). */
  smoothAt: boolean[];
  loop: boolean;
}

function infoOf(view: SweepView, p: ProfileCut): SweptInfo | null {
  const path = profilePath(view, p);
  if (!path) return null;
  const c = oneSideCurve(p);
  const pts = profileSection(view, c).pts;
  const m = pts.length;
  const secSmooth = curveOutline(view, c).smooth;
  const onOf = (q: P2): 'broad' | 'side' => (q[1] === 0 ? 'broad' : 'side');
  const junction = [{ v: 1, on: onOf(pts[1]!) }, { v: m - 1, on: onOf(pts[m - 1]!) }];
  // The smooth points of the through-thickness curves (the outline's own): plan coordinates (length, width).
  const smooth = smoothLines(view).filter((s) => s.k === 2).map((s) => [s.p[0], s.p[1]] as P2);
  const n = path.chords.length;
  const smoothAt = path.chords.map((ch, i) => {
    if (!path.loop && i === n - 1) return false;
    const q = ch.b;
    return smooth.some((s) => Math.abs(s[0] - q[0]) <= NEAR && Math.abs(s[1] - q[1]) <= NEAR);
  });
  const chordNormal = path.chords.map((ch): P2 => {
    const l = Math.hypot(ch.b[0] - ch.a[0], ch.b[1] - ch.a[1]);
    return [-(ch.b[1] - ch.a[1]) / l, (ch.b[0] - ch.a[0]) / l];
  });
  return { m, secSmooth, junction, out: p.face === 'max' ? 1 : -1, chordNormal, smoothAt, loop: path.loop };
}

/** The swept rule (above) for the given built swept profiles, or undefined when there are none. */
export function sweptSmoothPair(view: SweepView, swept: readonly ProfileCut[]): ((a: BodyFace, b: BodyFace) => boolean) | undefined {
  if (swept.length === 0) return undefined;
  const infos = new Map<string, SweptInfo>();
  for (const p of swept) { const i = infoOf(view, p); if (i) infos.set(p.id, i); }
  if (infos.size === 0) return undefined;
  const adjacent = (I: SweptInfo, i: number, j: number) => {
    const n = I.smoothAt.length;
    if (j === i + 1) return I.smoothAt[i]!;
    if (i === j + 1) return I.smoothAt[j]!;
    if (I.loop && n > 1 && ((i === n - 1 && j === 0) || (j === n - 1 && i === 0))) return I.smoothAt[n - 1]!;
    return false;
  };
  const partFace = (I: SweptInfo, seg: number, run: { a: number; b: number }, f: BodyFace): boolean => {
    if (f.profileEdge !== undefined || f.sweep !== undefined || f.runout !== undefined) return false;
    for (const { v, on } of I.junction) {
      if (run.a !== v && (run.b + 1) % I.m !== v) continue;
      if (on === 'broad') {
        if (Math.abs(f.n[2] - I.out) > PARALLEL) continue;
      } else {
        const cn = I.chordNormal[seg];
        if (!cn || Math.abs(f.n[2]) > PARALLEL || Math.abs(f.n[0] * cn[1] - f.n[1] * cn[0]) > PARALLEL) continue;
      }
      return I.secSmooth[v]!;
    }
    return false;
  };
  return (a, b) => {
    const ea = profileEdgeOf(a), eb = profileEdgeOf(b);
    if (ea && a.sweep !== undefined && eb && b.sweep !== undefined) {
      if (ea.curve !== eb.curve) return false;
      const I = infos.get(ea.curve);
      if (!I) return false;
      const sameRun = ea.a === eb.a && ea.b === eb.b;
      if (a.sweep === b.sweep) {
        if (sameRun) return false;   // one plane: a seam, flat already
        if ((ea.b + 1) % I.m === eb.a) return I.secSmooth[eb.a]!;
        if ((eb.b + 1) % I.m === ea.a) return I.secSmooth[ea.a]!;
        return false;
      }
      return sameRun && adjacent(I, a.sweep, b.sweep);
    }
    if (ea && a.sweep !== undefined) { const I = infos.get(ea.curve); return !!I && partFace(I, a.sweep, ea, b); }
    if (eb && b.sweep !== undefined) { const I = infos.get(eb.curve); return !!I && partFace(I, b.sweep, eb, a); }
    return false;
  };
}
