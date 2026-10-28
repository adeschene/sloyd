import type { DovetailFault } from './dovetails';
import type { Board, Dovetail } from './types';
import { DOVETAIL_COUNT_MAX, dovetailTailWidth, jointLineOf } from './dovetailModel';
import { formatLength, type Units } from '../units/length';

/**
 * The through dovetails' copy (dovetails spec §3, §4, §6, §7; plan Global Constraints, verbatim): the ONE home of every
 * sentence the planner returns, the fault notes and the panel's labels. The sentences dovetails share with box joints
 * live in `cornerText.ts` and are re-exported here, never redefined. The cut-list line is `dovetailLine`; the bench
 * drawing's words are the `BENCH_` constants at the end (Task 7). The layout is read from the LEAF `dovetailModel.ts`, never
 * from `dovetails.ts` (whose copy table is built from this module at load: an import back would be a cycle). A slope reads `1:<s>`, `s` printed by `String(s)`.
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
export const dovetailHoleInTheWay = (part: string) => `${part} has a hole where the dovetails go — move or remove it first.`;
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
/** A typed tail count that is not a whole number from 1 to DOVETAIL_COUNT_MAX (the bound: final review, 2026-10-27). */
export const DOVETAIL_COUNT_WHOLE = `A tail count must be a whole number from 1 to ${DOVETAIL_COUNT_MAX}.`;
/** The word after a count of tails: `1 tail`, `2 tails` (final review, 2026-10-27: every printed count reads through it). */
export const tailWord = (n: number) => (n === 1 ? 'tail' : 'tails');
/** A corner whose `count` tails (the count that failed) fault on either part (spec §3.2). At one tail (Auto bottomed out,
 *  or a typed 1) fewer is no advice: the even-one-tail sentence (final review, 2026-10-27). */
export const dovetailTooNarrow = (a: string, b: string, count: number, slope: number) => (count === 1
  ? `${a} and ${b} are too narrow for even one tail at ${slopeText(slope)} — try a shallower slope or a wider part.`
  : `${a} and ${b} are too narrow for ${count} ${tailWord(count)} at ${slopeText(slope)} — try fewer tails.`);

/** A half-blind corner whose lap (typed, kept or Auto) is not strictly inside the pin part's thickness (half-blind spec §3.2,
 *  §4): refused before any end moves, naming the pin part. */
export const dovetailTooThin = (part: string, lap: number, units: Units) => `${part} is too thin for a ${formatLength(lap, units)} lap.`;

/** A planned dovetail that would fault anything but `narrow` (the count handles that): the part is too short along its run
 *  for its dovetails (one deeper than the part, or two meeting). Wording ruled 2026-10-27 (Task 4 fix). */
export const dovetailTooShort = (part: string) => `${part} is too short for its dovetails.`;

/** One corner's planned numbers, as the success note reads them: the count, the slope and, on a half-blind corner, the lap
 *  (absent or null: through). */
export interface DovetailedLayout { count: number; slope: number; lap?: number | null }
const layoutWords = (l: DovetailedLayout) => `${l.count} ${tailWord(l.count)}, ${slopeText(l.slope)}`;
const lapOf = (l: DovetailedLayout) => l.lap ?? null;

/** The success note's dovetailed line(s) (spec §4; half-blind spec §4): one line when every corner shares one layout (count,
 *  slope and lap), else a heading and one line per corner, `pairs` naming each corner's two parts. A through layout reads
 *  as before, byte for byte; a half-blind one names the kind and the lap (`formatLength` with `units`, which a layout with a
 *  lap requires: there is no default to fall back on). */
