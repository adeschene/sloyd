import type { ReactNode } from 'react';
import { useStore } from '../store/store';

export function Toolbar({ children }: { children?: ReactNode }) {
  const name = useStore((s) => s.doc.name);
  const setDocumentName = useStore((s) => s.setDocumentName);
  const addBoard = useStore((s) => s.addBoard);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);

  return (
    <header className="toolbar">
      <span className="brand">Sloyd</span>
      <input
        className="input doc-name"
        aria-label="Project name"
        value={name}
        onFocus={() => useStore.getState().beginGesture()}
        onBlur={() => useStore.getState().endGesture()}
        onChange={(e) => setDocumentName(e.target.value)}
      />
      <button onClick={addBoard}>+ Add Board</button>
      <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">↶</button>
      <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">↷</button>
      <span className="spacer" />
      {children}
    </header>
  );
}
