# Browser verification: the project library

Task 7 of the project-library plan. This round gives Sloyd **more than one project in the
browser**: an index at `sloyd.library.v1` plus one `sloyd.project.<id>` per project, and a
dropdown off the toolbar's project-name field that switches, creates, duplicates, deletes
and imports. The document schema is untouched — `CURRENT_VERSION` stays **6**, a `.sloyd`
file written by this build is byte-identical to one written before the library existed, and
**rolling back past this round costs nothing at the document level**.

The whole surface is DOM, not r3f. That means most of it *is* unit-testable and is unit- and
RTL-tested (907 tests, 35 files). What is **only** checkable here is the part that acts on a
real `localStorage` at real boot time: **adoption of the legacy `sloyd.autosave.v1` slot**,
and the **refusal gate** that must fire instead of adoption when an index is present but
unusable. A test can approximate those with a storage double. It cannot prove that a real
browser, on a real first load, leaves the user's only copy of their work exactly where it
found it.

**Every check below passed. No defect was found in this round's code**, and nothing in the
browser contradicted the test suite. Two cosmetic observations and a set of named gaps are
recorded at the end; both observations became follow-ups (151, 152) rather than changes.

## How this was driven

Playwright MCP against `npm run dev -- --port 5199`, Chromium, software GL (llvmpipe —
follow-up 26a, which does not bear on this round: nothing here is drawn by a shader).
**Against the dev server only. Production was never opened.**

Three method rules, each of which had to be got right or a case would have passed for the
wrong reason:

- **`localStorage` was cleared BY PREFIX between cases**, iterating
  `Object.keys(localStorage).filter(k => k.startsWith('sloyd.'))`, not by removing the two
  keys by name. The first page load writes `sloyd.library.v1` *and* a
  `sloyd.project.<random-id>`; leaving that project key behind would make cases 2 and 3 take
  the "index parses, projects non-empty" branch instead of adopting, load the leftover
  project, and show exactly the one-`Untitled`-project result those cases expect. **The full
  `sloyd.*` key list was dumped immediately before and immediately after every load**, and
  the assertions are made on that list — a *new* project id is what distinguishes adoption
  from a stale-index read.
- **Seeds are pretty-printed** (`JSON.stringify(doc, null, 2)`) and compared back with `===`
  against the identical string. A compact seed that the app rewrote with equivalent content
  would compare equal and prove nothing; any rewrite at all collapses the whitespace and is
  visible. This is the browser-side twin of the round's own R8 finding, where a reviewer
  showed the byte-identity unit test could not detect an equivalent-JSON rewrite.
- **Every result is read out of `localStorage`, not judged from the screen.** Where the
  screen is the claim (the banner text, the caret's absence), the DOM was *queried* rather
  than eyeballed in a screenshot.

Interaction was real Playwright input — `locator.click()`, `keyboard.press`, `locator.fill`,
and the native file chooser via `fileChooser.setFiles` for the two imports. `page.evaluate`
was used to read state, to seed `localStorage` before a load, and in three places to fire a
`.click()` on a toolbar button when repeated real clicks were being swallowed by the
MCP wrapper's post-click stability wait (the r3f render loop never idles, so
`locator.click()` frequently reports a timeout *after* the click has already landed —
every such case was confirmed by reading the resulting state).

---

## Part 1 — adoption, five cases, each from a cleared store

### Case 1 — a valid v6 autosave is adopted — **PASS**

Seeded `sloyd.autosave.v1` with a v6 document named `Bench Seed` holding two boards (`Leg`,
`Rail`), one flat and one on-edge at a non-zero position.

| | |
|---|---|
| keys after load | `sloyd.project.b_mstmy2th_1`, `sloyd.library.v1`, `sloyd.autosave.v1` |
| index | `{ layout: 1, activeId: b_mstmy2th_1, projects: [ { name: 'Bench Seed', … } ] }` |
| project key | `version: 6`, boards `Leg` + `Rail` |
| on screen | name field `Bench Seed`; Parts list `Leg`, `Rail` |
| caret button | present |
| `sloyd.autosave.v1` | **byte-identical to the pretty-printed seed** |

One incidental observation worth keeping: the entry's `savedAt` lands ~600 ms after its
`createdAt`. That is the post-restore autosave debounce firing once and re-writing the
**project** key. It does not touch the autosave key — which is the whole point, and is why
the byte comparison is the assertion rather than the key's mere presence.

### Case 2 — no legacy key produces one `Untitled` — **PASS**

Cleared everything, loaded.

