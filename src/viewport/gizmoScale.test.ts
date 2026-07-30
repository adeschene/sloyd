import * as THREE from 'three';
import {
  GIZMO_DEFAULT_SIZE,
  GIZMO_MAX_BOARD_MULTIPLE,
  GIZMO_MIN_SIZE,
  gizmoDistanceFactor,
  gizmoSizeForExtent,
  gizmoWorldSize,
} from './gizmoScale';

/** A stand-in for the board Sloyd was actually reported against: 24in long. */
const BOARD = 24;

/**
 * The library's factor at the app's start camera, measured by driving the real
 * app rather than derived: 43.5 for a 24in board, 48.9 for a 4in one (the
 * gizmo sits at the board's centre, so a smaller board is slightly further from
 * the camera). The larger value is the demanding one for "unclamped at the
 * default view", so that is what the small-part test uses.
 */
const DEFAULT_FRAMING_FACTOR = 48.9;

function perspective(fov = 45): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(fov, 1.6, 0.1, 2000);
  return camera;
}

/** The factor the library would compute for a board `distance` from the eye. */
function factorAt(distance: number, camera = perspective()): number {
  const factor = gizmoDistanceFactor(
    camera,
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, distance),
  );
  if (factor === null) throw new Error('expected a factor');
  return factor;
}

describe('gizmoDistanceFactor', () => {
  it('scales linearly with distance under a perspective camera', () => {
    expect(factorAt(200) / factorAt(100)).toBeCloseTo(2, 10);
  });

  it('matches three-stdlib\'s perspective formula', () => {
    const camera = perspective(45);
    const expected = 100 * Math.min((1.9 * Math.tan((Math.PI * 45) / 360)) / 1, 7);
    expect(factorAt(100, camera)).toBeCloseTo(expected, 10);
  });

  it('ignores distance under an orthographic camera and reads the zoom instead', () => {
    // Zooming out in orthographic is `zoom` decreasing, not the camera moving.
    // Implementing only the perspective branch would leave the toolbar's
    // Orthographic mode completely unclamped, which is the easy thing to miss.
    const camera = new THREE.OrthographicCamera(-640, 640, 400, -400);
    camera.zoom = 12;
    const near = gizmoDistanceFactor(camera, new THREE.Vector3(), new THREE.Vector3(0, 0, 10));
    const far = gizmoDistanceFactor(camera, new THREE.Vector3(), new THREE.Vector3(0, 0, 900));
    expect(near).toBe(far);
    expect(near).toBeCloseTo(800 / 12, 10);

    camera.zoom = 2;
    const zoomedOut = gizmoDistanceFactor(camera, new THREE.Vector3(), new THREE.Vector3(0, 0, 10));
    expect(zoomedOut).toBeCloseTo(800 / 2, 10);
    expect(zoomedOut!).toBeGreaterThan(near!);
  });

  it('returns null rather than a number for a camera it cannot measure', () => {
    expect(gizmoDistanceFactor(null, new THREE.Vector3(), new THREE.Vector3())).toBeNull();
    expect(
      gizmoDistanceFactor(new THREE.Camera(), new THREE.Vector3(), new THREE.Vector3()),
    ).toBeNull();
  });
});

