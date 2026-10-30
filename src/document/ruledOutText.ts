/**
 * The summary line for a site whose joint kinds a feature ruled out (joinery-holes spec §3.5). The document layer:
 * plain names in, a sentence out. It produces no length, so it imports nothing from `units`. `kinds` are `JointKind`
 * strings; this module owns their words.
 */
import type { ProfileKind } from './types';

/** The feature that rules a kind out, as the line names it (joinery features P8): `<kind> profile` for an edge profile,
 *  `edge band` for a band (chunk 3). */
export type FeatureWord = 'holes' | 'curve' | 'edge band' | 'roundover profile' | 'cove profile' | 'Roman ogee profile' | 'bead profile' | 'thumbnail profile';
/** An edge profile's word (`profileWord`'s values). */
export type ProfileWord = Extract<FeatureWord, `${string} profile`>;
const PROFILE_WORDS: Record<ProfileKind, ProfileWord> = {
  roundover: 'roundover profile', cove: 'cove profile', ogee: 'Roman ogee profile', bead: 'bead profile', thumbnail: 'thumbnail profile',
};
export function profileWord(kind: ProfileKind): ProfileWord { return PROFILE_WORDS[kind]; }

export interface RuledOutLine {
  enter: string;
  receive: string;
  kinds: readonly string[];
  /** True when the site is left butt: `kinds` is then ignored. */
  butt: boolean;
  part: string;
  feature: FeatureWord;
}

const WORDS: Record<string, string> = { 'mortise-tenon': 'mortise and tenon', 'stopped-dado': 'stopped dado' };
const word = (k: string) => WORDS[k] ?? k;

/** `a`, `a and b`, `a, b and c`. */
function joined(words: string[]): string {
  return words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** The verb agrees with the feature word: `are` after `holes`, `is` otherwise (P8). */
export function ruledOutLine(l: RuledOutLine): string {
  const head = `${l.enter} → ${l.receive}: `;
  const verb = l.feature === 'holes' ? 'are' : 'is';
  return l.butt
    ? `${head}left as a butt — ${l.part}'s ${l.feature} ${verb} in the way of every joint.`
    : `${head}${joined(l.kinds.map(word))} ruled out — ${l.part}'s ${l.feature} ${verb} in the way.`;
}
