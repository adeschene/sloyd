import * as THREE from 'three';
import {
  screenPixelsPerInch,
  dashScaleForScreenPeriod,
  DASH_PERIOD_PX,
} from './screenScale';

const ORIGIN = new THREE.Vector3(0, 0, 0);

describe('screenPixelsPerInch', () => {
  it('reads the zoom factor straight off an orthographic camera', () => {
    // drei sizes the ortho frustum to the canvas in pixels, so zoom IS the
    // pixels-per-world-unit scale and distance is irrelevant.
    const camera = new THREE.OrthographicCamera();
    camera.zoom = 12;
    camera.position.set(40, 30, 40);
    expect(screenPixelsPerInch(camera, ORIGIN, 800)).toBe(12);
  });

  it('ignores distance for an orthographic camera', () => {
    const camera = new THREE.OrthographicCamera();
    camera.zoom = 12;
    camera.position.set(4000, 3000, 4000);
    expect(screenPixelsPerInch(camera, ORIGIN, 800)).toBe(12);
  });

  it('computes perspective density from distance, fov and viewport height', () => {
    // At 45deg fov, the visible world height at distance d is 2*d*tan(22.5deg).
    // d = 100, so height = 2*100*0.414214 = 82.84in; 800px / 82.84in = 9.66.
    const camera = new THREE.PerspectiveCamera(45, 1.5, 0.1, 2000);
    camera.position.set(0, 0, 100);
    expect(screenPixelsPerInch(camera, ORIGIN, 800)).toBeCloseTo(9.657, 2);
  });

  it('halves the density when the camera doubles its distance', () => {
    const camera = new THREE.PerspectiveCamera(45, 1.5, 0.1, 2000);
    camera.position.set(0, 0, 100);
    const near = screenPixelsPerInch(camera, ORIGIN, 800);
    camera.position.set(0, 0, 200);
    const far = screenPixelsPerInch(camera, ORIGIN, 800);
    expect(far).toBeCloseTo(near / 2, 4);
  });

  it('measures to the given target, not to the world origin', () => {
    const camera = new THREE.PerspectiveCamera(45, 1.5, 0.1, 2000);
    camera.position.set(0, 0, 100);
    const toOrigin = screenPixelsPerInch(camera, ORIGIN, 800);
    const toNearTarget = screenPixelsPerInch(camera, new THREE.Vector3(0, 0, 50), 800);
    // The target is half as far, so an inch there covers twice the pixels.
    expect(toNearTarget).toBeCloseTo(toOrigin * 2, 4);
  });

  it('returns NaN for a camera it cannot measure', () => {
    expect(screenPixelsPerInch(new THREE.Camera(), ORIGIN, 800)).toBeNaN();
  });
});

describe('dashScaleForScreenPeriod', () => {
  it('scales the pattern so one period covers DASH_PERIOD_PX pixels', () => {
    // 2in pattern at 10 px/in is 20px on screen; to show it as DASH_PERIOD_PX
    // the pattern has to repeat DASH_PERIOD_PX/20 as often.
    const scale = dashScaleForScreenPeriod(2, 10);
    expect(scale).toBeCloseTo(20 / DASH_PERIOD_PX, 6);
    // Sanity-check the round trip: world period * px per inch == target px.
    const worldPeriod = 2 / scale;
    expect(worldPeriod * 10).toBeCloseTo(DASH_PERIOD_PX, 6);
  });

  it('grows the scale as the line recedes, keeping screen dashes constant', () => {
    const near = dashScaleForScreenPeriod(2, 20);
    const far = dashScaleForScreenPeriod(2, 5);
    // Fewer pixels per inch means the world pattern must get longer, i.e. the
    // scale gets smaller.
    expect(far).toBeLessThan(near);
    for (const px of [20, 5]) {
      const worldPeriod = 2 / dashScaleForScreenPeriod(2, px);
      expect(worldPeriod * px).toBeCloseTo(DASH_PERIOD_PX, 6);
    }
  });

  it('falls back to plain world-space dashes for an unusable density', () => {
    // A NaN uniform would blank the line entirely, which is worse than dashes
    // of the wrong length.
    for (const bad of [Number.NaN, 0, -3, Number.POSITIVE_INFINITY]) {
      expect(dashScaleForScreenPeriod(2, bad)).toBe(1);
    }
  });

  it('falls back for a degenerate pattern length', () => {
    expect(dashScaleForScreenPeriod(0, 10)).toBe(1);
    expect(dashScaleForScreenPeriod(Number.NaN, 10)).toBe(1);
  });
});
