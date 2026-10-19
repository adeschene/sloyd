# Browser verification — swept rebuild speed, chunk c2

**Setup:**
- 2026-10-19. Production build (`npm run build` + `vite preview`, port 5181), in the Playwright MCP browser under software GL.
- Project: `.playwright-mcp/swept-check.sloyd.json` (gitignored). Its **Cove top** was switched to `Roman ogee 3/8" all round the thickness face (max side)`, the `curvesPerf` ogee loop's profile.
- Each commit types the part's Length (36" ↔ 36 1/64") and presses Enter.

**Method.** The plan's metric (Enter to the second animation frame) turned out to be dominated by painting. Under software GL,
two idle frames take ~750 ms at the default viewport, with ±150 ms of noise, and every frame is one ~800 ms main-thread
long task, so a commit's work cannot be told apart from a paint.

The commit's own React render is scheduled, not flushed inside the keydown dispatch (the dispatch returns in ~0.6 ms).

So the viewport was set to 900 × 500. Twelve times in turn:
1. two IDLE frames are timed;
2. then a commit's two frames.

The table gives min and median of the last 9 of each. A commit's cost is the **excess of its frames over idle frames**:
the commit, React's render, the geometry rebuild, r3f's reconcile and the extra paint. Software GL inflates the absolute
numbers. Only the before/after difference is meaningful, and the shading on real hardware is for the user's eye.

## Before stage 1 (perf-c2 at 113d840, c1's code)

| Measure (ms) | min | median | all 12 |
|---|---|---|---|
| two idle frames | 292.9 | 319.5 | 291, 348, 310, 321, 345, 293, 318, 303, 302, 320, 333, 367 |
| a Length commit's two frames | 369.9 | 431.0 | 392, 453, 398, 454, 452, 472, 380, 390, 414, 370, 431, 452 |
| **excess (commit − idle)** | 77 | **~112** | |

The Length read `36"` after the last commit. Console: only the known warnings: THREE's `PCFSoftShadowMap` and `Clock`
deprecations, and the software-GL driver's performance message.

## After stage 3 (perf-c2 at a20e51b)

Same project, port, viewport (900 × 500) and method. Two runs back to back, for stability.

| Measure (ms) | run 1 min | run 1 median | run 2 min | run 2 median |
|---|---|---|---|---|
| two idle frames | 169.4 | 181.3 | 171.8 | 185.5 |
| a Length commit's two frames | 233.6 | 287.5 | 246.2 | 269.8 |
| excess (commit − idle) | | ~106 | | ~84 |

Run 1, all 12 idle: 199, 183, 196, 173, 181, 187, 182, 252, 216, 173, 169, 175; commit: 379, 310, 259, 323, 288, 288, 243, 291, 244, 258, 352, 234.
Run 2, all 12 idle: 217, 237, 212, 192, 187, 194, 179, 182, 181, 186, 190, 172; commit: 273, 277, 222, 299, 321, 251, 246, 299, 251, 261, 283, 270.

**Before → after.**
- **Every frame got cheaper:** two idle frames 320 → ~183 ms (median, −43%). The ogee part is one `<mesh>` (six material groups) where it was 313, each drawn in the main pass and the shadow pass.
- **A commit's two frames:** 431 → ~270–290 ms (median, about −35%).
- **The rebuild's own excess over idle:** ~112 → ~85–106 ms. That is within this metric's noise, as expected: the Node rebuild fell ~63–72 → ~47 ms, and software GL's frame cost swamps it.

Software GL exaggerates per-draw-call cost, so the frame saving on real hardware is for the user's eye. The direction (fewer draw calls per frame) holds everywhere.

## Live pass (dev server, port 5180, software GL; branch head)

The dev profile's existing projects were used and left in place, edits undone.

- **A swept loop draws whole.** "Swept profiles check", Cove top alone (Hide others), at Iso: the merged mesh shows no missing faces or cracks, the cove's shading runs round the edge, and the top keeps its grain. Image: `docs/img/swept-speed-c2-cove-top.png`.
- **Picking** (Review Focus 3):
  1. A click on empty ground clears the selection.
  2. A click on the middle of Cove top's broad face selects it.
  3. A Shift-click at the same point deselects it.

  One toggle, so the one mesh delivers one click (`stopPropagation`).
- **Section** (Side, 18"): the kept half draws with its cap at the cut. Image: `docs/img/swept-speed-c2-section.png`.
  - A click where the removed half was passes through (nothing selected).
  - A click on the kept half selects the part.
- **Shaped ↔ plain** (Review Focus 2): on Cove top, the cove and its four 2" corners were removed (five edits).
  - The part redrew as a plain box with its edges. Image: `docs/img/swept-speed-c2-plain.png`.
  - Five undos brought back the corners, the cove and its shading, as one mesh. Image: `docs/img/swept-speed-c2-undone.png`.
  - No console error at any step.
- **Fading.** With all parts shown, Assembly 1's Arched apron was opened (double-click in the parts list).
  - Every swept top outside it drew faded: grey, no grain map, the grid hidden behind them. Image: `docs/img/swept-speed-c2-faded.png`.
  - Clicking empty ground closed the assembly, and the tops' grain returned.
- **A stop and a two-side run.** "Stops on curves check", each alone at Iso:
  - Front and ends (a two-side cove run) draws whole. Image: `docs/img/swept-speed-c2-front-and-ends.png`.
  - Corner stop (a stop on a 2" corner arc) draws whole.
- **Console:** 0 errors. The warnings are only the known ones: THREE's `PCFSoftShadowMap` and `Clock` deprecations, the software-GL driver performance message, and React DevTools' info line on the dev build.

## Not exercised live

- Real-hardware shading of the merged mesh, and the cap's z-fight behaviour on a GPU. These are for the user's eye (fu 393/394).
- A resize DRAG's feel.
- A merged mesh over 65 535 vertices: the meshes are non-indexed, so there is no index limit.
