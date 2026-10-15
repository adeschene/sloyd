import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { GuidesList } from './GuidesList';
import { EditLock } from './EditLock';

/**
 * Guides as a footer of the side panel (ui-polish spec §4.5): a count, closed
 * by default, opening ITSELF when the count goes up (a guide was placed — or an
 * undo brought one back). It never closes by itself. Open/closed is view state
 * local to this component: not in the document, the store, undo or storage.
 *
 * "Goes up" is judged against the count at MOUNT. App keys this component by
 * the active project id, so loading or switching to a project with guides
 * mounts a fresh instance whose baseline is that project's count — it stays
 * closed (App.test.tsx, "App Guides footer across load and switch").
 */
export function GuidesFooter() {
  const count = useStore((s) => s.doc.guides.length);
  const [open, setOpen] = useState(false);
  const last = useRef(count);
  useEffect(() => {
    if (count > last.current) setOpen(true);
    last.current = count;
  }, [count]);

  return (
    <section className={open ? 'panel panel-guides open' : 'panel panel-guides'}>
      <h2>
        <button className="guides-toggle" aria-expanded={open} aria-controls="guides-body"
          onClick={() => setOpen((o) => !o)}>
          {`Guides · ${count}`}
          <span className="guides-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
        </button>
      </h2>
      {/* Only the list is locked while exploded (fu 262): the disclosure is view state. */}
      {open && <div id="guides-body" className="guides-body"><EditLock><GuidesList /></EditLock></div>}
    </section>
  );
}
