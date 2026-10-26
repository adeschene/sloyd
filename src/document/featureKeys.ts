import type { AngleCut, BandType, Board, CurveCut, Dimension, HoleRow, ProfileCut } from './types';
import type { Vec3 } from './frames';
import { formatLength, type Units } from '../units/length';
import { DIMENSION_ORDER } from './geometry';
import { toWorld } from './snapPoints';
import { holeFaults } from './holeFaults';
import { edgeName, holePitchText, holeSizeText } from './holeText';
import { isTilted } from './holeTilt';
import { angleDegrees } from './angleText';
import { angleCutRemovesNothing, chamferFields, deepestCorner, depthAt, keptHalfSpace, miterDegrees, taperFields } from './angleCuts';
import { archFields, bowFields, cornerFields, localSegments, spanOf } from './curves';
import { curveFaulted, curveLineEntries, filletWords, profileName, sweptRun } from './curveText';
import { endToEnd, geometryBoard, profileFields, viewProfileFaults } from './profiles';
import { BAND_SIDES, bandFaults, sameSide } from './banding';
import { faceOutline, sideStretch } from './profilePath';
import { degreesOf, leanMap, resultantDeg, sightlineDeg, worldSlopes } from './lean';

/**
 * The Plans sheet's feature keys (feature callouts spec §2.2, §3): ONE home for a feature's identity, the segment tags it
 * owns, its key line (a short bench line: what it is and its key size, never where — the tag on the drawing is the where,
 * and the part diagram has the stations) and the directions it shows true from. Lengths through the document's units
 * (inv 52); every string built here (inv 19).
 */
export type FeatureKind = 'hole' | 'angle' | 'curve' | 'band';
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

/** An angle cut a later resize pushed past its part: its line runs deeper than the dimension it enters (fu 296's note),
 *  at its deepest corner (`deepestCorner`: a compound cut's full depth). */
export const overruns = (b: Board, c: AngleCut) => deepestCorner(c, b) > b[c.face] + 1e-9;

