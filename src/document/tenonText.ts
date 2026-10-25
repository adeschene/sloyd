import type { Board, RoundTenon } from './types';
import { shoulderAt, tenonFaults, type TenonFault, type TenonFeature } from './roundTenons';
import { formatLength, type Units } from '../units/length';
import { holeLengthText } from './holeText';

/** The words for a feature a tenon would run into (round tenons spec §3.2), verbatim. */
const FEATURE_WORD: Record<TenonFeature, string> = {
  cut: 'a rectangular cut',
  'angle-cut': 'an angle cut',
  hole: 'a hole',
  curve: 'a curve',
  profile: 'a profile',
  band: 'a band',
};

/** The ONE home of the tenon fault copy (Global Constraints, verbatim). Pure: imports nothing from store or panels. */
export function tenonFaultText(f: TenonFault): string {
  switch (f.kind) {
    case 'too-wide': return "A round tenon must be narrower than the part's section.";
    case 'too-long': return 'The tenons would meet — shorten one.';
    case 'cut-reaches-shoulder': return "The end's cut reaches the shoulder — lengthen the tenon.";
    case 'meets-feature':
      return `The tenon would run into ${f.feature ? FEATURE_WORD[f.feature] : 'a feature'} — move it or remove it first.`;
  }
}

/** The shoulder's distance from the OTHER end, at the centre (where the axis meets that end's face: `shoulderAt` with a
 *  zero length is that point). The ONE home of the number the bench line and the Properties readout both print. */
export function shoulderFromFarEnd(b: Board, t: RoundTenon): number {
  const far = shoulderAt(b, { end: t.end === 'min' ? 'max' : 'min', length: 0 });
  return Math.abs(shoulderAt(b, t) - far);
}

/**
 * One round tenon as a bench line (round tenons spec §8): THE one home of the string (invariant 19). Every length through the
 * document's units (inv 52), the diameter at a hole's precision (`holeLengthText`), so a tenon and its socket read the same
 * number. `<s>` is the shoulder's distance from the OTHER end at the centre: where the axis meets that end's face, square or
 * mitered (`shoulderAt` with a zero length is that point), never its long point. A far end with any other cut (a bevel, a
 * chamfer, a second cut: `endCutOf`'s `'other'`) is measured from its uncut END FACE, as `shoulderAt` models it — right for a
 * corner chamfer, which leaves the axis on the square face; approximate for a cut that crosses the axis. Printed for every
 * STORED tenon; a faulted one (kept, not built) ends with its first fault and how many more (ruling T6b, `holeLine`'s shape).
 */
export function tenonLine(b: Board, t: RoundTenon, units: Units): string {
  const s = shoulderFromFarEnd(b, t);
  const base = `${holeLengthText(t.diameter, units, 'diameter')} round tenon, ${formatLength(t.length, units)} long — at the length ${t.end} end, shoulder ${formatLength(s, units)} from the other end`;
  const faults = tenonFaults(b, t);
  if (faults.length === 0) return base;
  return `${base} — check: ${tenonFaultText(faults[0]!)}${faults.length > 1 ? ` (and ${faults.length - 1} more)` : ''}`;
}
