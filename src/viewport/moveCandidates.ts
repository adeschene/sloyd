import { guideSnapPoints, snapPointsFor } from '../document/document';
import type { Board, GuidePoint, SnapPoint } from '../document/document';

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
 * GUIDES ARE TARGETS, NEVER GRAB SOURCES, so they appear after a grab only,
 * and hidden guides offer nothing (design §6).
 */
export function moveCandidates(
  boards: readonly Board[],
  guides: GuidePoint[],
  selectedIds: readonly string[],
  grabbing: boolean,
  showGuides: boolean,
): SnapPoint[] {
  const selected = new Set(selectedIds);
  if (grabbing) {
    return [
      ...boards.filter((b) => !selected.has(b.id)).flatMap(snapPointsFor),
      ...(showGuides ? guideSnapPoints(guides) : []),
    ];
  }
  return boards.filter((b) => selected.has(b.id)).flatMap(snapPointsFor);
}
