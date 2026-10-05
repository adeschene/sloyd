import { CURRENT_VERSION, migrateDocument, storedAsShape } from '../../document/document';
import type { Board, Dimension, SloydDocument } from '../../document/document';
import { boardSolids } from '../../document/cuts';
import { TOUCH, worldSolids } from '../../document/designCheck';
import { SNAP_INCHES, axisDimensions, positionAxisOf } from '../../document/geometry';
import { boxOf, pocketFor } from './pocket';
import type { V3, WorldBox } from './pocket';
import type { JointKind, Site, StopEnd } from './sites';

export interface JointChoice { site: number; joint: JointKind; tenonLength?: number; depth?: number; stopAt?: StopEnd; inset?: number }
export interface JoinResult {
  doc: SloydDocument;
  applied: { site: number; joint: JointKind }[];
  skipped: { site: number; reason: string }[];
  moved: string[];
  trimmed: string[];
  /** How far the re-ground dropped the whole piece; 0 when it did not run or dropped nothing. */
  lowered: number;
  sizeBefore: V3;
  sizeAfter: V3;
}

const snap = (v: number) => Math.round(v / SNAP_INCHES) * SNAP_INCHES;

export const tenonSection = (thickness: number, width: number) => {
  const tenon = Math.max(0.25, snap(thickness / 3));
  return { tenon, cheek: (thickness - tenon) / 2, shoulder: Math.min(0.5, snap(width / 4)) };
};

/** `base` with some axes' spans replaced. */
const withSpans = (base: WorldBox, spans: Partial<Record<number, [number, number]>>): WorldBox => {
  const min = [...base.min] as V3;
  const max = [...base.max] as V3;
  for (const [k, s] of Object.entries(spans)) { min[+k] = s![0]; max[+k] = s![1]; }
  return { min, max };
};
type Span = { min: readonly number[]; max: readonly number[] };
const positive = (b: Span) => [0, 1, 2].every((k) => b.max[k] - b.min[k] > 1e-9);
const span = (b: WorldBox, k: number): [number, number] => [b.min[k], b.max[k]];

/** Grow (or, negative, shrink) a part along world axis k on its `side` face. */
function resize(b: Board, k: number, side: -1 | 1, amount: number) {
  const d = axisDimensions(b)[k];
  // The old dimension is passed on rather than recovered as `b[d] - amount`,
  // which can be an ulp off for decimal sizes.
  const was = b[d];
  b[d] = was + amount;
  if (side === -1) b.position[k] -= amount;
  rebaseCuts(b, d, side === -1 ? 'min' : 'max', amount, was);
}

/**
 * The ONE place a part's EXISTING cuts follow a resize (spec §4.7, final
 * review C1). A cut is measured from the board's ends, so growing or shrinking
 * dimension `d` at one end would otherwise slide every cut already on the
 * board: a rail tenoned at its far end and then at its near end had its first
 * tenon moved by the second's length.
 *
 * - The MIN end moving shifts everything measured from min: the offset when
 *   `d` is the position axis, `stopMin` when `d` is `across`.
 * - The MAX end moving changes only `stopMax` (when `d` is `across`); offsets
 *   are measured from min and do not move.
 * - EXCEPT on growth, a cut whose `across` axis is `d` and whose stop at the
 *   moving end is 0 keeps running out (the stop stays 0). Without this,
 *   ordering rabbets before dados turned every bookcase bottom's rabbet into a
 *   notch stopped 1/4in short of each end, and the back drove into it. A cut
 *   POSITIONED flush with the end is NOT extended: it stays where it is.
 * - A cut INTO `d` from the moving end has no defined answer, so it throws.
 *
 * Each cut is first re-stored the way it runs where the sheet accepts it
 * (`storedAsShape`'s guard; a refused cut keeps its stored form and the old
 * rule), so the rule above reads the cut's shape: a cut that RUNS along `d` to the moving end keeps
 * running out; one POSITIONED at that end stays (follow-up 199).
 *
 * Then the cut is CLIPPED to the board (an addition to the ruling): a shrink
 * can leave a negative offset or stop, and validateCuts clamps a negative
 * offset to 0 WITHOUT shortening the width, which would move the cut. A cut
 * the shrink removes entirely is dropped.
 */
