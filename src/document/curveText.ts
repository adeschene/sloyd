import type { Board, CurveCut, Dimension, ProfileCut } from './types';
import { formatLength, type Units } from '../units/length';
import { edgeName, endWord } from './holeText';
import {
  archFields, bowFields, cornerFields, curveFaults, localSegments, spanOf, uvDims, type CurveFault, type LocalArc,
} from './curves';
import { geometryBoard, oneSide, profileAsymmetric, profileFields, profileToFields, viewProfileFaults, type ProfileFault, type ProfileFields } from './profiles';
import { faceOutline, sideStretch } from './profilePath';
import { faceName } from './angleText';

/** A fault in words (spec §2.5, P4): THE one home (invariant 19), read by the bench line and the Properties note.
 *  Lower-case, no full stop. */
export function curveFaultText(f: CurveFault): string {
  return f.kind === 'runs-off' ? `runs past ${edgeName(f.edge!)}` : 'cuts right through the part';
}

const other = (through: Dimension, d: Dimension): Dimension => uvDims(through).find((x) => x !== d)!;
const radiusOf = (span: number, rise: number) => (span * span / 4 + rise * rise) / (2 * rise);

/**
 * One curve as a bench line (spec §4.1, P2, P7): THE ONE home of these strings (invariant 19). The derived radius in
 * brackets is for the trammel. A faulted curve ends with its first fault.
 */
export function curveLine(board: Board, c: CurveCut, units: Units): string {
  return withCheck(curveLineBase(board, c, units), curveFaultWords(board, c));
}

/** A bench line with its first fault (THE one home of the ` — check: …` suffix: curves and swept profiles alike). */
const withCheck = (base: string, faults: readonly string[]): string =>
  faults.length === 0 ? base : `${base} — check: ${faults[0]!}${faults.length > 1 ? ` (and ${faults.length - 1} more)` : ''}`;

/** A profile fault in words (P12, Q6): THE one home (invariant 19). Lower-case, no full stop. */
export function profileFaultText(f: ProfileFault): string {
  switch (f.kind) {
    case 'stop-off': return 'a stop runs off the part';
    case 'overlap': return 'it overlaps another profile on this edge';
    case 'runs-off': return 'it runs off the part';
    case 'too-tight': return 'it is too tight for the curve';
  }
}

/** The Profiles row's note for a swept-shaped End to end that runs STRAIGHT (`runsStraight`; final review I1, the user's
 *  ruling): too tight to follow its curve, it is cut as a2 cut it. A row note only — the bench line describes what is cut. */
export const RUNS_STRAIGHT_NOTE = 'Runs straight: too tight to follow the curve.';
/** The fallback note by its cause (Q10; one home): the first kind of the profile's swept judgement (`fallbackCause`). */
export function runsStraightNote(kind: ProfileFault['kind']): string {
  switch (kind) {
    case 'too-tight': return RUNS_STRAIGHT_NOTE;
    case 'overlap': return 'Runs straight: it would overlap another profile if it followed the curve.';
    case 'runs-off': case 'stop-off': return 'Runs straight: it would run off the part if it followed the curve.';
  }
}
/**
 * A stored profile fault as the Properties row's note (final fix F5), from the same words: a stop off the part, a profile
 * running off it and one too tight for its curve are what a resize causes (" at this size."); an overlap never is — every
 * row station is measured from the min end, so a resize cannot make one (an a1 file's stacked identical profiles, faulted
 * on load by P12) — so it reads without the clause.
 */
export function profileFaultNote(f: ProfileFault): string {
  const cap = (t: string) => `${t[0]!.toUpperCase()}${t.slice(1)}`;
  const t = profileFaultText(f);
  switch (f.kind) {
    case 'overlap': return `${cap(t.replace(/^it /, ''))}.`;
    case 'too-tight': return `${cap(t.replace(/^it is /, ''))} at this size.`;
    case 'stop-off':
    case 'runs-off': return `${cap(t)} at this size.`;
  }
}

/** Every fault of a curve in words: the curve's own first (`curveFaults`), then, for a geometry view's profile curve, the
 *  STORED profile's (`viewProfileFaults`). */
