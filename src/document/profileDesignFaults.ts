import type { Board, FlatDocument, ProfileCut } from './types';
import type { Units } from '../units/length';
import type { Violation } from './designCheck';
import { curveFaults } from './curves';
import { faceName } from './angleText';
import { profileName } from './curveText';
import { oneSide, profileAsCurve, profileFaults } from './profiles';
import { isSwept } from './profilePath';
import { localToDir } from './taperWorld';
import { carriesProfiles } from './featureCarry';

/** The kinds a design profile can fault with: `profileFaults`' and a straight run's prism faults (`curveFaults`). */
type Kind = 'overlap' | 'runs-off' | 'stop-off' | 'too-tight' | 'cuts-through';

/** Each fault in the design's words (AI-profiles spec R6.1); the edge is named before it. */
const PHRASE: Record<Kind, string> = {
  overlap: 'runs into another profile',
  'runs-off': 'is bigger than the edge',
  'stop-off': 'stops off its edge',
  'too-tight': 'is too big for a curve on its path',
  'cuts-through': 'cuts right through the part',
};

/**
 * A profile's fault kinds as the design path judges them (AI-profiles spec R6.1; the controller's ruling 2): the stored
 * part's `profileFaults` kinds, plus `curveFaults` kinds (`runs-off`, `cuts-through`) of its chunk-1 curve when the run is
 * STRAIGHT (one side, not swept) — the Profiles panel's oversized-bit refusal. ONE helper: the design check and the Refine
 * done view (`carryText.faultKeys`) both read it. Each kind once, `profileFaults`' order first.
 */
export function profileFaultKinds(b: Board, p: ProfileCut): string[] {
  const kinds = new Set<string>(profileFaults(b, p).map((f) => f.kind));
  if (oneSide(p.run) && !isSwept(b, p)) for (const f of curveFaults(b, profileAsCurve(p))) kinds.add(f.kind);
  return [...kinds];
}

/**
 * The STRICT profile faults of a converted design (AI-profiles spec R6.1): one `'profile-fault'` per (part, edge, profile
 * kind, fault kind), the edge in world words (`message`: the broad face and the side, as the design writes `edge`) and in
 * the bench's words (`shown`). A faulted profile is stored, never rejected (inv 53: KEPT and noted). A part with curves or a
 * run on two sides is skipped: its profiles are CARRIED, never authored (R6.3), so the model sees none. Not part of
 * checkDesign: evaluateDesign adds it (Task 5). No length reaches `message`; `shown` prints the size in `display`'s units.
 */
export function profileDesignFaults(flat: FlatDocument, display: Units): Violation[] {
  const out: Violation[] = [];
  for (const b of flat.boards) {
    if (b.profiles.length === 0 || carriesProfiles(b)) continue;
    const seen = new Set<string>();
    for (const p of b.profiles) {
      const broad = localToDir(b, 'thickness', p.face);
      const side = oneSide(p.run) ? p.run.start.side : null;
      const edge = side ? `${broad}/${localToDir(b, side.across, side.from)}` : `${broad} all round`;
      const bench = side
        ? `the edge between ${faceName('thickness', p.face)} and ${faceName(side.across, side.from)}`
        : `all round ${faceName('thickness', p.face)}`;
      const name = profileName(p, display);
      for (const kind of profileFaultKinds(b, p) as Kind[]) {
        const message = `${b.name}'s ${p.kind} on ${edge} ${PHRASE[kind]}.`;
        if (seen.has(message)) continue;
        seen.add(message);
        out.push({
          kind: 'profile-fault', parts: [b.name], message,
          shown: `${b.name}'s ${name[0]!.toLowerCase()}${name.slice(1)} on ${bench} ${PHRASE[kind]}.`,
        });
      }
    }
  }
  return out;
}
