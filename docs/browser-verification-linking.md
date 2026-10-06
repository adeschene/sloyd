# Browser verification: linking

2026-10-06. Spec: `docs/superpowers/specs/2026-10-06-sloyd-linking-design.md`.

## How this was driven

Claude drove the dev server on branch `linking` (`npm run dev -- --port 5199`, Chromium) with the
Playwright MCP, and **the user watched the same browser** and then checked the visual and
hands-on cases themselves. No paid calls were made.

- **Input.** Real mouse clicks and real typing (`page.mouse`, `page.keyboard`), modifiers held
  with `keyboard.down`/`up`, so focus, blur and click order are a real browser's.
- **Fixture.** "Live links — legs", a **v8** file imported from `.playwright-mcp/`: four legs,
  Leg 0°, Leg 90°, Leg 180° and Leg 270°, each 28 × 1-3/4 × 1-3/4 upright and turned as named, at
  the corners of a 20 × 14 frame, with four butt rails.

State was read back from `localStorage` (`sloyd.project.<activeId>`) about 900ms after each step,
once autosave had run.

## Driven by Claude, read back from storage

- **A v8 file loads.** It came back as version 9 with no `link` key on any part, unchanged.
- **Link four identical legs.**
  - The legs were selected in order and **Link** was clicked.
  - No "will match" line was shown, because nothing differed.
  - All four carried one label, and each row had a chain icon.
  - Each leg's single panel read "Linked with 3 other parts: edits to size, material, grain,
    posture or cuts change all 4."
- **Add a cut to one member.** Add cut on Leg 90° put the same cut, **with the same cut id**, on
  all four legs.
- **Shared edit.** Length 30 on one leg set all four to 30. Each kept its own turn and position.
- **One Ctrl+Z** put all four back to 28.
- **Unlink one.** Leg 270° was unlinked and its length set to 26. The other three stayed at 28 and
  stayed linked.
- **Copy in a row of a linked leg.** Leg 0°, pitch 40, +X, count 2:
  - summary "2 in the row: 1 copy, gap 38-1/4", row 41-3/4" long";
  - "Leg 0° (1)" landed at x = 40, **in the link**, with the cut and its id.
- **Reload.** The links persisted: Leg 0°, Leg 90°, Leg 180° and Leg 0° (1) linked; Leg 270°
  unlinked at 26.
- **Cut list.** It showed two rows: "4 × 28" × 1-3/4" Leg 0°, Leg 90°, Leg 180°, Leg 0° (1)", with
  the dado printed once, and "1 × 26" × 1-3/4" Leg 270°".

## Done by the user, reported as passing

- On each turned linked leg, the shared cut faces the way its turn points it. The copy matches
  Leg 0°.
- **Edit through a hidden member.** A leg was hidden, a shared field was edited on another member,
  and Show all revealed that the hidden leg had changed too. One Ctrl+Z reverted every leg.
- **Select linked** selects the members, and skips a hidden one.
- **The "will match" line.** It appears when linking parts that differ, and its count includes the
  unselected members of a link that is pulled in.
- **Posture.** Changing one linked leg's posture changed every member's, each about its own
  centre.
- The chain icon is readable, including on a selected row.

## Not exercised

- Joinery on linked parts. Its result (any linked part it cuts comes out unlinked) is pinned by
  `runJoinery.test.ts` and is open by decision (follow-up 223). No paid run was made.
