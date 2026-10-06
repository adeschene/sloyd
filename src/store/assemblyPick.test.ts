import { clickTarget } from './assemblyPick';

describe('clickTarget (assemblies spec §3.2–3.3)', () => {
  it('at the top level selects the outermost assembly', () => {
    expect(clickTarget('i1/i2/b3', null)).toEqual({ open: null, target: 'i1' });
    expect(clickTarget('r1', null)).toEqual({ open: null, target: 'r1' });
  });
  it('inside, selects one level below the open assembly', () => {
    expect(clickTarget('i1/i2/b3', 'i1')).toEqual({ open: 'i1', target: 'i1/i2' });
    expect(clickTarget('i1/b1', 'i1')).toEqual({ open: 'i1', target: 'i1/b1' });
    expect(clickTarget('i1/i2/b3', 'i1/i2')).toEqual({ open: 'i1/i2', target: 'i1/i2/b3' });
  });
  it('outside, closes to the shared level and selects there', () => {
    expect(clickTarget('r1', 'i1/i2')).toEqual({ open: null, target: 'r1' });
    expect(clickTarget('i1/b1', 'i1/i2')).toEqual({ open: 'i1', target: 'i1/b1' });
  });
});
