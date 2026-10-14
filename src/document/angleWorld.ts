import type { AngleCut, Board, CutFrom, Dimension } from './types';
import { DIMENSION_ORDER, axisDimensions } from './geometry';
import { ANGLE_KINDS, angleCutRemovesNothing, angleCutValues, bevelAcross, bevelCut, chamferCut, miterCut, miterDegrees, miterRatio } from './angleCuts';
import { DIRS, dirToLocal, localToDir } from './taperWorld';
import type { Dir } from './taperWorld';

/**
 * Miters, bevels and chamfers in WORLD words (AI-angles spec §5): the design schema's form. The ONE place a design
 * miter, bevel or chamfer crosses to stored cuts and back, through invariant 44's helpers, writing through the
 * Properties writers so a generated cut is stored exactly as a hand-made one. Model-facing text only (no `→ units`).
 */
export interface WorldMiter { end: Dir; longPoint: Dir; angle: number }
export interface WorldBevel { face: Dir; longPoint: Dir; angle: number }
export interface WorldChamfer { edge: [Dir, Dir]; legs: [number, number] }
export interface WorldAngles { miters: WorldMiter[]; bevels: WorldBevel[]; chamfers: WorldChamfer[] }
export const noAngles = (): WorldAngles => ({ miters: [], bevels: [], chamfers: [] });

/** Which rule a cut broke — for a caller that words it for a PERSON (Refine's refusal). */
export type AngleFaultCode = 'direction' | 'angle' | 'legs' | 'no-wood';

const AXES = 'xyz';
const rank = (d: Dir) => DIRS.indexOf(d);
const tenth = (deg: number) => Math.round(deg * 10) / 10;

/**
 * Degrees → the stored slope: a degree value Refine wrote (`exact`, from `angleRatiosOf`) maps back to the stored ratio,
 * exactly; any other is rounded to 0.1° (the angle field's resolution) and written through `miterRatio` (45° → 1).
 */
export function ratioFor(degrees: number, exact?: ReadonlyMap<number, number>): number {
  const hit = exact?.get(degrees);
  return hit !== undefined ? hit : miterRatio(tenth(degrees));
}

/** Kind order (`ANGLE_KINDS`), then the stored fields in `ANGLE_CUT_KEYS` order (strings before numbers never mix). */
export function sortAngleCuts<T extends Omit<AngleCut, 'id'>>(cuts: T[]): T[] {
  const cmp = (x: T, y: T) => {
    const k = ANGLE_KINDS.indexOf(x.kind) - ANGLE_KINDS.indexOf(y.kind);
    if (k !== 0) return k;
    const a = angleCutValues(x);
    const b = angleCutValues(y);
    for (let i = 0; i < a.length; i += 1) {
      const p = a[i]!;
      const q = b[i]!;
      if (p === q) continue;
      return typeof p === 'number' && typeof q === 'number' ? p - q : String(p) < String(q) ? -1 : 1;
    }
    return 0;
  };
  return [...cuts].sort(cmp);
}

/**
 * Design angles → stored cuts on `b` (oriented; legs already snapped), in the canonical order (§5.2), or the first rule
 * broken, as a phrase the caller prefixes with the part's name: "has a miter at +x, …".
 */
export function angleCutsFor(b: Board, a: WorldAngles, exact?: ReadonlyMap<number, number>): { cuts: Omit<AngleCut, 'id'>[] } | { fault: string; code: AngleFaultCode } {
  const L = AXES[axisDimensions(b).indexOf('length')]!.toUpperCase();
  const angleOk = (deg: number) => exact?.has(deg) === true || (tenth(deg) > 0 && tenth(deg) < 90);
  const cuts: Omit<AngleCut, 'id'>[] = [];
  const ends = new Set<CutFrom>();
  for (const m of a.miters) {
    const e = dirToLocal(b, m.end);
    if (e.dim !== 'length') return { fault: `has a miter at ${m.end}, which is not an end of the part; a miter cuts an end (its length runs along ${L})`, code: 'direction' };
    if (ends.has(e.from)) return { fault: `has two miters at its ${m.end} end`, code: 'direction' };
    ends.add(e.from);
    const lp = dirToLocal(b, m.longPoint);
    if (lp.dim === 'length') return { fault: `has a miter at its ${m.end} end whose long point ${m.longPoint} is an end; the long point is on a side`, code: 'direction' };
    if (!angleOk(m.angle)) return { fault: `has a miter at its ${m.end} end whose angle (${m.angle}) is not between 0 and 90 degrees`, code: 'angle' };
    const ratio = ratioFor(m.angle, exact);
    if (b[lp.dim] * ratio > b.length) return { fault: `has a miter at its ${m.end} end that cuts deeper than the part is long`, code: 'no-wood' };
    cuts.push(miterCut({ end: e.from, across: lp.dim as 'width' | 'thickness', longSide: lp.from, ratio }, b));
  }
  // Two miters: their deepest points together must leave wood along the length (conservative: either long side).
  if (cuts.length === 2 && cuts[0]!.points[1][1] + cuts[1]!.points[1][1] >= b.length) {
    return { fault: 'has miters at both ends that leave no wood between them', code: 'no-wood' };
  }
  for (const v of a.bevels) {
    const f = dirToLocal(b, v.face);
    if (f.dim === 'length') return { fault: `has a bevel on ${v.face}, which is an end of the part; a bevel is cut on a side`, code: 'direction' };
    const across = bevelAcross(f.dim as 'width' | 'thickness');
    const lp = dirToLocal(b, v.longPoint);
    if (lp.dim !== across) {
      return { fault: `has a bevel on ${v.face} whose long point ${v.longPoint} is not across that face (use ${localToDir(b, across, 'min')} or ${localToDir(b, across, 'max')})`, code: 'direction' };
    }
    if (!angleOk(v.angle)) return { fault: `has a bevel on ${v.face} whose angle (${v.angle}) is not between 0 and 90 degrees`, code: 'angle' };
    const ratio = ratioFor(v.angle, exact);
    if (b[across] * ratio > b[f.dim]) return { fault: `has a bevel on ${v.face} that cuts deeper than the part is thick there`, code: 'no-wood' };
    cuts.push(bevelCut({ face: f.dim as 'width' | 'thickness', from: f.from, longSide: lp.from, ratio }, b));
  }
  for (const c of a.chamfers) {
    const [p, q] = c.edge.map((d) => dirToLocal(b, d)) as [{ dim: Dimension; from: CutFrom }, { dim: Dimension; from: CutFrom }];
    const edge = `${c.edge[0]}/${c.edge[1]}`;
    if (p.dim === q.dim) return { fault: `has a chamfer on ${edge}, which is not an edge (both faces are on one axis)`, code: 'direction' };
    if (!(c.legs[0] > 0 && c.legs[1] > 0)) return { fault: `has a chamfer on the ${edge} edge whose legs are not both above 0`, code: 'legs' };
    if (c.legs[0] > b[p.dim] || c.legs[1] > b[q.dim]) return { fault: `has a chamfer on the ${edge} edge with a leg longer than the part is across`, code: 'no-wood' };
    const first = DIMENSION_ORDER.indexOf(p.dim) < DIMENSION_ORDER.indexOf(q.dim);
    const [f, g, lf, lg] = first ? [p, q, c.legs[0], c.legs[1]] : [q, p, c.legs[1], c.legs[0]];
    cuts.push(chamferCut({ face: f.dim, from: f.from, along: g.dim, alongFrom: g.from, legFace: lf, legAlong: lg }, b));
  }
  const seen = new Set<string>();
  for (const c of cuts) {
    const key = `${c.kind}|${c.face}|${c.from}|${c.along}|${c.alongFrom}`;
    if (seen.has(key)) return { fault: `has two ${c.kind}s on the same ${c.kind === 'chamfer' ? 'edge' : 'face'}`, code: 'direction' };
    seen.add(key);
    if (angleCutRemovesNothing(b, c as AngleCut)) return { fault: `has a ${c.kind} that removes no wood`, code: 'no-wood' };
  }
  return { cuts: sortAngleCuts(cuts) };
}

