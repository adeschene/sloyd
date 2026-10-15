import { useMemo, useState } from 'react';
import { sectionSpan, worldParts, type SectionAxis } from '../document/document';
import { explodeOffsets, EXPLODE_SPREAD } from '../document/explode';
import { visibleBoards } from '../store/visibility';
import { DimensionField } from './DimensionField';
import { useStore } from '../store/store';
import type { StandardView } from '../viewport/framing';

const SECTION_AXES: readonly { axis: SectionAxis; text: string; title: string }[] = [
  { axis: 'front', text: 'Front', title: 'Cut across the depth, seen from the front' },
  { axis: 'side', text: 'Side', title: 'Cut across the width, seen from the side' },
  { axis: 'top', text: 'Top', title: 'Cut across the height, seen from above' },
];

/**
 * True when any part is drawn. A store selector returning a BOOLEAN: invariant 43's selector rule is about
 * `visibleBoards`' new array re-rendering on every `set()`, which a boolean cannot do. The walk is cached on the
 * (doc, hiddenIds) pair, so a `set()` that changes neither costs one comparison.
 */
let shownCache: { doc: unknown; hiddenIds: unknown; value: boolean } | null = null;
function anyPartShown(s: { doc: Parameters<typeof worldParts>[0]; hiddenIds: readonly string[] }): boolean {
  if (shownCache && shownCache.doc === s.doc && shownCache.hiddenIds === s.hiddenIds) return shownCache.value;
  const value = visibleBoards(worldParts(s.doc), s.hiddenIds).length > 0;
  shownCache = { doc: s.doc, hiddenIds: s.hiddenIds, value };
  return value;
}

