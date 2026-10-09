import { flatDocument, migrateDocument, worldParts, writeBackFlat } from '../document/document';
import type { SloydDocument } from '../document/document';
import { DESIGN_SCHEMA, designToDocument, parseDesign } from '../document/generated';
import type { GeneratedDesign } from '../document/generated';
import { collapseViolations, distinctPartsViolation } from '../document/assemblyChecks';
import { checkDesign, rejectedViolations } from '../document/designCheck';
import type { Violation } from '../document/designCheck';
import { LlmError, ZERO_USAGE, addUsage } from '../llm/types';
import type { LlmClient, LlmMessage, LlmResult, LlmUsage } from '../llm/types';
import { JOINERY_PROMPT, JOINT_SCHEMA, defaultChoice, jointsRepairMessage, jointsUnusableMessage, parseChoices, siteMessage } from './joints/choose';
import { applyJoints } from './joints/recipes';
import type { JoinResult, JointChoice } from './joints/recipes';
import { findSites } from './joints/sites';
import { DETAIL_CAPS, SYSTEM_PROMPT, limitsOf, repairMessage, unusableMessage, userMessage } from './prompt';
import type { Concept, GenerateSettings, LimitSettings } from './prompt';
import { REFINE_MAX, refineMessage } from './refine';
import type { RefineSettings } from './refine';
import { carryGrain, designValues, documentToDesign } from '../document/refineDesign';
import type { RefineRefusal } from '../document/refineDesign';
import { diffDesigns } from '../document/designDiff';
import type { Change } from '../document/designDiff';

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

export const problemKey = (v: Violation) => JSON.stringify([v.kind, [...v.parts].sort()]);

/** What one usable attempt is worth: the tree kept, its NEW problems, and (Refine) the old ones. */
export interface DesignValue { doc: SloydDocument; violations: Violation[]; present: Violation[] }
interface EvaluateOpts {
  /** Refine's grain carry-over, applied to the parsed design before conversion. */
  prepare?: (d: GeneratedDesign) => GeneratedDesign;
  /** False keeps the model's X/Z (Refine); the floor rule holds either way. */
  centre?: boolean;
  /** problemKeys of the original's raw violations (Refine; invariant 41's rule). */
  preexisting?: ReadonlySet<string>;
  /** Values the converter keeps unsnapped (Refine: the original's own numbers). */
  exact?: ReadonlySet<number>;
}

/**
 * THE design evaluation, shared by Generate and Refine so they cannot drift
 * (refine spec §3.1): parse → tree → flatten → zero-board guard → distinct cap
 * → checkDesign → collapse. With `preexisting`, a raw violation whose
 * problemKey the original already had (and which names parts) is set aside as `present` and neither
 * counts toward "fewest" nor goes back as feedback.
 */
function evaluateDesign(res: LlmResult, s: LimitSettings, opts: EvaluateOpts = {}): { value: DesignValue | null; feedback: string } {
  const parsed = res.json === null ? null : parseDesign(res.json);
  const design = parsed && (opts.prepare ? opts.prepare(parsed) : parsed);
  const converted = design && designToDocument(design, { centre: opts.centre ?? true, exact: opts.exact });
  if (!converted) return { value: null, feedback: unusableMessage(res.unusable ?? 'unparseable') };
  // Checks read the placed world (generate-assemblies spec §5.1); the TREE is what is kept.
  const flat = flatDocument(converted.doc);
  // Every part rejected: unusable, and never a `best` — a zero-board
  // document is not a prototype.
  if (flat.boards.length === 0) return { value: null, feedback: repairMessage(rejectedViolations(converted.rejected)) };
  const distinct = distinctPartsViolation(converted.doc, DETAIL_CAPS[s.detail]);
  const raw = checkDesign(flat, limitsOf(s));
  const old = opts.preexisting;
  // Only a fault naming parts can be "already there"; limits (too-large,
  // too-many-parts, tips) are judged on the result (refine spec §3.2).
  const already = (v: Violation) => old !== undefined && v.parts.length > 0 && old.has(problemKey(v));
  const fresh = raw.filter((v) => !already(v));
  // Merged per authored part, so "fewest" is not biased by placement count (generate-assemblies spec §5.3).
  const violations = [
    ...rejectedViolations(converted.rejected),
    ...(distinct ? [distinct] : []),
    ...collapseViolations(fresh, converted.authored),
  ];
  const present = old ? collapseViolations(raw.filter(already), converted.authored) : [];
  return { value: { doc: converted.doc, violations, present }, feedback: repairMessage(violations) };
}

/** One generation: design → tree → check the placed world → feedback, via the shared loop (spec §4.5; generate-assemblies spec §5). */
export async function runGeneration(
  client: LlmClient,
  settings: GenerateSettings,
  signal: AbortSignal,
  onProgress: (p: RunProgress) => void,
  concept?: Concept,
): Promise<RunOutcome> {
  const out = await runRepairLoop(client, {
    system: SYSTEM_PROMPT,
    schema: DESIGN_SCHEMA,
    first: userMessage(settings, concept),
    evaluate: (res) => evaluateDesign(res, settings),
  }, signal, onProgress);
  return { doc: out.doc, violations: out.violations, usage: out.usage };
}

