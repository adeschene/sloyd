import { formatLength, type Units } from '../units/length';
import type { FingerLayout, FingerSet } from './boxJoints';
import { positionAxisOf } from './geometry';
import { fingerAtMaxOf } from './fingerParity';

/**
 * The box joints' copy (box-joints spec §3, §4, §5.2, §6; plan Global Constraints, verbatim): the ONE home of every
 * sentence the planner returns and of the cut-list line. Lengths go through `units/length.ts` with the document's own
 * units (inv 52), so this module takes `units` and `boxJoints.ts` stays numbers-only (CLAUDE.md, the `→ units` edge rule).
 */

/** The sentences box joints share with every corner joint (moved unchanged to `cornerText.ts`), under their old names:
 *  no corner (spec §3.1), a selected part in no corner, different heights along the joint, one end in two corners,
 *  different containers (spec §6; no selection reaches it, Spec difference 1), a Shape mate not jointed at the matching
 *  end (spec §6), and the length line. */
export {
  NO_CORNER as BOX_NO_CORNER, cornerIgnored as boxIgnored, cornerHeights as boxHeights, cornerTwoCorners as boxTwoCorners,
  cornerContainers as boxContainers, cornerLinkedMate as boxLinkedMate, cornerLengthLine as boxLengthLine,
} from './cornerText';

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
/** A part reached through a mirrored instance (spec §6). */
export const boxMirrored = (part: string) => `Box joints can't reach a part inside a mirrored copy yet: ${part}.`;
/** The users of one Shape would need different joints (spec §6). */
export const boxLinkedDisagree = (parts: readonly string[]) => `These linked parts would need different box joints: ${parts.join(', ')}.`;
/** The written result would no longer keep a Shape's users on one Shape (plan Spec difference 3 revised). */
export const boxLinkSplit = (parts: readonly string[]) => `Box joints can't keep these linked parts linked: ${parts.join(', ')}. Unlink them first.`;
/** A finger width that is not more than zero. */
export const BOX_WIDTH_POSITIVE = 'A finger width must be more than zero.';

/** `<N> fingers, <w> wide (the odd one <x>)`, the parenthesis dropped when `odd === width` (a PLANNED layout: exact). */
const layoutWords = (l: FingerLayout, units: Units) =>
  `${l.count} fingers, ${formatLength(l.width, units)} wide${l.odd === l.width ? '' : ` (the odd one ${formatLength(l.odd, units)})`}`;

/** The success note's jointed line(s) (spec §4): one line when every corner shares one layout, else a heading and one
 *  line per corner, `pairs` naming each corner's two parts. */
export function boxJointedLines(layouts: readonly FingerLayout[], pairs: readonly (readonly [string, string])[], units: Units): string[] {
  const n = layouts.length;
  const same = layouts.every((l) => l.count === layouts[0]!.count && l.width === layouts[0]!.width && l.odd === layouts[0]!.odd);
  if (same) return [`Jointed ${n} ${n === 1 ? 'corner' : 'corners'}: ${layoutWords(layouts[0]!, units)}.`];
  return [`Jointed ${n} corners:`, ...layouts.map((l, i) => `${pairs[i]![0]} and ${pairs[i]![1]}: ${layoutWords(l, units)}.`)];
}

/**
 * The cut list's and diagram's line for a recognised finger set (spec, Amended 2026-10-27): `Box joint — <N> fingers <w>
 * wide (the odd one <x> at the <J> <oddEnd> edge), <d> deep, at the <dim> <end> end; this part has a <finger | notch> at
 * the <J> <start> edge.`, `J` the part's own joint-line dimension and the start edge the end opposite the odd finger. With
 * no odd finger the parenthesis is dropped and the start edge is `J`'s max (a part-local convention). Part-local words
 * only, never world ones (the recogniser reports nothing world-relative).
 */
export function fingerSetLine(set: FingerSet, units: Units): string {
  const { count, width, odd } = set.layout;
  const J = positionAxisOf(set.dim, 'thickness');
  const oddWords = set.oddEnd === null ? '' : ` (the odd one ${formatLength(odd, units)} at the ${J} ${set.oddEnd} edge)`;
  const start = set.oddEnd === 'max' ? 'min' : 'max';
  const finger = start === 'min' ? set.fingerAtMin : fingerAtMaxOf(count, set.fingerAtMin);
  return `Box joint — ${count} fingers ${formatLength(width, units)} wide${oddWords}, ${formatLength(set.depth, units)} deep, `
    + `at the ${set.dim} ${set.end} end; this part has a ${finger ? 'finger' : 'notch'} at the ${J} ${start} edge.`;
}

/** Add joinery's skip (or refusal) reason for a site whose recipe would resize, trim or move a part with any
 *  recognised finger set, at whatever end or axis (spec §7; a pocket INTO one stays allowed). */
export const boxJointedLeftAlone = (part: string) => `${part} has box joints, so joinery leaves its size and place alone`;

/** Refine's refusal when reading a joined project's other joints back would change a part's box joints (spec §7). */
export const boxJointsThroughJoints = (part: string) => `Refine can't keep ${part}'s box joints through its other joints yet.`;
/** A joined Refine's `notJoined` reason when the re-join would change a kept part: a box-jointed one, or any part of a kept box-jointed assembly (spec §7, inv 41). */
export const boxJointJoinChanged = (part: string) => `Joinery would have changed ${part}, which Refine keeps as it is for its box joints, so the design comes back unjoined.`;

/** The panel section's copy (spec §4). */
export const BOX_HEADING = 'Box joints';
export const BOX_FIELD_WIDTH = 'Finger width';
export const BOX_SWAP = 'Swap fingers';
export const BOX_BUTTON = 'Box joint the corners';
