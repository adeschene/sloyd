import { useEffect, useRef, useState } from 'react';

interface Props {
  /** The stored name. Also what an emptied or Escape-cancelled edit reverts to. */
  value: string;
  /**
   * Commit a non-empty, trimmed name. Returns the name actually stored,
   * which may differ from what was typed because names are deduplicated.
   */
  onCommit: (name: string) => string;
}

/**
 * The part-name input. Holds a local draft and commits once — on blur or
 * Enter — never per keystroke.
 *
 * That single-commit shape is what makes "an emptied name reverts" possible.
 * Writing per keystroke and correcting on blur would have taken the gesture's
 * undo snapshot before the correction landed, leaving an entry that undoes to
 * nothing. Committing once means an empty field never touches the document at
 * all: no write, no snapshot, no dead undo entry.
 *
 * onCommit returns the stored name rather than void because dedup can store
 * something other than what was typed ("Leg" -> "Leg (1)"), and the field has
 * to end up showing what was stored. Deriving that from the `value` prop
 * instead would miss the case where dedup maps the typed name back onto this
 * board's current name — `value` never changes, so no re-render arrives.
 */
export function NameField({ value, onCommit }: Props) {
  const [text, setText] = useState(value);
  const editing = useRef(false);
  const reverting = useRef(false);

  // Adopt external changes (undo, an import, a rename from elsewhere) unless
  // the user is mid-edit and would have their typing yanked out from under
  // them.
  useEffect(() => {
    if (!editing.current) setText(value);
  }, [value]);

  const commit = () => {
    const trimmed = text.trim();
    // Emptied: revert. Nothing is ever stored blank, and no board is
    // silently renamed on the user's behalf.
    if (!trimmed) {
      setText(value);
      return;
    }
    setText(onCommit(trimmed));
  };

  return (
    <input
      className="input name"
      aria-label="Part name"
      value={text}
      onFocus={() => { editing.current = true; }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        // Cleared before commit() so the adopt-external-changes effect above
        // is live when the store update lands — same ordering as
        // DimensionField.
        editing.current = false;
        // A blur triggered by the Escape handler must not commit the text
        // Escape just discarded.
        if (reverting.current) { reverting.current = false; return; }
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { commit(); return; }
        if (e.key === 'Escape') {
          reverting.current = true;
          editing.current = false;
          setText(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