function rebaseCuts(b: Board, d: Dimension, end: 'min' | 'max', amount: number, was: number) {
  // Follow-up 199: decide by the cut's SHAPE, not by which of two equivalent
  // forms it happens to be stored in. storedAsShape keeps the same stock, returns
  // an already-aligned cut as the same object, and refuses a re-store the sheet
  // would read differently. `resize` has already changed `b[d]`, but a cut's
  // shape is read against the board it was cut IN, so the board is put back
  // for the read (a cut spanning all of the old length is not full-length on
  // the grown one).
  const before: Board = { ...b, [d]: was };
  const solids = boardSolids(before);
  b.cuts = b.cuts.map((c) => storedAsShape(before, c, solids));
  b.cuts = b.cuts.filter((c) => {
    if (c.face === d) {
      if (c.from === end) throw new Error(`applyJoints: ${b.name} grows at an end it is already cut into`);
      c.depth = Math.min(c.depth, b[d]);
      return true;
    }
    const pos = positionAxisOf(c.face, c.across);
    // Along its `across` axis a cut that RUNS OUT at the moving end keeps
    // running out when the part grows (below). Along its POSITION axis it does
    // not: a housing flush with the end holds a part sitting AT that end, which
    // has not moved, so the cut stays where it is and becomes a dado. Extending
    // it would make the geometry depend on document order and leave a void no
    // part fills.
    if (pos === d && end === 'min') c.offset += amount;
    if (c.across === d) {
      const stop = end === 'min' ? 'stopMin' : 'stopMax';
      if (!(amount > 0 && c[stop] <= 1e-9)) c[stop] += amount;
    }
    if (c.offset < 0) { c.width += c.offset; c.offset = 0; }
    c.width = Math.min(c.width, b[pos] - c.offset);
    c.stopMin = Math.max(0, c.stopMin);
    c.stopMax = Math.max(0, c.stopMax);
    return c.width > 1e-9 && c.stopMin + c.stopMax < b[c.across] - 1e-9;
  });
}

/** The slab E grows into, on its `side` face along k, `amount` deep. */
const extension = (before: WorldBox, k: number, side: -1 | 1, amount: number): [number, number] =>
  side === 1 ? [before.max[k], before.max[k] + amount] : [before.min[k] - amount, before.min[k]];

/** Face contact on k between E's `side` face and R, within TOUCH, with real shared span. */
function touching(E: Board, R: Board, k: number, side: -1 | 1): boolean {
  const e = boxOf(E);
  const r = boxOf(R);
  const plane = side === 1 ? e.max[k] : e.min[k];
  const opposite = side === 1 ? r.min[k] : r.max[k];
  return Math.abs(plane - opposite) <= TOUCH &&
    [0, 1, 2].filter((i) => i !== k).every((i) => Math.min(e.max[i], r.max[i]) - Math.max(e.min[i], r.min[i]) > TOUCH);
}

/** Two world boxes share more than TOUCH on all three axes: one would drive into the other. */
const overlapsBeyondTouch = (a: Span, b: Span) =>
  [0, 1, 2].every((i) => Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i]) > TOUCH);

/*
 * The blockers judge SOLIDS, not part boxes (invariant 38, follow-up 203), on
 * both sides: a design that arrives already cut (hand-made, or Add joinery run
 * on a joined project) has a seated tenon interpenetrating its neighbour's box.
 * A part that will have moved or been trimmed is judged as its solids moved or
 * clipped the same way, never as a box again.
 */
