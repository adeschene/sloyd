import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import type { Board, Dimension, Dovetail, HoleRow } from './types';
import { withDovetails } from './dovetailModel';
import { builtDovetails, dovetailCorners, dovetailFaults, dovetailLayout, jointLineOf, pinWidth } from './dovetails';
import { geometryBoard } from './profiles';
import { boardBodies, boardEdges, bodyVolume, clipConvex, geometryKey, partGeometry, type BodyFace } from './bodies';
import { axisFrame, boardExtents, DIMENSION_ORDER } from './geometry';
import { boardSnapPoints, fromWorld, toWorld } from './snapPoints';
import { drawView, FRONT, ISO, SIDE, TOP, worldBodies } from './drawing';
import { partFeatures } from './featureKeys';
import { curveLineEntries, curveLines } from './curveText';
import { buildDiagrams } from './diagram';
import { buildCutList } from './cutlist';
import { createDocument, flatDocument } from './document';
import { boardHoles } from './holes';
import { intoCurve } from './holeFaults';
import { stockProbe } from './cuts';
import { sectionCaps, type Section, type SectionAxis } from './section';
import { squareSpan } from './curves';
import { partMesh, bodyMesh, boardUVSignature, drawsAsBox, holesMesh } from '../viewport/grainTiling';
import { stockChecks } from './holeFaults';
import { shapedPart } from './profiles';
import { IMPERIAL, type Units } from '../units/length';
import type { V3 } from './angleCuts';
import { expectLapSlab, expectPartition as expectCornerPartition, halfBlindCorner, type HalfBlindCorner } from './dovetailFixtures';

/**
 * Dovetails become geometry (dovetails Task 3; spec §3.2, §3.5; Spec difference 1: round tenons' route — square-span view
 * curves through `geometryBoard`). The planner (Task 4) does not exist yet, so every corner here is built BY HAND:
 * two plain parts, each run out to the other's outside face; the corner, each part's run end and the pins' `outside` face
 * are read off the parts' WORLD boxes (never hard-coded), then `withDovetails` on each.
 */

const METRIC: Units = { display: 'metric-mm', precision: 1 };
type Vec = [number, number, number];

const worldBox = (b: Board): { min: Vec; max: Vec } => {
  const e = boardExtents(b);
  return { min: [...b.position] as Vec, max: [0, 1, 2].map((i) => b.position[i]! + e[i]!) as Vec };
};
const local = (b: Board, w: readonly number[]) => fromWorld(b, w) as Record<Dimension, number>;
const near = (x: number, y: number) => Math.abs(x - y) <= 1e-9;

interface Corner { tails: Board; pins: Board; box: { min: Vec; max: Vec } }

/**
 * Dovetail one corner of two plain parts by hand (the controller's ruling): `tailDim`/`pinDim` the run dimensions. The
 * corner square is the intersection of the two world boxes; each part's `end` is the end of its run dimension the
 * square lies at; the pins' `outside` is the pin part's thickness face where the tail part's END face lies. Tails' depth =
 * the pin part's thickness; pins' depth = the tail part's thickness. Asserts the square is `tT × tP × H` and each part
 * runs out (its end face on the square's far face).
 */
function dovetail(tail: Board, tailDim: Dovetail['dim'], pin: Board, pinDim: Dovetail['dim'], N: number, s: number, p: number): Corner {
  const a = worldBox(tail), b = worldBox(pin);
  const box = { min: [0, 1, 2].map((i) => Math.max(a.min[i]!, b.min[i]!)) as Vec, max: [0, 1, 2].map((i) => Math.min(a.max[i]!, b.max[i]!)) as Vec };
  const ext = [0, 1, 2].map((i) => box.max[i]! - box.min[i]!);
  const H = tail[jointLineOf(tailDim)];
  expect(pin[jointLineOf(pinDim)]).toBe(H);
  expect(ext[0]! * ext[1]! * ext[2]!).toBeCloseTo(tail.thickness * pin.thickness * H, 12);
  const centre = [0, 1, 2].map((i) => (box.min[i]! + box.max[i]!) / 2);
  const endOf = (x: Board, dim: Dovetail['dim']): Dovetail['end'] => (local(x, centre)[dim] > x[dim] / 2 ? 'max' : 'min');
  const tEnd = endOf(tail, tailDim), pEnd = endOf(pin, pinDim);
  // The tail part's end face, at its J and thickness middle, in the pin part's own coordinates.
  const tailEndFace = toWorld(tail, { [tailDim]: tEnd === 'max' ? tail[tailDim] : 0, [jointLineOf(tailDim)]: H / 2, thickness: tail.thickness / 2 } as Record<Dimension, number>);
  const onPin = local(pin, tailEndFace).thickness;
  const outside: 'min' | 'max' = near(onPin, 0) ? 'min' : 'max';
  expect(near(onPin, outside === 'min' ? 0 : pin.thickness)).toBe(true);
  // And the pin part's end face lies on the tail part's outside face (both run out).
  const pinEndFace = toWorld(pin, { [pinDim]: pEnd === 'max' ? pin[pinDim] : 0, [jointLineOf(pinDim)]: H / 2, thickness: pin.thickness / 2 } as Record<Dimension, number>);
  const onTail = local(tail, pinEndFace).thickness;
  expect(near(onTail, 0) || near(onTail, tail.thickness)).toBe(true);
  const t: Dovetail = { id: `d${tEnd}`, dim: tailDim, end: tEnd, role: 'tails', count: N, slope: s, pin: p, depth: pin.thickness };
  const q: Dovetail = { id: `d${pEnd}`, dim: pinDim, end: pEnd, role: 'pins', count: N, slope: s, pin: p, depth: tail.thickness, outside };
  return { tails: withDovetails(tail, [...(tail.dovetails ?? []), t]), pins: withDovetails(pin, [...(pin.dovetails ?? []), q]), box };
}

// ---- World bodies --------------------------------------------------------------------------------------------------

