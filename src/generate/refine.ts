import { distinctParts } from '../document/assemblyChecks';
import type { GeneratedDesign } from '../document/generated';
import { documentToDesign } from '../document/refineDesign';
import type { RefineMax } from '../document/refineDesign';
import { worldParts } from '../document/tree';
import type { SloydDocument } from '../document/types';
import { DETAIL_CAPS, limitLines, placedCeiling } from './prompt';
import type { Detail } from './prompt';

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

export function refineRefusal(doc: SloydDocument): string | null {
  const r = documentToDesign(doc, REFINE_MAX);
  return 'refused' in r ? r.refused.message : null;
}
