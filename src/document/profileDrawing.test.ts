// Edge profiles on the Plans sheet (final review F1): every model edge of a curved part is drawn visible exactly when an
// independent ray test says nothing hides it (`oracleHidden`: the part's closed bodies at 1e-9, no DRAW_EPS growth, no
// lift) — so a silhouette whose facing face meets the view at a shallow angle (a thumbnail's crisp line in the
// isometric: n.toward ~0.18) must read visible, and a crease behind its own wood (a bead's quirk, a cove's inner
// corner, seen from the far side) must stay hidden.
import { describe, expect, it } from 'vitest';
import { createBoard, defaultProfile, PROFILE_EDGES, PROFILE_KINDS, partGeometry } from './document';
import { cornerCurve, defaultArch, defaultBow, defaultCorners, defaultNotch } from './curves';
import type { Board, CutFrom, ProfileCut, ProfileEnd, ProfileKind } from './types';
import { curveDrawEdges, runoutSilhouettes, silhouetteLines } from './curveDrawing';
import { canonicalRun } from './profiles';
import { featureTag } from './featureKeys';
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
  return oracleHiddenWorld(b, toWorld(b, { length: x[0], width: x[1], thickness: x[2] }) as V3, view);
}
/** The same oracle for a WORLD point (a silhouette's, profile runs a2 Task 7). */
function oracleHiddenWorld(b: Board, P: V3, view: View): boolean {
  const W = (p: readonly number[]) => toWorld(b, { length: p[0]!, width: p[1]!, thickness: p[2]! }) as V3;
  const o = W([0, 0, 0]);
  const t = view.toward;
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
  // Profile runs a2 (Task 7): every run-out silhouette's midpoint, against the same oracle. None on a part with no stop.
  for (const s of runoutSilhouettes(b, view.toward)) {
    const pa = proj(s.A);
    const pe = proj(s.E);
    if (Math.hypot(pe[0]! - pa[0]!, pe[1]! - pa[1]!) < 1e-4) continue;
    const mid = s.A.map((v, k) => (v + s.E[k]!) / 2) as V3;
    const sp = proj(mid);
    const onVis = d.visible.some((x) => dist2(sp, x.a, x.b) <= 1e-7);
    const onHid = d.hidden.some((x) => dist2(sp, x.a, x.b) <= 1e-7);
    if (onVis && onHid) continue;
    const hidden = oracleHiddenWorld(b, mid, view);
    COUNT.checked += 1;
    COUNT.silhouettes += 1;
    if (hidden) COUNT.hidden += 1; else COUNT.visibleSilhouettes += 1;
    if (!onVis && !onHid) out.push(`${view.title} silhouette ${JSON.stringify(s.A)}→${JSON.stringify(s.E)}: not drawn`);
    else if (onHid !== hidden) out.push(`${view.title} silhouette ${JSON.stringify(s.A)}→${JSON.stringify(s.E)}: drawn ${onHid ? 'hidden' : 'visible'}, oracle ${hidden ? 'hidden' : 'visible'}`);
  }
  return out;
}

/** Verdicts read, and how many of them hidden: each sweep asserts it exercised both. */
const COUNT = { checked: 0, hidden: 0, silhouettes: 0, visibleSilhouettes: 0 };
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
    Object.assign(COUNT, { checked: 0, hidden: 0, silhouettes: 0, visibleSilhouettes: 0 });
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

