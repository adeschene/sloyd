import type { DovetailFault } from './dovetails';

/**
 * The through dovetails' copy (dovetails spec §3, §4, §6, §7; plan Global Constraints, verbatim): the ONE home of every
 * sentence the planner returns, the fault notes and the panel's labels. The sentences dovetails share with box joints
 * live in `cornerText.ts` and are re-exported here, never redefined. The cut-list line and the bench drawing's labels are
 * added with their readers (plan Tasks 5 and 7). A slope reads `1:<s>`, `s` printed by `String(s)`.
 */

/** The corner planner's shared sentences (`cornerText.ts`): no corner, a selected part in no corner, different heights
 *  along the joint, one end in two corners, different containers, a Shape mate not jointed at the matching end, and the
 *  length line. */
export {
  NO_CORNER as DOVETAIL_NO_CORNER, cornerIgnored as dovetailIgnored, cornerHeights as dovetailHeights,
  cornerTwoCorners as dovetailTwoCorners, cornerContainers as dovetailContainers, cornerLinkedMate as dovetailLinkedMate,
  cornerLengthLine as dovetailLengthLine,
} from './cornerText';

/** The slope as the user reads it: `1:8`. */
export const slopeText = (s: number) => `1:${String(s)}`;

/** A part jointed at ends of two different dimensions (no three-way corners). */
export const dovetailThreeWay = (part: string) => `${part} would be dovetailed on two different edges — that isn't supported yet.`;
/** A cut in a dovetailed end's corner region that does not run through it. */
export const dovetailCutInTheWay = (part: string) => `${part} has a cut where the dovetails go — remove it first.`;
/** A hole row touching a dovetailed end's corner region. */
export const dovetailHoleInTheWay = (part: string) => `${part} has a hole where the dovetails go.`;
/** What a part may not carry yet (spec §3.6), in the order the planner tests them. */
export type DovetailFeature = 'lean' | 'angle cut' | 'curve' | 'edge profile' | 'edge banding' | 'round tenon' | 'box joints';
const FEATURE_WORDS: Record<DovetailFeature, string> = {
  lean: 'a lean', 'angle cut': 'an angle cut', curve: 'a curve', 'edge profile': 'an edge profile',
  'edge banding': 'edge banding', 'round tenon': 'a round tenon', 'box joints': 'box joints',
};
export const dovetailPlainStock = (part: string, f: DovetailFeature) => `${part} has ${FEATURE_WORDS[f]} — dovetails work on plain stock for now.`;
/** A part reached through a mirrored instance. */
export const dovetailMirrored = (part: string) => `Dovetails can't reach a part inside a mirrored copy yet: ${part}.`;
/** The users of one Shape would need different dovetails. */
export const dovetailLinkedDisagree = (parts: readonly string[]) => `These linked parts would need different dovetails: ${parts.join(', ')}.`;
/** The written result would no longer keep a Shape's users on one Shape. */
export const dovetailLinkSplit = (parts: readonly string[]) => `Dovetails can't keep these linked parts linked: ${parts.join(', ')}. Unlink them first.`;
/** A typed slope outside 1:4 to 1:12. */
export const DOVETAIL_SLOPE_RANGE = 'A slope must be between 1:4 and 1:12.';
/** A typed tail count that is not a whole number, 1 or more. */
export const DOVETAIL_COUNT_WHOLE = 'A tail count must be a whole number, 1 or more.';
/** A corner whose `count` tails (the count that failed) fault on either part (spec §3.2). */
export const dovetailTooNarrow = (a: string, b: string, count: number, slope: number) =>
  `${a} and ${b} are too narrow for ${count} tails at ${slopeText(slope)} — try fewer tails.`;

/** A planned dovetail that would fault anything but `narrow` (the count handles that): the part is too short along its run
 *  for its dovetails (one deeper than the part, or two meeting). Wording ruled 2026-10-27 (Task 4 fix). */
export const dovetailTooShort = (part: string) => `${part} is too short for its dovetails.`;

/** One corner's planned numbers, as the success note reads them. */
export interface DovetailedLayout { count: number; slope: number }
const layoutWords = (l: DovetailedLayout) => `${l.count} tails, ${slopeText(l.slope)}`;

/** The success note's dovetailed line(s) (spec §4): one line when every corner shares one layout, else a heading and one
 *  line per corner, `pairs` naming each corner's two parts. */
export function dovetailedLines(layouts: readonly DovetailedLayout[], pairs: readonly (readonly [string, string])[]): string[] {
  const n = layouts.length;
  const same = layouts.every((l) => l.count === layouts[0]!.count && l.slope === layouts[0]!.slope);
  if (same) return [`Dovetailed ${n} ${n === 1 ? 'corner' : 'corners'}: ${layoutWords(layouts[0]!)}.`];
  return [`Dovetailed ${n} corners:`, ...layouts.map((l, i) => `${pairs[i]![0]} and ${pairs[i]![1]}: ${layoutWords(l)}.`)];
}
/** The success note's line naming the parts that took the tails (spec §3.3). */
export const dovetailTailsOn = (parts: readonly string[]) => `Tails on ${parts.join(', ')}.`;

/** Another feature added to a dovetailed part. */
export const dovetailRemoveFirst = (part: string) => `${part} has dovetails — remove them first.`;
/** A cut or hole reaching a dovetailed end. */
export const dovetailMoveClear = (part: string) => `${part} has dovetails there — move it clear of the joint.`;
/** Add joinery's skip (or refusal) reason for a site that would resize, trim or move a dovetailed part (spec §7). */
export const dovetailedLeftAlone = (part: string) => `${part} has dovetails, so joinery leaves its size and place alone`;
/** Refine's kept why-word (spec §7). */
export const DOVETAIL_KEPT_WHY = 'has dovetails';
/** A joined Refine's `notJoined` reason when the re-join would change a kept part whose only kept kind is dovetails. */
export const dovetailJoinChanged = (part: string) => `Joinery would have changed ${part}, which Refine keeps as it is for its dovetails, so the design comes back unjoined.`;

/** The single-part section's note for a stored dovetail that faults (spec §3.5): one reason per fault. */
const FAULT_REASONS: Record<DovetailFault, string> = {
  narrow: 'a tail is narrower than a pin',
  count: "the tail count isn't a whole number, 1 or more",
  slope: 'the slope is outside 1:4 to 1:12',
  depth: 'it is deeper than the part',
};
export const dovetailFaultText = (f: DovetailFault) => `This dovetail no longer fits: ${FAULT_REASONS[f]}.`;

/** The panel's copy (spec §4): the multi-part section, then the single-part section. */
export const DOVETAIL_HEADING = 'Dovetails';
export const DOVETAIL_FIELD_SLOPE = 'Slope';
export const DOVETAIL_SLOPE_PREFIX = '1 :';
export const DOVETAIL_FIELD_TAILS = 'Tails';
export const DOVETAIL_TAILS_PLACEHOLDER = 'Auto';
export const DOVETAIL_SWAP = 'Swap tails and pins';
export const DOVETAIL_BUTTON = 'Dovetail the corners';
export const DOVETAIL_REMOVE = 'Remove';
