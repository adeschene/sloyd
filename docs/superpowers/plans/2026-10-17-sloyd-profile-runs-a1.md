# Profile runs, chunk a1 (schema 18: the profiles list) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move edge profiles out of `Board.curves` into a new stored `Board.profiles` list (schema 18), with every drawing,
mesh, edge, snap point, diagram, bench line, key and fault byte for byte what chunk 1 gives today.

**Architecture:**
- A `ProfileCut` is stored per part and shape, and is shared like curves.
- On every load, a curve that `profileFields` recognises is moved into `profiles`.
- Every reader that turns a part into geometry, words or faults reads ONE view, `geometryBoard(board)`: the part's curves, then
  each profile rewritten as the exact `CurveCut` chunk 1 stored (`profileAsCurve`).
- Storage paths (validation, copies, mirroring, links, write-back, the store, the panel) handle `profiles` as their own list.

**Tech Stack:** TypeScript, React, Zustand, Vitest. `npm test` (Vitest) does NOT typecheck; `npm run build` (`tsc -b && vite build`) is the typecheck gate.

**Spec:** `docs/superpowers/specs/2026-10-17-sloyd-profile-runs-design.md` (§3 stored form, R4a and P1–P8 *Amended (planning)*).
Chunk a1 only. Stops and their run-out are chunk a2; following outlines is chunk b. Read the spec's P1–P8 before any task.

## Global Constraints

- `CURRENT_VERSION` becomes **18**. A build that understands only 17 refuses a v18 document (the existing newer-version gate).
- **Byte for byte:** a part whose only curve-like features are profiles gives exactly chunk 1's output from every reader (bodies,
  edges, `drawView` in Front/Side/Plan/Iso, silhouettes, snap points, diagrams, bench lines, keys, hole faults, the cut list,
  `bodyMesh`, `boardUVSignature`). A part with both curves and profiles holds the same wood (volume to 1e-8); its line order may
  differ (P4).
- **The geometry view:** `geometryBoard(b)` returns `b` ITSELF when `b.profiles` is empty or absent. Otherwise it returns ONE
  memoised object (WeakMap keyed on `b`): `{ ...b, curves: [...b.curves, ...b.profiles.map(profileAsCurve)], profiles: [] }`.
  The emptied `profiles` makes it idempotent.
- **End to end form (P3):** `run: { start: { side, through: 'min' }, end: { side, through: 'max' } }`, one side. For every
  profile through the length or width, `uvDims(through)` is `[u, 'thickness']`, so `face = vFrom`,
  `side = { across: u, from: uFrom }`, and `facing 'v' ↔ 'face'`, `'u' ↔ 'edge'`. A symmetric kind is always stored `'face'`.
- **Refuse, do not drop (P2):** a well-formed profile whose run a1 cannot build refuses the whole document with
  `This project has an edge profile this version of Sloyd can't build (<reason>) — it was saved by a newer version of Sloyd.`
  The reason is `"all round"`, `"stopped"` or `"ends on two sides"`. So does an unknown `kind` STRING: `(kind "<k>")`.
- **Ids (P7):** profile ids share the part's curve id scope (`takeId`, one `seen` set per part/shape, curves first).
- **No new words:** every string a user reads is unchanged. No CSS change.
- Invariants touched: 33 (id scope), 40 (`PROFILE_FIELDS`), 44 (`mirrorProfile`: flag flips only), 45 (`profiles` shared in
  `LINK_FIELDS`), 46 (write-back lowering), 48/53 (the view). Never `board[dim] - x` at a call site (inv 44).
- Commit after each task with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Branch `profile-runs-a1`.

## Review Focus

1. **A reader left on `board.curves`.** A migrated part then loses a profile in one place only (no snap points on it, a diagram
   without its note, a bare hole fault). Task 3's corpus compares every reader; any reader added later must take the view.
2. **A mirrored assembly edit.** Lowering a profile edited inside a mirrored copy must store the un-mirrored profile, and an
   untouched one must keep its stored object (`lowerProfiles`). Task 4 pins both.
3. **A v18 file from a later build** (a loop or a stopped run) must refuse, never draw full length. Task 2 pins each reason.
4. **A shape's users.** `profiles` is shared: an edit through one user reaches every user, and Link compares profiles exactly
   with ids. Task 4 pins Link equality and a shape edit.
5. **A hand-made v17 curve in the facing-u order of a symmetric profile** migrates to `facing: 'face'` with the same wood (P5).
   Task 2 pins it.

---

### Task 1: The stored model (`ProfileCut`) and its conversions

**Files:**
- Modify: `src/document/types.ts` (add the profile types; `Board.profiles`)
- Modify: `src/document/profiles.ts` (conversions, compare, copy, mirror, `geometryBoard`)
- Modify: `src/document/links.ts:13-62` (`LINK_FIELDS.profiles: 'shared'`, `sharedOf`, `sharedPatch`, `sameShared`)
- Modify: `src/document/shapes.ts:34` (resolveBoard copies `profiles`)
- Modify: `src/document/document.ts:236-252` (`createBoard` default `profiles: []`) and its re-exports (`:44-45`)
- Modify: `src/document/generated.ts:294,305,317` (board literals get `profiles: []`)
- Test: `src/document/profiles.test.ts` (append)

**Interfaces:**
- Produces (types.ts):
  ```ts
  export type ProfileKind = 'roundover' | 'cove' | 'ogee' | 'bead' | 'thumbnail';
  export interface ProfileSide { across: 'length' | 'width'; from: CutFrom }
  export type ProfileEnd = { side: ProfileSide; from: CutFrom; at: number } | { side: ProfileSide; through: CutFrom };
  export type ProfileRun = { loop: true } | { start: ProfileEnd; end: ProfileEnd };
  export interface ProfileCut { id: string; face: CutFrom; kind: ProfileKind; size: number; depth?: number; fillet?: number; facing: 'face' | 'edge'; run: ProfileRun }
  // Board gains: profiles: ProfileCut[];
  ```
- Produces (profiles.ts): `PROFILE_FIELDS`, `profileValues(p): string`, `sameProfile(a, b): boolean`,
  `copyProfile(p): ProfileCut`, `endToEnd(run): run is { start: ProfileEnd & {through}; end: ProfileEnd & {through} }`,
  `profileToFields(p): ProfileFields`, `profileFromFields(f): Omit<ProfileCut, 'id'>`, `profileAsCurve(p): CurveCut`,
  `profileOf(c): Omit<ProfileCut, 'id'> | null`, `mirrorProfile(p, d): ProfileCut`, `geometryBoard<T>(b: T): T`.
  `ProfileKind` is re-exported from profiles.ts so existing imports keep working.

- [ ] **Step 1: Write the failing tests.** Append to `src/document/profiles.test.ts`. Extend its imports: from `./profiles`, add
  `profileAsCurve, profileOf, profileFromFields, profileToFields, mirrorProfile, sameProfile, copyProfile, geometryBoard,
  profileValues`; from `./curves`, add `mirrorCurveCut` (already imported). Add `ProfileCut` to the `./types` type import.

