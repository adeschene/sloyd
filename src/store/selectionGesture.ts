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

/** A click on a part in the viewport: what it selects depends on the open assembly (assemblies spec §3.2). */
export function selectByClick(id: string, e: ToggleModifiers): void {
  useStore.getState().clickPart(id, isToggleModifier(e));
}

/** A click on a parts-list row: the row's own item, opening its parent if needed. */
export function selectRowByClick(path: string, e: ToggleModifiers): void {
  useStore.getState().selectItem(path, isToggleModifier(e));
}

/**
 * A click that hit no part. Acts only in the Select tool — a modal tool must
 * not change the selection as a side effect (cancelling a grab by clicking
 * empty space would otherwise empty the Properties panel) — and only with NO
 * modifier held, so a slightly missed Shift-click does not wipe a selection
 * built up over many clicks.
 *
 * Inside an open assembly it moves up one level, exactly as Escape's last
 * rung does (`closeAssembly`, which selects the assembly it left), the user's
 * ruling; only at the root does it clear the selection.
 */
export function clearOnMiss(e: ToggleModifiers, tool: ToolMode): void {
  if (tool !== 'select' || isToggleModifier(e)) return;
  const s = useStore.getState();
  if (s.openPath !== null) s.closeAssembly();
  else s.selectBoard(null);
}
