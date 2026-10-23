# Mirrored links (fu 432) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A linked part can use its Shape as its mirror image; edits reach both sides each in its own hand; Generate/Refine
link mirror twins; a person can make one with a Mirrored checkbox.

**Architecture:** One OWN field, `mirrored?: true`, on a SHAPED stored part (schema 21). `resolveBoard` applies it (features
mirrored along `mirrorDim` by the existing flag flips), so everything downstream sees an ordinary Board. Writers lower through
it with the existing exact `lower…` inverses. `linkByRole`, `linksToShapes`, Link/Unlink and joinery's `regroupShapes` learn
to carry it.

**Tech Stack:** React/TS, Zustand, Vitest. Branch `mirrored-links`.

**Spec:** `docs/superpowers/specs/2026-10-23-sloyd-mirrored-links-design.md` (approved 2026-10-23; §1.1 is the user's choice).

## Global Constraints

- `mirrored` is stored ONLY as `true` and ONLY on a shaped part; `LINK_FIELDS.mirrored = 'own'`. A plain part never carries it
  (loader drops it; `plainOf` strips it). A document with no mirrored part is byte for byte as before.
- Meaning: the part is its Shape with cuts, angle cuts, hole rows, curves, profiles and bands mirrored along `mirrorDim` of the
  resolved board (`mirrorCut`, `mirrorAngleCut`, `mirrorHoleRow`, `mirrorCurveCut`, `mirrorProfile`, `mirrorBands`), then its
  own `rotation`/`position` as for any part. Sizes, posture, material, grain, cornerRule, hardware unchanged.
- "Mirror in place" (the checkbox, mirror candidates): flip the flag AND `rotation := inverseTurn(rotation)`; position unchanged
  (M_x R(r) = R(−r) M_d0; the box is unchanged).
- `CURRENT_VERSION` 20 → 21; v20→v21 step adds nothing; refuse-newer text unchanged.
- The SIDE of a mirror for lowering, posture refusal and `sameSideFirst` = container-chain parity XOR the part's own flag.
  `linkPlan`'s `LINK_ACROSS_MIRROR` stays on ASSEMBLY parity alone (unchanged words).
- Candidate order in `linkByRole`: the part, its turns, then mirror-in-place, then its turns. The unturned mirror candidate is
  allowed for curves/carried profiles; turned ones are refused as turns are.
- Joinery's regroup keeps each user's flag and groups users by the signature of their fields LOWERED through their own flag
  (so mirror images group; the spec's "first user's hand" is met by the kept flags). Users no longer mirror images split.
- Equivariance tests use chiral fixtures (`chiralPart`, `chiralCurved`, `chiralTwoSide`), never a symmetric one (inv 44).
- No pull requests; merge `--no-ff` to master; ask before deploying. ≤ 10 paid runs.

## Review Focus

1. **A hand-made mirrored case side at 90°**: Link left + right, tick Mirrored on the right → pins inside, edging FRONT on both.
   Pinned in Task 3 (store test on a 90°-stored upright side with a hole row on one broad face and a band on the front).
2. **A shared edit through the mirrored user, repeated**: move the pin row on the right side three times; the left follows,
   mirrored, and the Shape's numbers never drift. Pinned in Task 2.
3. **Add joinery on a case with a mirrored side pair**: the link survives; cutting only one side splits it. Pinned in Task 5.
4. **Unlink, Make Unique, Ungroup through a mirrored assembly**: nothing moves, no plain part carries the flag. Pinned in Task 3.
5. **A v20 build**: a 21 file is refused (version gate); a mirror-free document saves as before. Pinned in Task 1.

---

### Task 1: The field, the loader and `resolveBoard` (schema 21)

**Files:** `src/document/types.ts`, `links.ts`, `shapes.ts`, `frames.ts`, `document.ts`, tests beside them;
`docs/versioning.md`.

**Interfaces — Produces:**
- `Board.mirrored?: true` (own; JSDoc: "a shaped part only: its Shape reflected along mirrorDim; spec §3").
- `frames.ts`: `mirrorFeatures(b: Board): Board` — `b` with the six feature arrays mirrored along `mirrorDim(b)`, nothing else
  changed; `mirrorInPlace(b: Board): Board` — `mirrorFeatures` plus `rotation: inverseTurn(b.rotation)`.
- `resolveBoard`: a mirrored user returns `{ ...mirrorFeatures(shapeResolved), mirrored: true }`.
- `plainOf` drops `mirrored`.

- [ ] **Step 1: Failing tests** — `shapes.test.ts`: a `chiralPart` Shape with a mirrored user resolves to exactly
  `mirrorFeatures` of the unmirrored user (`toEqual`), with `mirrored: true`; `plainOf` of it has no `mirrored` key.
  `frames.test.ts`: `boardExtents(mirrorInPlace(b))` equals `boardExtents(b)` for every posture × turn; world bodies of
  `mirrorInPlace(b)` equal `mirrorPart`'s reflected about the box centre (compare `worldParts` boxes and hole centres).
  `document.test.ts`: a v21 shaped part with `mirrored: true` loads with it; `mirrored: false`/`1` dropped; `mirrored` on a
  plain part dropped; a v20 file loads unchanged; a v22 file refused; `mirrorFree` identity: the schema-20 fixtures re-save
  byte-identical apart from `version`.
- [ ] **Step 2:** run, see them fail. **Step 3:** implement; `LINK_FIELDS.mirrored = 'own'` (tsc forces it); loader reads the
  flag in `validateBoard`'s shaped branch; `CURRENT_VERSION = 21` and the empty v20→v21 step; `docs/versioning.md` row (the
  harm: a 20 build draws the mirrored side unmirrored, silently). **Step 4:** focused tests, full `npm test`, `npm run build`.
- [ ] **Step 5: Commit** `feat(mirrored-links): a shaped part may be its Shape's mirror image (schema 21; spec §3)`.

### Task 2: Writing edits back through a part's own mirror

**Files:** `src/document/treeEdit.ts`, `tree.ts`, `store/store.ts` (side callers only), tests.

**Interfaces — Consumes:** Task 1. **Produces:** `tree.ts`: `sideAt(doc, occ): boolean` = `mirroredAt(doc, occ) !==
(stored part's mirrored === true)`. `lowerEdit` lowers `cur` through the part's own flag after the chain (the existing
`lowerCuts`/`lowerAngleCuts`/`lowerHoles`/`lowerCurves`/`lowerProfiles`/`lowerBands`, comparing against the SHAPE's arrays,
not `resolved`'s), so a shared write lands in the Shape's hand.

- [ ] **Step 1: Failing tests** (`treeEdit.test.ts` / `store` tests): through a mirrored user, edit a hole row's offset, a
  band side, a profile run, an angle cut, a curve, a rectangular cut: the Shape holds the edit reflected and the unmirrored
  user shows it reflected; three successive edits leave no drift (`toBe` on the stored numbers vs. a single direct edit);
  a mirrored user inside a mirrored assembly lowers as unmirrored (parities cancel); `postureRefusal` refuses a d0-moving
  posture change on a Shape with a mirrored and an unmirrored user (`POSTURE_ACROSS_MIRROR`); `sameSideFirst` orders by
  `sideAt`. Mutate: drop the own-flag lowering and see the drift/reflection tests fail.
- [ ] **Step 2–4:** fail, implement (`postureRefusal`, `sameSideFirst`, the store's `sideOfShape` read `sideAt`; `linkPlan`'s
  `mirroredOf` stays `mirroredAt`), pass; full suite; build. **Step 5:** commit
  `feat(mirrored-links): edits lower through a part's own mirror (spec §4)`.

### Task 3: The Mirrored checkbox, badge, Link, Unlink and copies

**Files:** `src/store/store.ts`, `src/panels/Properties.tsx`, `src/panels/PartsList.tsx`, `src/document/tree.ts` (TreeRow),
`src/document/treeOps.ts` if Make Unique/Ungroup touch the flag, tests (`store.*.test.ts`, `Properties.test.tsx`,
`PartsList.test.tsx`).

**Interfaces — Consumes:** Tasks 1–2. **Produces:** store action `mirrorLinkedPart(path: string, mirrored: boolean): void`
(refused when exploded or the part is not shaped; a no-op when unchanged; one undo entry; writes `mirrorInPlace` on the
stored part's own fields: flag + inverted rotation, position kept). `TreeRow.mirrored` set for a mirrored part row too.

- [ ] **Step 1: Failing tests:**
  - Review Focus 1: an upright case side stored at 90° with a hole row on one broad face and a front band, linked to a copy;
    `mirrorLinkedPart(right)` → the right's world hole face is the opposite world X face, its band still on world +z; box
    unchanged; undo restores exactly. Same at 0°, 180°, 270°.
  - Properties: a linked part shows a "Mirrored" checkbox under Turn; an unlinked part does not; toggling calls the action.
  - PartsList: the mirrored part row shows `role="img"` "Mirrored" beside its link badge.
  - Link (spec §5.2): linking a plain part to a MIRRORED source makes it a mirrored user (it looks like the source); the Shape
    is the source lowered through its own flag; an existing mirrored member keeps its flag; a third plain part joins an
    existing mirrored link (no refusal); across a mirrored ASSEMBLY the old refusal holds.
  - Review Focus 4: Unlink of a mirrored user stores its resolved board, no `mirrored` key, world unchanged; the remaining
    one-user Shape dissolves likewise; Duplicate/Copy in a row keep the flag; Make Unique keeps it on a still-shaped part;
    Ungroup through a mirrored assembly leaves no plain part with the flag.
- [ ] **Step 2–4:** fail, implement, pass; full suite; build. **Step 5:** commit
  `feat(mirrored-links): the Mirrored checkbox, badge, Link and Unlink (spec §5.2)`.

### Task 4: Generate and Refine link mirror twins

**Files:** `src/document/roleLinks.ts`, `src/document/linksToShapes.ts`, tests (`roleLinks.test.ts`, `linksToShapes.test.ts`,
`refineDesign.test.ts`).

**Interfaces — Consumes:** Task 1 (`mirrorInPlace`). **Produces:** `mirrorCandidates(b: Board): Board[]` in roleLinks.ts —
`[mirrorInPlace(b) re-stored, …its turns]` each carrying `mirrored: true` (the unturned one by flag flips only; turned ones
re-stored through world forms as `turnCandidates` does, `[]` for curves/carried profiles except the unturned one).
`linkByRole` tries them after turns. `linksToShapes` writes `mirrored: true` on a shaped record whose candidate carried it; a
candidate left in a class of one is replaced by the ORIGINAL part (never stored).

- [ ] **Step 1: Failing tests:** the case-sides fixture (two upright sides, pins on inside faces, edging on +z) links as one
  Shape with one mirrored user, world parts identical to the input (`toEqual` on world features); a symmetric pair links
  UNMIRRORED (mutate: move mirror candidates before turns, see it fail); a turned twin still links as a turn; a curved
  mirror pair (chiralCurved) links by the unturned mirror; a lone part with no twin is stored exactly as input, no flag;
  Refine round trip of a mirrored-link project keeps the link and flag (`designToDocument` → `linkByRole`).
- [ ] **Step 2–4:** fail, implement, pass; full suite; build. **Step 5:** commit
  `feat(mirrored-links): Generate and Refine link mirror twins (spec §5.1)`.

### Task 5: Joinery keeps mirrored links

**Files:** `src/document/treeEdit.ts` (`plainWithMarkers`, `regroupShapes`), tests (`treeEdit.test.ts` and a joinery test
under `src/generate/joints/`).

**Interfaces — Consumes:** Tasks 1–2. **Produces:** `plainWithMarkers` keeps `mirrored` on the marked plain part;
`regroupShapes` groups by `groupSignature(member.mirrored ? mirrorFeatures(member) : member)`, builds the Shape from the first
member's LOWERED fields, and writes each record with its flag.

- [ ] **Step 1: Failing tests:** Review Focus 3 — a case with a mirrored side pair, joinery adds dados to both sides: one
  Shape, the flag kept, world parts equal to joinery's output; joinery cuts only one side: two shapes / plain parts, worlds
  equal to joinery's output, no plain part with the flag; an unmirrored link's regroup unchanged (existing tests pass).
  Mutate: group by the raw signature and see the first test fail.
- [ ] **Step 2–4:** fail, implement, pass; full suite; build. **Step 5:** commit
  `feat(mirrored-links): joinery keeps a mirrored link (spec §6.2)`.

### Task 6: Cut list pin, records, merge, live check, deploy

**Files:** `src/document/cutlist.test.ts`; `docs/invariants.md` + `CLAUDE.md` (invs 44, 45, 46; versioning line; schema 21 in
Status/rollback), `docs/module-map.md`, `docs/versioning.md`, `docs/follow-ups.md` (fu 432 closed; out-of-scope §8 items as one
record-only entry), `docs/rounds.md`, the mirrored-instances spec's pointer to §1.1,
`docs/browser-verification-mirrored-links.md`.

- [ ] **Step 1:** cut-list test: a one-handed mirrored pair is two rows; a symmetric mirrored pair one row of 2.
- [ ] **Step 2:** records; full `npm test`, `npm run build`.
- [ ] **Step 3:** merge `--no-ff`, verify, delete the branch.
- [ ] **Step 4: Live (dev, Playwright):** a hand-made mirrored case (Link + tick Mirrored on a 90° right side): pins inside,
  edging front; move the right side's pin row, the left follows mirrored; Unlink; undo. One paid Generate "a plywood bookcase
  with adjustable shelves and oak edging": the sides stored as one Shape with one mirrored user.
- [ ] **Step 5:** ASK before deploying (schema 21: rollback past it refuses projects saved at 21 — export first).
