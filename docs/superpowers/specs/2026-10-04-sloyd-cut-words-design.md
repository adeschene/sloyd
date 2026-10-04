# Sloyd — cut-list wording (follow-ups 180, 181, 189)

**Date:** 2026-10-04 · **Status:** approved in conversation, section by section

**Builds on:**
- the stopped-cuts spec (§4.1, the old label table);
- the joinery spec (`pocketFor`, the mortise-and-tenon recipe);
- follow-up 178 (`cutsThatRemoveStock`).

## 1. Problem and goal

Three common joints print the wrong word on the cut list:

- **180.** A tenoned rail prints four "rabbet" lines per end. Joinery cuts a tenon as up to four
  shoulder pockets.
- **181.** A rabbet stopped at both ends prints as "stopped dado". `cutLabel` reads the cut's
  stored fields. The same pocket can be stored two equivalent ways (which in-plane dimension is
  `across`), and `pocketFor` may pick either, so one shape can get two words.
- **189.** A shelf housing closed at both ends prints as "mortise".

**Goal.** A woodworker reading the sheet sees the word they would use at the bench, and the same
cut always gets the same word.

**Scope.** Words only:
- no geometry, cut, stop or depth changes;
- no schema change;
- no change to how cut-list rows group.

The drawings print no cut words (`DiagramCut.kind` is carried but never rendered), so they are
unaffected.

**The user's three rulings:**
1. A closed pocket is named **by its proportions**: deeper than wide is a mortise, otherwise a
   blind dado.
2. The **naming table** in §2.2.
3. **One setup line per tenon**, which replaces its shoulder lines.

## 2. Naming one cut: `cutLabel`, rewritten

### 2.1 The opening

1. Take `cutRegion(board, cut)` clipped to the board.
2. The **entry face** is `cut.face`. The opening is the clipped box's span on the two other
   dimensions, call them `a` and `b`.
3. On each of `a` and `b`, the opening is **open at min** if its low end is within
   `FLUSH_EPSILON` of 0, and **open at max** if its high end is within `FLUSH_EPSILON` of the
   board's dimension.
   - `FLUSH_EPSILON` is the existing 1e-9.
   - The tolerance is the existing one because a clamp can leave `offset + width` a few ULP short
     of the dimension.

### 2.2 The table (the user's ruling)

| Sides open | Word |
|---|---|
| all four | `rabbet` |
| both ends of one axis, and one side of the other | `rabbet` |
| both ends of one axis, neither side of the other | `dado` |
| one side of each axis (a corner) | `stopped rabbet` |
| exactly one side, on axis `a`, and the opening's extent along `a` is **greater** than along `b` | `stopped dado` |
| exactly one side, and it runs along that side **more than 4×** as far as it reaches in (a long edge rabbet stopped at both ends) | `stopped rabbet` |
| exactly one side, otherwise (a short pocket along an edge, like a hinge pocket) | `notch` |
| none, and `depth >= board[face]` | `through mortise` |
| none, and `depth >` the opening's smaller extent | `mortise` |
| none, otherwise | `blind dado` |

**The word comes only from the clipped box,** so two cuts with the same box get the same word
whatever their stored fields (181).

**Ties:**
- "greater" is strict, so a square pocket open on one side is a `notch`;
- "more than 4×" is strict too, so a 3″ hinge pocket reaching 3/4″ in is a `notch`. The 4× rule
  was added at the user's request when they reviewed the spec;
- "deeper than wide" is strict too, so a pocket as deep as it is wide is a `blind dado`.

**`CutKind` gains `'blind dado'`.**

