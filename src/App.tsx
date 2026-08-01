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
  // Also view state, and also deliberately outside the document and the undo
  // stack: the cut list is a way of looking at a project, not part of one.
  const [cutListOpen, setCutListOpen] = useState(false);
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Never steal keys from a field the user is typing in.
      if (isTextEntry(e.target as HTMLElement)) return;

      // The cut list covers the app, so board shortcuts must not fire behind
      // it — Delete/Backspace especially, which would silently delete the
      // selected board while the user is reading a sheet that never shows a
      // selection. Escape is handled by CutList itself.
      if (cutListOpen) return;

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
      <Toolbar
        orthographic={orthographic}
        onToggleProjection={() => setOrthographic((v) => !v)}
        showGrid={showGrid}
        onToggleGrid={() => setShowGrid((v) => !v)}
        showAxes={showAxes}
        onToggleAxes={() => setShowAxes((v) => !v)}
        onOpenCutList={() => setCutListOpen(true)}
      >
        <SaveIndicator saving={saving} available={available} />
        <FileMenu />
      </Toolbar>
      <StorageBanner available={available} />
      <main className="workspace">
        <Viewport orthographic={orthographic} showGrid={showGrid} showAxes={showAxes} />
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
      {cutListOpen && <CutList onClose={() => setCutListOpen(false)} />}
    </div>
  );
}
