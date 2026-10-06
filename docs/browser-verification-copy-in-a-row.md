# Browser verification: copy in a row

2026-10-06. Spec: `docs/superpowers/specs/2026-10-05-sloyd-copy-in-a-row-design.md`.

## How this was driven

Claude drove the dev server on branch `copy-in-a-row` (`npm run dev -- --port 5199`, Chromium)
with the Playwright MCP, and **the user watched the same browser** and then tried the form
themselves. No paid calls were made.

- **Input.** Real mouse clicks and real typing (`page.mouse`, `page.keyboard`) drove the form, so the
  focus, blur and click order is a real browser's.
- **Fixture.** "Live copy in a row", imported from `.playwright-mcp/`. It holds four parts:

  | Part | Size | Lies | Position |
  |---|---|---|---|
  | Slat | 24 × 3-1/2 × 3/4 | flat | origin |
  | Shelf | 30 × 11-1/4 × 3/4 | flat | — |
  | Leg | 28 × 1-3/4 × 1-3/4 | upright | — |
  | Rail | 16-1/2 × 4 × 3/4 | on edge | against the leg, at 22in |

Positions were read back from `localStorage` after each step.

## Driven by Claude, read back from storage

- **8 slats, gap 1/2, +Z.**
  - Count was 8, then the gap was typed and **Apply was clicked straight away, without Enter**.
  - Slats landed at z = 0, 4, 8 … 28 (3-1/2 + 1/2): the blur commit lands before the click.
  - The panel switched to "8 parts selected".
- **One Ctrl+Z** removed all seven copies.
- **A refused gap, Apply clicked straight away.**
  - −1/2 was typed in Gap and Apply clicked with no Enter.
  - The field kept `-1/2` with `aria-invalid="true"`, Apply was disabled, and **no row was made**.
  - That closes follow-up 218 in a real browser.
- **Count in real Chrome:**

  | Typed | Result |
  |---|---|
  | (empty) | refused and marked invalid ("A row has 2 to 100 parts.") |
  | `2.` | reads as 2 |
  | `2.5` | refused and marked invalid |
  | `1e2` | reads as 100, the maximum |

- **3 shelves fitted across 30in, +Y.**
  - Summary: "3 in the row: 2 copies, gap 13-7/8", row 30" long".
  - Shelves landed at y = 0, 14.625 and 29.25: 30in outer to outer.
- **A leg at pitch 20, −Z.** The copy landed at z = −50, 20in behind the original at −30.
- **A leg-and-rail group, pitch 24, +X, count 3.**
  - Summary: "gap 5-3/4"" (the unit is 18-1/4in wide).
  - Legs landed at x = 0, 24, 48 and rails at x = 1.75, 25.75, 49.75. Every rail keeps its leg's exact
    offset.
  - "6 parts selected" afterwards (the originals plus the copies).
- **Cut list.** It grouped the legs into one row: "4 × 28" × 1-3/4" Leg, Leg (1), Leg (2), Leg (3)".

## Done by the user, reported as passing

- The rows read correctly in the 3D view.
- The form, tried by hand:
  - each mode works;
  - a bad value disables Apply, with the reason given;
  - a typed Pitch survives a Direction change.
- A large row with a group gizmo drag afterwards.

## Not exercised

- Copies toward −Y below the floor. The spec allows them and the design checks report them, as for
  any part.
