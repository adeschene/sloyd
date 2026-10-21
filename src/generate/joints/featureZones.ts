import type { Board, Dimension, FlatDocument, Region } from '../../document/document';
import { clippedRegion } from '../../document/cuts';
import { HOLE_EPS, holeInstances, holeRegion } from '../../document/holes';
import { applyJoints } from './recipes';
import type { JoinWatch, JointChoice } from './recipes';
import { rangesOf } from './sites';
import type { JointKind, Site } from './sites';

/** What ruled a kind out, as the summary names it (spec §3.5). Chunks 2 and 3 widen this. */
export type FeatureWord = 'holes';
export interface RuledOut { site: number; kind: Exclude<JointKind, 'butt'>; part: number; feature: FeatureWord }

const DIMS: readonly Dimension[] = ['length', 'width', 'thickness'];
/** Touching is allowed: a conflict is an overlap above float noise on all three dimensions (spec §3.3, amended). */
const overlaps = (a: Region, b: Region) => DIMS.every((d) => Math.min(a[d][1], b[d][1]) - Math.max(a[d][0], b[d][0]) > HOLE_EPS);
const holeRegions = (b: Board) => b.holes.flatMap((r) => holeInstances(b, r)).map(holeRegion);

/**
 * The watch for one trial: the first part (a flat-document index) whose holes the trial's joint would cut into, grow
 * through or trim. Everything is judged board-local on the board as `applyJoints` passes it, so a part that moved, or
 * whose holes an earlier resize in the trial already re-anchored, is judged as it then stands.
 * - A pocket conflicts when its box overlaps a bore's box (spec §3.3).
 * - A GROWTH conflicts when any bore touches the end that grows (spec §3.4): `resize` fires before the change, so
 *   `board[d]` is the old dimension.
 * - A TRIM conflicts when any bore overlaps the slab it removes (spec §3.4, trimmed ends).
 */
function watchHoles(): { watch: JoinWatch; hit: () => number | null } {
  let hit: number | null = null;
  const watch: JoinWatch = {
    cut(part, board, cut) {
      if (hit !== null) return;
      const box = clippedRegion(board, cut);
      if (holeRegions(board).some((h) => overlaps(box, h))) hit = part;
    },
    resize(part, board, d, end, amount) {
      if (hit !== null) return;
      const regions = holeRegions(board);
      if (amount > 0) {
        if (regions.some((r) => (end === 'min' ? r[d][0] <= HOLE_EPS : r[d][1] >= board[d] - HOLE_EPS))) hit = part;
        return;
      }
      const slab: Region = { length: [0, board.length], width: [0, board.width], thickness: [0, board.thickness] };
      slab[d] = end === 'min' ? [0, -amount] : [board[d] + amount, board[d]];
      if (regions.some((r) => overlaps(r, slab))) hit = part;
    },
  };
  return { watch, hit: () => hit };
}

/**
 * One watched trial join: `choices` applied, every other site left butt (a missing choice is a butt). Null when the
 * trial meets no hole. Every recipe refusal is decided before it resizes or cuts anything (inv 41), so a joint the trial
 * skips reports nothing; its conflicts are dropped all the same (the ruling: a skipped trial rules nothing out).
 */
function trial(flat: FlatDocument, sites: readonly Site[], choices: JointChoice[]): number | null {
  const { watch, hit } = watchHoles();
  const result = applyJoints(flat, sites as Site[], choices, watch);
  if (choices.every((c) => result.skipped.some((s) => s.site === c.site))) return null;
  return hit();
}

/** The first conflicting part over a kind's trials, or null. */
const firstHit = (flat: FlatDocument, sites: readonly Site[], trials: JointChoice[][]): number | null => {
  for (const choices of trials) {
    const hit = trial(flat, sites, choices);
    if (hit !== null) return hit;
  }
  return null;
};

/**
 * THE one decider of which joint kinds features rule out, per site (joinery-holes spec §3.5; P1: zones by trial). Each
 * (site, kind) is joined alone in a watched trial at the size that reaches furthest, and the kind is ruled out when the
 * trial would cut, grow or trim into a hole. Pure, and decided before any call or mutation (inv 41).
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
 * with nothing ruled out the same array comes back (with no hole anywhere, byte for byte). `ruledOut` lists each
 * (site, kind) in site order then `allowed` order, which `allowedFor` builds in JOINTS order, naming the first part met.
 */
export function featureAllowed(flat: FlatDocument, sites: readonly Site[]): { sites: Site[]; ruledOut: RuledOut[] } {
  if (!flat.boards.some((b) => b.holes.length > 0)) return { sites: sites as Site[], ruledOut: [] };
  const units = new Map<string, number | null>();
  const unitKey = (s: Site) => `${s.enter}|${s.axis}|${s.side}`;
  const rabbetUnit = (s: Site): number | null => {
    const key = unitKey(s);
    if (!units.has(key)) {
      const members = sites.filter((m) => m.allowed.includes('rabbet') && unitKey(m) === key);
      const at = (i: 0 | 1) => members.map((m): JointChoice => ({ site: m.id, joint: 'rabbet', depth: rangesOf(m, flat).rabbetDepth[i] }));
      units.set(key, firstHit(flat, sites, [at(0), at(1)]));
    }
    return units.get(key)!;
  };
  // A part's half-laps along one axis are one UNIT: the real run can drop it into all its chosen partners at once and
  // may refuse a partial set (an unchosen partner in the drop path; the unit over-rules by design), so a lone crossing's trial skips.
  const laps = new Map<string, number | null>();
  const lapUnit = (s: Site): number | null => {
    const key = unitKey(s);
    if (!laps.has(key)) {
      const members = sites.filter((m) => m.allowed.includes('half-lap') && unitKey(m) === key);
      laps.set(key, firstHit(flat, sites, [members.map((m): JointChoice => ({ site: m.id, joint: 'half-lap' }))]));
    }
    return laps.get(key)!;
  };
  const conflict = (s: Site, kind: Exclude<JointKind, 'butt'>): number | null => {
    const r = rangesOf(s, flat);
    switch (kind) {
      case 'mortise-tenon': return firstHit(flat, sites, [[{ site: s.id, joint: kind, tenonLength: r.tenonLength[1] }]]);
      case 'dado': return firstHit(flat, sites, [[{ site: s.id, joint: kind, depth: r.dadoDepth[1] }]]);
      case 'stopped-dado': return firstHit(flat, sites, s.stopEnds.map((e) => [{ site: s.id, joint: kind, depth: r.dadoDepth[1], stopAt: e, inset: r.inset(e)[0] }]));
      case 'half-lap': return lapUnit(s);
      case 'rabbet': return rabbetUnit(s);
    }
  };

  const ruledOut: RuledOut[] = [];
  const out = sites.map((s) => {
    const gone = new Set<JointKind>();
    for (const kind of s.allowed) {
      if (kind === 'butt') continue;
      const part = conflict(s, kind);
      if (part === null) continue;
      gone.add(kind);
      ruledOut.push({ site: s.id, kind, part, feature: 'holes' });
    }
    return gone.size === 0 ? s : { ...s, allowed: s.allowed.filter((k) => !gone.has(k)) };
  });
  return ruledOut.length === 0 ? { sites: sites as Site[], ruledOut } : { sites: out, ruledOut };
}
