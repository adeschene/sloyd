import { useCallback, useEffect, useRef, useState } from 'react';
import type { FocusEvent } from 'react';
import { storage } from '../storage/browser';
import type { ProjectEntry } from '../storage/types';

interface Props {
  activeId: string;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDuplicate: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onImport: () => void;
}

/** "2 min ago" — coarse on purpose; the exact second is never the question. */
export function relativeTime(at: number, now: number): string {
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
 *
 * NOT an ARIA menu (no `role="menu"`/`menuitem`/`menuitemradio`, no arrow-key
 * or roving-tabindex navigation) — considered and rejected. A row carries a
 * name plus two independent actions, which is grid-shaped, not menu-shaped;
 * the full menu pattern is more machinery defending a role this popup does
 * not need. Plain buttons in DOM (Tab) order are the honest interaction, and
 * `aria-current` marks the open project the way a nav landmark would, not
 * `aria-checked`.
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
  // here: this listener is scoped to `root`, not `window`, so it only ever
  // fires for a key pressed inside the popup.
  //
  // The popup is NOT provably unreachable behind the cut list, unlike an
  // earlier version of this comment claimed: Tab out of the open popup to
  // the Cut list button and press Enter, and the resulting `click` fires
  // with no preceding `pointerdown` — the outside-click handler below never
  // sees it, so the popup stays open (invisibly, behind the now-`inert`
  // shell) until something else closes it. No permanently-unclosable state
  // results — the close-on-focusout handler a few lines down closes the
  // popup the moment focus leaves it, which happens as part of that same Tab
  // press, before the Enter that opens the sheet. But the popup's closing is
  // therefore doing real work in that path, not a formality, which is why
  // routing Escape through App would still buy nothing: App's `cutListOpen`
  // guard exists to stop a shortcut from acting on a hidden subtree, and by
  // the time the sheet could be open, this popup's own focusout has already
  // closed it.
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

  // Close on focusout: Tabbing past the last control in the popup (or
  // Shift+Tabbing past the caret) moves focus outside `root` without any
  // pointerdown, which the outside-click handler above cannot see at all —
  // this is the other half of what keeps the popup from lingering open
  // behind whatever focus lands on next (see the invariant-27 comment
  // above). `relatedTarget` is the element gaining focus; null means focus
  // left the document entirely (e.g. the address bar), which should also
  // close it. React has no `onFocusOut` prop — its bubbling equivalent of
  // native `focusout` is `onBlur` (React normalizes the non-bubbling native
  // `focus`/`blur` pair into bubbling synthetic `onFocus`/`onBlur`), so this
  // is bound as `onBlur` on the root, not the native event name.
  const onFocusOut = useCallback((e: FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    if (!next || !root.current?.contains(next)) setOpen(false);
  }, []);

  const now = Date.now();

  return (
    <div className="project-menu" ref={root} onBlur={onFocusOut}>
      <button
        className="project-menu-caret"
        aria-label="Open project menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        ▾
      </button>
      {open && (
        <div className="project-menu-popup">
          {projects.map((p) => (
            <div className="project-row" key={p.id}>
              <button
                aria-current={p.id === activeId ? 'true' : undefined}
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
                onClick={async () => { setArmed(null); await onDuplicate(p.id); refresh(); }}
              >
                ⧉
              </button>
              {/*
                Both branches render a <button> at this same sibling index —
                that's what lets focus survive the arm/disarm swap (React
                reuses the DOM node in place rather than unmounting one button
                and mounting another) without an explicit focus-restore
                effect. A future edit that gives either branch a distinct
                `key` would silently break that: React would then treat them
                as different elements, unmount/remount across the swap, and
                drop focus back to the document body.
              */}
              {armed === p.id ? (
                <button
                  className="project-row-action danger"
                  aria-label={`Delete ${p.name}?`}
                  onClick={async () => { setArmed(null); await onDelete(p.id); refresh(); }}
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
          <button className="project-menu-cmd" onClick={() => { setOpen(false); onNew(); }}>
            + New project
          </button>
          <button className="project-menu-cmd" onClick={() => { setOpen(false); onImport(); }}>
            ⬆ Import…
          </button>
        </div>
      )}
    </div>
  );
}
