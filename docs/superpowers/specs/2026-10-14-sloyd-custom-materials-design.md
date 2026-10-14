# Sloyd — custom materials and nominal lumber

**Date:** 2026-10-14 · **Status:** draft for the user's review
**Builds on:** the document schema and versioned load (`document.ts`, invariants 11, 33), the material table
(`MATERIALS`, `types.ts`), sheet nesting (`nesting.ts`), lumber yield and cost (`purchase.ts`,
`LumberPricesDialog.tsx`, `sloyd.shop.v1`), the storage seam (`StorageAdapter`, invariants 7, 31), Refine and
joinery (`generate/`, invariants 36, 37, 41, 48, fu 322). Every rule there still holds unless this document says
otherwise.

**Origin:** `docs/feature-gaps.md` §3, "Custom materials" and "Nominal dimensional lumber"; follow-up 266.

## 1. Problem and goal

`MATERIALS` is a fixed seven in code. Ash, poplar, sapele, 5×5 Baltic birch, melamine, hardboard and construction
lumber cannot be expressed, and a 1½ × 3½ part never reads as a 2×4.

**Goal:** the user defines their own materials (solid lumber and sheet goods), picks them in any project, buys and
prices them like the built-ins, and parts of nominal-size lumber carry their nominal names.

**The user's rulings, made in conversation (2026-10-14):**
- **Scope: all four** — more species, other sheet goods, construction lumber, nominal names.
- **Storage: both.** A browser-level LIBRARY of custom materials, AND each project file carries a copy of every
  custom material it uses, so an exported file is self-contained. Schema 15.