/** A part's bodies as world faces (true outward world normals: the turn table's per-axis sign; no lean here). */
function worldFaces(b: Board): BodyFace[][] {
  const frame = axisFrame(b);
  const W = (v: readonly number[]): V3 => toWorld(b, { length: v[0]!, width: v[1]!, thickness: v[2]! }) as V3;
  const dir = (n: readonly number[]): V3 => [0, 1, 2].map((i) => n[DIMENSION_ORDER.indexOf(frame[i]!.dim)]! * (frame[i]!.reversed ? -1 : 1)) as V3;
  return partGeometry(b).bodies.map((body) => body.faces.map((f) => ({ n: dir(f.n), verts: f.verts.map(W) })));
}
/** `worldBodies`' inside half-spaces of each body (a box's six when it took the box path). */
function insidePlanes(b: Board): { n: V3; d: number }[][] {
  return worldBodies(b).map((wb) => {
    if (!wb.box) return wb.planes.map(({ m, c }) => ({ n: [...m] as V3, d: c }));
    const out: { n: V3; d: number }[] = [];
    for (let i = 0; i < 3; i += 1) {
      const n: V3 = [0, 0, 0]; n[i] = 1;
      const m: V3 = [0, 0, 0]; m[i] = -1;
      out.push({ n, d: -wb.box.min[i]! }, { n: m, d: wb.box.max[i]! });
    }
    return out;
  });
}
const clipAll = (faces: BodyFace[], planes: readonly { n: V3; d: number }[]) => {
  let f = faces;
  for (const h of planes) { f = clipConvex(f, h); if (f.length === 0) break; }
  return f;
};
const vol = (faces: BodyFace[]) => (faces.length >= 4 ? bodyVolume({ box: null, faces }) : 0);
const boxPlanes = (box: { min: Vec; max: Vec }) => [0, 1, 2].flatMap((i) => {
  const n: V3 = [0, 0, 0]; n[i] = 1;
  const m: V3 = [0, 0, 0]; m[i] = -1;
  return [{ n, d: -box.min[i]! }, { n: m, d: box.max[i]! }];
});

/** The partition (spec §10): the two parts' wood inside the corner square is exactly the square (1e-9 relative), and no
 *  tail-part body shares volume with a pin-part body (pairwise, < 1e-12). */
function expectPartition(c: Corner) {
  expect(builtDovetails(c.tails).length).toBeGreaterThan(0);
  expect(builtDovetails(c.pins).length).toBeGreaterThan(0);
  const square = boxPlanes(c.box);
  const ext = [0, 1, 2].map((i) => c.box.max[i]! - c.box.min[i]!);
  const V = ext[0]! * ext[1]! * ext[2]!;
  const inT = worldFaces(c.tails).map((f) => clipAll(f, square)).filter((f) => vol(f) > 0);
  const inP = worldFaces(c.pins).map((f) => clipAll(f, square)).filter((f) => vol(f) > 0);
  const total = [...inT, ...inP].reduce((s, f) => s + vol(f), 0);
  expect(Math.abs(total - V) / V).toBeLessThanOrEqual(1e-9);
  // Not vacuous: the tail part's share is its tails, from the layout by hand — N tails of mean width Te − X/s (Te at the
  // end face, Te − 2X/s at the baseline), X = the pin part's thickness deep, through the tail part's thickness.
  const t = builtDovetails(c.tails).find((d) => d.depth === c.pins.thickness)!;
  const { Te } = dovetailLayout(c.tails[jointLineOf(t.dim)], t.count, t.slope, t.pin);
  const tails = t.count * (Te - t.depth / t.slope) * t.depth * c.tails.thickness;
  const tVol = inT.reduce((s, f) => s + vol(f), 0);
  expect(Math.abs(tVol - tails) / V).toBeLessThanOrEqual(1e-9);
  const pinPlanes = insidePlanes(c.pins);
  let worst = 0;
  for (const f of inT) for (const h of pinPlanes) worst = Math.max(worst, vol(clipAll(f, h)));
  expect(worst).toBeLessThan(1e-12);
}

// ---- Fixtures ------------------------------------------------------------------------------------------------------

/** A drawer (box joints' overlap form, every part run to the outside): Front/Back on edge along X (thickness on Z,
 *  `tFB`), the sides on edge turned 90 along Z (thickness on X, `tS`), `h` tall. */
function drawer(h: number, tFB: number, tS: number, iw = 12, id = 16) {
  const fb = (id_: string, z: number) => createBoard({ id: id_, name: id_, posture: 'on-edge', rotation: 0, length: iw + 2 * tS, width: h, thickness: tFB, position: [0, 0, z] });
  const side = (id_: string, x: number) => createBoard({ id: id_, name: id_, posture: 'on-edge', rotation: 90, length: id + 2 * tFB, width: h, thickness: tS, position: [x, 0, 0] });
  return { f: fb('f', 0), b: fb('b', id + tFB), l: side('l', 0), r: side('r', iw + tS) };
}
/** Dovetail all four corners of a drawer: tails on the sides (their run axis Z ranks first), or on Front/Back when swapped. */
function dovetailedDrawer(h: number, N: number, s: number, p: number, swap = false, tFB = 0.75, tS = 0.5) {
  let { f, b, l, r } = drawer(h, tFB, tS);
  const corners: Corner[] = [];
  for (const [fbKey, sKey] of [['f', 'l'], ['f', 'r'], ['b', 'l'], ['b', 'r']] as const) {
    const parts = { f, b, l, r };
    const fbPart = parts[fbKey], sPart = parts[sKey];
    const c = swap ? dovetail(fbPart, 'length', sPart, 'length', N, s, p) : dovetail(sPart, 'length', fbPart, 'length', N, s, p);
    const [nfb, ns] = swap ? [c.tails, c.pins] : [c.pins, c.tails];
    if (fbKey === 'f') f = nfb; else b = nfb;
    if (sKey === 'l') l = ns; else r = ns;
    corners.push(c);
  }
  // Re-read each corner off the FINAL parts (each part carries both its ends' dovetails).
  const final = { f, b, l, r };
  const pairs = [['f', 'l'], ['f', 'r'], ['b', 'l'], ['b', 'r']] as const;
  return {
    parts: [f, b, l, r],
    corners: corners.map((c, i) => {
      const [fbKey, sKey] = pairs[i]!;
      return swap ? { ...c, tails: final[fbKey], pins: final[sKey] } : { ...c, tails: final[sKey], pins: final[fbKey] };
    }),
  };
}

