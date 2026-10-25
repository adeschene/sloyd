import type { TenonFault, TenonFeature } from './roundTenons';

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