describe('gizmoSizeForExtent', () => {
  it('leaves the library alone at close range', () => {
    // Nothing to fix here: up close the gizmo is already smaller than the
    // board, and this clamp must never inflate a gizmo, only shrink one.
    expect(gizmoSizeForExtent(factorAt(64), BOARD)).toBe(GIZMO_DEFAULT_SIZE);
  });

  it('never exceeds the default size at any distance', () => {
    for (const distance of [1, 10, 64, 200, 500, 2000]) {
      expect(gizmoSizeForExtent(factorAt(distance), BOARD)).toBeLessThanOrEqual(
        GIZMO_DEFAULT_SIZE,
      );
    }
  });

  it('holds the gizmo at or under its share of the board once the ceiling bites', () => {
    const factor = factorAt(500);
    const size = gizmoSizeForExtent(factor, BOARD);

    // Unclamped, three-stdlib would draw arms roughly 56in long against a 24in
    // board — the reported symptom.
    expect(gizmoWorldSize(factor, GIZMO_DEFAULT_SIZE)).toBeGreaterThan(BOARD * 2);
    expect(size).toBeLessThan(GIZMO_DEFAULT_SIZE);
    expect(gizmoWorldSize(factor, size)).toBeLessThanOrEqual(
      BOARD * GIZMO_MAX_BOARD_MULTIPLE + 1e-9,
    );
  });

  it('scales the ceiling with the board, not with a fixed world size', () => {
    const factor = factorAt(500);
    expect(gizmoWorldSize(factor, gizmoSizeForExtent(factor, 96))).toBeGreaterThan(
      gizmoWorldSize(factor, gizmoSizeForExtent(factor, 12)),
    );
  });

  it('leaves small parts alone at the default framing', () => {
    // The regression GIZMO_MIN_CAP_INCHES exists to prevent. `0.75 * extent`
    // alone would shrink a 4in cleat's gizmo the moment it was selected and
    // pin a 3/4in offcut at the floor at every zoom — turning a fix about
    // zooming out into a change to close-range behaviour for cleats, spacers
    // and blocks.
    //
    // DEFAULT_FRAMING_FACTOR is measured, not derived: driving the real app
    // with the camera at its start position reads 43.5 for a 24in board and
    // 48.9 for a 4in one. The larger is the one that has to pass.
    for (const extent of [5.5, 4, 2, 0.75]) {
      expect(gizmoSizeForExtent(DEFAULT_FRAMING_FACTOR, extent)).toBe(GIZMO_DEFAULT_SIZE);
    }
    expect(gizmoSizeForExtent(43.5, 24)).toBe(GIZMO_DEFAULT_SIZE);
  });

  it('still clamps a small part once the camera actually pulls back', () => {
    // The minimum cap must not become an exemption: a 3/4in offcut viewed from
    // far away should still be clamped, just not at arm's length.
    expect(gizmoSizeForExtent(factorAt(500), 0.75)).toBeLessThan(GIZMO_DEFAULT_SIZE);
  });

  it('never shrinks past the grabbable floor, however far out the camera goes', () => {
    // The floor is the point of the whole two-sided clamp: a bare ceiling
    // would shrink the gizmo along with the board until no axis could be
    // clicked, which is a worse bug than the one being fixed.
    for (const distance of [500, 2000, 100000]) {
      expect(gizmoSizeForExtent(factorAt(distance), 0.75)).toBeGreaterThanOrEqual(
        GIZMO_MIN_SIZE,
      );
    }
    expect(gizmoSizeForExtent(factorAt(1e9), BOARD)).toBe(GIZMO_MIN_SIZE);
  });

  it('shrinks monotonically as the camera pulls back', () => {
    const distances = [64, 150, 300, 600, 1200];
    const sizes = distances.map((d) => gizmoSizeForExtent(factorAt(d), BOARD));
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]).toBeLessThanOrEqual(sizes[i - 1]);
    }
  });

  it('falls back to the default when there is nothing meaningful to clamp against', () => {
    expect(gizmoSizeForExtent(null, BOARD)).toBe(GIZMO_DEFAULT_SIZE);
    expect(gizmoSizeForExtent(Number.NaN, BOARD)).toBe(GIZMO_DEFAULT_SIZE);
    expect(gizmoSizeForExtent(0, BOARD)).toBe(GIZMO_DEFAULT_SIZE);
    expect(gizmoSizeForExtent(-5, BOARD)).toBe(GIZMO_DEFAULT_SIZE);
    // No selection / a degenerate board must not collapse the gizmo to nothing.
    expect(gizmoSizeForExtent(factorAt(500), 0)).toBe(GIZMO_DEFAULT_SIZE);
    expect(gizmoSizeForExtent(factorAt(500), Number.NaN)).toBe(GIZMO_DEFAULT_SIZE);
  });
});
