# Browser verification — counterbores and countersinks (fu 330 chunk 1)

2026-10-29, branch `counterbores` at `5312f7e`, dev server `localhost:5199` in the user's own Chrome (MobaXterm tunnel, real
GPU), Claude driving through claude-in-chrome. A NEW project ("Untitled") was made for the check; it is left in place on the dev
profile (the user's ruling, 2026-10-17). Screenshots were taken but not committed (they live in the extension's temp folder);
the readouts below are the record.

Fixture: one Pine board 3" × 2" × 3/4", two rows added through the store from the presets — `Countersunk screw` (3/16"
through, 3/8" at 82°) at 13/16" from the length min end, and `Counterbored screw` (3/16" through, 3/8" × 3/8") at 2-3/16"; both
1" in from the width min side. `holeFaults` empty for both.

| # | Check | Result |
|---|---|---|
| 1 | Both heads in the viewport (iso and top) | **PASS.** Top view: the countersink's cone runs smoothly into the bore, light through it; the counterbore shows its flat step annulus, its wall and the bore through the middle. No cracks, no shading seams at the step or the cone/bore junction, on real hardware. |
| 2 | Section (Front plane through both axes) | **PASS.** The cap shows the countersink as a V into the bore and the counterbore as a square step with the bore below, both through the full 3/4". |
| 3 | Plans sheet | **PASS** (text and plan view). Key lines read exactly `A Hole 3/16" dia × through, 3/8" countersink at 82°` and `B Hole 3/16" dia × through, 3/8" counterbore × 3/8" deep`; the plan view draws two concentric rims at each mouth. The side views are too small at this part size to judge the stepped hidden lines by eye — **owed to the user by eye** (with fu 570's exploded-iso question). |
| 4 | Edit and refuse | **PASS.** Diameter typed to 3/8" (= head): refused in the field with `The counterbore or countersink must be wider than the hole.`, nothing stored. Tilt toward end typed 10° on the headed row: refused with `Remove the counterbore or countersink before tilting the hole.` Head select Countersink → Counterbore: stored `head: counterbore, headDiameter 0.375, headDepth 0.1875` (seeded at the bore's diameter), no `headAngle`. → None: no head key left. |
| 5 | Metric project | **PASS.** Units → mm: the presets read `4.5 mm screw, 9 mm countersink at 90°` and `4.5 mm screw, 10 mm counterbore 10 mm deep`; the existing rows' lines `Hole 4.8 mm dia × through, 9.5 mm countersink at 82° …` / `… 9.5 mm counterbore × 10 mm deep …`. |
| 6 | Undo/redo; round trip | **PASS.** Undo walked None → Counterbore → Countersink one entry per edit, redo replayed. A page reload (autosave → `migrateDocument`) brought the project back at version 30 with both heads intact (`countersink 0.375 @82`, `counterbore 0.375 × 0.375`). Export → import was not exercised (it downloads a file); import runs the same `migrateDocument`/`validateHoleRows` as the reload, which Task 1's tests pin. |

Owed to the user by eye: the Head select's position in the row (after In from/Side, beside the tilt controls; spec §4.1 said
"below Through/Depth" — Amended (build) R2); the Plans side views at a readable size; the exploded iso (fu 570); the Refine
dialog's kept-why wording with a headed part (needs a paid run; none made).
