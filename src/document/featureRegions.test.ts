import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import { archCurve, cornerCurve, defaultBow, spanOf, type ViewCurve } from './curves';
import { runoutReach } from './runout';
import { keptSection } from './sweep';
import { crossSectionOverlaps, featureMeetsBox, featureTouchesEnd, runsOutThrough, shapedFeatures } from './featureRegions';
import { apronArch, endToEnd, loop, stopped } from './sweepFixtures';
import type { ProfileCut, ProfileSide, Region } from './types';

/*
 * Joinery features chunk 2 (spec §3.3, §3.4; P4, P6, P7): one part's shaped features and the region tests the joinery watch
 * reads. Board-local throughout; a curve's (u, v) is uvDims(through), so through 'length' is (width, thickness).
 */
const side = (across: 'length' | 'width', from: 'min' | 'max'): ProfileSide => ({ across, from });
const box = (l: [number, number], w: [number, number], t: [number, number]): Region => ({ length: l, width: w, thickness: t });

// A 1-3/4" square leg, 28" long, its outer arris (width min, thickness max) rounded over 1/4" end to end: a straight
// profile, so a view curve through the length.
const T = 1.75;
const leg = createBoard({ length: 28, width: 1.75, thickness: T, profiles: [endToEnd('p1', side('width', 'min'))] });

describe('shapedFeatures (stored order: curves, straight profiles, swept)', () => {
  it('reads the part through geometryBoard and names each feature', () => {
    const { view, features } = shapedFeatures(leg);
    expect(features).toHaveLength(1);
    expect(features[0]!.word).toBe('roundover profile');
    expect(features[0]!.curve).toBe(view.curves[0]);
    expect(features[0]!.curve!.through).toBe('length');
    expect(features[0]!.swept).toBeUndefined();
  });
  it('a curve, then a straight profile, then a swept one', () => {
    const corner = { id: 'k1', ...cornerCurve({ through: 'thickness', uFrom: 'max', vFrom: 'max', radius: 1 }) };
    const b = createBoard({ length: 30, width: 10, thickness: 0.75, curves: [corner], profiles: [endToEnd('s1', side('width', 'min'), 0.25, 'cove')] });
    expect(shapedFeatures(b).features.map((f) => [f.word, f.curve ? 'curve' : 'swept'])).toEqual([['curve', 'curve'], ['cove profile', 'curve']]);
    // The apron's arch, and its roundover following the arch (swept).
    const a = shapedFeatures(apronArch);
    expect(a.features.map((f) => [f.word, f.curve ? 'curve' : 'swept'])).toEqual([['curve', 'curve'], ['roundover profile', 'swept']]);
    expect(a.features[1]!.swept).toBe(a.view.profiles[0]);
    const o = shapedFeatures(createBoard({ length: 30, width: 10, thickness: 0.75, profiles: [loop('o1', 0.5, 'ogee')] }));
    expect(o.features.map((f) => f.word)).toEqual(['Roman ogee profile']);
  });
  it('a part with no feature has none', () => {
    expect(shapedFeatures(createBoard({ length: 30, width: 5, thickness: 0.75 })).features).toEqual([]);
  });
});