```ts
/** Every chunk-1 profile a writer can store: each kind × 8 edges × both facings (symmetric kinds collapse to v), with and
 *  without a fillet where the kind takes one. */
const corpus = (): ProfileFields[] => PROFILE_EDGES.flatMap((e) => PROFILE_KINDS.flatMap((kind) => {
  const sizes: Pick<ProfileFields, 'size' | 'depth' | 'fillet'>[] = kind === 'thumbnail' ? [{ size: 0.75, depth: 0.25 }]
    : kind === 'bead' ? [{ size: 0.25, fillet: 0.0625 }] : [{ size: 0.375, fillet: 0 }, { size: 0.375, fillet: 0.0625 }];
  return sizes.flatMap((s) => (['v', 'u'] as const).map((facing) => ({ ...e, kind, ...s, facing })))
    .filter((f) => profileAsymmetric(f) || f.facing === 'v');
}));

describe('ProfileCut, the stored form (profile runs spec §3.1, chunk a1)', () => {
  it('every chunk-1 profile converts to a ProfileCut and back to the BYTES chunk 1 stored', () => {
    for (const f of corpus()) {
      const c = profileCurve(f);
      const p = profileOf(c);
      expect(p, JSON.stringify(f)).not.toBeNull();
      expect(profileAsCurve({ id: 'x', ...p! })).toEqual({ id: 'x', ...c });
    }
  });
  it('the mapping: face is vFrom, the side is u at uFrom, facing v is the face, End to end runs min to max', () => {
    const p = profileOf(profileCurve({ through: 'length', uFrom: 'max', vFrom: 'min', kind: 'ogee', size: 0.5, fillet: 0, facing: 'u' }))!;
    expect(p).toEqual({ face: 'min', kind: 'ogee', size: 0.5, fillet: 0, facing: 'edge',
      run: { start: { side: { across: 'width', from: 'max' }, through: 'min' }, end: { side: { across: 'width', from: 'max' }, through: 'max' } } });
    const q = profileOf(profileCurve({ through: 'width', uFrom: 'min', vFrom: 'max', kind: 'roundover', size: 0.25, fillet: 0, facing: 'v' }))!;
    expect(q.face).toBe('max');
    expect(q.facing).toBe('face');
    expect('loop' in q.run ? null : q.run.start.side).toEqual({ across: 'length', from: 'min' });
  });
  it('a symmetric profile is always stored facing face (P5: a facing-u roundover reads as face)', () => {
    const v = profileCurve({ through: 'length', uFrom: 'max', vFrom: 'max', kind: 'roundover', size: 0.25, fillet: 0, facing: 'v' });
    const u = profileCurve({ through: 'length', uFrom: 'max', vFrom: 'max', kind: 'roundover', size: 0.25, fillet: 0, facing: 'u' });
    expect(profileOf(u)!.facing).toBe('face');
    expect(profileAsCurve({ id: 'x', ...profileOf(u)! })).toEqual({ id: 'x', ...v });
  });
  it('a plain arch is not a profile', () => {
    expect(profileOf(archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1.25 }))).toBeNull();
  });
  it('mirrorProfile is mirrorCurveCut by flags, in every dimension (inv 44)', () => {
    for (const f of corpus()) for (const d of ['length', 'width', 'thickness'] as const) {
      const p: ProfileCut = { id: 'x', ...profileFromFields(f) };
      expect(profileAsCurve(mirrorProfile(p, d)), `${JSON.stringify(f)} ${d}`).toEqual(mirrorCurveCut(profileAsCurve(p), d));
      expect(mirrorProfile(mirrorProfile(p, d), d)).toEqual(p);
    }
  });
  it('sameProfile compares every field but id, exactly; copyProfile shares no object', () => {
    const p: ProfileCut = { id: 'a', ...profileFromFields(corpus()[0]!) };
    expect(sameProfile(p, { ...p, id: 'b' })).toBe(true);
    expect(sameProfile(p, { ...p, size: p.size + 1e-12 })).toBe(false);
    expect(sameProfile(p, { ...p, face: p.face === 'min' ? 'max' : 'min' })).toBe(false);
    const c = copyProfile(p);
    expect(c).toEqual(p);
    expect(c.run).not.toBe(p.run);
    if (!('loop' in c.run) && !('loop' in p.run)) expect(c.run.start.side).not.toBe(p.run.start.side);
    expect(profileValues({ ...p, depth: undefined })).toBe(profileValues(p));
  });
  it('geometryBoard: the same object with no profiles; else curves then profiles as curves, memoised, idempotent', () => {
    const arch = { id: 'c1', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1.25 }) };
    const plain = createBoard({ length: 30, width: 5, curves: [arch] });
    expect(geometryBoard(plain)).toBe(plain);
    const p: ProfileCut = { id: 'p1', ...profileFromFields(corpus()[0]!) };
    const b = createBoard({ length: 30, width: 5, curves: [arch], profiles: [p] });
    const g = geometryBoard(b);
    expect(g.curves).toEqual([arch, profileAsCurve(p)]);
    expect(g.profiles).toEqual([]);
    expect(geometryBoard(b)).toBe(g);
    expect(geometryBoard(g)).toBe(g);
  });
});
```

- [ ] **Step 2: Run them.** `npx vitest run src/document/profiles.test.ts`. Expected: FAIL on the missing exports (an import
  error fails the file; that is the RED).

- [ ] **Step 3: Add the types.** In `src/document/types.ts`, before `export interface Board`, add the five declarations from the
  Interfaces block with these doc comments. Then add `profiles: ProfileCut[];` after `curves` in `Board`:

```ts
/** A routed edge profile's kind (edge profiles spec §2; profile runs spec §3.1). */
export type ProfileKind = 'roundover' | 'cove' | 'ogee' | 'bead' | 'thumbnail';
/** One side of a broad (thickness) face: the edge at `across`'s `from` end, running along the face's other dimension. */
export interface ProfileSide { across: 'length' | 'width'; from: CutFrom }
/** A run's end: a station along the side measured from the named end of its run dimension, or — at a side's sharp corner —
 *  out through that end face (chunk 1's full-length profile). Chunk a1 builds only `through` ends on one side. */
export type ProfileEnd = { side: ProfileSide; from: CutFrom; at: number } | { side: ProfileSide; through: CutFrom };
export type ProfileRun = { loop: true } | { start: ProfileEnd; end: ProfileEnd };
/** An edge profile (profile runs spec §3): routed from the broad face `face` along `run`; sizes as chunk 1's ProfileFields. */
export interface ProfileCut {
  id: string;
  face: CutFrom;
  kind: ProfileKind;
  /** roundover/cove/bead: radius; ogee: size; thumbnail: reach */
  size: number;
  /** thumbnail only (0 < depth < size) */
  depth?: number;
  /** roundover/cove/ogee: fillet (0 = none); bead: quirk (> 0); absent on a thumbnail */
  fillet?: number;
  /** asymmetric kinds: the profile's top on the broad face or on the side face; symmetric kinds: always 'face' */
  facing: 'face' | 'edge';
  run: ProfileRun;
}
```

In `Board`, after `curves: CurveCut[];`:

```ts
  /** Edge profiles (profile runs spec §3). Empty for most parts. Geometry reads them through `geometryBoard`. */
  profiles: ProfileCut[];
```

- [ ] **Step 4: Write the conversions.** In `src/document/profiles.ts`:
  - Change the first import line to
    `import type { Board, CurveCut, CurveSegment, CutFrom, Dimension, ProfileCut, ProfileEnd, ProfileKind, ProfileSide } from './types';`.
  - Replace the local `export type ProfileKind = …` line with `export type { ProfileKind } from './types';`.
  - Append:

