import Anthropic from '@anthropic-ai/sdk';
import { LlmError } from './types';
import type { LlmClient, LlmMessage, LlmRequest, LlmResult, LlmUsage } from './types';

export const CLAUDE_MODELS: { id: string; label: string }[] = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
];
export const DEFAULT_MODEL = CLAUDE_MODELS[0].id;

/**
 * $ per million tokens. THE one place to update when prices change; the UI
 * labels the result an estimate. Cache writes at 1.25x input.
 */
const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
};

/** Starting value — confirmed or retuned in the browser pass (plan Task 11). */
const EFFORT = 'medium';
/** Streaming, so a large ceiling costs nothing unless used. */
const MAX_TOKENS = 32000;

/** The slice of the SDK this client uses — what lets tests pass a fake. */
type SdkLike = Pick<Anthropic, 'beta'>;

export function toLlmError(e: unknown, signal: AbortSignal): LlmError {
  if (e instanceof LlmError) return e;
  if (signal.aborted || e instanceof Anthropic.APIUserAbortError) return new LlmError('cancelled', 'Cancelled.');
  if (e instanceof Anthropic.APIConnectionError) return new LlmError('network', 'Could not reach the Claude API.');
  if (e instanceof Anthropic.APIError) {
    const status = (e as { status?: number }).status ?? 0;
    if (status === 401 || status === 403) return new LlmError('auth', 'API key was rejected — check Settings.');
    if (status === 429) return new LlmError('rate-limit', 'Rate limited by the Claude API — try again shortly.');
    if (status >= 500) return new LlmError('overloaded', 'The Claude API is overloaded — try again shortly.');
    return new LlmError('other', `The Claude API returned an error (${status}).`);
  }
  return new LlmError('other', e instanceof Error ? e.message : 'Unexpected error.');
}

export class AnthropicClient implements LlmClient {
  private sdk: SdkLike;
  private model: string;

  constructor(apiKey: string, model: string, sdk?: SdkLike) {
    this.model = model;
    // The explicit browser opt-in: this app has no server, the key is the
    // user's own, and it never leaves their browser except to the API.
    this.sdk = sdk ?? new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  }

  userTurn(text: string): LlmMessage {
    return { role: 'user', content: text };
  }

  estimateCostUsd(u: LlmUsage): number | null {
    const p = PRICES[this.model];
    if (!p) return null;
    return (u.inputTokens * p.input + u.outputTokens * p.output +
      u.cacheReadTokens * p.cacheRead + u.cacheWriteTokens * p.cacheWrite) / 1_000_000;
  }

  async complete(req: LlmRequest, signal: AbortSignal): Promise<LlmResult> {
    let message;
    try {
      const stream = this.sdk.beta.messages.stream(
        {
          model: this.model,
          max_tokens: MAX_TOKENS,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          thinking: { type: 'adaptive' },
          output_config: { effort: EFFORT, format: { type: 'json_schema', schema: req.schema } },
          system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
          messages: req.messages as Anthropic.Beta.BetaMessageParam[],
        },
        { signal },
      );
      message = await stream.finalMessage();
    } catch (e) {
      throw toLlmError(e, signal);
    }

    if (message.stop_reason === 'refusal') throw new LlmError('refused', 'The model declined this request.');
    const usage: LlmUsage = {
      inputTokens: message.usage.input_tokens ?? 0,
      outputTokens: message.usage.output_tokens ?? 0,
      cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
    };
    // Verbatim: the whole content, thinking blocks included (spec §4.5).
    const assistantTurn = { role: 'assistant', content: message.content };
    if (message.stop_reason === 'max_tokens') return { json: null, unusable: 'truncated', assistantTurn, usage };
    // Only the answering model's text: with `fallbacks`, a declining model's
    // partial output stays in `content` AHEAD of a `fallback` block, and joining
    // it with the rescued answer would make that answer unparseable. The turn
    // above still carries everything — the server validates the block's position.
    let start = 0;
    message.content.forEach((b, i) => {
      if (b.type === 'fallback') start = i + 1;
    });
    const answer = message.content.slice(start);
    const text = answer.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('');
    try {
      return { json: JSON.parse(text), assistantTurn, usage };
    } catch {
      return { json: null, unusable: 'unparseable', assistantTurn, usage };
    }
  }
}
