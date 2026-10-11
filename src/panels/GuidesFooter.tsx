import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { GuidesList } from './GuidesList';

/**
 * Guides as a footer of the side panel (ui-polish spec §4.5): a count, closed
 * by default, opening ITSELF when the count goes up (a guide was placed — or an
 * undo brought one back, or an opened project has more). It never closes by
 * itself. Open/closed is view state local to this component: not in the
 * document, the store, undo or storage.
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
      {open && <div id="guides-body" className="guides-body"><GuidesList /></div>}
    </section>
  );
}
