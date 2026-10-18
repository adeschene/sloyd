import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { boardBodies, boardEdges, curvedEdges, type SmoothJoin } from './bodies';
import { createBoard, mirrorPart, defaultHingeCup, chamferCut, archCurve } from './document';
import { geometryBoard, profileFaults } from './profiles';
import { builtSwept, keptSection } from './sweep';
import { builtPath, profilePath } from './profilePath';
import type { Segment } from './cuts';
import { apronArch, endToEnd, frontOnly, loop, notchEdge, plainLoop, stopped, straightTopLong, topCorners } from './sweepFixtures';
import type { Board } from './types';

/*
 * A swept profile's EDGE LINES (profile runs b1, Task 6; spec §5 Lines, invariant 16). Every count below is derived by hand
 * from the fixture's chords (curves.ts' arcChords at CURVE_TOLERANCE 0.005"): a quarter arc of radius r takes
 * ceil((π/2) / (2·acos(1 − 0.005/r))) chords — 12 at r = 2, 6 at r = 1/2, 4 at r = 1/4 (the roundover's own arc), 6 at
 * r = 3/8 (the cove's). The arch of the apron (span 24, rise 1.25) takes 16.
 */
type P = [number, number, number];
const pts = (s: Segment): [P, P] => [[s[0].length, s[0].width, s[0].thickness], [s[1].length, s[1].width, s[1].thickness]];
const at = (z: number) => (s: Segment) => Math.abs(s[0].thickness - z) <= 1e-9 && Math.abs(s[1].thickness - z) <= 1e-9;

/** True when the segments form ONE closed chain: every endpoint shared by exactly two segments, all connected. */
function oneLoop(segs: readonly Segment[]): boolean {
  const key = (p: P) => p.map((x) => Math.round(x * 1e7)).join(',');
  const deg = new Map<string, string[]>();
  for (const s of segs) {
    const [a, b] = pts(s).map(key) as [string, string];
    deg.set(a, [...(deg.get(a) ?? []), b]);
    deg.set(b, [...(deg.get(b) ?? []), a]);
  }
  if ([...deg.values()].some((v) => v.length !== 2)) return false;
  const seen = new Set<string>();
  const stack = [deg.keys().next().value!];
  while (stack.length) { const k = stack.pop()!; if (seen.has(k)) continue; seen.add(k); stack.push(...deg.get(k)!); }
  return seen.size === deg.size;
}

describe('chunk 1 first: a straight roundover draws no line at either tangent (invariant 16)', () => {
  // The brief's Step 1 expected "the crease where the roundover meets the top face" and "the vertical side's top edge below
  // the profile". Chunk 1 draws neither: both are TANGENT joins (curveOutline's smooth flags). A swept band matches it.
  it('End to end on a plain 30 × 10 top: the two end-face outlines and the three plain long edges, 19 segments', () => {
    const board = createBoard({ length: 30, width: 10, thickness: 0.75, profiles: [straightTopLong] });
    const e = boardEdges(board);
    // Each end face: the side's 1/2" below the profile, 4 arc chords, the top to the reach, the far vertical, the bottom (8).
    expect(e).toHaveLength(19);
    const along = e.filter((s) => Math.abs(s[0].length - s[1].length) > 1e-9);
    expect(along).toHaveLength(3);
    // None at the top tangent (width 9.75, top) nor at the side tangent (width 10, thickness 1/2).
    for (const s of along) expect([s[0].width, s[0].thickness]).not.toEqual([9.75, 0.75]);
    for (const s of along) expect([s[0].width, s[0].thickness]).not.toEqual([10, 0.5]);
  });
});

