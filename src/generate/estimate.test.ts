import { describe, expect, it } from 'vitest';
import type { LlmUsage } from '../llm/types';
import { CHARS_PER_TOKEN, HIGH_OUTPUT_HEADROOM, REPAIR_MESSAGE_TOKENS, costRange, formatCost, formatCostRange, withOptional } from './estimate';

// A price table whose four rates differ, so a token billed at the wrong rate changes the sum.
const price = (u: LlmUsage) => u.inputTokens * 1 + u.outputTokens * 10 + u.cacheReadTokens * 0.1 + u.cacheWriteTokens * 1.25;
const client = { estimateCostUsd: price };
const shape = { prefixChars: 200, messageChars: 100, outputTokens: 20 };

describe('costRange (fu 236)', () => {
  it('the measured constants', () => {
    expect([CHARS_PER_TOKEN, HIGH_OUTPUT_HEADROOM, REPAIR_MESSAGE_TOKENS]).toEqual([2, 2, 300]);
  });

  it('low is one call: the prefix written to the cache, the message as input, the output', () => {
    // 200/2 = 100 prefix tokens at 1.25, 100/2 = 50 input at 1, 20 output at 10.
    expect(costRange(client, shape, 3)!.low).toBe(100 * 1.25 + 50 + 20 * 10);
  });

  it('high is every round: output doubled, the history resent, the prefix read from the cache after the first', () => {
    // out 40 per call. Call 0: in 50, cache write 100. Call k: in 50 + k·(40 + 300), cache read 100.
    const call0 = 50 + 40 * 10 + 100 * 1.25;
    const call1 = 50 + 340 + 40 * 10 + 100 * 0.1;
    const call2 = 50 + 680 + 40 * 10 + 100 * 0.1;
    expect(costRange(client, shape, 3)!.high).toBeCloseTo(call0 + call1 + call2, 9);
  });

  it('one round: high is the low call with doubled output', () => {
    expect(costRange(client, shape, 1)!.high).toBe(100 * 1.25 + 50 + 40 * 10);
  });

  it('high grows with every round allowed, and is never below low', () => {
    const highs = [1, 2, 3, 4].map((r) => costRange(client, shape, r)!.high);
    for (let i = 1; i < highs.length; i++) expect(highs[i]).toBeGreaterThan(highs[i - 1]!);
    expect(highs[0]).toBeGreaterThanOrEqual(costRange(client, shape, 1)!.low);
  });

  it('rounds token counts up', () => {
    expect(costRange(client, { prefixChars: 3, messageChars: 3, outputTokens: 0 }, 1)!.low).toBe(2 * 1.25 + 2);
  });

  it('is null when the model has no price', () => {
    expect(costRange({ estimateCostUsd: () => null }, shape, 3)).toBeNull();
  });
});

describe('withOptional', () => {
  it('adds a call that may not happen to the high end only', () => {
    expect(withOptional({ low: 1, high: 5 }, { low: 2, high: 7 })).toEqual({ low: 1, high: 12 });
  });
  it('null either side is null', () => {
    expect(withOptional(null, { low: 2, high: 7 })).toBeNull();
    expect(withOptional({ low: 1, high: 5 }, null)).toBeNull();
  });
});

describe('formatCostRange', () => {
  it('shows both ends', () => { expect(formatCostRange({ low: 0.05, high: 0.4 })).toBe('≈ $0.05–$0.40'); });
  it('one figure when both ends round alike', () => { expect(formatCostRange({ low: 0.051, high: 0.054 })).toBe('≈ $0.05'); });
});

describe('formatCost (fu 168)', () => {
  it('shows cents', () => { expect(formatCost(0.123)).toBe('≈ $0.12'); });
  it('a run that spent under half a cent never reads as free', () => {
    expect(formatCost(0.004)).toBe('< $0.01');
    expect(formatCost(0.0001)).toBe('< $0.01');
  });
  it('half a cent and up rounds as cents', () => { expect(formatCost(0.005)).toBe('≈ $0.01'); });
});
