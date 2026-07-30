import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Grid, OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store/store';
import { boardExtents } from '../document/document';
import type { Board } from '../document/document';
import { BoardMesh } from './BoardMesh';
import { Gizmo } from './Gizmo';
import { OriginAxes } from './OriginAxes';
import { SCENE_EXTENT } from './extent';
import { gridDensity } from './gridDensity';
import type { GridTier } from './gridDensity';
import { screenPixelsPerInch } from './screenScale';

/** The bench top the model sits on. Light, so wood tones and shadows read. */
const GROUND = '#e6e3dd';

/**
 * Half-width of the shadow camera's frustum, in inches. World units here are
 * inches, and three's default is roughly ±5 — which would clip the shadow of
 * anything more than a hand's width from the origin. See SCENE_EXTENT for
 * why this is shared with OriginAxes rather than a local constant.
 */
const SHADOW_EXTENT = SCENE_EXTENT;

const DEFAULT_EYE: [number, number, number] = [40, 30, 40];

/** Reused rather than allocated per frame in AdaptiveGrid's useFrame. */
const ORIGIN = new THREE.Vector3(0, 0, 0);

/**
 * Side length of the ground grid, in inches. SCENE_EXTENT is a half-extent —
 * the origin axes run from -SCENE_EXTENT to +SCENE_EXTENT — so doubling it
 * puts the edge of the floor exactly where the axes end, and the two read as
 * one bounded modelling space rather than two objects of different sizes.
 * A 20-foot square, far larger than any single piece of furniture.
 */
const GRID_EXTENT = SCENE_EXTENT * 2;

interface OrbitLike {
  target: THREE.Vector3;
  update: () => void;
}

/**
 * `F` frames the selection, `Home` frames the whole model. Both keep the
 * current viewing direction and only change where the camera is looking from
 * and how far away it is — the framing never re-orients the model.
 */
function CameraKeys() {
  const boards = useStore((s) => s.doc.boards);
  const selectedId = useStore((s) => s.selectedId);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitLike | null;
  const size = useThree((s) => s.size);

  const frame = useCallback(
    (subset: Board[]) => {
      if (subset.length === 0) return;

      const box = new THREE.Box3();
      const corner = new THREE.Vector3();
      for (const b of subset) {
        const [ex, ey, ez] = boardExtents(b);
        corner.set(b.position[0], b.position[1], b.position[2]);
        box.expandByPoint(corner);
        box.expandByPoint(corner.clone().add(new THREE.Vector3(ex, ey, ez)));
      }
      if (box.isEmpty()) return;

      const center = box.getCenter(new THREE.Vector3());
      const extent = box.getSize(new THREE.Vector3());
      const radius = Math.max(extent.length() / 2, 1);

      // Keep looking from wherever the user already was.
      const dir = camera.position.clone().sub(controls ? controls.target : new THREE.Vector3());
      if (dir.lengthSq() < 1e-6) dir.set(...DEFAULT_EYE);
      dir.normalize();

      if (camera instanceof THREE.OrthographicCamera) {
        // Ortho size comes from zoom, not distance: drei sizes the frustum to
        // the canvas in pixels, so world-units-across = pixels / zoom.
        camera.zoom = Math.min(size.width, size.height) / (radius * 2.3);
        camera.position.copy(center).addScaledVector(dir, radius * 4 + 100);
      } else if (camera instanceof THREE.PerspectiveCamera) {
        const vfov = (camera.fov * Math.PI) / 180;
        const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
        const dist = Math.max(radius / Math.sin(vfov / 2), radius / Math.sin(hfov / 2)) * 1.15;
        camera.position.copy(center).addScaledVector(dir, dist);
      }

      camera.updateProjectionMatrix();
      if (controls) {
        controls.target.copy(center);
        controls.update();
      } else {
        camera.lookAt(center);
      }
    },
    [camera, controls, size.width, size.height],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // Never steal keys from a field the user is typing in.
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      let subset: Board[];
      if (e.key === 'f' || e.key === 'F') {
        subset = boards.filter((b) => b.id === selectedId);
      } else if (e.key === 'Home') {
        subset = boards;
      } else {
        return;
      }
      if (subset.length === 0) return;
      e.preventDefault();
      frame(subset);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [boards, selectedId, frame]);

  // Swapping projection hands OrbitControls a fresh camera whose target is the
  // origin, which would throw the view away. Re-frame the model instead. The
  // first run is skipped so a restored document is not re-framed on load.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    // Read the boards imperatively: only the projection swap should re-frame,
    // and depending on `boards` here would re-frame on every board edit.
    frame(useStore.getState().doc.boards);
  }, [camera]);

  return null;
}

