import { flatDocument, migrateDocument, worldParts, writeBackFlat } from '../document/document';
import type { SloydDocument } from '../document/document';
import { DESIGN_SCHEMA, designToDocument, parseDesign } from '../document/generated';
import type { GeneratedDesign } from '../document/generated';
import { collapseViolations, distinctPartsViolation } from '../document/assemblyChecks';
import { checkDesign, rejectedViolations } from '../document/designCheck';
import type { Violation } from '../document/designCheck';
import { LlmError, ZERO_USAGE, addUsage } from '../llm/types';
import type { LlmClient, LlmMessage, LlmResult, LlmUsage } from '../llm/types';
import { JOINERY_PROMPT, JOINT_SCHEMA, defaultChoice, jointsRepairMessage, jointsUnusableMessage, parseChoices, siteMessage, validChoice } from './joints/choose';
import { applyJoints } from './joints/recipes';
import type { JoinResult, JointChoice } from './joints/recipes';
import { findSites, jointKey } from './joints/sites';
import type { Site } from './joints/sites';
import { DETAIL_CAPS, SYSTEM_PROMPT, limitsOf, repairMessage, unusableMessage, userMessage } from './prompt';
import type { Concept, GenerateSettings, LimitSettings } from './prompt';
import { REFINE_MAX, plainForRefine, refineMessage } from './refine';
import type { RefineBase, RefineSettings } from './refine';
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

/** What re-joining a refined joined design did (refine-joined spec §4). */
export interface JointsSummary { kept: number; chosen: number; dropped: number; skipped: string[] }
export interface RefineOutcome { doc: SloydDocument; violations: Violation[]; present: Violation[]; changes: Change[]; usage: LlmUsage; joints: JointsSummary | null }
export type RefineProgress = RunProgress & { stage?: 'join' };

/**
 * Refine by instruction (refine spec §3): the open design in Generate's format
 * plus the instruction, through the shared loop and evaluation. Refusals are
 * decided before any call. Converted with centre: false so untouched parts keep
 * their coordinates; grain carried by name; only NEW problems drive repairs.
 * A joined design (refine-joined spec §2–4) is refined as its plain parts, then
 * re-joined with its recorded joints as `fixed` choices: only meetings that are
 * new, or whose recorded joint no longer fits, go to one joinery call.
 */