type Solids = { min: number[]; max: number[] }[];
const shifted = (ss: Solids, k: number, d: number): Solids => ss.map((s) => ({
  min: s.min.map((v, i) => (i === k ? v + d : v)), max: s.max.map((v, i) => (i === k ? v + d : v)),
}));
/** What is left of a part's solids once it is trimmed back to `b`. */
const clipped = (ss: Solids, b: WorldBox): Solids => ss.map((s) => ({
  min: s.min.map((v, i) => Math.max(v, b.min[i])), max: s.max.map((v, i) => Math.min(v, b.max[i])),
})).filter(positive);
const solidsMeet = (a: Solids, b: Solids) => a.some((p) => b.some((q) => overlapsBeyondTouch(p, q)));

/** Each runs past the other on one in-plane axis of k: `findSites` rule 4's crossing test. */
function crossesInPlan(e: WorldBox, r: WorldBox, k: number): boolean {
  const [p, q] = [0, 1, 2].filter((i) => i !== k);
  const beyond = (x: WorldBox, y: WorldBox, i: number) => x.min[i] < y.min[i] - TOUCH && x.max[i] > y.max[i] + TOUCH;
  return (beyond(e, r, p) && beyond(r, e, q)) || (beyond(e, r, q) && beyond(r, e, p));
}

/**
 * A half-lap still has a site when E and R cross in plan and, unless E is
 * already in its lap plane, R lies wholly on E's `side` along k. Contact is
 * NOT required (follow-up 185): bottom-up, a part's partner may already have
 * dropped into the plane below it, so the drop can be longer than t.
 */
function lapStillMeets(E: Board, R: Board, k: number, side: -1 | 1, alreadyIn: boolean): boolean {
  const e = boxOf(E);
  const r = boxOf(R);
  if (!crossesInPlan(e, r, k)) return false;
  if (alreadyIn) return true;
  return side === -1 ? r.max[k] <= e.min[k] + TOUCH : r.min[k] >= e.max[k] - TOUCH;
}

function mortiseTenon(E: Board, R: Board, k: number, side: -1 | 1, L: number) {
  const before = boxOf(E);
  resize(E, k, side, L);
  const ext = extension(before, k, side, L);
  const dims = axisDimensions(E);
  const tAx = dims.indexOf('thickness');
  const wAx = dims.indexOf('width');
  const { cheek: c, shoulder: sh } = tenonSection(E.thickness, E.width);
  const [t0, t1] = span(before, tAx);
  const [w0, w1] = span(before, wAx);
  const box = (t: [number, number], w: [number, number]) => withSpans(before, { [k]: ext, [tAx]: t, [wAx]: w });
  for (const waste of [box([t0, t0 + c], [w0, w1]), box([t1 - c, t1], [w0, w1]), box([t0, t1], [w0, w0 + sh]), box([t0, t1], [w1 - sh, w1])]) {
    if (positive(waste)) E.cuts.push(pocketFor(E, waste));
  }
  R.cuts.push(pocketFor(R, box([t0 + c, t1 - c], [w0 + sh, w1 - sh])));
}

function dado(E: Board, R: Board, k: number, side: -1 | 1, d: number, stop?: { at: StopEnd; inset: number }) {
  const before = boxOf(E);
  resize(E, k, side, d);
  const ext = extension(before, k, side, d);
  let pocket = withSpans(before, { [k]: ext });
  if (stop) {
    const p = stop.at.axis;
    const [lo, hi] = span(before, p);
    const keep: [number, number] = stop.at.end === 'min' ? [lo + stop.inset, hi] : [lo, hi - stop.inset];
    const strip: [number, number] = stop.at.end === 'min' ? [lo, lo + stop.inset] : [hi - stop.inset, hi];
    pocket = withSpans(pocket, { [p]: keep });
    E.cuts.push(pocketFor(E, withSpans(before, { [k]: ext, [p]: strip })));
  }
  R.cuts.push(pocketFor(R, pocket));
}