function angleText(b: Board, c: AngleCut, units: Units): string {
  const f = (n: number) => formatLength(n, units);
  const deg = `${angleDegrees(c).toFixed(1)}°`;
  switch (c.kind) {
    // A compound miter (square-set legs §4) keys both angles — along, then across — as the bench line orders them.
    case 'miter': return c.across ? `Compound miter ${deg} × ${miterDegrees(Math.abs(c.across.rise)).toFixed(1)}°` : `Miter ${deg}`;
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
  // A stopped profile (P15): `, stopped` — a key carries no positions, and a stopped one never collapses.
  if (prof) return `${profileName(prof, units)}${filletWords(prof, units)}${spanOf(c) ? ', stopped' : ''}${collapsed ? ' (4×)' : ''}`;
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

/** A swept profile's key (profile runs b1, Q7): `<name><fillet>, all round` / `…, round the corners`, or the straight
 *  key's words when it only follows its own side (an arch, a notch). The run words are `sweptRun`'s. */
function sweptText(b: Board, p: ProfileCut, units: Units): string {
  // A stopped run (one side's station, or two sides — profile runs b2, Q22) keys `, stopped` and no run words: a key carries no positions.
  if (!('loop' in p.run) && !endToEnd(p.run)) {
    return `${profileName(p, units)}${filletWords(p, units)}, stopped`;
  }
  const run = sweptRun(b, p);
  return `${profileName(p, units)}${filletWords(p, units)}${run ? `, ${run}` : ''}`;
}

/** Whether a band type's name already carries its formatted thickness as a BOUNDED token (final review 1): starting the
 *  name or after a space, and ending it or followed by a space — so `Maple edging 1/4"` does, `Edging 1-1/4"` does not
 *  carry `1/4"`, and `Maple 16 mm` does not carry `6 mm`. */
const namesThickness = (name: string, thick: string): boolean => ` ${name} `.includes(` ${thick} `);

/** One key per band type a part uses (edge banding chunk 2, Q6): `<type name>[ <thickness>]: <sides>` (the thickness left
 *  out when the name already carries it, `namesThickness`), its sides in
 *  canonical order (faulted ones included, the key then carrying the fault suffix), types in canonical order of first use.
 *  Its tags: the band tag (on the glue lines and the untagged outline edges on its sides' planes, `drawView`) and, for each of its
 *  unfaulted bands on a curved stretch, every curve its stretch's chords carry — so no segment is retagged. Read off the
 *  STORED part, as `bandFaults` and the outline judge it. */
function bandFeatures(b: Board, units: Units, types: readonly BandType[]): PartFeature[] {
  if (types.length === 0 || b.bands.length === 0) return [];
  const faults = bandFaults(b, types);
  const out: PartFeature[] = [];
  const byType = new Map<string, { type: BandType; sides: string[]; faulted: boolean; curves: string[] }>();
  for (const side of BAND_SIDES) {
    const band = b.bands.find((x) => sameSide(x.side, side));
    const type = band && types.find((t) => t.id === band.type);
    if (!band || !type) continue;
    let entry = byType.get(type.id);
    if (!entry) { entry = { type, sides: [], faulted: false, curves: [] }; byType.set(type.id, entry); }
    entry.sides.push(edgeName({ dim: side.across, side: side.from }).slice(4));
    if (faults.some((f) => sameSide(f.side, side))) { entry.faulted = true; continue; }
    const outline = faceOutline(b);
    const st = outline && sideStretch(b, outline, side);
    if (!outline || !st) continue;
    const n = outline.chords.length;
    for (let i = st.from; ; i = (i + 1) % n) {
      const c = outline.chords[i]!.curve;
      if (c !== undefined && !entry.curves.includes(c)) entry.curves.push(c);
      if (i === st.to) break;
    }
  }
  for (const { type, sides, faulted, curves } of byType.values()) {
    const tag = featureTag(b.id, 'band', type.id);
    const thick = type.thickness > 0 && !namesThickness(type.name, formatLength(type.thickness, units))
      ? ` ${formatLength(type.thickness, units)}` : '';
    const text = `${type.name}${thick}: ${sides.join(', ')}`;
    out.push({
      key: tag, tags: [tag, ...curves.map((c) => featureTag(b.id, 'curve', c))], part: b.id,
      text: faulted ? text + FAULT_SUFFIX : text, trueAxis: axisOf(b, 'thickness'), trueNormal: null,
    });
  }
  return out;
}

export function partFeatures(b: Board, units: Units, bandTypes: readonly BandType[] = []): PartFeature[] {
  const bands = bandFeatures(b, units, bandTypes);
  b = geometryBoard(b);
  const out: PartFeature[] = [];
  const push = (kind: FeatureKind, ids: string[], text: string, faulted: boolean, trueAxis: Vec3 | null, trueNormal: Vec3 | null) => {
    const tags = ids.map((id) => featureTag(b.id, kind, id));
    out.push({ key: tags[0]!, tags, part: b.id, text: faulted ? text + FAULT_SUFFIX : text, trueAxis, trueNormal });
  };
  for (const r of b.holes) push('hole', [r.id], holeText(r, units), holeFaults(b, r).length > 0, isTilted(r) ? null : axisOf(b, r.face), null);
  for (const c of b.angleCuts) {
    // A cut that removes nothing at this size is no feature on paper (the cut list ignores it too; final review #2).
    if (angleCutRemovesNothing(b, c)) continue;
    const h = keptHalfSpace(b, c);
    push('angle', [c.id], angleText(b, c, units), overruns(b, c), null, h ? worldDir(b, h.n) : null);
  }
  // One feature per bench line: `curveLineEntries` is THE home of the four-corner collapse (curves spec Q6).
  for (const e of curveLineEntries(b, units)) {
    // A swept profile (profile runs b1) is in the view's `profiles`, never its curves: one id, its own entry (ids share the
    // curve scope, inv 33). It shows true looking down the thickness, where its path lies in plan.
    const swept = b.profiles.find((p) => p.id === e.ids[0]);
    if (swept) {
      push('curve', e.ids, sweptText(b, swept, units), viewProfileFaults(swept).length > 0, axisOf(b, 'thickness'), null);
      continue;
    }
    const cs = e.ids.map((id) => b.curves.find((c) => c.id === id)!);
    push('curve', e.ids, curveText(cs[0]!, b, units, e.ids.length === 4), cs.some((c) => curveFaulted(b, c)), axisOf(b, cs[0]!.through), null);
  }
  out.push(...bands);
  return out;
}

/** One lean component in words: `<word> <deg>°` and its direction, or no direction words when it reads 0.0° (Global
 *  Constraints: a 0 component prints `rake 0.0°`; one that only ROUNDS to 0.0° has no direction worth naming either). */
function leanPart(word: string, slope: number, plus: string, minus: string): string {
  const deg = degreesOf(Math.abs(slope)).toFixed(1);
  return deg === '0.0' ? `${word} 0.0°` : `${word} ${deg}° ${slope > 0 ? plus : minus}`;
}

/**
 * A leaning part's Plans note (splayed legs spec §6.2; copy verbatim from the Global Constraints):
 * `<name>: rake 8.0° toward the front, splay 12.0° toward the right — resultant 14.3° on a 33.5° sightline`, or null for
 * a part that does not lean. Read off the part as the trio DRAWS it (its world slopes: rake on world Z, + toward the
 * front; splay on world X, + toward the right), at `angleText.ts`' 0.1°. An HTML note under the figure, never a measured
 * SVG label (inv 19), so the whole string is built here and the panel only lists it.
 */
export function leanNote(b: Board): string | null {
  if (!leanMap(b)) return null;
  const [wx, wz] = worldSlopes(b);
  const rake = leanPart('rake', wz, 'toward the front', 'toward the back');
  const splay = leanPart('splay', wx, 'toward the right', 'toward the left');
  return `${b.name}: ${rake}, ${splay} — resultant ${resultantDeg({ x: wx, z: wz }).toFixed(1)}° on a ${sightlineDeg(wx, wz).toFixed(1)}° sightline`;
}

/** The lean notes of one trio: each KEYED leaning part's once (feature callouts spec §2.1's keying, `plans.ts`), so a part
 *  is noted once per sheet, in the trio that keys its features. */
export function leanNotes(parts: readonly Board[], keyed: ReadonlySet<string> | undefined): string[] {
  if (!keyed) return [];
  return parts.flatMap((b) => (keyed.has(b.id) ? leanNote(b) ?? [] : []));
}
