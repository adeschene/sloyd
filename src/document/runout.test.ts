import { describe, expect, it } from 'vitest';
import { createBoard, createDocument, defaultProfile, PROFILE_EDGES } from './document';
import { boardBodies, bodyVerts, bodyVolume, BODY_EPS, type Body } from './bodies';
import { curveOutline, inPolygonClosed, twiceArea, uvDims, distToSegment, type P2, type ViewCurve } from './curves';
import { canonicalRun, geometryBoard, profileOf } from './profiles';
import { profileSection, profileWasteContains, runoutAxis, sectionFrame } from './runout';
import { worldParts } from './tree';
import { stockProbe } from './cuts';
import { holeFaults } from './holeFaults';
import type { HoleRow } from './types';
import { mirrorDim } from './frames';
import { DIMENSION_ORDER } from './geometry';
import type { V3 } from './angleCuts';
import type { Board, CutFrom, ProfileCut, ProfileEnd, ProfileKind, SloydDocument } from './types';

/**
 * Stopped profiles' bodies (profile runs a2, P9). Every expectation here is written from the DEFINITION in this file's own
 * frame (`frameOf`, read off the stored profile's side and face — never `sectionFrame`), with the bearing a LITERAL 0.25:
 * in the band, (s, t) in the section; beyond a stop, (ρ − 0.25, t) in the section, ρ the distance from the bit's axis.
 */
const BEAR = 0.25;
const L = 30, W = 10, T = 0.75;

interface Spec {
  kind: ProfileKind; size: number; fillet?: number; depth?: number; facing?: 'face' | 'edge';
  across?: 'length' | 'width'; from?: CutFrom; face?: CutFrom;
  /** A station's distance from the run dimension's min end, or null: out through the min end. */
  lo: number | null;
  /** A station's distance from the run dimension's MAX end, or null: out through the max end. */
  hi: number | null;
}
const SIZES: Record<'roundover' | 'cove' | 'ogee' | 'bead' | 'thumbnail', Pick<Spec, 'size' | 'fillet' | 'depth'>> = {
  roundover: { size: 0.25, fillet: 0 }, cove: { size: 0.375, fillet: 0 }, ogee: { size: 0.5, fillet: 0 },
  bead: { size: 0.25, fillet: 0.0625 }, thumbnail: { size: 0.75, depth: 0.25 },
};
const spec = (kind: ProfileKind, over: Partial<Spec> = {}): Spec => ({ kind, ...SIZES[kind], lo: 3, hi: 3, ...over });

function profile(board: Pick<Board, 'length' | 'width' | 'thickness'>, s: Spec, id = 'p'): ProfileCut {
  const side = { across: s.across ?? 'width', from: s.from ?? 'max' };
  const start: ProfileEnd = s.lo === null ? { side, through: 'min' } : { side, from: 'min', at: s.lo };
  const end: ProfileEnd = s.hi === null ? { side: { ...side }, through: 'max' } : { side: { ...side }, from: 'max', at: s.hi };
  const face = s.face ?? 'max';
  return {
    id, face, kind: s.kind, size: s.size,
    ...(s.depth !== undefined ? { depth: s.depth } : {}), ...(s.kind === 'thumbnail' ? {} : { fillet: s.fillet ?? 0 }),
    facing: s.facing ?? 'face', run: canonicalRun(board, face, { start, end }),
  };
}
const shelf = (profiles: ProfileCut[], over: Partial<Board> = {}): Board =>
  createBoard({ id: 'b1', name: 'Shelf', length: L, width: W, thickness: T, profiles, ...over });
function stopped(s: Spec, over: Partial<Board> = {}): { b: Board; c: ViewCurve; s: Spec } {
  const dims = { length: L, width: W, thickness: T, ...over };
  const b = shelf([profile(dims, s)], over);
  // The view curve itself (never spread: its stored profile is looked up by identity).
  return { b, c: geometryBoard(b).curves.at(-1) as ViewCurve, s };
}