/** Indices of parts (not `skip`) whose face butts E's `side` face on k, sharing real area. */
function buttingFace(boards: Board[], e: number, k: number, side: -1 | 1, skip: (i: number) => boolean): number[] {
  const eb = boxOf(boards[e]);
  const plane = side === 1 ? eb.max[k] : eb.min[k];
  return boards.map((_, i) => i).filter((i) => {
    if (i === e || skip(i)) return false;
    const xb = boxOf(boards[i]);
    const xFace = side === 1 ? xb.min[k] : xb.max[k];
    const shares = [0, 1, 2].filter((a) => a !== k)
      .every((a) => Math.min(eb.max[a], xb.max[a]) - Math.max(eb.min[a], xb.min[a]) > TOUCH);
    return Math.abs(xFace - plane) <= TOUCH && shares;
  });
}

const overall = (boards: Board[]): V3 => {
  const boxes = boards.map(boxOf);
  return [0, 1, 2].map((k) => Math.max(...boxes.map((b) => b.max[k])) - Math.min(...boxes.map((b) => b.min[k]))) as V3;
};

const RANK: Record<Site['kind'], number> = { crossing: 0, 'face-against-edge': 1, 'end-into-face': 2 };

/**
 * Build the chosen joints (spec §4). Pure. Recipes run on a
 * COPY of the boards — crossings (bottom-up, below), then rabbets, then
 * end-into-face, otherwise in site order — and each reads the CURRENT
 * geometry, so a site whose
 * part an earlier site already moved is recomputed rather than reused —
 * and skipped, with a reason, when its parts no longer touch (a half-lap
 * needs only that they still cross in plan with the receiver wholly below).
 */
