import type { Board, Dimension, FlatDocument, Region } from '../../document/document';
import { clippedRegion } from '../../document/cuts';
import { HOLE_EPS, holeInstances, holeRegion } from '../../document/holes';
import { crossSectionOverlaps, featureMeetsBox, featureTouchesEnd, runsOutThrough, shapedFeatures } from '../../document/featureRegions';
import type { ShapedFeature } from '../../document/featureRegions';
import type { FeatureWord } from '../../document/ruledOutText';
import { applyJoints, tenonSection } from './recipes';
import type { JoinWatch, JointChoice } from './recipes';
import { rangesOf } from './sites';
import type { JointKind, Site } from './sites';

/** What ruled a kind out, as the summary names it (spec §3.5; P8's words, `ruledOutText.ts`). */
export type { FeatureWord };
export interface RuledOut { site: number; kind: Exclude<JointKind, 'butt'>; part: number; feature: FeatureWord }

const DIMS: readonly Dimension[] = ['length', 'width', 'thickness'];
/** Touching is allowed: a conflict is an overlap above float noise on all three dimensions (spec §3.3, amended). */
const overlaps = (a: Region, b: Region) => DIMS.every((d) => Math.min(a[d][1], b[d][1]) - Math.max(a[d][0], b[d][0]) > HOLE_EPS);
const holeRegions = (b: Board) => b.holes.flatMap((r) => holeInstances(b, r)).map(holeRegion);
const hasShaped = (b: Board) => b.curves.length > 0 || b.profiles.length > 0;

/** A conflict: the part (a flat-document index) and the feature met. */
type Hit = { part: number; word: FeatureWord };
/** One part's shaped features, read once per `featureAllowed` call off the part BEFORE any trial (P5). */
type Shapes = { view: Board; features: ShapedFeature[] };
type ShapeCache = (part: number) => Shapes | null;

/** `box` (board-local, the board as it stands mid-trial) moved into the part's original frame: everything measured from a
 *  min end has moved by that end's growths so far in the trial (P5). */
const original = (box: Region, shift: Record<Dimension, number>): Region => {
  const out = { ...box };
  for (const d of DIMS) out[d] = [box[d][0] - shift[d], box[d][1] - shift[d]];
  return out;
};

/**
 * The watch for one trial: the first part (a flat-document index) whose features the trial's joint would cut into, grow
 * through or trim, with the feature met. At each event holes are judged first, then curves and profiles; the first hit wins.
 *
 * HOLES (chunk 1's rule, unchanged): judged board-local on the board as `applyJoints` passes it, so a part that moved, or
 * whose holes an earlier resize in the trial already re-anchored, is judged as it then stands.
 * - A pocket conflicts when its box overlaps a bore's box (spec §3.3).
 * - A GROWTH conflicts when any bore touches the end that grows (spec §3.4): `resize` fires before the change, so
 *   `board[d]` is the old dimension.
 * - A TRIM conflicts when any bore overlaps the slab it removes (spec §3.4, trimmed ends).
 *
 * CURVES AND PROFILES (joinery features P4–P7): judged on the part as `flatDocument` gave it (`shapes`, never a view of a
 * mid-trial board: `geometryBoard` is memoised per object). A pocket's box or a trim's slab is moved into that frame by
 * the part's running min-end growth in this trial (`shift`, from 0).
 * - A pocket conflicts with the first feature whose region it meets (`featureMeetsBox`; open, P4's conservative cases).
 * - A GROWTH conflicts with a feature that touches the growing end with positive area (`featureTouchesEnd`, P6), unless
 *   it takes the run-through exception (P7): the grown dimension is the length (1), it runs out through the growing face
 *   (2), and its waste clears the tenon's section (3), `tenonSection` of the board as it stands, moved into the frame.
 * - A TRIM conflicts with a feature that meets the slab, unless it runs out through the trimmed end along `d`: it is
 *   shortened with the part (spec §3.4).
 *
 * Known limit (final review): `featureTouchesEnd` and `runsOutThrough` judge the ORIGINAL part's end (the running shift
 * moves boxes and slabs into that frame, not the end), so a SECOND resize at the same end within one trial would be judged
 * at the original end, not where the first left it. Unreachable today: growth happens only in single-site mortise/dado
 * trials, and trims only in rabbet units. A new recipe that resizes one end twice in a trial must carry the end's running
 * offset into these tests first.
 */
