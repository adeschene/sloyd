import { clippedRegion, CUT_GEOMETRY_KEYS } from '../../document/document';
import type { Board, Cut, FlatDocument } from '../../document/document';
import { TOUCH } from '../../document/designCheck';
import { sameAngleCut } from '../../document/angleCuts';
import { axisDimensions, axisFrame, spanToWorldOffset } from '../../document/geometry';
import { findSites, jointKey, THIN_PANEL } from './sites';
import type { Site } from './sites';
import { applyJoints } from './recipes';
import type { JointChoice } from './recipes';
import { boxOf } from './pocket';
import type { V3, WorldBox } from './pocket';

export interface RecordedJoint {
  /** Flat display name of the entering part. */
  enter: string;
  /** Flat display name of the receiving part. */
  receive: string;
  /** The meeting, so two sites between one pair stay apart. */
  axis: 0 | 1 | 2; side: -1 | 1;
  choice: Omit<JointChoice, 'site'>;
}

/** A cut no joint accounts for: indices into `flat.boards[part].cuts`. */
export interface Unexplained { part: number; cut: number }

type Unjoined = { plain: Board[]; joints: RecordedJoint[] } | { refused: string };

const EPS = 1e-9;
const near = (a: number, b: number) => Math.abs(a - b) <= EPS;

export const cutBox = (b: Board, c: Cut): WorldBox => {
  const r = clippedRegion(b, c);
  const f = axisFrame(b);
  const min = [0, 0, 0] as V3; const max = [0, 0, 0] as V3;
  for (let i = 0; i < 3; i++) { const [lo, hi] = spanToWorldOffset(b, i, r[f[i].dim]); min[i] = b.position[i] + lo; max[i] = b.position[i] + hi; }
  return { min, max };
};
const inter = (a: WorldBox, b: WorldBox): WorldBox => ({
  min: [0, 1, 2].map((i) => Math.max(a.min[i], b.min[i])) as V3,
  max: [0, 1, 2].map((i) => Math.min(a.max[i], b.max[i])) as V3,
});
const solid = (b: WorldBox, tol = EPS) => [0, 1, 2].every((i) => b.max[i] - b.min[i] > tol);
const inside = (a: WorldBox, b: WorldBox) => [0, 1, 2].every((i) => a.min[i] >= b.min[i] - EPS && a.max[i] <= b.max[i] + EPS);
const sameSpan = (a: WorldBox, b: WorldBox, i: number) => near(a.min[i], b.min[i]) && near(a.max[i], b.max[i]);

/**
 * Reading a joined design back into plain boxes plus joint records
 * (refine-joined spec §3). It lives beside the recipes it inverts, not in
 * `document/`, because the gate needs `applyJoints` (the document layer imports
 * nothing from `generate`). Pure; reads ONLY the joined document. `plain` is in
 * the same order as `flat.boards`, with the same ids and names, and uncut
 * (generated designs arrive uncut; a cut part in the input is out of scope).
 *
 * Mortise-tenon, dado, stopped dado (grow-only, applied last forward, so undone
 * first): the overlap with the receiver gives the pocket; the entering part is
 * shortened back to the receiver's face; its waste cuts give the tenon length,
 * or the stop end and inset; both parts' joint cuts are removed.
 *
 * Rabbet: the panel moves back out by its thickness and is untrimmed to each
 * receiver's outer face; parts it trimmed (fu 201) regain their length; its
 * outer-face rider chain (fu 183) moves back with it.
 *
 * Half-lap: the stack's layers are rebuilt from the notches, in any listing
 * order (each notched-low part sits one thickness above every part it laps).
 *
 * Lowering is not undone: re-joining lowers again. The plain design is
 * re-floored only to match the joined design's floor, so the plain design the
 * model sees stands where the joined one does.
 *
 * Ambiguities (spec §3.1, stated, not fixed): two originals can join to the
 * identical document, and this picks one — a back flush with the sides' outer
 * faces vs inset up to its rabbet is assumed flush; a shelf butting the back vs
 * short of it by up to the back's trim is assumed butting; a gap ≤ `TOUCH`
 * between two joined parts is assumed closed. They matter only when a refine
 * then changes those parts; untouched parts re-join exactly (`gateUnjoin`
 * guarantees it).
 *
 * `readJoints` is this body: it returns the cuts no joint explains (`unexplained`)
 * instead of refusing. `unjoin` refuses on any; its reason is internal (it names
 * the cut), and callers go through `gateUnjoin`, which replaces it with `GATE_REFUSAL`.
 */
