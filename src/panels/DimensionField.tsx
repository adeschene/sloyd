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
  /** Return a STRING to REFUSE the value (holes ruling R7): the caller kept the stored value, and the string is the
   *  reason. The field owns it exactly as its own min/max refusal — shown as the field's error (same element, role and
   *  aria-invalid), the typed text kept, still dirty, focus kept on Enter — until the field's next successful commit, an
   *  external change of `value`, or Escape. No sibling can clear it. Undefined is today's behaviour: the value was taken. */
  onCommit: (inches: number) => string | void;
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
  /** Call `onCommit` for a typed entry even when it parses to `value`. For a
   *  caller whose `value` is a live DEFAULT (copy in a row): typing the
   *  default is still the person's choice, and must be recorded so it stops
   *  following the default. Untouched blur and Enter still commit nothing. */
  commitUnchanged?: boolean;
  /** Told whether the field currently shows a refusal, every time that
   *  changes (including false on mount), so a caller can refuse to act on a
   *  value other than the one on screen (copy in a row's Apply, fu 218). */
  onErrorChange?: (refused: boolean) => void;
  /** Text -> number, or null when unparseable. Default `parseLength`. */
  parse?: (text: string) => number | null;
  /** Number -> text, for the field AND the min/max messages. Default
   *  `formatLength(v, precision)`. */
  format?: (v: number) => string;
  /** The message for unparseable text. Default is the length wording. */
  invalid?: string;
}

export const DimensionField = forwardRef<HTMLInputElement, Props>(function DimensionField({
  label, value, onCommit, allowNegative = false, min, max, precision = 16,
  commitUnchanged = false, onErrorChange, parse, format, invalid,
}: Props, forwardedRef) {
  // parse/format generalise this field to non-length values (AngleField);
  // every rule here — the dirty guard, Enter/Escape, refusal never clamps — is
  // shared, never copied (invariant 5).
  const fmt = format ?? ((v: number) => formatLength(v, precision));
  const id = useId();
  // The one formatter for `value`, so every resync path — initial state, the
  // adopt effect, the untouched-blur resync, Escape — handles mixed alike.
  const display = (v: number | null) => (v === null ? '' : fmt(v));
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

  // ONE reporter for every path that sets or clears `error` — commit, the
  // adopt effect, the untouched blur, Escape, and a remount — rather than a
  // call beside each, which a new path would forget. Keyed on `error` alone:
  // a caller's inline callback is a new function every render.
  useEffect(() => {
    onErrorChange?.(error !== null);
  }, [error]);

  // Parses/validates/normalises the text unconditionally. Callers decide
  // whether a commit should happen at all (see the `dirty` guard on blur).
  // False when the entry was refused.
  const commit = (): boolean => {
    const parsed = (parse ?? parseLength)(text);
    if (parsed === null) {
      setError(invalid ?? 'Enter a measurement, e.g. 3/4 or 1-1/2');
      return false;
    }
    if (min !== undefined) {
      if (parsed < min) {
        setError(`Must be at least ${fmt(min)}`);
        return false;
      }
    } else if (!allowNegative && parsed <= 0) {
      setError('Must be greater than zero');
      return false;
    }
    if (max !== undefined && parsed > max) {
      setError(`Must be at most ${fmt(max)}`);
      return false;
    }
    // Nothing actually changed (e.g. re-entering the same value, or the
    // display-rounded text still parses back to the stored value) — skip
    // the no-op onCommit/history entry.
    // `commitUnchanged` opts out: the caller's value is a default, and the
    // person typing it is a choice to record.
    if (!(parsed === value && !commitUnchanged)) {
      // The caller refused (R7): nothing was stored, so nothing is normalised
      // or marked settled, and the refusal is this field's own error — the
      // same path as the min/max refusals above.
      const refused = onCommit(parsed);
      if (typeof refused === 'string') {
        setError(refused);
        return false;
      }
    }
    setError(null);
    setText(fmt(parsed));
    dirty.current = false;
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