- Keys after: `sloyd.library.v1`, `sloyd.project.b_mstmyqh3_1`. **`sloyd.autosave.v1` was
  not created** — nothing in the new code writes to that slot, including on the path where
  it does not exist.
- Index holds one entry, `Untitled`, and `activeId` names it. The project key holds a clean
  v6 document with `boards: []`.
- Caret present, no banner, 0 console errors.

### Case 3 — a corrupt legacy key is treated as missing, and preserved — **PASS**

Seeded `sloyd.autosave.v1` with the literal string `{not json`.

- One `Untitled` project, exactly as case 2. No error, no banner, 0 console errors.
- **`sloyd.autosave.v1` still reads back as `{not json`, character for character.** Corrupt
  is treated as missing for the purpose of *what to adopt*, and is still not treated as
  disposable — which is the honest reading, since a key this build cannot parse may still be
  something a human can recover by hand.

### Case 4 — a v1-era document migrates before it is adopted — **PASS, at the payload level**

The case that proves adoption runs the migration chain rather than trusting the raw shape.
Seeded a `version: 1` document — no `stock`, no `guides`, and boards with a **numeric
`rotation`**, a `standing` boolean, and no `posture`, `grain` or `cuts`:

| seeded board | migrated board (read out of `sloyd.project.<id>`) |
|---|---|
| `rotation: 270`, `standing: true` | `rotation: 90`, `posture: 'on-edge'` |
| `rotation: 180`, `standing: false` | `rotation: 0`, `posture: 'flat'` |

Both gained `grain: 'length'` and `cuts: []`; the document gained `stock.kerf = 0.125` and
`guides: []`, and came out at `version: 6`. The name `Legacy v1` reached both the index entry
and the on-screen name field.

**Asserted on the payload, not on a screenshot, deliberately.** Invariant 11's failure mode
is a quarter-turn the wrong way — `validateBoard`'s rotation fallback is `0` and its posture
fallback is `'flat'`, both perfectly legal values. A board that came out of adoption lying
down when it should be on edge looks like a board in every render. The only thing that can
tell them apart is the number.

`sloyd.autosave.v1` was byte-identical to the pretty-printed v1 seed afterward.

### Case 5 — a present-but-unusable index refuses, and writes nothing — **PASS**

The round's refusal gate, and the case a unit test can only approximate. Seeded, in one
store: `sloyd.library.v1` = the exact 41-byte string
`{"layout":2,"activeId":"x","projects":[]}` (a layout this build does not recognise — the
"a newer build wrote this" case), a real `sloyd.project.future1` document, and a legacy
`sloyd.autosave.v1`.

After load:

- **The `sloyd.*` key list is unchanged** — three keys, no new project key.
- **The index bytes are unchanged**, compared `===` against the exact seed string.
- `sloyd.project.future1` is untouched.
- **`.project-menu-caret` is absent from the DOM** — queried by class *and* by
  `[aria-label="Open project menu"]`, not judged from a screenshot. The menu is not rendered
  at all, which is the correct answer: a library it cannot read is a library it must not
  offer to edit.
- **The storage banner renders**, with its real text: *"Sloyd can't save to this browser —
  your work exists only in this tab. Use Export before closing it."* This was the check most
  likely to find something, because `available` is a getter on a module singleton and React
  does not re-render on it; the wiring is real and it works.
- The **legacy document is what opens** (`Legacy Slot` in the name field). The session
  degrades to *today's app*, not to an empty one.

**One check beyond the brief, and the one that makes the refusal worth trusting:** an edit
was made in that degraded session — `+ Add board`, then a wait well past the 600 ms autosave
debounce. **Still nothing was written anywhere.** The index bytes were unchanged, the legacy
key still held its original one board and its original name, and no new key appeared. The
refusal holds under an edit, not merely at boot — which is R13's ruling (refuse at the
storage seam, not by convention in `App.tsx`) observed working from outside the seam.

---

## Part 2 — the menu, driven

Fixture built from a clean adopt: renamed to **Alpha** (1 board), then `+ New project` →
**Beta** (2 boards), then `+ New project` → **Gamma** (3 boards). Three entries in the index,
three `sloyd.project.*` keys.

**Switching.** Gamma → Alpha → Beta. The name field and the Parts list follow the project
(1 board, then 2), the index's `activeId` follows, and the popup closes on the row click.
**Undo is disabled after a switch** — a switch is a `replaceDocument`, exactly as spec §3.1
requires, and there is no cross-project undo to get wrong. Boards stayed with their own
projects throughout; nothing leaked between slots.

