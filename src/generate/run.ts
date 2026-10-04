import type { SloydDocument } from '../document/document';
import { DESIGN_SCHEMA, designToDocument, parseDesign } from '../document/generated';
import { checkDesign, rejectedViolations } from '../document/designCheck';
import type { Violation } from '../document/designCheck';
import { LlmError, ZERO_USAGE, addUsage } from '../llm/types';
import type { LlmClient, LlmMessage, LlmResult, LlmUsage } from '../llm/types';
import { JOINERY_PROMPT, JOINT_SCHEMA, defaultChoice, jointsRepairMessage, jointsUnusableMessage, parseChoices, siteMessage } from './joints/choose';
import { applyJoints } from './joints/recipes';
import type { JoinResult, JointChoice } from './joints/recipes';
import { findSites } from './joints/sites';
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

/** Usage spent before a loop rethrew an error, so a caller that recovers can still report it. */
const spent = new WeakMap<object, LlmUsage>();
export const spentBefore = (e: unknown): LlmUsage => (typeof e === 'object' && e !== null ? spent.get(e) : undefined) ?? ZERO_USAGE;

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
      if (typeof e === 'object' && e !== null) spent.set(e, usage);
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

const problemKey = (v: Violation) => `${v.kind}|${[...v.parts].sort().join(',')}`;

export interface JoineryOutcome {
  result: JoinResult;
  notes: string[];
  violations: Violation[];
  preexisting: Violation[];
  usage: LlmUsage;
  fallback?: string;
}

/**
 * Add joinery (spec §6). Sites are found first; with none, NO call is made.
 * One choosing call, repaired through the shared loop. Only problems the
 * joinery INTRODUCED — keyed on kind and parts, never on message text —
 * drive repairs and count toward "fewest" (invariant 41). A first call that
 * fails for any reason but the key or a cancel builds the defaults instead.
 */
export async function runJoinery(
  client: LlmClient,
  doc: SloydDocument,
  signal: AbortSignal,
  onProgress: (p: RunProgress) => void,
): Promise<JoineryOutcome | { noSites: true }> {
  const sites = findSites(doc);
  if (sites.length === 0) return { noSites: true };
  const limits = { width: null, depth: null, height: null, maxParts: doc.boards.length };
  const preexisting = checkDesign(doc, limits);
  const old = new Set(preexisting.map(problemKey));
  const build = (choices: JointChoice[], notes: string[]) => {
    const result = applyJoints(doc, sites, choices);
    const violations = checkDesign(result.doc, limits).filter((v) => !old.has(problemKey(v)));
    return { doc: result.doc, violations, result, notes, preexisting };
  };
  try {
    return await runRepairLoop(client, {
      system: JOINERY_PROMPT,
      schema: JOINT_SCHEMA,
      first: siteMessage(doc, sites),
      evaluate: (res) => {
        if (res.json === null) return { value: null, feedback: jointsUnusableMessage(res.unusable ?? 'unparseable') };
        const { choices, notes } = parseChoices(res.json, sites, doc);
        const value = build(choices, notes);
        return { value, feedback: jointsRepairMessage(value.violations) };
      },
    }, signal, onProgress, { keepBestOnError: true });
  } catch (e) {
    // Only the model call failing falls back. Anything else is OUR bug and must surface.
    const modelFailed = e instanceof RunFailed || (e instanceof LlmError && e.kind !== 'auth' && e.kind !== 'cancelled');
    if (!modelFailed) throw e;
    const reason = e instanceof RunFailed ? 'no usable answer' : (e as Error).message;
    return { ...build(sites.map((s) => defaultChoice(s, doc)), []), usage: e instanceof RunFailed ? e.usage : spentBefore(e), fallback: reason };
  }
}

/** A rough before-you-run estimate: one call, the prompt and sites in, ~2,000 tokens out. */
export function joineryEstimateUsd(client: LlmClient, doc: SloydDocument): number | null {
  const sites = findSites(doc);
  if (sites.length === 0) return null;
  const chars = JOINERY_PROMPT.length + siteMessage(doc, sites).length;
  return client.estimateCostUsd({ inputTokens: Math.ceil(chars / 4), outputTokens: 2000, cacheReadTokens: 0, cacheWriteTokens: 0 });
}
