import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/store';
import {
  curveFaults, defaultProfile, geometryBoard, profileAsymmetric, profileFields, profileFromFields,
  profileOf, profileToFields, uvDims, DEFAULT_PROFILE_EDGE, PROFILE_EDGES, PROFILE_KINDS,
} from '../document/document';
import type { Board, CutFrom, Dimension, ProfileCut, ProfileEdge, ProfileEnd, ProfileFields, ProfileKind, ProfileSide } from '../document/document';
import { canonicalRun, endPos, endToEnd, fallbackCause, oneSide, profileFaults, runDim, runsStraight, travelSign, viewProfileFaults } from '../document/profiles';
import { isSwept, throughConsistent } from '../document/profilePath';
import { curveFaultText, curveLine, profileFaultNote, runsStraightNote, sweptLine } from '../document/curveText';
import { endWord } from '../document/holeText';
import { formatLength } from '../units/length';
import { DimensionField } from './DimensionField';
import { Popover } from './Popover';
import { curveEditRefusal, holeRefusal, optionReason, refusalFor, PROFILE_REFUSAL } from './curveRefusal';
import type { Control, Draft } from './curveRefusal';

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
const sideText = (d: Dimension, side: CutFrom) => `${d} ${side} ${endWord(d)}`;
const KIND_LABEL: Record<ProfileKind, string> = { roundover: 'Roundover', cove: 'Cove', ogee: 'Roman ogee', bead: 'Bead', thumbnail: 'Thumbnail' };
const SIZE_LABEL: Record<ProfileKind, Control> = { roundover: 'Radius', cove: 'Radius', ogee: 'Size', bead: 'Radius', thumbnail: 'Reach' };
/** The four sides a profile can run along, in the Chamfer row's words (`Width min side`, `Length max end`). */
const SIDES: readonly ProfileSide[] = [
  { across: 'width', from: 'min' }, { across: 'width', from: 'max' }, { across: 'length', from: 'min' }, { across: 'length', from: 'max' },
];
const sideLabel = (s: ProfileSide) => cap(sideText(s.across, s.from));
const sameSide = (a: ProfileSide, b: ProfileSide) => a.across === b.across && a.from === b.from;
const FACE_LABEL: Record<CutFrom, string> = { max: 'Top', min: 'Bottom' };
/** The side an edge runs along (the Side select's value for it: `withSide`'s inverse). */
const sideOfEdge = (e: ProfileEdge): ProfileSide => ({ across: uvDims(e.through)[0] as ProfileSide['across'], from: e.uFrom });
/** Where `+ Add profile ▾` tries a preset (spec I1, Amended (implementation, a2)): PROFILE_EDGES reordered — the top long
 *  edge (DEFAULT_PROFILE_EDGE) first, as before, then the other top sides, then the bottom's in the same order: by face,
 *  then the default's run dimension, then its side, each matching the default first (a stable sort). */
const PRESET_EDGES: readonly ProfileEdge[] = [...PROFILE_EDGES].sort((a, b) => {
  const rank = (e: ProfileEdge) => [e.vFrom !== DEFAULT_PROFILE_EDGE.vFrom, e.through !== DEFAULT_PROFILE_EDGE.through, e.uFrom !== DEFAULT_PROFILE_EDGE.uFrom];
  const ra = rank(a), rb = rank(b);
  for (let i = 0; i < 3; i += 1) if (ra[i] !== rb[i]) return ra[i] ? 1 : -1;
  return 0;
});
type RunKind = 'through' | 'stopped' | 'loop';
const RUN_LABEL: Record<RunKind, string> = { through: 'End to end', stopped: 'Stopped', loop: 'All round' };
type StationRun = { start: ProfileEnd; end: ProfileEnd };
/** The End to end run on `side` (the form `isSwept` judges a side by). */
const throughRun = (side: ProfileSide): StationRun => ({ start: { side: { ...side }, through: 'min' }, end: { side: { ...side }, through: 'max' } });
type Next = Omit<ProfileCut, 'id'>;