```ts
/** Every ProfileCut field but `id`, compared exactly (invariant 40's table, checked against the type). */
export const PROFILE_FIELDS = {
  face: true, kind: true, size: true, depth: true, fillet: true, facing: true, run: true,
} as const satisfies Record<Exclude<keyof ProfileCut, 'id'>, true>;
const PROFILE_KEYS = Object.keys(PROFILE_FIELDS) as (keyof typeof PROFILE_FIELDS)[];
const pnum = (n: number) => (Object.is(n, -0) ? '-0' : String(n));
const endText = (e: ProfileEnd) => `${e.side.across}:${e.side.from}:${'through' in e ? `t${e.through}` : `${e.from}${pnum(e.at)}`}`;

/** One profile's comparable value, exact, in PROFILE_KEYS order (a shape's grouping signature reads it). */
export function profileValues(p: Omit<ProfileCut, 'id'>): string {
  return PROFILE_KEYS.map((k) => {
    if (k === 'run') return 'loop' in p.run ? 'loop' : `${endText(p.run.start)}>${endText(p.run.end)}`;
    const v = p[k];
    return v === undefined ? '-' : typeof v === 'number' ? pnum(v) : v;
  }).join('|');
}
export const sameProfile = (a: Omit<ProfileCut, 'id'>, b: Omit<ProfileCut, 'id'>): boolean => profileValues(a) === profileValues(b);

/** A deep copy: no two parts ever hold one run or side object. */
export function copyProfile(p: ProfileCut): ProfileCut {
  const end = (e: ProfileEnd): ProfileEnd => ('through' in e ? { side: { ...e.side }, through: e.through } : { side: { ...e.side }, from: e.from, at: e.at });
  return { ...p, run: 'loop' in p.run ? { loop: true } : { start: end(p.run.start), end: end(p.run.end) } };
}

type ThroughEnd = { side: ProfileSide; through: CutFrom };
/** A chunk-1 run: out through both end faces of one side (spec P3). */
export function endToEnd(run: ProfileCut['run']): run is { start: ThroughEnd; end: ThroughEnd } {
  return !('loop' in run) && 'through' in run.start && 'through' in run.end
    && run.start.side.across === run.end.side.across && run.start.side.from === run.end.side.from;
}

/**
 * An End to end profile as chunk 1's fields. Through the length or width, `uvDims(through)` is [u, 'thickness']: the face is
 * `vFrom`, the side is u at `uFrom`, and facing 'face' is chunk 1's 'v' (T on the broad face). A symmetric kind is written at
 * 'v', as chunk 1's writers did. Throws on a run chunk a1 cannot build (the loader refuses those, spec P2).
 */
export function profileToFields(p: Omit<ProfileCut, 'id'>): ProfileFields {
  if (!endToEnd(p.run)) throw new Error('profileToFields: only an End to end run is built in chunk a1');
  const side = p.run.start.side;
  const f: ProfileFields = {
    through: side.across === 'width' ? 'length' : 'width', uFrom: side.from, vFrom: p.face, kind: p.kind, facing: 'v', size: p.size,
    ...(p.depth !== undefined ? { depth: p.depth } : {}), ...(p.fillet !== undefined ? { fillet: p.fillet } : {}),
  };
  return profileAsymmetric(f) && p.facing === 'edge' ? { ...f, facing: 'u' } : f;
}

/** Chunk 1's fields as a stored End to end profile (the inverse of profileToFields). */
export function profileFromFields(f: ProfileFields): Omit<ProfileCut, 'id'> {
  const [u] = uvDims(f.through) as ['length' | 'width', Dimension];
  const side: ProfileSide = { across: u, from: f.uFrom };
  return {
    face: f.vFrom, kind: f.kind, size: f.size,
    ...(f.depth !== undefined ? { depth: f.depth } : {}), ...(f.kind === 'thumbnail' ? {} : { fillet: f.fillet ?? 0 }),
    facing: profileAsymmetric(f) && f.facing === 'u' ? 'edge' : 'face',
    run: { start: { side, through: 'min' }, end: { side: { ...side }, through: 'max' } },
  };
}

/** THE profile → geometry step (spec P4): the exact CurveCut chunk 1 stored for this profile, with its id. */
export function profileAsCurve(p: ProfileCut): CurveCut {
  return { id: p.id, ...profileCurve(profileToFields(p)) };
}

/** A stored curve's profile (the migration's reader, spec §3.2), or null when it is not one. */
export function profileOf(c: Omit<CurveCut, 'id'>): Omit<ProfileCut, 'id'> | null {
  const f = profileFields(c);
  return f ? profileFromFields(f) : null;
}

const flip = (f: CutFrom): CutFrom => (f === 'min' ? 'max' : 'min');
/**
 * A profile reflected along `d` (invariant 44): flag flips only. `face` flips through the thickness; a side's `from` when its
 * `across` is `d`. An End to end run keeps min→max (a full side has no travel to reverse, spec P3); a station run's ends flip
 * their `from` along the run dimension, and swap, since a reflection reverses travel (chunk a2 builds those).
 */
export function mirrorProfile(p: ProfileCut, d: Dimension): ProfileCut {
  if (d === 'thickness') return { ...p, face: flip(p.face) };
  if ('loop' in p.run) return p;
  const side = (s: ProfileSide): ProfileSide => (s.across === d ? { ...s, from: flip(s.from) } : s);
  if (endToEnd(p.run)) return { ...p, run: { start: { ...p.run.start, side: side(p.run.start.side) }, end: { ...p.run.end, side: side(p.run.end.side) } } };
  const end = (e: ProfileEnd): ProfileEnd => {
    const runDim = e.side.across === 'width' ? 'length' : 'width';
    if (d !== runDim) return { ...e, side: side(e.side) };
    return 'through' in e ? { side: side(e.side), through: flip(e.through) } : { side: side(e.side), from: flip(e.from), at: e.at };
  };
  return { ...p, run: { start: end(p.run.end), end: end(p.run.start) } };
}

const views = new WeakMap<object, object>();
/**
 * THE geometry view (profile runs spec P4). Every reader that turns a part into geometry, words or faults reads this: the
 * part's curves, then each profile as the CurveCut chunk 1 stored. The SAME object when the part has no profiles; else one
 * memoised object per part, its `profiles` emptied so a second call returns it unchanged.
 */
export function geometryBoard<T extends Pick<Board, 'curves'> & { profiles?: readonly ProfileCut[] }>(b: T): T {
  if (!b.profiles || b.profiles.length === 0) return b;
  const hit = views.get(b);
  if (hit) return hit as T;
  const view = { ...b, curves: [...b.curves, ...b.profiles.map(profileAsCurve)], profiles: [] } as T;
  views.set(b, view);
  return view;
}
```

- [ ] **Step 5: Make it compile.** `npm run build 2>&1 | grep error | head -40`. Fix every error the new required field raises:
  - `createBoard` in `document.ts`: add `profiles: [],` after `curves: [],`.
  - `links.ts`:
    - `LINK_FIELDS` gains `profiles: 'shared'`;
    - `sharedOf` gains `profiles: b.profiles.map(copyProfile),`;
    - `sharedPatch` gains `if (patch.profiles) out.profiles = patch.profiles.map(copyProfile);`;
    - `sameShared` gains the branch below, placed before the final `else if`. Import `copyProfile, sameProfile` from `./profiles`.

```ts
    } else if (k === 'profiles') {
      if (a.profiles.length !== b.profiles.length) return false;
      for (let i = 0; i < a.profiles.length; i += 1) {
        const pa = a.profiles[i]!;
        const pb = b.profiles[i]!;
        if (pa.id !== pb.id || !sameProfile(pa, pb)) return false;
      }
```

  - `shapes.ts:34`: extend the ternary with `: k === 'profiles' ? s.profiles.map(copyProfile)` before the final `: s[k]` (import
    `copyProfile`).
  - `generated.ts:294,305,317`: add `profiles: []` beside each `curves: []`.
  - In `document.ts:44-45`: add `profileAsCurve, profileOf, profileFromFields, profileToFields, mirrorProfile, sameProfile,
    copyProfile, geometryBoard, endToEnd, PROFILE_FIELDS, profileValues` to the profiles re-export.
  - Test files that build a `Board` literal without `createBoard`: add `profiles: []`. The build lists each one.

  Do NOT touch any reader's behaviour in this task.

- [ ] **Step 6: Run.** `npx vitest run src/document/profiles.test.ts src/document/links.test.ts` → PASS. Then
  `npm run build 2>&1 | tail -3` → builds.

- [ ] **Step 7: Mutate.** Each must turn a test red; restore after each.
  1. In `profileToFields`, drop the asymmetric facing mapping (always `'v'`). The bytes test fails.
  2. In `mirrorProfile`, flip `face` for every `d`. The mirror test fails.
  3. In `geometryBoard`, drop `profiles: []`. The idempotence assertion fails.

- [ ] **Step 8: Full suite and commit.** `npm test 2>&1 | tail -4` → all pass. Then:

```bash
git add src && git commit -m "profiles: the stored ProfileCut and its conversions (profile runs a1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Loading schema 18 (validation, the move, the refusals)

**Files:**
- Modify: `src/document/document.ts` (`CURRENT_VERSION`, the v18 note, `validateCurveCuts`' `seen`, new `validateProfiles`, `validateSharedFields`)
- Test: create `src/document/profilesLoad.test.ts`

**Interfaces:**
- Consumes: `profileOf`, `PROFILE_KINDS`, `endToEnd`, `profileAsCurve` (Task 1).
- Produces: `CURRENT_VERSION = 18`. Loaded parts and shapes carry validated `profiles`, with no recognised profile left in `curves`.

- [ ] **Step 1: Write the failing tests.** Create `src/document/profilesLoad.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CURRENT_VERSION, DocumentError, createBoard, createDocument, migrateDocument, partGeometry, bodyVolume, profileCurve, profileFromFields, archCurve } from './document';
import type { Board, ProfileCut } from './types';

const v17 = (boards: object[], shapes: object[] = []) => JSON.parse(JSON.stringify({ ...createDocument('T'), version: 17, boards, shapes }));
const ro = { through: 'length', uFrom: 'max', vFrom: 'max', kind: 'roundover', size: 0.25, fillet: 0, facing: 'v' } as const;
const part = (over: object) => ({ ...createBoard({ id: 'b1', name: 'Top', length: 36, width: 20, thickness: 0.75 }), ...over });
const load = (raw: object) => migrateDocument(raw);
const board0 = (doc: ReturnType<typeof migrateDocument>) => doc.boards[0] as Board;
const p1 = (over: Partial<ProfileCut> = {}): ProfileCut => ({ id: 'p1', ...profileFromFields(ro), ...over });

