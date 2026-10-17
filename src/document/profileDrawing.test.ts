// Edge profiles on the Plans sheet (final review F1): every model edge of a curved part is drawn visible exactly when an
// independent ray test says nothing hides it (`oracleHidden`: the part's closed bodies at 1e-9, no DRAW_EPS growth, no
// lift) — so a silhouette whose facing face meets the view at a shallow angle (a thumbnail's crisp line in the
// isometric: n.toward ~0.18) must read visible, and a crease behind its own wood (a bead's quirk, a cove's inner
// corner, seen from the far side) must stay hidden.
import { describe, expect, it } from 'vitest';
import { createBoard, defaultProfile, PROFILE_EDGES, PROFILE_KINDS, partGeometry } from './document';
import { cornerCurve, defaultArch, defaultBow, defaultCorners, defaultNotch } from './curves';
import type { Board } from './types';
import { curveDrawEdges } from './curveDrawing';
import { drawView, FRONT, ISO, SIDE, TOP, type View } from './drawing';
import { toWorld } from './snapPoints';

type V3 = [number, number, number];
const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];

/** The oracle: is board-local point x, on an edge of `b`, hidden in `view`? The ray x + s.toward against each of the
 *  part's convex bodies (world space, closed within 1e-9 — grazing other wood hides, as on the sheet), from s = 1e-7:
 *  hidden when it runs inside one for more than 1e-6. The edge's own faces cannot hide it: the ray leaves a face that
 *  meets the view at n.toward within ~1e-9 / n.toward of its start. No lift, no DRAW_EPS growth. */
function oracleHidden(b: Board, x: V3, view: View): boolean {
  const W = (p: readonly number[]) => toWorld(b, { length: p[0]!, width: p[1]!, thickness: p[2]! }) as V3;
  const o = W([0, 0, 0]);
  const t = view.toward;
  const P = W(x);
  for (const body of partGeometry(b).bodies) {
    let lo = 1e-7;
    let hi = 1e3;
    for (const f of body.faces) {
      const n = sub(W(f.n), o);
      const v0 = W(f.verts[0]!);
      const f0 = dot(n, sub(P, v0)) - 1e-9; // inside: n.(y - v0) <= 1e-9
      const ft = dot(n, t);
      if (Math.abs(ft) <= 1e-12) { if (f0 > 0) { lo = 1; hi = 0; break; } continue; }
      const s = -f0 / ft;
      if (ft > 0) hi = Math.min(hi, s); else lo = Math.max(lo, s);
      if (lo > hi) break;
    }
    if (hi - lo > 1e-6) return true;
  }
  return false;
}

const dist2 = (p: readonly number[], a: readonly number[], b: readonly number[]) => {
  const dx = b[0]! - a[0]!;
  const dy = b[1]! - a[1]!;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0]! - a[0]!) * dx + (p[1]! - a[1]!) * dy) / l2));
  return Math.hypot(p[0]! - a[0]! - t * dx, p[1]! - a[1]! - t * dy);
};

/** Every model edge of `b` in `view`, sampled once: the drawn verdict (or 'ambiguous' where a coincident line is drawn
 *  the other way) against the oracle's. */
function mismatches(b: Board, view: View): string[] {
  const d = drawView([b], view);
  const proj = (p: readonly number[]) => [dot(p, view.right), dot(p, view.up)];
  const W = (p: readonly number[]) => toWorld(b, { length: p[0]!, width: p[1]!, thickness: p[2]! });
  const out: string[] = [];
  for (const e of curveDrawEdges(b)) {
    const pa = proj(W(e.p));
    const pe = proj(W(e.q));
    if (Math.hypot(pe[0]! - pa[0]!, pe[1]! - pa[1]!) < 1e-4) continue; // along the view: a point on screen
    // The sample: the chord's midpoint, or on a fine path its middle node (drawn exactly), at that node's chord parameter.
    const n = e.path ? e.path.pts.length : 0;
    const i = n >= 3 ? Math.floor(n / 2) : -1;
    const at = i >= 0 ? e.path!.at[i]! : 0.5;
    const drawnAt = i >= 0 ? e.path!.pts[i]! : e.p.map((v, k) => v + 0.5 * (e.q[k]! - v));
    const onChord = e.p.map((v, k) => v + at * (e.q[k]! - v)) as V3;
    const sp = proj(W(drawnAt));
    const onVis = d.visible.some((s) => dist2(sp, s.a, s.b) <= 1e-7);
    const onHid = d.hidden.some((s) => dist2(sp, s.a, s.b) <= 1e-7);
    if (onVis && onHid) continue; // a coincident line drawn the other way: no verdict to read
    const hidden = oracleHidden(b, onChord, view);
    COUNT.checked += 1;
    if (hidden) COUNT.hidden += 1;
    if (!onVis && !onHid) out.push(`${view.title} ${JSON.stringify(e.p)}→${JSON.stringify(e.q)}: not drawn`);
    else if (onHid !== hidden) out.push(`${view.title} ${JSON.stringify(e.p)}→${JSON.stringify(e.q)}: drawn ${onHid ? 'hidden' : 'visible'}, oracle ${hidden ? 'hidden' : 'visible'}`);
  }
  return out;
}

