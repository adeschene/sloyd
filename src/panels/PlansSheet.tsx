import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { isMetric } from '../units/length';
import { worldParts } from '../document/tree';
import { planAssemblies } from '../document/plans';
import { EXPLODE_SPREAD } from '../document/explode';
import { ExplodedFigure, PlanTrio } from './PlanFigure';

/** The sheet's own explode amount (spec §5.2): local view state, separate from the viewport's. */
const SHEET_EXPLODE = 0.6;

const mirroredNote = (n: number) => (n === 0 ? '' : n === 1 ? ' (one copy mirrored)' : ` (${n} copies mirrored)`);

/**
 * The plans sheet (spec §5). Built exactly like CutList: a direct child of `.app` with the shell
 * inert behind it, so the `.app > *:not(.cutlist-overlay)` print rule and its focus handling apply
 * unchanged — which is why it wears the `cutlist-overlay`/`cutlist-sheet` classes. Derived from the
 * store's document on every render; it formats nothing itself.
 */
export function PlansSheet({ onClose }: { onClose: () => void }) {
  const doc = useStore((s) => s.doc);
  const parts = worldParts(doc);
  const assemblies = useMemo(() => planAssemblies(doc), [doc]);
  const [amount, setAmount] = useState(SHEET_EXPLODE);
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => { sheet.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="cutlist-overlay plans-overlay" role="dialog" aria-modal="true" aria-label="Plans">
      <div className={`cutlist-sheet plans-sheet${isMetric(doc.units) ? ' sheet-metric' : ''}`} ref={sheet} tabIndex={-1}>
        <header className="cutlist-head">
          <div>
            <h2>Plans — {doc.name}</h2>
            {isMetric(doc.units) && <p className="sheet-units-note">Dimensions in mm</p>}
          </div>
          <div className="cutlist-actions">
            <label className="plans-explode">
              Explode
              <input type="range" min={0} max={1} step={0.05} value={amount}
                onChange={(e) => setAmount(Number(e.target.value))} />
            </label>
            <button onClick={() => window.print()}>Print</button>
            <button onClick={onClose} aria-label="Close plans">✕</button>
          </div>
        </header>

        {parts.length === 0 ? (
          <p className="cutlist-empty">Nothing to draw yet.</p>
        ) : (
          <>
            <section className="plans-section">
              <h3>Exploded view</h3>
              <ExplodedFigure doc={doc} amount={amount * EXPLODE_SPREAD} />
            </section>
            <section className="plans-section">
              <h3>{doc.name}</h3>
              <PlanTrio parts={parts} units={doc.units} label={doc.name} />
            </section>
            {assemblies.map((a) => (
              <section className="plans-section" key={a.definition}>
                <h3>{a.title}{a.copies > 1 ? ` × ${a.copies}` : ''}{mirroredNote(a.mirroredCopies)}</h3>
                <PlanTrio parts={a.parts} units={doc.units} label={a.title} />
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
