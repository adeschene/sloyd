import * as THREE from 'three';
import { axisFrame, boardExtents, createBoard, defaultArch, fromWorldOffset, mm, partGeometry, solidWorldBox, toWorldOffset } from '../document/document';
import type { Board, Cut } from '../document/document';
import { BUILT_IN_BAND, BUILT_IN_BAND_ID } from '../document/banding';
import type { BandType, ProfileSide } from '../document/types';
import { faceOutline, sideStretch } from '../document/profilePath';
import { bodyMesh, boardUVOffset, boardUVs } from './grainTiling';
import { bandedMesh, bandLooks, bandViewSignature, type MeshData } from './bandFaces';

const W1: ProfileSide = { across: 'width', from: 'max' };
const W0: ProfileSide = { across: 'width', from: 'min' };
const maple = (t = 0.25, material = 'maple'): BandType => ({ id: 'm', name: 'Maple edging', kind: 'solid', thickness: t, lengthAllowance: 0.5, material, widthAllowance: 0.0625 });
const types = (...more: BandType[]): BandType[] => [BUILT_IN_BAND, ...more];

const panel = (extra: Partial<Board> = {}) => createBoard({ id: 'p1', length: 30, width: 11.25, thickness: 0.75, material: 'plywood', ...extra });
const taped = (extra: Partial<Board> = {}) => panel({ bands: [{ side: W1, type: BUILT_IN_BAND_ID }], ...extra });

const meshesOf = (b: Board): MeshData[] => {
  const { bodies } = partGeometry(b);
  return bodies.map((x) => bodyMesh(b, x, [], bodies));
};
/** The summed area of group `materialIndex`'s triangles. */
function paintedArea(m: MeshData, materialIndex: number): number {
  const g = m.groups.find((x) => x.materialIndex === materialIndex);
  if (!g) return 0;
  let area = 0;
  for (let k = g.start; k < g.start + g.count; k += 3) {
    const p = (j: number, a: number) => m.positions[3 * (k + j) + a]!;
    const e1 = [0, 1, 2].map((a) => p(1, a) - p(0, a)), e2 = [0, 1, 2].map((a) => p(2, a) - p(0, a));
    area += Math.hypot(e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!) / 2;
  }
  return area;
}
const vertexCount = (ms: readonly MeshData[]) => ms.reduce((s, m) => s + m.positions.length / 3, 0);

/** Every vertex of group `index` as board-local (length, width, thickness), through fromWorldOffset (inv 44). */
function localVerts(b: Board, m: MeshData, materialIndex: number): { local: Record<string, number>; uv: [number, number] }[] {
  const g = m.groups.find((x) => x.materialIndex === materialIndex);
  if (!g) return [];
  const ext = boardExtents(b);
  const frame = axisFrame(b);
  const out: { local: Record<string, number>; uv: [number, number] }[] = [];
  for (let k = g.start; k < g.start + g.count; k += 1) {
    const local: Record<string, number> = {};
    for (let a = 0; a < 3; a += 1) local[frame[a]!.dim] = fromWorldOffset(b, a, m.positions[3 * k + a]! + ext[a]! / 2);
    out.push({ local, uv: [m.uvs[2 * k]!, m.uvs[2 * k + 1]!] });
  }
  return out;
}

