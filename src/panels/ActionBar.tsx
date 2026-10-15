import { useState } from 'react';
import { useStore } from '../store/store';
import { EXPLODED_TITLE } from './ViewportControls';
import { CopyInRow } from './CopyInRow';
import { Popover } from './Popover';

/** `view`: the action changes only view state (a selection, hidden parts), so it stays live while exploded (fu 262). */
export interface Action { label: string; run: () => void; view?: boolean }

/** Marks where "Copy in a row…" sits in the order; the bar owns its form's open state. */
export const COPY_IN_ROW = 'copy-in-row' as const;
export type ActionEntry = Action | typeof COPY_IN_ROW;

/** The first `visible` actions as buttons, the rest under More ▾ (ui-polish spec §4.2). */
export function splitActions<T>(actions: T[], visible = 3): { shown: T[]; more: T[] } {
  return { shown: actions.slice(0, visible), more: actions.slice(visible) };
}

/**
 * The selection's actions: three visible, More ▾ for the rest, Delete as a
 * trash icon pinned right. Each Properties panel lists its actions in priority
 * order and the split is positional, so which three show follows from the order
 * (spec §4.2's table) and from the same conditions that showed each action before.
 *
 * Rendered INSIDE each panel's selection-keyed root: Copy in a row's open state
 * lives here so a selection change remounts it closed, exactly as the form
 * behaved when it owned that state itself.
 */
export function ActionBar({ actions, onDelete }: { actions: ActionEntry[]; onDelete: () => void }) {
  const [rowOpen, setRowOpen] = useState(false);
  // The bar sits OUTSIDE Properties' edit locks (fu 262): while exploded it disables each editing action itself, and
  // keeps the view actions (`view`) live — More ▾ too, when it holds one.
  const exploded = useStore((s) => s.explode > 0);
  const resolved: Action[] = actions.map((a) =>
    a === COPY_IN_ROW ? { label: 'Copy in a row…', run: () => setRowOpen(true) } : a);
  const locked = (a: Action) => exploded && !a.view;
  const { shown, more } = splitActions(resolved);
  const lockTitle = exploded ? EXPLODED_TITLE : undefined;
  return (
    <>
      <div className="action-bar">
        {shown.map((a) => <button key={a.label} onClick={a.run} disabled={locked(a)} title={locked(a) ? lockTitle : undefined}>{a.label}</button>)}
        {more.length > 0 && (more.some((a) => !locked(a))
          ? <Popover className="action-more" align="end"
              label={<>More<span aria-hidden="true"> ▾</span></>} items={more.map((a) => ({ ...a, disabled: locked(a) }))} />
          : <div className="popover action-more"><button className="popover-trigger" disabled title={lockTitle}>More<span aria-hidden="true"> ▾</span></button></div>
        )}
        <button className="action-delete danger" aria-label="Delete" title={exploded ? lockTitle : 'Delete'} disabled={exploded} onClick={onDelete}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.8 6.5v5M9.2 6.5v5" />
          </svg>
        </button>
      </div>
      <CopyInRow open={rowOpen} onOpenChange={setRowOpen} />
    </>
  );
}
