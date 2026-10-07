# Browser verification: components

2026-10-07. Spec: `docs/superpowers/specs/2026-10-06-sloyd-components-design.md`.

## How this was driven

**Headless, and the user did not watch.** The Playwright MCP's Chrome is pinned to
`DISPLAY=localhost:10.0`. That is an SSH X11-forwarding display, which is how the user watched
earlier rounds. That session's far end had gone (sshd still held port 6010, with nothing
answering), so the MCP browser hung at launch.

At the user's instruction, Claude ran the check with its own script instead:
- the same Playwright library, driving the system Chrome (`/opt/google/chrome/chrome`) headless;
- WebGL through SwiftShader;
- one persistent profile across steps, so the project survived between runs.

The screenshots and storage readouts below are the record. No paid calls were made.

- **Server.** The dev server on branch `components` (`npm run dev -- --port 5180`).
- **Input.** Real clicks on the parts list and Properties, real key presses (Ctrl+Z,
  Escape), a real file chooser for Import.
- **Fixture.** "Components check", a **v10** file (`.playwright-mcp/components-v10.sloyd`):
  - four 28 × 1-3/4 × 1-3/4 oak legs, linked with the label `L`, turned 0°, 90°, 180° and 270°;
  - one assembly, "Drawer", made of five parts, one side carrying a groove.
- **Reading state.** State was read back from `localStorage` after each step.
- **A timing caveat.** Autosave is debounced, so a read made immediately after an edit can
  show the previous state. Where that happened (steps 4 and 5), the next readout or the cut
  list confirms the result, and this says so.

## Results

1. **A v10 file loads as v11, and nothing moves.**
   - The link became ONE shape (28 × 1-3/4, upright) with four users.
   - Each leg is now a shaped part that kept its exact position and turn (0/90/180/270).
   - All four rows kept the chain icon, "Linked, 4 parts".
2. **Duplicate shares.**
   - Duplicating the drawer twice gave "Drawer (1)" and "Drawer (2)". All three name the same
     definition, so the document still has exactly one.
   - Each row shows `×3` ("Shared, 3 copies").
   - The assembly panel reads "Shared by 3 copies: edits inside change all of them." with
     **Select copies** and **Make Unique**.
3. **An edit inside one copy changes every copy.**
   - Opening Drawer (1) through its Side row and typing Length 18 changed the one definition.
   - **Add cut** added one cut, with one id, to that definition, so all three copies have it.
   - Two Ctrl+Z restored 16-1/2" and the single original groove, still one shared definition.
   - Screenshot: `docs/img/components-edit-inside.png`. The legs are faded while a drawer is
     open.
4. **Make Unique splits one copy off.**
   - On "Drawer (2)", Make Unique gave it its own definition (2 definitions); the other two
     rows now read `×2`.
   - Length 20 on Drawer (2)'s Side changed only that copy. The cut list shows
     "1 × 20" × 6" Drawer (2) › Side" beside "2 × 16-1/2" × 6" Drawer › Side, Drawer (1) › Side".
     (The storage read right after the edit came too early for autosave; the cut list is the
     confirmation.)
5. **Linked legs on a shape.**
   - Leg 0's panel reads "Linked with 3 other parts: edits to size, material, grain, posture
     or cuts change all 4." with Select linked and Unlink.
   - **Add cut** on Leg 0 wrote one cut into the shape, so every leg has it.
   - **Posture → On edge** on Leg 2 changed the shape, and every leg re-pivoted about ITS OWN
     centre. Checked per leg from the stored positions, e.g. Leg 0 (0°): x centre −4 + 0.875 =
     −3.125 before, −17.125 + 14 = −3.125 after; Leg 1 (90°): the z centre is unchanged the
     same way.
     Screenshot: `docs/img/components-linked-legs.png`.
   - One Ctrl+Z restored upright for all four (the read straight after the undo lagged; the
     next read shows upright).
   - **Unlink** on Leg 3 left it a plain upright part, and the other three show
     "Linked, 3 parts".
   - **Link** of Leg 0 + Leg 3 put all four back on one shape.
   - **Select linked** from Leg 1 selected all four legs.
6. **The joinery dialog** found 51 sites, each named by its path. Many cross between drawers
   because the duplicates sit exactly on top of one another; that is the fixture's doing,
   not a defect. No paid run.
7. **Reload.** The saved project was byte-identical before and after, and the tree came back
   with its `×2` rows.
8. **A v9 file imports unchanged.** The round-1 drawer file came in as v11 with every part's
   size, position, turn and cut exactly as written, no shapes and no assemblies.

No page errors in any step.

## Not exercised

- **A paid joinery run** on shared copies. Share-where-identical is pinned by
  `writeBackFlat`'s tests and `runJoinery.test.ts` (follow-up 223's twin-fixture test).
- **Real hardware.** Everything above ran on SwiftShader; follow-up 26a applies to anything
  visual. The user has not looked at this round by hand.
- **Moving copies apart with the gizmo.** The copies stayed stacked. Moving an assembly is
  round 1's code, unchanged here.
