import type { BenchFigure, BenchLabelKind, DovetailBench as Bench } from '../document/dovetailBench';
import { labelWidth, packRow, LABEL_ASCENT, LABEL_BOX_H, LABEL_SIZE } from './diagramLabels';
import { TICK, VIEW_W } from './PartDiagram';
import { BENCH_PIN_HEADING, BENCH_TAIL_HEADING } from '../document/dovetailText';

/**
 * The dovetail bench drawings (dovetails spec §5.2, the user's rulings): figure A (the tail board's face) and figure B (the
 * pin board's end grain), SIDE BY SIDE. Every string is `dovetailBench.ts`' (inv 19); this component measures them
 * (`labelWidth`, the monospace arithmetic) and places them so no two overlap. The label size has its ONE home, the `<svg>`
 * attribute (`LABEL_SIZE`); CSS sets no font-size on this text.
 *
 * LABEL SIZE MATCHES PartDiagram's (fix round 1, the controller's ruling): a PartDiagram spans the row at a viewBox `VIEW_W`
 * wide, so each figure is `FIG_W / VIEW_W` of the row wide (an inline percentage) with a viewBox `FIG_W` wide: a 20-unit
 * label renders the same size on both, at ANY sheet width. Two always fit, so the pair never needs to wrap.
 *
 * SAME SCALE: both figures draw an inch at one `k`, chosen so `H` fills the figure between the side margins (each at least
 * half the widest chain label, so a label centred on an end span stays inside the viewBox).
 *
 * TWO MODES for the chain (chosen once per bench, both figures alike): the FULL chain `p, Te, p, …` when every label's
 * centre lands inside its own span's ticks, on one row or two tiers (pins upper, tails lower); otherwise SINGLE-VALUE —
 * each distinct span labelled ONCE at its first span (the first half pin, the first tail, the first full pin), ticks at
 * every bound, and the overall `H` printed on both figures so the chain's sum can be checked.
 */

/** Each figure's viewBox width, in PartDiagram's units: two figures and a 10-unit gap make `VIEW_W`. */
export const FIG_W = (VIEW_W - 10) / 2;
/** A figure's CSS width, as a share of the row: what makes a label render at PartDiagram's size. */
export const FIG_SHARE = `${(100 * FIG_W) / VIEW_W}%`;
const PAD = 12;
const GAP_X = 8;
/** Vertical breathing room between a label row and what it sits against. */
const GAP_Y = 6;
const ROW = LABEL_BOX_H + 2;

type Mode = 'full' | 'single';
interface ChainMark { span: number; tier: number; x: number; text: string }
interface Placed { x: number; y: number; text: string; anchor: 'start' | 'middle'; middle?: boolean; span?: number }
interface Layout {
  side: number; k: number; y0: number; height: number;
  chainY: number; texts: Placed[];
  /** The overall-`H` dimension line's y, when the figure draws one. */
  dimY?: number;
}

/** The side margin: at least half the widest chain label, so an end span's label stays inside the viewBox. */
const sideOf = (fig: BenchFigure) => Math.max(PAD, ...fig.chain.map((c) => labelWidth(c.text) / 2 + 2));

const onSpan = (fig: BenchFigure, side: number, k: number) => (x: number, i: number) =>
  x >= side + fig.bounds[i]! * k - 1e-9 && x <= side + fig.bounds[i + 1]! * k + 1e-9;

/** The full chain's marks: one row when `packRow` leaves every centre on its own span, else the two tiers (pins upper,
 *  tails lower, each packed); null when even the tiers push a label off its span. */
