import { useEffect, useRef, useState } from 'react';
import { Viewport } from './viewport/Viewport';
import { Toolbar } from './panels/Toolbar';
import { PartsList } from './panels/PartsList';
import { Properties } from './panels/Properties';
import { FileMenu, SaveIndicator, StorageBanner } from './panels/FileMenu';
import { CutList } from './panels/CutList';
import { storage } from './storage/browser';
import { useStore } from './store/store';

/**
 * True for anything the user might be typing into. Keyboard shortcuts must
 * never fire while focus is here — most of all Backspace, which is bound to
 * delete-the-selected-board because that is what the Mac "delete" key sends.
 */
function isTextEntry(el: HTMLElement | null): boolean {
  if (!el) return false;
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'SELECT' ||
    el.tagName === 'TEXTAREA' ||
    el.isContentEditable
  );
}

export default function App() {
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const doc = useStore((s) => s.doc);
  const replaceDocument = useStore((s) => s.replaceDocument);
  const deleteBoard = useStore((s) => s.deleteBoard);
  const [saving, setSaving] = useState(false);
  const [available, setAvailable] = useState(true);
  const [orthographic, setOrthographic] = useState(false);
  // View state, deliberately not part of the document: whether the grid and
  // the origin axes are drawn is a property of how you're looking at a
  // project, not of the project, so neither saves nor lands on the undo stack.
  // They are two independent flags because they answer different questions —
  // "how big is this" and "where is the origin".
  const [showGrid, setShowGrid] = useState(true);
  const [showAxes, setShowAxes] = useState(true);
  const [showGuides, setShowGuides] = useState(true);
  // Also view state, and also deliberately outside the document and the undo
  // stack: the cut list is a way of looking at a project, not part of one.
  const [cutListOpen, setCutListOpen] = useState(false);
  // Where focus was when the sheet opened, so closing it puts focus back.
  // Captured HERE rather than in CutList's mount effect: `inert` on the shell
  // blurs whatever was focused behind the scrim, so by the time the modal
  // mounts the opener is already gone from `document.activeElement`.
  const opener = useRef<HTMLElement | null>(null);
  const restored = useRef(false);

  // Restore once on mount, before any autosave can overwrite it.
  //
  // Two hazards this guards against:
  //  - A document edit landing while the restore is still in flight (real
  //    with a slower storage backend than today's synchronous
  //    localStorage): if the user's doc has moved on by the time the
  //    restore resolves, their edit wins and the restore is dropped.
  //  - StrictMode's double-invoke in dev running two overlapping restores:
  //    `cancelled` stops a stale continuation from firing after its effect
  //    was cleaned up.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const before = useStore.getState().doc;
      try {
        const saved = await storage.loadAutoSaved();
        if (cancelled) return;
        // The user edited while the restore was in flight — their work wins.
        if (useStore.getState().doc !== before) {
          setAvailable(storage.available);
          return;
        }
        if (saved) replaceDocument(saved);
        setAvailable(storage.available);
      } catch {
        // loadAutoSaved carries no never-throws contract (unlike autoSave).
        // A rejection here must not leave restored.current permanently
        // false — that would silently disable autosave for the rest of the
        // session while SaveIndicator keeps claiming "Saved locally".
        if (!cancelled) setAvailable(storage.available);
      } finally {
        if (!cancelled) restored.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [replaceDocument]);

  // Debounced autosave on every document change.
  useEffect(() => {
    if (!restored.current) return;
    setSaving(true);
    const t = setTimeout(async () => {
      await storage.autoSave(doc);
      setAvailable(storage.available);
      setSaving(false);
    }, 600);
    return () => clearTimeout(t);
  }, [doc]);

  // Closing the sheet puts focus back where it was. In an effect rather than
  // in `onClose` because the shell is still `inert` when the handler runs —
  // focusing an inert element does nothing — and effects run after the commit
  // that removes the attribute. Fires on mount too, harmlessly: `opener` is
  // null until something opens the sheet.
  useEffect(() => {
    if (cutListOpen) return;
    const back = opener.current;
    opener.current = null;
    back?.focus();
  }, [cutListOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Never steal keys from a field the user is typing in.
      if (isTextEntry(e.target as HTMLElement)) return;

      // The cut list covers the app, so board shortcuts must not fire behind
      // it — Delete/Backspace especially, which would silently delete the
      // selected board while the user is reading a sheet that never shows a
      // selection. Escape is handled by CutList itself.
      //
      // This guard exists BECAUSE the listener is on `window`: the `inert`
      // shell below makes the covered UI unfocusable and unclickable, but a
      // window listener never sees the DOM tree the event came from as a
      // reason not to fire. Every window-level shortcut in the app needs the
      // flag reaching it explicitly — which is why `Viewport` takes it as a
      // prop rather than inferring it.
      if (cutListOpen) return;

      // Escape backs out one level: drop the grab first, then the tool. Note
      // this sits below the cutListOpen guard on purpose — CutList owns
      // Escape while it is open, and a grab behind the sheet must survive it.
      if (e.key === 'Escape') {
        const { grabbed, tool, cancelGrab, setTool } = useStore.getState();
        if (grabbed) {
          e.preventDefault();
          cancelGrab();
        } else if (tool !== 'select') {
          e.preventDefault();
          setTool('select');
        }
        return;
      }

      // M toggles the Move tool. Modifier chords are left alone — Ctrl+M and
      // Cmd+M are the browser's and the OS's.
      if (e.key === 'm' || e.key === 'M') {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        e.preventDefault();
        const { tool, setTool } = useStore.getState();
        setTool(tool === 'move' ? 'select' : 'move');
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }

      // Backspace as well as Delete: the key labeled "delete" on a Mac
      // keyboard is Backspace, and binding only Delete would mean this
      // feature does not exist there.
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        // Deleting the board currently being carried would leave the grab
        // pointing at something that no longer exists. The store drops the
        // grab defensively too; this is what stops the delete happening at all.
        if (useStore.getState().grabbed) return;
        const id = useStore.getState().selectedId;
        if (!id) return;
        e.preventDefault();
        deleteBoard(id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, deleteBoard, cutListOpen]);

  return (
    <div className="app">
      {/*
        Everything except the sheet lives in one wrapper so it can be made
        `inert` in a single place while the cut list is open. Without it Tab
        walks out of the modal into NameField, the project-name field and the
        DimensionFields behind the scrim — all of which commit on change or
        blur, so the user silently edits the document while reading a sheet
        that shows no selection. `inert` removes the whole subtree from the tab
        order, from hit-testing and from the accessibility tree at once, which
        is why no hand-rolled Tab cycler is needed here.

        The wrapper is still a direct child of `.app`, so the print rule
        (`.app > *:not(.cutlist-overlay)`) hides it exactly as it hid the three
        elements it replaced.
      */}
      <div className="app-shell" inert={cutListOpen}>
        <Toolbar
          orthographic={orthographic}
          onToggleProjection={() => setOrthographic((v) => !v)}
          showGrid={showGrid}
          onToggleGrid={() => setShowGrid((v) => !v)}
          showAxes={showAxes}
          onToggleAxes={() => setShowAxes((v) => !v)}
          showGuides={showGuides}
          onToggleGuides={() => setShowGuides((v) => !v)}
          onOpenCutList={() => {
            opener.current = document.activeElement as HTMLElement | null;
            setCutListOpen(true);
          }}
        >
          <SaveIndicator saving={saving} available={available} />
          <FileMenu />
        </Toolbar>
        <StorageBanner available={available} />
        <main className="workspace">
          <Viewport
            orthographic={orthographic}
            showGrid={showGrid}
            showAxes={showAxes}
            showGuides={showGuides}
            shortcutsSuspended={cutListOpen}
          />
          <aside className="sidebar">
            <section className="panel panel-parts">
              <h2>Parts</h2>
              <PartsList />
            </section>
            <section className="panel panel-props">
              <h2>Properties</h2>
              <Properties />
            </section>
          </aside>
        </main>
      </div>
      {cutListOpen && <CutList onClose={() => setCutListOpen(false)} />}
    </div>
  );
}
