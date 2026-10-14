# Browser verification — holes, chunk 1

**Date:** 2026-10-14 · **Branch:** `holes` · **Where:** the dev server (`localhost:5181`) in the Playwright browser, software GL
(llvmpipe). Two passes: one after Task 10 (all features), one after Task 11b (performance rework of the mesh builders).
Screenshots were kept in the git-ignored SDD workspace (`.superpowers/sdd/2026-10-14-sloyd-holes-chunk1/live*.png`), as
earlier rounds did; this prose, with its numbers, is the durable record.

The dev profile's state was recorded first (three projects, active "Shaker Side Table — joined", an API key present —
checked for presence only). Each pass imported its fixture as a NEW project and deleted only that project afterwards; the
active project was switched back and the starting state confirmed after each pass.

## Pass 1 — features (fixture: 30 × 11-1/4 × 3/4 side, a 3/4 × 1/4 dado at 10", a 6-pin row and a 3/8 through-bore)

| Check | Result |
|---|---|
| A schema-16 file imports and opens | ✅ new project, active |
| Holes section | ✅ "Holes · 2"; each row's line equals the cut-list wording (`Row of 6 holes 1/4" dia × 3/8" deep … every 1-17/64" (32 mm), last at 8-5/16"; 1-1/2" in from the width min side`); menu reads "+ Add hole ▾" |
| Holes render open (Iso, close-up) | ✅ clean openings, lit walls with grain, no cracks visible at the rim |
| Through-bore (Top, orthographic) | ✅ the ground shows through it |
| Pins next to the dado (seam at the dado floor inside every pin) | ✅ dark bottoms, no membrane |
| Shrink the part to 7" (Review Focus 2) | ✅ row kept as stored; note "Hole 5 runs past the length max end at this size. (and 1 more)"; the bench line ends "— check: hole 5 runs past the length max end (and 1 more)" |
| Count 5 on the faulted row | ✅ accepted (removes a fault, adds none) |
| Count 7 | ✅ refused with the field's own alert ("Puts hole 6 past the length max end — …"); focus kept; `aria-invalid="true"` |
| Add joinery / Refine on the holed project | ✅ both refuse ("… doesn't handle parts with holes yet (Side) …"), Run disabled, no Repair offered |
| Console | ✅ 0 errors (three.js deprecation warnings only, pre-existing) |

**Found in pass 1:**
1. **Performance — fixed in Task 11b.** A full mesh rebuild of a holed part (every resize-drag frame) measured 107 ms for
   two 21-pin rows, 131 ms with a clear dado, ~580 ms with a faulted row crossing a dado, against 0.5 ms without holes.
   After Task 11b (node, median): 11.9 / 12.1 / 24.7 ms; guarded by `src/viewport/holesPerf.test.ts`.
2. **Wall grain seam — deferred by the user** to a later texture/shader session: the per-facet nearest-plane rule
   (spec §3.2) switches a bore's wall from end-grain rings to long grain halfway round, with a hard seam. The user: "It
   looks pretty bad and the seam is very clear." A seamless look needs cylindrical or triplanar mapping.
3. Rim lines could not be told apart at screenshot scale; the part's own edge lines are equally faint at that zoom. Rims
   are unit-tested only (Task 6).
4. Cosmetic: the existing `.cut-label` CSS capitalises every word, so a row reads "Row Of 6".

## Pass 2 — after Task 11b (fixture: the same side with two 21-pin rows, a dado at 28-1/4" clear of them, a through-bore)

| Check | Result |
|---|---|
| 42 pins and the bore render open (Top, orthographic) | ✅ |
| Seam faces inside holed bodies are no longer drawn; no membrane | ✅ dark pin bottoms |
| Remove all rows, then undo back | ✅ every step one undo entry; rows restored |
| In-browser rebuild timing | ⚠️ meaningless here: software GL dominates every frame (1.5–7 s per edit with holes, 3–9 s *without*). The node/vitest numbers above are the measure; smoothness on real hardware is for the user. |

## Not exercised live, and why

- **Tape centre-to-centre.** r3f's raycaster ignores synthetic pointer events on this host; the centre snap points are
  unit-tested (Task 5).
- **A holed part in a mirrored copy.** Unit-tested through the one composition (Task 4: chiral fixture, every posture and
  turn, write-back without drift).
- **Faded (transparent) holed parts.** Task 11b stopped drawing interior seam faces in holed bodies, which unholed bodies
  still draw on the box path; at 0.15 opacity the two could look slightly different. Owed a look on real hardware.

## For the user on real hardware (26a)

Hole wall shading and grain (and the seam above), rim lines, and drag smoothness on a drilled cabinet side.
