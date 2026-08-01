import type { ReactNode } from 'react';
import { useStore } from '../store/store';

interface Props {
  children?: ReactNode;
  /** True when the viewport is drawing through an orthographic camera. */
  orthographic: boolean;
  onToggleProjection: () => void;
  /** True when the ground grid is drawn. */
  showGrid: boolean;
  onToggleGrid: () => void;
  /**
   * True when the origin axis lines are drawn. Separate from `showGrid` on
   * purpose: the axes answer "where is the origin" and the grid answers "how
   * big is this", and wanting one on rarely means wanting the other on.
   */
  showAxes: boolean;
  onToggleAxes: () => void;
  /** Opens the cut list sheet. */
  onOpenCutList: () => void;
}

export function Toolbar({
  children,
  orthographic,
  onToggleProjection,
  showGrid,
  onToggleGrid,
  showAxes,
  onToggleAxes,
  onOpenCutList,
}: Props) {
  const name = useStore((s) => s.doc.name);
  const setDocumentName = useStore((s) => s.setDocumentName);
  const addBoard = useStore((s) => s.addBoard);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);

  return (
    <header className="toolbar">
      {/* Left group: the document and the things that change it. */}
      <div className="toolbar-group">
        <span className="brand">Sloyd</span>
        <input
          className="input doc-name"
          aria-label="Project name"
          value={name}
          onFocus={() => useStore.getState().beginGesture()}
          onBlur={() => useStore.getState().endGesture()}
          onChange={(e) => setDocumentName(e.target.value)}
        />
        <button className="btn-primary" onClick={addBoard}>+ Add board</button>
        <button onClick={onOpenCutList} title="Cut list — parts, quantities and joinery">
          Cut list
        </button>
        <span className="toolbar-divider" />
        <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">↶</button>
        <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">↷</button>
        <span className="toolbar-divider" />
        <button
          onClick={onToggleProjection}
          aria-pressed={orthographic}
          title="Orthographic view — parallel projection, for checking alignment"
        >
          Orthographic
        </button>
        <label className="checkbox toolbar-checkbox">
          <input type="checkbox" checked={showGrid} onChange={onToggleGrid} />
          Grid
        </label>
        <label className="checkbox toolbar-checkbox">
          <input type="checkbox" checked={showAxes} onChange={onToggleAxes} />
          Origin
        </label>
      </div>

      {/* Right group: the document's state on disk. */}
      <div className="toolbar-group toolbar-right">{children}</div>
    </header>
  );
}
