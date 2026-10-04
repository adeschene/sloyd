import type { SloydDocument } from '../document/document';
import { DESIGN_SCHEMA, designToDocument, parseDesign } from '../document/generated';
import { checkDesign, rejectedViolations } from '../document/designCheck';
import type { Violation } from '../document/designCheck';
import { LlmError, ZERO_USAGE, addUsage } from '../llm/types';
import type { LlmClient, LlmMessage, LlmResult, LlmUsage } from '../llm/types';
import { SYSTEM_PROMPT, limitsOf, repairMessage, unusableMessage, userMessage } from './prompt';
import type { Concept, GenerateSettings } from './prompt';

/** Repair rounds after the first call — 4 calls at most (spec §4.5). */
export const MAX_REPAIRS = 3;

/**
 * `repairing` follows a USABLE attempt and carries its violation count;
 * `retrying` follows an UNUSABLE one (truncated, unparseable, or every part
 * rejected), which has no issue count worth showing.
 */
export type RunProgress =
  | { phase: 'designing' }
  | { phase: 'repairing'; round: number; issues: number }
  | { phase: 'retrying'; round: number };

export interface RunOutcome {
  doc: SloydDocument;
  violations: Violation[];
  usage: LlmUsage;
}

/** No attempt produced a usable design. Carries what was spent, for the cost display. */
export class RunFailed extends Error {
  readonly usage: LlmUsage;
  constructor(usage: LlmUsage) {
    super('The model did not produce a usable design.');
    this.name = 'RunFailed';
    this.usage = usage;
  }
}

export interface LoopAdapter<T extends { doc: SloydDocument; violations: Violation[] }> {
  system: string;
  schema: Record<string, unknown>;
  /** The first user message. */
  first: string;
  /** `value: null` means the attempt was unusable (it drives the `retrying` phase). */
  evaluate(res: LlmResult): { value: T | null; feedback: string };
}

/**
 * The repair loop: call → evaluate → feedback, at most MAX_REPAIRS times.
 *
 * APPEND-ONLY: every assistant turn goes into `messages` exactly as the
 * client returned it, and nothing earlier is ever edited — current models
 * reject edited history carrying thinking blocks, and it is also what keeps
 * the cached prefix valid. Each request gets a COPY of the history so a
 * client cannot observe it changing afterward (invariant 37).
 *
 * Keeps the attempt with the fewest violations, ties to the later one, and
 * returns it even with violations remaining. LlmErrors propagate unchanged,
 * except that with `keepBestOnError` an error other than auth/cancelled
 * arriving AFTER a usable attempt returns that attempt instead.
 */
export async function runRepairLoop<T extends { doc: SloydDocument; violations: Violation[] }>(
  client: LlmClient,
  adapter: LoopAdapter<T>,
  signal: AbortSignal,
  onProgress: (p: RunProgress) => void,
  opts: { keepBestOnError?: boolean } = {},
): Promise<T & { usage: LlmUsage }> {
  const messages: LlmMessage[] = [client.userTurn(adapter.first)];
  let usage = ZERO_USAGE;
  let best: T | null = null;
  /** The previous attempt's violation count, or null when it was unusable. */
  let lastIssues: number | null = null;

  for (let attempt = 0; attempt <= MAX_REPAIRS; attempt++) {
    onProgress(
      attempt === 0 ? { phase: 'designing' }
        : lastIssues === null ? { phase: 'retrying', round: attempt }
          : { phase: 'repairing', round: attempt, issues: lastIssues },
    );
    let res: LlmResult;
    try {
      res = await client.complete({ system: adapter.system, messages: [...messages], schema: adapter.schema }, signal);
    } catch (e) {
      if (opts.keepBestOnError && best && e instanceof LlmError && e.kind !== 'auth' && e.kind !== 'cancelled') break;
      throw e;
    }
    usage = addUsage(usage, res.usage);
    messages.push(res.assistantTurn);

    const { value, feedback } = adapter.evaluate(res);
    if (value === null) {
      lastIssues = null;
    } else {
      if (!best || value.violations.length <= best.violations.length) best = value;
      if (value.violations.length === 0) break;
      lastIssues = value.violations.length;
    }
    if (attempt < MAX_REPAIRS) messages.push(client.userTurn(feedback));
  }

  if (!best) throw new RunFailed(usage);
  return { ...best, usage };
}

/** One generation: design → check → feedback, via the shared loop (spec §4.5). */
export async function runGeneration(
  client: LlmClient,
  settings: GenerateSettings,
  signal: AbortSignal,
  onProgress: (p: RunProgress) => void,
  concept?: Concept,
): Promise<RunOutcome> {
  const limits = limitsOf(settings);
  return runRepairLoop(client, {
    system: SYSTEM_PROMPT,
    schema: DESIGN_SCHEMA,
    first: userMessage(settings, concept),
    evaluate: (res) => {
      const design = res.json === null ? null : parseDesign(res.json);
      const converted = design && designToDocument(design);
      if (!converted) return { value: null, feedback: unusableMessage(res.unusable ?? 'unparseable') };
      // Every part rejected: unusable, and never a `best` — a zero-board
      // document is not a prototype.
      if (converted.doc.boards.length === 0) return { value: null, feedback: repairMessage(rejectedViolations(converted.rejected)) };
      const violations = [...rejectedViolations(converted.rejected), ...checkDesign(converted.doc, limits)];
      return { value: { doc: converted.doc, violations }, feedback: repairMessage(violations) };
    },
  }, signal, onProgress);
}
