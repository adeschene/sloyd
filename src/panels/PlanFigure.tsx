import { memo, useMemo } from 'react';
import type { Board, SloydDocument } from '../document/types';
import { worldParts } from '../document/tree';
import { drawView, FRONT, ISO, SIDE, TOP, type Drawing, type P2, type Seg2, type View } from '../document/drawing';
import { dimensionView, type DimLine } from '../document/dimensions';
import type { Units } from '../units/length';
import { explodeOffsets } from '../document/explode';
import { fitChain } from './planDims';
import { DIM_BAND, PLAN_WIDTH, layoutTrio, toSvg, type Placement } from './planLayout';
import { buildCutList, flatDocument } from '../document/document';
import { anchorsFor, layoutBalloons, numberList, type PlacedBalloon } from './planBalloons';
import { partFeatures } from '../document/featureKeys';
import { planKeys, type KeyTag } from './planKeys';
import { LABEL_ASCENT, LABEL_DESCENT, LABEL_SIZE } from './diagramLabels';

const TICK = 6;

/**
 * A figure's on-page width: its share of PLAN_WIDTH. CSS draws `.plans-figure` at 100% width, which
 * would stretch a narrower, height-capped figure back to full width — and back off the page (fu 254).
 */
const pageWidth = (width: number) => ({ width: `${(Math.min(width, PLAN_WIDTH) / PLAN_WIDTH) * 100}%` });
const EXT_GAP = 4;

type ToSvg = ReturnType<typeof toSvg>;

/** Inches, in drawing coordinates: a segment starting where the previous one ended continues its subpath. */
const CHAIN_EPS = 1e-9;

/**
 * One SVG path for `segs`. Consecutive segments of ONE part that meet (the next starts where the previous ended, within CHAIN_EPS
 * before mapping) are ONE subpath, `M…L…L…`: SVG restarts the dash pattern at every `M`, so a hole's 96-chord rim drawn
 * as 96 subpaths would read solid on the sheet (ruling R2). Joining moves no line; it only carries the dash phase on.
 */
export const pathOf = (segs: Seg2[], map: ToSvg) => {
  let out = '';
  let prev: Seg2 | null = null;
  for (const s of segs) {
    const [ax, ay] = map(s.a);
    const [bx, by] = map(s.b);
    const joined = prev !== null && prev.part === s.part && Math.abs(s.a[0] - prev.b[0]) <= CHAIN_EPS && Math.abs(s.a[1] - prev.b[1]) <= CHAIN_EPS;
    if (!joined) out += `M${ax.toFixed(2)} ${ay.toFixed(2)}`;
    out += `L${bx.toFixed(2)} ${by.toFixed(2)}`;
    prev = s;
  }
  return out;
};

/** Hidden beneath visible (spec §2.4), so a hidden line coinciding with a visible one is covered. */
function Lines({ d, map, hidden }: { d: Drawing; map: ToSvg; hidden: boolean }) {
  return (
    <>
      {hidden && d.hidden.length > 0 && <path className="plan-hidden" d={pathOf(d.hidden, map)} />}
      <path className="plan-visible" d={pathOf(d.visible, map)} />
    </>
  );
}

/** One dimension line between SVG points a and b, label centred; `vertical` rotates the label. */
function Dim({ a, b, label, vertical }: { a: P2; b: P2; label: string; vertical: boolean }) {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const tick = (p: P2) => <line x1={p[0] - TICK / 2} y1={p[1] + TICK / 2} x2={p[0] + TICK / 2} y2={p[1] - TICK / 2} />;
  return (
    <g className="plan-dim">
      <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
      {tick(a)}
      {tick(b)}
      {vertical ? (
        <text className="plan-dim-label" x={mx - EXT_GAP} y={my} textAnchor="middle" transform={`rotate(-90 ${mx - EXT_GAP} ${my})`}>{label}</text>
      ) : (
        <text className="plan-dim-label" x={mx} y={my - EXT_GAP} textAnchor="middle">{label}</text>
      )}
    </g>
  );
}

interface Fitted { overall: DimLine | null; chain: DimLine[] }

/** The leader's end dot, in SVG units. */
const DOT_R = 2.5;

/** One feature tag (feature callouts spec §4.3): a leader from a dot on the drawn line to the circle's edge, the circle
 *  filled with the paper so the lines beneath are masked, the letter centred. */