/**
 * A part's miters, bevels and chamfers in design form (§5.3), each list in one canonical order (DIRS rank), a chamfer's
 * edge normalised to DIRS rank with its legs following. Recognised STRUCTURALLY — the exact shape its writer stores —
 * so its numbers read back exactly; null when any non-taper cut has another shape (Refine refuses those, §6.1).
 */
export function worldAngles(b: Board): WorldAngles | null {
  const out = noAngles();
  for (const c of b.angleCuts) {
    if (c.kind === 'taper') continue;
    const [[s0, q0], [s1, q1]] = c.points;
    if (c.kind === 'miter' || c.kind === 'bevel') {
      const shaped = c.kind === 'miter'
        ? c.face === 'length' && c.along !== 'length'
        : c.face !== 'length' && c.along === bevelAcross(c.face as 'width' | 'thickness');
      if (!(shaped && s0 === 0 && q0 === 0 && s1 === b[c.along] && Number.isFinite(q1) && q1 > 0)) return null;
      const angle = miterDegrees(q1 / s1);
      const longPoint = localToDir(b, c.along, c.alongFrom);
      if (c.kind === 'miter') out.miters.push({ end: localToDir(b, 'length', c.from), longPoint, angle });
      else out.bevels.push({ face: localToDir(b, c.face, c.from), longPoint, angle });
    } else {
      const canonical = c.face !== c.along && DIMENSION_ORDER.indexOf(c.face) < DIMENSION_ORDER.indexOf(c.along);
      if (!(canonical && s0 === 0 && q1 === 0 && Number.isFinite(q0) && q0 > 0 && Number.isFinite(s1) && s1 > 0)) return null;
      const p = { d: localToDir(b, c.face, c.from), leg: q0 };
      const q = { d: localToDir(b, c.along, c.alongFrom), leg: s1 };
      const [x, y] = rank(p.d) <= rank(q.d) ? [p, q] : [q, p];
      out.chamfers.push({ edge: [x.d, y.d], legs: [x.leg, y.leg] });
    }
  }
  out.miters.sort((x, y) => rank(x.end) - rank(y.end) || rank(x.longPoint) - rank(y.longPoint) || x.angle - y.angle);
  out.bevels.sort((x, y) => rank(x.face) - rank(y.face) || rank(x.longPoint) - rank(y.longPoint) || x.angle - y.angle);
  out.chamfers.sort((x, y) => rank(x.edge[0]) - rank(y.edge[0]) || rank(x.edge[1]) - rank(y.edge[1]) || x.legs[0] - y.legs[0] || x.legs[1] - y.legs[1]);
  return out;
}

/**
 * The exact-angle map (§6.2): each degree value `worldAngles` writes for a miter or bevel on these parts → its stored
 * slope (depth ÷ run, read off the points). `ratioFor` uses it so an untouched angle is re-stored exactly. Two slopes
 * printing the same degree value keep the first (they differ by float noise only).
 */
export function angleRatiosOf(boards: readonly Board[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const b of boards) {
    for (const c of b.angleCuts) {
      if (c.kind !== 'miter' && c.kind !== 'bevel') continue;
      const [[, ], [s1, q1]] = c.points;
      if (!(s1 > 0 && q1 > 0)) continue;
      const deg = miterDegrees(q1 / s1);
      if (!out.has(deg)) out.set(deg, q1 / s1);
    }
  }
  return out;
}