/** A carcase corner, the tail part turned 90° about its run axis from the drawer's: a FLAT top (length X, width Z = J,
 *  thickness Y) into an UPRIGHT side turned 90 (thickness X, length Y, width Z REVERSED, so J runs the other way in the
 *  world on one part). Swapped: the side takes the tails. */
function carcase(H: number, N: number, s: number, p: number, swap = false): Corner {
  const tTop = 0.75, tSide = 0.625, hSide = 20;
  const top = createBoard({ id: 'top', name: 'Top', posture: 'flat', rotation: 0, length: 18, width: H, thickness: tTop, position: [0, hSide - tTop, 0] });
  const side = createBoard({ id: 'side', name: 'Side', posture: 'upright', rotation: 90, length: hSide, width: H, thickness: tSide, position: [0, 0, 0] });
  return swap ? dovetail(side, 'length', top, 'length', N, s, p) : dovetail(top, 'length', side, 'length', N, s, p);
}

/** A corner where each part runs in along its WIDTH (J = the length, vertical): two upright parts, the second turned 90.
 *  The pins' square span is `through: 'width'`. */
function widthCorner(H: number, N: number, s: number, p: number, swap = false): Corner {
  const tA = 0.5, tB = 0.75;
  const a = createBoard({ id: 'a', name: 'A', posture: 'upright', rotation: 0, length: H, width: 10, thickness: tA, position: [0, 0, 0] });
  const b = createBoard({ id: 'b', name: 'B', posture: 'upright', rotation: 90, length: H, width: 8, thickness: tB, position: [0, 0, 0] });
  return swap ? dovetail(b, 'width', a, 'width', N, s, p) : dovetail(a, 'width', b, 'width', N, s, p);
}

const LAYOUTS: [number, number, number][] = [[6, 4, 8], [4, 3, 6], [3, 1, 8], [152 / 25.4, 4, 7]];
const PINS = [['imperial', pinWidth(IMPERIAL)], ['metric', pinWidth(METRIC)]] as const;

describe('dovetails: the partition (spec §10) — two parts\' wood in the corner square is exactly the square', () => {
  for (const [H, N, s] of LAYOUTS) {
    for (const [units, p] of PINS) {
      for (const swap of [false, true]) {
        const tag = `H ${H.toFixed(4)}, ${N} tails, 1:${s}, ${units} pin${swap ? ', roles swapped' : ''}`;
        it(`a drawer's four corners: ${tag}`, () => {
          for (const c of dovetailedDrawer(H, N, s, p, swap).corners) expectPartition(c);
        });
        it(`a carcase corner, the tail part turned 90° about its run axis: ${tag}`, () => expectPartition(carcase(H, N, s, p, swap)));
        it(`a corner run in along the WIDTH (pins through: 'width'): ${tag}`, () => {
          const c = widthCorner(H, N, s, p, swap);
          expect(geometryBoard(c.pins).curves.filter(squareSpan).every((v) => v.through === 'width')).toBe(true);
          expectPartition(c);
        });
      }
    }
  }
  it('the fixtures cover both ends, both outside faces, both run dimensions and a J reversed in the world', () => {
    const all = [
      ...dovetailedDrawer(6, 4, 8, 0.25).corners, ...dovetailedDrawer(6, 4, 8, 0.25, true).corners,
      carcase(6, 4, 8, 0.25), carcase(6, 4, 8, 0.25, true), widthCorner(6, 4, 8, 0.25), widthCorner(6, 4, 8, 0.25, true),
    ];
    const ds = all.flatMap((c) => [...c.tails.dovetails!, ...c.pins.dovetails!]);
    expect(new Set(ds.map((d) => d.end))).toEqual(new Set(['min', 'max']));
    expect(new Set(ds.filter((d) => d.role === 'pins').map((d) => d.outside))).toEqual(new Set(['min', 'max']));
    expect(new Set(ds.map((d) => d.dim))).toEqual(new Set(['length', 'width']));
    // The carcase: the top's J (width) runs +Z; the side's J (width) runs −Z.
    const c = carcase(6, 4, 8, 0.25);
    const jWorld = (b: Board) => axisFrame(b).find((a) => a.dim === 'width')!;
    expect(jWorld(c.tails).reversed).not.toBe(jWorld(c.pins).reversed);
  });
});

// ---- One drawer for the rest ---------------------------------------------------------------------------------------

const H = 6, N = 4, S = 8, P = 0.25;
const D = dovetailedDrawer(H, N, S, P);
const [front, , left] = D.parts as [Board, Board, Board, Board];
const plain = (b: Board) => withDovetails(b, []);

