import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/store';
import { instanceAt, partAt } from '../document/tree';
import { itemExtents } from '../document/align';
import { stretchPlan } from '../document/stretch';
import { formatLength, parseLength } from '../units/length';
import {
  AXIS_LABEL, FROM_WORD, STRETCH_AT, STRETCH_CANCEL, STRETCH_GO, STRETCH_HEADING, STRETCH_MIDDLE, previewText,
} from '../document/stretchText';

type Axis = 0 | 1 | 2;
const AXES: Axis[] = [0, 1, 2];
interface Armed { axis: Axis; sizeText: string; lineText: string }

/**
 * The Overall size section (parametric-resize spec §8): three extent fields, typing arms a stretch on that axis (nothing
 * commits on blur), a line field measured from the min face, a live preview and Stretch / Cancel. The preview is
 * `stretchPlan` on the SAME three numbers the button hands `stretchItems`, so they cannot disagree. The caller wraps it in
 * `EditLock` (disabled while exploded, inv 47). The armed state is local and dies with the selection.
 */
export function StretchSection() {
  const doc = useStore((s) => s.doc);
  const selectedIds = useStore((s) => s.selectedIds);
  const stretchItems = useStore((s) => s.stretchItems);
  const setStretchGuide = useStore((s) => s.setStretchGuide);
  const [armed, setArmed] = useState<Armed | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => { setArmed(null); setFailed(null); }, [selectedIds]);

  // Derived in memos (inv 43). One part has no section; one assembly or 2+ items do.
  const extent = useMemo(() => {
    const items = itemExtents(doc, selectedIds);
    if (items.length === 0 || (selectedIds.length === 1 && instanceAt(doc, selectedIds[0]!) === null)) return null;
    const min = [0, 1, 2].map((k) => Math.min(...items.map((i) => i.min[k]!)));
    const max = [0, 1, 2].map((k) => Math.max(...items.map((i) => i.max[k]!)));
    return { min, max };
  }, [doc, selectedIds]);

  const axis = armed?.axis ?? 0;
  const size = armed ? parseLength(armed.sizeText, doc.units) : null;
  const lineLen = armed ? parseLength(armed.lineText, doc.units) : null;
  const world = extent && lineLen !== null ? extent.min[axis]! + lineLen : null;
  const plan = useMemo(
    () => (armed && extent && size !== null && world !== null ? stretchPlan(doc, selectedIds, axis, size, world) : null),
    [armed, extent, size, world, doc, selectedIds, axis],
  );
  const grownNames = useMemo(() => {
    if (!plan || 'refused' in plan) return [];
    // The part's OWN stored name (partAt), never a flattened path name (Ruling 6).
    return plan.grows.map((occ) => partAt(doc, occ)?.name ?? occ);
  }, [plan, doc]);

  // The guide plane follows the armed line; it is view state (never in the document).
  useEffect(() => {
    setStretchGuide(armed && world !== null ? { axis, at: world } : null);
  }, [armed, world, axis, setStretchGuide]);
  useEffect(() => () => setStretchGuide(null), [setStretchGuide]);

  if (!extent) return null;
  const half = (k: Axis) => (extent.max[k]! - extent.min[k]!) / 2;
  const arm = (k: Axis, text: string) => {
    setFailed(null);
    // The line resets to the middle only when the axis changes or nothing is armed.
    setArmed((a) => ({ axis: k, sizeText: text, lineText: a && a.axis === k ? a.lineText : formatLength(half(k), doc.units) }));
  };
  const cancel = () => { setArmed(null); setFailed(null); setStretchGuide(null); };
  const refusal = plan && 'refused' in plan ? plan.refused : failed;
  const ok = plan !== null && !('refused' in plan);

  return (
    <div className="stretch-section">
      <h3>{STRETCH_HEADING}</h3>
      <div className="field-grid field-grid-3">
        {AXES.map((k) => (
          <div className="field" key={k}>
            <label htmlFor={`stretch-size-${k}`}>{AXIS_LABEL[k]}</label>
            <input id={`stretch-size-${k}`} className="input" value={armed?.axis === k ? armed.sizeText : formatLength(extent.max[k]! - extent.min[k]!, doc.units)}
              onChange={(e) => arm(k, e.target.value)} />
          </div>
        ))}
      </div>
      {armed && (
        <>
          <div className="field-grid field-grid-2">
            <div className="field">
              <label htmlFor="stretch-at">{STRETCH_AT}</label>
              <input id="stretch-at" className="input" value={armed.lineText}
                onChange={(e) => { setFailed(null); setArmed({ ...armed, lineText: e.target.value }); }} />
            </div>
            <div className="stretch-from">
              <span>{FROM_WORD[armed.axis]}</span>
              <button type="button" onClick={() => { setFailed(null); setArmed({ ...armed, lineText: formatLength(half(armed.axis), doc.units) }); }}>{STRETCH_MIDDLE}</button>
            </div>
          </div>
          {ok && <p className="field-note stretch-preview">{previewText(plan, grownNames, doc.units)}</p>}
          {refusal && <p className="field-error" role="status">{refusal}</p>}
          <div className="stretch-actions">
            <button type="button" disabled={!ok || size === null || world === null}
              onClick={() => { if (size === null || world === null) return; const r = stretchItems(axis, size, world); if (r) setFailed(r); else setArmed(null); }}>
              {STRETCH_GO}
            </button>
            <button type="button" onClick={cancel}>{STRETCH_CANCEL}</button>
          </div>
        </>
      )}
    </div>
  );
}
