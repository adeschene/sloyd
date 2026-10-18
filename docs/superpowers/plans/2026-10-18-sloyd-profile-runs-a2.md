# Profile runs, chunk a2 (stopped profiles and the router run-out) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A profile can stop partway along one side. It is full depth from a Start station to a Stop station, and at each stop it
ends in the router's own run-out: the cutter turned about the bit's axis. It is drawn, shaded, edged, snapped, worded, keyed,
faulted and edited like a full-length profile.

**Architecture:**
- **The view.** A station run is stored as chunk a1 left the form (`ProfileCut.run` with station ends, schema 18, no bump). The
  geometry view (`geometryBoard`) carries it as its chunk-1 `CurveCut` plus a VIEW-ONLY `span` (P18), never stored.
- **One home for the run-out.** `document/runout.ts` (new) is the ONE place a run-out becomes geometry: convex sector pieces for
  the bodies, a point test, the cutter's surface normal.
- **The readers.** Every reader that a1 routed through the view learns the span:
  - bodies (band slab + run-out pieces);
  - edges (smooth run-out facets suppressed);
  - drawing (span-clipped silhouettes, facet-chain silhouettes on the run-out, lifts on every model edge);
  - mesh normals;
  - snap points, stock probe and hole faults;
  - diagrams, words and keys.
- **No regression.** A part with no stopped profile is byte for byte what a1 gives.

**Tech Stack:** TypeScript, React, Zustand, Vitest. `npm test` (Vitest) does NOT typecheck; `npm run build` (`tsc -b && vite build`)
is the gate.

