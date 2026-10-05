import { useStore } from './store';
import type { ToolMode } from './store';

/** The three modifier flags every pointer and mouse event carries. */
export interface ToggleModifiers {
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

/**
 * Shift, Ctrl or Cmd held: the click TOGGLES a part rather than replacing the
 * selection (multi-select spec §3). The ONE definition, shared by the
 * viewport's click and miss handlers and the parts list, so the two surfaces
 * cannot disagree about what Cmd means.
 */
export const isToggleModifier = (e: ToggleModifiers): boolean =>
  e.shiftKey || e.ctrlKey || e.metaKey;

/** A click on a part: plain replaces the selection, modified toggles the part. */
export function selectByClick(id: string, e: ToggleModifiers): void {
  const s = useStore.getState();
  if (isToggleModifier(e)) s.toggleSelected(id);
  else s.selectBoard(id);
}

/**
 * A click that hit no part. Clears the selection only in the Select tool —
 * a modal tool must not change the selection as a side effect (cancelling a
 * grab by clicking empty space would otherwise empty the Properties panel) —
 * and only with NO modifier held, so a slightly missed Shift-click does not
 * wipe a selection built up over many clicks.
 */
export function clearOnMiss(e: ToggleModifiers, tool: ToolMode): void {
  if (tool !== 'select' || isToggleModifier(e)) return;
  useStore.getState().selectBoard(null);
}
