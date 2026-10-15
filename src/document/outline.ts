import type { V3 } from './angleCuts';

/**
 * The boundary of a union of coplanar convex pieces: shared by the section caps (section.ts, invariant 51) and a curved
 * part's edges (bodies.ts' curvedEdges, curves spec §3.3). Imports nothing from bodies.ts or section.ts (both import it).
 */

/** Inches: a point this close to the plane is ON it, and kept. Well above float drift of `position + offset` sums at
 *  furniture scale, far below anything visible. */
export const SECTION_EPS = 1e-7;

/**
 * The boundary of the union of coplanar, disjoint, consistently wound convex pieces in the plane x[li] = const: every
 * piece edge, grouped by its supporting line, with each line's stretches weighted +1 along the line's canonical
 * direction and −1 against it; a stretch whose weights sum to zero is interior (a seam between pocket cells, or one of
 * minusPrism's splits, always meets its twin running the other way) and is dropped. What is left is the cut's outline.
 */
export function unionOutline(pieces: readonly (readonly V3[])[], li: number): [V3, V3][] {
  return outlineOf(pieces, li, false);
}

/**
 * unionOutline with each stretch DIRECTED as the pieces run along it (fu 369): with the pieces wound counter-clockwise
 * in (i, j) — the two axes other than `li`, in index order — the union's outer boundaries run counter-clockwise and its
 * inner ones clockwise, so a caller can chain the stretches into loops and tell the two apart by signed area.
 */
export function unionLoops(pieces: readonly (readonly V3[])[], li: number): [V3, V3][] {
  return outlineOf(pieces, li, true);
}

function outlineOf(pieces: readonly (readonly V3[])[], li: number, directed: boolean): [V3, V3][] {
  const [i, j] = [0, 1, 2].filter((d) => d !== li) as [number, number];
  const plane = pieces[0]?.[0]?.[li] ?? 0;
  interface Line { dx: number; dy: number; c: number; spans: { t0: number; t1: number; w: number }[] }
  const lines: Line[] = [];
  // Lines are bucketed on (dx, dy, c) quantised to their tolerances; a lookup visits the 27 neighbouring cells and takes
  // the EARLIEST-created line within tolerance, which is what a linear first-match scan returned.
  const buckets = new Map<number, number[]>();
  const hash = (x: number, y: number, z: number) => (Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul(z | 0, 83492791)) | 0;
  // Cells are 10x the tolerance, so a value is within tolerance of at most one neighbouring cell, and only when it sits
  // in the cell's outer tenth.
  const QA = 1e-8, QC = SECTION_EPS * 10;
  const qa = (v: number) => Math.floor(v / QA);
  const qc = (v: number) => Math.floor(v / QC);
  // The cell below (-1), the cell itself (0) or the cell above (+1) may hold a match; `lo`/`hi` say which are in reach.
  const reach = (v: number, cell: number, tol: number, out: number[]): number => {
    const q = Math.floor(v / cell), f = v - q * cell;
    out[0] = q;
    if (f <= 2 * tol) { out[1] = q - 1; return 2; }
    if (cell - f <= 2 * tol) { out[1] = q + 1; return 2; }
    return 1;
  };
  const rx: number[] = [0, 0], ry: number[] = [0, 0], rz: number[] = [0, 0];
  const findLine = (dx: number, dy: number, c: number): Line | undefined => {
    let best = -1;
    const nx = reach(dx, QA, 1e-9, rx), ny = reach(dy, QA, 1e-9, ry), nz = reach(c, QC, SECTION_EPS, rz);
    for (let a = 0; a < nx; a += 1) for (let b = 0; b < ny; b += 1) for (let e = 0; e < nz; e += 1) {
      const ids = buckets.get(hash(rx[a]!, ry[b]!, rz[e]!));
      if (!ids) continue;
      for (const id of ids) {
        if (best !== -1 && id > best) break;
        const m = lines[id]!;
        if (Math.abs(m.dx - dx) <= 1e-9 && Math.abs(m.dy - dy) <= 1e-9 && Math.abs(m.c - c) <= SECTION_EPS) { best = id; break; }
      }
    }
    return best === -1 ? undefined : lines[best];
  };
  for (const poly of pieces) {
    for (let n = 0; n < poly.length; n += 1) {
      const p = poly[n]!, q = poly[(n + 1) % poly.length]!;
      let dx = q[i] - p[i], dy = q[j] - p[j];
      const l = Math.hypot(dx, dy);
      if (l <= SECTION_EPS) continue;
      dx /= l; dy /= l;
      let w = 1;
      if (dx < -1e-9 || (Math.abs(dx) <= 1e-9 && dy < 0)) { dx = -dx; dy = -dy; w = -1; }
      const c = -dy * p[i] + dx * p[j];                    // offset along the line's normal (−dy, dx)
      const ta = dx * p[i] + dy * p[j], tb = dx * q[i] + dy * q[j];
      let line = findLine(dx, dy, c);
      if (!line) {
        line = { dx, dy, c, spans: [] };
        const key = hash(qa(dx), qa(dy), qc(c));
        const ids = buckets.get(key);
        if (ids) ids.push(lines.length); else buckets.set(key, [lines.length]);
        lines.push(line);
      }
      line.spans.push({ t0: Math.min(ta, tb), t1: Math.max(ta, tb), w });
    }
  }
  const out: [V3, V3][] = [];
  const at = (m: Line, t: number): V3 => {
    const v: V3 = [0, 0, 0];
    v[li] = plane;
    v[i] = -m.dy * m.c + m.dx * t;
    v[j] = m.dx * m.c + m.dy * t;
    return v;
  };
  for (const m of lines) {
    const ts = m.spans.flatMap((s) => [s.t0, s.t1]).sort((a, b) => a - b);
    const cuts: number[] = [];
    for (const t of ts) if (!cuts.length || t - cuts[cuts.length - 1]! > SECTION_EPS) cuts.push(t);
    // A span is live at mid when t0 < mid < t1: a sweep over starts and ends sorted by t (t0 < t1 always).
    const starts = [...m.spans].sort((a, b) => a.t0 - b.t0);
    const ends = [...m.spans].sort((a, b) => a.t1 - b.t1);
    let si = 0, ei = 0, sum = 0;
    let runStart: number | null = null;
    let runSign = 0;
    // A run against the line's canonical direction is pushed reversed when directed; a change of sign ends a run there.
    const push = (t0: number, t1: number) => out.push(directed && runSign < 0 ? [at(m, t1), at(m, t0)] : [at(m, t0), at(m, t1)]);
    for (let k = 0; k + 1 < cuts.length; k += 1) {
      const mid = (cuts[k]! + cuts[k + 1]!) / 2;
      while (si < starts.length && starts[si]!.t0 < mid) { sum += starts[si]!.w; si += 1; }
      while (ei < ends.length && ends[ei]!.t1 <= mid) { sum -= ends[ei]!.w; ei += 1; }
      const sign = Math.sign(sum);
      if (runStart !== null && (sign === 0 || (directed && sign !== runSign))) { push(runStart, cuts[k]!); runStart = null; }
      if (sign !== 0 && runStart === null) { runStart = cuts[k]!; runSign = sign; }
    }
    if (runStart !== null) push(runStart, cuts[cuts.length - 1]!);
  }
  return out;
}
