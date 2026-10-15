import { useStore } from '../store/store';
import { EXPLODED_TITLE } from './ViewportControls';

/** The project's length units (metric-display spec R1): a document edit, so it undoes and is locked while exploded. */
export function UnitsSwitch() {
  const display = useStore((s) => s.doc.units.display);
  const exploded = useStore((s) => s.explode > 0);
  const set = useStore((s) => s.setUnitsDisplay);
  const title = exploded ? EXPLODED_TITLE : undefined;
  return (
    <div className="segmented" role="group" aria-label="Units" title={title ?? 'Show and type lengths in inches or millimetres'}>
      <button aria-pressed={display === 'imperial-fractional'} disabled={exploded} onClick={() => set('imperial-fractional')}>in</button>
      <button aria-pressed={display === 'metric-mm'} disabled={exploded} onClick={() => set('metric-mm')}>mm</button>
    </div>
  );
}
