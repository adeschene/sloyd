import { useStore } from '../store/store';
import { isGuideLine } from '../document/document';
import type { Guide } from '../document/document';
import { formatLength } from '../units/length';
import type { Units } from '../units/length';

/**
 * The guides a project carries, and the only way to remove one.
 *
 * DELIBERATELY NO SELECTION MODEL — no selectedGuideId, no Delete-key path,
 * nothing touching selectedIds. The list exists to remove guides; adding
 * selection would mean deciding what a selected guide shows in the properties
 * panel, which is a panel for boards.
 *
 * It is also how this round avoids invariant 21's trap rather than meeting it
 * in a browser: THREE.Line raycasting registers a hit only within
 * raycaster.params.Line.threshold — one inch here — of a drawn line, so
 * click-the-guide-in-the-viewport is a known-bad hit target. A guide is
 * removed by id, the way PartsList already selects a board by id.
 */
/**
 * The row text and the remove label, built ONCE from one formatting of the
 * fixed coordinates so the two cannot disagree (inv 19's spirit). A line prints
 * its two fixed axes in X, Y, Z order; the along-axis coordinate is 0 by
 * construction and says nothing (construction-lines spec §2.2; row format §6).
 */
function describe(g: Guide, units: Units): { row: string; remove: string } {
  if (!isGuideLine(g)) {
    const at = g.at.map((n) => formatLength(n, units)).join(', ');
    return { row: at, remove: `Remove guide at ${at}` };
  }
  const axis = g.axis.toUpperCase();
  const fixed = (['x', 'y', 'z'] as const)
    .filter((a) => a !== g.axis)
    .map((a) => ({ a: a.toUpperCase(), v: formatLength(g.at[a === 'x' ? 0 : a === 'y' ? 1 : 2], units) }));
  return {
    row: `Line along ${axis} · ${fixed.map((f) => `${f.a} ${f.v}`).join(' · ')}`,
    remove: `Remove line along ${axis} at ${fixed.map((f) => `${f.a} ${f.v}`).join(', ')}`,
  };
}

export function GuidesList() {
  const guides = useStore((s) => s.doc.guides);
  const units = useStore((s) => s.doc.units);
  const removeGuide = useStore((s) => s.removeGuide);
  const clearGuides = useStore((s) => s.clearGuides);

  if (guides.length === 0) {
    return <p className="empty">No guides. Use the Tape tool to place a point or a line.</p>;
  }

  return (
    <>
      <ul className="guides">
        {guides.map((g) => {
          const text = describe(g, units);
          return (
            <li key={g.id}>
              <span className="guide-coords">{text.row}</span>
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