/** This file's own frame, from the stored side and face (independent of sectionFrame). */
function frameOf(b: Board, s: Spec) {
  const across = s.across ?? 'width';
  const from = s.from ?? 'max';
  const face = s.face ?? 'max';
  const runDim = across === 'width' ? 'length' : 'width';
  const r = DIMENSION_ORDER.indexOf(runDim);
  const u = DIMENSION_ORDER.indexOf(across);
  const uE = from === 'min' ? 0 : b[across];
  const uIn = from === 'min' ? 1 : -1;
  const vF = face === 'min' ? 0 : b.thickness;
  const vIn = face === 'min' ? 1 : -1;
  const len = b[runDim];
  const lo = s.lo === null ? 0 : s.lo;
  const hi = s.hi === null ? len : len - s.hi;
  /** A board-local point at `run` along the side, `s` in from the side face, `t` in from the broad face. */
  const at = (run: number, sIn: number, t: number): V3 => { const p: V3 = [0, 0, 0]; p[r] = run; p[u] = uE + uIn * sIn; p[2] = vF + vIn * t; return p; };
  const back = (p: V3): [number, number, number] => [p[r], uIn * (p[u] - uE), vIn * (p[2] - vF)];
  return { r, u, len, lo, hi, stopLo: s.lo !== null, stopHi: s.hi !== null, at, back };
}
/** The waste outline (chords) in this file's (s, t). */
function sectionOf(b: Board, c: ViewCurve, s: Spec): P2[] {
  const [ud] = uvDims(c.through);
  const across = s.across ?? 'width';
  expect(ud).toBe(across);
  const uE = (s.from ?? 'max') === 'min' ? 0 : b[across];
  const vF = (s.face ?? 'max') === 'min' ? 0 : b.thickness;
  return curveOutline(b, c).pts.map(([u, v]) => [Math.abs(u - uE), Math.abs(v - vF)] as P2);
}
const polyDist = (poly: readonly P2[], p: P2) => Math.min(...poly.map((a, i) => distToSegment(p, a, poly[(i + 1) % poly.length]!)));

/** The definition (P9), in this file's frame: [waste?, distance from the section's boundary in (σ, t)]. */
function definition(b: Board, c: ViewCurve, s: Spec, p: V3): [boolean, number] {
  const f = frameOf(b, s);
  const poly = sectionOf(b, c, s);
  const [run, sIn, t] = f.back(p);
  let sigma: number;
  if (run >= f.lo && run <= f.hi) sigma = sIn;
  else if (run < f.lo && f.stopLo) sigma = Math.hypot(run - f.lo, sIn + BEAR) - BEAR;
  else if (run > f.hi && f.stopHi) sigma = Math.hypot(run - f.hi, sIn + BEAR) - BEAR;
  else return [false, Infinity];
  return [inPolygonClosed(poly, [sigma, t]), polyDist(poly, [sigma, t])];
}

/** An R3 additive recurrence: one irrational per axis (a 1-D golden sequence read three at a time is correlated). */
const G = 1.2207440846057596;
const R3 = [1 / G, 1 / (G * G), 1 / (G * G * G)];
const r3 = (i: number): V3 => [(0.5 + R3[0]! * i) % 1, (0.5 + R3[1]! * i) % 1, (0.5 + R3[2]! * i) % 1];

const sideOf = (f: { n: V3; verts: V3[] }, p: readonly number[]) => {
  const q = f.verts[0]!;
  return f.n[0] * (p[0]! - q[0]) + f.n[1] * (p[1]! - q[1]) + f.n[2] * (p[2]! - q[2]);
};
/** Strictly inside some body (wood), on a boundary (skip), or outside every body (air). */
function woodAt(bodies: readonly Body[], p: V3): 'wood' | 'air' | 'boundary' {
  if (bodies.some((x) => x.faces.every((f) => sideOf(f, p) <= -1e-7))) return 'wood';
  if (bodies.some((x) => x.faces.every((f) => sideOf(f, p) <= 1e-7))) return 'boundary';
  return 'air';
}
const totalVolume = (bodies: readonly Body[]) => bodies.reduce((v, x) => v + bodyVolume(x), 0);

