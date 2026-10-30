import type { Board, CutFrom, Dimension, HoleRow } from './types';
import { formatLength, formatMm, imperialAt, isMetric, type Units } from '../units/length';
import { faceName } from './angleText';
import { acrossOf } from './holes';
import { isTilted, tiltDegrees, tiltResultantDeg, tiltSightlineDeg } from './holeTilt';
import { curveKindWord } from './curves';
import { holeFaults, type FaultCurve, type HoleFault } from './holeFaults';
import type { ProfileKind } from './profiles';

/** "end" for the length, "side" for width and thickness: THE one home of the word (the Properties labels read it too). */
export const endWord = (d: Dimension) => (d === 'length' ? 'end' : 'side');
const end = endWord;
/** An edge a hole can run past, e.g. "the length max end" (the fault text and the Properties refusal share it). */
export const edgeName = (e: { dim: Dimension; side: CutFrom }) => `the ${e.dim} ${e.side} ${endWord(e.dim)}`;

const PROFILE_WORD: Record<ProfileKind, string> = { roundover: 'the roundover', cove: 'the cove', ogee: 'the Roman ogee', bead: 'the bead', thumbnail: 'the thumbnail' };
/** A curve a hole runs into, in words: THE one home, read by the fault text and the Properties hole-into-waste refusal.
 *  An edge profile by its own name (R3); any other curve by `curveKindWord`, unchanged. */
export const curveWord = (c: Pick<FaultCurve, 'kind' | 'profile'>) => (c.profile ? PROFILE_WORD[c.profile] : curveKindWord(c.kind));

/** A fault in words (holes spec §2.4): THE one home (invariant 19), read by the cut-list line and the Properties note.
 *  Lower-case, no full stop: each reader frames it. */
export function holeFaultText(f: HoleFault, r: HoleRow): string {
  const n = f.index + 1;
  switch (f.kind) {
    case 'breaks-out': return f.curve ? `hole ${n} runs into ${curveWord(f.curve)}` : `hole ${n} runs past ${edgeName(f.edge!)}`;
    case 'off-flat': return `hole ${n} sits where a cut has removed the wood`;
    case 'meets-hole': return `hole ${n} meets ${f.other!.row === r.id ? `hole ${f.other!.index + 1}` : 'a hole of another row'}`;
    case 'too-deep': return r.head && r.depth === 'through' ? `the ${r.head} runs through the ${r.face}` : `the holes are deeper than the ${r.face}`;
    case 'too-shallow': return 'too shallow for its angle';
  }
}

/** A fault as what a SOCKET would do (Bore leg sockets, angled holes spec §5): the verb form of `holeFaultText`'s words,
 *  for "<Leg>'s socket would <words> — …". A socket is one bore, so no hole number. Lower-case, no full stop. */
export function socketFaultWords(f: HoleFault): string {
  switch (f.kind) {
    case 'breaks-out': return f.curve ? `run into ${curveWord(f.curve)}` : `run past ${edgeName(f.edge!)}`;
    case 'off-flat': return 'sit where a cut has removed the wood';
    case 'meets-hole': return 'meet another hole';
    case 'too-deep': return 'run deeper than the part';
    case 'too-shallow': return 'be too shallow for its angle';
  }
}

/** A fault's identity: per hole, except too-deep and too-shallow, properties of the ROW (every hole shares its depth,
 *  diameter and tilt; ruling T2d). A
 *  breaks-out names WHAT it breaks into — an edge, or a curve by id (curves spec §6.3: whole-branch review, finding 2) —
 *  so a hole already past an edge is still refused into an arch's waste. The Properties panels' "does this edit ADD a
 *  fault" (Holes and Curves) reads it, and so does distinctFaults: one key for both, or a hole already past an edge and
 *  in a curve would collapse to one fault on one side of the test and be refused on every edit. */
export const faultKey = (f: HoleFault) => (f.kind === 'too-deep' || f.kind === 'too-shallow' ? f.kind
  : f.kind === 'breaks-out' ? `${f.index}:breaks-out:${f.curve ? `curve:${f.curve.id}` : 'edge'}` : `${f.index}:${f.kind}`);
/** One fault per key, in holeFaults' order: THE one count of a row's faults (invariant 19), read by the bench line and
 *  the Properties note, so a row thinned under its depth reads one fault, not one per hole. A hole past an edge and into
 *  a curve reads two (two things to fix). */
export const distinctFaults = (fs: HoleFault[]) => fs.filter((f, i) => fs.findIndex((g) => faultKey(g) === faultKey(f)) === i);