describe('dovetails: view curves (geometryBoard)', () => {
  it('a dovetail-free part is its own geometry view; a dovetailed one appends one square-span curve per socket', () => {
    const pl = plain(left);
    expect(geometryBoard(pl)).toBe(pl);
    const v = geometryBoard(left);
    // Two ends × (N + 1) pin sockets on the tails part; two ends × N tail sockets on the pins part.
    expect(v.curves).toHaveLength(2 * (N + 1));
    expect(geometryBoard(front).curves).toHaveLength(2 * N);
    expect(v.curves.every((c) => squareSpan(c) && c.id.startsWith('dovetail/') && c.through === 'thickness')).toBe(true);
    expect(geometryBoard(v)).toBe(v);
  });
  it('every boundary is the layout\'s: the tails curve\'s end-face points are dovetailLayout(...).bounds', () => {
    const { bounds } = dovetailLayout(H, N, S, P);
    const v = geometryBoard(left);
    const d = left.dovetails![0]!;
    const e = d.end === 'max' ? left.length : 0;
    const atEnd = v.curves.filter((c) => c.id.startsWith(`dovetail/${d.id}/`))
      .flatMap((c) => [c.start, ...c.segments.map((g) => g.to)]).filter((q) => q[0] === e).map((q) => q[1]);
    expect([...new Set(atEnd)].sort((x, y) => x - y)).toEqual(bounds);
  });
  it('geometryKey and boardUVSignature read the dovetail (inv 15)', () => {
    expect(boardUVSignature(left)).not.toBe(boardUVSignature(plain(left)));
    expect(geometryKey(left)).not.toBe(geometryKey(plain(left)));
    expect(geometryKey(left)).toContain('dovetail/');
  });
  it('a FAULTED dovetail builds nothing: the view is the part itself and the bodies are the plain twin\'s', () => {
    for (const bad of [{ slope: 20 }, { count: 0 }, { count: 12 }, { depth: left.length }]) {
      const b = withDovetails(plain(left), [{ ...left.dovetails![0]!, ...bad }]);
      expect(dovetailFaults(b, b.dovetails![0]!).length).toBeGreaterThan(0);
      expect(geometryBoard(b)).toBe(b);
      expect(boardBodies(b)).toEqual(boardBodies(plain(left)));
    }
  });
});

describe('dovetails: bodies and mesh', () => {
  it('every body of a tails part and a pins part is convex', () => {
    for (const b of [left, front, carcase(6, 4, 8, 0.25).pins, widthCorner(6, 4, 8, 0.25).pins]) {
      const bodies = boardBodies(b);
      expect(bodies.length).toBeGreaterThan(1);
      for (const body of bodies) {
        const verts = body.faces.flatMap((f) => f.verts);
        for (const f of body.faces) {
          const v0 = f.verts[0]!;
          for (const v of verts) expect((v[0]! - v0[0]!) * f.n[0] + (v[1]! - v0[1]!) * f.n[1] + (v[2]! - v0[2]!) * f.n[2]).toBeLessThanOrEqual(1e-9);
        }
      }
    }
  });
  it('the mesh is watertight (curvesWatertight\'s check) for a tails part and a pins part', () => {
    for (const b of [left, front, widthCorner(6, 4, 8, 0.25).pins]) {
      const r = unmatchedEdges(b);
      expect(r.triangles).toBeGreaterThan(0);
      expect(r.unmatched).toBe(0);
    }
  });
});

describe('dovetails: readers that skip squareSpan curves see NO curve on a dovetailed part', () => {
  it('cut-list curve lines and signature, part-diagram curves, feature keys', () => {
    for (const b of [left, front]) {
      expect(curveLines(b, IMPERIAL)).toEqual([]);
      expect(curveLineEntries(b, IMPERIAL)).toEqual([]);
      for (const v of buildDiagrams(b, IMPERIAL)) {
        expect(v.curves).toEqual([]);
        expect(v.curveLines).toEqual([]);
      }
      expect(partFeatures(b, IMPERIAL).filter((f) => f.key.includes(':curve:'))).toEqual([]);
    }
    // curveSignature: a view curve's values carry `span:`; the row key carries none.
    const rows = buildCutList(flatDocument({ ...createDocument('Drawer'), boards: D.parts })).groups.flatMap((g) => g.rows);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.key).not.toContain('span:');
  });
  it('holeFaults.intoCurve: a bore in a pin socket of the tails part meets no curve', () => {
    const d = left.dovetails!.find((x) => x.end === 'max')!;
    const row: HoleRow = { id: 'h', face: 'thickness', from: 'min', diameter: 0.1, depth: 'through', along: 'length', alongFrom: 'min', station: left.length - d.depth / 2, count: 1, pitch: 0, acrossFrom: 'min', inset: H / 2 };
    const b = { ...left, holes: [row] };
    const hs = boardHoles(b);
    expect(hs).toHaveLength(1);
    // Not vacuous: the bore's centre is in the socket (air).
    expect(stockProbe(geometryBoard(b))({ length: hs[0]!.centre[0], width: hs[0]!.centre[1], thickness: left.thickness / 2 })).toBe(false);
    expect(intoCurve(b, hs[0]!)).toBeNull();
  });
});

describe('dovetails: drawings', () => {
  // No drawing code knows about dovetails: `curveDrawEdges` sets an edge's `curve` (the tag's source) only on an ARC chord, and
  // `silhouetteLines` draws only at a SMOOTH outline vertex; a dovetail's outlines are all straight, so neither ever fires
  // (Task 3: a `tenonUntagged`-style exclusion was written, mutation-tested — removing it kept this green — and dropped as dead).
  it('drawView of a dovetailed drawer tags no segment with a curve feature (edges and silhouettes)', () => {
    for (const view of [FRONT, SIDE, TOP, ISO]) {
      const d = drawView(D.parts, view);
      const segs = [...d.visible, ...d.hidden];
      expect(segs.length).toBeGreaterThan(0);
      expect(segs.filter((s) => s.feature?.includes(':curve:'))).toEqual([]);
    }
  });
  it('the dovetailed parts draw their sockets: the tails part draws more lines than its plain twin', () => {
    const lines = (b: Board) => drawView([b], ISO).visible.length;
    expect(lines(left)).toBeGreaterThan(lines(plain(left)));
  });
});