export function readJoints(flat: FlatDocument):
  { plain: Board[]; joints: RecordedJoint[]; unexplained: Unexplained[] } | { refused: string } {
  // Per board, as in applyJoints: a whole-array clone keeps aliasing, and flat twins of one
  // definition share one `cuts` array (positions are computed per placement).
  const boards: Board[] = flat.boards.map((b) => structuredClone(b));
  // Every cut, as a world box, computed ONCE from the joined document; afterwards part-local cuts are never read.
  const cuts = boards.map((b) => b.cuts.map((c) => ({ box: cutBox(b, c), used: false })));
  const joints: RecordedJoint[] = [];
  const box = (i: number) => boxOf(boards[i]);
  const resizeAt = (i: number, k: number, side: -1 | 1, amount: number) => {
    const d = axisDimensions(boards[i])[k];
    boards[i][d] = boards[i][d] + amount;
    if (side === -1) boards[i].position[k] -= amount;
  };

  // 1. Grow joints (mortise-tenon, dado, stopped dado), applied LAST forward, undone first.
  for (let guard = 0; guard < 500; guard++) {
    let found = false;
    for (let e = 0; e < boards.length && !found; e++) {
      const k = axisDimensions(boards[e]).indexOf('length');
      for (let r = 0; r < boards.length && !found; r++) {
        if (r === e) continue;
        const E = box(e); const R = box(r);
        const O = inter(E, R);
        if (!solid(O)) continue;
        if (![0, 1, 2].filter((i) => i !== k).every((i) => sameSpan(O, E, i))) continue;
        let side: -1 | 1;
        if (near(O.max[k], E.max[k]) && near(O.min[k], R.min[k]) && E.min[k] < R.min[k] - EPS) side = 1;
        else if (near(O.min[k], E.min[k]) && near(O.max[k], R.max[k]) && E.max[k] > R.max[k] + EPS) side = -1;
        else continue;
        // The end slab of E: E's cross-section, from the end inward far enough to hold any waste cut.
        const waste = cuts[e].filter((c) => !c.used && inside(c.box, E) && [0, 1, 2].filter((i) => i !== k).every((i) => c.box.min[i] >= E.min[i] - EPS && c.box.max[i] <= E.max[i] + EPS) &&
          (side === 1 ? near(c.box.max[k], E.max[k]) && c.box.min[k] >= O.min[k] - TOUCH : near(c.box.min[k], E.min[k]) && c.box.max[k] <= O.max[k] + TOUCH) && solid(inter(c.box, O)));
        const pockets = cuts[r].filter((c) => !c.used && inside(c.box, O));
        if (pockets.length !== 1) continue;
        let choice: Omit<JointChoice, 'site'>; let L: number;
        if (waste.length === 0) {
          L = O.max[k] - O.min[k];
          choice = { joint: 'dado', depth: L };
        } else if (waste.length === 1) {
          const w = waste[0].box;
          L = w.max[k] - w.min[k];
          const p = [0, 1, 2].find((i) => i !== k && !sameSpan(w, E, i));
          if (p === undefined) return { refused: `stopped-dado strip on ${boards[e].name} has no stop axis` };
          choice = { joint: 'stopped-dado', depth: L, stopAt: { axis: p as 0 | 1 | 2, end: near(w.min[p], E.min[p]) ? 'min' : 'max' }, inset: w.max[p] - w.min[p] };
        } else {
          L = Math.max(...waste.map((w) => w.box.max[k] - w.box.min[k]));
          choice = { joint: 'mortise-tenon', tenonLength: L };
        }
        for (const w of waste) w.used = true;
        pockets[0].used = true;
        joints.push({ enter: boards[e].name, receive: boards[r].name, axis: k as 0 | 1 | 2, side, choice });
        resizeAt(e, k, side, -L);
        found = true;
      }
    }
    if (!found) break;
  }

  // 2. Rabbets: a thin panel lying inside a receiver's pocket along its thickness axis.
  type Unit = { e: number; k: number; side: -1 | 1; recv: { r: number; depth: number; nAx: number; inner: 'min' | 'max' }[] };
  const units: Unit[] = [];
  for (let e = 0; e < boards.length; e++) {
    if (boards[e].thickness > THIN_PANEL + EPS) continue;
    const k = axisDimensions(boards[e]).indexOf('thickness');
    for (let r = 0; r < boards.length; r++) {
      if (r === e) continue;
      const E = box(e); const R = box(r);
      const O = inter(E, R);
      if (!solid(O) || !sameSpan(O, E, k)) continue;
      let side: -1 | 1;
      if (near(E.max[k], R.max[k])) side = -1; else if (near(E.min[k], R.min[k])) side = 1; else continue;
      const pk = cuts[r].filter((c) => !c.used && solid(inter(c.box, E)));
      if (pk.length !== 1) continue;
      const nAx = axisDimensions(boards[r]).indexOf('thickness');
      if (nAx === k) continue;
      const P = pk[0].box;
      const inner = near(P.max[nAx], R.max[nAx]) ? 'max' : near(P.min[nAx], R.min[nAx]) ? 'min' : null;
      if (!inner) continue;
      pk[0].used = true;
      let u = units.find((x) => x.e === e && x.k === k && x.side === side);
      if (!u) { u = { e, k, side, recv: [] }; units.push(u); }
      u.recv.push({ r, depth: P.max[nAx] - P.min[nAx], nAx, inner });
    }
  }
  const allReceivers = new Set(units.flatMap((u) => u.recv.map((x) => `${u.e}->${x.r}`)));
  const butting = (i: number, k: number, face: -1 | 1, skip: (j: number) => boolean) => {
    const a = box(i); const plane = face === 1 ? a.max[k] : a.min[k];
    return boards.map((_, j) => j).filter((j) => {
      if (j === i || skip(j)) return false;
      const b = box(j); const theirs = face === 1 ? b.min[k] : b.max[k];
      return near(theirs, plane) && [0, 1, 2].filter((x) => x !== k).every((x) => Math.min(a.max[x], b.max[x]) - Math.max(a.min[x], b.min[x]) > TOUCH);
    });
  };
  for (const u of units) {
    const { e, k, side } = u;
    const t = boards[e].thickness;
    const recv = (j: number) => allReceivers.has(`${e}->${j}`);
    // Outer-face chain (fu 183), found in the joined geometry before anything moves.
    const carried: number[] = [];
    const outer = (i: number) => butting(i, k, (-side) as -1 | 1, (j) => j === e || recv(j) || carried.includes(j));
    carried.push(...outer(e));
    for (let n = 0; n < carried.length; n++) for (const j of outer(carried[n])) if (!carried.includes(j)) carried.push(j);
    // Parts trimmed by the panel (fu 201): canonically they butted it, so they get t back.
    const trimmedParts = butting(e, k, side, (j) => recv(j) || carried.includes(j));
    // The panel's trims to the rabbet lines: canonically it ran to each receiver's outer face.
    // A panel not at a receiver's rabbet line is left as is (the gate judges the result).
    for (const { r, depth, nAx, inner } of u.recv) {
      const E = box(e); const R = box(r);
      if (inner === 'max' && near(E.min[nAx], R.max[nAx] - depth)) resizeAt(e, nAx, -1, E.min[nAx] - R.min[nAx]);
      else if (inner === 'min' && near(E.max[nAx], R.min[nAx] + depth)) resizeAt(e, nAx, 1, R.max[nAx] - E.max[nAx]);
      joints.push({ enter: boards[e].name, receive: boards[r].name, axis: k as 0 | 1 | 2, side, choice: { joint: 'rabbet', depth } });
    }
    for (const i of [e, ...carried]) boards[i].position[k] -= side * t;
    for (const i of trimmedParts) resizeAt(i, k, (-side) as -1 | 1, t);
  }

  // 3. Half-laps: coplanar equal-thickness parts crossing, E notched on the -k half, R on the +k half.
  const edges: [number, number, number][] = [];
  for (let a = 0; a < boards.length; a++) {
    const k = axisDimensions(boards[a]).indexOf('thickness');
    for (let b = 0; b < boards.length; b++) {
      if (a === b || axisDimensions(boards[b]).indexOf('thickness') !== k) continue;
      const A = box(a); const B = box(b);
      if (!sameSpan(A, B, k)) continue;
      const X = inter(A, B);
      if (!solid(X)) continue;
      const mid = (A.min[k] + A.max[k]) / 2;
      const inX = (c: { box: WorldBox }) => [0, 1, 2].filter((i) => i !== k).every((i) => sameSpan(c.box, X, i));
      const lowA = cuts[a].find((c) => !c.used && inX(c) && near(c.box.min[k], A.min[k]) && near(c.box.max[k], mid));
      const highB = cuts[b].find((c) => !c.used && inX(c) && near(c.box.min[k], mid) && near(c.box.max[k], B.max[k]));
      if (!lowA || !highB) continue;
      lowA.used = true; highB.used = true;
      edges.push([a, b, k]);
      joints.push({ enter: boards[a].name, receive: boards[b].name, axis: k as 0 | 1 | 2, side: -1, choice: { joint: 'half-lap' } });
    }
  }
  const level = new Map<number, number>();
  for (let n = 0; n < boards.length + 1; n++) for (const [a, b] of edges) level.set(a, Math.max(level.get(a) ?? 0, (level.get(b) ?? 0) + 1));
  for (const [a, lv] of level) {
    const k = edges.find(([x]) => x === a)![2];
    boards[a].position[k] += lv * boards[a].thickness;
  }

  // 4. Re-floor: if the joined piece stands on the floor, so does the plain one.
  const lowest = (bs: Board[]) => Math.min(...bs.map((b) => b.position[1]));
  if (boards.length && lowest(flat.boards) <= TOUCH) {
    const drop = lowest(boards) - lowest(flat.boards);
    if (!near(drop, 0)) for (const b of boards) b.position[1] -= drop;
  }

  const unexplained: Unexplained[] = cuts.flatMap((cs, part) => cs.flatMap((c, cut) => (c.used ? [] : [{ part, cut }])));
  for (const b of boards) b.cuts = [];
  return { plain: boards, joints, unexplained };
}

