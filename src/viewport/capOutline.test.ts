import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CAP_DARKEN, EDGE_DARKEN, capOutlineColor } from './capOutline';
import { MATERIALS } from '../document/types';

/** Fu 347 (the real-hardware pass, 2026-10-28): a section cap's outline must stand out from the cap, so a tenon or a tail inside its
 *  socket can be told apart. On a light cap the outline is the part's edge colour, exactly as before; on a dark cap it is lighter. */
const l = (c: THREE.Color) => { const h = { h: 0, s: 0, l: 0 }; c.getHSL(h, THREE.SRGBColorSpace); return h.l; };

describe('capOutlineColor', () => {
  it('a light cap keeps today\'s outline exactly: the part colour × EDGE_DARKEN', () => {
    for (const m of ['pine', 'oak', 'maple', 'plywood', 'mdf']) {
      const want = new THREE.Color(MATERIALS[m]!.color).multiplyScalar(EDGE_DARKEN);
      expect(capOutlineColor(MATERIALS[m]!.color).getHex(), m).toBe(want.getHex());
    }
  });
  it('a dark cap (cherry, walnut) gets an outline at least 0.2 lighter than the cap', () => {
    for (const m of ['cherry', 'walnut']) {
      const cap = new THREE.Color(MATERIALS[m]!.color).multiplyScalar(CAP_DARKEN);
      expect(l(capOutlineColor(MATERIALS[m]!.color)) - l(cap), m).toBeGreaterThanOrEqual(0.2);
    }
  });
});
