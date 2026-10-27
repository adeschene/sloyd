import { formatLength, type Units } from '../units/length';
import type { FingerLayout, FingerSet } from './boxJoints';

/**
 * The box joints' copy (box-joints spec §3, §4, §5.2, §6; plan Global Constraints, verbatim): the ONE home of every
 * sentence the planner returns and of the cut-list line. Lengths go through `units/length.ts` with the document's own
 * units (inv 52), so this module takes `units` and `boxJoints.ts` stays numbers-only (CLAUDE.md, the `→ units` edge rule).
 */

/** No selected pair is a corner (spec §3.1). */
export const BOX_NO_CORNER = "These parts don't meet at a corner.";
/** A success note line: a selected part in no corner. */
export const boxIgnored = (part: string) => `${part} isn't at a corner with another selected part.`;
/** A candidate corner whose two parts span different intervals along the joint line. */
export const boxHeights = (a: string, b: string) => `${a} and ${b} must be the same height along the joint.`;
/** One part end in two corners. */
export const boxTwoCorners = (part: string) => `${part} meets two parts at one end.`;
/** A part jointed at ends of two different dimensions (no three-way corners, spec §3.1; wording for copy review). */
export const boxThreeWay = (part: string) => `${part} would be box-jointed on two different edges — that isn't supported yet.`;
/** A corner shorter than five fingers of the width (`H < 4w`, spec §3.3). */
export const boxTooShort = (a: string, b: string) => `${a} and ${b} are too short for five fingers that wide — try narrower fingers.`;
/** A cut in a jointed end's corner region that does not run through it (spec §3.5). */
export const boxCutInTheWay = (part: string) => `${part} has a cut where the fingers go — remove it first.`;
/** A hole row touching a jointed end's corner region (spec §3.5). */
export const boxHoleInTheWay = (part: string) => `${part} has a hole where the fingers go.`;
/** What a part may not carry yet (spec §3.5), in the order the planner tests them. */
export type BoxFeature = 'lean' | 'angle cut' | 'curve' | 'edge profile' | 'edge banding' | 'round tenon';
const FEATURE_WORDS: Record<BoxFeature, string> = {
  lean: 'a lean', 'angle cut': 'an angle cut', curve: 'a curve', 'edge profile': 'an edge profile',
  'edge banding': 'edge banding', 'round tenon': 'a round tenon',
};
export const boxPlainStock = (part: string, f: BoxFeature) => `${part} has ${FEATURE_WORDS[f]} — box joints work on plain stock for now.`;
/** A corner whose parts are in different containers (spec §6; no selection reaches it, Spec difference 1). */
export const boxContainers = (a: string, b: string) => `${a} and ${b} must be in the same assembly.`;
/** A part reached through a mirrored instance (spec §6). */
export const boxMirrored = (part: string) => `Box joints can't reach a part inside a mirrored copy yet: ${part}.`;
/** A jointed part's Shape mate that is not jointed at the matching end (spec §6). */
export const boxLinkedMate = (part: string, mate: string) => `${part} is linked to ${mate} — select ${mate}'s corner too, or Unlink first.`;
/** The users of one Shape would need different joints (spec §6). */
export const boxLinkedDisagree = (parts: readonly string[]) => `These linked parts would need different box joints: ${parts.join(', ')}.`;
/** The written result would no longer keep a Shape's users on one Shape (plan Spec difference 3 revised). */
export const boxLinkSplit = (parts: readonly string[]) => `Box joints can't keep these linked parts linked: ${parts.join(', ')}. Unlink them first.`;
/** A finger width that is not more than zero. */
export const BOX_WIDTH_POSITIVE = 'A finger width must be more than zero.';

/** `<N> fingers, <w> wide (the outer two <e>)`, the parenthesis dropped when `e === w` (a PLANNED layout: exact). */
const layoutWords = (l: FingerLayout, units: Units) =>
  `${l.count} fingers, ${formatLength(l.width, units)} wide${l.outer === l.width ? '' : ` (the outer two ${formatLength(l.outer, units)})`}`;

/** The success note's jointed line(s) (spec §4): one line when every corner shares one layout, else a heading and one
 *  line per corner, `pairs` naming each corner's two parts. */
export function boxJointedLines(layouts: readonly FingerLayout[], pairs: readonly (readonly [string, string])[], units: Units): string[] {
  const n = layouts.length;
  const same = layouts.every((l) => l.count === layouts[0]!.count && l.width === layouts[0]!.width && l.outer === layouts[0]!.outer);
  if (same) return [`Jointed ${n} ${n === 1 ? 'corner' : 'corners'}: ${layoutWords(layouts[0]!, units)}.`];
  return [`Jointed ${n} corners:`, ...layouts.map((l, i) => `${pairs[i]![0]} and ${pairs[i]![1]}: ${layoutWords(l, units)}.`)];
}

/** A success note line per part whose size along a run dimension changed (`delta` its signed change). */
export const boxLengthLine = (part: string, delta: number, units: Units) =>
  `${part} is now ${formatLength(Math.abs(delta), units)} ${delta > 0 ? 'longer' : 'shorter'}.`;

/** The cut list's line for a recognised finger set (spec §5.2; Task 5). A RECOGNISED layout may be an ulp off the planned
 *  one (Task 2), so "every finger is `w`" is judged at 1e-9 here. */
export function fingerSetLine(set: FingerSet, units: Units): string {
  const { count, width, outer } = set.layout;
  const outerWords = Math.abs(outer - width) <= 1e-9 ? '' : ` (the outer two ${formatLength(outer, units)})`;
  return `Box joint — ${count} fingers ${formatLength(width, units)} wide${outerWords}, ${formatLength(set.depth, units)} deep, `
    + `at the ${set.dim} ${set.end} end; this part has the outer ${set.outerFingers ? 'fingers' : 'notches'}.`;
}

/** The panel section's copy (spec §4). */
export const BOX_HEADING = 'Box joints';
export const BOX_FIELD_WIDTH = 'Finger width';
export const BOX_SWAP = 'Swap fingers';
export const BOX_BUTTON = 'Box joint the corners';