function fullChain(fig: BenchFigure, side: number, k: number): ChainMark[] | null {
  // Packed within the viewBox, not the outline: an end span's label may overhang the board into the side margin.
  const lo = 0;
  const hi = FIG_W;
  const ok = onSpan(fig, side, k);
  const items = fig.chain.map((c) => ({ centre: side + c.at[0] * k, width: labelWidth(c.text) }));
  const one = packRow(items, lo, hi, GAP_X);
  if (one.every(ok)) return one.map((x, i) => ({ span: i, tier: 0, x, text: fig.chain[i]!.text }));
  // In chain order (DOM order follows the chain, as on one row).
  const out: ChainMark[] = new Array(fig.chain.length);
  for (const parity of [0, 1]) {
    const idx = fig.chain.map((_, i) => i).filter((i) => i % 2 === parity);
    const xs = packRow(idx.map((i) => items[i]!), lo, hi, GAP_X);
    idx.forEach((i, j) => { out[i] = { span: i, tier: parity, x: xs[j]!, text: fig.chain[i]!.text }; });
  }
  return out.every((m) => ok(m.x, m.span)) ? out : null;
}

/** Single-value marks: the first half pin, the first tail and (with two tails or more) the first full pin, each centred on
 *  its span, each on the lowest tier where it clears the marks already there. */
function singleChain(fig: BenchFigure, side: number, k: number): ChainMark[] {
  const spans = fig.chain.length >= 5 ? [0, 1, 2] : [0, 1];
  const rights: number[] = [];
  return spans.map((i) => {
    const c = fig.chain[i]!;
    const x = side + c.at[0] * k;
    const w = labelWidth(c.text);
    let tier = rights.findIndex((r) => x - w / 2 >= r + GAP_X);
    if (tier < 0) { tier = rights.length; rights.push(0); }
    rights[tier] = x + w / 2;
    return { span: i, tier, x, text: c.text };
  });
}

function layout(fig: BenchFigure, mode: Mode, side: number, k: number): Layout {
  const texts: Placed[] = [];
  const label = (kd: BenchLabelKind) => fig.labels.find((l) => l.kind === kd);
  let y = PAD;
  const outside = label('outside');
  if (outside) {
    texts.push({ x: PAD, y: y + LABEL_ASCENT, text: outside.text, anchor: 'start' });
    // Half-blind (half-blind spec §5.2): the lap sits against the outside face, so its label shares the outside face's row.
    const lap = label('lap');
    if (lap) texts.push({ x: PAD + labelWidth(outside.text) + 3 * GAP_X, y: y + LABEL_ASCENT, text: lap.text, anchor: 'start' });
    y += ROW + GAP_Y;
  }
  const chain = (mode === 'full' ? fullChain(fig, side, k) : null) ?? singleChain(fig, side, k);
  const tiers = Math.max(...chain.map((c) => c.tier)) + 1;
  for (const c of chain) texts.push({ x: c.x, y: y + ROW * c.tier + LABEL_ASCENT, text: c.text, anchor: 'middle', span: c.span });
  y += ROW * tiers;
  const chainY = y + TICK;
  const y0 = chainY + TICK + GAP_Y;
  const y1 = y0 + fig.height * k;
  y = y1 + GAP_Y;
  const notes = fig.labels.filter((l) => l.kind === 'slope' || l.kind === 'ends');
  const baseline = label('baseline');
  if (baseline && fig.baseline !== undefined) {
    // Under the dashed line, in the wood behind the baseline (no waste there) when that margin holds a label; else a note.
    const room = (fig.height - fig.baseline) * k;
    if (room >= LABEL_BOX_H + 2 * GAP_Y) {
      texts.push({ x: side + 4, y: y0 + fig.baseline * k + GAP_Y + LABEL_ASCENT, text: baseline.text, anchor: 'start' });
    } else notes.splice(1, 0, baseline);
  }
  const inside = label('inside');
  if (inside) { texts.push({ x: PAD, y: y + LABEL_ASCENT, text: inside.text, anchor: 'start' }); y += ROW; }
  // The overall H: figure A always; figure B only in single-value mode (the ruling: on BOTH figures then).
  const overall = label('overall');
  let dimY: number | undefined;
  if (overall && (fig.baseline !== undefined || mode === 'single')) {
    dimY = y + LABEL_BOX_H + TICK;
    texts.push({ x: side + (fig.width * k) / 2, y: dimY - GAP_Y, text: overall.text, anchor: 'middle' });
    y = dimY + TICK + GAP_Y;
  }
  if (notes.length > 0) {
    let x = PAD;
    for (const n of notes) { texts.push({ x, y: y + LABEL_ASCENT, text: n.text, anchor: 'start' }); x += labelWidth(n.text) + 3 * GAP_X; }
    y += ROW;
  }
  return { side, k, y0, height: y + PAD, chainY, texts, ...(dimY === undefined ? {} : { dimY }) };
}

