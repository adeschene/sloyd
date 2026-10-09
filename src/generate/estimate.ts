import type { LlmClient, LlmUsage } from '../llm/types';

/**
 * Before-you-run cost ranges (follow-up 236). The low end is one call; the high end is every
 * round the repair loop allows, each resending the history. Measured 2026-10-09 on the dev server
 * (one Refine of a 14-part design, one Add joinery of 8 sites, Opus):
 * - prompts, schemas and design JSON tokenise at 1.9–2.3 characters per token — not 4;
 * - the system prompt AND the output schema form the cached prefix (2,570 and 1,109 tokens),
 *   billed as a cache write on the first call;
 * - Refine's output, thinking included, was ~0.9 tokens per character of the design; joinery's
 *   ~34 tokens per site with no thinking.
 * Constants are rounded toward the larger bill.
 */
export const CHARS_PER_TOKEN = 2;
/** The high end doubles each call's output: adaptive thinking varies from run to run. */
export const HIGH_OUTPUT_HEADROOM = 2;
/** A repair round's own message (the problems found), added to the resent history. */
export const REPAIR_MESSAGE_TOKENS = 300;

export interface CostRange { low: number; high: number }

/** One call as the estimate sees it: the cached prefix (system prompt + schema), the first user message, the expected output. */
export interface CallShape { prefixChars: number; messageChars: number; outputTokens: number }

const tokens = (chars: number) => Math.ceil(chars / CHARS_PER_TOKEN);

/** `rounds`: the most calls the run can make (1 + MAX_REPAIRS). Null when the model has no price. */
export function costRange(client: Pick<LlmClient, 'estimateCostUsd'>, call: CallShape, rounds: number): CostRange | null {
  const prefix = tokens(call.prefixChars);
  const message = tokens(call.messageChars);
  const usage = (k: number, output: number, history: number): LlmUsage => ({
    inputTokens: message + history,
    outputTokens: output,
    cacheReadTokens: k === 0 ? 0 : prefix,
    cacheWriteTokens: k === 0 ? prefix : 0,
  });
  const low = client.estimateCostUsd(usage(0, call.outputTokens, 0));
  if (low === null) return null;
  const out = call.outputTokens * HIGH_OUTPUT_HEADROOM;
  let high = 0;
  for (let k = 0; k < rounds; k++) high += client.estimateCostUsd(usage(k, out, k * (out + REPAIR_MESSAGE_TOKENS)))!;
  return { low, high };
}

/** A further run that may not happen (Refine's joinery for new meetings): the high end only. */
export function withOptional(range: CostRange | null, extra: CostRange | null): CostRange | null {
  return range && extra ? { low: range.low, high: range.high + extra.high } : null;
}

/** `≈ $0.05–$0.40`, or one figure when both ends show the same cents. */
export function formatCostRange(r: CostRange): string {
  const [lo, hi] = [r.low.toFixed(2), r.high.toFixed(2)];
  return lo === hi ? `≈ $${lo}` : `≈ $${lo}–$${hi}`;
}
