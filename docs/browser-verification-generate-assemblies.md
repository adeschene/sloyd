# Browser verification — generated assemblies and components (2026-10-09)

Dev server (`npm run dev -- --port 5199`) on branch `generate-assemblies` at `7101fa4`, driven
through the Playwright MCP (headed, the user watching), software GL. The user approved both paid
runs in conversation. The browser profile already held an API key from an earlier session; it was
used as stored and never read into chat.

## 1. Generate — "A three-drawer chest", Moderate, 1 generation

- Dialog label read `Moderate (up to 30 different parts)`.
- Finished `Ready`, `≈ $0.07`, **no issues**.
- Saved project `Three-Drawer Chest` (read from `localStorage`, `version: 11`, no `"role"` anywhere
  in the stored JSON):
  - **One definition, three placements:** `Bottom drawer`, `Middle drawer`, `Top drawer`, all
    `rotation: 0`, positions `[-14.25, 3.75|13|22.25, -9.75]`. The definition holds 7 parts (Pull,
    Drawer face, Left/Right drawer side, Box front, Box back, Drawer bottom).
  - **Role linking:** three shapes — the case's Left/Right side (30-3/4 × 18 × 3/4 plywood), the
    Lower/Upper divider (28-1/2 × 17-1/2 × 3/4), and the drawer's Left/Right side (16 × 6 × 1/2,
    inside the definition, so "Linked, 6 parts" across the three drawers). Box front and Box back
    are equal in size but stayed plain: the model gave them different roles, which is the
    role-plus-equality rule working as designed.
  - Loose: 8 case parts. Distinct parts 15, placed 29 — inside Moderate's 30 / 120.
- Parts list (DOM): each drawer row shows `×3` ("Shared, 3 copies"); linked parts show
  "Linked, 2 parts" / "Linked, 6 parts".

## 2. An edit inside one copy changes all three

Selected `Middle drawer › Drawer face`, set Width `8-1/4"` → `8`. Stored result: one definition,
its Drawer face `width: 8`, all three instances still pointing at it. Selecting the Bottom and Top
drawers' faces read `Width 8"` (at Y `3-3/4"` and `22-1/4"`). Undo restored `8.25`.

## 3. Add joinery on the generated tree

41 sites listed (11 case, 10 per drawer × 3, named `Placement › Part`), `≈ $0.06`. Finished
`Done`, `≈ $0.07`, saved as `Three-Drawer Chest — joined`: 29 joints (18 dados, 8 stopped dados,
3 rabbets). "Moved/Trimmed: Box back" reported for all three drawers alike.

Stored result: **the drawer definition is still ONE definition used by all three placements**
(identical joints in every copy, so joinery's share-where-identical rule kept it shared); its sides
and bottom carry 3 cuts each. The case dividers stayed linked (2 cuts on the shared shape). The case
sides and the drawer sides, cut as mirror images, came out unlinked — the existing rule (sharing
only where cuts are identical by geometry), not a regression.

## Console

0 errors. Warnings only from three.js deprecations (`THREE.Clock`, `PCFSoftShadowMap`) and the GL
driver (`GPU stall due to ReadPixels`), none from the app.

## Not confirmed here

- Whether a design whose drawers float or overlap gets the collapsed repair wording live: this run
  came back clean on the first call, so no repair round happened. The wording is pinned by unit and
  run tests only.
- Production: not deployed in this round's verification.

## Cleanup

The two projects this check created (`Three-Drawer Chest`, `Three-Drawer Chest — joined`) and the
pre-existing projects and key in this dev profile are left for the user to decide on; see the
session's closing note.