function watchFeatures(shapes: ShapeCache): { watch: JoinWatch; hit: () => Hit | null } {
  let hit: Hit | null = null;
  const shifts = new Map<number, Record<Dimension, number>>();
  const shiftOf = (part: number) => {
    let s = shifts.get(part);
    if (!s) shifts.set(part, (s = { length: 0, width: 0, thickness: 0 }));
    return s;
  };
  const meets = (part: number, box: Region, skip?: (s: Shapes, f: ShapedFeature) => boolean): Hit | null => {
    const s = shapes(part);
    if (!s) return null;
    const moved = original(box, shiftOf(part));
    const f = s.features.find((g) => !skip?.(s, g) && featureMeetsBox(s.view, g, moved));
    return f ? { part, word: f.word } : null;
  };
  const watch: JoinWatch = {
    cut(part, board, cut) {
      if (hit !== null) return;
      const box = clippedRegion(board, cut);
      if (holeRegions(board).some((h) => overlaps(box, h))) { hit = { part, word: 'holes' }; return; }
      hit = meets(part, box);
    },
    resize(part, board, d, end, amount) {
      if (hit !== null) return;
      const regions = holeRegions(board);
      if (amount > 0) {
        if (regions.some((r) => (end === 'min' ? r[d][0] <= HOLE_EPS : r[d][1] >= board[d] - HOLE_EPS))) hit = { part, word: 'holes' };
        else hit = grows(part, board, d, end);
      } else {
        const slab: Region = { length: [0, board.length], width: [0, board.width], thickness: [0, board.thickness] };
        slab[d] = end === 'min' ? [0, -amount] : [board[d] + amount, board[d]];
        if (regions.some((r) => overlaps(r, slab))) hit = { part, word: 'holes' };
        else hit = meets(part, slab, (s, f) => runsOutThrough(s.view, f, d, end));
      }
      if (end === 'min') shiftOf(part)[d] += amount;
    },
  };
  /** P6 and P7 at a growing end. */
  const grows = (part: number, board: Board, d: Dimension, end: 'min' | 'max'): Hit | null => {
    const s = shapes(part);
    if (!s) return null;
    const shift = shiftOf(part);
    const { cheek, shoulder } = tenonSection(board.thickness, board.width);
    const lo: [number, number] = [shoulder - shift.width, cheek - shift.thickness];
    const hi: [number, number] = [board.width - shoulder - shift.width, board.thickness - cheek - shift.thickness];
    const exempt = (f: ShapedFeature) => d === 'length' && runsOutThrough(s.view, f, d, end) && !crossSectionOverlaps(s.view, f, lo, hi);
    const f = s.features.find((g) => featureTouchesEnd(s.view, g, d, end) && !exempt(g));
    return f ? { part, word: f.word } : null;
  };
  return { watch, hit: () => hit };
}

/**
 * One watched trial join: `choices` applied, every other site left butt (a missing choice is a butt). Null when the
 * trial meets no feature. Every recipe refusal is decided before it resizes or cuts anything (inv 41), so a joint the trial
 * skips reports nothing; its conflicts are dropped all the same (the ruling: a skipped trial rules nothing out).
 */
function trial(flat: FlatDocument, sites: readonly Site[], choices: JointChoice[], shapes: ShapeCache): Hit | null {
  const { watch, hit } = watchFeatures(shapes);
  const result = applyJoints(flat, sites as Site[], choices, watch);
  if (choices.every((c) => result.skipped.some((s) => s.site === c.site))) return null;
  return hit();
}

/** The first conflict over a kind's trials, or null. */
const firstHit = (flat: FlatDocument, sites: readonly Site[], trials: JointChoice[][], shapes: ShapeCache): Hit | null => {
  for (const choices of trials) {
    const hit = trial(flat, sites, choices, shapes);
    if (hit !== null) return hit;
  }
  return null;
};