describe('loading schema 18 (profile runs spec §3.2, chunk a1)', () => {
  it('this build writes 18', () => expect(CURRENT_VERSION).toBe(18));
  it('a v17 profile curve moves into profiles, keeping its id; other curves stay', () => {
    const arch = { id: 'c2', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1.25 }) };
    const b = board0(load(v17([part({ curves: [{ id: 'c1', ...profileCurve(ro) }, arch] })])));
    expect(b.curves).toEqual([arch]);
    expect(b.profiles).toEqual([p1({ id: 'c1' })]);
  });
  it('the move runs on every load (spec P8): a v18 file with a profile curve in curves is moved too', () => {
    const raw = { ...v17([part({ curves: [{ id: 'c1', ...profileCurve(ro) }] })]), version: 18 };
    expect(board0(load(raw)).profiles.map((p) => p.id)).toEqual(['c1']);
  });
  it('a stored v18 profile is kept; moved ones follow it', () => {
    const raw = { ...v17([part({ curves: [{ id: 'c1', ...profileCurve({ ...ro, uFrom: 'min' }) }], profiles: [p1()] })]), version: 18 };
    expect(board0(load(raw)).profiles.map((p) => p.id)).toEqual(['p1', 'c1']);
  });
  it('profile ids share the part\'s curve id scope (spec P7): a profile repeating a curve id is re-minted', () => {
    const arch = { id: 'x', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1.25 }) };
    const raw = { ...v17([part({ curves: [arch], profiles: [p1({ id: 'x' })] })]), version: 18 };
    const b = board0(load(raw));
    expect(b.curves[0]!.id).toBe('x');
    expect(b.profiles[0]!.id).not.toBe('x');
  });
  it('the migrated part holds the same wood (spec §3.2 pin)', () => {
    const before = createBoard({ length: 36, width: 20, thickness: 0.75, curves: [{ id: 'c1', ...profileCurve(ro) }] });
    const after = board0(load(v17([part({ curves: [{ id: 'c1', ...profileCurve(ro) }] })])));
    const vol = (b: Board) => partGeometry(b).bodies.reduce((s, x) => s + bodyVolume(x), 0);
    expect(vol(after)).toBeCloseTo(vol(before), 8);
  });
  it('a hand-made symmetric facing-u curve migrates to facing face, the same wood (spec P5)', () => {
    const u = { id: 'c1', ...profileCurve({ ...ro, facing: 'u' }) };
    const b = board0(load(v17([part({ curves: [u] })])));
    expect(b.profiles[0]!.facing).toBe('face');
    const vol = (x: Board) => partGeometry(x).bodies.reduce((s, y) => s + bodyVolume(y), 0);
    expect(vol(b)).toBeCloseTo(vol(createBoard({ length: 36, width: 20, thickness: 0.75, curves: [u] })), 8);
  });
  it('a shape\'s profile curves move too', () => {
    const shape = { id: 's1', length: 36, width: 20, thickness: 0.75, material: 'pine', grain: 'length', posture: 'flat', cuts: [], angleCuts: [], holes: [], curves: [{ id: 'c1', ...profileCurve(ro) }] };
    const doc = load(v17([{ id: 'b1', name: 'Top', position: [0, 0, 0], rotation: 0, shape: 's1' }, { id: 'b2', name: 'Top 2', position: [0, 0, 5], rotation: 0, shape: 's1' }], [shape]));
    expect(doc.shapes[0]!.profiles.map((p) => p.id)).toEqual(['c1']);
    expect(doc.shapes[0]!.curves).toEqual([]);
  });
  it('malformed entries are dropped; a faulted well-formed one is kept', () => {
    const bad = [
      { ...p1(), id: 'a', size: -1 }, { ...p1(), id: 'b', size: Number.NaN }, { ...p1(), id: 'c', face: 'up' },
      { ...p1(), id: 'd', facing: 'sideways' }, { ...p1(), id: 'e', fillet: -0.1 },
      { ...p1(), id: 'f', kind: 'thumbnail', depth: 0.5, size: 0.25 }, { ...p1(), id: 'g', kind: 'bead', fillet: 0 },
      { ...p1(), id: 'h', run: { start: { side: { across: 'thickness', from: 'max' }, through: 'min' }, end: { side: { across: 'width', from: 'max' }, through: 'max' } } },
      { ...p1(), id: 'i', run: 'all' },
    ];
    const faulted = { ...p1(), id: 'k', size: 15 };          // a 15" roundover on a 20 x 3/4 top runs off: kept
    const raw = { ...v17([part({ profiles: [...bad, faulted] })]), version: 18 };
    expect(board0(load(raw)).profiles.map((p) => p.id)).toEqual(['k']);
  });
  it('an End to end run stored max to min is normalised to min to max', () => {
    const r = p1().run as { start: object; end: object };
    const raw = { ...v17([part({ profiles: [{ ...p1(), run: { start: r.end, end: r.start } }] })]), version: 18 };
    expect(board0(load(raw)).profiles[0]).toEqual(p1());
  });
  it('a symmetric kind stored facing edge is normalised to face', () => {
    const raw = { ...v17([part({ profiles: [{ ...p1(), facing: 'edge' }] })]), version: 18 };
    expect(board0(load(raw)).profiles[0]!.facing).toBe('face');
  });
  // Spec P2: a later build's run must never be drawn full length here.
  const side = { across: 'width', from: 'max' } as const;
  for (const [why, run] of [
    ['all round', { loop: true }],
    ['stopped', { start: { side, from: 'min', at: 3 }, end: { side, through: 'max' } }],
    ['ends on two sides', { start: { side, through: 'min' }, end: { side: { across: 'length', from: 'max' }, through: 'max' } }],
  ] as const) {
    it(`a run this build cannot build refuses the document: ${why}`, () => {
      const raw = { ...v17([part({ profiles: [{ ...p1(), run }] })]), version: 18 };
      expect(() => load(raw)).toThrow(DocumentError);
      expect(() => load(raw)).toThrow(`This project has an edge profile this version of Sloyd can't build (${why}) — it was saved by a newer version of Sloyd.`);
    });
  }
  it('an unknown profile kind string refuses the document', () => {
    const raw = { ...v17([part({ profiles: [{ ...p1(), kind: 'chamfer' }] })]), version: 18 };
    expect(() => load(raw)).toThrow('This project has an edge profile this version of Sloyd can\'t build (kind "chamfer") — it was saved by a newer version of Sloyd.');
  });
  it('a v19 file is refused by the version gate', () => {
    expect(() => load({ ...v17([part({})]), version: 19 })).toThrow(/newer version/);
  });
});
```

- [ ] **Step 2: Run.** `npx vitest run src/document/profilesLoad.test.ts`. Expected: FAIL (version 17; no `profiles` on load).

- [ ] **Step 3: Implement.** In `src/document/document.ts`:
  - `CURRENT_VERSION = 18`. Below the v17 note in the doc block above it, add:

```ts
 * v18 (profile runs spec §3.2): `Board.profiles` (and `Shape.profiles`), document-level, no step — an absent field defaults
 * to [], and every curve `profileOf` recognises is MOVED into it on every load (spec P8; idempotent). Harm a v17 build would
 * do: silent loss — it drops every profile and autosaves. From v18 on, a profile whose run or kind this build cannot build
 * refuses the document (spec P2), so a later run needs no bump.
```

  - `validateCurveCuts(raw: unknown, seen: Set<string> = new Set())`: use the passed `seen` (delete its local
    `const seen = new Set<string>();`).
  - Add after `validateCurveCuts` (import `PROFILE_KINDS, profileOf, endToEnd, profileAsymmetric` from `./profiles`, and the
    `ProfileCut, ProfileEnd, ProfileKind, ProfileSide` types):

```ts
/** A profile this build cannot build (spec P2): the whole document is refused, as a newer version is. */
function refuseProfile(why: string): never {
  throw new DocumentError(`This project has an edge profile this version of Sloyd can't build (${why}) — it was saved by a newer version of Sloyd.`);
}

/**
 * Edge profiles (profile runs spec §3.2), in order, ids from the part's curve `seen` set (spec P7). Dropped, never clamped:
 * a non-finite or non-positive size; a thumbnail depth outside (0, size); a negative or non-finite fillet; a bead whose
 * quirk is not > 0; an unknown face or facing; an end whose side is not length/width × min/max, or which is neither a
 * `through` end nor a finite `at` with a `from`; a run that is not an object. A symmetric kind's facing is normalised to
 * 'face'; an End to end run stored max→min to min→max. REFUSED (the document): an unknown kind string; a loop, a station
 * end, or ends on two sides (chunk a1 builds only End to end). A faulted but well-formed profile is KEPT.
 */
