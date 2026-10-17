import { useEffect, useState } from 'react';
import { useStore } from '../store/store';
import {
  curveFaults, defaultProfile, profileAsymmetric, profileCurve, profileFields, uvDims, PROFILE_EDGES, PROFILE_KINDS,
} from '../document/document';
import type { Board, CurveCut, CutFrom, Dimension, ProfileEdge, ProfileFields, ProfileKind } from '../document/document';
import { curveFaultText, curveLine } from '../document/curveText';
import { endWord } from '../document/holeText';
import { formatLength } from '../units/length';
import { DimensionField } from './DimensionField';
import { Popover } from './Popover';
import { holeRefusal, optionReason, refusalFor } from './curveRefusal';
import type { Control, Draft } from './curveRefusal';

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
const sideText = (d: Dimension, side: CutFrom) => `${d} ${side} ${endWord(d)}`;
/** An edge in the Chamfer row's words: `Width max side · thickness max side`. */
const edgeLabel = (e: ProfileEdge) => { const [u, v] = uvDims(e.through); return cap(`${sideText(u, e.uFrom)} · ${sideText(v, e.vFrom)}`); };
const KIND_LABEL: Record<ProfileKind, string> = { roundover: 'Roundover', cove: 'Cove', ogee: 'Roman ogee', bead: 'Bead', thumbnail: 'Thumbnail' };
const SIZE_LABEL: Record<ProfileKind, Control> = { roundover: 'Radius', cove: 'Radius', ogee: 'Size', bead: 'Radius', thumbnail: 'Reach' };
const sameEdge = (a: ProfileEdge, b: ProfileEdge) => a.through === b.through && a.uFrom === b.uFrom && a.vFrom === b.vFrom;

/** A symmetric profile is written at facing 'v' (`profileCurve` does not normalise): a roundover with no fillet is then
 *  byte-identical to `cornerCurve`, and reads back as the fields it was written from. */
const normal = (f: ProfileFields): ProfileFields => (profileAsymmetric(f) ? f : { ...f, facing: 'v' });

