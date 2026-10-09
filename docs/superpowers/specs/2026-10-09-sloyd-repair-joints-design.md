# Sloyd — repair doubled joints (follow-up 240)

**Date:** 2026-10-09 · **Status:** draft for review.
**Builds on:**
- **Refine joined** (`2026-10-09-sloyd-refine-joined-design.md`): `unjoin`, `gateUnjoin`,
  `GATE_TOLERANCE`, `sameJoined`. Every rule there holds unless this document says otherwise.
- **Joinery** (`2026-10-04-sloyd-joinery-design.md`): `findSites`, `applyJoints`, the write-back.
- **The bug and its fix:** commit `a899b51` (applyJoints cloned the flat board list as a whole, so
  twin placements of one definition shared one `cuts` array).
- **Invariants:** 32, 36, 40, 41, 45, 46.

## 1. Problem and goal

**The problem (fu 240).** Before `a899b51`, joinery on a design with a shared assembly (one
definition placed two or more times) pushed every joint's cuts into ONE array shared by all
copies of a part. After write-back each copy carries the joint cuts of every copy:
- a joint every copy has appears **twice** (a duplicated mortise, dado or waste strip);
- a joint only one copy has appears in the others as a **phantom** — a pocket nothing enters, or
  waste cuts on a part that was never lengthened.

Affected: projects joined between the assemblies deploy (2026-10-06) and the refine-joined deploy
(2026-10-09) that have shared assemblies. Linked parts (Shapes) were never affected: `resolveBoard`
copies cuts. Refine's gate refuses such projects with a message that blames a hand edit.

**Goal.** A "Repair joints" action that removes exactly the bug's stray cuts, proves the result is
what today's joinery would produce, and saves it as a new project. No model call.

**The user's rulings, made in conversation:**
- **A repair action** (rejected: a warning only; load-time de-duplication plus a warning).
- **Prune and prove** (approach A; rejected: re-emitting the re-joined design, whose numbers drift;
  stripping and re-joining with the model, which may choose different joints).
- **No real affected projects exist;** fixtures are recreated with the buggy code.

**Out of scope:** a banner at load or a cut-list warning; re-merging copies that become identical;
projects damaged in any other way (refused).

## 2. `repairJoints`

`repairJoints(flat: FlatDocument): null | { boards: Board[]; dropped: number } | { refused: string }`
in **`src/generate/joints/repair.ts`**, beside `unjoin.ts`. Pure; no model call. `boards` is in
`flat.boards`' order, same ids and names.

**Twins.** Two flat parts are twins when the LAST segment of their occurrence ids is equal
(`copyA/leg1`, `copyB/leg1`) AND their own names are equal (the flat display name's last
`NAME_SEPARATOR` segment). This survives a write-back that split the definition (Make Unique and
`splitAssemblies` keep ids). Part ids are unique only per container, so the name condition guards
against unrelated parts sharing an id.

**Cut equality** throughout: every field of `CUT_GEOMETRY_KEYS` (invariant 40), numbers within
`GATE_TOLERANCE`, non-numeric fields exactly. Twins at different placements or turns compute their
own pockets from their own world positions, so an exact compare would miss last-bit differences.

**Steps:**
1. **Pre-check.** No twin group has a cut → `null`.
2. **De-duplicate.** On every part that has a twin, drop each cut equal to an EARLIER cut on the
   same part (first kept). This must precede step 3: a duplicated pocket fails `unjoin`'s
   one-pocket rule, and a duplicated waste strip turns a stopped dado into a mortise-tenon.
3. **Lenient read-back.** `unjoin`'s body becomes an internal reader that returns
   `{ plain, joints, unexplained }`, where `unexplained` lists `(part index, cut index)` pairs it
   could not attribute. `unjoin` keeps its exact behaviour (refuse when `unexplained` is non-empty);
   Refine is unaffected.
4. **Twin strays only.** Every unexplained cut must equal (part-local) a cut that the reader DID
   explain on a twin of the same part. Any other unexplained cut → refuse.
5. **Prune and reorder.** Remove the duplicates and strays. Re-join `plain` with `joints` exactly as
   `gateUnjoin` does; reorder each part's surviving cuts to that re-join's order, matching by cut
   equality, keeping the STORED cut objects (values and ids). Nothing else changes: positions,
   sizes, ids and surviving cut values are the stored ones (the refine round's "keep exact values"
   ruling; a re-emitted number could split a cut-list row, invariant 18). A surviving cut with no
   match in the re-join → refuse.
6. **Prove.** The repaired flat document must pass `gateUnjoin` unchanged. Otherwise refuse.
7. Steps 2 and 4 removed nothing → `null`.

`dropped` = cuts removed in steps 2 and 4, counted per flat part (a stray shared by two flat copies
of one stored part counts twice; the count is what the user would see on the cut list).

