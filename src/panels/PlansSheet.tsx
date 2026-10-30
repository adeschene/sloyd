import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { isMetric } from '../units/length';
import { worldParts } from '../document/tree';
import { pieceKeyed, planAssemblies } from '../document/plans';
import { isAnyLine } from '../document/types';
import { EXPLODE_SPREAD } from '../document/explode';
import { ExplodedFigure, PlanTrio, SectionBlock, trioScale } from './PlanFigure';

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
  // The viewport's cut (section views spec §2.1): view state, read as the sheet renders; never saved.
  const section = useStore((s) => s.section);
  const exploded = useStore((s) => s.explode > 0);
  const parts = worldParts(doc);
  const assemblies = useMemo(() => planAssemblies(doc), [doc]);
  // Stable across the slider's ticks, so PlanTrio's memo holds (fu 263).
  const pieceKeys = useMemo(() => pieceKeyed(doc, assemblies), [doc, assemblies]);
  const [showLines, setShowLines] = useState(false);
  const allLines = useMemo(() => doc.guides.filter(isAnyLine), [doc.guides]);
  const pieceLines = showLines && allLines.length > 0 ? allLines : undefined;
  const [amount, setAmount] = useState(SHEET_EXPLODE);
  // The figure follows the slider at low priority (fu 263): an isometric of a furniture piece takes 100 ms and more to
  // draw, so the thumb moves at once and the figure catches up with the latest value, skipping the ones in between.
  const drawnAmount = useDeferredValue(amount);
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
            <label className="plans-lines">
              <input type="checkbox" checked={showLines && allLines.length > 0} disabled={allLines.length === 0}
                onChange={(e) => setShowLines(e.target.checked)} />
              Construction lines
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
              <ExplodedFigure doc={doc} amount={drawnAmount * EXPLODE_SPREAD} />
            </section>
            <section className="plans-section">
              <h3>{doc.name}</h3>
              <PlanTrio parts={parts} units={doc.units} label={doc.name} keyed={pieceKeys} section={section} bandTypes={doc.bandTypes} lines={pieceLines} />
            </section>
            {section && <SectionBlock parts={parts} section={section} units={doc.units} scale={trioScale(parts, doc.bandTypes)} exploded={exploded} bandTypes={doc.bandTypes} />}
            {assemblies.map((a) => (
              <section className="plans-section" key={a.definition}>
                <h3>{a.title}{a.copies > 1 ? ` × ${a.copies}` : ''}{mirroredNote(a.mirroredCopies)}</h3>
                <PlanTrio parts={a.parts} units={doc.units} label={a.title} keyed={a.keyed} bandTypes={doc.bandTypes} />
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