describe('dovetails: snap points (spec §3.5: tail and pin corners at the outside plane; nothing in air)', () => {
  // The left side: on edge, turned 90 (thickness on X REVERSED by on-edge's hand fix, width up Y, length on Z reversed),
  // at the origin, 1/2" thick. Its front end (length = L) is at z = 0. Hand-derived (snapPoints' per-file rule): a tail
  // corner at the end face, J (width) = p = 1/4, thickness 0 → world (t − 0, 1/4, L − L) = (1/2, 1/4, 0).
  const pts = boardSnapPoints(left);
  const has = (at: Vec) => pts.some((q) => q.at.every((v, i) => Math.abs(v - at[i]!) <= 1e-9));
  it('a tails part offers the end-face tail corners (hand-derived, a turned on-edge pose)', () => {
    expect(axisFrame(left)[0]).toEqual({ dim: 'thickness', reversed: true });
    expect(has([0.5, 0.25, 0])).toBe(true);
    expect(pts.find((q) => q.at.every((v, i) => Math.abs(v - [0.5, 0.25, 0][i]!) <= 1e-9))!.kind).toBe('corner');
    // Every tail edge, both faces, both ends.
    const { bounds } = dovetailLayout(H, N, S, P);
    for (const z of [0, left.length]) for (const x of [0, 0.5]) for (const j of bounds.slice(1, -1)) expect(has([x, j, z])).toBe(true);
  });
  it('none in a socket: the end face\'s centre and its box corners are air, and every point offered is on stock', () => {
    expect(has([0.25, H / 2, 0])).toBe(false); // the end face's centre: in the middle pin's socket (N = 4)
    expect(has([0, 0, 0])).toBe(false); // the box corner: in a half pin's socket
    const probe = stockProbe(geometryBoard(left));
    for (const q of pts) expect(probe(local(left, q.at) as never)).toBe(true);
  });
  it('a pins part offers each pin\'s narrow corners on its outside face (end and baseline)', () => {
    const d = front.dovetails!.find((x) => x.end === 'min')!;
    const { bounds } = dovetailLayout(H, N, S, P);
    const fp = boardSnapPoints(front);
    const vo = d.outside === 'max' ? front.thickness : 0;
    for (const j of bounds.slice(1, -1)) {
      for (const run of [0, d.depth]) {
        const w = toWorld(front, { length: run, width: j, thickness: vo });
        expect(fp.some((q) => q.at.every((v, i) => Math.abs(v - w[i]!) <= 1e-9))).toBe(true);
      }
    }
  });
  it('a dovetail-free part\'s snap points are unchanged by the code path (no corners added)', () => {
    expect(boardSnapPoints(plain(left)).length).toBeLessThan(pts.length);
  });
});

describe('dovetails: section caps (each axis, through the joint zone)', () => {
  const capArea = (cap: { pieces: V3[][] } | null) => (cap ? cap.pieces.reduce((s, poly) => s + polyArea(poly), 0) : 0);
  /** The bodies' own cross-section at world `axis` = `at`: each world body clipped there, its faces lying ON the plane. */
  function bodiesSection(b: Board, k: number, at: number): number {
    const n: V3 = [0, 0, 0]; n[k] = 1;
    let area = 0;
    for (const f of worldFaces(b)) {
      for (const face of clipAll(f, [{ n, d: -at }])) if (face.verts.every((v) => Math.abs(v[k]! - at) <= 1e-9)) area += polyArea(face.verts);
    }
    return area;
  }
  const AXES: SectionAxis[] = ['side', 'top', 'front'];
  function check(b: Board, dim: Dimension, localAt: number, expected: number) {
    const k = axisFrame(b).findIndex((a) => a.dim === dim);
    const probe = { length: b.length / 3, width: b.width / 3, thickness: b.thickness / 3, [dim]: localAt } as Record<Dimension, number>;
    const at = toWorld(b, probe)[k]!;
    const s: Section = { axis: AXES[k]!, at, flip: false };
    const cap = sectionCaps(b, s);
    expect(Math.abs(capArea(cap) - expected)).toBeLessThanOrEqual(1e-9 * Math.max(1, expected));
    expect(Math.abs(bodiesSection(b, k, at) - expected)).toBeLessThanOrEqual(1e-9 * Math.max(1, expected));
    // No cap lies in a socket: each piece's centroid is on stock.
    const air = stockProbe(geometryBoard(b));
    for (const poly of cap!.pieces) {
      const c = [0, 1, 2].map((i) => poly.reduce((sum, v) => sum + v[i]!, 0) / poly.length);
      expect(air(local(b, c) as never)).toBe(true);
    }
  }
  const { Te } = dovetailLayout(H, N, S, P);
  it('the tails part: across its run inside the joint, across its thickness, and across J through a pin socket', () => {
    const d = left.dovetails!.find((x) => x.end === 'max')!;
    const x = d.depth / 3; // into the joint from the end face
    check(left, 'length', left.length - x, left.thickness * N * (Te - (2 * x) / S));
    // Across the thickness: the face minus every pin socket (trapezoids) at both ends.
    const w = d.depth / S;
    const sockets = 2 * ((P + (P + w)) / 2) * d.depth + (N - 1) * ((P + (P + 2 * w)) / 2) * d.depth;
    check(left, 'thickness', left.thickness / 2, left.length * H - 2 * sockets);
    // Across J at the middle pin's centre (H / 2): its socket runs the whole depth at both ends.
    check(left, 'width', H / 2, left.thickness * (left.length - 2 * d.depth));
  });
  it('the pins part: across its thickness, across its run inside the joint, and across J through a tail socket', () => {
    const d = front.dovetails!.find((x) => x.end === 'min')!;
    const T = front.thickness;
    const x = T / 4; // across the thickness from the outside face
    check(front, 'thickness', d.outside === 'min' ? x : T - x, front.length * H - 2 * d.depth * N * (Te - (2 * x) / S));
    check(front, 'length', d.depth / 2, H * T - N * ((Te + (Te - (2 * T) / S)) / 2) * T);
    const tailCentre = P + Te / 2;
    check(front, 'width', tailCentre, T * (front.length - 2 * d.depth));
  });
});

// ---- Perf (spec §10, inv 50: the MINIMUM of 9 runs; the bound lowered only, never raised) --------------------------

// 3 × the measured median of the minimum-of-9 (see the describe's comment).
const PERF_BOUND = 23;