/**
 * THE one decider of which joint kinds features rule out, per site (joinery-holes spec §3.5; P1: zones by trial). Each
 * (site, kind) is joined alone in a watched trial at the size that reaches furthest, and the kind is ruled out when the
 * trial would cut, grow or trim into a hole, a curve or a profile (P4–P7). Pure, and decided before any call or mutation (inv 41).
 * - mortise-tenon at `tenonLength[1]`, dado at `dadoDepth[1]`.
 * - half-lap once per UNIT (the entering part's half-lap sites on one axis and side, as `applyJoints` drops it into all
 *   its partners together); a conflict rules half-lap out at every member.
 * - stopped-dado once per stop end, at `dadoDepth[1]` and that end's smallest inset; any conflicting end rules the kind
 *   out (the stop end is Claude's to choose).
 * - rabbet once per UNIT (the panel's rabbet sites on one face, `applyJoints`' `rabbetUnits`), all members rabbeted
 *   together at their smallest depths (the panel's trims are largest) and again at their largest (the pockets are). A
 *   conflict rules rabbet out at every member, a trimmed part's included: a unit is resolved as one.
 *
 * `sites` comes back in order with the same ids; a narrowed site is a new object, every other keeps its identity, and
 * with nothing ruled out the same array comes back (with no hole, curve or profile anywhere, byte for byte). `ruledOut` lists each
 * (site, kind) in site order then `allowed` order, which `allowedFor` builds in JOINTS order, naming the first part met.
 */
export function featureAllowed(flat: FlatDocument, sites: readonly Site[]): { sites: Site[]; ruledOut: RuledOut[] } {
  if (!flat.boards.some((b) => b.holes.length > 0 || hasShaped(b))) return { sites: sites as Site[], ruledOut: [] };
  // Each part's curves and profiles, read once off the part as flatDocument gave it (P5; applyJoints clones, so it is
  // never mutated). A part with none is never read (a holes-only project takes chunk 1's path alone).
  const cache = new Map<number, Shapes | null>();
  const shapes: ShapeCache = (part) => {
    if (!cache.has(part)) { const b = flat.boards[part]!; cache.set(part, hasShaped(b) ? shapedFeatures(b) : null); }
    return cache.get(part)!;
  };
  const units = new Map<string, Hit | null>();
  const unitKey = (s: Site) => `${s.enter}|${s.axis}|${s.side}`;
  const rabbetUnit = (s: Site): Hit | null => {
    const key = unitKey(s);
    if (!units.has(key)) {
      const members = sites.filter((m) => m.allowed.includes('rabbet') && unitKey(m) === key);
      const at = (i: 0 | 1) => members.map((m): JointChoice => ({ site: m.id, joint: 'rabbet', depth: rangesOf(m, flat).rabbetDepth[i] }));
      units.set(key, firstHit(flat, sites, [at(0), at(1)], shapes));
    }
    return units.get(key)!;
  };
  // A part's half-laps along one axis are one UNIT: the real run can drop it into all its chosen partners at once and
  // may refuse a partial set (an unchosen partner in the drop path; the unit over-rules by design), so a lone crossing's trial skips.
  const laps = new Map<string, Hit | null>();
  const lapUnit = (s: Site): Hit | null => {
    const key = unitKey(s);
    if (!laps.has(key)) {
      const members = sites.filter((m) => m.allowed.includes('half-lap') && unitKey(m) === key);
      laps.set(key, firstHit(flat, sites, [members.map((m): JointChoice => ({ site: m.id, joint: 'half-lap' }))], shapes));
    }
    return laps.get(key)!;
  };
  const conflict = (s: Site, kind: Exclude<JointKind, 'butt'>): Hit | null => {
    const r = rangesOf(s, flat);
    switch (kind) {
      case 'mortise-tenon': return firstHit(flat, sites, [[{ site: s.id, joint: kind, tenonLength: r.tenonLength[1] }]], shapes);
      case 'dado': return firstHit(flat, sites, [[{ site: s.id, joint: kind, depth: r.dadoDepth[1] }]], shapes);
      case 'stopped-dado': return firstHit(flat, sites, s.stopEnds.map((e) => [{ site: s.id, joint: kind, depth: r.dadoDepth[1], stopAt: e, inset: r.inset(e)[0] }]), shapes);
      case 'half-lap': return lapUnit(s);
      case 'rabbet': return rabbetUnit(s);
    }
  };

  const ruledOut: RuledOut[] = [];
  const out = sites.map((s) => {
    const gone = new Set<JointKind>();
    for (const kind of s.allowed) {
      if (kind === 'butt') continue;
      const hit = conflict(s, kind);
      if (hit === null) continue;
      gone.add(kind);
      ruledOut.push({ site: s.id, kind, part: hit.part, feature: hit.word });
    }
    return gone.size === 0 ? s : { ...s, allowed: s.allowed.filter((k) => !gone.has(k)) };
  });
  return ruledOut.length === 0 ? { sites: sites as Site[], ruledOut } : { sites: out, ruledOut };
}
