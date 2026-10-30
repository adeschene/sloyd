// The cam-and-bolt recogniser (cam-and-bolt spec §3.1): the ONE place a face bore (the cam) and an edge bore (the bolt)
// meeting on purpose are recognised. By SHAPE, on `Hole` instances (count and pitch line up hole for hole); nothing is
// stored. A leaf over holes.ts (holes.ts must never import this). Every comparison is conservative: a borderline pair is
// NOT a pair, so it stays a `meets-hole` fault.
import type { Board, HoleRow } from './types';
import { DIMENSION_ORDER } from './geometry';
import { HOLE_EPS, holeInstances, tiltedHole } from './holes';
import type { Hole } from './holes';

const idx = (d: Hole['axis']) => DIMENSION_ORDER.indexOf(d);

/** Clause 1 for one hole: square, headless, blind. */
const plain = (h: Hole): boolean => !tiltedHole(h) && h.head === undefined && !h.through;

/** Clauses 2–6 with `f` the face bore and `e` the edge bore. */
function meets(f: Hole, e: Hole): boolean {
  if (!plain(f) || !plain(e)) return false;
  if (e.axis === f.axis) return false;
  const a = idx(f.axis);
  const b = idx(e.axis);
  const c = 3 - a - b;
  const R = f.radius;
  const r = e.radius;
  // 3: E's axis passes through F's axis.
  if (Math.abs(e.centre[c]! - f.centre[c]!) > HOLE_EPS) return false;
  // 4: E's cross-section lies strictly inside F's span (never its floor or mouth plane).
  const end = f.centre[a]! + f.dir * f.depth;
  const lo = Math.min(f.centre[a]!, end);
  const hi = Math.max(f.centre[a]!, end);
  if (!(e.centre[a]! - r > lo + HOLE_EPS && e.centre[a]! + r < hi - HOLE_EPS)) return false;
  // 5: E is narrower.
  if (!(r < R - HOLE_EPS)) return false;
  // 6: E's whole bottom disc is in F's air, and E's mouth is outside F.
  const s = e.centre[b]! + e.dir * e.depth - f.centre[b]!;
  if (!(s * s + r * r <= R * R - HOLE_EPS)) return false;
  return e.dir * (f.centre[b]! - e.centre[b]!) > R + HOLE_EPS;
}

/** Each paired hole maps to its partner, both directions; an unpaired hole is absent (clauses 1–7). */
export function camPartners(holes: readonly Hole[]): Map<Hole, Hole> {
  const cands: [Hole, Hole][] = [];
  const count = new Map<Hole, number>();
  for (const f of holes) {
    for (const e of holes) {
      if (f === e || !meets(f, e)) continue;
      cands.push([f, e]);
      count.set(f, (count.get(f) ?? 0) + 1);
      count.set(e, (count.get(e) ?? 0) + 1);
    }
  }
  // 7: one to one. A hole in more than one candidate takes all of its candidates with it.
  const bad = new Set<Hole>();
  for (const [h, n] of count) if (n > 1) bad.add(h);
  const out = new Map<Hole, Hole>();
  for (const [f, e] of cands) {
    if (bad.has(f) || bad.has(e)) continue;
    out.set(f, e);
    out.set(e, f);
  }
  return out;
}

/** The face bore is the cam: it is the cam iff clause 6 holds with it as F. */
export function camRole(h: Hole, mate: Hole): 'cam' | 'bolt' {
  return meets(h, mate) ? 'cam' : 'bolt';
}

const pairedRows = (board: Board): { cam: HoleRow; bolt: HoleRow; ids: [string, string] }[] => {
  const rows = board.holes ?? [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const holes = rows.flatMap((r) => holeInstances(board, r));
  const partner = camPartners(holes);
  const out: { cam: HoleRow; bolt: HoleRow; ids: [string, string] }[] = [];
  for (const row of rows) {
    const mine = holes.filter((h) => h.row === row.id);
    if (mine.length === 0) continue;
    const mates = mine.map((h) => partner.get(h));
    if (mates.some((m) => m === undefined)) continue;
    const other = mates[0]!.row;
    if (other === row.id || mates.some((m) => m!.row !== other)) continue;
    if (!holes.filter((h) => h.row === other).every((h) => partner.has(h))) continue;
    if (holes.filter((h) => h.row === other).length !== mine.length) continue;
    if (camRole(mine[0]!, mates[0]!) !== 'cam') continue;
    out.push({ cam: row, bolt: byId.get(other)!, ids: [row.id, other] });
  }
  return out;
};

/** WHOLE pairs of rows (every hole of each row pairs with a hole of the other, counts equal), in the cam row's order. */
export function camPairRows(board: Board): { cam: HoleRow; bolt: HoleRow }[] {
  return pairedRows(board).map(({ cam, bolt }) => ({ cam, bolt }));
}

interface IdsMemo { length: number; width: number; thickness: number; ids: ReadonlySet<string> }
const idsMemo = new WeakMap<object, IdsMemo>();

/** Ids of rows with at least one paired hole. Memoised on the `board.holes` array AND the board's size (a `max`-anchored
 *  row resolves against it, so a resize that keeps the array changes the answer). */
export function camRowIds(board: Board): ReadonlySet<string> {
  const key = board.holes;
  if (key === undefined) return new Set();
  const hit = idsMemo.get(key);
  if (hit && hit.length === board.length && hit.width === board.width && hit.thickness === board.thickness) return hit.ids;
  const holes = key.flatMap((r) => holeInstances(board, r));
  const ids = new Set<string>();
  for (const h of camPartners(holes).keys()) ids.add(h.row);
  idsMemo.set(key, { length: board.length, width: board.width, thickness: board.thickness, ids });
  return ids;
}
