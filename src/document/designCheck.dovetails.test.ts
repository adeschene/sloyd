import { describe, expect, it } from 'vitest';
import { createBoard, createDocument, flatDocument, type FlatDocument } from './document';
import { checkDesign, contactRegions, contactSolids, realBodied, type DesignLimits } from './designCheck';
import { applyDovetails, builtDovetails, dovetailFaults, dovetailPlan, type DovetailPlan } from './dovetails';
import { dovetailsOf, withDovetails } from './dovetailModel';
import { boardExtents } from './geometry';
import { worldParts } from './tree';
import type { Board, Dovetail, SloydDocument } from './types';

/**
 * The design check reads dovetails (dovetails spec §5.3, the user's ruling 2026-10-27; inv 38, 39): a part with a BUILT
 * dovetail is measured on its real bodies (overlap), and its contacts are its wood behind each baseline plus, per tail or pin,
 * the box INSCRIBED at its narrowest span. No new kind of support: the fixtures below must pass on inv 39's rules as written.
 */

const NO_LIMITS: DesignLimits = { width: null, depth: null, height: null, maxParts: 100 };
const ok = (p: DovetailPlan | string): DovetailPlan => {
  if (typeof p === 'string') throw new Error(`refused: ${p}`);
  return p;
};
const flat = (doc: SloydDocument): FlatDocument => flatDocument(doc);
const docOf = (boards: Board[]): SloydDocument => ({ ...createDocument('Dovetails'), boards });
const part = (doc: SloydDocument, id: string) => worldParts(doc).find((b) => b.id === id)!;
/** The document with plain root part `id` replaced (these fixtures hold no Shapes: asserted). */
const withPart = (doc: SloydDocument, id: string, fn: (b: Board) => Board): SloydDocument => ({
  ...doc,
  boards: doc.boards.map((b) => {
    if (b.id !== id) return b;
    expect('shape' in b).toBe(false);
    return fn(b as Board);
  }),
});

/** A butt drawer on the floor (the planner's fixture): Front/Back on edge along X between the sides, which run along Z. */
function drawer(): SloydDocument {
  const h = 6, tS = 0.5, tFB = 0.75, iw = 12, id = 16;
  const fb = (id_: string, name: string, z: number) => createBoard({
    id: id_, name, posture: 'on-edge', rotation: 0, length: iw, width: h, thickness: tFB, position: [tS, 0, z],
  });
  const side = (id_: string, name: string, x: number) => createBoard({
    id: id_, name, posture: 'on-edge', rotation: 90, length: id + 2 * tFB, width: h, thickness: tS, position: [x, 0, 0],
  });
  const doc = docOf([fb('f', 'Front', 0), fb('b', 'Back', id + tFB), side('l', 'Side left', 0), side('r', 'Side right', iw + tS)]);
  return applyDovetails(doc, ok(dovetailPlan(doc, ['f', 'b', 'l', 'r'], { slope: 8, count: null, swap: false })));
}

/** A carcass: two upright sides 3/4 × 11 × 30 (thickness on X, width on Z) under a flat top 3/4 × 11 × 24 spanning their
 *  outside faces, the top OFF the floor; dovetailed with the TAILS on the top (it runs along X, ranking before the sides'
 *  Y, so it takes tails by default). */
function carcass(): SloydDocument {
  const side = (id: string, name: string, x: number) => createBoard({
    id, name, posture: 'upright', rotation: 90, length: 30, width: 11, thickness: 0.75, position: [x, 0, 0],
  });
  const top = createBoard({ id: 't', name: 'Top', posture: 'flat', rotation: 0, length: 24, width: 11, thickness: 0.75, position: [0, 29.25, 0] });
  const doc = docOf([side('l', 'Side left', 0), side('r', 'Side right', 23.25), top]);
  return applyDovetails(doc, ok(dovetailPlan(doc, ['l', 'r', 't'], { slope: 8, count: null, swap: false })));
}

const shared = (p: { min: number[]; max: number[] }, q: { min: number[]; max: number[] }, k: number) =>
  Math.min(p.max[k]!, q.max[k]!) - Math.max(p.min[k]!, q.min[k]!);