/** The run-out boxes (every point a run-out removes lies in one): forward from each stop by 0.25 + max s, clipped to the part. */
function runoutBoxes(b: Board, c: ViewCurve, s: Spec): { r0: number; r1: number; sMax: number; tMax: number }[] {
  const f = frameOf(b, s);
  const poly = sectionOf(b, c, s);
  const sMax = Math.max(...poly.map((q) => q[0]));
  const tMax = Math.max(...poly.map((q) => q[1]));
  const reach = BEAR + sMax;
  const out = [];
  if (f.stopLo) out.push({ r0: Math.max(0, f.lo - reach), r1: f.lo, sMax, tMax });
  if (f.stopHi) out.push({ r0: f.hi, r1: Math.min(f.len, f.hi + reach), sMax, tMax });
  return out;
}

describe('the section, the frame and the oracle (P9, literal points)', () => {
  const { b, c } = stopped(spec('roundover'));
  it('the section of a 1/4" roundover is its corner waste in (s, t)', () => {
    const { pts } = profileSection(b, c);
    expect(pts.every(([x, y]) => x >= -1e-12 && y >= -1e-12 && x <= 0.25 + 1e-12 && y <= 0.25 + 1e-12)).toBe(true);
    for (const q of [[0, 0], [0.25, 0], [0, 0.25]]) expect(pts.some((p) => Math.hypot(p[0] - q[0]!, p[1] - q[1]!) < 1e-12)).toBe(true);
  });
  it('the frame of the top face, width max side, running along the length', () => {
    expect(sectionFrame(b, c)).toEqual({ k: 0, iu: 1, iv: 2, uEdge: 10, uOut: 1, vFace: 0.75, vIn: -1 });
    expect(runoutAxis(b, c, 'lo')).toEqual({ run: 3, u: 10.25 });
    expect(runoutAxis(b, c, 'hi')).toEqual({ run: 27, u: 10.25 });
  });
  it('the frame of the bottom face, length min side, running along the width', () => {
    const x = stopped(spec('roundover', { across: 'length', from: 'min', face: 'min', lo: 2, hi: 1 }));
    expect(sectionFrame(x.b, x.c)).toEqual({ k: 1, iu: 0, iv: 2, uEdge: 0, uOut: -1, vFace: 0, vIn: 1 });
    expect(runoutAxis(x.b, x.c, 'lo')).toEqual({ run: 2, u: -0.25 });
    expect(runoutAxis(x.b, x.c, 'hi')).toEqual({ run: 9, u: -0.25 });
  });
  it('literal points: band, run-out, wood', () => {
    expect(profileWasteContains(b, c, [15, 9.98, 0.73])).toBe(true);    // mid-band, in the corner waste
    expect(profileWasteContains(b, c, [1, 9.98, 0.73])).toBe(false);    // 2" past the stop: beyond the run-out
    expect(profileWasteContains(b, c, [2.9, 10, 0.75])).toBe(true);     // 0.1" past the stop on the corner
    expect(profileWasteContains(b, c, [27.1, 10, 0.75])).toBe(true);    // 0.1" past the other stop
    // The bearing, by literal: 0.4" past the stop at the corner is ρ = √(0.4² + 0.25²) ≈ 0.472 ≤ 0.25 + 0.25.
    expect(profileWasteContains(b, c, [2.6, 10, 0.75])).toBe(true);
    expect(profileWasteContains(b, c, [27.4, 10, 0.75])).toBe(true);
    // 0.5" past: ρ ≈ 0.559 > 0.5.
    expect(profileWasteContains(b, c, [2.5, 10, 0.75])).toBe(false);
    expect(profileWasteContains(b, c, [15, 9.99, 0.45])).toBe(false);   // deeper than the profile
    expect(profileWasteContains(b, c, [15, 9.5, 0.75])).toBe(false);    // further in than the profile
  });
});

