import { useMemo } from 'react';
import { useStore } from '../store/store';
import { displayNames, isCovered, worldParts } from '../document/document';
import type { DimAnchor } from '../document/types';
import { dimensionValue } from '../document/placedDims';
import { formatLength } from '../units/length';

/**
 * The placed dimensions a project carries (placed-dimensions spec §5), in stored order. A row reads
 * `Y 29"`, then what it spans by `flatDocument`'s path names (inv 46; `displayNames` is their one builder) or `a point`
 * for a world-fixed end. A detached row says `(part deleted)`, a row on a hidden part `(hidden)`; both stay deletable.
 * Hover sets the store's `hoveredDimension` (view state) so the viewport emphasises it.
 */
export function DimensionsList() {
  const doc = useStore((s) => s.doc);
  const hiddenIds = useStore((s) => s.hiddenIds);
  const removeDimension = useStore((s) => s.removeDimension);
  const setHovered = useStore((s) => s.setHoveredDimension);

  const rows = useMemo(() => {
    const parts = worldParts(doc);
    const names = displayNames(doc);
    const hidden = new Set(hiddenIds);
    const end = (a: DimAnchor) => ('part' in a ? names.get(a.part) ?? 'a deleted part' : 'a point');
    return doc.dimensions.map((d) => {
      const value = dimensionValue(parts, d);
      const isHidden = [d.a, d.b].some((a) => 'part' in a && isCovered(a.part, hidden));
      const state = value === null ? '(part deleted)' : isHidden ? '(hidden)' : '';
      const text = value === null ? d.axis.toUpperCase() : `${d.axis.toUpperCase()} ${formatLength(value, doc.units)}`;
      return { id: d.id, text, span: `${end(d.a)} to ${end(d.b)}`, state };
    });
  }, [doc, hiddenIds]);

  return (
    <ul className="guides dimensions">
      {rows.map((r) => (
        <li key={r.id} data-dimension-id={r.id} className="guide-row dimension-row"
          onMouseEnter={() => setHovered(r.id)} onMouseLeave={() => setHovered(null)}>
          <span className="guide-coords dimension-text">
            {r.text} <span className="dimension-span">{r.span}</span>
            {r.state && <span className="dimension-state"> {r.state}</span>}
          </span>
          <button className="guide-remove" aria-label="Delete dimension" onClick={() => removeDimension(r.id)}>✕</button>
        </li>
      ))}
    </ul>
  );
}
