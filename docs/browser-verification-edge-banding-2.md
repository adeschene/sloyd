# Browser verification — edge banding, chunk 2 (on screen and on paper)

**Setup:**
- Date: 2026-10-20.
- Dev server: `npm run dev -- --port 5180 --host 127.0.0.1`, branch `edge-banding-2` at `f344cb8` (Tasks 1–4). This was the
  DEV server only; production was not touched (the deployment rule).
- Browser: the Playwright MCP browser, rendering under software GL (llvmpipe). Steps were driven through
  `browser_run_code_unsafe`. Edits were made through the app's own store: `import('/src/store/store.ts')` in the page
  resolves to the running app's module instance.
- Screenshots and the two PDFs (`plans.pdf`, `cutlist.pdf`) are in the gitignored SDD workspace
  (`.superpowers/sdd/2026-10-20-sloyd-edge-banding-2/img/`) and will not survive a `git clean -fdx`. The prose below is the
  durable record.
- Console: 0 errors throughout. The warnings were three.js deprecations and WebGL driver messages.

**Test projects:**
- Chunk 1's `Edge banding check` (`sloyd.project.id_mvg0nvgm_1`), read only.
- A duplicate, `Edge banding check copy`, which was edited. Both are left in place on the dev profile, per the user's ruling.

## 1. Viewport — band looks

**At full size the look could not be judged by eye.** On the 36 × 20 tabletop, maple edging's `'edge'` texture (grain
streaks running along the edge) and the plywood's plies (stripes across the thickness) are near-identical tan stripes at
viewing distance. The check was therefore made on the COPY:
- the solid band type was renamed `Walnut edging 1/4"` and its material set to walnut (`applyMaterials`);
- its Tabletop and Shelf were shrunk to 4 × 3 (`updateBoards`), so that the standard views frame a 1/4" band large.

**Solid band (Tabletop, four walnut sides, Mitred), Iso** (`09-small-iso.png`): every edge face reads dark walnut, with grain
running along the edge. The top face keeps the plywood veneer look.

**Tape (Shelf, Iron-on veneer on both long edges), Iso** (`10-shelf-tape-iso.png`):
- the taped long edge reads as veneer: smooth, with long streaks and **no plies**;
- the untaped end next to it still shows plies.

**Grain does not jump when a band is added** (`16-shelf-banded.png` against `17-shelf-unbanded.png`). The shelf's bands were
removed (`updateBoards(…, { bands: [] })`). The top face's figure and the end's plies are unchanged between the two shots;
only the long edge switches from veneer back to plies. A test pins the same claim: `bandFaces.test.ts` checks that
BoxGeometry's and `bodyMesh`'s UVs agree.

## 2. Viewport — glue lines and the section

- **Top** (`08-small-top.png`): an inner rectangle 1/4" inside the outline (the four glue lines), with a mitre line from each
  core corner to its finished corner. **Iso** (`09`): the same lines on the top face.
- At full size, from the top (`06-top-walnut.png`), the inner rectangle sits about 6 px inside the outline. At that scale
  0.25" is about 23 px/in × 0.25, so 6 px is consistent.
- **Section** (`11-section.png`): Front plane at 21-1/2", through the small tabletop (z 20–23).
  - The near long edge's glue line is clipped away with its wood.
  - The far long edge's glue line and the end's glue line run to the cut and stop there.
  - The cap draws.

## 3. Plans sheet

The original project's key list:
- `A Arch, 24" span, 1" rise (radius 72-1/2")`
- `B Iron-on veneer: width min side` (the apron)
- `C Iron-on veneer: width min side, width max side (4×)` (the four shelves, one letter)
- `D Maple edging 1/4" 1/4": width min side, width max side, length min end, length max end`

**Finding L1 — D doubles the thickness.** The band type's own name already ends in `1/4"`, and Q6 appended the thickness
unconditionally. Fixed in the final review's wave: the thickness is appended only when the name does not already carry it as
a separate token (see the plan's ledger rulings).

**The real Chromium PDF** (`plans.pdf`, page 2, rendered with PyMuPDF): the tabletop's plan view prints its glue lines as a
second outline just inside the first, and tag D sits on its corner. The key list prints as above.

## 4. Cut list — part diagrams

With Diagrams set to `All parts`:
- **Band notes** (`.cutlist-diagram-band-note`), in order:
  - `Band: the width min side and the width max side and the length min end and the length max end — Maple edging 1/4",
    mitred corners; finished 36" × 20"`
  - `Drawn at the finished size; cut 35-1/2" × 19-1/2" before banding.` (Q1, the user's ruling)
  - `Band: the width min side and the width max side — Iron-on veneer`, once per shelf row
  - `Band: the width min side — Iron-on veneer` (the apron)

  At tape thickness 0 there is no core note: the finished size is the cut size.
- **Marks:** 7 `polyline.cutlist-diagram-band` elements: 4 on the tabletop, 2 on the shelf row, 1 on the apron. The
  tabletop's view (`14-diagram-band-0.png`) shows a heavy border on all four sides, labelled `36"` × `20"` (finished).
- **Strip mitres:** 4 `polygon.cutlist-diagram-angle` elements, two per strip row (both ends mitred). In
  `15-diagram-strip-0.png` the blank is `36-1/2"` × `1/4"`, and each end's waste is a thin hatched wedge. The view is not to
  scale (Q7), so the wedges read steeper than 45°.
- **The real Chromium PDF** (`cutlist.pdf`): the notes print on page 2 (as above), and Buying reads
  `Maple — 13/16": buy 0.21 bd ft …` and `Iron-on veneer, 7/8" wide: buy 23′ · no price`. These are unchanged from chunk 1.

## Owed to the user's eye (software GL cannot confirm)

- The band looks on real hardware: walnut and maple edge texture scale on a 3/4" face, and tape on MDF.
- The glue lines' weight on a real print at plan scale, where they print as near-coincident double lines.
- How the strip diagram's mitre wedge reads.
- A wholly faulted band type is keyed with `Not shown in these views: … — check the cut list`.
