import { useEffect, useRef, useState } from 'react';
import { parseLength, formatLength } from '../units/length';
import { offsetPoint } from '../document/document';
import { useStore } from '../store/store';

/**
 * The tape's live distance and typed-length entry — SketchUp's VCB.
 *
 * A plain DOM element over the canvas rather than 3D text: no billboarding, no
 * drei Html, and the input is a real <input>, so parseLength and the app's
 * fractional-inch entry work unchanged. Always in one place, so the eye knows
 * where to find it.
 *
 * Renders nothing unless the Tape tool is anchored — before the first click
 * there is no distance to report.
 */
export function TapeReadout() {
  const tool = useStore((s) => s.tool);
  const anchor = useStore((s) => s.tapeAnchor);
  const hovered = useStore((s) => s.tapeHover);
  const precision = useStore((s) => s.doc.units.precision);
  // The text lives in the STORE, not in a useState here, for the same reason
  // `tapeHover` does: this box is a DOM overlay outside the Canvas, and two
  // things on the other side of that boundary need the value — App's keydown
  // effect seeds the first character into it, and TapeTool parses it to derive
  // the preview marker. See `tapeTyped`'s declaration in store.ts for why it is
  // NOT invariant 24's fourth instance despite sitting beside three fields that
  // are.
  const text = useStore((s) => s.tapeTyped);
  const setText = useStore((s) => s.setTapeTyped);
  const [error, setError] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // A fresh anchor starts a fresh measurement.
  useEffect(() => {
    setText('');
    setError(false);
  }, [anchor, setText]);

  /**
   * A new character clears the error state.
   *
   * This CANNOT be left in `onChange` any more, and that is a real defect
   * rather than tidying: the type-anywhere path writes the store directly, so
   * `onChange` never fires for the first character. Without this effect,
   * failing a commit (Enter with no target, or an unparseable number) and then
   * going back to the canvas and typing a fresh digit would leave the box
   * rendering `invalid` over a value that has not been judged yet.
   *
   * Keyed on the text, which is exactly why it does not defeat the error it is
   * clearing: `commit()` sets `error` WITHOUT touching `tapeTyped`, so this
   * does not re-run and the red survives until the next character arrives —
   * which is the moment it should die.
   */
  useEffect(() => {
    setError(false);
  }, [text]);

  /**
   * Take focus once there is something in the box.
   *
   * The type-anywhere capture in App seeds `tapeTyped` and stops there; this is
   * the other half. Written HERE rather than by handing App a ref to this
   * input, so neither module has to know the other exists — App writes a store
   * field, this component reacts to it, and a second future writer (a paste
   * handler, a toolbar button) gets the focus behaviour for free.
   *
   * The activeElement test is what keeps it from fighting the user: once the
   * input has focus, every later keystroke arrives through onChange and would
   * otherwise re-focus (and re-place the caret) on every character typed.
   */
  useEffect(() => {
    const el = input.current;
    if (!text || !el || document.activeElement === el) return;
    el.focus();
    // Caret at the end, not at the start: focus() on a programmatically filled
    // input leaves the caret placement to the browser, and the user is
    // mid-number — the next character belongs after the one that got them here.
    el.setSelectionRange(el.value.length, el.value.length);
  }, [text]);

  if (tool !== 'tape' || !anchor) return null;

  const measured = hovered
    ? Math.hypot(
        hovered.at[0] - anchor.at[0],
        hovered.at[1] - anchor.at[1],
        hovered.at[2] - anchor.at[2],
      )
    : null;

  const commit = () => {
    const store = useStore.getState();
    const from = store.tapeAnchor;
    // The anchor can be cleared out from under a focused input by any of the
    // actions enumerated at `tapeHover`'s declaration in store.ts (invariant
    // 24's third instance). Read it rather than asserting it.
    if (!from) return;
    // TapeTool latches its hover while anchored, which is what makes this
    // non-null after the pointer left the canvas to reach this input. Without
    // that latch this branch would fire on every typed offset — see
    // TapeTool's onPointerLeave.
    const target = store.tapeHover;
    // No direction without a target, and offsetPoint refuses a zero-length
    // one — §1.2. Both leave the anchor in place so the user can move the
    // cursor and try again.
    if (!target) {
      setError(true);
      return;
    }
    const distance = parseLength(text);
    if (distance === null) {
      setError(true);
      return;
    }
    const at = offsetPoint(from.at, target.at, distance);
    if (!at) {
      setError(true);
      return;
    }
    store.addGuide(at);
    store.clearTapeAnchor();
  };

  return (
    <div className="tape-readout">
      <div className="tape-readout-row">
        <span className="tape-readout-label">
          {measured === null ? '—' : formatLength(measured, precision)}
        </span>
        <input
          ref={input}
          className={error ? 'input tape-readout-input invalid' : 'input tape-readout-input'}
          aria-label="Guide distance from anchor"
          placeholder="distance"
          value={text}
          // No setError(false) here — that moved into an effect keyed on the
          // text, because the type-anywhere path writes the store without ever
          // firing onChange. See the effect for the ordering that makes it
          // clear the error at the right moment rather than immediately.
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
              return;
            }
            // Escape needs its own handler HERE, because App's window listener
            // early-returns on isTextEntry — which this input is. Without it,
            // Escape would do nothing at all while focus is in the box, and the
            // box is where the user has to be to type a distance. It backs out
            // one level in the same SHAPE as App's ladder rather than the same
            // steps: App's is grab-then-tool, this one drops the anchor and
            // blurs, so a second Escape now reaches the window listener and
            // leaves the tool.
            if (e.key === 'Escape') {
              e.preventDefault();
              useStore.getState().clearTapeAnchor();
              input.current?.blur();
            }
          }}
        />
      </div>
      {/*
        The box has to say what it is for. Everything else about the typed path
        was discoverable only by reading the code: the input appears in a corner
        the pointer has no reason to visit, is not autofocused, and carried one
        placeholder word. Type-anywhere capture removes the journey; this line
        is what tells anyone that the journey is unnecessary — and that the
        number is a distance rather than, say, a coordinate.

        Quiet by construction, in the app's existing hint idiom (Toolbar's
        `.toolbar-hint`, --ink-dim): it is read once and then permanently in the
        way, so it must not compete with the measured distance beside it.
      */}
      <span className="tape-readout-hint">Type a distance, Enter to place</span>
    </div>
  );
}
