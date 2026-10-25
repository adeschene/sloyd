/**
 * The design checks' two world tolerances, in a LEAF module (imports nothing) so the modules the checks read — Bore leg
 * sockets (`legSockets.ts`) and the tenon joint (`tenonJoints.ts`) — can share them without an import cycle through
 * `designCheck.ts`, which re-exports both (every existing import site stays valid).
 */

/** Inches: how near two faces must come to touch, and how far two solids must interpenetrate to overlap. Do not raise it
 *  to make joints pass (inv 38). */
export const TOUCH = 1 / 32;

/**
 * A RESTING contact's least plan area, in square inches: float noise only. Leaned vertices carry ~1e-15in of error
 * (`leanMap`'s one rotation), so two faces meeting only along an edge or at a corner clip to a sliver of area ~1e-15 times
 * the face's size (well under 1e-9 for any part under 10,000in); the least real contact the unleaned rule accepts is
 * TOUCH × TOUCH ≈ 1e-3. Never a design tolerance: do not raise it to make a contact fail, nor drop it to 0.
 */
export const REST_AREA = 1e-9;
