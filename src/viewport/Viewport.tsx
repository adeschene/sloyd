import { useCallback, useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Grid, OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store/store';
import { boardExtents } from '../document/document';
import type { Board } from '../document/document';
import { BoardMesh } from './BoardMesh';
import { Gizmo } from './Gizmo';
import { OriginAxes } from './OriginAxes';
import { SCENE_EXTENT } from './extent';

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

export function Viewport({ orthographic = false }: { orthographic?: boolean }) {
  const boards = useStore((s) => s.doc.boards);
  const selectedId = useStore((s) => s.selectedId);
  const selectBoard = useStore((s) => s.selectBoard);

  return (
    <Canvas shadows onPointerMissed={() => selectBoard(null)}>
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

      {/*
        One inch per cell, one foot per section — the units are the grid.
        cellSize and cellThickness stay put deliberately (see below); only
        fadeDistance changed, from 220.

        fadeDistance was 220: at that density the distant 1in grid is badly
        under-sampled, a textbook moiré generator. Measured by orbiting the
        settled camera by 2 screen pixels (no boards moving, damping fully
        decayed both times, so the only difference between the two frames is
        camera angle) and diffing far/mid/near thirds of the canvas:
        far-field changed>8=9.21% (strong>40=1.04%) at fadeDistance 220,
        vs far-field changed>8=3.14% (strong>40=0.11%) at fadeDistance 150 —
        roughly a two-thirds cut, and strong (>40/255) aliasing very nearly
        eliminated. Same test with cellThickness=0.4 instead (fadeDistance
        left at 220) moved the number only 9.21% -> 8.89%, i.e. noise:
        thickness was not the lever. cellSize=2 (doubling the world size of
        a "unit") was not tried since fadeDistance alone already closed most
        of the gap — cellSize is the one prop here that's a design decision
        ("units are the grid"), not a rendering parameter, so it's a last
        resort this fix didn't need.

        fadeDistance=120 was tried first — it cut the far-field number
        further (to 1.67%/0.04%) but drei fades <Grid> by distance from the
        *camera*, and CameraKeys' orthographic framing parks the camera at
        least 100 world units back by construction (radius*4+100). At 120
        that put the whole grid past its own fade horizon: toggling to
        Orthographic showed a bare background with no grid at all (checked
        visually, not just measured). 150 was the smallest value that kept
        the grid visible in both projections, including immediately after
        Home/F reframing — checked visually in perspective and orthographic,
        both at the default view and after reframing.
      */}
      <Grid
        args={[240, 240]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#c6c1b8"
        sectionSize={12}
        sectionThickness={1}
        sectionColor="#958f84"
        infiniteGrid
        fadeDistance={150}
        followCamera={false}
      />

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

      <OriginAxes />

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
        dampingFactor was 0.12. Measured with a 150px flick (see Grid comment
        for the far-field-only test): 300ms after release the frame was still
        4.63% different from its fully-settled state (mid-field 23%, i.e. real
        camera motion, not aliasing) — the camera was provably still creeping
        well past the "settles in ~1/3s" target. At 0.3 the same flick reads
        0.01% changed 300ms after release — effectively stationary. 0.3 also
        shortens the per-frame follow lag during an active drag from ~130ms to
        ~46ms (dampingFactor is the fraction of accumulated delta applied each
        frame, even while dragging) — still comfortably damped, not raw/1:1,
        so the drag keeps a weighted feel without the multi-frame lag that let
        the tail run on. Untested empirically: subjective "feel" of the drag
        itself, which screenshots can't capture — if a human disagrees this is
        the value to reconsider first.
      */}
      <OrbitControls makeDefault enableDamping dampingFactor={0.3} />
    </Canvas>
  );
}