describe('dovetails perf: a dovetailed drawer rebuilds inside a frame', () => {
  /**
   * Rebuilding the bodies and edges of a dovetailed drawer's four parts (`boardBodies` + `boardEdges`), the cache bypassed
   * (each run's parts are NEW objects with the length moved by a micro-inch, so neither `geometryBoard`'s memo nor
   * `partGeometry`'s key is hit). Measured 2026-10-27 (this file alone, `-t perf`, `uptime` 1-min load 1.15, no browser),
   * the minimum of 9 over seven runs: 11.91, 7.18, 7.56, 8.01, 7.60, 6.96, 8.22 ms — median 7.60 → 3× = 22.8 → 23 ms.
   * Lowered only, never raised (inv 50).
   */
  let tick = 0;
  const rebuild = () => {
    tick += 1;
    const parts = dovetailedDrawer(H, N, S, P).parts.map((b) => ({ ...b, length: b.length + tick * 1e-6 }));
    const start = performance.now();
    for (const b of parts) { boardBodies(b); boardEdges(b); }
    return performance.now() - start;
  };
  it(`at most ${PERF_BOUND} ms (the minimum of 9)`, () => {
    for (let i = 0; i < 3; i += 1) rebuild();
    const min = Math.min(...Array.from({ length: 9 }, rebuild));
    expect(min).toBeLessThanOrEqual(PERF_BOUND);
  });
});


// ---- Half-blind (half-blind dovetails spec §3.4, §10; Task 1, the proof) -------------------------------------------

/** A half-blind drawer's four corners (`halfBlindCorner`, by hand): tails on the sides, or on Front/Back when swapped. Each
 *  corner is re-read off the FINAL parts (each part carries both its ends' dovetails). */
function halfBlindDrawer(h: number, N: number, s: number, p: number, lap: number, swap = false, tFB = 0.75, tS = 0.5) {
  let { f, b, l, r } = drawer(h, tFB, tS);
  const raw: HalfBlindCorner[] = [];
  const pairs = [['f', 'l'], ['f', 'r'], ['b', 'l'], ['b', 'r']] as const;
  for (const [fbKey, sKey] of pairs) {
    const parts = { f, b, l, r };
    const fbPart = parts[fbKey], sPart = parts[sKey];
    const c = swap ? halfBlindCorner(fbPart, 'length', sPart, 'length', N, s, p, lap) : halfBlindCorner(sPart, 'length', fbPart, 'length', N, s, p, lap);
    const [nfb, ns] = swap ? [c.tails, c.pins] : [c.pins, c.tails];
    if (fbKey === 'f') f = nfb; else b = nfb;
    if (sKey === 'l') l = ns; else r = ns;
    raw.push(c);
  }
  const final = { f, b, l, r };
  return {
    parts: [f, b, l, r],
    corners: raw.map((c, i) => {
      const [fbKey, sKey] = pairs[i]!;
      return swap ? { ...c, tails: final[fbKey], pins: final[sKey] } : { ...c, tails: final[sKey], pins: final[fbKey] };
    }),
  };
}
/** `carcase`'s twin, half-blind: the tail part turned 90° about its run axis from the drawer's. */
function halfBlindCarcase(H: number, N: number, s: number, p: number, lap: number, swap = false): HalfBlindCorner {
  const tTop = 0.75, tSide = 0.625, hSide = 20;
  const top = createBoard({ id: 'top', name: 'Top', posture: 'flat', rotation: 0, length: 18, width: H, thickness: tTop, position: [0, hSide - tTop, 0] });
  const side = createBoard({ id: 'side', name: 'Side', posture: 'upright', rotation: 90, length: hSide, width: H, thickness: tSide, position: [0, 0, 0] });
  return swap ? halfBlindCorner(side, 'length', top, 'length', N, s, p, lap) : halfBlindCorner(top, 'length', side, 'length', N, s, p, lap);
}
/** `widthCorner`'s twin, half-blind: each part runs in along its WIDTH (pins through: 'width'). */
function halfBlindWidthCorner(H: number, N: number, s: number, p: number, lap: number, swap = false): HalfBlindCorner {
  const tA = 0.5, tB = 0.75;
  const a = createBoard({ id: 'a', name: 'A', posture: 'upright', rotation: 0, length: H, width: 10, thickness: tA, position: [0, 0, 0] });
  const b = createBoard({ id: 'b', name: 'B', posture: 'upright', rotation: 90, length: H, width: 8, thickness: tB, position: [0, 0, 0] });
  return swap ? halfBlindCorner(b, 'width', a, 'width', N, s, p, lap) : halfBlindCorner(a, 'width', b, 'width', N, s, p, lap);
}
const expectHalfBlind = (c: HalfBlindCorner) => {
  expectCornerPartition(c.tails, c.pins, c.box);
  expectLapSlab(c.tails, c.pins, c.slab);
};

const LAPS = [0.25, 3 / 16, 6 / 25.4];

describe('half-blind: the partition with a lap (spec §3.4, §10)', () => {
  for (const [H_, N_, s] of LAYOUTS) {
    for (const lap of LAPS) {
      for (const swap of [false, true]) {
        const tag = `H ${H_.toFixed(4)}, ${N_} tails, 1:${s}, lap ${lap.toFixed(4)}${swap ? ', roles swapped' : ''}`;
        it(`a drawer's four corners: ${tag}`, () => {
          for (const c of halfBlindDrawer(H_, N_, s, P, lap, swap).corners) expectHalfBlind(c);
        });
        it(`a carcase corner, the tail part turned 90° about its run axis: ${tag}`, () => expectHalfBlind(halfBlindCarcase(H_, N_, s, P, lap, swap)));
        it(`a corner run in along the WIDTH (pins through: 'width'): ${tag}`, () => {
          const c = halfBlindWidthCorner(H_, N_, s, P, lap, swap);
          expect(geometryBoard(c.pins).curves.filter(squareSpan).every((v) => v.through === 'width')).toBe(true);
          expectHalfBlind(c);
        });
      }
    }
  }
  it('the fixtures cover both ends, both outside faces, both run dimensions, a J reversed in the world, and both world sides of the shortened end', () => {
    const all = [
      ...halfBlindDrawer(6, 4, 8, 0.25, 0.25).corners, ...halfBlindDrawer(6, 4, 8, 0.25, 0.25, true).corners,
      halfBlindCarcase(6, 4, 8, 0.25, 0.25), halfBlindCarcase(6, 4, 8, 0.25, 0.25, true),
      halfBlindWidthCorner(6, 4, 8, 0.25, 0.25), halfBlindWidthCorner(6, 4, 8, 0.25, 0.25, true),
    ];
    const ds = all.flatMap((c) => [...c.tails.dovetails!, ...c.pins.dovetails!]);
    expect(new Set(ds.map((d) => d.end))).toEqual(new Set(['min', 'max']));
    expect(new Set(ds.filter((d) => d.role === 'pins').map((d) => d.outside))).toEqual(new Set(['min', 'max']));
    expect(new Set(ds.map((d) => d.dim))).toEqual(new Set(['length', 'width']));
    expect(ds.every((d) => d.lap === 0.25)).toBe(true);
    // The slab lies on the world-min side of the corner box on some corners and the world-max side on others.
    const sides = new Set(all.map((c) => {
      const k = [0, 1, 2].find((i) => c.slab.min[i] !== c.box.min[i] || c.slab.max[i] !== c.box.max[i])!;
      return c.slab.max[k] === c.box.min[k] ? 'min' : 'max';
    }));
    expect(sides).toEqual(new Set(['min', 'max']));
  });
});

