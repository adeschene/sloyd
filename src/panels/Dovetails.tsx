import { useEffect, useId, useRef, useState } from 'react';
import { useStore } from '../store/store';
import type { Board } from '../document/document';
import { dovetailFaults, dovetailPlan } from '../document/dovetails';
import { DOVETAIL_COUNT_MAX, dovetailsOf } from '../document/dovetailModel';
import {
  DOVETAIL_BUTTON, DOVETAIL_COUNT_WHOLE, DOVETAIL_FIELD_JOINT, DOVETAIL_FIELD_LAP, DOVETAIL_FIELD_SLOPE, DOVETAIL_FIELD_TAILS, DOVETAIL_HEADING, DOVETAIL_JOINT_HALF_BLIND, DOVETAIL_JOINT_KEEP, DOVETAIL_JOINT_THROUGH, DOVETAIL_LAP_PARSE, DOVETAIL_REMOVE,
  DOVETAIL_SLOPE_PREFIX, DOVETAIL_SLOPE_RANGE, DOVETAIL_SWAP, DOVETAIL_TAILS_PLACEHOLDER, dovetailFaultText, dovetailLine,
} from '../document/dovetailText';
import { IMPERIAL, formatLength, parseLength } from '../units/length';
import type { Units } from '../units/length';
import { DimensionField } from './DimensionField';

/** The default slope (spec §4, Global Constraints): 1:8. */
const DEFAULT_SLOPE = 8;
/** A slope as typed: a plain non-negative decimal. Its range (1:4 to 1:12) is the planner's refusal after the click, never
 *  a parse error (spec §4). */
const parseSlope = (text: string): number | null => (/^\s*\d+(\.\d+)?\s*$/.test(text) ? Number(text.trim()) : null);

/**
 * The Tails field (spec §4): blank is Auto (null), else a whole number from 1 to DOVETAIL_COUNT_MAX (more is a parse error). Inv 5's draft rules, as DimensionField's
 * (which cannot hold "blank"): the draft commits on blur or Enter only when it was typed in; an untouched blur resyncs from
 * `value` and commits nothing; Escape reverts; a refused entry keeps focus and the typed text, and shows the count sentence
 * as the field's own error (`onErrorChange` tells the section, which disables its button, as Box joints' width).
 */
function TailsField({ value, onCommit, onErrorChange }: {
  value: number | null; onCommit: (n: number | null) => void; onErrorChange: (refused: boolean) => void;
}) {
  const id = useId();
  const show = (v: number | null) => (v === null ? '' : String(v));
  const [text, setText] = useState(() => show(value));
  const [error, setError] = useState<string | null>(null);
  const dirty = useRef(false);
  const settled = useRef(false);
  useEffect(() => { onErrorChange(error !== null); }, [error]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = (): boolean => {
    const t = text.trim();
    const n = t === '' ? null : /^\d+$/.test(t) && Number(t) >= 1 && Number(t) <= DOVETAIL_COUNT_MAX ? Number(t) : NaN;
    if (Number.isNaN(n)) {
      setError(DOVETAIL_COUNT_WHOLE);
      return false;
    }
    setError(null);
    setText(show(n));
    dirty.current = false;
    if (n !== value) onCommit(n);
    return true;
  };
  return (
    <div className="field">
      <label htmlFor={id}>{DOVETAIL_FIELD_TAILS}</label>
      <input id={id} className={error ? 'input invalid' : 'input'} value={text} placeholder={DOVETAIL_TAILS_PLACEHOLDER}
        aria-invalid={error ? 'true' : 'false'}
        onChange={(e) => { dirty.current = true; setText(e.target.value); }}
        onBlur={() => {
          if (settled.current) { settled.current = false; return; }
          if (!dirty.current) { setText(show(value)); setError(null); return; }
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (dirty.current && !commit()) return;
            settled.current = true;
            (e.target as HTMLInputElement).blur();
          } else if (e.key === 'Escape') {
            settled.current = true;
            dirty.current = false;
            setError(null);
            setText(show(value));
            (e.target as HTMLInputElement).blur();
          }
        }} />
      {error && <span role="alert" className="field-error">{error}</span>}
    </div>
  );
}

/**
 * The Lap field (half-blind spec §4), as TailsField: blank is Auto (null), else a length in the document's units
 * (`parseLength`) more than 0; anything else is the parse sentence as the field's own error (the section disables its button).
 * Disabled while every corner will be through.
 */
function LapField({ value, units, disabled, onCommit, onErrorChange }: {
  value: number | null; units: Units; disabled: boolean; onCommit: (n: number | null) => void; onErrorChange: (refused: boolean) => void;
}) {
  const id = useId();
  const show = (v: number | null) => (v === null ? '' : formatLength(v, units));
  const [text, setText] = useState(() => show(value));
  const [error, setError] = useState<string | null>(null);
  const dirty = useRef(false);
  const settled = useRef(false);
  useEffect(() => { onErrorChange(error !== null); }, [error]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = (): boolean => {
    const t = text.trim();
    const n = t === '' ? null : parseLength(t, units);
    if (n !== null && !(n > 0)) { setError(DOVETAIL_LAP_PARSE); return false; }
    if (t !== '' && n === null) { setError(DOVETAIL_LAP_PARSE); return false; }
    setError(null);
    setText(show(n));
    dirty.current = false;
    if (n !== value) onCommit(n);
    return true;
  };
  return (
    <div className="field">
      <label htmlFor={id}>{DOVETAIL_FIELD_LAP}</label>
      <input id={id} className={error ? 'input invalid' : 'input'} value={text} placeholder={DOVETAIL_TAILS_PLACEHOLDER}
        disabled={disabled} aria-invalid={error ? 'true' : 'false'}
        onChange={(e) => { dirty.current = true; setText(e.target.value); }}
        onBlur={() => {
          if (settled.current) { settled.current = false; return; }
          if (!dirty.current) { setText(show(value)); setError(null); return; }
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (dirty.current && !commit()) return;
            settled.current = true;
            (e.target as HTMLInputElement).blur();
          } else if (e.key === 'Escape') {
            settled.current = true;
            dirty.current = false;
            setError(null);
            setText(show(value));
            (e.target as HTMLInputElement).blur();
          }
        }} />
      {error && <span role="alert" className="field-error">{error}</span>}
    </div>
  );
}

