import { useState } from 'react';
import { useStore } from '../store/store';
import { leans, resultantDeg, sightlineDeg, worldSlopes, degreesOf } from '../document/lean';
import { isLevelled, levelCutOf } from '../document/levelEnds';
import type { Board } from '../document/document';
import { AngleField } from './AngleField';

/** The bound each typed field offers (the 45° resultant is the store's, via `setLean`'s refusal). */
const MAX = 45;

/** The signed world degrees of a part: rake + = foot toward the front (+Z), splay + = toward the right (+X) (spec §3.1). */
function worldDegrees(b: Board): { rake: number; splay: number } {
  const [wx, wz] = worldSlopes(b);
  return { rake: degreesOf(wz), splay: degreesOf(wx) };
}

/** The value every part shares, or null when they differ (the mixed rule; exact, as the stored values are). */
function shared(values: number[]): number | null {
  return values.every((v) => v === values[0]) ? values[0]! : null;
}

/**
 * The Lean section (splayed legs spec §4): Rake and Splay in WORLD degrees for the selected placement, each a magnitude
 * field plus a direction select, the bench readout, Level the ends and Clear lean. Shown only when every selected part
 * is upright (a lean needs one; spec §3.5), inside the caller's `EditLock` (inv 47). All the maths and every refusal
 * are the store's (`setLean`, `levelEnds`); this component only shows them. A typed field owns its refusal
 * (DimensionField, R7); a select and the buttons show theirs in the section, as the other feature sections do.
 */
export function Lean({ boards }: { boards: Board[] }) {
  const setLean = useStore((s) => s.setLean);
  const levelEnds = useStore((s) => s.levelEnds);
  const units = useStore((s) => s.doc.units);
  const [error, setError] = useState<string | null>(null);
  if (boards.length === 0 || !boards.every((b) => b.posture === 'upright')) return null;

  const ids = boards.map((b) => b.id);
  const degs = boards.map(worldDegrees);
  const rake = shared(degs.map((d) => d.rake));
  const splay = shared(degs.map((d) => d.splay));
  // The magnitude a direction change re-commits: the shared one, or none when the parts differ (nothing to re-sign).
  const magnitude = (signed: number | null, all: number[]) => (signed !== null ? Math.abs(signed) : shared(all.map(Math.abs)));
  const rakeMag = magnitude(rake, degs.map((d) => d.rake));
  const splayMag = magnitude(splay, degs.map((d) => d.splay));
  const leaning = boards.some(leans);
  const single = boards.length === 1 ? boards[0]! : null;
  // Spec §5 staleness: the part leans, carries a recognised level cut, and is not level for the lean it has.
  const stale = single !== null && leans(single) && single.angleCuts.some((c) => levelCutOf(c) !== null) && !isLevelled(single, units);
  // The readout is the bench pair for ONE lean: shown when the selected parts share both world numbers.
  const [wx, wz] = worldSlopes(boards[0]!);
  const readout = leaning && rake !== null && splay !== null
    ? `Resultant ${resultantDeg({ x: wx, z: wz }).toFixed(1)}° · sightline ${sightlineDeg(wx, wz).toFixed(1)}° from the front edge`
    : null;

  const run = (world: { rake?: number; splay?: number } | null) => setError(setLean(ids, world));
  /** A typed magnitude keeps the shown direction; a zero or mixed field takes the positive word (front, right). */
  const typed = (key: 'rake' | 'splay', signed: number | null) => (deg: number): string | void => {
    const r = setLean(ids, { [key]: (signed !== null && signed < 0 ? -1 : 1) * deg });
    setError(null);
    return r ?? undefined;
  };
  /** The select re-commits the current magnitude with the new sign; parts of differing magnitude have none to re-sign. */
  const dir = (key: 'rake' | 'splay', mag: number | null) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (mag === null) return;
    const positive = e.target.value === (key === 'rake' ? 'front' : 'right');
    run({ [key]: (positive ? 1 : -1) * mag });
  };

  return (
    <>
      <h3>Lean</h3>
      <div className="field-grid field-grid-2">
        <AngleField label="Rake" value={rakeMag} max={MAX} min0 onCommit={typed('rake', rake)} />
        <div className="field">
          <label htmlFor="rake-dir">Rake direction</label>
          <select id="rake-dir" className="input" value={rake === null ? '' : rake < 0 ? 'back' : 'front'} onChange={dir('rake', rakeMag)}>
            {rake === null && <option value="" disabled>mixed</option>}
            <option value="front">toward the front</option>
            <option value="back">toward the back</option>
          </select>
        </div>
        <AngleField label="Splay" value={splayMag} max={MAX} min0 onCommit={typed('splay', splay)} />
        <div className="field">
          <label htmlFor="splay-dir">Splay direction</label>
          <select id="splay-dir" className="input" value={splay === null ? '' : splay < 0 ? 'left' : 'right'} onChange={dir('splay', splayMag)}>
            {splay === null && <option value="" disabled>mixed</option>}
            <option value="left">toward the left</option>
            <option value="right">toward the right</option>
          </select>
        </div>
      </div>
      {readout && <p className="field-note">{readout}</p>}
      {leaning && <p className="field-note">Position is the part before its lean; it leans about the centre of its top.</p>}
      {stale && <p className="field-note" role="status">Ends were levelled for a different lean — Level the ends again</p>}
      {leaning && (
        <div className="row">
          {single && <button onClick={() => setError(levelEnds(single.id))}>Level the ends</button>}
          <button onClick={() => run(null)}>Clear lean</button>
        </div>
      )}
      {error && <p className="field-error" role="alert">{error}</p>}
    </>
  );
}
