# Sloyd — weight

**Date:** 2026-10-28 · **Status:** approved by the user 2026-10-28 (option A, §2); plan `docs/superpowers/plans/2026-10-28-sloyd-weight.md`.

**Origin:** `docs/feature-gaps.md` §3, "Weight" ("OpenCutList reports cost and weight together"). The user picked it
2026-10-28 and asked for the spec without the brainstorm questions, so every choice below not marked *the user's* is
Claude's call, listed in §11 for checking.

## 1. Intent

A woodworker wants to know roughly what a piece weighs: can one person carry the top, will the wall cleat hold the
cabinet, what does it cost to ship. Sloyd already knows every part's wood exactly (its convex bodies) and its material;
what it lacks is a density per material and a place to print the result.

**Goals**

- Every material has a density: the seven built-ins carry a fixed one; a custom material may carry one.
- The cut list prints each group's weight and the project's total, in pounds or kilograms by the project's units.
- Properties prints the weight of the selection (one part, several, an assembly).
- The weight is of the wood the MODEL keeps — after every cut, angle cut, curve, profile, tenon and dovetail — not of
  the stock bought.

**Non-goals (v1)**

- Hardware weight (types carry no weight; a follow-up).
- Moisture content, finish, glue.
- Weight on the Plans sheet or in Buying (follow-ups).
- Using density in the tip check's centre of mass (held-and-stable spec §8 left "density per material" out of scope; it
  stays out — the checks are byte for byte unchanged, so Generate's repair loop is too).
- A species picker or a density lookup table in the UI.

**Anti-goals** — a failure even if it works:

- A total that silently leaves something out. A material with no density makes the total say it is partial and name
  what it left out, exactly as an unpriced material makes Buying say `no price`.
- False precision. Wood varies ±15% within a species; the number reads as an estimate (§6).
- Any change to geometry, checks, joinery, Generate or the cut list's existing numbers.

## 2. Where density lives — THE OPEN DECISION (the user's)

Built-ins are fixed either way: a `density` on each `MATERIALS` entry, surfaced through `MaterialInfo` (labels, colours,
sheet sizes and now densities come only from the catalog, inv 49). The question is where a CUSTOM material's density is
stored.

**A. On the material, in the document — schema 28. Recommended.** `CustomMaterial.density?: number`, stored only when set.
It travels with the project and its export, and with the browser's material library, like the sheet size, which is the
codebase's own rule for physical facts about a material (`SheetStock`'s doc comment: "a property of the MATERIAL, not of
the project"). Cost: a schema bump, so rolling back past this round refuses every project saved at 28 (export first).

**B. Beside the price, in `sloyd.shop.v1` — no schema change.** A per-material density in the browser's shop settings,
carried through `extra` like prices. No rollback cost. But a density is not a local fact the way a price is: an exported
or Generated project arrives with every custom material unweighed, and the same "Ash" weighs differently in two browsers.

The rest of this spec is written for **A**; under B, §3's document and versioning parts move to `purchase.ts`'s
`validateShop`, and the Materials & prices dialog writes the density with the price instead of with the material.

## 3. The model (option A)

### 3.1 Units of storage

Stored density is **pounds per cubic foot** (lb/ft³), as stored lengths are inches: the canonical imperial unit, never
converted on a units switch. A metric project shows and takes kg/m³ (`1 lb/ft³ = 16.018463 kg/m³`), converted at the
`units` edge only (§6).

### 3.2 Built-in densities

Air-dry (about 12% moisture content), from the USDA *Wood Handbook* (FPL-GTR-282) and the Wood Database's averages:

| Material | lb/ft³ | Basis |
|---|---|---|
| Pine | 28 | *Claude's call:* ponderosa / SPF construction pine (eastern white is 25, southern yellow pine 36–42). Sloyd's pine is nominal construction stock. |
| Oak | 44 | *Claude's call:* red oak (white oak is 47). |
| Maple | 44 | Hard maple (soft maple is 38). |
| Walnut | 38 | Black walnut. |
| Cherry | 35 | Black cherry. |
| Plywood | 36 | A ¾" 4×8 hardwood plywood sheet weighs about 70–75 lb (2 ft³). |
| MDF | 48 | A ¾" 4×8 MDF sheet weighs about 95–100 lb. |