/** Verdicts read, and how many of them hidden: each sweep asserts it exercised both. */
const COUNT = { checked: 0, hidden: 0 };
const VIEWS = [ISO, FRONT, SIDE, TOP];
const S = { length: 30, width: 10, thickness: 0.75 };

describe('a profiled part draws every unhidden edge visible (F1)', () => {
  it('the shelf fixture: a thumbnail on the width-min top edge keeps its crisp line visible in the isometric', () => {
    const b = createBoard({ id: 'shelf', ...S, curves: [{ id: 't', ...defaultProfile(S, 'thumbnail', { through: 'length', uFrom: 'min', vFrom: 'max' }) }] });
    expect(mismatches(b, ISO)).toEqual([]);
    // The far outline is whole: as much visible length as the part with no profile, less what the thumbnail takes.
    const len = (ss: { a: number[]; b: number[] }[]) => ss.reduce((s, x) => s + Math.hypot(x.b[0]! - x.a[0]!, x.b[1]! - x.a[1]!), 0);
    expect(len(drawView([b], ISO).visible)).toBeGreaterThan(95);
  });
  it('every kind, on each of the 8 edges, either facing, in all four views', { timeout: 60_000 }, () => {
    Object.assign(COUNT, { checked: 0, hidden: 0 });
    const bad: string[] = [];
    for (const kind of PROFILE_KINDS) {
      for (const edge of PROFILE_EDGES) {
        for (const facing of ['v', 'u'] as const) {
          const b = createBoard({ id: 'p', ...S, curves: [{ id: 'c', ...defaultProfile(S, kind, edge, facing) }] });
          for (const view of VIEWS) for (const m of mismatches(b, view)) bad.push(`${kind} ${edge.through} ${edge.uFrom}/${edge.vFrom} ${facing}: ${m}`);
        }
      }
    }
    expect(bad).toEqual([]);
    // Both verdicts exercised (measured: ~1,400 read, ~400 hidden), not a sweep that skipped everything.
    expect(COUNT.checked).toBeGreaterThan(1000);
    expect(COUNT.hidden).toBeGreaterThan(200);
  });
  it('a four-edge set and two axes on one part (corners where profiles meet), in all four views', { timeout: 60_000 }, () => {
    const bad: string[] = [];
    for (const kind of PROFILE_KINDS) {
      const curves = PROFILE_EDGES.filter((e) => e.vFrom === 'max').map((e, i) => ({ id: `e${i}`, ...defaultProfile(S, kind, e) }));
      const b = createBoard({ id: 'p', ...S, curves });
      for (const view of VIEWS) for (const m of mismatches(b, view)) bad.push(`${kind} four: ${m}`);
    }
    expect(bad).toEqual([]);
  });
  // The Curves presets go through the same lift (curveEdgeLifts reads every curve): pinned by the same oracle.
  it('the Curves presets (arch, notch, bow, four corners, an arch with its edge rounded through the length)', { timeout: 60_000 }, () => {
    const apron = { length: 30, width: 5, thickness: 0.75 };
    const sets: [string, Board][] = [
      ['arch', createBoard({ id: 'p', ...apron, curves: [{ id: 'a', ...defaultArch(apron)! }] })],
      ['notch', createBoard({ id: 'p', ...apron, curves: [{ id: 'n', ...defaultNotch(apron)! }] })],
      ['bow', createBoard({ id: 'p', ...apron, curves: [{ id: 'b', ...defaultBow(apron) }] })],
      ['corners', createBoard({ id: 'p', ...S, curves: defaultCorners(S).map((c, i) => ({ id: `k${i}`, ...c })) })],
      ['two axes', createBoard({ id: 'p', ...apron, curves: [{ id: 'a', ...defaultArch(apron)! },
        { id: 'y', ...cornerCurve({ through: 'length', uFrom: 'min', vFrom: 'max', radius: 0.5 }) }] })],
    ];
    const bad: string[] = [];
    for (const [name, b] of sets) for (const view of VIEWS) for (const m of mismatches(b, view)) bad.push(`${name}: ${m}`);
    expect(bad).toEqual([]);
  });
});