function validateProfiles(raw: unknown, seen: Set<string>): ProfileCut[] {
  if (!Array.isArray(raw)) return [];
  const out: ProfileCut[] = [];
  const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const sideOf = (v: unknown): ProfileSide | null => {
    const s = v as Record<string, unknown> | null;
    return s && (s.across === 'length' || s.across === 'width') && VALID_FROMS.includes(s.from as CutFrom)
      ? { across: s.across, from: s.from as CutFrom } : null;
  };
  const endOf = (v: unknown): ProfileEnd | null => {
    const e = v as Record<string, unknown> | null;
    const side = sideOf(e?.side);
    if (!e || !side) return null;
    if (VALID_FROMS.includes(e.through as CutFrom)) return { side, through: e.through as CutFrom };
    if (VALID_FROMS.includes(e.from as CutFrom) && finite(e.at)) return { side, from: e.from as CutFrom, at: e.at };
    return null;
  };
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const p = item as Record<string, unknown>;
    // Refusals are decided before anything else: a newer build's profile must never be dropped quietly.
    if (typeof p.kind === 'string' && !PROFILE_KINDS.includes(p.kind as ProfileKind)) refuseProfile(`kind "${p.kind}"`);
    const r = p.run as Record<string, unknown> | null;
    if (typeof r === 'object' && r !== null) {
      if (r.loop === true) refuseProfile('all round');
      const s = endOf(r.start);
      const e = endOf(r.end);
      if (s && e && (!('through' in s) || !('through' in e))) refuseProfile('stopped');
      if (s && e && (s.side.across !== e.side.across || s.side.from !== e.side.from)) refuseProfile('ends on two sides');
    }
    if (!PROFILE_KINDS.includes(p.kind as ProfileKind)) continue;
    const kind = p.kind as ProfileKind;
    if (!VALID_FROMS.includes(p.face as CutFrom) || (p.facing !== 'face' && p.facing !== 'edge')) continue;
    if (!finite(p.size) || p.size <= 0) continue;
    if (kind === 'thumbnail' ? !(finite(p.depth) && p.depth > 0 && p.depth < p.size) : p.depth !== undefined) continue;
    if (kind === 'thumbnail' ? p.fillet !== undefined : !(finite(p.fillet) && p.fillet >= 0)) continue;
    if (kind === 'bead' && !((p.fillet as number) > 0)) continue;
    if (typeof r !== 'object' || r === null) continue;
    const s = endOf(r.start) as { side: ProfileSide; through: CutFrom } | null;
    const e = endOf(r.end) as { side: ProfileSide; through: CutFrom } | null;
    if (!s || !e || s.through === e.through) continue;                      // one end out through each end face
    const side = s.side;
    const fields = { kind, size: p.size, ...(kind === 'thumbnail' ? { depth: p.depth as number } : { fillet: p.fillet as number }) };
    const sym = !profileAsymmetric({ through: 'length', uFrom: 'min', vFrom: 'min', facing: 'v', ...fields });
    out.push({
      id: takeId(p.id, seen), face: p.face as CutFrom, ...fields, facing: sym ? 'face' : (p.facing as 'face' | 'edge'),
      run: { start: { side, through: 'min' }, end: { side: { ...side }, through: 'max' } },
    });
  }
  return out;
}
```

  - In `validateSharedFields`, replace `curves: validateCurveCuts(b.curves)` with a shared id scope and the move (spec P8):

```ts
  // Profile runs spec §3.2/P7/P8: curves and profiles share one id scope; every curve profileOf recognises moves into
  // `profiles` (keeping its id), after the stored profiles.
  const ids = new Set<string>();
  const allCurves = validateCurveCuts(b.curves, ids);
  const storedProfiles = validateProfiles(b.profiles, ids);
  const curves = allCurves.filter((c) => !profileOf(c));
  const moved = allCurves.flatMap((c) => { const p = profileOf(c); return p ? [{ id: c.id, ...p }] : []; });
  return { fields: { ...fields, cuts: validateCuts(b.cuts, fields), angleCuts: validateAngleCuts(b.angleCuts, fields), holes: validateHoleRows(b.holes), curves, profiles: [...storedProfiles, ...moved] } };
```

  The stored profiles are validated after the curves, so a stored profile repeating a curve's id is re-minted, and the moved
  ones keep theirs (P7: curves first).

- [ ] **Step 4: Run.** `npx vitest run src/document/profilesLoad.test.ts src/document/document.test.ts` → PASS. Fix any existing
  `document.test.ts` assertion that pinned `CURRENT_VERSION` 17, or a loaded part's keys, so it pins 18 and `profiles`.

- [ ] **Step 5: Mutate.** Each must turn a test red; restore after each.
  1. Validate the stored profiles BEFORE the curves. The id-scope test fails.
  2. Drop the `refuseProfile('stopped')` line. The stopped test fails.
  3. Skip the move (`curves = allCurves`, `moved = []`). The move tests fail.
  4. Do not normalise symmetric facing. The normalisation test fails.

- [ ] **Step 6: Full suite, build, commit.** `npm test 2>&1 | tail -4` and `npm run build 2>&1 | tail -3`. Tests that loaded a
  chunk-1 fixture through `migrateDocument` and then read `boards[0].curves` now find the profile in `profiles`. Update each such
  assertion to read `profiles`, and never weaken it. Name every test you changed in the report.

```bash
git add src && git commit -m "document: schema 18 — profiles loaded, profile curves moved in, unbuildable runs refused (profile runs a1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Every reader through the geometry view (the byte-for-byte corpus)

**Files:**
- Modify: geometry, word and fault entry points. At the top of each, rebind `board = geometryBoard(board)`, or bind a `const g`
  and use it throughout:
  - `src/document/bodies.ts`: `boardBodies`, `curvedEdges`, `boardEdges`, `geometryKey`, `partGeometry` (the private `edgesOf`
    is reached only through these).
  - `src/document/curveDrawing.ts`: `curveDrawEdges`, `curveSilhouettes`, `silhouetteLines`, `curveEdgeLifts`.
  - `src/document/curves.ts`: none. `smoothLines` is called with a view by `curvedEdges`; leave it on its argument. `curves.ts`
    must not import `profiles.ts`, which imports it.
  - `src/document/curveText.ts`: `curveLineEntries`, and `curveLines` if it reads `board.curves` itself.
  - `src/document/snapPoints.ts`: `boardSnapPoints`.
  - `src/document/cuts.ts`: `stockProbe`.
  - `src/document/diagram.ts`: `buildDiagrams`.
  - `src/document/drawing.ts`: `partSegments`.
  - `src/document/featureKeys.ts`: `partFeatures`.
  - `src/document/holeFaults.ts`: `stockChecks`, `holeInStock`, `holeFaults`, `intoCurve`.
  - `src/document/cutlist.ts`: `curveSignature`.
  - `src/viewport/grainTiling.ts`: `drawsAsBox`, `bodyMesh`, `boardUVSignature`, and the private `curveChords` (it is reached from
    `bodyMesh` with a view; leave it).
  - `src/viewport/BoardMesh.tsx:286`: `capFill(c.pieces, capN, geometryBoard(board).curves.length > 0)`.
  - Search `grep -rn "\.curves\b" src --include=*.ts --include=*.tsx | grep -v test` for any other reader that produces geometry,
    words or faults, and route it the same way.
- Modify: `src/document/curvedRefusal.ts:5` → `b.curves.length > 0 || b.profiles.length > 0`.
- Modify: `src/document/roleLinks.ts:20` → add `|| b.profiles.length > 0`.
- Test: create `src/document/profilesView.test.ts`.

**Interfaces:**
- Consumes: `geometryBoard`, `profileFromFields`, `profileCurve` (Task 1); the loader (Task 2).
- Produces: nothing new. Every listed reader gives chunk 1's output for a migrated part.

- [ ] **Step 1: Write the failing corpus test.** Create `src/document/profilesView.test.ts`. The ORIGINAL holds the profiles as
  v17 stored them, in `curves` with `profiles: []`, so the view is a no-op and it reads exactly as chunk 1 does. The MIGRATED part
  is the same file through `migrateDocument`. Every reader must agree, deeply.

