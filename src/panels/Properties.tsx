import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { MATERIALS, uniqueName, isSheetGood, cutLabel, positionAxisOf } from '../document/document';
import { DimensionField } from './DimensionField';
import { NameField } from './NameField';
import { formatLength } from '../units/length';
import type { Rotation, Posture, Grain, Board, Cut, Dimension } from '../document/document';

const DIMENSION_LABEL: Record<Dimension, string> = {
  length: 'Length',
  width: 'Width',
  thickness: 'Thickness',
};

/**
 * One cut's controls. A component of its own — rather than an inline `.map`
 * body in `Properties` — so its "would remove the whole board" error lives in
 * state keyed to the cut's own lifetime via `key={cut.id}`: it is cleared by
 * unmount whenever the cut is removed or the board changes (Properties
 * remounts via `key={board.id}`), so a stale error can never resurface on a
 * different cut, or on this one after a selection round-trip.
 */
function CutRow({ board, cut, precision }: { board: Board; cut: Cut; precision: number }) {
  const updateCut = useStore((s) => s.updateCut);
  const removeCut = useStore((s) => s.removeCut);
  const [error, setError] = useState<string | null>(null);
  // Bumped whenever a patch is refused. The three DimensionFields below are
  // keyed on it, so a refusal remounts them: each field's own `commit()` has
  // already optimistically set its local text to the (rejected) typed value
  // before `set()` below ever sees the patch, and nothing in DimensionField
  // itself would otherwise resync that text — its adopt-external-change
  // effect only fires when the STORED value changes, and a refused patch, by
  // definition, never reaches the store. Remounting re-initialises each
  // field's local state straight from the still-true stored `cut`, which is
  // this row's analogue of invariant 5's blur resync.
  const [attempt, setAttempt] = useState(0);

  const pos = positionAxisOf(cut.face, cut.across);
  const posDim = board[pos];
  const faceDim = board[cut.face];

  // Computed from the POST-patch cut, not the loader's clamped values —
  // nothing here has been clamped, so a cut can reach an out-of-range state
  // in-session (e.g. shrinking `face` after adding the cut). `>=`/`<=`
  // therefore refuses everything the loader's `===` would later drop, not
  // just the exact edge it checks.
  const wouldRemoveAll = (patch: Partial<Cut>) => {
    const next = { ...cut, ...patch };
    const p = positionAxisOf(next.face, next.across);
    return next.depth >= board[next.face] &&
           next.offset <= 0 &&
           next.width >= board[p];
  };

  // The error is cleared eagerly on any accepted patch (below), but that only
  // covers changes that go through THIS row's own `set()`. An undo, or a
  // board dimension growing via the Dimensions section above, changes `cut`
  // or `board` without ever calling `set()` here — with no invalidation path
  // of its own, a stale error would otherwise outlive the condition it
  // describes indefinitely, survivable only by unmounting (removing the cut,
  // or switching boards and back). Keyed on exactly what `wouldRemoveAll`
  // reads, so it re-checks whenever any of that changes.
  useEffect(() => {
    if (error && !wouldRemoveAll({})) setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cut.face, cut.across, cut.offset, cut.width, cut.depth, board.length, board.width, board.thickness]);

  const set = (patch: Partial<Cut>) => {
    if (wouldRemoveAll(patch)) {
      setError('That would remove the whole board.');
      setAttempt((n) => n + 1);
      return;
    }
    setError(null);
    updateCut(board.id, cut.id, patch);
  };

  /**
   * Adjust offset/width/depth for a new face/across pair, changing only what
   * the new axis actually makes illegal. A prior version of this function
   * recomputed all three unconditionally from addCut's formula, which fixed
   * the unsatisfiable-field bug (below) but introduced a worse one: it threw
   * away perfectly legal numbers on every face/across change, even when
   * nothing about them was actually wrong — silently overwriting what the
   * user typed, which is precisely what refusing-rather-than-clamping and
   * DimensionField's `dirty` guard both exist to avoid elsewhere in this
   * panel.
   *
   * So: clamp only when a value is no longer legal, and prefer a clamp over
   * a reset — a clamped number is closer to the user's intent than a
   * recomputed default. Clamp order mirrors validateCuts' documented order
   * (offset into [0, newPosDim] first, then width into [0, newPosDim -
   * offset]): clamping width first would let an already-out-of-range offset
   * eat into it twice.
   *
   * The one case that is NOT a clamp: if offset was clamped all the way to
   * newPosDim (the old offset was at or past the new axis's full length),
   * there is zero room left for ANY positive width — clamping alone cannot
   * produce a legal cut here, only a fresh position can. That is exactly
   * the unsatisfiable-field bug this function was first written to fix
   * (switching `face` from `thickness` to `length` on the default cut moves
   * the position axis from 24" down to 0.75", and the old offset of 6" has
   * nowhere left to go). Falling back to addCut's own quarter-of-the-axis
   * formula there is deliberate and narrow, not the general rule.
   */
  const repositionForAxes = (face: Dimension, across: Dimension): Partial<Cut> => {
    const newPosDim = board[positionAxisOf(face, across)];
    const newFaceDim = board[face];

    let offset = Math.min(cut.offset, newPosDim);
    let width = Math.min(cut.width, newPosDim - offset);
    if (width <= 0) {
      offset = newPosDim / 4;
      width = Math.min(0.75, newPosDim / 4);
    }
    const depth = Math.min(cut.depth, newFaceDim);

    return { face, across, offset, width, depth };
  };

  // Changing `face` to whatever `across` currently holds would leave
  // `across` naming the same dimension twice, so it moves in the same
  // edit — the select is never rendered holding a value it has no option
  // for (the rule follow-up 46 arrived at for grain on sheet goods).
  const setFace = (face: Dimension) => {
    const across = face === cut.across ? positionAxisOf(face, cut.face) : cut.across;
    set(repositionForAxes(face, across));
  };

  return (
    <div className="cut">
      <div className="row cut-head">
        <span className="cut-label">{cutLabel(board, cut)}</span>
        <button
          aria-label={`Remove cut (${cutLabel(board, cut)}, offset ${formatLength(cut.offset, precision)})`}
          onClick={() => removeCut(board.id, cut.id)}
        >
          Remove
        </button>
      </div>

      <div className="field">
        <label htmlFor={`face-${cut.id}`}>Cut into</label>
        <select id={`face-${cut.id}`} className="input" value={cut.face}
          onChange={(e) => setFace(e.target.value as Dimension)}>
          <option value="thickness">Face</option>
          <option value="width">Edge</option>
          <option value="length">End</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor={`from-${cut.id}`}>From</label>
        <select id={`from-${cut.id}`} className="input" value={cut.from}
          onChange={(e) => set({ from: e.target.value as Cut['from'] })}>
          <option value="min">Near side</option>
          <option value="max">Far side</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor={`across-${cut.id}`}>Runs across</label>
        <select id={`across-${cut.id}`} className="input" value={cut.across}
          onChange={(e) => set(repositionForAxes(cut.face, e.target.value as Dimension))}>
          {(['length', 'width', 'thickness'] as Dimension[])
            .filter((d) => d !== cut.face)
            .map((d) => (
              <option key={d} value={d}>{DIMENSION_LABEL[d]}</option>
            ))}
        </select>
      </div>

      <DimensionField key={`offset-${attempt}`} label="From the end" precision={precision} value={cut.offset}
        min={0} max={posDim} onCommit={(v) => set({ offset: v })} />
      <DimensionField key={`width-${attempt}`} label="Cut width" precision={precision} value={cut.width}
        max={Math.max(0, posDim - cut.offset)} onCommit={(v) => set({ width: v })} />
      <DimensionField key={`depth-${attempt}`} label="Depth" precision={precision} value={cut.depth}
        max={faceDim} onCommit={(v) => set({ depth: v })} />

      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}

export function Properties() {
  const board = useStore((s) => s.doc.boards.find((b) => b.id === s.selectedId));
  const precision = useStore((s) => s.doc.units.precision);
  const updateBoard = useStore((s) => s.updateBoard);
  const deleteBoard = useStore((s) => s.deleteBoard);
  const duplicateBoard = useStore((s) => s.duplicateBoard);
  const addCut = useStore((s) => s.addCut);
  const lengthRef = useRef<HTMLInputElement>(null);

  // This component remounts (`key={board.id}` below) on every selection
  // change, including a plain click in the parts list or viewport. Only
  // honor a focus request that addBoard() actually made — consuming it here
  // clears the flag so a later remount (e.g. selecting a different board)
  // does not steal focus again.
  useEffect(() => {
    if (board && useStore.getState().consumeLengthFocus()) {
      lengthRef.current?.focus();
    }
  }, [board?.id]);

  if (!board) return <p className="empty">Select a part to edit it.</p>;

  const setPos = (axis: 0 | 1 | 2) => (v: number) => {
    const position = [...board.position] as [number, number, number];
    position[axis] = v;
    updateBoard(board.id, { position });
  };

  /**
   * Store a renamed board, deduplicated against its siblings, and report the
   * name that was actually stored so the field can show it.
   *
   * The equality check is not an optimization: without it, a rename that
   * dedups straight back onto the current name (typing "Leg" on the board
   * already called "Leg (1)") would push an undo entry that changes nothing.
   * Read the boards imperatively so the check sees the live document.
   */
  const commitName = (typed: string) => {
    const name = uniqueName(typed, useStore.getState().doc.boards, board.id);
    if (name !== board.name) updateBoard(board.id, { name });
    return name;
  };

  return (
    <div className="properties" key={board.id}>
      <NameField value={board.name} onCommit={commitName} />

      <h3>Dimensions</h3>
      <DimensionField ref={lengthRef} label="Length" precision={precision} value={board.length}
        onCommit={(v) => updateBoard(board.id, { length: v })} />
      <DimensionField label="Width" precision={precision} value={board.width}
        onCommit={(v) => updateBoard(board.id, { width: v })} />
      <DimensionField label="Thickness" precision={precision} value={board.thickness}
        onCommit={(v) => updateBoard(board.id, { thickness: v })} />

      <h3>Position</h3>
      <DimensionField label="X" precision={precision} allowNegative value={board.position[0]} onCommit={setPos(0)} />
      <DimensionField label="Y" precision={precision} allowNegative value={board.position[1]} onCommit={setPos(1)} />
      <DimensionField label="Z" precision={precision} allowNegative value={board.position[2]} onCommit={setPos(2)} />

      <h3>Orientation</h3>
      {/* Posture names which of the board's dimensions points up, and that is
          the whole model: it picks the vertical dimension, Turn orders the other
          two. Upright is what v2 could not express — a leg, a post, a stile.
          "Turn" rather than "Rotation" because with three postures it is no
          longer the only thing that rotates the board. */}
      <div className="field">
        <label htmlFor="posture">Posture</label>
        <select id="posture" className="input" value={board.posture}
          onChange={(e) => updateBoard(board.id, { posture: e.target.value as Posture })}>
          <option value="flat">Flat</option>
          <option value="on-edge">On edge</option>
          <option value="upright">Upright</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="turn">Turn</label>
        <select id="turn" className="input" value={board.rotation}
          onChange={(e) => updateBoard(board.id, { rotation: Number(e.target.value) as Rotation })}>
          <option value={0}>0°</option>
          <option value={90}>90°</option>
        </select>
      </div>

      {/* Grain is a property of the part, not of the world: it names which of
          the board's own dimensions the fibres follow, so it turns with the
          board the way real stock does. Across the width is what makes two
          parts meeting at a right angle share one grain direction; through the
          thickness is an end-grain board. */}
      <h3>Grain</h3>
      <div className="field field-wide">
        <label htmlFor="grain">Runs</label>
        <select id="grain" className="input" value={board.grain}
          onChange={(e) => updateBoard(board.id, { grain: e.target.value as Grain })}>
          <option value="length">Along length</option>
          <option value="width">Across width</option>
          {!isSheetGood(board.material) && <option value="thickness">Through thickness</option>}
        </select>
      </div>

      {/* The heading names this control via aria-labelledby (an aria-label
          alone would not be programmatically associated with the <h3>). */}
      <h3 id="material-heading">Material</h3>
      <div className="field field-wide">
        <select aria-labelledby="material-heading" className="input" value={board.material}
          onChange={(e) => updateBoard(board.id, { material: e.target.value })}>
          {Object.entries(MATERIALS).map(([key, m]) => (
            <option key={key} value={key}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* Joinery. One primitive — a rectangular through-cut — so a dado and a
          rabbet are the same control with different numbers, and the label
          is derived from the geometry rather than chosen by the user. */}
      <h3>Cuts</h3>
      {board.cuts.map((cut) => (
        <CutRow key={cut.id} board={board} cut={cut} precision={precision} />
      ))}
      <button onClick={() => addCut(board.id)}>Add cut</button>

      <div className="row">
        <button onClick={() => duplicateBoard(board.id)}>Duplicate</button>
        <button className="danger" onClick={() => deleteBoard(board.id)}>Delete</button>
      </div>
    </div>
  );
}
