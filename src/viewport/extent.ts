/**
 * Half-width of the working volume, in inches, shared by everything in the
 * scene that needs to cover it: the shadow camera's frustum (Viewport) and
 * the origin axis lines (OriginAxes). 120in covers a ten-foot working
 * volume, which is more than any single piece of furniture needs.
 *
 * Lives in its own module rather than being exported from Viewport.tsx
 * because Viewport.tsx imports OriginAxes — importing back from Viewport
 * would be a cycle.
 */
export const SCENE_EXTENT = 120;
