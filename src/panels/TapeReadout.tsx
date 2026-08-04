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
  const [text, setText] = useState('');
  const [error, setError] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // A fresh anchor starts a fresh measurement.
  useEffect(() => {
    setText('');
    setError(false);
  }, [anchor]);

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
      <span className="tape-readout-label">
        {measured === null ? '—' : formatLength(measured, precision)}
      </span>
      <input
        ref={input}
        className={error ? 'input tape-readout-input invalid' : 'input tape-readout-input'}
        aria-label="Guide distance from anchor"
        placeholder="distance"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError(false);
        }}
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
  );
}
