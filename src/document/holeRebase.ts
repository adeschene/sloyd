import type { Board, CutFrom, Dimension, HoleRow } from './types';
import { acrossOf, isTilted } from './holeTilt';

/**
 * Hole rows re-anchored when a part's end moves (joinery-holes spec §4.1; angled holes spec §7). Here, in `document`,
 * because Level the ends (the store) needs it and the store must not import `generate` (layer order); joinery imports it
 * from here.
 */

/**
 * Joinery-holes spec §4.1: `b` grew (or, negative, was trimmed) by `amount` at `end` of dimension `d`, so a hole row's
 * number MEASURED FROM that end — the station when `along` is `d`, the inset when its across dimension is `d` — shifts
 * by `amount`, and every hole stays exactly where it was in the wood. One addition per number; a row measured from the
 * other end is the same object. A `face === d` row is never shifted: it is ruled out before it reaches here (§3.4), and
 * its far-end form is correct untouched. `readJoints` (`unjoin.ts`) calls it with the opposite amount, its exact inverse.
 */
export function rebaseHoles(b: Board, d: Dimension, end: CutFrom, amount: number): void {
  b.holes = b.holes.map((r) => {
    const s = r.along === d && r.alongFrom === end ? amount : 0;
    const q = acrossOf(r) === d && r.acrossFrom === end ? amount : 0;
    if (s === 0 && q === 0) return r;
    return { ...r, station: r.station + s, inset: r.inset + q };
  });
}

/**
 * The END-FACE rule (angled holes spec §7, Level the ends): the rows after the foot grows by `eF` (the length MIN end)
 * and the top by `eT` (the MAX end), every hole kept where it was in the wood.
 *
 * - A station or inset measured along the length from an end shifts by that end's amount (`rebaseHoles`' rule).
 * - A row ENTERING an end (`face === 'length'`): its mouth moves out with the end face, back along the bit by `e`
 *   axially. A square row's station and inset stay; a blind one deepens by `e`. A TILTED row's mouth also moves sideways
 *   by `−e` times its lateral slopes — stored relative to its flags, so `station − e·tiltAlong` and `inset − e·tiltAcross`
 *   whichever flags it has — and a blind one deepens by `e·|bit|` (depth is measured along the bit). A through row keeps
 *   `'through'`; a tilted through row still shifts its mouth, or its line would move in the wood.
 *
 * Exact: one addition per number (a product then a sum for the tilted terms). A row nothing moves is the same object.
 * Faults the new ends cause are KEPT (inv 50's resize rule); `board` is the part before the change (unused by the rule
 * itself, which needs only the row's flags, and kept so a caller passes the part the rows belong to).
 */
export function levelEndHoles(rows: HoleRow[], eF: number, eT: number, _board: Board): HoleRow[] {
  const at = (f: CutFrom) => (f === 'min' ? eF : eT);
  return rows.map((r) => {
    if (r.face === 'length') {
      const e = at(r.from);
      if (e === 0) return r;
      const tilted = isTilted(r);
      if (!tilted && r.depth === 'through') return r;
      const a = r.tiltAlong ?? 0;
      const c = r.tiltAcross ?? 0;
      const depth = r.depth === 'through' ? r.depth : r.depth + (tilted ? e * Math.hypot(1, a, c) : e);
      return tilted
        ? { ...r, depth, station: a ? r.station - e * a : r.station, inset: c ? r.inset - e * c : r.inset }
        : { ...r, depth };
    }
    const s = r.along === 'length' ? at(r.alongFrom) : 0;
    const q = acrossOf(r) === 'length' ? at(r.acrossFrom) : 0;
    if (s === 0 && q === 0) return r;
    return { ...r, station: r.station + s, inset: r.inset + q };
  });
}

/** Whether the loader would keep a row's re-anchored numbers (`validateHoleRows`: station and inset ≥ 0, a blind depth
 *  > 0). A row failing it was cut away by the new end; storing it would drop it silently on the next load. */
export function storableRow(r: HoleRow): boolean {
  return r.station >= 0 && r.inset >= 0 && (r.depth === 'through' || r.depth > 0);
}
