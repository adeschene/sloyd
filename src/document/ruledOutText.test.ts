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
