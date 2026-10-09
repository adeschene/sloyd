# Sloyd — refine designs with joints (follow-up 238)

**Date:** 2026-10-09 · **Status:** approved 2026-10-09; amended while planning (RecordedJoint carries axis/side; `validChoice` strict; plain re-floored to the joined floor).
**Builds on:**
- **Refine** (`2026-10-09-sloyd-refine-design.md`): `documentToDesign`, `runRefine`, the change list,
  the dialog. Every rule there holds unless this document says otherwise.
- **Joinery** (`2026-10-04-sloyd-joinery-design.md`, follow-ups 182–206): `findSites`, `applyJoints`,
  the chooser, `runJoinery`, the write-back into the tree.
- **Invariants:** 36, 38, 40, 41, 44, 45, 46.
- **Evidence:** a throwaway spike (2026-10-09) built `unjoin` against joinery's own fixtures — 126
  joined designs (21 fixtures × up to 9 choice modes): **126/126 re-joined exactly**, 121/126
  recovered the original plain design exactly (the 5 others are the ambiguities in §3), 0 refused.
  Breaking the half-lap/rabbet inverses dropped it to 64/126, so the exact compare has teeth.

## 1. Problem and goal

**The problem.** Refine refuses any design with a cut, so a joined design cannot be refined: the
user must go back to the unjoined original (if they kept it), refine, and join again — and the
joints may come back different.

**Goal.** Refine a joined design and keep its joints wherever possible.

**Success.** Refine a joined chest with "make it 2in taller": one model call, every joint kept, the
cuts on untouched parts byte-identical. Refine it with "add a shelf": the shelf's new meetings get
joints from one small joinery call; nothing else changes.

**The user's rulings, made in conversation:**
- **Keep the joints where possible** (rejected: strip and re-join everything; strip with a warning).
- **Infer the joints from the joined design** (approach A), gated by an exact round trip, rather than
  recording them at joinery time (a schema bump, only future designs, records stale after hand
  edits).
- **New or no-longer-fitting meetings are chosen by the model**, one joinery call for those sites
  only, with joinery's defaults as its fallback; no call when nothing is open.
- **All five joint kinds**, after the spike measured them.

**Out of scope:** joints that are not joinery's (hand-made cuts are refused by the gate); keeping a
second joinery run's dados-before-rabbets result; changing how joinery chooses.

## 2. The flow

`runRefine` (in `src/generate/run.ts`) becomes:

1. **Plain input.** If the document has no cut, as today. Otherwise:
   1. `unjoin(flatDocument(doc))` (§3) → `{ plain: Board[]; joints: RecordedJoint[] }` or a refusal.
   2. **The gate** (§3.2): re-join `plain` with `joints`; it must reproduce the flat joined design
      exactly, or refuse.
   3. **Back into the tree:** `writeBackFlat(doc, flatDocument(doc).boards, plain)` then
      `migrateDocument`, as `runJoinery` writes its own result back (invariant 46). Copies that come
      out identical stay shared.
2. **Refine** the plain tree exactly as today (`documentToDesign`, the refine prompt, the shared
   evaluation, the change list against the ORIGINAL joined document — see §4). The model never sees
   joints.
3. **Re-join** (when the original had joints): `runJoinery(client, refinedPlain, signal, onProgress,
   { fixed })` with the recorded joints as fixed choices (§4).
4. **Result:** a new project as today, with the joints summary.

All refusals happen before any model call.

## 3. `unjoin`

`unjoin(flat: FlatDocument): { plain: Board[]; joints: RecordedJoint[] } | { refused: string }` in
**`src/generate/joints/unjoin.ts`** (beside the recipes it inverts; the gate needs `applyJoints`, so
it cannot live in `document/`). Pure. `plain` is in the same order as `flat.boards`, same ids and
names.

```ts
export interface RecordedJoint {
  enter: string;    // flat display name of the entering part
  receive: string;  // flat display name of the receiving part
  axis: 0 | 1 | 2; side: -1 | 1;       // the meeting, so two sites between one pair stay apart
  choice: Omit<JointChoice, 'site'>;   // joint kind + tenonLength / depth / stopAt / inset
}
```

Per kind, built from the spike's inverses:
- **Mortise-tenon, dado, stopped dado** (grow-only): the overlap with the receiver gives the pocket;
  the entering part is shortened back to the receiver's face; its waste cuts give the tenon length,
  or the stop end and inset; both parts' joint cuts are removed.
- **Half-lap:** the stack's layers are rebuilt from the notches (any listing order).
- **Rabbet:** the panel moves back out by its thickness and is untrimmed; parts it trimmed (fu 201)
  regain their length; its outer-face rider chain (fu 183) moves back with it.
- **Lowering** is not undone: re-joining lowers again. The plain design is re-floored only to match
  the joined design's floor (the spike's step; removing it still gave 126/126, kept so the plain
  design the model sees stands where the joined one does).

### 3.1 Ambiguities (stated, not fixed)

Two different originals can join to the identical document; `unjoin` picks one:
- a back flush with the sides' outer faces vs inset up to its rabbet: **assumed flush**;
- a shelf butting the back vs short of it by up to the back's trim: **assumed butting**;
- a gap ≤ `TOUCH` (1/32in) between two joined parts: **assumed closed**.

They matter only when the refine then changes those parts (the model sees the assumed size).
Untouched parts re-join exactly (the gate guarantees it).

### 3.2 The gate

