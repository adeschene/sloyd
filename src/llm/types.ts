/**
 * The provider seam — the StorageAdapter move applied to the network. The
 * generation loop talks to this, never to a provider SDK, so a second
 * provider is a second implementation rather than a second code path.
 *
 * `LlmMessage` is OPAQUE to callers: they append exactly what `complete`
 * hands back and build user turns only through `userTurn`. That is what lets
 * each provider carry its own message shape — and it is what keeps the
 * history append-only (spec §4.5): a caller that cannot read a message
 * cannot edit one.
 */
export type LlmMessage = unknown;

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export const ZERO_USAGE: LlmUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

export function addUsage(a: LlmUsage, b: LlmUsage): LlmUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  };
}

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  /** Structured-output JSON schema the response must match. */
  schema: Record<string, unknown>;
}

export interface LlmResult {
  /** Parsed output, or null when the attempt produced nothing usable. */
  json: unknown | null;
  unusable?: 'truncated' | 'unparseable';
  /** Append verbatim; never edit. */
  assistantTurn: LlmMessage;
  usage: LlmUsage;
}

/**
 * A closed set, so the UI can say one plain sentence per kind. `truncated`
 * and `unparseable` are deliberately NOT here: they are unusable ATTEMPTS
 * inside the repair loop, not failures of the call.
 */
export type LlmErrorKind = 'auth' | 'rate-limit' | 'overloaded' | 'refused' | 'network' | 'cancelled' | 'other';

export class LlmError extends Error {
  readonly kind: LlmErrorKind;
  constructor(kind: LlmErrorKind, message: string) {
    super(message);
    this.name = 'LlmError';
    this.kind = kind;
  }
}

export interface LlmClient {
  /** One call. Streams internally; resolves with the final result; rejects with LlmError. */
  complete(req: LlmRequest, signal: AbortSignal): Promise<LlmResult>;
  /** A user turn in this provider's message shape. */
  userTurn(text: string): LlmMessage;
  /** Estimated cost in US dollars, or null when the model's price is unknown. */
  estimateCostUsd(usage: LlmUsage): number | null;
}
