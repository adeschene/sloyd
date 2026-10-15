# Browser verification — curves, chunk 1

**Date:** 2026-10-15 · **Branch:** `curves` at `b39b099` (schema 17) · **Where:** the dev server (`localhost:5181`) in the
Playwright browser, software GL (llvmpipe). Screenshots are in `docs/img/curves-*.png`. Each one is cropped to the
spatial finding it supports. Where a DOM readout exists, it is the evidence and the image is not.

**Profile.** I recorded the dev profile's state first. It had six keys: `sloyd.autosave.v1`, `sloyd.library.v1`,
`sloyd.llm.v1` (checked for presence only) and three `sloyd.project.*` keys. It had three projects ("Untitled", "Shaker
Side Table", and "Shaker Side Table — joined", which was active). I hashed each value except the key. All the work was
done in one new project, "curves check — delete me", created through the project menu. I deleted it afterwards through
the same menu. After the check:

- The six keys are back, with the same three projects and "joined" active.
- Every project key and `sloyd.autosave.v1` hash the same as before.
- The only change is the joined row's `savedAt` in the library index. Activating the project re-saves it, the same as
  the page load did before I touched anything.

**Pointer events reached r3f this time.** The holes pass found they did not. Here `page.mouse` clicks, hovers and drags
on the canvas all worked: deselecting, Tape snapping and the gizmo drag.

## Results

| # | Check | Result |
|---|---|---|
| 1 | Part 30 × 5 × ¾ + **Arch** | ✅ The preset's default rise is 1-1/4" (`min(1.5, width/4)`, by design). With Rise set to 1-1/2", the Properties line and the cut-list line are both exactly Task 11's string: `Arch on the width min side, 3" in from each length end: 24" span, 1-1/2" rise (radius 48-3/4")`. Turned on edge, the Front view (orthographic) shows a smooth arch silhouette, with no facets visible at screen scale (`curves-arch.png`). **Edge lines at the arch ends:** not distinguishable at screenshot scale. Neither are the part's ordinary box edges, as in the holes pass with rims. They are unit-tested (Task 7) and owed a look on real hardware. |
| 2 | 36 × 20 × ¾ top + **Rounded corners** | ✅ One undo entry: one Undo took `Curves · 4` to none, and Redo brought all four back. The stored document confirms it (c0 → c4 in one entry, see #13). Four smooth corners from above (`curves-corners.png`). The cut list collapses them to `Round all four corners to a 1" radius`. Properties lists one row per corner (`Round the corner of the length min end and the width min side to a 1" radius`, …). |
| 3 | **Bow** a 30 × 5 × ¾ rail, Through → Width (on edge, seen from above) | ✅ Before: `Bow the width min side 1/2" (radius 225-1/4")`. After Through → Width: `Bow the thickness min side 1/2" (radius 225-1/4"), cut through the width`. From above, the thickness face reads as a shallow convex bow: the ends are trimmed and the crown is at full thickness (`curves-bow.png`). |
| 4 | Tape from one arch end to the other | ✅ A snap marker sits on each arch end, and the readout is **`24"`** (`curves-tape.png`). Hovering the crown read `12-1/16"`, which is hypot(12, 1.5) = 12.09" at 1/16 precision, so it is consistent with a crown snap point. The marker there was not separately confirmed. |
| 5 | Section cut through the arch | ✅ Note on orientation: with the apron **on edge**, the **Front** plane (through the thickness, at 2-1/2") is the one whose cap follows the arch. The cap's lower edge traces the arch (`curves-section-front.png`). The **Side** plane at 10" gives a rectangular cap, shorter by the arch's depth at that station (`curves-section-side.png`). The brief's "Side" fits a flat apron, not this pose. Faint specks on the Front cap: see Found 1. |
| 6 | Shorten the apron to 26", then Span 20 | ✅ At 26" the line reads `Arch on the width min side, from 3" to 27" from the length min end: 1-1/2" rise (radius 48-3/4") — check: runs past the length max end`, with the status `Runs past the length max end at this size.` Span 20 is accepted, the note and the `— check:` clear, and the line reads `… 3" in from each length end: 20" span, 1-1/2" rise (radius 34-1/16")`. |
| 7 | ¼" Hole (13" along, 2-1/2" in), then raise the Rise to 2-1/2" into it | ✅ Refused with the field's own alert: **`Puts hole 1 into the arch — move it first.`** It shows `aria-invalid="true"`, keeps focus and the typed text, and the stored rise is unchanged. Re-entering 1-1/2" clears the error. |
| 8 | Group → Copy mirrored → edit the original's Rise | ✅ Before grouping I moved the arch off-centre (Start 1": `from 1" to 21"`) so a mirror would show. The copy (⇋, ×2) has its arch at the opposite end (`curves-mirrored.png`). Rise 3/4" on the original updated both (`curves-mirrored-rise.png`). |
| 9 | Fade (the copy's apron open, the original faded) | ✅ Over the arch span: no chord-plane or diagonal internal walls visible in the faded arch. **Ledger check (a dado beside curved slices):** with a dado at 22" (box cells past it), the faded part shows vertical strips at the dado (`curves-faded-dado.png`). With the arch removed, a faded box-path part shows the same pattern, so I can't tell the dado's own walls from the box-cell wall at this scale. It is the same kind as the existing box path (holes R11). Record-only; it does not block. Owed to real hardware. |
| 10 | Add joinery / Refine | ✅ With the hole still on the apron, joinery gave the holes refusal first (`… doesn't handle parts with holes yet (Assembly 1 › Apron, Assembly 1 (1) › Apron) …`), as ordered. With the hole removed: **`Add joinery doesn't handle parts with curves yet (Top, Rail, Assembly 1 › Apron…). Add joinery before cutting the curves, or remove them first.`** and **`Refine doesn't handle parts with curves yet (Top, Rail, Assembly 1 › Apron…). Refine before cutting the curves, or remove them first.`** The Run button is disabled in both. No API call was made. |
| 11 | Plans sheet | ✅ Each arch is drawn as a polyline. In the whole-piece front elevation, the Top (flat, in front, ¾" tall) hides the arches' lower ¾". Every arch line left of x = 36" is **dashed** (`plan-hidden`, `stroke-dasharray: 4px, 3px`), and the copy's arch turns solid exactly where the Top ends (`curves-plans.png`). The rail's bow shows in plan. In the assembly figure, the arch is solid in front, and its end creases are dashed hidden lines in plan. |
| 12 | Drag frame time | ⚠️ See below. There is no resize drag to time. Software GL dominates every in-browser number (~600 ms per frame even when idle). |
| 13 | Undo back; one entry per step | ✅ I undid all **47** entries to an empty project, then **redid** every one, reading the autosaved document after each. Every edit was exactly one entry: Add, name, each dimension, the Arch, its Rise, the posture, the Rounded corners (all four), the Bow, Through, Span, Start, the Hole, Group, Copy mirrored, the Rise on the definition, the dado, the hole removal, the gizmo drag, each Length, and the arch removal. A Hide-others/Show-all pair with no edit between left no entry (fu 214). The refused Rise and the re-typed equal value pushed none. |

**Console:** 0 errors through the whole pass. The only warnings are three.js deprecation warnings (`THREE.Clock`,
`PCFSoftShadowMap`), which were there before.

## 12 — frame time

The brief asked for a **gizmo-resize** of the apron's length. No such gesture exists: the gizmo is translate-only
(`Gizmo.tsx`, `mode="translate"`) and `DimensionField` has no scrub. I measured what does exist instead.

| Measure | Result |
|---|---|
| Idle frame interval (nothing changing), rAF probe, 2 s | median **650 ms** (4 frames) |
| Translate-gizmo drag of the arched apron, about 2 s (60 moves), rAF probe | 5 frames: median **600 ms**, max 700 ms. A translate rebuilds no geometry (`partGeometry` keys on board-local fields), so this is draw cost only. |
| Four Length commits on the arched apron (curved, plus the dado), each followed by two rAFs | Enter → committed: 4.3–5.1 s; the two frames after: 1.1–1.3 s |
| The same with the arch removed (control) | Enter → committed: 4.3–4.6 s; the two frames after: 1.2–1.4 s, **indistinguishable** |
| `src/viewport/curvesPerf.test.ts` (node, the guard) | 4/4 pass |
| Node rebuild, minimum of 9 (`partGeometry` + edges + every body's mesh) | 24" arch on a 30" apron **10.4 ms**; four 2" corners on 36 × 20 **6.6 ms**; arch plus a corner through the length (two axes) **15.0 ms**; the live apron (26", 20" span, 3/4" rise) **4.0 ms**; a plain 30 × 5 **0.15 ms** |

Over 16 ms per frame in the browser, I'm reporting it as the brief asks, but llvmpipe sets that number, not curves: the
curved and plain commits cannot be told apart. The node numbers are the measure. Every reachable preset rebuilds under
16 ms. The two-axis case is at 15 ms, inside a frame with little margin. Task 8's notes put the arch at about 7 ms and the
two-axis case at about 13.7 ms; this run was on a loaded machine. How smooth it feels on a real machine is for the user.

## Found

1. **Light speckles in the arched apron's shadow (and faint specks on its section cap).** I did not fix this, as the
   task says.
   - **Steps:** a 30 × 5 × ¾ apron on edge with the default Arch (rise 1-1/2"), and a plain 30 × 5 × ¾ board on edge
     beside it. View from Top, orthographic.
   - **Expected:** both ground shadows solid.
   - **Seen:** the arched apron's shadow carries a row of small light pinholes, confined to the arch's span. The plain
     board's shadow has none (`curves-shadow-speckles.png`, plain above, arched below). The 30" rail with a Bow through
     the width cast a clean shadow. With the Front section through the arch, the cap shows a few faint darker specks
     along the arch.
   - **Reading:** this points at small gaps at the curved slices' seams (T-junctions between the SPLIT/clip pieces'
     faces, which the shadow pass sees through). It could also be shadow-map precision on llvmpipe; software GL cannot
     tell the two apart.
   - **Owed:** a look on real hardware first. If it reproduces, a watertightness check over the arch's `bodyMesh` output.
2. **The cut list's part diagram draws a curved part as a plain rectangle.** As specified: part diagrams are chunk 2
   (spec §5.2). Recorded so it is not mistaken for a regression. The curve's bench line already appears under the row.

## Not confirmed here — for the user on real hardware (fu 26a)

- **Smooth shading on the curved faces** (the arch soffit, the corners, the bow). llvmpipe renders them, but undefined
  or precision-sensitive shading only shows on real hardware.
- **The grain seam on a curved face**, accepted this round (spec §3.4). I did not judge it here.
- **The edge lines at the arch's ends**, and no facet lines across a curved face, at a zoom where lines are visible.
- **Found 1** (shadow and cap speckles).
- **The faded part beside a dado** (#9).
- **Drag smoothness** on an arched apron and a four-corner top (#12).
