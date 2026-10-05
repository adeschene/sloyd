# Browser verification: quarter turns

2026-10-05. Spec: `docs/superpowers/specs/2026-10-05-sloyd-quarter-turns-design.md`.

## How this was driven

Claude drove the dev server on branch `repeated-parts` (`npm run dev -- --port 5199`, Chromium) with the
Playwright MCP, and **the user watched the same browser** and did the viewport checks. The user approved
one paid joinery run. The model was `claude-opus-5-5`, and the API key was already stored in that
browser.

**Two fixtures, written for this check and imported through the project menu:**

- **"Live turns — legs"** (version 8).
  - Four upright legs, 28 × 1-3/4 × 1-3/4, each with the same two mortises: on the width-max and
    thickness-max faces, 4in long, near the top. The legs are turned 0°, 90°, 180° and 270° at the four
    corners of a 20 × 14 frame.
  - Four butt rails. Each rail meets its leg exactly where a correctly turned mortise opens.
  - **Why the design checks itself:** a leg mapped through the old mirror would show its mortise on an
    outer face.
- **"Live turns — old file"** (version 7, the shipped format).
  - A flat base board at the OLD 90°, with a stopped dado on its top face stopped short of one side.
  - A divider standing in that dado.
  - **Why it checks itself:** a wrong migration would put the dado at the far end of the base, under
    no divider.

## Driven by Claude, read back from storage

- Both files imported. Each is stored as `version: 8`.
- The old file's dado was rewritten from `offset 4` to `offset 15.25`, mirrored along length (20 − 4 −
  0.75). That is the same world place, measured from the other end.

## Done by the user, reported as passing

1. **Turned legs.** With the rails hidden, every leg's two mortises face into the frame, toward its own
   rails. Changing a leg's turn keeps its footprint and swings the mortises round.
2. **Snapping.** On Leg 180°, the Move tool's markers sit on the drawn mortise corners.
3. **The old file.** The divider stands in the base's stopped dado, and the stop is on the divider's
   side. Two reloads changed nothing, so a version-8 file is not migrated again.
4. **Plywood bands.** Two legs were switched to plywood at 180° and 270°. The ply bands read
   continuously across the mortises.

## The paid run: joinery on the turned legs, ≈ $0.02

**The dialog.** It found 8 sites, all end-into-face, and the model chose 8 mortise and tenon. It
reported no new problems, only the original's "Front/Back/Left/Right rail is not held" notes, already
present in the original because the rails butt.

**Measured afterwards.** The joined project was read out of `localStorage` and checked with the
direction-aware world mapping:
- **No voids:** every mortise the joinery cut is completely filled by its rail's tenon, on all four
  legs and both faces each. That covers turns 0°, 90°, 180° and 270°.
- **The fixture's own mortises:** the hand-drawn 4in mortises stay mostly open, because the model chose
  shorter tenons. This is expected.
- **No overlap.** `checkDesign` reports only the four pre-existing `hangs`.

## Not exercised

- A cut part at 180° when shown on the cut sheet. The cut list reads the part's own frame and is
  unchanged by this round.
