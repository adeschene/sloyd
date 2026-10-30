import { useMemo, useState } from 'react';
import { useStore } from '../store/store';
import { selectRowByClick } from '../store/selectionGesture';
import { EyeIcon } from './EyeIcon';
import { treeRows, worldParts, isCovered, parentPath } from '../document/document';

export function PartsList() {
  const doc = useStore((s) => s.doc);
  const openPath = useStore((s) => s.openPath);
  const selectedIds = useStore((s) => s.selectedIds);
  const hiddenIds = useStore((s) => s.hiddenIds);
  const setHidden = useStore((s) => s.setHidden);
  const showAll = useStore((s) => s.showAll);

  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggleCollapsed = (path: string) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (!next.delete(path)) next.add(path);
      return next;
    });

  const rows = useMemo(() => treeRows(doc), [doc]);
  const hiddenSet = useMemo(() => new Set(hiddenIds), [hiddenIds]);
  const nameAt = useMemo(() => new Map(rows.map((r) => [r.path, r.name])), [rows]);
  /** The nearest hidden assembly at or above `path`, or null. */
  const nearestHidden = (path: string | null): string | null => {
    for (let p = path; p !== null; p = parentPath(p)) if (hiddenSet.has(p)) return p;
    return null;
  };
  const linkCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of worldParts(doc)) if (b.shape) m.set(b.shape, (m.get(b.shape) ?? 0) + 1);
    return m;
  }, [doc]);

  if (doc.boards.length === 0 && doc.instances.length === 0) {
    return <p className="empty">No parts yet. Add a board to begin.</p>;
  }

  return (
    <>
      {/* The count is the point: with parts hidden, an emptier model must
          never read as a bug (hide/unhide spec §4.1). */}
      {hiddenIds.length > 0 && (
        <button className="parts-show-all" onClick={showAll}>Show all ({hiddenIds.length})</button>
      )}
      <ul className="parts">
        {rows.map((r) => {
          // A row is skipped when any ancestor assembly is collapsed.
          for (let p = parentPath(r.path); p !== null; p = parentPath(p)) if (collapsed.has(p)) return null;
          const selected = selectedIds.includes(r.path);
          const hiddenSelf = hiddenIds.includes(r.path);
          const hiddenRow = isCovered(r.path, hiddenSet);
          const isCollapsed = collapsed.has(r.path);
          // The eye is dead where a toggle could not show: under a hidden
          // ANCESTOR (the ancestor's eye decides), and on the open assembly and
          // its ancestors (the open level is never hidden).
          const ancestor = parentPath(r.path);
          const coveredBy = nearestHidden(ancestor);
          const onOpenPath = openPath !== null && isCovered(openPath, new Set([r.path]));
          const eyeDisabled = coveredBy !== null || onOpenPath;
          // A dead eye says why rather than offering a Hide it cannot do (fu 227):
          // covered by a hidden ancestor, or on the open level.
          const eyeLabel = coveredBy !== null
            ? `${r.name} is hidden with ${nameAt.get(coveredBy) ?? coveredBy}`
            : onOpenPath
              ? `${r.name} is open and can't be hidden`
              : `${hiddenSelf ? 'Show' : 'Hide'} ${r.name}`;
          return (
            <li key={r.path} className={hiddenRow ? 'part-row hidden' : 'part-row'} style={{ paddingLeft: `${r.depth * 14}px` }}>
              <button
                className="part-eye"
                disabled={eyeDisabled}
                aria-label={eyeLabel}
                onClick={() => setHidden(r.path, !hiddenSelf)}
              >
                <EyeIcon hidden={hiddenRow} />
              </button>
              {r.kind === 'assembly' && (
                <button
                  className="part-caret"
                  aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${r.name}`}
                  aria-expanded={!isCollapsed}
                  onClick={() => toggleCollapsed(r.path)}
                >
                  {isCollapsed ? '▸' : '▾'}
                </button>
              )}
              {/* aria-pressed: with several parts selectable, each row is a
                  toggle. A hidden part cannot be selected (spec §1), so its
                  name is disabled and only the eye works. */}
              <button
                className={selected ? 'part selected' : 'part'}
                aria-pressed={selected}
                aria-current={r.path === openPath ? 'true' : undefined}
                disabled={hiddenRow}
                onClick={(e) => selectRowByClick(r.path, e)}
              >
                {r.name}
              </button>
              {/* Outside the name button so its accessible name stays the part's name. */}
              {r.copies && (
                <span className="part-copies" role="img" aria-label={`Shared, ${r.copies} copies`}>×{r.copies}</span>
              )}
              {r.mirrored && (
                <span className="part-mirrored" role="img" aria-label="Mirrored">⇋</span>
              )}
              {r.shape && (
                <span className="part-link" role="img" aria-label={`Linked, ${linkCount.get(r.shape)} parts`}>
                  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
                    <path d="M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 013.5 3.5l-1 1M9 11.5l-1 1A2.5 2.5 0 014.5 9l1-1" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