describe('a swept profile\'s lines (spec §5): sharp section vertices along the path, mitres at sharp path vertices', () => {
  it('a roundover all round the 2" corner top: ONLY the bottom outline, one closed chain of 4 + 4 × 12 = 52', () => {
    // Every section vertex of a roundover is smooth (both junctions tangent, its chord vertices on the arc), and every path
    // vertex is smooth (the corners' chord vertices, the tangent joins): nothing along the band, nothing across it. Below
    // the profile the corner arcs' vertical facet lines are smooth too (chunk 1). The bottom face's outline is all that is
    // left: the 4 straight sides and 12 chords per corner.
    const e = boardEdges(topCorners(2));
    expect(e).toHaveLength(52);
    expect(e.every(at(0))).toBe(true);
    expect(oneLoop(e)).toBe(true);
  });
  it('the 1/2" corner top: 4 + 4 × 6 = 28, the bottom outline only', () => {
    const e = boardEdges(topCorners(0.5));
    expect(e).toHaveLength(28);
    expect(e.every(at(0))).toBe(true);
    expect(oneLoop(e)).toBe(true);
  });
  it('a loop on a plain rectangle: the bottom (4), each sharp corner\'s side below the profile (4) and its mitre (4 × 4 chords) = 24', () => {
    const e = boardEdges(plainLoop);
    expect(e).toHaveLength(24);
    expect(e.filter(at(0))).toHaveLength(4);
    // The mitre: from the side's top (thickness 1/2) to the top's reach (3/4), on the corner's bisector.
    const mitre = e.filter((s) => s[0].thickness >= 0.5 - 1e-9 && s[1].thickness >= 0.5 - 1e-9 && !at(0.5)(s));
    expect(mitre).toHaveLength(16);
    for (const s of mitre) for (const q of s) {
      const dx = Math.min(q.length, 30 - q.length), dy = Math.min(q.width, 10 - q.width);
      expect(Math.abs(dx - dy)).toBeLessThanOrEqual(1e-9);
    }
  });
  it('a cove all round the 2" top: the bottom, and BOTH sharp junctions along the whole path: 3 × 52 = 156', () => {
    // A cove's section is sharp where it meets the broad face (the reach, 3/8" in) and the side (3/8" down); its 6 arc
    // chords meet smoothly.
    const e = boardEdges(topCorners(2, loop('p1', 0.375, 'cove')));
    expect(e).toHaveLength(156);
    const top = e.filter(at(0.75)), side = e.filter(at(0.375)), bottom = e.filter(at(0));
    expect([top.length, side.length, bottom.length]).toEqual([52, 52, 52]);
    for (const chain of [top, side, bottom]) expect(oneLoop(chain)).toBe(true);
  });
  it('the arched apron (End to end, through ends): 46 — end faces, the arch\'s two SHARP ends\' mitres, the bottom, the back', () => {
    // The brief called the arch's ends tangent: they are not (an arch of rise 1.25 on a span of 24 meets its edge at ~11.9°;
    // curveOutline's flag is false), so each draws a mitre: the side below the profile and the 4 section chords (5 each).
    // Each END face (through ends) draws the section where the band leaves it: the side below (1), the 4 chords, the top
    // from the reach to the back, the back's vertical (7 each). The bottom outline: 3 + 16 + 2 straight runs (21); the
    // back's top edge (1). No line at the reach on the top, none at the side's tangent, none across the arch's chords.
    const e = boardEdges(apronArch);
    expect(e).toHaveLength(46);
    expect(e.filter(at(0))).toHaveLength(21);
    const mitreAt = (x: number) => e.filter((s) => Math.abs(s[0].length - x) < 0.03 && Math.abs(s[1].length - x) < 0.03 && !at(0)(s));
    expect(mitreAt(3)).toHaveLength(5);
    expect(mitreAt(27)).toHaveLength(5);
    const endFace = (x: number) => e.filter((s) => s[0].length === x && s[1].length === x && !at(0)(s));
    expect(endFace(0)).toHaveLength(7);
    expect(endFace(30)).toHaveLength(7);
    expect(e.filter(at(0.75)).filter((s) => s[0].width < 5 - 1e-9 || s[1].width < 5 - 1e-9).every((s) => s[0].length === s[1].length)).toBe(true);
  });
  it('the front End to end with B1 run-outs: no line at the reach along the band; the rest of the top\'s outline drawn', () => {
    const e = boardEdges(frontOnly);
    const top = e.filter(at(0.75));
    // Along the band (the front, and round both corners to the stations at width 2): nothing on the top.
    expect(top.filter((s) => s[0].width < 2 - 1e-6 && s[1].width < 2 - 1e-6)).toEqual([]);
    // The back (1 straight + 2 × 12 corner chords) and the two sides' top edges past the run-outs are drawn.
    expect(top.filter((s) => s[0].width > 18 - 1e-9 && s[1].width > 18 - 1e-9 && s[0].width + s[1].width > 36)).toHaveLength(25);
    expect(e.filter(at(0))).toHaveLength(52);
  });
  it('the run-outs (B1) join the band and each other by a2\'s rule: inside them no line; their outline on the faces drawn', () => {
    const e = boardEdges(frontOnly);
    // The run-out past the station on the length-min side — at width 2 + ε (the tangent point plus the extension, below):
    // the cutter (bearing 1/4" outside the side, reach 1/4") reaches √(0.5² − 0.25²) = 0.433 past it on the top.
    const y0 = 2 + 2 * 0.25 * Math.tan(Math.PI / 96), y1 = y0 + Math.sqrt(0.5 ** 2 - 0.25 ** 2);
    const inside = (q: Segment[0]) => q.width > y0 + 1e-6 && q.width < y1 - 1e-6 && q.length > 1e-9 && q.thickness < 0.75 - 1e-9;
    expect(e.filter((s) => s[0].length < 1 && inside(s[0]) && inside(s[1]))).toEqual([]);
    // Its outline on the top (4 sector chords) and on the side face (7: its sectors meeting the side), each station.
    const inRun = (s: Segment) => Math.min(s[0].width, s[1].width) >= y0 - 1e-9 && Math.max(s[0].width, s[1].width) <= y1 + 1e-9;
    expect(e.filter((s) => at(0.75)(s) && s[0].length < 0.3 && inRun(s) && s[0].width + s[1].width > 2 * y0 + 1e-9)).toHaveLength(4);
    expect(e.filter((s) => s[0].length === 0 && s[1].length === 0 && inRun(s))).toHaveLength(7);
  });
  it('fillets: a junction or shoulder they make is sharp (a crease); a fillet the arc runs into tangentially draws nothing', () => {
    // Cove 3/8" + 1/16" fillet: the reach and the fillet's shoulder at the side are sharp, the cove meets its fillet
    // tangentially (a horizontal section face: stage 1 must not union it, or its tangent line would be drawn): 3 × 52.
    expect(boardEdges(topCorners(2, { ...loop('p1', 0.375, 'cove'), fillet: 1 / 16 }))).toHaveLength(156);
    // Roundover 1/4" + 1/16" fillet: tangent at the reach, the fillet's two corners sharp: 3 × 52.
    expect(boardEdges(topCorners(2, { ...loop('p1'), fillet: 1 / 16 }))).toHaveLength(156);
    // Thumbnail 3/4" × 1/4": tangent at the reach, its step into the side sharp: 2 × 52.
    expect(boardEdges(topCorners(2, loop('p1', 0.75, 'thumbnail')))).toHaveLength(104);
  });
  it('a bead all round the 2" top: its quirk WALL draws no facet lines (fix round 1) — 3 × 52 = 156', () => {
    // Bead 1/4" with a 1/16" quirk: the section's junction at the reach (5/16" in) and the quirk's floor corner are sharp, the
    // floor meets the bead's arc tangentially, the arc meets the side tangentially: the bottom outline, the reach crease on the
    // top and the quirk's inner crease at 1/16" down, each 4 + 4 × 12. The quirk wall (5/16" in, from the top to 1/16" down)
    // is a swept face: nothing across it at the path's chord vertices (it drew 52 facet lines before).
    for (const face of ['max', 'min'] as const) {
      const b = topCorners(2, loop('p1', 0.25, 'bead', face));
      const e = boardEdges(b);
      const [top, quirk, bottom] = face === 'max' ? [0.75, 0.6875, 0] : [0, 0.0625, 0.75];
      expect(e, face).toHaveLength(156);
      for (const z of [top, quirk, bottom]) { expect(e.filter(at(z)), `${face} ${z}`).toHaveLength(52); expect(oneLoop(e.filter(at(z)))).toBe(true); }
      // The wall is its own section face, one per path segment, tagged as the section's first edge.
      const walls = boardBodies(b).flatMap((x) => x.faces).filter((f) => f.profileEdge === 'p1:1:1' && f.sweep !== undefined);
      expect(new Set(walls.map((f) => f.sweep)).size).toBe(52);
      for (const f of walls) for (const v of f.verts) {
        const t = face === 'max' ? 0.75 - v[2] : v[2];
        expect(t).toBeGreaterThanOrEqual(-1e-9);
        expect(t).toBeLessThanOrEqual(0.0625 + 1e-9);   // never the seam below the quirk
      }
    }
  });
  it('the notch (End to end, a half-round notch): its ends meet the edge square (sharp: mitres); across the notch\'s chords nothing', () => {
    const e = boardEdges(notchEdge);
    const mitreAt = (x: number) => e.filter((s) => Math.abs(s[0].length - x) < 0.05 && Math.abs(s[1].length - x) < 0.05 && !at(0)(s) && s[0].width < 1);
    expect(mitreAt(14).length).toBeGreaterThan(0);
    expect(mitreAt(16).length).toBeGreaterThan(0);
    expect(e.filter((s) => s[0].length > 14.1 && s[0].length < 15.9 && s[1].length > 14.1 && s[1].length < 15.9 && !at(0)(s) && !at(0.75)(s))).toEqual([]);
  });
});