export function applyJoints(doc: SloydDocument, sites: Site[], choices: JointChoice[]): JoinResult {
  const boards: Board[] = structuredClone(doc.boards);
  const byId = new Map(choices.map((c) => [c.site, c]));
  const applied: JoinResult['applied'] = [];
  const skipped: JoinResult['skipped'] = [];
  const moved = new Set<string>();
  const trimmed = new Set<string>();
  const state: State = {
    moved, trimmed, movedFace: new Map(),
    // Every "<enter>-><receive>" pair joined by a rabbet: a panel's own
    // receivers keep their length when it moves; everything else butting it
    // is trimmed (Task 5).
    rabbetReceivers: new Set(sites.filter((s) => byId.get(s.id)?.joint === 'rabbet').map((s) => `${s.enter}->${s.receive}`)),
    halfLapPartners: new Set(sites.filter((s) => byId.get(s.id)?.joint === 'half-lap').map((s) => `${s.enter}->${s.receive}`)),
    rabbetUnits: new Map(),
  };

  // Recipes that MOVE parts run first (spec §4.7, final review C1): a move
  // carries a part's cuts with it, so a tenon built before its part is lapped
  // or trimmed would be misplaced. Stable, so site order holds within a kind.
  // Crossings run BOTTOM-UP by the entering part's ORIGINAL position (follow-up
  // 185), grouped by axis: a part is then in its final plane before anything
  // drops onto it, so each part moves once. Carrying riders down with their
  // partner was rejected: a part with two lap partners would be carried twice.
  const lapFloor = (s: Site) => boxOf(doc.boards[s.enter]).min[s.axis];
  const ordered = [...sites].sort((a, b) => RANK[a.kind] - RANK[b.kind] ||
    (a.kind === 'crossing' && b.kind === 'crossing' ? a.axis - b.axis || lapFloor(a) - lapFloor(b) : 0));
  const done = new Set<number>();
  for (const site of ordered) {
    done.add(site.id);
    const c = byId.get(site.id);
    const joint: JointKind = c?.joint ?? 'butt';
    if (joint === 'butt') { applied.push({ site: site.id, joint }); continue; }
    const E = boards[site.enter];
    const R = boards[site.receive];
    const k = site.axis;
    const side = site.side;
    // A panel's rabbet sites on one face were resolved together, at the first
    // of them (follow-up 182): report each one's outcome when it comes up.
    const unitKey = `${site.enter}|${k}|${side}`;
    const resolved = joint === 'rabbet' ? state.rabbetUnits.get(unitKey)?.get(site.id) : undefined;
    if (resolved !== undefined) {
      if (resolved === null) applied.push({ site: site.id, joint });
      else skipped.push({ site: site.id, reason: resolved });
      continue;
    }
    const panelAlreadyIn = (joint === 'rabbet' || joint === 'half-lap') && state.movedFace.get(`${site.enter}|${k}`) === side;
    const meets = joint === 'half-lap' ? lapStillMeets(E, R, k, side, panelAlreadyIn) : panelAlreadyIn || touching(E, R, k, side);
    if (!meets) {
      skipped.push({ site: site.id, reason: `${E.name} no longer meets ${R.name} after an earlier joint` });
      continue;
    }
    switch (joint) {
      case 'mortise-tenon': mortiseTenon(E, R, k, side, c!.tenonLength!); break;
      case 'dado': dado(E, R, k, side, c!.depth!); break;
      case 'stopped-dado': dado(E, R, k, side, c!.depth!, { at: c!.stopAt!, inset: c!.inset! }); break;
      case 'rabbet': {
        const unit = sites.filter((s) => s.id === site.id || (!done.has(s.id) && byId.get(s.id)?.joint === 'rabbet' &&
          s.enter === site.enter && s.axis === k && s.side === side));
        const outcome = rabbet(unit.map((s) => ({ site: s, r: byId.get(s.id)!.depth! })), boards, state);
        state.rabbetUnits.set(unitKey, outcome);
        const reason = outcome.get(site.id)!;
        if (reason) { skipped.push({ site: site.id, reason }); continue; }
        break;
      }
      default: {
        const blocked = rest(joint, site, boards, state);
        if (blocked) { skipped.push({ site: site.id, reason: blocked }); continue; }
      }
    }
    applied.push({ site: site.id, joint });
  }

  // A rabbeted bottom moves up into its frame; if the design stood on the
  // floor, lower everything back onto it (spec §4.7).
  const lowest = (bs: Board[]) => Math.min(...bs.map((b) => boxOf(b).min[1]));
  let lowered = 0;
  if (doc.boards.length > 0 && lowest(doc.boards) <= TOUCH) {
    const drop = lowest(boards);
    for (const b of boards) b.position[1] -= drop;
    if (Math.abs(drop) > 1e-9) lowered = Math.max(0, drop);
  }
  const out = migrateDocument({ ...doc, version: CURRENT_VERSION, boards });
  return {
    doc: out, applied, skipped,
    moved: [...moved], trimmed: [...trimmed], lowered,
    sizeBefore: overall(doc.boards), sizeAfter: overall(out.boards),
  };
}

type State = {
  moved: Set<string>; trimmed: Set<string>;
  /** "<part>|<axis>" -> the face it last moved toward on that axis, so a part moved on two axes is tracked per axis (fu 203). */
  movedFace: Map<string, -1 | 1>;
  rabbetReceivers: Set<string>; halfLapPartners: Set<string>;
  /** "<panel>|<axis>|<side>" -> each of that unit's sites: null when applied, else why it was skipped. */
  rabbetUnits: Map<string, Map<number, string | null>>;
};

function rest(joint: JointKind, site: Site, boards: Board[], state: State): string | null {
  if (joint === 'half-lap') return halfLap(site, boards, state);
  throw new Error(`applyJoints: unknown joint ${joint}`);
}