function KeyMark({ t, r }: { t: KeyTag; r: number }) {
  const dx = t.centre[0] - t.anchor[0];
  const dy = t.centre[1] - t.anchor[1];
  const l = Math.hypot(dx, dy) || 1;
  const ex = t.centre[0] - (dx / l) * r;
  const ey = t.centre[1] - (dy / l) * r;
  return (
    <g className="plans-key-mark" data-letter={t.letter}>
      <path className="plans-leader" d={`M${t.anchor[0]} ${t.anchor[1]}L${ex} ${ey}`} />
      <circle className="plans-leader-dot" cx={t.anchor[0]} cy={t.anchor[1]} r={DOT_R} />
      <circle className="plans-key-tag" cx={t.centre[0]} cy={t.centre[1]} r={r} />
      <text x={t.centre[0]} y={t.centre[1] + (LABEL_ASCENT - LABEL_DESCENT) / 2} textAnchor="middle">{t.letter}</text>
    </g>
  );
}

/** One elevation with its dimensions: chain above/left, overall below/right (spec §5.4). */
function Elevation({ d, at, scale, h, v }: { d: Drawing; at: Placement; scale: number; h: Fitted; v: Fitted }) {
  const map = toSvg(d, at, scale);
  const left = at.x;
  const right = at.x + (d.bounds.max[0] - d.bounds.min[0]) * scale;
  const top = at.y;
  const bottom = at.y + (d.bounds.max[1] - d.bounds.min[1]) * scale;
  const X = (r: number) => map([r, 0])[0];
  const Y = (u: number) => map([0, u])[1];
  const hDim = (line: DimLine, y: number, edge: number) => (
    <g key={`h${y}${line.from}`}>
      <line className="plan-ext" x1={X(line.from)} y1={edge} x2={X(line.from)} y2={y + (y > edge ? TICK : -TICK)} />
      <line className="plan-ext" x1={X(line.to)} y1={edge} x2={X(line.to)} y2={y + (y > edge ? TICK : -TICK)} />
      <Dim a={[X(line.from), y]} b={[X(line.to), y]} label={line.label} vertical={false} />
    </g>
  );
  const vDim = (line: DimLine, x: number, edge: number) => (
    <g key={`v${x}${line.from}`}>
      <line className="plan-ext" x1={edge} y1={Y(line.from)} x2={x + (x > edge ? TICK : -TICK)} y2={Y(line.from)} />
      <line className="plan-ext" x1={edge} y1={Y(line.to)} x2={x + (x > edge ? TICK : -TICK)} y2={Y(line.to)} />
      <Dim a={[x, Y(line.from)]} b={[x, Y(line.to)]} label={line.label} vertical />
    </g>
  );
  return (
    <g>
      <Lines d={d} map={map} hidden />
      {h.overall && hDim(h.overall, bottom + DIM_BAND / 2, bottom)}
      {h.chain.map((c) => hDim(c, top - DIM_BAND / 2, top))}
      {v.overall && vDim(v.overall, right + DIM_BAND / 2, right)}
      {v.chain.map((c) => vDim(c, left - DIM_BAND / 2, left))}
    </g>
  );
}

/** Front, side and plan of `parts`, third-angle, one scale, dimensioned (spec §5.2), and, when `keyed`, the features of
 *  those parts as lettered tags with a key list (feature callouts spec §4). Memoised on its props (fu 263): a tick of the
 *  sheet's Explode slider re-renders the sheet, never these — so `keyed` must be a stable set. */