/** `readJoints`, refusing when any cut is unexplained. The reason names the cuts (internal; callers go through `gateUnjoin`). */
export function unjoin(flat: FlatDocument): Unjoined {
  const r = readJoints(flat);
  if ('refused' in r) return r;
  if (r.unexplained.length) {
    const left = r.unexplained.map(({ part, cut }) => { const b = flat.boards[part]!; const x = cutBox(b, b.cuts[cut]!); return `${b.name}[${x.min.join(',')}->${x.max.join(',')}]`; });
    return { refused: `unexplained cuts on ${[...new Set(left)].join(', ')}` };
  }
  return { plain: r.plain, joints: r.joints };
}

/** Re-join plain parts with recorded joints, every other site butt — the gate's re-join. */
export function rejoin(plain: FlatDocument, joints: readonly RecordedJoint[]): FlatDocument | null {
  const sites = findSites(plain);
  const key = (s: Site) => jointKey(plain.boards[s.enter]!.name, plain.boards[s.receive]!.name, s.axis, s.side);
  const bySite = new Map(sites.map((s) => [key(s), s]));
  const choices: JointChoice[] = sites.map((s) => ({ site: s.id, joint: 'butt' }));
  for (const j of joints) {
    const s = bySite.get(jointKey(j.enter, j.receive, j.axis, j.side));
    if (!s) return null;
    choices[sites.indexOf(s)] = { site: s.id, ...j.choice };
  }
  return applyJoints(plain, sites, choices).doc;
}

