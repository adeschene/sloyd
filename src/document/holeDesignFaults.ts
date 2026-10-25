import type { FlatDocument } from './types';
import type { Units } from '../units/length';
import type { Violation } from './designCheck';
import { holeFaults } from './holeFaults';
import type { HoleFaultKind } from './holeFaults';
import { holeFaceText } from './holeText';
import { localToDir } from './taperWorld';
import { worldHoles } from './holeWorld';

/** Each strict fault in the design's words (AI-holes spec §3.1); the face is named before it. */
const PHRASE: Record<HoleFaultKind, string> = {
  'breaks-out': 'breaks out of its face',
  'off-flat': 'runs into a cut or angle',
  'meets-hole': 'meets another hole',
  'too-deep': 'is deeper than the part',
  'too-shallow': 'is too shallow for its angle',
};
const KINDS = Object.keys(PHRASE) as HoleFaultKind[];

/**
 * The STRICT hole faults of a converted design (AI-holes spec §3.1): one `'hole-fault'` per (row, fault kind), in
 * `holeFaults`' kind order, the row named by its face and first centre. A faulted row is stored, never rejected (inv 50: a faulted but well-formed row is KEPT and
 * noted); this feeds it back to the model, the face in world words (`message`), and to a person, the face as the bench
 * names it (`shown`, through holeText). Not part of checkDesign, which ignores holes (inv 38): evaluateDesign adds it,
 * and Refine's `preexisting` reads the original's. No length is printed, so `display` changes nothing yet; it is taken
 * as jointFaults takes it, so a later length in the text has its units.
 */
export function holeDesignFaults(flat: FlatDocument, _display: Units): Violation[] {
  const out: Violation[] = [];
  for (const b of flat.boards) {
    for (const r of b.holes) {
      const found = new Set(holeFaults(b, r).map((f) => f.kind));
      if (found.size === 0) continue;
      // The row's first centre, as the design writes it (its offset from the part's `at`): with the face, the row's
      // identity (spec §3.1), so two faulted rows on one face read, and key, apart.
      const o = worldHoles({ ...b, holes: [r] })[0]!.offset;
      const at = `starting at ${+o.x.toFixed(3)}, ${+o.y.toFixed(3)}, ${+o.z.toFixed(3)}in`;
      for (const kind of KINDS) {
        if (!found.has(kind)) continue;
        out.push({
          kind: 'hole-fault', parts: [b.name],
          message: `${b.name}'s hole row on ${localToDir(b, r.face, r.from)} ${at} ${PHRASE[kind]}.`,
          shown: `${b.name}'s hole row on ${holeFaceText(r)} ${PHRASE[kind]}.`,
        });
      }
    }
  }
  return out;
}