function curveFaultWords(board: Board, c: CurveCut): string[] {
  return [...curveFaults(board, c).map(curveFaultText), ...viewProfileFaults(c).map(profileFaultText)];
}
/** A curve with any fault, its own or its stored profile's: never collapsed, keyed with the fault suffix. */
export const curveFaulted = (board: Board, c: CurveCut): boolean => curveFaults(board, c).length > 0 || viewProfileFaults(c).length > 0;

/** A stopped profile's stations (P15), lo then hi along the run from its min end; a through end reads as that end. */
function spanWords(c: CurveCut, units: Units): string {
  const span = spanOf(c);
  if (!span) return '';
  const lo = span.stopLo ? formatLength(span.lo, units) : `the ${c.through} min end`;
  const hi = span.stopHi ? formatLength(span.hi, units) : `the ${c.through} max end`;
  return `, from ${lo} to ${hi} (stopped)`;
}

/** A profile's short words (spec §4): THE one home, read by the bench line and the Plans key. */
type ProfileWords = Pick<ProfileFields, 'kind' | 'size' | 'depth' | 'fillet'>;
export function profileName(p: ProfileWords, units: Units): string {
  const f = (n: number) => formatLength(n, units);
  switch (p.kind) {
    case 'roundover': return `Roundover ${f(p.size)}`;
    case 'cove': return `Cove ${f(p.size)}`;
    case 'ogee': return `Roman ogee ${f(p.size)}`;
    case 'bead': return `Bead ${f(p.size)} with a ${f(p.fillet!)} quirk`;
    case 'thumbnail': return `Thumbnail ${f(p.size)} × ${f(p.depth!)}`;
  }
}
const topFace = (p: ProfileFields) => { const [u, v] = uvDims(p.through); return p.facing === 'v' ? faceName(v, p.vFrom) : faceName(u, p.uFrom); };
/** A profile's fillet in words, or nothing (THE one home: the bench line, the four-edge collapse and the Plans key). */
export const filletWords = (p: ProfileWords, units: Units) => (p.kind !== 'bead' && (p.fillet ?? 0) > 0 ? `, with a ${formatLength(p.fillet!, units)} fillet` : '');
function profileLine(p: ProfileFields, units: Units): string {
  const [u, v] = uvDims(p.through);
  const top = profileAsymmetric(p) ? `, top on ${topFace(p)}` : '';
  return `${profileName(p, units)} on the edge between ${faceName(u, p.uFrom)} and ${faceName(v, p.vFrom)}, along the ${p.through}${top}${filletWords(p, units)}`;
}

function curveLineBase(board: Board, c: CurveCut, units: Units): string {
  const f = (n: number) => formatLength(n, units);
  const through = c.through === 'thickness' ? '' : `, cut through the ${c.through}`;
  const prof = profileFields(c);
  if (prof) return `${profileLine(prof, units)}${spanWords(c, units)}`;
  const arch = archFields(c);
  if (arch) {
    const edge = edgeName({ dim: other(c.through, arch.along), side: arch.side });
    const end = endWord(arch.along);
    if (arch.rise === arch.span / 2) {
      return `Half-round notch on ${edge}, ${f(arch.span)} wide, centred ${f(arch.start + arch.span / 2)} from the ${arch.along} ${arch.from} ${end} (radius ${f(arch.span / 2)})${through}`;
    }
    const r = f(radiusOf(arch.span, arch.rise));
    if (Math.abs(board[arch.along] - (arch.start + arch.span) - arch.start) <= 1e-9) {
      return `Arch on ${edge}, ${f(arch.start)} in from each ${arch.along} ${end}: ${f(arch.span)} span, ${f(arch.rise)} rise (radius ${r})${through}`;
    }
    return `Arch on ${edge}, from ${f(arch.start)} to ${f(arch.start + arch.span)} from the ${arch.along} ${arch.from} ${end}: ${f(arch.rise)} rise (radius ${r})${through}`;
  }
  const bow = bowFields(c);
  if (bow) {
    const edge = edgeName({ dim: other(c.through, bow.along), side: bow.side });
    const over = Math.abs(bow.span - board[bow.along]) <= 1e-9 ? '' : ` over ${f(bow.span)} from the ${bow.along} min ${endWord(bow.along)}`;
    return `Bow ${edge} ${f(bow.rise)}${over} (radius ${f(radiusOf(bow.span, bow.rise))})${through}`;
  }
  const corner = cornerFields(c);
  if (corner) {
    const [u, v] = uvDims(c.through);
    return `Round the corner of ${edgeName({ dim: u, side: corner.uFrom })} and ${edgeName({ dim: v, side: corner.vFrom })} to a ${f(corner.radius)} radius${through}`;
  }
  const segs = localSegments(board, c);
  const arcs = segs.filter((s): s is LocalArc => s.kind === 'arc').length;
  const lines = segs.length - arcs;
  return `Curve cut through the ${c.through}: ${arcs} arc${arcs === 1 ? '' : 's'} and ${lines} line${lines === 1 ? '' : 's'}`;
}