// Every side and face: the roundover, plus asymmetric kinds facing the edge.
const PLACEMENTS = (['length', 'width'] as const).flatMap((across) => (['min', 'max'] as const).flatMap((from) =>
  (['min', 'max'] as const).map((face) => ({ across, from, face }))));

describe('the oracle in every frame (independent of sectionFrame)', () => {
  const kinds: Partial<Spec>[] = [
    { kind: 'roundover' }, { kind: 'cove' }, { kind: 'ogee' }, { kind: 'ogee', facing: 'edge' },
    { kind: 'bead', facing: 'edge' }, { kind: 'thumbnail' }, { kind: 'thumbnail', facing: 'edge' },
  ];
  for (const pl of PLACEMENTS) for (const k of kinds) {
    it(`${k.kind} ${k.facing ?? 'face'} on ${pl.across} ${pl.from}, face ${pl.face}`, () => {
      const { b, c, s } = stopped(spec(k.kind!, { ...k, ...pl }));
      const f = frameOf(b, s);
      const [ui, vi] = uvDims(c.through).map((d) => DIMENSION_ORDER.indexOf(d));
      const outline = curveOutline(b, c).pts;
      // Mid-band: the stored outline itself, in raw (u, v), with no frame at all.
      for (let i = 0; i < 400; i += 1) {
        const [a, d, e] = r3(i + 1);
        const p = f.at(f.lo + a * (f.hi - f.lo), d * 1.0, e * T);
        expect(profileWasteContains(b, c, p), `band ${p.join(', ')}`).toBe(inPolygonClosed(outline, [p[ui!]!, p[vi!]!]));
      }
      // Beyond each stop, the definition (this file's frame), skipping points on the boundary.
      for (const box of runoutBoxes(b, c, s)) for (let i = 0; i < 300; i += 1) {
        const [a, d, e] = r3(i + 1);
        const p = f.at(box.r0 + a * (box.r1 - box.r0), d * box.sMax, e * box.tMax);
        const [w, dist] = definition(b, c, s, p);
        if (dist < 1e-9) continue;
        expect(profileWasteContains(b, c, p), `run-out ${p.join(', ')}`).toBe(w);
      }
      // The edge corner past each stop, by literal bearing: a profile with full width at t = 0 reaches ρ = 0.25 + w(0).
      const w0 = Math.max(...sectionOf(b, c, s).filter((q) => q[1] < 1e-12).map((q) => q[0]));
      const past = (x: number) => Math.sqrt((BEAR + w0) ** 2 - BEAR ** 2) * x;
      expect(profileWasteContains(b, c, f.at(f.lo - past(0.98), 0, 0))).toBe(true);
      expect(profileWasteContains(b, c, f.at(f.lo - past(1.02), 0, 0))).toBe(false);
      expect(profileWasteContains(b, c, f.at(f.hi + past(0.98), 0, 0))).toBe(true);
      expect(profileWasteContains(b, c, f.at(f.hi + past(1.02), 0, 0))).toBe(false);
    });
  }
});

/** The wood cases: the brief's three kinds stopped 3..27, a stop 0.1" in, one stop, and the generalisation set. */
const WOOD: { name: string; s: Spec }[] = [
  { name: 'roundover 3..27', s: spec('roundover') },
  { name: 'cove 3..27', s: spec('cove') },
  { name: 'ogee 3..27', s: spec('ogee') },
  { name: 'roundover, stops 0.1" in (the run-out leaves the part)', s: spec('roundover', { lo: 0.1, hi: 0.1 }) },
  { name: 'roundover, through the min end, stopped 3" from max', s: spec('roundover', { lo: null }) },
  { name: 'ogee facing the edge', s: spec('ogee', { facing: 'edge' }) },
  { name: 'thumbnail', s: spec('thumbnail') },
  { name: 'bead facing the edge, bottom face, length min side', s: spec('bead', { facing: 'edge', across: 'length', from: 'min', face: 'min', lo: 2, hi: 1.5 }) },
  ...PLACEMENTS.map((pl) => ({ name: `roundover on ${pl.across} ${pl.from}, face ${pl.face}`, s: spec('roundover', { ...pl, lo: 2, hi: 2.5 }) })),
];

