import { clearOnMiss, selectByClick } from '../store/selectionGesture';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Grid, OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store/store';
import { visibleBoards } from '../store/visibility';
import { catalogOf, isCovered, worldParts } from '../document/document';
import { fadedFor } from './xray';
import type { Board } from '../document/document';
import { explodeOffsets, EXPLODE_SPREAD } from '../document/explode';
import { BoardMesh } from './BoardMesh';
import { Gizmo } from './Gizmo';
import { GuideMarkers } from './GuideMarkers';
import { MoveTool } from './MoveTool';
import { OriginAxes } from './OriginAxes';
import { TapeTool } from './TapeTool';
import { SCENE_EXTENT } from './extent';
import { gridDensity } from './gridDensity';
import type { GridTier } from './gridDensity';
import { screenPixelsPerInch } from './screenScale';
import { syncSectionPlane } from './sectionPlane';
import { watchClickPairs } from './pointer';
import { orthoDistance, orthoZoom, perspectiveDistance, subsetBounds, viewDirection } from './framing';
import type { StandardView } from './framing';
import type { Vec3 } from '../document/frames';
import { isTextEntry } from '../textEntry';
import type { SavedViewCamera } from '../document/types';
import { orthoHeight, orthoZoomFor, pendingPoseReady } from './viewCamera';

/** The bench top the model sits on. Light, so wood tones and shadows read. */
const GROUND = '#ebe3d4';

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
  /** The camera these controls drive. */
  object: THREE.Camera;
}

/** Tracks click pairs on the canvas element, for BoardMesh's double-click guard. */
function ClickPairs() {
  const el = useThree((s) => s.gl.domElement);
  useEffect(() => watchClickPairs(el), [el]);
  return null;
}

/**
 * `F` frames the selection, `Home` frames the whole model. Both keep the
 * current viewing direction and only change where the camera is looking from
 * and how far away it is — the framing never re-orients the model.
 *
 * `suspended` is how the cut list reaches this. The listener is on `window`,
 * so making the app's DOM inert behind the sheet does not stop it: pressing
 * `f` while reading a printable sheet would re-frame the camera invisibly and
 * hand the user back a moved view when they close it.
 */
/** Saved views' camera access (spec §5), filled by CameraKeys: the camera and controls live inside the Canvas. */
interface CameraAccess {
  get(): SavedViewCamera | null;
  /** Apply `pendingPose` now if the live camera is ready for it; otherwise the swap effect applies it later. */
  apply(): void;
}

