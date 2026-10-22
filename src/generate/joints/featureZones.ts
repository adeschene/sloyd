import type { Band, Board, Dimension, FlatDocument, Region } from '../../document/document';
import { clippedRegion } from '../../document/cuts';
import { HOLE_EPS, holeInstances, holeRegion } from '../../document/holes';
import { bandRegions, crossSectionOverlaps, featureMeetsBox, featureTouchesEnd, runsOutThrough, shapedFeatures } from '../../document/featureRegions';
import { runDim } from '../../document/profiles';
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
/** fu 415: how deep into the old wood the growing end's face is probed (a feature only meeting the end). */
const END_FACE = 1e-6;
const holeRegions = (b: Board) => b.holes.flatMap((r) => holeInstances(b, r)).map(holeRegion);
const hasShaped = (b: Board) => b.curves.length > 0 || b.profiles.length > 0;

/** A conflict: the part (a flat-document index) and the feature met. */
type Hit = { part: number; word: FeatureWord };
/** One part's shaped features, read once per `featureAllowed` call off the part BEFORE any trial (P5). */
type Shapes = { view: Board; features: ShapedFeature[] };
type ShapeCache = (part: number) => Shapes | null;
/** One part's bands with their regions (P9, P10), read once per `featureAllowed` call off the part BEFORE any trial. */
type Bands = { band: Band; region: Region | null }[];
type BandCache = (part: number) => Bands | null;
/** The joint kind a trial joins (every choice of one trial is one kind); only the band clause reads it (P11). */
type TrialKind = Exclude<JointKind, 'butt'>;
/** A band ON the `end` face of `d` (P11): tape included, whatever its thickness. */
const onEnd = (b: Band, d: Dimension, end: 'min' | 'max') => b.side.across === d && b.side.from === end;

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
 * BANDS (joinery features chunk 3, P9–P11): judged as stored (P10: the type's thickness, `bandFaults` ignored; a band whose
 * type is missing is skipped) on the part as `flatDocument` gave it, each watched box or slab moved into that frame by the
 * running min-end shift, as for curves. A band's region is its strip (`bandRegions`); tape of thickness 0 has none. Judged
 * after holes and shaped features at each event.
 * - A pocket conflicts when its box meets a band's region (open), so a tenon's cheek and shoulder waste, in new wood, never
 *   meets a long-edge band (P9).
 * - A GROWTH conflicts with a band ON the growing end (tape included). A band running along `d` is exempt only when
 *   `d === 'length'` and: the trial is a dado or stopped dado (the user's ruling: an edged shelf is housed whole), or it has
 *   no region, or its strip clears the tenon's section (`[shoulder, w − shoulder]` in width, open, moved into the frame);
 *   otherwise it conflicts. A band on the far end does not. A growth through the thickness (no recipe makes one) conflicts
 *   with any band.
 * - A TRIM conflicts with a band on the trimmed end (tape included); a band running along the trimmed dimension is
 *   shortened with the part and never does; any other band conflicts when its region meets the slab.
 *
 * Known limit (final review): `featureTouchesEnd` and `runsOutThrough` judge the ORIGINAL part's end (the running shift
 * moves boxes and slabs into that frame, not the end), so a SECOND resize at the same end within one trial would be judged
 * at the original end, not where the first left it. Unreachable today: growth happens only in single-site mortise/dado
 * trials, and trims only in rabbet units. A new recipe that resizes one end twice in a trial must carry the end's running
 * offset into these tests first.
 */