describe('the swept rule\'s joins (Task 7 reads them): every suppressed stretch, with its two faces', () => {
  it('a roundover loop pushes joins between section faces and at the tangents, each naming the profile', () => {
    const board = topCorners(2);
    const joins: SmoothJoin[] = [];
    curvedEdges(board, boardBodies(board), joins);
    expect(joins.length).toBeGreaterThan(0);
    for (const j of joins) expect([j.f1.profileEdge, j.f2.profileEdge].some((x) => x?.startsWith('p1:'))).toBe(true);
    // Both kinds: two section faces (along the path, across a smooth path vertex) and a section face against a part face.
    expect(joins.some((j) => j.f1.sweep !== undefined && j.f2.sweep !== undefined)).toBe(true);
    expect(joins.some((j) => (j.f1.sweep === undefined) !== (j.f2.sweep === undefined))).toBe(true);
  });
  it('a part with no swept profile pushes none it did not before (the chunk 1 straight roundover: none)', () => {
    const board = createBoard({ length: 30, width: 10, thickness: 0.75, profiles: [straightTopLong] });
    const joins: SmoothJoin[] = [];
    curvedEdges(board, boardBodies(board), joins);
    expect(joins).toEqual([]);
  });
});

/** Face min, a second loop (Review Focus 4), and a cove's B1 run-outs read the same rule. */
describe('face min, both faces, a cove End to end', () => {
  it('a roundover loop on the bottom of the 2" top: ONLY the top outline (52)', () => {
    const e = boardEdges(topCorners(2, loop('m', 0.25, 'roundover', 'min')));
    expect(e).toHaveLength(52);
    expect(e.every(at(0.75))).toBe(true);
  });
  it('loops on both faces (Review Focus 4): nothing at all is a crease', () => {
    const b: Board = { ...topCorners(2), profiles: [loop('t'), loop('m', 0.25, 'roundover', 'min')] };
    expect(boardEdges(b)).toEqual([]);
  });
  it('a cove End to end on the front with B1 run-outs draws its two junction creases along the band', () => {
    const e = boardEdges(topCorners(2, endToEnd('p1', { across: 'width', from: 'min' }, 0.375, 'cove')));
    expect(e.filter(at(0.75)).filter((s) => s[0].width < 1 && s[1].width < 1).length).toBeGreaterThan(0);
    expect(e.filter(at(0.375)).length).toBeGreaterThan(0);
  });
});