describe('bandFaces (edge banding chunk 2, Q2/Q3)', () => {
  it('a tape band paints its side only', () => {
    const b = taped();
    const ins = meshesOf(b);
    const out = bandedMesh(b, bandLooks(b, types()), ins);
    const g = out.groups.find((x) => x.materialIndex === 6);
    expect(g).toMatchObject({ count: 6 });
    for (const v of localVerts(b, out, 6)) expect(v.local.width).toBeCloseTo(11.25, 5);
    expect(out.positions.length / 3).toBe(vertexCount(ins));
    expect(out.uvs.length / 2).toBe(vertexCount(ins));
    // groups in BoxGeometry order, then the look; flat, the width is world Z, so +Z (4) moved whole and is skipped
    expect(out.groups.map((x) => x.materialIndex)).toEqual([0, 1, 2, 3, 5, 6]);
    expect(paintedArea(out, 6)).toBeCloseTo(30 * 0.75, 4);
  });

  it('the look', () => {
    expect(bandLooks(taped(), types())).toEqual([{ side: W1, material: 'plywood', family: 'plywood', kind: 'face' }]);
    const solid = panel({ bands: [{ side: W1, type: 'm' }] });
    expect(bandLooks(solid, types(maple()))).toEqual([{ side: W1, material: 'maple', family: 'wood', kind: 'edge' }]);
    const pine = taped({ material: 'pine' });
    expect(bandLooks(pine, types())).toEqual([{ side: W1, material: 'pine', family: 'wood', kind: 'edge' }]);
  });

  it('UVs follow the side', () => {
    const b = taped();
    const out = bandedMesh(b, bandLooks(b, types()), meshesOf(b));
    const vs = localVerts(b, out, 6);
    expect(vs).toHaveLength(6);
    for (const v of vs) expect(v.uv[1] - v.local.thickness! / 16).toBeCloseTo(0, 6);
    const consts = (sigma: number) => vs.map((v) => v.uv[0] - (sigma * v.local.length!) / 24);
    const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
    const ok = [1, -1].filter((s) => spread(consts(s)) < 1e-6);
    expect(ok).toHaveLength(1);
    // the board's own u offset rides on u (inv 12): width-max runs CCW from length max to 0, so u = (30 − l)/24 + ou
    expect(consts(-1)[0]!).toBeCloseTo(30 / 24 + boardUVOffset(b.id)[0], 5);
  });

  it('a turned part', () => {
    const b = taped({ posture: 'upright', rotation: 90 });
    const out = bandedMesh(b, bandLooks(b, types()), meshesOf(b));
    const vs = localVerts(b, out, 6);
    expect(vs).toHaveLength(6);
    for (const v of vs) expect(v.local.width).toBeCloseTo(11.25, 5);
  });

  it('a dado facing the banded side keeps the part\'s look', () => {
    // A dado running along the length: its walls face ±width, one of them toward the banded side.
    const dado: Cut = { id: 'c1', face: 'thickness', from: 'max', across: 'length', offset: 5, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
    const b = taped({ cuts: [dado] });
    expect(partGeometry(b).bodies.length).toBeGreaterThan(1);
    const out = bandedMesh(b, bandLooks(b, types()), meshesOf(b));
    // The bodies are a slab under the dado and two strips beside it (pocketCells' merge), so the side is TWO rectangles —
    // both on the side, both painted, together exactly its area; the +width dado wall (width 5) stays the part's.
    const vs = localVerts(b, out, 6);
    expect(vs).toHaveLength(12);
    for (const v of vs) expect(v.local.width).toBeCloseTo(11.25, 5);
    expect(paintedArea(out, 6)).toBeCloseTo(30 * 0.75, 4);
  });

  it('a triangle on the side plane facing INTO the part is not painted', () => {
    // The band triangles again, wound backwards (two vertices swapped): on the side's chord, normal −width.
    const b = taped();
    const ins = meshesOf(b);
    const first = bandedMesh(b, bandLooks(b, types()), ins);
    const g = first.groups.find((x) => x.materialIndex === 6)!;
    const pos = first.positions.slice(g.start * 3, (g.start + g.count) * 3);
    const uvs = first.uvs.slice(g.start * 2, (g.start + g.count) * 2);
    for (let t = 0; t < g.count; t += 3) {
      for (let a = 0; a < 3; a += 1) { const k = (t + 1) * 3 + a, l = (t + 2) * 3 + a; const x = pos[k]!; pos[k] = pos[l]!; pos[l] = x; }
    }
    // Their slot: the −width world face (flat, turn 0: width is +Z, so group 5).
    const axis = axisFrame(b).findIndex((a) => a.dim === 'width');
    const inward = axis * 2 + (axisFrame(b)[axis]!.reversed ? 0 : 1);
    const reversed: MeshData = { positions: pos, uvs, groups: [{ start: 0, count: g.count, materialIndex: inward }] };
    const before = first.groups.find((x) => x.materialIndex === inward)!.count;
    const out = bandedMesh(b, bandLooks(b, types()), [...ins, reversed]);
    expect(out.groups.find((x) => x.materialIndex === 6)!.count).toBe(6);
    expect(out.groups.find((x) => x.materialIndex === inward)!.count).toBe(before + 6);
  });

  it('a sliver of the broad face along the side is not painted', () => {
    // A sliver along the side's top arris whose three vertices all lie within tol of the side's chord in plan, tipped so that
    // one winding's normal leans a little toward +width: mostly ±thickness, so it is not the band's either way round.
    const b = taped();
    const ext = boardExtents(b);
    const frame = axisFrame(b);
    const tol = 8 * 2 ** -23 * Math.max(...ext);
    const world = (l: Record<string, number>) => [0, 1, 2].map((a) => toWorldOffset(b, a, l[frame[a]!.dim]!) - ext[a]! / 2);
    const A = world({ length: 30, width: 11.25, thickness: 0.75 });
    const B = world({ length: 0, width: 11.25, thickness: 0.75 });
    const C = world({ length: 0, width: 11.25 - tol / 2, thickness: 0.75 - tol / 8 });
    const sliver: MeshData = { positions: new Float32Array([...A, ...B, ...C, ...A, ...C, ...B]), uvs: new Float32Array(12), groups: [{ start: 0, count: 6, materialIndex: 2 }] };
    const out = bandedMesh(b, bandLooks(b, types()), [...meshesOf(b), sliver]);
    expect(out.groups.find((x) => x.materialIndex === 6)!.count).toBe(6);
  });

  it('a metric part paints too', () => {
    const b = taped({ length: mm(762), width: mm(305), thickness: mm(19) });
    const out = bandedMesh(b, bandLooks(b, types()), meshesOf(b));
    expect(out.groups.find((x) => x.materialIndex === 6)?.count).toBe(6);
  });

  it('an arched tape side', () => {
    const base = panel();
    const arch = { id: 'a1', ...defaultArch(base)!, vFrom: 'max' as const };
    const b = taped({ curves: [arch] });
    const outline = faceOutline(b)!;
    const st = sideStretch(b, outline, W1)!;
    const chords: (typeof outline.chords)[number][] = [];
    for (let i = st.from; ; i = (i + 1) % outline.chords.length) { chords.push(outline.chords[i]!); if (i === st.to) break; }
    expect(chords.some((c) => c.curve === 'a1')).toBe(true);
    const out = bandedMesh(b, bandLooks(b, types()), meshesOf(b));
    const vs = localVerts(b, out, 6);
    expect(vs.length).toBeGreaterThan(6);
    const tol = 8 * 2 ** -23 * Math.max(...boardExtents(b));
    const dist = (p: [number, number], a: readonly number[], c: readonly number[]) => {
      const dx = c[0]! - a[0]!, dy = c[1]! - a[1]!;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]!) * dx + (p[1] - a[1]!) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(p[0] - a[0]! - t * dx, p[1] - a[1]! - t * dy);
    };
    for (const v of vs) {
      const p: [number, number] = [v.local.length!, v.local.width!];
      expect(Math.min(...chords.map((c) => dist(p, c.a, c.b)))).toBeLessThanOrEqual(tol);
    }
    expect(vs.some((v) => v.local.width! < 11.25 - 0.1)).toBe(true);   // the arch's chord faces, not only the flats
    // u runs on without a jump: a point shared by two chords' triangles reads one u (stretch distance on straight chords),
    // and the side spans its straight chords' total length, run end to end.
    const us = new Map<string, number[]>();
    for (const v of vs) {
      const k = [v.local.length!, v.local.width!, v.local.thickness!].map((x) => x.toFixed(5)).join(',');
      us.set(k, [...(us.get(k) ?? []), v.uv[0]]);
    }
    for (const list of us.values()) expect(Math.max(...list) - Math.min(...list)).toBeLessThan(1e-5);
    const total = chords.reduce((acc, c) => acc + Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]), 0);
    const u = vs.map((v) => v.uv[0]);
    expect((Math.max(...u) - Math.min(...u)) * 24).toBeCloseTo(total, 3);
  });

  it('UVs off the band faces are what BoxGeometry drew', () => {
    for (const b of [panel(), panel({ id: 'up', posture: 'upright', rotation: 90 }), panel({ id: 'oe', posture: 'on-edge', rotation: 270, material: 'pine' })]) {
      const [m] = meshesOf(b);
      const ext = boardExtents(b);
      const box = new THREE.BoxGeometry(ext[0], ext[1], ext[2]);
      const bp = box.getAttribute('position');
      const buv = boardUVs(b);
      const key = (x: number, y: number, z: number) => [x, y, z].map((n) => Math.fround(n)).join(',');
      for (let f = 0; f < 6; f += 1) {
        const want = new Map<string, string>();
        for (let k = 4 * f; k < 4 * f + 4; k += 1) want.set(key(bp.getX(k), bp.getY(k), bp.getZ(k)), [buv[2 * k]!, buv[2 * k + 1]!].map(Math.fround).join(','));
        const got = new Map<string, string>();
        const g = m!.groups.find((x) => x.materialIndex === f)!;
        for (let k = g.start; k < g.start + g.count; k += 1) {
          got.set(key(m!.positions[3 * k]!, m!.positions[3 * k + 1]!, m!.positions[3 * k + 2]!), [m!.uvs[2 * k]!, m!.uvs[2 * k + 1]!].join(','));
        }
        expect([...got.entries()].sort(), `${b.id} face ${f}`).toEqual([...want.entries()].sort());
      }
    }
  });

  it('a multi-cell part: every body through bodyMesh draws what its cell\'s BoxGeometry drew, per face (final review 3)', () => {
    // A banded part routes EVERY body through bodyMesh (BoardMesh), so a cut part's cells must keep BoxGeometry's
    // positions and UVs (boardUVs over the cell's box) face by face, or adding a band would move the grain.
    const dado: Cut = { id: 'c1', face: 'thickness', from: 'max', across: 'length', offset: 5, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
    const rabbet: Cut = { id: 'c2', face: 'thickness', from: 'max', across: 'length', offset: 0, width: 0.5, depth: 0.375, stopMin: 0, stopMax: 0 };
    const poses: Partial<Board>[] = [{}, { posture: 'upright', rotation: 90 }, { posture: 'on-edge', rotation: 270, material: 'pine' }];
    let checked = 0;
    for (const cut of [dado, rabbet]) {
      for (const pose of poses) {
        const b = panel({ id: `${cut.id}-${pose.posture ?? 'flat'}`, cuts: [cut], ...pose });
        const { bodies } = partGeometry(b);
        expect(bodies.length, b.id).toBeGreaterThan(1);
        // Positions keyed at 1e-5 (a cell box's corners are its centre ± half its size, summed in doubles); UVs exact.
        const key = (x: number, y: number, z: number) => [x, y, z].map((n) => Math.round(n * 1e5) / 1e5).join(',');
        for (const [i, body] of bodies.entries()) {
          expect(body.box, `${b.id} body ${i}`).toBeDefined();
          const m = bodyMesh(b, body, [], bodies);
          const { center, size } = solidWorldBox(b, body.box!);
          const box = new THREE.BoxGeometry(size[0], size[1], size[2]);
          const bp = box.getAttribute('position');
          const buv = boardUVs(b, body.box!);
          for (let f = 0; f < 6; f += 1) {
            const want = new Map<string, string>();
            for (let k = 4 * f; k < 4 * f + 4; k += 1) {
              want.set(key(bp.getX(k) + center[0], bp.getY(k) + center[1], bp.getZ(k) + center[2]), [buv[2 * k]!, buv[2 * k + 1]!].join(','));
            }
            const got = new Map<string, string>();
            const g = m.groups.find((x) => x.materialIndex === f)!;
            for (let k = g.start; k < g.start + g.count; k += 1) {
              got.set(key(m.positions[3 * k]!, m.positions[3 * k + 1]!, m.positions[3 * k + 2]!), [m.uvs[2 * k]!, m.uvs[2 * k + 1]!].join(','));
              checked += 1;
            }
            expect([...got.entries()].sort(), `${b.id} body ${i} face ${f}`).toEqual([...want.entries()].sort());
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('a faulted band paints nothing', () => {
    const arch = { id: 'a1', ...defaultArch(panel())!, vFrom: 'max' as const };
    const b = panel({ curves: [arch], bands: [{ side: W1, type: 'm' }] });
    expect(bandLooks(b, types(maple()))).toEqual([]);
    expect(bandViewSignature(b, types(maple()))).toBe('');
  });

  it('bandViewSignature', () => {
    expect(bandViewSignature(panel(), types())).toBe('');
    const b = panel({ bands: [{ side: W1, type: 'm' }, { side: W0, type: BUILT_IN_BAND_ID }] });
    const base = bandViewSignature(b, types(maple()));
    expect(base).not.toBe('');
    expect(bandViewSignature(b, types(maple(0.5)))).not.toBe(base);
    expect(bandViewSignature(b, types(maple(0.25, 'walnut')))).not.toBe(base);
    expect(bandViewSignature(b, types(maple()))).toBe(base);
    // the corner rule rides along once a glue line exists
    expect(bandViewSignature({ ...b, cornerRule: 'mitre' }, types(maple()))).not.toBe(base);
  });
});
