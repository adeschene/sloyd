import { describe, expect, it } from 'vitest';
import { boardBodies, boardEdges, curvedEdges, type SmoothJoin } from './bodies';
import { createBoard } from './document';
import type { Segment } from './cuts';
import { apronArch, endToEnd, frontOnly, loop, notchEdge, plainLoop, straightTopLong, topCorners } from './sweepFixtures';
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
    // The run-out past the station at width 2, on the length-min side: the cutter (bearing 1/4" outside the side, reach
    // 1/4") reaches width 2 + √(0.5² − 0.25²) = 2.433 on the top.
    const inside = (q: Segment[0]) => q.width > 2 + 1e-6 && q.width < 2.433 && q.length > 1e-9 && q.thickness < 0.75 - 1e-9;
    expect(e.filter((s) => s[0].length < 1 && inside(s[0]) && inside(s[1]))).toEqual([]);
    // Its outline on the top (4 sector chords) and on the side face (7: its sectors meeting the side), each station.
    expect(e.filter((s) => at(0.75)(s) && s[0].length < 0.3 && Math.min(s[0].width, s[1].width) >= 2 && Math.max(s[0].width, s[1].width) < 2.44 && s[0].width + s[1].width > 4)).toHaveLength(4);
    expect(e.filter((s) => s[0].length === 0 && s[1].length === 0 && Math.min(s[0].width, s[1].width) >= 2 && Math.max(s[0].width, s[1].width) <= 2.434)).toHaveLength(7);
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
