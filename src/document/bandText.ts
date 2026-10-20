import type { BandType, Board, CornerRule, ProfileSide } from './types';
import { bandFaultText, bandFaults, bandsMeetAtCorner, coreSize, sameSide } from './banding';
import type { BandFaultKind } from './banding';
import { edgeName } from './holeText';
import { formatLength, formatSize, type Units } from '../units/length';

const sideWords = (s: ProfileSide) => edgeName({ dim: s.across, side: s.from });
const CORNER_WORDS: Record<CornerRule, string> = { long: 'long edges run through', ends: 'ends run through', mitre: 'mitred corners' };

/**
 * THE band line (edge banding spec §4.1, Amended (planning) P5): one clause per band type (sides in canonical order),
 * faulted sides their own clause with its check; the corner words only where two ADJACENT unfaulted bands with thickness
 * meet and one is solid (the corner rule matters nowhere else); `finished` only when the core differs from the part.
 */
export function bandLine(board: Board, types: readonly BandType[], units: Units): string | null {
  if (board.bands.length === 0) return null;
  const faults = bandFaults(board, types);
  const faultOf = (s: ProfileSide) => faults.find((f) => sameSide(f.side, s));
  const groups = new Map<string, { type: string; fault: BandFaultKind | undefined; sides: ProfileSide[] }>();
  const nameOf = new Map(types.map((t) => [t.id, t.name]));
  for (const b of board.bands) {
    // A band naming no type contributes nothing (as `judge` skips it); the loader and store never leave one.
    if (!nameOf.has(b.type)) continue;
    const fault = faultOf(b.side)?.kind;
    const key = fault ? `${b.type}|${fault}` : b.type;
    const g = groups.get(key);
    if (g) g.sides.push(b.side);
    else groups.set(key, { type: b.type, fault, sides: [b.side] });
  }
  const clauses = [...groups.values()].map(({ type, fault, sides }) =>
    `${sides.map(sideWords).join(' and ')} — ${nameOf.get(type)!}${fault ? ` — check: ${bandFaultText(fault)}` : ''}`);
  if (clauses.length === 0) return null;
  const meets = bandsMeetAtCorner(board, types);
  const core = coreSize(board, types);
  const finished = core.length !== board.length || core.width !== board.width ? `; finished ${formatSize([board.length, board.width], units)}` : '';
  return `Band: ${clauses.join('; ')}${meets ? `, ${CORNER_WORDS[board.cornerRule]}` : ''}${finished}`;
}

/** The part diagram's second band note (Q1): the diagram is drawn at the FINISHED size, so say what is cut. Null when the
 *  core is the finished size (tape, or every band faulted). */
export function coreNote(board: Board, types: readonly BandType[], units: Units): string | null {
  const core = coreSize(board, types);
  if (core.length === board.length && core.width === board.width) return null;
  return `Drawn at the finished size; cut ${formatLength(core.length, units)} × ${formatLength(core.width, units)} before banding.`;
}