**A cut that removes nothing** (follow-up 178's `cutRemovesNothing`) has no opening to read. It
keeps the word the OLD table (stopped-cuts spec §4.1) gives from its stored fields. Only its
flagged Properties row shows it, because the sheet already hides such a cut. The old table
stays as a private helper used for this case alone.

### 2.3 What changes, and what doesn't

**Every case the old table named correctly keeps its word,** and each one is pinned by a test:
- a mid-face dado;
- an end or edge rabbet;
- a dado stopped at one end;
- a rabbet stopped at one end;
- a blind tenon mortise;
- a through mortise.

**The changes:**
- **181:** an edge rabbet stopped at both ends is open on one side only, its edge.
  - Long along that edge (more than 4× its reach), it reads `stopped rabbet`. The joinery round's
    Top back rabbet (30-3/4″ long, 1/4″ in) is this case.
  - Short, it reads `notch`.
  - If it reaches in further than it runs, it reads `stopped dado`.
  - Either way, the stored-two-ways pair agrees.
- **189:** a closed shallow housing now reads `blind dado`.
- **The old `notch` row** (flush plus both stops) now reads `notch`, `stopped dado` or `stopped rabbet`
  according to its proportions (§2.2).

## 3. Recognising a tenon: `findTenons(board)`

This is a new pure function in a new file, `src/document/tenons.ts`, re-exported from
`document.ts`. It imports `cuts.ts` and `geometry.ts` and nothing above the document layer.

For each end of the board's **length** dimension (`'min'`, `'max'`):

1. **Candidates** are the cuts from `cutsThatRemoveStock(board)` whose clipped box on `length` is
   `[0, ℓ]` (min end) or `[L − ℓ, L]` (max end), with `ℓ ≤ L / 2`.
   - The cap stops a full-length edge rabbet, which reaches both ends, from ever counting.
2. **Grouping.** Candidates are grouped by `ℓ` within `FLUSH_EPSILON`. At the max end, `ℓ = L − lo` is a subtraction, so an exact comparison could split a true group.
3. **A group is a tenon when all of these hold:**
   - it has **at least two cuts** (a single end rabbet is a lap, and stays a rabbet);
   - the cross-section `[0, width] × [0, thickness]`, minus the union of the group's in-section
     rectangles, leaves **exactly one rectangle**;
   - that rectangle is **strictly smaller than the section** on at least one axis.

   The remaining area is found by splitting the section at every rectangle edge and keeping the
   cells no rectangle covers. "Exactly one rectangle" means those cells exactly fill their own
   bounding box.
4. **The result:** `{ end, length: ℓ, thickness, width, cutIds }`.
   - `thickness` and `width` are the remaining rectangle's extents along the board's own
     `thickness` and `width`.
   - The rectangle need not be centred, so a barefaced tenon counts.

**Not a tenon:**
- no remaining rectangle (the end is cut away entirely);
- two or more remaining rectangles (a bridle slot leaves two);
- a group whose cuts do not share one `ℓ`.

## 4. Where tenons show

### 4.1 Setup lines (`cutlist.ts`)

For the row's representative board:
- each tenon prints **one line**, `<ℓ> tenon, <thickness> thick × <width> wide — at the length <min|max> end`;
- its cuts print no line of their own;
- the tenon's line goes where its **first** cut's line would have gone;
- every other cut prints exactly as today, byte for byte, which a test pins.

`formatLength` formats the numbers, as `setupLine` already does.

### 4.2 Properties (`CutRow`)

A cut whose id is in some tenon's `cutIds` is labelled **`tenon shoulder`**, both in its head and
in its remove button's `aria-label`. Every other cut uses `cutLabel`. Each stored cut keeps its
own row and fields.

### 4.3 Unchanged

- `cutSignature`'s grouping. Two rails with the same tenons still share a row.
- `DiagramCut.kind`, which takes the new `cutLabel` and stays unrendered.
- Nesting and board feet.

## 5. Testing

**`cuts.test.ts` (the table):**
- every row of §2.2;
- the 181 pair: one box stored with `across` on each in-plane axis gives one word;
- the 189 shelf housing (3/4″ wide, 1/4″ deep, closed) gives `blind dado`;
- the joinery mortise (1/2″ wide, 2″ deep) gives `mortise`;
- each still-right old case, pinned to its old word;
- a cut that removes nothing keeps its old-table word.

**`tenons.test.ts`:**
- **The fixture is real recipe output.** Apply `applyJoints` with a mortise and tenon to a
  leg–rail pair, then read the rail.
- **Cases:**
  - four-shoulder;
  - two-cheek (shoulders absent);
  - barefaced (one cheek plus edge shoulders);
  - tenons at both ends;
  - a single end rabbet: none;
  - a bridle slot (two remaining rectangles): none;
  - two end cuts with different `ℓ`: none;
  - a full-length edge rabbet pair: none (the `ℓ ≤ L/2` cap).

**`cutlist.test.ts`:**
- the joined rail prints exactly two tenon lines, with the exact strings;
- a plain dado's line is byte-identical to today's.

**`Properties.test.tsx`:** a tenon's cuts read `tenon shoulder`, and a lone rabbet reads
`rabbet`.

**Mutation testing** is applied to every plan-supplied test. The hardest look goes to:
- the strictness of the two ties;
- the "exactly one rectangle" test;
- the `ℓ ≤ L/2` cap.

## 6. Live check

No paid calls. On the dev server, with the user watching, load the joined workbench and the
joined bookcase built from fixtures with the default joints, then read their cut lists. The
user judges the words.

## 7. Docs

- **`follow-ups.md`:** close 180, 181 and 189.
- **CLAUDE.md:**
  - the `cuts.ts` entry: the table is derived from the opening;
  - the new `tenons.ts` entry;
  - the rounds row after the live check.
