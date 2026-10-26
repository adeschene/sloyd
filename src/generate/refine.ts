import { distinctParts } from '../document/assemblyChecks';
import { repairDocument } from './joints/repair';
import type { RepairCheck } from './joints/repair';
import { toWireDesign } from '../document/generated';
import type { GeneratedDesign } from '../document/generated';
import { documentToDesign } from '../document/refineDesign';
import type { RefineMax, RefineRefusal } from '../document/refineDesign';
import { flatDocument, migrateDocument, writeBackFlat } from '../document/document';
import { worldParts } from '../document/tree';
import type { SloydDocument } from '../document/types';
import { BUILT_IN_BAND_ID } from '../document/bandModel';
import { catalogOf } from '../document/materials';
import type { MaterialCatalog } from '../document/materials';
import { DETAIL_CAPS, limitLines, placedCeiling } from './prompt';
import type { Detail } from './prompt';
import { GATE_REFUSAL, gateUnjoin } from './joints/unjoin';
import type { RecordedJoint } from './joints/unjoin';
import { compoundRefusal, joineryRefusal, leaningRefusal, tenonRefusal } from './joints/tapers';
import { findSites } from './joints/sites';
import { carryFromOriginal } from '../document/featureCarry';
import { featuredNote } from '../document/carryText';
import { keptNote } from '../document/leanKeep';
import { isTilted } from '../document/holeTilt';

/** Refine by instruction (refine spec §3). The refine text rides in the USER turn; SYSTEM_PROMPT is Generate's, unchanged. */
export interface RefineSettings { instruction: string; width: number | null; depth: number | null; height: number | null; detail: Detail }

/** Refine handles what Detailed allows; beyond it the model would be forced to drop parts. */
export const REFINE_MAX: RefineMax = { distinct: DETAIL_CAPS.detailed, placed: placedCeiling('detailed') };

export const KEEP_LINE = 'Keep every part you are not asked to change exactly as it is: the same name, role, material, size, position, tapers, miters, bevels, chamfers, holes, edging and edge profiles. Keep assembly and placement names. Return the whole design.';

/** `original`: the plain design the model's came from; the parts of it that carry features the JSON does not show are named (refine-features spec §5),
 *  and so are the parts it keeps as is because they lean, with their real world bounds (splayed legs spec §8).
 *  `catalog` (the project's): its custom materials are named by id and label, in the USER turn — the schema's enum
 *  carries only ids, and SYSTEM_PROMPT stays a fixed prefix (custom materials spec §6). None: the message is unchanged. */
export function refineMessage(design: GeneratedDesign, s: RefineSettings, catalog?: MaterialCatalog, original?: SloydDocument): string {
  const note = original ? featuredNote(carryFromOriginal(design, original)) : null;
  // The parts kept as is because they lean (splayed legs spec §8): context only, absent from the design JSON.
  const kept = original ? keptNote(original) : null;
  const customs = catalog ? catalog.ids.filter((id) => !catalog.get(id)!.builtIn) : [];
  // Band types the schema's `edging` enum names by id (AI-bands spec §3.1); the built-in is the key `veneer`, not listed.
  const labels = catalog ?? (original ? catalogOf(original) : undefined);
  const edgings = (original?.bandTypes ?? []).filter((t) => t.id !== BUILT_IN_BAND_ID).map((t) =>
    `"${t.id}" is ${t.name} (${t.kind === 'solid' ? `solid ${labels?.label(t.material) ?? t.material}, ${t.thickness}in` : 'tape'})`);
  return [
    'Here is the current design, in the same format you return:', JSON.stringify(toWireDesign(design)), '',
    ...(note ? [note, ''] : []),
    ...(kept ? [kept, ''] : []),
    ...(customs.length > 0 ? [`Custom materials in this design: ${customs.map((id) => `"${id}" is ${catalog!.label(id)}`).join('; ')}.`, ''] : []),
    ...(edgings.length > 0 ? [`Edging types in this design: ${edgings.join('; ')}.`, ''] : []),
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
    // A joined design with a leaning part (splayed legs spec §8): refused up front, the same as joinery and by its ONE
    // decider (invariant 41), BEFORE the gate — whose read-back is box-based and would refuse in the wrong words.
    const leaning = leaningRefusal('refine', flat);
    if (leaning) return { refused: { reason: 'lean-joint', message: leaning } };
    // Likewise a kept part with a round tenon (round tenons spec §9), by the same decider's second step, as for a tilted row below.
    const tenoned = tenonRefusal('refine', flat);
    if (tenoned) return { refused: { reason: 'lean-joint', message: tenoned } };
    // Likewise a kept part with a compound end cut (square-set legs spec §4), the decider's third step: the gate's
    // read-back would re-anchor its cuts field by field (`rebaseAngleCuts`) and a re-join could not keep it exactly.
    const compound = compoundRefusal('refine', flat);
    if (compound) return { refused: { reason: 'lean-joint', message: compound } };
    // Likewise a kept part with a tilted row (angled holes spec §9, ruling T11a): gateUnjoin would strip its cuts and
    // runJoinery would re-join the whole refined document, kept boards included, so "kept exactly" could not hold.
    const angled = flat.boards.find((b) => b.holes.some(isTilted));
    if (angled) return { refused: { reason: 'lean-joint', message: `Refine can't keep a part with angled holes in a joined project yet: ${angled.name}.` } };
    const g = gateUnjoin(flat);
    if ('refused' in g) return { refused: { reason: 'joints', message: g.refused } };
    const plain = migrateDocument(writeBackFlat(doc, flat.boards, g.plain));
    // A joined original whose taper already runs into a joint could only come back unjoined (its re-join refuses):
    // refused before any call (AI-tapers spec §5.4, amended), by joinery's ONE refusal decider (invariant 41).
    const pf = flatDocument(plain);
    const taper = joineryRefusal('refine', plain, pf, findSites(pf));
    if (taper) return { refused: { reason: 'angle-joint', message: taper } };
    return { plain, joints: g.joints };
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
  // Joined = some placed part is cut: the gate either explained it (joints) or refused it. An 'angle-joint' refusal is
  // produced only after the gate read the joints, so it is joined too (AI-tapers spec §5.4); a 'lean-joint' one only once
  // some part is cut (splayed legs spec §8).
  const joined = 'refused' in base ? ['joints', 'angle-joint', 'lean-joint'].includes(base.refused.reason) : base.joints !== null;
  return { base, refusal: refineRefusal(doc, base), detail: detailFor(doc), joined,
    // Only when the gate refused for joints: the repair is the way out of that refusal (repair-joints spec §3).
    repair: 'refused' in base && base.refused.reason === 'joints' ? repairDocument(doc) : null };
}
