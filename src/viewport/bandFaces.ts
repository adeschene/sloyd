/**
 * Edge banding chunk 2 (spec §8; rulings Q2, Q3): how a banded part LOOKS in the viewport. Bands never change a part's bodies
 * (spec §7), so the look is a post-pass over the meshes `bodyMesh`/`partMesh` already built: every triangle lying ON a banded
 * side's outline stretch moves into its own material group (6 + the look's index) and takes UVs that run along the side.
 * A material slot holds every face pointing one way — a dado wall, an internal seam — so painting a slot would paint those
 * too (Q2); a triangle is judged on its own.
 */
import { axisFrame, boardExtents, fromWorldOffset } from '../document/document';
import type { Board } from '../document/document';
import { BAND_SIDES, bandFaults, bandOn, glueLines, sameSide } from '../document/banding';
import { faceOutline, sideStretch, type OutlineChord } from '../document/profilePath';
import type { BandType, ProfileSide } from '../document/types';
import { grainFamily, type GrainFamily, type GrainKind } from './grainFaces';
import { boardUVOffset, tileOf } from './grainTiling';

/** One unfaulted band's look (Q3): tape shows the PART's material with its long-grain texture (plywood and mdf: their face,
 *  no plies), a solid band its own material's edge grain. */
export interface BandLook { side: ProfileSide; material: string; family: GrainFamily; kind: GrainKind }

export type MeshData = { positions: Float32Array; uvs: Float32Array; normals?: Float32Array; groups: { start: number; count: number; materialIndex: number }[] };

/** The part's unfaulted bands with their types, canonical order (a band naming no type contributes nothing, as `banding`). */
function unfaulted(board: Board, types: readonly BandType[]): { side: ProfileSide; type: BandType }[] {
  if (board.bands.length === 0) return [];
  const faults = bandFaults(board, types);
  const out: { side: ProfileSide; type: BandType }[] = [];
  for (const side of BAND_SIDES) {
    const band = bandOn(board.bands, side);
    const type = band && types.find((t) => t.id === band.type);
    if (!type || faults.some((f) => sameSide(f.side, side))) continue;
    out.push({ side, type });
  }
  return out;
}

/** The looks of a part's unfaulted bands, in canonical side order. */
export function bandLooks(board: Board, types: readonly BandType[]): readonly BandLook[] {
  return unfaulted(board, types).map(({ side, type }) => {
    if (type.kind === 'solid') return { side, material: type.material, family: grainFamily(type.material), kind: 'edge' };
    const family = grainFamily(board.material);
    return { side, material: board.material, family, kind: family === 'wood' ? 'edge' : 'face' };
  });
}

/** Everything a banded part's viewport looks and glue lines read beyond `boardUVSignature` (inv 15): each unfaulted band's
 *  side, kind, thickness and (solid) material, plus the corner rule once any glue line exists. '' with neither. The part's
 *  cuts, which decide the visible run and so the glue lines (P12, P14), are not repeated here: BoardMesh's memos key on
 *  `boardUVSignature` too, which carries every cut's geometry. */
export function bandViewSignature(board: Board, types: readonly BandType[]): string {
  const bands = unfaulted(board, types);
  if (bands.length === 0) return '';
  const words = bands.map(({ side, type }) => `${side.across}:${side.from}:${type.kind}:${type.thickness}${type.kind === 'solid' ? `:${type.material}` : ''}`);
  return `${words.join(';')}${glueLines(board, types).length > 0 ? `/${board.cornerRule}` : ''}`;
}

/** A look's stretch, as its chords with the stretch distance at each chord's start (straight chord lengths: the triangles lie
 *  on the model chords, so u runs continuously across a join). */
interface Run { chords: { a: readonly number[]; b: readonly number[]; s0: number; len: number }[] }

function runOf(board: Board, side: ProfileSide): Run | null {
  const outline = faceOutline(board);
  const st = outline ? sideStretch(board, outline, side) : null;
  if (!outline || !st) return null;
  const n = outline.chords.length;
  const chords: Run['chords'] = [];
  let s0 = 0;
  for (let i = st.from; ; i = (i + 1) % n) {
    const c: OutlineChord = outline.chords[i]!;
    const len = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]);
    chords.push({ a: c.a, b: c.b, s0, len });
    s0 += len;
    if (i === st.to) break;
  }
  return { chords };
}

/** Distance from (x, y) to segment ab. */
function segDist(x: number, y: number, a: readonly number[], b: readonly number[]): number {
  const dx = b[0]! - a[0]!, dy = b[1]! - a[1]!;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]!) * dx + (y - a[1]!) * dy) / l2));
  return Math.hypot(x - a[0]! - t * dx, y - a[1]! - t * dy);
}

/**
 * The meshes back to back (groups 0–5 in BoxGeometry order, each mesh's slice in mesh order, as `concatMeshes` lays them),
 * with every triangle lying on look i's side moved into group 6 + i (an empty group skipped) and its UVs rewritten (Q3):
 * u = distance along the side's stretch / tile u + the board's u offset, v = the thickness coordinate / tile v. A triangle
 * belongs to a look when its normal has no thickness component, points away from the part across the side, and all three
 * vertices lie on ONE chord of the side's stretch — judged on FLOAT32 positions, within `8 · 2⁻²³ · max(extents)` (a few
 * ulps of the part's largest coordinate). A chord in two looks' stretches (a corner arc shared by two taped sides) goes to
 * the first look in canonical order. `normals` is in the output only when every input carries it.
 */