**Duplicate, and the round's real bug.** Duplicated Beta. `Beta copy` was added, the popup
**stayed open and refreshed in place**, the status dot stayed on Beta, and the index's
`activeId` did not move. **Then the page was reloaded**: `activeId` still named Beta's id and
Beta is what opened. That is the fix for R21 — `createProject`'s hidden activation side
effect, which used to move the stored `activeId` to the copy while the screen, React's
`activeId` and `aria-current` all stayed on the original, so the *next boot* opened the wrong
project. Confirmed at the byte the bug lived in, not by what looked selected. The copy is an
independent document holding the same two boards.

**Delete, all three shapes.**

| | result |
|---|---|
| non-active (`Alpha`), by keyboard | entry and `sloyd.project.<alpha>` both gone; `activeId` untouched; the open document untouched |
| active (`Beta`) | switched to the most recently saved remaining project (`Beta copy`); key removed; index consistent |
| down to the last (`Gamma`, then `Beta copy`) | a fresh `Untitled` created and made active — exactly one project key plus the index. No no-project state; the app stayed fully usable, and a reload restored it |

**Import, twice.** From the menu's `⬆ Import…`, through the real native file chooser. The
first import landed in an empty document, the second in one that **already had a board** —
and **no `window.confirm` appeared either time**, which is spec §3.2's retirement of the
app's only native dialog confirmed on the path where the old prompt would have fired. Each
import created a **new** library entry and switched to it. Two rows then both read
`Imported Cabinet`: the library enforces no project-name uniqueness, per spec §5 — invariant
8 governs **board** names inside a document, and projects are keyed by id.

`sloyd.autosave.v1` was never re-created at any point in this whole part.

## Part 3 — the keyboard, since this is deliberately not an ARIA menu

R19 dropped `role="menu"`/`menuitem` rather than backing them with roving-tabindex
navigation. That makes plain **Tab order** the interaction, and makes it this pass's job to
show the order is usable rather than merely present.

- **Tab order out of the caret is DOM order**: caret → row-open → Duplicate → Delete, row by
  row, then `+ New project`, then `⬆ Import…`. Twelve focusables for three rows.
- **The row controls are reachable.** They are `opacity: 0` at rest and revealed by
  `.project-row-action:focus-visible`; they keep their layout box, so nothing shifts when
  they appear. Both were reached and operated by keyboard alone.
- **The arm/disarm focus claim is true, and this is the only thing that tests it.**
  `ProjectMenu` carries a comment asserting that focus survives the `×` → `Delete?` swap
  because both branches render a `<button>` at the same sibling index, so React reuses the
  DOM node instead of unmounting one and mounting another. Armed by pressing Enter on
  `Delete Gamma`; `document.activeElement` was **still that button**, now labelled
  `Delete Gamma?`. Nothing was deleted by the arming press.
- **The armed row is not clipped**, measured rather than eyeballed: popup right edge 623.1
  px, armed button right edge 618.1 px, the popup's 4 px padding intact. The row reflows
  (the timestamp shifts left, because `Delete?` is much wider than `×`) and stays legible.
- **A full two-step delete was completed by keyboard** — focus, Enter to arm, Enter to
  confirm — for the non-active `Alpha` above.
- **Escape closes the popup and deletes nothing**, including from an armed state.
- **Tabbing fully out closes it, in both directions.** Forward past `⬆ Import…` lands on
  `+ Add board` with the popup closed; Shift+Tab backwards off the caret lands on the
  project-name input, also closed. Those are two different handlers doing it — the
  `onBlur`/focusout close is what catches both, since neither Tab produces a `pointerdown`
  the outside-click listener could see.

## Screenshots, and what they showed

Four were taken (menu with one project, with three, with a control focused, and with a
delete armed). `.playwright-mcp/` is gitignored and these are **not committed**, so every
visual claim here is written out in prose.

The menu reads cleanly at full-window scale: brass status dot on the active row, name left,
relative time right in `--font-num`, rows sorted most-recently-saved first (Gamma, Beta,
Alpha). No cramped rows, no clipped text, no odd timestamps. The popup hangs below the caret,
left-aligned to it, and is 320 px wide.

**The tape-readout collision was driven, not inferred.** `TapeReadout` renders nothing
without an anchor, so a session that never arms the Tape tool proves nothing about it. So:
Tape armed, a corner clicked to set a real anchor (the readout mounted, reading `0"` /
*Type a distance, Enter to place*), then the caret opened and both bounding rects read. Popup
`(303.1, 40.4) → (623.1, 202.4)`; readout `(1089.0, 1146.4) → (1280, 1205)`. **No overlap on
either axis** — 944 px of vertical clearance, and they do not share a horizontal band either.
Incidentally confirmed in the same step: opening the project menu does not disturb a live tape
anchor, which is correct — nothing in this round touches `tapeAnchor`, and invariant 24's
prohibition says nothing here may.

