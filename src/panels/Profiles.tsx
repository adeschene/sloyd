import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/store';
import {
  curveFaults, defaultProfile, geometryBoard, profileAsymmetric, profileFields, profileFromFields,
  profileOf, profileToFields, uvDims, DEFAULT_PROFILE_EDGE, PROFILE_EDGES, PROFILE_KINDS,
} from '../document/document';
import type { Board, CurveCut, CutFrom, Dimension, ProfileCut, ProfileEdge, ProfileEnd, ProfileFields, ProfileKind, ProfileSide } from '../document/document';
import { canonicalRun, endPos, endToEnd, profileFaults, runDim, viewProfileFaults } from '../document/profiles';
import type { ProfileFault } from '../document/profiles';
import { curveFaultText, curveLine, profileFaultText } from '../document/curveText';
import { endWord } from '../document/holeText';
import { formatLength } from '../units/length';
import { DimensionField } from './DimensionField';
import { Popover } from './Popover';
import { holeRefusal, optionReason, refusalFor } from './curveRefusal';
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
type RunKind = 'through' | 'stopped';
const RUN_LABEL: Record<RunKind, string> = { through: 'End to end', stopped: 'Stopped' };
/** The refusal for a profile fault an edit would ADD (P12). */
const PROFILE_REFUSAL: Record<ProfileFault['kind'], string> = {
  'stop-off': 'A stop runs off the part — move it first.',
  overlap: 'Overlaps another profile on this edge — move it first.',
};
type Next = Omit<ProfileCut, 'id'>;

/** A symmetric profile is written at facing 'v' (`profileCurve` does not normalise): a roundover with no fillet is then
 *  byte-identical to `cornerCurve`, and reads back as the fields it was written from. */
const normal = (f: ProfileFields): ProfileFields => (profileAsymmetric(f) ? f : { ...f, facing: 'v' });

/** The fu 388 rule, one instance per select: an option whose result would be refused is disabled and says why, judged ONLY
 *  while the select has focus — every edit frame is a render — and afresh when the profile or part changes under it. */
