# Browser verification — AI tapers, chunk 1 (2026-10-13)

Dev server (`npm run dev -- --port 5181`) on branch `ai-tapers-chunk1`, Playwright MCP, software GL. Clicks timed out
waiting for stability (the render loop), so interactions went through DOM clicks, and typed input through `locator.fill`
plus Enter. **No paid run.**

## 1. Fixture

Schema 14. Leg upright 1.75x28x1.75 at the origin with two inside tapers (face width/max and thickness/max, alongFrom
min, points [[0,0.375],[24,0]]); Rail X on-edge 18x3x0.75 at [1.75,23.5,0.5]; Rail Z on-edge, turn 90, at
[0.5,23.5,1.75]. Imported through Project menu, Import, as a NEW project (`b_mv642rbd_1`). Baseline library: one project
`b_mv4tzn73_1` "Untitled"; keys `sloyd.library.v1`, `sloyd.autosave.v1`, `sloyd.project.b_mv4tzn73_1`.

## 2. Refused: the taper runs into the joint

Claude, Add joinery. Dialog `innerText`: "Add joinery / Choose joints for AI tapers check. The result is saved as a new
project; this one is not changed. / Leg's taper runs into its joint with Rail X — start it at 23-1/2" or less from the
length min end, or remove it. / Close / Set up your API key". No estimate, no Run. Screenshot:
`docs/img/ai-tapers-joinery-refused.png`.

## 3. Accepted after moving the taper start

Leg selected; Properties Angles rows read Face / Starts 24" / Removes at that end 3/8" (twice). Typed 22 + Enter in each
Starts field, both read 22". Add joinery again: "... Rail X → Leg: end into face / Rail Z → Leg: end into face / Close /
Set up your API key". The refusal is gone and two sites are listed. Screenshot: `docs/img/ai-tapers-joinery-accepted.png`.

## 4. Not confirmed

- No paid joinery run: the dev profile has no API key (fu 283 territory). The accepted run is covered by
  `runJoinery.test.ts`; the live pass shows only the dialog's gate and site list.
- Software GL (llvmpipe): the viewport's look of the tapered leg was not judged (fu 26a).

## 5. Cleanup readback

Deleted only the imported project (Delete, confirm "Delete AI tapers check?"). Library index read back: projects =
[`b_mv4tzn73_1` "Untitled"], keys = the three baseline keys. Untitled's `savedAt` changed: the switch back flushed and
re-saved the active project (invariant 29 behaviour); its content was not edited. `localStorage` was not cleared.
