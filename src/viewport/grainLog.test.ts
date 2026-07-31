import {
  BANDS, bandOffset, bandRadius, hash, makeHarmonics, seededRandom, wobbleAt,
} from './grainLog';

describe('bandRadius', () => {
  it('puts band zero on the pith line', () => {
    expect(bandRadius(0, 0.6, 0.1)).toBe(0.6);
  });

  it('is the hypotenuse of the cut distance and the in-plane offset', () => {
    expect(bandRadius(3, 4, 1)).toBeCloseTo(5);
  });
});

describe('bandOffset', () => {
  it('spaces bands evenly when the pith does not wander', () => {
    // With no wobble the radius choice cancels exactly: band k lands at k*delta
    // whatever the cut distance. That is what makes the tile seamless.
    for (const d of [0, 0.2, 0.9]) {
      expect(bandOffset(4, d, 0.1, 0)).toBeCloseTo(0.4);
    }
  });

  it('gives straight lines through the pith — quartersawn', () => {
    // d = 0: the wobble term vanishes and every band is exactly k*delta at
    // every point along the grain.
    expect(bandOffset(3, 0, 0.1, 0.4)).toBeCloseTo(0.3);
    expect(bandOffset(3, 0, 0.1, -0.4)).toBeCloseTo(0.3);
  });

  it('closes a band into an arch where the pith wanders past it', () => {
    // The cathedral: band 1 sits 0.1 from the pith line, and a cut that pulls
    // 0.5 further away swallows it entirely.
    expect(bandOffset(1, 0.6, 0.1, 0.5)).toBeNull();
  });

  it('reopens the band once the pith wanders back', () => {
    expect(bandOffset(1, 0.6, 0.1, -0.2)).not.toBeNull();
  });

  it('is symmetric about the pith line', () => {
    expect(bandOffset(-4, 0.6, 0.1, 0.1)).toBe(bandOffset(4, 0.6, 0.1, 0.1));
  });
});

describe('wobbleAt', () => {
  const harmonics = makeHarmonics(seededRandom(hash('test')), 3);

  it('has whole periods across the tile, so the ends meet', () => {
    expect(wobbleAt(0, harmonics)).toBeCloseTo(wobbleAt(1, harmonics));
  });

  it('meets at the same slope, so the join is invisible', () => {
    // Central differences, not one-sided: a forward difference at 0 and a
    // backward difference at 1 carry truncation errors of opposite sign, so
    // at h=1e-6 they add to roughly h*f''(0) (~9e-5 here, with three
    // harmonics up to 4 periods) and swamp a 4-digit comparison. The slopes
    // themselves match exactly — every harmonic has a whole number of
    // periods across the tile. wobbleAt is defined for all reals, so
    // evaluating just outside [0, 1] is legitimate.
    const h = 1e-6;
    const slopeStart = (wobbleAt(h, harmonics) - wobbleAt(-h, harmonics)) / (2 * h);
    const slopeEnd = (wobbleAt(1 + h, harmonics) - wobbleAt(1 - h, harmonics)) / (2 * h);
    expect(slopeStart).toBeCloseTo(slopeEnd, 4);
  });

  it('actually varies', () => {
    expect(wobbleAt(0.37, harmonics)).not.toBeCloseTo(wobbleAt(0.62, harmonics));
  });
});

describe('seededRandom', () => {
  it('is deterministic — the same board looks the same on every load', () => {
    const a = seededRandom(hash('wood:face'));
    const b = seededRandom(hash('wood:face'));
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('differs between seeds', () => {
    expect(seededRandom(hash('wood:face'))()).not.toBe(seededRandom(hash('wood:edge'))());
  });

  it('stays in [0, 1)', () => {
    const r = seededRandom(hash('x'));
    for (let i = 0; i < 200; i += 1) {
      const n = r();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });
});

describe('BANDS', () => {
  it('is even, so the pith line sits at the middle of the tile', () => {
    expect(BANDS % 2).toBe(0);
  });
});