// One half-blind drawer for the rest: tails on the sides, the front and back the pins parts.
const LAP = 0.25;
const HB = halfBlindDrawer(H, N, S, P, LAP);
const [hbFront, hbBack] = HB.parts as [Board, Board, Board, Board];

describe('half-blind: view curves, bodies and mesh', () => {
  it('a half-blind pins socket\'s outline runs from the lap plane to the inside face (same span and ids as through)', () => {
    const d = hbFront.dovetails!.find((x) => x.end === 'min')!;
    const T = hbFront.thickness;
    const vo = d.outside === 'max' ? T : 0, vi = d.outside === 'max' ? 0 : T;
    const vl = d.outside === 'max' ? T - LAP : LAP;
    const curves = geometryBoard(hbFront).curves.filter((c) => c.id.startsWith(`dovetail/${d.id}/`));
    expect(curves).toHaveLength(N);
    for (const c of curves) {
      const vs = new Set([c.start, ...c.segments.map((g) => g.to)].map((q) => q[1]));
      expect(vs).toEqual(new Set([vl, vi]));
      expect(vs.has(vo)).toBe(false);
    }
  });
  it('every body of a half-blind pins part is convex', () => {
    for (const b of [hbFront, hbBack, halfBlindCarcase(6, 4, 8, 0.25, 3 / 16).pins, halfBlindWidthCorner(6, 4, 8, 0.25, 6 / 25.4).pins, halfBlindDrawer(6, 4, 8, 0.25, 0.25, true).parts[2]!]) {
      expect(builtDovetails(b).some((d) => d.role === 'pins' && d.lap !== undefined)).toBe(true);
      const bodies = boardBodies(b);
      expect(bodies.length).toBeGreaterThan(1);
      for (const body of bodies) {
        const verts = body.faces.flatMap((f) => f.verts);
        for (const f of body.faces) {
          const v0 = f.verts[0]!;
          for (const v of verts) expect((v[0]! - v0[0]!) * f.n[0] + (v[1]! - v0[1]!) * f.n[1] + (v[2]! - v0[2]!) * f.n[2]).toBeLessThanOrEqual(1e-9);
        }
      }
    }
  });
  it('the mesh is watertight (curvesWatertight\'s check) for half-blind pins parts and their tails partners', () => {
    for (const b of [...HB.parts, halfBlindCarcase(6, 4, 8, 0.25, 3 / 16).pins, halfBlindWidthCorner(6, 4, 8, 0.25, 6 / 25.4).pins, halfBlindDrawer(152 / 25.4, 4, 7, 0.25, 6 / 25.4, true).parts[3]!]) {
      const r = unmatchedEdges(b);
      expect(r.triangles).toBeGreaterThan(0);
      expect(r.unmatched).toBe(0);
    }
  });
});

describe('half-blind: section caps through the joint zone (each axis)', () => {
  const capArea = (cap: { pieces: V3[][] } | null) => (cap ? cap.pieces.reduce((s, poly) => s + polyArea(poly), 0) : 0);
  function bodiesSection(b: Board, k: number, at: number): number {
    const n: V3 = [0, 0, 0]; n[k] = 1;
    let area = 0;
    for (const f of worldFaces(b)) {
      for (const face of clipAll(f, [{ n, d: -at }])) if (face.verts.every((v) => Math.abs(v[k]! - at) <= 1e-9)) area += polyArea(face.verts);
    }
    return area;
  }
  const AXES: SectionAxis[] = ['side', 'top', 'front'];
  function check(b: Board, dim: Dimension, localAt: number, expected: number) {
    const k = axisFrame(b).findIndex((a) => a.dim === dim);
    const probe = { length: b.length / 3, width: b.width / 3, thickness: b.thickness / 3, [dim]: localAt } as Record<Dimension, number>;
    const at = toWorld(b, probe)[k]!;
    const cap = sectionCaps(b, { axis: AXES[k]!, at, flip: false });
    expect(Math.abs(capArea(cap) - expected)).toBeLessThanOrEqual(1e-9 * Math.max(1, expected));
    expect(Math.abs(bodiesSection(b, k, at) - expected)).toBeLessThanOrEqual(1e-9 * Math.max(1, expected));
    const air = stockProbe(geometryBoard(b));
    for (const poly of cap!.pieces) {
      const c = [0, 1, 2].map((i) => poly.reduce((sum, v) => sum + v[i]!, 0) / poly.length);
      expect(air(local(b, c) as never)).toBe(true);
    }
  }
  const { Te } = dovetailLayout(H, N, S, P);
  it('the pins part: across its thickness in the lap and behind it, across its run inside the joint, across J through a tail socket', () => {
    const d = hbFront.dovetails!.find((x) => x.end === 'min')!;
    const T = hbFront.thickness;
    const X = T - LAP;
    const fromOutside = (x: number) => (d.outside === 'min' ? x : T - x);
    // In the lap: the whole face, uncut.
    check(hbFront, 'thickness', fromOutside(LAP / 2), hbFront.length * H);
    // Behind the lap, y = x − lap from the lap plane: each socket Te − 2y/S wide, `depth` long, N per end, two ends.
    const x = LAP + X / 3;
    check(hbFront, 'thickness', fromOutside(x), hbFront.length * H - 2 * d.depth * N * (Te - (2 * (x - LAP)) / S));
    // Across the run inside the joint: the section minus N trapezoids X deep.
    check(hbFront, 'length', d.depth / 2, H * T - N * ((Te + (Te - (2 * X) / S)) / 2) * X);
    // Across J at a tail's centre: the socket at each end is X thick, `depth` long.
    check(hbFront, 'width', P + Te / 2, T * hbFront.length - 2 * d.depth * X);
  });
});

