import type { V3 } from '../document/document';
import { candidates as sortedCandidates, centroidFan, insertOnEdges, welder } from './conform';

/**
 * A section cap's fill triangles (world inches, flat xyz triples) from sectionCaps' pieces (invariant 51). Each piece is
 * fanned COUNTER-CLOCKWISE about `capN` (the normal facing the removed side), so the cap is front-facing to the viewer:
 * sectionCaps' world pieces come out clockwise seen from the removed side (every board frame is improper, inv 44 /
 * fu 215), and with DoubleSide a back face has its normal flipped by the shader — lit as from behind. Decided per piece
 * from its own Newell normal, so a future change of hand cannot silently flip it back.
 *
 * `conform` (a curved part, finding 1): the pieces of a split curve's slices meet at T-junctions, which left specks on the
 * cap; every piece then takes the other pieces' vertices lying inside its edges and is fanned from its centroid
 * (conform.ts). Without it — a part without curves — the fan is the one BoardMesh always drew, byte-for-byte.
 */
export function capFill(pieces: readonly V3[][], capN: V3, conform: boolean): number[] {
  // The candidates: every piece's vertices, near-duplicates merged (welder). The pieces themselves are not welded: a
  // cap's pieces share their corners exactly (one local cap, one affine map; measured: no cap crack without it).
  const candidates = conform ? sortedCandidates(welder(pieces.flat()).points) : null;
  const fill: number[] = [];
  for (const poly of pieces) {
    let nx = 0, ny = 0, nz = 0;
    for (let k = 0; k < poly.length; k += 1) {
      const p = poly[k]!, q = poly[(k + 1) % poly.length]!;
      nx += (p[1] - q[1]) * (p[2] + q[2]);
      ny += (p[2] - q[2]) * (p[0] + q[0]);
      nz += (p[0] - q[0]) * (p[1] + q[1]);
    }
    const ring = nx * capN[0] + ny * capN[1] + nz * capN[2] < 0 ? [...poly].reverse() : poly;
    if (candidates) {
      const conformed = insertOnEdges(ring, capN, candidates);
      if (conformed !== ring) {
        for (const [a, b, c] of centroidFan(conformed)) fill.push(...a!, ...b!, ...c!);
        continue;
      }
    }
    for (let k = 1; k + 1 < ring.length; k += 1) fill.push(...ring[0]!, ...ring[k]!, ...ring[k + 1]!);
  }
  return fill;
}
