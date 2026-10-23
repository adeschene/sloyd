import { describe, expect, it } from 'vitest';
import type { Band, BandType, Board, Posture, Rotation } from './types';
import { BUILT_IN_BAND, BUILT_IN_BAND_ID, sameBands } from './bandModel';
import { builtInCatalog, catalogOf } from './materials';
import { chiralPart } from './turnFixtures';
import { bandsFor, mintBandTypes, worldBands } from './bandWorld';
import { localToDir } from './taperWorld';

const POSTURES: Posture[] = ['flat', 'on-edge', 'upright'];
const TURNS: Rotation[] = [0, 90, 180, 270];
const ALL: Band[] = [
  { side: { across: 'width', from: 'min' }, type: BUILT_IN_BAND_ID },
  { side: { across: 'width', from: 'max' }, type: 't-a' },
  { side: { across: 'length', from: 'min' }, type: 't-a' },
  { side: { across: 'length', from: 'max' }, type: BUILT_IN_BAND_ID },
];
const banded = (posture: Posture, rotation: Rotation): Board => ({ ...chiralPart(posture), cuts: [], rotation, position: [3, 5, 7], bands: ALL });
const solid = (id: string, name: string, material: string, thickness: number): BandType =>
  ({ id, name, kind: 'solid', thickness, lengthAllowance: 0.5, material, widthAllowance: 0.0625 });
const cat = builtInCatalog();
const idOf = (k: string) => (k === 'veneer' ? BUILT_IN_BAND_ID : k);
const ok = (r: ReturnType<typeof bandsFor>): Band[] => { if ('fault' in r) throw new Error(r.fault); return r.bands; };

describe('worldBands / bandsFor', () => {
  it('round trips every posture x rotation', () => {
    for (const p of POSTURES) for (const t of TURNS) {
      const b = banded(p, t);
      const w = worldBands(b);
      expect(w).toHaveLength(4);
      expect(new Set(w.map((x) => x.edge)).size).toBe(4);
      expect(sameBands(ok(bandsFor(b, w, idOf)), b.bands)).toBe(true);
    }
  });
  it('names the built-in type veneer and others by id', () => {
    const w = worldBands(banded('flat', 0));
    expect(w.map((x) => x.edging).sort()).toEqual(['t-a', 't-a', 'veneer', 'veneer']);
  });
  it('an edge on the thickness axis is a fault', () => {
    const b = banded('flat', 0);
    const dir = localToDir(b, 'thickness', 'min');
    expect(bandsFor(b, [{ edge: dir, edging: 'veneer' }], idOf)).toEqual({ fault: `has edging on a broad face (${dir})` });
  });
  it('two entries on one side are a fault', () => {
    const b = banded('upright', 90);
    const dir = localToDir(b, 'width', 'max');
    expect(bandsFor(b, [{ edge: dir, edging: 'veneer' }, { edge: dir, edging: 't-a' }], idOf)).toEqual({ fault: `has two edgings on ${dir}` });
  });
});

describe('mintBandTypes', () => {
  const base = [BUILT_IN_BAND as BandType];
  it('mints an Oak type for solid oak, once for two keys', () => {
    const r = mintBandTypes(['solid oak', 'solid oak'], base, cat);
    expect(r.types).toHaveLength(2);
    const t = r.types[1]!;
    expect(t).toMatchObject({ kind: 'solid', material: 'oak', thickness: 0.25, name: 'Oak edging' });
    expect(r.idOf('solid oak')).toBe(t.id);
  });
  it('mints nothing for veneer or an existing id', () => {
    const r = mintBandTypes(['veneer', 't-a'], [...base, solid('t-a', 'A', 'maple', 0.5)], cat);
    expect(r.types).toHaveLength(2);
    expect(r.idOf('veneer')).toBe(BUILT_IN_BAND_ID);
    expect(r.idOf('t-a')).toBe('t-a');
  });
  it('does not reuse a 3/4in Oak type, and avoids its name', () => {
    const r = mintBandTypes(['solid oak'], [...base, solid('thick', 'Oak edging', 'oak', 0.75)], cat);
    expect(r.types).toHaveLength(3);
    expect(r.idOf('solid oak')).not.toBe('thick');
    expect(r.types[2]!.name).toBe('Oak edging 2');
  });
  it('reuses a 1/4in Oak type of any name', () => {
    const r = mintBandTypes(['solid oak'], [...base, solid('mine', 'Trim', 'oak', 0.25)], cat);
    expect(r.types).toHaveLength(2);
    expect(r.idOf('solid oak')).toBe('mine');
  });
  it('names a custom material type by its label', () => {
    const c = catalogOf({ materials: [{ id: 'm-s-abc', label: 'Walnut Burl', color: '#112233', kind: 'solid' }] });
    const r = mintBandTypes(['solid m-s-abc'], base, c);
    expect(r.types[1]).toMatchObject({ material: 'm-s-abc', name: 'Walnut Burl edging' });
  });
  it('idOf throws on a key it was never given', () => {
    expect(() => mintBandTypes([], base, cat).idOf('veneer')).toThrow();
  });
});