export const PlanTrio = memo(function PlanTrio({ parts, units, label, keyed }: {
  parts: readonly Board[]; units: Units; label: string; keyed?: ReadonlySet<string>;
}) {
  const views = useMemo(() => [FRONT, SIDE, TOP].map((view: View) => ({
    view, d: drawView(parts, view), dims: dimensionView(parts, view, units),
  })), [parts, units]);
  const [front, side, top] = views as [typeof views[0], typeof views[0], typeof views[0]];
  const lay = layoutTrio(front.d.bounds, side.d.bounds, top.d.bounds);
  const notes: string[] = [];
  const draw = (x: typeof front, at: Placement) => {
    const h = fitChain(x.dims.horizontal, lay.scale);
    const v = fitChain(x.dims.vertical, lay.scale);
    for (const n of [h.note, v.note]) if (n) notes.push(`${x.view.title}: ${n}`);
    return <Elevation key={x.view.title} d={x.d} at={at} scale={lay.scale}
      h={{ overall: x.dims.horizontal.overall, chain: h.chain }}
      v={{ overall: x.dims.vertical.overall, chain: v.chain }} />;
  };
  const drawn = [draw(top, lay.top), draw(front, lay.front), draw(side, lay.side)];
  const features = useMemo(() => (keyed ? parts.filter((b) => keyed.has(b.id)).flatMap((b) => partFeatures(b, units)) : []), [parts, units, keyed]);
  // `lay` is a pure function of `views`.
  const keys = useMemo(() => planKeys(features,
    [{ view: TOP, d: top.d, at: lay.top }, { view: FRONT, d: front.d, at: lay.front }, { view: SIDE, d: side.d, at: lay.side }],
    lay.scale, lay), [features, views]); // eslint-disable-line react-hooks/exhaustive-deps
  if (keys.notShown.length > 0) notes.push(`Not shown in these views: ${keys.notShown.join('; ')}.`);
  if (keys.unkeyed.length > 0) notes.push(`Not keyed (no room): ${keys.unkeyed.join(', ')}.`);
  return (
    <figure className="plans-figure-wrap">
      <svg className="plans-figure" viewBox={`0 0 ${lay.width} ${lay.height}`} style={pageWidth(lay.width)} fontSize={LABEL_SIZE}
        role="img" aria-label={`${label}: front, side and plan`}>
        {drawn}
        {keys.tags.map((t, n) => <KeyMark key={n} t={t} r={keys.radius} />)}
      </svg>
      {keys.lines.length > 0 && (
        <ul className="plans-key">
          {keys.lines.map((l) => <li key={l.letter}><span className="plans-key-letter">{l.letter}</span> {l.shown}</li>)}
        </ul>
      )}
      {notes.length > 0 && <ul className="plans-notes">{notes.map((n) => <li key={n}>{n}</li>)}</ul>}
    </figure>
  );
});

/** One balloon (plans balloons spec §3.3): a leader level from the circle's edge to its elbow, then to the anchor
 *  (`PlacedBalloon`); a dot on the anchor; the circle; the number. */
function Balloon({ b, r }: { b: PlacedBalloon; r: number }) {
  const sx = b.centre[0] + Math.sign(b.elbow[0] - b.centre[0]) * r;
  return (
    <g className="plans-balloon" data-number={b.number}>
      <path className="plans-leader" d={`M${sx} ${b.centre[1]}L${b.elbow[0]} ${b.elbow[1]}L${b.anchor[0]} ${b.anchor[1]}`} />
      <circle className="plans-leader-dot" cx={b.anchor[0]} cy={b.anchor[1]} r={DOT_R} />
      <circle className="plans-balloon-ring" cx={b.centre[0]} cy={b.centre[1]} r={r} />
      <text x={b.centre[0]} y={b.centre[1] + (LABEL_ASCENT - LABEL_DESCENT) / 2} textAnchor="middle">{b.number}</text>
    </g>
  );
}

/** The isometric exploded view, visible lines only (spec §5.2 item 1; drawn without hidden lines, fu 344). Memoised on its
 *  props (fu 263): the sheet passes it a DEFERRED amount, so the slider's urgent render leaves it alone. One numbered
 *  balloon per cut-list row, in columns beside the drawing (plans balloons spec §3–4). */
export const ExplodedFigure = memo(function ExplodedFigure({ doc, amount }: { doc: SloydDocument; amount: number }) {
  const d = useMemo(() => drawView(worldParts(doc), ISO, explodeOffsets(doc, amount), { hiddenLines: false }), [doc, amount]);
  // The cut list's own numbering (plans balloons spec §2): the sheet and the cut list cannot disagree.
  const rows = useMemo(() => buildCutList(flatDocument(doc)).groups.flatMap((g) => g.rows), [doc]);
  const plan = useMemo(() => anchorsFor(d, rows), [d, rows]);
  const lay = useMemo(() => layoutBalloons(d, plan), [d, plan]);
  const notes: string[] = [];
  if (plan.hidden.length > 0) notes.push(`Not visible in this view: ${numberList(plan.hidden)}.`);
  if (lay.unplaced.length > 0) notes.push(`Not ballooned (no room): ${numberList(lay.unplaced)}.`);
  return (
    <figure className="plans-figure-wrap">
      <svg className="plans-figure" viewBox={`0 0 ${lay.width} ${lay.height}`} style={pageWidth(lay.width)} role="img"
        aria-label="Exploded view" data-amount={amount} {...(lay.placed.length > 0 ? { fontSize: LABEL_SIZE } : {})}>
        <Lines d={d} map={toSvg(d, lay.at, lay.scale)} hidden={false} />
        {lay.placed.map((b) => <Balloon key={b.number} b={b} r={lay.radius} />)}
      </svg>
      {notes.length > 0 && <ul className="plans-notes">{notes.map((n) => <li key={n}>{n}</li>)}</ul>}
    </figure>
  );
});