type JointChoice = 'keep' | 'through' | 'half-blind';

/**
 * The Dovetails section (dovetails spec §4), in the multi-selection panel beside Box joints when two or more parts are
 * selected (the caller decides; inside its `EditLock`, inv 47): `Slope 1 : [8]`, `Tails [Auto]`, `Swap tails and pins`,
 * `Dovetail the corners`. The button is disabled only while a field shows a parse error; every refusal is the store's
 * (`dovetailCorners`, over the ONE planner), shown verbatim as the section's alert. On success the notes are the planner's
 * own, planned on the SAME document object the store then reads, in the same tick (Box joints' pattern); any field change
 * clears them and the alert, and the caller's remount on a selection change does too.
 */
export function DovetailsSection({ ids }: { ids: string[] }) {
  const dovetailCorners = useStore((s) => s.dovetailCorners);
  const units = useStore((s) => s.doc.units);
  const jointId = useId();
  const [slope, setSlope] = useState(DEFAULT_SLOPE);
  const [count, setCount] = useState<number | null>(null);
  const [swap, setSwap] = useState(false);
  const [joint, setJoint] = useState<JointChoice>('keep');
  const [lap, setLap] = useState<number | null>(null);
  const [lapBad, setLapBad] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [slopeBad, setSlopeBad] = useState(false);
  const [tailsBad, setTailsBad] = useState(false);
  const clear = () => { setError(null); setNotes([]); };
  const run = () => {
    const before = useStore.getState().doc;
    const plan = dovetailPlan(before, ids, { slope, count, swap, joint, lap });
    const r = dovetailCorners(ids, slope, count, swap, joint, lap);
    setError(r);
    setNotes(r === null && typeof plan !== 'string' && useStore.getState().doc !== before ? plan.notes : []);
  };
  return (
    <>
      <h3>{DOVETAIL_HEADING}</h3>
      <div className="field-grid field-grid-2">
        <DimensionField label={DOVETAIL_FIELD_SLOPE} prefix={DOVETAIL_SLOPE_PREFIX} value={slope} allowNegative
          units={IMPERIAL} // unused: parse and format are supplied
          parse={parseSlope} format={String} invalid={DOVETAIL_SLOPE_RANGE}
          onCommit={(v) => { setSlope(v); clear(); }} onErrorChange={setSlopeBad} />
        <TailsField value={count} onCommit={(n) => { setCount(n); clear(); }} onErrorChange={setTailsBad} />
      </div>
      <div className="field-grid field-grid-2">
        <div className="field">
          <label htmlFor={jointId}>{DOVETAIL_FIELD_JOINT}</label>
          <select id={jointId} className="input" value={joint} onChange={(e) => { setJoint(e.target.value as JointChoice); clear(); }}>
            <option value="keep">{DOVETAIL_JOINT_KEEP}</option>
            <option value="through">{DOVETAIL_JOINT_THROUGH}</option>
            <option value="half-blind">{DOVETAIL_JOINT_HALF_BLIND}</option>
          </select>
        </div>
        <LapField value={lap} units={units} disabled={joint === 'through'} onCommit={(n) => { setLap(n); clear(); }} onErrorChange={setLapBad} />
      </div>
      <label className="checkbox">
        <input type="checkbox" checked={swap} onChange={(e) => { setSwap(e.target.checked); clear(); }} />
        {DOVETAIL_SWAP}
      </label>
      <button className="add-cut" disabled={slopeBad || tailsBad || (lapBad && joint !== 'through')} onClick={run}>{DOVETAIL_BUTTON}</button>
      {error && <p className="field-error" role="alert">{error}</p>}
      {notes.map((n, i) => <p key={i} className="link-note">{n}</p>)}
    </>
  );
}

/**
 * The single-part Dovetails section (dovetails spec §4), after Round tenons: one row per stored dovetail, its cut-list line
 * (`dovetailLine`), a note per fault (`dovetailFaults`, the ONE decider: a dovetail a later resize faulted is KEPT, builds
 * nothing, and this note says so), and Remove (that end only: the partner keeps its own). Not shown on a dovetail-free part
 * (dovetails are made from the multi-selection, never added here).
 */
export function DovetailsPart({ board }: { board: Board }) {
  const units = useStore((s) => s.doc.units);
  const removeDovetail = useStore((s) => s.removeDovetail);
  const list = dovetailsOf(board);
  if (list.length === 0) return null;
  return (
    <>
      <h3>{DOVETAIL_HEADING}<span className="h3-count"> · {list.length}</span></h3>
      {list.map((d) => {
        const line = dovetailLine(board, d, units);
        return (
        <div key={d.id} className="cut" role="group" aria-label={line}>
          <p className="field-note">{line}</p>
          {dovetailFaults(board, d).map((f) => <p key={f} className="field-note" role="status">{dovetailFaultText(f)}</p>)}
          <div className="row">
            <button onClick={() => removeDovetail(board.id, d.id)}>{DOVETAIL_REMOVE}</button>
          </div>
        </div>
        );
      })}
    </>
  );
}
