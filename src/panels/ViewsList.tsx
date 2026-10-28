import { useStore } from '../store/store';
import { NameField } from './NameField';

/**
 * The saved views a project carries (saved views spec §6): go to one, rename it, replace it with the
 * current view, delete it. Not inside EditLock — every view action is allowed while exploded (inv 47 carve-out).
 */
export function ViewsList({ onGoTo, onUpdate }: { onGoTo: (id: string) => void; onUpdate: (id: string) => void }) {
  const views = useStore((s) => s.doc.views);
  const renameView = useStore((s) => s.renameView);
  const deleteView = useStore((s) => s.deleteView);

  if (views.length === 0) return <p className="empty">No saved views. Set up a view, then Save view.</p>;

  return (
    <ul className="guides views">
      {views.map((v) => (
        <li key={v.id}>
          <button className="view-go" title="Go to this view" onClick={() => onGoTo(v.id)}>{v.name}</button>
          <NameField label="View name" value={v.name} onCommit={(typed) => renameView(v.id, typed)} />
          <button className="view-update" title="Replace this view with the current view"
            onClick={() => onUpdate(v.id)}>Update</button>
          <button className="guide-remove" aria-label={`Delete view ${v.name}`} onClick={() => deleteView(v.id)}>×</button>
        </li>
      ))}
    </ul>
  );
}
