import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { buildCutList, flatDocument } from '../document/document';
import { isMetric } from '../units/length';
import { PartDiagram } from './PartDiagram';
import { DovetailBench } from './DovetailBench';
import { SheetLayout } from './SheetLayout';
import { DimensionField } from './DimensionField';
import { hardwareTotals, hardwareUseText } from '../document/hardware';
import { buildPurchase, defaultShop, type ShopSettings } from '../document/purchase';

const DEFAULT_SHOP = defaultShop();

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
export function CutList({ onClose, shop = DEFAULT_SHOP, onOpenPrices, suspended = false }: {
  onClose: () => void;
  /** The browser-level lumber and price settings (lumber yield and cost spec §2); App reads them. */
  shop?: ShopSettings;
  /** Opens the Materials & prices dialog above this sheet; the button is absent without it. */
  onOpenPrices?: () => void;
  /** True while a dialog is open above the sheet: Escape belongs to it, and the sheet is inert. */
  suspended?: boolean;
}) {
  const doc = useStore((s) => s.doc);
  const setKerf = useStore((s) => s.setKerf);
  // The flat document: placed parts named by their display paths (assemblies spec §6).
  const flat = flatDocument(doc);
  const list = buildCutList(flat);
  // Each part's row number, so its layouts label small parts in the cut list's own series (plans balloons).
  const rowNumbers = new Map(list.groups.flatMap((g) => g.rows).flatMap((r) => [...r.boardIds, ...r.stripIds].map((id) => [id, r.number] as const)));
  // Hardware (spec §4): totals read the STORED doc (flat has no definitions); not part of the numbered series or the balloons.
  const hardware = hardwareTotals(doc);
  const purchase = buildPurchase(flat, list, shop, hardware);
  const sheet = useRef<HTMLDivElement>(null);
  const [diagrams, setDiagrams] = useState<DiagramMode>('joinery');
  /**
   * Whether sheet layouts are drawn. LOCAL VIEW STATE, same reasoning as
   * `diagrams` above. Separate from the Diagrams select on purpose: "all
   * parts / joinery only / none" is a statement about PER-PART drawings and
   * has no meaning for a sheet, so folding these in would make one control
   * answer two unrelated questions.
   */
  const [layouts, setLayouts] = useState(true);

  // `tabIndex={-1}` makes the sheet focusable without putting it in the tab
  // order, so focus starts inside the dialog and Tab proceeds to Print/Close
  // rather than nowhere.
  useEffect(() => {
    sheet.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !suspended) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, suspended]);

  return (
    <div className="cutlist-overlay" role="dialog" aria-modal="true" aria-label="Cut list" inert={suspended}>
      <div className={`cutlist-sheet${isMetric(doc.units) ? ' sheet-metric' : ''}`} ref={sheet} tabIndex={-1}>
        <header className="cutlist-head">
          <div>
            <h2>Cut list — {doc.name}</h2>
            {isMetric(doc.units) && <p className="sheet-units-note">Dimensions in mm</p>}
            {/* Edge banding spec §4.1: the sheet's notes (empty when nothing is banded), in the header's note style. */}
            {list.notes.map((n, i) => <p className="sheet-units-note" key={`note${i}`}>{n}</p>)}
          </div>
          <div className="cutlist-actions">
            <label className="cutlist-diagram-mode">
              Diagrams
              <select
                className="input"
                value={diagrams}
                onChange={(e) => setDiagrams(e.target.value as DiagramMode)}
              >
                <option value="none">None</option>
                <option value="joinery">Joinery only</option>
                <option value="all">All parts</option>
              </select>
            </label>
            {/* Fu 98: the project's saw kerf, read by the sheet and board packers. Max 1/2" — no saw cuts wider, and the
                store refuses anything the loader would not keep (< 1"). */}
            <div className="cutlist-kerf">
              <DimensionField label="Saw kerf" units={doc.units} value={doc.stock.kerf} min={0} max={0.5}
                onCommit={(v) => setKerf(v)} />
            </div>
            <label className="checkbox cutlist-layout-mode">
              <input
                type="checkbox"
                checked={layouts}
                onChange={(e) => setLayouts(e.target.checked)}
              />
              Layouts
            </label>
            {onOpenPrices && <button onClick={onOpenPrices}>Materials &amp; prices…</button>}
            <button onClick={() => window.print()}>Print</button>
            <button onClick={onClose} aria-label="Close cut list">✕</button>
          </div>
        </header>

        {list.groups.length === 0 ? (
          <p className="cutlist-empty">No parts yet.</p>
        ) : (
          list.groups.map((group) => (
            <section className="cutlist-group" key={group.label}>
              <h3>
                {group.label}
                {group.nesting && (
                  <span className="cutlist-layout-count"> · {group.nesting.label}</span>
                )}
              </h3>
              {group.nesting?.unplaceable.map((p) => (
                <p className="cutlist-unplaceable" key={p.boardId}>
                  {p.name} ({p.dims}) does not fit a {group.nesting!.sheet} sheet.
                </p>
              ))}
              <ul className="cutlist-rows">
                {group.rows.map((row) => (
                  <li className="cutlist-row" key={row.key}>
                    <span className="cutlist-num">{row.number}</span>
                    <span className="cutlist-qty">{row.qty} ×</span>
                    <span className="cutlist-dims">{row.dims}</span>
                    <span className="cutlist-names">
                      {row.nominal && <span className="cutlist-nominal">{row.nominal}</span>}
                      {row.nominal && ' '}
                      {row.names.join(', ')}
                    </span>
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
                    {/* The dovetail bench drawings (dovetails spec §5.2), after the diagrams under the same condition; a row
                        without a tails dovetail has no `benches` and renders exactly as before. */}
                    {(diagrams === 'all' || (diagrams === 'joinery' && row.setup.length > 0)) &&
                      row.benches?.map((bench) => <DovetailBench key={bench.key} bench={bench} />)}
                  </li>
                ))}
              </ul>
              <p className="cutlist-subtotal">
                <span className="cutlist-subtotal-label">{group.label}:</span>
                <span className="cutlist-stock">{group.stock}</span>
                <span className="cutlist-weight">{group.weight}</span>
              </p>
              {layouts && group.nesting && group.nesting.sheets.length > 0 && (
                <SheetLayout nesting={group.nesting} stock={group.sheet!} numbers={rowNumbers} />
              )}
            </section>
          ))
        )}

        {list.weight !== null && <p className="cutlist-weight-total">{list.weight}</p>}

        {hardware.length > 0 && (
          <section className="cutlist-hardware" aria-label="Hardware">
            <h3>Hardware</h3>
            <table>
              <tbody>
                {hardware.map((t) => (
                  <tr key={t.type.id}>
                    <td className="cutlist-hardware-name">{t.type.name}</td>
                    <td className="cutlist-hardware-total">{t.total}</td>
                    <td className="cutlist-hardware-uses">{hardwareUseText(t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {(purchase.entries.length > 0 || purchase.banding || purchase.hardware) && (
          <section className="cutlist-buying" aria-label="Buying">
            <h3>Buying</h3>
            {purchase.entries.map((e) => (
              <div className="cutlist-buying-entry" key={e.material}>
                <h4>{e.label}</h4>
                {e.lines.map((line, i) => <p className="cutlist-buying-line" key={`l${i}`}>{line}</p>)}
                {e.notes.map((note, i) => <p className="cutlist-buying-note" key={`n${i}`}>{note}</p>)}
                {layouts && e.layouts.map((l) => <SheetLayout key={l.key} nesting={l.nesting} stock={l.stock} noun={l.title} numbers={rowNumbers} />)}
              </div>
            ))}
            {purchase.banding && (
              <div className="cutlist-buying-entry">
                <h4>Edge banding</h4>
                {purchase.banding.lines.map((line, i) => <p className="cutlist-buying-line" key={`t${i}`}>{line}</p>)}
              </div>
            )}
            {purchase.hardware && (
              <div className="cutlist-buying-entry">
                <h4>Hardware</h4>
                {purchase.hardware.lines.map((line, i) => <p className="cutlist-buying-line" key={`h${i}`}>{line}</p>)}
              </div>
            )}
            <p className="cutlist-buying-total">{purchase.totalLabel}</p>
          </section>
        )}
      </div>
    </div>
  );
}
