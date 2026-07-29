import { useEffect, useId, useRef, useState } from 'react';
import { formatLength, parseLength } from '../units/length';

interface Props {
  label: string;
  value: number;
  onCommit: (inches: number) => void;
  /** Positions may be negative; dimensions may not. */
  allowNegative?: boolean;
  precision?: number;
}

export function DimensionField({
  label, value, onCommit, allowNegative = false, precision = 16,
}: Props) {
  const id = useId();
  const [text, setText] = useState(() => formatLength(value, precision));
  const [error, setError] = useState<string | null>(null);
  const editing = useRef(false);
  const reverting = useRef(false);
  // True only once the user has actually changed the text. Guards against
  // committing (and pushing an undo entry) when a field is merely focused
  // and blurred without being edited — see Task 8 review finding 1.
  const dirty = useRef(false);

  // Adopt external changes (gizmo drags, undo) unless the user is mid-edit.
  useEffect(() => {
    if (!editing.current) {
      setText(formatLength(value, precision));
      dirty.current = false;
    }
  }, [value, precision]);

  // Parses/validates/normalises the text unconditionally. Callers decide
  // whether a commit should happen at all (see the `dirty` guard on blur).
  const commit = () => {
    const parsed = parseLength(text);
    if (parsed === null) {
      setError('Enter a measurement, e.g. 3/4 or 1-1/2');
      return;
    }
    if (!allowNegative && parsed <= 0) {
      setError('Must be greater than zero');
      return;
    }
    setError(null);
    setText(formatLength(parsed, precision));
    dirty.current = false;
    // Nothing actually changed (e.g. re-entering the same value, or the
    // display-rounded text still parses back to the stored value) — skip
    // the no-op onCommit/history entry.
    if (parsed === value) return;
    onCommit(parsed);
  };

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={text}
        aria-invalid={error ? 'true' : 'false'}
        className={error ? 'input invalid' : 'input'}
        onFocus={() => { editing.current = true; }}
        onChange={(e) => { dirty.current = true; setText(e.target.value); }}
        onBlur={() => {
          editing.current = false;
          // A blur triggered by the Escape handler below should not re-run
          // commit() against the stale (invalid) text still held in this
          // closure's `text` — that would immediately re-set the error we
          // just cleared. Escape already restored the last good value.
          if (reverting.current) { reverting.current = false; return; }
          // Untouched field: nothing to commit, and committing here would
          // silently rewrite the document with the display-rounded value
          // (e.g. 0.7" -> 11/16") and push a no-op undo entry.
          if (!dirty.current) return;
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { commit(); return; }
          if (e.key === 'Escape') {
            reverting.current = true;
            dirty.current = false;
            setError(null);
            setText(formatLength(value, precision));
            editing.current = false;
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {error && <span role="alert" className="field-error">{error}</span>}
    </div>
  );
}
