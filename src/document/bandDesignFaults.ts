import type { FlatDocument } from './types';
import type { Units } from '../units/length';
import type { Violation } from './designCheck';
import { bandFaults } from './banding';
import type { BandFaultKind } from './banding';
import { edgeName } from './holeText';
import { localToDir } from './taperWorld';

/** Each band fault in the design's words (AI-bands spec §3.2); the edge is named before it. */
const PHRASE: Record<BandFaultKind, string> = {
  'needs-straight': 'needs a straight edge',
  'no-side': 'is on a side that is cut away',
  'too-thick': 'is thicker than the part allows',
  'tape-narrow': 'is narrower than the part is thick',
};

/**
 * The band faults of a converted design (AI-bands spec §3.2): one `'band-fault'` per (part, side, fault kind), in
 * `bandFaults`' side order. A faulted band is stored, never rejected (inv 54: a faulted band is KEPT and noted); this
 * feeds it back to the model, the edge in world words (`message`), and to a person, the edge as the bench names it
 * (`shown`, the band line's side words). Not part of checkDesign: evaluateDesign adds it, and Refine's `preexisting`
 * reads the original's. No length is printed, so `display` changes nothing yet (taken as holeDesignFaults takes it).
 */
export function bandDesignFaults(flat: FlatDocument, _display: Units): Violation[] {
  const out: Violation[] = [];
  for (const b of flat.boards) {
    if (b.bands.length === 0) continue;
    const seen = new Set<string>();
    for (const f of bandFaults(b, flat.bandTypes)) {
      const key = `${f.side.across}:${f.side.from}:${f.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        kind: 'band-fault', parts: [b.name],
        message: `${b.name}'s edging on ${localToDir(b, f.side.across, f.side.from)} ${PHRASE[f.kind]}.`,
        shown: `${b.name}'s edging on ${edgeName({ dim: f.side.across, side: f.side.from })} ${PHRASE[f.kind]}.`,
      });
    }
  }
  return out;
}
