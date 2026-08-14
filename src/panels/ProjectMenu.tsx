import { useCallback, useEffect, useRef, useState } from 'react';
import { storage } from '../storage/browser';
import type { ProjectEntry } from '../storage/types';

interface Props {
  activeId: string;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onImport: () => void;
}

/** "2 min ago" — coarse on purpose; the exact second is never the question. */
function relativeTime(at: number, now: number): string {
  const mins = Math.floor((now - at) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/**
 * The caret-triggered dropdown that lists every project in the library. The
 * project-name input beside it stays a plain rename field — this is the only
 * way to switch, duplicate, delete or start a project.
 */
export function ProjectMenu({ activeId, onOpen, onNew, onDuplicate, onDelete, onImport }: Props) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  // Which row's delete is armed. Two-step rather than window.confirm: it
  // keeps the project's name visible while you confirm, and this round
  // retires the app's only native dialog rather than adding a second.
  const [armed, setArmed] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    storage.listProjects().then(setProjects).catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    if (open) refresh();
    else setArmed(null);
  }, [open, refresh, activeId]);

  // Escape and outside-click are bound HERE, scoped to this menu's own
  // subtree and its own `open` lifetime — deliberately NOT through App's
  // single window-level keydown effect (invariant 27). That invariant
  // governs shortcuts bound to `window`, where the listener can never tell
  // which subtree an event came from and so every consumer needs the
  // cut-list-open flag threaded to it explicitly. Neither hazard applies
  // here: this listener is scoped to `root`, and the menu cannot be open
  // behind the cut list in the first place — the app shell goes `inert`
  // while the sheet is open, and opening the sheet is itself a toolbar click,
  // which already closes this popup via the outside-click handler below.
  // Routing Escape through App would mean lifting this component's open
  // state into App just to re-derive a `cutListOpen` guard against a state
  // that cannot occur. This looks like an invariant 27 violation; it is not.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const el = root.current;
    el?.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      el?.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  const now = Date.now();

  return (
    <div className="project-menu" ref={root}>
      <button
        className="project-menu-caret"
        aria-label="Open project menu"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
      >
        ▾
      </button>
      {open && (
        <div className="project-menu-popup" role="menu">
          {projects.map((p) => (
            <div className="project-row" key={p.id}>
              <button
                role="menuitemradio"
                aria-checked={p.id === activeId}
                className="project-row-open"
                onClick={() => { setOpen(false); onOpen(p.id); }}
              >
                <span className="project-dot" aria-hidden="true">{p.id === activeId ? '●' : ''}</span>
                <span className="project-row-name">{p.name}</span>
                <span className="project-row-time">{relativeTime(p.savedAt, now)}</span>
              </button>
              <button
                className="project-row-action"
                aria-label={`Duplicate ${p.name}`}
                title="Duplicate"
                onClick={() => { setArmed(null); onDuplicate(p.id); refresh(); }}
              >
                ⧉
              </button>
              {armed === p.id ? (
                <button
                  className="project-row-action danger"
                  onClick={() => { setArmed(null); onDelete(p.id); refresh(); }}
                >
                  Delete?
                </button>
              ) : (
                <button
                  className="project-row-action"
                  aria-label={`Delete ${p.name}`}
                  title="Delete"
                  onClick={() => setArmed(p.id)}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <div className="project-menu-divider" />
          <button role="menuitem" className="project-menu-cmd" onClick={() => { setOpen(false); onNew(); }}>
            + New project
          </button>
          <button role="menuitem" className="project-menu-cmd" onClick={() => { setOpen(false); onImport(); }}>
            ⬆ Import…
          </button>
        </div>
      )}
    </div>
  );
}