A built-in cannot be edited (custom materials spec §2.2). Someone who needs white oak makes a custom material.

### 3.3 `CustomMaterial.density`

- Optional; stored only when set — never `null`, `0` or `undefined` (an unweighed material has no key, so a material
  without one is byte for byte as before).
- Legal: finite, `> 0`, `<= DENSITY_MAX` (150 lb/ft³; the densest commercial wood, lignum vitae, is about 80).
- **On load a malformed density is DROPPED and the material KEPT** (a material dropped would turn its parts pine — far
  worse than an unweighed one). Same rule for the browser library.
- Every kind may carry one (solid, veneered sheet, plain sheet).
- `sameMaterial` compares it (else `upsertMaterials` would skip a density-only edit); `customInfo` carries it to
  `MaterialInfo.density?: number`.

### 3.4 Schema 28

`CURRENT_VERSION` 28; no migration step (document-level, absent = unweighed).
**Harm a 27 build would do:** `validateCustomMaterial` rebuilds each material field by field, drops `density`, and the
next autosave writes the project without it — silent loss on round trip, the same argument as 5→6 and 13→14. So a 28 file
must be refused by a 27 build. Rollback past this round refuses every project saved at 28: export first.
A new row in `docs/versioning.md`.

The browser library (`sloyd.materials.v1`) is not schema-versioned: a 27 build that rewrites it drops densities there
too. Accepted and recorded (the project copy is the one that matters, and a rollback is rare).

## 4. Volume — `src/document/weight.ts` (new; the ONE home of weight)

Pure, numbers only, layer `document`. Imports nothing from `units`; the strings are built in the cut list and Properties
modules from its numbers via `units/quantity.ts` (§6).

### 4.1 A part's wood

`woodVolume(b: Board): number` — cubic inches: the sum of the volumes of `boardBodies(b)` (through `partGeometry`, the one
reader), each convex body split into tetrahedra from an interior point, as `partMass`'s real-bodied path does. Factor that
tetrahedron sum into one shared helper both call; **`partMass` itself is not changed** — its fast path deliberately weighs a
notched part as its box (fu 303), and the tip check stays byte for byte.

A lean moves no wood: volume is taken in the part's own frame, lean ignored.

**Holes are ignored** (every check ignores them; `boardBodies` is hole-free, inv 50). Measured scale: four 35 mm hinge cups
13 mm deep are about 50 cm³ — 0.06 lb of oak — against a ±15% density spread. Recorded as a follow-up, not a defect.

