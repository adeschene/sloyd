import { describe, expect, it } from 'vitest';
import { buildCutList } from './cutlist';
import { createBoard, createDocument } from './document';
import { BAND_SIDES, BUILT_IN_BAND } from './banding';
import type { Band, BandType, FlatDocument } from './types';

const maple: BandType = { id: 'm', name: 'Maple edging 1/4"', kind: 'solid', thickness: 0.25, lengthAllowance: 0.5, material: 'maple', widthAllowance: 0.0625 };
const W0 = BAND_SIDES[0]!, W1 = BAND_SIDES[1]!, L1 = BAND_SIDES[3]!;
const shelf = (id: string, bands: Band[], over: object = {}) =>
  ({ ...createBoard({ id, name: id, length: 30, width: 12, thickness: 0.75, material: 'plywood' }), bands, ...over });
const flat = (boards: object[], bandTypes: BandType[] = [BUILT_IN_BAND, maple], units?: object): FlatDocument =>
  ({ ...createDocument('T'), boards, bandTypes, ...(units ? { units } : {}) } as FlatDocument);
const rowsOf = (d: FlatDocument) => buildCutList(d).groups.flatMap((g) => g.rows.map((r) => ({ g: g.label, ...r })));
// The groups sort by label, so a maple strip group comes BEFORE the plywood parts: find the part row by its group.
const partRow = (d: FlatDocument) => rowsOf(d).find((r) => r.g.startsWith('Plywood'))!;

