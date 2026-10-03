import { describe, expect, it, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicClient, CLAUDE_MODELS, DEFAULT_MODEL, checkAnthropicKey, toLlmError } from './anthropic';

// Error instances built from the SDK's OWN classes without depending on
// their constructor signatures.
const sdkError = (cls: Function, props: Record<string, unknown> = {}) =>
  Object.assign(Object.create(cls.prototype), { message: 'x', ...props });
const live = new AbortController().signal;

describe('toLlmError', () => {
  it.each([
    [sdkError(Anthropic.APIError, { status: 401 }), 'auth'],
    [sdkError(Anthropic.APIError, { status: 403 }), 'auth'],
    [sdkError(Anthropic.APIError, { status: 429 }), 'rate-limit'],
    [sdkError(Anthropic.APIError, { status: 529 }), 'overloaded'],
    [sdkError(Anthropic.APIError, { status: 500 }), 'overloaded'],
    [sdkError(Anthropic.APIError, { status: 400 }), 'other'],
    [sdkError(Anthropic.APIConnectionError), 'network'],
    [sdkError(Anthropic.APIUserAbortError), 'cancelled'],
    [new TypeError('boom'), 'other'],
  ])('maps %o to %s', (e, kind) => {
    expect(toLlmError(e, live).kind).toBe(kind);
  });
  it('carries the API\'s own explanation on an otherwise-unmapped error', () => {
    const e = sdkError(Anthropic.APIError, { status: 400, message: '400 {"type":"invalid_request_error","message":"max_tokens too large"}' });
    const got = toLlmError(e, live);
    expect(got.kind).toBe('other');
    expect(got.message).toContain('max_tokens too large');
  });
  it('words a 5xx as a server error, keeping the retryable kind; 529 stays "overloaded"', () => {
    const e500 = toLlmError(sdkError(Anthropic.APIError, { status: 500 }), live);
    expect(e500.kind).toBe('overloaded');
    expect(e500.message).toMatch(/server error/i);
    expect(e500.message).not.toMatch(/overloaded/i);
    // Regression guard (green before and after): 529 keeps its own wording.
    expect(toLlmError(sdkError(Anthropic.APIError, { status: 529 }), live).message).toMatch(/overloaded/i);
  });
  it.each([
    ['overloaded_error', 'overloaded'],
    ['rate_limit_error', 'rate-limit'],
  ])('maps a mid-stream error (no status) by its typed `type` %s to %s', (type, kind) => {
    expect(toLlmError(sdkError(Anthropic.APIError, { status: undefined, type }), live).kind).toBe(kind);
  });
  it('reports anything after an abort as cancelled', () => {
    const c = new AbortController();
    c.abort();
    expect(toLlmError(new TypeError('x'), c.signal).kind).toBe('cancelled');
  });
});

function fakeSdk(message: Record<string, unknown>) {
  const stream = vi.fn(() => ({ finalMessage: async () => message }));
  return { sdk: { beta: { messages: { stream } } }, stream };
}
const msg = (over: Record<string, unknown>) => ({
  content: [{ type: 'text', text: '{"name":"x","parts":[]}' }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 20, cache_creation_input_tokens: 10 },
  ...over,
});
const req = { system: 'SYS', messages: [{ role: 'user', content: 'hi' }], schema: { type: 'object' } };