function CameraKeys({ suspended, viewRef, pendingPose, cameraRef }: {
  suspended: boolean;
  viewRef: { current: ((v: StandardView) => void) | null };
  pendingPose: { current: SavedViewCamera | null };
  cameraRef: { current: CameraAccess | null };
}) {
  const boards = useStore((s) => worldParts(s.doc));
  const hiddenIds = useStore((s) => s.hiddenIds);
  const selectedIds = useStore((s) => s.selectedIds);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitLike | null;
  const size = useThree((s) => s.size);

  const frame = useCallback(
    (subset: readonly Board[], toward?: Vec3) => {
      // fu 260: while exploded, frame the parts where they are DRAWN — the same offsets Viewport hands
      // BoardMesh. Read at call time: framing is an event, and explodeOffsets is cached per (doc, amount).
      const s = useStore.getState();
      const offsets = s.explode > 0 ? explodeOffsets(s.doc, s.explode * EXPLODE_SPREAD) : null;
      const bounds = subsetBounds(subset, offsets);
      if (!bounds) return;
      const center = new THREE.Vector3(...bounds.center);
      const { radius } = bounds;

      // A standard view looks from its own direction; F / Home / the projection swap keep looking from
      // wherever the user already was. The camera's `up` is never written (standard-views spec §2.2).
      const dir = toward
        ? new THREE.Vector3(...toward)
        : camera.position.clone().sub(controls ? controls.target : new THREE.Vector3());
      if (dir.lengthSq() < 1e-6) dir.set(...DEFAULT_EYE);
      dir.normalize();

      if (camera instanceof THREE.OrthographicCamera) {
        camera.zoom = orthoZoom(radius, size.width, size.height);
        camera.position.copy(center).addScaledVector(dir, orthoDistance(radius));
      } else if (camera instanceof THREE.PerspectiveCamera) {
        camera.position.copy(center).addScaledVector(dir, perspectiveDistance(radius, camera.fov, camera.aspect));
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
    if (suspended) return;
    const onKey = (e: KeyboardEvent) => {
      // Never steal keys from a field the user is typing in (App's own test, fu 9).
      if (isTextEntry(e.target as HTMLElement)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      let subset: readonly Board[];
      if (e.key === 'f' || e.key === 'F') {
        // The whole selection. With nothing selected this is empty and `f`
        // does nothing, exactly as before multi-select — `Home` is the key
        // that frames everything (multi-select plan, spec clarification 1).
        const set = new Set(selectedIds);
        subset = boards.filter((b) => isCovered(b.id, set));
      } else if (e.key === 'Home') {
        subset = visibleBoards(boards, hiddenIds);
      } else {
        return;
      }
      if (subset.length === 0) return;
      e.preventDefault();
      frame(subset);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // `suspended` belongs in the dependency list, not just in the body: an
    // effect that reads a flag it does not depend on keeps the first value it
    // saw, which is invariant 15's failure shape in a listener.
  }, [boards, hiddenIds, selectedIds, frame, suspended]);

  // Swapping projection hands OrbitControls a fresh camera whose target is the
  // origin, which would throw the view away. Re-frame the model instead, once
  // per swap. The first camera is skipped so a restored document is not
  // re-framed on load.
  //
  // Wait for `controls.object === camera`. drei rebuilds OrbitControls for the
  // new camera a render AFTER the camera changes, so framing on the camera
  // alone writes the target into the OUTGOING controls, and the fresh ones,
  // targeting the origin, then turn the new camera to face it: zoomed for the
  // model but looking beside it. Measured live: the old controls took the
  // framed target and the new ones came up at [0, 0, 0].
  //
  // A saved view's restore (saved views spec §5) is the one swap that must NOT re-frame: App switches the
  // projection and hands over the saved pose as `pendingPose`, and re-framing would throw that pose away (the
  // spec's §1 anti-goal). So while a pose is pending this effect applies it — once the new camera and its
  // controls exist — and marks the camera framed, instead of framing; until then it does nothing. An
  // ordinary toggle has no pending pose and re-frames exactly as before.
  const framedCamera = useRef<THREE.Camera | null>(null);
  const applyPending = useCallback(() => {
    const pending = pendingPose.current;
    const isOrtho = camera instanceof THREE.OrthographicCamera;
    if (!pendingPoseReady(pending, isOrtho, controls !== null && controls.object === camera)) return;
    if (!pending || !controls) return;
    camera.position.set(...pending.position);
    // The camera's `up` is never written (spec §2).
    if (camera instanceof THREE.OrthographicCamera && pending.height !== undefined) {
      camera.zoom = orthoZoomFor(camera.top, camera.bottom, pending.height);
    }
    camera.updateProjectionMatrix();
    controls.target.set(...pending.target);
    controls.update();
    pendingPose.current = null;
    framedCamera.current = camera;
  }, [camera, controls, pendingPose]);

  useEffect(() => {
    if (pendingPose.current) {
      if (framedCamera.current === null) framedCamera.current = camera;
      applyPending();
      return;
    }
    if (framedCamera.current === null) {
      framedCamera.current = camera;
      return;
    }
    if (framedCamera.current === camera) return;
    if (!controls || controls.object !== camera) return;
    framedCamera.current = camera;
    // Read the boards and hiddenIds imperatively: only the projection swap
    // should re-frame, and depending on `boards` here would re-frame on every
    // board edit.
    const s = useStore.getState();
    frame(visibleBoards(worldParts(s.doc), s.hiddenIds));
  }, [camera, controls, frame, applyPending, pendingPose]);

  // Saved views (spec §5): read the live pose; apply a pending one now when the camera is already right (same
  // projection), else the swap effect above applies it once the new camera's controls exist.
  useEffect(() => {
    cameraRef.current = {
      get: () => {
        if (!controls || controls.object !== camera) return null;
        const p = camera.position;
        const t = controls.target;
        if (camera instanceof THREE.OrthographicCamera) {
          return {
            ortho: true,
            position: [p.x, p.y, p.z],
            target: [t.x, t.y, t.z],
            height: orthoHeight(camera.top, camera.bottom, camera.zoom),
          };
        }
        return { ortho: false, position: [p.x, p.y, p.z], target: [t.x, t.y, t.z] };
      },
      apply: applyPending,
    };
    return () => { cameraRef.current = null; };
  }, [camera, controls, applyPending, cameraRef]);

  // The standard views (spec §2.2): everything visible — Home's subset — from the view's direction.
  // Read imperatively: a view is an event, not a subscription.
  useEffect(() => {
    viewRef.current = (view) => {
      const s = useStore.getState();
      frame(visibleBoards(worldParts(s.doc), s.hiddenIds), viewDirection(view));
    };
    return () => { viewRef.current = null; };
  }, [frame, viewRef]);

  return null;
}

/**
 * Save image's clean frame (standard-views spec §3.2). `capture()` sets `clean`; the frame after that commit
 * renders the scene without selection, fading or tool markers and reads the canvas IN THE SAME TASK — the
 * drawing buffer is intact until the browser composites, so preserveDrawingBuffer (a cost on every frame)
 * stays off. A second call while one is in flight gets the same promise: one click, one file.
 */
function Capture({ clean, setClean, captureRef }: {
  clean: boolean;
  setClean: (v: boolean) => void;
  captureRef: { current: (() => Promise<Blob | null>) | null };
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const pending = useRef<((png: Blob | null) => void) | null>(null);
  const inFlight = useRef<Promise<Blob | null> | null>(null);

  useEffect(() => {
    captureRef.current = () => {
      if (inFlight.current) return inFlight.current;
      inFlight.current = new Promise<Blob | null>((resolve) => { pending.current = resolve; });
      setClean(true);
      return inFlight.current;
    };
    // A capture still pending at teardown resolves null and leaves nothing behind: a stale in-flight
    // promise would answer every later capture with that null, and `clean` would stay set.
    return () => {
      captureRef.current = null;
      pending.current?.(null);
      pending.current = null;
      inFlight.current = null;
      setClean(false);
    };
  }, [captureRef, setClean]);

  // useFrame's callback is refreshed in a layout effect, so `clean` here is true only once the clean
  // render has COMMITTED — the meshes and tools are already drawn clean.
  useFrame(() => {
    const resolve = pending.current;
    if (!clean || !resolve) return;
    pending.current = null;
    const finish = (png: Blob | null) => {
      inFlight.current = null;
      setClean(false);
      resolve(png);
    };
    try {
      gl.render(scene, camera);
      gl.domElement.toBlob(finish, 'image/png');
    } catch {
      finish(null);
    }
  });

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
 *
 * A metric project uses the 10 mm / 100 mm / 1 m ladder instead (gridDensity.ts).
 */
function AdaptiveGrid() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as OrbitLike | null;
  const units = useStore((s) => s.doc.units);
  // Infinitely zoomed in resolves to the finest tier of this project's ladder.
  const [tier, setTier] = useState<GridTier>(() => gridDensity(Infinity, units));

  // Re-evaluated per frame because it depends on the live camera, but only
  // committed to state when the tier actually changes — a tier change is rare
  // (a couple of zoom octaves apart), so this is a no-op on almost every frame.
  useFrame(() => {
    const target = controls ? controls.target : ORIGIN;
    const next = gridDensity(screenPixelsPerInch(camera, target, size.height), units);
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
      cellColor="#d3c7b3"
      sectionSize={tier.sectionSize}
      sectionThickness={2}
      sectionColor="#9c8f7b"
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
  /**
   * False hides the guide points AND withholds them as snap candidates.
   *
   * Not merely a render flag: a marker appearing over an invisible point is
   * the same defect the snap-move round avoided by skipping a board's volume
   * centre — an inference indicator hanging where nothing is drawn, which is
   * the opposite of its job. See the design's §6.
   */
  showGuides?: boolean;
  /**
   * True while something covers the viewport — App's `modalOpen`: the cut
   * list, or the Generate or Settings dialog. The camera shortcuts stop
   * listening — a `window` listener cannot see that the app is inert behind a
   * modal, so the flag has to be passed in. A prop rather than store state on
   * purpose: the modal flags are local view state,
   * outside the document and the undo stack, and putting it in the store to
   * save one prop would move it into the app's shared state for no gain.
   */
  shortcutsSuspended?: boolean;
  /**
   * Filled with the viewport's imperative handle (standard-views spec §2.5). The buttons live outside the
   * Canvas and the camera inside it; a view is an event, so a handle rather than a request counter in props
   * (which would replay on remount).
   */
  handleRef?: { current: ViewportHandle | null };
}

export interface ViewportHandle {
  /** Frame everything visible from a standard view (spec §2.2). */
  showView(view: StandardView): void;
  /** Render one clean frame and return it as a PNG, or null if the canvas gave none (spec §3). */
  capture(): Promise<Blob | null>;
  /** The live camera pose for a saved view (saved views spec §5); null until the camera and controls exist. */
  getCamera(): SavedViewCamera | null;
  /**
   * Put the camera at a saved pose (spec §5). App switches the projection FIRST when the view's differs; the
   * pose then waits for the new camera and its controls and replaces that swap's re-frame.
   */
  setCamera(c: SavedViewCamera): void;
}

export function Viewport({
  orthographic = false,
  showGrid = true,
  showAxes = true,
  showGuides = true,
  shortcutsSuspended = false,
  handleRef,
}: ViewportProps) {
  const boards = useStore((s) => worldParts(s.doc));
  const doc = useStore((s) => s.doc);
  const catalog = useStore((s) => catalogOf(s.doc));
  const explode = useStore((s) => s.explode);
  const section = useStore((s) => s.section);
  // The ONE shared plane follows the store before paint (invariant 51): a slider move is one uniform, no rebuild.
  useLayoutEffect(() => { if (section) syncSectionPlane(section); }, [section]);
  const offsets = useMemo(
    () => (explode > 0 ? explodeOffsets(doc, explode * EXPLODE_SPREAD) : null),
    [doc, explode],
  );
  const openPath = useStore((s) => s.openPath);
  const hiddenIds = useStore((s) => s.hiddenIds);
  const shown = useMemo(() => visibleBoards(boards, hiddenIds), [boards, hiddenIds]);
  const selectedIds = useStore((s) => s.selectedIds);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const xray = useStore((s) => s.xray);
  const tool = useStore((s) => s.tool);

  const [clean, setClean] = useState(false);
  const viewRef = useRef<((v: StandardView) => void) | null>(null);
  const captureRef = useRef<(() => Promise<Blob | null>) | null>(null);
  const pendingPose = useRef<SavedViewCamera | null>(null);
  const cameraRef = useRef<CameraAccess | null>(null);
  useEffect(() => {
    if (!handleRef) return;
    handleRef.current = {
      showView: (v) => viewRef.current?.(v),
      capture: () => captureRef.current?.() ?? Promise.resolve(null),
      getCamera: () => cameraRef.current?.get() ?? null,
      setCamera: (c) => {
        pendingPose.current = c;
        cameraRef.current?.apply();
      },
    };
    return () => { handleRef.current = null; };
  }, [handleRef]);

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
    <Canvas
      shadows
      // Local clipping is per-material and costs nothing for a material whose `clippingPlanes` is empty — the section
      // cut's materials alone pay for it (invariant 51).
      onCreated={({ gl }) => { gl.localClippingEnabled = true; }}
      dpr={[2, 3]}
      // A modal tool must not change the selection as a side effect, and a
      // modified miss must not wipe a built-up selection — both rules live
      // in clearOnMiss.
      onPointerMissed={(e) => clearOnMiss(e, tool)}
      // R3F puts `style` on the wrapping div; the canvas inherits the cursor.
      // This is the only signal, other than the toolbar, that a tool is armed.
      // Any non-select tool, not `=== 'move'`: the Tape tool arms the same
      // pointer behaviour and must not read as the Select tool.
      style={{ cursor: tool === 'select' ? undefined : 'crosshair' }}
    >
      {orthographic ? (
        <OrthographicCamera makeDefault position={DEFAULT_EYE} zoom={12} near={-2000} far={4000} />
      ) : (
        <PerspectiveCamera makeDefault position={DEFAULT_EYE} fov={45} near={0.1} far={2000} />
      )}

      <color attach="background" args={[GROUND]} />
      <hemisphereLight intensity={0.55} groundColor="#bfb29e" />
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
        raycast={() => null} makes that exclusion explicit: a handler added here
        later would register and never fire — the intent for a shadow catcher.
        NOT `raycast={null}`, though R3F reads null as the opt-out (fu 11):
        three's own Raycaster calls `object.raycast()` unconditionally, so a null
        would throw the first time anything raycast the scene directly. The
        same holds for every `() => null` in viewport/.
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
      {/* Guide markers are world positions; while exploded they would sit away from the
          parts they belong to (invariant 16). */}
      {showGuides && explode === 0 && <GuideMarkers />}

      {shown.map((board) => (
        <BoardMesh
          key={board.id}
          board={board}
          offset={offsets?.get(board.id)}
          selected={!clean && isCovered(board.id, selectedSet)}
          // Faded, but still clickable: a click outside the open assembly
          // closes it (assemblies spec §3.3). Never pass selectable={false} for this.
          // X-ray fades every part the selection does not cover (x-ray spec §3).
          faded={fadedFor(board.id, { clean, openPath, xray, selected: selectedSet })}
          onOpen={(id) => useStore.getState().openPart(id)}
          onSelect={selectByClick}
          selectable={tool === 'select'}
          color={catalog.color(board.material)}
          section={section}
          bandTypes={doc.bandTypes}
          catalog={catalog}
        />
      ))}

      {/* The gizmo's handles sit over the very board whose corner the Move
          tool is trying to grab, and it captures the pointer first. There is
          no way to share the pointer between them, so it is not rendered. */}
      {tool === 'select' && explode === 0 && <Gizmo hidden={clean} />}
      <MoveTool showGuides={showGuides} hidden={clean} />
      <TapeTool showGuides={showGuides} hidden={clean} />
      <CameraKeys suspended={shortcutsSuspended} viewRef={viewRef} pendingPose={pendingPose} cameraRef={cameraRef} />
      <Capture clean={clean} setClean={setClean} captureRef={captureRef} />
      <ClickPairs />
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