describe('the wood of a stopped profile (P9)', () => {
  for (const { name, s } of WOOD) {
    describe(name, () => {
      const { b, c } = stopped(s);
      const bodies = boardBodies(b);
      const f = frameOf(b, s);
      const poly = sectionOf(b, c, s);
      const boxes = runoutBoxes(b, c, s);

      it('volume: the band exactly, each run-out by sampling its box (the definition), within 2e-3 in³', () => {
        let expected = L * W * T - (Math.abs(twiceArea(poly)) / 2) * (f.hi - f.lo);
        for (const box of boxes) {
          const N = 6000;
          let waste = 0;
          for (let i = 0; i < N; i += 1) {
            const [a, d, e] = r3(i + 1);
            if (profileWasteContains(b, c, f.at(box.r0 + a * (box.r1 - box.r0), d * box.sMax, e * box.tMax))) waste += 1;
          }
          expected -= (waste / N) * (box.r1 - box.r0) * box.sMax * box.tMax;
        }
        expect(Math.abs(totalVolume(bodies) - expected)).toBeLessThan(2e-3);
      });

      it('the bodies agree with the oracle over the 1" band (≥ 99.5%) and over each run-out box (≥ 99.5%)', () => {
        const check = (pts: V3[], margin: number) => {
          let agree = 0, n = 0;
          for (const p of pts) {
            const [w, dist] = definition(b, c, s, p);
            // The oracle is the definition, exactly, away from the boundary.
            if (dist > 1e-9) expect(profileWasteContains(b, c, p), p.join(', ')).toBe(w);
            if (dist < margin) continue;
            const at = woodAt(bodies, p);
            if (at === 'boundary') continue;
            n += 1;
            if ((at === 'wood') === !profileWasteContains(b, c, p)) agree += 1;
          }
          return { agree, n };
        };
        const band: V3[] = [];
        for (let i = 0; i < 6000; i += 1) { const [a, d, e] = r3(i + 1); band.push(f.at(a * f.len, d * 1, e * T)); }
        const bb = check(band, 2e-3);
        expect(bb.n).toBeGreaterThan(5000);
        expect(bb.agree / bb.n).toBeGreaterThanOrEqual(0.995);
        for (const box of boxes) {
          const pts: V3[] = [];
          for (let i = 0; i < 3000; i += 1) { const [a, d, e] = r3(i + 1); pts.push(f.at(box.r0 + a * (box.r1 - box.r0), d * box.sMax, e * box.tMax)); }
          // The run-out's sectors are chords of its circles at CURVE_TOLERANCE (0.005): a wider margin there.
          const rb = check(pts, 0.006);
          expect(rb.n).toBeGreaterThan(1500);
          expect(rb.agree / rb.n, `run-out [${box.r0}, ${box.r1}]`).toBeGreaterThanOrEqual(0.995);
        }
      });

      it('the run-out meets the band at the station: 1e-4 past each stop the bodies hold the band\'s section (T3 fix 1)', () => {
        // The true run-out at θ = π/2 IS the band's section (ρ − 0.25 = s to ~2e-8 this close), so a point 1e-4 past a stop is
        // waste exactly where (s, t) is in the band's section. Margin 1e-4, not CURVE_TOLERANCE: no step, no tooth.
        const sMax = Math.max(...poly.map((q) => q[0]));
        const tMax = Math.max(...poly.map((q) => q[1]));
        const runs = [...(f.stopLo ? [f.lo - 1e-4] : []), ...(f.stopHi ? [f.hi + 1e-4] : [])].filter((x) => x > 0 && x < f.len);
        let n = 0;
        for (const run of runs) for (let i = 0; i < 4000; i += 1) {
          const [a, d] = r3(i + 1);
          const st: P2 = [a * (sMax + 0.01), d * (tMax + 0.01)];
          const dist = polyDist(poly, st);
          if (dist < 1e-4 || dist > 0.01) continue;
          const at = woodAt(bodies, f.at(run, st[0], st[1]));
          if (at === 'boundary') continue;
          n += 1;
          expect(at, `${run}: s ${st[0]}, t ${st[1]}`).toBe(inPolygonClosed(poly, st) ? 'air' : 'wood');
        }
        if (runs.length > 0) expect(n).toBeGreaterThan(500);
        if (name === 'roundover 3..27') {
          for (const run of [f.lo - 1e-4, f.hi + 1e-4]) {
            expect(woodAt(bodies, f.at(run, 0.25 + 0.003, 0.0005)), 'the overcut').toBe('wood');
            expect(woodAt(bodies, f.at(run, 0.0005, 0.0005)), 'the tooth').toBe('air');
          }
        }
      });

      it('every body is convex', () => {
        for (const x of bodies) {
          const vs = bodyVerts(x);
          for (const face of x.faces) for (const p of vs) expect(sideOf(face, p)).toBeLessThanOrEqual(1e-9);
        }
      });

      it('caps on the run-out\'s arcs name the curve and the end', () => {
        const faces = bodies.flatMap((x) => x.faces);
        if (f.stopLo) expect(faces.some((q) => q.curve === 'p' && q.runout === 'lo')).toBe(true);
        if (f.stopHi) expect(faces.some((q) => q.curve === 'p' && q.runout === 'hi')).toBe(true);
        if (!f.stopLo) expect(faces.some((q) => q.runout === 'lo')).toBe(false);
      });
    });
  }

  it('no sliver at a station: no body under 1e-5 in³ reaches within 1e-3 of a stop (T3 fix 1)', () => {
    // The circumscribed sectors left a tooth body at every stop (3e-7–9e-7 in³, spanning [2.9836, 3] on the roundover).
    // Scoped to the stations: the cove and ogee also peel a few chord-sliver fragments (1e-7–2e-6 in³) 0.2–0.5" past a stop,
    // where a sector's chord meets the side face — wood the inscribed chords leave, as on every arc; they are not the step.
    for (const { name, s } of WOOD.slice(0, 4)) {
      const { b } = stopped(s);
      const f = frameOf(b, s);
      const stations = [...(f.stopLo ? [f.lo] : []), ...(f.stopHi ? [f.hi] : [])];
      const near = boardBodies(b).filter((x) => {
        const ks = bodyVerts(x).map((p) => p[f.r]);
        return stations.some((st) => Math.min(...ks) <= st + 1e-3 && Math.max(...ks) >= st - 1e-3);
      });
      expect(near.length, name).toBeGreaterThan(0);
      expect(near.map(bodyVolume).filter((v) => v < 1e-5), name).toEqual([]);
    }
  });

  it('one roundover in the four length-running placements of the top: the same volume', () => {
    const vols = PLACEMENTS.filter((pl) => pl.across === 'width').map((pl) => totalVolume(boardBodies(stopped(spec('roundover', pl)).b)));
    for (const v of vols) expect(Math.abs(v - vols[0]!)).toBeLessThan(1e-9);
  });
});

