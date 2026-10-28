import * as THREE from 'three';

/** The section cap's shade relative to the stock: the cut face reads as end grain, darker than every face (invariant 51). */
export const CAP_DARKEN = 0.62;
/**
 * How dark an edge line is relative to the stock it outlines. A single flat edge colour reads on pine and vanishes on walnut;
 * deriving it from the wood keeps every joint visible whatever the species.
 */
export const EDGE_DARKEN = 0.3;
/**
 * sRGB HSL lightness below which a cap is DARK, so an outline darker still would vanish into it. Measured (sRGB): walnut 0.24 and
 * cherry 0.33 below; MDF 0.475, oak 0.48, plywood 0.55, pine 0.56, maple 0.65 above. Read in sRGB, what the eye sees — three
 * stores colours linear, where every cap reads far darker.
 */
const DARK_CAP = 0.4;
/** How far a dark cap's outline is lifted toward white. */
const LIFT = 0.45;

/**
 * A section cap's outline (fu 347, the real-hardware pass 2026-10-28): it must stand out from the cap, or a tenon or tail inside its
 * socket cannot be told from the wood around it. A light cap keeps the part's edge colour, exactly as before; a dark cap's outline is
 * the cap colour lifted toward white instead.
 */
export function capOutlineColor(color: THREE.ColorRepresentation): THREE.Color {
  const cap = new THREE.Color(color).multiplyScalar(CAP_DARKEN);
  const hsl = { h: 0, s: 0, l: 0 };
  cap.getHSL(hsl, THREE.SRGBColorSpace);
  return hsl.l < DARK_CAP ? cap.lerp(new THREE.Color('#ffffff'), LIFT) : new THREE.Color(color).multiplyScalar(EDGE_DARKEN);
}