/**
 * The ground grid, coarsening as the camera pulls back.
 *
 * One inch per cell is the app's unit and stays that way whenever an inch is
 * actually readable. Past that the grid steps up to feet and then to
 * twelve-foot lines rather than drawing sub-pixel lines — see gridDensity for
 * why, and note that this replaced a distance fade. The fade was only ever
 * masking the aliasing, it dissolved the grid into nothing, and because drei
 * fades by distance from the *camera* it behaved completely differently in
 * orthographic (whose framing parks the camera 100+ units back by
 * construction). fadeStrength={0} turns it off; nothing here fades.
 */
function AdaptiveGrid() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as OrbitLike | null;
  const [tier, setTier] = useState<GridTier>(() => ({ cellSize: 1, sectionSize: 12 }));

  // Re-evaluated per frame because it depends on the live camera, but only
  // committed to state when the tier actually changes — a tier change is rare
  // (a couple of zoom octaves apart), so this is a no-op on almost every frame.
  useFrame(() => {
    const target = controls ? controls.target : ORIGIN;
    const next = gridDensity(screenPixelsPerInch(camera, target, size.height));
    if (next.cellSize !== tier.cellSize) setTier(next);
  });

  return (
    <Grid
      args={[GRID_EXTENT, GRID_EXTENT]}
      cellSize={tier.cellSize}
      // Thickness is measured in render-target pixels, so it has to track the
      // dpr floor above or the lines come out at half weight in CSS pixels and
      // the whole grid looks washed out. These are the pre-supersampling
      // values (0.5 and 1) doubled.
      cellThickness={1}
      cellColor="#c6c1b8"
      sectionSize={tier.sectionSize}
      sectionThickness={2}
      sectionColor="#958f84"
      // Deliberately NOT infiniteGrid: an infinite grid has no single
      // readable density, since however coarse the tier the lines still
      // recede to the horizon and pile into a grey haze there — which is what
      // the old distance fade was really hiding. A bounded floor is honest
      // about where the modelling space is, and every line on it is legible.
      //
      // The fade is neutralised by pushing it out of range, NOT by
      // fadeStrength={0}. drei's shader computes
      //   d = 1.0 - min(dist / fadeDistance, 1.0)
      //   alpha = (g1 + g2) * pow(d, fadeStrength)
      // so beyond fadeDistance d is 0, and pow(0.0, 0.0) is UNDEFINED in
      // GLSL: it returned 1.0 on the software renderer this was first checked
      // against and NaN on real hardware, where the `alpha <= 0.0` discard
      // then cut the grid off in a hard disc that followed the camera. With a
      // fadeDistance this large, d stays within a fraction of 1 across the
      // whole floor, so the grid is uniform and only the geometry bounds it.
      // fadeFrom={0} additionally measures from the world origin rather than
      // the camera, so nothing here can track the camera again.
      fadeDistance={100000}
      fadeFrom={0}
      followCamera={false}
    />
  );
}

interface ViewportProps {
  /** True when the viewport is drawing through an orthographic camera. */
  orthographic?: boolean;
  /** False hides the ground grid entirely. */
  showGrid?: boolean;
  /** False hides the origin axis lines entirely. Independent of `showGrid`. */
  showAxes?: boolean;
}

