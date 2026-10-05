import type { Board, Span } from './types';
import { FLUSH_EPSILON, clippedRegion, cutsThatRemoveStock } from './cuts';

export interface Tenon { end: 'min' | 'max'; length: number; thickness: number; width: number; cutIds: string[] }

/**
 * Tenons on a board (cut-words spec §3), recognised from its cuts rather than
 * stored, so a hand-made tenon is named as well as one joinery built. At each
 * end of the LENGTH: the stock-removing cuts reaching that end and spanning
 * the same ℓ (≤ half the board, so a full-length edge rabbet never counts),
 * at least two of them, whose union leaves EXACTLY ONE rectangle of the
 * section, smaller than the section.
 */
export function findTenons(board: Board): Tenon[] {
  const L = board.length;
  const out: Tenon[] = [];
  for (const end of ['min', 'max'] as const) {
    const groups: { ell: number; ids: string[]; rects: { w: Span; t: Span }[] }[] = [];
    for (const cut of cutsThatRemoveStock(board)) {
      const r = clippedRegion(board, cut);
      const [lo, hi] = r.length;
      const atEnd = end === 'min' ? lo <= FLUSH_EPSILON : hi >= L - FLUSH_EPSILON;
      if (!atEnd) continue;
      const ell = end === 'min' ? hi : L - lo;
      if (ell > L / 2 + FLUSH_EPSILON) continue;
      const rect = { w: r.width, t: r.thickness };
      const g = groups.find((x) => Math.abs(x.ell - ell) <= FLUSH_EPSILON);
      if (g) { g.ids.push(cut.id); g.rects.push(rect); } else groups.push({ ell, ids: [cut.id], rects: [rect] });
    }
    for (const g of groups) {
      if (g.ids.length < 2) continue;
      const left = remainingRectangle(board.width, board.thickness, g.rects);
      if (!left) continue;
      const full = left.w[0] <= FLUSH_EPSILON && left.w[1] >= board.width - FLUSH_EPSILON &&
        left.t[0] <= FLUSH_EPSILON && left.t[1] >= board.thickness - FLUSH_EPSILON;
      if (full) continue;
      out.push({ end, length: g.ell, thickness: left.t[1] - left.t[0], width: left.w[1] - left.w[0], cutIds: g.ids });
    }
  }
  return out;
}

/** The section [0,W]×[0,T] minus the rectangles, when what remains is exactly one rectangle; else null. */
function remainingRectangle(W: number, T: number, rects: { w: Span; t: Span }[]): { w: Span; t: Span } | null {
  const cuts = (max: number, spans: Span[]) =>
    [...new Set([0, max, ...spans.flat().filter((v) => v > 0 && v < max)])].sort((a, b) => a - b);
  const ws = cuts(W, rects.map((r) => r.w));
  const ts = cuts(T, rects.map((r) => r.t));
  const free: [number, number][] = [];
  for (let i = 0; i < ws.length - 1; i++) {
    for (let j = 0; j < ts.length - 1; j++) {
      const cw = (ws[i] + ws[i + 1]) / 2;
      const ct = (ts[j] + ts[j + 1]) / 2;
      if (!rects.some((r) => cw > r.w[0] && cw < r.w[1] && ct > r.t[0] && ct < r.t[1])) free.push([i, j]);
    }
  }
  if (free.length === 0) return null;
  const i0 = Math.min(...free.map((f) => f[0])), i1 = Math.max(...free.map((f) => f[0]));
  const j0 = Math.min(...free.map((f) => f[1])), j1 = Math.max(...free.map((f) => f[1]));
  if (free.length !== (i1 - i0 + 1) * (j1 - j0 + 1)) return null;
  return { w: [ws[i0], ws[i1 + 1]], t: [ts[j0], ts[j1 + 1]] };
}
