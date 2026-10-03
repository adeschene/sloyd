import { describe, expect, it } from 'vitest';
import { DETAIL_CAPS, SYSTEM_PROMPT, limitsOf, repairMessage, userMessage } from './prompt';
import type { GenerateSettings } from './prompt';

const base: GenerateSettings = {
  description: 'A bookcase with five shelves', width: 36, depth: null, height: 72,
  material: 'plywood', style: 'shaker', detail: 'moderate',
};

describe('prompt', () => {
  it('keeps the system prompt free of anything per-run, so it caches', () => {
    expect(SYSTEM_PROMPT).not.toContain('bookcase');
    expect(SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
  it('states hard limits as limits and soft settings as preferences', () => {
    const m = userMessage(base);
    expect(m).toContain('A bookcase with five shelves');
    expect(m).toMatch(/width.*36in/i);
    expect(m).toMatch(/height.*72in/i);
    expect(m).not.toMatch(/depth.*in/i);
    expect(m).toMatch(/at most 30 parts/i);
    expect(m).toMatch(/prefer.*plywood/i);
    expect(m).toMatch(/shaker/i);
  });
  it('omits material and style preferences when they are "any"', () => {
    const m = userMessage({ ...base, material: 'any', style: 'any' });
    expect(m).not.toMatch(/prefer/i);
    expect(m).not.toMatch(/style/i);
  });
  it('maps settings to limits — width X, depth Z, height Y, the detail cap', () => {
    expect(limitsOf(base)).toEqual({ width: 36, depth: null, height: 72, maxParts: DETAIL_CAPS.moderate });
  });
  it('lists every violation in the repair message', () => {
    const m = repairMessage([{ kind: 'overlap', message: 'A passes 1in into B along X.' }, { kind: 'unsupported', message: 'C is not connected.' }]);
    expect(m).toContain('A passes 1in into B along X.');
    expect(m).toContain('C is not connected.');
    expect(m).toMatch(/whole/i);
  });
});