export function dovetailedLines(
  layouts: readonly DovetailedLayout[], pairs: readonly (readonly [string, string])[], units?: Units,
): string[] {
  const lapText = (lap: number) => {
    if (units === undefined) throw new Error('dovetailedLines: a half-blind layout needs the units');
    return `${formatLength(lap, units)} lap`;
  };
  const n = layouts.length;
  const first = layouts[0]!;
  const same = layouts.every((l) => l.count === first.count && l.slope === first.slope && lapOf(l) === lapOf(first));
  if (same) {
    const lap = lapOf(first);
    const corners = `${n} ${n === 1 ? 'corner' : 'corners'}`;
    return [lap === null
      ? `Dovetailed ${corners}: ${layoutWords(first)}.`
      : `Dovetailed ${corners}, half-blind: ${layoutWords(first)}, ${lapText(lap)}.`];
  }
  return [`Dovetailed ${n} corners:`, ...layouts.map((l, i) => {
    const lap = lapOf(l);
    return `${pairs[i]![0]} and ${pairs[i]![1]}: ${layoutWords(l)}${lap === null ? '' : `, half-blind, ${lapText(lap)}`}.`;
  })];
}
/** The success note's line naming the parts that took the tails (spec §3.3). */
export const dovetailTailsOn = (parts: readonly string[]) => `Tails on ${parts.join(', ')}.`;

/** Another feature added to a dovetailed part. */
export const dovetailRemoveFirst = (part: string) => `${part} has dovetails — remove them first.`;
/** A cut or hole reaching a dovetailed end. */
export const dovetailMoveClear = (part: string) => `${part} has dovetails at that end — keep cuts and holes clear of the joint.`;
/** Add joinery's skip (or refusal) reason for a site that would resize, trim or move a dovetailed part (spec §7). */
export const dovetailedLeftAlone = (part: string) => `${part} has dovetails, so joinery leaves its size and place alone`;
/** Refine's refusal when a kept assembly with dovetails (and no box joints) has a part linked outside it (spec §7; the
 *  box-joint sentence stays beside its decider, `leanKeep.ts`). */
export const dovetailedAssemblyLinked = (part: string) =>
  `Refine can't keep an assembly with dovetails whose parts are linked to parts outside it — Unlink first: ${part}.`;
/** The same for a kept assembly with box joints AND dovetails. */
export const mixedAssemblyLinked = (part: string) =>
  `Refine can't keep an assembly with box joints and dovetails whose parts are linked to parts outside it — Unlink first: ${part}.`;
/** Refine's kept why-word (spec §7). */
export const DOVETAIL_KEPT_WHY = 'has dovetails';
/** A joined Refine's `notJoined` reason when the re-join would change a kept part whose only kept kind is dovetails. */
export const dovetailJoinChanged = (part: string) => `Joinery would have changed ${part}, which Refine keeps as it is for its dovetails, so the design comes back unjoined.`;

/** The single-part section's note for a stored dovetail that faults (spec §3.5): one reason per fault. */
const FAULT_REASONS: Record<DovetailFault, string> = {
  narrow: 'a tail is narrower than a pin',
  count: "the tail count isn't a whole number, 1 or more",
  slope: 'the slope is outside 1:4 to 1:12',
  depth: 'the part is too short for it',
  lap: "the lap isn't inside the part's thickness",
};
export const dovetailFaultText = (f: DovetailFault) => `This dovetail no longer fits: ${FAULT_REASONS[f]}.`;

/** The panel's copy (spec §4): the multi-part section, then the single-part section. */
export const DOVETAIL_HEADING = 'Dovetails';
export const DOVETAIL_FIELD_SLOPE = 'Slope';
export const DOVETAIL_SLOPE_PREFIX = '1 :';
export const DOVETAIL_FIELD_TAILS = 'Tails';
export const DOVETAIL_TAILS_PLACEHOLDER = 'Auto';
export const DOVETAIL_SWAP = 'Swap tails and pins';
export const DOVETAIL_FIELD_JOINT = 'Joint';
export const DOVETAIL_JOINT_KEEP = 'As they are';
export const DOVETAIL_JOINT_THROUGH = 'Through';
export const DOVETAIL_JOINT_HALF_BLIND = 'Half-blind';
export const DOVETAIL_FIELD_LAP = 'Lap';
/** A typed lap that is not a length more than 0 (half-blind spec §4): the Lap field's parse error, and the planner's answer
 *  to a typed lap of 0, below 0 or NaN (a lap at or past the pin part's thickness is `dovetailTooThin`). */
