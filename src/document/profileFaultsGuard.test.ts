import { describe, expect, it, vi } from 'vitest';

// profilePath throws when an end face does not run into the wood (a degenerate outline; no valid outline was found to
// reach it). profileFaults must never let that reach a reader: it reads as no path, `runs-off`.
vi.mock('./profilePath', async (importOriginal) => {
  const real = await importOriginal<typeof import('./profilePath')>();
  return { ...real, profilePath: () => { throw new Error('profilePath: the end face does not run into the wood'); } };
});

const { profileFaults, geometryBoard } = await import('./profiles');
const { apronArch } = await import('./sweepFixtures');

describe('profileFaults guards profilePath (profile runs b1)', () => {
  it('a throwing path is no path: runs-off, never a throw', () => {
    expect(profileFaults(apronArch, apronArch.profiles[0]!)).toEqual([{ kind: 'runs-off' }]);
    expect(() => geometryBoard(apronArch)).not.toThrow();
  });
});