describe('a part with no stopped profile keeps its bodies', () => {
  it('the four-edge cove set, End to end, is a1\'s bodies byte for byte', () => {
    const top = createBoard({ id: 'b1', name: 'Top', length: 36, width: 20, thickness: 0.75 });
    const curves = PROFILE_EDGES.filter((e) => e.vFrom === 'max').map((e, i) => ({ id: `cove${i}`, ...defaultProfile(top, 'cove', e) }));
    const asProfiles = { ...top, profiles: curves.map((c) => ({ id: c.id, ...profileOf(c)! })) };
    expect(asProfiles.profiles.every((p) => 'through' in (p.run as { start: ProfileEnd }).start)).toBe(true);
    const bodies = boardBodies(asProfiles);
    expect(bodies).toEqual(boardBodies({ ...top, curves }));
    expect(bodies.flatMap((x) => x.faces).some((q) => 'runout' in q)).toBe(false);
  });
});

describe('a stopped profile through a mirror', () => {
  const place = (b: Board, rotation: 0 | 90): SloydDocument => ({
    ...createDocument('Mirror'),
    instances: [{ id: 'i1', name: 'Outer', definition: 'd1', position: [6, 0, 3], rotation, mirrored: true }],
    definitions: [{ id: 'd1', boards: [{ ...b, id: 'b1' }], instances: [] }],
  });
  const cases: { name: string; s: Spec; posture: Board['posture'] }[] = [
    // flat: mirrored along the length — the run dimension (the stations swap ends).
    { name: 'flat, run along the length', s: spec('ogee', { facing: 'edge', lo: 2, hi: 4 }), posture: 'flat' },
    // flat, run along the width: the length is the side's across (the side moves to the other end).
    { name: 'flat, run along the width', s: spec('ogee', { facing: 'edge', across: 'length', from: 'min', lo: 1, hi: 2.5 }), posture: 'flat' },
    // upright: mirrored along the width.
    { name: 'upright, run along the length', s: spec('thumbnail', { lo: 2, hi: 4 }), posture: 'upright' },
  ];
  for (const { name, s, posture } of cases) for (const rotation of [0, 90] as const) {
    it(`${name}, turn ${rotation}: the world part's waste is the stored part's, reflected`, () => {
      const { b, c } = stopped(s, { posture });
      const occ = worldParts(place(b, rotation)).find((p) => p.id.endsWith('b1'))!;
      const d = DIMENSION_ORDER.indexOf(mirrorDim(b));
      const view = geometryBoard(occ).curves.at(-1) as ViewCurve;
      const reflect = (p: V3): V3 => { const q: V3 = [p[0], p[1], p[2]]; q[d] = b[DIMENSION_ORDER[d]!] - p[d]!; return q; };
      const f = frameOf(b, s);
      const wb = boardBodies(occ);
      const ob = boardBodies(b);
      expect(Math.abs(totalVolume(wb) - totalVolume(ob))).toBeLessThan(1e-9);
      const pts: V3[] = [];
      for (let i = 0; i < 3000; i += 1) { const [a, dd, e] = r3(i + 1); pts.push(f.at(a * f.len, dd * 1, e * T)); }
      for (const box of runoutBoxes(b, c, s)) for (let i = 0; i < 1500; i += 1) {
        const [a, dd, e] = r3(i + 1);
        pts.push(f.at(box.r0 + a * (box.r1 - box.r0), dd * box.sMax, e * box.tMax));
      }
      let mismatch = 0;
      for (const p of pts) {
        const [, dist] = definition(b, c, s, p);
        if (dist < 1e-9) continue;
        expect(profileWasteContains(occ, view, reflect(p)), p.join(', ')).toBe(profileWasteContains(b, c, p));
        const x = woodAt(ob, p), y = woodAt(wb, reflect(p));
        if (x !== 'boundary' && y !== 'boundary' && x !== y) mismatch += 1;
      }
      expect(mismatch).toBe(0);
    });
  }
});

