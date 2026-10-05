import { useStore } from '../store/store';
import { selectByClick } from '../store/selectionGesture';

/** An eye, or a struck-through eye. Inline because the app has no icon set. */
function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="8" r="2" fill="currentColor" />
      {hidden && <line x1="2" y1="14" x2="14" y2="2" stroke="currentColor" strokeWidth="1.5" />}
    </svg>
  );
}

export function PartsList() {
  const boards = useStore((s) => s.doc.boards);
  const selectedIds = useStore((s) => s.selectedIds);
  const hiddenIds = useStore((s) => s.hiddenIds);
  const setHidden = useStore((s) => s.setHidden);
  const showAll = useStore((s) => s.showAll);

  if (boards.length === 0) {
    return <p className="empty">No parts yet. Add a board to begin.</p>;
  }

  return (
    <>
      {/* The count is the point: with parts hidden, an emptier model must
          never read as a bug (hide/unhide spec §4.1). */}
      {hiddenIds.length > 0 && (
        <button className="parts-show-all" onClick={showAll}>Show all ({hiddenIds.length})</button>
      )}
      <ul className="parts">
        {boards.map((b) => {
          const selected = selectedIds.includes(b.id);
          const hidden = hiddenIds.includes(b.id);
          return (
            <li key={b.id} className={hidden ? 'part-row hidden' : 'part-row'}>
              <button
                className="part-eye"
                aria-label={`${hidden ? 'Show' : 'Hide'} ${b.name}`}
                onClick={() => setHidden(b.id, !hidden)}
              >
                <EyeIcon hidden={hidden} />
              </button>
              {/* aria-pressed: with several parts selectable, each row is a
                  toggle. A hidden part cannot be selected (spec §1), so its
                  name is disabled and only the eye works. */}
              <button
                className={selected ? 'part selected' : 'part'}
                aria-pressed={selected}
                disabled={hidden}
                onClick={(e) => selectByClick(b.id, e)}
              >
                {b.name}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
