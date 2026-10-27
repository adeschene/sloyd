import type { Board, Dovetail } from './types';
import { builtDovetails } from './dovetails';
import { dovetailLayout, jointLineOf } from './dovetailModel';
import { BENCH_BOTH_ENDS, BENCH_INSIDE_FACE, BENCH_OUTSIDE_FACE, benchBaseline, slopeText } from './dovetailText';
import { formatLengthBare, type Units } from '../units/length';

/**
 * The bench drawings (dovetails spec §5.2, the user's rulings: BOTH figures, side by side, on the cut list sheet beside the
 * TAIL part's diagrams): what you lay out from, one pair per distinct tails layout on a part.
 *
 * Coordinates are board-local INCHES: `x` along the part's joint line J from J's min, `y` inward — figure A from the END
 * face (0) into the part, figure B from the pin part's OUTSIDE face (0) to its inside face. Every string a person reads is
 * assembled HERE (inv 19: the measured string and the drawn string are one string); `DovetailBench.tsx` only measures and
 * places them. Lengths are a drawing's, `formatLengthBare` (inv 52: bare mm in metric, the sheet carries `Dimensions in mm`;
 * imperial is `formatLength`'s string exactly, so the chain reads as the cut-list line does).
 *
 * Only a FAULT-FREE tails dovetail is drawn (`builtDovetails`): a faulted one builds nothing, and its cut-list line (kept)
 * is the record. The chain's numbers are the stored layout's `p` and `Te`, display-rounded (inv 18); the overall `H` is
 * printed so the chain's sum can be checked.
 */

/** What a label says about the drawing, so the component knows where it goes (an addition to the brief's interface). */
export type BenchLabelKind = 'baseline' | 'overall' | 'slope' | 'ends' | 'outside' | 'inside';

export interface BenchFigure {
  /** The drawn region, inches: `H` along J, and the depth shown. */
  width: number;
  height: number;
  outline: [number, number][];
  /** The waste, one convex polygon per socket. */
  waste: [number, number][][];
  /** The dimension chain `p, Te, p, …, Te, p`: each mark at the middle of its span, on `y = 0`. */
  chain: { at: [number, number]; text: string }[];
  /** Every other label, anchored at the point it describes. */
  labels: { at: [number, number]; text: string; kind: BenchLabelKind }[];
  /** The chain's tick positions along J (the layout's `bounds`, computed directly). */
  bounds: number[];
  /** Figure A only: the dashed baseline's depth from the end face. */
  baseline?: number;
}

export interface DovetailBench { key: string; ends: 'one' | 'both'; tail: BenchFigure; pin: BenchFigure }

/** A tails dovetail's layout identity on its part: everything that shapes the drawing, exact (inv 18), ids ignored. `dim`
 *  is in it (it decides H), `end` is not (two equal ends are one drawing). */
const layoutKey = (b: Board, d: Dovetail) =>
  [d.dim, b[jointLineOf(d.dim)], d.count, d.slope, d.pin, d.depth].map(String).join('|');

function figures(b: Board, d: Dovetail, ends: 'one' | 'both', units: Units): Pick<DovetailBench, 'tail' | 'pin'> {
  const f = (n: number) => formatLengthBare(n, units);
  const H = b[jointLineOf(d.dim)];
  const { N, Te, p, bounds } = dovetailLayout(H, d.count, d.slope, d.pin);
  const X = d.depth;
  const run = X / d.slope;
  const chain = bounds.slice(1).map((hi, i) => ({
    at: [(bounds[i]! + hi) / 2, 0] as [number, number],
    text: f(i % 2 === 0 ? p : Te),
  }));
  const box = (h: number): [number, number][] => [[0, 0], [H, 0], [H, h], [0, h]];

  // A: the pin sockets between the tails (N + 1, the half pins included). Each edge moves AWAY from its socket's tail side
  // by `run` at the baseline — a tail narrows toward the baseline — except a half pin's board edge, which stays square.
  const tailWaste = Array.from({ length: N + 1 }, (_, i): [number, number][] => {
    const L = bounds[2 * i]!;
    const R = bounds[2 * i + 1]!;
    return [[L, 0], [R, 0], [i === N ? H : R + run, X], [i === 0 ? 0 : L - run, X]];
  });
  // B: the tail sockets (N), full `Te` at the outside face, narrowing by `run` each side at the inside face.
  const pinWaste = Array.from({ length: N }, (_, k): [number, number][] => {
    const L = bounds[2 * k + 1]!;
    const R = bounds[2 * k + 2]!;
    return [[L, 0], [R, 0], [R - run, X], [L + run, X]];
  });

  const tail: BenchFigure = {
    width: H, height: 2 * X, outline: box(2 * X), waste: tailWaste, chain, bounds, baseline: X,
    labels: [
      { kind: 'baseline', at: [H, X], text: benchBaseline(f(X)) },
      { kind: 'overall', at: [H / 2, 2 * X], text: f(H) },
      { kind: 'slope', at: [0, 2 * X], text: slopeText(d.slope) },
      { kind: 'ends', at: [0, 2 * X], text: ends === 'both' ? BENCH_BOTH_ENDS : `${d.dim} ${d.end} end` },
    ],
  };
  const pin: BenchFigure = {
    width: H, height: X, outline: box(X), waste: pinWaste, chain: chain.map((c) => ({ ...c, at: [...c.at] })), bounds,
    labels: [
      { kind: 'outside', at: [0, 0], text: BENCH_OUTSIDE_FACE },
      { kind: 'inside', at: [0, X], text: BENCH_INSIDE_FACE },
    ],
  };
  return { tail, pin };
}

/**
 * The part's bench drawings: one per distinct fault-free TAILS layout, in canonical dovetail order (length min, length max,
 * width min, width max); two equal ends are ONE bench, `ends: 'both'`. A part with no built tails dovetail has none.
 */
export function dovetailBenches(b: Board, units: Units): DovetailBench[] {
  const groups = new Map<string, Dovetail[]>();
  for (const d of builtDovetails(b)) {
    if (d.role !== 'tails') continue;
    const k = layoutKey(b, d);
    const g = groups.get(k);
    if (g) g.push(d); else groups.set(k, [d]);
  }
  return [...groups.values()].map((g) => {
    const d = g[0]!;
    const ends = g.length > 1 ? 'both' : 'one';
    return { key: `bench:${d.dim}:${d.end}`, ends, ...figures(b, d, ends, units) };
  });
}
