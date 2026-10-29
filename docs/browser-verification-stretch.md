# Browser verification — parametric resize (stretch)

**Date:** 2026-10-29 · **Branch:** `stretch` at `b5e58fa` (pre-merge) · **Where:** the dev server (`localhost:5199`) in the user's own
Chrome over the MobaXterm tunnel, driven through claude-in-chrome · **Spec:** `docs/superpowers/specs/2026-10-28-sloyd-parametric-resize-design.md` §11.

A NEW project, "Stretch check — apron table", holds the check. It is left in place, per the dev-profile ruling. The apron table was loaded
with `replaceDocument(apronTable())` from `src/document/stretchFixtures.ts`, the same fixture the plan tests use, rather than built by
hand in the UI. All nine parts were selected (`selectAll`). Every edit below was made through the real panel: typed into the fields and
applied with a real click.

## Widen 48" → 54" (X, line at the default middle, 24")

- The preview read `48" → 54": grows Front apron, Back apron, Top · moves 3 · 3 stay`.
- The guide plane drew upright at x 24, across the table's depth and height, translucent in the accent colour.
- After Stretch, read back from the store:
  - Right back and Right front leg x 46.25 → 52.25.
  - Right apron x 46.75 → 52.75.
  - Front and Back apron 44.5 → 50.5, with their far-end cuts at offset 43.5 → 49.5 and the near ones unchanged at 0.
  - Top 48 → 54.
  - Left legs and Left apron unchanged.
  - `stretchGuide` null; one undo entry.

## Raise 30" → 32" (Y, line at the default 15")

- The guide plane drew level at y 15.
- After Stretch:
  - All four legs 28.5 → 30.5.
  - Every leg's apron mortise moved up 2 in part terms, in BOTH storage forms: offset-stored 25 → 27, and the right back leg's
    stop-stored `stopMin` 25 → 27 with `stopMax` 0.5 kept.
  - All four aprons y 24.5 → 26.5; Top y 28.5 → 30.5.
  - Two undo entries in all.

## A refusal

- Height 34 with the line at 31 runs through the top's thickness.
- The panel showed `Top would get thicker — the line runs through its thickness; move the line.` (`role="status"`), and Stretch was
  disabled. Cancel cleared it.

## Undo

- Two Ctrl+Z presses (real keys, viewport focused) restored the document: every part's name, size, position, rotation and cut
  numbers equal the fixture's, ignoring ids (the fixture mints fresh ids per call).
- `past` back to 0.
- No console errors throughout.

## After the Ruling 9 fix (`715052a`), same project

- **Shrink back.** With all nine parts selected, the table was first widened to 54" (store action, line 24"). Then, through the
  panel, Width was typed as 48 with the default line (27", the middle of 54").
  - The preview read `54" → 48": grows Front apron, Back apron, Top · moves 3 · 3 stay`. (On a shrink, "grows" names the parts
    that change length.)
  - After Stretch, every part's numbers equal the original fixture's (ids ignored): Top 48, Right back leg x 46.25.
- **The removed-band refusal.** With Front apron, Back apron and Top selected, Width was typed as 46 and the line as `1 3/4` (the
  aprons' end face, the Ruling 9 case).
  - The panel showed `Front apron sits in the wood this shrink removes — move the line or shrink less.`, and Stretch was disabled.
  - Cancel cleared it.
  - Screenshot: `/tmp/claude-chrome-screenshots-fVqADP/screenshot-1793234373416-17.png`.
- **The hole-row refusal** was not shown live: the apron table has no hole rows. The thickness refusal above stands in for the
  live refusal check, and the hole-row sentence is covered by the bookcase plan tests.

## Owed to the user (by eye)

- The panel with an ASSEMBLY selected (`InstanceProperties`): it is only exercised by tests.
- The plane's colour and opacity, and how it reads from below and edge-on.
- A metric project.

Screenshots, in the session's Chrome screenshot directory (not committed; this prose is the record):
- `/tmp/claude-chrome-screenshots-fVqADP/screenshot-1793232792215-13.png` (the panel and preview);
- `-14.png` (the X plane);
- `screenshot-1793232815070-15.jpg` (the Y plane);
- `screenshot-1793232838706-16.png` (the refusal).
