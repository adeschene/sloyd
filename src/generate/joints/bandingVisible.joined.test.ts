import { describe, expect, it } from 'vitest';
import { designToDocument } from '../../document/generated';
import { flatDocument } from '../../document/document';
import type { BandType, FlatDocument, ProfileSide } from '../../document/document';
import { BUILT_IN_BAND, strips, tapeRuns, visibleRun } from '../../document/banding';
import { applyJoints } from './recipes';
import { defaultChoice } from './choose';
import { findSites } from './sites';

// Joinery features chunk 3 (P12), the metric case: tenons built by `mortiseTenon` itself on mm-derived dimensions
// (`mm / 25.4`, unrounded), so the stored shoulders carry whatever float drift the pocket arithmetic leaves — the 1e-9 end
// tests must still see them reach the ends, the side and both faces (float drift at that test bit fu 416 and P2).

const mm = (v: number) => v / 25.4;
type V3 = [number, number, number];
const part = (name: string, at: V3, size: V3) =>
  ({ name, material: 'oak', at: { x: mm(at[0]), y: mm(at[1]), z: mm(at[2]) }, size: { x: mm(size[0]), y: mm(size[1]), z: mm(size[2]) } });
const maple: BandType = { id: 'm', name: 'Maple edging', kind: 'solid', thickness: mm(6), lengthAllowance: mm(13), material: 'maple', widthAllowance: mm(2) };
const W0: ProfileSide = { across: 'width', from: 'min' };
const W1: ProfileSide = { across: 'width', from: 'max' };

describe('a metric rail\'s strip stops at both shoulders (P12)', () => {
  it('tenoned at both ends through applyJoints, solid edging on one long edge and tape on the other', () => {
    const parts = [part('Leg A', [0, 0, 0], [44, 711, 44]), part('Rail', [44, 597, 13], [457, 89, 19]), part('Leg B', [501, 0, 0], [44, 711, 44])];
    // `exact`: every mm-derived number kept unsnapped (designToDocument snaps to the inch grid otherwise).
    const exact = new Set(parts.flatMap((p) => [...Object.values(p.at), ...Object.values(p.size)]));
    const doc0 = flatDocument(designToDocument({ name: 'T', parts }, { centre: false, exact }).doc);
    const doc: FlatDocument = {
      ...doc0, units: { display: 'metric-mm', precision: 16 }, bandTypes: [BUILT_IN_BAND, maple],
      boards: doc0.boards.map((b) => (b.name === 'Rail' ? { ...b, bands: [{ side: W0, type: 'm' }, { side: W1, type: BUILT_IN_BAND.id }] } : b)),
    };
    const sites = findSites(doc);
    const choices = sites.map((s) => defaultChoice(s, doc, sites));
    expect(choices.map((c) => c.joint)).toEqual(['mortise-tenon', 'mortise-tenon']);
    const out = applyJoints(doc, sites, choices);
    expect(out.skipped).toEqual([]);
    const rail = out.doc.boards.find((b) => b.name === 'Rail')!;
    const before = doc.boards.find((b) => b.name === 'Rail')!;
    const [t0, t1] = choices.map((c) => c.tenonLength!);
    // Preconditions: the mm dimensions survived unsnapped, and the rail grew by both tenons (so a strip over its full
    // length would be wrong by both).
    expect([before.length, before.width, before.thickness]).toEqual([mm(457), mm(89), mm(19)]);
    expect(rail.length).toBeCloseTo(mm(457) + t0! + t1!, 9);
    const run = visibleRun(rail, W0, maple.thickness);
    expect([run.shortLo, run.shortHi]).toEqual([true, true]);
    expect(run.hi - run.lo).toBeCloseTo(mm(457), 9);
    expect(visibleRun(rail, W1, 0)).toMatchObject({ shortLo: true, shortHi: true });
    expect(strips(rail, out.doc.bandTypes)[0]!.finished).toBeCloseTo(mm(457), 9);
    expect(strips(rail, out.doc.bandTypes)[0]!.finished).toBeCloseTo(strips(before, doc.bandTypes)[0]!.finished, 9);
    expect(tapeRuns(rail, out.doc.bandTypes)[0]!.length).toBeCloseTo(mm(457) + BUILT_IN_BAND.lengthAllowance, 9);
  });
});