- **Claude:** Refine keeps custom materials (its material list is the built-ins plus the project's own); Generate
  stays on the built-in seven.
- **Nominal names: a per-material switch** ("sold in nominal sizes"): on for pine and for nominal custom materials,
  off for hardwoods and sheets. Names show only on an EXACT match.
- **Editing: where you are.** Editing a custom material changes this project's copy (undoable) and saves it to the
  library; other projects keep their own copy until changed there.
- **Approach: an explicit catalog** (§3), not a global registry and not self-describing parts.

**Non-goals:** editing a built-in; changing a material's kind after creation; rough thickness classes and 5/4
(fu 271); metric nominal names; Generate offering custom materials; per-project prices (fu 265); edge banding and
hardware (fu 267).

## 2. The data

### 2.1 Built-ins

The seven `MATERIALS` entries stay in code with their keys unchanged. Each gains a `kind` (§2.2: the five woods
`solid`, plywood `sheet-veneered`, MDF `sheet-plain`); **pine gains `nominal: true`**. A built-in cannot be edited
or deleted; a variant is a new custom material ("Baltic birch 5×5").

### 2.2 A custom material

```ts
type MaterialKind = 'solid' | 'sheet-veneered' | 'sheet-plain';
interface CustomMaterial {
  id: string;          // minted 'm-' + random base36; never a built-in key; no '/'
  label: string;       // free text, trimmed, non-empty
  color: string;       // '#rrggbb'
  kind: MaterialKind;
  nominal?: true;      // solid only; stored only when true
  sheet?: { length: number; width: number };  // inches, positive; present exactly when kind is a sheet kind
}
```

- `sheet-veneered` reads as plywood: the plywood look, `rotate: 'grain'` on the sheet.
- `sheet-plain` reads as MDF: the MDF look, `rotate: 'free'` (melamine, hardboard).
- `id` is random so the same label created in two browsers cannot collide by accident. The label carries meaning;
  the id never shows.

### 2.3 The document (schema 15)

`SloydDocument` gains **`materials: CustomMaterial[]`** — exactly the custom materials its stored parts and shapes
use (definitions included), in first-use order. It is **pruned on every write** (`pruneMaterials`, called where
`pruneShapes` is), so a document never carries an unused material and the project needs no delete action.

**Schema 15.** Harm a v14 build would do: a part whose material it does not know becomes pine, silently, and the
next save writes pine. So the bump exists for the refusal gate (as every bump does). Rolling back below 15 refuses
every project saved since — including projects with no custom material, because every save writes 15. Export first.

**Load** (document-level, no step, like 12→13 and 13→14):
- `materials` absent or not an array → `[]`.
- `doc.materials` is validated BEFORE the parts, so a part's material check sees it.
- An entry is dropped when malformed: no string id, a built-in key as id, `/` in the id, an empty label, a colour
  that is not `#rrggbb`, an unknown kind, a sheet kind without a positive sheet size. `nominal` on a sheet kind and
  `sheet` on a solid are dropped from the entry (normalised, the entry kept).
- Duplicate ids: the FIRST wins, the later is dropped (inv 33's scope: per document). Material references are
  resolved by DROPPING, never by re-minting, so nothing is rewritten.
- A part or shape whose material is neither built-in nor in `doc.materials` falls back to `pine`, as today.
- The load ends with `pruneMaterials`, so a file carrying unused entries loads without them.

### 2.4 The library (browser-level)

Stored under **`sloyd.materials.v1`** as `{ layout: 1, materials: CustomMaterial[] }`, read and written ONLY through
`StorageAdapter` (`getMaterialLibrary`, `setMaterialLibrary`), never exported, never on the undo stack. Entries are
validated as in §2.3. **Reading never writes** (like `sloyd.shop.v1`): an unusable or newer value reads as an empty
library with a flag; the dialog says so and does not save the library over it.

### 2.5 Prices

`sloyd.shop.v1` keeps its layout, keyed by material id. `validateShop` takes the catalog of materials it should
know (built-ins + library + this project) and validates those entries by their kind; every other stored entry is
carried untouched in `extra` (the existing passthrough). A material with no stored entry takes its default buying:
- nominal solid → **by the piece**, stock per §5.4;
- other solid → **by the board foot**, waste 1.3, no price;
- sheet → **by the sheet**, no price.
Pine's built-in default is unchanged.

## 3. The catalog

```ts
interface MaterialCatalog { get(id: string): MaterialInfo | undefined; ids(): string[] }
interface MaterialInfo { id: string; label: string; color: string; kind: MaterialKind; nominal: boolean;
                         sheet?: SheetStock; builtIn: boolean }
```

- `catalogOf(doc)` = built-ins + `doc.materials`, memoised on the `doc.materials` array's identity, so every
  render and every part shares one catalog per document state.
- `builtInCatalog()` = the seven alone.
- **Every reader of a material takes a catalog** — `isSheetGood(catalog, id)`, `sheetStockOf(catalog, id)`,
  `grainFamily(catalog, id)`, the label lookups. Builders that already take the document (`buildCutList`,
  `buildPurchase`, `buildNesting`, `checkDesign`, `diffDesigns`) build it themselves from the document.
  `MATERIALS` stops being imported outside `types.ts`/the catalog module; the compiler finds every site.
- **No global registry.** A background Refine or joinery run reads its own document's catalog, never the open
  project's.
- An unknown id reads as pine everywhere it is drawn or priced (it cannot occur after load, §2.3; this is the
  existing fallback, kept for safety).
- `grainFamily`: `solid` → wood, `sheet-veneered` → plywood, `sheet-plain` → MDF. The texture cache stays at most
  nine textures; colour stays a tint (invariant 12).

## 4. The dialog and the picker

### 4.1 Materials & prices

The **Lumber & prices** dialog becomes **Materials & prices** (More ▾ → "Materials & prices…"). It lists, in order:
1. the built-ins — prices only (as today);
2. this project's custom materials — definition and prices;
3. library materials this project does not use — definition and prices, with a delete (trash) control.

**Add material** starts a new entry: label, colour (`<input type="color">`), kind, then by kind either the sheet size
(two `DimensionField`s) or the "Sold in nominal sizes" checkbox. **Kind is fixed once created** (a solid turned sheet
would have to rewrite grains running through the thickness); label, colour, sheet size and the nominal switch stay
editable.

**Refusals** — decided before anything is written; the field keeps the typed value and shows why; Save is disabled
while any refusal stands:
- an empty label;
- a label equal (trimmed, case-insensitive) to another material's, built-in or custom, in this dialog;
- a sheet size that is not positive (`DimensionField` refuses, never clamps).

**Save** writes, together:
1. this project's copies of every edited material — ONE `edit()`, one undo entry (and, from "New material…", the
   selected parts' new material in the same edit, §4.2);
2. the library — every custom material edited or added in the dialog, whether or not this project uses it;
3. the prices (`setShopSettings`), as today.

Undo reverts the project's copy; the library and the prices stay (browser state, as prices are today). The dialog
says this in one line under Save. A failed library or shop write is reported in the dialog and does not roll back the
project edit.

**Project and library differ** (same id, other content — the material was edited in another project, or the file was
opened from elsewhere): the project's copy wins everywhere in this project. The row is marked "Differs from your
library" with **Use library version** (a project edit on Save). A material in this project but not in the library
shows **Add to library**. **Opening a project never writes the library.**

**Delete** (library-only rows): removes the library entry on Save. Projects keep their copies; its prices stay in
`sloyd.shop.v1` (harmless, carried in `extra` once nothing knows the id).

### 4.2 Picking

Properties' Material select lists the built-ins, then this project's custom materials, then library-only materials
(as `<optgroup>`s), then **New material…**.
- Picking a library-only material copies it into `doc.materials` in the same edit as the part change — one undo
  entry.
- **New material…** opens Materials & prices with a new entry started; on Save the selected parts take it (same
  edit). Cancel changes nothing; the select stays on the stored value.
- Setting a part off a material's last use prunes the copy (§2.3).
- The multi-select (mixed) form behaves as today.
- Picking a sheet material for a part whose grain runs through the thickness normalises grain to length, as the
  built-in plywood does today.

## 5. Nominal names

### 5.1 The table

One module, `src/units/nominal.ts` (it produces strings a person reads; the `→ units` edge rule): nominal
1, 2, 3, 4, 6, 8, 10, 12 → actual ¾, 1½, 2½, 3½, 5½, 7¼, 9¼, 11¼ inches. Named sections: 1×2…1×12, 2×2…2×12, 4×4,
4×6, 6×6. The glyph `×` is already measured on the sheet (invariant 19).

### 5.2 The match

`nominalName(thickness, width)` returns the name when the pair, in either order, equals a named section's actual
pair within **1e-9**, else null. Exact: ¾ × 3½ is a 1×4; ¾ × 3⅜ is nothing — round what is bought, never what is
machined (invariant 18). A name is shown only for a part whose material is `nominal`.

### 5.3 Where names appear

- **Cut list rows:** the name prefixes the row and the actual dimensions stay: `2×4  1 1/2 × 3 1/2 × 36`. Built in
  `cutlist.ts` (invariant 19). Rows are not re-grouped by name.
- **Buying, by the piece:** a stock size that matches reads `2×4 × 8′`; a non-matching size reads as today. Built in
  `purchase.ts`.
- **Properties:** a **Size** select (`Custom`, then each named section) shows only when every selected part's
  material is nominal. It shows the current name or `Custom`; choosing a section sets thickness and width in ONE edit
  (one undo entry, the normal reorient path, invariant 2). Choosing `Custom` changes nothing.
- **Not** on the Plans sheet or part diagrams: drawings keep actual dimensions.

### 5.4 Default stock for a nominal custom material

By the piece, no prices: 1×2…1×12 at 8′; 2×2…2×12 at 8′, 10′, 12′; 4×4 at 8′. Pine keeps its existing default
(¾ × 1½…11¼ at 6′ and 8′), so stored prices do not change; its rows now read 1×2…1×12.

## 6. Claude

- **`designSchema(catalog)`** replaces the constant's material enum. Generate passes `builtInCatalog()` — its
  schema is **byte-identical to today's `DESIGN_SCHEMA`** (pinned by a test, so no compile is owed for Generate).
  Refine passes `catalogOf(doc)`. The part and direction stay in `$defs` (invariant 48).
- Refine's prompt adds one line per custom material mapping id to label (`"m-k3x9" is Ash`), so an instruction
  naming the label resolves. Generate's prompt and its Material preference are unchanged (built-ins).
- `parseDesign` validates a material against the catalog it was given; `designDiff` reads labels through it.
- **Every path that makes a project from another carries the custom materials used**: Refine, Add joinery, Repair
  (the new document's `materials` = the source's, then pruned) and Duplicate (a copy of the stored document).
- Joinery's prompt lines (`choose.ts`) print the label, not the id.
- **fu 322:** a Refine schema with custom entries is a new grammar. One live compile probe (≈1¢) and one paid Refine
  on a project using a custom material (≈4¢), each with the user's approval.

## 7. Testing

- **Catalog:** built-ins + document; memoised by identity; unknown id → pine fallback; `grainFamily` per kind.
- **Load (v14 → 15):** absent `materials`; each malformed case of §2.3; duplicate id (first wins); built-in key as id;
  a part naming an unknown material → pine; unused entries pruned; `CURRENT_VERSION` is 15 (the refusal gate itself
  is existing code).
- **Pruning** on every write path that can drop a last use: material change, delete, Ungroup, Make Unique, Refine,
  joinery, Repair, undo/redo (a restored document carries its own `materials`).
- **Library storage:** a read never writes; an unusable value reads empty with a flag; round trip.
- **Shop:** custom ids validated by kind; unknown ids carried in `extra`; defaults per §2.5.
- **Dialog:** each refusal; Save is one undo entry; undo reverts the project copy and not the library; "Use library
  version"; "Add to library"; delete library-only; "New material…" applies to the selection in the same entry.
- **Nominal:** the match is exact (mutate to 3⅜ and to a 1e-6 offset); either order; non-nominal material shows no
  name; cut list and Buying strings; the Size select's one edit.
- **Claude:** Generate's schema equals today's (deep equality and byte length); Refine's schema carries the custom
  ids; derived projects carry their materials; joinery lines print labels.
- Mutation-test every ordering, refusal and "exact" property (the usual rule).
- **Browser pass on the dev server**, the user watching: create Ash and a 5×5 Baltic birch; colours and the sheet
  layout; export, then re-import in a library without them (the "Add to library" path); edit in one project and
  see "Differs from your library" in another; 2×4s in the cut list and Buying. Colours are plain tints, so software GL
  is adequate (no new shader path).

## 8. Chunks

Each merged and deployed on its own.

1. **Custom materials end to end:** the catalog refactor, schema 15, the library, Materials & prices, the picker,
   prices by id, and Claude carrying materials (Refine must work on an ash project the day it ships). The `nominal`
   field is stored and validated here (§2.2, §2.3) so chunk 2 needs no schema change; its checkbox, pine's flag and
   every effect wait for chunk 2. Rollback below 15 costs an export from this deploy on.
2. **Nominal names:** the table, pine's flag, cut list and Buying names, the Size select, nominal default stock. No
   schema change.
