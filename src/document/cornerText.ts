import { formatLength, type Units } from '../units/length';

/**
 * The corner planner's SHARED copy (dovetails spec §3.1; plan Global Constraints, verbatim): the sentences box joints and
 * dovetails word identically, moved here unchanged from `boxJointText.ts` (which re-exports them under their old names).
 * A joint kind's own wording (the plain-stock, cut, hole, mirrored, three-way and link sentences) stays in its own text
 * module and reaches `cornerPlan.ts` through the kind's `CornerCopy`. Lengths go through `units/length.ts` with the
 * document's own units (inv 52), so this module takes `units` and `cornerPlan.ts` stays numbers-only.
 */

/** No selected pair is a corner. */
export const NO_CORNER = "These parts don't meet at a corner.";
/** A success note line: a selected part in no corner. */
export const cornerIgnored = (part: string) => `${part} isn't at a corner with another selected part.`;
/** A candidate corner whose two parts span different intervals along the joint line. */
export const cornerHeights = (a: string, b: string) => `${a} and ${b} must be the same height along the joint.`;
/** One part end in two corners. */
export const cornerTwoCorners = (part: string) => `${part} meets two parts at one end.`;
/** A corner whose parts are in different containers. */
export const cornerContainers = (a: string, b: string) => `${a} and ${b} must be in the same assembly.`;
/** A jointed part's Shape mate that is not jointed at the matching end. */
export const cornerLinkedMate = (part: string, mate: string) => `${part} is linked to ${mate} — select ${mate}'s corner too, or Unlink first.`;
/** A success note line per part whose size along a run dimension changed (`delta` its signed change). */
export const cornerLengthLine = (part: string, delta: number, units: Units) =>
  `${part} is now ${formatLength(Math.abs(delta), units)} ${delta > 0 ? 'longer' : 'shorter'}.`;