export const GATE_REFUSAL = "Refine cannot account for this design's joints — for example, joinery was run twice, or a joined part or cut was edited by hand.";

/**
 * How far apart two numbers may be and still be the same in the gate (refine-joined spec §3.2,
 * amended after the final review by the user's ruling). Cut fields are recomputed from world
 * coordinates, so a design whose numbers are not binary fractions (metric stock, a typed move)
 * comes back off in the last bit; a genuinely wrong read-back is off by at least 1/16in.
 */
export const GATE_TOLERANCE = 1e-9;

const same = (a: unknown, b: unknown) =>
  typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) <= GATE_TOLERANCE : a === b;
export const sameCut = (c: Cut, d: Cut) => CUT_GEOMETRY_KEYS.every((k) => same(c[k], d[k]));

/** The same cuts in any order: equal length, each of a matched to a distinct cut of b by sameCut (order is not geometry). */
function sameCutSet(a: Board['cuts'], b: Board['cuts']): boolean {
  if (a.length !== b.length) return false;
  const free = [...b];
  return a.every((c) => {
    const i = free.findIndex((d) => sameCut(c, d));
    if (i < 0) return false;
    free.splice(i, 1);
    return true;
  });
}

/**
 * Ids ignored (refine-joined spec §3.2). Names, posture, rotation, material and grain compare
 * EXACTLY; every number (position, length/width/thickness, each numeric cut field) within
 * GATE_TOLERANCE; non-numeric cut fields (face, from, across) exactly; angle cuts exactly (sameAngleCut). The gate is
 * only as good as this.
 */
