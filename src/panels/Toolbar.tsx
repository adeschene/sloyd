import type { ReactNode } from 'react';
import { useStore } from '../store/store';
import { ProjectMenu } from './ProjectMenu';
import type { DuplicateFailure } from './ProjectMenu';

interface Props {
  children?: ReactNode;
  /**
   * False when library adoption failed (spec §2.2) — the session runs the
   * legacy single-slot path and the menu is not rendered at all. A failed
   * adoption must degrade to today's app, not to a menu that lies about
   * being able to switch, duplicate or delete anything.
   */
  libraryAvailable: boolean;
  activeId: string;
  onOpenProject: (id: string) => void;
  onNewProject: () => void;
  onDuplicateProject: (id: string) => Promise<DuplicateFailure | null>;
  onDeleteProject: (id: string) => Promise<void>;
  onImportProject: () => void;
  /** Opens the cut list sheet. */
  onOpenCutList: () => void;
  /**
   * Opens the Generate dialog. Required, like `onOpenSettings` and
   * `generating`: a Toolbar rendered without the wiring should fail to
   * compile, not render a button that does nothing.
   */
  onOpenGenerate: () => void;
  onOpenJoinery: () => void;
  /** Opens the Refine dialog (change the open prototype by instruction). */
  onOpenRefine: () => void;
  /** Opens the Settings dialog (the API key and model). */
  onOpenSettings: () => void;
  /**
   * The live batch, or null when nothing is running. While non-null the
   * Generate button reads "Generating done/total…" and STILL opens the dialog
   * (spec §6.1) — closing the dialog does not cancel, so this label is the
   * only sign runs are out while it is shut.
   */
  generating: { live: number; total: number } | null;
  /**
   * Generated this session and not yet opened; passed through to
   * ProjectMenu for its badge (spec §6.3). Optional, like ProjectMenu's own.
   */
  newIds?: ReadonlySet<string>;
}

export function Toolbar({
  children,
  onOpenCutList,
  libraryAvailable,
  activeId,
  onOpenProject,
  onNewProject,
  onDuplicateProject,
  onDeleteProject,
  onImportProject,
  onOpenGenerate,
  onOpenJoinery,
  onOpenRefine,
  onOpenSettings,
  generating,
  newIds,
}: Props) {
  const name = useStore((s) => s.doc.name);
  const setDocumentName = useStore((s) => s.setDocumentName);
  const addBoard = useStore((s) => s.addBoard);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);

  return (
    <header className="toolbar">
      {/* Left group: the document and the things that change it. */}
      <div className="toolbar-group">
        <span className="brand">Sloyd</span>
        <input
          className="input doc-name"
          aria-label="Project name"
          value={name}
          onFocus={() => useStore.getState().beginGesture()}
          onBlur={() => useStore.getState().endGesture()}
          onChange={(e) => setDocumentName(e.target.value)}
        />
        {libraryAvailable && (
          <ProjectMenu
            activeId={activeId}
            onOpen={onOpenProject}
            onNew={onNewProject}
            onDuplicate={onDuplicateProject}
            onDelete={onDeleteProject}
            onImport={onImportProject}
            newIds={newIds}
          />
        )}
        <button className="btn-primary" onClick={addBoard}>+ Add board</button>
        <button onClick={onOpenCutList} title="Cut list — parts, quantities and joinery">
          Cut list
        </button>
        <button onClick={onOpenGenerate} title="Generate a prototype from a description">
          {generating ? `Generating ${generating.total - generating.live}/${generating.total}…` : 'Generate…'}
        </button>
        <button onClick={onOpenJoinery} title="Add joints to the open design">Add joinery…</button>
        <button onClick={onOpenRefine} title="Change the open prototype by instruction">Refine…</button>
        <span className="toolbar-divider" />
        <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">↶</button>
        <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">↷</button>
      </div>

      {/* Right group: settings, then the document's state on disk. */}
      <div className="toolbar-group toolbar-right">
        <button onClick={onOpenSettings} aria-label="Settings" title="Settings">⚙</button>
        {children}
      </div>
    </header>
  );
}