function useReasons<K extends string>(curve: CurveCut, board: Board, keys: readonly K[], current: K, judge: (k: K) => string | null) {
  const [focused, setFocused] = useState(false);
  const [judged, setJudged] = useState<{ curve: CurveCut; board: Board; reasons: Partial<Record<K, string>> } | null>(null);
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
  // profiles for the post-edit board. The row's curve is the VIEW's own object, so its words carry the stopped run and the
  // profile's faults (curveText reads them off that object).
  const board = geometryBoard(stored_);
  const p = useMemo(() => profileToFields(profile), [profile]);
  const curve = board.curves.find((c) => c.id === profile.id)!;
  const [error, setError] = useState<string | null>(null);
  const line = curveLine(board, curve, units);
  const storedFaults = [...curveFaults(board, curve).map(curveFaultText), ...viewProfileFaults(curve).map(profileFaultText)];
  // A loop or a two-side run is refused on load (spec P2/P10), and `profileToFields` above would already have thrown.
  const run0 = profile.run as { start: ProfileEnd; end: ProfileEnd };
  const side: ProfileSide = run0.start.side;
  const dim = runDim(side);
  const L = stored_[dim];
  const stopped = !endToEnd(run0);
  /** The stored next profile for new fields: the run kept, its ends re-sided and re-ordered (a Face or Side change keeps
   *  the stations; P11). */
  const build = (nextFields: ProfileFields, run = run0): Next => {
    const next = profileFromFields(normal(nextFields));
    if (endToEnd(run)) return next;
    const ns = next.run as { start: ProfileEnd; end: ProfileEnd };
    const reSide = (e: ProfileEnd): ProfileEnd => ({ ...e, side: { ...ns.start.side } });
    return { ...next, run: canonicalRun(stored_, next.face, { start: reSide(run.start), end: reSide(run.end) }) };
  };
  /** The refusal for `next` (nothing stored), or null: an ADDED profile fault, curve fault or hole fault. */
  const refuse = (next: Next, control: Control | null): string | null => {
    const after: Board = { ...stored_, profiles: stored_.profiles.map((x) => (x.id === profile.id ? { ...next, id: x.id } : x)) };
    const had = new Set(viewProfileFaults(curve).map((f) => f.kind));
    const added = profileFaults(after, { ...next, id: profile.id }).find((f) => !had.has(f.kind));
    if (added) return PROFILE_REFUSAL[added.kind];
    const nextCurve = geometryBoard(after).curves.find((c) => c.id === profile.id)!;
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

  const [u, v] = uvDims(p.through);
  const sizeLabel = SIZE_LABEL[p.kind];
  // The Kind-select rule: keep the edge (and the facing, for a kind that has one); take the kind's defaults.
  const asKind = (kind: ProfileKind): ProfileFields => profileFields(defaultProfile(board, kind, p, kind === 'roundover' || kind === 'cove' ? 'v' : p.facing))!;
  const withFace = (face: CutFrom): ProfileFields => ({ ...p, vFrom: face });
  const withSide = (s: ProfileSide): ProfileFields => ({ ...p, through: runDim(s), uFrom: s.from });
  /** Run → Stopped seeds 3" in from each end (or a quarter of the run, if shorter). */
  const stoppedRun = (): Next['run'] => {
    const start = Math.min(3, L / 4);
    const at = (a: number): ProfileEnd => ({ side: { ...side }, from: 'min', at: a });
    return { start: at(start), end: at(L - start) };
  };
  const withRun = (k: RunKind): Next => {
    const fields = p;
    if (k === 'through') return profileFromFields(normal(fields));
    const next = profileFromFields(normal(fields));
    return { ...next, run: canonicalRun(stored_, next.face, stoppedRun() as { start: ProfileEnd; end: ProfileEnd }) };
  };
  const kindR = useReasons(curve, board, PROFILE_KINDS, p.kind, (k) => refuse(build(asKind(k)), null));
  const faceR = useReasons(curve, board, ['max', 'min'] as const, p.vFrom, (f) => refuse(build(withFace(f)), null));
  const sideKeys = ['0', '1', '2', '3'] as const;
  const sideR = useReasons(curve, board, sideKeys, String(SIDES.findIndex((x) => sameSide(x, side))) as (typeof sideKeys)[number],
    (i) => refuse(build(withSide(SIDES[Number(i)]!)), null));
  const runKeys: readonly RunKind[] = ['through', 'stopped'];
  const runR = useReasons(curve, board, runKeys, (stopped ? 'stopped' : 'through') as RunKind, (k) => refuse(withRun(k), null));
  const opt = (reasons: Partial<Record<string, string>>, key: string, label: string) => {
    const why = reasons[key];
    return <option key={key} value={key} disabled={why !== undefined}>{why ? `${label} — ${why}` : label}</option>;
  };
  // The stations, lo then hi along the run from its min end; an edited one becomes a station written from the min end, an
  // untouched end (a through end, or a station from the max end) is kept as stored.
  const ends = stopped ? [run0.start, run0.end].sort((a, b) => endPos(stored_, a) - endPos(stored_, b)) : null;
  const stationEdit = (which: 0 | 1, at: number): string | undefined => {
    const [lo, hi] = ends!;
    const station = (e: ProfileEnd, pos: number): ProfileEnd => (endPos(stored_, e) === pos ? e : { side: { ...e.side }, from: 'min', at: pos });
    const pair = which === 0 ? [station(lo!, at), hi!] : [lo!, station(hi!, at)];
    const next = { ...profileFromFields(normal(p)), run: canonicalRun(stored_, profile.face, { start: pair[0]!, end: pair[1]! }) };
    return attempt(next, null) ?? undefined;
  };
  return (
    <div className="cut" data-kind={p.kind}>
      <div className="cut-head">
        <span className="cut-label curve-label">{KIND_LABEL[p.kind]}</span>
        <button className="cut-remove" aria-label={`Remove profile (${line})`} onClick={() => removeProfile(stored_.id, profile.id)}>✕</button>
      </div>
      <p className="field-note">{line}</p>
      {storedFaults.length > 0 && <p className="field-note" role="status">{cap(storedFaults[0]!)} at this size.</p>}
      <div className="field-grid field-grid-2">
        <div className="field">
          <label htmlFor={`profile-face-${curve.id}`}>Face</label>
          <select id={`profile-face-${curve.id}`} className="input" value={p.vFrom} {...faceR.focus}
            onChange={(e) => set(build(withFace(e.target.value as CutFrom)))}>
            {(['max', 'min'] as const).map((f) => opt(faceR.reasons, f, FACE_LABEL[f]))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`profile-side-${curve.id}`}>Side</label>
          <select id={`profile-side-${curve.id}`} className="input" value={SIDES.findIndex((x) => sameSide(x, side))} {...sideR.focus}
            onChange={(e) => set(build(withSide(SIDES[Number(e.target.value)]!)))}>
            {SIDES.map((s, i) => opt(sideR.reasons, String(i), sideLabel(s)))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`profile-run-${curve.id}`}>Run</label>
          <select id={`profile-run-${curve.id}`} className="input" value={stopped ? 'stopped' : 'through'} {...runR.focus}
            onChange={(e) => set(withRun(e.target.value as RunKind))}>
            {runKeys.map((k) => opt(runR.reasons, k, RUN_LABEL[k]))}
          </select>
        </div>
        {ends && (
          <>
            <DimensionField label={`Start (from the ${dim} min end)`} value={endPos(stored_, ends[0]!)} units={units} onCommit={(at) => stationEdit(0, at)} />
            <DimensionField label={`Stop (from the ${dim} min end)`} value={endPos(stored_, ends[1]!)} units={units} onCommit={(at) => stationEdit(1, at)} />
          </>
        )}
        <div className="field">
          <label htmlFor={`profile-kind-${curve.id}`}>Profile</label>
          <select id={`profile-kind-${curve.id}`} className="input" value={p.kind} {...kindR.focus}
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
            <label htmlFor={`profile-facing-${curve.id}`}>Facing</label>
            <select id={`profile-facing-${curve.id}`} className="input" value={p.facing} onChange={(e) => set(build({ ...p, facing: e.target.value as 'u' | 'v' }))}>
              <option value="v">{`Top: ${sideText(v, p.vFrom)}`}</option>
              <option value="u">{`Top: ${sideText(u, p.uFrom)}`}</option>
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
  const fits = (c: Draft): boolean => {
    if (curveFaults(board, c).length > 0) return false;
    const preset: ProfileCut = { ...profileOf(c)!, id: '__preset0' };
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
