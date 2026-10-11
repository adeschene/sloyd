import { useStore } from '../store/store';

interface Props {
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
}

/**
 * The controls that act on the VIEW, floating over it (ui-polish spec §3.2):
 * tools top-left, projection and visibility top-right, the Move hint
 * bottom-left. Rendered inside `.viewport-stack`, so `.app-shell`'s `inert`
 * covers them, and as siblings of the canvas, so a click on one never reaches
 * R3F (no deselect, no Move/Tape click). `role="group"`, not "toolbar": a toolbar
 * promises arrow-key roving focus, which these do not implement.
 */
export function ViewportControls({
  orthographic, onToggleProjection, showGrid, onToggleGrid,
  showAxes, onToggleAxes, showGuides, onToggleGuides,
}: Props) {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const hasSelection = useStore((s) => s.selectedIds.length > 0);

  return (
    <>
      <div className="viewport-controls viewport-controls-tools" role="group" aria-label="Tools">
        <div className="segmented">
          <button onClick={() => setTool('select')} aria-pressed={tool === 'select'}
            title="Select tool — click a part to select it, drag its gizmo to move it (Esc)">Select</button>
          <button onClick={() => setTool('move')} aria-pressed={tool === 'move'}
            title="Move tool — click a corner or midpoint, then click one on another part to snap them together (M)">Move</button>
          <button onClick={() => setTool('tape')} aria-pressed={tool === 'tape'}
            title="Tape measure — click a point, then click another to measure and place a guide point; type a distance to place it partway (T)">Tape</button>
        </div>
      </div>

      <div className="viewport-controls viewport-controls-view" role="group" aria-label="View">
        <div className="segmented">
          <button aria-pressed={!orthographic} onClick={() => { if (orthographic) onToggleProjection(); }}
            title="Perspective view">Perspective</button>
          <button aria-pressed={orthographic} onClick={() => { if (!orthographic) onToggleProjection(); }}
            title="Orthographic view — parallel projection, for checking alignment">Orthographic</button>
        </div>
        <div className="segmented">
          <button aria-pressed={showGrid} onClick={onToggleGrid} title="Show the ground grid">Grid</button>
          <button aria-pressed={showAxes} onClick={onToggleAxes} title="Show the origin axes">Origin</button>
          <button aria-pressed={showGuides} onClick={onToggleGuides} title="Show tape-measure guide points">Guides</button>
        </div>
      </div>

      {tool === 'move' && !hasSelection && (
        // The Move tool grabs points on the selected board only, so with
        // nothing selected no marker ever appears and the tool reads as
        // broken rather than as waiting. The button stays enabled: disabling
        // it would take a control away to explain a state, and would need
        // its own rule for a board deleted while the tool is active — which
        // this needs none for, since deleteBoard already clears both.
        <p className="viewport-hint">Select a part to move</p>
      )}
    </>
  );
}
