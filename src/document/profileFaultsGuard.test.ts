import { describe, expect, it, vi } from 'vitest';

// profilePath returns null for no path (an untraceable outline, or an end face that does not run into the wood): that reads
// `runs-off`. Any THROW from it is a real bug and must surface, never read as "runs off" (review minor 2).
let impl: (() => unknown) | null = null;
vi.mock('./profilePath', async (importOriginal) => {
  const real = await importOriginal<typeof import('./profilePath')>();
  return { ...real, profilePath: (...args: Parameters<typeof real.profilePath>) => (impl ? impl() : real.profilePath(...args)) };
});

const { profileFaults, geometryBoard } = await import('./profiles');
const { apronArch } = await import('./sweepFixtures');

describe('profileFaults reads profilePath (profile runs b1)', () => {
  it('a null path is no path: runs-off', () => {
    impl = () => null;
    expect(profileFaults(apronArch, apronArch.profiles[0]!)).toEqual([{ kind: 'runs-off' }]);
    impl = null;
  });
  it('a throwing path surfaces: a bug is never read as runs-off', () => {
    impl = () => { throw new Error('a real bug'); };
    expect(() => profileFaults(apronArch, apronArch.profiles[0]!)).toThrow('a real bug');
    // Final review I1 (the user's ruling): the view decides whether a swept-shaped End to end falls back to straight from
    // its swept faults, so it now asks for the path — and a bug surfaces there too, never read as a fallback.
    expect(() => geometryBoard({ ...apronArch })).toThrow('a real bug');
    impl = null;
  });
});
