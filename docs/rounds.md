# Sloyd — rounds and status log

> Split out of `CLAUDE.md` on 2026-10-20. One row per shipped round (the table), then the Status
> bullets as `CLAUDE.md` carried them up to 2026-10-20 — per round: what shipped, its merge and
> bundle, rollback cost and what awaited the user's review. Add a row (and, if needed, a bullet)
> when a round ships, and keep the rollback table below current; the full narrative goes in `docs/history.md`. Every bundle hash and runbook
> entry: `DEPLOYMENT.local.md`.

## Rollback cost by schema boundary (moved from CLAUDE.md, 2026-10-22)

Newest first; update with every deploy (CLAUDE.md keeps only the nearest refusing boundary). Runbook: `DEPLOYMENT.local.md`.

| Roll back to | Bundle | Schema | Cost |
|---|---|---|---|
| `68dca2d` (mirrored links) | `index-_J_yZLbU.js` | 21 | ONCE SPLAYED LEGS DEPLOYS (not yet; merged `02e7b24`, schema 22): REFUSES every project saved at 22 — export first; leans stop |
| `e2729ee` (AI profiles) | `index-D_ed_oQ3.js` | 20 | REFUSES every project saved at 21 — export first; mirrored links stop |
| `ef88e09` (AI bands) | `index-lH3mycr3.js` | 20 | free; Claude stops authoring profiles, and the design form returns to four angle arrays |
| `0b5e5ca` (wording, fu 410–412) | `index-CuLt9iDe.js` | 20 | free; also Claude stops authoring edging |
| `b569dca` (shop words) | `index-B3SxN3Yk.js` | 20 | free; also the old wording (fu 411/412) |
| `424c184` (AI holes) | `index-D3k3tvUe.js` | 20 | free; also "+x" returns to the change list |
| `98f8296` (Refine carries features) | `index-BJwLoCPr.js` | 20 | free; Claude stops authoring holes (Refine carries them again) |
| `3162e68` (fu 419) | `index-DoG-TXKm.js` | 20 | free; Refine refuses holed, curved, profiled, banded and hardware projects again |
| `1d39344` (joinery chunk 3) | `index-bKxsxRuC.js` | 20 | free; a Mitred notched corner prints its old mitre again (fu 419) |
| `100c691` (notch drop) | `index-COsxvOYF.js` | 20 | free; joinery refuses banded projects again; a strip counts its full side again |
| `133c669` (joinery chunk 2) | `index-CYPvNoJ0.js` | 20 | free; a metric notch may drop on load again (fu 416); a bowed rail's ends join as butts again (fu 415) |
| `f3493a7` (joinery chunk 1) | `index-ChnyDt9R.js` | 20 | free; joinery refuses curved/profiled projects again |
| `98c7df4` (hardware) | `index-BZhrLswD.js` | 20 | free (no schema change); joinery refuses holed projects again |
| `4a6d6a1` (band wording) | `index-QDQAnB8n.js` | 19 | REFUSES every project saved at 20 — export first |
| `dc8d5c3` / `834ce5a` / `37ced13` | `index-ymPlKpkL.js` / `index-Vul7x2lO.js` / `index-Df8FpxEW.js` | 19 | same |
| `90ef45f` (chunk c2) | `index-Cqf9kRT7.js` | 18 | REFUSES every project saved at 19 — export first |
| `dc49b01` (b1) | `index-CDDCzMGJ.js` | 18 | also REFUSES a two-side stopped run; a one-side stop on a turned path loads SILENTLY as a2's straight prism (on an arch it vanishes; data intact) |
| `3ee667e` (a1 + a2) | `index-BbXkYYy4.js` | 18 | also REFUSES an All round loop |
| `5a9ead8` (edge profiles 1 + fu 388) | `index-B_aEoJl0.js` | 17 | REFUSES every project saved at 18 |
| `7f851f9` | `index-BZDp6iOz.js` | 16 | REFUSES every project saved at 17 |

## Rounds shipped