/*
 * The FAST swept edges (curvedEdges without `reference`: seams dropped, section-only lines judged against their own faces)
 * against the REFERENCE (every face judged by bodyEdges' coplanar search, the rule above): the same segment set — each
 * line's stretches merged (a stretch may be split at different points: the two paths cut lines at different crossings) and
 * compared within 1e-9 — and the same smooth joins (keyed by their two faces' tags and normals, merged likewise).
 */
type Seg3 = [P, P];
const sub3 = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a: P, b: P) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
interface Run { o: P; u: P; spans: [number, number][] }
function merged(segs: readonly Seg3[], tol = 1e-9): Run[] {
  const runs: Run[] = [];
  for (const [a, b] of segs) {
    const d = sub3(b, a), l = Math.hypot(...d);
    let u: P = [d[0] / l, d[1] / l, d[2] / l];
    const lead = Math.abs(u[0]) > 1e-9 ? u[0] : Math.abs(u[1]) > 1e-9 ? u[1] : u[2];
    if (lead < 0) u = [-u[0], -u[1], -u[2]];
    const k = dot3(a, u);
    const o: P = [a[0] - k * u[0], a[1] - k * u[1], a[2] - k * u[2]];
    let run = runs.find((r) => Math.hypot(...sub3(r.u, u)) <= 1e-7 && Math.hypot(...sub3(r.o, o)) <= 1e-7);
    if (!run) { run = { o, u, spans: [] }; runs.push(run); }
    const ta = dot3(a, run.u), tb = dot3(b, run.u);
    run.spans.push([Math.min(ta, tb), Math.max(ta, tb)]);
  }
  for (const r of runs) {
    r.spans.sort((x, y) => x[0] - y[0]);
    const out: [number, number][] = [];
    for (const s of r.spans) { const last = out[out.length - 1]; if (last && s[0] <= last[1] + tol) last[1] = Math.max(last[1], s[1]); else out.push([s[0], s[1]]); }
    r.spans = out;
  }
  return runs;
}
/** Every run of `a` matched by one of `b` (same line within 1e-7, same merged stretches within `tol`), and the counts equal. */
function sameRuns(a: Run[], b: Run[], tol = 1e-9): string | null {
  if (a.length !== b.length) return `${a.length} lines vs ${b.length}`;
  for (const r of a) {
    const m = b.find((q) => Math.hypot(...sub3(q.u, r.u)) <= 1e-7 && Math.hypot(...sub3(q.o, r.o)) <= 1e-7);
    if (!m) return `no line through ${r.o.join(',')} along ${r.u.join(',')}`;
    if (m.spans.length !== r.spans.length || m.spans.some((s, i) => Math.abs(s[0] - r.spans[i]![0]) > tol || Math.abs(s[1] - r.spans[i]![1]) > tol))
      return `stretches differ on the line through ${r.o.join(',')}: ${JSON.stringify(r.spans)} vs ${JSON.stringify(m.spans)}`;
  }
  return null;
}
const faceKey = (f: SmoothJoin['f1']) => `${f.profileEdge ?? '-'}|${f.sweep ?? '-'}|${f.runout ?? '-'}|${f.curve ?? '-'}|${f.n.map((x) => Math.round(x * 1e6)).join(',')}`;
function joinRuns(joins: readonly SmoothJoin[]): Map<string, Run[]> {
  const by = new Map<string, Seg3[]>();
  for (const j of joins) {
    const k = [faceKey(j.f1), faceKey(j.f2)].sort().join(' & ');
    by.set(k, [...(by.get(k) ?? []), [j.a as P, j.b as P]]);
  }
  return new Map([...by].map(([k, v]) => [k, merged(v)]));
}

