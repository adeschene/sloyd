# Edge profiles (chunk 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full-length edge profiles (Roundover, Cove, Roman ogee, Bead, Thumbnail, optional Fillet) as their own
Properties section, and fix fu 386 (curves on two `through` axes lose lines in the exploded isometric). Schema stays 17.

**Architecture:** A profile is a plain `CurveCut` running along a length or width edge, recognised structurally by a new pure
module `src/document/profiles.ts`: one writer `profileCurve`, a read-by-rewrite reader `profileFields`, and
`defaultProfile`. Words go into `curveText.ts` (bench lines and the four-edge collapse) and `featureKeys.ts` (key lines). The
curve row's refusal rules move into `panels/curveRefusal.ts`, shared by Curves and a new `panels/Profiles.tsx`. There is no
store, schema or geometry change, apart from the fu 386 fix in `curveDrawing.ts` (or wherever its diagnosed cause lies).

**Tech Stack:** TypeScript, React, Zustand, Vitest + Testing Library. `npm run build` is the typecheck gate.

**Spec:** `docs/superpowers/specs/2026-10-17-sloyd-edge-profiles-design.md` (approved 2026-10-17; §2.3's scaling amended
per axis in planning). Read it before each task. The outline table (§2.2) is binding.

## Global Constraints

- `CURRENT_VERSION` stays **17**; no stored type changes.
- Exact stored numbers (inv 25); writers and readers compare EXACTLY (`sameCurve`, which is string-exact, `-0` told from
  `0`).
- Every arc a profile writes stores `radius`, never `rise`.
- Roundover with fillet 0 is **byte-identical** to `cornerCurve({ through, uFrom, vFrom, radius })`.
- `profileFields` returns null for every `through: 'thickness'` curve (R3).
- Joinery, Refine and Repair keep refusing curved projects (`curvedRefusal` untouched, R2).
- Refuse, never clamp. A preset whose default would fault is withheld. An edit is refused only when it ADDS a fault (curve
  or hole-into-waste), or would pass a half circle.
- `curveLineEntries` is THE home of collapses (inv 19). Words are built in `curveText.ts` / `featureKeys.ts`, never in a
  panel.
