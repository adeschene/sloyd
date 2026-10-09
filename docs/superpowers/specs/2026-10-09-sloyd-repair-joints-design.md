# Sloyd — repair doubled joints (follow-up 240)

**Date:** 2026-10-09 · **Status:** approved 2026-10-09; amended while planning, from fixtures made
with the buggy code (§1 damage shape, §2 evidence rule, §3 wording, §4 fixtures 3 and 5).
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
- a joint only one copy has appears in the others as a **phantom** — a pocket nothing enters.

*Measured while planning:* only RECEIVING parts' pockets were doubled. The entering part's waste
cuts were never aliased (a lengthened part got its own cuts array), so no copy carries another's
tenon shoulders.

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
   explain on a twin of the same part, AND be empty: no other part's solid (`worldSolids`,
   invariant 38) overlaps its world box by more than `TOUCH` on every axis — a phantom is a pocket
   nothing enters (amended while planning: without this, a joined part SHORTENED by hand leaves its
   own pocket unexplained, its twin's identical pocket explained, and the repair would delete a
   pocket the part still fills; measured during execution, a LENGTHENED one is refused by step 5's
   re-join match instead). Any other unexplained cut → refuse.
5. **Prune and reorder.** Remove the duplicates and strays. Re-join `plain` with `joints` exactly as
   `gateUnjoin` does; reorder each part's surviving cuts to that re-join's order, matching by cut
   equality, keeping the STORED cut objects (values and ids). Nothing else changes: positions,
   sizes, ids and surviving cut values are the stored ones (the refine round's "keep exact values"
   ruling; a re-emitted number could split a cut-list row, invariant 18). A surviving cut with no
   match in the re-join → refuse.
6. **Prove.** The repaired flat document must pass `gateUnjoin` unchanged. Otherwise refuse.
7. **Evidence first** (amended while planning): steps 4–6 apply only when step 2 removed a cut or
   step 4 found at least one twin stray. With neither, return `null` even if other cuts are
   unexplained: that design was not damaged by this bug (a joined design with a hand-added cut is
   Refine's gate refusal, not a repair refusal), and the dialogs say nothing about repair.

`dropped` = cuts removed in steps 2 and 4, counted per flat part (a stray shared by two flat copies
of one stored part counts twice; the count is what the user would see on the cut list).

**Write-back:** `migrateDocument(writeBackFlat(doc, flat.boards, repaired))` (invariant 46).
Copies that come out identical stay shared; copies that now differ split (a copy that had a joint
the other lacked). `writeBackFlat` does not re-merge assemblies split earlier.

**Refusal text:** `Sloyd can't repair this project's joints automatically — re-run Add joinery from the unjoined original.`

A repaired project passes Refine's gate (step 6), so Refine works on it afterwards.

## 3. The dialogs

**Detection** runs only when the Refine or Joinery dialog opens, once per document (memoised like
`refineInfo`). Refine: when `plainForRefine` refuses for joints, the repair runs. Joinery: the repair
runs directly (its pre-check and evidence rule make it `null` for every undamaged design). Never at
load, never per edit.

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
3. The dialog shows `Saved as '<name> — repaired' — <N> stray cuts removed.` (the other dialogs'
   quoting) with **[Open]**, which
   goes through the existing `openProject` (invariant 32). The original is untouched.
4. When the write-back split an assembly: `<A> and <B> no longer match, so they are no longer shared.`
   — one line per split definition, naming its placements by display path (`A, B and C` for three);
   definitions have no name of their own (amended while planning).
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

1. Two shared frames joined by mortise-tenon — duplicates only. `dropped` 2.
2. A stretcher entering only the Front copy's leg — a phantom mortise in the Back leg, definition
   still shared. `dropped` 3.
3. Two shared METRIC frames (values restored by hand after `designToDocument`'s 1/16in snap) at
   off-grid spots, the second turned 90° — the twins' pockets differ in the last bit, so an exact
   compare keeps both; the buggy write-back had already split the definition (on last-bit rail
   differences) yet each copy still carries both mortises. `dropped` 2.
4. Dados, a stopped dado and a rabbeted back inside a shared case — every kind. `dropped` 12.
5. A shared rail entering a loose post in one copy only — joined by the buggy code yet UNDAMAGED
   (waste cuts were never aliased): `repairJoints` returns `null`.
6. A shared bench (two shared frames inside) placed twice — four copies through two levels.
   `dropped` 12.

Measured: every damaged fixture's stored cut order already matches the re-join after pruning, so
the reorder (§2 step 5) is pinned by a synthetic input: a damaged fixture with one part's stored
cuts reversed.

**`repairJoints`:**
- **Independent oracle:** each repaired fixture equals today's `applyJoints` over the saved plain
  input and choices (numbers within `GATE_TOLERANCE`, cuts in order).
- **Subtractive:** each repaired part equals its damaged part except cuts; every surviving cut is a
  stored cut object's values and id, unchanged.
- `gateUnjoin` passes on every repaired result; `dropped` is exact per fixture.
- **Write-back:** fixtures 1, 4 and 6 keep their definitions shared; 2 splits (its copies now
  differ); 3 stays split as it was stored.
- **`null`:** a plain design; fixture 5; a design joined with TODAY's joinery including a shared
  assembly; the same with a hand-added cut (evidence rule); an unrelated part sharing a twin's id
  but not its name, carrying a copy of the twin's mortise (name condition).
- **Refuses:** a damaged fixture plus a hand-added cut; a damaged fixture whose phantom is moved
  1/16in (a near-miss is not a twin stray — the tolerance has teeth); a damaged fixture with a
  joined part resized by hand; a damaged fixture with a part placed inside its phantom (occupied,
  so not a stray). (A design "joined twice" cannot be built from these fixtures: measured,
  `findSites` finds no site left on them.)
- **Mutations:** no de-duplication → the oracle fails (a doubled pocket hides its joint from the
  reader); accept any unexplained cut → the hand-cut refusal fails; no reorder → the reversed-cuts
  test fails; exact cut equality everywhere → fixture 3 fails; no name condition → the
  same-id test fails; drop the evidence rule → the today's-joinery-plus-hand-cut test fails; drop
  the emptiness condition → the occupied-phantom test fails.
- `unjoin`'s and `gateUnjoin`'s existing tests stay green unmodified.

**UI:** Refine shows the note in place of the gate message; Joinery shows the warning; a refused
repair shows its text; `onRepair` calls `createProject` with `activate: false`, then the done line
and Open; the split line for fixture 2; the button works without a key; Joinery shows nothing for
an undamaged design.

**Live check (dev server, no paid runs):** import fixture 2 into the dev profile, open Refine,
confirm the note, click Repair joints; confirm in storage that the new project lacks the phantom
and that Refine's gate passes on it; delete only the check's projects.

## 5. Docs when it ships

Close fu 240; "Where things live" for `repair.ts` and the fixtures; a Rounds row and Status; the
history entry. No schema change.