export function Viewport({
  orthographic = false,
  showGrid = true,
  showAxes = true,
}: ViewportProps) {
  const boards = useStore((s) => s.doc.boards);
  const selectedId = useStore((s) => s.selectedId);
  const selectBoard = useStore((s) => s.selectBoard);

  // The dpr floor of 2 is an anti-aliasing measure, not a sharpness
  // preference, and it is what makes an unfaded grid viable. A 1in grid
  // inevitably has sub-pixel spacing somewhere in the frame, and supersampling
  // is the only lever that reduces the resulting moiré without hiding the
  // grid: measured by orbiting a settled camera 2 screen pixels and diffing
  // the frames, far-field churn went 6.58% (strong 1.73%) at dpr 1 to 3.17%
  // (strong 0.14%) at dpr 2 — level with what the old distance fade achieved,
  // with nothing faded away. The range form clamps devicePixelRatio rather
  // than pinning it, so a HiDPI display still renders at its native ratio
  // instead of being downsampled to 2.
  return (
    <Canvas shadows dpr={[2, 3]} onPointerMissed={() => selectBoard(null)}>
      {orthographic ? (
        <OrthographicCamera makeDefault position={DEFAULT_EYE} zoom={12} near={-2000} far={4000} />
      ) : (
        <PerspectiveCamera makeDefault position={DEFAULT_EYE} fov={45} near={0.1} far={2000} />
      )}

      <color attach="background" args={[GROUND]} />
      <hemisphereLight intensity={0.55} groundColor="#b9b2a6" />
      <directionalLight
        position={[60, 90, 40]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-SHADOW_EXTENT}
        shadow-camera-right={SHADOW_EXTENT}
        shadow-camera-top={SHADOW_EXTENT}
        shadow-camera-bottom={-SHADOW_EXTENT}
        shadow-camera-near={0.5}
        shadow-camera-far={600}
        // Boards resting on the ground are coplanar with the receiver below;
        // without this the contact line breaks up into shadow acne.
        shadow-normalBias={0.06}
      />

      {showGrid && <AdaptiveGrid />}

      {/*
        drei's <Grid> is a custom ShaderMaterial with no shadow-map sampling, so
        it can never receive a shadow. This plane is the actual receiver:
        shadowMaterial draws nothing but the shadow itself.

        It is coplanar with the grid at y=0, which without help z-fights into a
        tiled checkerboard wherever the shadow falls. Rather than lift it — a
        floating shadow detaches visibly from a board resting on the ground —
        polygonOffset biases it toward the camera in depth only, the standard
        decal treatment, and renderOrder puts it after the grid so it darkens
        the grid lines it covers instead of being painted over by them.

        Unlike <Grid> (whose raycast geometry never matches its visual
        footprint — it's identity-rotated and only *looks* horizontal via a
        shader swap), this mesh has a real rotation-x, so its raycast surface
        is a true horizontal plane matching what the user reads as "the
        ground." R3F only raycasts objects that have registered pointer
        handlers (see internal.interaction in @react-three/fiber's events
        module), and this mesh has none, so today it is already excluded from
        click hit-testing and click-to-deselect is unaffected either way.
        raycast={() => null} is kept anyway as belt-and-braces: it makes the
        exclusion explicit and correct regardless of R3F's internal event
        wiring, and protects against a future edit that adds a handler here.
      */}
      <mesh
        receiveShadow
        renderOrder={2}
        rotation-x={-Math.PI / 2}
        position-y={0}
        raycast={() => null}
      >
        <planeGeometry args={[400, 400]} />
        <shadowMaterial
          opacity={0.2}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-4}
          polygonOffsetUnits={-4}
        />
      </mesh>

      {showAxes && <OriginAxes />}

      {boards.map((board) => (
        <BoardMesh
          key={board.id}
          board={board}
          selected={board.id === selectedId}
          onSelect={selectBoard}
        />
      ))}

      <Gizmo />
      <CameraKeys />
      {/*
        Damping is OFF, and that is the fix for the grid shimmer — not a
        tuning preference.

        The tell came from the report that zooming never shimmered while
        rotating and panning always did. In three-stdlib's OrbitControls.update
        (controls/OrbitControls.js:191-238) rotate and pan are the two
        operations routed through the damping accumulator —
        `spherical.theta += sphericalDelta.theta * dampingFactor` and
        `target.addScaledVector(panOffset, dampingFactor)` — while dolly is
        applied whole: `spherical.radius = clampDistance(radius * scale)`,
        never scaled by dampingFactor. So the one input that skipped damping
        was the one input that never shimmered.

        Damping hurts twice over. During a drag it applies only dampingFactor
        of the accumulated delta per frame, so the camera advances in uneven
        decaying sub-steps that lag the pointer instead of tracking it 1:1.
        After release the residual keeps nudging the camera by ever-smaller
        amounts, and a 1px grid line still renders sub-pixel motion visibly
        long after the camera looks stopped. Raising dampingFactor 0.12 -> 0.3
        only made a smaller version of the same problem, which is why it did
        not fix the reported symptom.

        Undamped, rotate and pan track the mouse exactly and stop dead on
        release — which is also how SketchUp behaves, so it should read as
        normal rather than abrupt.
      */}
      <OrbitControls makeDefault enableDamping={false} />
    </Canvas>
  );
}
