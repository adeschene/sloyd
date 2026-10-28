import { formatLength, type Units } from '../units/length';

/**
 * The stretch's copy (parametric-resize spec §4–§6; Global Constraints, verbatim): the ONE home of every refusal sentence.
 * Lengths through `units/length.ts` with the document's own units (inv 52). `<part>` and `<assembly>` are the node's own
 * name. The panel's words join this file with the panel (Task 5).
 */

/** The line is not strictly inside the selection's extent on its axis. */
export const STRETCH_LINE_INSIDE = 'The stretch line must be inside the selection.';
/** The typed overall size is not more than 0. */
export const STRETCH_SIZE_POSITIVE = 'The size must be more than 0.';
/** A spanning part's dimension on the axis is its thickness (spec §4.2). */
export const thicker = (part: string) => `${part} would get thicker — the line runs through its thickness; move the line.`;
/** A spanning part leans (inv 57: a lean's resize keeps a pivot a stretch can't honour). */
export const leansText = (part: string) => `${part} leans, so it can't be stretched — move the line off it.`;
/** A spanning part carries a compound end cut (inv 59). */
export const compoundText = (part: string) => `${part} has a compound end cut, so it can't be stretched — move the line off it.`;
/** One feature straddles the line (spec §5): `word` is `hole row`, `curve`, `round tenon`, `profile`, `cut`, or an angle
 *  cut's `kind`. */
export const crosses = (part: string, word: string) => `${part}'s ${word} crosses the stretch line — move the line.`;
/** A box-jointed corner the line reaches (its zone on `dim`, or `d` is the corner's J). */
export const boxJointsAcross = (part: string) => `${part} has box joints across the stretch line — move the line.`;
/** A dovetailed corner the line reaches (its zone on `dim`, or `d` is the corner's J). */
export const dovetailsAcross = (part: string) => `${part} has dovetails across the stretch line — move the line.`;
/** A tenoned part spanning across its section (`d` is the width): the tenon is centred on it. */
export const tenonCentred = (part: string) =>
  `${part}'s round tenon is centred on its section, so it can't be stretched across it — move the line off it.`;
/** A spanning part with both curves and profiles (a profile on a curved part follows the outline). */
export const curvesAndProfiles = (part: string) =>
  `${part} has curves and profiles, so it can't be stretched — move the line off it.`;
/** A shrink by `amount` (either sign; its size is printed) would remove past the part's far end. */
export const tooShort = (part: string, amount: number, units: Units) =>
  `${part} is too short to shrink by ${formatLength(Math.abs(amount), units)} at this line.`;
/** The copies post-condition (spec §6): two placements of one definition would be lowered differently. */
export const copiesDiffer = (assembly: string) =>
  `${assembly} has copies this stretch would change differently — Make Unique first.`;
/** The links post-condition (spec §6): two users of one Shape would be lowered differently. */
export const linkDiffers = (part: string, other: string) =>
  `${part} is linked to ${other}, which this stretch changes differently — Unlink first.`;
