import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/store';
import { itemExtents, type Axis, type Edge } from '../document/align';
import { ALIGN_HEADING, AXIS_WORDS, SPACE_EVENLY, alignLabel, alongWord, anchorNote, spaceLabel } from '../document/alignText';

const AXES: Axis[] = [0, 1, 2];
const EDGES: Edge[] = ['min', 'centre', 'max'];

/**
 * The multi-selection panel's Align section (align spec §6): align to the item selected first, and space evenly with three or
 * more. Every string is `alignText.ts`'. The caller wraps it in `EditLock` (disabled while exploded, inv 47). A refusal is local
 * state, cleared when the selection or the document changes.
 */
export function AlignSection() {
  const doc = useStore((s) => s.doc);
  const selectedIds = useStore((s) => s.selectedIds);
  const alignItems = useStore((s) => s.alignItems);
  const distributeItems = useStore((s) => s.distributeItems);
  const [refused, setRefused] = useState<string | null>(null);
  useEffect(() => setRefused(null), [doc, selectedIds]);
  // The anchor's name, in a memo (inv 43: a selector never returns an array built from the document).
  const anchor = useMemo(() => (selectedIds.length > 0 ? itemExtents(doc, [selectedIds[0]!])[0]?.name ?? null : null), [doc, selectedIds]);
  if (selectedIds.length < 2 || anchor === null) return null;

  return (
    <div className="align-section">
      <div className="align-head">
        <h3>{ALIGN_HEADING}</h3>
        <span className="align-anchor">{anchorNote(anchor)}</span>
      </div>
      <div className="align-grid">
        {AXES.map((axis) => (
          <div className="align-row" key={axis}>
            <span className="align-axis">{AXIS_WORDS[axis].letter}</span>
            {EDGES.map((edge) => (
              <button key={edge} aria-label={alignLabel(axis, edge)} onClick={() => setRefused(alignItems(axis, edge))}>
                {AXIS_WORDS[axis][edge]}
              </button>
            ))}
          </div>
        ))}
        {selectedIds.length >= 3 && (
          <div className="align-row">
            <span className="align-axis">{SPACE_EVENLY}</span>
            {AXES.map((axis) => (
              <button key={axis} aria-label={spaceLabel(axis)} onClick={() => setRefused(distributeItems(axis))}>
                {alongWord(axis)}
              </button>
            ))}
          </div>
        )}
      </div>
      {refused && <p className="field-error" role="status">{refused}</p>}
    </div>
  );
}
