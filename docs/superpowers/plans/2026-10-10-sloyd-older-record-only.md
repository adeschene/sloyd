# Older record-only follow-ups — triage (2026-10-10)

Follow-ups 211, 214, 217, 220, 222, 228, 230, 231, 235, 239: every item gets one outcome.
**FIX** = change code (latent bug or stale text) with a test; **TEST** = add or strengthen a test,
mutation-checked; **CLOSE** = no change, with the reason recorded in `docs/follow-ups.md`;
**ASK** = a behaviour decision for the user. No schema change, no paid runs. Every FIX and TEST is
mutation-checked (a test that cannot fail is not done).

## Batch A — store and panels (211, 214, 220, 222, 230)

| # | Item | Outcome |
|---|---|---|
| 211 | `duplicateBoards` collapsing a repeated id; dropping a grab that is not a copy | TEST |
| 211 | GroupProperties' Through-thickness test is absence-only | CLOSE — mutation 12 covers the behaviour |
| 211 | "1 parts selected" unreachable | CLOSE — the store filters a one-part selection out |
| 214 | `HISTORY_LIMIT` (50) shared with eye toggles | FIX — the user's ruling (below): consecutive hide/show toggles share ONE undo entry |
| 214 | `.part-row.hidden .part { cursor: default }` may duplicate `button:disabled` | FIX if the hidden row's button is disabled (drop the duplicate); else CLOSE with why |
| 214 | TapeTool's ~120-char candidates memo | CLOSE — cosmetic, and viewport memo dep lists are inv 15's failure mode; not worth the risk |
| 220 | `copyInRow`'s `sign` unvalidated (0 stacks every copy) | FIX — refuse anything but +1/−1, as `rowLayout` refuses bad input |
| 222 | Properties' plural wording ("N parts", "N other parts") | TEST — link three parts |
| 222 | `runJoinery`'s link tests on the mocked path only | TEST — the fallback path keeps sharing too |
| 222 | `linkBoards` drops held points on unchanged members | CLOSE — point-precise, so harmless (stated in the entry) |
| 230 | `commitSnapMove` has no store guard against a twin target | FIX — refuse a target on another placement of a selected stored part (the `moveCandidates` rule, enforced where the move commits) |

## Batch B — tree, store and components (228, 231)

| # | Item | Outcome |
|---|---|---|
| 228 | Refusal/null paths: `groupItems` nonexistent id, `ungroupItem` non-instance, `joinPath`/`lastSegment`/`instancesOn`/`definitionAt` on null, `renameItem` nonexistent | TEST |
| 228 | Ctrl+G under a modal or in a text field; Escape's ladder order | TEST (App keydown tests) |
| 228 | Store paths: toggle-click across levels, tape surviving a level change, `openPart` on a root part, `restore` dropping a closed level's selection, self-snap into the selected assembly, cut-action mates across containers, `selectLinked` across containers | TEST |
| 228 | Weak: `flatDocument` compared with its own source | TEST — literal expected names/positions |
| 228 | Weak: `writeBackFlat` tested on a cut change only | TEST — a moved part (lowered as a delta) |
| 228 | Weak: `moveGroupTo`, turned-copy, "Group inside an open assembly" tests | TEST — strengthen to exact values |
| 228 | Weak: repair step-7 cannot tell per-container from world-wide | TEST — a fixture where the two differ |
| 228 | `translateItems` double-moves an ancestor given with its descendant | FIX — drop covered descendants (`isCovered`), cheap, closes a latent bug |
| 228 | Diamond hand-edited file copies 2^k times on load | CLOSE — needs a hand-edited file below v11 (`copyShared` runs only then); no v11 path reaches it |
| 228 | Identity-frame shortcut turns −0 into +0 | CLOSE — no visible or stored difference |
| 228 | `rekeyHeld` with `edit()` is three `set()` calls | CLOSE — no subscriber reads the transient state |
| 228 | `linkedHere` counts a hidden mate | FIX — count visible mates only (verified at `Properties.tsx:440`) |
| 228 | `instancesOn` rebuilds its map per call | CLOSE — not on a per-frame path |
| 228 | Stale comments (5 named) | FIX |
| 231 | `edit()` pushes an undo entry when nothing changed | FIX — skip the snapshot when the function returns the same document (an undo that does nothing is a wasted entry) |
| 231 | Link over placements of ONE stored part mints a one-user shape | FIX — `linkPlan` refuses fewer than two distinct stored parts (unreachable today; a cheap refusal) |
| 231 | An optional own field on a SHAPED part is dropped by `copyBoard`'s literal | FIX — copy the shaped part's own fields by spread (verified: only the shaped branch has the literal) |
| 231 | Joinery's exact grouping can split by a last bit | CLOSE — the safe direction (less sharing, never wrong geometry) |
| 231 | `subtreeSignature` roughly quadratic | CLOSE — furniture scale |
| 231 | Untested: Make Unique inside a shared container, `selectCopies` dropping hidden/held, a nested definition's `×N`, `treeRows.copies`, `writeBackFlat` input unchanged | TEST |
| 231 | `treeRepair` comment numbering, "9"/"schema 10" test titles, a test sorting `selectedIds` in place, unused `pick` parameter | FIX |
| 231 | Exported key order changed | CLOSE — no behavioural effect |

