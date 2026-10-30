import { guideCandidates, isCovered, lineFaceCandidates, sharesStorageWith, snapPointsFor } from '../document/document';
import type { Board, Guide, SnapPoint } from '../document/document';
import { visibleBoards, visibleGuides } from '../store/visibility';
import { SCENE_EXTENT } from './extent';

/**
 * The points the Move tool offers, which are two different sets rather than
 * one set with a filter.
 *
 * BEFORE a grab: the points of every SELECTED part. Boards in a real project
 * touch, so an unselected neighbour's coincident corner must not be offered —
 * pickSnapPoint's depth tie-break would silently decide which board moves.
 * Two SELECTED parts sharing a corner are harmless: both move together and
 * the two points coincide, so which one is grabbed is unobservable. With
 * nothing selected this is empty, which the toolbar's "Select a part to move"
 * hint exists to explain.
 *
 * AFTER a grab: every UNSELECTED part's points, plus the guides when shown.
 * A selected part moves with the grab, so it can never be a target (spec
 * §4.2); withholding its points is what makes that legible — an ineligible
 * point draws no marker. commitSnapMove guards the same rule for the action.
 *
 * Both branches go through snapPointsFor (box lattice + cut-owned points);
 * a cut point is most often a TARGET, on a part that is not selected.
 * GUIDES ARE TARGETS, NEVER GRAB SOURCES, so they appear after a grab only (their line crossings too, construction-lines spec §4),
 * and guides offer nothing while guides are off (`showGuides`, design §6) nor while one is HIDDEN (`hiddenGuideIds`,
 * selectable-guides spec §3.5). Where a line meets a part (`line-face`, construction-lines-2 spec §3.1) is
 * offered over the same parts as the targets: a moving part's own face hits would move with it, a hidden one's sit on
 * nothing drawn. A HIDDEN part offers no
 * points in either branch: a marker must sit on something drawn (invariant
 * 16; hide/unhide spec §3).
 *
 * A part can have several occurrences (components spec §4.1): `i1/b1` and
 * `i2/b1` are one stored part when i1 and i2 share a definition, so moving one
 * moves the other. `keyOf` (itemKey over the document) names where an item is
 * stored; after a grab, any part that is, or lies under, ANOTHER occurrence of
 * a selected item moves with the grab and is no target. Without `keyOf` every
 * path is its own item. commitSnapMove enforces the same twin rule (via
 * `sharesStorageWith`, the one predicate) on the action itself.
 */
export function moveCandidates(
  boards: readonly Board[],
  guides: Guide[],
  selectedIds: readonly string[],
  hiddenIds: readonly string[],
  grabbing: boolean,
  showGuides: boolean,
  keyOf?: (path: string) => string | null,
  hiddenGuideIds: readonly string[] = [],
): SnapPoint[] {
  // ONE filter, once, at the top (selectable-guides spec §3.5): a hidden guide offers no point, no crossing (lineCrossings
  // sees only these) and no line-face hit.
  const shownGuides = visibleGuides(guides, hiddenGuideIds);
  const selected = new Set(selectedIds);
  // A part is selected when it or any ancestor assembly is (assemblies spec).
  const covered = (b: Board) => isCovered(b.id, selected);
  // It, or an ancestor, is another occurrence of a selected item: it moves too.
  const sharesStorageOf = keyOf ? sharesStorageWith(selectedIds, keyOf) : () => false;
  const sharesStorage = (b: Board) => sharesStorageOf(b.id);
  // A hidden part offers no points at all: a marker must sit on something
  // drawn (invariant 16; hide/unhide spec §3).
  const shown = visibleBoards(boards, hiddenIds);
  if (grabbing) {
    const targets = shown.filter((b) => !covered(b) && !sharesStorage(b));
    return [
      ...targets.flatMap(snapPointsFor),
      ...(showGuides ? guideCandidates(shownGuides, SCENE_EXTENT) : []),
      ...(showGuides ? lineFaceCandidates(shownGuides, targets, SCENE_EXTENT) : []),
    ];
  }
  return shown.filter(covered).flatMap(snapPointsFor);
}
