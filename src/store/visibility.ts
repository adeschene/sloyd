import { isCovered } from '../document/document';
import type { Board } from '../document/document';

/**
 * The ONE filter for "which parts are drawn and touchable" (hide/unhide spec
 * §3). Every viewport reader goes through it; a second hand-written filter is
 * a second decider for one question. In the store layer, which owns
 * `hiddenIds`, because the viewport and moveCandidates both need it. The
 * selection's own filter, over ids rather than boards, lives in selectionPatch.
 *
 * A part is hidden when it or any assembly above it is (assemblies spec §3.4).
 *
 * Returns the same array when nothing is hidden, so a useMemo over it does not
 * hand its consumers a new array on every render.
 */
export function visibleBoards(boards: readonly Board[], hiddenIds: readonly string[]): readonly Board[] {
  if (hiddenIds.length === 0) return boards;
  const hidden = new Set(hiddenIds);
  return boards.filter((b) => !isCovered(b.id, hidden));
}
