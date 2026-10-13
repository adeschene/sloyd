# Standard Views and Image Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-click Front / Side / Top / Iso views in the viewport, a "Save image" button that downloads a clean PNG of the
view, and F / Home / views framing the exploded positions while exploded (fu 260).

**Architecture:** The framing arithmetic and the view table move into a pure, tested `viewport/framing.ts` that reads
the Plans sheet's `FRONT`/`SIDE`/`TOP`/`ISO`. `Viewport` exposes an imperative `ViewportHandle` (`showView`,
`capture`) that `App` hands to `ViewportControls` as callbacks. A capture flips a `clean` flag for one frame (no
selection colour, no fading, tools hidden via a `hidden` prop — never unmounted), renders, and reads the canvas with
`toBlob`; the PNG leaves through a new `StorageAdapter.exportImage`.

**Tech Stack:** React 19, react-three-fiber + drei (three-stdlib `OrbitControls`), Zustand, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-13-sloyd-standard-views-image-design.md` (approved; amended while planning in
§2.2 and §3.2 — read both).

## Global Constraints

- No schema change: `CURRENT_VERSION` stays 14; nothing writes the document; no undo entry from a view or a capture.
- The camera's `up` stays +Y for every view (spec §2.2). Top tilts `TOP_TILT = 1e-4` rad toward +Z.
- The viewport never restates a view's axes: they are read from `FRONT`, `SIDE`, `TOP`, `ISO` in `src/document/drawing.ts`.
- `Gizmo`, `MoveTool`, `TapeTool` are hidden by a `hidden` prop that returns null AFTER every hook — never unmounted for
  a capture.
- `preserveDrawingBuffer` stays off; the canvas is read with `toBlob` in the same task as `gl.render`.
- Every download goes through `StorageAdapter` (CLAUDE.md, storage seam). File name: `<sanitized project name>.png`.
- Error copy, verbatim: `Could not save the image.` in a `role="alert"` span with class `field-error`.
- Button copy, verbatim: `Front`, `Side`, `Top`, `Iso`, `Save image`. Titles: `Look at the front of the piece`,
  `Look at the right side of the piece`, `Look down on the piece from above`, `Look from the front-right corner, above`,
  `Save a PNG of the view, without the selection or tool markers`.
- The view controls stay OUTSIDE the edit lock: views and Save image work while exploded.
- `npm test` does not typecheck; `npm run build` is the gate before any "it compiles" claim.
- The r3f viewport has no unit tests by design; viewport behaviour is verified in the dev-server browser (Task 6).

## Review Focus

1. **A second click on Save image while one is saving** — expect one download. Pinned in Task 5 (the button disables
   while its promise is pending; test clicks twice) and, defensively, `capture()` returns the in-flight promise (Task 4).
2. **Saving with a part selected, an assembly open and the Tape tool anchored** — expect a clean PNG and, afterwards,
   the selection, the open assembly and the tape anchor all still there. Pinned in Task 6's browser pass (viewport,
   no unit tests by design); Task 4 keeps the tools mounted precisely for this.
3. **An empty or punctuation-only project name** — expect `sloyd-project.png`, never `.png`. Pinned in Task 3.
4. **A narrow window** — expect the View group to wrap, not run under the Tools group. Pinned in Task 6 at 1024 px.
5. **Top, then an immediate orbit drag** — expect the orbit to start from "front at the bottom", no spin. Pinned in
   Task 1 (the tilt makes `Y × toward` non-zero and points screen right at +X) and Task 6 (a live drag).

---

### Task 1: `viewport/framing.ts` — the pure framing and the view table

**Files:**
- Create: `src/viewport/framing.ts`
- Test: `src/viewport/framing.test.ts`

**Interfaces:**
- Consumes: `Board`, `boardExtents`, `worldParts`, `createBoard`, `createDocument` from `../document/document`;
  `Vec3` from `../document/frames`; `FRONT`, `SIDE`, `TOP`, `ISO`, `View` from `../document/drawing`;
  `explodeOffsets` from `../document/explode`.
- Produces:
  - `type StandardView = 'front' | 'side' | 'top' | 'iso'`
  - `const STANDARD_VIEWS: Readonly<Record<StandardView, View>>`
  - `const TOP_TILT = 1e-4`
  - `function viewDirection(view: StandardView): Vec3` — unit vector, target → camera
  - `interface Bounds { center: Vec3; radius: number }`
  - `function subsetBounds(subset: readonly Board[], offsets?: ReadonlyMap<string, Vec3> | null): Bounds | null`
  - `function orthoZoom(radius: number, width: number, height: number): number`
  - `function orthoDistance(radius: number): number`
  - `function perspectiveDistance(radius: number, fovDeg: number, aspect: number): number`

- [ ] **Step 1: Write the failing tests**

```ts
// src/viewport/framing.test.ts
import { createBoard, createDocument, worldParts } from '../document/document';
import type { SloydDocument } from '../document/document';
import type { Vec3 } from '../document/frames';
import { FRONT, ISO, SIDE, TOP } from '../document/drawing';
import { explodeOffsets } from '../document/explode';
import {
  STANDARD_VIEWS, TOP_TILT, orthoDistance, orthoZoom, perspectiveDistance, subsetBounds, viewDirection,
} from './framing';
import type { StandardView } from './framing';