const side = (across: 'length' | 'width', from: 'min' | 'max') => ({ across, from }) as const;
const chiral: Board = createBoard({ length: 30, width: 5, thickness: 0.75,
  curves: [{ id: 'c1', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 2, span: 20, rise: 1.25 }) }],
  profiles: [endToEnd('p1', side('width', 'min'), 0.375, 'ogee')] });
const four = (b: Board, ids = ['f', 'r', 'b', 'l']): Board => ({ ...b, profiles: [
  endToEnd(ids[0]!, side('width', 'min')), endToEnd(ids[1]!, side('length', 'max')), endToEnd(ids[2]!, side('width', 'max')), endToEnd(ids[3]!, side('length', 'min'))] });
const sweptEdgeCases: [string, Board][] = [
  ['a loop on a plain rectangle', plainLoop],
  ['roundover 1/4 along the arched apron', apronArch],
  ['roundover 1/4 all round the 2" corners', topCorners(2)],
  ['roundover 1/4 all round the 1/2" corners', topCorners(0.5)],
  ['thumbnail 3/4 × 1/4 all round the 2" corners', topCorners(2, loop('p1', 0.75, 'thumbnail'))],
  ['bead 1/4 (quirk 1/16) all round the 2" corners', topCorners(2, loop('p1', 0.25, 'bead'))],
  ['cove 3/8 all round the 2" corners', topCorners(2, loop('p1', 0.375, 'cove'))],
  ['cove 3/8 + 1/16 fillet all round the 2" corners', topCorners(2, { ...loop('p1', 0.375, 'cove'), fillet: 1 / 16 })],
  ['ogee 3/8 all round the 2" corners', topCorners(2, loop('p1', 0.375, 'ogee'))],
  ['ogee 3/8 all round the 2" corners, facing the edge', topCorners(2, { ...loop('p1', 0.375, 'ogee'), facing: 'edge' })],
  ['roundover 3/8 round the half-round notch', notchEdge],
  ['roundover 1/4 End to end on the front (B1 run-outs)', frontOnly],
  ['cove 3/8 End to end on the front (B1 run-outs)', topCorners(2, endToEnd('p1', side('width', 'min'), 0.375, 'cove'))],
  ['roundover 1/4 End to end on the front of 1/2" corners (B1, the largest extension)', topCorners(0.5, endToEnd('p1', side('width', 'min')))],
  ['bead 1/4 + 1/16 quirk End to end on the front (B1: the quirk past a station)', topCorners(2, { ...endToEnd('p1', side('width', 'min'), 0.25, 'bead'), fillet: 1 / 16 })],
  ['a loop on face min, 1/2" corners', topCorners(0.5, loop('m', 0.25, 'roundover', 'min'))],
  ['loops on the top and the bottom (Review Focus 4)', { ...topCorners(2), profiles: [loop('t'), loop('m', 0.25, 'roundover', 'min')] }],
  ['four End to ends mitred at the 2" corners\' middles (B1a)', four(topCorners(2))],
  ['four End to ends mitred at the 3/4" corners (B1a, odd chord count)', four(topCorners(0.75))],
  ['the loop over a dado and a chamfer (Review Focus 5)', { ...topCorners(2),
    cuts: [{ id: 'd', face: 'thickness', from: 'max', across: 'width', offset: 17.625, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 }],
    angleCuts: [{ id: 'ch', ...chamferCut({ face: 'width', from: 'min', along: 'thickness', alongFrom: 'min', legFace: 0.25, legAlong: 0.25 }, topCorners(2)) }] }],
  ['the 2" loop with a 35 mm hinge cup clear of the band', { ...topCorners(2), holes: [{ id: 'cup', ...defaultHingeCup(createBoard({ length: 36, width: 20, thickness: 0.75 })), station: 10, inset: 2 }] }],
  ['apronArch mirrored along its length (mirrorPart)', mirrorPart(apronArch)],
  ['a chiral arched ogee, and mirrored (mirrorPart)', chiral],
  ['the chiral arched ogee mirrored', mirrorPart(chiral)],
  ['the arched apron with a STRAIGHT roundover on its back edge (a chunk 1 curve beside the sweep)', { ...apronArch, profiles: [...apronArch.profiles, endToEnd('s', side('width', 'max'))] }],
];

