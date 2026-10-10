# Posture handedness and true sheet views — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every posture has the same handedness (on-edge's thickness axis reversed, schema 12 migration mirroring on-edge cuts so nothing moves on screen), and every cut-sheet view is a true view (vertical drawn upward on the three views that are mirrored today).

**Architecture:** One toggle in `axisFrame` (the ONE turn table, inv 44); one post-validation migration step `onEdgeToV12` in `migrateDocument` reusing `mirrorCutAlong`; one per-view flag `vUp` set in `buildDiagrams` and honoured by `PartDiagram`.

**Tech Stack:** TypeScript, React, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-10-sloyd-posture-handedness-design.md`

## Global Constraints

- `CURRENT_VERSION` 11 → **12**. The v12 step runs AFTER validation and AFTER `linksToShapes`, BEFORE `repairTree`, guarded by `d.version < 12`; it is NOT idempotent.
- Reverse **thickness** on **on-edge** only; flat and upright frames are byte-identical to today. No dimension moves to another world axis.
- Mirror with the existing `mirrorCutAlong(cut, 'thickness', thickness)` (inv 44: the one legitimate hand reflection; do not tidy it onto the geometry helpers).
- Sheet: views `thickness|min`, `width|max`, `length|min` get `vUp: true`; the other three `vUp: false`. Geometry (`h`/`v` spans, cells) stays in board inches; the drawing flips.
- Expected values in new or re-derived tests are derived BY HAND in a comment (or from a frozen copy of the OLD mapping inside the test) — never read back from the code under test.
- Mutation-test every new or re-derived test; record each mutation and its result in the task report.
- `npm test` does not typecheck — run `npm run build` too. Run vitest with `< /dev/null`.
- Branch `posture-handedness`; commits end `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; no merge, push or PR.

## Review Focus

1. A linked on-edge part (a Shape with two users, one turned 90°): mirrored ONCE (on the Shape), both users' world cuts unchanged; the cut list keeps them one row.
2. A v11 file loaded, saved (now v12), reloaded: no second mirror (the version guard), world cuts unchanged across both loads.
3. A pre-v8 file with an on-edge 90° part: v8's mirror (along length) then v12's (along thickness) — world cuts equal to what the pre-v8 build showed.
4. A joined on-edge design (tenons on an on-edge rail) after migration still passes `gateUnjoin` and Refine accepts it.
5. A flipped sheet view's leaders: the offset run is drawn from the BOTTOM edge (the view's min end) and a stopped cut's min/max stop labels sit at the matching ends; nothing is labelled from the wrong edge.

---

### Task 1: The turn table — on-edge thickness reversed

**Files:**
- Modify: `src/document/geometry.ts` (`axisFrame`, its doc comment)
- Test: `src/document/geometry.test.ts`, `src/document/turns.test.ts` (or wherever the turn-equivariance tests live)
- Re-derive: any test that fails because it hard-codes the on-edge frame (expected: `geometry.test.ts` "turn 0 is today's mapping, nothing reversed, for every posture"; `snapPoints.test.ts` ~171-195 posed on-edge board; `designCheck.test.ts` ~330-334 / 407-408 on-edge rail tenons; possibly grain/UV tests with on-edge + cuts)

**Interfaces:**
- Produces: `axisFrame(board)` with, for `posture === 'on-edge'`, the thickness entry's `reversed` toggled at every turn.

- [ ] **Step 1: Failing tests**