describe('half-blind: edges and snap points (the lap is unbroken; corners on the lap plane)', () => {
  const d = hbFront.dovetails!.find((x) => x.end === 'min')!;
  const T = hbFront.thickness;
  const vo = d.outside === 'max' ? T : 0;
  const vl = d.outside === 'max' ? T - LAP : LAP;
  const { bounds } = dovetailLayout(H, N, S, P);
  const inZone = (q: Record<Dimension, number>) => q.length <= d.depth + 1e-9 || q.length >= hbFront.length - d.depth - 1e-9;
  it('no edge lies on the outside face except the part\'s own outline', () => {
    const segs = boardEdges(hbFront);
    const onFace = segs.filter(([a, b]) => near(a.thickness, vo) && near(b.thickness, vo));
    expect(onFace.length).toBeGreaterThan(0);
    const onOutline = ([a, b]: (typeof segs)[number]) =>
      (near(a.length, 0) && near(b.length, 0)) || (near(a.length, hbFront.length) && near(b.length, hbFront.length))
      || (near(a.width, 0) && near(b.width, 0)) || (near(a.width, H) && near(b.width, H));
    expect(onFace.filter((s) => !onOutline(s))).toEqual([]);
    // Not vacuous: the through twin draws its sockets on that face.
    const through = withDovetails(hbFront, hbFront.dovetails!.map(({ lap: _l, ...x }) => x));
    expect(boardEdges(through).filter(([a, b]) => near(a.thickness, vo) && near(b.thickness, vo) && !onOutline([a, b])).length).toBeGreaterThan(0);
  });
  it('no snap point on the outside face inside the joint zone (off the outline); each pins corner is on the lap plane', () => {
    const pts = boardSnapPoints(hbFront).map((q) => local(hbFront, q.at));
    const onFace = pts.filter((q) => near(q.thickness, vo) && inZone(q));
    for (const q of onFace) {
      expect(bounds.slice(1, -1).some((j) => near(q.width, j))).toBe(false);
      const interior = q.width > 1e-9 && q.width < H - 1e-9 && q.length > 1e-9 && q.length < hbFront.length - 1e-9;
      expect(interior).toBe(false);
    }
    const corners = dovetailCorners(hbFront, d);
    expect(corners).toHaveLength(2 * (2 * N));
    for (const c of corners) expect(c.thickness).toBe(vl);
    // Each one is offered.
    for (const c of corners) expect(pts.some((q) => DIMS3.every((k) => near(q[k], c[k])))).toBe(true);
  });
});
const DIMS3: Dimension[] = ['length', 'width', 'thickness'];

// ---- Helpers -------------------------------------------------------------------------------------------------------

function polyArea(poly: readonly (readonly number[])[]): number {
  const a: V3 = [0, 0, 0];
  for (let i = 1; i + 1 < poly.length; i += 1) {
    const p0 = poly[0]!, p1 = poly[i]!, p2 = poly[i + 1]!;
    const u = [p1[0]! - p0[0]!, p1[1]! - p0[1]!, p1[2]! - p0[2]!], v = [p2[0]! - p0[0]!, p2[1]! - p0[1]!, p2[2]! - p0[2]!];
    a[0] += u[1]! * v[2]! - u[2]! * v[1]!; a[1] += u[2]! * v[0]! - u[0]! * v[2]!; a[2] += u[0]! * v[1]! - u[1]! * v[0]!;
  }
  return Math.hypot(a[0], a[1], a[2]) / 2;
}

/** curvesWatertight.test.ts's check, restated (a test module is never imported): every DIRECTED edge of every triangle,
 *  at the Float32 numbers the GPU receives, matched by as many copies of its reverse. */
function unmatchedEdges(board: Board): { triangles: number; unmatched: number } {
  const { bodies, holes } = partGeometry(board);
  const count = new Map<string, number>();
  let triangles = 0;
  for (const body of bodies) expect(drawsAsBox(board, body, holes)).toBe(false);
  const meshes = shapedPart(geometryBoard(board)) ? [partMesh(board, bodies, holes).positions] : bodies.map((body) => bodyMesh(board, body, holes, bodies).positions);
  const h = holesMesh(board, holes, bodies, stockChecks(board));
  if (h) meshes.push(h.positions);
  for (const p of meshes) {
    const key = (i: number) => `${p[3 * i]},${p[3 * i + 1]},${p[3 * i + 2]}`;
    for (let t = 0; t < p.length / 9; t += 1) {
      triangles += 1;
      const k = [key(3 * t), key(3 * t + 1), key(3 * t + 2)];
      for (let e = 0; e < 3; e += 1) {
        const edge = `${k[e]}|${k[(e + 1) % 3]}`;
        count.set(edge, (count.get(edge) ?? 0) + 1);
      }
    }
  }
  let unmatched = 0;
  for (const [edge, n] of count) {
    const [a, b] = edge.split('|');
    if ((count.get(`${b}|${a}`) ?? 0) !== n) unmatched += 1;
  }
  return { triangles, unmatched };
}