/** The one wording for "this is locked because the view is exploded" (plans-sheet spec §4.2). */
export const EXPLODED_TITLE = 'Slide Explode back to 0 to edit';

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
  /** Look at the piece from a standard view (standard-views spec §2). An action, not a mode: no button shows pressed. */
  onView: (view: StandardView) => void;
  /** Save a clean PNG of the view (spec §3). Rejects when nothing could be saved. */
  onSaveImage: () => Promise<void>;
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
  showAxes, onToggleAxes, showGuides, onToggleGuides, onView, onSaveImage,
}: Props) {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const explode = useStore((s) => s.explode);
  const setExplode = useStore((s) => s.setExplode);
  const hasSelection = useStore((s) => s.selectedIds.length > 0);
  const section = useStore((s) => s.section);
  const setSection = useStore((s) => s.setSection);
  // Off, the controls need only "is any part drawn" (a boolean, so a gizmo drag's per-frame `doc` does not re-render
  // them); on, the spans, so `doc` and `hiddenIds` are subscribed only while a section is on.
  const anyShown = useStore(anyPartShown);
  const docOn = useStore((s) => (s.section ? s.doc : null));
  const hiddenOn = useStore((s) => (s.section ? s.hiddenIds : null));
  const shown = useMemo(
    () => (docOn && hiddenOn ? visibleBoards(worldParts(docOn), hiddenOn) : null),
    [docOn, hiddenOn],
  );
  const offsets = useMemo(
    () => (docOn && explode > 0 ? explodeOffsets(docOn, explode * EXPLODE_SPREAD) : null),
    [docOn, explode],
  );
  const spanOf = (axis: SectionAxis) => (shown ? sectionSpan(shown, offsets, axis) : null);
  const centre = (axis: SectionAxis) => { const sp = spanOf(axis); return sp ? (sp[0] + sp[1]) / 2 : null; };
  const toggleSection = () => {
    if (section) { setSection(null); return; }
    // Off, nothing is subscribed: read the store once, in the handler.
    const s = useStore.getState();
    const offs = s.explode > 0 ? explodeOffsets(s.doc, s.explode * EXPLODE_SPREAD) : null;
    const sp = sectionSpan(visibleBoards(worldParts(s.doc), s.hiddenIds), offs, 'front');
    if (sp) setSection({ axis: 'front', at: (sp[0] + sp[1]) / 2, flip: false });
  };
  const span = section ? spanOf(section.axis) : null;
  // Disabled while saving, so a double click saves one file (spec §3.2).
  const [saving, setSaving] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const saveImage = () => {
    setImageError(null);
    setSaving(true);
    onSaveImage()
      .catch(() => setImageError('Could not save the image.'))
      .finally(() => setSaving(false));
  };

  return (
    <>
      <div className="viewport-controls viewport-controls-tools" role="group" aria-label="Tools">
        <div className="segmented">
          <button onClick={() => setTool('select')} aria-pressed={tool === 'select'}
            title="Select tool — click a part to select it, drag its gizmo to move it (Esc)">Select</button>
          <button onClick={() => setTool('move')} aria-pressed={tool === 'move'} disabled={explode > 0}
            title={explode > 0 ? EXPLODED_TITLE : "Move tool — click a corner or midpoint, then click one on another part to snap them together (M)"}>Move</button>
          <button onClick={() => setTool('tape')} aria-pressed={tool === 'tape'} disabled={explode > 0}
            title={explode > 0 ? EXPLODED_TITLE : "Tape measure — click a point, then click another to measure and place a guide point; type a distance to place it partway (T)"}>Tape</button>
        </div>
      </div>

      <div className="viewport-controls-right">
      <div className="viewport-controls viewport-controls-view" role="group" aria-label="View">
        <div className="segmented">
          <button aria-pressed={!orthographic} onClick={() => { if (orthographic) onToggleProjection(); }}
            title="Perspective view">Perspective</button>
          <button aria-pressed={orthographic} onClick={() => { if (!orthographic) onToggleProjection(); }}
            title="Orthographic view — parallel projection, for checking alignment">Orthographic</button>
        </div>
        <div className="segmented" role="group" aria-label="Standard views">
          <button onClick={() => onView('front')} title="Look at the front of the piece">Front</button>
          <button onClick={() => onView('side')} title="Look at the right side of the piece">Side</button>
          <button onClick={() => onView('top')} title="Look down on the piece from above">Top</button>
          <button onClick={() => onView('iso')} title="Look from the front-right corner, above">Iso</button>
        </div>
        <div className="segmented">
          <button aria-pressed={showGrid} onClick={onToggleGrid} title="Show the ground grid">Grid</button>
          <button aria-pressed={showAxes} onClick={onToggleAxes} title="Show the origin axes">Origin</button>
          <button aria-pressed={showGuides} onClick={onToggleGuides} title="Show tape-measure guide points">Guides</button>
        </div>
        <button aria-pressed={section !== null} onClick={toggleSection}
          disabled={section === null && !anyShown}
          title="Cut the model with a plane to see inside joints and holes">Section</button>
        <div className="viewport-explode">
          <label
            title="Explode the parts apart to see how they go together; editing pauses until it is back at 0">
            Explode
            <input type="range" min={0} max={1} step={0.05} value={explode}
              onChange={(e) => setExplode(Number(e.target.value))} />
          </label>
          <span className="viewport-explode-value">{Math.round(explode * 100)}%</span>
        </div>
        <button onClick={saveImage} disabled={saving}
          title="Save a PNG of the view, without the selection or tool markers">Save image</button>
        {imageError && <span role="alert" className="field-error">{imageError}</span>}
      </div>

      {section && (
        <div className="viewport-controls viewport-controls-section" role="group" aria-label="Section">
          <div className="segmented" role="group" aria-label="Section axis">
            {SECTION_AXES.map(({ axis, text, title }) => (
              <button key={axis} aria-label={`Section ${axis}`} aria-pressed={section.axis === axis} title={title}
                onClick={() => {
                  if (axis === section.axis) return;
                  const at = centre(axis);
                  // Defence in depth: the store also refuses a non-finite `at`.
                  if (at !== null) setSection({ ...section, axis, at });
                }}>{text}</button>
            ))}
          </div>
          <input type="range" aria-label="Section position" step="any"
            min={span ? span[0] : section.at} max={span ? span[1] : section.at} value={section.at}
            onChange={(e) => setSection({ ...section, at: Number(e.target.value) })} />
          <DimensionField label="Position" value={section.at} allowNegative
            min={span?.[0]} max={span?.[1]} onCommit={(at) => setSection({ ...section, at })} />
          <button aria-pressed={section.flip} onClick={() => setSection({ ...section, flip: !section.flip })}
            title="Keep the other side of the cut">Flip</button>
        </div>
      )}
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