**Spec:** `docs/superpowers/specs/2026-10-17-sloyd-profile-runs-design.md`: §3–§6, R4a, R5, R9, and the planning rulings P1–P8
(a1) and **P9–P19 (a2)** *Amended (planning)*. Read P9–P19 before any task. Follow-up 391(1) (the schema-18 gate's last hole) is
Task 1.

## Global Constraints

- **No schema bump** (18). The stored form is a1's `ProfileCut`: `run: { start: ProfileEnd; end: ProfileEnd }`, where an end is
  `{ side, through }` or `{ side, from, at }`.
- **A station marks where the full profile ends (P9).** The band is full depth over `[lo, hi]` along the run. Beyond a STOP end
  the run-out removes, at depth t, every point within `BEARING + w(t)` of the bit's axis on the far side of the station. Here
  `BEARING = 0.25`, `w(t)` is the profile's waste width at depth t, and the axis runs along the thickness, `BEARING` outside the
  side face, at the station.
- **One side only (P10):** ends on two sides and loops still refuse the document.
- **Canonical order (P11):** `start` precedes `end` along `travelSign(face, side)`; an End to end run stays `through 'min'` →
  `through 'max'` (P3). The row writes `from: 'min'`.
- **Byte for byte:** for every a1 fixture (no station ends), every reader's output is unchanged. `profilesView.test.ts` and
  `drawingIdentity.test` must pass untouched. A curve with no `span` keeps `curveValues` byte for byte (P18).
- **Faults (P12, P13, P14):**
  - `stop-off`: a station at or beyond the part's end, or `lo >= hi`;
  - `overlap`: same face and side, spans overlap with positive length;
  - holes are judged against the band extended by `BEARING + reach` at each stop end;
  - a run-out past the end is not a fault.
  Authoring refuses an ADDED fault; a fault a later resize causes is KEPT and noted (inv 53's rule).
- **Words (P15):**
  - bench line `… , from <a> to <b> (stopped)`, where a through end reads `the <dim> <min|max> end` and a station reads its
    distance from the run dimension's min end through `formatLength`;
  - key line `<name><fillet>, stopped`;
  - a stopped profile never collapses.
- **Run-out lines (P19, below):** drawn as the model's chords (`CURVE_TOLERANCE`); paper-tolerance paths on a run-out are a
  follow-up.
- **Performance:** a stopped roundover, cove and ogee on a 30 × 10 × 3/4 shelf, stops 3" in from each end, each ≤ 40 ms, minimum
  of 9 (curvesPerf's method). The probe measured 7–14 ms for bodies plus raw edges.
- **Watertight:** every stopped case has 0 unmatched directed edges (`curvesWatertight.test.ts`).
- **Invariants touched:**
  - 16 (lines only where drawn; smooth facets suppressed per interval);
  - 44 (`mirrorProfile` keeps canonical order);
  - 47 (silhouettes; lifts);
  - 48/53 (`runout.ts` is the one home; bodies stay convex);
  - 50 (watertight).
  Never `board[dim] - x` at a call site. Use the helpers below (`endPos`).
- Commit after each task with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Branch `profile-runs-a2`, from master.

Add **P19** to the spec in Task 9: *run-out lines are drawn as model chords; fine paths on a run-out are a follow-up.*

## Review Focus

1. **A stopped profile on a MIRRORED or turned copy.** Its stations must land at the same world place as the original's mirror
   image. Task 1 pins canonical order under every mirror; Task 3 pins world wood under a mirror.
2. **Resizing a part with a stopped profile.**
   - Shrinking past a station gives `stop-off`, noted, and the editor still opens.
   - Growing it keeps the station measured from the min end.
   - Task 2 pins the fault; Task 8 pins that the row edits back.
3. **A hole near a run-out.** It is refused when it would meet the run-out's extended band, and allowed once clear. Task 4 pins
   both sides of the boundary.
4. **A stop right next to the end** (a station 0.1" in): the run-out runs off the end and is not a fault. Bodies are watertight
   there. Task 3/5 pin it.
5. **An a1 file and an a1 part are unchanged.** `profilesView.test.ts` runs untouched in every task. Any task that changes it
   has failed.

---

### Task 1: Load and order station runs (and close fu 391(1))

**Files:**
- Modify: `src/document/profiles.ts` (`travelSign`, `runDim`, `endPos`, `canonicalRun`; `profileToFields` accepts a one-side run;
  `profileFromFields` unchanged)
- Modify: `src/document/document.ts` `validateProfiles` (accept one-side station runs; tighten the gate)
- Test: `src/document/profiles.test.ts`, `src/document/profilesLoad.test.ts` (append)

**Interfaces:**
- Produces:
  ```ts
  export const runDim: (side: ProfileSide) => 'length' | 'width';            // the dimension a side runs along
  export function travelSign(face: CutFrom, side: ProfileSide): 1 | -1;      // +1: travel runs toward runDim's max end
  export function endPos(board: Pick<Board, Dimension>, e: ProfileEnd): number; // local position along runDim
  export function canonicalRun(board: Pick<Board, Dimension>, face: CutFrom, run: { start: ProfileEnd; end: ProfileEnd }): { start: ProfileEnd; end: ProfileEnd };
  export function oneSide(run: ProfileRun): run is { start: ProfileEnd; end: ProfileEnd };  // both ends on one side
  ```
  `profileToFields(p)` now returns the side's fields for ANY one-side run (the run itself is read elsewhere). It still throws for
  a loop or two sides.

- [ ] **Step 1: Write the failing tests.** Append to `src/document/profiles.test.ts` (import the new names from `./profiles`):

```ts
describe('station runs: order and mirror (profile runs a2, P11)', () => {
  const B = { length: 30, width: 10, thickness: 0.75 };
  const side = { across: 'width', from: 'max' } as const;
  const st = (at: number) => ({ side, from: 'min' as const, at });
  it('runDim and endPos: a station from min reads `at`, from max reads length − at; a through end its face', () => {
    expect(runDim(side)).toBe('length');
    expect(runDim({ across: 'length', from: 'min' })).toBe('width');
    expect(endPos(B, st(3))).toBe(3);
    expect(endPos(B, { side, from: 'max', at: 3 })).toBe(27);
    expect(endPos(B, { side, through: 'max' })).toBe(30);
  });
  it('travelSign flips with the side and with the face, never with the run', () => {
    expect(travelSign('max', { across: 'width', from: 'min' })).toBe(-travelSign('max', { across: 'width', from: 'max' }));
    expect(travelSign('min', side)).toBe(-travelSign('max', side));
  });
  it('canonicalRun orders a station run along travel; an End to end run stays min → max', () => {
    const fwd = travelSign('max', side) > 0;
    const run = canonicalRun(B, 'max', { start: st(27), end: st(3) });
    expect([endPos(B, run.start), endPos(B, run.end)]).toEqual(fwd ? [3, 27] : [27, 3]);
    const e2e = { start: { side, through: 'max' as const }, end: { side, through: 'min' as const } };
    expect(canonicalRun(B, 'max', e2e)).toEqual({ start: { side, through: 'min' }, end: { side, through: 'max' } });
  });
  it('mirrorProfile keeps a canonical station run canonical, in every dimension (Review Focus 1)', () => {
    const base = profileFromFields({ through: 'length', uFrom: 'max', vFrom: 'max', kind: 'cove', size: 0.375, fillet: 0, facing: 'v' });
    const p: ProfileCut = { id: 'x', ...base, run: canonicalRun(B, base.face, { start: st(3), end: st(20) }) };
    for (const d of ['length', 'width', 'thickness'] as const) {
      const m = mirrorProfile(p, d);
      if ('loop' in m.run) throw new Error('loop');
      expect(canonicalRun(B, m.face, m.run), d).toEqual(m.run);
    }
  });
  it('profileToFields reads a one-side station run as its side\'s fields', () => {
    const base = profileFromFields({ through: 'length', uFrom: 'max', vFrom: 'max', kind: 'roundover', size: 0.25, fillet: 0, facing: 'v' });
    const p: ProfileCut = { id: 'x', ...base, run: { start: st(3), end: st(27) } };
    expect(profileToFields(p)).toEqual(profileToFields({ id: 'x', ...base }));
  });
});
```

  Append to `src/document/profilesLoad.test.ts`, in the existing `describe` (reuse its `v17`, `part` and `p1` helpers):

```ts
  it('a one-side station run loads, ordered along travel (a2, P10/P11)', () => {
    const side = { across: 'width', from: 'max' } as const;
    const raw = { ...v17([part({ profiles: [{ ...p1(), run: { start: { side, from: 'min', at: 27 }, end: { side, from: 'min', at: 3 } } }] })]), version: 18 };
    const r = board0(load(raw)).profiles[0]!.run;
    expect('loop' in r ? null : [r.start, r.end].map((e) => ('at' in e ? e.at : e.through)).sort()).toEqual([27, 3].sort());
  });
  it('a station beside a through end loads', () => {
    const side = { across: 'width', from: 'max' } as const;
    const raw = { ...v17([part({ profiles: [{ ...p1(), run: { start: { side, through: 'min' }, end: { side, from: 'min', at: 20 } } }] })]), version: 18 };
    expect(board0(load(raw)).profiles).toHaveLength(1);
  });
  // fu 391(1): a later build's end must never be misread.
  it('an end carrying both through and from/at refuses (stopped)', () => {
    const side = { across: 'width', from: 'max' } as const;
    const raw = { ...v17([part({ profiles: [{ ...p1(), run: { start: { side, through: 'min', at: 3 }, end: { side, through: 'max' } } }] })]), version: 18 };
    expect(() => load(raw)).toThrow('This project has an edge profile this version of Sloyd can\'t build (stopped) — it was saved by a newer version of Sloyd.');
  });
  it('an end with a readable side and an unreadable through refuses', () => {
    const side = { across: 'width', from: 'max' } as const;
    const raw = { ...v17([part({ profiles: [{ ...p1(), run: { start: { side, through: 'middle' }, end: { side, through: 'max' } } }] })]), version: 18 };
    expect(() => load(raw)).toThrow(/can't build \(run "through"\)/);
  });
  it('a station with a non-finite or negative `at` is dropped, not refused', () => {
    const side = { across: 'width', from: 'max' } as const;
    for (const at of [Number.NaN, -1]) {
      const raw = { ...v17([part({ profiles: [{ ...p1(), run: { start: { side, from: 'min', at }, end: { side, through: 'max' } } }] })]), version: 18 };
      expect(board0(load(JSON.parse(JSON.stringify(raw)))).profiles).toEqual([]);
    }
  });
```

  The stopped-run refusal tests from a1 change meaning here. A one-side station run now LOADS. Update the a1 refusal test whose
  run was `{ start: { side, from: 'min', at: 3 }, end: { side, through: 'max' } }` so it asserts it loads instead. Name it in the
  report. The `all round` and `ends on two sides` refusals stay.

- [ ] **Step 2: Run.** `npx vitest run src/document/profiles.test.ts src/document/profilesLoad.test.ts`. Expected: FAIL. The new
  names don't exist, and the loader refuses stations.

- [ ] **Step 3: Implement the helpers** in `src/document/profiles.ts`:

```ts
/** The dimension a side runs along: a side at width's end runs along the length, and the reverse. */
export const runDim = (side: ProfileSide): 'length' | 'width' => (side.across === 'width' ? 'length' : 'width');
/**
 * The direction a run travels along its side (profile runs spec P11): +1 toward the run dimension's max end. It flips with
 * the side's `from` and with `face`, never with the run, so every reflection reverses it (mirrorProfile swaps the ends to match).
 */
export function travelSign(face: CutFrom, side: ProfileSide): 1 | -1 {
  const base = side.across === 'width' ? (side.from === 'min' ? 1 : -1) : side.from === 'max' ? 1 : -1;
  return (face === 'max' ? base : -base) as 1 | -1;
}
/** An end's local position along its side's run dimension (the one place a station is read as a coordinate, inv 44). */
export function endPos(board: Pick<Board, Dimension>, e: ProfileEnd): number {
  const L = board[runDim(e.side)];
  if ('through' in e) return e.through === 'min' ? 0 : L;
  return e.from === 'min' ? e.at : L - e.at;
}
/** Both ends on one side (chunk a2 builds these; a loop or two sides refuse on load). */
export function oneSide(run: ProfileRun): run is { start: ProfileEnd; end: ProfileEnd } {
  return !('loop' in run) && run.start.side.across === run.end.side.across && run.start.side.from === run.end.side.from;
}
/** The stored order (P11): End to end min → max (P3); a station run with start before end along `travelSign`. */
export function canonicalRun(board: Pick<Board, Dimension>, face: CutFrom, run: { start: ProfileEnd; end: ProfileEnd }) {
  if (endToEnd(run)) {
    return run.start.through === 'min' ? run : { start: { ...run.end }, end: { ...run.start } };
  }
  const s = travelSign(face, run.start.side);
  const before = (endPos(board, run.start) - endPos(board, run.end)) * s <= 0;
  return before ? run : { start: run.end, end: run.start };
}
```

  Import `ProfileRun` in the type import. In `profileToFields`, replace the `endToEnd` guard with
  `if (!oneSide(p.run)) throw new Error('profileToFields: a loop or a run on two sides is not built until chunk b');` and read the
  side from `p.run.start.side`.

- [ ] **Step 4: Implement the loader.** In `src/document/document.ts` `validateProfiles`:
  - **Refusals, decided before any drop.** For each end whose `side` parses:
    - if it has `through` AND (`from` or `at`) → `refuseProfile('stopped')`;
    - if it has `through` that is not `'min'`/`'max'` → `refuseProfile('run "through"')`.
    - Keep every other a1 refusal: unknown kind, unknown run key, any `loop`, unknown end key, ends on two sides.
    - REMOVE the refusal of a station end (`stopped`) for a well-formed station: it now loads.
  - **Drops.** A station end needs `from` in min/max and a finite `at >= 0`, else the profile is dropped. Two `through` ends with
    the same value are still dropped.
  - **Order.** Store `canonicalRun(fields, face, { start, end })`. `fields` holds the dimensions validateSharedFields already has;
    pass them in as a new parameter. A station run keeps its ends' `from` as stored.
  - Update the doc comment above `validateProfiles`.

- [ ] **Step 5: Run.** The Step 2 command → PASS. Also `npx vitest run src/document/profilesView.test.ts` → PASS, untouched.

- [ ] **Step 6: Mutate.** Each must turn a test red; restore after each.
  1. Drop the `through`+`at` refusal. The fu 391(1) test fails.
  2. `canonicalRun` ignores `travelSign` (always ascending). The mirror test fails.
  3. `travelSign` ignores `face`. The flip test fails.

- [ ] **Step 7: Full suite, build, commit.**

```bash
git add src && git commit -m "profiles: one-side station runs load, ordered along travel; the schema-18 gate closed (profile runs a2, fu 391(1))

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The span, its faults and its words

**Files:**
- Create: none. Add to `src/document/profiles.ts`: `profileSpan`, `profileFaults`, `ProfileFault`.
- Modify: `src/document/curves.ts`:
  - `CurveSpan`, `ViewCurve`, `spanOf`;
  - `curveValues` appends a span;
  - `curveFaults` unchanged.
- Modify: `src/document/profiles.ts` `geometryBoard` (a stopped profile carries `span`)
- Modify: `src/document/curveText.ts` (span words; no collapse for a spanned profile; `profileFaultText`)
- Modify: `src/document/featureKeys.ts` (`, stopped` on the key line)
- Test: `src/document/profiles.test.ts`, `src/document/curveText.test.ts`, `src/document/featureKeys.test.ts` (append)

**Interfaces:**
- Produces (curves.ts; curves.ts still imports nothing from profiles.ts):
  ```ts
  /** VIEW-ONLY (P18): a stopped profile's extent along `through` in the geometry view; never stored, never validated. */
  export interface CurveSpan { lo: number; hi: number; stopLo: boolean; stopHi: boolean }
  export type ViewCurve = CurveCut & { span?: CurveSpan };
  export const spanOf = (c: Omit<CurveCut, 'id'>): CurveSpan | undefined => (c as ViewCurve).span;
  ```
  `curveValues(c)` returns today's string when `spanOf(c)` is undefined. Otherwise it appends
  `` `|span:${num(lo)},${num(hi)},${stopLo ? 1 : 0},${stopHi ? 1 : 0}` ``.
- Produces (profiles.ts):
  ```ts
  export function profileSpan(board: Pick<Board, Dimension>, p: ProfileCut): CurveSpan | undefined; // undefined for End to end
  export type ProfileFault = { kind: 'stop-off' } | { kind: 'overlap'; other: string };
  export function profileFaults(board: Pick<Board, Dimension | 'profiles'>, p: ProfileCut): ProfileFault[];
  ```
  `geometryBoard`'s view entry for a profile is `{ ...profileAsCurve(p), ...(span ? { span } : {}) }` with
  `span = profileSpan(b, p)`. The `as T` view must still be the same object when `b.profiles` is empty.

- [ ] **Step 1: Write the failing tests.** Append to `src/document/profiles.test.ts`:

```ts
describe('the span and the profile faults (profile runs a2, P12/P13)', () => {
  const B = { length: 30, width: 10, thickness: 0.75 };
  const side = { across: 'width', from: 'max' } as const;
  const base = profileFromFields({ through: 'length', uFrom: 'max', vFrom: 'max', kind: 'roundover', size: 0.25, fillet: 0, facing: 'v' });
  const stopped = (a: number, b: number, id = 'p'): ProfileCut => ({ id, ...base, run: canonicalRun(B, base.face, { start: { side, from: 'min', at: a }, end: { side, from: 'min', at: b } }) });
  it('an End to end profile has no span; its view curve is chunk 1\'s bytes', () => {
    const p: ProfileCut = { id: 'p', ...base };
    expect(profileSpan(B, p)).toBeUndefined();
    const board = createBoard({ ...B, profiles: [p] });
    expect(geometryBoard(board).curves[0]).toEqual(profileAsCurve(p));
  });
  it('a stopped profile spans its stations, stop flags set; a through end sets none', () => {
    expect(profileSpan(B, stopped(3, 27))).toEqual({ lo: 3, hi: 27, stopLo: true, stopHi: true });
    const half: ProfileCut = { id: 'p', ...base, run: canonicalRun(B, base.face, { start: { side, through: 'min' }, end: { side, from: 'min', at: 20 } }) };
    expect(profileSpan(B, half)).toEqual({ lo: 0, hi: 20, stopLo: false, stopHi: true });
  });
  it('the view carries the span, and curveValues tells a stopped curve from a full one', () => {
    const g = geometryBoard(createBoard({ ...B, profiles: [stopped(3, 27)] }));
    expect(spanOf(g.curves[0]!)).toEqual({ lo: 3, hi: 27, stopLo: true, stopHi: true });
    expect(curveValues(g.curves[0]!)).not.toBe(curveValues(profileAsCurve(stopped(3, 27))));
    expect(curveValues(profileAsCurve(stopped(3, 27)))).toBe(curveValues(profileAsCurve({ id: 'p', ...base })));
  });
  it('stop-off: a station at or past an end, or a start not before its stop (P12); none for a fit', () => {
    const b = (p: ProfileCut) => profileFaults(createBoard({ ...B, profiles: [p] }), p).map((f) => f.kind);
    expect(b(stopped(3, 27))).toEqual([]);
    expect(b(stopped(3, 30))).toEqual(['stop-off']);
    expect(b(stopped(3, 31))).toEqual(['stop-off']);
    expect(b(stopped(0, 20))).toEqual(['stop-off']);
    expect(b(stopped(12, 12))).toEqual(['stop-off']);
  });
  it('a stop 0.1" in is no fault: the run-out runs off the end (P13)', () => {
    expect(profileFaults(createBoard({ ...B, profiles: [stopped(0.1, 27)] }), stopped(0.1, 27))).toEqual([]);
  });
  it('overlap: same face and side, spans overlapping with positive length; touching is not (P12)', () => {
    const a = stopped(3, 15, 'a'), c = stopped(12, 27, 'c'), d = stopped(15, 27, 'd');
    expect(profileFaults(createBoard({ ...B, profiles: [a, c] }), a)).toEqual([{ kind: 'overlap', other: 'c' }]);
    expect(profileFaults(createBoard({ ...B, profiles: [a, d] }), a)).toEqual([]);
    const full: ProfileCut = { id: 'f', ...base };
    expect(profileFaults(createBoard({ ...B, profiles: [a, full] }), a)).toEqual([{ kind: 'overlap', other: 'f' }]);
    const otherSide: ProfileCut = { id: 'o', ...profileFromFields({ through: 'length', uFrom: 'min', vFrom: 'max', kind: 'roundover', size: 0.25, fillet: 0, facing: 'v' }) };
    expect(profileFaults(createBoard({ ...B, profiles: [a, otherSide] }), a)).toEqual([]);
  });
});
```

  Check the a1 decision before changing anything: chunk 1 allowed two IDENTICAL End to end profiles stacked on one edge (P6).
  That case is now an `overlap` too. Search the a1 tests for one that adds two equal profiles to one edge, and update it to
  expect the fault. Name it in the report.

  Append to `src/document/curveText.test.ts`, using its existing helpers and `UNITS`:

```ts
describe('stopped profile words (profile runs a2, P15)', () => {
  const B = { length: 30, width: 10, thickness: 0.75 };
  const side = { across: 'width', from: 'max' } as const;
  const base = profileFromFields({ through: 'length', uFrom: 'max', vFrom: 'max', kind: 'roundover', size: 0.25, fillet: 0, facing: 'v' });
  const board = (run: ProfileCut['run'], extra: ProfileCut[] = []) => createBoard({ id: 'b', ...B, profiles: [{ id: 'p', ...base, run }, ...extra] });
  it('a stopped bench line adds its stations from the min end', () => {
    const b = board(canonicalRun(B, base.face, { start: { side, from: 'min', at: 3 }, end: { side, from: 'min', at: 27 } }));
    expect(curveLines(b, UNITS)).toEqual(['Roundover 1/4" on the edge between the width face (max side) and the thickness face (max side), along the length, from 3" to 27" (stopped)']);
  });
  it('a through end reads as its end', () => {
    const b = board(canonicalRun(B, base.face, { start: { side, through: 'min' }, end: { side, from: 'min', at: 20 } }));
    expect(curveLines(b, UNITS)[0]).toMatch(/, from the length min end to 20" \(stopped\)$/);
  });
  it('a station stored from max reads from the min end (a mirrored copy)', () => {
    const b = board(canonicalRun(B, base.face, { start: { side, from: 'max', at: 3 }, end: { side, from: 'max', at: 27 } }));
    expect(curveLines(b, UNITS)[0]).toMatch(/, from 3" to 27" \(stopped\)$/);
  });
  it('a stopped profile never joins the four-edge collapse', () => {
    const four = PROFILE_EDGES.filter((e) => e.vFrom === 'max').map((e, i) => ({ id: `q${i}`, ...profileFromFields({ ...e, kind: 'roundover', size: 0.25, fillet: 0, facing: 'v' }) }));
    const stoppedOne = { ...four[0]!, run: canonicalRun(B, 'max', { start: { side: (four[0]!.run as { start: ProfileEnd }).start.side, from: 'min', at: 3 }, end: { side: (four[0]!.run as { start: ProfileEnd }).start.side, from: 'min', at: 6 } }) };
    const lines = curveLines(createBoard({ id: 'b', ...B, profiles: [stoppedOne, ...four.slice(1)] }), UNITS);
    expect(lines.some((l) => l.includes('all four edges'))).toBe(false);
    expect(lines).toHaveLength(4);
  });
  it('a stopped profile with a stop past the end is noted', () => {
    const b = board(canonicalRun(B, base.face, { start: { side, from: 'min', at: 3 }, end: { side, from: 'min', at: 31 } }));
    expect(curveLines(b, UNITS)[0]).toMatch(/ — check: a stop runs off the part$/);
  });
});
```

  Append to `src/document/featureKeys.test.ts`: the key line of the stopped roundover reads `Roundover 1/4", stopped`, and a full
  one on another edge keeps `Roundover 1/4"`, so the two get two letters.

- [ ] **Step 2: Run** the three files. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - **`profileSpan`:** `undefined` when `endToEnd(p.run)` or not `oneSide`. Otherwise
    `lo = min(endPos(start), endPos(end))`, `hi = max(…)`. `stopLo` is true when the end AT `lo` is a station; `stopHi` likewise.
    The geometry is symmetric, so the canonical order never matters here.
  - **`profileFaults`:**
    - `stop-off` when either station's `endPos` is `<= 0` or `>= board[runDim]`, or `lo >= hi`;
    - `overlap` for each OTHER profile on the same `face` and side whose span overlaps this one by more than `1e-9`. An End to end
      profile's span is `[0, L]`.
  - **The fault words.** Add an exported `profileFaultText(f)` in `curveText.ts`:
    - `stop-off` → `a stop runs off the part`;
    - `overlap` → `it overlaps another profile on this edge`.
  - **`curveLine` for a profile curve:**
    - appends `` `, from ${a} to ${b} (stopped)` `` when `spanOf(c)`;
    - `a` and `b` read in TRAVEL-INDEPENDENT order (lo then hi);
    - a non-stop end at `lo`/`hi` reads `the ${dim} min end` / `the ${dim} max end`;
    - then the faults: `curveFaults` first (as today), then `profileFaults` of the stored profile, worded by `profileFaultText`.
      `curveLineEntries` receives the view, so find the stored profile by id on the ORIGINAL part. Pass the original part into the
      view-reading helpers, or keep a `WeakMap` from view to original in `geometryBoard`, and say which in the report.
  - **The collapse:** skip any curve with `spanOf(c)`.
  - **featureKeys:** append `', stopped'` when `spanOf(c)`.
  - **`curveValues`:** append the span text when present (code in Interfaces).

- [ ] **Step 4: Run** the three files and `npx vitest run src/document/profilesView.test.ts` → PASS (the latter untouched).

- [ ] **Step 5: Mutate.** Each must turn a test red; restore after each.
  1. `curveValues` ignores the span. The view test fails.
  2. The collapse admits a spanned profile. The collapse test fails.
  3. `overlap` treats touching as overlapping. The touching case fails.

- [ ] **Step 6: Full suite, build, commit.** `git commit -m "profiles: the span, stop-off and overlap faults, stopped words and keys (profile runs a2)"` with the
  Co-Authored-By line.

---

### Task 3: `runout.ts` and the bodies

**Files:**
- Create: `src/document/runout.ts`
- Modify: `src/document/bodies.ts`:
  - `boardBodies`: a spanned curve is subtracted along the SPLIT path, its pieces bounded by the slab at each stop, plus the
    run-out pieces;
  - `subtractPieces`' piece type gains `runout?: 'lo' | 'hi'`, and its cap tag carries it;
  - `BodyFace` gains `runout?: 'lo' | 'hi'`.
- Test: create `src/document/runout.test.ts`

**Interfaces:**
- Produces (runout.ts; imports `curves.ts` and `types` only):
  ```ts
  export const BEARING = 0.25;
  /** The profile's waste as an (s, t) polygon: s in from the side face, t in from the broad face; arc flags per edge. */
  export function profileSection(board: Pick<Board, Dimension>, c: ViewCurve): { pts: P2[]; arc: boolean[] };
  /** The local frame of a spanned profile: run axis index k, across axis iu (side face), depth axis iv (broad face),
   *  the side face's coordinate and outward sign, the broad face's coordinate and inward sign. */
  export function sectionFrame(board: Pick<Board, Dimension>, c: ViewCurve): { k: number; iu: number; iv: number; uEdge: number; uOut: 1 | -1; vFace: number; vIn: 1 | -1 };
  /** The bit's axis at a stop (a point in the run–across plane; it runs along iv). */
  export function runoutAxis(board: Pick<Board, Dimension>, c: ViewCurve, end: 'lo' | 'hi'): { run: number; u: number };
  /** Convex waste pieces of both run-outs: { planes (n into the waste), onArc, runout }. */
  export function runoutPieces(board: Pick<Board, Dimension>, c: ViewCurve): { planes: { n: V3; d: number }[]; onArc: boolean[]; runout: 'lo' | 'hi' }[];
  /** True when a board-local point is waste of this profile (band or run-out): the INDEPENDENT oracle. */
  export function profileWasteContains(board: Pick<Board, Dimension>, c: ViewCurve, p: V3): boolean;
  ```

- [ ] **Step 1: Write the failing tests.** Create `src/document/runout.test.ts`. The oracle is `profileWasteContains`. It is
  written from the definition (P9), not from the pieces: in the band, `(s, t)` lies in the section polygon; beyond a stop, with
  ρ the distance from the bit axis in the run–across plane, `(ρ − BEARING, t)` lies in the section polygon.
  1. **Section and oracle sanity** for a 1/4" roundover stopped 3..27 on a 30 × 10 × 3/4 shelf (width max, top):
     - a point mid-band in the corner waste is waste;
     - the same point at run = 1.0, beyond the run-out (ρ > 0.5), is wood;
     - a point 0.1" past the stop on the edge's corner is waste.
  2. **The wood.** For a roundover, a cove and an ogee, each stopped 3..27, and a stop 0.1" in:
     - the bodies' total volume equals a Weyl-sampled oracle volume over the 1" band within 2e-3 in³ (6 000 points);
     - every sample's containment in the bodies (the convex-body point test from `bodies.test.ts`) agrees with
       `!profileWasteContains` for at least 99.5% of samples. Samples within 2e-3 of the section's boundary are excluded, since
       chords lie inside the true arcs.
     Use the bodies' point test from `bodies.test.ts`, or copy it into the test file.
  3. **Convexity.** Every body is convex: each face's plane holds all the body's vertices on its inner side within 1e-9.
  4. **A part with no stopped profile is unchanged.** `boardBodies` toEqual a1's for the four-edge cove set.
     `profilesView.test.ts` already pins this; add one direct assertion.
  5. **A mirrored copy.** Place the shelf in a mirrored instance (`treeEdit.mirror.test.ts`' `doc` pattern). The world part's
     waste samples equal the original's mirror image: map each sample through the mirror and compare the oracle.

  Write the test code in full before running, following the existing patterns in `bodies.test.ts` (volume and oracle helpers,
  the Weyl sample).

- [ ] **Step 2: Run.** `npx vitest run src/document/runout.test.ts`. Expected: FAIL (no module).

- [ ] **Step 3: Implement `runout.ts`.**
  - `profileSection` reads `curveOutline(board, c)` (`pts`, `arcEdge`) in local (u, v) and maps each point to
    `(s, t) = (|u − uEdge|, |v − vFace|)`.
  - `sectionFrame`:
    - `k` = index of `c.through`; `iu` / `iv` = the u and v indices from `uvDims`, where v is thickness for every profile curve;
    - `uEdge` = 0 when `uFrom` is min, else `board[u]`; `uOut` = −1 when min, else +1;
    - `vFace` and `vIn` likewise from `vFrom`, with `vIn` = +1 when vFrom is min.
  - `runoutAxis`: run = `span.lo` or `span.hi`, `u = uEdge + uOut * BEARING`.
  - `runoutPieces` is the probe's construction (the spec's §2 probe; `scratchpad/stop-probe.ts` from planning), transcribed into
    this frame. For each stop end with its flag set:
    - forward direction f = −1 at `lo`, +1 at `hi`, along k;
    - `n = arcN(BEARING + maxS, π)` sectors at `CURVE_TOLERANCE`, angle θ from −π/2 to π/2 about f, in the (k, iu) plane;
    - each sector has two radial planes through the axis and the forward half-space `f·(x_k − station) >= 0`;
    - for each convex piece of `convexPieces(section.pts, section.arc)`, the piece's (s, t) edges become planes with
      `s = m·(x − axis) − BEARING` (m the sector's mid direction in (k, iu)) and `t = vIn·(x_iv − vFace)`, oriented with the
      piece's centroid inside (n into the waste);
    - `onArc` comes from the piece's `onArc`;
    - `runout` names the end.
  - `profileWasteContains`: band test or run-out test, as defined above, with `pointInPolygon` on the section (closed).
- [ ] **Step 4: Bodies.** In `boardBodies`, for a curve with `spanOf(c)`:
  1. Take `splitPieces(board, c)` (never the CLIP plan). To each piece add the slab plane(s), `x_k >= lo` when `stopLo` and
     `x_k <= hi` when `stopHi`, as waste-side planes (n into the waste), with `onArc: false`.
  2. Append `runoutPieces(board, c)`.
  3. Subtract all of them with `subtractPieces`, tagging caps `{ curve: c.id, runout }` where `onArc[i]`.
  4. A spanned curve never takes `clipAll`.
  5. `subtractPieces`' disjoint fold and diagonals-last stay. Pieces of one curve are applied together.
- [ ] **Step 5: Run.** The Step 2 command, plus `src/document/bodies.test.ts` and `profilesView.test.ts` → PASS.
- [ ] **Step 6: Mutate.** Each must turn a test red; restore after each.
  1. Drop the slab plane at `hi`: the band runs to the end. The volume and oracle tests fail.
  2. `BEARING = 0`. The run-out oracle disagrees.
  3. Sectors over a quarter circle (−π/2..0) instead of the half. Wood is left in the run-out, and the oracle fails.
  (A FULL circle would be an equivalent mutant: the back half meets only band waste or air. Do not use it.)
- [ ] **Step 7: Full suite, build, commit.** `git commit -m "profiles: runout.ts and stopped bodies (profile runs a2)"` with the
  Co-Authored-By line.

---

### Task 4: Stock probe, hole faults and snap points

**Files:**
- Modify: `src/document/cuts.ts` `stockProbe`: a spanned curve uses `profileWasteContains`.
- Modify: `src/document/holeFaults.ts` `intoCurve`: a spanned curve also requires the hole's extent along `through` to meet
  `[lo − R·stopLo, hi + R·stopHi]` (P14). R = `BEARING` + the section's max s.
- Modify: `src/document/snapPoints.ts`, the curve block: for a spanned curve, the arc marks at the part's end faces only on a
  `through` end; at each stop, the arc ends `s.a`, `s.b` on the stop plane as `'corner'` (P17).
- Test: append to `src/document/runout.test.ts` and `src/document/snapPoints.test.ts`

**Interfaces:** consumes `spanOf`, `profileWasteContains`, `profileSection` and `sectionFrame` (Tasks 2–3).

- [ ] **Step 1: Write the failing tests.**
  1. **`stockProbe`** agrees with `!profileWasteContains` on 2 000 sampled points of the stopped roundover shelf, away from
     section boundaries by 2e-3.
  2. **Holes (Review Focus 3).** A 1/8" × 1/8" blind bore down into the top face, 0.1" in from the width-max edge:
     - at run = 18 (mid-band): `breaks-out` with `curve: 'p'`;
     - at run = 27 + 0.4 (inside the extended band, R = 0.5 for the 1/4" roundover): refused, `curve: 'p'`;
     - at run = 27 + 0.6: no curve fault;
     - at run = 1.0, beyond the run-out on the start side: no curve fault.
  3. **Snap points.**
     - The stopped shelf's snap points include the roundover's arc ends at run = 3 and run = 27 on the stop planes, as `'corner'`.
     - They include NO arc mark on the length-min or length-max end faces.
     - A half-stopped profile (start through min) has its end-face marks at length 0 only.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** as in Files.
  - Never `board[dim] - x` at a call site: use `endPos`/`sectionFrame`.
  - `stockProbe`'s existing a1 behaviour for unspanned curves is unchanged (`profilesView.test.ts`).
- [ ] **Step 4: Run** the tests and `profilesView.test.ts` → PASS.
- [ ] **Step 5: Mutate.** Each must turn a test red; restore after each.
  1. Drop the R extension. The 27 + 0.4 case passes, wrongly.
  2. Keep the end-face marks for a stopped curve. The snap test fails.
- [ ] **Step 6: Full suite, build, commit.** `git commit -m "profiles: stopped stock probe, hole faults and snap points (profile runs a2)"` with the
  Co-Authored-By line.

---

### Task 5: Shading and the watertight mesh

**Files:**
- Modify: `src/viewport/grainTiling.ts` `bodyMesh`. A face tagged `runout` gets per-vertex normals of the cutter surface:
  - take ρ⃗ = the vertex's (k, iu) offset from the run-out's axis, ρ = |ρ⃗|, s = ρ − BEARING, t;
  - find the section's arc whose chord the face lies on, by the face's (s, t) vertices (as `chordArc` does for prisms);
  - the 2D normal is `(s − sc, t − tc)` normalised;
  - the 3D normal is `n_s · ρ̂ + n_t · t̂`;
  - flip it to agree with the face's outward `n`, then `toWorld`.
  A band face of a spanned curve keeps today's radial path.
- Add to `runout.ts`: `runoutNormal(board, c, end, p): V3 | null`. It is THE cutter-surface normal; bodyMesh calls it.
- Test: `src/viewport/curvesWatertight.test.ts` (table rows), `src/viewport/curvesPerf.test.ts` (three cases),
  `src/document/runout.test.ts` (normals)

- [ ] **Step 1: Write the failing tests.**
  1. **The normal.** At a vertex on a run-out arc face, `runoutNormal` is perpendicular, within 1e-6, to two tangent directions
     of the cutter surface computed by finite differences of the oracle's boundary:
     - along the sector (rotation about the axis);
     - along the section arc.
     It points out of the wood (`profileWasteContains(p + 1e-4·n)` is true).
  2. **Watertight.** Add rows to the profiled table in `curvesWatertight.test.ts`: the stopped roundover, cove and ogee
     (3..27), the half-stopped roundover (through min..20) and a stop 0.1" in. Each has 0 unmatched.
  3. **Perf.** Add three ≤40 ms cases to `curvesPerf.test.ts` (the stopped roundover, cove and ogee on the shelf), each asserting
     its part has a stopped profile (`spanOf(geometryBoard(b).curves[0]!)` defined).
- [ ] **Step 2: Run.** Expected: FAIL (no `runoutNormal`). Watertight may already pass or fail: record which.
- [ ] **Step 3: Implement** `runoutNormal` and the `bodyMesh` branch.
  - If watertight fails, the cause is a run-out vertex left strictly inside another face's edge. Fix it in the conform step
    (inv 50: insert the candidate's own object), never by loosening the test.
- [ ] **Step 4: Run** the three files → PASS. If a perf case is over 40 ms, re-run alone and record `uptime`. If it is still
  over, profile it (`--cpu-prof`) and report before changing any bound.
- [ ] **Step 5: Mutate.**
  1. Use the flat face normal for run-out faces. The normal test fails.
  2. Flip the sign rule. The outward assertion fails.
- [ ] **Step 6: Full suite, build, commit.** `git commit -m "viewport: run-out normals, watertight, perf guards (profile runs a2)"` with the
  Co-Authored-By line.

---

### Task 6: Edges (inv 16) and part diagrams

**Files:**
- Modify: `src/document/bodies.ts`:
  - `bodyEdges` gains an optional 4th parameter `smoothPair?: (a: BodyFace, b: BodyFace) => boolean`. It is consulted for a
    stretch whose ONLY two wings are faces a and b; true means no edge there.
  - `curvedEdges` passes `(a, b) => a.curve !== undefined && a.curve === b.curve && (a.runout !== undefined || b.runout !== undefined)`.
    A run-out facet joins its neighbour run-out facet, and the band's arc faces at the stop plane, smoothly. A crease against an
    untagged face (the broad face, the side face) stays.
- Modify: `src/document/diagram.ts` and `src/panels/PartDiagram.tsx` (P16):
  - `DiagramCurveLine` gains optional `lo?: number; hi?: number` (along its `along` axis), drawn as a segment over [lo, hi];
  - `wasteOnFace` is used for a view only when the profile reaches that end face (a `through` end);
  - a stopped profile with no `through` end opens, if absent, the view of its SIDE face (`side.across`, `side.from`) and is
    noted there.
- Test: append to `src/document/runout.test.ts` and `src/document/diagram.test.ts`

- [ ] **Step 1: Write the failing tests.**
  1. **Edges (inv 16).** For the stopped roundover shelf:
     - no edge has both endpoints strictly inside the run-out's region (ρ < BEARING + 0.25, beyond a stop, t in (0, 0.25))
       unless it lies on a broad or side face. That is, no run-out facet lines.
     - The full-profile stretch draws no line along the run on the arc's interior (a1's suppression, now over [3, 27]).
     - For a COVE stopped 3..27, the crease where the cove meets the top face IS drawn: an edge with both ends on the top face
       plane and at s = 0.375 within 1e-6, over the band.
     - The four-edge cove set's `boardEdges` equals a1's. `profilesView` pins it too.
  2. **Diagrams.**
     - The stopped shelf's diagrams have no hatch in the length-face views.
     - The side (width max) view lists the roundover's note.
     - A stopped cove's sharp-vertex line in the side view runs from 3 to 27 (`lo`/`hi`).
     - The four-edge set's diagrams are unchanged.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** `smoothPair` is undefined for a part with no run-out, so `bodyEdges`' output is byte for byte a1's
  (`profilesView`).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Mutate.**
  1. Drop the `runout !== undefined` condition, so any two same-curve arc faces are smooth. Check that some a1 fixture changes:
     a hand-made two-arc curve with a sharp join, from `curves.test.ts` or `curvesWatertight`. If none fails, add a fixture where
     it would.
  2. Draw the hatch for a stopped end. The diagram test fails.
- [ ] **Step 6: Full suite, build, commit.** `git commit -m "profiles: stopped edges and diagrams (profile runs a2)"` with the
  Co-Authored-By line.

---

### Task 7: The Plans sheet (silhouettes, lifts, the ray oracle)

**Files:**
- Modify: `src/document/curveDrawing.ts`:
  - **`silhouetteLines`:** a spanned curve's band silhouettes run over `[lo, hi]` only. Today `onWood` runs over
    `[0, board[through]]`; clip it to the span before `onWood`.
  - **New `runoutSilhouettes(board, toward)`:** the facet-chain silhouette. For each edge of the bodies whose two wings are
    run-out faces (or a run-out face and a band arc face) of one curve, `smoothPair`'s pairs, and whose wings turn opposite ways
    to the view (`facing(n1·toward) * facing(n2·toward) < 0`, `EDGE_ON` counting as 0), emit `{ A, E, lift: liftOff([n1, n2], toward), curve }`.
    Each wing's normal is the face's own plane normal, and the lift is probed from the faces' outward normals (`silhouetteLines`'
    rule, inv 47). Clip to the wood is unnecessary: the edge is on the wood.
  - **`curveEdgeLifts`:** an edge that today gets `undefined` but lies on a run-out face takes the along-view lift of its most
    viewer-facing adjacent BODY face (the F1 rule, extended).
- Modify: `src/document/drawing.ts` `drawView`: concatenate `runoutSilhouettes` beside `silhouetteLines`, tagged
  `featureTag(b.id, 'curve', curve)`.
- Test: append to `src/document/profileDrawing.test.ts`

- [ ] **Step 1: Write the failing tests.**
  1. **The ray oracle (`mismatches`)** over the stopped roundover, cove, ogee and thumbnail, and the half-stopped roundover, in
     ISO, FRONT, SIDE and TOP. It must give `[]`. Extend `mismatches` to also sample each `runoutSilhouettes` segment's midpoint
     against the oracle. A silhouette must be visible where the oracle sees it.
  2. **No silhouette past a stop.**
     - In SIDE, the stopped roundover's band silhouette runs from 3 to 27 (its local run extent within 1e-6).
     - Nothing tagged with the curve is drawn hidden in the full-corner stretch beyond the run-outs (run < 3 − 0.5 or > 27 + 0.5).
  3. **A run-out outline in ISO.** At least one `runoutSilhouettes` segment exists for the stopped roundover in ISO.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** For a part with no run-out, `drawView`'s output is byte for byte a1's (`drawingIdentity.test`,
  `profilesView`).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Mutate.**
  1. Do not clip silhouettes to the span. The "past a stop" test fails.
  2. Drop the run-out lift. The oracle reports mismatches.
- [ ] **Step 6: Full suite, build, commit.** `git commit -m "drawing: stopped profiles on the Plans sheet (profile runs a2)"` with the
  Co-Authored-By line.

---

### Task 8: The Profiles row (Face, Side, Run, Start, Stop)

**Files:**
- Modify: `src/panels/Profiles.tsx` (P1's deferred change: the Edge select is replaced)
- Test: `src/panels/Profiles.test.tsx`

**Interfaces:** consumes everything above.

- **The row's controls, in order:**
  - **Face** (`Top` = thickness max, `Bottom`);
  - **Side** (`Width min side`, `Width max side`, `Length min end`, `Length max end`, the Chamfer row's words);
  - **Run** (`End to end`, `Stopped`);
  - when Stopped, **Start** and **Stop** (`DimensionField`s, measured from the run dimension's min end, labelled
    `Start (from the <dim> min end)` / `Stop (from the <dim> min end)`);
  - then today's Profile, size, Depth, Fillet/Quirk and Facing.
- **Writes.** Every write keeps the other fields:
  - a Face or Side change keeps the stations;
  - Run → Stopped seeds `start = min(3, L / 4)` and `stop = L − start`, written `from: 'min'`, ordered by `canonicalRun`;
  - Run → End to end drops the stations.
- **Refusals.** An edit is refused when it ADDS a fault: a `curveFaults` kind, a `profileFaults` kind (`stop-off`, `overlap`) or a
  hole fault (through `refusalFor`'s `after`).
  - The refusal text:
    - `stop-off` → `A stop runs off the part — move it first.`;
    - `overlap` → `Overlaps another profile on this edge — move it first.`.
  - A Start/Stop field returns its refusal (holes chunk 1 R7). A select shows it on the row.
  - A stored fault (a resize) is kept and noted (`… at this size.`), and the row can edit it back (Review Focus 2).
- **Greying (fu 388).** Every select greys a refused choice with its reason, judged on focus.

- [ ] **Step 1: Port and write tests first.**
  - Port the a1 row tests from the Edge select to Face + Side. The eight edges are Face × Side. The assertions on stored
    profiles and words keep their strength.
  - New tests:
    1. Run → Stopped seeds 3..(L−3) on a 30" shelf and the bench line reads `from 3" to 27" (stopped)`.
    2. Start 5 writes `at: 5`, ordered canonically.
    3. Stop 31 is refused with `A stop runs off the part — move it first.`, nothing stored.
    4. A second stopped profile overlapping the first is refused with the overlap text.
    5. Shrinking the part to 20" leaves the 27" stop noted (`A stop runs off the part at this size.`), and Stop 15 edits it back.
    6. Side change keeps the stations.
    7. Run → End to end drops them.
    8. Each refused option is greyed with its reason on focus.
    9. An End to end profile's row has no Start/Stop.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `attempt` builds the next STORED profile, fields plus run, passes `refusalFor` its `after`, and adds the profile-fault check.
  - Every label above is new UI text; no other string changes.
- [ ] **Step 4: Run** `npx vitest run src/panels` → PASS.
- [ ] **Step 5: Mutate.**
  1. Drop the `profileFaults` check. The overlap and stop-off refusals fail.
  2. A Side change resets the stations. The keep test fails.
- [ ] **Step 6: Full suite, build, commit.** `git commit -m "Profiles: Face, Side, Run, Start and Stop (profile runs a2)"` with the
  Co-Authored-By line.

---

### Task 9: Live pass, docs, merge

- [ ] **Step 1: Live pass** on the dev server with the Playwright MCP browser; leave the test projects in place. On a new project:
  1. A 30 × 10 × 3/4 shelf: add a Roundover, Run → Stopped (3..27). The bench line reads correctly.
  2. Iso viewport: the run-outs look smooth. Software GL: shading is for the user's eye on real hardware.
  3. Plans sheet: the key reads `Roundover 1/4", stopped`, and the silhouettes stop at the run-outs.
  4. Cut list: diagram notes, no end hatch.
  5. A cove on the bottom face, stopped; a Bead half-stopped.
  6. Resize the shelf to 20": the noted fault; edit it back.
  7. Metric: the Start/Stop fields and the bench line in mm.
  8. Undo each step.
  9. Open the "Edge profiles check" project: it is unchanged (a1 parts).
  Record DOM readouts and one screenshot if the viewport allows.
- [ ] **Step 2: Docs.**
  - `docs/browser-verification-profile-runs-a2.md`.
  - **CLAUDE.md:**
    - Status bullet, with a1 + a2 deployable together;
    - Rounds row;
    - Where things live: `runout.ts`, the `profiles.ts` additions, curves.ts `CurveSpan`/`ViewCurve`;
    - inv 16 (run-out facets suppressed by `smoothPair`);
    - inv 47 (span-clipped and facet-chain silhouettes; lifts);
    - inv 48/53 (`runout.ts`, THE run-out geometry; stopped profiles are spanned view curves);
    - inv 50 (run-out watertight);
    - the test count.
  - **`docs/follow-ups.md`:** close 391(1); 365 (stopped profiles shipped); a new entry for this round's residue, including
    P19's fine paths on run-outs.
  - **`docs/history.md`:** the round's section.
  - **The spec:** P19 added; the Status line.
- [ ] **Step 3: Merge** (no PRs). `git checkout master && git merge --no-ff profile-runs-a2`, then `npm test && npm run build`
  on the merged tree, then `git branch -d profile-runs-a2`. **Deploy only on the user's word.** a1 and a2 go out together
  (schema 18: export before any rollback below it).