// BODY_EPS is the containment tolerance bodies.test.ts uses; pinned so a change here is seen.
it('BODY_EPS', () => expect(BODY_EPS).toBe(1e-9));

describe('a stopped profile: stock probe and hole faults (profile runs a2, Task 4)', () => {
  it('stockProbe agrees with !profileWasteContains on 2 000 sampled points, away from the section boundaries', () => {
    const { b, c } = stopped(spec('roundover'));
    const probe = stockProbe(b);
    let seed = 12345;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    let checked = 0, air = 0;
    for (let i = 0; i < 2000; i += 1) {
      // Mostly near the stops and the side face, where the waste is.
      const run = i % 2 ? rnd() * L : (i % 4 === 0 ? 3 : 27) + (rnd() - 0.5) * 1.0;
      const p: V3 = [Math.min(L, Math.max(0, run)), W - rnd() * 0.3, T - rnd() * 0.3];
      const e = 2e-3;
      const near = profileWasteContains(b, c, p);
      let stable = true;
      for (let k = 0; k < 3; k += 1) for (const sg of [-e, e]) { const q = [...p] as V3; q[k] += sg; if (profileWasteContains(b, c, q) !== near) stable = false; }
      if (!stable) continue;
      checked += 1;
      if (near) air += 1;
      expect(probe({ length: p[0], width: p[1], thickness: p[2] })).toBe(!near);
    }
    expect(checked).toBeGreaterThan(1000);
    expect(air).toBeGreaterThan(100);
  });

  /** A 1/8" blind bore down into the top face, 0.1" in from the width-max edge, at `run` along the length. */
  const bore = (run: number): HoleRow => ({
    id: 'h1', face: 'thickness', from: 'max', diameter: 0.125, depth: 0.125, along: 'length', alongFrom: 'min', station: run,
    count: 1, pitch: 0, acrossFrom: 'max', inset: 0.1,
  });
  const curveFault = (run: number) => {
    const { b } = stopped(spec('roundover'), { holes: [bore(run)] });
    return holeFaults(b, bore(run)).find((f) => f.kind === 'breaks-out' && f.curve)?.curve?.id;
  };
  it('a bore in the band is refused; inside the extended band (R = 0.25 + 0.25) it is refused; past it, and beyond the run-out, it is not', () => {
    expect(curveFault(18)).toBe('p');
    expect(curveFault(27 + 0.4)).toBe('p');
    expect(curveFault(3 - 0.4)).toBe('p');
    expect(curveFault(27 + 0.6)).toBeUndefined();
    expect(curveFault(1.0)).toBeUndefined();
  });
});

