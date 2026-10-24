import { useState } from 'react';
import { useStore } from '../store/store';
import type { LeanWorld } from '../store/store';
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

/** The value every part shares within 1e-9, or null when they differ (the mixed rule). */
function shared(values: number[]): number | null {
  return values.every((v) => Math.abs(v - values[0]!) <= 1e-9) ? values[0]! : null;
}
/** The direction every part shares (a zero lean reads as the positive word), or null when the signs differ. */
function sharedSign(values: number[]): 1 | -1 | null {
  const signs = values.map((v) => (v < 0 ? -1 : 1));
  return signs.every((x) => x === signs[0]) ? signs[0]! as 1 | -1 : null;
}

/**
 * The Lean section (splayed legs spec §4): Rake and Splay in WORLD degrees for the selected placement, each a magnitude
 * field plus a direction select, the bench readout, Level the ends and Clear lean. Shown only when every selected part
 * is upright (a lean needs one; spec §3.5), inside the caller's `EditLock` (inv 47). All the maths and every refusal
 * are the store's (`setLean`, `levelEnds`); this component only shows them. A typed field owns its refusal
 * (DimensionField, R7); a select and the buttons show theirs in the section, as the other feature sections do.
 * Magnitude and direction are separate controls: a typed magnitude keeps each part's own sign, the select keeps each
 * part's own magnitude (`setLean`'s `keepSign` and `*Sign`), so a symmetric selection is never mirrored by an edit.
 */
export function Lean({ boards }: { boards: Board[] }) {
  const setLean = useStore((s) => s.setLean);
  const levelEnds = useStore((s) => s.levelEnds);
  const units = useStore((s) => s.doc.units);
  const [error, setError] = useState<string | null>(null);
  if (boards.length === 0 || !boards.every((b) => b.posture === 'upright')) return null;

  const ids = boards.map((b) => b.id);
  const degs = boards.map(worldDegrees);
  // The field shows the shared MAGNITUDE (empty only when magnitudes differ), the select the shared direction
  // ("mixed" when signs differ). A symmetric -12/+12 pair reads 12.0° / mixed.
  const rakeMag = shared(degs.map((d) => Math.abs(d.rake)));
  const splayMag = shared(degs.map((d) => Math.abs(d.splay)));
  const rakeDir = sharedSign(degs.map((d) => d.rake));
  const splayDir = sharedSign(degs.map((d) => d.splay));
  const leaning = boards.some(leans);
  const single = boards.length === 1 ? boards[0]! : null;
  // Spec §5 staleness: the part leans, carries a recognised level cut, and is not level for the lean it has.
  const stale = single !== null && leans(single) && single.angleCuts.some((c) => levelCutOf(c) !== null) && !isLevelled(single, units);
  const [wx, wz] = worldSlopes(boards[0]!);
  // The readout is the bench pair for ONE lean: shown when the selected parts share both world numbers.
  const sharedSlopes = boards.every((b) => { const [x, z] = worldSlopes(b); return Math.abs(x - wx) <= 1e-9 && Math.abs(z - wz) <= 1e-9; });
  const readout = leaning && sharedSlopes
    ? `Resultant ${resultantDeg({ x: wx, z: wz }).toFixed(1)}° · sightline ${sightlineDeg(wx, wz).toFixed(1)}° from the front edge`
    : null;

  const run = (world: LeanWorld | null) => setError(setLean(ids, world));
  /** A typed magnitude keeps EACH part's own world sign (a part at zero takes the positive word). */
  const typed = (key: 'rake' | 'splay') => (deg: number): string | void => {
    const r = setLean(ids, { [key]: deg }, { keepSign: true });
    setError(null);
    return r ?? undefined;
  };
  /** The select writes its direction to every part, each keeping its own magnitude. */
  const dir = (key: 'rake' | 'splay') => (e: React.ChangeEvent<HTMLSelectElement>) => {
    const positive = e.target.value === (key === 'rake' ? 'front' : 'right');
    run({ [`${key}Sign`]: positive ? 1 : -1 });
  };

  return (
    <>
      <h3>Lean</h3>
      <div className="field-grid field-grid-2">
        <AngleField label="Rake" value={rakeMag} max={MAX} min0 onCommit={typed('rake')} />
        <div className="field">
          <label htmlFor="rake-dir">Rake direction</label>
          <select id="rake-dir" className="input" value={rakeDir === null ? '' : rakeDir < 0 ? 'back' : 'front'} onChange={dir('rake')}>
            {rakeDir === null && <option value="" disabled>mixed</option>}
            <option value="front">toward the front</option>
            <option value="back">toward the back</option>
          </select>
        </div>
        <AngleField label="Splay" value={splayMag} max={MAX} min0 onCommit={typed('splay')} />
        <div className="field">
          <label htmlFor="splay-dir">Splay direction</label>
          <select id="splay-dir" className="input" value={splayDir === null ? '' : splayDir < 0 ? 'left' : 'right'} onChange={dir('splay')}>
            {splayDir === null && <option value="" disabled>mixed</option>}
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
