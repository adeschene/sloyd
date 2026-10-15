import type { Board, CurveCut, Dimension } from './types';
import { formatLength, type Units } from '../units/length';
import { edgeName, endWord } from './holeText';
import {
  archFields, bowFields, cornerFields, curveFaults, localSegments, uvDims, type CurveFault, type LocalArc,
} from './curves';

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

function curveLineBase(board: Board, c: CurveCut, units: Units): string {
  const f = (n: number) => formatLength(n, units);
  const through = c.through === 'thickness' ? '' : `, cut through the ${c.through}`;
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

/** Every curve's line, stored order; four corner curves on one face with one radius and no fault collapse to one line,
 *  printed where the first of them stands (spec §4.2). */
export function curveLines(board: Board, units: Units): string[] {
  const corners = board.curves.map((c) => ({ c, f: cornerFields(c) })).filter((x) => x.f && curveFaults(board, x.c).length === 0);
  const groups = new Map<string, CurveCut[]>();
  for (const { c, f } of corners) {
    const key = `${f!.through}|${f!.radius}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(c);
  }
  const collapsed = new Map<CurveCut, string>();
  const skip = new Set<CurveCut>();
  for (const [, cs] of groups) {
    // One curve per distinct corner, the first of each in stored order; a duplicate corner keeps its own line.
    const firstAt = new Map<string, CurveCut>();
    for (const c of cs) { const k = `${c.uFrom}${c.vFrom}`; if (!firstAt.has(k)) firstAt.set(k, c); }
    if (firstAt.size !== 4) continue;
    const four = [...firstAt.values()].sort((a, b) => board.curves.indexOf(a) - board.curves.indexOf(b));
    const f = cornerFields(four[0]!)!;
    const through = f.through === 'thickness' ? '' : `, cut through the ${f.through}`;
    collapsed.set(four[0]!, `Round all four corners to a ${formatLength(f.radius, units)} radius${through}`);
    for (const c of four.slice(1)) skip.add(c);
  }
  return board.curves.flatMap((c) => (skip.has(c) ? [] : [collapsed.get(c) ?? curveLine(board, c, units)]));
}
