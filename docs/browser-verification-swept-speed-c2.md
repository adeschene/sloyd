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