| Round | Date | Schema | What it added |
|---|---|---|---|
| v1–v3 | 07-29/31 | 1–3 | boards, gizmo, names, grid; grain orientation, textures; posture, part-local grain |
| joinery (cuts) | 07-31 | 4 | `Cut`: stock removed by sub-box decomposition |
| cut list line | 08-01 | — | printable sheet, diagrams, label layout, per-face views, board feet, ghost box |
| sheet nesting | 08-02 | 5 | guillotine-cuttable layout; `stock: { kerf }` |
| snap-move, grabs, cut points | 08-02/03 | — | the Move tool; snap points on cuts |
| guides + tape, type-anywhere, cardinal guides | 08-04 | 6 | the Tape tool, `guides` |
| project library | 08-14 | — | multiple projects; `sloyd.library.v1` (layout 1) |
| 08-31 batch | 08-31 | — | fu 157/158, 97/131, 148, 92, 140, 159–163 (163 from a bug report: ply UV sign) |
| generate, batch variety, held and stable, key check | 10-03 | — | prototypes via Claude (inv 36, 39) |
| stopped cuts, phantom cut, joinery | 10-04 | 7 | `stopMin`/`stopMax`; "Add joinery…" (inv 40, 41) |
| cut words / lines / storage, 198–200, 197 | 10-04/05 | — | `cutShape`, `storedAsShape`, `clippedRegion` |
| joinery fixes, joinery residues | 10-05 | — | fu 182–191, 201–203 |
| multi-select, hide/unhide | 10-05 | — | `selectedIds` (inv 42), `hiddenIds` (inv 43) |
| quarter turns | 10-05 | 8 | true 0/90/180/270 turns, `axisFrame` (inv 44) |
| copy in a row | 10-05 | — | `rowLayout`, `copyInRow` (inv 25) |
| linking | 10-06 | 9 | `Board.link` (retired in 11) |
| assemblies | 10-06 | 10 | `instances` + `definitions`, Group/Ungroup (inv 46) |
| components | 10-07 | 11 | shared definitions, links as `Shape`s (inv 45, 46) |
| generate assemblies | 10-09 | — | generated assemblies + role-linked components, distinct-part cap |
| refine | 10-09 | — | refine by instruction: new project + change list (fu 179) |
| refine joined | 10-09 | — | refine keeps joints: unjoin + exact gate, fixed choices (fu 238) |
| repair joints | 10-09 | — | Repair joints: prune pre-a899b51 strays, prove by the gate (fu 240) |
| estimate range | 10-09 | — | Refine/joinery cost shown as a measured range (fu 236) |
| refined name | 10-10 | — | Derived project names count a repeat ("— refined 2", "copy 2"; fu 237) |
| join repair text | 10-10 | — | A joined Refine labels joinery's repair rounds "Choosing joints — …" (fu 242) |
| record-only 243/244 | 10-10 | — | Dialog memos refuse instead of throwing; residue tests; live pass (fu 243, 244) |
| older record-only | 10-10 | — | Fu 211–239 triaged and closed: eye toggles share one undo entry, no-op edits push none, guards, ~140 tests |
| joinery end cuts | 10-10 | — | A cut at a resized end follows the part in any storage form (fu 205); 206 pinned; residue fu 245 |
| opposite-end cut | 10-10 | — | A full-span cut stored into the far end runs out the grown length too (fu 245) |
| posture handedness | 10-10 | 12 | On-edge reverses thickness so all postures share one hand; v12 mirrors on-edge cuts; every sheet view true (fu 215) |
| 246/226/227 | 10-11 | — | Deleting an assembly's last part removes it; dead eyes say why; `›` reserved in written names; sweep re-run on flipped views |
| 229/233 | 10-11 | — | Ungroup keeps the other copy's hidden assembly hidden (as its children); one cap report for one fault |
| mirrored instances | 10-11 | 13 | `Instance.mirrored`: a live mirrored copy through the one composition; Mirrored checkbox, Copy mirrored, ⇋ badge |
| ui polish | 10-11 | — | Grey/walnut palette; tools and view float over the viewport; Claude ▾; action row with More ▾ and a trash icon; Guides footer |
| 248–250 | 10-11 | — | Viewport colours approved on real hardware; ProjectMenu gets Popover's Safari focusout guard; snap markers in muted milk-paint tones |
| plans sheet | 10-11 | — | Printable Plans sheet (exploded isometric, dimensioned third-angle elevations of the piece and each assembly); viewport Explode slider, read-only while exploded (inv 47) |
| lumber yield & cost | 10-12 | — | Cut list Buying section: board feet × waste factor, by-the-piece boards packed and swapped to the cheapest size, sheets; prices per browser (`sloyd.shop.v1`) in a Lumber & prices dialog |
| 254/264/273 | 10-12 | — | Plans trio height cap (tall pieces print on one page); a one-child container is not an explode level and its drawing is not repeated; a note when a smaller unpriced size would hold a board |
| angle cuts (chunk 1) | 10-12 | 14 | `Board.angleCuts` (half-space plane cuts, stored `kind`); `boardBodies` clips pocket cells; tapers drawn, edged, snapped, on the Plans sheet, cut list (bench lines, short point) and part diagrams; Taper preset; joinery/Refine refuse angled projects |
| angle cuts (chunk 2) | 10-12 | — | Miter preset: "+ Add ▾" (Taper, Miter, Miter both ends — one undo entry), End/Across/Long point/Angle controls (ratio stored, 45° exact), AngleField (DimensionField with a degree parse/format), the miter line names the long point |
| angle cuts (chunk 3) | 10-12 | — | Bevel (Face, Long point, Angle; along the length) and Chamfer (any of 12 edges, Size; exact legs) presets and their final bench wording; the angle-cuts feature is complete |
| AI tapers (chunk 1) | 10-13 | — | Add joinery and Repair accept tapers; the taper-at-joint refusal; checks trust only a taper's flat wood (`contactSolids`) |
| AI tapers (chunk 2) | 10-13 | — | Generate and Refine read/write tapers in world words (`taperWorld.ts`); the taper-joint design fault; joined Refine with tapers |
| turned links | 10-13 | — | Role linking aligns angle-cut ids and tries quarter turns: four tapered legs are one component (fu 301); cut order is not geometry |
| 309–313 | 10-13 | — | AI-tapers residue: Refine refuses a taper the converter would reject; the change list diffs tapers face by face; an unjoined Refine states its fault once; taper tests in every pose |
| 302/303 | 10-13 | — | Overlap and the tip check read a tapered part's real bodies (`clipConvex`, `partMass`); untapered results byte-for-byte unchanged |
| standard views + image | 10-13 | — | Front/Side/Top/Iso (the Plans sheet's views; camera up stays +Y, Top tilted 1e-4 rad); Save image (one clean frame, `toBlob`, `StorageAdapter.exportImage`); framing frames exploded parts where drawn (fu 260) |
| AI angles (chunk 1) | 10-13 | — | Add joinery and Repair accept miters, bevels and chamfers: contact trusts their flat wood (`touchedRegion`/`splitRegion`), a cut running into a joint refuses unless it clears the tenon (`angleConflicts`), joinery keeps angle cuts on their wood (`rebaseAngleCuts`, fu 307) |
| AI angles (chunk 2) | 10-14 | — | Generate and Refine write miters, bevels and chamfers in world words (`angleWorld.ts`); exact untouched angles (`angleRatiosOf`); `angle-joint` design fault; the change list names them; chamfered legs link through turns; the design schema in `$defs` (the API's compiled-grammar cap) |
| custom materials (chunk 1) | 10-14 | 15 | User-defined solid and sheet materials (kind in the id, inv 49): a browser library and per-project copies (`doc.materials`, pruned to what parts use); Materials & prices (was Lumber & prices); Properties picks project/library materials and New material…; Refine keeps them (per-project schema enum; Generate's byte-identical) |
| custom materials (chunk 2) | 10-14 | — | Nominal lumber names (`units/nominal.ts`, exact match): cut-list rows named when every board is the section, Buying `2×4 × 8′`, a Properties Nominal size select, the Sold in nominal sizes switch; pine is nominal |
| holes (chunk 1) | 10-14 | 16 | `HoleRow` (blind/through, a row of `count` at `pitch`, inv 50): rendered open (walls, bottoms, rims), centre snap points, `holeFaults`' strict rule, bench lines (32 mm pitch at 1/64 + mm) and cut-list grouping; Holes section (Hole, Shelf-pin row); joinery/Refine/Repair refuse holed projects |
| holes (chunk 2) | 10-14 | — | Plans sheet: hole rims (96-gons; edge-on as one segment) and wall silhouettes through the one hidden-line pass, occluded by the hole-free bodies; plan paths chain within a part; part diagrams: ellipses, centre marks, dashed depth sides, each row's bench line as a note; the Hinge cup preset |
| section cut | 10-15 | — | Viewport section: one Front/Side/Top plane (slider, exact field, Flip), GPU-clipped parts and edges, exact solid caps from the bodies minus bores (one winding, outline = union boundary), picking/snapping on the kept side (guides exempt); view state only (inv 51) |
| metric display (chunks 1–2) | 10-15 | — | Per-project `in \| mm` Units switch; whole mm for fields, typing (a bare number is mm), tape, cut list, bench lines (holes to 0.1 mm), drag snap; drawings bare mm + "Dimensions in mm" note; Buying parts in mm, trade sizes with mm brackets; metric grid (inv 52) |
| fu 354 | 10-15 | — | Metric parts match nominal sections and stock when they READ the same whole mm (`nominalName`, `fitsStock`, one `mmTicks` rounding); imperial exact |
| fu 360 + 355 | 10-15 | — | Built-in pine's default stock adds the nominal 2× and 4×4 sizes (36); metric design faults show mm in the Joinery/Refine dialogs (`Violation.shown`), the model's text unchanged |
| fu 357 | 10-15 | — | A metric sheet's `Dimensions in mm` repeats in every printed page's top margin (`@page metric-sheet`, margin box) |
| curves (chunk 1) | 10-15 | 17 | `Board.curves` (`CurveCut`: a closed waste outline of lines and minor arcs in a face's (u, v), cut clean through one dimension; inv 53): clipped or split bodies, built edges, smooth normals, a watertight mesh and cap; arc snap points; bench lines and grouping; Curves section (Arch, Half-round notch, Bow, Rounded corner(s)); holes into a curve's waste fault; joinery/Refine/Repair refuse curved projects; an unknown segment type refuses the document |
| curves (chunk 2) | 10-15 | — | Plans sheet: arcs at `DRAWING_CURVE_TOLERANCE` 0.001" (≤96 chords) through `curveDrawEdges`, visibility on the model chord, edge-on views unrefined; silhouettes of curved surfaces (`silhouetteLines`; fixes open rounded-top ends and the missing arch crown). Part diagrams: hatched waste, sharp-vertex lines on their own face, curve notes (`curveLineEntries`). Fu 361 |
| follow-ups 1 | 10-15 | — | Fu 369 (a curved part's holed planes as one region: watertight, ~3x faster), 375, 339, 262 (+261), 338/359 (the user's rulings), 335, 348, 344 + 263, 316, 296 |
| fu 368 | 10-16 | — | A non-convex waste rebuilds ~52 → ~6 ms: `bodyEdges` lookups indexed (byte-identical), convex pieces merged (Hertel–Mehlhorn) |
| follow-ups 2 | 10-16 | — | Fu 297, 290, 314, 287/292 (rulings), 208/209 (undo, redo, delete refused mid-drag), 210 |
| follow-ups 3 | 10-16 | — | From the 1–178 triage: fu 168 (failed run's spend), 53, 152, 95, 35 (unopenable project says why), 3, 18, 9, 23, 40, 14, 57, 11 |
| fu 96 | 10-16 | — | Sheet and board layouts: a part too small for its number gets a callout row beside the drawing, with a leader |
| follow-ups 4 | 10-16 | — | Fu 127, 13, 54, 2 (test gaps), 98 (Saw kerf field), 154 (two tabs: pinned), 6 (spaced mixed lengths) |
| plans balloons | 10-16 | — | One numbered balloon per cut-list row on the Plans sheet's exploded view; the cut list and its layouts print the row number (fu 252) |
| feature callouts | 10-16 | — | Lettered feature tags on the Plans sheet's elevations, a key list per trio (fu 333, 279, 362) |
| follow-ups 5 | 10-16 | — | Fu 216 (mm joinery cuts on the exact grid), 7, 51, 71, 78; 151 (row actions on keyboard focus) |
| print sections | 10-16 | — | Fu 383: each cut-list section and Buying prints on a new page; 381(4) a part keyed once |
| follow-ups 6 | 10-17 | — | Fu 8, 17, 19, 27, 126, 128, 169, 175, 234 (the last small items); 269 cheapest-plan Buying |
| section views | 10-17 | — | Plans sheet: the viewport's section as a hatched Section A–A of the assembled piece after its trio, the A–A line on one elevation (fu 256) |
| presets batch | 10-17 | — | Taper two/four faces (fu 278); the Chamfer row edits each leg and a Raised panel preset (fu 298); a Kind select on curve rows, `curveAs` (fu 367) |
| presets minors | 10-17 | — | The Kind select judged on focus (not every render) and a greyed option says why; preset menu details read the project's units |
| edge profiles (chunk 1) | 10-17 | — | Full-length Roundover, Cove, Roman ogee, Bead, Thumbnail (+ fillet) as recognised `CurveCut`s; a Profiles section, bench lines, Plans keys (fu 365 half); fu 386 (`EDGE_ON`); curved edges no longer graze hidden; four-edge tops rebuild in a frame |
| profile runs (a1) | 10-17 | 18 | Edge profiles stored as `Board.profiles` (moved from `curves` on load); every reader through `geometryBoard`; unbuildable runs refused |
| profile runs (a2) | 10-18 | — | Stopped profiles on a straight side with the router's run-out (`runout.ts`): bodies, edges, smooth watertight mesh, silhouettes, snaps, words; presets take the first fitting edge |
| profile runs (b1) | 10-18 | — | Profiles follow the outline: End to end round corner arcs and along arches, All round (loops load); swept bodies (`profilePath.ts`, `sweep.ts`), edges, mesh, drawings, faults, words; a saved run too tight to follow runs straight |
| profile runs (b2) | 10-19 | — | Stops on a turned path (a run-out about the bit's axis in the station chord's frame) and two-side runs (Stop side); a saved a2 stop on a turned path follows, or runs straight with its cause |
| chunk c1 | 10-19 | — | Swept rebuilds faster, byte for byte (`sweptIdentity` pin): plans/chords once per part, scalar clip/minusCover, float32 mesh, scalar bodyEdges setup; ogee loop 80 → 61 ms, two loops 58 → 36 |
| chunk c2 | 10-19 | — | A shaped part is ONE geometry (`partMesh`); exact twin seams skipped (`seams.ts`); covered faces make no edge candidate; ogee loop 63–72 → 48 ms (gate missed), others ≤ 41; idle frame 320 → 183 ms (software GL) |
| edge banding (chunk 1) | 10-20 | 19 | Band types and bands (`banding.ts`, inv 54): the cut list's core sizes, band lines and solid strip rows; nesting at core size; Buying's strips and tape block; Banding in Properties, Edge banding in Materials & prices; joinery/Refine/Repair refuse banded projects (deployed `index-Df8FpxEW.js`) |
| edge banding (chunk 2) | 10-20 | — | Bands visible: band looks by a triangle post-pass (`bandFaces.ts`), glue lines (`glueLines`) in the viewport and on the Plans sheet (`band` tags, a key per band type), part diagrams' band marks, band and core notes, a strip's mitres (deployed `index-Vul7x2lO.js`) |
| + Add banding | 10-20 | — | The Banding section on the additions' pattern (`+ Add banding ▾`, then the selects and `Band ▾`); `New solid edging…` opens Materials & prices with a new Solid row (deployed `index-ymPlKpkL.js`) |
| band wording | 10-20 | — | Band lines list three or more sides and read `all four sides`; Buying's unpriced tail counts band types apart (fu 395(2)–(3); deployed `index-QDQAnB8n.js`) |
| hardware (BOM) | 10-21 | 20 | Hardware types (name, pack size, price) per project; counts on parts, assemblies and the project that multiply with copies (`hardware.ts`, inv 55); the cut list's Hardware section with where-used lines, Buying's Hardware block; Properties' Hardware section, Materials & prices' Hardware section; Refine refuses hardware on parts. **Built on merged `98c7df4`, deployed 2026-10-21 (`index-BZhrLswD.js`)** |
| joinery accepts holes (chunk 1) | 10-21 | — | Add joinery rules out only the joint kinds whose zone a hole enters (`featureZones.ts`, watched trials; rabbet and lap units), says why per site (`ruledOutText.ts`); `rebaseHoles` + `resizeAt` inverse; the gate compares holes; Repair accepts holed projects; Refine still refuses (inv 41/50; fu 328 closed, 413, 414). **Merged `f3493a7`, deployed 2026-10-22 (`index-ChnyDt9R.js`)** |
| joinery accepts curves and profiles (chunk 2) | 10-22 | — | Add joinery rules out only the joint kinds whose zone a curve or profile enters (`featureRegions.ts`; judged in the original frame, P5; per-face run-through exception, P7); `rebaseCurves` / `rebaseProfiles` + `resizeAt` inverse; the gate compares curves and profiles; Repair accepts curved and profiled projects; Refine still refuses (inv 41/53; fu 363 first piece closed, 415). **Merged `133c669`, deployed 2026-10-22 (`index-CYPvNoJ0.js`)** |
| notch drop + fu 415 | 10-22 | — | A metric Half-round notch stored at its stored chord's half circle; the loader holds one a few ulps past it (fu 416, closed); a curve that only meets a tenoned end keeps the growing kinds when it clears the tenon (fu 415, the user's ruling; fu 417 the cost); `rectOverlapsWaste` counts a side only where it enters the waste. **Merged `100c691`, deployed 2026-10-22 (`index-COsxvOYF.js`)** |
| joinery accepts bands (chunk 3) | 10-22 | — | Add joinery rules out only the joint kinds a band is in the way of (`bandRegions`, judged as stored in the original frame, P9–P11; an edged shelf housed whole in a dado, the user's ruling); a stopped dado narrowed to the stop ends that clear ("Offer clear ends") with its smallest inset clearing a receiver band ("Fix now"); strips, tape and glue lines count only the visible run (`visibleRun`, P12–P14); the gate compares bands; Repair accepts banded projects; Refine still refuses (inv 41/54; fu 398's joinery and Repair half closed, 418–423). Merge `1d39344`, deployed 2026-10-22 (`index-bKxsxRuC.js`) |
| Refine carries features | 10-22/23 | — | Refine accepts holes, curves, profiles, bands and hardware: carried by flat name onto the returned part in the ORIGINAL frame (`featureCarry.ts`, `frameFor`; inv 56), before the load gate and linking; a featured part turned onto another face goes back to the model (`feature-turned`); the done view lists Not kept and Check at the new size (`carryText.ts`); joinery's ruled-out notes shown; the four refusal modules deleted (inv 41/50/53/54/55; fu 328/398 closed for Refine, 363 Refine reading, 424–427). **Merged `98f8296`, deployed 2026-10-23 (`index-BJwLoCPr.js`)** |
| AI holes | 10-23 | — | Generate and Refine author hole rows in world words (`holeWorld.ts`, the ONE converter; `holeSnap` nearer of 1/64in or whole mm; canonical rows); untouched rows return exactly (exact-row map, original order kept); `hole-fault` kept and fed back (`holeDesignFaults.ts`); mirrored sides link through turns (`turnCandidates`, `alignedTo`); holes leave the carry; a holes-only part keeps its frame only without a turn (rank + thickness rule); schema compiled live first probe (fu 322) (inv 40/48/50/56; fu 329 closed, 428, 429). **Merged `424c184`, deployed 2026-10-23 (`index-D3k3tvUe.js`)** |
| shop words | 10-23 | — | Refine's change list in shop words (`shopWords.ts`: top/bottom, inside/outside toward the frame's middle, else left/right/front/back; ends absolute); a same-looking add+remove hole pair is one "moved" line; the prompt names +z the front (spec `2026-10-23-sloyd-shop-words-design.md`; fu 431, left as is). **Merged `a4b51fd`, deployed 2026-10-23 at `b569dca` (`index-B3SxN3Yk.js`)** |
| wording | 10-23 | — | `FEATURE_CHECK_FAILED` names edging; the link note says what is not shared (fu 411); per-copy hardware totals per type (fu 412); fu 410 left silent. **Deployed at `0b5e5ca` (`index-CuLt9iDe.js`)** |
| AI bands | 10-23 | — | Generate and Refine author edge bands in world words (`bandWorld.ts`; `edging` = veneer, a project type, or `solid <material>` minted once as `<Label> edging` at 1/4in); band types threaded through every path; band faults fed back (not for curved parts, whose bands stay carried); banded parts link through turns; Generate edges exposed plywood front edges by default; `vec3` into `$defs` (fu 322) (inv 48/54/56; fu 430 chunk 1, 432, 433). **Merged `e7ce893`, deployed 2026-10-23 at `ef88e09` (`index-lH3mycr3.js`)** |
| AI profiles | 10-23 | — | The design form's four angle arrays merged into ONE `angles` item to fit the grammar (`toWireDesign` / `parseDesign` split; the internal form unchanged); Generate and Refine author edge profiles in world words (`profileWorld.ts`; untouched entries exact through the exact-entry map); `profile-fault` kept and fed back (`profileDesignFaults.ts`); profiled parts link through turns and follow the rank + thickness frame rule; a part with curves or a two-side run keeps its profiles carried (`carriesProfiles`); profile lines in the change list (inv 40/41/48/53/56; fu 430 closed, 434). **Merged `30f1299`, deployed 2026-10-23 at `e2729ee` (`index-D_ed_oQ3.js`)** |
| mirrored links | 10-23 | 21 | A linked part may be its Shape's MIRROR image (`mirrored`, an own field of a shaped part; `resolveBoard` applies it by flag flips, `mirrorFeatures`): edits lower through it exactly (`lowerOwnMirror`), a side is chain parity XOR the flag (`sideAt`); Generate and Refine link mirror twins (`mirrorCandidates`, after turns); the Mirrored checkbox (world X, in place) and ⇋ badge; joinery keeps a mirrored link (exact regroup); Unlink leaves two plain parts as they looked (inv 44/45/46; fu 432 closed, 435). **Merged `a2ad5f6`, deployed 2026-10-23 at `68dca2d` (`index-_J_yZLbU.js`)** |
| splayed legs (chunk 1) | 10-24 | 22 | A part LEANS (`Board.lean`: two slopes and a facing dimension, shared, upright only; `lean.ts` the ONE home): typed rake and splay in world words (the Lean section: magnitude fields and direction selects, the resultant and sightline readout, Clear lean); position stays the pre-lean min corner, the pivot is the top's centre (a resize keeps it); mirrors by `leanFlip`; every world crossing composes it and every extent reader uses `partBounds`; drags round the delta; Level the ends (`levelEnds.ts`: two end miters, length rounded up to the grid); the viewport, snapping, section caps, drawings and a Plans note read it; the checks rest a leaning part on its level faces (`leanContacts.ts`); joinery and Repair refuse it, Refine keeps it as is (`leanKeep.ts`) (inv 57; inv 2/24/25/38/39/41/42/44–47/51/56 clauses; fu 436–446). **Merged `02e7b24`; not deployed** |

## Status log (to 2026-10-24)

- **Splayed legs, chunk 1 (feature gap §1; 2026-10-24; MERGED `02e7b24` (2026-10-24, the user's call, ahead of the owed checks), NOT deployed; SCHEMA 22 — once deployed, rolling back past it REFUSES every project saved at 22, export first)**: spec
  `docs/superpowers/specs/2026-10-24-sloyd-splayed-legs-design.md` (Amended (build) holds Rulings 1–19 with their costs), plan
  `docs/superpowers/plans/2026-10-24-sloyd-splayed-legs.md`. Subagent-driven, 12 build tasks and this records task, each task-reviewed
  (fix rounds: Task 1 ×2 — the seam removed, a zero lean is no lean; Task 6 — any end miter is a level cut; Task 8 — magnitude and
  direction separate). Full suite at 4b06e42 + records: 8200 tests across 235 files, 8195 pass — the 5 failures are
  load timing (4 `curvesPerf` budgets, 1 `curvesOracle` 5 s timeout), the known class; `npm run build` clean. Browser verification (plan Task 14) DONE on the dev server: 15 checks PASS
  (`docs/browser-verification-splayed-legs.md`). Merged at the user's word with these still owed, now owed before deploy: its three remaining checks — a gizmo drag of a levelled leg, a lean
  edit with a section on, a pointer snap onto a foot — and the perf guards re-run on a quiet machine (curvesPerf failed under load on
  master too). The final whole-branch review's fixes (I1 tip hull from the feet's vertices, I2 no sites with a leaning part, I3 one lean
  predicate, M1 no turn candidates for a leaning part, M3 the Gizmo's null-start guard) are in. Merged tree = branch tree; at the merge 8204/8209 pass (5 `curvesPerf` budgets, load average 7.7), build clean. Owed to the user: the Amended (build) block. New invariant 57; follow-ups 436–446.
- **Mirrored links (fu 432; 2026-10-23; branch `mirrored-links`, MERGED `a2ad5f6`, DEPLOYED at `68dca2d` as `index-_J_yZLbU.js`, CSS unchanged; SCHEMA 21 —
  rolling back past it REFUSES every project saved at 21, export first)**: spec
  `docs/superpowers/specs/2026-10-23-sloyd-mirrored-links-design.md` (the user chose a mirror flag on parts, §1.1; Amended (execution) holds
  Rulings 1–11 with their costs), plan `docs/superpowers/plans/2026-10-23-sloyd-mirrored-links.md`. Subagent-driven, 5 build tasks, each
  task-reviewed (Task 3: one fix round — the checkbox reflects across WORLD X inside a turned assembly, Ruling 5). 7981 tests across 229
  files, all passing in one full run; `npm run build` clean. Tell the user (Ruling 9): a non-square, inside-tapered leg set now links as ONE
  Shape with two mirrored users (was two Shapes), so the parts list shows one 4-leg link with two ⇋ badges. Record-only: fu 435 (spec §8's
  out-of-scope items, the all-mirrored metric regroup residue, Ruling 6's cost, deferred minors). Live check and the deploy ASK pending
  (plan Task 6 Steps 4–5).
- **AI profiles (fu 430 chunk 2; 2026-10-23; branch `ai-profiles`, MERGED `30f1299`, DEPLOYED at `e2729ee` as `index-D_ed_oQ3.js`, CSS unchanged; schema 20 — no schema change, so a
  rollback past it is free: it only stops Claude authoring profiles and returns the design form's four angle arrays)**: spec `docs/superpowers/specs/2026-10-23-sloyd-ai-profiles-bands-design.md` ("Chunk 2, revised" R1–R6;
  Amended (execution) holds chunk 2's Rulings 1–16 and the final review's fixes), plan `docs/superpowers/plans/2026-10-23-sloyd-ai-profiles.md`.
  Subagent-driven, 7 build tasks, each task-reviewed; the final schema compiled on the first probe (2,800 chars, fu 322); the angle re-check
  after the merge passed live (Generate a Shaker side table and a picture frame, a Refine echo with every angle cut identical bar fresh ids, as before the round). Final
  review: one Important (a moved stop's line; Rulings 14, 16) and three minors, two fix waves. 7888 tests across 226 files, all passing in one full run;
  `npm run build` clean. Live check `docs/browser-verification-ai-profiles.md`
  (4 of 10 paid calls so far); the profile runs (plan Task 8 Step 3) and the deploy are pending. Record-only: fu 434. Approved by the user in bulk
  2026-10-23: the spec's *Chunk 2 (execution)* block — chiefly Ruling 10/16 against §3.4 (an echoed stop on a resized part is restored as stored,
  moving with its end, where §3.4 said the model's numbers win) and R6.3 dropping §4.2's done-view line for ignored carried profiles.
- **AI bands (fu 430 chunk 1; 2026-10-23; branch `ai-bands`, MERGED `e7ce893`, DEPLOYED at `ef88e09` as `index-lH3mycr3.js`, CSS unchanged;
  schema 20, rollback to `0b5e5ca` / `index-CuLt9iDe.js` free; verified in-network and at the edge: 200 on / and a deep route, sha256 = dist,
  old bundle 404, CSP, new strings in the edge bundle, a real-browser load with 0 errors, storage read empty before and after)**: spec
  `docs/superpowers/specs/2026-10-23-sloyd-ai-profiles-bands-design.md` (the user's four §11 answers; Amended (execution) holds Rulings
  1–9), plan `docs/superpowers/plans/2026-10-23-sloyd-ai-bands.md`. Subagent-driven, 7 tasks, each task-reviewed; the first compile was
  refused (grammar too large) and `vec3` moved into `$defs` (Ruling 3); the final review (I1: no band faults fed back for carried curved
  parts; I2: a headroom probe) and one fix wave. 7777 tests (curvesPerf's wall-clock guards flake under full-suite load, pass alone). Live
  check `docs/browser-verification-ai-bands.md` (7 of 10 paid calls). Record-only: fu 433. Owed to the user: whether the edging defaults
  read right (Generate banded a top's overhanging ends and both doors all round).
- **Wording (2026-10-23; `14a0e54` + `0b5e5ca`, DEPLOYED at `0b5e5ca` as `index-CuLt9iDe.js`, CSS unchanged; schema 20, rollback to `b569dca` /
  `index-B3SxN3Yk.js` free; verified in-network and at the edge: 200 on / and a deep route, sha256 = dist, old bundle 404, CSP, the three new
  strings in the edge bundle, a real-browser load with 0 errors, storage read empty before and after)**: from the owed-reviews pass. 7726
  tests (one wall-clock guard failed under load 4.5 and passed alone); `links.test.ts` pins LINK_FIELDS' own set to the link note (mutated).
- **Shop words (2026-10-23; branch `shop-words`, MERGED `a4b51fd`, DEPLOYED at `b569dca` as `index-B3SxN3Yk.js`, CSS unchanged; schema 20,
  rollback to `424c184` / `index-D3k3tvUe.js` free; verified in-network and at the edge: 200 on / and a deep route, sha256 = dist, old bundle
  404, CSP, the new prompt and `face moved` in the edge bundle, a real-browser load with 0 errors, storage read empty before and after)**: from the AI-holes review (the user: reword
  "+x" to "45 holes added on the inside face"; design approved in chat, spec `docs/superpowers/specs/2026-10-23-sloyd-shop-words-design.md`).
  `shopWords.ts` + `designDiff.ts` (matched on raw directions, worded per side's frame), `SYSTEM_PROMPT` names +z the front. 7724
  tests; six mutations each caught. Live check `docs/browser-verification-shop-words.md` (3 paid runs ≈ $0.16): Generate puts the
  back panel at the smallest z; Refine reads "hole row on the inside face moved 1\" toward the front"; an OLD project (back at +z)
  still moves the right way but reads "toward the back" (fu 431; the user: leave old projects as they are).
- **AI holes (fu 329; 2026-10-23; branch `ai-holes`, MERGED `424c184`, DEPLOYED 2026-10-23 as `index-D3k3tvUe.js`, CSS unchanged; schema 20,
  rollback to `98f8296` / `index-BJwLoCPr.js` free)**: spec `docs/superpowers/specs/2026-10-23-sloyd-ai-holes-design.md` (the user took
  all three §11 calls; Amended (execution) carries the controller's rulings), plan `docs/superpowers/plans/2026-10-23-sloyd-ai-holes.md`.
  Subagent-driven, 7 tasks; the final review (Not ready: C1 a turned holes-only part stored the wrong way round, I1 metric mirrored sides
  never linked) and one fix wave, then R1 (plan turn; the user: "Fix it, then merge") and the tie clause. 7711 tests. Live check
  `docs/browser-verification-ai-holes.md` (compile probe + 5 paid runs ≈ $0.23, all one call: bookcase, 32 mm bookcase, move pins, echo
  exact, knob hole; CHARS_PER_TOKEN 2 holds). Production verified by bundle hash in-network and at the edge, CSP, a real-browser load
  (0 errors), storage cleared and read back empty. **Reviewed by the user 2026-10-23** (in the watched dev browser): the look reads fine
  (software GL — the real-hardware look stays owed); "move the pins" moving both rows is right; the "+x" words became the shop-words
  round. Still owed: the look on real hardware; the controller's rulings (rank + thickness frame rule; §3.2 taper guarantee narrowed;
  distances snapped from the measured end/side; original order kept on a no-op). Record-only: fu 428, 429.
- **Refine carries features (2026-10-22/23; branch `refine-features`, MERGED `98f8296`, DEPLOYED 2026-10-23 as `index-BJwLoCPr.js`, CSS unchanged;
  schema 20, rollback to `3162e68` / `index-DoG-TXKm.js` free)**: spec `docs/superpowers/specs/2026-10-22-sloyd-refine-features-design.md`
  (the user's three rulings §12: carry not authoring; features stay measured from the ends they name; a turned part goes back to Claude),
  plan `docs/superpowers/plans/2026-10-22-sloyd-refine-features.md`. Subagent-driven, 7 tasks, one final review + one fix wave (person-facing
  noun forms; a feature-check throw after the paid call saves the design unjoined; `JointsSummary.notes`; the tie rule). 7563 tests. Live check
  `docs/browser-verification-refine-features.md` (dev, 3 paid runs ≈ $0.08: taller, second shelf, joined wider — all features identical).
  Production verified by bundle hash in-network and at the edge, CSP, a real-browser load (0 errors), storage cleared and read back empty.
  **Reviewed by the user 2026-10-23** (watched dev browser, software GL): the look reads fine; the check-list words kept as they are; a
  hardware-only resized part stays off the check list; the controller's rulings approved as they stand (hardware never on the check list;
  plan turns not caught, fu 425; duplicate names, fu 426; the broad error guard, fu 427; unused custom band types now kept).
  Still owed: the refined cabinets on real hardware.
- **Joinery accepts bands (joinery features chunk 3; 2026-10-22; merge `1d39344`, DEPLOYED 2026-10-22 as `index-bKxsxRuC.js`, CSS unchanged; schema 20, rollback to `100c691` / `index-COsxvOYF.js` free; verified in-network and at the edge: 200 on / and a deep route, sha256 = dist, old bundle 404, CSP, `edge band` in the edge bundle, a real-browser load with 0 errors and storage read empty before and after)**: spec
  `docs/superpowers/specs/2026-10-21-sloyd-joinery-features-design.md` (§8 Q3–Q5, *Amended (planning, chunk 3)* P9–P14 and *Amended
  (execution, chunk 3)*), plan `docs/superpowers/plans/2026-10-22-sloyd-joinery-bands.md`. Branch tree: 7483 tests across 221 files. No
  schema change, so rolling back is free. Final review with one fix wave: F1 (no negative strip or backward glue line after give-way), F2
  (the user's "Fix now": an edged receiver's stop inset clears the band), and the user's "Offer clear ends" (stop ends narrowed per end,
  reversing chunk 1's "ruled out whole"). **§4.4 changes existing documents:** a hand-notched banded part (a full-thickness cut through
  the band at a run end) now buys and draws a shorter strip, tape run and glue line; no existing test's number moved (Task 1). Intended
  test flips: `bandedRefusal.test.ts`'s `'joinery'` assertions, and `App.test.tsx`'s "a refused project (holes and a band)", whose
  refusal example is now a taper into the joint. Live check `docs/browser-verification-joinery-bands.md` (dev server: the edged rail's
  strip at the visible run, Add joinery opening and Repair offered on banded projects, the edged bookcase joined at its front stop);
  the paid run was made later that day with the user's approval (see fu 419 below). **Reviewed 2026-10-23: all approved** (the words
  kept; the failure message now names edging). Was owed: the `edge band` summary words; P10 (faulted bands judged as
  stored), P12's "no visible run, no strip", P13 and P14; §4.4's change to existing hand-notched documents; the chunk-3 spec amendments
  (Review Focus 4's test moved to 5/8 edging after F2 among them); the edged rail's look on real hardware (Review Focus 5). Record-only: fu 418, 420–423. Merged and deployed the same day (row above).
- **fu 419 (2026-10-22; `ac799bb`, DEPLOYED at `3162e68` as `index-DoG-TXKm.js`, CSS unchanged; schema 20, rollback to `1d39344` free)**: under Mitred a corner is mitred only where a mitre can be cut — a shortened corner, or one
  where a notch left a strip's mitred inner edge ≤ EPS, is joined as under Long there (`endModesOf`; follow-ups 419 closed). 7484 tests.
  Live (dev): the F1 probe's leftover is a square 7/8" strip. Also the approved paid run of chunk 3 (`docs/browser-verification-joinery-bands.md`).
- **Notch drop + fu 415 (2026-10-22; branch `notch-and-bow`, MERGED `100c691`, DEPLOYED as `index-COsxvOYF.js`, CSS unchanged; schema 20)**: fu 416
  closed (archCurve stores a notch at its stored chord's half circle; the loader holds an arc within 4 ulps of its coordinates past the bound
  to it — swept 25–3600 mm); fu 415 closed by the user's ruling (end-face clearance; costs: fu 417 and a dadoed bowed end's step at the
  housing). One independent review (its loader-tolerance finding fixed). 7390 tests. Verified by bundle hash in-network and at the edge, CSP,
  the old bundle 404s, a clean real-browser load, production storage read empty after. Rollback to `133c669` is free.
- **Joinery accepts curves and profiles (joinery features chunk 2; 2026-10-22; branch `joinery-curves`, MERGED `133c669`, DEPLOYED 2026-10-22 as `index-CYPvNoJ0.js` (CSS unchanged); verified by bundle hash in-network and at the edge, CSP, the old bundle 404s in-network, a clean real-browser load, production storage read empty after; rollback to `f3493a7` is free)**:
  spec `docs/superpowers/specs/2026-10-21-sloyd-joinery-features-design.md` (P4–P8 and *Amended (execution, chunk 2)*), plan
  `docs/superpowers/plans/2026-10-22-sloyd-joinery-curves.md`. Branch tree: 7382 tests across 217 files. No schema change, so rolling back is free.
  Owed to the user: the curve and profile summary-line wording and `FEATURE_CHECK_FAILED` (P8), and the joinery-features spec's
  *Amended (planning, chunk 2)* and *Amended (execution, chunk 2)* blocks, in particular the bow correction. Record-only: fu 415 (a bowed rail
  loses tenon, dado and stopped dado at its ends; CLOSED later that day by the user's ruling, see notch drop + fu 415 above). Next: chunk 3 (bands).
- **Joinery accepts holes (joinery features chunk 1; 2026-10-22; branch `joinery-holes`, MERGED `f3493a7`, DEPLOYED 2026-10-22 as `index-ChnyDt9R.js` / CSS
  `index-Cj7r9G0C.css` unchanged; schema 20 unchanged)**: spec `docs/superpowers/specs/2026-10-21-sloyd-joinery-features-design.md` (P1–P3 and
  the execution amendments), plan `docs/superpowers/plans/2026-10-21-sloyd-joinery-holes.md`. Live check `docs/browser-verification-joinery-holes.md`
  (free checks + one approved paid run, ≈ $0.03). Merged tree: build green, 7139 tests. Deployed and verified by bundle hash (sha256 matching
  `dist/`) in-network and at the edge, CSP, the old bundle 404s in-network, a clean real-browser load; production storage read empty after.
  **Rollback:** no schema change, so rolling back to `98c7df4` (`index-BZhrLswD.js`) is free. Owed to the user: the summary-line and
  `HOLE_CHECK_FAILED` wording (chunk 2 generalised it to `FEATURE_CHECK_FAILED`). Record-only: fu 413, 414. Next: chunks 2 (curves and profiles) and 3 (bands), each its own plan.
- **Hardware bill of materials (production until joinery chunk 1; 2026-10-21; branch `hardware` 218816a..53e483f, MERGED `98c7df4`, DEPLOYED 2026-10-21 as `index-BZhrLswD.js` / CSS `index-Cj7r9G0C.css`; schema 20)**: spec
  `docs/superpowers/specs/2026-10-20-sloyd-hardware-design.md` (approved, P1/P2 approved). Ten tasks; the full suite passes (CLAUDE.md has the count),
  `npm run build` green. The live pass on the dev server (`docs/browser-verification-hardware.md`) found one crash, a SHAPED part's
  Properties Hardware section (a fresh array per `getSnapshot`), fixed in `c9d5c08`. **Rollback once deployed:** a build below 20 REFUSES every
  project saved at 20, so export first. Owed to the user: the spec's *Amended (implementation)* wording (fu 410–412) and the four dialog
  refusal words. Review minors: fu 409; spec §11: fu 404–408. Merged `--no-ff` (merged tree verified, 7018 tests, build green), branch deleted; deployed and verified by bundle hash, CSP and a clean real-browser load.
- **Band wording** (production until the hardware round; deployed 2026-10-20 from the merge `4a6d6a1`, bundle `index-QDQAnB8n.js`, CSS unchanged: sides as a list,
  `all four sides`, band types counted apart in Buying's tail; no schema change, so rolling back to `dc8d5c3` (`index-ymPlKpkL.js`) is free).
  The Banding section on the additions' pattern was deployed 2026-10-20 from the merge `dc8d5c3` (bundle `index-ymPlKpkL.js`,
  CSS `index-CgWDfdXW.css` (unchanged); `+ Add banding ▾` until a part is banded, `New solid edging…`; no schema change, so rolling back to
  edge banding chunk 2 (`834ce5a`, `index-Vul7x2lO.js`) is free). Edge banding chunk 2 was deployed 2026-10-20 from `834ce5a` (merge
  `5e55b17`; no schema change, so rolling back from it to chunk 1 (`37ced13`, `index-Df8FpxEW.js`) is free). Chunk 1 was deployed
  2026-10-20 from `37ced13` (merge `b7f700b`; **SCHEMA 19**: rolling back from it to chunk c2 (`90ef45f`, `index-Cqf9kRT7.js`, CSS `index-CXYEMHnU.css`) REFUSES every
  project saved since — export first). Chunk c2 was deployed 2026-10-19 from the merge `90ef45f` (no schema
  change, so rolling back from it to c1 (`65fb1fe`, `index-TCisED7E.js`) is free). Chunk c1 was deployed from `65fb1fe` (no schema
  change, so rolling back to b2 (`7794999`, `index-BhtaBf2G.js`) is free). Profile runs b2 was deployed 2026-10-19 from `31d88fd` (**SCHEMA 18**,
  unchanged): rolling back to b1 (`dc49b01`, `index-CDDCzMGJ.js`) REFUSES a project holding a two-side stopped run — export first —
  and builds a one-side stop on a turned path as a2's straight prism (on an arch it vanishes; its data intact). Rolling back further, to
  a1 + a2 (`3ee667e`, `index-BbXkYYy4.js`), also REFUSES a project holding an All round profile; an End to end saved by b1 loads on a2 unchanged.
  Rolling back to edge profiles chunk 1 + fu 388 (`5a9ead8`, `index-B_aEoJl0.js`) or earlier REFUSES every project saved since schema 18 — export first.
  Curves chunk 2's bundle was `index-C-5a29hA.js`, CSS
  `index-DdiQhqkN.css`, **SCHEMA 17** (unchanged by chunk 2, so rolling back to curves chunk 1, `54ea740` / `index-D4nh2vvL.js`,
  is free; below 17, `7f851f9` / `index-BZDp6iOz.js` or earlier, REFUSES every project saved since — export first). Test count
  is under Commands.
- **Curves chunk 1 (spec `2026-10-15-sloyd-curves-design.md`, plan `…-curves-chunk1.md`, inv 53)**: deployed. Arch,
  Half-round notch, Bow, Rounded corner(s) cut through a part; viewport, edges, section caps, snap points, cut list, Properties.
  The execution rulings marked *Amended (implementation, chunk 1)* in the spec await the user's review. Open near it:
  361 closed (chunk 2), 362–367 (spec §12), 368 closed 2026-10-16, 369–373 (residue; 370 real-hardware looks: smooth shading, the grain seam).
- **Curves chunk 2 (drawings; plan `…-curves-chunk2.md`, inv 47/53, fu 361 closed)**: deployed (merge `1e16c01`). **No schema change** (17). The Plans sheet draws arcs at 0.001" and the silhouettes of curved surfaces (a live defect on master: open rounded-top
  ends, no arch crown); part diagrams draw the waste, sharp-vertex lines and curve notes. Rulings Q1–Q6 (marked *Amended
  (implementation, chunk 2)* in the spec) await the user's review. Open near it: 374–379 (residue).
- **Metric display (spec `2026-10-15-sloyd-metric-display-design.md`, inv 52)**: deployed. 354 closed (metric parts match the nominal
  sections and stock they read the same as). 359 closed (follow-ups 1: imperial omits a plane note that reads the same), 356/358 record-only. 355, 357 and 360 closed and deployed (357's real Brave print is owed for the user's eye).
- **Section cut (spec `2026-10-14-sloyd-section-cut-design.md`, inv 51)**: deployed. Open near it: 347 (cap look on real
  hardware), 349–350, 352 record-only (348 closed: a drilled cap's outline is built, ~10.6 ms) (351 closed: inv 43 amended).
- **Holes (spec `2026-10-14-sloyd-holes-design.md`, inv 50)**: both chunks deployed (schema 16; fu 327 and 343 closed).
  Open near it: 328–342 (336: the wall-grain seam, deferred by the user to a texture/shader session; 337: real-hardware
  looks owed), 345–346 (335, 338, 339, 344 closed in follow-ups 1).
- **Follow-ups 1 (2026-10-15, branch `follow-ups-1`, merged to master as `333bddf` and DEPLOYED as `index-LdkILHkB.js`; no schema change, so
  rolling it back costs nothing)**: closed 369 (a curved part's holed planes drawn as one region: watertight, the pinned
  arched side ~52 → 16 ms), 375 (silhouettes clipped to the wood), 339, 262 (+261 not reproducible), 338 and 359 (the
  user's rulings), 335 (bookkeeping), 348, 344 + 263, 316, 296. Its two implementation rulings were APPROVED by the user
  2026-10-16: 296 (angle-cuts spec §7 amended) and 262's set of view-only actions (Hide others, Select copies, Select
  linked, the guides disclosure).
- **Fu 368 (2026-10-16, merged as `1015f08`, deployed as `index-DG6bkBPk.js`)**: a non-convex waste's rebuild ~52 → ~6 ms: `bodyEdges`' line and
  coplanar lookups indexed (byte-identical, A/B over 21 fixtures), ear-clip triangles merged into convex pieces
  (Hertel–Mehlhorn; 83 bodies → 16); the frozen-bodies hypothesis did not reproduce. No schema change.
- **Follow-ups 2 (2026-10-16, merged as `0f4d732`, deployed as `index-BFCf2c3f.js`; no schema change)**: closed 297 (offset miters read-only),
  290 (Float32 slivers measured absent, pinned), 314 (unreachable), 287 and 292 (the user's rulings: record-only, wording
  kept), 208/209 (undo, redo, delete refused mid-drag), 210 (a cleared mixed field stays mixed).
- **Follow-ups 3 (2026-10-16, merged as `11743cd`, deployed as `index-DwWqjN7c.js`; no schema change)**: from the 1–178 triage, closed 168 (a
  failed run's spend reported, `< $0.01`), 53 (offset refused past `posDim - width`), 152 (Escape returns focus to the caret), 95
  (the sheet count says what it leaves out), 35 (a project that cannot be opened says why in the menu), 3, 18, 9, 23, 40, 14, 57,
  and 11 (its named remedy rejected: three's Raycaster would throw on `raycast={null}`). The user's rulings (2026-10-16): 37
  record-only (the new centre seed's band crossed its neighbour; reverted); 96 closed by its own round (below).
- **Fu 96 (2026-10-16, merged as `9a31093`, deployed as `index-BspJH3pS.js`; no schema change)**: a sheet or board layout part too small for its index
  number gets a callout beside the drawing with a leader (the user's rulings: beside the part; a long interior leader accepted).
- **Follow-ups 4 (2026-10-16, merged as `c27f8ff`, deployed as `index-BxqTdZO2.js`; no schema change)**: the triage's last code-sized opens —
  test gaps 127, 13, 54 (`groupFields`: the group key is the row key's prefix), 2 (an import test that could not fail, fixed);
  98 (a Saw kerf field in the cut list header, `setKerf`), 154 (closed: the index is re-read on every write; pinned with two
  adapters), 6 (`1  1/2`, `1 - 1/2` parse).
- **Plans balloons (2026-10-16, spec `2026-10-16-sloyd-plans-balloons-design.md`, plan `…-plans-balloons.md`, merged as
  `2cbfff4`, deployed as `index-CCbseJx_.js`; no schema change)**: fu 252 closed — one numbered balloon per cut-list row on the Plans sheet's exploded view; the
  cut list prints the row number, and its layouts label small parts with it (the user's ruling: one series). Residue 380 (column
  balance, for the user's eye; the real print).
- **Feature callouts (2026-10-16, spec `2026-10-16-sloyd-feature-callouts-design.md`, plan `…-feature-callouts.md`, merged as
  `ec438c9`, deployed as `index-CaMRIw2a.js`; no schema change)**: fu 333, 279, 362 closed — every hole row, angle cut and curve gets a lettered tag on the elevation trio that keys
  its part, in its true view (dashed when hidden everywhere), and a key list under the trio in short bench words. Residue 381
  (tags over dimension lines, for the user's eye; the real print).
- **Follow-ups 5 (2026-10-16, merged as `007ea3a`, deployed as `index-uIgR_wtf.js`; no schema change)**: closed 216 (`pocketFor` stores a mm cut's own numbers on
  the exact grid point — turned and moved parts split no cut-list row), 7 (device filenames), 51 (`id_` ids), 71 (pinned), 78
  (no sliver cell; it was marked crossing), 151 (row actions reveal on KEYBOARD focus; the user approved the look). 207
  record-only by the user's ruling (rare; the one remedy re-enables orbit mid-press). Residue 382.
- **Fu 383 + 381(4) (2026-10-16, on master after follow-ups 5; no schema change; deployed 2026-10-17 as `index-BGflwWYN.js`)**: the printed cut list starts each
  material section and Buying on a new page (the user's ruling), checked with a real Chromium PDF (`page.pdf()` via the
  Playwright code runner — a real print IS possible on this host); a stored part is keyed once on the Plans sheet (381(4)).
  The user's real print closed 70, 79, 84, 94, 254, 345, 374, 379, 380(4), 381(3).
- **Follow-ups 6 (2026-10-17, merged as `51f022f`; with fu 269 deployed as `index-D-v_Ne4g.js`; no schema change)**: closed 8 (`storage/index.ts`, guarded), 17
  (`viewport/gizmoPatch.ts`), 19 (showX/Y/Z honoured; the patch unit-tested), 27 (`pointer.test.ts`), 126, 128, 169 (`api_error`
  retryable), 175 (a throwing cost function no longer strands a batch), 234 (the concept planner knows assemblies AND tapers);
  12 by decision, 31 by measurement. **269** (the user's go): priced by-the-piece Buying keeps the cheapest of a plan per
  preferred opener (was largest-first only: up to 44% dearer); unpriced stock unchanged (the user: "keep unpriced as is").
- **Section views (2026-10-17, spec `2026-10-17-sloyd-section-views-design.md`, plan `…-section-views.md`, merged to master as `114f449`; DEPLOYED as
  `index-CosJqZi4.js`; no schema change)**: fu 256 closed — with the viewport's Section on, the Plans sheet marks A–A on one edge-on elevation of the piece
  trio and draws a hatched Section A–A of the ASSEMBLED piece after it (`drawView`'s `section` option, `sectionView.ts`). Residue 384
  (hatch density and the cut line's weight for the user's eye on a real print).
- **Presets batch (2026-10-17, spec `2026-10-17-sloyd-presets-batch-design.md`, plan `…-presets-batch.md`, merged to master as `ec795fb`; DEPLOYED as `index-D8voXrmI.js`;
  no schema change)**: fu 278 (Taper two/four faces), 298 (the Chamfer row edits each leg; a Raised panel preset), 367 (a Kind select on
  curve rows, `curveAs`) closed. Residue 385 closed by the user's ruling (an end chamfer that leaves a tongue sets no short point), deployed as `index-JgTwUVAc.js`. The bevels' look on real hardware: approved by the user.
- **Presets minors (2026-10-17, merged to master as `e776ecc`; DEPLOYED as `index-fwemJPwC.js`; no schema change)**: the presets batch's three deferred review minors — the
  curve Kind select judged on focus with the reason on a greyed option, and the preset menu details in the project's units.
- **Edge profiles chunk 1 (2026-10-17, spec `2026-10-17-sloyd-edge-profiles-design.md`, plan `…-edge-profiles.md`, merged to master as `7b04744`; DEPLOYED as
  `index-D9D90lOX.js`; no schema change)**: fu 365's full-length half and fu 386 closed — Roundover, Cove, Roman ogee, Bead, Thumbnail (an optional
  fillet) along a long edge or an end, as plain `CurveCut`s recognised by `profileFields`; a Profiles section; bench lines, a four-edge
  collapse, Plans key lines. Fu 386's cause was single-axis (`EDGE_ON`). The final review's fixes: a curved part's edges no longer graze
  hidden in their own wood (`curveEdgeLifts`), and a four-edge ogee top rebuilds in ~30 ms (was 142). Open near it: 365 (blind curved recesses;
  stopped profiles shipped in a2), 387, 389, 390 (a profile following a curved edge), 391 ((1) closed in a2). **Fu 388** (the Profile select greys a
  refused option and says why; the user's ruling) merged as `b64b7a1`, DEPLOYED as `index-B_aEoJl0.js`. Real-hardware look: approved.
- **Profile runs chunk a1 (2026-10-17, spec `2026-10-17-sloyd-profile-runs-design.md`, plan `…-profile-runs-a1.md`, merged to master as
  `305934d`; DEPLOYED with a2 2026-10-18; **SCHEMA 18**)**: edge profiles are stored as `Board.profiles` (`ProfileCut`), moved out
  of `curves` on every load; every geometry, word and fault reader goes through `geometryBoard`; a run this build cannot build (all
  round, stopped, ends on two sides) or an unknown kind refuses the document. No visible change (a v17 project reads byte for byte the
  same, checked live). **Rolling back below 18 refuses every project saved since — export first.** **Deploy a1 together with a2, never alone**
  (a1 shows nothing new; its loader's last gate hole, fu 391(1), closed in a2). Planning rulings P1–P8 are in the spec (*Amended (planning)*).
- **Profile runs chunk a2 (2026-10-18, plan `…-profile-runs-a2.md`, merged to master as `a0b0186`; DEPLOYED with a1 2026-10-18 as `index-BbXkYYy4.js`; schema 18,
  unchanged by a2)**: a profile on a straight side may stop short of either end (Run → Stopped; Start/Stop from the run dimension's min
  end) and runs out as the router's bit would — the profile revolved about the bit's axis `BEARING` 1/4" outside the edge
  (`runout.ts`; inscribed sectors, no step at the station). Bodies, edges (`smoothPair`), smooth run-out normals, a watertight mesh,
  span-clipped and facet-chain silhouettes, snap points (P17), hole faults (P14), bench lines (`, from <a> to <b> (stopped)`) and keys
  (`, stopped`). Rulings P9–P19 (*Amended (planning)*) and I1/I2 (*Amended (implementation, a2)*: a preset takes the FIRST edge its
  default fits, its detail names the edge; a typed 0 or full length makes that end run out through) — I1/I2 await the user's review.
  Open near it: 392 (residue; the run-outs' shading on real hardware and the cove's dashed contours on a real print for the user's eye).
  **Rolling back below 18 refuses every project saved since — export first.** Chunks b1 and b2 followed (below).
- **Profile runs chunk b1 (2026-10-18, plan `…-profile-runs-b1.md`, code complete at `fafc8b6`; MERGED to master as `dc49b01`, DEPLOYED 2026-10-18 as `index-CDDCzMGJ.js`; no
  schema change, 18)**: a profile follows the outline. End to end on a side an Arch, notch, Bow or Rounded corner has cut follows that
  side's stretch and carries round its corner arcs to run out at the far tangent point (B1); two End to end runs sharing only a corner
  arc mitre at its middle (B1a); Run → All round (`{ loop: true }`, now loaded) follows the whole outline. Built as SWEPT profiles
  (`profilePath.ts`, `sweep.ts`: the outline's skeleton bands × the kept section, inv 48), shaded smooth and watertight, edged
  (`sweptSmoothPair`), probed, drawn (fine-path creases, facet-chain silhouettes), diagrammed (the thickness view's inner line),
  faulted (`runs-off`, `too-tight`, overlap on the path's cover), worded (`all round <face>`, `, round the corner(s)`) and keyed; a
  straight run keeps a1/a2's bytes. Saved End to end profiles on a cut side follow on load (B10); one too tight to follow runs
  straight as a2 built it, its row noting `Runs straight: too tight to follow the curve.` (the final review's I1; **the user's ruling,
  approved**: "Fall back to straight"). Curves refuses an edit that ADDS a profile fault, naming the profile. **b1 can deploy alone
  (B7)**: the row greys Stopped on a turned run (`A stop on a curved or cornered run comes later`). **Rollback:** a2 REFUSES a b1
  project holding a loop (All round), so rolling back to `3ee667e` / `index-BbXkYYy4.js` refuses such projects — export first; a b1
  End to end loads on a2 unchanged (drawn as a2's straight prism). Await the user's review: the *Amended (implementation, b1)* blocks
  (B1a; Q3/Q6's Task 3 amendments — dropped cells, the odd-count mitre projection, a swallowed end chord is `too-tight`), B1's ε
  (the built run goes on 2·reach·tan(φ/2) past the tangent point, up to 0.084"; never a decision), Q7's wording (`, top on the edge`,
  `, round the corner(s)`), and Q6's I2 amendment (the controller's ruling: a station run claims only straight side chords). Open
  near it: 393 (residue; the user's eye; its speed rows went to chunk c — the ogee loop's 48 ms left as is by the user's ruling). b2 followed (below).
- **Profile runs chunk b2 (2026-10-19, plan `…-profile-runs-b2.md`, code complete at `5027ff9`; MERGED to master as `0e41f87` (guards re-baselined `bbc46fd`), DEPLOYED 2026-10-19 as `index-BhtaBf2G.js`; no
  schema change, 18)**: chunk b complete (fu 390 closed). A Start or Stop may sit on an arch, a bow, a notch or a corner arc
  (B2, `stationPoint`) and runs out there with the cutter revolved about the bit's axis `BEARING` outside the station's MODEL
  chord (Q12, `StopFrame`, `stopRunoutPieces`). A stopped run may start on one side and stop on another, round every corner
  between (B3; a second select, **Stop side**; up to two whole sides between, never back onto Start's side). Stopped is offered
  on any side (B7 lifted). A one-side stop on a turned path is SWEPT (Q9). A saved a2 stop there follows on load when the bit
  fits; it runs straight as a2 built it when it does not, or when following would ADD a fault to another profile (Q10, decided
  first: `stopFallsBack`), its row note worded by cause (`runsStraightNote(fallbackCause(…))`). A two-side run never falls
  back. Built, shaded (junction vertices take the band's normal), watertight, edged, probed, snapped, drawn, diagrammed,
  faulted, worded (`, from <Start> round <between> to <Stop> (stopped)`, Q21) and keyed (`, stopped`). The row refuses an edit
  that adds a fault to ANY profile; Curves names the profile on an added `stop-off`. Deploys on top of b1 alone. **On upgrade**
  a saved a2 stop on a turned path that fits changes its wood on first open (`stopOnArch` 97.527 → 97.375 in³), its bench line
  unchanged. **Rollback** to `dc49b01` / `index-CDDCzMGJ.js`: a project holding a two-side run is REFUSED (export first); a
  one-side stop on a turned path (an arch, notch, bow or corner arc) loads SILENTLY on b1 (no fault, no note, the same bench
  line) and is built as a2's straight prism along the side, which on an arch cuts only air, so the profile vanishes. Its data
  is intact, and it follows again when reopened on b2. Await the user's review: R5–R7 (the Stop side select: an adjacent side
  moves the station NEARER the shared corner, the short way round; an opposite side keeps the station SHOWN as Start, or, where
  that would make an inconsistent through Start, the profiled extent on the kept side; a moved through end is seeded), the
  crossed-stations `stop-off` rule (inv 53), M1 (a long-way run with ONE station on the arc its two sides share is refused as `stop-off`,
  with `A stop runs off the part` words), M2 (Side onto a shorter side on a one-side run is greyed, as a2, not seeded), the neighbour-refusal
  words (`The roundover overlaps another profile on this edge — move the roundover first.`, ambiguous between two of one kind)
  and Curves' `A stop on the roundover runs off the part — move it first.`, and Task 6's junction shading override. Open near
  it: 394 (residue; its speed rows closed by chunk c — the two-side cove ≤ 38.2 ms, wrapFour 27.9 — and wall-clock guards flaky
  under load). Live pass: `docs/browser-verification-profile-runs-b2.md`.
- **Chunk c1 (2026-10-19, MERGED to master as `65fb1fe`, DEPLOYED 2026-10-19 as `index-TCisED7E.js`)**: byte-identical speed fixes for swept rebuilds (the spike's
  bounded half; the user's target "all under 40 ms"). Kept: a part's face plans and arc chords built once per board (`grainTiling`), a
  faster `deepFreeze`, scalar `clipPolygon`/`minusCover`/`twiceArea` (`holes`), `clip`/`ring` without per-face arrays (`bodies`), `bodyMesh`
  straight into Float32Arrays and `bodyEdges`' setup as scalars. Dropped (not provably byte-identical): the piece reject and the twin
  skip. Alone, min of 9: ogee loop 80 → 61, cove 61 → 45, bead 56 → 46, two loops 58 → 36, two-side cove 56 → 43 ms; guards lowered only.
  Still over a frame then: bead, cove, ogee loops and the two-side cove — **c2** followed (below). No schema change; rollback free.
- **Chunk c2 (2026-10-19, MERGED to master as `90ef45f`, DEPLOYED 2026-10-19 as `index-Cqf9kRT7.js`; plan `…-swept-speed-c2.md`; no schema change, so rollback is free)**: the restructure for swept rebuilds, in three stages. Stage 1:
  a shaped part draws ONE geometry (`partMesh`), not a mesh per body (313 meshes on the ogee loop). Stage 2: an exact twin seam draws nothing without
  `minusCover` (`seams.ts`: `twinFaces`, `faceCover`). Stage 3: a face the part's other bodies cover completely makes no edge candidate (it stays a wing).
  Bodies unchanged. **Gate MISSED**: alone, every row but the ogee loop (48.1) is <= 40; in full runs the bead loop (40.2) and two loops (41.2) also cross 40. Worst minimum, before → after, alone with alone: ogee loop 63–72 → 48.1,
  cove 45–49 → 38.2, bead 41–42 → 39.1, two loops 35–37 → 37.4, two-side cove 43–44 → 38.2. Guards lowered: ogee 89 → 61, bead
  71 → 51, cove 62 → 48, two-side cove 62 → 48; two loops stays 51. Levers left (spec §5, the user's decision; most grow with the body count, which
  spec §1 holds fixed): `sweepBodies` (~11 ms), `sectionSeams` (~5), per-body mesh emission and swept normals. Browser (production, software GL):
  idle two frames 320 → ~183 ms, a commit's two frames 431 → ~270–290. Amendments A1–A4 (*Amended (planning)* in the spec: stage 2 by the twin test alone with no
  `internal` tag; stage 3 removes candidates, never faces; no memo on `partMesh`; stage 3 runs) were APPROVED by the user 2026-10-19. Merged and deployed (Production, above). **The ogee loop's 48 ms is left as is by the user's ruling
  (2026-10-19): fu 393(2), open by decision — do not pursue unasked.**
- **Edge banding chunk 1 (2026-10-19/20, spec `2026-10-19-sloyd-edge-banding-design.md`, plan `…-edge-banding-1.md`, inv 54; branch
  `edge-banding-1`, MERGED to master as `b7f700b` (final review's fixes `9f36387`); DEPLOYED 2026-10-20 as `index-Df8FpxEW.js`; **SCHEMA 19**)**: fu 267's
  banding half. Band types (`doc.bandTypes`: tape or solid, the built-in `Iron-on veneer` always present) and bands on a part's four
  broad-face sides (`Board.bands`, `cornerRule`); the model is the FINISHED size, the cut list the CORE, with band lines, a header note,
  solid strip rows (numbered, no balloon), cores nested; Buying adds strips to their material and an `Edge banding` tape block; a Banding
  section in Properties and an Edge banding section in Materials & prices; Curves refuses breaking a band; joinery, Refine and Repair
  refuse banded projects. Live pass: `docs/browser-verification-edge-banding-1.md` (every planned number matched). Every amendment in the spec (P1–P5, *Amended (implementation,
  chunk 1)*) was APPROVED by the user 2026-10-20; fu 395 (the live pass's items) closed
  the same day. **Rolling back below 19 refuses every project saved since — export first.** Chunk 2 followed (below).
- **Edge banding chunk 2 (2026-10-20, plan `…-edge-banding-2.md`, spec §8; branch `edge-banding-2`, MERGED to master as `5e55b17`;
  DEPLOYED 2026-10-20 as `index-Vul7x2lO.js`; no schema change, 19)**: bands made visible. Viewport: a banded side's triangles take the band's look by a
  POST-PASS (`viewport/bandFaces.ts`: tape the part's long grain, no plies; solid the band's colour), solid bands draw glue lines
  (`glueLines`, `banding.ts`), clipped by the section. Plans sheet: glue lines as `band`-tagged segments, a key line per (part,
  band type). Part diagrams: heavy marks on banded sides, the band line and a core note (fu 395(1), the user's ruling: drawn at
  the finished size), a strip's mitred ends hatched. The spec's *Amended (planning, chunk 2)* Q2–Q7 were APPROVED by the user 2026-10-20. Open
  near it: fu 402 (real hardware and a real print). Live pass: `docs/browser-verification-edge-banding-2.md`. Rollback is free (no schema change).
- **+ Add banding (2026-10-20, the user's request; merged `dc8d5c3`, DEPLOYED as `index-ymPlKpkL.js`; no schema change)**: the Banding
  section follows the additions' pattern — only `+ Add banding ▾` until a selected part is banded, then the side selects, Corners, notes
  and `Band ▾` — and both menus end with `New solid edging…` (Materials & prices opens on a new Solid row; solid edging was reachable
  only from the cut list). Spec §5.1 records the change.
- **Band wording (2026-10-20, the user's choices on fu 395(2)–(3); merged `4a6d6a1`, DEPLOYED as `index-QDQAnB8n.js`; no schema change)**:
  band lines list three or more sides and read `all four sides`; Buying's unpriced tail counts band types apart. **Edge banding is
  complete and every spec amendment is approved; fu 395 is closed.**
- **NEXT (audited 2026-10-20, session close):** nothing is pending deploy (production is `4a6d6a1`; later commits are docs). Owed to the
  user: fu 402(1)–(2) (band looks on real hardware, glue lines on a real print). As the user directs: fu 396–403 (396, 397 open by
  decision; 398–400 features; 401, 403 record-only), and fu 267's hardware bill of materials (needs its own spec). Otherwise no follow-up is open as code-sized work: the triage's four (207, 216, 234, 269) are done — 207 record-only by
  the user's ruling, 216/234/269 closed — and fu 256 shipped as section views. What is left, all under Open follow-ups below: a
  feature spec (the feature-sized list), the user's eye or hardware (the owed list), or an open-by-decision item (ask first). Every follow-up 1–380 was TRIAGED 2026-10-16 (each
  entry's last `**Status:**` line tagged `(triaged 2026-10-16)`); 381–384 came later. `docs/follow-ups.md` is authoritative —
  some entries close mid-line (`… **Status:** closed.` after an older `- **Status:** open.` bullet), so read an entry whole.
- **The deployed commit always trails `HEAD`**: a deploy's own record is committed after
  it. Docs-only commits past the hash above are not unreleased work, and some rounds ship
  byte-identical bundles (test-only). Check what a later commit touches before reading
  `git log` as a pending release.
- Every runbook entry and bundle hash: `DEPLOYMENT.local.md`. Per-round narrative and the
  deployment record: `docs/history.md`. Design specs:
  `docs/superpowers/specs/<date>-sloyd-<slug>-design.md`; live checks:
  `docs/browser-verification-<slug>.md`; screenshots: `docs/img/` (prefer a DOM readout,
  add an image when the finding is spatial).
- **Do not re-propose** two items declined on purpose: CSV/clipboard export and name
  run-collapsing (`Leg 1..4`).

## Owed to the user: spec amendments awaiting review (moved from CLAUDE.md, 2026-10-22)

**APPROVED 2026-10-23, all of the list below, in bulk** (the user, in the owed-reviews pass; joinery chunks 2–3's calls walked
through in plain terms first: their words kept, `FEATURE_CHECK_FAILED` now names edging, fu 419's part note fine as is). The
by-eye items further down stay owed.

Spec amendments awaiting the user's review: the joinery-features spec's *Amended (planning, chunk 2)* and *Amended (execution,
chunk 2)* blocks — the bow correction (a bow at a tenoned end lost the growing kinds) is SUPERSEDED by fu 415's ruling (2026-10-22:
a curve that only meets a growing end keeps them when its end-face waste clears the tenon section; a default bow keeps its tenon),
whose accepted costs are owed too (fu 417, open: a shifted Bow or Rounded corner loses its preset; a dadoed bowed end's step at
the housing) — and its P8 words: the summary lines (`… ruled out — <part>'s roundover profile is in the way.`, `left as a butt —
… in the way of every joint.`) and `FEATURE_CHECK_FAILED`; the curves spec's *Amended (implementation, chunk 1/2)* rulings, the profile runs spec's I1/I2 *Amended (implementation, a2)*, its b1 amendments (B1a, B1's ε, Q3/Q6 Task 3, Q6's I2, Q7's wording), its b2 amendments (R5–R7, crossed stations, M1, M2, the neighbour-refusal and Curves stop-off words, the junction shading override; fu 394), and the section views spec's §3.3 *Amended (implementation)* (its own block, `DRAW_EPS` touching, no kept wood
  draws nothing).

Since the bulk approval: the splayed legs spec's *Amended (build)* (Rulings 1–19 — chiefly Ruling 1 `seamFree`, Ruling 4 the
magnitude/direction controls replacing §4's "same world lean to each", Ruling 7 Level's top reference R narrowing §5's "always extends",
Ruling 8 any end miter recognised, Rulings 14–16 Repair only with cuts, Refine's assembly refusal and no floor shift; not deployed). The mirrored links spec's *Amended (execution)* (Rulings 1–11, chiefly Ruling 1 replacing §5.1's
mirror-candidate mechanism, Ruling 5 the checkbox's world-X form, Ruling 6 Link's flag rule, Rulings 10–11 joinery's exact regroup).
(The AI profiles and bands spec's *Chunk 2 (execution)* block — Rulings 1–16, the final review's fixes,
R6.3 dropping §4.2's done-view line — was APPROVED in bulk by the user 2026-10-23; Rulings 10/16 individually the same day.)

By eye (moved from CLAUDE.md in full): 142, 319, 380(1) column balance, 384(2) section hatch and cut line on a real print, 387(1) a profile's edge-on silhouette on a real print, 392(2) stopped profiles' run-outs (real hardware; a cove's dashed contours on a real print), 393 swept surfaces' and tangent points' shading (real hardware) and the cove's doubled Iso silhouette (a real print), 394 b2's stops on a curve (shading at a curved stop, a resize drag on a two-side cove, the Stop side select live), 272 (a phone).
