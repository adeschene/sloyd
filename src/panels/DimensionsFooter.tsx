import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { DimensionsList } from './DimensionsList';
import { EditLock } from './EditLock';

/**
 * Placed dimensions as a footer of the side panel (placed-dimensions spec §5), the GuidesFooter pattern exactly: a count,
 * closed by default, opening ITSELF when the count goes up against the count at MOUNT (App keys it by project id), never
 * closing by itself. Renders nothing at 0. Only the list is locked while exploded; the disclosure is view state.
 */
export function DimensionsFooter() {
  const count = useStore((s) => s.doc.dimensions.length);
  const [open, setOpen] = useState(false);
  const last = useRef(count);
  useEffect(() => {
    if (count > last.current) setOpen(true);
    last.current = count;
  }, [count]);
  if (count === 0) return null;

  return (
    <section className={open ? 'panel panel-guides panel-dimensions open' : 'panel panel-guides panel-dimensions'}>
      <h2>
        <button className="guides-toggle" aria-expanded={open} aria-controls="dimensions-body"
          onClick={() => setOpen((o) => !o)}>
          {`Dimensions · ${count}`}
          <span className="guides-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
        </button>
      </h2>
      {open && <div id="dimensions-body" className="guides-body"><EditLock><DimensionsList /></EditLock></div>}
    </section>
  );
}