```ts
// geometry.test.ts
const dirOf = (b: Board, d: Dimension): [number, number, number] => {
  const v: [number, number, number] = [0, 0, 0];
  axisFrame(b).forEach((a, i) => { if (a.dim === d) v[i] = a.reversed ? -1 : 1; });
  return v;
};
const det3 = (a: number[], b: number[], c: number[]) =>
  a[0]! * (b[1]! * c[2]! - b[2]! * c[1]!) - a[1]! * (b[0]! * c[2]! - b[2]! * c[0]!) + a[2]! * (b[0]! * c[1]! - b[1]! * c[0]!);
it('every posture has ONE hand at every turn: (length, width, thickness) maps with determinant -1 (fu 215)', () => {
  for (const posture of ['flat', 'on-edge', 'upright'] as const) for (const rotation of [0, 90, 180, 270] as const) {
    const b = createBoard({ posture, rotation });
    expect(det3(dirOf(b, 'length'), dirOf(b, 'width'), dirOf(b, 'thickness'))).toBe(-1);
  }
});
it('turn 0: flat and upright unchanged and unreversed; on-edge reverses only thickness', () => {
  for (const posture of ['flat', 'upright'] as const) expect(axisFrame(createBoard({ posture, rotation: 0 })).every((a) => !a.reversed)).toBe(true);
  expect(axisFrame(createBoard({ posture: 'on-edge', rotation: 0 }))).toEqual([
    { dim: 'length', reversed: false }, { dim: 'width', reversed: false }, { dim: 'thickness', reversed: true },
  ]);
});
```

Replace the old "turn 0 is today's mapping, nothing reversed, for every posture" test with the second test above (it is the spec's new statement). Keep `axisDimensions` expectations (dimensions per axis do not change).

- [ ] **Step 2: Run** — `npx vitest run src/document/geometry.test.ts < /dev/null` → the two new tests FAIL (on-edge determinant +1; no reversal).

- [ ] **Step 3: Implement**

```ts
export function axisFrame(board: Board): [AxisMap, AxisMap, AxisMap] {
  const frame = turnFrame(board);
  // Follow-up 215: on-edge's turn-0 frame (L→X, W→Y, T→Z) was a proper rotation of the part's own
  // (length, width, thickness) basis while flat and upright were mirrors, so a posture change mirrored a
  // one-handed part. Reversing thickness gives every posture ONE hand. A quarter turn about Y carries
  // thickness's world direction with it, so toggling the flag at every turn equals turning the new turn 0.
  return board.posture === 'on-edge'
    ? frame.map((a) => (a.dim === 'thickness' ? { ...a, reversed: !a.reversed } : a)) as [AxisMap, AxisMap, AxisMap]
    : frame;
}

/** The turn table proper (quarter-turns spec §2), before the on-edge hand fix. */
function turnFrame(board: Board): [AxisMap, AxisMap, AxisMap] {
  const [h0, h1] = horizontalOf(board.posture);
  const y: AxisMap = { dim: UP[board.posture], reversed: false };
  switch (board.rotation) {
    case 90: return [{ dim: h1, reversed: false }, y, { dim: h0, reversed: true }];
    case 180: return [{ dim: h0, reversed: true }, y, { dim: h1, reversed: true }];
    case 270: return [{ dim: h1, reversed: true }, y, { dim: h0, reversed: false }];
    default: return [{ dim: h0, reversed: false }, y, { dim: h1, reversed: false }];
  }
}
```

Update `axisFrame`'s doc comment (the "Turn 0 is the pre-v8 mapping" statement now holds for flat and upright; on-edge's turn 0 reverses thickness, schema 12).

- [ ] **Step 4: Run the whole suite and list every failure** — `npm test < /dev/null`. Each failure is either (a) a test hard-coding the old on-edge frame — re-derive its expectation BY HAND under the new frame (comment the derivation) — or (b) a regression: STOP and report it. Expected (a): the posed on-edge snap-point board, the on-edge rail tenons in `designCheck.test.ts` (their stored cuts were written for the old frame: mirror their stored `from`/stops along thickness by hand so the world joints are unchanged, and say so), possibly grain/UV fixtures with on-edge cuts. The turn-equivariance tests (`turns.test.ts`, `frames.test.ts`, `pocket.test.ts`, loops over all postures) must pass unchanged — if one fails, that is (b).

- [ ] **Step 5: Mutate** — (a) toggle `width` instead of `thickness` → the turn-0 test fails (and determinant holds — say so); (b) toggle only at rotation 0 → the determinant test fails at 90/270; (c) remove the toggle → both fail. Record.

- [ ] **Step 6: Commit** — `feat(geometry): on-edge reverses thickness so every posture has one hand (fu 215)`.

---

### Task 2: The v11 → v12 migration

**Files:**
- Modify: `src/document/document.ts` (`CURRENT_VERSION` 12, the version history comment, new `onEdgeToV12`, its call in `migrateDocument`)
- Test: `src/document/document.test.ts`; `src/generate/joints/unjoin.test.ts` (one gate test)