`gateUnjoin(flat)`: `unjoin`, then map each recorded joint to `findSites(plainFlat)` by (enter name,
receive name), `applyJoints` with those choices, and compare to `flat` **exactly**: every part's
name, position, length/width/thickness, posture, rotation, material, grain, and every cut's
`CUT_GEOMETRY_FIELDS` (cut ids and part ids ignored). Any difference, any unmapped joint, or any cut
`unjoin` cannot attribute → refuse with:

`Refine cannot account for this design's joints — for example, joinery was run twice, or a joined part or cut was edited by hand.`

Known refusals: hand-added cuts; a project joined twice with dados before rabbets (no single run
produces it); a joined part resized by hand (unless it happens to round-trip).

The refusal replaces the current `cuts` refusal (refine spec §2) for designs with cuts; the other
refusals (turned, nested, too large) are judged on the PLAIN tree.

## 4. Re-joining

**`runJoinery` gains `opts.fixed?: ReadonlyMap<string, Omit<JointChoice, 'site'>>`**, keyed by
`jointKey(enter, receive, axis, side)` over flat display names:
- A site whose key is in `fixed` and whose fixed choice is **valid** for it takes that choice and is
  never sent to the model.
- **Valid** = the joint kind is in `site.allowed`, its numbers are inside `rangesOf(site, doc)`, and a
  stopped dado's `stopAt` is one of `site.stopEnds` — the same sources `parseChoices` validates the
  model's answers against. `validChoice(choice, site, doc)` sits beside `parseChoices` in
  `choose.ts`. It is STRICT where `parseChoices` clamps (amended while planning): clamping a kept
  joint would silently change its geometry, so an out-of-range recorded joint is re-chosen instead.
- A site whose key existed on the ORIGINAL plain design but has no recorded joint was left butt (or
  skipped) by joinery — butt leaves no cut, so nothing records it. It is a **fixed butt**: refining
  never re-opens a meeting the user already had joined as butt (amended after Task 3 found an
  unchanged refine turning a butt into a dado).
- The other sites (genuinely new — absent from the original plain design — or recorded but no longer
  valid) go to the ONE chooser call
  (`siteMessage` lists only them); its failure falls back to `defaultChoice` as today.
- **No open sites → no call.** `applyJoints` runs once over all sites with fixed + chosen choices.
- The repair loop is unchanged: only problems the JOINING introduced (invariant 41) drive repairs.
- Without `fixed`, `runJoinery` behaves exactly as today (its tests stay green unmodified).

**Counts** reported: `kept` (recorded, non-butt joints re-applied and actually applied), `chosen`
(open sites sent to the chooser, whatever it chose), `dropped` (recorded joints with no site on the
refined design), and joinery's own `skipped` with reasons.

**Change list.** `diffDesigns(originalJoined, refinedJoined)` — the user sees what changed between
the projects they will compare. Cut changes are not itemised (joinery's summary covers them); a part
whose only difference is its cuts produces no line.

**Issues.** "N new issues" = the refine's new problems (against the original plain design's raw
violations, refine spec §3.2) plus the joining's new problems (against the refined plain design,
invariant 41) — **excluding any named-part problem the ORIGINAL JOINED design already had**, which is
listed as already present and never drives a joinery repair (amended after the Task 3 review: the
user's refine ruling, applied to the second stage; part-less problems stay new).

## 5. The dialog

- A joined design no longer shows the cuts refusal; it shows the gate's refusal only when the gate
  fails.
- The cost estimate gains: `plus a joinery call if new meetings appear`.
- Status: `Refining…` → `Choosing joints…` (only when a joinery call is made; repairs as joinery's).
- Done: adds `<kept> joints kept · <chosen> chosen · <dropped> dropped`, and joinery's skipped
  reasons.

## 6. Testing

TDD; mutate every equality, ordering and boundary test.

- **`unjoin` / `gateUnjoin`:** the spike's fixture set as permanent tests — every kind, mixed
  designs (dados or tenons with a rabbeted back), the lowered drawer, a half-lap stack in all six
  listing orders, defaults and forced kinds: each re-joins exactly; each recovers the original
  except the §3.1 cases, which are asserted as their documented assumption. Mutate each inverse →
  the gate refuses.
- **Refusals:** a hand-added cut; dados-then-rabbets (two runs); a joined part resized by hand.
- **`validChoice`**: in range / out of range per size, disallowed kind, bad stopAt; `parseChoices`' tests unchanged and green.
- **`runJoinery` with `fixed`:** fixed valid sites never appear in the model's message; all fixed →
  zero calls; an invalid fixed choice is sent to the model; defaults fallback still works; without
  `fixed`, unchanged.
- **`runRefine` on a joined design** (fake client): "taller" with no new meeting → exactly one call,
  all joints kept, untouched parts' cuts identical; "add a shelf" → two calls, the joinery message
  lists only the new sites; a removed part's joints dropped; the gate refusal makes no call; a joined
  design with a shared drawer stays shared when the copies' joints are identical.

**Live check (dev server, the user watching, each paid run approved):** a joined chest or bookcase
refined with "2in taller" (expect one call, all joints kept) and with "add a shelf" (expect a small
joinery call); confirm in storage that untouched parts' cuts are identical; delete only the check's
projects.

## 7. Docs when it ships

Close fu 238; "Where things live" for `unjoin.ts` and the `fixed` option; a Rounds row and Status;
the history entry. No schema change.