describe('a point on a stopped profile\'s kept surface is stock (inv 16, P3; T4 fix 1)', () => {
  const bull = () => stopped(spec('roundover', { size: 0.375 }));
  // The section's arc vertex (s = 0, t = 3/8): length 15, width 10, thickness 0.375.
  it('stockProbe: stock on the arc mid-band, air a hair inside the waste', () => {
    const { b } = bull();
    const probe = stockProbe(b);
    expect(probe({ length: 15, width: W, thickness: 0.375 })).toBe(true);
    expect(probe({ length: 15, width: W - 0.375, thickness: T })).toBe(true);
    expect(probe({ length: 15, width: W - 1e-4, thickness: T - 1e-4 })).toBe(false);
  });
  it('stockProbe: stock on the arc inside the run-out (rho - 0.25 on the section arc)', () => {
    const { b, c } = bull();
    const probe = stockProbe(b);
    // An interior vertex of the section's arc (s, t); at u = the side face, rho = sqrt(dr^2 + 0.25^2) = s + 0.25.
    const sec = profileSection(b, c);
    const [sv, tv] = sec.pts.find((q, i) => sec.arc[i] && sec.arc[(i + sec.pts.length - 1) % sec.pts.length] && q[0] > 0.05 && q[1] > 0.05)!;
    const dr = Math.sqrt((sv + BEAR) ** 2 - BEAR ** 2);
    const at = (rho: number) => ({ length: 3 - Math.sqrt(rho ** 2 - BEAR ** 2), width: W, thickness: T - tv });
    expect(probe(at(sv + BEAR))).toBe(true);
    expect(dr).toBeGreaterThan(0);
    expect(probe(at(sv + BEAR - 1e-4))).toBe(false);
  });
});
