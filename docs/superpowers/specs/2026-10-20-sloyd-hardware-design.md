# Sloyd — hardware bill of materials

**Date:** 2026-10-20 · **Status:** APPROVED by the user 2026-10-20 (written spec, builder-checked; every §10 call and the builder-check settlements approved with it). **IMPLEMENTED 2026-10-21, MERGED as `98c7df4`, DEPLOYED 2026-10-21 as `index-BZhrLswD.js` (schema 20).** Written from fu 267 at the user's request ("skip the
questions, write it from fu 267"), so **every decision below is Claude's call** unless marked as the user's; §10 lists
them for review.
**Builds on:** the document schema and versioned load (`document.ts`, invariants 11, 33), the tree (`worldParts`,
`placementsOf`, `treeEdit.ts`, inv 46), shapes and links (`LINK_FIELDS`, inv 45), mirrored frames (inv 44), the cut list
(`cutlist.ts`), Buying (`purchase.ts`), the edge banding round's per-project types and prices (`bandTypes`, the Materials
& prices dialog's Edge banding section, Buying's Edge banding block). Every rule there still holds unless this document
says otherwise.

**Origin:** `docs/feature-gaps.md` §3, "Hardware / accessories BOM — screws, hinges, slides, pulls"; follow-up 267 (its
hardware half: "a hardware bill of materials, with fu 332's dowels"); follow-up 332 ("dowels as objects belong with the
hardware bill of materials"; the holes round's ruling: a dowel joint is two holes placed by hand).

## 1. Problem and goal

A piece is not finished when its wood is cut: a cabinet needs hinges, slides, pulls, shelf pins and screws; a frame-and-
panel door needs dowels or none. Sloyd lists every board to buy and prices it, then says nothing about the hardware —
the second trip to the store, or the order that has to go in a week before glue-up. The cut list sheet is the bench
document; it should carry the hardware list too, and Buying should count it and price it.

**Goal:** name the hardware a project uses (per project, with a pack size and a price), say how many of each a part or an
assembly takes, and get a hardware list on the cut list and a priced Hardware block in Buying, with counts that follow
copies of a part or an assembly automatically.

**Why counts sit on parts and assemblies, not in one project list:** the value over a note on paper is that the count
follows the model. A door takes 2 hinges and a pull; copy the door, mirror the pair, duplicate the cabinet — the list
is right without retyping. A list kept beside the model goes stale on the first copy.

**Non-goals (each a follow-up, §11):**
- **Hardware is not drawn**: no viewport object, no snap points, no Plans-sheet geometry. A hinge's cup bore is already a
  hole (the Hinge cup preset); the hinge itself is a line on a list.
- **Counts are not derived from holes.** A shelf-pin row of 10 holes takes 4 pins, not 10; a dowel joint is two holes
  for ONE dowel; a hinge cup is one hole for one hinge plus screws. No rule reads a count off holes correctly, so the user
  types the count. (Linking a hole row to the hardware it receives is a follow-up.)
- A browser-level library of hardware types shared across projects (as fu 399 for band types).
- Handedness (left/right hinges, left/right slides): two types, typed by the user, as today's names would be.
- Spares/overage allowances, hardware sizes as structured fields (a screw's gauge and length, a slide's length), unit
  conversion of hardware names, a hardware table on the Plans sheet.
- Generate, Refine or Repair WRITING hardware.

## 2. The data (schema 20)

### 2.1 Hardware types (document level)

```ts
interface HardwareType {
  id: string;                  // minted per document (`nextId`), the band types' id scope rule (inv 33)
  name: string;                // unique among hardware types; '›' cleaned as names are (inv 8)
  packSize: number;            // whole number >= 1; how many come in what is bought (1 = sold singly)
  pricePerPack: number | null; // US dollars per pack; null = unpriced (default)
}
SloydDocument.hardwareTypes: HardwareType[]   // default []
```

- **No built-in.** Band types keep `band-iron-on` because every banded panel needs a type to exist; hardware has no
  common default, so an empty project has no hardware types and shows none.
- **Free-text names carry the size**: `Euro hinge, 35 mm full overlay`, `Drawer slides, 18" full extension (pair)`,
  `#8 × 1-1/4" wood screw`, `Dowel 3/8" × 1-1/2"`. No units edge (inv 52): Sloyd never parses or converts them.
- **Unused types are KEPT** (the band-types precedent: there is no library to hold them).
- **Prices live in the document** (`pricePerPack`), not in `sloyd.shop.v1`: type ids are per document (the band types'
  argument, edge banding spec §2.1). Undo reverts a price with the project.
- **Dowels (fu 332)** are hardware types like any other, counted by hand on the part that carries the joint. fu 332
  closes on this round's ship; counting dowels from hole pairs is the hole-linking follow-up (§11).

### 2.2 Hardware entries (on parts, assemblies and the project)

```ts
interface HardwareUse { type: string; count: number }   // type = a HardwareType id; count a whole number 1..HARDWARE_COUNT_MAX
Board.hardware: HardwareUse[];       // also Shape.hardware; default []
Definition.hardware: HardwareUse[];  // an assembly's own hardware; default []
SloydDocument.hardware: HardwareUse[]; // the project's own (the root is an implicit definition, assemblies spec §2); default []
```

- **At most one entry per type per holder**, stored in canonical order (ascending `type` id, string order) so equal
  hardware compares equal. Entries carry no id (as bands).
- **What a count means:** a PART's count is per placed part; an ASSEMBLY's count is per placement of its definition;
  the PROJECT's count is once. So a cabinet assembly carrying `Drawer slides × 3`, placed twice, needs 6 pairs; a door
  part with `Euro hinge × 2` inside it needs 4 hinges.
- `HARDWARE_COUNT_MAX` = 999 (a refusal bound, DimensionField's rule: refuses, never clamps).
- **Links** (inv 45): `hardware` is a SHARED field in `LINK_FIELDS` (an array, excluded from the primitives check as
  `bands` and `profiles` are). Two shelves sharing a Shape take the same pins; an edit goes to the Shape
  (`applyWorldEdits`). `HARDWARE_FIELDS` (`type`, `count`), `satisfies` against `HardwareUse`, every field exact (inv 40);
  `sameShared` compares entries in order. Consequence: two parts that differ only in hardware do not link — `linkPlan`
  and `linkByRole` judge by `sameShared` and must not be loosened (inv 45). Generate never writes hardware, so its role
  links are unchanged.
- **Mirroring** (inv 44): hardware has no side or position; a mirror leaves it untouched. No `mirrorHardware`/`lower…`
  pair is needed — the plan confirms the mirror step copies the field through untouched (an equivariance test with a
  `chiralPart` fixture carrying hardware).
- **Reorient** (inv 2): `hardware` is absent from the reorient predicate (it moves nothing), so it has its own store
  actions.
- **The cut list does NOT group by hardware.** Hardware is not stock: two shelves alike in wood and different in
  hardware are one cut-list row (inv 18's "round what is bought" reading: the row describes what is cut). The row key
  is untouched; a hardware-free document's cut list is byte-for-byte as before.

### 2.3 Loading (step 19→20)

Document-level, no step function; on raw data before `validateBoard` (inv 11). **Order: materials → band types →
hardware types → parts, shapes and definitions → the project's `hardware` → `pruneMaterials`.**
1. `hardwareTypes`: a malformed entry is DROPPED — a non-string or empty name, `packSize` not a whole number >= 1, a
   `pricePerPack` present and neither `null` nor a finite number >= 0. An absent `pricePerPack` key loads `null` (the
   tape precedent). Duplicate ids: the first keeps its id, the later is re-minted (inv 33, `takeId`); duplicate names
   deduped (`uniqueName`, as band types).
2. Every holder (`Board`, `Shape`, `Definition`, the document): `hardware` absent → `[]`; a malformed entry (non-string
   type, a count not a whole number in 1..`HARDWARE_COUNT_MAX`) DROPPED; an entry naming no hardware type DROPPED; a
   second entry for one type DROPPED (first wins); sorted to canonical order.
- **Harm a build one version back would do:** silent loss — every hardware type and entry dropped, then autosaved. Hence
  the bump (a refusal gate, not an upgrade).
- **Rollback** below 20 refuses every project saved since — export first. `docs/versioning.md` gains the row.

## 3. The arithmetic — `document/hardware.ts`

ONE pure module, numbers only (no `units`), memoised per document object and deep-frozen. Every reader — the cut list's
Hardware section, Buying, Properties' copy notes, the dialog's `Used by` — reads it; nothing else counts hardware.

`hardwareTotals(doc) → { type: HardwareType; total: number; uses: { holder: string; each: number; times: number }[] }[]`
- **Parts:** for every part, counted once per placement (`holdersOf`'s own walk with `placementsOf`; its agreement with `worldParts` is pinned by the oracle test), each entry adds `count`.
- **Assemblies:** for every definition, each entry adds `count × placements(definition)` (`placementsOf`, world
  placements, so a nested assembly counts once per placement of every ancestor).
- **The project:** each entry adds `count`.
- **Hidden parts count** (inv 43: hidden-ness is view state). **Exploded** changes nothing.
- `uses` is for the cut list's where-used line: **one entry per STORED holder** (a stored part or Shape user in its
  container, a definition, the project), `each` its count, `times` its number of placements. *Amended (builder check):*
  flat names are unique per placement (`displayNames`, inv 8), so keying by flat name could never collapse copies; the
  holder is named by its FIRST placement's flat path name (`Base cabinet › Left door`), an assembly by its first
  instance's path name, the project as `Project`. No further collapse.
- Types with total 0 are omitted. Order: `doc.hardwareTypes` order.

`hardwareUsedBy(doc, typeId) → number` — the number of PLACED holders using a type (a part placed twice counts twice;
the band types' `Used by N parts` rule), for the dialog's delete refusal.

## 4. The cut list and Buying

### 4.1 The cut list's Hardware section

After the material groups, before Buying, shown only when `hardwareTotals` is non-empty; prints with the cut list.

```
Hardware
Euro hinge, 35 mm full overlay        8    Base cabinet › Left door: 2 × 2; Base cabinet › Right door: 2 × 2
Drawer slides, 18" (pair)             6    Base cabinet: 3 × 2
#8 × 1-1/4" wood screw              120    Base cabinet: 40 × 2; Project: 40
```

- One row per type: name, total, where-used. A use reads `<name>: <each>`, with `× <times>` appended when the holder is
  placed more than once; uses joined by `; ` (the builder may refine the words; the numbers must multiply out to the
  total on the row).
- Not numbered in the cut list's part series and carries no `boardIds` (the strip rows' rule: every reader of a row's
  parts handles an empty list; this is a separate section, so no cut-list row reader sees it at all — the plan confirms
  `planBalloons` and `rowNumbers` never read it).

### 4.2 Buying's Hardware block

After the Edge banding block, one line per type with a total:
- `packSize` 1: `Euro hinge, 35 mm full overlay: buy 8 · $36.00`.
- `packSize` > 1: packs rounded UP (`Math.ceil(total / packSize)`; what is bought is rounded, inv 18):
  `#8 × 1-1/4" wood screw: 120, buy 2 packs of 100 · $13.98`; one pack reads `buy 1 pack of 100`.
- Price = packs × `pricePerPack`; an unpriced type shows `no price` and is excluded from the total, as unpriced stock and
  tape are. The block's priced lines join the Buying total; the total keeps its words (`Estimated materials: …`).
- **The unpriced tail counts hardware types apart**, extending band wording's rule: `(2 materials, 1 band type and 3
  hardware items have no price)`; any one kind alone reads as today (`(1 hardware item has no price)`). The list joins as
  §4.1's band list rule (`a, b and c`).
- Metric (inv 52): unchanged words — counts and dollars carry no length.
- Printed: inside Buying's own page (fu 383).

## 5. Controls

### 5.1 Properties — the Hardware section

Shown for ONE selected part (`Properties`), ONE selected assembly (`InstanceProperties`), and — new — the empty state
when nothing is selected, where it reads as **Project hardware** under the existing `Select a part to edit it.` line.
  *Amended (builder check, Claude's call):* while an assembly is OPEN (`openPath`), the empty state edits the open
  assembly's own hardware instead, headed `<assembly name> hardware` (the open level is the container being worked in,
  and an open assembly cannot be selected from inside it).
- While the holder has no hardware: only `+ Add hardware ▾` (the pattern of `+ Add banding ▾`). Its items: every
  hardware type by name (a type the holder already has is listed greyed, `Already added`), then `New hardware type…`,
  which opens Materials & prices on a new Hardware row, its name focused (the `New solid edging…` precedent); saving it
  adds nothing — the user then adds it here.
- Once the holder has any: one row per entry — the type's name, a count field (a whole number 1..999; the existing
  `CountField` generalised with its bound and invalid-entry words as props, its hole defaults unchanged), `Remove`;
  then `+ Add hardware ▾`. Adding a type writes `count: 1` and focuses its count.
- Every add, count commit and remove is ONE undo entry (`edit()`), a part's on its Shape when shaped (`applyWorldEdits`),
  an assembly's on its Definition (the existing note `Shared by N copies: edits inside change all of them.` already says
  what that means).
- A part or assembly placed more than once shows `Counted once per copy: <n> in all.` under its rows.
- **Multi-selection** (`GroupProperties`) shows no Hardware section in this round (a follow-up: mixed counts across a
  selection are a design of their own).
- Locked while exploded (inv 47: inside `EditLock`; the empty-state section too).

### 5.2 Materials & prices — the Hardware section

After Edge banding. One row per hardware type: name, pack size (a whole number 1..10000), price per pack (the band
types' price field, `null` when emptied).
- `+ Add hardware type ▾` presets, each prefilling name and pack size, price `null`: `Hinge` (1), `Drawer slides
  (pair)` (1), `Pull` (1), `Knob` (1), `Screw` (100), `Shelf pin` (20), `Dowel` (50), `Other` (1). A preset's name
  is a starting point the user is expected to edit; a clash takes the band types' local free-name rule (`Hinge 2`).
- Delete refused while used: `Used by N — remove it from them first.` (placed holders, `hardwareUsedBy`).
- Every field refuses, never clamps; a name clash refuses only when one side's name was typed (the band types' amended
  rule).
- The dialog's ONE Save writes hardware types with the rest of the project edit — one undo entry.

## 6. Elsewhere

- **Ungroup** moves the dissolved assembly's own hardware to its parent container (the root's `doc.hardware` or the
  parent definition's), adding counts per type and merging into one entry per type, so every total is unchanged (inv 46:
  Ungroup is exact). The plan pins it: totals before = totals after, for a nested and a root-level ungroup. **Group**
  makes an assembly with no hardware; its parts keep theirs.
- **Duplicate, copy in a row, Copy mirrored, Make Unique**: hardware travels with what is copied (`copyBoard` copies the
  field; a definition copy copies its `hardware`). **Delete** removes a holder's hardware with it.
- **Add joinery and Repair ACCEPT hardware projects**: they edit cuts and sizes through the write-back's changed fields
  only (inv 46), so a part's hardware rides through untouched.
  *Amended (builder check, Claude's call):* the write-back does rebuild DEFINITIONS — `writeBackFlat` →
  `splitAssemblies` → `copyDefinition` (`treeEdit.ts`) splits a shared definition whose copies get different joints, and
  builds `{ id, boards, instances }` only. **`copyDefinition` copies `hardware`**, so a split-off copy carries its
  assembly's hardware and every total holds. Every other place that builds a `Definition` by hand is covered too (making
  `hardware` a REQUIRED field makes tsc list them): `repairTree` (`treeRepair.ts`, runs on every load — it must keep the
  field, or assembly hardware is stripped after validation), Make Unique (`treeOps.ts`, copies it), `generated.ts`
  (writes `[]`), Group (`treeOps.ts`, writes `[]`). The joinery/Repair test asserts **totals unchanged** and parts'
  entries byte-identical (a split changes definition ids, so the document as a whole cannot be byte-identical).
- **Link** (`linkPlan`) makes the linked parts take the first part's shared fields, so linking two parts with different
  hardware gives them the first part's — as it already does for holes, bands and profiles. *Claude's call:* accepted, no
  new refusal (the precedent); the Link UI's existing behaviour is unchanged.
- **Refine** refuses a project whose PARTS or ASSEMBLIES carry hardware (`hardwareRefusal`, after the banded refusal,
  naming the holders: `Refine doesn't handle hardware on parts yet (Left door, Drawer…). Refine before adding hardware,
  or remove it first.`): the refined design's parts are new, so their hardware cannot be mapped. Hardware TYPES and the
  PROJECT's hardware are carried into the refined project (nothing in them names a part), as custom materials are,
  before `migrateDocument` — at both places Refine re-attaches materials (`generate/run.ts`), and the refusal at both
  Refine gates (`refineDesign.ts`'s `documentToDesign`, `generate/refine.ts`).
- **Generate** never writes hardware; `DESIGN_SCHEMA` is byte-identical (fu 322).
- **Design checks, snap, tape, gizmo, section, drawings, nesting**: unchanged.
- **Export/import, autosave**: the document carries `hardwareTypes` and `hardware` like any field.

**Wiring notes for the plan** (builder check): the cut list and `buildPurchase` take a `FlatDocument`, whose
`definitions` is empty, so `hardwareTotals` takes the full stored document (the caller passes both); the Materials
dialog today receives only the placed parts (`App.tsx`), so it also needs the document for `hardwareUsedBy`.

## 7. Chunks

**One chunk**, deployable alone: schema 20 (types, entries, load, links, id scope), `hardware.ts`, the cut list's
Hardware section, Buying's Hardware block and tail, Properties' Hardware section (part, assembly, project), the
dialog's Hardware section, Ungroup's move, `hardwareRefusal` in Refine. There is no viewport or drawing work, which is
what made banding two chunks.

## 8. Testing

- `hardware.test.ts`: totals for a part, a shaped part, an assembly placed twice, a nested assembly, the project, hidden
  parts; `uses` collapse; `hardwareUsedBy`. **Mutate** each rule (drop the placement multiplier, count a definition once,
  skip hidden parts) — the tests must fail.
- Load: defaults; malformed types and entries dropped; dangling and duplicate entries dropped (first wins); canonical
  sort; duplicate type ids (first kept); name dedupe; absent `pricePerPack` → `null`; a 19 document loads with no
  hardware; a 20 document refused by a 19 build is the existing newer-version path.
- Links: two shelves with the same hardware share; differing hardware does not link; a Shape's hardware edited once.
- Mirroring: a `chiralPart` with hardware, every mirror, hardware untouched, lower∘place = identity.
- Ungroup: totals unchanged (root parent, definition parent, merging into an existing entry).
- Joinery/Repair: hardware byte-identical across a run on a fixture with hardware on a part, a shape and an assembly.
- Refine: refused with parts' hardware; types and project hardware carried.
- Cut list and Buying: the section and block text; packs rounding up (exactly divisible, one over); unpriced excluded
  and counted in the tail in every combination; a hardware-free document's cut list and Buying byte-identical (hash the
  existing fixtures, the `bandFreeIdentity` precedent).
- Properties and the dialog: one undo entry per action; delete refused while used; count refusals; locked when exploded.
- Live pass on the dev server (Playwright): a two-door cabinet with hinges and pulls, a drawer assembly copied three
  times with slides, a shelf set with pins on a shared Shape, project screws; the printed cut list (a real Chromium PDF).

## 9. Docs to update on ship

`CLAUDE.md` (Status, rollback table, the Versioning row, the Where-things-live row `hardware.ts`, a condensed invariant if
the plan writes one — likely: *`hardware.ts` is the ONE place hardware is counted; hardware never groups the cut list*),
`docs/invariants.md`, `docs/versioning.md`, `docs/module-map.md`, `docs/rounds.md`, `docs/follow-ups.md` (267's hardware
half closed, 332 closed, the §11 follow-ups opened), `docs/feature-gaps.md` (the Hardware row; and the stale Edge banding
and Edge profiles rows).

## 10. Open for the user's review

**Every decision here is Claude's call** (the user asked for the spec without questions). The ones that most change what
gets built, first:
1. **Counts sit on parts, assemblies and the project**, and multiply by copies (§1, §2.2) — rather than one hand-kept
   project list.
2. **Counts are typed, never derived from holes** (§1): shelf-pin rows, dowel pairs and hinge cups do not count hardware.
3. **`hardware` is a SHARED field**: parts sharing a Shape share hardware, and two parts differing only in hardware do not
   link (§2.2).
4. **Hardware never splits a cut-list row** (§2.2).
5. **Project hardware is edited in Properties' empty state** (§5.1).
6. **No built-in hardware type; presets in the dialog** with the pack sizes listed (§5.2).
7. **Prices per pack in the document**, packs rounded up in Buying, unpriced left out of the total (§2.1, §4.2).
8. **Joinery and Repair accept hardware projects; Refine refuses hardware on parts** but carries types and project
   hardware (§6).
9. **Ungroup moves an assembly's hardware to its parent** rather than refusing (§6).
10. **No Hardware section for a multi-selection** this round (§5.1).
11. **Schema 20** — rollback below it refuses every project saved since (§2.3).

Settled after the builder check (Claude's calls): a split-off assembly copy keeps its hardware (`copyDefinition`), so
joinery and Repair still accept; where-used names a stored holder by its first placement with `× copies`; the empty
state edits the OPEN assembly's hardware when one is open; Link gives linked parts the first part's hardware, as for
every other shared field.

## 11. Follow-ups this round leaves

- Linking a hole row to the hardware it receives (counts from holes where a rule exists: dowel pairs, hinge cups).
- A browser library of hardware types across projects (with fu 399's band types).
- Hardware on the Plans sheet (a table, or keyed balloons).
- Hardware for a multi-selection (mixed counts).
- Handedness and structured sizes, if real projects need them.

## Amended (planning)

**APPROVED by the user 2026-10-20 (P1, P2).**
- **P1 — Ungroup is REFUSED when a merged count would exceed `HARDWARE_COUNT_MAX` (999).** §6 merges the dissolved assembly's
  hardware into its parent's by adding counts; a sum above the loader's bound would be DROPPED on the next load (silent loss).
  `ungroupItem` returns null for it, like its other refusals. Reachable only with counts in the hundreds.
- **P2 — `hardwareRefusal` takes the STORED document**, not the flat one: `flatDocument` empties `definitions`, so an assembly's
  hardware is invisible from it.

## Amended (implementation)

**For the user's review (2026-10-21).**
- **A live crash and its fix (`c9d5c08`).** Selecting a SHAPED part crashed the app (`The result of getSnapshot should be cached`,
  `Maximum update depth exceeded`): `holderHardware` read the part through `resolveBoard`, which copies `hardware` per call, and
  Properties' selector returned that fresh array every time. `holderHardware` now returns the STORED array for every target
  (the Shape's for a shaped part) and a frozen empty one when there is none. Unit tests had not rendered the section for a shaped
  part; identity tests and a shaped-part render test now do (both RED on the old code). Invariant 55 records the rule.
- **Four dialog refusal words the spec does not fix (§5.2 fixes only the `Used by` words), chosen by the implementer:**
  `Give the hardware type a name.`, `Another hardware type is called "X".`, `Pack size must be a whole number from 1 to 10000.`,
  `Price must be dollars or empty.`
- **The count field's refusal:** `Enter a whole number, 1 to 999` (the shared `CountField` generalised from Holes' count).
- **Wording left for the user's eye (follow-ups 410–412):** Ungroup refused for overflow is silent; the link note does not
  mention hardware; `Counted once per copy: <n> in all.` sums different types.
