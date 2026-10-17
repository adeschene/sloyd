import type { AngleCut, Board, CurveCut, Dimension, HoleRow } from './types';
import type { Vec3 } from './frames';
import { formatLength, type Units } from '../units/length';
import { DIMENSION_ORDER } from './geometry';
import { toWorld } from './snapPoints';
import { holeFaults } from './holeFaults';
import { holePitchText, holeSizeText } from './holeText';
import { angleDegrees } from './angleText';
import { angleCutRemovesNothing, chamferFields, depthAt, keptHalfSpace, taperFields } from './angleCuts';
import { archFields, bowFields, cornerFields, curveFaults, localSegments } from './curves';
import { curveLineEntries, filletWords, profileName } from './curveText';
import { geometryBoard, profileFields } from './profiles';

/**
 * The Plans sheet's feature keys (feature callouts spec §2.2, §3): ONE home for a feature's identity, the segment tags it
 * owns, its key line (a short bench line: what it is and its key size, never where — the tag on the drawing is the where,
 * and the part diagram has the stations) and the directions it shows true from. Lengths through the document's units
 * (inv 52); every string built here (inv 19).
 */
export type FeatureKind = 'hole' | 'angle' | 'curve';
export const featureTag = (part: string, kind: FeatureKind, id: string) => `${part}:${kind}:${id}`;
export const FAULT_SUFFIX = ' — check the cut list';

export interface PartFeature {
  key: string;
  tags: string[];
  part: string;
  text: string;
  trueAxis: Vec3 | null;
  trueNormal: Vec3 | null;
}

const ORIGIN = { length: 0, width: 0, thickness: 0 };
/** A board-local direction in the drawing's frame, unit length (the composition's turn and mirror resolved by toWorld). */
function worldDir(b: Board, v: readonly number[]): Vec3 {
  const o = toWorld(b, ORIGIN);
  const p = toWorld(b, { length: v[0]!, width: v[1]!, thickness: v[2]! });
  const d = [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
  const l = Math.hypot(d[0]!, d[1]!, d[2]!);
  return [d[0]! / l, d[1]! / l, d[2]! / l];
}
const axisOf = (b: Board, dim: Dimension) => worldDir(b, DIMENSION_ORDER.map((d) => (d === dim ? 1 : 0)));
const radiusOf = (span: number, rise: number) => (span * span / 4 + rise * rise) / (2 * rise);

function holeText(r: HoleRow, units: Units): string {
  const size = holeSizeText(r, units);
  return r.count === 1 ? `Hole ${size}` : `Row of ${r.count} holes, ${size}, every ${holePitchText(r, units)}`;
}

/** An angle cut a later resize pushed past its part: its line runs deeper than the dimension it enters (fu 296's note). */
const overruns = (b: Board, c: AngleCut) => Math.max(depthAt(c, 0), depthAt(c, b[c.along])) > b[c.face] + 1e-9;

function angleText(b: Board, c: AngleCut, units: Units): string {
  const f = (n: number) => formatLength(n, units);
  const deg = `${angleDegrees(c).toFixed(1)}°`;
  switch (c.kind) {
    case 'miter': return `Miter ${deg}`;
    case 'bevel': return `Bevel ${deg}`;
    case 'chamfer': {
      const cf = chamferFields(c, b);
      if (!cf) return `Chamfer ${deg}`;
      return cf.legFace === cf.legAlong ? `Chamfer ${f(cf.legFace)}` : `Chamfer ${f(cf.legFace)} × ${f(cf.legAlong)}`;
    }
    case 'taper': {
      const A = b[c.along];
      const t = taperFields(c, b);
      if (t.amount > 0 && Number.isFinite(t.start) && t.start > 0 && t.start <= A + 1e-9) return `Taper ${f(t.amount)} over ${f(t.start)}`;
      return `Taper ${f(Math.max(0, depthAt(c, 0)))} to ${f(Math.max(0, depthAt(c, A)))}`;
    }
  }
}

function curveText(c: CurveCut, b: Board, units: Units, collapsed: boolean): string {
  const f = (n: number) => formatLength(n, units);
  const prof = profileFields(c);
  // Final review F2: the fillet words too (THE bench line's helper), or a filleted and a plain profile share a letter.
  if (prof) return `${profileName(prof, units)}${filletWords(prof, units)}${collapsed ? ' (4×)' : ''}`;
  const arch = archFields(c);
  if (arch) {
    if (arch.rise === arch.span / 2) return `Half-round notch, ${f(arch.span)} wide`;
    return `Arch, ${f(arch.span)} span, ${f(arch.rise)} rise (radius ${f(radiusOf(arch.span, arch.rise))})`;
  }
  const bow = bowFields(c);
  if (bow) return `Bow ${f(bow.rise)} over ${f(bow.span)} (radius ${f(radiusOf(bow.span, bow.rise))})`;
  const corner = cornerFields(c);
  if (corner) return `${collapsed ? 'Four rounded corners' : 'Rounded corner'}, ${f(corner.radius)} radius`;
  const segs = localSegments(b, c);
  const arcs = segs.filter((s) => s.kind === 'arc').length;
  const lines = segs.length - arcs;
  return `Curve: ${arcs} arc${arcs === 1 ? '' : 's'} and ${lines} line${lines === 1 ? '' : 's'}`;
}

export function partFeatures(b: Board, units: Units): PartFeature[] {
  b = geometryBoard(b);
  const out: PartFeature[] = [];
  const push = (kind: FeatureKind, ids: string[], text: string, faulted: boolean, trueAxis: Vec3 | null, trueNormal: Vec3 | null) => {
    const tags = ids.map((id) => featureTag(b.id, kind, id));
    out.push({ key: tags[0]!, tags, part: b.id, text: faulted ? text + FAULT_SUFFIX : text, trueAxis, trueNormal });
  };
  for (const r of b.holes) push('hole', [r.id], holeText(r, units), holeFaults(b, r).length > 0, axisOf(b, r.face), null);
  for (const c of b.angleCuts) {
    // A cut that removes nothing at this size is no feature on paper (the cut list ignores it too; final review #2).
    if (angleCutRemovesNothing(b, c)) continue;
    const h = keptHalfSpace(b, c);
    push('angle', [c.id], angleText(b, c, units), overruns(b, c), null, h ? worldDir(b, h.n) : null);
  }
  // One feature per bench line: `curveLineEntries` is THE home of the four-corner collapse (curves spec Q6).
  for (const e of curveLineEntries(b, units)) {
    const cs = e.ids.map((id) => b.curves.find((c) => c.id === id)!);
    push('curve', e.ids, curveText(cs[0]!, b, units, e.ids.length === 4), cs.some((c) => curveFaults(b, c).length > 0), axisOf(b, cs[0]!.through), null);
  }
  return out;
}