describe('the design check reads dovetails (spec §5.3)', () => {
  it('the fixtures are what they say: the carcass top has the tails, off the floor, and every dovetail builds', () => {
    const doc = carcass();
    const top = part(doc, 't');
    expect(dovetailsOf(top).map((d) => d.role)).toEqual(['tails', 'tails']);
    expect(top.position[1]).toBeGreaterThan(0);
    expect(boardExtents(part(doc, 'l'))).toEqual([0.75, 30, 11]);
    for (const b of [...worldParts(doc), ...worldParts(drawer())]) {
      expect(dovetailsOf(b).length).toBeGreaterThan(0);
      expect(builtDovetails(b).length).toBe(dovetailsOf(b).length);
      expect(realBodied(b)).toBe(true);
    }
  });

  it('a dovetailed four-sided drawer on the floor checks clean', () => {
    expect(checkDesign(flat(drawer()), NO_LIMITS)).toEqual([]);
  });

  it('a carcass dovetailed with the tails on the top checks clean: each tail rests on the pins\' baseline', () => {
    expect(checkDesign(flat(carcass()), NO_LIMITS)).toEqual([]);
  });

  it('the contact boxes of every corner never interpenetrate (pairwise ≤ 1e-9)', () => {
    for (const doc of [drawer(), carcass()]) {
      const parts = worldParts(doc);
      for (let i = 0; i < parts.length; i += 1) {
        for (let j = 0; j < i; j += 1) {
          for (const p of contactSolids(parts[i]!)) {
            for (const q of contactSolids(parts[j]!)) {
              expect(Math.min(...[0, 1, 2].map((k) => shared(p, q, k)))).toBeLessThanOrEqual(1e-9);
            }
          }
        }
      }
    }
  });

  it('the inscribed spans, by hand: a tail at its baseline, a pin and a half pin at the outside face', () => {
    // The carcass's left corner: H = 11 (Z), p = 1/4, s = 8, depth = 3/4 both ways. The tail count is read back (Auto);
    // every span below is computed here from H, p, N, s and depth, never through `dovetailLayout`.
    const doc = carcass();
    const top = part(doc, 't');
    const side = part(doc, 'l');
    const tails = dovetailsOf(top).find((d) => d.end === 'min')!;
    const N = tails.count;
    const H = 11, p = 0.25, s = 8, depth = 0.75;
    expect([tails.pin, tails.slope, tails.depth, tails.dim]).toEqual([p, s, depth, 'length']);
    const Te = (H - (N + 1) * p) / N;
    // Top: tails k on width (J) at length [0, 3/4], full thickness.
    const topEnd = contactRegions(top).filter((r) => r.length[1] <= depth + 1e-12).map((r) => r.width).sort((a, b) => a[0] - b[0]);
    expect(topEnd.length).toBe(N);
    topEnd.forEach(([lo, hi], k) => {
      expect(lo).toBeCloseTo(p + k * (Te + p) + depth / s, 12);
      expect(hi).toBeCloseTo(p + k * (Te + p) + Te - depth / s, 12);
    });
    // Side: pins k (half pins at 0 and N) on width at length [30 − 3/4, 30], their outside-face spans.
    const sideEnd = contactRegions(side).filter((r) => r.length[0] >= 30 - depth - 1e-12).map((r) => r.width).sort((a, b) => a[0] - b[0]);
    expect(sideEnd.length).toBe(N + 1);
    sideEnd.forEach(([lo, hi], k) => {
      expect(lo).toBeCloseTo(k === 0 ? 0 : p + (k - 1) * (Te + p) + Te, 12);
      expect(hi).toBeCloseTo(k === N ? H : p + k * (Te + p), 12);
    });
    // Behind the baseline: the rest of each part, whole.
    expect(contactRegions(side).filter((r) => r.length[1] <= 30 - depth + 1e-12)).toEqual([
      { length: [0, 30 - depth], width: [0, 11], thickness: [0, 0.75] },
    ]);
  });

  it('a corner whose one side is resized along J by 1/2" (its dovetail no longer matches) reports an overlap there', () => {
    // H 6 → 6 1/2 does not FAULT the dovetail (6 1/2 is wide enough), it rebuilds a different layout: misaligned wood.
    const doc = drawer();
    const resized = withPart(doc, 'l', (b) => ({ ...b, width: b.width + 0.5 }));
    const l = part(resized, 'l');
    expect(builtDovetails(l).length).toBe(dovetailsOf(l).length);
    const v = checkDesign(flat(resized), NO_LIMITS);
    expect(v.map((x) => x.kind)).toEqual(['overlap', 'overlap']);
    expect(v.every((x) => x.parts.includes('Side left'))).toBe(true);
    expect(v.map((x) => x.parts.find((n) => n !== 'Side left')).sort()).toEqual(['Back', 'Front']);
  });

  it('a faulted dovetail builds nothing, so its part checks exactly as its dovetail-free twin (and overlaps its partner)', () => {
    const doc = drawer();
    const fault = (b: Board) => withDovetails(b, dovetailsOf(b).map((d, i): Dovetail => (i === 0 ? { ...d, slope: 13 } : d)));
    const faulted = withPart(doc, 'f', fault);
    const f = part(faulted, 'f');
    const first = dovetailsOf(f)[0]!;
    expect(dovetailFaults(f, first)).toEqual(['slope']);
    expect(builtDovetails(f).length).toBe(dovetailsOf(f).length - 1);
    // The twin: that one dovetail removed (the other still builds).
    const twin = withPart(doc, 'f', (b) => withDovetails(b, dovetailsOf(b).slice(1)));
    const v = checkDesign(flat(faulted), NO_LIMITS);
    expect(v).toEqual(checkDesign(flat(twin), NO_LIMITS));
    expect(v.filter((x) => x.kind === 'overlap').length).toBe(1);
    expect(v.find((x) => x.kind === 'overlap')!.parts).toContain('Front');
    // And the whole part faulted: it is not real-bodied at all (`realBodied` reads BUILT dovetails, never stored ones).
    const all = withDovetails(f, dovetailsOf(f).map((d) => ({ ...d, slope: 13 })));
    expect(realBodied(all)).toBe(false);
    expect(contactRegions(all)).toEqual([{ length: [0, all.length], width: [0, all.width], thickness: [0, all.thickness] }]);
  });
});
