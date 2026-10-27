import { useState } from 'react';
import { useStore } from '../store/store';
import { worldParts } from '../document/document';
import { defaultFingerWidth, boxJointPlan } from '../document/boxJoints';
import { BOX_BUTTON, BOX_FIELD_WIDTH, BOX_HEADING, BOX_SWAP } from '../document/boxJointText';
import { DimensionField } from './DimensionField';

/**
 * The Box joints section (box-joints spec §4), in the multi-selection panel when two or more parts are selected (the
 * caller decides; inside its `EditLock`, inv 47). Finger width defaults through `defaultFingerWidth` of the thinnest
 * selected part until one is typed; the button is disabled only while the field shows a parse error. The refusal is the
 * store's (`boxJointCorners`, over the ONE planner), shown verbatim as the section's alert. On success the notes are the
 * planner's own: `boxJointPlan` over the SAME document object the store then reads, in the same tick, so they cannot
 * disagree with what the store wrote (as `StretcherSection`). They are held here, not in the store (plan Spec
 * difference 2); any field change clears them and the alert, and the caller's remount on a selection change does too.
 */
export function BoxJointsSection({ ids }: { ids: string[] }) {
  const units = useStore((s) => s.doc.units);
  // A primitive (inv 43): the thinnest selected part's thickness.
  const thinnest = useStore((s) => Math.min(...worldParts(s.doc).filter((b) => ids.includes(b.id)).map((b) => b.thickness)));
  const boxJointCorners = useStore((s) => s.boxJointCorners);
  const [typed, setTyped] = useState<number | null>(null);
  const [swap, setSwap] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [refused, setRefused] = useState(false);
  const width = typed ?? defaultFingerWidth(thinnest, units);
  const clear = () => { setError(null); setNotes([]); };
  const run = () => {
    const before = useStore.getState().doc;
    const plan = boxJointPlan(before, ids, { width, swap });
    const r = boxJointCorners(ids, width, swap);
    setError(r);
    setNotes(r === null && typeof plan !== 'string' && useStore.getState().doc !== before ? plan.notes : []);
  };
  return (
    <>
      <h3>{BOX_HEADING}</h3>
      <div className="field-grid">
        <DimensionField label={BOX_FIELD_WIDTH} value={width} units={units}
          onCommit={(v) => { setTyped(v); clear(); }} onErrorChange={setRefused} />
      </div>
      <label className="checkbox">
        <input type="checkbox" checked={swap} onChange={(e) => { setSwap(e.target.checked); clear(); }} />
        {BOX_SWAP}
      </label>
      <button className="add-cut" disabled={refused} onClick={run}>{BOX_BUTTON}</button>
      {error && <p className="field-error" role="alert">{error}</p>}
      {notes.map((n, i) => <p key={i} className="link-note">{n}</p>)}
    </>
  );
}
