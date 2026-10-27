import { storedAsShape } from './document';
import type { Board, Cut, CutFrom, Dimension, ProfileEnd } from './document';
import { pocketCells, cutRegion } from './cuts';
import { rebaseHoles } from './holeRebase';
import { uvDims } from './curves';
import { runDim } from './profiles';
import { axisDimensions, endFacing, positionAxisOf } from './geometry';

/**
 * Grow (or, negative, shrink) a part along world axis k on its `side` face. Moved verbatim from joinery's `resize`
 * (box-joints spec §3.2) so the document layer can grow or trim a part's end too; `onResize` replaces the joinery watch
 * and is called at the same point (before anything changes) with the dimension, the part end and the amount.
 */
export function resizeEnd(
  b: Board, k: number, side: -1 | 1, amount: number,
  onResize?: (d: Dimension, end: CutFrom, amount: number) => void,
): void {
  const d = axisDimensions(b)[k];
  onResize?.(d, endFacing(b, k, side), amount);
  // The old dimension is passed on rather than recovered as `b[d] - amount`,
  // which can be an ulp off for decimal sizes.
  const was = b[d];
  b[d] = was + amount;
  if (side === -1) b.position[k] -= amount;
  // The part end facing the world `side`: a turn may reverse axis k.
  rebaseCuts(b, d, endFacing(b, k, side), amount, was);
  rebaseAngleCuts(b, d, endFacing(b, k, side), amount);
  rebaseHoles(b, d, endFacing(b, k, side), amount);
  rebaseCurves(b, d, endFacing(b, k, side), amount);
  rebaseProfiles(b, d, endFacing(b, k, side), amount);
}

/**
 * Follow-up 205: a cut STORED into `d` from one end (`face === d`) re-stored to
 * enter from another face its box reaches, with `d` as its POSITION axis, so
 * rebaseCuts' rule keeps it in place while the part grows past it or a trim clips
 * it. A corner notch can be stored either way and storedAsShape keeps whichever
 * form it was given, so without this the answer depended on storage. Null when
 * the box reaches no other face (an end-grain mortise) or the re-store would not
 * remove exactly the same box (within 1e-9, rebaseCuts' tolerance).
 */
