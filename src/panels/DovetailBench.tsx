import type { BenchFigure, BenchLabelKind, DovetailBench as Bench } from '../document/dovetailBench';
import { labelWidth, packRow, LABEL_ASCENT, LABEL_BOX_H, LABEL_SIZE } from './diagramLabels';
import { TICK } from './PartDiagram';
import { BENCH_PIN_HEADING, BENCH_TAIL_HEADING } from '../document/dovetailText';

/**
 * The dovetail bench drawings (dovetails spec §5.2, the user's rulings): figure A (the tail board's face) and figure B (the
 * pin board's end grain), side by side, wrapping under each other on a narrow sheet. Every string is `dovetailBench.ts`'
 * (inv 19); this component measures them (`labelWidth`, the monospace arithmetic) and places them so no two overlap. The
 * label size has its ONE home, the `<svg>` attribute (`LABEL_SIZE`); CSS sets no font-size on this text.
 *
 * SAME SCALE: both figures draw `H` at `DRAW` user units and share ONE viewBox width (the wider figure's), and the two
 * `<svg>`s take equal widths (`.cutlist-bench-figure`), so an inch is the same length on both.
 */

/** `H` drawn at this many user units. Chosen so the 6"/4-tail/1:8 chain fits on one row at LABEL_SIZE 20. */
const DRAW = 720;
const PAD = 12;
const GAP_X = 8;
/** Vertical breathing room between a label row and what it sits against. */
const GAP_Y = 6;
const ROW = LABEL_BOX_H + 2;

interface Placed { x: number; y: number; text: string; anchor: 'start' | 'middle'; middle?: boolean }
interface Layout {
  k: number; y0: number; height: number; right: number;
  chainY: number; texts: Placed[];
  /** The overall-`H` dimension line's y, when the figure carries one (figure A). */
  dimY?: number;
}

/** The chain's labels on one row when every packed label still sits over its own span; otherwise two tiers (the pins'
 *  on the upper tier, the tails' on the lower), each packed on its own. `packRow` keeps each tier overlap-free. */
function chainTiers(fig: BenchFigure, k: number): { tier: number; x: number; text: string }[] {
  const lo = PAD;
  const hi = PAD + DRAW;
  const items = fig.chain.map((c) => ({ centre: PAD + c.at[0] * k, width: labelWidth(c.text) }));
  const one = packRow(items, lo, hi, GAP_X);
  const over = (i: number, x: number) => x >= PAD + fig.bounds[i]! * k - 1e-9 && x <= PAD + fig.bounds[i + 1]! * k + 1e-9;
  if (one.every((x, i) => over(i, x))) return one.map((x, i) => ({ tier: 0, x, text: fig.chain[i]!.text }));
  const out: { tier: number; x: number; text: string }[] = [];
  for (const parity of [0, 1]) {
    const idx = fig.chain.map((_, i) => i).filter((i) => i % 2 === parity);
    const xs = packRow(idx.map((i) => items[i]!), lo, hi, GAP_X);
    idx.forEach((i, j) => out.push({ tier: parity, x: xs[j]!, text: fig.chain[i]!.text }));
  }
  return out;
}