describe('AnthropicClient', () => {
  it('offers Opus 5.5 first, as the default', () => {
    expect(CLAUDE_MODELS[0].id).toBe('claude-opus-5-5');
    expect(DEFAULT_MODEL).toBe('claude-opus-5-5');
    expect(CLAUDE_MODELS.map((m) => m.id)).toContain('claude-sonnet-5-5');
  });

  it('sends the schema, cached system prompt, fallback and model, and streams', async () => {
    const { sdk, stream } = fakeSdk(msg({}));
    await new AnthropicClient('k', 'claude-sonnet-5-5', sdk as never).complete(req, live);
    const [params, opts] = stream.mock.calls[0] as unknown as [Record<string, any>, Record<string, any>];
    expect(params.model).toBe('claude-sonnet-5-5');
    expect(params.output_config.format).toEqual({ type: 'json_schema', schema: req.schema });
    expect(params.system).toEqual([{ type: 'text', text: 'SYS', cache_control: { type: 'ephemeral' } }]);
    expect(params.fallbacks).toBe('default');
    expect(params.betas).toContain('server-side-fallback-2026-07-01');
    expect(params.messages).toEqual(req.messages);
    expect(opts.signal).toBe(live);
  });

  it('parses JSON and returns the assistant turn verbatim', async () => {
    const m = msg({});
    const { sdk } = fakeSdk(m);
    const r = await new AnthropicClient('k', DEFAULT_MODEL, sdk as never).complete(req, live);
    expect(r.json).toEqual({ name: 'x', parts: [] });
    expect(r.assistantTurn).toEqual({ role: 'assistant', content: m.content });
    expect(r.usage).toEqual({ inputTokens: 100, outputTokens: 50, cacheReadTokens: 20, cacheWriteTokens: 10 });
  });

  it('marks a max_tokens stop as truncated, not an error', async () => {
    const { sdk } = fakeSdk(msg({ stop_reason: 'max_tokens' }));
    const r = await new AnthropicClient('k', DEFAULT_MODEL, sdk as never).complete(req, live);
    expect(r).toMatchObject({ json: null, unusable: 'truncated' });
  });

  it('parses only the text after the last fallback block, and keeps the turn verbatim', async () => {
    const content = [
      { type: 'text', text: '{"name":"Bo' },
      {
        type: 'fallback',
        from: { model: 'claude-opus-5-5' },
        to: { model: 'claude-sonnet-5-5' },
        trigger: { type: 'refusal', category: null },
      },
      { type: 'thinking', thinking: '', signature: 's' },
      { type: 'text', text: '{"name":"x","parts":[]}' },
    ];
    const { sdk } = fakeSdk(msg({ content }));
    const r = await new AnthropicClient('k', DEFAULT_MODEL, sdk as never).complete(req, live);
    expect(r.json).toEqual({ name: 'x', parts: [] });
    expect(r.unusable).toBeUndefined();
    expect((r.assistantTurn as { content: unknown }).content).toBe(content);
  });

  it('marks bad JSON as unparseable', async () => {
    const { sdk } = fakeSdk(msg({ content: [{ type: 'text', text: '{nope' }] }));
    const r = await new AnthropicClient('k', DEFAULT_MODEL, sdk as never).complete(req, live);
    expect(r).toMatchObject({ json: null, unusable: 'unparseable' });
  });

  it('turns a refusal into a refused LlmError', async () => {
    const { sdk } = fakeSdk(msg({ stop_reason: 'refusal' }));
    await expect(new AnthropicClient('k', DEFAULT_MODEL, sdk as never).complete(req, live))
      .rejects.toMatchObject({ kind: 'refused' });
  });

  it('estimates cost from the price table, null for an unknown model', () => {
    const u = { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0 };
    expect(new AnthropicClient('k', 'claude-opus-5-5', {} as never).estimateCostUsd(u)).toBeCloseTo(24);
    expect(new AnthropicClient('k', 'claude-sonnet-5-5', {} as never).estimateCostUsd(u)).toBeCloseTo(12);
    expect(new AnthropicClient('k', 'mystery', {} as never).estimateCostUsd(u)).toBeNull();
  });
});

describe('the API reason on a rejected key (fu 174)', () => {
  const body = (message: string) => ({ type: 'error', error: { type: 'authentication_error', message } });
  it('appends the API\'s own reason to the auth message', () => {
    const e = toLlmError(sdkError(Anthropic.APIError, { status: 401, error: body('invalid x-api-key') }), live);
    expect(e.kind).toBe('auth');
    expect(e.message).toBe('API key was rejected — check Settings. (invalid x-api-key)');
  });
  it('keeps the plain message when the API gave no reason', () => {
    expect(toLlmError(sdkError(Anthropic.APIError, { status: 401 }), live).message).toBe('API key was rejected — check Settings.');
  });
});

describe('checkAnthropicKey (fu 174)', () => {
  const sdkWith = (list: () => Promise<unknown>) => ({ models: { list: vi.fn(list) } });
  it('lists one model — a free call — and reports a working key as valid', async () => {
    const sdk = sdkWith(async () => ({ data: [] }));
    expect(await checkAnthropicKey('k', sdk as never)).toEqual({ status: 'valid' });
    expect(sdk.models.list).toHaveBeenCalledWith({ limit: 1 });
  });
  it('reports a rejected key with the API\'s reason', async () => {
    const sdk = sdkWith(() => Promise.reject(sdkError(Anthropic.APIError, {
      status: 401, error: { type: 'error', error: { type: 'authentication_error', message: 'API key is invalid.' } },
    })));
    expect(await checkAnthropicKey('k', sdk as never)).toEqual({ status: 'rejected', reason: 'API key is invalid.' });
  });
  it('a 403 is a rejection too, with a fallback reason when the API gave none', async () => {
    const sdk = sdkWith(() => Promise.reject(sdkError(Anthropic.APIError, { status: 403 })));
    expect(await checkAnthropicKey('k', sdk as never)).toEqual({ status: 'rejected', reason: 'the key was not accepted.' });
  });
  it.each([
    ['offline', sdkError(Anthropic.APIConnectionError)],
    ['rate limited', sdkError(Anthropic.APIError, { status: 429 })],
    ['overloaded', sdkError(Anthropic.APIError, { status: 529 })],
    ['anything else', new TypeError('boom')],
  ])('cannot check when %s — the caller saves anyway', async (_n, err) => {
    expect(await checkAnthropicKey('k', sdkWith(() => Promise.reject(err)) as never)).toEqual({ status: 'unchecked' });
  });
});
