import { isCovered } from '../document/document';
import type { Board, Guide } from '../document/document';

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

/**
 * The ONE filter for "which guides are drawn and snapped to" (selectable-guides spec §3.5), beside `visibleBoards` for
 * the same reason. Every reader of `doc.guides` for drawing or snapping goes through it, so a hidden guide offers no
 * point, no crossing (`lineCrossings` sees only what this returns) and no line-face hit. Hidden guides stay in the
 * Guides list, the document, autosave, export and the Plans sheet: those readers do NOT come through here.
 *
 * Mutable `Guide[]` because `guideCandidates` and `lineFaceCandidates` take one. Returns the SAME array when nothing
 * is hidden, so a memo over it stays stable; never return its result from a selector (inv 43), filter in a memo.
 */
export function visibleGuides(guides: Guide[], hiddenGuideIds: readonly string[]): Guide[] {
  if (hiddenGuideIds.length === 0) return guides;
  const hidden = new Set(hiddenGuideIds);
  return guides.filter((g) => !hidden.has(g.id));
}
