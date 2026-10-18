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
 *     profile. (Equal segments and equal runs are one plane, and so is one horizontal run on two segments: flat already,
 *     and never a join.)
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
import { builtPath, faceOutline, type PathEnd } from './profilePath';
import { profileValues } from './profiles';
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
  /** The profile's section, id and run aside (two profiles with one section cut one surface). */
  section: string;
  /** A B1a mitre end's point per path end (end 0 at chord 0, end 1 at the last chord), when that end is a mitre. */
  mitres: [P2 | null, P2 | null];
  /** True when a plan point is a smooth point of the outline (the outline curves' own judgement). */
  smoothPt: (q: P2) => boolean;
}

function infoOf(view: SweepView, p: ProfileCut): SweptInfo | null {
  const path = builtPath(view, p);
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
  const smoothPt = (q: P2) => smooth.some((s) => Math.abs(s[0] - q[0]) <= NEAR && Math.abs(s[1] - q[1]) <= NEAR);
  const smoothAt = path.chords.map((ch, i) => (!path.loop && i === n - 1 ? false : smoothPt(ch.b)));
  const mitreAt = (e: PathEnd | undefined): P2 | null => (e && e.kind === 'mitre' ? e.at : null);
  const mitres: [P2 | null, P2 | null] = [mitreAt(path.ends?.[0]), mitreAt(path.ends?.[1])];
  const section = profileValues({ ...p, run: { loop: true } });
  // Each segment's normal off the OUTLINE chord it covers (a B1a mitre's split chord ends at the arc's true midpoint in the
  // path, off the chord by its sagitta; the band is built on the chord: planChain reads the cover). The cover is in plan order,
  // the path in the face's (reversed for face min).
  const outline = faceOutline(view)!;
  const chordNormal = path.chords.map((_, i): P2 => {
    const ch = outline.chords[path.cover[p.face === 'max' ? i : n - 1 - i]!.chord]!;
    const l = Math.hypot(ch.b[0] - ch.a[0], ch.b[1] - ch.a[1]);
    return [-(ch.b[1] - ch.a[1]) / l, (ch.b[0] - ch.a[0]) / l];
  });
  return { m, secSmooth, junction, out: p.face === 'max' ? 1 : -1, chordNormal, smoothAt, loop: path.loop, section, mitres, smoothPt };
}

const parallel = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!) <= PARALLEL;

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
  // A B1a mitre (Task 6 fix round 1): two End to end profiles meeting at a corner arc's middle. With ONE section (profile
  // values but id and run) they cut one surface, so their bands meet smoothly there — on a chord vertex (an even chord count)
  // as across any smooth path vertex, the same section run on each; on a split chord (odd) the two are one plane, flat. With
  // differing sections the mitre is a real crease: drawn, whatever the parity.
  const endOf = (I: SweptInfo, seg: number): P2 | null => (seg === 0 ? I.mitres[0] : null) ?? (seg === I.smoothAt.length - 1 ? I.mitres[1] : null);
  const mitred = (ia: string, a: BodyFace, ea: { a: number; b: number }, ib: string, b: BodyFace, eb: { a: number; b: number }): boolean => {
    const Ia = infos.get(ia), Ib = infos.get(ib);
    if (!Ia || !Ib || Ia.section !== Ib.section || ea.a !== eb.a || ea.b !== eb.b) return false;
    if (parallel(a.n, b.n)) return false;   // one plane: flat already, never a join
    const pa = endOf(Ia, a.sweep!), pb = endOf(Ib, b.sweep!);
    return !!pa && !!pb && Math.abs(pa[0] - pb[0]) <= NEAR && Math.abs(pa[1] - pb[1]) <= NEAR && Ia.smoothPt(pa);
  };
  return (a, b) => {
    const ea = profileEdgeOf(a), eb = profileEdgeOf(b);
    if (ea && a.sweep !== undefined && eb && b.sweep !== undefined) {
      if (ea.curve !== eb.curve) return mitred(ea.curve, a, ea, eb.curve, b, eb);
      const I = infos.get(ea.curve);
      if (!I) return false;
      const sameRun = ea.a === eb.a && ea.b === eb.b;
      if (a.sweep === b.sweep) {
        if (sameRun) return false;   // one plane: a seam, flat already
        if ((ea.b + 1) % I.m === eb.a) return I.secSmooth[eb.a]!;
        if ((eb.b + 1) % I.m === ea.a) return I.secSmooth[ea.a]!;
        return false;
      }
      // A horizontal fillet or quirk floor on two segments is one plane: flat already, and never a join (as a seam).
      if (parallel(a.n, b.n)) return false;
      return sameRun && adjacent(I, a.sweep, b.sweep);
    }
    if (ea && a.sweep !== undefined) { const I = infos.get(ea.curve); return !!I && partFace(I, a.sweep, ea, b); }
    if (eb && b.sweep !== undefined) { const I = infos.get(eb.curve); return !!I && partFace(I, b.sweep, eb, a); }
    return false;
  };
}