/**
 * How a SWEPT profile (profile runs b1, Q2) runs, in words: a loop goes `all round`; an End to end run whose side's stretch
 * carries round corner arcs (an `'arc'` end: B1's station or B1a's mitre) goes `round the corner` for one and `round the
 * corners` for two (Q7 amended, implementation b1); an End to end run that only follows its own side (an arch, a notch, a
 * bow) has no clause — it reads as chunk 1's line. Judged on the stretch, never the path, so a faulted profile (no path)
 * reads the same. THE one home: the bench line, the Plans key, the row.
 */
export function sweptRun(view: Pick<Board, Dimension | 'curves'>, p: ProfileCut): 'all round' | 'round the corner' | 'round the corners' | null {
  if ('loop' in p.run) return 'all round';
  const outline = faceOutline(view);
  const s = outline ? sideStretch(view, outline, p.run.start.side) : null;
  const arcs = s ? (s.startEnd === 'arc' ? 1 : 0) + (s.endEnd === 'arc' ? 1 : 0) : 0;
  return arcs === 0 ? null : arcs === 1 ? 'round the corner' : 'round the corners';
}

/**
 * A swept profile as a bench line (profile runs b1, Q7): THE one home (invariant 19). A loop reads `<name> all round
 * <face><top><fillet>` (the four-edge collapse's own face words); an asymmetric one (`profileAsymmetric`) facing the EDGE
 * names its top before the fillet, as chunk 1 does — `, top on the edge`, since the outline's edge is no single named face;
 * facing the face (the stored default) it says nothing more, the face being named already (Q7 amended, implementation b1). An End to end run reads chunk 1's line (its facing
 * words included), plus `, round the corner(s)` when it takes corner arcs. A faulted one ends with its first fault (the
 * stored profile's, `viewProfileFaults`). `p` is the geometry view's copy (`view.profiles`).
 */
export function sweptLine(view: Pick<Board, Dimension | 'curves'>, p: ProfileCut, units: Units): string {
  const run = sweptRun(view, p);
  const face = faceName('thickness', p.face);
  const top = profileAsymmetric(p) && p.facing === 'edge' ? ', top on the edge' : '';
  // A run with ends on two sides (profile runs b2) has no chunk-1 line: until Task 8 words its run (Q21), it reads Q21's head
  // only — `<name> on <face><top><fillet>` — so no reader throws on a loaded two-side run (M-e).
  const base = 'loop' in p.run
    ? `${profileName(p, units)} all round ${face}${top}${filletWords(p, units)}`
    : !oneSide(p.run) ? `${profileName(p, units)} on ${face}${top}${filletWords(p, units)}`
      : `${profileLine(profileToFields(p), units)}${run ? `, ${run}` : ''}`;
  return withCheck(base, viewProfileFaults(p).map(profileFaultText));
}

/** Every curve's line as `{ ids, text }` (spec §4.2, ruling Q6): THE ONE home of the collapse; `ids` names every curve the
 *  line covers (four for a collapsed set of corners), so a part diagram can list the lines of the curves it draws. Four
 *  corner curves on one face with one radius and no fault collapse to one line, printed where the first of them stands. */