**Interfaces:**
- Consumes: Task 1's `axisFrame`.
- Produces: `export function onEdgeToV12(doc: SloydDocument): SloydDocument` (exported for tests).

- [ ] **Step 1: Failing tests** (document.test.ts, new describe `v11 -> v12: on-edge cuts mirrored along thickness (fu 215)`). Build v11 RAW documents (`version: 11`) and run `migrateDocument`:

```ts
// The worked example the others follow. An on-edge part L 20, W 4, T 0.75 at the origin, turn 0, with a
// groove on its thickness MAX face, 1/4 deep, running the length, positioned on width [1, 1.5].
// OLD frame (v11): thickness -> +Z unreversed, so the max face is world z = 0.75 and the groove is
// world x [0, 20], y [1, 1.5], z [0.5, 0.75].
// NEW frame (v12): thickness -> Z REVERSED; the same world box needs the groove on the thickness MIN side:
// migrated cut = { face: 'thickness', from: 'min', ...unchanged }.
it('an on-edge groove keeps its world box: stored from max under v11, from min under v12', () => {
  const raw = v11Doc([{ id: 'p', name: 'P', posture: 'on-edge', rotation: 0, length: 20, width: 4, thickness: 0.75, position: [0, 0, 0],
    cuts: [{ id: 'c', face: 'thickness', from: 'max', across: 'length', offset: 1, width: 0.5, depth: 0.25, stopMin: 0, stopMax: 0 }] }]);
  const doc = migrateDocument(raw);
  expect(doc.version).toBe(12);
  expect(doc.boards[0]!.cuts[0]).toMatchObject({ face: 'thickness', from: 'min', offset: 1, width: 0.5, depth: 0.25 });
  // World box by hand (above), read through the NEW frame, axis by axis:
  const b = doc.boards[0] as Board;
  const r = cutRegion(b, b.cuts[0]!);
  const box = axisDimensions(b).map((dim, axis) => spanToWorldOffset(b, axis, r[dim]).map((x) => x + b.position[axis]!));
  expect(box).toEqual([[0, 20], [1, 1.5], [0.5, 0.75]]);
});
// Reuse this `worldBox(board, cut)` helper (cutRegion -> spanToWorldOffset per axis + position) for cases 2-8.
```

Write `v11Doc(boards, extra?)` as a small raw-document builder in the test. Cover, each with a hand-derived world box (or `worldSolids` of the migrated part compared to a hand-built box list):
1. the worked example above;
2. an on-edge part turned 90° with a cut positioned along thickness (offset/width on thickness mirror: `offset' = T − offset − width`);
3. an on-edge part inside a definition placed once (`definitions[].boards`);
4. a Shape (`shapes: [{ id: 's', posture: 'on-edge', length, width, thickness, material, grain, cuts: [...] }]`) with two shaped users, one turned 90° — the Shape's cuts mirrored ONCE; both users' world cuts as by hand (Review Focus 1);
5. flat and upright parts with the same cuts: byte-identical after migration;
6. idempotence of the LOAD path: `migrateDocument(JSON.parse(JSON.stringify(migrateDocument(raw))))` equals `migrateDocument(raw)` (the v12 guard) — Review Focus 2;
7. a pre-v8 file (`version: 7`) with an on-edge 90° part: assert the final stored cut equals mirroring along length (v8) THEN thickness (v12), derived by hand — Review Focus 3;
8. a below-v11 file with a `link` label on two on-edge parts: the Shape `linksToShapes` builds is mirrored once.

unjoin.test.ts: a joined design whose rail is on-edge, saved as v11 (build it by joining under the CURRENT code, then hand-convert its on-edge cuts back to v11 storage by mirroring along thickness, OR take an existing v11 fixture with an on-edge joined part if one exists), migrated, passes `gateUnjoin` (Review Focus 4).

- [ ] **Step 2: Run** → FAIL (version 11; cuts unmirrored).

- [ ] **Step 3: Implement**

