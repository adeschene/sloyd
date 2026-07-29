import { useEffect, useRef, useState } from 'react';
import { Viewport } from './viewport/Viewport';
import { Toolbar } from './panels/Toolbar';
import { PartsList } from './panels/PartsList';
import { Properties } from './panels/Properties';
import { FileMenu, SaveIndicator, StorageBanner } from './panels/FileMenu';
import { storage } from './storage/browser';
import { useStore } from './store/store';

export default function App() {
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const doc = useStore((s) => s.doc);
  const replaceDocument = useStore((s) => s.replaceDocument);
  const [saving, setSaving] = useState(false);
  const [available, setAvailable] = useState(true);
  const restored = useRef(false);

  // Restore once on mount, before any autosave can overwrite it.
  useEffect(() => {
    (async () => {
      const saved = await storage.loadAutoSaved();
      if (saved) replaceDocument(saved);
      restored.current = true;
      setAvailable(storage.available);
    })();
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
      // Never steal keys from a field the user is typing in.
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  return (
    <div className="app">
      <Toolbar>
        <SaveIndicator saving={saving} available={available} />
        <FileMenu />
      </Toolbar>
      <StorageBanner available={available} />
      <main className="workspace">
        <Viewport />
        <aside className="sidebar">
          <section>
            <h2>Parts</h2>
            <PartsList />
          </section>
          <section className="grow">
            <h2>Properties</h2>
            <Properties />
          </section>
        </aside>
      </main>
    </div>
  );
}
