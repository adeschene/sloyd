# Browser verification — hardware bill of materials (schema 20)

**Setup:**
- Date: 2026-10-21.
- Dev server on port 5199, branch `hardware` at `b68ea70`, then `c9d5c08` after the fix in §5. This was the DEV server only;
  production was not touched (the deployment rule).
- Browser: the Playwright MCP, headed Chrome. Hardware was added through the UI (Properties' Hardware section and the Materials &
  prices dialog) unless noted. The fixture's parts and assemblies were built through the app's store actions (the same actions the
  UI calls).
- Screenshots and the PDF (`hardware-cutlist.pdf`) are NOT committed: they are in the session scratchpad and will not survive.
  The prose below is the durable record.

**Test project:** `Hardware live check`, created fresh on the dev profile and LEFT in place (the user's ruling). The user's open
project (`Live links — legs`) was not touched. The profile was never cleared.

**Fixture:** a Base cabinet assembly (Left door, Right door, Side), a Drawer assembly (Drawer front), two linked Shelves (one Shape).

## 1. Empty state and the dialog

- Properties with nothing selected shows `Project hardware` and `+ Add hardware ▾`. With no types the menu offers only
  `New hardware type…`, which opened Materials & prices on a new `Other` row with its name input focused
  (`aria-label` "Other: name").
- Types added: `Euro hinge, 35 mm` (4.50), Pull (4.25), Drawer slides (pair), Shelf pin (pack 20 prefilled), and Screw (pack 100
  prefilled) renamed `#8 × 1-1/4" wood screw` (6.99).
- Pack size `0` showed `Pack size must be a whole number from 1 to 10000.` Save made ONE undo entry (past 23 to 24); the types
  were stored with pack size and price as typed (unpriced is `null`).

## 2. Adding hardware

- Part in an assembly (`Base cabinet › Left door`): `+ Add hardware ▾` then Euro hinge focused the new count field; `2` and Enter
  stored count 2. Pull added (1). The Right door was set through the store (2 hinges, 1 pull).
- Assembly (a Drawer instance): Drawer slides (pair) ×1 and Pull ×1, written to the Drawer's definition.
- Shelf (a shared Shape): Shelf pin ×4, stored on the Shape (`shapes[0].hardware`). Project: screws ×40, stored in `doc.hardware`.
- After a reload (autosave then load, at schema 20) the five types and the definition's hardware survived.

## 3. The cut list and Buying

Before any copy, the Hardware section: Euro hinge 4 (`Base cabinet › Left door: 2; Base cabinet › Right door: 2`), Pull 3,
Drawer slides 1, Shelf pin 8 (`Shelf: 4; Shelf (1): 4`), screws 40 (`Project: 40`). Buying:
`Euro hinge, 35 mm: buy 4 · $18.00`, `Pull: buy 3 · $12.75`, `Drawer slides (pair): buy 1 · no price`,
`Shelf pin: 8, buy 1 pack of 20 · no price`, `#8 × 1-1/4" wood screw: 40, buy 1 pack of 100 · $6.99`, and
`Estimated materials: $37.74 (1 material and 2 hardware items have no price) (3 parts not placed)`.

## 4. Copies and Ungroup

- Duplicate Base cabinet (it shares its definition) and Copy in a row of the Drawer (3 in all): hinges 8 (`… 2 × 2`), Pull 7
  (`… 1 × 2; … Drawer: 1 × 3`), slides 3, pins 8, screws 40. Buying: $36.00, $29.75, no price, 1 pack of 20, 1 pack of 100;
  total $72.74. Every number was checked by hand.
- With the 3-copy Drawer selected: `Shared by 3 copies: edits inside change all of them.` and `Counted once per copy: 6 in all.`
  (Pull 1 + slides 1, times 3).
- Ungroup ONE drawer copy: every total unchanged; the project's hardware gained `Pull×1` and `Drawer slides (pair)×1` beside the
  screws. Undo restored it (5 instances, the project back to one entry).

## 5. Live bug found and fixed

Selecting the SHAPED Shelf crashed the app (`The result of getSnapshot should be cached…`, `Maximum update depth exceeded`, a blank
page). Cause: `holderHardware` read the part through `resolveBoard`, which returned a fresh copy of `hardware` per call, so
Properties' selector returned a new array each time. Fixed in `c9d5c08`: stored arrays for every target and a frozen empty fallback;
identity tests and a shaped-part render test, both RED on the old code. The unit tests had not rendered the section for a shaped
part. Invariant 55 records the rule.

## 6. On paper

The printed cut list as a real Chromium PDF (`page.pdf()` through `run_code`, Letter): 2 pages. Page 1 carries the Hardware section
with names, totals and where-used lines; page 2 carries Buying's Hardware block and the total, as on screen.

## Not exercised live

- Refine and joinery with hardware: unit-tested with the fake client; a paid run needs the user's approval.
- Metric display: hardware text carries no lengths.
- The exploded lock: unit-tested.

## For the user's eye (wording, not defects)

- `Counted once per copy: 6 in all.` sums different types (fu 412).
- The link note (`Linked with 1 other part: edits to size, material, grain, posture or cuts change all 2.`) does not mention
  hardware, which is now shared too (fu 411).
- An Ungroup refused for a merged count over 999 is silent (fu 410).
- The four dialog refusal words and the count field's `Enter a whole number, 1 to 999` (spec *Amended (implementation)*).