```ts
import { describe, expect, it } from 'vitest';
import {
  createBoard, createDocument, migrateDocument, partGeometry, boardEdges, bodyVolume, profileCurve, archCurve, PROFILE_EDGES, PROFILE_KINDS,
} from './document';
import { curveDrawEdges, curveEdgeLifts, silhouetteLines } from './curveDrawing';
import { curveLineEntries } from './curveText';
import { boardSnapPoints } from './snapPoints';
import { stockProbe } from './cuts';
import { buildDiagrams } from './diagram';
import { drawView, FRONT, SIDE, TOP, ISO } from './drawing';
import { partFeatures } from './featureKeys';
import { holeFaults } from './holeFaults';
import { buildCutList } from './cutlist';
import { bodyMesh, boardUVSignature, drawsAsBox } from '../viewport/grainTiling';
import { boardHoles } from './holes';
import type { Board, CurveCut, HoleRow } from './types';
import type { ProfileFields } from './profiles';

const UNITS = { display: 'imperial-fractional', precision: 16 } as const;
const fields = (f: Partial<ProfileFields> & Pick<ProfileFields, 'kind' | 'size'>): ProfileFields =>
  ({ through: 'length', uFrom: 'max', vFrom: 'max', facing: 'v', ...f });
/** The fixtures: every kind on every edge (both facings when asymmetric), the four-edge sets, a mixed shelf, a holed top. */
function fixtures(): { name: string; board: Board }[] {
  const out: { name: string; board: Board }[] = [];
  const top = (curves: CurveCut[], holes: HoleRow[] = []) => createBoard({ id: 'b1', name: 'Top', length: 36, width: 20, thickness: 0.75, curves, holes });
  for (const e of PROFILE_EDGES) for (const kind of PROFILE_KINDS) for (const facing of ['v', 'u'] as const) {
    const s = kind === 'thumbnail' ? { size: 0.75, depth: 0.25 } : kind === 'bead' ? { size: 0.25, fillet: 0.0625 } : { size: 0.375, fillet: facing === 'u' ? 0.0625 : 0 };
    if (facing === 'u' && kind !== 'ogee' && kind !== 'bead' && kind !== 'thumbnail' && !(s.fillet! > 0)) continue;
    out.push({ name: `${kind} ${JSON.stringify(e)} ${facing}`, board: top([{ id: 'p', ...profileCurve(fields({ ...e, kind, facing, ...s })) }]) });
  }
  for (const kind of PROFILE_KINDS) {
    const s = kind === 'thumbnail' ? { size: 0.75, depth: 0.25 } : kind === 'bead' ? { size: 0.25, fillet: 0.0625 } : { size: 0.375, fillet: 0 };
    out.push({ name: `four-edge ${kind}`, board: top((['length', 'width'] as const).flatMap((through) => (['min', 'max'] as const).map((uFrom) =>
      ({ id: `${through}${uFrom}`, ...profileCurve(fields({ through, uFrom, kind, ...s })) })))) });
  }
  const bore: HoleRow = { id: 'h1', face: 'thickness', from: 'max', diameter: 0.0625, depth: 0.0625, along: 'length', alongFrom: 'min', station: 18, count: 1, pitch: 0, acrossFrom: 'max', inset: 0.1 };
  out.push({ name: 'holed roundover (a hole into the profile)', board: top([{ id: 'p', ...profileCurve(fields({ kind: 'roundover', size: 0.25, fillet: 0 })) }], [bore]) });
  return out;
}
const migrate = (b: Board): Board => {
  const raw = JSON.parse(JSON.stringify({ ...createDocument('T'), version: 17, boards: [b] }));
  return migrateDocument(raw).boards[0] as Board;
};

describe('every reader sees a migrated profile exactly as chunk 1 did (profile runs a1, Global Constraints)', () => {
  for (const { name, board } of fixtures()) {
    it(name, () => {
      const m = migrate(board);
      expect(m.curves).toEqual([]);
      expect(m.profiles.length).toBe(board.curves.length);
      const g0 = partGeometry(board), g1 = partGeometry(m);
      expect(g1.bodies).toEqual(g0.bodies);
      expect(g1.edges).toEqual(g0.edges);
      expect(boardEdges(m)).toEqual(boardEdges(board));
      expect(curveDrawEdges(m)).toEqual(curveDrawEdges(board));
      for (const v of [FRONT, SIDE, TOP, ISO]) {
        expect(silhouetteLines(m, v.toward)).toEqual(silhouetteLines(board, v.toward));
        expect(curveEdgeLifts(m, v.toward)).toEqual(curveEdgeLifts(board, v.toward));
        expect(drawView([m], v)).toEqual(drawView([board], v));
      }
      expect(boardSnapPoints(m)).toEqual(boardSnapPoints(board));
      const probe0 = stockProbe(board), probe1 = stockProbe(m);
      for (let i = 0; i < 400; i += 1) {
        const p = { length: (i * 7.31) % 36, width: (i * 3.77) % 20, thickness: (i * 0.0193) % 0.75 };
        expect(probe1(p)).toBe(probe0(p));
      }
      expect(buildDiagrams(m, UNITS)).toEqual(buildDiagrams(board, UNITS));
      expect(curveLineEntries(m, UNITS)).toEqual(curveLineEntries(board, UNITS));
      expect(partFeatures(m, UNITS)).toEqual(partFeatures(board, UNITS));
      for (const r of board.holes) expect(holeFaults(m, r)).toEqual(holeFaults(board, r));
      expect(boardUVSignature(m)).toEqual(boardUVSignature(board));
      const holes0 = boardHoles(board), holes1 = boardHoles(m);
      g0.bodies.forEach((body, i) => {
        expect(drawsAsBox(m, g1.bodies[i]!, holes1)).toBe(drawsAsBox(board, body, holes0));
        expect(bodyMesh(m, g1.bodies[i]!, holes1, g1.bodies)).toEqual(bodyMesh(board, body, holes0, g0.bodies));
      });
      const doc = (b: Board) => ({ ...createDocument('T'), boards: [b] });
      expect(buildCutList(doc(m))).toEqual(buildCutList(doc(board)));
    });
  }
  it('a part with an arch and a profile holds the same wood (spec P4: order may differ)', () => {
    const arch = { id: 'c1', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1.25 }) };
    const b = createBoard({ id: 'b1', name: 'Apron', length: 30, width: 5, thickness: 0.75, curves: [{ id: 'p', ...profileCurve(fields({ kind: 'roundover', size: 0.25, fillet: 0 })) }, arch] });
    const vol = (x: Board) => partGeometry(x).bodies.reduce((s, y) => s + bodyVolume(y), 0);
    expect(vol(migrate(b))).toBeCloseTo(vol(b), 8);
  });
});
```

  Check every import name against the file it comes from before running: `boardHoles` (holes.ts), `bodyVolume` (bodies.ts,
  re-exported from document.ts or not), the `UNITS` shape (`Units` in `units/length.ts`), the view constants. Fix the IMPORT, not
  the assertion. If a reader's signature differs from the call here, call it the way the codebase does (grep an existing test).

- [ ] **Step 2: Run.** `npx vitest run src/document/profilesView.test.ts`. Expected: FAIL. The migrated part has no curves, so
  `partGeometry(m).bodies` is the plain box. Record which readers fail first.

- [ ] **Step 3: Route every reader through the view.** At the top of each function in the Files list, add
  `board = geometryBoard(board);`. Where the parameter is `b`, use `b = geometryBoard(b);`. Where the parameter is `const` or
  destructured, bind `const g = geometryBoard(board)` and use `g`. Import `geometryBoard` from `./profiles`, or from
  `../document/profiles` in the viewport. In `partGeometry`, compute the key and the cached value from the view.

  The view is memoised per part object. Do NOT build `{ ...board, curves: … }` anywhere else.

- [ ] **Step 4: Run.** `npx vitest run src/document/profilesView.test.ts` → PASS. Then the drawing, curve and viewport suites:
  `npx vitest run src/document src/viewport 2>&1 | tail -4` → PASS.

- [ ] **Step 5: Mutate.** Each must turn the corpus red; restore after each.
  1. Remove the view from `boardSnapPoints`. The snap assertion fails.
  2. Remove it from `buildDiagrams`. The diagrams assertion fails.
  3. Remove it from `intoCurve`. The holed fixture's fault assertion fails.
  4. Remove it from `boardUVSignature`. The signature assertion fails.

  Name in the report any mutation that does NOT fail, and add the assertion that catches it.

- [ ] **Step 6: Perf guards.** `npx vitest run src/viewport/curvesPerf.test.ts src/viewport/holesPerf.test.ts` → PASS. The view
  adds one WeakMap lookup per call.

- [ ] **Step 7: Full suite, build, commit.** `npm test 2>&1 | tail -4`; `npm run build 2>&1 | tail -3`. Then:

```bash
git add src && git commit -m "profiles: every geometry, word and fault reader through geometryBoard (profile runs a1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Write-back, copies, mirroring and the store

**Files:**
- Modify: `src/document/frames.ts:77` (`mirrorPart`: `profiles: b.profiles.map((p) => mirrorProfile(p, d))`)
- Modify: `src/document/treeEdit.ts`:
  - `lowerProfiles` beside `lowerCurves` (`:116-129`), used where `lowerCurves` is (`:156`);
  - the `changedKeys` branch and `valueOf` (`:316-320`);
  - `groupSignature` (`:473`): `k === 'profiles' ? sorted(b.profiles.map(profileValues))`;
  - `copyDefinition` (`:514`): `profiles: b.profiles.map(copyProfile)`.
- Modify: `src/document/treeOps.ts:204,330` (the two board copies: `profiles: placed.profiles.map(copyProfile)` /
  `b.profiles.map(copyProfile)`)
- Modify: `src/store/store.ts`:
  - `copyBoard` (`:871`): `profiles: source.profiles.map((p) => ({ ...copyProfile(p), id: nextId() })),`;
  - new actions `addProfiles` / `updateProfile` / `removeProfile`, declared beside the curve actions (`:381-383`) and
    implemented after `removeCurve` (`:1733`).
- Test: append to `src/document/treeEdit.mirror.test.ts` and `src/store/store.test.ts`.

**Interfaces:**
- Consumes: `mirrorProfile`, `copyProfile`, `sameProfile`, `profileValues` (Task 1).
- Produces (store):
  ```ts
  addProfiles: (boardId: string, profiles: Omit<ProfileCut, 'id'>[]) => void;
  updateProfile: (boardId: string, profileId: string, next: Omit<ProfileCut, 'id'>) => void;
  removeProfile: (boardId: string, profileId: string) => void;
  ```

- [ ] **Step 1: Write the failing tests.**
  - Append the block below to `src/document/treeEdit.mirror.test.ts`. It reuses that file's `doc`, `occ` and `stored` helpers
    and `chiralPart`.
  - Add these imports:
    - `profileAsCurve, profileFromFields, sameProfile` from `./profiles`;
    - `curvedRefusal` from `./curvedRefusal`;
    - `flatDocument` from `./tree`;
    - `sameShared` from `./links`;
    - `ProfileCut` to the type import.
  - Every expectation is computed by an independent path: chunk 1's curve mirror (already pinned), or a stored object's identity.

```ts
describe('profiles through a mirror (profile runs a1, Review Focus 2)', () => {
  const q = (over: Partial<ProfileCut> = {}): ProfileCut => ({ id: 'q1',
    ...profileFromFields({ through: 'length', uFrom: 'max', vFrom: 'max', kind: 'ogee', size: 0.5, fillet: 0, facing: 'u' }), ...over });
  const withProfile = (b: Board): Board => ({ ...b, profiles: [q()] });
  it('the world profile is the mirror of the stored one: the same curve chunk 1's mirror gives', () => {
    const asCurve = { ...chiralPart('upright'), curves: [profileAsCurve(q())] };
    const asProfile = withProfile(chiralPart('upright'));
    const a = occ(doc(asCurve, { mirrored: true, rotation: 90 }));
    const b = occ(doc(asProfile, { mirrored: true, rotation: 90 }));
    expect(profileAsCurve(b.profiles[0]!)).toEqual(a.curves[0]);
  });
  it('an edit elsewhere and a resize keep the stored profiles (the same array)', () => {
    const d0 = doc(withProfile(chiralPart('flat')), { mirrored: true });
    const before = occ(d0);
    expect(stored(applyWorldEdits(d0, [{ before, after: { ...before, name: 'Renamed' } }])).profiles).toBe(stored(d0).profiles);
    expect(stored(applyWorldEdits(d0, [{ before, after: { ...before, length: before.length + 1 } }])).profiles).toBe(stored(d0).profiles);
  });
  it('an edit to a world profile writes back its mirror; placing again shows the edit; repeats do not drift', () => {
    const d0 = doc(withProfile(chiralPart('upright')), { mirrored: true, rotation: 90 });
    const before = occ(d0);
    const edited = before.profiles.map((p) => ({ ...p, size: 0.375 }));
    const d1 = applyWorldEdits(d0, [{ before, after: { ...before, profiles: edited } }]);
    expect(sameProfile(occ(d1).profiles[0]!, edited[0]!)).toBe(true);
    expect(stored(d1).profiles[0]!.size).toBe(0.375);
    const d2 = applyWorldEdits(d1, [{ before: occ(d1), after: { ...occ(d1), profiles: occ(d1).profiles.map((p) => ({ ...p })) } }]);
    stored(d1).profiles.forEach((p, i) => expect(stored(d2).profiles[i]).toBe(p));
  });
  it('Link compares profiles by id and value, in order', () => {
    const a = withProfile(chiralPart('flat'));
    expect(sameShared(a, { ...a, profiles: [q()] })).toBe(true);
    expect(sameShared(a, { ...a, profiles: [q({ id: 'other' })] })).toBe(false);
    expect(sameShared(a, { ...a, profiles: [q({ size: 0.375 })] })).toBe(false);
  });
  it('joinery and Refine refuse a part with profiles and no curves', () => {
    const d = doc(withProfile(chiralPart('flat')), {});
    expect(curvedRefusal(flatDocument(d), 'joinery')).toMatch(/Add joinery doesn't handle parts with curves yet/);
  });
});
```

  Append to `src/store/store.test.ts` after `describe('curve actions (spec §8)'`. Import `profileFromFields` from
  `../document/profiles`, and `ProfileCut` and `Shape` as types:

```ts
describe('profile actions (profile runs a1)', () => {
  const ro = profileFromFields({ through: 'length', uFrom: 'max', vFrom: 'max', kind: 'roundover', size: 0.25, fillet: 0, facing: 'v' });
  const setup = (doc = { ...createDocument('T'), boards: [createBoard({ id: 'top', name: 'Top', length: 36, width: 20, thickness: 0.75 })] }) => {
    useStore.setState({ doc, selectedIds: [], past: [], future: [], tool: 'select', grabbed: null, tapeAnchor: null, tapeHover: null, explode: 0 });
  };
  const s = () => useStore.getState();
  const profiles = (i = 0) => (s().doc.boards[i] as Board).profiles;
  it('adds with a fresh id, updates and removes, one undo entry each', () => {
    setup();
    s().addProfiles('top', [ro]);
    const id = profiles()[0]!.id;
    expect(profiles()[0]).toEqual({ ...ro, id });
    s().updateProfile('top', id, { ...ro, size: 0.375 });
    expect(profiles()[0]!.size).toBe(0.375);
    s().removeProfile('top', id);
    expect(profiles()).toEqual([]);
    expect(s().past.length).toBe(3);
  });
  it('an unchanged update pushes no undo entry (inv 4)', () => {
    setup();
    s().addProfiles('top', [ro]);
    const before = s().past.length;
    s().updateProfile('top', profiles()[0]!.id, ro);
    expect(s().past.length).toBe(before);
  });
  it('is refused while exploded (inv 47)', () => {
    setup();
    s().setExplode(0.5);
    s().addProfiles('top', [ro]);
    expect(profiles()).toEqual([]);
  });
  it('a duplicate gets fresh profile ids and shares no run object', () => {
    setup();
    s().addProfiles('top', [ro]);
    s().selectBoard('top');
    s().duplicateBoards(['top']);
    const [a, b] = [profiles(0)[0]!, profiles(1)[0]!];
    expect(b.id).not.toBe(a.id);
    expect(b.run).not.toBe(a.run);
    expect({ ...b, id: a.id }).toEqual(a);
  });
  it('an edit through one user of a shape reaches every user (shared, inv 45)', () => {
    const shape: Shape = { id: 's1', length: 36, width: 20, thickness: 0.75, material: 'pine', grain: 'length', posture: 'flat', cuts: [], angleCuts: [], holes: [], curves: [], profiles: [{ ...ro, id: 'p1' }] };
    setup({ ...createDocument('T'), shapes: [shape], boards: [
      { id: 'a', name: 'A', position: [0, 0, 0], rotation: 0, shape: 's1' }, { id: 'b', name: 'B', position: [0, 0, 30], rotation: 0, shape: 's1' }] });
    s().updateProfile('a', 'p1', { ...ro, size: 0.375 });
    expect(s().doc.shapes[0]!.profiles[0]!.size).toBe(0.375);
    expect(worldParts(s().doc).find((p) => p.id === 'b')!.profiles[0]!.size).toBe(0.375);
  });
});
```

  Check `duplicateBoards`' real name and signature in `store.ts`, and whether a test needs `selectBoard` first. Fix the CALL,
  never the expectation.

- [ ] **Step 2: Run.** `npx vitest run src/document/treeEdit.mirror.test.ts src/store/store.test.ts`. Expected: FAIL. Profiles are
  dropped by the mirror composition and the lowering; the store actions do not exist.

- [ ] **Step 3: Implement.** `lowerProfiles` mirrors `lowerCurves` exactly:

```ts
/**
 * A part's profiles lowered back through ONE mirror (profile runs spec §3.1): a flag flip (mirrorProfile is its own inverse);
 * a profile equal to the stored one with the same id maps back to THAT object; all reused: the stored array.
 */
function lowerProfiles(storedBefore: Board, draft: Board): ProfileCut[] {
  const d0 = mirrorDim(draft);
  const byId = new Map(storedBefore.profiles.map((p) => [p.id, p]));
  const out = draft.profiles.map((p) => {
    const back = mirrorProfile(p, d0);
    const s = byId.get(p.id);
    return s && sameProfile(s, back) ? s : back;
  });
  return out.length === storedBefore.profiles.length && out.every((p, i) => p === storedBefore.profiles[i]) ? storedBefore.profiles : out;
}
```

  Add `profiles: lowerProfiles(lowerBefore, draft),` beside `curves: lowerCurves(lowerBefore, draft),`. In `changedKeys`, add a
  `profiles` branch exactly like `curves`'. Add `: k === 'profiles' ? cur.profiles` to `valueOf`.

  The store actions mirror `addCurves` / `updateCurve` / `removeCurve`:
  - `copyProfile` for `copyCurve`;
  - `sameProfile` for `sameCurve`;
  - `profiles` for `curves`;
  - the same `readOnly()` gate, `mapWorld` edit and `judgeHeld()` after.

- [ ] **Step 4: Run.** The Step 2 command → PASS.

- [ ] **Step 5: Mutate.** Each must turn a test red; restore after each.
  1. `lowerProfiles` returns `draft.profiles`, so no mirror is applied. The write-back test fails.
  2. `mirrorPart` leaves `profiles` unmirrored. The world-profile test fails.
  3. `copyBoard` keeps the source's profile ids. The duplicate test fails.
  4. `updateProfile` drops its no-op guard. The no-op test fails.
  5. `sameShared` skips `profiles`. The Link test fails.

- [ ] **Step 6: Full suite, build, commit.**

```bash
git add src && git commit -m "profiles: write-back through mirrors, copies, groups and store actions (profile runs a1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The Profiles section on `profiles` (no visible change)

**Files:**
- Modify: `src/panels/curveRefusal.ts:51-67` (`refusalFor` takes an optional `after` board)
- Modify: `src/panels/Profiles.tsx` (rows from `board.profiles`; writes through the profile actions)
- Modify: `src/panels/Curves.tsx:195` (`const shown = board.curves;`, since load leaves no profile curve there; drop the
  now-unused `profileFields` import if nothing else uses it)
- Test: `src/panels/Profiles.test.tsx` (port the fixtures to `profiles`)

**Interfaces:**
- Consumes: `addProfiles`, `updateProfile`, `removeProfile` (Task 4); `profileToFields`, `profileFromFields`, `profileAsCurve`,
  `geometryBoard` (Task 1).
- Produces: `refusalFor(board, curve, next, control, after?: Board)`. When `after` is given it is the post-edit part used for the
  hole check; the curve-fault checks are unchanged.

- [ ] **Step 1: Port the tests first.** In `src/panels/Profiles.test.tsx`, every fixture that put a profile curve into `curves`
  must put it into `profiles` instead: `profiles: [{ id, ...profileFromFields(fields) }]`. Every read of
  `(board as Board).curves` for a profile becomes `.profiles`, compared through `profileToFields` or `profileAsCurve`.
  - Example: `profileFields(curves()[0]!)` becomes `profileToFields(profiles()[0]!)`, with
    `const profiles = () => (useStore.getState().doc.boards[0] as Board).profiles;`.
  - The byte-equality tests against `cornerCurve` become `expect(profileAsCurve(profiles()[0]!)).toEqual({ id, ...cornerCurve(…) })`.
  - Add one test: `the stored through-length corner of a v17 file appears as a Roundover row after load`. Load the v17 JSON with
    `migrateDocument` and `replaceDocument`, then assert the row's `Remove profile (…)` button.

  Every assertion on text, a role or a refusal message stays byte for byte; only where the profile is stored changes.

- [ ] **Step 2: Run.** `npx vitest run src/panels/Profiles.test.tsx` → FAIL. The section still reads `curves`.

- [ ] **Step 3: Implement.**
  - **`refusalFor`:** add the trailing parameter `after?: Board` and, at its end, use
    `const post = after ?? { ...board, curves: … };` (the existing expression), then `return holeRefusal(board, post);`.
  - **`Profiles.tsx`:**
    - `ProfileRow` takes `profile: ProfileCut` and computes `p = profileToFields(profile)` and `curve = profileAsCurve(profile)`.
      Keep `curve` for `curveLine` and `curveFaults`, which read the part through the view.
    - `attempt(next: Draft, control)` becomes `attempt(nextFields: ProfileFields, control)`. It builds
      `const nextProfile = profileFromFields(normal(nextFields));`,
      `const after: Board = { ...board, profiles: board.profiles.map((x) => (x.id === profile.id ? { ...nextProfile, id: x.id } : x)) };`,
      and checks `refusalFor(geometryBoard(board), curve, profileCurve(normal(nextFields)), control, after)`.
    - It stores through `updateProfile(board.id, profile.id, nextProfile)`.
    - `write`, `field` and `set` keep their roles. The Profile select's `asKind` returns FIELDS:
      `profileFields(defaultProfile(board, k, p, facing))!`.
    - The focus-judged reasons call the same refusal path.
  - **Presets:**
    - `fits(c)` builds `after` with `profiles: [...board.profiles, { ...profileOf(c)!, id: '__preset0' }]` and checks
      `curveFaults(board, c)` as today.
    - A preset runs `addProfiles(board.id, [profileOf(c)!])`.
    - `rows` is `board.profiles.map((profile) => …)`.
  - Every label, option text, aria name, error string and class name stays unchanged.

- [ ] **Step 4: Run.** `npx vitest run src/panels` → PASS.

- [ ] **Step 5: Mutate.** Each must turn a test red; restore after each.
  1. Pass `board` instead of `after` to `refusalFor`, so the hole check never sees the edit. The hole refusal test fails.
  2. `rows` from `board.curves`. Every row test fails.

- [ ] **Step 6: Full suite, build, commit.**

```bash
git add src && git commit -m "Profiles: the section reads and writes Board.profiles; no visible change (profile runs a1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Live pass and the round's docs

**Files:**
- Create: `docs/browser-verification-profile-runs-a1.md`
- Modify: `CLAUDE.md`, `docs/follow-ups.md`, `docs/history.md`, the spec's Status line

- [ ] **Step 1: Live pass** on the dev server (`npm run dev -- --port 5180 --host 127.0.0.1`, the Playwright MCP browser). Steps:
  - Before switching the code, export the dev project "Edge profiles check" (it was saved by v17 code) through
    Project ▾ → Export.
  - On the branch, open that project (or import `.playwright-mcp/edge-profiles-check.sloyd.json`).
  - Confirm each of these against the deployed look:
    - the Profiles rows (the same rows and values);
    - the viewport in Iso;
    - the Plans sheet's key list;
    - the cut list's bench lines;
    - one part diagram.
  - Edit one profile (Fillet), undo it, then reload the page: the project autosaves as v18 and reopens the same.
  - Record a DOM readout of the rows, keys and bench lines before and after in the verification doc.
  - Leave the test projects in place (the user's dev-profile ruling).

- [ ] **Step 2: Docs.**
  - **CLAUDE.md:**
    - Status: a "Profile runs chunk a1" bullet, with SCHEMA 18 and its rollback warning (export first).
    - Rounds row: `| profile runs (a1) | 10-17 | 18 | Edge profiles stored as Board.profiles (moved from curves on load); every reader through geometryBoard; unbuildable runs refused |`.
    - Versioning table: the 17 → 18 row from spec §3.2. Update `CURRENT_VERSION` text to **18**.
    - Where things live: the `profiles.ts` entry gains ProfileCut conversions and `geometryBoard` (THE geometry view).
    - Inv 53: the sentence "profiles are curves recognised by `profileFields`" becomes "profiles are stored as `ProfileCut`s
      (schema 18); geometry, words and faults read them through `geometryBoard` as the CurveCut chunk 1 stored; `profileFields`
      survives to migrate".
    - Invs 33/40/44/45: one clause each (`profiles` id scope shared with curves, `PROFILE_FIELDS`, `mirrorProfile` flag flips,
      `profiles` shared).
    - The test count.
  - **`docs/follow-ups.md`:** 390 and 365 statuses (a1 shipped; a2 next).
  - **`docs/history.md`:** a section for the round.
  - **The spec's Status line:** written spec approved; a1 implemented.

```bash
git add docs CLAUDE.md && git commit -m "docs: profile runs chunk a1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Merge** (no PRs). `git checkout master && git merge --no-ff profile-runs-a1`, then `npm test && npm run build` on
  the merged tree, then `git branch -d profile-runs-a1`. **Deploy only on the user's word.** Schema 18 is not free to roll back:
  say so when reporting.
