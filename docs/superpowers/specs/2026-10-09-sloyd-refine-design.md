# Sloyd — refine by instruction (follow-up 179)

**Date:** 2026-10-09 · **Status:** approved 2026-10-09; amended while planning (§4 keeping parts in place replaces the offset realignment; final review: limits judged on the result, exact values kept, definitions normalised, detail headroom).
**Builds on:**
- **Generate** (`2026-10-03-sloyd-generate-design.md`) and **generate assemblies**
  (`2026-10-09-sloyd-generate-assemblies-design.md`): the schema, `designToDocument`, the checks,
  `collapseViolations`, role linking, the repair loop.
- **Joinery** (`2026-10-04-sloyd-joinery-design.md`): the new-project result, `useJoinery`'s shape,
  and "blamed only for what it caused" (invariant 41).
- **Invariants:** 8, 18, 19, 25, 27, 33, 36, 37, 39, 41, 45, 46; the `→ units` edge rule; the
  "SYSTEM_PROMPT is a fixed prefix" rule.
- **Precedence:** every rule in those documents still holds unless this one says otherwise.

## 1. Problem and goal

**The problem.** A generated prototype is close but not right ("shelves 2in lower", "thicker
legs", "a fourth drawer"). Today the only paths are hand-editing every affected part or generating
again from scratch and losing what was good.

**Goal.** Type a change request against the open prototype and get a revised prototype back,
checked like any generated design, with a list of exactly what changed.

**Success.** Generate a small table. Refine it with "make the legs 2in longer and add a lower
shelf". A new project "<name> — refined" appears unopened; the legs are 2in longer, a shelf is
added, every other part sits exactly where it was, and the change list says precisely that.

**The user's rulings, made in conversation:**
- **Scope: fresh prototypes only** (designs without joints). Refining joined or hand-made designs
  with cuts is a later round. A design with a cut is refused before any call.
- **The result is a new project**, never the open one (invariant 36).
- **Approach A plus a change list:** the model receives the whole current design in Generate's
  format and returns the whole revised design, which goes through the existing path. Rejected:
  (B) an edit-operation list (a second format and converter; consistent multi-part changes become
  long fragile lists); (C) snapping near-unchanged parts back (the tolerance is a guess and could
  undo a small requested change). Drift is shown, not hidden.
- **Refuse what the format cannot express:** a turned assembly, a nested assembly.
- **Dialog:** instruction, optional size limits, detail preselected; **one result per run**.
- **Only problems the refine introduced drive repairs**; problems already present are listed
  separately.

**Out of scope:** designs with cuts; variants; replace in place; editing the instruction mid-run;
nested or turned assemblies.

## 2. From the open design to the model's format

`documentToDesign(doc): { design: GeneratedDesign } | { refused: RefineRefusal }`, new in
`src/document/refineDesign.ts` (the inverse of `designToDocument`; imports `document` only).

**Refusals**, checked in this order on the document alone, before any call:

| Reason | Condition | Message |
|---|---|---|
| `empty` | no parts anywhere | `There is nothing to refine yet.` |
| `cuts` | any stored part or shape has a cut | `Refine works on prototypes without joints. Refine first, then add joinery.` |
| `turned` | any instance with `rotation !== 0` | `Refine cannot keep a turned assembly. Turn it back to 0°, or ungroup it.` |
| `nested` | any definition with instances | `Refine cannot keep an assembly inside another assembly. Ungroup the inner one.` |
| `too-large` | distinct parts > 60 or placed parts > 240 | `` `This design has ${n} distinct parts; Refine handles up to 60.` `` (or the placed form: `` `${n} placed parts; Refine handles up to 240.` ``) |

**The conversion** (no refusal):
- Each root part (resolved through its shape) → a loose `GeneratedPart`: `name`, `material`,
  `at` = its `position` (min corner), `size` = its world extents (`boardExtents`).
- Each definition → one `GeneratedAssembly`: its parts as local boxes (position and extents,
  unturned), and one placement per instance (`name`, `at` = the instance origin). Its `name` is the
  first placement's name (a Definition has no name; matching never depends on it, §4).
- `role`: parts using a shape get `linked-<k>`, one `k` per shape in first-appearance order; other
  parts get `""`.
- Values are passed as stored (exact).

## 3. The run and the prompt

**`runRefine(client, doc, settings, signal, onProgress)`** in `src/generate/run.ts`:
1. `documentToDesign(doc)`; a refusal returns `{ refused }` with **no call**.
2. `preexisting = checkDesign(flatDocument(doc), limits)` — raw (uncollapsed) violations of the
   original, named by flat display names.
3. `runRepairLoop` with `SYSTEM_PROMPT`, `DESIGN_SCHEMA` and `first = refineMessage(design,
   settings)`. Its `evaluate` is the **shared** design evaluation (§3.1) with two refine-only
   steps: no horizontal re-centring and grain carry-over (§4), and the already-present filter (§3.2).
4. Copies the original's document-level settings onto the result: `stock` (kerf), `units`,
   `guides`.
5. Returns `{ doc, violations, preexisting: Violation[], changes: Change[], usage }`.

`RefineSettings = { instruction: string; width: number | null; depth: number | null; height:
number | null; detail: Detail }`. `limitsOf`/the cap rules are Generate's.

### 3.1 One evaluation step for Generate and Refine

`runGeneration`'s `evaluate` body (parse → `designToDocument` → flatten → zero-board guard →
`distinctPartsViolation` → `checkDesign` → `collapseViolations`) moves into one function used by
both runs, so they cannot drift. Generate's existing tests must stay green unchanged.

