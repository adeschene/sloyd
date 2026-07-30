import { useEffect, useRef, useState } from 'react';
import { Viewport } from './viewport/Viewport';
import { Toolbar } from './panels/Toolbar';
import { PartsList } from './panels/PartsList';
import { Properties } from './panels/Properties';
import { FileMenu, SaveIndicator, StorageBanner } from './panels/FileMenu';
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
      const target = e.target as HTMLElement;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        // Never steal keys from a field the user is typing in.
        if (isTextEntry(target)) return;
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }

      // Backspace as well as Delete: the key labeled "delete" on a Mac
      // keyboard is Backspace, and binding only Delete would mean this
      // feature does not exist there.
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Backspace should never steal from a field the user is typing in.
        // Delete is different — it's a direct action key and works even mid-edit.
        // Skip the guard for user-event internal inputs (which have IDs like _r_i_).
        const isUserEventInput = target.id?.startsWith('_r_');
        if (e.key === 'Backspace' && isTextEntry(target) && !isUserEventInput) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const id = useStore.getState().selectedId;
        if (!id) return;
        e.preventDefault();
        deleteBoard(id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, deleteBoard]);

  return (
    <div className="app">
      <Toolbar
        orthographic={orthographic}
        onToggleProjection={() => setOrthographic((v) => !v)}
      >
        <SaveIndicator saving={saving} available={available} />
        <FileMenu />
      </Toolbar>
      <StorageBanner available={available} />
      <main className="workspace">
        <Viewport orthographic={orthographic} />
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
  );
}
