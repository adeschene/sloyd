import type { Board, CurveCut, Dimension } from './types';
import { formatLength, type Units } from '../units/length';
import { edgeName, endWord } from './holeText';
import {
  archFields, bowFields, cornerFields, curveFaults, localSegments, uvDims, type CurveFault, type LocalArc,
} from './curves';
import { geometryBoard, profileAsymmetric, profileFields, type ProfileFields } from './profiles';
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
  const base = curveLineBase(board, c, units);
  const faults = curveFaults(board, c);
  return faults.length === 0 ? base : `${base} — check: ${curveFaultText(faults[0]!)}${faults.length > 1 ? ` (and ${faults.length - 1} more)` : ''}`;
}

/** A profile's short words (spec §4): THE one home, read by the bench line and the Plans key. */
export function profileName(p: ProfileFields, units: Units): string {
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
export const filletWords = (p: ProfileFields, units: Units) => (p.kind !== 'bead' && (p.fillet ?? 0) > 0 ? `, with a ${formatLength(p.fillet!, units)} fillet` : '');
function profileLine(p: ProfileFields, units: Units): string {
  const [u, v] = uvDims(p.through);
  const top = profileAsymmetric(p) ? `, top on ${topFace(p)}` : '';
  return `${profileName(p, units)} on the edge between ${faceName(u, p.uFrom)} and ${faceName(v, p.vFrom)}, along the ${p.through}${top}${filletWords(p, units)}`;
}

function curveLineBase(board: Board, c: CurveCut, units: Units): string {
  const f = (n: number) => formatLength(n, units);
  const through = c.through === 'thickness' ? '' : `, cut through the ${c.through}`;
  const prof = profileFields(c);
  if (prof) return profileLine(prof, units);
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

/** Every curve's line as `{ ids, text }` (spec §4.2, ruling Q6): THE ONE home of the collapse; `ids` names every curve the
 *  line covers (four for a collapsed set of corners), so a part diagram can list the lines of the curves it draws. Four
 *  corner curves on one face with one radius and no fault collapse to one line, printed where the first of them stands. */
export function curveLineEntries(board: Board, units: Units): { ids: string[]; text: string }[] {
  board = geometryBoard(board);
  const corners = board.curves.map((c) => ({ c, f: cornerFields(c) })).filter((x) => x.f && !profileFields(x.c) && curveFaults(board, x.c).length === 0);
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
  // first stands. A faulted profile, or one differing in kind, size, depth or fillet, or whose top is another face, keeps its own.
  const profs = board.curves.map((c) => ({ c, p: profileFields(c) })).filter((x): x is { c: CurveCut; p: ProfileFields } => !!x.p && curveFaults(board, x.c).length === 0);
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
  return board.curves.flatMap((c) => (skip.has(c) ? [] : [collapsed.get(c) ?? { ids: [c.id], text: curveLine(board, c, units) }]));
}

/** Every curve's line, stored order (spec §4.2). */
export function curveLines(board: Board, units: Units): string[] {
  return curveLineEntries(board, units).map((e) => e.text);
}
