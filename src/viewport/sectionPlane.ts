import * as THREE from 'three';
import { sectionPlaneOf, type Section } from '../document/document';

/**
 * THE section plane (section-cut spec §4; invariant 51): one THREE.Plane shared by every part and edge material, so a
 * slider move changes one uniform and rebuilds nothing. Three clips the plane's NEGATIVE side.
 */
const PLANE = new THREE.Plane();
export const SECTION_PLANES: THREE.Plane[] = [PLANE];
/** A stable empty list, so a material's `clippingPlanes` prop does not change identity every render. */
export const NO_PLANES: THREE.Plane[] = [];

export function syncSectionPlane(s: Section): void {
  const { normal, constant } = sectionPlaneOf(s);
  PLANE.set(new THREE.Vector3(normal[0], normal[1], normal[2]), constant);
}
