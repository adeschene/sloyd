import type { SloydDocument } from '../document/document';
import { DESIGN_SCHEMA, designToDocument, parseDesign } from '../document/generated';
import { checkDesign, rejectedViolations } from '../document/designCheck';
import type { Violation } from '../document/designCheck';
import { ZERO_USAGE, addUsage } from '../llm/types';
import type { LlmClient, LlmMessage, LlmUsage } from '../llm/types';
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
  concept?: Concept,
): Promise<RunOutcome> {
  const limits = limitsOf(settings);
  const messages: LlmMessage[] = [client.userTurn(userMessage(settings, concept))];
  let usage = ZERO_USAGE;
  let best: { doc: SloydDocument; violations: Violation[] } | null = null;
  /** The previous attempt's violation count, or null when it was unusable. */
  let lastIssues: number | null = null;

  for (let attempt = 0; attempt <= MAX_REPAIRS; attempt++) {
    onProgress(
      attempt === 0 ? { phase: 'designing' }
        : lastIssues === null ? { phase: 'retrying', round: attempt }
          : { phase: 'repairing', round: attempt, issues: lastIssues },
    );
    const res = await client.complete({ system: SYSTEM_PROMPT, messages: [...messages], schema: DESIGN_SCHEMA }, signal);
    usage = addUsage(usage, res.usage);
    messages.push(res.assistantTurn);

    const design = res.json === null ? null : parseDesign(res.json);
    const converted = design && designToDocument(design);
    let feedback: string;
    if (!converted) {
      feedback = unusableMessage(res.unusable ?? 'unparseable');
      lastIssues = null;
    } else if (converted.doc.boards.length === 0) {
      // Every part rejected: unusable, and never a `best` — a zero-board
      // document is not a prototype. parseDesign refuses an empty parts
      // list, so `rejected` names every part and says why.
      feedback = repairMessage(rejectedViolations(converted.rejected));
      lastIssues = null;
    } else {
      const { doc, rejected } = converted;
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