export function bandedMesh(board: Board, looks: readonly BandLook[], meshes: readonly MeshData[]): MeshData {
  const ext = boardExtents(board);
  const frame = axisFrame(board);
  const dims = frame.map((a) => a.dim);
  const sign = frame.map((a) => (a.reversed ? -1 : 1));
  const tol = 8 * 2 ** -23 * Math.max(ext[0], ext[1], ext[2]);
  const [ou] = boardUVOffset(board.id);
  const runs = looks.map((l) => runOf(board, l.side));
  const tiles = looks.map((l) => tileOf(l.family, l.kind));
  const withNormals = meshes.length > 0 && meshes.every((m) => m.normals !== undefined);
  const groupsN = 6 + looks.length;

  // Board-local (length, width, thickness) of vertex k of a mesh.
  const local = (pos: Float32Array, k: number, out: Record<string, number>) => {
    for (let a = 0; a < 3; a += 1) out[dims[a]!] = fromWorldOffset(board, a, pos[3 * k + a]! + ext[a]! / 2, frame);
  };
  const v0: Record<string, number> = {}, v1: Record<string, number> = {}, v2: Record<string, number> = {};
  // Which look (and chord) a triangle lies on, or -1.
  const classify = (pos: Float32Array, k: number): [number, number] => {
    if (looks.length === 0) return [-1, -1];
    const ax = pos[3 * k]!, ay = pos[3 * k + 1]!, az = pos[3 * k + 2]!;
    const e1 = [pos[3 * k + 3]! - ax, pos[3 * k + 4]! - ay, pos[3 * k + 5]! - az];
    const e2 = [pos[3 * k + 6]! - ax, pos[3 * k + 7]! - ay, pos[3 * k + 8]! - az];
    const nw = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
    const nl: Record<string, number> = {};
    for (let a = 0; a < 3; a += 1) nl[dims[a]!] = nw[a]! * sign[a]!;
    const len = Math.hypot(nw[0]!, nw[1]!, nw[2]!);
    if (len === 0 || Math.abs(nl.thickness!) > tol * len) return [-1, -1];
    local(pos, k, v0); local(pos, k + 1, v1); local(pos, k + 2, v2);
    for (let i = 0; i < looks.length; i += 1) {
      const run = runs[i];
      if (!run) continue;
      const side = looks[i]!.side;
      if (nl[side.across]! * (side.from === 'max' ? 1 : -1) <= 0) continue;
      for (let c = 0; c < run.chords.length; c += 1) {
        const { a, b } = run.chords[c]!;
        if (segDist(v0.length!, v0.width!, a, b) <= tol && segDist(v1.length!, v1.width!, a, b) <= tol && segDist(v2.length!, v2.width!, a, b) <= tol) return [i, c];
      }
    }
    return [-1, -1];
  };

  // Pass 1: classify every triangle; count vertices per output group.
  const counts = new Array<number>(groupsN).fill(0);
  const marks = meshes.map((m) => {
    const tris: [number, number][] = [];
    for (const g of m.groups) {
      for (let k = g.start; k < g.start + g.count; k += 3) {
        const t = classify(m.positions, k);
        tris.push(t);
        counts[t[0] < 0 ? g.materialIndex : 6 + t[0]]! += 3;
      }
    }
    return tris;
  });
  const total = counts.reduce((s, c) => s + c, 0);
  const positions = new Float32Array(total * 3);
  const uvs = new Float32Array(total * 2);
  const normals = withNormals ? new Float32Array(total * 3) : undefined;
  const groups: MeshData['groups'] = [];
  const at = new Array<number>(groupsN).fill(0);
  let start = 0;
  counts.forEach((count, materialIndex) => {
    if (count === 0) return;
    groups.push({ start, count, materialIndex });
    at[materialIndex] = start;
    start += count;
  });

  // Pass 2: copy each triangle to its group; a band triangle's UVs follow the side.
  const p: Record<string, number> = {};
  meshes.forEach((m, mi) => {
    let t = 0;
    for (const g of m.groups) {
      for (let k = g.start; k < g.start + g.count; k += 3, t += 1) {
        const [look, chord] = marks[mi]![t]!;
        const dest = look < 0 ? g.materialIndex : 6 + look;
        const v = at[dest]!;
        positions.set(m.positions.subarray(3 * k, 3 * k + 9), 3 * v);
        if (normals) normals.set(m.normals!.subarray(3 * k, 3 * k + 9), 3 * v);
        if (look < 0) uvs.set(m.uvs.subarray(2 * k, 2 * k + 6), 2 * v);
        else {
          const c = runs[look]!.chords[chord]!;
          const [tu, tv] = tiles[look]!;
          const dx = (c.b[0]! - c.a[0]!) / c.len, dy = (c.b[1]! - c.a[1]!) / c.len;
          for (let j = 0; j < 3; j += 1) {
            local(m.positions, k + j, p);
            const s = c.s0 + (p.length! - c.a[0]!) * dx + (p.width! - c.a[1]!) * dy;
            uvs[2 * (v + j)] = s / tu + ou;
            uvs[2 * (v + j) + 1] = p.thickness! / tv;
          }
        }
        at[dest] = v + 3;
      }
    }
  });
  return normals ? { positions, uvs, normals, groups } : { positions, uvs, groups };
}