export function refaceFromEnd(b: Board, c: Cut, d: Dimension): Cut | null {
  const EPS = 1e-9;
  const r = cutRegion(b, c);
  const order: Dimension[] = ['thickness', 'width', 'length'];
  type Option = { f: Dimension; from: 'min' | 'max'; span: number };
  // Tie-break: thickness, width, length. pocketFor (pocket.ts) breaks ties differently ON PURPOSE: both
  // remove the same box, so do not unify them.
  const options = order.filter((f) => f !== d).flatMap((f): Option[] => {
    const span = r[f][1] - r[f][0];
    if (r[f][0] <= EPS) return [{ f, from: 'min' as const, span }];
    if (r[f][1] >= b[f] - EPS) return [{ f, from: 'max' as const, span }];
    return [];
  }).sort((x, y) => x.span - y.span); // stable: ties keep thickness, width, length
  for (const { f, from, span } of options) {
    const g = order.find((x) => x !== d && x !== f)!;
    const candidate: Cut = {
      id: c.id, face: f, from, across: g,
      offset: r[d][0], width: r[d][1] - r[d][0], depth: span,
      stopMin: r[g][0], stopMax: b[g] - r[g][1],
    };
    const a = cutRegion(b, candidate);
    if (order.every((k) => Math.abs(a[k][0] - r[k][0]) <= EPS && Math.abs(a[k][1] - r[k][1]) <= EPS)) return candidate;
  }
  return null;
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
 * - A cut INTO `d` from the moving end is re-faced from another face its box
 *   reaches (fu 205) and then stays put; only one that cannot be throws.
 *
 * A cut stored INTO the moving end is first re-faced (above), BEFORE the shape pass
 * below, so a re-faced cut that spans all of `d` can still be re-stored as running.
 * Each cut is then re-stored the way it runs where the sheet accepts it
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
  // Follow-up 205: a cut stored INTO the moving end is re-faced first when its box
  // reaches another face; it then stays put (positioned along d). Only a cut that
  // cannot be re-faced still reaches the throw below (cutIntoEnd refuses it first).
  // This runs BEFORE the shape pass: a re-faced full-length cut has d as its position
  // axis, and only storedAsShape can re-store it as RUNNING along d (so it runs out on
  // growth). Afterwards it would be left positioned and stop short of the grown end.
  // Follow-up 245: a cut stored into the OTHER end reaches the moving end too when its depth spans all
  // of d, so it is re-faced the same way (a partial one sits at the far end and stays there).
  const reachesMovingEnd = (c: Cut) => c.face === d && (c.from === end || c.depth >= was - 1e-9);
  b.cuts = b.cuts.map((c) => (reachesMovingEnd(c) ? refaceFromEnd(before, c, d) ?? c : c));
  const solids = pocketCells(before);
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

/**
 * AI-angles spec §4 (fu 307): `b` grew (or, negative, was trimmed) by `amount` at `end` of dimension `d`, so every
 * angle-cut number MEASURED FROM that end — a station when `along` is `d`, a depth when `face` is `d` — shifts by
 * `amount`, and the cut's wood stays exactly where it was. One addition per number, no trigonometry; a cut measured
 * from the other end, or across another dimension, is the same object. `readJoints` (`unjoin.ts`) calls it with the
 * opposite amount, its exact inverse. A grown part's cut measured along or into the growth that removes wood at the
 * moving end is refused before any mutation, however small (`angleConflicts`, final review I2); a TRIM (a rabbet's, possibly on a part no site names) only removes wood, and the cut's plane stays put.
 */
export function rebaseAngleCuts(b: Board, d: Dimension, end: CutFrom, amount: number): void {
  b.angleCuts = b.angleCuts.map((c) => {
    const s = c.along === d && c.alongFrom === end ? amount : 0;
    const q = c.face === d && c.from === end ? amount : 0;
    if (s === 0 && q === 0) return c;
    return { ...c, points: [[c.points[0][0] + s, c.points[0][1] + q], [c.points[1][0] + s, c.points[1][1] + q]] };
  });
}

/**
 * Joinery-curves spec §4.2: `b` grew (or, negative, was trimmed) by `amount` at `end` of dimension `d`, so every curve
 * coordinate MEASURED FROM that end (u when `uvDims(through)[0]` is `d` and `uFrom` is `end`; v likewise) shifts by
 * `amount` and the curve's waste stays exactly where it was. One addition per number; `side` and `through` are untouched,
 * and a curve measured from the other end (or through `d`) is the same object. Entries are REPLACED, never mutated: flat
 * twins share them. `readJoints` calls it with the opposite amount, its inverse to the last bit.
 *
 * `rise` and `radius` are untouched too, with ONE exception (final review C1): two separate additions do not preserve a
 * difference, so a shifted chord can come back an ulp short or long. An arc stored exactly AT the half-circle bound
 * (`rise === chord / 2`, the Half-round notch; or `radius === chord / 2`), judged the loader's way (`validateCurveCuts`:
 * `Math.hypot` of the stored endpoints), is re-stored at the bound of its NEW chord, so it stays a notch to
 * `curveKindChoice`; any other shifted arc the loader would now drop (`rise > chord / 2`, `radius < chord / 2`) is
 * clamped to that bound. Without this the closing `migrateDocument` drops the whole curve with no note. Either way the
 * number moves by an ulp, well within GATE_TOLERANCE.
 */
export function rebaseCurves(b: Board, d: Dimension, end: CutFrom, amount: number): void {
  const chord = (p: readonly [number, number], q: readonly [number, number]) => Math.hypot(q[0] - p[0], q[1] - p[1]);
  b.curves = b.curves.map((c) => {
    const [u, v] = uvDims(c.through);
    const s = u === d && c.uFrom === end ? amount : 0;
    const q = v === d && c.vFrom === end ? amount : 0;
    if (s === 0 && q === 0) return c;
    const start: [number, number] = [c.start[0] + s, c.start[1] + q];
    let was: readonly [number, number] = c.start;
    let at: readonly [number, number] = start;
    const segments = c.segments.map((g) => {
      const to: [number, number] = [g.to[0] + s, g.to[1] + q];
      let out = { ...g, to } as typeof g;
      if (g.type === 'arc') {
        const old = chord(was, g.to) / 2;
        const half = chord(at, to) / 2;
        if (g.rise !== undefined && (g.rise === old || g.rise > half)) out = { ...g, to, rise: half };
        else if (g.radius !== undefined && (g.radius === old || g.radius < half)) out = { ...g, to, radius: half };
      }
      was = g.to;
      at = to;
      return out;
    });
    return { ...c, start, segments };
  });
}

/**
 * Joinery-curves spec §4.3: a profile station `{ side, from, at }` measured from the moved end of the dimension its
 * side runs along shifts by `amount`. `through` ends, `loop` runs and every other field are untouched; changed entries
 * are replaced, never mutated. `readJoints` calls it with the opposite amount, its exact inverse.
 */
export function rebaseProfiles(b: Board, d: Dimension, end: CutFrom, amount: number): void {
  const shift = (e: ProfileEnd): ProfileEnd =>
    'through' in e || runDim(e.side) !== d || e.from !== end ? e : { ...e, at: e.at + amount };
  b.profiles = b.profiles.map((p) => {
    if ('loop' in p.run) return p;
    const start = shift(p.run.start);
    const e2 = shift(p.run.end);
    if (start === p.run.start && e2 === p.run.end) return p;
    return { ...p, run: { start, end: e2 } };
  });
}
