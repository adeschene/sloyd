import { useEffect, useRef } from 'react';
import { useStore } from '../store/store';
import { MATERIALS } from '../document/document';
import { DimensionField } from './DimensionField';
import type { Rotation } from '../document/document';

export function Properties() {
  const board = useStore((s) => s.doc.boards.find((b) => b.id === s.selectedId));
  const precision = useStore((s) => s.doc.units.precision);
  const updateBoard = useStore((s) => s.updateBoard);
  const deleteBoard = useStore((s) => s.deleteBoard);
  const duplicateBoard = useStore((s) => s.duplicateBoard);
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

  return (
    <div className="properties" key={board.id}>
      <input
        className="input name"
        aria-label="Part name"
        value={board.name}
        onFocus={() => useStore.getState().beginGesture()}
        onBlur={() => useStore.getState().endGesture()}
        onChange={(e) => updateBoard(board.id, { name: e.target.value })}
      />

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
      <div className="field">
        <label htmlFor="rot">Rotation</label>
        <select id="rot" className="input" value={board.rotation}
          onChange={(e) => updateBoard(board.id, { rotation: Number(e.target.value) as Rotation })}>
          {[0, 90, 180, 270].map((r) => <option key={r} value={r}>{r}°</option>)}
        </select>
      </div>
      <label className="checkbox">
        <input type="checkbox" checked={board.standing}
          onChange={(e) => updateBoard(board.id, { standing: e.target.checked })} />
        Standing (on edge)
      </label>

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

      <div className="row">
        <button onClick={() => duplicateBoard(board.id)}>Duplicate</button>
        <button className="danger" onClick={() => deleteBoard(board.id)}>Delete</button>
      </div>
    </div>
  );
}
