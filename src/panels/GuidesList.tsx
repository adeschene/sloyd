import { useStore } from '../store/store';
import { formatLength } from '../units/length';

/**
 * The guides a project carries, and the only way to remove one.
 *
 * DELIBERATELY NO SELECTION MODEL — no selectedGuideId, no Delete-key path,
 * nothing touching selectedId. The list exists to remove guides; adding
 * selection would mean deciding what a selected guide shows in the properties
 * panel, which is a panel for boards.
 *
 * It is also how this round avoids invariant 21's trap rather than meeting it
 * in a browser: THREE.Line raycasting registers a hit only within
 * raycaster.params.Line.threshold — one inch here — of a drawn line, so
 * click-the-guide-in-the-viewport is a known-bad hit target. A guide is
 * removed by id, the way PartsList already selects a board by id.
 */
export function GuidesList() {
  const guides = useStore((s) => s.doc.guides);
  const precision = useStore((s) => s.doc.units.precision);
  const removeGuide = useStore((s) => s.removeGuide);
  const clearGuides = useStore((s) => s.clearGuides);

  if (guides.length === 0) {
    return <p className="empty">No guides. Use the Tape tool to place one.</p>;
  }

  return (
    <>
      <ul className="guides">
        {guides.map((g) => (
          <li key={g.id}>
            <span className="guide-coords">
              {g.at.map((n) => formatLength(n, precision)).join(', ')}
            </span>
            <button
              className="guide-remove"
              aria-label={`Remove guide at ${g.at.map((n) => formatLength(n, precision)).join(', ')}`}
              onClick={() => removeGuide(g.id)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <button className="guides-clear" onClick={clearGuides}>Clear all</button>
    </>
  );
}