const BODIES: Record<string, string> = {
  "a loop on a plain rectangle": '529d24865f5692f3',
  "roundover 1/4 along the arched apron": '370090b7b0b24bfc',
  "roundover 1/4 all round the 2\" corners": '7909e27177133619',
  "roundover 1/4 all round the 1/2\" corners": 'fb7cf2c97e95ac6d',
  "thumbnail 3/4 × 1/4 all round the 2\" corners": '29daa7df8f48528f',
  "bead 1/4 (quirk 1/16) all round the 2\" corners": '221650c0373d5931',
  "cove 3/8 all round the 2\" corners": 'f615e2efd823c5a5',
  "cove 3/8 + 1/16 fillet all round the 2\" corners": 'c3e65b6bea3c413a',
  "ogee 3/8 all round the 2\" corners": '738cbe00669907e6',
  "ogee 3/8 all round the 2\" corners, facing the edge": '3d13b25e9565e11e',
  "roundover 3/8 round the half-round notch": '7a76be35663f02c9',
  "roundover 1/4 End to end on the front (B1 run-outs)": 'ce89bc1971398a5b',
  "cove 3/8 End to end on the front (B1 run-outs)": '7d70ba817409d42d',
  "roundover 1/4 End to end on the front of 1/2\" corners (B1, the largest extension)": 'cabec33bf028623d',
  "bead 1/4 + 1/16 quirk End to end on the front (B1: the quirk past a station)": 'e362cf8b939e7792',
  "a loop on face min, 1/2\" corners": 'f89576bf8267e184',
  "loops on the top and the bottom (Review Focus 4)": 'adec8627a921ad5e',
  "four End to ends mitred at the 2\" corners' middles (B1a)": '1243da2b3a06bc81',
  "four End to ends mitred at the 3/4\" corners (B1a, odd chord count)": 'b8b930939492ed51',
  "the loop over a dado and a chamfer (Review Focus 5)": '3c986dfdaf778951',
  "the 2\" loop with a 35 mm hinge cup clear of the band": '7909e27177133619',
  "apronArch mirrored along its length (mirrorPart)": 'ee069166b12e15fe',
  "a chiral arched ogee, and mirrored (mirrorPart)": '1b4425b7eb6251cb',
  "the chiral arched ogee mirrored": '7969a3986135cbfb',
  "the arched apron with a STRAIGHT roundover on its back edge (a chunk 1 curve beside the sweep)": 'c07dee2d046105ab',
};
describe('the fast swept edges equal the reference, segments and joins (every swept fixture)', () => {
  it('the fixtures are what they claim: every swept profile built', () => {
    for (const [name, b] of sweptEdgeCases) expect(builtSwept(geometryBoard(b)).length, name).toBeGreaterThan(0);
    const withStraight = sweptEdgeCases.find(([n]) => n.includes('STRAIGHT'))![1];
    expect(geometryBoard(withStraight).curves.length).toBe(apronArch.curves.length + 1);   // the back edge's chunk 1 curve
  });
  it.each(sweptEdgeCases)('%s', (_name, board) => {
    const bodies = boardBodies(board);
    const jr: SmoothJoin[] = [], jf: SmoothJoin[] = [];
    const ref = curvedEdges(board, bodies, jr, { reference: true }) as Seg3[];
    const fast = curvedEdges(board, bodies, jf) as Seg3[];
    expect(sameRuns(merged(fast), merged(ref))).toBeNull();
    const a = joinRuns(jf), b = joinRuns(jr);
    expect([...a.keys()].sort()).toEqual([...b.keys()].sort());
    for (const [k, runs] of b) expect(sameRuns(a.get(k)!, runs), k).toBeNull();
    // boardEdges reads the fast path: the same segments, in order.
    expect((boardEdges(board) as Segment[]).map(pts)).toEqual(fast);
  });
  // The swept bodies themselves, byte for byte (Task 5 review minor 4: the lever-1 proof's harness, kept): any construction
  // change must re-pin these knowingly. Hashes of today's bodies (fix round 1, f7719a5 + the stations' extension).
  it.each(sweptEdgeCases)('%s: its bodies hash as pinned', (name, board) => {
    const sha = createHash('sha256').update(JSON.stringify(boardBodies(board))).digest('hex').slice(0, 16);
    expect(`${name}: ${sha}`).toBe(`${name}: ${BODIES[name]}`);
  });
});

/*
 * B1 stations (Task 6 fix round 1): a2 guarantees no step at a station, and so for a swept run. The run carries on past the
 * corner's far tangent point along the side for ε = 2 · reach · tan(φ/2) (φ the corner's end chord against the side), so the
 * end chord's band meets a straight band on their bisector and that meets the run-out on the station plane, both in the
 * side's frame. Before, the end chord's band was clipped across the SIDE: its section stretched by 1/cos φ, ~0.0005" at
 * 1/4", drawn twice ~0.001" apart with a ~0.001" stub.
 */
