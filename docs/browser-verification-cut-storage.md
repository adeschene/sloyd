# Browser verification: storing a cut the way the sheet reads it

Follow-ups 195 and 196, 2026-10-04. Spec: `docs/superpowers/specs/2026-10-04-sloyd-cut-storage-design.md`.

**What the round changed:**
- Joinery stores every cut with `across` set to the direction the cut sheet prints (`storedAsShape`).
- Properties offers **Match the cut list** for a cut stored the other way.
- A square opening's direction now reads only its shape.

**What this pass asked:**
- Does the button bring the row in line with the sheet without changing the sheet?
- Does undo reverse it?
- Do joined designs arrive already matching?
- Does the user's guard hold back the one kind of cut that would change?

## How this was driven

Claude drove the dev server (`npm run dev -- --host 127.0.0.1 --port 5180`, Chromium) with the
Playwright MCP, and **the user watched the same browser**.

**No paid calls.** A throwaway script built three `.sloyd` files, and both the script and the
files were deleted afterward:
- **Bookcase old storage:** the stopped-shelf bookcase, with its housings rewritten to the
  previous round's storage (`across: 'length'`, offset 1/4″, width 10-1/4″, stops 24″ and 47-1/4″).
  The rest of the design is unchanged.
- **Bookcase joined now:** the same bookcase joined by this round's code.
- **Guard corner:** one board holding the exact-square millimetre corner cut pinned in
  `cuts.test.ts`, which the guard refuses.

Files were imported through the project menu. Buttons were clicked from the page, and fields were
read from the DOM.

## Pass 1: the old storage, the note, the click and the undo, which the user passed

**Before the click.**
- On the left side, both housings read on the sheet as `3/4" stopped dado … 24" from the length
  min end, running across the width, stopped 3/4" short of the max end` (and `48"`).
- Their Properties rows showed Runs across **Length**, stops 24″ and 47-1/4″, from the end 1/4″,
  and width 10-1/4″.
- Each housing row carried *"The cut list reads this cut as running across the width."* and a
  **Match the cut list** button.
- The three rabbet rows had neither.

**After clicking it on the 24″ housing.**
- The row read Runs across **Width**: near stop 1/4″, far stop 3/4″, from the end 24″, width 3/4″.
- The note left that row, and focus moved to its "Runs across".
- The autosaved cut was `across: width, offset 24, width 3/4, stops 1/4 and 3/4`.
- The sheet line was unchanged. The 48″ housing still had its own note.
- A first DOM read 300 ms after the click still showed the old numbers. A read 900 ms later
  showed the new ones. The fields adopt the stored value a render later (invariant 5's effect),
  so this was the read's timing, not a defect.

**After one Undo.** The row went back to Runs across Length, with 24″, 47-1/4″, 1/4″ and
10-1/4″. The note and the button returned, and the sheet was still unchanged.

## Pass 2: joined by this round, which the user passed

Every cut arrived stored the way the sheet reads it, and no row had a note:
- each side's housings read Runs across **Width** with 1/4″, 3/4″, 24″ (or 48″) and 3/4″;
- the back, bottom and top rabbets matched their sheet direction;
- Shelf 1's corner notches ran across the thickness, as the sheet reads them.

## Pass 3: the guard, which the user passed

The mm corner cut prints on the sheet as `11/16" notch, 9-3/8" deep — into the length face (min
side), 1/16" from the thickness min end, running across the width, stopped 4-13/16" short of the max
end`. It is stored "Runs across: Thickness", but its row has **no note and no button**. Re-storing
it would move one end by a single ulp, which breaks the exact tie that makes it a notch, so it
would read as a stopped dado. The guard refuses that.

## Verdict

**Passed by the user.**
- Matching a cut changes the row and never the sheet, and one undo reverses it.
- Joinery's own cuts arrive matched.
- The guard holds back the rare cut that would read differently.

## What this pass did not show

- **The note on a square opening decided only by the length-first default** (follow-up 198).
  None of these designs had one.
- **A board growing after a re-store** (follow-up 199).
- **A real "Add joinery…" run:** the designs were joined in a script with the same recipe code, to
  avoid a paid model call.

`localStorage` was cleared in the verifying browser afterward and read back empty (0 keys). The
browser was closed and the dev server stopped. The console showed no errors, only three.js
deprecation notices and GL driver messages.
