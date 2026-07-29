import { useStore } from '../store/store';

export function PartsList() {
  const boards = useStore((s) => s.doc.boards);
  const selectedId = useStore((s) => s.selectedId);
  const selectBoard = useStore((s) => s.selectBoard);

  if (boards.length === 0) {
    return <p className="empty">No parts yet. Add a board to begin.</p>;
  }

  return (
    <ul className="parts">
      {boards.map((b) => (
        <li key={b.id}>
          <button
            className={b.id === selectedId ? 'part selected' : 'part'}
            onClick={() => selectBoard(b.id)}
          >
            {b.name}
          </button>
        </li>
      ))}
    </ul>
  );
}