## Batch C — turns and joinery tests (217)

| # | Item | Outcome |
|---|---|---|
| 217 | Joinery equivariance covers 180° only | TEST — 90° and 270° |
| 217 | Equivariance guard doesn't pin each fixture's joint kind | TEST — pin the kind per fixture |
| 217 | UV sweep has no plywood chiral part | TEST — plywood variant, including a pose that sees reflect-after-swap |
| 217 | Oracles use the helpers | CLOSE — the table is pinned by `geometry.test.ts` / `turns.test.ts` |
| 217 | Turn-0 test partly circular | CLOSE — literal pins exist in `document.test.ts` |
| 217 | No millimetre (non-dyadic) migration case | TEST — solids within `FLUSH_EPSILON` |
| 217 | Tape-anchor-across-turn store tests not mutation-tested | TEST — mutate them |

## Batch D — generate and refine (235, 239)

| # | Item | Outcome |
|---|---|---|
| 235 | A violation naming a part missing from the authored index; one spanning two assemblies | TEST |
| 235 | `linkByRole`'s class-split guard load-bearing in one test only | CLOSE — `linksToShapes` re-checks, so no second test can see it |
| 235 | Run-level collapse test asserts loosely | TEST — exact text |
| 235 | Cosmetics (`'first' in x`, repeated label, dead `isShaped`, one cast) | FIX the dead `isShaped` branch; CLOSE the rest (tsc needs the cast; the label is not shown to the model) |
| 235 | Collapsed repair wording not seen live | CLOSE — needs a paid run that happens to fail; the unit test pins the exact text |
| 239 | `diffDesigns`' material-label guard cannot fire | CLOSE — labels are unique |
| 239 | ×N merges (added/removed inside a kept placement; material/link) | TEST |
| 239 | Dialog storage-unavailable branches, repairing/retrying text | TEST |
| 239 | The 240-placed boundary not mutated | TEST — mutate it |
| 239 | An off-grid value may land an ulp off | CLOSE — zero deltas are not printed |
| 239 | An unplaced definition counts toward distinct parts | FIX — `distinctParts` counts only definitions reachable from a placement |
| 239 | Estimate recomputes per keystroke | CLOSE — cheap now (the gate runs once per document) |
| 239 | Two `role="status"` can render together | FIX — one status region |
| 239 | `' turned'` duplicated in its merge key | FIX — one constant |
| 239 | Change list lost on close-and-reopen mid-run | CLOSE — joinery's pattern |

## The ASK — RULED 2026-10-10: (b), merge consecutive toggles

**214 — eye toggles and the 50-entry history.** Each hide/show is one undo entry (inv 43, by
design), so toggling visibility 50 times pushes every real edit out of undo. Options: (a) leave it;
(b) consecutive hide/show toggles share ONE undo entry (undo restores the visibility before the
run); (c) hides stop being undoable. **The user chose (b).** A run is broken by any other undoable
entry (an edit, a gesture), and by undo/redo themselves; inv 43's other rules (one gate,
`applyHidden`, the same `doc`, no autosave, refused while gesturing) are unchanged. Invariant 43 in
CLAUDE.md gets the condensed rule.

## Execution

Subagent batches (the user's choice): four batches, in order A → B → C → D, each on its own branch, merged `--no-ff` when green (tests,
build, mutation evidence), so the work can stop cleanly between batches. One deploy at the end
(or per batch, if asked). Each batch closes its follow-ups item by item in `docs/follow-ups.md`.