/**
 * Rabbet (spec §4.5). The panel moves ONCE toward its receivers by its own
 * thickness t; each receiver gets a rabbet t deep from its edge and r in from
 * its inner face, and the panel is trimmed back to the rabbet line.
 *
 * All of one panel's rabbet sites on one face are ONE unit (follow-up 182),
 * resolved from the panel's FINAL box: moved, then trimmed to EVERY
 * receiver's rabbet line. Each pocket is cut against that box, so no pocket
 * runs past where the panel ends. Cut site by site against the panel as it
 * stood at that site, a side's rabbet ran the full height and a later top's
 * rabbet trimmed the back off its end, leaving a notch nothing filled, in
 * some listing orders and not others.
 *
 * Every OTHER part the final box would drive into is shortened on its face
 * toward the panel by exactly the intrusion (follow-up 201): a part butting
 * the panel loses t, one in the gap loses t minus the gap. One the panel would
 * pass through, with nothing beyond the panel left to keep, refuses the unit.
 *
 * Parts on the panel's OUTER face ride along (follow-up 183): every part
 * butting it, then every part butting a carried part's outer face, moves by
 * the same t, or a cleat on the back is left in the air.
 *
 * Every refusal is decided before anything is trimmed, moved or cut, and
 * skips every site of the unit.
 */
