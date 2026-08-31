import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import type { FocusEvent } from 'react';
import { storage } from '../storage/browser';
import type { ProjectEntry } from '../storage/types';

/**
 * Why a duplicate failed, carried rather than collapsed to a boolean.
 *
 * The two need different sentences and would send the user two different
 * places. `source-missing` is the case follow-up 159 is about: the row is
 * listed but its `sloyd.project.<id>` key is gone or unreadable, which
 * `storage.available` deliberately does NOT report — the store is working,
 * one project's data is not there — so nothing else can speak for it.
 * `write-failed` is storage refusing the new key, which also raises the
 * banner; saying "missing" there would send the user looking for the wrong
 * thing. Same shape as `TapeReadout`'s cause-carrying `TapeError`.
 */
export type DuplicateFailure = 'source-missing' | 'write-failed';

const DUPLICATE_MESSAGE: Record<DuplicateFailure, string> = {
  'source-missing': "Couldn't duplicate — this project's data is missing.",
  'write-failed': "Couldn't duplicate — storage is unavailable.",
};

interface Props {
  activeId: string;
  onOpen: (id: string) => void;
  onNew: () => void;
  /** Resolves null on success, or the reason it failed — see DuplicateFailure. */
  onDuplicate: (id: string) => Promise<DuplicateFailure | null>;
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
  // Which row's duplicate failed, and why (follow-up 159). Per-row rather
  // than one message for the popup: the error belongs to the thing that
  // failed, so two rows cannot be confused, and it dies with its row for
  // free — it renders inside `projects.map`, so an id that leaves the list
  // takes its message with it rather than leaving one attached to nothing.
  const [failed, setFailed] = useState<{ id: string; cause: DuplicateFailure } | null>(null);
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
  // ONE clearing rule for the duplicate error, as an effect on `open` rather
  // than a `setFailed(null)` beside every `setOpen(false)`. There are six
  // close paths (Escape, outside click, focus-out, opening a row, New,
  // Import) and a seventh is cheap to add; a flag reset by convention at
  // every call site is exactly the shape invariant 34 argues against. Keyed
  // on `open` so a future close path inherits the clear without knowing it
  // exists. The popup's contents are unmounted while closed, so this is the
  // state catching up with what the user already sees.
  useEffect(() => {
    if (!open) setFailed(null);
  }, [open]);

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
            <Fragment key={p.id}>
            <div className="project-row-group">
            <div className="project-row">
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
                onClick={async () => {
                  setArmed(null);
                  const cause = await onDuplicate(p.id);
                  // Set on failure AND cleared on success, in one statement:
                  // a second attempt that works must not leave the first
                  // one's message standing, and neither must a success on a
                  // DIFFERENT row — there is one error at a time, and it
                  // belongs to the last duplicate attempted.
                  setFailed(cause ? { id: p.id, cause } : null);
                  refresh();
                }}
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
            {failed?.id === p.id && (
              // `role="status"` (an implicit aria-live="polite" region) so the
              // failure is announced rather than only drawn — this is the
              // report for an action whose whole defect was being silent.
              // `.field-error` is the app's existing inline-error class, not a
              // new one: it already serves fields and, with a scoped override,
              // the toolbar's export error.
              <p className="field-error" role="status">{DUPLICATE_MESSAGE[failed.cause]}</p>
            )}
            </div>
            </Fragment>
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
