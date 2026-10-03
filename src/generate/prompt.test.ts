import { describe, expect, it } from 'vitest';
import { DETAIL_CAPS, SYSTEM_PROMPT, limitsOf, repairMessage, userMessage } from './prompt';
import type { GenerateSettings } from './prompt';

const base: GenerateSettings = {
  description: 'A bookcase with five shelves', width: 36, depth: null, height: 72,
  material: 'plywood', style: 'shaker', detail: 'moderate',
};

describe('prompt', () => {
  it('without a concept, the message is byte-identical to the pre-variety output', () => {
    expect(userMessage(base)).toBe(
      'Design this: A bookcase with five shelves\n\nHard limits:\n- Overall width (X) at most 36in.\n' +
      '- Overall height (Y) at most 72in.\n- At most 30 parts (moderate detail).\n\nPreferences:\n' +
      '- Prefer Plywood (material key "plywood") for most parts.\n' +
      '- Style: Shaker: plain, light, well-proportioned; tapered or square legs; no ornament.',
    );
  });
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
  it('ends with the concept line when given a concept', () => {
    const m = userMessage(base, { title: 'Trestle base', brief: 'Two slab ends and a stretcher.' });
    expect(m.startsWith(userMessage(base))).toBe(true);
    expect(m.endsWith('\n\nDesign this version: Trestle base — Two slab ends and a stretcher.')).toBe(true);
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
  it('states the held and stable rules up front (fu 165)', () => {
    expect(SYSTEM_PROMPT).toContain(
      '- Every part off the floor must be held: resting on a part below it, fitted between two parts that cover at least half of each of its opposite sides, or fastened by its broad face to another part. A part touching only by an edge or its corners is not held.',
    );
    expect(SYSTEM_PROMPT).toContain(
      '- Keep the piece stable: its weight must sit well inside the outline of what touches the floor, so it cannot tip over.',
    );
    const lines = SYSTEM_PROMPT.split('\n');
    const floor = lines.findIndex((l) => l.startsWith('- Every part must connect to the floor'));
    expect(lines[floor + 1].startsWith('- Every part off the floor must be held')).toBe(true);
    expect(lines[floor + 2].startsWith('- Keep the piece stable')).toBe(true);
  });
});