function rabbet(unit: { site: Site; r: number }[], boards: Board[], state: State): Map<number, string | null> {
  const { enter: e, axis: k, side } = unit[0].site;
  const E = boards[e];
  const t = E.thickness;
  const outcome = new Map<number, string | null>();
  // A receiver an earlier joint moved away is no longer this unit's.
  const members = unit.filter(({ site }) => {
    const meets = touching(E, boards[site.receive], k, side);
    if (!meets) outcome.set(site.id, `${E.name} no longer meets ${boards[site.receive].name} after an earlier joint`);
    return meets;
  });
  // Nothing left to rabbet: move nothing.
  if (members.length === 0) return outcome;
  const refuse = (reason: string) => { for (const { site } of members) outcome.set(site.id, reason); return outcome; };
  const inUnit = (j: number) => members.some(({ site }) => site.receive === j);
  // Any rabbet receiver of this panel, on either face: never trimmed, never carried.
  const receiver = (j: number) => state.rabbetReceivers.has(`${e}->${j}`);

  // The outer-face chain, on the same axis and direction as the panel.
  const carried: number[] = [];
  const outer = (i: number) => buttingFace(boards, i, k, (-side) as -1 | 1, (j) => j === e || receiver(j) || carried.includes(j));
  carried.push(...outer(e));
  for (let n = 0; n < carried.length; n++) {
    for (const j of outer(carried[n])) if (!carried.includes(j)) carried.push(j);
  }

  // The panel's final box, and each receiver's pocket against it.
  const start = boxOf(E);
  const movedBox = withSpans(start, { [k]: [start.min[k] + side * t, start.max[k] + side * t] });
  const fin: WorldBox = { min: [...movedBox.min] as V3, max: [...movedBox.max] as V3 };
  const lines = members.map(({ site, r }) => {
    const rb = boxOf(boards[site.receive]);
    const nAx = axisDimensions(boards[site.receive]).indexOf('thickness');
    const inner = (movedBox.min[nAx] + movedBox.max[nAx]) / 2 >= (rb.min[nAx] + rb.max[nAx]) / 2 ? 'max' : 'min';
    const nSpan: [number, number] = inner === 'max' ? [rb.max[nAx] - r, rb.max[nAx]] : [rb.min[nAx], rb.min[nAx] + r];
    if (inner === 'max' && movedBox.min[nAx] < nSpan[0] - 1e-9) fin.min[nAx] = Math.max(fin.min[nAx], nSpan[0]);
    if (inner === 'min' && movedBox.max[nAx] > nSpan[1] + 1e-9) fin.max[nAx] = Math.min(fin.max[nAx], nSpan[1]);
    return { site, rb, nAx, nSpan };
  });
  const pockets = lines.map(({ site, rb, nAx, nSpan }) => {
    const P = side === -1 ? rb.max[k] : rb.min[k];
    const kSpan: [number, number] = side === -1 ? [P - t, P] : [P, P + t];
    const q = [0, 1, 2].find((a) => a !== k && a !== nAx)!;
    const qSpan: [number, number] = [Math.max(fin.min[q], rb.min[q]), Math.min(fin.max[q], rb.max[q])];
    return { R: boards[site.receive], box: withSpans(rb, { [k]: kSpan, [nAx]: nSpan, [q]: qSpan }) };
  });

  // The trims: whatever else the final box drives into, by the intrusion on k.
  const trims = new Map<number, number>();
  for (let j = 0; j < boards.length; j++) {
    if (j === e || receiver(j) || carried.includes(j)) continue;
    const b = boxOf(boards[j]);
    if (!overlapsBeyondTouch(fin, b)) continue;
    const depth = side === 1 ? fin.max[k] - b.min[k] : b.max[k] - fin.min[k];
    if (depth >= b.max[k] - b.min[k] - 1e-9) return refuse(`moving ${E.name} would pass through ${boards[j].name}`);
    // rebaseCuts' throwing condition, asked first: a cut INTO the end being
    // trimmed has no defined answer, and a throw would fail the whole run.
    const d = axisDimensions(boards[j])[k];
    const end = side === 1 ? 'min' : 'max';
    if (boards[j].cuts.some((c) => c.face === d && c.from === end)) {
      return refuse(`moving ${E.name} would trim ${boards[j].name} at an end it is already cut into`);
    }
    trims.set(j, depth);
  }
  // A part is judged where it will be, by its solids: a trimmed one clipped to its trimmed size.
  const judged = (j: number): Solids => {
    const ss = worldSolids(boards[j]);
    const d = trims.get(j);
    if (d === undefined) return ss;
    const b = boxOf(boards[j]);
    return clipped(ss, side === 1 ? withSpans(b, { [k]: [b.min[k] + d, b.max[k]] }) : withSpans(b, { [k]: [b.min[k], b.max[k] - d] }));
  };
  const hit = (solids: Solids, skip: (j: number) => boolean) =>
    boards.findIndex((_, j) => !skip(j) && solidsMeet(solids, judged(j)));
  for (const i of carried) {
    const other = hit(shifted(worldSolids(boards[i]), k, side * t), (j) => j === e || carried.includes(j));
    if (other !== -1) return refuse(`moving ${E.name} would drive ${boards[i].name} into ${boards[other].name}`);
  }
  // The panel moves into its receivers' rabbets on purpose; nothing else may
  // be left in its way. The trims above clear every part except a receiver
  // that dropped out of the unit (it is never trimmed), so this is where one
  // left in the gap is caught. The panel is judged as its solids moved and
  // clipped to the final box.
  const other = hit(clipped(shifted(worldSolids(E), k, side * t), fin), (j) => j === e || inUnit(j) || carried.includes(j));
  if (other !== -1) return refuse(`moving ${E.name} would drive it into ${boards[other].name}`);
  const cuts = pockets.map(({ R, box }) => pocketFor(R, box));

  for (const [j, d] of trims) {
    resize(boards[j], k, (side === 1 ? -1 : 1) as -1 | 1, -d);
    state.trimmed.add(boards[j].name);
  }
  for (const i of [e, ...carried]) {
    boards[i].position[k] += side * t;
    state.moved.add(boards[i].name);
  }
  for (let a = 0; a < 3; a++) {
    if (fin.min[a] > movedBox.min[a]) { resize(E, a, -1, -(fin.min[a] - movedBox.min[a])); state.trimmed.add(E.name); }
    if (fin.max[a] < movedBox.max[a]) { resize(E, a, 1, -(movedBox.max[a] - fin.max[a])); state.trimmed.add(E.name); }
  }
  pockets.forEach(({ R }, n) => R.cuts.push(cuts[n]));
  state.movedFace.set(`${e}|${k}`, side);
  for (const { site } of members) outcome.set(site.id, null);
  return outcome;
}