export function curveLineEntries(board: Board, units: Units): { ids: string[]; text: string }[] {
  board = geometryBoard(board);
  const corners = board.curves.map((c) => ({ c, f: cornerFields(c) })).filter((x) => x.f && !profileFields(x.c) && !curveFaulted(board, x.c));
  const groups = new Map<string, CurveCut[]>();
  for (const { c, f } of corners) {
    const key = `${f!.through}|${f!.radius}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(c);
  }
  const collapsed = new Map<CurveCut, { ids: string[]; text: string }>();
  const skip = new Set<CurveCut>();
  for (const [, cs] of groups) {
    // One curve per distinct corner, the first of each in stored order; a duplicate corner keeps its own line.
    const firstAt = new Map<string, CurveCut>();
    for (const c of cs) { const k = `${c.uFrom}${c.vFrom}`; if (!firstAt.has(k)) firstAt.set(k, c); }
    if (firstAt.size !== 4) continue;
    const four = [...firstAt.values()].sort((a, b) => board.curves.indexOf(a) - board.curves.indexOf(b));
    const f = cornerFields(four[0]!)!;
    const through = f.through === 'thickness' ? '' : `, cut through the ${f.through}`;
    collapsed.set(four[0]!, { ids: four.map((c) => c.id), text: `Round all four corners to a ${formatLength(f.radius, units)} radius${through}` });
    for (const c of four.slice(1)) skip.add(c);
  }
  // Four equal profiles round one face's four edges (thickness faces only can hold four): one line, printed where the
  // first stands. A faulted profile, or one differing in kind, size, depth or fillet, or whose top is another face, keeps its
  // own; so does a stopped one (P15).
  const profs = board.curves.map((c) => ({ c, p: profileFields(c) }))
    .filter((x): x is { c: CurveCut; p: ProfileFields } => !!x.p && !spanOf(x.c) && !curveFaulted(board, x.c));
  const done = new Set<CurveCut>();
  for (const D of ['length', 'width', 'thickness'] as const) {
    for (const S of ['min', 'max'] as const) {
      const here = profs.filter(({ c, p }) => {
        if (done.has(c)) return false;
        const [u, v] = uvDims(p.through);
        if (!((u === D && p.uFrom === S) || (v === D && p.vFrom === S))) return false;
        return !profileAsymmetric(p) || topFace(p) === faceName(D, S);
      });
      const byKind = new Map<string, typeof here>();
      for (const x of here) {
        const key = `${x.p.kind}|${x.p.size}|${x.p.depth ?? ''}|${x.p.fillet ?? ''}`;
        (byKind.get(key) ?? byKind.set(key, []).get(key)!).push(x);
      }
      for (const [, xs] of byKind) {
        const firstAt = new Map<string, { c: CurveCut; p: ProfileFields }>();
        for (const x of xs) { const k = `${x.p.through}${x.p.uFrom}${x.p.vFrom}`; if (!firstAt.has(k)) firstAt.set(k, x); }
        if (firstAt.size !== 4) continue;
        const four = [...firstAt.values()].sort((a, b) => board.curves.indexOf(a.c) - board.curves.indexOf(b.c));
        const p = four[0]!.p;
        collapsed.set(four[0]!.c, { ids: four.map((x) => x.c.id), text: `${profileName(p, units)} on all four edges of ${faceName(D, S)}${filletWords(p, units)}` });
        for (const x of four) { done.add(x.c); if (x !== four[0]) skip.add(x.c); }
      }
    }
  }
  // Q7: curves, then straight profiles (the view's curves, in that order), then swept profiles, each in stored order.
  return [
    ...board.curves.flatMap((c) => (skip.has(c) ? [] : [collapsed.get(c) ?? { ids: [c.id], text: curveLine(board, c, units) }])),
    ...(board.profiles ?? []).map((p) => ({ ids: [p.id], text: sweptLine(board, p, units) })),
  ];
}

/** Every curve's line, stored order (spec §4.2). */
export function curveLines(board: Board, units: Units): string[] {
  return curveLineEntries(board, units).map((e) => e.text);
}