- The viewport has no unit tests by design. The live pass is Task 9.
- Work on branch `edge-profiles-1`; merge locally `--no-ff` after the final review. No pull requests.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Test projects created on the dev server are LEFT in place (the user's ruling).

## Review Focus

1. **A stored through-length Rounded corner from before this chunk.** It must appear under Profiles as a Roundover, never in
   Curves, and keep its bytes. Pinned in Task 6 (panel test) and Task 3 (reader test on `cornerCurve` output).
2. **A mirrored profile** (a mirrored instance or `mirrorCurveCut`) reads as the same kind with flipped edge flags. Pinned in
   Task 3.
3. **Four equal profiles where one is faulted, or where one differs in facing.** These must NOT collapse. Pinned in Task 5.
4. **A Profile change to a kind whose default would fault on this edge** (an ogee on a 1/4" strip, a thumbnail on a narrow
   face). It is refused in the row's words and nothing is stored. Pinned in Task 7.
5. **Metric.** Profile bench lines and menu details read mm. Pinned in Tasks 5 and 7.

---

### Task 0: Branch and baseline

- [ ] **Step 1:** Create the branch and record the baseline.

```bash
cd /home/alec/docker/sloyd && git checkout -b edge-profiles-1 && npm test 2>&1 | tail -4
```

Expected: all pass (4729 at the time of writing; record the number).

---

### Task 1: fu 386 — curves on two `through` axes lose drawn lines

**Files:**
- Test: `src/document/curveDrawing.test.ts` (append)
- Modify: wherever the diagnosis leads (most likely `src/document/curveDrawing.ts`'s `curveDrawEdges` or `silhouetteLines`)

**What is known (measured while planning).** A 36 × 20 × 3/4 top with four 3/8" Rounded corners, two with
`through: 'length'` and two with `through: 'width'`:
- It is ONE convex body (four clips) with 28 board edges.
- `drawView([b], ISO)` gives 24 visible + 7 hidden segments.
- The two long-edge roundovers alone give 58 + 13. The edge list is comparable, so the loss is NOT occlusion: the fine
  arc paths and/or silhouettes are missing when curves on two axes trim each other's faces.

- [ ] **Step 1: Write the failing pins.** Append to `src/document/curveDrawing.test.ts`, adding `cornerCurve` and
  `createBoard` to its imports if missing, and `drawView`, `ISO` from `./drawing`, `curveDrawEdges`, `silhouetteLines` from
  `./curveDrawing`:

```ts
describe('curves on two through axes keep their drawn lines (fu 386)', () => {
  const r = 0.375;
  const round = (id: string, through: 'length' | 'width', uFrom: 'min' | 'max') =>
    ({ id, ...cornerCurve({ through, uFrom, vFrom: 'max', radius: r }) });
  const top = (curves: ReturnType<typeof round>[]) => createBoard({ id: 't', length: 36, width: 20, thickness: 0.75, curves });
  const two = top([round('a', 'length', 'min'), round('b', 'length', 'max')]);
  const four = top([round('a', 'length', 'min'), round('b', 'length', 'max'), round('c', 'width', 'min'), round('d', 'width', 'max')]);
  it('every curve keeps a fine drawing path', () => {
    const edges = curveDrawEdges(four);
    for (const id of ['a', 'b', 'c', 'd']) expect(edges.some((e) => e.curve === id && e.path)).toBe(true);
  });
  it('the four-edge top draws at least as many segments in the isometric as the two-edge top', () => {
    const n = (b: typeof two) => { const d = drawView([b], ISO); return d.visible.length + d.hidden.length; };
    expect(n(four)).toBeGreaterThanOrEqual(n(two));
  });
  it('each roundover facing the viewer has a silhouette in the isometric', () => {
    const one = (c: ReturnType<typeof round>) => silhouetteLines(top([c]), ISO.toward).length > 0;
    const expected = ['a', 'b', 'c', 'd'].filter((id) => one(four.curves.find((c) => c.id === id)! as ReturnType<typeof round>));
    const got = new Set(silhouetteLines(four, ISO.toward).map((s) => s.curve));
    for (const id of expected) expect(got.has(id)).toBe(true);
  });
});
```

- [ ] **Step 2: Run them.** `npx vitest run src/document/curveDrawing.test.ts`. Expected: at least the segment-count pin
  FAILS (31 < 71). Record which of the three fail. That is the first diagnostic fact.

- [ ] **Step 3: Diagnose** with superpowers:systematic-debugging. Read `curveDrawEdges` (curveDrawing.ts:52) and
  `silhouetteLines` (curveDrawing.ts:173) and trace one missing curve (e.g. `c`) through them on `four`. Hypotheses to test,
  in order (log, don't guess):
  1. A chord face is identified by `BodyFace.curve`; when a second curve clips the SAME body, the chord faces of the first
     may be clipped into polygons that no longer match the path-building predicate.
  2. `curvedEdges`' smooth-line suppression "per INTERVAL" (inv 16) may drop a whole chord edge where it meets the other
     axis's chord faces.
  3. The silhouette probe (4 × `DRAW_EPS` along the outward normals) may land inside the other curve's waste and read as
     hidden or clipped (fu 375's clip).

  Record the confirmed cause in the commit message and in a code comment at the fix.

- [ ] **Step 4: Fix the cause** (not the symptom), smallest change. Constraints:
  - `drawingIdentity.test` (tags stripped) must stay byte-identical for every existing single-axis fixture.
  - `curvesPerf` must stay ≤ 40 ms.

- [ ] **Step 5: Run.** `npx vitest run src/document/curveDrawing.test.ts src/document/drawing.test.ts src/document/drawingIdentity.test.ts src/viewport/curvesPerf.test.ts`.
  Expected: PASS.

- [ ] **Step 6: Mutate.** Revert the fix line. Expected: the pin that failed in Step 2 fails again. Restore.

- [ ] **Step 7: Full suite and build.** `npm test 2>&1 | tail -4 && npm run build 2>&1 | tail -3`. Expected: all pass; the build
  succeeds.

- [ ] **Step 8: Commit.**

```bash
git add src && git commit -m "drawing: curves on two through axes keep their fine paths and silhouettes (fu 386)

<one paragraph: the confirmed cause and the fix>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `profiles.ts` — the writer and the edges

**Files:**
- Create: `src/document/profiles.ts`
- Create: `src/document/profiles.test.ts`
- Modify: `src/document/document.ts` (re-exports, near the `./curves` lines ~42–43)

**Interfaces (produced):**

```ts
export type ProfileKind = 'roundover' | 'cove' | 'ogee' | 'bead' | 'thumbnail';
export const PROFILE_KINDS: readonly ProfileKind[];
export interface ProfileEdge { through: 'length' | 'width'; uFrom: CutFrom; vFrom: CutFrom }
export const PROFILE_EDGES: readonly ProfileEdge[];   // through length then width; uFrom min,max; vFrom min,max (8)
export interface ProfileFields extends ProfileEdge {
  kind: ProfileKind; facing: 'u' | 'v';
  size: number; depth?: number; fillet?: number;
}
export function profileCurve(f: ProfileFields): Omit<CurveCut, 'id'>;
export function profileAsymmetric(f: ProfileFields): boolean;  // ogee, bead, thumbnail, or fillet > 0
```

- [ ] **Step 1: Write the failing tests.** Create `src/document/profiles.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { arcOf, cornerCurve, sameCurve } from './curves';
import type { P2 } from './curves';
import { PROFILE_EDGES, profileAsymmetric, profileCurve } from './profiles';
import type { ProfileFields } from './profiles';

const edge = { through: 'length', uFrom: 'max', vFrom: 'max' } as const;
const at = (f: Partial<ProfileFields> & Pick<ProfileFields, 'kind' | 'size'>): ProfileFields => ({ ...edge, facing: 'v', ...f });
/** The outline's points (start, then each segment's `to`) and every arc's centre, in stored (u, v). */
const shape = (f: ProfileFields) => {
  const c = profileCurve(f);
  const pts: P2[] = [c.start, ...c.segments.map((s) => s.to)];
  const centres = c.segments.flatMap((s, i) => (s.type === 'arc' ? [arcOf(pts[i]!, s.to, s.side, { radius: s.radius! }, i).centre] : []));
  return { c, pts, centres };
};
const close = (a: readonly number[], b: readonly number[]) => a.every((v, i) => Math.abs(v - b[i]!) <= 1e-12);

describe('profileCurve (edge profiles spec §2.2, canonical frame = stored frame at facing v)', () => {
  it('roundover, fillet 0, is byte-identical to cornerCurve', () => {
    expect(profileCurve(at({ kind: 'roundover', size: 0.25 }))).toEqual(cornerCurve({ ...edge, radius: 0.25 }));
    expect(sameCurve(profileCurve(at({ kind: 'roundover', size: 0.25, fillet: 0 })), cornerCurve({ ...edge, radius: 0.25 }))).toBe(true);
  });
  it('roundover with a fillet: the arc set f in from the edge face, a shoulder line back to it', () => {
    const { pts, centres } = shape(at({ kind: 'roundover', size: 0.25, fillet: 0.0625 }));
    expect(pts).toEqual([[0, 0], [0.3125, 0], [0.0625, 0.25], [0, 0.25], [0, 0]]);
    expect(close(centres[0]!, [0.3125, 0.25])).toBe(true);
  });
  it('cove: concave, centred on the corner (fillet 0)', () => {
    const { pts, centres } = shape(at({ kind: 'cove', size: 0.375 }));
    expect(pts).toEqual([[0, 0], [0.375, 0], [0, 0.375], [0, 0]]);
    expect(close(centres[0]!, [0, 0])).toBe(true);
  });
  it('Roman ogee: concave entering the top, convex onto the edge face', () => {
    const { pts, centres } = shape(at({ kind: 'ogee', size: 0.5 }));
    expect(pts).toEqual([[0, 0], [0.5, 0], [0.25, 0.25], [0, 0.5], [0, 0]]);
    expect(close(centres[0]!, [0.25, 0])).toBe(true);
    expect(close(centres[1]!, [0.25, 0.5])).toBe(true);
  });
  it('bead: a roundover set k below the top behind a k × k quirk', () => {
    const { pts, centres } = shape(at({ kind: 'bead', size: 0.25, fillet: 0.0625 }));
    expect(pts).toEqual([[0, 0], [0.3125, 0], [0.3125, 0.0625], [0.25, 0.0625], [0, 0.3125], [0, 0]]);
    expect(close(centres[0]!, [0.25, 0.3125])).toBe(true);
  });
  it('thumbnail: tangent to the top at (a, 0), radius (a² + d²) / 2d, a crisp line on the edge face', () => {
    const { c, pts, centres } = shape(at({ kind: 'thumbnail', size: 0.75, depth: 0.25 }));
    expect(pts).toEqual([[0, 0], [0.75, 0], [0, 0.25], [0, 0]]);
    expect(c.segments[1]).toMatchObject({ type: 'arc', side: 'left', radius: (0.75 * 0.75 + 0.25 * 0.25) / (2 * 0.25) });
    expect(close(centres[0]!, [0.75, 1.25])).toBe(true);
  });
  it('facing u swaps the stored axes and flips every arc side', () => {
    const v = profileCurve(at({ kind: 'ogee', size: 0.5 }));
    const u = profileCurve(at({ kind: 'ogee', size: 0.5, facing: 'u' }));
    expect(u.segments.map((s) => s.to)).toEqual(v.segments.map((s) => [s.to[1], s.to[0]]));
    expect(u.segments.map((s) => (s.type === 'arc' ? s.side : null))).toEqual(v.segments.map((s) => (s.type === 'arc' ? (s.side === 'left' ? 'right' : 'left') : null)));
  });
  it('PROFILE_EDGES: the 8 edges along the length or width', () => {
    expect(PROFILE_EDGES).toHaveLength(8);
    expect(PROFILE_EDGES.every((e) => e.through !== ('thickness' as string))).toBe(true);
  });
  it('asymmetric: ogee, bead, thumbnail, or any fillet', () => {
    expect(profileAsymmetric(at({ kind: 'roundover', size: 0.25 }))).toBe(false);
    expect(profileAsymmetric(at({ kind: 'cove', size: 0.25, fillet: 0 }))).toBe(false);
    expect(profileAsymmetric(at({ kind: 'cove', size: 0.25, fillet: 0.0625 }))).toBe(true);
    for (const kind of ['ogee', 'bead', 'thumbnail'] as const) expect(profileAsymmetric(at({ kind, size: 0.5, depth: 0.25, fillet: 0.0625 }))).toBe(true);
  });
});
```

  Before relying on `arcOf(...).centre`, check `LocalArc`'s field names in `curves.ts` (`arcOf` returns a `LocalArc`; its
  centre field may be named `centre` or `c`). Use the real name, and keep the assertions' meaning.

- [ ] **Step 2: Run.** `npx vitest run src/document/profiles.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `src/document/profiles.ts`:

```ts
import type { CurveCut, CurveSegment, CutFrom } from './types';

/**
 * Edge profiles (edge profiles spec, chunk 1): a full-length routed edge is a plain `CurveCut` running along the edge
 * (`through` = the edge's run), its waste outline written here in a canonical frame — a along the TOP face, b down the
 * EDGE face, from the edge's corner — and mapped to stored (u, v) by `facing` ('v': T is the v = 0 face, (u, v) = (a, b);
 * 'u': T is the u = 0 face, swapped, every arc side flipped). Recognised structurally (`profileFields`, read by
 * rewriting): no stored kind, no schema change. Through the thickness the same shape is a Curves Rounded corner (R3).
 * Runtime imports: none beyond types (the reader adds `curves` for `sameCurve`).
 */
export type ProfileKind = 'roundover' | 'cove' | 'ogee' | 'bead' | 'thumbnail';
export const PROFILE_KINDS: readonly ProfileKind[] = ['roundover', 'cove', 'ogee', 'bead', 'thumbnail'];
export interface ProfileEdge { through: 'length' | 'width'; uFrom: CutFrom; vFrom: CutFrom }
export const PROFILE_EDGES: readonly ProfileEdge[] = (['length', 'width'] as const).flatMap((through) =>
  (['min', 'max'] as const).flatMap((uFrom) => (['min', 'max'] as const).map((vFrom) => ({ through, uFrom, vFrom }))));
export interface ProfileFields extends ProfileEdge {
  kind: ProfileKind; facing: 'u' | 'v';
  /** roundover/cove/bead: radius; ogee: s; thumbnail: reach a */
  size: number;
  /** thumbnail only: depth d (< size) */
  depth?: number;
  /** roundover/cove/ogee: fillet f (absent or 0 = none); bead: the quirk k (> 0) */
  fillet?: number;
}

type Seg = { type: 'line'; to: [number, number] } | { type: 'arc'; to: [number, number]; side: 'left' | 'right'; radius: number };
const line = (a: number, b: number): Seg => ({ type: 'line', to: [a, b] });
const arc = (a: number, b: number, side: 'left' | 'right', radius: number): Seg => ({ type: 'arc', to: [a, b], side, radius });

/** The outline in the canonical frame (spec §2.2), from (0, 0). */
function canonical(f: ProfileFields): Seg[] {
  const fl = f.fillet ?? 0;
  switch (f.kind) {
    case 'roundover':
    case 'cove': {
      const r = f.size;
      return [line(r + fl, 0), arc(fl, r, f.kind === 'roundover' ? 'left' : 'right', r), ...(fl > 0 ? [line(0, r)] : []), line(0, 0)];
    }
    case 'ogee': {
      const s = f.size;
      const h = s / 2;
      return [line(s + fl, 0), arc(h + fl, h, 'right', h), arc(fl, s, 'left', h), ...(fl > 0 ? [line(0, s)] : []), line(0, 0)];
    }
    case 'bead': {
      const r = f.size;
      const k = fl;
      return [line(r + k, 0), line(r + k, k), line(r, k), arc(0, r + k, 'left', r), line(0, 0)];
    }
    case 'thumbnail': {
      const a = f.size;
      const d = f.depth!;
      return [line(a, 0), arc(0, d, 'left', (a * a + d * d) / (2 * d)), line(0, 0)];
    }
  }
}

export function profileCurve(f: ProfileFields): Omit<CurveCut, 'id'> {
  const segs = canonical(f).map((s): CurveSegment => {
    if (f.facing === 'v') return s as CurveSegment;
    const to: [number, number] = [s.to[1], s.to[0]];
    return (s.type === 'line' ? { type: 'line', to } : { type: 'arc', to, side: s.side === 'left' ? 'right' : 'left', radius: s.radius }) as CurveSegment;
  });
  return { through: f.through, uFrom: f.uFrom, vFrom: f.vFrom, start: [0, 0], segments: segs };
}

/** A profile whose two faces are not interchangeable: its row shows Facing. */
export function profileAsymmetric(f: ProfileFields): boolean {
  return f.kind === 'ogee' || f.kind === 'bead' || f.kind === 'thumbnail' || (f.fillet ?? 0) > 0;
}
```

  The `Seg` objects' key order (`type, to, side, radius`) matches `cornerCurve`'s, which the byte-identity test needs. If
  `CurveSegment` requires a different shape, adapt the cast, not the order.

  Re-export from `src/document/document.ts`:

```ts
export { PROFILE_EDGES, PROFILE_KINDS, profileAsymmetric, profileCurve } from './profiles';
export type { ProfileEdge, ProfileFields, ProfileKind } from './profiles';
```

- [ ] **Step 4: Run.** `npx vitest run src/document/profiles.test.ts`. Expected: PASS.

- [ ] **Step 5: Mutate.** Make three mutations, each with its own expected result:
  1. Swap the cove side to `'left'`. Expected: the cove-centre test fails.
  2. Drop the side flip under facing u. Expected: the facing test fails.
  3. Write the ogee's first arc `'left'`. Expected: the ogee test fails.

  Restore each.

- [ ] **Step 6: Commit.**

```bash
git add src/document/profiles.ts src/document/profiles.test.ts src/document/document.ts
git commit -m "edge profiles: profileCurve — the five outlines in a canonical frame, facing, the 8 edges

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `profileFields` — read by rewriting

**Files:**
- Modify: `src/document/profiles.ts`, `src/document/profiles.test.ts`, `src/document/document.ts`

**Interfaces (produced):** `profileFields(c: Omit<CurveCut, 'id'>): ProfileFields | null`.

- [ ] **Step 1: Write the failing tests.** Append to `profiles.test.ts`, importing `profileFields`, `PROFILE_KINDS`,
  `mirrorCurveCut`, `archCurve`, `bowCurve`:

```ts
describe('profileFields: read by rewriting (spec §2.3)', () => {
  const variants = (kind: (typeof PROFILE_KINDS)[number]): Partial<ProfileFields>[] =>
    kind === 'thumbnail' ? [{ size: 0.75, depth: 0.25 }]
      : kind === 'bead' ? [{ size: 0.25, fillet: 0.0625 }]
        : [{ size: 0.375, fillet: 0 }, { size: 0.375, fillet: 0.0625 }];
  it('round-trips every kind × 8 edges × both facings × fillet', () => {
    for (const kind of PROFILE_KINDS) for (const e of PROFILE_EDGES) for (const facing of ['u', 'v'] as const) for (const v of variants(kind)) {
      const f: ProfileFields = { ...e, kind, facing, size: v.size!, ...(v.depth !== undefined ? { depth: v.depth } : {}), ...(v.fillet !== undefined ? { fillet: v.fillet } : {}) };
      const read = profileFields({ id: 'x', ...profileCurve(f) } as CurveCut)!;
      expect(read).not.toBeNull();
      expect(sameCurve(profileCurve(read), profileCurve(f))).toBe(true);
      expect(read.kind).toBe(kind);
    }
  });
  it('a symmetric profile written at facing v reads at facing v', () => {
    expect(profileFields(profileCurve(at({ kind: 'roundover', size: 0.25 })))!.facing).toBe('v');
  });
  it('a stored through-length Rounded corner (master today) reads as a Roundover (Review Focus 1)', () => {
    expect(profileFields(cornerCurve({ through: 'length', uFrom: 'min', vFrom: 'max', radius: 0.375 })))
      .toMatchObject({ kind: 'roundover', through: 'length', uFrom: 'min', vFrom: 'max', size: 0.375 });
  });
  it('null through the thickness (a Curves Rounded corner), and for arches, bows and other curves', () => {
    expect(profileFields(cornerCurve({ through: 'thickness', uFrom: 'min', vFrom: 'min', radius: 1 }))).toBeNull();
    expect(profileFields(archCurve({ through: 'length', along: 'width', side: 'min', from: 'min', start: 1, span: 4, rise: 1 }))).toBeNull();
    expect(profileFields(bowCurve({ through: 'length', along: 'width', side: 'min', span: 10, rise: 0.5 }))).toBeNull();
    expect(profileFields({ through: 'length', uFrom: 'min', vFrom: 'min', start: [0, 0],
      segments: [{ type: 'line', to: [1, 0] }, { type: 'line', to: [0, 1] }, { type: 'line', to: [0, 0] }] })).toBeNull();
    // An arc stored by rise rather than radius is not a profile's (writers store radius).
    expect(profileFields({ through: 'length', uFrom: 'max', vFrom: 'max', start: [0, 0],
      segments: [{ type: 'line', to: [0.375, 0] }, { type: 'arc', to: [0, 0.375], side: 'right', rise: 0.375 - Math.sqrt(0.375 * 0.375 / 2) }, { type: 'line', to: [0, 0] }] })).toBeNull();
  });
  it('a mirrored profile reads as the same kind with the mirrored edge (Review Focus 2, inv 44)', () => {
    const f = at({ kind: 'ogee', size: 0.5, fillet: 0.0625 });
    const c = { id: 'x', ...profileCurve(f) } as CurveCut;
    const m = profileFields(mirrorCurveCut(c, 'width'))!;      // through length: u = width
    expect(m).toMatchObject({ kind: 'ogee', facing: 'v', uFrom: 'min', vFrom: 'max', size: 0.5, fillet: 0.0625 });
    expect(profileFields(mirrorCurveCut(c, 'length'))).toEqual(profileFields(c));   // along through: unchanged
  });
});
```

  Add `import type { CurveCut } from './types';` to the test file.

- [ ] **Step 2: Run.** Expected: FAIL (`profileFields` not exported).

- [ ] **Step 3: Implement.** Append to `profiles.ts` (and add `import { sameCurve } from './curves';` at the top; `curves.ts`
  must not import `profiles.ts`):

```ts
const ORDER: ProfileKind[] = ['roundover', 'cove', 'ogee', 'bead', 'thumbnail'];

/** Candidate fields lifted from canonical points (`to` of each segment) and the arcs' radii, or null. Lifting decides
 *  nothing: the caller rewrites and compares exactly. */
function lift(kind: ProfileKind, to: [number, number][], segs: CurveSegment[]): Pick<ProfileFields, 'size' | 'depth' | 'fillet'> | null {
  const radius = (i: number) => { const s = segs[i]; return s && s.type === 'arc' && s.radius !== undefined ? s.radius : null; };
  switch (kind) {
    case 'roundover':
    case 'cove': { const r = radius(1); return r === null ? null : { size: r, fillet: segs.length === 4 ? to[1]![0] : 0 }; }
    case 'ogee': { const h = radius(1); return h === null ? null : { size: 2 * h, fillet: segs.length === 5 ? to[2]![0] : 0 }; }
    case 'bead': { const r = radius(3); return r === null ? null : { size: r, fillet: to[1]![1] }; }
    case 'thumbnail': return segs.length === 3 && radius(1) !== null ? { size: to[0]![0], depth: to[1]![1] } : null;
  }
}

/**
 * A stored curve's profile, or null (spec §2.3): for each facing and kind, lift the parameters from the stored points,
 * rewrite them with `profileCurve`, and accept only an EXACT match (`sameCurve`). Never a profile through the thickness
 * (R3: that is a Curves Rounded corner). A symmetric profile reads at facing 'v' first.
 */
export function profileFields(c: Omit<CurveCut, 'id'>): ProfileFields | null {
  if (c.through === 'thickness' || c.start[0] !== 0 || c.start[1] !== 0) return null;
  const through = c.through;
  for (const facing of ['v', 'u'] as const) {
    const to = c.segments.map((s): [number, number] => (facing === 'v' ? [s.to[0], s.to[1]] : [s.to[1], s.to[0]]));
    for (const kind of ORDER) {
      const p = lift(kind, to, c.segments);
      if (!p || !(p.size > 0) || (p.depth !== undefined && !(p.depth > 0 && p.depth < p.size)) || (p.fillet ?? 0) < 0) continue;
      if (kind === 'bead' && !((p.fillet ?? 0) > 0)) continue;
      const f: ProfileFields = { through, uFrom: c.uFrom, vFrom: c.vFrom, kind, facing, size: p.size,
        ...(p.depth !== undefined ? { depth: p.depth } : {}), ...(kind === 'thumbnail' ? {} : { fillet: p.fillet ?? 0 }) };
      if (sameCurve(profileCurve(f), c)) return f;
    }
  }
  return null;
}
```

  Re-export `profileFields` from `document.ts`.

- [ ] **Step 4: Run.** `npx vitest run src/document/profiles.test.ts`. Expected: PASS. If the round-trip test fails for a
  case, print that case's stored curve, its lifted fields and the rewritten curve, and fix `lift` (the WRITER is the
  authority, spec §2.2).

- [ ] **Step 5: Mutate.** Make three mutations, each with its own expected result:
  1. Remove the `through === 'thickness'` guard. Expected: the null test fails.
  2. Try facing `'u'` before `'v'`. Expected: the symmetric-reads-v test fails.
  3. Make `lift` for ogee use `size: h`. Expected: the round trip fails.

  Restore each.

- [ ] **Step 6: Commit.**

```bash
git add src/document/profiles.ts src/document/profiles.test.ts src/document/document.ts
git commit -m "edge profiles: profileFields — read by rewriting, exact; never through the thickness

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `defaultProfile`

**Files:** `src/document/profiles.ts`, `src/document/profiles.test.ts`, `src/document/document.ts`

**Interfaces (produced):**
`defaultProfile(board: Pick<Board, Dimension>, kind: ProfileKind, edge?: ProfileEdge, facing?: 'u' | 'v'): Omit<CurveCut, 'id'>`,
`DEFAULT_PROFILE_EDGE: ProfileEdge` (`{ through: 'length', uFrom: 'max', vFrom: 'max' }`).

- [ ] **Step 1: Write the failing tests.** Append, importing `defaultProfile`, `DEFAULT_PROFILE_EDGE`, `createBoard` from
  `./document`, and `curveFaults` from `./curves`:

```ts
describe('defaultProfile (spec §2.3, scaled per axis)', () => {
  const top = createBoard({ length: 36, width: 20, thickness: 0.75 });
  const f = (k: (typeof PROFILE_KINDS)[number], b = top) => profileFields(defaultProfile(b, k))!;
  it('router-bit sizes on a 3/4" top, the top long edge, facing v', () => {
    expect(f('roundover')).toMatchObject({ ...DEFAULT_PROFILE_EDGE, facing: 'v', size: 0.25, fillet: 0 });
    expect(f('cove')).toMatchObject({ size: 0.375, fillet: 0 });
    expect(f('ogee')).toMatchObject({ size: 0.375 });          // 1/2" scaled to half the 3/4" thickness
    expect(f('bead')).toMatchObject({ size: 0.25, fillet: 0.0625 });
    expect(f('thumbnail')).toMatchObject({ size: 0.75, depth: 0.25 });   // the reach runs along the 20" top: unscaled
  });
  it('a thin strip gets a proportionate profile, no fault', () => {
    const strip = createBoard({ length: 36, width: 0.5, thickness: 0.25 });
    for (const k of PROFILE_KINDS) {
      const c = defaultProfile(strip, k);
      expect(curveFaults(strip, c)).toEqual([]);
      expect(profileFields(c)!.kind).toBe(k);
    }
  });
  it('no default faults on a 3/4" top', () => {
    for (const k of PROFILE_KINDS) expect(curveFaults(top, defaultProfile(top, k))).toEqual([]);
  });
  it('keeps a given edge and facing', () => {
    const e = { through: 'width', uFrom: 'min', vFrom: 'max' } as const;
    expect(profileFields(defaultProfile(top, 'ogee', e, 'u'))).toMatchObject({ ...e, facing: 'u', kind: 'ogee' });
  });
});
```

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement.** Append to `profiles.ts` (and import `uvDims` from `./curves`, plus the `Board`, `Dimension` types):

```ts
export const DEFAULT_PROFILE_EDGE: ProfileEdge = { through: 'length', uFrom: 'max', vFrom: 'max' };
const BASE: Record<ProfileKind, Pick<ProfileFields, 'size' | 'depth' | 'fillet'>> = {
  roundover: { size: 0.25, fillet: 0 }, cove: { size: 0.375, fillet: 0 }, ogee: { size: 0.5, fillet: 0 },
  bead: { size: 0.25, fillet: 0.0625 }, thumbnail: { size: 0.75, depth: 0.25 },
};
/** The profile's extents along the canonical a (top face) and b (edge face) axes. */
function extents(kind: ProfileKind, p: Pick<ProfileFields, 'size' | 'depth' | 'fillet'>): [number, number] {
  const fl = p.fillet ?? 0;
  if (kind === 'thumbnail') return [p.size, p.depth!];
  return [p.size + fl, p.size + (kind === 'bead' ? fl : 0)];
}
/**
 * A preset (spec §2.3): router-bit sizes, the top long edge by default, every length scaled by ONE factor so each canonical
 * extent fits half the dimension it runs along (amended in planning: per axis, so a thumbnail's reach along a 20" top is not
 * shrunk by the 3/4" thickness). Exact sizes when no scaling is needed (k = 1 multiplies nothing).
 */
export function defaultProfile(board: Pick<Board, Dimension>, kind: ProfileKind, edge: ProfileEdge = DEFAULT_PROFILE_EDGE, facing: 'u' | 'v' = 'v'): Omit<CurveCut, 'id'> {
  const [u, v] = uvDims(edge.through);
  const [aDim, bDim] = facing === 'v' ? [u, v] : [v, u];
  const base = BASE[kind];
  const [ea, eb] = extents(kind, base);
  const k = Math.min(1, board[aDim] / 2 / ea, board[bDim] / 2 / eb);
  const s = (n: number | undefined) => (n === undefined ? undefined : k === 1 ? n : n * k);
  return profileCurve({ ...edge, kind, facing, size: s(base.size)!,
    ...(base.depth !== undefined ? { depth: s(base.depth) } : {}), ...(base.fillet !== undefined ? { fillet: s(base.fillet) } : {}) });
}
```

  Re-export `defaultProfile` and `DEFAULT_PROFILE_EDGE`.

- [ ] **Step 4: Run.** Expected: PASS. If a thin-strip default faults, the extents are wrong for that kind; fix `extents`,
  never the test.

- [ ] **Step 5: Mutate.** Make two mutations, each with its own expected result:
  1. Scale by `Math.min(board[u], board[v])` for both axes. Expected: the thumbnail assertion fails.
  2. Drop the `k === 1` exact branch. Expected: no test should fail (both are exact at k = 1), so check the bytes with
     `sameCurve` against `profileCurve` at base sizes. Add that assertion if it is missing.

  Restore each.

- [ ] **Step 6: Commit.** `git commit -am "edge profiles: defaultProfile — router-bit sizes, scaled per axis"` (with the
  Co-Authored-By line).

---

### Task 5: Words — bench lines, the four-edge collapse, key lines

**Files:**
- Modify: `src/document/curveText.ts` (`curveLineBase`, `curveLineEntries`)
- Modify: `src/document/featureKeys.ts` (`curveText`)
- Test: `src/document/curveText.test.ts`, `src/document/featureKeys.test.ts` (append)

**Interfaces (produced):** `profileName(f: ProfileFields, units: Units): string` in `curveText.ts` (the short words, e.g.
`Roundover 1/4"`, `Bead 1/4" with a 1/16" quirk`, `Thumbnail 3/4" × 1/4"`).

- [ ] **Step 1: Write the failing tests.** Append to `src/document/curveText.test.ts`:

```ts
describe('profile bench lines (edge profiles spec §4)', () => {
  const top = createBoard({ length: 36, width: 20, thickness: 0.75 });
  const on = (curves: CurveCut[]) => ({ ...top, curves });
  const p = (id: string, f: Partial<ProfileFields> & Pick<ProfileFields, 'kind' | 'size'>): CurveCut =>
    ({ id, ...profileCurve({ through: 'length', uFrom: 'max', vFrom: 'max', facing: 'v', ...f }) });
  it('roundover, cove: size and edge', () => {
    expect(curveLines(on([p('a', { kind: 'roundover', size: 0.25 })]), IMPERIAL))
      .toEqual(['Roundover 1/4" on the edge between the width face (max side) and the thickness face (max side), along the length']);
    expect(curveLines(on([p('a', { kind: 'cove', size: 0.375 })]), IMPERIAL)[0]).toMatch(/^Cove 3\/8" on the edge between/);
  });
  it('asymmetric profiles name the top face; a fillet is named', () => {
    expect(curveLines(on([p('a', { kind: 'ogee', size: 0.5 })]), IMPERIAL)[0])
      .toBe('Roman ogee 1/2" on the edge between the width face (max side) and the thickness face (max side), along the length, top on the thickness face (max side)');
    expect(curveLines(on([p('a', { kind: 'bead', size: 0.25, fillet: 0.0625 })]), IMPERIAL)[0]).toMatch(/^Bead 1\/4" with a 1\/16" quirk on the edge/);
    expect(curveLines(on([p('a', { kind: 'thumbnail', size: 0.75, depth: 0.25 })]), IMPERIAL)[0]).toMatch(/^Thumbnail 3\/4" × 1\/4" on the edge/);
    expect(curveLines(on([p('a', { kind: 'roundover', size: 0.25, fillet: 0.0625 })]), IMPERIAL)[0]).toMatch(/, top on the thickness face \(max side\), with a 1\/16" fillet$/);
  });
  it('metric (Review Focus 5)', () => {
    expect(curveLines(on([p('a', { kind: 'roundover', size: 0.25 })]), { display: 'metric-mm', precision: 16 })[0]).toMatch(/^Roundover 6 mm on the edge/);
  });
  const four = (f: Partial<ProfileFields> & Pick<ProfileFields, 'kind' | 'size'>, over: Partial<Record<string, Partial<ProfileFields>>> = {}) => [
    p('a', { ...f, ...over.a, through: 'length', uFrom: 'min' }), p('b', { ...f, ...over.b, through: 'length', uFrom: 'max' }),
    p('c', { ...f, ...over.c, through: 'width', uFrom: 'min' }), p('d', { ...f, ...over.d, through: 'width', uFrom: 'max' }),
  ];
  it('four equal profiles on one face collapse to one line', () => {
    expect(curveLineEntries(on(four({ kind: 'roundover', size: 0.25 })), IMPERIAL))
      .toEqual([{ ids: ['a', 'b', 'c', 'd'], text: 'Roundover 1/4" on all four edges of the thickness face (max side)' }]);
  });
  it('no collapse when one differs in size or facing, or is faulted (Review Focus 3)', () => {
    expect(curveLineEntries(on(four({ kind: 'roundover', size: 0.25 }, { d: { size: 0.375 } })), IMPERIAL)).toHaveLength(4);
    expect(curveLineEntries(on(four({ kind: 'ogee', size: 0.5 }, { d: { facing: 'u' } })), IMPERIAL)).toHaveLength(4);
    const faulted = four({ kind: 'roundover', size: 0.25 }, { d: { size: 1 } });   // a 1" radius on a 3/4" thickness runs off
    expect(curveFaults(on(faulted), faulted[3]!).length).toBeGreaterThan(0);
    expect(curveLineEntries(on(faulted), IMPERIAL)).toHaveLength(4);
  });
  it('the corner collapse no longer claims through-length corners', () => {
    expect(curveLineEntries(on(four({ kind: 'roundover', size: 0.25 })), IMPERIAL)[0]!.text).not.toMatch(/^Round all four corners/);
  });
});
```

  Imports for the test file: `profileCurve` and the `ProfileFields` type from `./profiles`; `curveLineEntries` and
  `curveLines` from `./curveText`; `curveFaults` from `./curves`; `IMPERIAL` from `../units/length`.

  Append to `src/document/featureKeys.test.ts`:

```ts
it('profile key lines are short words (edge profiles spec §4)', () => {
  const top = createBoard({ id: 't', length: 36, width: 20, thickness: 0.75 });
  const p = (id: string, through: 'length' | 'width', uFrom: 'min' | 'max') =>
    ({ id, ...profileCurve({ through, uFrom, vFrom: 'max', facing: 'v', kind: 'ogee', size: 0.5 }) });
  const one = partFeatures({ ...top, curves: [p('a', 'length', 'max')] }, IMPERIAL).find((f) => f.tags[0]!.includes('curve'))!;
  expect(one.text).toBe('Roman ogee 1/2"');
  const four = partFeatures({ ...top, curves: [p('a', 'length', 'min'), p('b', 'length', 'max'), p('c', 'width', 'min'), p('d', 'width', 'max')] }, IMPERIAL);
  expect(four.filter((f) => f.tags[0]!.includes('curve')).map((f) => f.text)).toEqual(['Roman ogee 1/2" (4×)']);
});
```

  Check how existing `featureKeys.test.ts` identifies a curve feature (tag format, `featureTag`) and use the same. Keep the
  assertions' meaning.

- [ ] **Step 2: Run.** `npx vitest run src/document/curveText.test.ts src/document/featureKeys.test.ts`. Expected: the new
  tests FAIL.

- [ ] **Step 3: Implement.** In `curveText.ts`:
  - Import `profileFields`, `profileAsymmetric`, `type ProfileFields` from `./profiles`, and `faceName` from `./angleText`.
    Check there is no cycle: `angleText` imports only `angleCuts`, `types` and `units`.
  - Add:

```ts
/** A profile's short words (spec §4): THE one home, read by the bench line and the Plans key. */
export function profileName(p: ProfileFields, units: Units): string {
  const f = (n: number) => formatLength(n, units);
  switch (p.kind) {
    case 'roundover': return `Roundover ${f(p.size)}`;
    case 'cove': return `Cove ${f(p.size)}`;
    case 'ogee': return `Roman ogee ${f(p.size)}`;
    case 'bead': return `Bead ${f(p.size)} with a ${f(p.fillet!)} quirk`;
    case 'thumbnail': return `Thumbnail ${f(p.size)} × ${f(p.depth!)}`;
  }
}
const topFace = (p: ProfileFields) => { const [u, v] = uvDims(p.through); return p.facing === 'v' ? faceName(v, p.vFrom) : faceName(u, p.uFrom); };
const filletWords = (p: ProfileFields, units: Units) => (p.kind !== 'bead' && (p.fillet ?? 0) > 0 ? `, with a ${formatLength(p.fillet!, units)} fillet` : '');
function profileLine(p: ProfileFields, units: Units): string {
  const [u, v] = uvDims(p.through);
  const top = profileAsymmetric(p) ? `, top on ${topFace(p)}` : '';
  return `${profileName(p, units)} on the edge between ${faceName(u, p.uFrom)} and ${faceName(v, p.vFrom)}, along the ${p.through}${top}${filletWords(p, units)}`;
}
```

  - In `curveLineBase`, before the `archFields` branch: `const prof = profileFields(c); if (prof) return profileLine(prof, units);`
  - In `curveLineEntries`:
    - Filter the corner collapse to `cornerFields(c) && !profileFields(c)`.
    - Add the profile collapse BEFORE the final `flatMap`. For each of the 6 faces `(D, S)`, collect the fault-free,
      not-yet-collapsed profiles whose edge has that face (`u === D && uFrom === S`, or `v === D && vFrom === S`) and whose
      top is that face (`!profileAsymmetric(p)`, or `topFace` equals that face).
    - Group them by `kind|size|depth|fillet`. A group holding four DISTINCT edges collapses: the first in stored order
      carries `{ ids, text: `${profileName} on all four edges of ${faceName(D, S)}${filletWords}` }`, and the other three
      are skipped.
    - Only a face whose four edges run along the length or width can collapse. For the thickness faces that is all four;
      for the other faces it is two, so they never collapse. No special case is needed.

  In `featureKeys.ts` `curveText`, before the `archFields` branch:

```ts
  const prof = profileFields(c);
  if (prof) return `${profileName(prof, units)}${collapsed ? ' (4×)' : ''}`;
```

  importing `profileFields` from `./profiles` and `profileName` from `./curveText`.

- [ ] **Step 4: Run.** `npx vitest run src/document/curveText.test.ts src/document/featureKeys.test.ts src/document/drawingIdentity.test.ts`.
  Expected: PASS, identity unchanged.

- [ ] **Step 5: Mutate.** Make four mutations, each with its own expected result:
  1. Drop `!profileFields(c)` from the corner collapse. Expected: the "no longer claims" test fails.
  2. Group without `fillet` in the key. Hold the expectation: decide which test should fail, and add one if none does (two
     profiles differing only in fillet must not collapse).
  3. Skip the fault filter. Expected: the faulted case fails.
  4. Drop the `top on` words. Expected: the ogee line fails.

  Restore each.

- [ ] **Step 6: Commit.** `git add src/document && git commit -m "edge profiles: bench lines, the four-edge collapse, key lines"`
  (with the Co-Authored-By line).

---

### Task 6: Shared refusals; Curves leaves profiles alone

**Files:**
- Create: `src/panels/curveRefusal.ts`
- Modify: `src/panels/Curves.tsx`
- Test: `src/panels/Curves.test.tsx`

**Interfaces (produced) in `curveRefusal.ts`:**
- `type Draft = Omit<CurveCut, 'id'>`
- `type Control = 'Rise' | 'Span' | 'Radius' | 'Start' | 'Size' | 'Reach' | 'Depth' | 'Fillet' | 'Quirk'`
- `HALF_CIRCLE`
- `pastHalfCircle(next: Draft): boolean`
- `holeRefusal(board: Board, after: Board): string | null`
- `refusalFor(board: Board, curve: CurveCut, next: Draft, control: Control | null): string | null`

- [ ] **Step 1: Move, don't change.** Move `cutDim`, `holeRefusal`, `HALF_CIRCLE`, `pastHalfCircle`, `refusalFor`, `Draft`
  and `Control` verbatim from `Curves.tsx` into `curveRefusal.ts`, exported. Widen `Control` as above, and change one line in
  `refusalFor`'s select-change sizer. Before the `bowFields` check:

```ts
    const prof = profileFields(next) ?? profileFields(curve);
    const sizer: Control = control ?? (prof ? (prof.kind === 'ogee' ? 'Size' : prof.kind === 'thumbnail' ? 'Reach' : 'Radius')
      : bowFields(next) || bowFields(curve) ? 'Rise' : cornerFields(next) || cornerFields(curve) ? 'Radius' : 'Span');
```

  `Curves.tsx` imports them. Run `npx vitest run src/panels/Curves.test.tsx`. Expected: PASS, unchanged: the move is pure.

- [ ] **Step 2: Write the failing tests.** Append to `src/panels/Curves.test.tsx` (import `profileCurve` from
  `../document/document`):

```ts
describe('Curves leaves profiles to the Profiles section (edge profiles spec §2.4)', () => {
  it('a stored through-length corner is not listed in Curves (Review Focus 1)', () => {
    open(apron({ curves: [{ id: 'c1', ...cornerCurve({ through: 'length', uFrom: 'max', vFrom: 'max', radius: 0.25 }) }] }));
    expect(screen.queryByRole('button', { name: /^Remove curve/ })).toBeNull();
    expect(screen.queryByText(/^Curves · /)).toBeNull();
  });
  it('the Rounded corner row has no Through select', () => {
    open(apron({ curves: [{ id: 'c1', ...cornerCurve({ through: 'thickness', uFrom: 'min', vFrom: 'min', radius: 1 }) }] }));
    expect(screen.queryByLabelText('Through')).toBeNull();
    expect(screen.getByLabelText('Radius')).toBeInTheDocument();
  });
  it('Kind offers Rounded corner only through the thickness', () => {
    open(apron({ length: 30, width: 0.75, thickness: 5,
      curves: [{ id: 'c1', ...archCurve({ through: 'width', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1 }) }] }));
    expect(screen.queryByRole('option', { name: /^Rounded corner/ })).toBeNull();
  });
});
```

- [ ] **Step 3: Run.** Expected: the three new tests FAIL.

- [ ] **Step 4: Implement** in `Curves.tsx`:
  - The `Curves` section lists `const shown = board.curves.filter((c) => !profileFields(c))`. Its heading count is
    `shown.length`, and the rows map over `shown`.
  - The corner branch drops its `throughSelect(...)`.
  - `KIND_OPTIONS` is filtered at render: `KIND_OPTIONS.filter((o) => o.value !== 'corner' || curve.through === 'thickness')`.
    Use the same list in the focus judgement loop.

- [ ] **Step 5: Run and mutate.** Run `npx vitest run src/panels/Curves.test.tsx`. Expected: PASS. Then make three mutations,
  each with its own expected result:
  1. Drop the filter in the section. Expected: the "not listed" test fails.
  2. Keep the corner Through select. Expected: its test fails.
  3. Drop the Kind gating. Expected: its test fails.

  Restore each.

- [ ] **Step 6: Commit.** `git add src/panels && git commit -m "edge profiles: shared curve refusals; Curves leaves profiles alone"`
  (with the Co-Authored-By line).

---

### Task 7: The Profiles section

**Files:**
- Create: `src/panels/Profiles.tsx`, `src/panels/Profiles.test.tsx`
- Modify: `src/panels/Properties.tsx` (render `<Profiles board={board} />` after `<Curves board={board} />`, line ~715)

**Interfaces (consumed):** `profileFields`, `profileCurve`, `defaultProfile`, `PROFILE_EDGES`, `PROFILE_KINDS`,
`profileAsymmetric`, `DEFAULT_PROFILE_EDGE`, `uvDims`, `curveFaults`, `curveLine`, `curveFaultText`; and `refusalFor`,
`holeRefusal` from `./curveRefusal`. Labels the tests read:
- the heading `Profiles`;
- the menu `+ Add profile`;
- the items `Roundover`, `Cove`, `Roman ogee`, `Bead`, `Thumbnail`;
- the fields `Edge`, `Profile`, `Radius` | `Size` | `Reach`, `Depth`, `Fillet`, `Quirk`, `Facing`;
- the remove button `Remove profile (<line>)`.

- [ ] **Step 1: Write the failing tests.** Create `src/panels/Profiles.test.tsx`:

```tsx
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { cornerCurve, createBoard, createDocument, profileFields } from '../document/document';
import type { Board, CurveCut } from '../document/document';
import { Properties } from './Properties';

const top = (over: Partial<Board> = {}) => createBoard({ id: 'top', name: 'Top', length: 36, width: 20, thickness: 0.75, ...over });
const open = (b: Board) => {
  useStore.getState().replaceDocument({ ...createDocument('T'), boards: [b] });
  useStore.getState().selectBoard(b.id);
  render(<Properties />);
};
const add = async (user: ReturnType<typeof userEvent.setup>, item: string) => {
  await user.click(screen.getByRole('button', { name: '+ Add profile' }));
  await user.click(screen.getByRole('button', { name: item }));
};
const curves = () => (useStore.getState().doc.boards[0] as Board).curves;
const typeInto = async (user: ReturnType<typeof userEvent.setup>, label: string, text: string) => {
  const el = screen.getByLabelText(label);
  await user.clear(el); await user.type(el, `${text}{Enter}`);
  return el;
};

describe('the Profiles section (edge profiles spec §3)', () => {
  it('adds a Roundover on the top long edge in one undo entry, with its bench line', async () => {
    const user = userEvent.setup();
    open(top());
    const before = useStore.getState().past.length;
    await add(user, 'Roundover');
    expect(profileFields(curves()[0]!)).toMatchObject({ kind: 'roundover', through: 'length', uFrom: 'max', vFrom: 'max', size: 0.25 });
    expect(useStore.getState().past.length).toBe(before + 1);
    expect(screen.getByText(/^Roundover 1\/4" on the edge between the width face \(max side\)/)).toBeInTheDocument();
    expect(screen.getByText(/^Profiles/)).toBeInTheDocument();
  });
  it('a stored through-length corner appears here as a Roundover (Review Focus 1)', () => {
    const c: CurveCut = { id: 'c1', ...cornerCurve({ through: 'length', uFrom: 'min', vFrom: 'max', radius: 0.375 }) };
    open(top({ curves: [c] }));
    expect((screen.getByLabelText('Profile') as HTMLSelectElement).value).toBe('roundover');
    expect(curves()[0]).toEqual(c);
  });
  it('Radius edits the size; Fillet shows Facing; Facing flips the top', async () => {
    const user = userEvent.setup();
    open(top());
    await add(user, 'Roundover');
    await typeInto(user, 'Radius', '3/8');
    expect(profileFields(curves()[0]!)!.size).toBe(0.375);
    expect(screen.queryByLabelText('Facing')).toBeNull();
    await typeInto(user, 'Fillet', '1/16');
    expect(profileFields(curves()[0]!)!.fillet).toBe(0.0625);
    await user.selectOptions(screen.getByLabelText('Facing'), 'u');
    expect(profileFields(curves()[0]!)!.facing).toBe('u');
  });
  it('Edge moves the profile, keeping its size', async () => {
    const user = userEvent.setup();
    open(top());
    await add(user, 'Cove');
    await user.selectOptions(screen.getByLabelText('Edge'), 'Length min end · thickness max side');
    expect(profileFields(curves()[0]!)).toMatchObject({ kind: 'cove', through: 'width', uFrom: 'min', vFrom: 'max', size: 0.375 });
  });
  it('Profile change keeps the edge and takes the new kind\'s defaults', async () => {
    const user = userEvent.setup();
    open(top());
    await add(user, 'Roundover');
    const id = curves()[0]!.id;
    await user.selectOptions(screen.getByLabelText('Profile'), 'thumbnail');
    expect(profileFields(curves()[0]!)).toMatchObject({ kind: 'thumbnail', through: 'length', uFrom: 'max', vFrom: 'max', size: 0.75, depth: 0.25 });
    expect(curves()[0]!.id).toBe(id);
  });
  it('a Profile change whose default would fault is refused, nothing stored (Review Focus 4)', async () => {
    const user = userEvent.setup();
    // A thick, narrow rail: the default thumbnail's 3/4" reach along a 1/2" face fits only scaled, but a profile change
    // keeps the STORED edge, where a later shrink can make the kind's default run off. Build that case explicitly:
    open(top({ width: 0.5, thickness: 3 }));
    await add(user, 'Roundover');
    act(() => useStore.getState().updateBoard('top', { width: 0.1 }));
    const stored = curves()[0]!;
    await user.selectOptions(screen.getByLabelText('Profile'), 'ogee');
    if (JSON.stringify(curves()[0]) !== JSON.stringify(stored)) throw new Error('premise: pick a case whose default faults');
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
  it('Thumbnail Depth must be less than its Reach', async () => {
    const user = userEvent.setup();
    open(top());
    await add(user, 'Thumbnail');
    await typeInto(user, 'Depth', '1');
    expect(profileFields(curves()[0]!)!.depth).toBe(0.25);
    expect(screen.getByRole('alert')).toHaveTextContent('Depth must be less than the reach');
  });
  it('a preset whose default would fault is withheld', async () => {
    const user = userEvent.setup();
    open(top({ curves: [] , holes: [] }));
    await user.click(screen.getByRole('button', { name: '+ Add profile' }));
    for (const item of ['Roundover', 'Cove', 'Roman ogee', 'Bead', 'Thumbnail']) expect(screen.getByRole('button', { name: item })).toBeInTheDocument();
  });
  it('menu details read the project units (Review Focus 5)', async () => {
    const user = userEvent.setup();
    open(top());
    act(() => useStore.getState().setUnitsDisplay('metric-mm'));
    await user.click(screen.getByRole('button', { name: '+ Add profile' }));
    expect(screen.getByText('6 mm radius, on the top long edge')).toBeInTheDocument();
  });
});
```

  Two placeholder-shaped tests must be made exact while implementing. They are flagged here so they are not left vague:
  - **"a Profile change whose default would fault":** find a REAL board and edge where the target kind's
    `defaultProfile(board, kind, edge, facing)` faults (compute it in a scratch test with `curveFaults`), set the fixture to
    it, and replace the `if … throw` premise with a plain `expect(curves()[0]).toEqual(stored)`. If no such case exists
    (defaults always scale to fit), the refusal path is unreachable for Profile changes. In that case, replace the test with
    one asserting that EVERY kind's default fits on a 0.1" × 3" rail, and ledger the ruling.
  - **"withheld":** add a negative case where a hole sits in the default roundover's waste on the top long edge, so
    Roundover is withheld while Cove may not be. Compute the premise with `holeFaults` first.

- [ ] **Step 2: Run.** Expected: FAIL (no Profiles section).

- [ ] **Step 3: Implement `Profiles.tsx`.** Follow `Curves.tsx`'s structure (the row view's `attempt`/`field`/`set`, error
  state, the stored-fault note, `data-kind`). Key pieces:

```tsx
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
const sideText = (d: Dimension, side: CutFrom) => `${d} ${side} ${d === 'length' ? 'end' : 'side'}`;
const edgeLabel = (e: ProfileEdge) => { const [u, v] = uvDims(e.through); return cap(`${sideText(u, e.uFrom)} · ${sideText(v, e.vFrom)}`); };
const KIND_LABEL: Record<ProfileKind, string> = { roundover: 'Roundover', cove: 'Cove', ogee: 'Roman ogee', bead: 'Bead', thumbnail: 'Thumbnail' };
const SIZE_LABEL: Record<ProfileKind, Control> = { roundover: 'Radius', cove: 'Radius', ogee: 'Size', bead: 'Radius', thumbnail: 'Reach' };
```

  The row (`ProfileRow({ board, curve, p }: { board: Board; curve: CurveCut; p: ProfileFields })`):
  - `write(next: ProfileFields, control: Control | null)` goes through `refusalFor(board, curve, profileCurve(next), control)`,
    then `updateCurve`.
  - **Edge select** (`id=profile-edge-<id>`): value = the index of the stored edge in `PROFILE_EDGES`. On change,
    `write({ ...p, ...PROFILE_EDGES[i] }, null)`.
  - **Profile select** (`profile-kind-<id>`): option values are the kinds. On change,
    `set(defaultProfile(board, kind, edge, p.facing))` through the same refusal.
  - **Size field** labelled `SIZE_LABEL[p.kind]`: `DimensionField` with `field({ ...p, size: v }, label)`. For a thumbnail it
    refuses `v <= p.depth` with `Reach must be more than the depth`.
  - **Depth** (thumbnail): refuses `v >= p.size` with `Depth must be less than the reach`.
  - **Fillet** (roundover, cove, ogee): `min={0}`.
  - **Quirk** (bead): refuses `v <= 0` with `The quirk must be more than 0`.
  - **Facing select**, only when `profileAsymmetric(p)`: options `v` → `Top: ${sideText(v, p.vFrom)}`, `u` →
    `Top: ${sideText(u, p.uFrom)}`.
  - **Remove:** `aria-label={`Remove profile (${line})`}` → `removeCurve`.

  The section:
  - `const rows = board.curves.flatMap((c) => { const p = profileFields(c); return p ? [{ c, p }] : []; })`;
  - the heading `Profiles` plus ` · n` when n > 0;
  - the menu's `fits` is the Curves one: `curveFaults` empty, and `holeRefusal(board, after) === null`;
  - each item's `detail` comes from that kind's default fields, in the project's units via `formatLength`:
    - roundover, cove and bead read `${f(size)} radius`, and the bead adds `, ${f(fillet)} quirk`;
    - ogee reads `${f(size)}`;
    - thumbnail reads `${f(size)} × ${f(depth)}`;
    - each followed by `, on the top long edge`.

  Every hook sits above any branch (the AngleCuts rule).

  Add `<Profiles board={board} />` after `<Curves board={board} />` in `Properties.tsx`.

- [ ] **Step 4: Run.** `npx vitest run src/panels/Profiles.test.tsx src/panels/Curves.test.tsx`. Expected: PASS.

- [ ] **Step 5: Mutate.** Make four mutations, each with its own expected result:
  1. Drop the Depth refusal. Expected: its test fails.
  2. Show Facing always. Expected: the "no Facing before a fillet" assertion fails.
  3. Make a Profile change keep the old size. Expected: the thumbnail assertion fails.
  4. Skip the `fits` withhold. Expected: the hole case fails.

  Restore each.

- [ ] **Step 6: Full suite and build.** `npm test 2>&1 | tail -4 && npm run build 2>&1 | tail -3`. Expected: all pass; the build
  succeeds.

- [ ] **Step 7: Commit.** `git add src && git commit -m "edge profiles: the Profiles section (Edge, Profile, sizes, Fillet, Facing)"`
  (with the Co-Authored-By line).

---

### Task 8: Sharp lines, performance, watertightness

**Files:**
- Test: `src/document/profiles.test.ts` (sharp lines)
- Test: `src/viewport/curvesPerf.test.ts`, `src/viewport/curvesWatertight.test.ts` (append cases)

- [ ] **Step 1: Write the tests.** Sharp lines (spec §4: a line along `through` only at a SHARP outline vertex): on a
  36 × 20 × 3/4 board with one profile on the default edge, count `partGeometry(b).edges` segments of length 36 (lines along
  the length). With no profile there are 4, the box's long edges, and one of them is consumed by the profile's corner.
  Expected totals:

  | Profile | Lines along the length | Why |
  |---|---|---|
  | roundover | 3 | the 3 untouched box edges; tangent ends draw nothing |
  | cove | 5 | 3 + its two sharp ends |
  | ogee | 4 | 3 + its sharp top entry; its S join and edge-face end are tangent |
  | bead | 5 | 3 + the quirk's two corners (its wall on the top face, its inner corner); the arc is tangent to the quirk floor and to the edge face |
  | thumbnail | 4 | 3 + the crisp line on the edge face; tangent on the top |

  Compute each expectation from the outline before asserting; if the code disagrees, find out which side is wrong (the
  inv 16 rule is the authority) and ledger it.

  Perf: append to `curvesPerf.test.ts` (same `minOf9`, ≤ 40 ms):
  - a 36 × 20 × 3/4 top with the four-edge Roundover set (`defaultProfile` on the 4 top edges);
  - a 36 × 10 × 3/4 shelf with an ogee on one long edge and a bead on one end (mixed axes).

  Watertight: append the same two parts plus a cove, a thumbnail and a filleted ogee to `curvesWatertight.test.ts`'s cases
  (`unmatched` must be 0).

- [ ] **Step 2: Run.** `npx vitest run src/document/profiles.test.ts src/viewport/curvesPerf.test.ts src/viewport/curvesWatertight.test.ts`.
  Expected: PASS. The probe measured 2–12 ms and 0 open edges. A failure here is a real defect: debug it, don't loosen it.

- [ ] **Step 3: Mutate.** Expect the cove's line count to be 3 (as if its ends were tangent). Expected: the test fails.
  Restore.

- [ ] **Step 4: Commit.** `git add src && git commit -m "edge profiles: sharp-line, perf and watertight cases"` (with the
  Co-Authored-By line).

---

### Task 9: Live pass, record, final review, merge

- [ ] **Step 1: Dev server** (already running on `:5180`, or `npm run dev -- --port 5180 --host 127.0.0.1` in the
  background). Import a fixture project: a 36 × 20 × 3/4 top with a Roundover on all four top edges; a shelf with an ogee,
  a bead and a thumbnail; and a part holding a pre-chunk through-length corner. Leave it in place. Check and record:
  1. Properties: the Profiles section lists each, Curves lists none of them; edit Radius, Fillet, Facing, Edge and Profile.
  2. Viewport (Iso, and close up with Front/Side).
  3. Plans sheet: the exploded view draws the four-edge top whole (fu 386); the trio's Side view shows each profile's true
     shape; the key list reads `Roundover 1/4" (4×)` etc.
  4. Cut list: the bench lines, the four-edge collapse, part-diagram notes.
  5. Metric: switch to mm and read the lines.

  Screenshots under `docs/img/edge-profiles-*.png`; prefer DOM readouts. Software GL is slow here: pass screenshot
  `timeout: 90000`.

- [ ] **Step 2: Record.**
  - `docs/browser-verification-edge-profiles.md`;
  - `docs/follow-ups.md`: fu 386 closed; fu 365 noting chunk 1 shipped, chunk 2 open; new residue numbers if any;
  - `docs/history.md` section;
  - `CLAUDE.md`:
    - the Status bullet;
    - the Rounds-shipped row;
    - the `profiles.ts` entry in Where things live;
    - the inv 53 addendum, in one sentence: profiles are curves recognised by `profileFields`, never through the thickness;
    - the test count;
  - the spec's Status line.

  Commit.

- [ ] **Step 3: Final whole-branch review** (fresh reviewer, most capable model), with this plan's Review Focus. Fix
  Critical/Important test-first; ledger the minors.

- [ ] **Step 4: Merge.** `git checkout master && git merge --no-ff edge-profiles-1`, then on the merged tree
  `npm test && npm run build`, then `git branch -d edge-profiles-1`. Deploy only on the user's word.
