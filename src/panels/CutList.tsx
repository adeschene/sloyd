import { useEffect } from 'react';
import { useStore } from '../store/store';
import { buildCutList } from '../document/document';

/**
 * The cut list as a printable sheet.
 *
 * Derived from the store's document on every render — there is no cached copy,
 * so it cannot go stale — and it formats nothing itself: every string arrives
 * ready from `buildCutList`, which is what keeps display rounding in one place.
 *
 * Rendered as a direct child of `.app`, which the print stylesheet depends on:
 * it hides `.app > *` other than this overlay.
 */
export function CutList({ onClose }: { onClose: () => void }) {
  const doc = useStore((s) => s.doc);
  const list = buildCutList(doc);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="cutlist-overlay" role="dialog" aria-modal="true" aria-label="Cut list">
      <div className="cutlist-sheet">
        <header className="cutlist-head">
          <h2>Cut list — {doc.name}</h2>
          <div className="cutlist-actions">
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
                    {row.setup.length > 0 && (
                      <ul className="cutlist-setup">
                        {row.setup.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