```ts
/**
 * v11 -> v12 (follow-up 215): on-edge's frame now reverses thickness (axisFrame), so every posture has
 * one hand. An on-edge part's stored cuts are mirrored along thickness so its world solids are unchanged.
 * Runs AFTER validation and linksToShapes (posture, thickness and cuts are validated, and a file below
 * v11 has its Shapes by now) and BEFORE repairTree. NOT idempotent: the `d.version < 12` guard is all
 * that stops a v12 file being mirrored again on every load (as v8's).
 */
export function onEdgeToV12(doc: SloydDocument): SloydDocument {
  const mirror = <T extends { posture: Posture; thickness: number; cuts: Cut[] }>(b: T): T =>
    b.posture === 'on-edge' && b.cuts.length > 0
      ? { ...b, cuts: b.cuts.map((c) => mirrorCutAlong(c, 'thickness', b.thickness) as Cut) }
      : b;
  const part = (b: StoredBoard): StoredBoard => (isShaped(b) ? b : mirror(b));
  return {
    ...doc,
    boards: doc.boards.map(part),
    definitions: doc.definitions.map((d) => ({ ...d, boards: d.boards.map(part) })),
    shapes: doc.shapes.map(mirror),
  };
}
```

In `migrateDocument`, right after `if (legacy) doc = linksToShapes(doc, legacy);`:

```ts
  // v11 -> v12 (fu 215): after linksToShapes (a file below v11 gets its Shapes first), before repairTree.
  if (d.version < 12) doc = onEdgeToV12(doc);
```

Set `CURRENT_VERSION = 12` and add the v12 line to the version history comment. Use the existing `isShaped` (import from where it lives if `document.ts` does not have it; do not add a second definition).

- [ ] **Step 4: Run, then the full suite** — any existing test that loads a raw v11 on-edge fixture with cuts and asserts its stored cuts must now expect the mirrored storage: re-derive by hand. Tests asserting `version: 11` on output become 12.

- [ ] **Step 5: Mutate** — (a) drop the guard → test 6 fails; (b) mirror along width → test 1 fails; (c) skip `shapes` → test 4 fails; (d) skip definitions → test 3 fails; (e) run the step before `linksToShapes` → test 8 fails (or explain why it cannot, and pin it another way). Record.

- [ ] **Step 6: Commit** — `feat(document): schema 12 — on-edge cuts mirrored along thickness on load (fu 215)`.

---

### Task 3: True sheet views

**Files:**
- Modify: `src/document/diagram.ts` (`DiagramView.vUp`, set in `ensure`), `src/panels/PartDiagram.tsx` and/or `src/panels/diagramScale.ts` (vertical placement and column-leader order when `vUp`)
- Test: `src/document/diagram.test.ts`, `src/panels/PartDiagram.test.tsx`

**Interfaces:**
- Produces: `DiagramView.vUp: boolean` — true for `thickness|min`, `width|max`, `length|min`.

- [ ] **Step 1: Failing tests**

