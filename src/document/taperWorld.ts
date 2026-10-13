import type { AngleCut, Board, CutFrom, Dimension } from './types';
import { DIMENSION_ORDER, axisDimensions, endFacing } from './geometry';
import { depthAt, taperCut } from './angleCuts';

/**
 * Tapers in WORLD words (AI-tapers spec §2): the design schema's form. A face is
 * the world side it lies on; `toward` is the end that gets thinner. The ONE place
 * a design taper crosses to a stored one and back, through invariant 44's helpers.
 * Model-facing text only (no `→ units` edge).
 */
export type Dir = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';
export const DIRS: readonly Dir[] = ['+x', '-x', '+y', '-y', '+z', '-z'];
export interface WorldTaper { faces: Dir[]; toward: Dir; start: number; amount: number }

const AXES = 'xyz';
const axisOf = (d: Dir) => AXES.indexOf(d[1]!);
const rank = (d: Dir) => DIRS.indexOf(d);
const fromRank = (f: CutFrom) => (f === 'min' ? 0 : 1);

/** The stored face (dimension and side) lying on world side `d`. */
export function dirToLocal(b: Board, d: Dir): { dim: Dimension; from: CutFrom } {
  const axis = axisOf(d);
  return { dim: axisDimensions(b)[axis]!, from: endFacing(b, axis, d[0] === '-' ? -1 : 1) };
}

/** The exact inverse of dirToLocal. */
export function localToDir(b: Board, dim: Dimension, from: CutFrom): Dir {
  const axis = axisDimensions(b).indexOf(dim);
  return `${endFacing(b, axis, -1) === from ? '-' : '+'}${AXES[axis]}` as Dir;
}

/**
 * A taper as `taperCut` writes it (spec §5.1): along the length, full depth at station
 * 0, zero at `start`. Recognised STRUCTURALLY, so its numbers read back exactly.
 */
export function isStandardTaper(c: AngleCut): boolean {
  const [[s0, q0], [s1, q1]] = c.points;
  return c.kind === 'taper' && c.along === 'length' && c.face !== 'length' && s0 === 0 && q1 === 0 &&
    Number.isFinite(q0) && q0 > 0 && Number.isFinite(s1) && s1 > 0;
}

/**
 * A part's tapers in design form: tapers sharing `toward`, `start` and `amount` merged into
 * one entry, faces in DIRS order, entries by `toward`, `start`, `amount`. Null when any taper
 * is not in standard form (Refine refuses those, spec §5.2). Other angle-cut kinds are not
 * read: every caller has refused them already.
 */
export function worldTapers(b: Board): WorldTaper[] | null {
  const out: WorldTaper[] = [];
  for (const c of b.angleCuts) {
    if (c.kind !== 'taper') continue;
    if (!isStandardTaper(c)) return null;
    const face = localToDir(b, c.face, c.from);
    const toward = localToDir(b, 'length', c.alongFrom);
    const start = c.points[1][0];
    const amount = c.points[0][1];
    const hit = out.find((t) => t.toward === toward && t.start === start && t.amount === amount);
    if (!hit) out.push({ faces: [face], toward, start, amount });
    else if (!hit.faces.includes(face)) hit.faces.push(face);
  }
  for (const t of out) t.faces.sort((x, y) => rank(x) - rank(y));
  return out.sort((x, y) => rank(x.toward) - rank(y.toward) || x.start - y.start || x.amount - y.amount);
}

/**
 * Which rule a taper broke — for a caller that words it for a PERSON (Refine's refusal), so it never
 * shows the model-facing `fault` text and never restates the checks.
 */
export type TaperFaultCode = 'along' | 'faces' | 'start' | 'amount' | 'no-wood';

/**
 * Design tapers → stored cuts on `b` (oriented; numbers already snapped), one `taperCut`
 * per face, in ONE canonical order (spec §2.1: `sameShared` compares angle cuts by index).
 * Or the first rule broken (spec §2.2), as a phrase the caller prefixes with the part's
 * name: "has a taper toward -x, …".
 */
export function taperCutsFor(b: Board, tapers: readonly WorldTaper[]): { cuts: Omit<AngleCut, 'id'>[] } | { fault: string; code: TaperFaultCode } {
  const L = AXES[axisDimensions(b).indexOf('length')]!.toUpperCase();
  const cuts: Omit<AngleCut, 'id'>[] = [];
  for (const t of tapers) {
    const end = dirToLocal(b, t.toward);
    if (end.dim !== 'length') return { fault: `has a taper toward ${t.toward}, which is not along its length (${L}); a taper runs along a part's longest side`, code: 'along' };
    if (t.faces.length === 0) return { fault: `has a taper toward ${t.toward} with no faces`, code: 'faces' };
    if (t.faces.length > 4) return { fault: `has a taper toward ${t.toward} with more than 4 faces`, code: 'faces' };
    if (new Set(t.faces).size !== t.faces.length) return { fault: `has a taper toward ${t.toward} that names a face twice`, code: 'faces' };
    const bad = t.faces.find((f) => dirToLocal(b, f).dim === 'length');
    if (bad) return { fault: `has a taper face ${bad}, which is an end of the part; taper faces are its sides`, code: 'faces' };
    if (!(t.start > 0 && t.start <= b.length)) return { fault: `has a taper toward ${t.toward} whose start (${t.start}in) is not above 0 and at most its length (${b.length}in)`, code: 'start' };
    if (!(t.amount > 0)) return { fault: `has a taper toward ${t.toward} whose amount (${t.amount}in) is not above 0`, code: 'amount' };
    for (const f of t.faces) {
      const l = dirToLocal(b, f);
      cuts.push(taperCut({ face: l.dim as 'width' | 'thickness', from: l.from, end: end.from, start: t.start, amount: t.amount }));
    }
  }
  // Wood left at each END of the length, across each side dimension: the deepest cut on the
  // min face plus the deepest on the max face (cuts on one face overlap, they do not stack).
  // Depths are linear in station and clamped at 0, so the ends are where the sum is largest.
  for (const dim of ['width', 'thickness'] as const) {
    for (const at of ['min', 'max'] as const) {
      const station = (c: Omit<AngleCut, 'id'>) => (c.alongFrom === at ? 0 : b.length);
      const deepest = (from: CutFrom) => Math.max(0, ...cuts.filter((c) => c.face === dim && c.from === from).map((c) => depthAt(c, station(c))));
      if (deepest('min') + deepest('max') >= b[dim]) {
        return { fault: `has tapers that leave no wood across its ${localToDir(b, dim, 'min')[1]!.toUpperCase()} at its ${localToDir(b, 'length', at)} end`, code: 'no-wood' };
      }
    }
  }
  cuts.sort((x, y) => DIMENSION_ORDER.indexOf(x.face) - DIMENSION_ORDER.indexOf(y.face) || fromRank(x.from) - fromRank(y.from) ||
    fromRank(x.alongFrom) - fromRank(y.alongFrom) || x.points[1][0] - y.points[1][0] || x.points[0][1] - y.points[0][1]);
  return { cuts };
}
