import * as THREE from 'three';
import { stabilizeTranslateGizmo, type ControlsInternals } from './gizmoPatch';

// The patch's per-frame body, driven on a stand-in with three-stdlib's shape: two arrow handles per axis ("fwd" and
// "bwd", sharing the axis name) in the picker and gizmo translate groups. The library's own updateMatrixWorld is a no-op
// here, so what remains after a frame is the patch's doing. A pure module since fu 17, so it can be tested at all.
function fakeControls(eye: [number, number, number], show: Partial<Record<'showX' | 'showY' | 'showZ', boolean>> = {}) {
  const group = () => {
    const g = new THREE.Group();
    for (const axis of ['X', 'Y', 'Z']) for (const tag of ['fwd', 'bwd']) {
      const h = Object.assign(new THREE.Object3D(), { tag });
      h.name = axis;
      h.scale.set(-1, -1, -1); // the library's mirrored "bwd-facing" scale
      g.add(h);
    }
    return g;
  };
  const controls = {
    gizmo: {
      updateMatrixWorld: () => {},
      picker: { translate: group() },
      gizmo: { translate: group() },
      size: 1,
      camera: null,
      worldPosition: new THREE.Vector3(),
      cameraPosition: new THREE.Vector3(),
    },
    eye: new THREE.Vector3(...eye).normalize(),
    worldQuaternion: new THREE.Quaternion(),
    space: 'world' as const,
    mode: 'translate' as const,
    ...show,
  };
  stabilizeTranslateGizmo(controls as unknown as ControlsInternals, { boardMaxExtent: { current: 10 } });
  controls.gizmo.updateMatrixWorld();
  const shown = (g: THREE.Group) =>
    g.children.filter((c) => c.visible).map((c) => `${c.name}:${(c as THREE.Object3D & { tag: string }).tag}`).sort();
  return { picker: shown(controls.gizmo.picker.translate), gizmo: shown(controls.gizmo.gizmo.translate), controls };
}

describe('stabilizeTranslateGizmo', () => {
  it('shows one forward arrow per axis, un-mirrored, and hides an axis seen end-on', () => {
    const { gizmo, picker, controls } = fakeControls([0, 0, 1]);
    expect(gizmo).toEqual(['X:fwd', 'Y:fwd']);
    expect(picker).toEqual(['X:fwd', 'Y:fwd']);
    const x = controls.gizmo.gizmo.translate.children.find((c) => c.name === 'X' && (c as never as { tag: string }).tag === 'fwd')!;
    expect(x.scale.x).toBe(1);
  });

  // Fu 19: the patch wrote `visible` unconditionally, discarding the library's showX/showY/showZ gating.
  it('keeps an axis the controls hide (showX/showY/showZ false) hidden', () => {
    const { gizmo, picker } = fakeControls([1, 1, 1], { showY: false });
    expect(gizmo).toEqual(['X:fwd', 'Z:fwd']);
    expect(picker).toEqual(['X:fwd', 'Z:fwd']);
  });

  it('an axis with no show flag set is shown (the library defaults them to true)', () => {
    expect(fakeControls([1, 1, 1]).gizmo).toEqual(['X:fwd', 'Y:fwd', 'Z:fwd']);
  });
});