diagram.test.ts — the probe as a test (every view a TRUE view under Task 1's frame):

```ts
it('every view is a TRUE view of its face seen from outside, in every posture and turn (fu 215)', () => {
  // dirOf and det3: the same helpers as Task 1's geometry.test.ts (copy them, or export them from a test-only module).
  const dirOf = (b: Board, d: Dimension): [number, number, number] => {
    const v: [number, number, number] = [0, 0, 0];
    axisFrame(b).forEach((a, i) => { if (a.dim === d) v[i] = a.reversed ? -1 : 1; });
    return v;
  };
  for (const posture of ['flat', 'on-edge', 'upright'] as const) for (const rotation of [0, 90, 180, 270] as const)
    for (const face of ['thickness', 'width', 'length'] as const) for (const from of ['min', 'max'] as const) {
      const other = (['length', 'width', 'thickness'] as const).filter((x) => x !== face);
      const b = { ...createBoard({ length: 20, width: 6, thickness: 0.75, posture, rotation }),
        cuts: [{ id: 'c', face, from, across: other[0]!, offset: 0.1, width: 0.1, depth: 0.1, stopMin: 0, stopMax: 0 }] };
      const v = buildDiagrams(b, 16).find((x) => x.face === face && x.from === from)!;
      const right = dirOf(b, v.horizontal);
      const up = dirOf(b, v.vertical).map((x) => (v.vUp ? x : -x));       // page v grows DOWN unless vUp
      const toward = dirOf(b, face).map((x) => (from === 'max' ? x : -x)); // outward normal, toward the viewer
      expect(det3(right, up, toward)).toBe(1);
    }
});
it('vUp exactly on thickness|min, width|max, length|min', () => { /* build all six views, assert the flag */ });
```

PartDiagram.test.tsx — on a `vUp` view, a cut at the vertical MIN end (v span [0, 0.5] of V 6) is drawn at the BOTTOM of the outline (its rect's y + height equals the outline's bottom); its position leader's offset run starts at the bottom edge; a stopped cut's `stopMinLabel` sits at the bottom end and `stopMaxLabel` at the top. And the same cut on a `vUp: false` view draws at the top as today (existing tests stay green).

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement.** In `ensure`: `vUp: (face === 'thickness' && from === 'min') || (face === 'width' && from === 'max') || (face === 'length' && from === 'min')`, with a comment giving the reason (one hand in the model since v12; these three sides are the mirrored ones under page-down; derived in the fu 215 probe and pinned by the true-view test). In the panel: when `view.vUp`, map every vertical span `[a, b]` to `[V − b, V − a]` before `bandOn` (cells, cut bands, column leaders), and for column leaders swap `before`/`after` (a position leader's offset label becomes `after`, measured from the bottom edge; a stop leader's min label goes to the bottom end). Keep it in ONE place (a helper such as `drawnV(span)` / `orient(leader)`), not scattered. Inv 19: strings unchanged and measured as drawn.

- [ ] **Step 4: Run the panel and document suites** — existing diagram/panel snapshots that compare whole `DiagramView` objects gain `vUp`; update them (the value is part of the contract now).

- [ ] **Step 5: Mutate** — (a) `vUp` on the wrong three views → the true-view test fails; (b) flip spans but not leaders → the leader test fails; (c) flip leaders but not cells → name which test fails or add one. Record.

- [ ] **Step 6: Commit** — `feat(sheet): every face view is a true view (vertical up on three views) (fu 215)`.

---

### Task 4: Cut list, docs

**Files:**
- Test: `src/document/cutlist.test.ts`
- Modify: `src/document/cutlist.ts` (the `rowKey` comment), `docs/follow-ups.md` (215 closed), `docs/history.md`, `CLAUDE.md` (Status pending-deploy line with the schema-12 rollback note; rounds row; Versioning table v12 row and `CURRENT_VERSION` 12; invariant 44's turn-table statement; test count; the schema mention in the deployment rule), `docs/superpowers/specs/…` only if a fact changed during implementation.

- [ ] **Step 1: Test** — a flat part and an on-edge part (same L/W/T, material, grain) with the same stored stopped dado (one-handed: stopped at `stopMin` only) share one cut-list row AND are the same physical part: their world solids, each translated to its own min corner, are congruent by a proper rotation (compute both parts' removed-box sets in part-local coordinates via `cutRegion` and assert equal — the same stored cut now means the same physical cut because both frames have one hand; add a comment saying why this was false before v12).

- [ ] **Step 2: Docs** — `rowKey`'s comment: posture may be omitted because every posture has one hand since v12 (fu 215). fu 215: `**Status:** CLOSED 2026-10-10 by the posture-handedness round (schema 12): on-edge reverses thickness (axisFrame), v12 mirrors on-edge cuts so nothing moves; sheet views thickness/min, width/max, length/min draw vertical upward, so every view is true; the cut-list grouping is now correct.` History paragraph (the probe, the decisions, schema 12, what the reviews caught, test count delta). CLAUDE.md as listed above; the Versioning row: `| 11→12 \`onEdgeToV12\` | on-edge cuts mirrored along thickness | **after validation** | refuses the file (rollback strands projects saved since) |`.

- [ ] **Step 3: Full run and commit** — `npm test < /dev/null && npm run build < /dev/null`; `docs: posture handedness — fu 215 closed, schema 12 recorded`.

(The live browser check — an on-edge part with a stopped dado saved under v11 reloads unchanged under v12, and its six sheet views read true — is run by the controller on the dev server after the final review, not by an implementer.)