### 3.2 Already-present problems (the user's ruling; invariant 41's rule)

A refined design's RAW violation is **already present** when `problemKey` (kind + sorted part
names, never message text) matches one in `preexisting`; flat display names are the identity. The
remaining raw violations are collapsed (`collapseViolations`) and are the run's `violations`: they
alone count toward "fewest" and go back as repair feedback. The already-present ones are collapsed
separately for display. A renamed part's old problem reads as new — honest, since a rename is
drift. The filter applies to `checkDesign`'s raw violations that NAME parts; part-less violations
(`too-large`, `too-many-parts`, `tips`) and rejected-part and distinct-cap violations are always new,
so a size limit typed in the dialog is judged on the result (the user's ruling after the final
review: kind alone matched every overrun to any other).

### 3.3 The prompt

`SYSTEM_PROMPT` is **unchanged** (byte-identical to Generate's; one cached prefix). The refine
user turn, from `refineMessage(design, settings)`:

```
Here is the current design, in the same format you return:
<design JSON>

Change it as follows: <instruction>

Keep every part you are not asked to change exactly as it is: the same name, role, material, size
and position. Keep assembly and placement names. Return the whole design.

Hard limits:
<the same limit lines userMessage produces>
```

The hard-limit lines come from one helper shared with `userMessage` (Generate's literal test stays
byte-identical).

**Cost estimate** (`refineEstimateUsd(client, doc, settings)`): input = `SYSTEM_PROMPT` + the user
turn, at 4 characters per token; output = the design JSON's length / 4 × 1.25; no cache.

## 4. The result: keeping parts in place, grain, the change list

**Identity is the flat display name** (`Placement › Part` or the loose name) throughout this
section.

**Keeping parts in place (amended while planning).** The model is given the original's own
coordinates and asked to keep untouched parts as they are, so Refine converts with
`designToDocument(design, { centre: false })`: the horizontal re-centring is skipped and only the
floor rule stays (the lowest part lands on y = 0, by a multiple of 1/16in). Untouched parts then sit
exactly where they were. **Exact values are kept (the user's ruling after the final review):** a
returned value equal to one of the original's own values is not snapped, so a part typed off the
1/16in grid and left untouched does not move. **Definitions are normalised:** `documentToDesign`
translates each definition so its local minimum corner is (0, 0, 0), adding the offset to its
placements' origins (exact), because Group stores parts in world coordinates with the origin at 0
and the prompt tells the model an assembly's minimum corner is the origin. *Replaced:* the approved "most common offset" realignment, which would undo
a real whole-design move — remove the toe kick and the model correctly lowers the case, but every
part's offset is then −4in, and realigning by it would lift the case back into the air.

**Grain carry-over.** The model never sees grain. Before conversion, each part of the returned
design whose flat name matches an original part takes that part's `grain` (an assembly part takes
the grain of its first matching placement's part); others get `'length'`. `GeneratedPart` gains an
optional TS-only `grain` (not in the schema, like `role`'s optional typing); `convertPart` uses it
only when it is a valid `Grain`. This runs before role linking, so `sameShared` judges the real
values.

**The change list.** `diffDesigns(before: SloydDocument, after: SloydDocument): Change[]` in
`src/document/designDiff.ts`, on flat parts by display name:
- `added` / `removed` — a part or a placement (a placement whose instance name appears on one side
  only; its parts are not listed separately).
- `resized` — the old and new sizes (sorted extents, as the cut list reads them).
- `moved` — a placement is compared by its WORLD minimum corner (origin plus its definition's local
  minimum), so re-originating an assembly is invisible; a part inside a placement is compared
  relative to that corner; a loose part by its world position. A line whose before and after text
  read the same (display rounding) is dropped, and a zero delta is never printed.
- `material` — old and new.
- `linked` / `unlinked` — a part that gained or lost a shared shape.
- Identical changes to the same definition part across placements merge into one entry with
  `copies: N` (shown "(×N)").
- A rename is a `removed` plus an `added`.
- Entries are ordered: placements first, then parts, each in the refined design's world order.

Each `Change` carries a display `text` assembled in `designDiff.ts` with `formatLength` (the
`→ units` edge: it produces a string a person reads; invariant 19's rule that the measured and
drawn string are built in one module). The dialog shows the first 12 and "and N more".

## 5. The dialog and the hook

**`useRefine`** (beside `App.tsx`, like `useJoinery`): one run, owned by App; statuses `designing |
repairing | retrying | ready | failed | cancelled`; writes ONLY via `createProject({ ...doc, name },
{ activate: false })` with `name = "<original name> — refined"`; a cancel landing after the model
answers writes nothing; `reset` clears a finished run when the dialog opens.

**`RefineDialog.tsx`**, opened by a toolbar **"Refine…"** button beside "Add joinery…":
- Refused: the refusal message only; Refine disabled.
- Otherwise: **Instruction** (textarea), Max width / depth / height (blank = no limit), **Detail**
  preselected to the smallest level whose cap ≥ the design's distinct parts + 3 (headroom to add
  parts — the user's ruling after the final review) and whose ceiling ≥ its placed parts (labels as
  Generate's), the cost estimate, **Refine** (disabled while the
  instruction is blank, while storage is unavailable, or with no key — same rules as joinery).
- Running: the status line, Cancel.
- Done: `Saved as '<name> — refined'`; `N new issues · M already present` and the new issues'
  messages; the change list; the cost; **Open** (through App's `openProject`).
- `modalOpen` covers it (invariant 27); `.app-shell` is inert behind it as for every modal.

## 6. Testing

TDD; mutate every equality, ordering and boundary test.

- **`documentToDesign`:** each refusal, in order, with no call; a round trip
  (`designToDocument(documentToDesign(doc))`) reproduces the original's flat parts (names, sizes,
  materials) and definitions/placements, up to one translation; `linked-<k>` per shape; values
  exact.
- **Keeping parts in place:** with `centre: false`, a design widened on one side keeps every
  untouched part's position exactly; the floor rule still applies; Generate's default still centres.
- **Grain:** a matched part keeps its grain; an added part gets `'length'`; an invalid injected
  grain is ignored; carry-over precedes linking (two legs with the original's equal grains link).
- **`diffDesigns`:** each change kind; a placement move reported once; `copies` merging; a rename
  as removed + added; ordering; `formatLength` strings.
- **Already-present filter:** a problem the original had is not counted and not sent; a new one
  is; matching by kind + names, not message text (mutate the key to message text → red).
- **`runRefine`** (fake client): refusal makes no call; the user turn carries the design JSON,
  the instruction, the keep line and the limits; `SYSTEM_PROMPT` identical to Generate's; "fewest"
  counts only new problems.
- **Shared evaluation:** Generate's tests unchanged and green.
- **`useRefine`:** never adopts; the name; cancel after the answer writes nothing.
- **`RefineDialog`:** refusal shown and Refine disabled; detail preselection; change list cap.

**Live check (dev server, Playwright, the user watching; each paid run approved):** a fresh small
prototype refined with "make the legs 2in longer and add a lower shelf". Confirm the new unopened
project, untouched parts exactly in place, the change list against the stored documents, links
kept or broken correctly, and a joined project refused before any call. Delete only the projects
the check created.

## 7. Docs when it ships

Close fu 179 in `docs/follow-ups.md`; a Rounds row and Status in CLAUDE.md; "Where things live"
entries for `refineDesign.ts`, `designDiff.ts`, `useRefine.ts`, `RefineDialog.tsx`; the history
entry. No schema change.