export async function runRefine(
  client: LlmClient,
  doc: SloydDocument,
  settings: RefineSettings,
  signal: AbortSignal,
  onProgress: (p: RefineProgress) => void,
): Promise<RefineOutcome | { refused: RefineRefusal }> {
  const base = plainForRefine(doc);
  if ('refused' in base) return { refused: base.refused };
  const from = documentToDesign(base.plain, REFINE_MAX);
  if ('refused' in from) return { refused: from.refused };
  const preexisting = new Set(checkDesign(flatDocument(base.plain), limitsOf(settings)).map(problemKey));
  const out = await runRepairLoop(client, {
    system: SYSTEM_PROMPT,
    schema: DESIGN_SCHEMA,
    first: refineMessage(from.design, settings),
    evaluate: (res) => evaluateDesign(res, settings, { prepare: (d) => carryGrain(d, base.plain), centre: false, preexisting, exact: designValues(from.design) }),
  }, signal, onProgress);
  // Document-level facts the model never sees travel with the result.
  let refined: SloydDocument = { ...out.doc, stock: doc.stock, units: doc.units, guides: doc.guides };
  let violations = out.violations;
  let present = out.present;
  let usage = out.usage;
  let joints: JointsSummary | null = null;
  if (base.joints) {
    // A meeting the ORIGINAL plain design had but no record covers was left butt (butt leaves
    // no cut; the gate's round trip proved it): a fixed butt, never re-opened (spec §4).
    const origFlat = flatDocument(base.plain);
    const fixed = new Map<string, Omit<JointChoice, 'site'>>(findSites(origFlat).map((s) =>
      [jointKey(origFlat.boards[s.enter]!.name, origFlat.boards[s.receive]!.name, s.axis, s.side), { joint: 'butt' as const }]));
    for (const j of base.joints) fixed.set(jointKey(j.enter, j.receive, j.axis, j.side), j.choice);
    // DROPPED = a record whose meeting no longer exists on the refined plain design;
    // a record whose meeting exists but whose choice no longer fits is open (counted in `chosen`).
    const plainFlat = flatDocument(refined);
    const siteKeys = new Set(findSites(plainFlat).map((s) => jointKey(plainFlat.boards[s.enter]!.name, plainFlat.boards[s.receive]!.name, s.axis, s.side)));
    const dropped = base.joints.filter((j) => !siteKeys.has(jointKey(j.enter, j.receive, j.axis, j.side))).length;
    // The ORIGINAL joined design's named-part problems are already present (spec §4 Issues), judged
    // with the limits runJoinery uses.
    const joinedFlat = flatDocument(doc);
    const alsoPresent = new Set(checkDesign(joinedFlat, { width: null, depth: null, height: null, maxParts: joinedFlat.boards.length })
      .filter((v) => v.parts.length > 0).map(problemKey));
    const jo = await runJoinery(client, refined, signal, (p) => onProgress({ ...p, stage: 'join' }), { fixed, alsoPresent });
    if ('noSites' in jo) {
      joints = { kept: 0, chosen: 0, dropped, skipped: [] };
    } else {
      refined = { ...jo.result.doc, stock: doc.stock, units: doc.units, guides: doc.guides };
      violations = [...violations, ...jo.violations];
      const shown = new Set(present.map(problemKey));
      present = [...present, ...jo.preexisting.filter((v) => alsoPresent.has(problemKey(v)) && !shown.has(problemKey(v)))];
      usage = addUsage(usage, jo.usage);
      joints = { kept: jo.kept, chosen: jo.chosen, dropped, skipped: jo.result.skipped.map((s) => s.reason) };
    }
  }
  // Changes are judged against the ORIGINAL joined design (refine-joined spec §4).
  return { doc: refined, violations, present, changes: diffDesigns(doc, refined), usage, joints };
}

/** A rough before-you-run estimate: the prompt and design in, about the design's own size out. `base`: plainForRefine(doc), when the caller has it. */
export function refineEstimateUsd(client: LlmClient, doc: SloydDocument, settings: RefineSettings, base: RefineBase = plainForRefine(doc)): number | null {
  if ('refused' in base) return null;
  const from = documentToDesign(base.plain, REFINE_MAX);
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
  /** Fixed NON-butt choices that applyJoints actually applied (a skipped one is not kept); 0 without `fixed`. */
  kept: number;
  /** Open sites sent to the chooser, whatever it chose (butt included): every site without `fixed`, 0 when no call is made. */
  chosen: number;
}

/** Recorded joints by `jointKey`, re-applied when `validChoice` still passes (refine-joined spec §4). */
export type FixedJoints = ReadonlyMap<string, Omit<JointChoice, 'site'>>;

/**
 * Add joinery (spec §6). Sites are found first; with none, NO call is made.
 * One choosing call, repaired through the shared loop. Only problems the
 * joinery INTRODUCED — keyed on kind and parts, never on message text —
 * drive repairs and count toward "fewest" (invariant 41). A first call that
 * fails for any reason but the key or a cancel builds the defaults instead.
 * `opts.fixed` re-applies recorded choices that are still strictly valid and
 * asks only about the rest; with none open, NO call is made.
 */