Two cosmetic observations, both recorded as follow-ups rather than changed:

- **`:focus-visible` reveals only the ONE focused control, not the whole row**, where hover
  reveals both. A keyboard user therefore never sees that a second control follows the first
  — the affordance is reachable but not advertised. Follow-up **151**.
- **After Escape, focus lands on `<body>`, not back on the caret.** The popup unmounts the
  focused button and nothing restores focus to its trigger. Follow-up **152**.

## What this could NOT confirm

Stated plainly rather than left to inference.

- **Nothing was checked against production.** Per the deployment rule, and harder than usual
  this round: the adoption path acts on the verifying browser's real `sloyd.autosave.v1`, so
  loading production *is* running it. Production gets a page load and a bundle-hash check.
- **A real quota-exhausted `localStorage` was never produced.** The refusal gate was reached
  by an unrecognised `layout`; the *other* route to `available === false` — `setItem`
  throwing on a full store — is covered only by the storage double. Follow-up **153**.
- **No second tab.** Two tabs of Sloyd sharing one `localStorage` is now a genuinely
  different situation from before this round (each tab holds its own `activeId` and its own
  autosave timer, and `storage` events are not listened for). Not driven, not designed for.
  Follow-up **154**.
- **No cross-browser pass.** Chromium only. `parseIndex`, `localStorage` and Tab order carry
  no engine-specific behaviour worth suspecting, but it was not checked.
- **One window size, one zoom level.** The legibility judgements above are at a single
  ~1600 × 1220 viewport. Nothing was checked at a narrow window, where a 320 px popup
  anchored to a toolbar control is the most likely thing to be wrong.
- **No touch or pen input** — follow-up 106's remaining half, still open. The hover-reveal of
  the row controls is exactly the affordance a touch device has no state for; the keyboard
  path exists partly for that reason, and a touch device has neither.
- **The `activeId`-names-a-missing-project fallback and the `projects: []` branch were not
  seeded.** Both are covered in `storage/browser.test.ts` against the real adapter. Only
  the two branches whose stakes are *the user's existing work* — adopt, and refuse — were
  driven live.
- **Import's cancel path was not exercised**, only two successful imports.
- **No print surface is involved**, so follow-ups 70/79/84 are untouched either way.

## Console

**0 errors across the entire session**, every case and every interaction. All warnings are
pre-existing and none is raised by this round's code: `THREE.Clock: This module has been
deprecated`, `THREE.WebGLShadowMap: PCFSoftShadowMap has been deprecated` (the bulk of the
log — it repeats per render), and llvmpipe `GPU stall due to ReadPixels` performance notices
from the software GL stack (follow-up 26a's environment). Nothing new appeared at any point.

---

## Addendum, 2026-08-15: confirmed live in production by the user

Everything above was recorded against the **dev server**, before the round was merged or
deployed. That is the standing rule and the write-up was correct to say production had
never been opened.

It has now. The round was merged (`6210fb9`), deployed to `sloyd.oddbox.tech` (bundle
`index-K_vbIrhN.js` → `index-DOJGjiK1.js`, same hash at the edge and in-network, `200` on
`/` and on a deep route both ways), and **the user exercised the feature against production
and reported it working**.

Two things that record is and is not:

- **It is the first confirmation that adoption ran correctly against a real, long-lived
  `sloyd.autosave.v1`** — a document written by an actual build over actual use, not a
  hand-seeded fixture. That is the one input the dev-server pass could only approximate,
  and it is the input the whole round was designed around.
- **It is not a systematic pass.** No case list was walked, nothing was read back out of
  `localStorage`, and the negative findings above stay open exactly as written —
  follow-ups **151**, **152**, **153**, **154**, and the unchecked narrow viewport.

**A note on the deployment rule, which this round bent for a good reason.** The rule says
production is verified by loading the page only, because exercising a feature there writes
a document over the user's own and there is nothing to restore from. This round was
exercised in production anyway — deliberately, by the user, because the alternative
(reaching a dev server on a VPS over SSH) did not work. The cost is understood and small:
adoption preserves `sloyd.autosave.v1` untouched, so the pre-round project is still exactly
where it was.

**The rule itself should be read more carefully after this round, not less.** Every earlier
feature was inert until exercised, so a page load genuinely proved nothing was disturbed.
Adoption is not inert — the page load *is* the exercise. A future round that acts at load
time needs its own argument rather than inheriting this one.