function watchFeatures(shapes: ShapeCache, bands: BandCache, kind: TrialKind): { watch: JoinWatch; hit: () => Hit | null } {
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
  /** The first band (stored order) `conflicts` names, as an edge band hit. */
  const bandHit = (part: number, conflicts: (b: Bands[number]) => boolean): Hit | null => {
    const bs = bands(part);
    return bs && bs.some(conflicts) ? { part, word: 'edge band' } : null;
  };
  const bandMeets = (part: number, box: Region) => {
    const moved = original(box, shiftOf(part));
    return bandHit(part, (b) => b.region !== null && overlaps(b.region, moved));
  };
  /** P11 at a growing end. The `d !== 'length'` clause also answers a THICKNESS growth: defensive, since no recipe grows a
   *  part through its thickness today (a probe over every joinery test never reached it). */
  const bandGrows = (part: number, board: Board, d: Dimension, end: 'min' | 'max'): Hit | null => {
    const shift = shiftOf(part);
    const { shoulder } = tenonSection(board.thickness, board.width);
    const [lo, hi] = [shoulder - shift.width, board.width - shoulder - shift.width];
    return bandHit(part, ({ band, region }) => {
      if (onEnd(band, d, end)) return true;
      if (band.side.across === d) return false;   // the far end: the new wood is not on its side
      if (d !== 'length') return true;            // the exception is for a length growth only (P11; a thickness growth meets every band)
      if (kind === 'dado' || kind === 'stopped-dado' || region === null) return false;
      return Math.min(region.width[1], hi) - Math.max(region.width[0], lo) > HOLE_EPS;
    });
  };
  /** P11 at a trimmed end. The region clause only conflicts for a THICKNESS trim (every band's strip spans the thickness)
   *  or a far-end band a slab deeper than the part less the band would reach: defensive, since rabbet units trim only a
   *  length or width end today (a probe over every joinery test reached no conflict there). */
  const bandTrims = (part: number, slab: Region, d: Dimension, end: 'min' | 'max'): Hit | null => {
    const moved = original(slab, shiftOf(part));
    return bandHit(part, ({ band, region }) => {
      if (onEnd(band, d, end)) return true;
      if (runDim(band.side) === d) return false;  // shortened with the part
      return region !== null && overlaps(region, moved);
    });
  };
  const watch: JoinWatch = {
    cut(part, board, cut) {
      if (hit !== null) return;
      const box = clippedRegion(board, cut);
      if (holeRegions(board).some((h) => overlaps(box, h))) { hit = { part, word: 'holes' }; return; }
      hit = meets(part, box) ?? bandMeets(part, box);
    },
    resize(part, board, d, end, amount) {
      if (hit !== null) return;
      const regions = holeRegions(board);
      if (amount > 0) {
        if (regions.some((r) => (end === 'min' ? r[d][0] <= HOLE_EPS : r[d][1] >= board[d] - HOLE_EPS))) hit = { part, word: 'holes' };
        else hit = grows(part, board, d, end) ?? bandGrows(part, board, d, end);
      } else {
        const slab: Region = { length: [0, board.length], width: [0, board.width], thickness: [0, board.thickness] };
        slab[d] = end === 'min' ? [0, -amount] : [board[d] + amount, board[d]];
        if (regions.some((r) => overlaps(r, slab))) hit = { part, word: 'holes' };
        else hit = meets(part, slab, (s, f) => runsOutThrough(s.view, f, d, end)) ?? bandTrims(part, slab, d, end);
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
    // fu 415: a feature that only MEETS the growing end (a Bow narrows the end by its rise) leaves the new wood alone,
    // since the stored part has none there; it conflicts only when its waste on the end face enters the tenon's section
    // (open), as P7's condition 3. Judged on a slab END_FACE deep at that end, shifted into the original frame.
    const face: Region = { length: [0, board.length], width: [shoulder, board.width - shoulder], thickness: [cheek, board.thickness - cheek] };
    face[d] = end === 'min' ? [0, END_FACE] : [board[d] - END_FACE, board[d]];
    const meetsOnly = (f: ShapedFeature) => d === 'length' && f.curve !== undefined && !featureMeetsBox(s.view, f, original(face, shift));
    const f = s.features.find((g) => featureTouchesEnd(s.view, g, d, end) && !exempt(g) && !meetsOnly(g));
    return f ? { part, word: f.word } : null;
  };
  return { watch, hit: () => hit };
}

/**
 * One watched trial join: `choices` applied, every other site left butt (a missing choice is a butt). Null when the
 * trial meets no feature. Every recipe refusal is decided before it resizes or cuts anything (inv 41), so a joint the trial
 * skips reports nothing; its conflicts are dropped all the same (the ruling: a skipped trial rules nothing out).
 */
function trial(flat: FlatDocument, sites: readonly Site[], choices: JointChoice[], shapes: ShapeCache, bands: BandCache, kind: TrialKind): Hit | null {
  const { watch, hit } = watchFeatures(shapes, bands, kind);
  const result = applyJoints(flat, sites as Site[], choices, watch);
  if (choices.every((c) => result.skipped.some((s) => s.site === c.site))) return null;
  return hit();
}

/** The first conflict over a kind's trials, or null. */
const firstHit = (flat: FlatDocument, sites: readonly Site[], trials: JointChoice[][], kind: TrialKind, shapes: ShapeCache, bands: BandCache): Hit | null => {
  for (const choices of trials) {
    const hit = trial(flat, sites, choices, shapes, bands, kind);
    if (hit !== null) return hit;
  }
  return null;
};

/**
 * THE one decider of which joint kinds features rule out, per site (joinery-holes spec §3.5; P1: zones by trial). Each
 * (site, kind) is joined alone in a watched trial at the size that reaches furthest, and the kind is ruled out when the
 * trial would cut, grow or trim into a hole, a curve, a profile (P4–P7) or an edge band (P9–P11). Pure, and decided before any call or mutation (inv 41).
 * - mortise-tenon at `tenonLength[1]`, dado at `dadoDepth[1]`.
 * - half-lap once per UNIT (the entering part's half-lap sites on one axis and side, as `applyJoints` drops it into all
 *   its partners together); a conflict rules half-lap out at every member.
 * - stopped-dado once per stop end, at `dadoDepth[1]` and that end's smallest inset. An end whose trial conflicts is
 *   DROPPED from the site's `stopEnds` (the user's ruling, 2026-10-22: "Offer clear ends", reversing chunk 1's "any
 *   conflicting end rules the kind out"); the kind is ruled out, naming the first end's hit, only when no end clears. With
 *   some end clear the kind is kept and nothing is written to `ruledOut` (no summary line: the coordinator's call). The
 *   site message, `parseChoices` and `validChoice` read the narrowed `stopEnds`, so a dropped end is never offered or kept.
 * - rabbet once per UNIT (the panel's rabbet sites on one face, `applyJoints`' `rabbetUnits`), all members rabbeted
 *   together at their smallest depths (the panel's trims are largest) and again at their largest (the pockets are). A
 *   conflict rules rabbet out at every member, a trimmed part's included: a unit is resolved as one.
 *
 * `sites` comes back in order with the same ids; a narrowed site (fewer kinds or fewer stop ends) is a new object, every
 * other keeps its identity, and with nothing narrowed the same array comes back (with no hole, curve, profile or band anywhere, byte for byte). `ruledOut` lists each
 * (site, kind) in site order then `allowed` order, which `allowedFor` builds in JOINTS order, naming the first part met.
 */
export function featureAllowed(flat: FlatDocument, sites: readonly Site[]): { sites: Site[]; ruledOut: RuledOut[] } {
  if (!flat.boards.some((b) => b.holes.length > 0 || hasShaped(b) || b.bands.length > 0)) return { sites: sites as Site[], ruledOut: [] };
  // Each part's curves and profiles, read once off the part as flatDocument gave it (P5; applyJoints clones, so it is
  // never mutated). A part with none is never read (a holes-only project takes chunk 1's path alone).
  const cache = new Map<number, Shapes | null>();
  const shapes: ShapeCache = (part) => {
    if (!cache.has(part)) { const b = flat.boards[part]!; cache.set(part, hasShaped(b) ? shapedFeatures(b) : null); }
    return cache.get(part)!;
  };
  // Each part's bands, likewise read once off the part as flatDocument gave it (P9); a part with none is never read.
  const bandCache = new Map<number, Bands | null>();
  const bands: BandCache = (part) => {
    if (!bandCache.has(part)) { const b = flat.boards[part]!; bandCache.set(part, b.bands.length > 0 ? bandRegions(b, flat.bandTypes) : null); }
    return bandCache.get(part)!;
  };
  const units = new Map<string, Hit | null>();
  const unitKey = (s: Site) => `${s.enter}|${s.axis}|${s.side}`;
  const rabbetUnit = (s: Site): Hit | null => {
    const key = unitKey(s);
    if (!units.has(key)) {
      const members = sites.filter((m) => m.allowed.includes('rabbet') && unitKey(m) === key);
      const at = (i: 0 | 1) => members.map((m): JointChoice => ({ site: m.id, joint: 'rabbet', depth: rangesOf(m, flat).rabbetDepth[i] }));
      units.set(key, firstHit(flat, sites, [at(0), at(1)], 'rabbet', shapes, bands));
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
      laps.set(key, firstHit(flat, sites, [members.map((m): JointChoice => ({ site: m.id, joint: 'half-lap' }))], 'half-lap', shapes, bands));
    }
    return laps.get(key)!;
  };
  const conflict = (s: Site, kind: Exclude<JointKind, 'butt'>): Hit | null => {
    const r = rangesOf(s, flat);
    switch (kind) {
      case 'mortise-tenon': return firstHit(flat, sites, [[{ site: s.id, joint: kind, tenonLength: r.tenonLength[1] }]], kind, shapes, bands);
      case 'dado': return firstHit(flat, sites, [[{ site: s.id, joint: kind, depth: r.dadoDepth[1] }]], kind, shapes, bands);
      case 'stopped-dado': throw new Error('stopped-dado is judged per end (`endHits`)');
      case 'half-lap': return lapUnit(s);
      case 'rabbet': return rabbetUnit(s);
    }
  };

  /** Each stop end's trial alone (in `stopEnds` order): its first conflict, or null when that end clears. */
  const endHits = (s: Site): (Hit | null)[] => {
    const r = rangesOf(s, flat);
    return s.stopEnds.map((e) => firstHit(flat, sites, [[{ site: s.id, joint: 'stopped-dado', depth: r.dadoDepth[1], stopAt: e, inset: r.inset(e)[0] }]], 'stopped-dado', shapes, bands));
  };

  const ruledOut: RuledOut[] = [];
  const out = sites.map((s) => {
    const gone = new Set<JointKind>();
    let stopEnds = s.stopEnds;
    for (const kind of s.allowed) {
      if (kind === 'butt') continue;
      let hit: Hit | null;
      if (kind === 'stopped-dado') {
        const hits = endHits(s);
        const clear = s.stopEnds.filter((_, i) => hits[i] === null);
        // Some end clears: keep the kind at those ends only. None does: rule it out, naming the first end's hit.
        if (clear.length > 0) { if (clear.length < s.stopEnds.length) stopEnds = clear; continue; }
        hit = hits[0]!;
      } else {
        hit = conflict(s, kind);
      }
      if (hit === null) continue;
      gone.add(kind);
      ruledOut.push({ site: s.id, kind, part: hit.part, feature: hit.word });
    }
    if (gone.size === 0 && stopEnds === s.stopEnds) return s;
    return { ...s, allowed: s.allowed.filter((k) => !gone.has(k)), stopEnds };
  });
  return out.every((s, i) => s === sites[i]) ? { sites: sites as Site[], ruledOut } : { sites: out, ruledOut };
}

/** Shown when checking features against joints throws (fu 244): the dialog refuses, Refine returns its design unjoined. */
export const FEATURE_CHECK_FAILED = "Sloyd couldn't check this project's holes, curves and profiles against its joints. Add joinery before drilling or shaping, or remove those first.";