const cube = (id: string, position: Vec3, size = 2) =>
  createBoard({ id, name: id, length: size, width: size, thickness: size, position });
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v: Vec3): Vec3 => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; };
const expectVec = (got: Vec3, want: Vec3, digits = 12) => want.forEach((w, k) => expect(got[k]).toBeCloseTo(w, digits));

describe('the standard views are the Plans sheet views', () => {
  it('maps each button to the sheet constant of the same name', () => {
    expect(STANDARD_VIEWS).toEqual({ front: FRONT, side: SIDE, top: TOP, iso: ISO });
  });

  // The camera's up stays +Y (spec §2.2), so lookAt gives screen right = unit(Y × toward) and
  // screen up = unit(toward × right). Computed HERE from the direction, never read from the module.
  it.each<StandardView>(['front', 'side', 'top', 'iso'])('%s: camera direction and screen axes match the sheet', (v) => {
    const sheet = STANDARD_VIEWS[v];
    const d = viewDirection(v);
    expect(Math.hypot(...d)).toBeCloseTo(1, 12);
    const right = unit(cross([0, 1, 0], d));
    const up = unit(cross(d, right));
    const digits = v === 'top' ? 3 : 12; // Top is off its axis by TOP_TILT
    expectVec(d, sheet.toward, digits);
    expectVec(right, sheet.right, digits);
    expectVec(up, sheet.up, digits);
  });

  it('tilts Top toward +Z by TOP_TILT, so screen right is +X, not undefined', () => {
    const d = viewDirection('top');
    expect(Math.atan2(d[2], d[1])).toBeCloseTo(TOP_TILT, 12);
    expect(d[0]).toBe(0);
  });
});

describe('subsetBounds', () => {
  it('is null for an empty subset', () => {
    expect(subsetBounds([])).toBeNull();
  });

  it('boxes the parts: two 2in cubes at x 0 and x 10 → centre (6,1,1), radius max(|(12,2,2)|/2, 1)', () => {
    const b = subsetBounds([cube('a', [0, 0, 0]), cube('b', [10, 0, 0])])!;
    expectVec(b.center, [6, 1, 1]);
    expect(b.radius).toBeCloseTo(Math.sqrt(144 + 4 + 4) / 2, 12);
  });

  it('floors the radius at 1in', () => {
    expect(subsetBounds([cube('a', [0, 0, 0], 0.5)])!.radius).toBe(1);
  });

  it('fu 260: boxes the parts where they are DRAWN when offsets are given', () => {
    const parts = [cube('a', [0, 0, 0]), cube('b', [10, 0, 0])];
    const offsets = new Map<string, Vec3>([['b', [5, 0, 3]]]);
    const b = subsetBounds(parts, offsets)!;
    // a: x 0..2, z 0..2; b drawn at x 15..17, z 3..5 → x 0..17, y 0..2, z 0..5
    expectVec(b.center, [8.5, 1, 2.5]);
    expect(b.radius).toBeCloseTo(Math.sqrt(17 * 17 + 2 * 2 + 5 * 5) / 2, 12);
    expect(subsetBounds(parts, null)).toEqual(subsetBounds(parts));
  });

  it('fu 260: explodeOffsets keys every world part by the id worldParts gives it', () => {
    const doc: SloydDocument = {
      ...createDocument('Explode'),
      boards: [cube('r', [10, 0, 0])],
      instances: [{ id: 'i', name: 'Box', definition: 'd', position: [0, 0, 0], rotation: 0 }],
      definitions: [{ id: 'd', boards: [cube('p', [0, 0, 0]), cube('q', [4, 0, 0])], instances: [] }],
    };
    const parts = worldParts(doc);
    const offsets = explodeOffsets(doc, 1);
    for (const p of parts) expect(offsets.has(p.id)).toBe(true);
    expect(subsetBounds(parts, offsets)).not.toEqual(subsetBounds(parts));
  });
});

