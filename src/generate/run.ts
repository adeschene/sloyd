import type { SloydDocument } from '../document/document';
import { DESIGN_SCHEMA, designToDocument, parseDesign } from '../document/generated';
import { checkDesign, rejectedViolations } from '../document/designCheck';
import type { Violation } from '../document/designCheck';
import { ZERO_USAGE, addUsage } from '../llm/types';
import type { LlmClient, LlmMessage, LlmUsage } from '../llm/types';
import { SYSTEM_PROMPT, limitsOf, repairMessage, unusableMessage, userMessage } from './prompt';
import type { GenerateSettings } from './prompt';

/** Repair rounds after the first call — 4 calls at most (spec §4.5). */
export const MAX_REPAIRS = 3;

export type RunProgress = { phase: 'designing' } | { phase: 'repairing'; round: number; issues: number };

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

/**
 * One generation: design → check → feedback, at most MAX_REPAIRS times.
 *
 * APPEND-ONLY: every assistant turn goes into `messages` exactly as the
 * client returned it, and nothing earlier is ever edited — current models
 * reject edited history carrying thinking blocks, and it is also what keeps
 * the cached prefix valid. Each request gets a COPY of the history so a
 * client cannot observe it changing afterward.
 *
 * Keeps the attempt with the fewest violations, ties to the later one, and
 * returns it even with violations remaining — a flawed prototype is still a
 * prototype (spec §4.5). LlmErrors propagate unchanged.
 */
export async function runGeneration(
  client: LlmClient,
  settings: GenerateSettings,
  signal: AbortSignal,
  onProgress: (p: RunProgress) => void,
): Promise<RunOutcome> {
  const limits = limitsOf(settings);
  const messages: LlmMessage[] = [client.userTurn(userMessage(settings))];
  let usage = ZERO_USAGE;
  let best: { doc: SloydDocument; violations: Violation[] } | null = null;
  let lastIssues = 0;

  for (let attempt = 0; attempt <= MAX_REPAIRS; attempt++) {
    onProgress(attempt === 0 ? { phase: 'designing' } : { phase: 'repairing', round: attempt, issues: lastIssues });
    const res = await client.complete({ system: SYSTEM_PROMPT, messages: [...messages], schema: DESIGN_SCHEMA }, signal);
    usage = addUsage(usage, res.usage);
    messages.push(res.assistantTurn);

    const design = res.json === null ? null : parseDesign(res.json);
    let feedback: string;
    if (!design) {
      feedback = unusableMessage(res.unusable ?? 'unparseable');
      lastIssues = 1;
    } else {
      const { doc, rejected } = designToDocument(design);
      const violations = [...rejectedViolations(rejected), ...checkDesign(doc, limits)];
      if (!best || violations.length <= best.violations.length) best = { doc, violations };
      if (violations.length === 0) break;
      feedback = repairMessage(violations);
      lastIssues = violations.length;
    }
    if (attempt < MAX_REPAIRS) messages.push(client.userTurn(feedback));
  }

  if (!best) throw new RunFailed(usage);
  return { ...best, usage };
}