// Profile runs a2 (Task 7): a STOPPED profile on the Plans sheet. The band's silhouettes run over the band only; the
// run-out's outline is the chain of facet edges whose two smooth faces turn opposite ways to the view (runoutSilhouettes),
// and every drawn line (model edges and those silhouettes) agrees with the oracle.
describe('a stopped profile on the Plans sheet (profile runs a2)', () => {
  const SIZES: Record<'roundover' | 'cove' | 'ogee' | 'thumbnail', { size: number; fillet?: number; depth?: number }> = {
    roundover: { size: 0.25, fillet: 0 }, cove: { size: 0.375, fillet: 0 }, ogee: { size: 0.5, fillet: 0 }, thumbnail: { size: 0.75, depth: 0.25 },
  };
  /** The shelf's width-max top edge, profiled from `lo` along the length to `hi` from the max end (null: out through that end). */
  const shelf = (kind: keyof typeof SIZES, lo: number | null, hi: number | null, from: CutFrom = 'max', face: CutFrom = 'max'): Board => {
    const side = { across: 'width' as const, from };
    const start: ProfileEnd = lo === null ? { side, through: 'min' } : { side, from: 'min', at: lo };
    const end: ProfileEnd = hi === null ? { side: { ...side }, through: 'max' } : { side: { ...side }, from: 'max', at: hi };
    const z = SIZES[kind];
    const p: ProfileCut = {
      id: 'p', face, kind: kind as ProfileKind, size: z.size, ...(z.depth !== undefined ? { depth: z.depth } : {}),
      ...(kind === 'thumbnail' ? {} : { fillet: z.fillet ?? 0 }), facing: 'face', run: canonicalRun(S, face, { start, end }),
    };
    return createBoard({ id: 'shelf', ...S, profiles: [p] });
  };
  const CASES: [string, Board][] = [
    ['roundover 3..27', shelf('roundover', 3, 3)], ['cove 3..27', shelf('cove', 3, 3)], ['ogee 3..27', shelf('ogee', 3, 3)],
    ['thumbnail 3..27', shelf('thumbnail', 3, 3)], ['roundover through min..20', shelf('roundover', null, 10)],
    // Run-outs that turn from the isometric with their outline in plain sight (the width-max top edge's are hidden by the
    // corner): the width-min top edge's roundover and the width-max bottom edge's ogee.
    ['roundover 3..27, width-min top', shelf('roundover', 3, 3, 'min', 'max')], ['ogee 3..27, width-max bottom', shelf('ogee', 3, 3, 'max', 'min')],
  ];
  it('every model edge and every run-out silhouette agrees with the ray oracle, in all four views', { timeout: 120_000 }, () => {
    Object.assign(COUNT, { checked: 0, hidden: 0, silhouettes: 0, visibleSilhouettes: 0 });
    const bad: string[] = [];
    for (const [name, b] of CASES) for (const view of VIEWS) for (const m of mismatches(b, view)) bad.push(`${name}: ${m}`);
    expect(bad).toEqual([]);
    // The sweep read silhouettes — some of them in plain sight, where the lift decides — and both verdicts.
    expect(COUNT.silhouettes).toBeGreaterThan(20);
    expect(COUNT.visibleSilhouettes).toBeGreaterThan(5);
    expect(COUNT.hidden).toBeGreaterThan(20);
    expect(COUNT.checked - COUNT.hidden).toBeGreaterThan(20);
  });
  // The shelf is flat at turn 0 at the origin: world X is the length (the run), and both FRONT's and the Plan's screen x.
  const round = shelf('roundover', 3, 3);
  for (const view of [FRONT, TOP]) {
    it(`no silhouette past a stop (${view.title}): the band's runs over 3..27, and nothing of the profile is drawn beyond the run-outs`, () => {
      const band = silhouetteLines(round, view.toward);
      expect(band.length).toBeGreaterThan(0);
      const xs = band.flatMap((s) => [s.A[0], s.E[0]]);
      expect(Math.min(...xs)).toBeCloseTo(3, 6);
      expect(Math.max(...xs)).toBeCloseTo(27, 6);
      const d = drawView([round], view);
      const tag = featureTag('shelf', 'curve', 'p');
      const tagged = [...d.visible, ...d.hidden].filter((s) => s.feature === tag);
      expect(tagged.length).toBeGreaterThan(0);
      // The run-outs reach BEARING + 1/4 = 0.5 past each station; beyond that the corner is whole.
      expect(tagged.filter((s) => [s.a[0], s.b[0]].some((x) => x < 3 - 0.5 - 1e-9 || x > 27 + 0.5 + 1e-9))).toEqual([]);
    });
  }
  it('a run-out draws its outline where its facets turn from the view', () => {
    // The roundover's run-out turns from the SIDE view (looking along the run), and the band's silhouettes are points there.
    const s = runoutSilhouettes(round, SIDE.toward);
    expect(s.length).toBeGreaterThan(0);
    expect(s.every((x) => x.curve === 'p')).toBe(true);
    // Each lies past a station, on the run-out (within its reach).
    expect(s.every((x) => [x.A[0], x.E[0]].every((r) => (r >= 2.5 - 1e-9 && r <= 3 + 1e-9) || (r >= 27 - 1e-9 && r <= 27.5 + 1e-9)))).toBe(true);
    // In the isometric every face of the roundover's run-outs faces the viewer (measured: n.toward >= 0.408), so none is
    // drawn there; the cove's concave run-out turns away and draws its outline.
    expect(runoutSilhouettes(round, ISO.toward)).toEqual([]);
    expect(runoutSilhouettes(shelf('cove', 3, 3), ISO.toward).length).toBeGreaterThan(0);
  });
});
