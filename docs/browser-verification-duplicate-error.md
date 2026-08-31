# Browser verification: a failed duplicate reports itself

Follow-up 159. `duplicateProject` returns null when the source project's key is missing or
unreadable, and that path moves no verdict — `storage.available` stays true, correctly, since
the store is working and one project's data is gone. So the user pressed ⧉ and nothing
happened at all: no new row, no banner, no message. The remedy is a surface at the point of
action, and the surface chosen is an inline message on the failing row.

This pass exists because the unit tests cannot reach the thing that was actually broken. They
drive the component with a stubbed `onDuplicate` and the adapter with a fake store, so what
they pin is the wiring. What they cannot show is that the **real** adapter, against **real**
`localStorage`, takes the null branch for a row whose key is absent — nor that the message
lands under the right row, in the right colour, inside a popup that is only 20rem wide.

## How this was driven

Playwright MCP against `npm run dev -- --port 5199`, Chromium. `localStorage` seeded with a
library index naming **two** projects and only **one** `sloyd.project.<id>` key written — the
exact state the two-tab case (**154**) or a hand edit produces, and the only door 159's
failure comes through:

```
sloyd.library.v1     layout 1, activeId p1, projects [Bookcase (p1), Workbench (p2)]
sloyd.project.p1     Bookcase
                     (no sloyd.project.p2 — Workbench is listed but has no data)
```

## What was confirmed

**The real failure path, not a mocked one.** Duplicating *Workbench* produced
`Couldn't duplicate — this project's data is missing.` — the adapter's own null branch,
reached through the app's own handler, against real `localStorage`.

**On the failing row.** The message's `.project-row-group` contains the Workbench row and not
the Bookcase row. A per-row surface is the whole point: two rows must not be able to confuse
each other.

**The banner stayed away**, which is the design holding. Persistence is fine here, and a
banner saying otherwise would send the user looking for something that is not broken.
`.storage-banner` was absent throughout.

**Nothing was written.** `localStorage` keys after the failed duplicate were exactly the two
seeded. A failed duplicate leaves no orphan key.

**Layout, measured rather than eyeballed** — `.field-error` reused, not a second error idiom:

| | |
|---|---|
| colour | `rgb(232, 128, 106)` — the `--alert` token `.field-error` already uses |
| font size | 11px, matching every other inline error |
| position | below its row, indented under the project name |
| wrapping | 2 lines, entirely inside the popup; `overflowsPopupRight` false |

**Both clearing rules, live.** Closing and reopening the menu cleared the message (the single
effect keyed on `open`, rather than a reset beside each of the six close paths). And
duplicating the *healthy* row afterwards cleared it too, added a `Bookcase copy` row and wrote
its key — a success on any row does not leave another row's message standing.

**0 console errors** throughout.

## Not checked, and why

**The `write-failed` cause.** Reaching it live means making `localStorage` refuse a write
mid-session, which this seeding route cannot do without stubbing the store — at which point it
is the unit test that already covers it (`App.test.tsx`, storage flipped unavailable). What
this pass covers is the branch that a fake cannot make honest: a real key that is really
absent. The two causes are told apart by one flag, and that decision is mutation-tested.
