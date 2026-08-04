import { useEffect, useRef, useState } from 'react';
import { parseLength, formatLength } from '../units/length';
import { offsetPoint, tapeAxisFromKey, towardFor } from '../document/document';
import { useStore } from '../store/store';

/**
 * WHY the refusal is a union rather than a boolean — follow-up 144, closed here
 * because this round is what makes it stop being cosmetic.
 *
 * With the axis lock, "there is no target" stops being a refusal at all: in
 * axis mode `towardFor` always returns a direction, so `no-direction` is
 * unreachable by construction. `degenerate` is NOT unreachable under a lock —
 * it remains reachable in BOTH modes via `offsetPoint`'s `Number.isFinite`
 * guard, which also catches a non-finite typed distance (e.g. `parseLength`
 * returning `Infinity` for a long enough run of digits), not just a
 * zero-length direction. A boolean cannot say which of three questions
 * failed, and — worse — could not be CLEARED correctly: its one effect was
 * keyed on [text, hovered], so any new hover cured every error, including an
 * unparseable number that a hover has nothing to say about.
 */
type TapeError = 'no-direction' | 'unparseable' | 'degenerate' | null;

const ERROR_TEXT: Record<Exclude<TapeError, null>, string> = {
  'no-direction': 'Hover a point, or press X / Y / Z',
  unparseable: "Can't read that as a length",
  degenerate: 'No direction to place along',
};

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
  const axis = useStore((s) => s.tapeAxis);
  const [error, setError] = useState<TapeError>(null);
  const input = useRef<HTMLInputElement>(null);

  // A fresh anchor starts a fresh measurement.
  useEffect(() => {
    setText('');
    setError(null);
  }, [anchor, setText]);

  /**
   * A new character re-answers "can this be read as a length", and nothing else.
   *
   * Still an effect rather than an onChange handler, for the reason the round-2
   * comment gave: the type-anywhere path writes the store directly, so onChange
   * never fires for the first character. Still safe against defeating the error
   * it clears, for the same reason too — commit() sets the error WITHOUT
   * touching `tapeTyped` and is the only caller that sets one, so no single
   * event both raises an error and changes the text.
   */
  useEffect(() => {
    setError((e) => (e === 'unparseable' ? null : e));
  }, [text]);

  /**
   * A new hover OR a new axis re-answers "is there a direction".
   *
   * Both cures for the same question, which is why they share an effect. The
   * axis half is the one the boolean could not have: pressing X after a
   * no-direction refusal genuinely fixes it, and under the old rule the red
   * would have survived until Enter proved otherwise.
   *
   * And a hover no longer clears an UNPARSEABLE number, which the single
   * [text, hovered] effect did — harmless-looking on the ray path, and simply
   * wrong under a lock where a hover cures nothing at all.
   */
  useEffect(() => {
    setError((e) => (e === 'no-direction' || e === 'degenerate' ? null : e));
  }, [hovered, axis]);

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
    // The SAME function TapeTool's preview memo calls, which is what keeps the
    // marker and the placement agreeing under both modes rather than only under
    // the ray one — design §4.
    const toward = towardFor(from.at, store.tapeAxis, store.tapeHover?.at ?? null);
    if (!toward) {
      setError('no-direction');
      return;
    }
    const distance = parseLength(text);
    if (distance === null) {
      setError('unparseable');
      return;
    }
    const at = offsetPoint(from.at, toward, distance);
    if (!at) {
      setError('degenerate');
      return;
    }
    store.addGuide(at);
    store.clearTapeAnchor();
  };

  return (
    <div className="tape-readout">
      <div className="tape-readout-row">
        {axis && (
          // The confirmation that the lock landed. It is the ONLY one in axis
          // mode until a number is typed: with no target there is nothing for
          // the measuring line to draw against, and drawing a semi-infinite
          // axis line instead would be follow-up 130's construction line, which
          // this round explicitly does not build (design §4.1, §8).
          <span className="tape-readout-axis" data-testid="tape-readout-axis">
            {axis.toUpperCase()}
          </span>
        )}
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
            // X / Y / Z have to be handled HERE as well as in App's window
            // listener, and this is not redundancy — it is forced. App's effect
            // early-returns on isTextEntry, which this input is, so once the
            // first character lands its listener never sees another key. Escape
            // is in this handler for exactly the same reason.
            //
            // The modifier test keeps Ctrl+Z (and Cmd+X, Cmd+C, Cmd+V) alone.
            const axisKey = tapeAxisFromKey(e.key);
            if (axisKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
              e.preventDefault();
              useStore.getState().setTapeAxis(axisKey);
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
              const store = useStore.getState();
              // Same ladder as App's, one rung at a time: drop the axis if there
              // is one, otherwise drop the anchor and blur so a second Escape
              // reaches the window listener and leaves the tool.
              if (store.tapeAxis) {
                store.setTapeAxis(null);
                return;
              }
              store.clearTapeAnchor();
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
      {error ? (
        <span className="tape-readout-hint tape-readout-error" data-testid="tape-readout-error">
          {ERROR_TEXT[error]}
        </span>
      ) : (
        <span className="tape-readout-hint">
          {axis ? `Along ${axis.toUpperCase()} — Enter to place` : 'Type a distance, Enter to place'}
        </span>
      )}
    </div>
  );
}
