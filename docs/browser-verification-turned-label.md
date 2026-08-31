# Browser verification: "turned" on a rendered sheet

Follow-up 92's second half. `PlacedPart.turned` existed in the data and was asserted in
`nesting.test.ts`, but nothing on a rendered sheet said it in words, so a reader looking at
a near-square rectangle could not tell a 90° turn from a transposition of the printed
dimensions. The word now rides on `PlacedPart.dims`.

This pass exists because there are **no panel tests for `SheetLayout`** — the component's
only coverage is `buildNesting`'s unit tests plus this file — and because the change lands
on invariant 19's arithmetic, whose failure mode is invisible to unit tests by construction:
`labelWidth` is `characters × CHAR_W`, the tests assert that arithmetic, and a font whose
advance differs makes the number unrelated to what is drawn while everything stays green.

## How this was driven

Playwright MCP against `npm run dev -- --port 5199`, Chromium, software GL (invariant 26a —
irrelevant here, nothing in this round touches a WebGL shader, noted for completeness).

The same seeding route the sheet-nesting pass used: a v6 document written by hand to
`localStorage` under `sloyd.autosave.v1`, then the page loaded so the library's adoption
path picks it up. Three MDF boards, because `rotate: 'free'` is the only mode in which the
packer turns anything at all — under `rotate: 'grain'` (plywood) `footprintsOf` returns one
footprint and no part is ever turned:

| Part | length × width | Expected |
|---|---|---|
| Door | 23" × 24" | turned, near-square — the ambiguous case 92 names |
| Panel | 40" × 20" | not turned |
| Cleat | 5" × 6" | turned, small enough to fall to the index tier |

## What was confirmed

**All three label tiers, which is the point** — the word had to be checked at each, since
`fitLabel` decides between them by measurement and only two of the three print `dims`:

- **`full`** (Door): the rectangle reads `Door` / `23" × 24" turned`.
- **`full`** (Panel): `Panel` / `40" × 20"` — no word, so the mark is not merely decorative.
- **`index`** (Cleat): the rectangle reads `1`, and the key list below reads
  `1. Cleat — 5" × 6" turned`. The word survives the indirection because the key entry is
  built from `p.dims`.

**The ambiguity is visibly resolved.** In the screenshot taken during this pass, the Door's
rectangle is drawn 24" along the sheet by 23" across, while the cut-list row above it reads
`23" × 24"` — the two orders a reader cannot distinguish by eye at that aspect ratio. The
word is what tells them which one they are looking at.

**Nothing overflows.** `getComputedTextLength()` on every rendered label against its own
rectangle: the longest, `23" × 24" turned`, measures **192.6** in a **250**-wide rectangle,
inside the 6-unit padding `fitLabel` was given on each side. No label exceeded its box.

**Invariant 19 holds with the new word, measured rather than argued.** Per-glyph advance in
the rendered `--font-num` stack (`ui-monospace, SF Mono, JetBrains Mono, Roboto Mono, Menlo,
Consolas, monospace`) at the applied 20px:

| Glyph class | Advance |
|---|---|
| ASCII letters (the new `turned`) | 12.0341 |
| digits | 12.0348 |
| `"` | 12.0348 |
| `×` (U+00D7, non-ASCII, already present) | 12.0348 |
| the whole label `23" × 24" turned` | 12.0345 |

One advance for every class, including the multiplication sign — so `labelWidth`'s
character count is still a true model of the render. `CHAR_W` is **12.4** against a measured
12.03, an over-estimate of about 3%, which is the safe direction and what its own comment
says it is rounded up for: too wide costs a tier, too narrow overflows the box. This is the
check that would have caught the symbol option considered and rejected for this round — a
glyph outside the monospace stack would have shown up here as a different advance.

## Not checked, and why

**Print media.** The round adds no new CSS class and no new selector — the word joins an
existing `<text>` element that print rules already cover — so there was nothing new for the
`emulateMedia` check that follow-ups 58 and 81 exist to guard. Follow-ups 70/79/84 still
stand: an actual print-to-PDF render remains unverified on this host, whose Playwright
exposes no `pdf()`.

**The `name` tier.** A part whose rectangle fits its name but not its dimension line prints
neither the dimensions nor the word, so it is the one tier where a turned part still says
nothing. Not reached by this fixture and filed as **follow-up 161** rather than fixed —
the remedy is a design decision, not a defect.