describe('the cut list with bands (edge banding spec §4.1, §4.2)', () => {
  it('a document with no bands is unchanged: no notes, no stripIds on any row', () => {
    const d = flat([shelf('a', [])]);
    const list = buildCutList(d);
    expect(list.notes).toEqual([]);
    expect(list.groups[0]!.rows[0]!.stripIds).toEqual([]);
    expect(list.groups[0]!.rows[0]!.dims).toBe('30" × 12"');
  });
  it('a banded part prints its core size, a band line and the header note', () => {
    const d = flat([shelf('a', [{ side: W0, type: 'm' }, { side: W1, type: 'm' }])]);
    const part = rowsOf(d).find((r) => r.names.includes('a'))!;
    expect(part.dims).toBe('30" × 11-1/2"');
    expect(part.setup).toContain('Band: the width min side and the width max side — Maple edging 1/4"; finished 30" × 12"');
    expect(buildCutList(d).notes).toEqual(['Cut sizes are before banding; band before machining — every cut, hole and curve is measured on the banded part.']);
  });
  it('tape at zero thickness: no finished clause, no corner words', () => {
    const d = flat([shelf('a', [{ side: W0, type: 'band-iron-on' }])]);
    expect(rowsOf(d)[0]!.setup).toContain('Band: the width min side — Iron-on veneer');
    expect(rowsOf(d)[0]!.dims).toBe('30" × 12"');
  });
  it('the corner words appear when two adjacent bands with thickness meet and one is solid', () => {
    const d = flat([shelf('a', [{ side: W0, type: 'm' }, { side: L1, type: 'm' }], { cornerRule: 'mitre' })]);
    expect(partRow(d).setup.find((l) => l.startsWith('Band:'))).toBe(
      'Band: the width min side and the length max end — Maple edging 1/4", mitred corners; finished 30" × 12"');
  });
  it('differently banded parts are different rows; alike ones collapse', () => {
    const d = flat([shelf('a', [{ side: W0, type: 'm' }]), shelf('b', [{ side: W0, type: 'm' }]), shelf('c', [{ side: W1, type: 'm' }])]);
    const parts = rowsOf(d).filter((r) => r.g.startsWith('Plywood'));
    expect(parts.map((r) => r.qty).sort()).toEqual([1, 2]);
  });
  it('strip rows: in the edging material\'s group, collapsed, numbered in the one series, no boardIds', () => {
    const d = flat([shelf('a', BAND_SIDES.map((side) => ({ side, type: 'm' }))), shelf('b', BAND_SIDES.map((side) => ({ side, type: 'm' })))]);
    const list = buildCutList(d);
    const mapleGroup = list.groups.find((g) => g.material === 'maple')!;
    expect(mapleGroup.label).toBe('Maple — 13/16"');
    expect(mapleGroup.rows.map((r) => [r.qty, r.dims, r.boardIds.length, r.stripIds.length])).toEqual([[4, '30-1/2" × 1/4"', 0, 4], [4, '12" × 1/4"', 0, 4]]);
    expect(mapleGroup.rows[0]!.setup).toEqual(['Trim flush']);
    const numbers = list.groups.flatMap((g) => g.rows.map((r) => r.number));
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
  });
  it('a mitred strip says so, each end\'s own angle', () => {
    const wide: BandType = { ...maple, id: 'w', name: 'Wide', thickness: 0.5 };
    const d = flat([shelf('a', [{ side: W0, type: 'm' }, { side: L1, type: 'w' }], { cornerRule: 'mitre' })], [BUILT_IN_BAND, maple, wide]);
    const strips = rowsOf(d).filter((r) => r.stripIds.length > 0);
    expect(strips.map((r) => r.setup[0]).sort()).toEqual(['Trim flush; mitre one end 26.6°', 'Trim flush; mitre one end 63.4°']);
  });
  it('a faulted band prints its check and changes no size', () => {
    const d = flat([shelf('a', [{ side: W0, type: 'm' }, { side: W1, type: 'm' }], { width: 0.5 })]);
    const r = rowsOf(d)[0]!;
    expect(r.dims).toBe('30" × 1/2"');
    expect(r.setup.find((l) => l.startsWith('Band:'))).toBe('Band: the width min side and the width max side — Maple edging 1/4" — check: leaves no core');
  });
  it('a band type edit regroups (Review Focus 2)', () => {
    const boards = [shelf('a', [{ side: W0, type: 'm' }])];
    const before = partRow(flat(boards)).dims;
    const after = partRow(flat(boards, [BUILT_IN_BAND, { ...maple, thickness: 0.5 }])).dims;
    expect([before, after]).toEqual(['30" × 11-3/4"', '30" × 11-1/2"']);
  });
  it('rows collapse on the CORE as printed, not the finished size (inv 18; spec §4.1)', () => {
    // Finished widths 12 and 12.031 both print 12"; less a 0.05" band their cores print 11-15/16" and 12": two rows.
    const thin: BandType = { ...maple, id: 't', name: 'Thin', thickness: 0.05 };
    const d = flat([shelf('a', [{ side: W0, type: 't' }]), shelf('b', [{ side: W0, type: 't' }], { width: 12.031 })], [BUILT_IN_BAND, thin]);
    const parts = rowsOf(d).filter((r) => r.g.startsWith('Plywood'));
    expect(parts.map((r) => [r.qty, r.dims])).toEqual([[1, '30" × 12"'], [1, '30" × 11-15/16"']]);
  });
  it('strip rows sort after their material\'s parts: a strip-only group after the part groups, numbers in display order (fix round 1)', () => {
    const d = flat([
      shelf('a', [{ side: W0, type: 'm' }]),
      createBoard({ id: 'r', name: 'Rail', length: 20, width: 2, thickness: 0.75, material: 'maple' }),
    ]);
    const list = buildCutList(d);
    expect(list.groups.map((g) => g.label)).toEqual(['Maple — 3/4"', 'Maple — 13/16"', 'Plywood — 3/4"']);
    const numbers = list.groups.flatMap((g) => g.rows.map((r) => r.number));
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
  });
  it('in a shared group the strip row comes last, even when longer (fix round 1)', () => {
    // A 13/16" maple part 10" long shares the strips' group; the 30-1/2" strip still prints after it.
    const d = flat([
      shelf('a', [{ side: W0, type: 'm' }]),
      createBoard({ id: 'r', name: 'Rail', length: 10, width: 2, thickness: 0.8125, material: 'maple' }),
    ]);
    const g = buildCutList(d).groups.find((x) => x.material === 'maple')!;
    expect(g.rows.map((r) => [r.dims, r.stripIds.length > 0])).toEqual([['10" × 2"', false], ['30-1/2" × 1/4"', true]]);
  });
  it('sheet nesting lays out cores', () => {
    const d = flat([shelf('a', BAND_SIDES.map((side) => ({ side, type: 'm' })))]);
    const ply = buildCutList(d).groups.find((g) => g.material === 'plywood')!;
    const placed = ply.nesting!.sheets[0]!.parts[0]!;
    expect([placed.w, placed.h].sort((x, y) => x - y)).toEqual([11.5, 29.5]);
  });
  it('metric: the band line reads mm', () => {
    const d = flat([shelf('a', [{ side: W0, type: 'm' }])], [BUILT_IN_BAND, maple], { display: 'metric-mm', precision: 16 });
    expect(rowsOf(d).find((r) => r.g.startsWith('Plywood'))!.setup.find((l) => l.startsWith('Band:'))).toBe(
      'Band: the width min side — Maple edging 1/4"; finished 762 × 305 mm');
  });
});