**The partition must hold.** Bodies come from `pocketCells`; if two cells ever overlap, a weight would be quietly high.
Required test: for parts covering every feature kind (dado, rabbet, notch, taper, miter, curve arch, roundover, round
tenon, through and half-blind dovetails), `woodVolume` equals an INDEPENDENTLY computed number — the box minus each cut's
analytic volume (a frustum for a taper, segment area × thickness for an arch, a hand sum for a dovetail's sockets) — to
1e-6 relative. Not a value `woodVolume` itself produces (inv 23's rule).

### 4.2 Banding (inv 54)

The model is the FINISHED size and bodies are untouched by bands, so a plain body sum would weigh walnut edging as the
plywood core. Split it:

- each SOLID strip (`strips(part, types)`) weighs its FINISHED box — its finished run × the band's thickness × the part's
  thickness — at the BAND TYPE's material's density *(amended at the final review, I1: `stripBoard`'s box is the cut blank, whose
  length and width allowances are trimmed off; weighing them made edging heavy and could drive a small part's core negative)*;
- the core weighs `woodVolume(part) − Σ strip boxes` at the part's density, `woodVolume` taken on the FINISHED stored
  part. **Never on `cutStock`'s core-sized board**: that keeps the finished part's features at their stored stations on a
  smaller blank, so its bodies are not the core's wood;
- so core + strips = `woodVolume(part)` exactly, by construction: the total wood is always the finished model's. Only the
  split between two densities is approximate (a mitred corner's square is in both strip boxes, so the strips carry it
  twice and the core gives it up twice — a corner's volume times the density difference);
- tape is weighed as core (its thickness, about 0.5 mm, is inside the finished size). Negligible; recorded.

A profile cut into an edging strip leaves the strip's box counted as strip and the core short by the same volume: a
density difference times a profile's sliver. Accepted, recorded.

### 4.3 The project

`weightOf(flat: FlatDocument, catalog): WeightSummary`, on `flatDocument` (every Definition copy counted; hidden parts
counted, inv 43):

```ts
interface WeightSummary {
  /** Pounds, summed over weighed wood only. */
  pounds: number;
  /** Materials with no density whose wood is in the piece, in catalog order; [] when the total is complete. */
  unweighed: string[];
}
```

and `selectionWeight(flat, ids, catalog)` for Properties: the same sum over the parts (and their strips) the ids name.
A cut-list group's weight is summed inside `buildCutList`'s `visit`, beside `stockInches` and in the same visit (never from
representative rows): a PART visit adds `coreWeight(part)` — the core only, at the part's density — to the part's group; a
STRIP visit adds that strip's box at its band material's density to the strip's group (the band material's). So the
edging's weight lands in the edging's group, never twice, and **the project total is exactly the sum of the group
weights** (`weightOf` and the cut list agree by test). A selection's weight is each selected part's core plus its own
strips. Properties' selection ids are mapped to flat parts the way the existing selection readers do (through
`worldParts` / `flatDocument` ids; an assembly selection means its parts).

### 4.4 Performance

The cut list rebuilds on every edit. `woodVolume` memoises per part on what its bodies key on (the geometry key bodies
already use, inv 15/50's discipline — never a hand-written field list). The builder measures a large fixture (the Shaker
table, the stool) before and after; perf guards are lowered only, never raised (inv 50).

## 5. Where it shows

### 5.1 Cut list

- **Each group's subtotal** gains the group's weight under its stock, in the stock's right-aligned column: `12 lb`, or `no density`
  for an unweighed material. *(Amended in the build's browser check: inline, after the stock as `· 12 lb`, it pushed the stock out of
  line with the rows' stock column.)*
- **A project line** under the groups, before Hardware: `Weight: about 47 lb`. When something is unweighed:
  `Weight: about 40 lb, not counting Ash (no density)` (labels joined `, ` and `and`).
- Strip rows sit in their band material's group already; their weight lands there.
- The printed cut list is the same component; it prints the same strings.
- Every string is built in `cutlist.ts` (inv 19), never in `CutList.tsx`.

### 5.2 Properties

A read-only `Weight` line for the selection: `about 6.2 lb` (one part, several parts, or an assembly's parts). Partial
selections say so the same way: `about 6.2 lb, not counting Ash`. Hidden selected parts can't be selected (inv 43), so
nothing special. Shown when the selection is non-empty.

### 5.3 Materials & prices

A custom material's definition row gains `Density`, beside Sheet length / Sheet width (`MaterialDefinition.tsx`,
`materialsDraft.ts`): a text field in lb/ft³ (kg/m³ in a metric project), empty = unweighed. Built-in rows show their
density read-only. A typed value outside (0, `DENSITY_MAX`] or not a number is refused with the dialog's existing
field-error pattern, never clamped.

## 6. Strings — `units/quantity.ts`

Weight and density are not lengths, so they sit beside `formatBoardFeet` and `formatMoney`, keyed on the DOCUMENT's
`Units` (`isMetric`):

- `formatWeight(pounds, units)`: imperial `lb`, metric `kg` (`× 0.45359237`). Under 10 one decimal (`6.2 lb`), at 10 and
  over whole (`47 lb`). *Claude's call* — a ±15% material does not deserve `47.3`. *(Amended 2026-10-28, the user's ruling: a
  weight that would print `0.0` reads `under 0.1 lb` / `under 0.1 kg`; in a sentence `approxWeight` gives `about 6.2 lb` or
  `under 0.1 lb`, never `about under`.)*
- The word `about` is added by the caller's sentence, not the formatter.
- `formatDensity(lbPerFt3, units)`: imperial whole lb/ft³ (one decimal under 10), metric whole kg/m³; `parseDensity(text,
  units)` the inverse. A metric value round-trips to the same whole kg/m³.

## 7. What does not change

- Geometry, bodies, meshes, drawings, the Plans sheet, the section cut.
- Every design check, joinery, Repair, Refine, Generate. **Generate's schema stays byte-identical (inv 49)**: `prompt.ts`
  reads `MATERIALS` keys and labels only; density reaches no model-facing text. A test pins it.
- The cut list's rows, numbers, keys and Buying. The only cut-list change is the added weight text.
- A document with no custom density is byte for byte as before on SAVE (no key written); its cut list differs only by the
  new weight text.

## 8. Invariants and docs

- **A new invariant 63, condensed:** *`weight.ts` is the ONE place weight is computed: the wood the model keeps
  (`boardBodies` volumes), holes ignored, solid edging at its band's density, every copy and hidden part counted; a
  material with no density makes every total say it is partial — never a silent undercount. `partMass` and the checks
  never read density.*
- Inv 49 gains: density comes only from the catalog; a custom material's malformed density is dropped, the material kept.
- `docs/versioning.md` row 27→28; `docs/module-map.md` (`weight.ts`); `CLAUDE.md`'s Where-things-live row and the `→ units`
  edge note (`weight.ts` does NOT import `units`; `cutlist.ts` already does).

## 9. Tests (beyond §4.1's partition test)

- Hand numbers: an oak 3/4 × 6 × 24 board weighs 0.75·6·24/1728·44 = 2.75 lb.
- A banded plywood shelf with walnut edging: core and strip weighed at their own densities, against a hand number; the
  walnut group's weight is non-zero, the plywood group's excludes the edging, core + strips = `woodVolume` of the finished
  shelf, and the project total equals the sum of the groups.
- Identity guards (`bandFreeIdentity`, `hardwareFreeIdentity`, `CutList.dovetailIdentity` and kin) break by design on the
  new subtotal text. They are updated to assert the OLD output with only the weight text added, never regenerated
  wholesale — so nothing else can change unnoticed.
- Unweighed: a custom material with no density gives `unweighed` and the partial sentence; adding the density completes it.
- Definitions: an assembly placed twice weighs twice. A mirrored instance weighs the same as its source.
- Metric: the same project in metric prints kg; a density typed in kg/m³ stores lb/ft³ and reads back the same whole kg/m³.
- Load: a malformed density (0, −1, NaN, a string, 151) drops the field, the material kept; a 28 file is refused by the
  version gate when `CURRENT_VERSION` is 27 (the existing newer-version test pattern).
- `sameMaterial` / `upsertMaterials`: a density-only edit is written.
- Generate identity: the design schema and prompt text unchanged.
- **Mutate the test** (working agreement): break the partition test by double-counting one cell and confirm it fails;
  drop the band split and confirm the edging test fails.

## 10. Verification

Dev server, Playwright: the Shaker table fixture's cut list and Properties readouts; a custom material with and without a
density; a metric project. Production: bundle hash, CSP header, `localStorage` cleared afterward (the deployment rule).
No paid runs needed.

## 11. Claude's calls, for checking

1. Option A recommended (§2) — the one decision that is the user's.
2. Pine 28 (construction pine, not white pine 25 or SYP 40); oak 44 (red, not white 47).
3. Built-in densities fixed, not editable.
4. Holes ignored; tape weighed as core; a profiled edging strip's sliver counted as strip.
5. Weight rounded: one decimal under 10, whole above; prefixed `about`.
6. Shown in the cut list (group subtotal + project line) and Properties; not on the Plans sheet or in Buying.
7. Density not used by the tip check.
8. A malformed stored density drops the field, not the material.
9. Follow-ups to open: hardware weight; holes subtracted; weight on the Plans sheet; density in the tip check.
