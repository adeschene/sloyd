import { distinctParts } from '../document/assemblyChecks';
import { repairDocument } from './joints/repair';
import type { RepairCheck } from './joints/repair';
import type { GeneratedDesign } from '../document/generated';
import { documentToDesign } from '../document/refineDesign';
import type { RefineMax, RefineRefusal } from '../document/refineDesign';
import { flatDocument, migrateDocument, writeBackFlat } from '../document/document';
import { worldParts } from '../document/tree';
import type { SloydDocument } from '../document/types';
import { DETAIL_CAPS, limitLines, placedCeiling } from './prompt';
import type { Detail } from './prompt';
import { GATE_REFUSAL, gateUnjoin } from './joints/unjoin';
import type { RecordedJoint } from './joints/unjoin';

/** Refine by instruction (refine spec §3). The refine text rides in the USER turn; SYSTEM_PROMPT is Generate's, unchanged. */
export interface RefineSettings { instruction: string; width: number | null; depth: number | null; height: number | null; detail: Detail }

/** Refine handles what Detailed allows; beyond it the model would be forced to drop parts. */
export const REFINE_MAX: RefineMax = { distinct: DETAIL_CAPS.detailed, placed: placedCeiling('detailed') };

export const KEEP_LINE = 'Keep every part you are not asked to change exactly as it is: the same name, role, material, size and position. Keep assembly and placement names. Return the whole design.';

export function refineMessage(design: GeneratedDesign, s: RefineSettings): string {
  return [
    'Here is the current design, in the same format you return:', JSON.stringify(design), '',
    `Change it as follows: ${s.instruction.trim()}`, '', KEEP_LINE, '', 'Hard limits:', ...limitLines(s),
  ].join('\n');
}

/** Distinct parts of headroom a preselected detail level leaves over the design (refine spec §5). */
export const DETAIL_HEADROOM = 3;

/** The smallest detail level whose cap leaves DETAIL_HEADROOM over the design's distinct parts and whose ceiling covers its placed parts. */
export function detailFor(doc: SloydDocument): Detail {
  const distinct = distinctParts(doc);
  const placed = worldParts(doc).length;
  return (['simple', 'moderate', 'detailed'] as const).find((d) => DETAIL_CAPS[d] >= distinct + DETAIL_HEADROOM && placedCeiling(d) >= placed) ?? 'detailed';
}

export type RefineBase = { plain: SloydDocument; joints: RecordedJoint[] | null } | { refused: RefineRefusal };

/**
 * The design Refine works on (refine-joined spec §2): unchanged when nothing is
 * cut; otherwise its joints are read back (gateUnjoin) and the plain parts are
 * written into the tree the way runJoinery writes its result back
 * (invariant 46), so copies that come out identical stay shared.
 */
export function plainForRefine(doc: SloydDocument): RefineBase {
  // Runs inside the Refine dialog's memo: a throw would break its render, so it refuses as the gate
  // does and keeps the cause on the console (follow-up 244).
  try {
    const flat = flatDocument(doc);
    if (!flat.boards.some((b) => b.cuts.length > 0)) return { plain: doc, joints: null };
    const g = gateUnjoin(flat);
    if ('refused' in g) return { refused: { reason: 'joints', message: g.refused } };
    return { plain: migrateDocument(writeBackFlat(doc, flat.boards, g.plain)), joints: g.joints };
  } catch (e) {
    console.error('Sloyd: reading joints back threw', e);
    return { refused: { reason: 'joints', message: GATE_REFUSAL } };
  }
}

/** `base`: plainForRefine(doc), when the caller already has it (the dialog computes it once per document). */
export function refineRefusal(doc: SloydDocument, base: RefineBase = plainForRefine(doc)): string | null {
  if ('refused' in base) return base.refused.message;
  const r = documentToDesign(base.plain, REFINE_MAX);
  return 'refused' in r ? r.refused.message : null;
}

/**
 * What the Refine dialog shows, from ONE plainForRefine (one gate run) per document; `base` goes
 * back to refineEstimateUsd so the estimate does not run the gate again on every render.
 */
export function refineDialogInfo(doc: SloydDocument): { base: RefineBase; refusal: string | null; detail: Detail; joined: boolean; repair: RepairCheck } {
  const base = plainForRefine(doc);
  // Joined = some placed part is cut: the gate either explained it (joints) or refused it.
  const joined = 'refused' in base ? base.refused.reason === 'joints' : base.joints !== null;
  return { base, refusal: refineRefusal(doc, base), detail: detailFor(doc), joined,
    // Only when the gate refused for joints: the repair is the way out of that refusal (repair-joints spec §3).
    repair: 'refused' in base && base.refused.reason === 'joints' ? repairDocument(doc) : null };
}