describe('featureMeetsBox (OPEN for curves and straight profiles; P4)', () => {
  const { view, features } = shapedFeatures(leg);
  const f = features[0]!;
  it('a mortise box starting exactly at the cheek (the roundover\'s tangent line) does not meet the roundover', () => {
    expect(featureMeetsBox(view, f, box([10, 14], [0.25, 1.5], [T - 1, T]))).toBe(false);
    // 1e-3 past it, it does (the waste there is 2e-6 thick: above float noise).
    expect(featureMeetsBox(view, f, box([10, 14], [0.25 - 1e-3, 1.5], [T - 1, T]))).toBe(true);
    // A mortise on the other face, flush with the roundover's lower tangent line, does not either.
    expect(featureMeetsBox(view, f, box([10, 14], [0, 1], [0, T - 0.25]))).toBe(false);
  });
  it('a dado box across the flush face meets it', () => {
    expect(featureMeetsBox(view, f, box([10, 10.75], [0, 1.75], [T - 0.375, T]))).toBe(true);
  });
  it('a box only touching an end of the part along `through` does not meet it', () => {
    expect(featureMeetsBox(view, f, box([28, 29], [0, 1.75], [0, T]))).toBe(false);
    expect(featureMeetsBox(view, f, box([28 - 1e-6, 29], [0, 1.75], [0, T]))).toBe(true);
  });
  describe('a stopped roundover (5" to 25" on a 30 × 5 apron\'s front)', () => {
    const s = shapedFeatures(createBoard({ length: 30, width: 5, thickness: 0.75, profiles: [stopped('p1', side('width', 'min'), 5, 25)] }));
    const g = s.features[0]!;
    const reach = runoutReach(s.view, g.curve as ViewCurve);
    const near = (l: [number, number]) => box(l, [0, 0.1], [0.65, 0.75]);
    it('is a view curve with a span', () => {
      expect(spanOf(g.curve!)).toEqual({ lo: 5, hi: 25, stopLo: true, stopHi: true });
      expect(reach).toBeGreaterThan(0.25);
    });
    it('a box just past its stop, inside the run-out allowance, meets it (P4, conservative)', () => {
      expect(featureMeetsBox(s.view, g, near([25 + reach / 2, 25 + reach / 2 + 0.1]))).toBe(true);
      expect(featureMeetsBox(s.view, g, near([5 - reach / 2 - 0.1, 5 - reach / 2]))).toBe(true);
    });
    it('a box past the allowance does not; one starting exactly at it does not either (open)', () => {
      expect(featureMeetsBox(s.view, g, near([25 + reach + 1 / 16, 29]))).toBe(false);
      expect(featureMeetsBox(s.view, g, near([25 + reach, 29]))).toBe(false);
      expect(featureMeetsBox(s.view, g, near([0, 5 - reach]))).toBe(false);
    });
    it('a box inside the run but clear of the cross-section does not', () => {
      expect(featureMeetsBox(s.view, g, box([10, 20], [0.25, 5], [0, 0.75]))).toBe(false);
      expect(featureMeetsBox(s.view, g, box([10, 20], [0.25 - 1e-3, 5], [0, 0.75]))).toBe(true);
    });
  });
  it('a swept profile: its conservative footprint (sweptWasteMeetsBox)', () => {
    const o = shapedFeatures(createBoard({ length: 30, width: 10, thickness: 0.75, profiles: [loop('o1', 0.5, 'ogee')] }));
    const reach = keptSection(o.view, o.features[0]!.swept as ProfileCut).reach;
    expect(featureMeetsBox(o.view, o.features[0]!, box([10, 20], [reach + 1 / 16, 5], [0, 0.75]))).toBe(false);
    expect(featureMeetsBox(o.view, o.features[0]!, box([10, 20], [reach, 5], [0, 0.75]))).toBe(true);   // touching meets (P4)
  });
});

describe('runsOutThrough (P7 condition 2)', () => {
  it('a plain through-length roundover runs out through both ends, along its length only', () => {
    const { view, features } = shapedFeatures(leg);
    expect(runsOutThrough(view, features[0]!, 'length', 'max')).toBe(true);
    expect(runsOutThrough(view, features[0]!, 'length', 'min')).toBe(true);
    expect(runsOutThrough(view, features[0]!, 'width', 'min')).toBe(false);
  });
  it('a profile stopped at the growing end does not run out through it; one stopped only at the far end does', () => {
    const run: ProfileCut['run'] = { start: { side: side('width', 'min'), through: 'min' }, end: { side: side('width', 'min'), from: 'min', at: 20 } };
    const { view, features } = shapedFeatures(createBoard({ length: 28, width: 1.75, thickness: T, profiles: [{ ...endToEnd('p1', side('width', 'min')), run }] }));
    expect(spanOf(features[0]!.curve!)).toEqual({ lo: 0, hi: 20, stopLo: false, stopHi: true });
    expect(runsOutThrough(view, features[0]!, 'length', 'max')).toBe(false);   // stopped at the growing end
    expect(runsOutThrough(view, features[0]!, 'length', 'min')).toBe(true);    // stopped only at the far end
  });
  it('a curve through the thickness never runs out through the length; a swept profile never does', () => {
    const c = shapedFeatures(createBoard({ length: 30, width: 5, thickness: 0.75, curves: [{ id: 'k', ...cornerCurve({ through: 'thickness', uFrom: 'min', vFrom: 'min', radius: 1 }) }] }));
    expect(runsOutThrough(c.view, c.features[0]!, 'length', 'min')).toBe(false);
    expect(runsOutThrough(c.view, c.features[0]!, 'thickness', 'min')).toBe(true);
    const a = shapedFeatures(apronArch);
    expect(runsOutThrough(a.view, a.features[1]!, 'length', 'min')).toBe(false);
  });
});

