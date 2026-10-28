import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/store';
import type { SavedViewCamera } from '../document/types';
import { ViewsList } from './ViewsList';

/**
 * Saved views as a footer of the side panel (saved views spec §6), shaped like GuidesFooter: a count, closed by
 * default, opening ITSELF when the count goes up against the count at MOUNT (App keys it by project id).
 * Not inside EditLock: saving, updating, renaming and deleting a view are allowed while exploded.
 */
export function ViewsFooter({ getCamera, onGoTo }: {
  getCamera: () => SavedViewCamera | null;
  onGoTo: (id: string) => void;
}) {
  const count = useStore((s) => s.doc.views.length);
  const saveView = useStore((s) => s.saveView);
  const updateView = useStore((s) => s.updateView);
  const [open, setOpen] = useState(false);
  const last = useRef(count);
  useEffect(() => {
    if (count > last.current) setOpen(true);
    last.current = count;
  }, [count]);

  return (
    <section className={open ? 'panel panel-guides panel-views open' : 'panel panel-guides panel-views'}>
      <h2>
        <button className="guides-toggle views-toggle" aria-expanded={open} aria-controls="views-body"
          onClick={() => setOpen((o) => !o)}>
          {`Views · ${count}`}
          <span className="guides-caret views-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
        </button>
      </h2>
      {open && (
        <div id="views-body" className="guides-body views-body">
          <button className="guides-clear views-save" onClick={() => { const c = getCamera(); if (c) saveView(c); }}>
            Save view
          </button>
          <ViewsList onGoTo={onGoTo} onUpdate={(id) => { const c = getCamera(); if (c) updateView(id, c); }} />
        </div>
      )}
    </section>
  );
}
