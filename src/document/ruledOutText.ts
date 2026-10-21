/**
 * The summary line for a site whose joint kinds a feature ruled out (joinery-holes spec §3.5). The document layer:
 * plain names in, a sentence out. It produces no length, so it imports nothing from `units`. `kinds` are `JointKind`
 * strings; this module owns their words.
 */
export interface RuledOutLine {
  enter: string;
  receive: string;
  kinds: readonly string[];
  /** True when the site is left butt: `kinds` is then ignored. */
  butt: boolean;
  part: string;
  feature: 'holes';
}

const WORDS: Record<string, string> = { 'mortise-tenon': 'mortise and tenon', 'stopped-dado': 'stopped dado' };
const word = (k: string) => WORDS[k] ?? k;

/** `a`, `a and b`, `a, b and c`. */
function joined(words: string[]): string {
  return words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

export function ruledOutLine(l: RuledOutLine): string {
  const head = `${l.enter} → ${l.receive}: `;
  return l.butt
    ? `${head}left as a butt — ${l.part}'s ${l.feature} are in the way of every joint.`
    : `${head}${joined(l.kinds.map(word))} ruled out — ${l.part}'s ${l.feature} are in the way.`;
}
