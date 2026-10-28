import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { buildCutList, flatDocument } from '../document/document';
import { LABEL_STOCKS, cellBox, defaultStock, labelsOf, pagesOf, stockCells, type LabelStock, type PartLabel } from '../document/labels';
import { CountField } from './CountField';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The Labels sheet (part labels spec §4): one sticker per piece the cut list asks for, laid onto a chosen sticker sheet at
 * true size. Built exactly like PlansSheet — a direct child of `.app` wearing `cutlist-overlay`, so the print rule applies —
 * and it formats nothing itself: every string is `labels.ts`'. The stock and the start are local view state (spec §4.3).
 */
export function LabelsSheet({ onClose }: { onClose: () => void }) {
  const doc = useStore((s) => s.doc);
  const labels = useMemo(() => {
    const flat = flatDocument(doc);
    return labelsOf(flat, buildCutList(flat));
  }, [doc]);
  const [stock, setStock] = useState<LabelStock>(() => defaultStock(doc.units));
  const [startAt, setStartAt] = useState(1);
  const pages = pagesOf(labels, stock, startAt);
  const cells = stockCells(stock);
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => { sheet.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const u = stock.unit;
  return (
    <div className="cutlist-overlay labels-overlay" role="dialog" aria-modal="true" aria-label="Labels">
      <div className={`cutlist-sheet labels-sheet labels-${stock.id}`} ref={sheet} tabIndex={-1}>
        <header className="cutlist-head labels-head">
          <div>
            <h2>Labels — {doc.name}</h2>
            <p className="sheet-units-note">{plural(labels.length, 'label', 'labels')} on {plural(pages.length, 'sheet', 'sheets')}</p>
            <p className="sheet-units-note">Print at 100% scale with margins set to None or Default; the page sets its own margins.</p>
          </div>
          <div className="cutlist-actions">
            <label className="labels-stock">
              Stock
              <select className="input" aria-label="Stock" value={stock.id}
                onChange={(e) => {
                  const next = LABEL_STOCKS.find((s) => s.id === e.target.value)!;
                  setStock(next);
                  // A start past the new sheet's cells starts the sheet again (a stock change, not a typed value).
                  if (startAt > stockCells(next)) setStartAt(1);
                }}>
                {LABEL_STOCKS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <div className="labels-start">
              <CountField key={stock.id} label="Start at" value={startAt} max={Number.MAX_SAFE_INTEGER}
                invalid={`Enter a label number from 1 to ${cells}`}
                onCommit={(n) => (n > cells ? `Enter a label number from 1 to ${cells}` : setStartAt(n))} />
            </div>
            <button onClick={() => window.print()}>Print</button>
            <button onClick={onClose} aria-label="Close labels">✕</button>
          </div>
        </header>
        {pages.map((page, p) => (
          <div className={`labels-page labels-page-${stock.page}`} key={p}>
            {page.map((label, i) => {
              const box = cellBox(stock, i);
              const style = { left: `${box.left}${u}`, top: `${box.top}${u}`, width: `${box.width}${u}`, height: `${box.height}${u}` };
              const kind = label ? '' : p === 0 && i < startAt - 1 ? ' labels-skip' : ' labels-empty';
              return (
                <div className={`labels-cell${kind}`} style={style} key={i}>
                  {label && <LabelBody label={label} />}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function LabelBody({ label }: { label: PartLabel }) {
  return (
    <>
      <div className="labels-top">
        <span className="labels-num">{label.number}</span>
        <span className="labels-name">{label.name}</span>
      </div>
      <div className="labels-size">{label.size}</div>
      {/* The grain is its own non-shrinking span: a long material name truncates, the grain never does (final review). */}
      <div className="labels-material">
        <span className="labels-matname">{label.material}</span>
        {label.grain && <><span className="labels-sep"> · </span><span className="labels-grain">{label.grain}</span></>}
      </div>
      <div className="labels-foot">
        <span className="labels-project">{label.project}</span>
        {label.copy && <span className="labels-copy">{label.copy}</span>}
      </div>
    </>
  );
}
