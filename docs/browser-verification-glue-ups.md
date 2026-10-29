# Browser verification — glue-ups from narrow stock (fu 268)

Date: 2026-10-29. Dev server `http://localhost:5199` on branch `glue-ups`, in the USER's own Chrome over their MobaXterm tunnel,
Claude driving through claude-in-chrome. A NEW project, `Glue-up check (fu 268)`, made through the project menu (+ New project)
and filled through the page's own store module: four pine legs 1½ × 1½ × 28 and a pine top ¾ × 22 × 40, default shop (no
prices). Left in place afterwards (the user's ruling); no other project touched; no paid call; production not touched.

Read as a DOM readout of the cut list's Buying section (spec §7's browser item):

| Check | Result |
|---|---|
| The buy line | `Buy 1 × 1×12 × 8′, 1 × 2×2 × 10′ · no price` — the legs' 2×2 exactly as before, the top on one 1×12 × 8′ |
| The note | `Top (3/4" × 22" × 40"): glue up from 2 strips, 3/4" × 11-1/8" × 41" — no pine stock is 22" wide` |
| The 1×12 layout | two strips drawn, named in place `Top strip 1 of 2` / `Top strip 2 of 2`, each `41" × 11-1/8"` |
| The total | `Estimated materials: — (1 material has no price)` — no `not placed` tail |
| The cut list rows | unchanged: the Top's row is the finished `40" × 22"` part (spec §2, option A) |

Screenshot: `.superpowers/sdd/2026-10-29-sloyd-glue-ups/buying.jpg` (gitignored workspace; it does not survive a `git clean -fdx`
or the workspace's deletion — the readout above is the record).

Not exercised here, pinned by unit tests instead: a strip in the layouts' INDEX tier carrying the part's row number
(`CutList.test.tsx`, "glue strip"), metric, priced swap-down. Owed to the user by eye: nothing beyond a glance at the layout.
