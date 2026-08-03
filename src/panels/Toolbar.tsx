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
  /**
   * True when tape-measure guide points are drawn. A third flag beside
   * showGrid and showAxes, and view state for the same reason — guides are
   * scaffolding, and wanting them on is a property of what you are doing right
   * now, not of the project.
   */
  showGuides: boolean;
  onToggleGuides: () => void;
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
  showGuides,
  onToggleGuides,
  onOpenCutList,
}: Props) {
  const name = useStore((s) => s.doc.name);
  const setDocumentName = useStore((s) => s.setDocumentName);
  const addBoard = useStore((s) => s.addBoard);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const selectedId = useStore((s) => s.selectedId);

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
          onClick={() => setTool('select')}
          aria-pressed={tool === 'select'}
          title="Select tool — click a part to select it, drag its gizmo to move it (Esc)"
        >
          Select
        </button>
        <button
          onClick={() => setTool('move')}
          aria-pressed={tool === 'move'}
          title="Move tool — click a corner or midpoint, then click one on another part to snap them together (M)"
        >
          Move
        </button>
        {tool === 'move' && !selectedId && (
          // The Move tool grabs points on the selected board only, so with
          // nothing selected no marker ever appears and the tool reads as
          // broken rather than as waiting. The button stays enabled: disabling
          // it would take a control away to explain a state, and would need
          // its own rule for a board deleted while the tool is active — which
          // this needs none for, since deleteBoard already clears both.
          <span className="toolbar-hint">Select a part to move</span>
        )}
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
        <label className="checkbox toolbar-checkbox">
          <input type="checkbox" checked={showGuides} onChange={onToggleGuides} />
          Guides
        </label>
      </div>

      {/* Right group: the document's state on disk. */}
      <div className="toolbar-group toolbar-right">{children}</div>
    </header>
  );
}