describe('featureTouchesEnd (P6: the joined end with positive area)', () => {
  const B = { length: 30, width: 5, thickness: 0.75 };
  const one = (c: Parameters<typeof createBoard>[0]) => shapedFeatures(createBoard({ ...B, ...c }));
  it('a rounded corner touches its own end; not the other', () => {
    const { view, features } = one({ curves: [{ id: 'k', ...cornerCurve({ through: 'thickness', uFrom: 'min', vFrom: 'min', radius: 1 }) }] });
    expect(featureTouchesEnd(view, features[0]!, 'length', 'min')).toBe(true);
    expect(featureTouchesEnd(view, features[0]!, 'length', 'max')).toBe(false);
    expect(featureTouchesEnd(view, features[0]!, 'width', 'min')).toBe(true);
    expect(featureTouchesEnd(view, features[0]!, 'width', 'max')).toBe(false);
    // Along `through`, a plain curve runs the whole dimension: it reaches both faces.
    expect(featureTouchesEnd(view, features[0]!, 'thickness', 'max')).toBe(true);
  });
  it('an arch running corner to corner meets the end at a point only: it does not touch it', () => {
    const { view, features } = one({ curves: [{ id: 'k', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 0, span: 30, rise: 0.5 }) }] });
    expect(featureTouchesEnd(view, features[0]!, 'length', 'min')).toBe(false);
    expect(featureTouchesEnd(view, features[0]!, 'length', 'max')).toBe(false);
    expect(featureTouchesEnd(view, features[0]!, 'width', 'min')).toBe(true);
  });
  it('a bow touches both length ends: its end horns lie along each end line for its rise (P6)', () => {
    const { view, features } = one({ curves: [{ id: 'k', ...defaultBow(B) }] });
    expect(featureTouchesEnd(view, features[0]!, 'length', 'min')).toBe(true);
    expect(featureTouchesEnd(view, features[0]!, 'length', 'max')).toBe(true);
  });
  it('a stopped profile along `through` touches an end only when its widened extent reaches it', () => {
    const s = one({ profiles: [stopped('p1', side('width', 'min'), 5, 25)] });
    expect(featureTouchesEnd(s.view, s.features[0]!, 'length', 'min')).toBe(false);
    expect(featureTouchesEnd(s.view, s.features[0]!, 'length', 'max')).toBe(false);
    const reach = runoutReach(s.view, s.features[0]!.curve as ViewCurve);
    const n = one({ profiles: [stopped('p1', side('width', 'min'), reach, 25)] });
    expect(featureTouchesEnd(n.view, n.features[0]!, 'length', 'min')).toBe(true);    // the allowance reaches the end
    const e = one({ profiles: [endToEnd('p1', side('width', 'min'))] });
    expect(featureTouchesEnd(e.view, e.features[0]!, 'length', 'min')).toBe(true);
  });
  it('a swept loop touches every end (its box form, closed)', () => {
    const o = one({ width: 10, profiles: [loop('w1')] });
    expect(o.features[0]!.swept).toBeDefined();
    for (const d of ['length', 'width'] as const) for (const end of ['min', 'max'] as const) expect(featureTouchesEnd(o.view, o.features[0]!, d, end)).toBe(true);
    // Its face max only: the thickness min face is below its depth.
    expect(featureTouchesEnd(o.view, o.features[0]!, 'thickness', 'min')).toBe(false);
    expect(featureTouchesEnd(o.view, o.features[0]!, 'thickness', 'max')).toBe(true);
  });
});

describe('crossSectionOverlaps (P7 condition 3: the curve\'s (u, v); through length is (width, thickness))', () => {
  const { view, features } = shapedFeatures(leg);
  it('a tenon section clear of the roundover does not overlap it; one reaching into it does', () => {
    expect(crossSectionOverlaps(view, features[0]!, [0.5, 0.5], [1.25, 1.25])).toBe(false);
    expect(crossSectionOverlaps(view, features[0]!, [0.25, 0.25], [1.5, 1.75])).toBe(false);   // touches the tangent point
    expect(crossSectionOverlaps(view, features[0]!, [0.1, 0.1], [1.65, 1.65])).toBe(false);   // inside the arc's circle: wood
    expect(crossSectionOverlaps(view, features[0]!, [0.1, 0.1], [1.65, 1.74])).toBe(true);
  });
});