**Write-back:** `migrateDocument(writeBackFlat(doc, flat.boards, repaired))` (invariant 46).
Copies that come out identical stay shared; copies that now differ split (a copy that had a joint
the other lacked). `writeBackFlat` does not re-merge assemblies split earlier.

**Refusal text:** `Sloyd can't repair this project's joints automatically — re-run Add joinery from the unjoined original.`

A repaired project passes Refine's gate (step 6), so Refine works on it afterwards.

## 3. The dialogs

**Detection** runs only when the Refine or Joinery dialog opens, once per document (memoised like
`refineInfo`): when `plainForRefine` refuses for joints, `repairJoints(flatDocument(doc))` runs.
Never at load, never per edit.

**Repair note**, in both dialogs whenever `repairJoints` returns a repair:

> This project's joints were doubled by a bug fixed on 2026-10-09: some parts carry duplicate cuts, or a mortise from another copy of their assembly. **[Repair joints]**

- **Refine:** the note REPLACES the gate's refusal message (which blames a hand edit). Run stays
  disabled, as for any refusal.
- **Joinery:** the note sits above Run, plus `Running joinery again on this project would add to the damage — repair it first.`
  A warning, not a block: joinery does not refuse cut designs today and this round does not change
  that.
- **A refused repair:** Refine shows the repair's refusal text in place of the gate's message;
  Joinery shows it as its warning. No button.

**The action** (`onRepair` in `App.tsx`):
1. Repairs the CURRENT document (`useStore.getState().doc`) and writes back as §2.
2. `storage.createProject(repaired, { activate: false })` (invariant 36), named
   `<name> — repaired`. A repaired project is no longer damaged, so the button cannot appear on it
   and the suffix cannot compound (unlike fu 237).
3. The dialog shows `Saved "<name> — repaired" — <N> stray cuts removed.` with **[Open]**, which
   goes through the existing `openProject` (invariant 32). The original is untouched.
4. When the write-back split an assembly: `Copies of <assembly> no longer match, so they are no longer shared.`
   (one line per split definition, by its first placement's name).
5. The new id joins `newIds`, as Refine's results do.
6. A failed write shows the storage error as the other create paths do.

No key is needed and there is no cost line; the button works without an API key.

## 4. Testing

TDD; mutate every equality, ordering and refusal test.

**Fixtures from the buggy code.** In a scratch worktree at `4a340f7` (the last deploy before the
fix), a throwaway test builds plain designs with shared assemblies, runs THAT commit's
`applyJoints` with fixed choices, writes back with `writeBackFlat`, and saves JSON:
`{ plain, choices, damaged }` (choices keyed by `jointKey` so today's `findSites` can rebuild them).
Committed under `src/generate/joints/fixtures/` with a README naming the commit and the script
(the script itself is kept beside the fixtures, not run by `npm test`). The worktree is deleted.

1. Two shared frames joined by mortise-tenon — duplicates only.
2. A shelf meeting only one copy — phantom pockets in the other copy, definition still shared.
3. A copy placed at a 90° turn — last-bit differences between twins.
4. Dados, a stopped dado and a rabbeted back inside a shared assembly — every kind.
5. An entering part entering in only one copy — stray waste cuts on the un-lengthened twin; the
   definition was split by the original write-back.
6. A nested shared assembly (a copy inside a copy).

**`repairJoints`:**
- **Independent oracle:** each repaired fixture equals today's `applyJoints` over the saved plain
  input and choices (numbers within `GATE_TOLERANCE`, cuts in order).
- **Subtractive:** each repaired part equals its damaged part except cuts; every surviving cut is a
  stored cut object's values and id, unchanged.
- `gateUnjoin` passes on every repaired result; `dropped` is exact per fixture.
- **Write-back:** fixtures 1, 3, 4, 6 stay shared where the oracle's copies are identical; 2 splits.
- **`null`:** a plain design; a design joined with TODAY's joinery including a shared assembly; a
  joined design with no twins.
- **Refuses:** a damaged fixture plus a hand-added cut; a design joined twice (dados, then
  rabbets); a damaged fixture with a joined part resized by hand.
- **Mutations:** no de-duplication → the oracle fails; accept any unexplained cut → the hand-cut
  refusal fails; no reorder → the gate test fails; exact cut equality → fixture 3 fails; no
  name condition → a test with two unrelated same-id parts fails.
- `unjoin`'s and `gateUnjoin`'s existing tests stay green unmodified.

**UI:** Refine shows the note in place of the gate message; Joinery shows the warning; a refused
repair shows its text; `onRepair` calls `createProject` with `activate: false`, then the done line
and Open; the split line for fixture 2; the button works without a key.

**Live check (dev server, no paid runs):** import fixture 2 into the dev profile, open Refine,
confirm the note, click Repair joints; confirm in storage that the new project lacks the phantom
and that Refine's gate passes on it; delete only the check's projects.

## 5. Docs when it ships

Close fu 240; "Where things live" for `repair.ts` and the fixtures; a Rounds row and Status; the
history entry. No schema change.