function ProfileRow({ board, curve, p }: { board: Board; curve: CurveCut; p: ProfileFields }) {
  const units = useStore((s) => s.doc.units);
  const updateCurve = useStore((s) => s.updateCurve);
  const removeCurve = useStore((s) => s.removeCurve);
  const [error, setError] = useState<string | null>(null);
  const line = curveLine(board, curve, units);
  const stored = curveFaults(board, curve);
  /** Tries the edit: the refusal text when it is refused (nothing stored), else null. */
  const attempt = (next: Draft, control: Control | null): string | null => {
    const refused = refusalFor(board, curve, next, control);
    if (refused) return refused;
    setError(null);
    updateCurve(board.id, curve.id, next);
    return null;
  };
  const write = (next: ProfileFields, control: Control | null) => attempt(profileCurve(normal(next)), control);
  // A typed field owns its refusal (DimensionField shows it as ITS error); a select shows it on the row and stays on the
  // stored value.
  const field = (next: ProfileFields, control: Control): string | undefined => write(next, control) ?? undefined;
  const set = (next: Draft) => { const r = attempt(next, null); if (r) setError(r); };

  const [u, v] = uvDims(p.through);
  const edgeIndex = PROFILE_EDGES.findIndex((e) => sameEdge(e, p));
  const sizeLabel = SIZE_LABEL[p.kind];
  // The Kind-select rule: keep the edge (and the facing, for a kind that has one); take the kind's defaults.
  const asKind = (kind: ProfileKind): Draft => defaultProfile(board, kind, p, kind === 'roundover' || kind === 'cove' ? 'v' : p.facing);
  // fu 388 (the user's ruling): as the Curves Kind select (presets minors 1, 2), an option whose result would be refused is
  // disabled and says why, judged ONLY while the select has focus — every edit frame is a render — and afresh when the
  // profile or part changes under it. The change still goes through `set`, so a stale list refuses in the row's words.
  const [kindFocused, setKindFocused] = useState(false);
  const [judged, setJudged] = useState<{ curve: CurveCut; board: Board; reasons: Partial<Record<ProfileKind, string>> } | null>(null);
  useEffect(() => {
    if (!kindFocused || (judged && judged.curve === curve && judged.board === board)) return;
    const reasons: Partial<Record<ProfileKind, string>> = {};
    for (const k of PROFILE_KINDS) {
      if (k === p.kind) continue;
      const refused = refusalFor(board, curve, asKind(k), null);
      if (refused) reasons[k] = optionReason(refused);
    }
    setJudged({ curve, board, reasons });
  }, [kindFocused, curve, board, judged]); // eslint-disable-line react-hooks/exhaustive-deps -- p and asKind derive from curve and board
  const reasons = kindFocused && judged && judged.curve === curve && judged.board === board ? judged.reasons : {};
  return (
    <div className="cut" data-kind={p.kind}>
      <div className="cut-head">
        <span className="cut-label curve-label">{KIND_LABEL[p.kind]}</span>
        <button className="cut-remove" aria-label={`Remove profile (${line})`} onClick={() => removeCurve(board.id, curve.id)}>✕</button>
      </div>
      <p className="field-note">{line}</p>
      {stored.length > 0 && <p className="field-note" role="status">{cap(curveFaultText(stored[0]!))} at this size.</p>}
      <div className="field-grid field-grid-2">
        <div className="field field-wide">
          <label htmlFor={`profile-edge-${curve.id}`}>Edge</label>
          <select id={`profile-edge-${curve.id}`} className="input" value={edgeIndex} onChange={(e) => {
            const r = write({ ...p, ...PROFILE_EDGES[Number(e.target.value)]! }, null);
            if (r) setError(r);
          }}>
            {PROFILE_EDGES.map((e, i) => <option key={i} value={i}>{edgeLabel(e)}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`profile-kind-${curve.id}`}>Profile</label>
          <select id={`profile-kind-${curve.id}`} className="input" value={p.kind}
            onFocus={() => setKindFocused(true)} onBlur={() => { setKindFocused(false); setJudged(null); }}
            onChange={(e) => set(asKind(e.target.value as ProfileKind))}>
            {PROFILE_KINDS.map((k) => {
              const why = reasons[k];
              return <option key={k} value={k} disabled={why !== undefined}>{why ? `${KIND_LABEL[k]} — ${why}` : KIND_LABEL[k]}</option>;
            })}
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
            <select id={`profile-facing-${curve.id}`} className="input" value={p.facing} onChange={(e) => {
              const r = write({ ...p, facing: e.target.value as 'u' | 'v' }, null);
              if (r) setError(r);
            }}>
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
export function Profiles({ board }: { board: Board }) {
  const addCurves = useStore((s) => s.addCurves);
  const units = useStore((s) => s.doc.units);
  const f = (n: number) => formatLength(n, units);
  // A preset whose default would fault on this part — a curve fault, or a hole it would put into the waste — is withheld,
  // not added and refused (the Curves precedent).
  const fits = (c: Draft): boolean => {
    if (curveFaults(board, c).length > 0) return false;
    const after: Board = { ...board, curves: [...board.curves, { ...c, id: '__preset0' }] };
    return holeRefusal(board, after) === null;
  };
  const rows = board.curves.flatMap((c) => { const p = profileFields(c); return p ? [{ c, p }] : []; });
  const items = PROFILE_KINDS.flatMap((kind) => {
    const c = defaultProfile(board, kind);
    const d = profileFields(c);
    if (!d || !fits(c)) return [];
    const size = kind === 'ogee' ? f(d.size)
      : kind === 'thumbnail' ? `${f(d.size)} × ${f(d.depth!)}`
      : kind === 'bead' ? `${f(d.size)} radius, ${f(d.fillet!)} quirk`
      : `${f(d.size)} radius`;
    return [{ label: KIND_LABEL[kind], detail: `${size}, on the top long edge`, run: () => addCurves(board.id, [c]) }];
  });
  return (
    <>
      <h3>Profiles{rows.length > 0 && <span className="h3-count"> · {rows.length}</span>}</h3>
      {rows.map(({ c, p }) => <ProfileRow key={c.id} board={board} curve={c} p={p} />)}
      {items.length > 0
        ? <Popover className="add-profile" label={<>+ Add profile<span aria-hidden="true"> ▾</span></>} title="Add an edge profile" items={items} />
        : <p className="field-note">No profile preset fits this part.</p>}
    </>
  );
}
