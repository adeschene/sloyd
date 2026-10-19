# Sloyd — edge banding

**Date:** 2026-10-19 · **Status:** design approved in conversation section by section (§1–§4 and the chunk split);
this written spec awaits the user's review.
**Builds on:** the document schema and versioned load (`document.ts`, invariants 11, 33), shapes and links (`LINK_FIELDS`,
inv 45), mirrored frames (inv 44), the cut list (`cutlist.ts`, inv 18, 40), sheet nesting (`nesting.ts`), Buying
(`purchase.ts`), custom materials (inv 49), the outline and side stretches of profile runs b1 (`profilePath.ts`:
`faceOutline`, `sideStretch`), metric display (inv 52), the Plans sheet and part diagrams (invs 47, 19), the fault
precedent of holes, curves and profiles (refuse an ADDED fault, keep and note a caused one). Every rule there still holds
unless this document says otherwise.

**Origin:** `docs/feature-gaps.md` §3, "Edge banding"; follow-up 267 (its banding half — the hardware bill of materials,
with fu 332's dowels, stays open under 267 for its own spec).

## 1. Problem and goal

A plywood or MDF part's exposed edges are banded before it goes into a piece: iron-on veneer tape most often, solid wood
edging where the edge takes wear or a profile. Sloyd records none of it. The cut list cannot say which edges to band,
cannot shorten a panel for edging that has thickness, does not list the edging strips to mill, and Buying does not count
the tape.

**Goal:** mark a part's edges as banded with a named band type; the cut list gives the right CUT size, marks the banded
edges, lists solid strips to mill, and Buying counts and prices the banding. Changing a part's banding, or a band type,
is one select or one dialog edit.

**The user's rulings, made in conversation (2026-10-19):**
- **Banding first**; the hardware bill of materials is a separate later spec.
- **The model is the FINISHED size.** The cut list subtracts a band's thickness to give the cut (core) size. Thickness
  defaults to 0 — iron-on tape, the common case, changes no number. Solid wood edging uses the same process.
- **A solid band is a property of the part's edge** (not a separate part): drawn on the part, a derived strip row on the
  cut list, priced with its species in Buying.
- **Corners: one rule per part** — *Long edges run through* (default), *Ends run through*, *Mitred*.
- **Band types are named and per project**; an edge points at one. No browser library (a later follow-up if wanted).
- **Bands follow the outline** (arches, bows, notches, corner arcs) — for a band of zero thickness. A band WITH
  thickness needs a straight side (§2.3; this generalises the conversation's "solid on a curve is refused", agreed in §1's
  review).
- **Solid strips are cut oversize**: per band type, a width allowance (default 1/16") and a length allowance (default
  1/2" per strip in total).
- **Staged:** bands are cut-list arithmetic plus paint; the bodies are untouched. Splitting a part's bodies into core and
  band is a follow-up, taken only when a real project needs it (§7).
- **Two chunks:** chunk 1 data, arithmetic, cut list, nesting, Buying, controls; chunk 2 viewport, Plans sheet, part
  diagrams (§8).

**Non-goals:** a browser library of band types; a band on a thickness edge (the end grain of a part's thickness — only the
four sides of the broad face are banded); a band with thickness round a curve (bent lamination); bands through joinery,
Refine, Repair or Generate (§6); corner rules per corner; splitting bodies (§7); the hardware bill of materials.

## 2. The data (schema 19)

### 2.1 Band types (document level)

```ts
interface BandType {
  id: string;               // minted per document (`nextId`); the built-in's id is the fixed 'band-iron-on'
  name: string;             // unique among band types (`uniqueName`), '›' cleaned as names are
  kind: 'tape' | 'solid';   // fixed once saved (the custom-materials precedent)
  thickness: number;        // inches, >= 0; tape default 0, solid default 1/4"
  lengthAllowance: number;  // inches, >= 0, TOTAL per strip or per taped side; default 1/2"
  // kind 'tape' only
  tapeWidth: number;        // inches, > 0; default 7/8"
  pricePerFoot: number | null;   // US dollars per linear foot; null = unpriced (default)
  // kind 'solid' only
  material: string;         // a SOLID material id: built-in or this document's custom (inv 49)
  widthAllowance: number;   // inches, >= 0; default 1/16"
}
SloydDocument.bandTypes: BandType[]
```

(The TypeScript is a discriminated union on `kind`; the fields above are listed flat for reading.)

- **The built-in**, `{ id: 'band-iron-on', name: 'Iron-on veneer', kind: 'tape', thickness: 0, lengthAllowance: 1/2,
  tapeWidth: 7/8, pricePerFoot: null }`, is always present: every load re-adds it, first, if absent. It may be edited
  (name, thickness, allowance, width, price) but never deleted.
- **Unused band types are KEPT** (there is no library to hold them; unlike materials, `pruneMaterials` has no analogue).
- **Prices live in the document** (`pricePerFoot`), not in `sloyd.shop.v1`: band type ids are per document, so a
  browser-level price keyed by them would collide across projects. This is the first per-project price — the direction fu
  265 points — and undo reverts it with the project.
- A solid band type's `material` is a reference for `pruneMaterials`: a custom material a band type uses is KEPT in
  `doc.materials` (inv 49's "exactly the materials its parts and shapes use" widens to "and its band types").

### 2.2 Bands (part and Shape level)

```ts
interface Band { side: ProfileSide; type: string }   // side = profiles' { across, from }
Board.bands: Band[];             // also Shape.bands; default []
Board.cornerRule?: 'ends' | 'mitre';   // absent = long edges run through; only these two values are stored
```

- **Sides** are the four sides of the broad face (length × width), named as profiles name them: `across: 'width'` is a
  long edge, `across: 'length'` an end; `from` is the end of `across` it sits at. At most one band per side; stored in
  the canonical side order (width-min, width-max, length-min, length-max) so equal banding compares equal.
- **Words** are the existing edge words (`edgeName`: `the width min side`, `the length max end`), so a side reads the
  same in band, hole, curve and profile lines. (The conversation's "Front/Back/Left end/Right end" were illustrative; a
  part's sides have no front.)
- **Mirroring** (inv 44): a band reflects by a flag flip — `side.from` flips when `side.across` is the mirrored
  dimension; nothing else. `lowerBands` is the exact inverse, reusing an untouched stored array. `cornerRule` never flips.
  Pinned with `chiralPart`-style fixtures (banded on one long edge and one end).
- **Links** (inv 45): `bands` and `cornerRule` are SHARED in `LINK_FIELDS` (an array, excluded from the primitives check
  as profiles are; `cornerRule` an optional shared primitive — classify with fu 231's care: absent and `'long'` must not
  read as different, which is why `'long'` is never stored).
- **Same banding** (inv 40): `BAND_FIELDS` (`side`, `type`), `satisfies` against `Band`, every field exact; `sameShared`
  compares bands in order, the cut list by `bandSignature` (§4.1).
- **Reorient** (inv 2): `bands` and `cornerRule` are absent from the reorient predicate (a band moves nothing).

### 2.3 Loading (17→18 precedent; step 18→19)

Document-level, no step function; on raw data before `validateBoard` (inv 11):
1. `bandTypes` validated FIRST (before materials are pruned and before parts): a malformed entry is dropped —
   non-finite or negative number, `tapeWidth <= 0`, an unknown `kind` string **refuses the document** with the
   newer-version message (a later kind needs no bump, the curves/profiles precedent), a solid type whose `material` is
   not a solid material (built-in or in `doc.materials`) falls back to `pine` (inv 49's precedent). Duplicate ids: the
   first keeps its id (inv 33), the later is re-minted; duplicate names deduped. The built-in re-added if absent.
2. Parts and shapes: `bands` default `[]`; a malformed band (unknown side, non-string type) dropped; a band whose `type`
   names no band type dropped; a second band on one side dropped (first wins); sorted to canonical order. `cornerRule`
   other than `'ends'`/`'mitre'` dropped (absent = long).
- **Harm a build one version back would do:** silent loss — every band and band type dropped, then autosaved; a banded
  panel's cut list would print its FINISHED size as the cut size. Hence the bump.
- **Rollback** below 19 refuses every project saved since — export first.

## 3. The arithmetic — `document/banding.ts`

ONE pure module; the cut list, nesting, Buying, Properties' refusals and chunk 2's drawings read it, nothing else
computes a band number. It imports `document` modules only (no `units`: it produces numbers; inv 52's edge rule). Results
memoised per (part object, band types array) and deep-frozen.

### 3.1 Core (cut) size

`core(part, types) → { length, width, thickness }`:
`length − t(length min end) − t(length max end)`, `width − t(width min side) − t(width max side)`, thickness unchanged,
where `t(side)` is its band's thickness (0 when unbanded or the band is faulted, §3.4). **The corner rule never changes the
core**: the core is the finished part minus its bands. A part with no bands returns its own dimensions (the same numbers,
so every reader of a band-free part is byte-for-byte unchanged).

### 3.2 Strips (solid bands)

For each unfaulted solid band, the strip's FINISHED length along its side:
- **Long edges run through** (default): a long-edge strip is the finished `length`; an end strip is the finished `width`
  minus the thicknesses of any banded long edges (with thickness).
- **Ends run through**: the mirror image.
- **Mitred**: every strip is its finished side length, mitred 45° at each end where the next side carries a band WITH
  thickness; square where it does not.
- A band of zero thickness never shortens a neighbour and never makes a mitre.

The strip's CUT: length + `lengthAllowance`; width = part thickness + `widthAllowance`; thickness = band thickness; grain
along its length; material = the band type's. Each strip records its part, side and its two ends (`square` | `mitre`).

### 3.3 Tape length

For each unfaulted tape band: the side's outline length measured on the TRUE arcs (`sideStretch` over `faceOutline`; a
straight side is its dimension) + `lengthAllowance`. The corner rule does not apply. (A tape band with thickness is still
"tape" for Buying; its thickness subtracts per §3.1 and it needs a straight side per §3.4.)

### 3.4 Faults — `bandFaults(part, types)`, THE band fault decider

- `needs-straight`: a band with thickness > 0 on a side whose stretch is not one straight chord (an arch, bow, notch or
  corner arc on it).
- `no-side`: the side has no stretch (a neighbour's waste took it; `sideStretch` null).
- `too-thick`: the bands on opposite sides leave no core (`core.length <= 0` or `core.width <= 0`; both bands of the pair
  carry it).
- `tape-narrow`: a tape band whose `tapeWidth` is less than the part's thickness (judged at 1e-9, inv 22).

A faulted band still prints its band line with `— check: <words>` (one home for the words, `bandFaultText`), contributes
NO core reduction and NO strip or tape length. Authoring refuses an edit that ADDS a (band, kind) fault — decided before
any mutation; a fault a later edit causes (a resize, a curve, a band type's thickness) is KEPT and noted (`… at this
size.` for a resize). **Curves refuses an edit that adds a band fault**, naming the band
(`Edging on the width max side needs a straight edge — remove the band first.`), per band, as it does for profiles; the
Materials dialog refuses a band type edit that adds a fault to any part, naming the first part and the count.

## 4. The cut list, nesting and Buying (chunk 1)

### 4.1 Part rows

- A banded part's row prints its CORE size as `dims` (and as `length`/`width`, so the sheet layout and every reader of a
  row agree). Stock collapsing at display precision (inv 18) applies to the core.
- The row key gains `bandSignature`: each band's side and type id in canonical order, plus the corner rule — exact. The
  type's VALUES reach the key through the core and strips they produce, so a band type edit regroups and nothing goes
  stale. Two shelves banded differently are two rows.
- A band line in `setup`, built in `cutlist.ts` (→ units): `Band: the width min side and the width max side — Maple
  edging 1/4", long edges run through; finished 24" × 11-1/4"`. Tape types read `Band: … — Iron-on veneer` with no corner
  words and, at thickness 0, no `finished` clause (the finished size IS the cut size). Sides sharing a type are listed
  together; differing types get one clause each.
- The cut list header carries one line when any part is banded: `Cut sizes are before banding; band before machining —
  every cut, hole and curve is measured on the banded part.`

### 4.2 Strip rows

- In the edging material's section, after its parts. Strips with equal cut size, ends and material collapse to one row
  (qty); named after their parts and sides (`Shelf edging (width min, width max)`; repeats as the cut list already
  collapses names).
- `dims` the oversize cut; `setup`: `Trim flush`, plus `; mitre one end 45°` / `; mitre both ends 45°` when mitred.
- Numbered in the cut list's ONE series (`number`), but carry no `boardIds`; the Plans sheet's balloons (`planBalloons`)
  skip a row with no part (no drawn part is a strip). A strip row has its own plain diagram (a strip, mitred ends drawn)
  — chunk 2 (§5.3); chunk 1 shows the row with no diagram.
- Strips of a SOLID material only (the band type's material select offers solid materials only, §5.2).

### 4.3 Sheet nesting

`buildNesting` lays out every part at its CORE size. It keeps taking `doc.boards` (its per-file rule) and reads `core`
from `banding.ts`; a part with no bands is unchanged. `turned` and grain rules unchanged.

### 4.4 Buying

- **Solid strips join their material's entry.** Board-foot mode: strip volume × the waste factor, added to the material's
  board feet. By-the-piece: strips are packed onto stock boards with the parts (`packOnto`, grain locked, the cheapest
  plan per opener, fu 269). A strip too long for every stock size is `unplaceable`, as a part.
- **Tape: a new `Edge banding` block** at the end of Buying, one line per tape type with any length:
  `Iron-on veneer, 7/8" wide: 34′ — $10.20`. Feet rounded UP to a whole foot (what is bought is rounded, inv 18); price =
  feet × `pricePerFoot`; an unpriced type shows feet only and is excluded from the total, as unpriced stock is today. The
  block's priced lines join the Buying total.
- **Metric** (inv 52): the line reads the length to 0.1 m with the bought whole feet in brackets, and the trade width
  imperial with mm in brackets: `Iron-on veneer, 7/8" (22 mm) wide: 10.4 m (35′) — $10.50`, through
  `tradeSize`/`mmBracket`; strips in mm like parts. Price per foot stays per foot (trade units, as the Materials dialog's
  sizes), so the price is always the rounded-up feet × the price.
- Printed: the block prints inside Buying's own page (fu 383).

## 5. Controls (chunk 1)

### 5.1 Properties — the Banding section

- One select per side, labelled with `edgeName`'s words (`Width min side`, `Width max side`, `Length min end`, `Length
  max end`), each offering `None` and every band type by name.
- A `Band ▾` menu: `All edges`, `Long edges`, `Ends`, `None` — taking the type last chosen in this section (or the
  built-in) — one undo entry.
- `Corners` select (`Long edges run through`, `Ends run through`, `Mitred`) shown only when two ADJACENT sides carry bands
  with thickness.
- Multi-selection: a select shows `Mixed` where parts disagree; choosing writes that side on every selected part in one
  edit (an untouched mixed select writes nothing, inv 5).
- Refusal (fu 388's pattern): options are judged on focus, never per render; an option that would ADD a fault to any
  selected part is greyed with its reason (`Needs a straight edge`, `Leaves no core`, `Narrower than the part`, `No such
  edge`). A shaped part's edit goes to its Shape (`applyWorldEdits`).
- Locked while exploded (inv 47: inside `EditLock`).

### 5.2 Materials & prices — the Edge banding section

- One row per band type: name; kind (a select only on an unsaved row); thickness; length allowance; for tape, width and
  price per foot; for solid, material (solid materials only: built-ins and this project's custom solids, and the library's
  via the existing adopt path) and width allowance.
- `+ Add band type ▾`: `Tape`, `Solid` (defaults §2.1; named `Tape 2`, `Solid edging` via `uniqueName`).
- Delete: refused while any part or shape uses the type (`Used by 4 parts`); the built-in has no delete.
- Every field refuses, never clamps (DimensionField's rule); a band type edit that ADDS a fault to a part is refused with
  the part named (§3.4).
- The dialog's ONE Save writes band types with the rest of the project edit (one undo entry); band types are project
  state, so the library and browser prices are untouched by them.

## 6. Elsewhere

- **Joinery, Refine and Repair refuse a banded project at entry** (`bandedRefusal`, after holes' and curves', naming the
  parts): Refine would drop the bands silently, joinery could put a tenon through edging. Carrying bands through them is a
  follow-up.
- **Generate** never writes bands; its schema is byte-identical.
- **Design checks** (overlap, support, tip) read the finished part, unchanged — the bands are inside it.
- **Snap points, tape, the gizmo, section caps**: unchanged (finished geometry).
- **Export/import, autosave**: the document carries `bandTypes` and `bands` like any field.

## 7. What staying un-split costs (chunk 2 and the follow-up)

The bodies are untouched: a solid band's wood is not separate in the 3D model. A hole drilled into the band, a section
through edging and a profile routed into it all read as one piece of wood. The follow-up that splits a banded part's
bodies (a final `boardBodies` stage, `BodyFace.band`) is recorded when chunk 2 ships and taken only when a real project
needs it.

## 8. Chunks

**Chunk 1 — data and the cut list** (deployable alone; the payoff):
schema 19 (`bandTypes`, `bands`, `cornerRule`; load, mirroring, links, id scope), `banding.ts` (core, strips, tape,
faults, words), the cut list (core dims, band lines, header line, strip rows, row numbers), `planBalloons` skipping a
partless row, nesting at core size, Buying (strips into their material, the Edge banding block), Properties' Banding
section, the Materials dialog's Edge banding section, Curves' band refusal, `bandedRefusal`.

**Chunk 2 — on screen and on paper:**
- **Viewport:** a tape-banded edge face takes the part material's long-grain look (no plies); a solid-banded edge face
  takes the band material's colour and grain; a solid band draws its glue line on both broad faces, offset by its
  thickness and trimmed per the corner rule (a straight segment — thick bands are straight, §3.4), clipped by the section
  plane like other edge lines (inv 51). No body changes: `bodyMeshIdentity`, `sweptIdentity` stay green.
- **Plans sheet:** glue lines as feature-tagged segments through the ONE hidden-line pass (as hole lines, inv 47); a key
  line per banded part (`Maple edging 1/4": width min side, width max side`), tape bands keyed too; a sheet with no bands
  byte-identical (`drawingIdentity`).
- **Part diagrams:** a heavy mark along each banded side in the broad-face view, and the band line as an HTML note (inv
  19); a strip row's own diagram (the strip, mitred ends drawn).

## 9. Testing

- `banding.test.ts`: core under every corner rule and band mix; strips per rule (incl. mitre with one neighbour banded,
  zero-thickness neighbours); tape length on an arch and a corner arc against the true arc length; every fault, and that a
  faulted band contributes nothing. **Mutate** each rule (swap the corner branches, drop a neighbour's thickness) — the
  tests must fail.
- Load: defaults, built-in re-added, malformed and dangling bands dropped, unknown kind refuses, duplicate ids (first
  kept), pine fallback, a custom material kept by a band type alone.
- Mirroring with a chiral banded fixture (one long edge + one end), every mirror, lower∘place = identity.
- Links: two shelves banded alike share; differently do not; a Shape's bands edited once.
- Cut list: core dims and grouping; band lines in imperial and metric; strip rows collapse; numbers stay one series;
  band-free documents byte-identical (hash the cut list of the existing fixtures).
- Nesting and Buying: core size in a sheet layout; strips in board-foot and by-the-piece; the tape block, rounding up,
  unpriced, metric.
- Properties and the dialog: refusals greyed with reasons; mixed selects; one undo entry per action; delete refused while
  used.
- Live pass on the dev server (Playwright): a banded shelf set, a mitred tabletop with maple edging, an arched apron
  taped, the printed cut list (a real Chromium PDF).

## 10. Open for the user's review

- Price per foot for tape in the DOCUMENT (§2.1) — the first per-project price.
- Tape length rounded up to whole feet when bought (metric shows metres with the bought feet in brackets).
- Joinery, Refine and Repair refuse banded projects in this round (§6).
- Strip rows numbered but with no balloon (§4.2).
