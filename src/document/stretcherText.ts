import { formatLength, type Units } from '../units/length';

/**
 * The stretchers' copy (stretchers spec §3, §4, §6; Global Constraints, verbatim): the ONE home of every new sentence.
 * Lengths through `units/length.ts` with the document's own units (inv 52). The sentences the feature reuses stay in their
 * own homes: `socketTooSteep` (legSockets.ts), the too-wide tenon sentence (`tenonFaultText`, tenonText.ts) and the
 * socket fault words (`socketFaultWords`, holeText.ts).
 */

/** A leg leaning TURNED with a non-zero twist (`leanTwist`): its faces are not square to a rung along the sides (spec
 *  Amended S1). Checked first. */
export const stretcherTurnedLeg = (leg: string) => `Set ${leg} square to the sides first (Lean).`;
/** The two legs' axis points at the height differ in both X and Z (or in neither), to 1e-6. */
export const STRETCHER_NOT_SQUARE =
  "These legs aren't square to each other at that height — a stretcher must run straight along the front, back or sides.";
/** The height is not strictly inside the leg's axis, or the rung's section would not lie on one of its long faces. */
export const stretcherOutOfReach = (leg: string) => `${leg} doesn't reach that height.`;
/** The two legs are not in one container. */
export const STRETCHER_CONTAINERS = 'Select two legs in the same assembly.';
/** A leg's placement chain crosses a mirrored instance (a later round can lower through the mirror). */
export const stretcherMirrored = (leg: string) => `A stretcher can't join a leg inside a mirrored copy yet: ${leg}.`;
/** A socket with a hole fault (`holeFaults`); `words` are `socketFaultWords`' (Bore leg sockets' `socketFaulted` shape). */
export const stretcherSocketFaulted = (leg: string, words: string) =>
  `${leg}'s socket would ${words} — choose a different height, or a smaller tenon.`;
/** A bore along the rung's axis that the planned tenon would enter but not be seated in. */
export const stretcherDifferentSocket = (leg: string) => `${leg} already has a different socket there — remove it first.`;
/** One line per part that received the socket through its link (a Shape's other user, a definition's other placement). */
export const stretcherLinkNote = (part: string) => `${part} got this socket too, through its link.`;
/** The rung's readout (§4): `g` the larger end's widest shoulder-corner gap (§5.3). */
export const stretcherReadout = (a: string, b: string, h: number, g: number, units: Units) =>
  `Between ${a} and ${b}, ${formatLength(h, units)} up · shoulder gap up to ${formatLength(g, units)}`;
/** A stretcher whose tenons are no longer seated (§6.2). */
export const stretcherStale = (a: string, b: string) => `No longer fits ${a} and ${b} — Fit the stretcher again.`;
/** A re-fit's closure plans one shared row in two places (§6.3). */
export const stretcherClosureDisagrees = (rungs: readonly string[]) =>
  `These linked legs need their shared socket in different places: ${rungs.join(', ')}.`;
/** A re-fit whose axis now runs along the other world axis (§6.4). */
export const stretcherTurned = (rung: string) => `${rung} would now run the other way — add it again.`;
/** A stale tenon with two equally near candidate bores (§6.2). */
export const stretcherAmbiguous = (leg: string) => `${leg} has two sockets this tenon could be in — remove one.`;

/** INTERNAL (the store's `fitStretcher` on a part `stretcherOf` does not find; the button is never shown for one): not
 *  user copy from the spec, so it is short and plain. */
export const STRETCHER_NOT_A_STRETCHER = 'This part is not a stretcher.';

/** The section's heading, fields and buttons (§4). */
export const STRETCHER_HEADING = 'Stretcher';
export const STRETCHER_FIELDS = { height: 'Height', size: 'Rung size', diameter: 'Tenon diameter' } as const;
export const ADD_STRETCHER = 'Add stretcher';
export const FIT_STRETCHER = 'Fit the stretcher again';