/** A symmetric profile is written at facing 'v' (`profileCurve` does not normalise): a roundover with no fillet is then
 *  byte-identical to `cornerCurve`, and reads back as the fields it was written from. */
const normal = (f: ProfileFields): ProfileFields => (profileAsymmetric(f) ? f : { ...f, facing: 'v' });

/** The fu 388 rule, one instance per select: an option whose result would be refused is disabled and says why, judged ONLY
 *  while the select has focus — every edit frame is a render — and afresh when the profile or part changes under it. */
function useReasons<K extends string>(curve: object, board: Board, keys: readonly K[], current: K, judge: (k: K) => string | null) {
  const [focused, setFocused] = useState(false);
  const [judged, setJudged] = useState<{ curve: object; board: Board; reasons: Partial<Record<K, string>> } | null>(null);
  useEffect(() => {
    if (!focused || (judged && judged.curve === curve && judged.board === board)) return;
    const reasons: Partial<Record<K, string>> = {};
    for (const k of keys) {
      if (k === current) continue;
      const refused = judge(k);
      if (refused) reasons[k] = optionReason(refused);
    }
    setJudged({ curve, board, reasons });
  }, [focused, curve, board, judged]); // eslint-disable-line react-hooks/exhaustive-deps -- keys, current and judge derive from curve and board (and the stored part, which board is a memoised function of)
  const reasons: Partial<Record<K, string>> = focused && judged && judged.curve === curve && judged.board === board ? judged.reasons : {};
  return { reasons, focus: { onFocus: () => setFocused(true), onBlur: () => { setFocused(false); setJudged(null); } } };
}