describe('B1 stations: one section where the band meets the run-out (no step)', () => {
  const station = (r: number, p: Parameters<typeof topCorners>[1]): Board => topCorners(r, p);
  const front = side('width', 'min');
  const cases: [string, Board][] = [
    ['roundover 1/4, 2" corners', frontOnly],
    ['cove 3/8, 2" corners', station(2, endToEnd('p1', front, 0.375, 'cove'))],
    ['roundover 1/4, 1/2" corners (the largest ε)', station(0.5, endToEnd('p1', front))],
    ['bead 1/4 + 1/16 quirk, 2" corners', station(2, { ...endToEnd('p1', front, 0.25, 'bead'), fillet: 1 / 16 })],
  ];
  const segDist = (p: P, a: P, b: P) => {
    const d = sub3(b, a), l2 = dot3(d, d), t = Math.max(0, Math.min(1, dot3(sub3(p, a), d) / l2));
    return Math.hypot(...sub3(p, [a[0] + t * d[0], a[1] + t * d[1], a[2] + t * d[2]]));
  };
  it('the station is ε along the side past the tangent point (written from the corner\'s own chords)', () => {
    // 2" corner: 12 chords, the end chord 1/24 of a quarter turn off the side: φ = π/48; 1/2": 6 chords, φ = π/24.
    const at = (b: Board) => (builtPath(b, b.profiles[0]!)!.ends![0] as { at: [number, number] }).at;
    expect(at(frontOnly)[1] - 2).toBeCloseTo(2 * 0.25 * Math.tan(Math.PI / 96), 12);
    expect(at(cases[2]![1])[1] - 0.5).toBeCloseTo(2 * 0.25 * Math.tan(Math.PI / 48), 12);
    expect(at(cases[1]![1])[1] - 2).toBeCloseTo(2 * 0.375 * Math.tan(Math.PI / 96), 12);
  });
  // These are ordinary fixtures, every end side straight and longer than 2ε. A station that FALLS BACK to the tangent point
  // (fix round 2, I2: an end side too short or curved) keeps the old small step, which this pin would flag: it is exempt, and
  // pinned on its own below (no fault, the station on the side).
  it.each(cases)('%s: near either station no two lines run within 0.005" of each other, and none is under 0.01"', (_n, b) => {
    const path = builtPath(b, b.profiles[0]!)!;
    for (const end of path.ends!) {
      expect(end.kind).toBe('station');
      const at = (end as { at: [number, number] }).at;
      const near = (boardEdges(b) as Segment[]).map(pts).filter(([a, c]) => [a, c].every((q) => Math.hypot(q[0] - at[0], q[1] - at[1]) < 1));
      expect(near.length).toBeGreaterThan(4);
      for (const [a, c] of near) expect(Math.hypot(...sub3(c, a)), `${a} ${c}`).toBeGreaterThanOrEqual(0.01);
      for (let i = 0; i < near.length; i += 1) for (let j = 0; j < near.length; j += 1) {
        if (i === j) continue;
        const [a, c] = near[i]!, [p, q] = near[j]!;
        const close = Math.max(segDist(a, p, q), segDist(c, p, q));
        const same = Math.hypot(...sub3(a, p)) + Math.hypot(...sub3(c, q)) <= 1e-6 || Math.hypot(...sub3(a, q)) + Math.hypot(...sub3(c, p)) <= 1e-6;
        expect(close > 0.005 || same, `${a} ${c} vs ${p} ${q}`).toBe(true);
      }
    }
  });
});
describe('a bead\'s quirk past a B1 station: the floor is the run-out\'s, joined to it smoothly', () => {
  it('at the floor\'s depth only the quirk\'s sharp corner is revolved round the bit, nothing at the floor\'s tangent join', () => {
    const b = topCorners(2, { ...endToEnd('p1', side('width', 'min'), 0.25, 'bead'), fillet: 1 / 16 });
    const end = builtPath(b, b.profiles[0]!)!.ends![0] as { at: [number, number] };
    // The bit's axis: 1/4" outside the length-min side, at the station. The quirk's sharp corner (5/16" in) runs round it at
    // 1/4 + 5/16 = 9/16; the floor's tangent join with the bead (1/4" in), at 1/2, must draw nothing.
    const axis: [number, number] = [-0.25, end.at[1]];
    const floor = (boardEdges(b) as Segment[]).map(pts).filter(([a, c]) => [a, c].every((q) => Math.abs(q[2] - 0.6875) <= 1e-9
      && q[1] > end.at[1] - 1e-9 && q[0] < 1 && q[1] < end.at[1] + 1));
    expect(floor.length).toBeGreaterThan(3);
    for (const [a, c] of floor) {
      const onSide = Math.abs(a[0]) <= 1e-12 && Math.abs(c[0]) <= 1e-12;
      // A sector chord of the ring: its ends on the circle, or one clipped where it leaves through the side face.
      const ring = [a, c].every((q) => Math.abs(Math.hypot(q[0] - axis[0], q[1] - axis[1]) - 0.5625) <= 1e-6 || Math.abs(q[0]) <= 1e-12)
        && [a, c].some((q) => Math.abs(Math.hypot(q[0] - axis[0], q[1] - axis[1]) - 0.5625) <= 1e-6);
      expect(onSide || ring, `${a} ${c}`).toBe(true);
    }
  });
});


/*
 * B1a mitres (Task 6 fix round 1): two End to end profiles meeting at a corner arc's middle. One SECTION (profile values but
 * id and run) cuts one surface: no line at the mitre, whatever the corner's chord parity. Differing sections meet in a real
 * crease: the mitre line is drawn, again whatever the parity. 2" corners take 12 chords (the middle a chord vertex), 3/4"
 * corners 7 (the middle splits a chord).
 */
