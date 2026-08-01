import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { buildCutList } from '../document/document';
import { PartDiagram } from './PartDiagram';

/**
 * Which rows get drawn. LOCAL VIEW STATE, deliberately not in the store: it is
 * outside the document and outside the undo stack, the same reasoning that
 * made `shortcutsSuspended` a prop rather than store state. `buildCutList`
 * stays a pure function of the document — this chooses what to RENDER, never
 * what to compute. It is not persisted; a fresh open starts at 'joinery'.
 */
type DiagramMode = 'none' | 'joinery' | 'all';

/**
 * The cut list as a printable sheet.
 *
 * Derived from the store's document on every render — there is no cached copy,
 * so it cannot go stale — and it formats nothing itself: every string arrives
 * ready from `buildCutList`, which is what keeps display rounding in one place.
 *
 * Rendered as a direct child of `.app`, which the print stylesheet depends on:
 * it hides `.app > *` other than this overlay. Its sibling — everything else
 * in the app — is `inert` while this is mounted (see App.tsx), which is what
 * confines Tab to the sheet; the only thing this component owes that
 * arrangement is taking focus on mount, since focus is otherwise left on a
 * button that has just become unfocusable.
 */
export function CutList({ onClose }: { onClose: () => void }) {
  const doc = useStore((s) => s.doc);
  const list = buildCutList(doc);
  const sheet = useRef<HTMLDivElement>(null);
  const [diagrams, setDiagrams] = useState<DiagramMode>('joinery');

  // `tabIndex={-1}` makes the sheet focusable without putting it in the tab
  // order, so focus starts inside the dialog and Tab proceeds to Print/Close
  // rather than nowhere.
  useEffect(() => {
    sheet.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="cutlist-overlay" role="dialog" aria-modal="true" aria-label="Cut list">
      <div className="cutlist-sheet" ref={sheet} tabIndex={-1}>
        <header className="cutlist-head">
          <h2>Cut list — {doc.name}</h2>
          <div className="cutlist-actions">
            <label className="cutlist-diagram-mode">
              Diagrams
              <select
                value={diagrams}
                onChange={(e) => setDiagrams(e.target.value as DiagramMode)}
              >
                <option value="none">None</option>
                <option value="joinery">Joinery only</option>
                <option value="all">All parts</option>
              </select>
            </label>
            <button onClick={() => window.print()}>Print</button>
            <button onClick={onClose} aria-label="Close cut list">✕</button>
          </div>
        </header>

        {list.groups.length === 0 ? (
          <p className="cutlist-empty">No parts yet.</p>
        ) : (
          list.groups.map((group) => (
            <section className="cutlist-group" key={group.label}>
              <h3>{group.label}</h3>
              <ul className="cutlist-rows">
                {group.rows.map((row) => (
                  <li className="cutlist-row" key={row.key}>
                    <span className="cutlist-qty">{row.qty} ×</span>
                    <span className="cutlist-dims">{row.dims}</span>
                    <span className="cutlist-names">{row.names.join(', ')}</span>
                    <span className="cutlist-stock">{row.stock}</span>
                    {row.setup.length > 0 && (
                      <ul className="cutlist-setup">
                        {/*
                          Keyed on row key + index, not on the line text: two
                          cuts can produce the same line. `addCut` derives its
                          defaults from the board alone, so clicking "Add cut"
                          twice gives two cuts identical but for `id` — which
                          both `cutSignature` and `setupLine` exclude — and the
                          line is the same string twice. Position is the only
                          thing that distinguishes them, and setup lines never
                          reorder within a row.
                        */}
                        {row.setup.map((line, i) => (
                          <li key={`${row.key}#${i}`}>{line}</li>
                        ))}
                      </ul>
                    )}
                    {(diagrams === 'all' || (diagrams === 'joinery' && row.setup.length > 0)) &&
                      row.diagrams.map((view) => (
                        <PartDiagram key={view.key} view={view} />
                      ))}
                  </li>
                ))}
              </ul>
              <p className="cutlist-subtotal">
                <span className="cutlist-subtotal-label">{group.label}:</span>
                <span className="cutlist-stock">{group.stock}</span>
              </p>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
