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

---

# Chunk 2 (2026-10-13): Generate and Refine with tapers

Dev server (`npm run dev -- --port 5181`) on branch `ai-tapers-chunk2` (head `3709a8d`), Playwright MCP, software GL. DOM
clicks and `locator.fill`, as in chunk 1. Baseline library: `b_mv4tzn73_1` "Untitled". The user entered an API key in
Settings themselves; **two paid runs, each approved by the user at the time**.

## 1. Refine accepts a tapered project (free)

Imported `AI tapers refine check` (leg 1.75x28x1.75 tapered +x/+z toward -y, start 22, amount 3/8; Rail X and Rail Z at
23.5) as a new project. Claude, Refine: the dialog shows the instruction form with no refusal (before chunk 2 it refused
"Refine doesn't handle angled parts yet").

## 2. A non-standard taper is refused (free)

Imported `AI tapers odd taper` (the same leg with one taper stored as points [[0,0],[20,0.5]]). Refine dialog:
"Leg's taper can't be described to Refine — edit it in Properties first." No form, no Run.

## 3. Paid Generate

"Shaker side table with tapered legs", Style Shaker, 1 generation, Moderate. **Ready in 18s, ≈ $0.05** (Generate shows no
pre-run estimate). Saved unactivated as `b_mv6d3mmf_m` "Shaker Side Table", then opened. Read from storage:

- four legs 1-1/2 x 1-1/2 x 25-1/4 upright, each tapered 1/2" on its two INSIDE faces toward the floor, starting at 20":
  front left +x/+z, front right -x/+z, back left +x/-z, back right -x/-z (the prompt's corner rule, followed exactly);
- four 5" aprons from 20-1/4" to 25-1/4" (every taper starts below them), linked in two Shapes (front/back, left/right);
  the legs stay unlinked (mirrored tapers, spec §1); a 20 x 18 x 3/4 top;
- no issues reported: no taper-joint fault, so no repair round.

Screenshot: `docs/img/ai-tapers-generated.png`.

## 4. Paid Add joinery

The dialog (free to open) listed 12 sites (4 leg→top, 8 apron→leg), no refusal, estimate **≈ $0.02–$0.14**. Run: **Done in
12s, ≈ $0.03** (inside the range), saved as "Shaker Side Table — joined" (`b_mv6d603x_1r`): "8 joints: 8 mortise and tenon",
no problems listed. Read from storage: each leg has two mortises (on its inside faces, at apron height), length unchanged,
and its angle cuts identical to the generated leg's; the aprons grew 1-3/4" (two 7/8" tenons) and still share their two
Shapes; the leg→top meetings were left butt.

## 5. Not confirmed

- Software GL (llvmpipe): the look of the tapered legs was not judged on real hardware (fu 26a; chunk 1 shading approved).
- A paid Refine of a tapered design was not run (the free checks cover its gates; `run.test.ts` covers the loop).

## 6. Cleanup readback

Deleted the two imported projects (Delete, confirm). The generated pair (`b_mv6d3mmf_m`, `b_mv6d603x_1r`) was left for the
user to look at. Keys after: `sloyd.library.v1`, `sloyd.autosave.v1`, `sloyd.project.b_mv4tzn73_1` and the two generated
projects (plus the user's own key). `localStorage` was not cleared.

---

# Turned links (fu 301, 2026-10-13)

Dev server (`npm run dev -- --port 5181`) on branch `turned-links`, Playwright MCP, software GL. **Free; no paid run.**

1. **Fixture.** The test-only `SHAKER_TABLE_JSON` (four inside-tapered legs, role `leg`) through `parseDesign` →
   `designToDocument(…, { centre: false })`, imported as "Turned links check". Stored: ONE Shape; the legs are at turns
   FL 0°, FR 270°, BL 90° and BR 180°.
2. **Linked.** Leg BL selected: Properties reads "Linked with 3 other parts: edits to size, material, grain, posture or cuts
   change all 4." Turn 90°, two Taper rows (width max side, thickness max side, from the length min end).
3. **One edit moves all four.** Starts 22-1/2" → 19" in both rows. Stored Shape tapers: `[[0,0.5],[19,0]]` on both faces;
   all four legs still point to the one Shape, with unchanged turns and positions. Screenshot:
   `docs/img/turned-links-legs.png`.
4. **Size edits** were measured by the final review rather than live: a width-only edit grows legs along different axes
   (fu 318, accepted by the user).
5. **Cleanup.** The imported project was deleted (the library's active project became "Shaker Side Table — joined"; it had
   been "Shaker Side Table"); the fixture file was removed. `localStorage` was not cleared.
