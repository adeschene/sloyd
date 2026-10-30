import { useEffect, useRef } from 'react';
import { useStore } from '../store/store';
import { isToggleModifier } from '../store/selectionGesture';
import { EyeIcon } from './EyeIcon';
import { isGuideLine, isGuideRay } from '../document/document';
import type { Guide } from '../document/document';
import { formatLength } from '../units/length';
import { DimensionField } from './DimensionField';
import type { Units } from '../units/length';

/**
 * The guides a project carries: select, hide, edit and remove them (fu 591).
 *
 * A row's text is a toggle button over the store's `selectedGuideIds` (Shift,
 * Ctrl or Cmd toggles, as in PartsList); the eye hides a guide, and a hidden
 * guide cannot be selected, so its select button is disabled. Editing a
 * coordinate or removing a row never changes the selection. A guide is still
 * removed by id (`removeGuide`), the way PartsList selects a board by id.
 *
 * The viewport is a second way to select one (`pickGuide`); this list is the
 * way that needs no aim, which matters because THREE.Line raycasting registers
 * a hit only within raycaster.params.Line.threshold of a drawn line (inv 21).
 */
/**
 * The row text and the remove label, built ONCE from one formatting of the
 * fixed coordinates so the two cannot disagree (inv 19's spirit). A line prints
 * its two fixed axes in X, Y, Z order; the along-axis coordinate is 0 by
 * construction and says nothing (construction-lines spec §2.2; row format §6).
 */
function describe(g: Guide, units: Units): { row: string; remove: string } {
  if (isGuideRay(g)) {
    // Both points, in X, Y, Z order each (construction-lines-2 spec §2.6).
    const pts = [g.at, g.to].map((p) => p.map((n) => formatLength(n, units)).join(', '));
    return { row: `Line through ${pts[0]} and ${pts[1]}`, remove: `Remove line through ${pts[0]} and ${pts[1]}` };
  }
  if (!isGuideLine(g)) {
    const at = g.at.map((n) => formatLength(n, units)).join(', ');
    return { row: at, remove: `Remove guide at ${at}` };
  }
  const axis = g.axis.toUpperCase();
  const fixed = (['x', 'y', 'z'] as const)
    .filter((a) => a !== g.axis)
    .map((a) => ({ a: a.toUpperCase(), v: formatLength(g.at[a === 'x' ? 0 : a === 'y' ? 1 : 2], units) }));
  return {
    row: `Line along ${axis}`,
    remove: `Remove line along ${axis} at ${fixed.map((f) => `${f.a} ${f.v}`).join(', ')}`,
  };
}

export function GuidesList() {
  const guides = useStore((s) => s.doc.guides);
  const units = useStore((s) => s.doc.units);
  const removeGuide = useStore((s) => s.removeGuide);
  const moveGuideLine = useStore((s) => s.moveGuideLine);
  const clearGuides = useStore((s) => s.clearGuides);
  const selectedGuideIds = useStore((s) => s.selectedGuideIds);
  const hiddenGuideIds = useStore((s) => s.hiddenGuideIds);
  const selectGuide = useStore((s) => s.selectGuide);
  const setGuideHidden = useStore((s) => s.setGuideHidden);

  // Keep the first selected row in view (a viewport pick may select one scrolled out of the list).
  const listRef = useRef<HTMLUListElement>(null);
  const firstSelected = selectedGuideIds[0];
  useEffect(() => {
    if (firstSelected === undefined) return;
    const li = Array.from(listRef.current?.children ?? []).find((el) => (el as HTMLElement).dataset.guideId === firstSelected);
    // jsdom has no scrollIntoView.
    if (li && typeof li.scrollIntoView === 'function') li.scrollIntoView({ block: 'nearest' });
  }, [firstSelected]);

  if (guides.length === 0) {
    return <p className="empty">No guides. Use the Tape tool to place a point or a line.</p>;
  }

  return (
    <>
      <ul className="guides" ref={listRef}>
        {guides.map((g) => {
          const text = describe(g, units);
          const selected = selectedGuideIds.includes(g.id);
          const hidden = hiddenGuideIds.includes(g.id);
          return (
            <li key={g.id} data-guide-id={g.id} className={hidden ? 'guide-row hidden' : selected ? 'guide-row selected' : 'guide-row'}>
              <button className="guide-eye" aria-label={`${hidden ? 'Show' : 'Hide'} ${text.row}`}
                onClick={() => setGuideHidden(g.id, !hidden)}>
                <EyeIcon hidden={hidden} />
              </button>
              <button className="guide-coords" aria-pressed={selected} disabled={hidden}
                onClick={(e) => selectGuide(g.id, isToggleModifier(e))}>
                {text.row}
              </button>
              {isGuideLine(g) && (['x', 'y', 'z'] as const).map((a, i) => a === g.axis ? null : (
                // The two fixed coordinates, typed (spec §5): a refused move says why through the field's own error.
                <DimensionField key={a} label={a.toUpperCase()} ariaLabel={`${a.toUpperCase()} of ${text.remove.replace(/^Remove /, '')}`} units={units} allowNegative value={g.at[i]!}
                  onCommit={(v) => {
                    const at: [number, number, number] = [g.at[0], g.at[1], g.at[2]];
                    at[i] = v;
                    return moveGuideLine(g.id, at) ? undefined : 'That line is already there';
                  }} />
              ))}
              <button
                className="guide-remove"
                aria-label={text.remove}
                onClick={() => removeGuide(g.id)}
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
      <button className="guides-clear" onClick={clearGuides}>Clear all</button>
    </>
  );
}
