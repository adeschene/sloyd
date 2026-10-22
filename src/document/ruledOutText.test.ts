import { describe, expect, it } from 'vitest';
import { ruledOutLine } from './ruledOutText';

const base = { enter: 'Shelf', receive: 'Side', butt: false, part: 'Side', feature: 'holes' as const };

describe('ruledOutLine (joinery-holes spec §3.5)', () => {
  it('one kind', () => {
    expect(ruledOutLine({ ...base, kinds: ['mortise-tenon'] })).toBe("Shelf → Side: mortise and tenon ruled out — Side's holes are in the way.");
  });
  it('two kinds', () => {
    expect(ruledOutLine({ ...base, kinds: ['dado', 'stopped-dado'] })).toBe("Shelf → Side: dado and stopped dado ruled out — Side's holes are in the way.");
  });
  it('three kinds', () => {
    expect(ruledOutLine({ ...base, kinds: ['mortise-tenon', 'dado', 'rabbet'] })).toBe("Shelf → Side: mortise and tenon, dado and rabbet ruled out — Side's holes are in the way.");
  });
  it('half-lap is written as is', () => {
    expect(ruledOutLine({ ...base, kinds: ['half-lap'] })).toContain(': half-lap ruled out');
  });
  it('a butt ignores the kinds', () => {
    expect(ruledOutLine({ ...base, butt: true, kinds: ['dado'] })).toBe("Shelf → Side: left as a butt — Side's holes are in the way of every joint.");
  });
});

// Joinery features chunk 2 (P8): every feature word, in both sentences; `are` after `holes`, `is` otherwise.
import { profileWord, type FeatureWord } from './ruledOutText';

describe('ruledOutLine: feature words (P8)', () => {
  const words: [FeatureWord, 'is' | 'are'][] = [
    ['holes', 'are'], ['curve', 'is'], ['roundover profile', 'is'], ['cove profile', 'is'], ['Roman ogee profile', 'is'],
    ['bead profile', 'is'], ['thumbnail profile', 'is'],
  ];
  it.each(words)('%s takes "%s" in both sentences', (feature, verb) => {
    expect(ruledOutLine({ ...base, feature, kinds: ['dado'] })).toBe(`Shelf → Side: dado ruled out — Side's ${feature} ${verb} in the way.`);
    expect(ruledOutLine({ ...base, feature, butt: true, kinds: [] })).toBe(`Shelf → Side: left as a butt — Side's ${feature} ${verb} in the way of every joint.`);
  });
  it('a profile kind\'s word', () => {
    expect(profileWord('roundover')).toBe('roundover profile');
    expect(profileWord('cove')).toBe('cove profile');
    expect(profileWord('ogee')).toBe('Roman ogee profile');
    expect(profileWord('bead')).toBe('bead profile');
    expect(profileWord('thumbnail')).toBe('thumbnail profile');
  });
});

// Joinery features chunk 3: a band's word, `is` in both sentences (§3.5).
describe('ruledOutLine: edge band (chunk 3)', () => {
  it('edge band takes "is" in both sentences', () => {
    expect(ruledOutLine({ ...base, part: 'Shelf', feature: 'edge band', kinds: ['mortise-tenon'] })).toBe("Shelf → Side: mortise and tenon ruled out — Shelf's edge band is in the way.");
    expect(ruledOutLine({ ...base, part: 'Shelf', feature: 'edge band', butt: true, kinds: [] })).toBe("Shelf → Side: left as a butt — Shelf's edge band is in the way of every joint.");
  });
});
