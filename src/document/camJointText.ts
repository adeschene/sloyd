import type { ProfileWord } from './ruledOutText';

/**
 * The cam-and-bolt joint's copy (cam-and-bolt joint spec §3.4, §4; fu 568 chunk 2): the ONE home of every sentence the
 * planner (`camJoint.ts`) returns and of the panel's words. Names come in as given (`displayNames`); no lengths are printed,
 * so this module takes no `units` (CLAUDE.md, the `→ units` edge rule). Wording for copy review.
 */

/** Either part leans (spec §3.4 check 2): its box is a pre-lean box (inv 57 R2), so the contact cannot be read. */
export const CAM_JOINT_LEAN = (part: string) => `${part} leans — a cam-and-bolt joint needs both parts square.`;
/** The two parts are not in one container (check 3). */
export const CAM_JOINT_CONTAINERS = 'Select two parts in the same assembly.';
/** A part reached through a mirrored instance (check 3). */
export const CAM_JOINT_MIRRORED = (part: string) => `A cam-and-bolt joint can't reach a part inside a mirrored copy yet: ${part}.`;
/** The two parts share one storage target: users of one Shape, whose holes are stored once (check 4). */
export const CAM_JOINT_SAME_PART = (a: string, b: string) =>
  `${a} and ${b} are linked, so they share their holes — a part can't be bolted to its own link.`;
/** No end of either part butts a face of the other, whole end inside the face (check 5, spec §3.1). */
export const CAM_JOINT_NONE = (a: string, b: string) =>
  `${a} and ${b} don't meet end to face — butt the end of one squarely against a face of the other.`;
/** What the joined end may not carry (check 6), in the order the planner tests them. */
export type CamEndFeature = 'round tenon' | 'dovetails' | 'box joints' | 'angle cut' | 'curve' | ProfileWord;
const END_FEATURE_WORDS: Record<CamEndFeature, string> = {
  'round tenon': 'a round tenon', dovetails: 'dovetails', 'box joints': 'box joints', 'angle cut': 'an angle cut',
  curve: 'a curve', 'roundover profile': 'a roundover profile', 'cove profile': 'a cove profile',
  'Roman ogee profile': 'a Roman ogee profile', 'bead profile': 'a bead profile', 'thumbnail profile': 'a thumbnail profile',
};
/** A's joined end is not square stock (check 6). */
export const CAM_JOINT_END_FEATURE = (part: string, feature: CamEndFeature) =>
  `${part} has ${END_FEATURE_WORDS[feature]} at that end — a cam-and-bolt joint needs a plain square end.`;
/** A typed fitting count that is not a whole number from 1 to `CAM_JOINT_MAX` (12). */
export const CAM_JOINT_COUNT = 'Fittings must be a whole number from 1 to 12.';
/** A is 1/2" or thinner: no room for the cam (chunk 1's R12 floor). */
export const CAM_JOINT_THIN = (part: string) => `${part} is too thin for a cam lock — it needs stock thicker than 1/2".`;
/** A's broad face is its length: the cam would enter an edge (chunk 1's R8). */
export const CAM_JOINT_ON_EDGE = (part: string) => `${part}'s end is too narrow for a cam lock — its broad face runs the wrong way.`;
/** Two or more fittings typed on an A whose end is no wider than the two 37 mm insets (ruling R17): no room to space them. */
export const CAM_JOINT_NARROW = (part: string, n: number) => `${part}'s end is too narrow for ${n} fittings — use fewer.`;
/** More than one whole cam pair at A's joined end. */
export const CAM_JOINT_TWO_LOCKS = (part: string) => `${part} has two cam locks at that end — remove one first.`;
/** A cam pair hole at A's joined end whose rows are not a whole pair. */
export const CAM_JOINT_PARTIAL = (part: string) =>
  `${part} has a cam lock at that end that isn't whole — remove it, or fix it in Holes, first.`;
/** Every planned bore is already there. */
export const CAM_JOINT_ALREADY = (a: string, b: string) => `${a} and ${b} are already joined here.`;
/** A new row with a hole fault (`holeFaults`); `words` are `holeText.ts`' fault words. */
export const camJointFaulted = (part: string, words: string) => `${part}'s bore would ${words} — move or remove what's in the way first.`;
/** A link or copy co-user of B whose new bore would open onto a bare face, against no part (ruling R18): a plain (not
 *  mirrored) link puts the bore on the copy's outside. */
export const CAM_JOINT_BARE_FACE = (part: string) =>
  `${part} would get a bore through its link that opens onto a bare face — make the link a mirrored pair, or unlink ${part}, first.`;
/** One line per OTHER part that received a row through its link (a Shape's other user, a definition's other placement). */
export const camJointLinkNote = (part: string) => `${part} got these bores too, through its link.`;

/** The panel's heading, fields and button (spec §4). */
export const CAM_JOINT_HEADING = 'Cam-and-bolt joint';
export const ADD_CAM_JOINT = 'Add joint';
export const CAM_FACE_LABEL = 'Cam face';
export const FITTINGS_LABEL = 'Fittings';
/** The joint found: A's end (the panel's end word) into B. */
export const camJointLine = (a: string, endWord: string, b: string) => `${a}'s ${endWord} end into ${b}`;
/** A's end already carries a whole cam pair: its fittings are used, the typed count ignored. */
export const camJointReused = (n: number) => `Uses the cam lock already at this end (${n} ${n === 1 ? 'fitting' : 'fittings'}).`;
/** The `Cam face` select's two words (ruling R2): each of A's broad faces named by the world direction it points, on the
 *  world axis carrying that face (the Align words, `alignText.ts`: −Z is the back, +Z the front). */
const CAM_FACE_WORDS = [
  { min: 'Left', max: 'Right' }, { min: 'Underside', max: 'Top' }, { min: 'Back', max: 'Front' },
] as const;
export const camFaceWord = (axis: 0 | 1 | 2, side: -1 | 1) => CAM_FACE_WORDS[axis][side === -1 ? 'min' : 'max'];