function layout(fig: BenchFigure): Layout {
  const k = DRAW / fig.width;
  const texts: Placed[] = [];
  const label = (kd: BenchLabelKind) => fig.labels.find((l) => l.kind === kd);
  let y = PAD;
  const outside = label('outside');
  if (outside) { texts.push({ x: PAD, y: y + LABEL_ASCENT, text: outside.text, anchor: 'start' }); y += ROW + GAP_Y; }
  const chain = chainTiers(fig, k);
  const tiers = Math.max(...chain.map((c) => c.tier)) + 1;
  for (const c of chain) texts.push({ x: c.x, y: y + ROW * c.tier + LABEL_ASCENT, text: c.text, anchor: 'middle' });
  y += ROW * tiers;
  const chainY = y + TICK;
  const y0 = chainY + TICK + GAP_Y;
  const y1 = y0 + fig.height * k;
  let right = Math.max(PAD + DRAW, ...texts.map((t) => (t.anchor === 'middle' ? t.x + labelWidth(t.text) / 2 : t.x + labelWidth(t.text))));
  y = y1 + GAP_Y;
  const baseline = label('baseline');
  if (baseline && fig.baseline !== undefined) {
    const x = PAD + DRAW + 12;
    texts.push({ x, y: y0 + fig.baseline * k, text: baseline.text, anchor: 'start', middle: true });
    right = Math.max(right, x + labelWidth(baseline.text));
  }
  const inside = label('inside');
  if (inside) { texts.push({ x: PAD, y: y + LABEL_ASCENT, text: inside.text, anchor: 'start' }); y += ROW; }
  const overall = label('overall');
  let dimY: number | null = null;
  if (overall) {
    // The overall H: its label above a dimension line under the figure (PartDiagram's bottom row, the same shape).
    dimY = y + LABEL_BOX_H + TICK;
    texts.push({ x: PAD + DRAW / 2, y: dimY - GAP_Y, text: overall.text, anchor: 'middle' });
    y = dimY + TICK + GAP_Y;
  }
  const notes = fig.labels.filter((l) => l.kind === 'slope' || l.kind === 'ends');
  if (notes.length > 0) {
    let x = PAD;
    for (const n of notes) { texts.push({ x, y: y + LABEL_ASCENT, text: n.text, anchor: 'start' }); x += labelWidth(n.text) + 3 * GAP_X; }
    right = Math.max(right, x - 3 * GAP_X);
    y += ROW;
  }
  return { k, y0, height: y + PAD, right: right + PAD, chainY, texts, ...(dimY === null ? {} : { dimY }) };
}

function Figure({ fig, kind, viewW }: { fig: BenchFigure; kind: 'tail' | 'pin'; viewW: number }) {
  const l = layout(fig);
  const X = (x: number) => PAD + x * l.k;
  const Y = (y: number) => l.y0 + y * l.k;
  const pts = (p: [number, number][]) => p.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ');
  const heading = kind === 'tail' ? BENCH_TAIL_HEADING : BENCH_PIN_HEADING;
  return (
    <figure className="cutlist-bench-figure">
      <figcaption className="cutlist-diagram-head">{heading}</figcaption>
      <svg viewBox={`0 0 ${viewW} ${l.height}`} fontSize={LABEL_SIZE} role="img" aria-label={heading}>
        {fig.waste.map((w, i) => <polygon key={i} className="cutlist-bench-waste" points={pts(w)} />)}
        <polygon className="cutlist-diagram-outline" points={pts(fig.outline)} />
        {fig.baseline !== undefined && (
          <line className="cutlist-bench-baseline" x1={X(0)} y1={Y(fig.baseline)} x2={X(fig.width)} y2={Y(fig.baseline)} />
        )}
        <g className="cutlist-diagram-leader">
          <line x1={X(0)} y1={l.chainY} x2={X(fig.width)} y2={l.chainY} />
          {fig.bounds.map((b, i) => <line key={i} x1={X(b)} y1={l.chainY - TICK} x2={X(b)} y2={l.y0} />)}
          {l.dimY !== undefined && (
            <>
              <line x1={X(0)} y1={l.dimY} x2={X(fig.width)} y2={l.dimY} />
              <line x1={X(0)} y1={l.dimY - TICK} x2={X(0)} y2={l.dimY + TICK} />
              <line x1={X(fig.width)} y1={l.dimY - TICK} x2={X(fig.width)} y2={l.dimY + TICK} />
            </>
          )}
          {l.texts.map((t, i) => (
            <text key={i} x={t.x} y={t.y} textAnchor={t.anchor === 'middle' ? 'middle' : undefined}
              dominantBaseline={t.middle ? 'middle' : undefined}>{t.text}</text>
          ))}
        </g>
      </svg>
    </figure>
  );
}

/** One bench: figure A and figure B, side by side. */
export function DovetailBench({ bench }: { bench: Bench }) {
  const viewW = Math.max(layout(bench.tail).right, layout(bench.pin).right);
  return (
    <div className="cutlist-bench">
      <Figure fig={bench.tail} kind="tail" viewW={viewW} />
      <Figure fig={bench.pin} kind="pin" viewW={viewW} />
    </div>
  );
}