describe('B1a mitres do not depend on chord parity', () => {
  const sides = [side('width', 'min'), side('length', 'max'), side('width', 'max'), side('length', 'min')];
  const mitred = (r: number, sizes: number[]): Board => ({ ...topCorners(r), profiles: sides.map((s, i) => endToEnd(`e${i}`, s, sizes[i]!)) });
  /** Lines in the band lying ON the min/min corner's mitre: the radial line from the corner's centre through its middle. */
  const onMitre = (b: Board, r: number) => {
    const c = [r, r], u = [-Math.SQRT1_2, -Math.SQRT1_2];
    const off = (q: P) => Math.abs((q[0] - c[0]!) * u[1]! - (q[1] - c[1]!) * u[0]!);
    const along = (q: P) => (q[0] - c[0]!) * u[0]! + (q[1] - c[1]!) * u[1]!;
    return (boardEdges(b) as Segment[]).map(pts).filter((s) => s.every((q) => off(q) <= 1e-6 && along(q) > r - 0.5 && q[2] > 0.25));
  };
  it.each([[2, 12], [0.75, 7]])('corners of %s" (%i chords): equal sections draw nothing at the mitre', (r) => {
    const b = mitred(r, [0.25, 0.25, 0.25, 0.25]);
    expect(b.profiles.flatMap((p) => profileFaults(b, p))).toEqual([]);
    for (const p of b.profiles) expect(profilePath(b, p)!.ends!.map((e) => e.kind)).toEqual(['mitre', 'mitre']);
    expect(onMitre(b, r)).toEqual([]);
    // And the whole part draws what the one loop draws (the same wood, the same lines: the bottom outline only).
    expect(boardEdges(b).length).toBe(boardEdges(topCorners(r)).length);
  });
  it.each([[2, 12], [0.75, 7]])('corners of %s" (%i chords): differing sections draw the mitre line', (r) => {
    // 1/4" against 0.26": the same section edges (4 arc chords each), so only the section test tells them apart.
    const b = mitred(r, [0.25, 0.26, 0.25, 0.26]);
    const v = geometryBoard(b);
    expect(new Set(v.profiles.map((p) => keptSection(v, p).pieces.flatMap((k) => k.edge.filter((e) => e !== null).map((e) => e!.split(':').slice(1).join(':'))).sort().join()))).toHaveProperty('size', 1);
    expect(b.profiles.flatMap((p) => profileFaults(b, p))).toEqual([]);
    for (const p of b.profiles) expect(profilePath(b, p)!.ends!.map((e) => e.kind)).toEqual(['mitre', 'mitre']);
    expect(onMitre(b, r).length).toBeGreaterThan(0);
  });
});

/*
 * Fix round 2: ε, the B1 station's extension, is a BUILD detail and never decides anything (I1), and it is taken only along
 * a straight side longer than 2ε (I2).
 */
describe('the station extension decides no fault, and falls back where the side cannot take it', () => {
  it('I1: a front End to end and a left-side stopped run starting at the corner\'s tangent point (2") — or just past it — are clean', () => {
    for (const lo of [2, 2.01]) {
      const b: Board = { ...topCorners(2), profiles: [endToEnd('f', side('width', 'min')), stopped('l', side('length', 'min'), lo, 10)] };
      for (const p of b.profiles) expect(profileFaults(b, p), `${p.id} at ${lo}`).toEqual([]);
      expect(builtSwept(geometryBoard(b)).map((p) => p.id)).toEqual(['f']);
      // The build still carries the front's station ε on, into the stopped run's stretch: geometry only.
      const y = (builtPath(b, b.profiles[0]!)!.ends![0] as { at: [number, number] }).at[1];
      expect(y).toBeGreaterThan(2);
    }
  });
  it('I2: 1/2" corners on a 1.005–1.015" width (an end side shorter than 2ε) build with no too-tight fault, the station at the tangent point', () => {
    for (const W of [1.005, 1.01, 1.015]) {
      const b = createBoard({ ...topCorners(0.5, endToEnd('p1', side('width', 'min'))), width: W });
      expect(profileFaults(b, b.profiles[0]!), `${W}`).toEqual([]);
      expect(builtSwept(geometryBoard(b))).toHaveLength(1);
      const [s, e] = builtPath(b, b.profiles[0]!)!.ends! as { at: [number, number] }[];
      expect([s!.at, e!.at]).toEqual([[0, 0.5], [36, 0.5]]);   // the tangent points: no extension (the step there accepted)
    }
  });
  it('I2: a full-round end (width 1", 1/2" corners): no straight end side, so the station sits ON the side at the tangent point', () => {
    const b = createBoard({ ...topCorners(0.5, endToEnd('p1', side('width', 'min'))), width: 1 });
    expect(profileFaults(b, b.profiles[0]!)).toEqual([]);
    const [s, e] = builtPath(b, b.profiles[0]!)!.ends! as { at: [number, number] }[];
    expect(s!.at).toEqual([0, 0.5]);
    expect(e!.at).toEqual([36, 0.5]);
  });
});
