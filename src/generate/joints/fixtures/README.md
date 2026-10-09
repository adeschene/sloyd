# Damaged joinery fixtures (follow-up 240)

Made by `make-damaged.4a340f7.ts.txt`, run as a Vitest test (saved as `src/gen/makeDamaged.test.ts`)
in a worktree at commit `4a340f7` (the last deploy before `a899b51`), with `FIXTURE_OUT=<dir>`. That
commit's `applyJoints` cloned the flat board list as a whole, so twin placements of one definition
shared one `cuts` array. Each file:

- `plain` — the tree document before joinery;
- `choices` — every non-butt joint applied, keyed like `RecordedJoint` (`jointKey` rebuilds them);
- `damaged` — the stored document that commit's joinery wrote back.

| File | What it shows | Repair removes |
|---|---|---|
| 1-frames-duplicates | two shared frames; each leg's mortise doubled | 2 |
| 2-frames-phantom | a stretcher enters the Front leg only; phantom mortise in the Back leg | 3 |
| 3-frames-turned | metric, off-grid, second copy turned 90°; twins differ in the last bit; already split | 2 |
| 4-cases-every-kind | dados, stopped dados, rabbeted back in two shared cases | 12 |
| 5-rail-enters-once | entering parts were never aliased: joined by the buggy code, undamaged | — (null) |
| 6-nested | a shared bench of two shared frames, placed twice | 12 |

Do not regenerate them with today's code: today's joinery is fixed, so it cannot make them.