function Figure({ fig, l, heading }: { fig: BenchFigure; l: Layout; heading: string }) {
  const X = (x: number) => l.side + x * l.k;
  const Y = (y: number) => l.y0 + y * l.k;
  const pts = (p: [number, number][]) => p.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ');
  return (
    <figure className="cutlist-bench-figure" style={{ width: FIG_SHARE }}>
      <figcaption className="cutlist-diagram-head">{heading}</figcaption>
      <svg viewBox={`0 0 ${FIG_W} ${l.height}`} fontSize={LABEL_SIZE} role="img" aria-label={heading}>
        {fig.waste.map((w, i) => <polygon key={i} className="cutlist-bench-waste" points={pts(w)} />)}
        {fig.lap !== undefined && (
          <polygon className="cutlist-bench-lap" points={pts([[0, 0], [fig.width, 0], [fig.width, fig.lap], [0, fig.lap]])} />
        )}
        <polygon className="cutlist-diagram-outline" points={pts(fig.outline)} />
        {fig.baseline !== undefined && (
          <line className="cutlist-bench-baseline" x1={X(0)} y1={Y(fig.baseline)} x2={X(fig.width)} y2={Y(fig.baseline)} />
        )}
        <g className="cutlist-diagram-leader">
          <line x1={X(0)} y1={l.chainY} x2={X(fig.width)} y2={l.chainY} />
          {/* A half-blind figure B's ticks reach down through the lap band to the lap plane, where its chain runs. */}
          {fig.bounds.map((b, i) => (
            <line key={i} className="cutlist-bench-tick" x1={X(b)} y1={l.chainY - TICK} x2={X(b)} y2={fig.lap === undefined ? l.y0 : Y(fig.lap)} />
          ))}
          {l.dimY !== undefined && (
            <>
              <line x1={X(0)} y1={l.dimY} x2={X(fig.width)} y2={l.dimY} />
              <line x1={X(0)} y1={l.dimY - TICK} x2={X(0)} y2={l.dimY + TICK} />
              <line x1={X(fig.width)} y1={l.dimY - TICK} x2={X(fig.width)} y2={l.dimY + TICK} />
            </>
          )}
          {l.texts.map((t, i) => (
            <text key={i} x={t.x} y={t.y} textAnchor={t.anchor === 'middle' ? 'middle' : undefined}
              dominantBaseline={t.middle ? 'middle' : undefined} data-span={t.span}>{t.text}</text>
          ))}
        </g>
      </svg>
    </figure>
  );
}

/** One bench: figure A and figure B, side by side, at one scale and one chain mode, each laid out once. */
export function DovetailBench({ bench }: { bench: Bench }) {
  const side = Math.max(sideOf(bench.tail), sideOf(bench.pin));
  const k = (FIG_W - 2 * side) / bench.tail.width;
  // The mode is the chain's (identical on both figures): full when it fits on its spans, else single-value.
  const mode: Mode = fullChain(bench.tail, side, k) ? 'full' : 'single';
  return (
    <div className="cutlist-bench" data-mode={mode}>
      <Figure fig={bench.tail} l={layout(bench.tail, mode, side, k)} heading={BENCH_TAIL_HEADING} />
      <Figure fig={bench.pin} l={layout(bench.pin, mode, side, k)} heading={BENCH_PIN_HEADING} />
    </div>
  );
}