function ProfileRow({ board: stored_, profile }: { board: Board; profile: ProfileCut }) {
  const units = useStore((s) => s.doc.units);
  const updateProfile = useStore((s) => s.updateProfile);
  const removeProfile = useStore((s) => s.removeProfile);
  // The geometry readers (faults, bench line, refusals) read the part through its view (spec P4); the stored part keeps the
  // profiles for the post-edit board. A STRAIGHT profile's row reads the view's own curve, so its words carry the stopped run
  // and the profile's faults (curveText reads them off that object); a SWEPT one (profile runs b1: a loop, or End to end
  // round a curve) is the view's own copy in `profiles` — each a stable object per view, for useReasons.
  const board = geometryBoard(stored_);
  const vp = board.profiles.find((x) => x.id === profile.id);
  const curve = vp ? null : board.curves.find((c) => c.id === profile.id)!;
  const loop = 'loop' in profile.run;
  // The row's fields: chunk 1's, from the stored profile. A loop has no side, so its fields are read as the End to end run
  // on the default edge's side (never shown: Side is hidden, and `build` puts the loop back); a run on two sides (b2, B3) as
  // the End to end run on its START side (the Side select's value; `build` puts the stored run back).
  const p = useMemo(() => profileToFields('loop' in profile.run ? { ...profile, run: throughRun(sideOfEdge(DEFAULT_PROFILE_EDGE)) }
    : oneSide(profile.run) ? profile : { ...profile, run: throughRun((profile.run as StationRun).start.side) }), [profile]);
  const [error, setError] = useState<string | null>(null);
  const line = vp ? sweptLine(board, vp, units) : curveLine(board, curve!, units);
  // The first stored fault as a note: a curve fault reads " at this size." (a resize caused it), a profile fault through
  // profileFaultNote (an overlap does not: F5). A swept profile has no chunk-1 curve: its own faults only. A run the view
  // runs straight (final review I1; a saved stop too, Q10) has no fault — its straight form is clean — and says why, by the
  // cause that decided it (`fallbackCause`).
  const storedFaults = vp ? viewProfileFaults(vp).map(profileFaultNote)
    : [...curveFaults(board, curve!).map((x) => `${cap(curveFaultText(x))} at this size.`), ...viewProfileFaults(curve!).map(profileFaultNote),
      ...(runsStraight(curve!) ? [runsStraightNote(fallbackCause(curve!) ?? 'too-tight')] : [])];
  // A loop reads as its fields' side above. Side is Start's side; Stop side (b2, Q26) is End's.
  const run0: StationRun = loop ? throughRun(sideOfEdge(DEFAULT_PROFILE_EDGE)) : profile.run as StationRun;
  const side: ProfileSide = run0.start.side;
  const stopSide: ProfileSide = run0.end.side;
  const twoSides = !loop && !sameSide(side, stopSide);
  const dim = runDim(side);
  const L = stored_[dim];
  const stopped = !loop && !endToEnd(run0);
  /** The stored next profile for new fields: the run kept (a loop stays a loop), its ends re-sided and re-ordered (a Face
   *  or Side change keeps the stations; P11). A run on two sides is kept as stored — never re-sided (its Side select moves
   *  Start alone) or re-ordered (Q16) — except that a Face change swaps its ends, so the same sides stay profiled (Q26: the
   *  travel reverses on the other face, as `mirrorProfile`'s thickness mirror does). */
  const build = (nextFields: ProfileFields, run: ProfileCut['run'] = profile.run): Next => {
    const next = profileFromFields(normal(nextFields));
    if ('loop' in run) return { ...next, run: { loop: true } };
    if (endToEnd(run)) return next;
    if (!oneSide(run)) {
      const two = run as StationRun;   // oneSide's guard narrows its false branch to never: a station run's type is one shape
      return { ...next, run: next.face === profile.face ? two : { start: two.end, end: two.start } };
    }
    const ns = next.run as StationRun;
    const reSide = (e: ProfileEnd): ProfileEnd => ({ ...e, side: { ...ns.start.side } });
    return { ...next, run: canonicalRun(stored_, next.face, { start: reSide(run.start), end: reSide(run.end) }) };
  };
  /** The refusal for `next` (nothing stored), or null: a profile fault it ADDS — its own first, in the row's words, then any
   *  other profile's on the part, named as Curves names it (`curveEditRefusal`; Task 3's ledger 3: a two-side run never
   *  falls back, so it could fault a neighbour) — then, for a straight next, chunk 1's curve and hole refusals, or, for a
   *  swept next, the hole refusal alone (a swept profile has no chunk-1 curve). Every profile is judged before and after,
   *  by kind, as Curves' `profileRefusal` does. */
  const refuse = (next: Next, control: Control | null): string | null => {
    const mine: ProfileCut = { ...next, id: profile.id };
    const after: Board = { ...stored_, profiles: stored_.profiles.map((x) => (x.id === profile.id ? mine : x)) };
    const kinds = (b: Board, q: ProfileCut) => new Set(profileFaults(b, q).map((f) => f.kind));
    const had = kinds(stored_, profile);
    const added = profileFaults(after, mine).find((f) => !had.has(f.kind));
    if (added) return PROFILE_REFUSAL[added.kind];
    for (const [i, q] of stored_.profiles.entries()) {
      if (q.id === profile.id) continue;
      const was = kinds(stored_, q);
      const hit = profileFaults(after, after.profiles[i]!).find((f) => !was.has(f.kind));
      if (hit) return curveEditRefusal(hit, q);
    }
    const nextView = geometryBoard(after);
    if (nextView.profiles.some((x) => x.id === profile.id)) return holeRefusal(board, after);
    const nextCurve = nextView.curves.find((c) => c.id === profile.id)!;
    return refusalFor(board, curve, nextCurve, control, after);
  };
  /** Tries the edit: the refusal text when it is refused (nothing stored), else null. */
  const attempt = (next: Next, control: Control | null): string | null => {
    const refused = refuse(next, control);
    if (refused) return refused;
    setError(null);
    updateProfile(stored_.id, profile.id, next);
    return null;
  };
  // A typed field owns its refusal (DimensionField shows it as ITS error); a select shows it on the row and stays on the
  // stored value.
  const field = (next: ProfileFields, control: Control): string | undefined => attempt(build(next), control) ?? undefined;
  const set = (next: Next) => { const r = attempt(next, null); if (r) setError(r); };
  const key: object = vp ?? curve!;

  const [u, v] = uvDims(p.through);
  const sizeLabel = SIZE_LABEL[p.kind];
  // The Kind-select rule: keep the edge (and the facing, for a kind that has one); take the kind's defaults.
  const asKind = (kind: ProfileKind): ProfileFields => profileFields(defaultProfile(board, kind, p, kind === 'roundover' || kind === 'cove' ? 'v' : p.facing))!;
  const withFace = (face: CutFrom): ProfileFields => ({ ...p, vFrom: face });
  const withSide = (s: ProfileSide): ProfileFields => ({ ...p, through: runDim(s), uFrom: s.from });
  /**
   * Q26: one end of a stopped run moved onto side `s` (Start for `which` 'start', Stop for 'end'). The end keeps its station
   * when the moved run's own `profileFaults` gains no kind; else it is seeded `min(3, L/4)` in from the corner where travel
   * LEAVES Start's side (Start) or ENTERS Stop's side (Stop), `travelSign` giving the direction, written from the min end
   * (Run → Stopped's precedent). Equal sides make a one-side run in canonical order (P11); two sides are never re-ordered.
   */
  const moveEnd = (which: 'start' | 'end', s: ProfileSide): Next => {
    const base = profileFromFields(normal(p));
    const other = which === 'start' ? run0.end : run0.start;
    const runWith = (e: ProfileEnd): Next['run'] => {
      const r = which === 'start' ? { start: e, end: other } : { start: run0.start, end: e };
      return sameSide(r.start.side, r.end.side) ? canonicalRun(stored_, base.face, r) : r;
    };
    const moved = run0[which];
    const kept: ProfileEnd = 'through' in moved ? { side: { ...s }, through: moved.through } : { side: { ...s }, from: moved.from, at: moved.at };
    const had = new Set(profileFaults(stored_, profile).map((f) => f.kind));
    const keptNext: ProfileCut = { ...base, id: profile.id, run: runWith(kept) };
    const after: Board = { ...stored_, profiles: stored_.profiles.map((x) => (x.id === profile.id ? keptNext : x)) };
    if (profileFaults(after, keptNext).every((f) => had.has(f.kind))) return { ...base, run: keptNext.run };
    const Ls = stored_[runDim(s)];
    const seed = Math.min(3, Ls / 4);
    // The run travels toward the run dimension's max end when travelSign is +1: it enters a side at its min end and leaves at
    // its max end.
    const atMax = (travelSign(base.face, s) > 0) === (which === 'start');
    return { ...base, run: runWith({ side: { ...s }, from: 'min', at: atMax ? Ls - seed : seed }) };
  };
  /** The Side select: on a one-side run both ends move (a2, the stations kept); on two sides, Start alone (Q26). */
  const onSide = (s: ProfileSide): Next => (twoSides ? moveEnd('start', s) : build(withSide(s)));
  /** Run → Stopped seeds 3" in from each end (or a quarter of the run, if shorter). */
  const stoppedRun = (): Next['run'] => {
    const start = Math.min(3, L / 4);
    const at = (a: number): ProfileEnd => ({ side: { ...side }, from: 'min', at: a });
    return { start: at(start), end: at(L - start) };
  };
  /** A Run change keeps the fields; from All round, End to end and Stopped take the default edge's side (the side the
   *  loop's fields read as). */
  const withRun = (k: RunKind): Next => {
    const next = profileFromFields(normal(p));
    if (k === 'through') return next;
    if (k === 'loop') return { ...next, run: { loop: true } };
    return { ...next, run: canonicalRun(stored_, next.face, stoppedRun() as StationRun) };
  };
  const kindR = useReasons(key, board, PROFILE_KINDS, p.kind, (k) => refuse(build(asKind(k)), null));
  const faceR = useReasons(key, board, ['max', 'min'] as const, p.vFrom, (f) => refuse(build(withFace(f)), null));
  const sideKeys = ['0', '1', '2', '3'] as const;
  const sideR = useReasons(key, board, sideKeys, String(SIDES.findIndex((x) => sameSide(x, side))) as (typeof sideKeys)[number],
    (i) => refuse(onSide(SIDES[Number(i)]!), null));
  const stopSideR = useReasons(key, board, sideKeys, String(SIDES.findIndex((x) => sameSide(x, stopSide))) as (typeof sideKeys)[number],
    (i) => refuse(moveEnd('end', SIDES[Number(i)]!), null));
  const runKeys: readonly RunKind[] = ['through', 'stopped', 'loop'];
  const runNow: RunKind = loop ? 'loop' : stopped ? 'stopped' : 'through';
  const runR = useReasons(key, board, runKeys, runNow, (k) => refuse(withRun(k), null));
  const opt = (reasons: Partial<Record<string, string>>, key: string, label: string) => {
    const why = reasons[key];
    return <option key={key} value={key} disabled={why !== undefined}>{why ? `${label} — ${why}` : label}</option>;
  };
  // The stations. One side: lo then hi along the run from its min end; an edited one becomes a station written from the min
  // end, an untouched end (a through end, or a station from the max end) is kept as stored. Two sides (b2, Q16): Start then
  // Stop as stored, each measured from ITS side's run dimension's min end, each field editing its own end.
  const ends = !stopped ? null : twoSides ? [run0.start, run0.end] : [run0.start, run0.end].sort((a, b) => endPos(stored_, a) - endPos(stored_, b));
  /** A typed position that READS the same as an end of the part, in the project's units, is that end (F4 fix 1: fu 354's
   *  reads-the-same rule: a 36" part's Stop shows 914 mm, and 914 mm typed back is 35.984"). */
  const shown = (n: number) => formatLength(n, units);
  const snapEnd = (typed: number, len: number) => (shown(typed) === shown(0) ? 0 : shown(typed) === shown(len) ? len : typed);
  /** Final fix F4 (spec I2): a station typed AT an end of the part (0, or the run's full length) runs out through that end. */
  const station = (e: ProfileEnd, pos: number, len: number): ProfileEnd => (endPos(stored_, e) === pos ? e
    : pos === 0 ? { side: { ...e.side }, through: 'min' }
    : pos === len ? { side: { ...e.side }, through: 'max' }
    : { side: { ...e.side }, from: 'min', at: pos });
  const stationEdit = (which: 0 | 1, typed: number): string | undefined => {
    const base = profileFromFields(normal(p));
    if (twoSides) {
      const e = which === 0 ? run0.start : run0.end;
      const len = stored_[runDim(e.side)];
      const at = snapEnd(typed, len);
      const pair = (x: ProfileEnd) => (which === 0 ? { start: x, end: run0.end } : { start: run0.start, end: x });
      // Q17: a typed 0 or full length is a through end only where travel ENTERS Start's side or LEAVES Stop's side; anywhere
      // else it stays a station at that end, which `attempt` refuses as the stop-off it adds. No crossing check (Q16).
      let x = station(e, at, len);
      if ('through' in x && x !== e && !throughConsistent({ ...base, id: profile.id, run: pair(x) })) x = { side: { ...e.side }, from: 'min', at };
      return attempt({ ...base, run: pair(x) }, null) ?? undefined;
    }
    const [lo, hi] = ends!;
    // Mapped FIRST, so the crossing checks below judge the end itself.
    const at = snapEnd(typed, L);
    // Final fix F3: a crossed (or meeting) entry is refused in the row's own words, as Depth and Reach are — canonicalRun
    // would otherwise swap the ends silently and both fields would show numbers other than the ones typed.
    if (which === 0 && at >= endPos(stored_, hi!)) return 'Start must be before the Stop';
    if (which === 1 && at <= endPos(stored_, lo!)) return 'Stop must be after the Start';
    const pair = which === 0 ? [station(lo!, at, L), hi!] : [lo!, station(hi!, at, L)];
    const next = { ...base, run: canonicalRun(stored_, profile.face, { start: pair[0]!, end: pair[1]! }) };
    return attempt(next, null) ?? undefined;
  };
  return (
    <div className="cut" data-kind={p.kind}>
      <div className="cut-head">
        <span className="cut-label curve-label">{KIND_LABEL[p.kind]}</span>
        <button className="cut-remove" aria-label={`Remove profile (${line})`} onClick={() => removeProfile(stored_.id, profile.id)}>✕</button>
      </div>
      <p className="field-note">{line}</p>
      {storedFaults.length > 0 && <p className="field-note" role="status">{storedFaults[0]!}</p>}
      <div className="field-grid field-grid-2">
        <div className="field">
          <label htmlFor={`profile-face-${profile.id}`}>Face</label>
          <select id={`profile-face-${profile.id}`} className="input" value={p.vFrom} {...faceR.focus}
            onChange={(e) => set(build(withFace(e.target.value as CutFrom)))}>
            {(['max', 'min'] as const).map((f) => opt(faceR.reasons, f, FACE_LABEL[f]))}
          </select>
        </div>
        {!loop && (
          // All round has no side (spec §5, B7).
          <div className="field">
            <label htmlFor={`profile-side-${profile.id}`}>Side</label>
            <select id={`profile-side-${profile.id}`} className="input" value={SIDES.findIndex((x) => sameSide(x, side))} {...sideR.focus}
              onChange={(e) => set(onSide(SIDES[Number(e.target.value)]!))}>
              {SIDES.map((s, i) => opt(sideR.reasons, String(i), sideLabel(s)))}
            </select>
          </div>
        )}
        {stopped && (
          // Stopped only (b2, Q26): the side the run stops on, the Side's by default.
          <div className="field">
            <label htmlFor={`profile-stop-side-${profile.id}`}>Stop side</label>
            <select id={`profile-stop-side-${profile.id}`} className="input" value={SIDES.findIndex((x) => sameSide(x, stopSide))} {...stopSideR.focus}
              onChange={(e) => set(moveEnd('end', SIDES[Number(e.target.value)]!))}>
              {SIDES.map((s, i) => opt(stopSideR.reasons, String(i), sideLabel(s)))}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor={`profile-run-${profile.id}`}>Run</label>
          <select id={`profile-run-${profile.id}`} className="input" value={runNow} {...runR.focus}
            onChange={(e) => set(withRun(e.target.value as RunKind))}>
            {runKeys.map((k) => opt(runR.reasons, k, RUN_LABEL[k]))}
          </select>
        </div>
        {ends && (
          // min 0, not DimensionField's own greater-than-zero: 0 is the min end itself (a through end, F4).
          <>
            <DimensionField label={`Start (from the ${runDim(ends[0]!.side)} min end)`} value={endPos(stored_, ends[0]!)} min={0} units={units} onCommit={(at) => stationEdit(0, at)} />
            <DimensionField label={`Stop (from the ${runDim(ends[1]!.side)} min end)`} value={endPos(stored_, ends[1]!)} min={0} units={units} onCommit={(at) => stationEdit(1, at)} />
          </>
        )}
        <div className="field">
          <label htmlFor={`profile-kind-${profile.id}`}>Profile</label>
          <select id={`profile-kind-${profile.id}`} className="input" value={p.kind} {...kindR.focus}
            onChange={(e) => set(build(asKind(e.target.value as ProfileKind)))}>
            {PROFILE_KINDS.map((k) => opt(kindR.reasons, k, KIND_LABEL[k]))}
          </select>
        </div>
        {/* No `min` on Size, Depth or Quirk: DimensionField refuses 0 and below itself. */}
        <DimensionField label={sizeLabel} value={p.size} units={units} onCommit={(size) => {
          if (p.kind === 'thumbnail' && size <= p.depth!) return 'Reach must be more than the depth';
          return field({ ...p, size }, sizeLabel);
        }} />
        {p.kind === 'thumbnail' && (
          <DimensionField label="Depth" value={p.depth!} units={units} onCommit={(depth) => {
            if (depth >= p.size) return 'Depth must be less than the reach';
            return field({ ...p, depth }, 'Depth');
          }} />
        )}
        {(p.kind === 'roundover' || p.kind === 'cove' || p.kind === 'ogee') && (
          <DimensionField label="Fillet" value={p.fillet ?? 0} min={0} units={units} onCommit={(fillet) => field({ ...p, fillet }, 'Fillet')} />
        )}
        {p.kind === 'bead' && (
          // No `min`: DimensionField itself then refuses 0 and below ("Must be greater than zero") — a bead needs a quirk.
          <DimensionField label="Quirk" value={p.fillet ?? 0} units={units} onCommit={(fillet) => field({ ...p, fillet }, 'Quirk')} />
        )}
        {profileAsymmetric(p) && (
          <div className="field field-wide">
            <label htmlFor={`profile-facing-${profile.id}`}>Facing</label>
            <select id={`profile-facing-${profile.id}`} className="input" value={p.facing} onChange={(e) => set(build({ ...p, facing: e.target.value as 'u' | 'v' }))}>
              <option value="v">{`Top: ${sideText(v, p.vFrom)}`}</option>
              {/* A loop's or a two-side run's other face is the outline's edge, no single named face (the bench line's own
                  words, Q7; Q27). */}
              <option value="u">{loop || twoSides ? 'Top: the edge' : `Top: ${sideText(u, p.uFrom)}`}</option>
            </select>
          </div>
        )}
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}

/** The Profiles section (edge profiles spec §3): one row per stored profile, and + Add profile ▾. */
export function Profiles({ board: stored }: { board: Board }) {
  const addProfiles = useStore((s) => s.addProfiles);
  const board = geometryBoard(stored);
  const units = useStore((s) => s.doc.units);
  const f = (n: number) => formatLength(n, units);
  // A preset whose default would fault on this part — a curve fault, an overlap, or a hole it would put into the waste — is withheld,
  // not added and refused (the Curves precedent).
  // A SWEPT preset (an edge whose side follows a curve or corner, profile runs b1) is judged by its own faults alone — its
  // chunk-1 curve is not what gets built.
  const fits = (c: Draft): boolean => {
    const preset: ProfileCut = { ...profileOf(c)!, id: '__preset0' };
    if (!isSwept(stored, preset) && curveFaults(board, c).length > 0) return false;
    const after: Board = { ...stored, profiles: [...stored.profiles, preset] };
    // Nor one that would overlap a profile already on its edge (P12).
    if (profileFaults(after, preset).length > 0) return false;
    return holeRefusal(board, after) === null;
  };
  const rows = stored.profiles;
  // Each kind on the FIRST preset edge its default fits (spec I1); withheld only when none does. Judged once per stored part
  // and units, not per render (a resize drag renders every frame; up to 8 edges × 5 kinds).
  const items = useMemo(() => PROFILE_KINDS.flatMap((kind) => {
    for (const edge of PRESET_EDGES) {
      const c = defaultProfile(board, kind, edge);
      const d = profileFields(c);
      if (!d || !fits(c)) continue;
      const size = kind === 'ogee' ? f(d.size)
        : kind === 'thumbnail' ? `${f(d.size)} × ${f(d.depth!)}`
        : kind === 'bead' ? `${f(d.size)} radius, ${f(d.fillet!)} quirk`
        : `${f(d.size)} radius`;
      const where = `${FACE_LABEL[edge.vFrom]} · ${sideLabel(sideOfEdge(edge))}`;
      return [{ label: KIND_LABEL[kind], detail: `${size}, ${where}`, run: () => addProfiles(stored.id, [profileOf(c)!]) }];
    }
    return [];
  }), [stored, units, addProfiles]); // eslint-disable-line react-hooks/exhaustive-deps -- board, f and fits derive from stored and units
  return (
    <>
      <h3>Profiles{rows.length > 0 && <span className="h3-count"> · {rows.length}</span>}</h3>
      {rows.map((profile) => <ProfileRow key={profile.id} board={stored} profile={profile} />)}
      {items.length > 0
        ? <Popover className="add-profile" label={<>+ Add profile<span aria-hidden="true"> ▾</span></>} title="Add an edge profile" items={items} />
        : <p className="field-note">No profile preset fits this part.</p>}
    </>
  );
}