export const DOVETAIL_LAP_PARSE = 'A lap must be a length more than 0.';
export const DOVETAIL_BUTTON = 'Dovetail the corners';
export const DOVETAIL_REMOVE = 'Remove';

/**
 * A stored dovetail's cut-list line (spec §5.1, Global Constraints, verbatim): the count, the slope `1:<s>`, the pin at the
 * narrow end, the depth, the end; then the tails part's tail width at the end (`Te` from the ONE layout, on the part's own
 * joint line) or the pins part's narrow thickness face. Lengths through `formatLength` with the document's units (inv 52).
 */
export function dovetailLine(b: Pick<Board, 'length' | 'width'>, d: Dovetail, units: Units): string {
  if (d.lap !== undefined) return halfBlindLine(b, d, d.lap, units);
  const head = `Through dovetails — ${d.count} ${tailWord(d.count)}, ${slopeText(d.slope)}, pins ${formatLength(d.pin, units)} at the narrow end, `
    + `${formatLength(d.depth, units)} deep, at the ${d.dim} ${d.end} end`;
  if (d.role === 'tails') {
    const Te = dovetailTailWidth(b[jointLineOf(d.dim)], d.count, d.pin);
    return `${head}; this part has the tails, each ${formatLength(Te, units)} wide at the end.`;
  }
  return `${head}; this part has the pins, their narrow ends on its thickness ${d.outside} face.`;
}

/**
 * A half-blind dovetail's cut-list line (half-blind spec §5.1, Global Constraints, verbatim; copy review owed): the through
 * line's numbers under the `Half-blind` head; the pins part's tail names the lap, its narrow ends `lap` in from its outside
 * face. A through line never comes here (`dovetailLine` branches on a present `lap`), so it stays byte for byte as it was.
 */
function halfBlindLine(b: Pick<Board, 'length' | 'width'>, d: Dovetail, lap: number, units: Units): string {
  const head = `Half-blind dovetails — ${d.count} ${tailWord(d.count)}, ${slopeText(d.slope)}, pins ${formatLength(d.pin, units)} at the narrow end, `
    + `${formatLength(d.depth, units)} deep, at the ${d.dim} ${d.end} end`;
  if (d.role === 'tails') {
    const Te = dovetailTailWidth(b[jointLineOf(d.dim)], d.count, d.pin);
    return `${head}; this part has the tails, each ${formatLength(Te, units)} wide at the end.`;
  }
  return `${head}; this part has the pins, their narrow ends ${formatLength(lap, units)} in from its thickness ${d.outside} face (the lap).`;
}

/** The bench drawings' words (spec §5.2, Global Constraints; built in `dovetailBench.ts`, measured there as labels, inv 19).
 *  ASCII only, so `labelWidth`'s monospace arithmetic holds without a browser measurement. */
export const BENCH_OUTSIDE_FACE = 'outside face';
export const BENCH_INSIDE_FACE = 'inside face';
export const BENCH_BOTH_ENDS = 'both ends';
/** Figure A's dashed baseline, with the depth it sits at: `baseline 3/4"`. */
export const benchBaseline = (depth: string) => `baseline ${depth}`;
/** Figure A's end note for a layout on ONE end (two equal ends read `both ends`): `length max end`. New copy (Task 7). */
export const benchEnd = (dim: Dovetail['dim'], end: Dovetail['end']) => `${dim} ${end} end`;
/** Figure B's lap on a half-blind bench (half-blind spec §5.2, Global Constraints): `lap 1/4"`. */
export const benchLap = (lap: string) => `lap ${lap}`;
/** The two figures' captions (HTML, not measured). Copy review owed with fu 491's. */
export const BENCH_TAIL_HEADING = "Dovetails — the tail board's face";
export const BENCH_PIN_HEADING = "Dovetails — the pin board's end grain";