/** A diameter or pitch that is a whole number of millimetres AND not an exact 1/64 also prints its mm (spec §4.1,
 *  amended): the 32 mm system and 35 mm cups read as what the jig and the bit say. 5" (127 mm) does not. */
function mm(v: number): string {
  const m = v * 25.4;
  const whole = Math.round(m);
  const on64 = Math.abs(v * 64 - Math.round(v * 64)) <= 1e-9;
  return whole > 0 && Math.abs(m - whole) <= 1e-9 && !on64 ? ` (${whole} mm)` : '';
}

/** A hole's diameter or pitch as a hole is specified (spec R7): THE one home (invariant 19), read by the bench line and
 *  by the Holes section's Diameter and Every fields, so the field and the line are one string. Metric: mm to one decimal.
 *  Imperial: the diameter at the document precision, the pitch at 1/64 at least (a jig set to a rounded pitch drifts
 *  along the row). The bench line's imperial ` (35 mm)` annotation is NOT part of it: a field's text must parse back. */
export function holeLengthText(v: number, units: Units, kind: 'diameter' | 'pitch'): string {
  if (isMetric(units)) return formatMm(v, 1);
  return kind === 'pitch' ? formatLength(v, imperialAt(Math.max(units.precision, 64))) : formatLength(v, units);
}

/**
 * One hole row as a bench line (holes spec §4.1, as amended): THE ONE home of these strings (invariant 19). Lengths at
 * the document precision except the pitch, at 1/64 at least (a jig set to a rounded pitch drifts along the row). "last
 * at" is computed from the exact stored values, then rounded. A faulted row (a later edit ran it off the part, spec §2.4)
 * ends with its first fault and how many more — the user's ruling: the bench must not read a wrong row silently.
 */
export function holeLine(board: Board, r: HoleRow, units: Units): string {
  const base = holeLineBase(r, units);
  const faults = distinctFaults(holeFaults(board, r));
  if (faults.length === 0) return base;
  return `${base} — check: ${holeFaultText(faults[0]!, r)}${faults.length > 1 ? ` (and ${faults.length - 1} more)` : ''}`;
}

/**
 * A whole cam-and-bolt pair as ONE bench line (cam-and-bolt spec §6.3; invariant 19): the cam's size, face and inset from
 * its end, the bolt's size and face, then where the pairs sit along the cam row. Faults of both rows are appended as
 * `holeLine` appends them. The caller passes a WHOLE pair (`camPairRows`).
 */
export function camPairLine(board: Board, cam: HoleRow, bolt: HoleRow, units: Units): string {
  const f = (n: number) => formatLength(n, units);
  const across = acrossOf(cam);
  const where = cam.count === 1
    ? `${f(cam.station)} from the ${cam.along} ${cam.alongFrom} ${end(cam.along)}`
    : `along the ${cam.along}: first ${f(cam.station)} from the ${cam.alongFrom} ${end(cam.along)}, every ${holePitchText(cam, units)}`;
  // Metric reads the depth to 0.1 mm (a 14.5 mm cam bore is not 15); imperial is `holeSizeText` verbatim.
  const size = (r: HoleRow) => (isMetric(units) && r.depth !== 'through'
    ? `${holeLengthText(r.diameter, units, 'diameter')} dia × ${holeLengthText(r.depth, units, 'diameter')} deep` : holeSizeText(r, units));
  const base = `Cam-and-bolt ×${cam.count}: ${size(cam)} in ${holeFaceText(cam)}, ${f(cam.inset)} in from the ${across} ${cam.acrossFrom} ${end(across)}; `
    + `${size(bolt)} from ${holeFaceText(bolt)} into each; ${where}`;
  // Each fault is worded against the row that produced it (its hole numbers and `meets-hole` test are row-relative).
  const faults = [...distinctFaults(holeFaults(board, cam)).map((f) => ({ f, r: cam })), ...distinctFaults(holeFaults(board, bolt)).map((f) => ({ f, r: bolt }))];
  if (faults.length === 0) return base;
  return `${base} — check: ${holeFaultText(faults[0]!.f, faults[0]!.r)}${faults.length > 1 ? ` (and ${faults.length - 1} more)` : ''}`;
}

/** A hole's diameter as a hole is specified, with the imperial mm aside: the bore's and the head's share it. */
const diameterText = (v: number, units: Units) => `${holeLengthText(v, units, 'diameter')}${isMetric(units) ? '' : mm(v)}`;

/** A row's counterbore or countersink in words (`3/8" counterbore × 3/8" deep`, `3/8" countersink at 82°`): ONE home
 *  (invariant 19), null for a headless row so its text is byte for byte as before. The diameter reads as the bore's does,
 *  the counterbore's depth as the bore's depth does (a countersink's depth is derived, so it is not printed). */