describe('camera distance and zoom (today\'s formulas, hand values)', () => {
  it('orthographic: zoom = min(w, h) / (2.3 r); distance = 4r + 100', () => {
    expect(orthoZoom(10, 800, 460)).toBeCloseTo(460 / 23, 12);
    expect(orthoDistance(10)).toBe(140);
  });

  it('perspective: the larger of the vertical and horizontal fits, × 1.15', () => {
    // fov 90°, aspect 1: both half-angles 45°, so r / sin 45° = r·√2; × 1.15
    expect(perspectiveDistance(10, 90, 1)).toBeCloseTo(10 * Math.SQRT2 * 1.15, 9);
    // aspect 0.5 (tall): hfov = 2·atan(tan 45° · 0.5) = 2·atan(0.5); sin(atan 0.5) = 1/√5 → r·√5 wins
    expect(perspectiveDistance(10, 90, 0.5)).toBeCloseTo(10 * Math.sqrt(5) * 1.15, 9);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/viewport/framing.test.ts`
Expected: FAIL — `Failed to resolve import "./framing"`.

- [ ] **Step 3: Implement**

```ts
// src/viewport/framing.ts
import { boardExtents } from '../document/document';
import type { Board } from '../document/document';
import type { Vec3 } from '../document/frames';
import { FRONT, ISO, SIDE, TOP } from '../document/drawing';
import type { View } from '../document/drawing';

/**
 * The pure half of the viewport's framing (standard-views spec §2.3): what box a set of parts occupies,
 * and how far / how zoomed a camera must be to see it. `CameraKeys` does the three.js half.
 */

export type StandardView = 'front' | 'side' | 'top' | 'iso';

/** The Plans sheet's views. The viewport never restates their axes (spec §2.1). */
export const STANDARD_VIEWS: Readonly<Record<StandardView, View>> = { front: FRONT, side: SIDE, top: TOP, iso: ISO };

/**
 * Top's tilt toward +Z, in radians (spec §2.2). Straight down, `Y × toward` is zero and both the screen
 * orientation and OrbitControls' azimuth are decided by float noise; the tilt makes them "front at the bottom".
 */
export const TOP_TILT = 1e-4;

/** Unit vector from the target TO the camera. */
export function viewDirection(view: StandardView): Vec3 {
  const [x, y, z] = STANDARD_VIEWS[view].toward;
  if (Math.abs(y) < 1 - 1e-9) return [x, y, z];
  return [0, Math.cos(TOP_TILT), Math.sin(TOP_TILT)];
}

export interface Bounds { center: Vec3; radius: number }

/**
 * The box around `subset`, each part translated by its `offsets` entry when there is one (fu 260: while
 * exploded the parts are framed where they are DRAWN). Same arithmetic as the THREE.Box3 it replaces, so
 * framing at explode 0 is unchanged.
 */
export function subsetBounds(subset: readonly Board[], offsets?: ReadonlyMap<string, Vec3> | null): Bounds | null {
  if (subset.length === 0) return null;
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const b of subset) {
    const e = boardExtents(b);
    const o = offsets?.get(b.id);
    for (let k = 0; k < 3; k++) {
      const min = b.position[k]! + (o ? o[k]! : 0);
      lo[k] = Math.min(lo[k]!, min);
      hi[k] = Math.max(hi[k]!, min + e[k]!);
    }
  }
  const size: Vec3 = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  return {
    center: [(lo[0] + hi[0]) * 0.5, (lo[1] + hi[1]) * 0.5, (lo[2] + hi[2]) * 0.5],
    radius: Math.max(Math.sqrt(size[0] * size[0] + size[1] * size[1] + size[2] * size[2]) / 2, 1),
  };
}

/** Ortho size comes from zoom, not distance: drei sizes the frustum to the canvas in pixels. */
export function orthoZoom(radius: number, width: number, height: number): number {
  return Math.min(width, height) / (radius * 2.3);
}

export function orthoDistance(radius: number): number {
  return radius * 4 + 100;
}

export function perspectiveDistance(radius: number, fovDeg: number, aspect: number): number {
  const vfov = (fovDeg * Math.PI) / 180;
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
  return Math.max(radius / Math.sin(vfov / 2), radius / Math.sin(hfov / 2)) * 1.15;
}
```

If `Vec3` indexing needs no `!` under this repo's `noUncheckedIndexedAccess` setting, drop the `!`s; follow
whatever `npm run build` demands.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/viewport/framing.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Mutate the tests (CLAUDE.md: mutate, don't just run)**

One at a time, each must turn a test red, then revert:
1. In `STANDARD_VIEWS`, swap `front: SIDE, side: FRONT` → the mapping test and two axis tests fail.
2. In `viewDirection`, return `[0, 1, 0]` for Top → Top's axis test fails (NaN right) and the tilt test fails.
3. Tilt toward −Z (`-Math.sin(TOP_TILT)`) → Top's axis test fails (right = −X).
4. In `subsetBounds`, ignore `offsets` → both fu 260 tests fail.

- [ ] **Step 6: Commit**

```bash
git add src/viewport/framing.ts src/viewport/framing.test.ts
git commit -m "feat(viewport): framing.ts — the standard-view table and the pure framing, with offsets (fu 260)"
```

---

### Task 2: `CameraKeys` frames through `framing.ts`, exploded-aware; `showView` behind a `ViewportHandle`

**Files:**
- Modify: `src/viewport/Viewport.tsx` (`CameraKeys`, lines ~62-186; `ViewportProps` ~252-278; `Viewport` ~280-450)

**Interfaces:**
- Consumes: Task 1's `subsetBounds`, `orthoZoom`, `orthoDistance`, `perspectiveDistance`, `viewDirection`, `StandardView`.
- Produces (exported from `src/viewport/Viewport.tsx`):
  ```ts
  export interface ViewportHandle {
    /** Frame everything visible from a standard view (spec §2.2). */
    showView(view: StandardView): void;
    /** Render one clean frame and return it as a PNG, or null if the canvas gave none (spec §3). */
    capture(): Promise<Blob | null>;
  }
  // new ViewportProps member:
  handleRef?: { current: ViewportHandle | null };
  ```
  `capture` resolves `null` until Task 4 fills it.

- [ ] **Step 1: Rewrite `frame` on `framing.ts`, reading the explode offsets at call time (fu 260)**

Replace the body of `frame` in `CameraKeys` (and add the imports `subsetBounds, orthoZoom, orthoDistance,
perspectiveDistance, viewDirection` and `type StandardView` from `./framing`, `type Vec3` from `../document/frames`):

```tsx
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
      // wherever the user already was.
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
```

Keep the existing "Ortho size comes from zoom" comment by moving its sentence onto `orthoZoom` (done in Task 1). The
`frame(subset)` calls in the keydown handler and the projection-swap effect are unchanged. The camera's `up` is never
written (spec §2.2).

- [ ] **Step 2: Register `showView` from `CameraKeys`**

Change the signature to
`function CameraKeys({ suspended, viewRef }: { suspended: boolean; viewRef: { current: ((v: StandardView) => void) | null } })`
and add, after the projection-swap effect:

```tsx
  // The standard views (spec §2.2): everything visible — Home's subset — from the view's direction.
  // Read imperatively: a view is an event, not a subscription.
  useEffect(() => {
    viewRef.current = (view) => {
      const s = useStore.getState();
      frame(visibleBoards(worldParts(s.doc), s.hiddenIds), viewDirection(view));
    };
    return () => { viewRef.current = null; };
  }, [frame, viewRef]);
```

- [ ] **Step 3: The handle on `Viewport`**

Add to `ViewportProps`:

```tsx
  /**
   * Filled with the viewport's imperative handle (spec §2.5). The buttons live outside the Canvas and the
   * camera inside it; a view is an event, so a handle rather than a request counter in props (which would
   * replay on remount).
   */
  handleRef?: { current: ViewportHandle | null };
```

Export the `ViewportHandle` interface (Interfaces above) next to `ViewportProps`. In `Viewport`, destructure
`handleRef`, and add before `return (`:

```tsx
  const viewRef = useRef<((v: StandardView) => void) | null>(null);
  const captureRef = useRef<(() => Promise<Blob | null>) | null>(null);
  useEffect(() => {
    if (!handleRef) return;
    handleRef.current = {
      showView: (v) => viewRef.current?.(v),
      capture: () => captureRef.current?.() ?? Promise.resolve(null),
    };
    return () => { handleRef.current = null; };
  }, [handleRef]);
```

and pass `viewRef` to `<CameraKeys suspended={shortcutsSuspended} viewRef={viewRef} />`. (`captureRef` is filled in
Task 4.)

- [ ] **Step 4: Typecheck and run everything**

Run: `npm run build && npm test`
Expected: build succeeds; all tests pass (same count as before plus Task 1's).

- [ ] **Step 5: Commit**

```bash
git add src/viewport/Viewport.tsx
git commit -m "feat(viewport): CameraKeys frames via framing.ts and frames exploded parts where drawn (fu 260); showView handle"
```

---

### Task 3: `StorageAdapter.exportImage`

**Files:**
- Modify: `src/storage/types.ts` (the `StorageAdapter` interface, beside `exportProject`)
- Modify: `src/storage/browser.ts:502-516` (`exportProject`), `:692` (`sanitizeFilename`)
- Test: `src/storage/browser.test.ts` (beside `describe('exportProject')`, line ~242)

**Interfaces:**
- Produces: `exportImage(name: string, png: Blob): Promise<void>` on `StorageAdapter` and `BrowserStorageAdapter`.

- [ ] **Step 1: Write the failing tests**

Add after the `exportProject` describe block, reusing its stubbing pattern:

```ts
describe('exportImage', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  const captureAnchor = () => {
    const seen: { a?: HTMLAnchorElement } = {};
    vi.spyOn(document.body, 'appendChild').mockImplementation(function (this: HTMLElement, node: Node) {
      if (node instanceof HTMLAnchorElement) seen.a = node;
      return HTMLElement.prototype.appendChild.call(this, node) as Node;
    });
    return seen;
  };
  const png = () => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });

  it('downloads the given PNG as <sanitized name>.png', async () => {
    const a = new BrowserStorageAdapter(new FakeStorage());
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const seen = captureAnchor();
    const blob = png();
    await a.exportImage('My Bench!', blob);
    expect(seen.a?.download).toBe('My-Bench.png');
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
  });

  it('falls back to sloyd-project.png for a name with nothing usable in it', async () => {
    const a = new BrowserStorageAdapter(new FakeStorage());
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const seen = captureAnchor();
    await a.exportImage('!!!', png());
    expect(seen.a?.download).toBe('sloyd-project.png');
  });

  it('removes the anchor and revokes the object URL even when click() throws', async () => {
    const a = new BrowserStorageAdapter(new FakeStorage());
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { throw new Error('blocked by CSP'); });
    const seen = captureAnchor();
    await expect(a.exportImage('Bench', png())).rejects.toThrow('blocked by CSP');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    expect(document.body.contains(seen.a!)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/storage/browser.test.ts -t exportImage`
Expected: FAIL — `a.exportImage is not a function`.

- [ ] **Step 3: Implement — one download helper for both exports**

In `src/storage/types.ts`, beside `exportProject`:

```ts
  /** Offer a PNG for download as `<name>.png`. Rejects if triggering the download throws. */
  exportImage(name: string, png: Blob): Promise<void>;
```

In `src/storage/browser.ts`, replace `exportProject`'s body and add `exportImage`, with a module-level helper beside
`sanitizeFilename`:

```ts
  async exportProject(doc: SloydDocument): Promise<void> {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    download(blob, `${sanitizeFilename(doc.name)}.sloyd`);
  }

  async exportImage(name: string, png: Blob): Promise<void> {
    download(png, `${sanitizeFilename(name)}.png`);
  }
```

```ts
/** The one anchor download, shared by both exports so they cannot drift. */
function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = window.document.createElement('a');
  a.href = url;
  a.download = filename;
  window.document.body.appendChild(a);
  try {
    a.click();
  } finally {
    // Always clean up, even if click() throws (sandboxed iframe, CSP, etc.) —
    // otherwise the anchor stays in the DOM and the blob URL leaks.
    a.remove();
    URL.revokeObjectURL(url);
  }
}
```

(Move the existing cleanup comment, don't duplicate it.) In `src/App.test.tsx`, add beside `exportProject` (line ~245):
`const exportImage = vi.fn().mockResolvedValue(undefined);`, in the mocked `storage` object
`exportImage: (...args: unknown[]) => exportImage(...args),`, and in the reset block
`exportImage.mockReset().mockResolvedValue(undefined);`.

- [ ] **Step 4: Run to verify**

Run: `npx vitest run src/storage/browser.test.ts && npm run build`
Expected: PASS (exportProject's tests unchanged and still green); build succeeds.

- [ ] **Step 5: Mutate** — make `download` skip `a.remove()` when click throws (move it out of `finally`): the
  throwing test fails for both exports. Revert.

- [ ] **Step 6: Commit**

```bash
git add src/storage/types.ts src/storage/browser.ts src/storage/browser.test.ts src/App.test.tsx
git commit -m "feat(storage): exportImage on the storage seam; one download helper for both exports"
```

---

### Task 4: The clean frame — `capture()`

**Files:**
- Modify: `src/viewport/Viewport.tsx` (new `Capture` component; `clean` state; `BoardMesh` props; tool `hidden` props)
- Modify: `src/viewport/Gizmo.tsx` (signature at line ~231; the `return null` at ~367)
- Modify: `src/viewport/MoveTool.tsx` (signature ~44; `if (tool !== 'move') return null;` ~193)
- Modify: `src/viewport/TapeTool.tsx` (signature ~47; `if (tool !== 'tape') return null;` ~357)

**Interfaces:**
- Consumes: Task 2's `captureRef` in `Viewport`.
- Produces: `ViewportHandle.capture()` resolving a PNG `Blob` (or `null`).

- [ ] **Step 1: `hidden` on the three tools — after every hook**

Before editing each file, confirm there is no hook call (`use…(`) below the line being changed; if there is, move the
`hidden` check below it instead.

`Gizmo.tsx`: `export function Gizmo({ hidden = false }: { hidden?: boolean } = {}) {` and
`if (!center || !size || hidden) return null;` with the comment:

```tsx
  // `hidden` is the capture's clean frame (standard-views spec §3.2): drawn as nothing for one frame,
  // never unmounted — the unmount cleanup above would end an in-flight gesture.
```

`MoveTool.tsx`: `export function MoveTool({ showGuides = true, hidden = false }: { showGuides?: boolean; hidden?: boolean }) {`
and `if (tool !== 'move' || hidden) return null;`.

`TapeTool.tsx`: `export function TapeTool({ showGuides = true, hidden = false }: { showGuides?: boolean; hidden?: boolean }) {`
and `if (tool !== 'tape' || hidden) return null;`. Its canvas listeners and held points stay live (invariant 24: a
capture moves nothing and writes no held point).

- [ ] **Step 2: The `Capture` component**

Add to `Viewport.tsx` beside `CameraKeys`:

```tsx
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
    return () => {
      captureRef.current = null;
      pending.current?.(null);
      pending.current = null;
    };
  }, [captureRef, setClean]);

  // useFrame's callback is refreshed in a layout effect, so `clean` here is true only once the clean
  // render has COMMITTED — the meshes and tools below are already drawn clean.
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
```

- [ ] **Step 3: Wire `clean` through `Viewport`**

In `Viewport`: `const [clean, setClean] = useState(false);`. In the JSX:

```tsx
        <BoardMesh
          ...
          selected={!clean && isCovered(board.id, selectedSet)}
          // Faded, but still clickable: ... (keep the existing comment)
          faded={!clean && openPath !== null && !board.id.startsWith(`${openPath}/`)}
          ...
        />
```

```tsx
      {tool === 'select' && explode === 0 && <Gizmo hidden={clean} />}
      <MoveTool showGuides={showGuides} hidden={clean} />
      <TapeTool showGuides={showGuides} hidden={clean} />
      <CameraKeys suspended={shortcutsSuspended} viewRef={viewRef} />
      <Capture clean={clean} setClean={setClean} captureRef={captureRef} />
```

Grid, axes and guide markers are untouched (they follow their toggles, spec §3.1).

- [ ] **Step 4: Typecheck and run everything**

Run: `npm run build && npm test`
Expected: build succeeds; all tests pass. (The capture itself is verified live in Task 6 — viewport, no unit tests.)

- [ ] **Step 5: Commit**

```bash
git add src/viewport/Viewport.tsx src/viewport/Gizmo.tsx src/viewport/MoveTool.tsx src/viewport/TapeTool.tsx
git commit -m "feat(viewport): capture() — one clean frame read with toBlob; tools hidden, never unmounted"
```

---

### Task 5: The buttons — `ViewportControls` and `App`

**Files:**
- Modify: `src/panels/ViewportControls.tsx`
- Modify: `src/App.tsx` (~line 63 state; ~925-944 the `Viewport` / `ViewportControls` JSX)
- Modify: `src/styles.css` (`.viewport-controls-view`, line ~473)
- Test: `src/panels/ViewportControls.test.tsx`

**Interfaces:**
- Consumes: `ViewportHandle` (Task 2), `capture()` (Task 4), `storage.exportImage` (Task 3), `StandardView` (Task 1).
- Produces: new required `ViewportControls` props `onView: (view: StandardView) => void` and
  `onSaveImage: () => Promise<void>`.

- [ ] **Step 1: Write the failing tests**

In `ViewportControls.test.tsx`, extend `renderControls`' defaults with
`onView={noop} onSaveImage={() => Promise.resolve()}` (before `{...overrides}`) and add:

```tsx
describe('ViewportControls standard views and Save image', () => {
  afterEach(() => { act(() => useStore.getState().setExplode(0)); });

  it('asks for each standard view by name', async () => {
    const onView = vi.fn();
    renderControls({ onView });
    for (const [name, view] of [['Front', 'front'], ['Side', 'side'], ['Top', 'top'], ['Iso', 'iso']] as const) {
      await userEvent.click(btn(name));
      expect(onView).toHaveBeenLastCalledWith(view);
    }
    expect(onView).toHaveBeenCalledTimes(4);
  });

  it('keeps the views and Save image enabled while exploded (they change nothing)', () => {
    renderControls();
    act(() => useStore.getState().setExplode(0.5));
    for (const name of ['Front', 'Side', 'Top', 'Iso', 'Save image']) expect(btn(name)).toBeEnabled();
  });

  it('saves once for a double click: the button is disabled while saving', async () => {
    let finish!: () => void;
    const onSaveImage = vi.fn(() => new Promise<void>((r) => { finish = r; }));
    renderControls({ onSaveImage });
    await userEvent.click(btn('Save image'));
    expect(btn('Save image')).toBeDisabled();
    await userEvent.click(btn('Save image'));
    expect(onSaveImage).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
    expect(btn('Save image')).toBeEnabled();
  });

  it('shows "Could not save the image." when saving fails, and clears it on the next attempt', async () => {
    const onSaveImage = vi.fn()
      .mockRejectedValueOnce(new Error('no canvas'))
      .mockResolvedValueOnce(undefined);
    renderControls({ onSaveImage });
    await userEvent.click(btn('Save image'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the image.');
    await userEvent.click(btn('Save image'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
```

(`setExplode` is already used this way by the exploded tests in this file, line ~53.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/panels/ViewportControls.test.tsx`
Expected: FAIL — no button named `Front`.

- [ ] **Step 3: Implement `ViewportControls`**

Add to `Props`:

```tsx
  /** Look at the piece from a standard view (spec §2). An action, not a mode: no button shows pressed. */
  onView: (view: StandardView) => void;
  /** Save a clean PNG of the view (spec §3). Rejects when nothing could be saved. */
  onSaveImage: () => Promise<void>;
```

Import `useState` from `react` and `type StandardView` from `../viewport/framing`. In the component:

```tsx
  const [saving, setSaving] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const saveImage = () => {
    setImageError(null);
    setSaving(true);
    onSaveImage()
      .catch(() => setImageError('Could not save the image.'))
      .finally(() => setSaving(false));
  };
```

In the View group, after the projection `segmented` div:

```tsx
        <div className="segmented" role="group" aria-label="Standard views">
          <button onClick={() => onView('front')} title="Look at the front of the piece">Front</button>
          <button onClick={() => onView('side')} title="Look at the right side of the piece">Side</button>
          <button onClick={() => onView('top')} title="Look down on the piece from above">Top</button>
          <button onClick={() => onView('iso')} title="Look from the front-right corner, above">Iso</button>
        </div>
```

and after the `viewport-explode` div:

```tsx
        <button onClick={saveImage} disabled={saving}
          title="Save a PNG of the view, without the selection or tool markers">Save image</button>
        {imageError && <span role="alert" className="field-error">{imageError}</span>}
```

- [ ] **Step 4: Wire `App`**

Import `type ViewportHandle` from `./viewport/Viewport` (beside the existing `Viewport` import). Near the other view
state (~line 63):

```tsx
  const viewportRef = useRef<ViewportHandle | null>(null);
  // Save image (spec §3): the clean frame from the viewport, out through the storage seam.
  const saveImage = useCallback(async () => {
    const png = await (viewportRef.current?.capture() ?? Promise.resolve(null));
    if (!png) throw new Error('The viewport gave no image.');
    await storage.exportImage(useStore.getState().doc.name, png);
  }, []);
```

Pass `handleRef={viewportRef}` to `<Viewport>`, and to `<ViewportControls>`:
`onView={(v) => viewportRef.current?.showView(v)}` and `onSaveImage={saveImage}`. (Add `useRef` / `useCallback` to
App's react import if not already there.)

- [ ] **Step 5: Let the View group wrap**

In `src/styles.css`, after `.viewport-controls-view { right: 12px; }`:

```css
/* Five clusters now (projection, visibility, views, explode, Save image): wrap, right-aligned, rather than
   run under the Tools group on a narrow window. 220px clears the Tools group (Select/Move/Tape) and its gap. */
.viewport-controls-view { flex-wrap: wrap; justify-content: flex-end; max-width: calc(100% - 220px); }
```

(Measure the Tools group's real width in Task 6 and correct `220px` if it is wrong.) If the error span is
unreadable on the dark panel, give it a rule beside `.project-menu-popup .field-error` (line ~313) re-pointing it the
same way; judge by eye in Task 6.

- [ ] **Step 6: Run to verify**

Run: `npx vitest run src/panels/ViewportControls.test.tsx src/App.test.tsx && npm run build && npm test`
Expected: all PASS; build succeeds.

- [ ] **Step 7: Mutate** — (a) drop `disabled={saving}`: the double-click test fails. (b) drop `setImageError(null)`
  at the start of `saveImage`: the clears-on-retry test fails. Revert both.

- [ ] **Step 8: Commit**

```bash
git add src/panels/ViewportControls.tsx src/panels/ViewportControls.test.tsx src/App.tsx src/styles.css
git commit -m "feat(panels): Front/Side/Top/Iso and Save image in the View group"
```

---

### Task 6: Browser verification on the dev server

**Files:**
- Create: `docs/browser-verification-standard-views-image.md`
- Create: `docs/img/standard-views-*.png` (a view or two, and one saved PNG)

Read `DEPLOYMENT.local.md` and the memory notes on browser verification first: only the Playwright MCP works here;
the user can watch; never `localStorage.clear()` on the dev origin — delete only the projects this check created.

- [ ] **Step 1:** `npm run dev -- --port 5199` (background). Open it in Playwright at 1440×900. Create a check
  project; build a chiral fixture: a 30×20×18 box of parts with one part only at the front-left-top corner (so each
  view reads differently).
- [ ] **Step 2: The views, both projections.** For Front, Side, Top, Iso in Perspective, then in Orthographic:
  screenshot and check the corner part appears where the sheet's view puts it (Front: left-top; Side from +X: the
  front edge on the LEFT, since screen right is −Z; Top: front edge at the bottom; Iso: from front-right-above). Open
  the Plans sheet and compare its Front/Side/Plan against the viewport's.
- [ ] **Step 3: Top, then orbit.** After Top, drag 20 px horizontally: the view orbits from "front at the bottom"
  with no jump or spin (read `camera.position` via `browser_evaluate` before/after if the screenshot is ambiguous).
- [ ] **Step 4: fu 260.** Explode to 100%: Home, F (with a part selected) and each view frame the exploded set (all
  parts in frame); back at 0, Home frames as before.
- [ ] **Step 5: Save image, the dirty case.** Select a part, open an assembly (if the fixture has one; else group two
  parts and open it), arm the Tape tool and click one anchor point. Click Save image. Capture the download with
  Playwright's download handling; open the PNG and look: no selection colour, no fading, no gizmo, no tape marker,
  grid/axes/guides as toggled. Then confirm the viewport still shows the selection, the open assembly and the tape
  anchor (readout still live).
- [ ] **Step 6: Save image, the edges.** Double-click Save image fast: one download. Empty project: a PNG of the
  empty scene. Exploded: saves, and the view stays exploded.
- [ ] **Step 7: Narrow window.** Resize to 1024×768: the View group wraps right-aligned and does not run under the
  Tools group. Measure the Tools group's width; fix the `220px` in `styles.css` if needed (amend Task 5's commit
  only if still unpushed — otherwise a new commit).
- [ ] **Step 8: Clean up.** Delete the check project(s) through the app; verify through `browser_evaluate` that only
  this check's keys went. Stop the dev server.
- [ ] **Step 9: Record** the pass in `docs/browser-verification-standard-views-image.md` (what was seen, what software
  GL cannot confirm — the user should look at one saved PNG on real hardware, fu 26a) with the screenshots in
  `docs/img/`. Commit:

```bash
git add docs/browser-verification-standard-views-image.md docs/img/standard-views-*.png src/styles.css
git commit -m "docs: browser verification — standard views and image export"
```

---

### Task 7: Records

**Files:**
- Modify: `docs/follow-ups.md` (fu 260 closed; new residue entries from 319)
- Modify: `docs/feature-gaps.md` (§2 rows: Standard views, Image export)
- Modify: `docs/history.md` (the round's narrative)
- Modify: `CLAUDE.md` (Status, Rounds shipped row, Where things live: `viewport/framing.ts`, `storage` exportImage;
  test count under Commands; Open follow-ups 252–264 line: 260 closed)
- Modify: the spec's Status line (implemented, date)

- [ ] **Step 1:** fu 260 → **Fixed 2026-10-13** (framing reads the explode offsets; `subsetBounds`). Add any residue
  found in Tasks 1–6 as 319, 320, … (each with a Status line). Candidates to judge, not to assume: keyboard shortcuts
  for views; Back/Left/Bottom; the one-frame selection blink.
- [ ] **Step 2:** feature-gaps §2: "Standard views" and "Image export" → `shipped 2026-10-13 (standard views + image
  export)` — after deploy, `deployed`; before it, `merged, not deployed`.
- [ ] **Step 3:** CLAUDE.md per its Working agreements (Status, one table row, condensed rules only; narrative in
  `docs/history.md`). Update the test count from a real `npm test` run.
- [ ] **Step 4:** `npm run build && npm test` once more; commit:

```bash
git add docs/ CLAUDE.md
git commit -m "docs: standard views and image export — records (fu 260 closed)"
```

- [ ] **Step 5: Deploy — ask the user first.** Deploy only on the user's go-ahead, per `DEPLOYMENT.local.md` and the
  deployment rule (page load only on production; bundle hash at the edge and in-network; CSP header). No schema
  change, so rollback is free. Record the bundle hash in `DEPLOYMENT.local.md`, CLAUDE.md Status and
  `docs/history.md`.
