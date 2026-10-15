import type { Board, CutFrom, Dimension, HoleRow } from './types';
import { formatLength, formatMm, imperialAt, type Units } from '../units/length';
import { faceName } from './angleText';
import { acrossOf } from './holes';
import { holeFaults, type HoleFault } from './holeFaults';

/** "end" for the length, "side" for width and thickness: THE one home of the word (the Properties labels read it too). */
export const endWord = (d: Dimension) => (d === 'length' ? 'end' : 'side');
const end = endWord;
/** An edge a hole can run past, e.g. "the length max end" (the fault text and the Properties refusal share it). */
export const edgeName = (e: { dim: Dimension; side: CutFrom }) => `the ${e.dim} ${e.side} ${endWord(e.dim)}`;

/** A fault in words (holes spec §2.4): THE one home (invariant 19), read by the cut-list line and the Properties note.
 *  Lower-case, no full stop: each reader frames it. */
export function holeFaultText(f: HoleFault, r: HoleRow): string {
  const n = f.index + 1;
  switch (f.kind) {
    case 'breaks-out': return `hole ${n} runs past ${edgeName(f.edge!)}`;
    case 'off-flat': return `hole ${n} sits where a cut has removed the wood`;
    case 'meets-hole': return `hole ${n} meets ${f.other!.row === r.id ? `hole ${f.other!.index + 1}` : 'a hole of another row'}`;
    case 'too-deep': return `the holes are deeper than the ${r.face}`;
  }
}

/** A fault's identity: per hole, except too-deep, which is a property of the ROW (every hole shares its depth). The
 *  Properties panel's "does this edit ADD a fault" reads it too. */
export const faultKey = (f: HoleFault) => (f.kind === 'too-deep' ? 'too-deep' : `${f.index}:${f.kind}`);
/** One fault per key, in holeFaults' order: THE one count of a row's faults (invariant 19), read by the bench line and
 *  the Properties note, so a row thinned under its depth reads one fault, not one per hole. */
export const distinctFaults = (fs: HoleFault[]) => fs.filter((f, i) => fs.findIndex((g) => faultKey(g) === faultKey(f)) === i);

/** A diameter or pitch that is a whole number of millimetres AND not an exact 1/64 also prints its mm (spec §4.1,
 *  amended): the 32 mm system and 35 mm cups read as what the jig and the bit say. 5" (127 mm) does not. */
function mm(v: number): string {
  const m = v * 25.4;
  const whole = Math.round(m);
  const on64 = Math.abs(v * 64 - Math.round(v * 64)) <= 1e-9;
  return whole > 0 && Math.abs(m - whole) <= 1e-9 && !on64 ? ` (${whole} mm)` : '';
}

/**
 * One hole row as a bench line (holes spec §4.1, as amended): THE ONE home of these strings (invariant 19). Lengths at
 * the document precision except the pitch, at 1/64 at least (a jig set to a rounded pitch drifts along the row). "last
 * at" is computed from the exact stored values, then rounded. A faulted row (a later edit ran it off the part, spec §2.4)
 * ends with its first fault and how many more — the user's ruling: the bench must not read a wrong row silently.
 */
export function holeLine(board: Board, r: HoleRow, units: Units | number): string {
  const base = holeLineBase(r, typeof units === 'number' ? imperialAt(units) : units);
  const faults = distinctFaults(holeFaults(board, r));
  if (faults.length === 0) return base;
  return `${base} — check: ${holeFaultText(faults[0]!, r)}${faults.length > 1 ? ` (and ${faults.length - 1} more)` : ''}`;
}

function holeLineBase(r: HoleRow, units: Units): string {
  const metric = units.display === 'metric-mm';
  const f = (n: number) => formatLength(n, units);
  const dia = (n: number) => (metric ? formatMm(n, 1) : `${f(n)}${mm(n)}`);
  const size = `${dia(r.diameter)} dia × ${r.depth === 'through' ? 'through' : `${f(r.depth)} deep`}`;
  const where = `in ${faceName(r.face, r.from)}`;
  const across = acrossOf(r);
  const inset = `${f(r.inset)} in from the ${across} ${r.acrossFrom} ${end(across)}`;
  if (r.count === 1) return `Hole ${size} ${where}, ${f(r.station)} from the ${r.along} ${r.alongFrom} ${end(r.along)}, ${inset}`;
  const pitch = metric ? formatMm(r.pitch, 1) : `${formatLength(r.pitch, Math.max(units.precision, 64))}${mm(r.pitch)}`;
  const last = r.station + (r.count - 1) * r.pitch;
  return `Row of ${r.count} holes ${size} ${where}, along the ${r.along}: first ${f(r.station)} from the ${r.alongFrom} ${end(r.along)}, every ${pitch}, last at ${f(last)}; ${inset}`;
}
