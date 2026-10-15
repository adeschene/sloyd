# Browser verification — section cut (2026-10-15)

Dev server `npm run dev -- --port 5181` on branch `section-cut` (before the final-review fix wave), driven through
the Playwright MCP browser on software GL (llvmpipe — fu 26a: the look of caps is owed to real hardware, fu 347).
The section is view state, so turning it on in the user's own "Shaker Side Table — joined" project wrote nothing; the
one project this check created ("Section check — delete me") was deleted afterwards and `localStorage` read back with
exactly the keys it started with (library index, autosave, three projects, the key).

| # | Check | Result |
|---|---|---|
| 1 | Toggle on, Shaker table | Front at 0", the slider spanning −9…9 (the table's depth). Near half clipped, far half kept (`section-cut-live-1-front.png`). |
| 2 | Front cut through the mortises (z = −7, orthographic Front) | Legs and top read as flat caps; the back apron shows behind (`-3-mortise.png`, `-4-joint.png`). Cap pixel (53,16,6) vs the same material's lit +Z face (88,32,14): ≈ 0.6×, i.e. CAP_DARKEN 0.62 under FRONT lighting — not lit from behind. On this dark cherry the cap is near-black and the tenon-in-mortise outline is not legible (fu 347). |
| 3 | Project switch | "+ New project" turned the section off (`replaceDocument`); with no parts the toggle is disabled. |
| 4 | Drilled side (30 × 11-1/4 × 3/4, 21 shelf pins), Top cut at 0.6" | Every pin a round void in a grain-free cap, bore visible below (`-5-across-bores.png`). The field shows 5/8" (display rounding; stored 0.6). |
| 5 | Same, Front cut along the row (z = 1-1/2") | Each pin a notch from the top edge, the bore wall inside (`-6-along-row.png`). |
| 6 | Click-through (Top view, Front cut at 1-1/2") | A click over the clipped part missed (selection cleared); a click on the kept strip selected the part. |
| 7 | Move/Tape markers on the removed side | NOT confirmed: Playwright hover produced a snap marker only once, with the section off, and not again in either state. Owed a hand check (fu 350). The filter is pinned by code review only. |
| 8 | Save image with the section on (Flip) | The PNG holds only the kept half of the board. |
| 9 | Explode 50% with a Top cut through the aprons (y = 22-3/4) | The plane cuts parts where drawn: the aprons, lifted wholly above it, are clipped; the legs' caps show the mortise slots (`-7-top-aprons.png`, `-8-exploded.png`). |

Not exercised here (covered by unit tests or owed): slider smoothness on a drilled project (perf guard; fu 348),
shadows of the clipped half (`clipShadows`), z-fighting where a cap meets a clipped face, phone width.