export function holeHeadText(r: HoleRow, units: Units): string | null {
  if (!r.head || r.headDiameter === undefined) return null;
  const dia = diameterText(r.headDiameter, units);
  if (r.head === 'countersink') return `${dia} countersink at ${r.headAngle}°`;
  return `${dia} counterbore × ${formatLength(r.headDepth ?? 0, units)} deep`;
}

/** A hole's size as the bench line prints it (`1/4" dia × 3/8" deep`; imperial with the mm aside; a head appended after a
 *  comma): ONE home, read by the bench line and the Plans sheet's key lines (feature callouts spec §3). */
export function holeSizeText(r: HoleRow, units: Units): string {
  const size = `${diameterText(r.diameter, units)} dia × ${r.depth === 'through' ? 'through' : `${formatLength(r.depth, units)} deep`}`;
  const head = holeHeadText(r, units);
  return head ? `${size}, ${head}` : size;
}

/** A row's pitch as the bench line prints it (1/64 at least; imperial with the mm aside). */
export function holePitchText(r: HoleRow, units: Units): string {
  return `${holeLengthText(r.pitch, units, 'pitch')}${isMetric(units) ? '' : mm(r.pitch)}`;
}

/** The face a row is drilled into, as the bench names it ("the thickness face (max side)"): the bench line and the
 *  design fault's person copy (AI-holes spec §3.1) read it here. */
export const holeFaceText = (r: Pick<HoleRow, 'face' | 'from'>) => faceName(r.face, r.from);

const flip = (f: CutFrom): CutFrom => (f === 'min' ? 'max' : 'min');

/**
 * A tilted bore's bench words (angled holes spec §8): a bit leaning in ONE plane names the end or side it leans toward
 * (a positive slope leans to the far end from `alongFrom`, the far side from `acrossFrom`); a bit leaning in both gives
 * the angle off square and its sightline from the `along` dimension. A blind bore's depth is measured along the bit. Empty for a
 * square row, so a square row's line is byte for byte as before.
 */
function tiltText(r: HoleRow): string {
  if (!isTilted(r)) return '';
  const deg = (n: number) => `${n.toFixed(1)}°`;
  const t = tiltDegrees(r);
  const along = r.tiltAlong ? 1 : 0;
  const acr = r.tiltAcross ? 1 : 0;
  let words: string;
  if (along + acr === 2) words = `bored ${deg(tiltResultantDeg(r))} off square on a ${deg(tiltSightlineDeg(r))} sightline from the ${r.along}`;
  else if (along) words = `bored ${deg(tiltResultantDeg(r))} off square toward the ${r.along} ${t.along > 0 ? flip(r.alongFrom) : r.alongFrom} ${end(r.along)}`;
  else words = `bored ${deg(tiltResultantDeg(r))} off square toward the ${acrossOf(r)} ${t.across > 0 ? flip(r.acrossFrom) : r.acrossFrom} ${end(acrossOf(r))}`;
  return `, ${words}${r.depth === 'through' ? '' : ', depth measured along the bit'}`;
}

/** The Holes section's readout on a tilted row (angled holes §4), at the bench line's own 0.1° (`tiltText`), so the
 *  two never disagree; null for a square row. */
export function holeTiltReadout(r: HoleRow): string | null {
  if (!isTilted(r)) return null;
  return `Bore ${tiltResultantDeg(r).toFixed(1)}° off square · sightline ${tiltSightlineDeg(r).toFixed(1)}° from the ${r.along}`;
}

function holeLineBase(r: HoleRow, units: Units): string {
  return holeLineSquare(r, units) + tiltText(r);
}

function holeLineSquare(r: HoleRow, units: Units): string {
  const f = (n: number) => formatLength(n, units);
  const size = holeSizeText(r, units);
  const where = `in ${holeFaceText(r)}`;
  const across = acrossOf(r);
  const inset = `${f(r.inset)} in from the ${across} ${r.acrossFrom} ${end(across)}`;
  if (r.count === 1) return `Hole ${size} ${where}, ${f(r.station)} from the ${r.along} ${r.alongFrom} ${end(r.along)}, ${inset}`;
  const pitch = holePitchText(r, units);
  const last = r.station + (r.count - 1) * r.pitch;
  return `Row of ${r.count} holes ${size} ${where}, along the ${r.along}: first ${f(r.station)} from the ${r.alongFrom} ${end(r.along)}, every ${pitch}, last at ${f(last)}; ${inset}`;
}
