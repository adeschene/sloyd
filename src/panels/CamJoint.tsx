import { useMemo, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { displayNames, worldParts } from '../document/document';
import type { CutFrom } from '../document/document';
import {
  camFaceOptions, camJointPlan, camJointStaleFits, defaultCamFrom, defaultCamJointCount, findCamJoint,
} from '../document/camJoint';
import {
  ADD_CAM_JOINT, CAM_FACE_LABEL, CAM_JOINT_ALREADY, CAM_JOINT_HEADING, CAM_JOINT_TWO_FITS, FITTINGS_LABEL, FIT_CAM_JOINT,
  camJointLine, camJointReused, camJointStale, camJointStaleNote,
} from '../document/camJointText';

/**
 * What the section reads of the two selected parts, as ONE string (a primitive, inv 43): each world part whole. Any change
 * to either (a move, a resize, a hole row) re-plans; nothing else does.
 */
function pairSignature(world: readonly { id: string }[], a: string, b: string): string {
  return JSON.stringify([a, b].map((id) => world.find((p) => p.id === id) ?? null));
}

/** The Fittings field (spec §4): a plain integer, committing once on blur or Enter (inv 9's spirit; no per-keystroke plan).
 *  A draft that is not a whole number is committed as typed, so the planner's own count refusal speaks. */
function FittingsField({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  const dirty = useRef(false);
  const commit = () => {
    const t = text;
    setText(null);
    if (!dirty.current || t === null || t.trim() === '') { dirty.current = false; return; }
    dirty.current = false;
    onCommit(Number(t));
  };
  return (
    <div className="field">
      <label htmlFor="cam-joint-fittings">{FITTINGS_LABEL}</label>
      <input id="cam-joint-fittings" className="input" type="number" min={1} max={12} step={1} value={text ?? String(value)}
        onChange={(e) => { dirty.current = true; setText(e.target.value); }}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} />
    </div>
  );
}

/**
 * The Cam-and-bolt joint section (cam-and-bolt joint spec §4), in the multi-selection panel when exactly two parts are
 * selected (inside its `EditLock`, inv 47; the caller remounts it on a selection change). Everything shown is the planner's
 * (`camJointPlan`, re-run by the store at click time); a throw (a caller bug, R14) is logged and treated as no plan.
 */
export function CamJointSection({ ids }: { ids: [string, string] }) {
  const units = useStore((s) => s.doc.units);
  const addCamJoint = useStore((s) => s.addCamJoint);
  const [count, setCount] = useState<number | null>(null);
  const [camFrom, setCamFrom] = useState<CutFrom | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [a, b] = ids;
  const signature = useStore((s) => pairSignature(worldParts(s.doc), a, b));
  const view = useMemo(() => {
    try {
      const doc = useStore.getState().doc;
      const found = findCamJoint(doc, [a, b]);
      const names = displayNames(doc);
      const nameOf = (id: string) => names.get(id) ?? worldParts(doc).find((p) => p.id === id)?.name ?? '';
      if (typeof found === 'string') return { refusal: found };
      const fallback = defaultCamJointCount(doc, [a, b]);
      const options = camFaceOptions(doc, [a, b]);
      const from = camFrom ?? defaultCamFrom(doc, [a, b]);
      const plan = camJointPlan(doc, [a, b], count, from);
      const line = camJointLine(nameOf(found.a), found.end, nameOf(found.b));
      const already = typeof plan === 'string' && plan === CAM_JOINT_ALREADY(nameOf(found.a), nameOf(found.b));
      // A fit (fu 602): B's bores move onto A's bolts; a tie still says what it would have done (spec §4.1).
      const fit = typeof plan === 'string' ? plan === CAM_JOINT_TWO_FITS(nameOf(found.b)) : plan.moved.length > 0;
      const stale = fit ? camJointStale(nameOf(found.a), nameOf(found.b)) : null;
      return { line, plan, options, from, fallback, already, stale };
    } catch (e) {
      console.error('CamJointSection: the planner threw', e);
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, units, a, b, count, camFrom]);
  if (!view) return null;
  const clear = () => { setError(null); setNotes([]); };
  const add = () => {
    const r = addCamJoint([a, b], count, camFrom);
    if (r === null) return;
    if (typeof r === 'string') { setError(r); setNotes([]); return; }
    setError(null);
    setNotes(r.notes);
  };
  if ('refusal' in view) {
    return (
      <>
        <h3>{CAM_JOINT_HEADING}</h3>
        <p className="field-note">{view.refusal}</p>
        <button className="add-cut" disabled>{ADD_CAM_JOINT}</button>
      </>
    );
  }
  const { line, plan, options, from, fallback, already, stale } = view;
  const reused = typeof plan !== 'string' && plan.reused.a;
  const ok = typeof plan !== 'string';
  return (
    <>
      <h3>{CAM_JOINT_HEADING}</h3>
      <p className="field-note">{line}</p>
      {stale && <p className="field-note">{stale}</p>}
      {!reused && !already && !stale && (
        <div className="field-grid field-grid-2">
          {options && (
            <div className="field">
              <label htmlFor="cam-joint-face">{CAM_FACE_LABEL}</label>
              <select id="cam-joint-face" className="input" value={from ?? options[0]!.from}
                onChange={(e) => { setCamFrom(e.target.value as CutFrom); clear(); }}>
                {options.map((o) => <option key={o.from} value={o.from}>{o.label}</option>)}
              </select>
            </div>
          )}
          <FittingsField value={count ?? fallback ?? 1} onCommit={(n) => { setCount(n); clear(); }} />
        </div>
      )}
      {reused && <p className="field-note">{camJointReused(plan.fittings)}</p>}
      {!ok && <p className="field-note">{plan}</p>}
      <button className="add-cut" disabled={!ok} onClick={add}>{stale ? FIT_CAM_JOINT : ADD_CAM_JOINT}</button>
      {error && <p className="field-error" role="alert">{error}</p>}
      {notes.map((n) => <p key={n} className="field-note">{n}</p>)}
    </>
  );
}

/**
 * A part's Cam-and-bolt joint readout (fit-again spec §4.2, fu 602), in the single-part panel: one note per part whose
 * joint with this part's cam locks no longer lines up (`camJointStaleFits`); nothing otherwise, and nothing for a Cam lock
 * whose side was never bored. The memo keys on the document itself (a stable reference, inv 43; the document is
 * immutable, so any part's change — a part butting this one's ends may be any part — is a new document). A throw past the planner's own catch is logged and shows nothing (R14).
 */
export function CamJointReadout({ board }: { board: { id: string } }) {
  const doc = useStore((s) => s.doc);
  const id = board.id;
  const notes = useMemo(() => {
    try {
      const names = displayNames(doc);
      return camJointStaleFits(doc, id).map((f) => camJointStaleNote(names.get(f.b) ?? f.b));
    } catch (e) {
      console.error('CamJointReadout: the planner threw', e);
      return [];
    }
  }, [doc, id]);
  if (notes.length === 0) return null;
  return (
    <>
      <h3>{CAM_JOINT_HEADING}</h3>
      {notes.map((n) => <p key={n} className="field-note">{n}</p>)}
    </>
  );
}
