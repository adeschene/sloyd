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

/**
 * Whether the first click of the current click pair was a drag (an orbit).
 * A dblclick's own travel is measured from its SECOND press, so it cannot see
 * that the pair began with an orbit, and an orbit followed by a click would
 * open the assembly under the cursor. Tracked on the canvas element rather
 * than in a mesh's onClick, because an orbit usually releases over a
 * different mesh, or none, and then no mesh handler runs to record it.
 */
let pressAt: [number, number] | null = null;
let pairStartedWithDrag = false;

export function clickPairStartedWithDrag(): boolean {
  return pairStartedWithDrag;
}

/** Install the pair tracking on the canvas element; returns the cleanup. */
export function watchClickPairs(el: HTMLElement): () => void {
  const down = (e: PointerEvent) => { pressAt = [e.clientX, e.clientY]; };
  const click = (e: MouseEvent) => {
    // `detail` is the browser's click count: 1 starts a possible pair.
    if (e.detail > 1) return;
    pairStartedWithDrag = pressAt !== null
      && Math.hypot(e.clientX - pressAt[0], e.clientY - pressAt[1]) > CLICK_DRAG_SLOP_PX;
  };
  el.addEventListener('pointerdown', down, true);
  el.addEventListener('click', click, true);
  return () => {
    el.removeEventListener('pointerdown', down, true);
    el.removeEventListener('click', click, true);
  };
}
