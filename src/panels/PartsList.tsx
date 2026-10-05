import { useStore } from '../store/store';
import { selectByClick } from '../store/selectionGesture';

export function PartsList() {
  const boards = useStore((s) => s.doc.boards);
  const selectedIds = useStore((s) => s.selectedIds);

  if (boards.length === 0) {
    return <p className="empty">No parts yet. Add a board to begin.</p>;
  }

  return (
    <ul className="parts">
      {boards.map((b) => {
        const selected = selectedIds.includes(b.id);
        return (
          <li key={b.id}>
            {/* aria-pressed: with several parts selectable, each row is a
                toggle, and assistive tech should hear which are on. */}
            <button
              className={selected ? 'part selected' : 'part'}
              aria-pressed={selected}
              onClick={(e) => selectByClick(b.id, e)}
            >
              {b.name}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