export async function runJoinery(
  client: LlmClient,
  doc: SloydDocument,
  signal: AbortSignal,
  onProgress: (p: RunProgress) => void,
  opts: { fixed?: FixedJoints; alsoPresent?: ReadonlySet<string> } = {},
): Promise<JoineryOutcome | { noSites: true }> {
  // Joinery reads the FLAT document (assemblies spec §6.1): placed parts named by
  // their display paths. Its result is written back into the tree by index.
  const flat = flatDocument(doc);
  const sites = findSites(flat);
  if (sites.length === 0) return { noSites: true };
  const keyOf = (s: Site) => jointKey(flat.boards[s.enter]!.name, flat.boards[s.receive]!.name, s.axis, s.side);
  const fixed = new Map<number, JointChoice>();
  for (const s of sites) {
    const f = opts.fixed?.get(keyOf(s));
    const c = f && { site: s.id, ...f };
    if (c && validChoice(c, s, flat)) fixed.set(s.id, c);
  }
  const limits = { width: null, depth: null, height: null, maxParts: flat.boards.length };
  const preexisting = checkDesign(flat, limits);
  const old = new Set(preexisting.map(problemKey));
  // `alsoPresent` (Refine): a named-part problem the caller's ORIGINAL already had counts as
  // preexisting too — never new, never repair feedback (refine-joined spec §4 Issues).
  const also = (v: Violation) => v.parts.length > 0 && !old.has(problemKey(v)) && opts.alsoPresent?.has(problemKey(v)) === true;
  // The problems a joining INTRODUCED (invariant 41): the ONE filter, for the trial and for build.
  const introduced = (raw: Violation[]) => raw.filter((v) => !old.has(problemKey(v)) && !also(v));
  if (opts.fixed && fixed.size > 0) {
    // Kept joints that collide are re-opened, once (refine-joined spec §4, the user's ruling): a
    // part made slimmer can leave a recorded tenon "in range" yet meeting its neighbour's. One trial
    // with the open sites' defaults; every fixed site whose entering or receiving part a problem it
    // introduced names goes to the chooser with the open ones. A fixed BUTT is never re-opened: it
    // cuts and moves nothing, so it cannot be the cause, and §4 keeps a meeting left butt as butt.
    const trial = applyJoints(flat, sites, sites.map((s) => fixed.get(s.id) ?? defaultChoice(s, flat, sites)));
    const named = new Set(introduced(checkDesign(flatDocument(trial.doc), limits)).flatMap((v) => v.parts));
    if (named.size > 0) {
      for (const s of sites) {
        const f = fixed.get(s.id);
        if (f && f.joint !== 'butt' && (named.has(flat.boards[s.enter]!.name) || named.has(flat.boards[s.receive]!.name))) fixed.delete(s.id);
      }
    }
  }
  const open = sites.filter((s) => !fixed.has(s.id));
  const merge = (chosen: JointChoice[]) => sites.map((s) => fixed.get(s.id) ?? chosen.find((c) => c.site === s.id) ?? { site: s.id, joint: 'butt' as const });
  const build = (choices: JointChoice[], notes: string[]) => {
    const joined = applyJoints(flat, sites, choices);
    const raw = checkDesign(flatDocument(joined.doc), limits);
    const violations = introduced(raw);
    // The tree-shaped document is what useJoinery saves (out.result.doc).
    const tree = migrateDocument(writeBackFlat(doc, flat.boards, worldParts(joined.doc)));
    const result = { ...joined, doc: tree };
    const kept = joined.applied.filter((a) => a.joint !== 'butt' && fixed.has(a.site)).length;
    return { doc: tree, violations, result, notes, preexisting: [...preexisting, ...raw.filter(also)], kept, chosen: open.length };
  };
  if (open.length === 0) return { ...build(merge([]), []), usage: ZERO_USAGE };
  try {
    return await runRepairLoop(client, {
      system: JOINERY_PROMPT,
      schema: JOINT_SCHEMA,
      first: siteMessage(flat, open),
      evaluate: (res) => {
        if (res.json === null) return { value: null, feedback: jointsUnusableMessage(res.unusable ?? 'unparseable') };
        const { choices, notes } = parseChoices(res.json, open, flat);
        const value = build(merge(choices), notes);
        return { value, feedback: jointsRepairMessage(value.violations) };
      },
    }, signal, onProgress, { keepBestOnError: true });
  } catch (e) {
    // Only the model call failing falls back. Anything else is OUR bug and must surface.
    const modelFailed = e instanceof RunFailed || (e instanceof LlmError && e.kind !== 'auth' && e.kind !== 'cancelled');
    if (!modelFailed) throw e;
    const reason = e instanceof RunFailed ? 'no usable answer' : (e as Error).message;
    return { ...build(merge(open.map((s) => defaultChoice(s, flat, sites))), []), usage: e instanceof RunFailed ? e.usage : spentBefore(e), fallback: reason };
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