export interface RefineOutcome { doc: SloydDocument; violations: Violation[]; present: Violation[]; changes: Change[]; usage: LlmUsage }

/**
 * Refine by instruction (refine spec §3): the open design in Generate's format
 * plus the instruction, through the shared loop and evaluation. Refusals are
 * decided before any call. Converted with centre: false so untouched parts keep
 * their coordinates; grain carried by name; only NEW problems drive repairs.
 */
export async function runRefine(
  client: LlmClient,
  doc: SloydDocument,
  settings: RefineSettings,
  signal: AbortSignal,
  onProgress: (p: RunProgress) => void,
): Promise<RefineOutcome | { refused: RefineRefusal }> {
  const from = documentToDesign(doc, REFINE_MAX);
  if ('refused' in from) return { refused: from.refused };
  const preexisting = new Set(checkDesign(flatDocument(doc), limitsOf(settings)).map(problemKey));
  const out = await runRepairLoop(client, {
    system: SYSTEM_PROMPT,
    schema: DESIGN_SCHEMA,
    first: refineMessage(from.design, settings),
    evaluate: (res) => evaluateDesign(res, settings, { prepare: (d) => carryGrain(d, doc), centre: false, preexisting, exact: designValues(from.design) }),
  }, signal, onProgress);
  // Document-level facts the model never sees travel with the result.
  const kept: SloydDocument = { ...out.doc, stock: doc.stock, units: doc.units, guides: doc.guides };
  return { doc: kept, violations: out.violations, present: out.present, changes: diffDesigns(doc, kept), usage: out.usage };
}

/** A rough before-you-run estimate: the prompt and design in, about the design's own size out. */
export function refineEstimateUsd(client: LlmClient, doc: SloydDocument, settings: RefineSettings): number | null {
  const from = documentToDesign(doc, REFINE_MAX);
  if ('refused' in from) return null;
  const input = SYSTEM_PROMPT.length + refineMessage(from.design, settings).length;
  const output = JSON.stringify(from.design).length * 1.25;
  return client.estimateCostUsd({ inputTokens: Math.ceil(input / 4), outputTokens: Math.ceil(output / 4), cacheReadTokens: 0, cacheWriteTokens: 0 });
}


export interface JoineryOutcome {
  result: JoinResult<SloydDocument>;
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
  // Joinery reads the FLAT document (assemblies spec §6.1): placed parts named by
  // their display paths. Its result is written back into the tree by index.
  const flat = flatDocument(doc);
  const sites = findSites(flat);
  if (sites.length === 0) return { noSites: true };
  const limits = { width: null, depth: null, height: null, maxParts: flat.boards.length };
  const preexisting = checkDesign(flat, limits);
  const old = new Set(preexisting.map(problemKey));
  const build = (choices: JointChoice[], notes: string[]) => {
    const joined = applyJoints(flat, sites, choices);
    const violations = checkDesign(flatDocument(joined.doc), limits).filter((v) => !old.has(problemKey(v)));
    // The tree-shaped document is what useJoinery saves (out.result.doc).
    const tree = migrateDocument(writeBackFlat(doc, flat.boards, worldParts(joined.doc)));
    const result = { ...joined, doc: tree };
    return { doc: tree, violations, result, notes, preexisting };
  };
  try {
    return await runRepairLoop(client, {
      system: JOINERY_PROMPT,
      schema: JOINT_SCHEMA,
      first: siteMessage(flat, sites),
      evaluate: (res) => {
        if (res.json === null) return { value: null, feedback: jointsUnusableMessage(res.unusable ?? 'unparseable') };
        const { choices, notes } = parseChoices(res.json, sites, flat);
        const value = build(choices, notes);
        return { value, feedback: jointsRepairMessage(value.violations) };
      },
    }, signal, onProgress, { keepBestOnError: true });
  } catch (e) {
    // Only the model call failing falls back. Anything else is OUR bug and must surface.
    const modelFailed = e instanceof RunFailed || (e instanceof LlmError && e.kind !== 'auth' && e.kind !== 'cancelled');
    if (!modelFailed) throw e;
    const reason = e instanceof RunFailed ? 'no usable answer' : (e as Error).message;
    return { ...build(sites.map((s) => defaultChoice(s, flat, sites)), []), usage: e instanceof RunFailed ? e.usage : spentBefore(e), fallback: reason };
  }
}

/** A rough before-you-run estimate: one call, the prompt and sites in, ~2,000 tokens out. */
export function joineryEstimateUsd(client: LlmClient, doc: SloydDocument): number | null {
  const flat = flatDocument(doc);
  const sites = findSites(flat);
  if (sites.length === 0) return null;
  const chars = JOINERY_PROMPT.length + siteMessage(flat, sites).length;
  return client.estimateCostUsd({ inputTokens: Math.ceil(chars / 4), outputTokens: 2000, cacheReadTokens: 0, cacheWriteTokens: 0 });
}