/**
 * Half-lap (spec §4.6). E — the part on the +axis side — drops into R's
 * plane (by t, or further when R has already dropped: follow-up 185); each is
 * notched by half where they cross, E on R's original side.
 */
function halfLap(site: Site, boards: Board[], state: State): string | null {
  const E = boards[site.enter];
  const R = boards[site.receive];
  const k = site.axis;
  const side = site.side;
  const alreadyIn = state.movedFace.get(`${site.enter}|${k}`) === side;
  // ALIGN rather than move by t: E's touching face lands exactly on R's
  // opposite face, so a TOUCH-sized gap or thickness difference cannot
  // leave E out of R's plane. One delta serves the checks and the move.
  const eNow = boxOf(E);
  const rNow = boxOf(R);
  const delta = alreadyIn ? 0 : side === -1 ? rNow.min[k] - eNow.min[k] : rNow.max[k] - eNow.max[k];
  if (!alreadyIn) {
    // Dropping E must not drive it into anything but its own lap partners
    // ANYWHERE along the drop, which can be longer than t: the volume each of
    // E's solids sweeps is checked against every other part's solids.
    const swept = worldSolids(E).map((s) => ({
      min: s.min.map((v, i) => (i === k ? Math.min(v, v + delta) : v)),
      max: s.max.map((v, i) => (i === k ? Math.max(v, v + delta) : v)),
    }));
    const blocker = boards.findIndex((b, j) => j !== site.enter && !state.halfLapPartners.has(`${site.enter}->${j}`) && solidsMeet(swept, worldSolids(b)));
    if (blocker !== -1) return `moving ${E.name} would drive it into ${boards[blocker].name}`;
    // All of E's lap partners must share one plane, or E cannot drop into all.
    const partners = [...state.halfLapPartners].filter((p) => p.startsWith(`${site.enter}->`)).map((p) => boxOf(boards[+p.split('->')[1]]));
    if (partners.some((p) => Math.abs(p.min[k] - partners[0].min[k]) > TOUCH || Math.abs(p.max[k] - partners[0].max[k]) > TOUCH)) {
      return `${E.name}'s half-lap partners do not lie in one plane`;
    }
  }
  // Defensive guard, judged on E where it WOULD land, so it refuses before
  // anything moves (invariant 41). Through findSites E aligns onto the first
  // partner and the pre-check proves the rest coplanar within TOUCH, so only
  // a thickness difference beyond TOUCH (which rule 4 forbids) can trip it.
  if (Math.abs(eNow.min[k] + delta - rNow.min[k]) > TOUCH || Math.abs(eNow.max[k] + delta - rNow.max[k]) > TOUCH) {
    return `${E.name} no longer lies in ${R.name}'s plane after an earlier half-lap`;
  }
  if (!alreadyIn) {
    E.position[k] += delta;
    state.moved.add(E.name);
    state.movedFace.set(`${site.enter}|${k}`, side);
  }
  const eb = boxOf(E);
  const rb = boxOf(R);
  const mid = (rb.min[k] + rb.max[k]) / 2;
  const lower: [number, number] = [rb.min[k], mid];
  const upper: [number, number] = [mid, rb.max[k]];
  const cross = (a: number): [number, number] => [Math.max(eb.min[a], rb.min[a]), Math.min(eb.max[a], rb.max[a])];
  const [p, q] = [0, 1, 2].filter((a) => a !== k);
  const crossing = { [p]: cross(p), [q]: cross(q) };
  E.cuts.push(pocketFor(E, withSpans(eb, { ...crossing, [k]: side === -1 ? lower : upper })));
  R.cuts.push(pocketFor(R, withSpans(rb, { ...crossing, [k]: side === -1 ? upper : lower })));
  return null;
}