export function sameJoined(a: FlatDocument, b: FlatDocument): boolean {
  if (a.boards.length !== b.boards.length) return false;
  return a.boards.every((p, i) => {
    const q = b.boards[i]!;
    return p.name === q.name && p.position.every((v, k) => same(v, q.position[k])) &&
      same(p.length, q.length) && same(p.width, q.width) && same(p.thickness, q.thickness) &&
      p.posture === q.posture && p.rotation === q.rotation && p.material === q.material && p.grain === q.grain &&
      sameCutSet(p.cuts, q.cuts) &&
      // Exact, by design: joinery never touches angle cuts, so their round trip is identity (AI-tapers spec §5.4a).
      p.angleCuts.length === q.angleCuts.length && p.angleCuts.every((c, k) => sameAngleCut(c, q.angleCuts[k]!));
  });
}

/**
 * unjoin, then prove it: re-join the plain parts with the recorded joints and
 * require the joined design back (sameJoined: exact, numbers within GATE_TOLERANCE). Anything else refuses, before any
 * model call (refine-joined spec §3.2).
 */
export function gateUnjoin(flat: FlatDocument): { plain: Board[]; joints: RecordedJoint[] } | { refused: string } {
  const u = unjoin(flat);
  if ('refused' in u) return { refused: GATE_REFUSAL };
  const again = rejoin({ ...flat, boards: u.plain }, u.joints);
  return again && sameJoined(again, flat) ? u : { refused: GATE_REFUSAL };
}
