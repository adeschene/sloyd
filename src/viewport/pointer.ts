/**
 * How far the pointer may travel between press and release and still count as
 * a click rather than a drag, in screen pixels. Matches the slop R3F applies
 * to its own pointer-missed handling.
 *
 * Shared rather than duplicated: BoardMesh uses it to tell a select-click from
 * an orbit, and MoveTool uses it to tell a grab-click from an orbit. Two
 * copies of one threshold is the drift shape follow-up 64 recorded — a second
 * home for a constant that agrees today and can silently stop agreeing.
 */
export const CLICK_DRAG_SLOP_PX = 2;
