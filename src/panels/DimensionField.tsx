import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { formatLength, parseLength } from '../units/length';

interface Props {
  label: string;
  /**
   * The stored value, or null for MIXED: several parts are being edited and
   * they differ (multi-select spec §4.4). Mixed shows an empty box with a
   * `mixed` placeholder. The untouched-blur guard below is what makes it
   * safe — committing a mixed field nobody typed in would set every part to
   * one value, silently (invariant 5).
   */
  value: number | null;
  onCommit: (inches: number) => void;
  /** Positions may be negative; dimensions may not. */
  allowNegative?: boolean;
  /** Smallest legal value, inclusive. Overrides the default "> 0" rule for
   *  fields where zero is legal but negative is not (e.g. a cut's offset,
   *  which is legitimately flush with the near side). */
  min?: number;
  /** Largest legal value, inclusive. Refused rather than clamped: silently
   *  correcting a number the user just typed loses a measurement without
   *  saying so. */
  max?: number;
  precision?: number;
}

export const DimensionField = forwardRef<HTMLInputElement, Props>(function DimensionField({
  label, value, onCommit, allowNegative = false, min, max, precision = 16,
}: Props, forwardedRef) {
  const id = useId();
  // The one formatter for `value`, so every resync path — initial state, the
  // adopt effect, the untouched-blur resync, Escape — handles mixed alike.
  const display = (v: number | null) => (v === null ? '' : formatLength(v, precision));
  const [text, setText] = useState(() => display(value));
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const editing = useRef(false);
  // Set by a keydown that has already settled the edit (Escape reverted it,
  // Enter committed it) just before it blurs the input, so onBlur does not
  // settle it a second time from this render's stale `value`.
  const blurHandled = useRef(false);
  useImperativeHandle(forwardedRef, () => inputRef.current as HTMLInputElement);
  // True only once the user has actually changed the text. Guards against
  // committing (and pushing an undo entry) when a field is merely focused
  // and blurred without being edited — see Task 8 review finding 1.
  const dirty = useRef(false);

  // Adopt external changes (gizmo drags, undo) unless the user is mid-edit.
  useEffect(() => {
    if (!editing.current) {
      setText(display(value));
      dirty.current = false;
      // An external change (gizmo drag, undo) supersedes whatever the user
      // was looking at, including a stale validation error from a previous
      // edit — otherwise the field can show a correct number while still
      // announcing itself invalid to assistive tech.
      setError(null);
    }
  }, [value, precision]);

  // Parses/validates/normalises the text unconditionally. Callers decide
  // whether a commit should happen at all (see the `dirty` guard on blur).
  // False when the entry was refused.
  const commit = (): boolean => {
    const parsed = parseLength(text);
    if (parsed === null) {
      setError('Enter a measurement, e.g. 3/4 or 1-1/2');
      return false;
    }
    if (min !== undefined) {
      if (parsed < min) {
        setError(`Must be at least ${formatLength(min, precision)}`);
        return false;
      }
    } else if (!allowNegative && parsed <= 0) {
      setError('Must be greater than zero');
      return false;
    }
    if (max !== undefined && parsed > max) {
      setError(`Must be at most ${formatLength(max, precision)}`);
      return false;
    }
    setError(null);
    setText(formatLength(parsed, precision));
    dirty.current = false;
    // Nothing actually changed (e.g. re-entering the same value, or the
    // display-rounded text still parses back to the stored value) — skip
    // the no-op onCommit/history entry.
    if (parsed === value) return true;
    onCommit(parsed);
    return true;
  };

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        ref={inputRef}
        value={text}
        placeholder={value === null ? 'mixed' : undefined}
        aria-invalid={error ? 'true' : 'false'}
        className={error ? 'input invalid' : 'input'}
        onFocus={() => { editing.current = true; }}
        onChange={(e) => { dirty.current = true; setText(e.target.value); }}
        onBlur={() => {
          editing.current = false;
          // A blur triggered by the Escape or Enter handler below: the edit
          // is already settled. Escape restored the last good value, and
          // re-running commit() against the stale text in this closure would
          // re-set the error it just cleared. Enter committed; resyncing from
          // this render's `value`, which predates the commit, would show the
          // old number until the adopt effect caught up.
          if (blurHandled.current) { blurHandled.current = false; return; }
          // Untouched field: nothing to commit, and committing here would
          // silently rewrite the document with the display-rounded value
          // (e.g. 0.7" -> 11/16") and push a no-op undo entry. But an
          // external change (gizmo drag, undo) may have landed while this
          // field was focused — the adopt-external-changes effect above
          // skips while editing, and its deps don't fire again once
          // editing.current goes false, so nothing else will ever resync
          // the display. Do that here, without committing.
          if (!dirty.current) {
            setText(display(value));
            setError(null);
            return;
          }
          commit();
        }}
        onKeyDown={(e) => {
          // Enter commits and leaves the field (follow-up 212): the commit is
          // visible, and the next Ctrl+Z reaches the app's undo, not the
          // input's. A refused entry keeps focus so it can be fixed. An
          // untouched Enter just blurs, through the ordinary untouched path.
          if (e.key === 'Enter') {
            if (dirty.current) {
              if (!commit()) return;
              blurHandled.current = true;
            }
            (e.target as HTMLInputElement).blur();
            return;
          }
          if (e.key === 'Escape') {
            blurHandled.current = true;
            dirty.current = false;
            setError(null);
            setText(display(value));
            editing.current = false;
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {error && <span role="alert" className="field-error">{error}</span>}
    </div>
  );
});
