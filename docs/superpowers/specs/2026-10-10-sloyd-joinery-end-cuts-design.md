# Joinery and cuts at a part's end — design (follow-ups 205, 206)

Date: 2026-10-10. Status: approved in conversation (the rule and the testing sections); this file
is its written form.

## 1. The problem

When joinery grows a part (a tenon, a dado's housing depth) or trims it (a rabbet line, a panel's own
trim), it resizes the part at one end, and `rebaseCuts` (`src/generate/joints/recipes.ts`) moves the
part's existing cuts to follow. A cut **stored** as going into that end (`face` = the resized
dimension, `from` = the moving end) has no defined answer there, so `rebaseCuts` throws; `cutIntoEnd`
asks the same question first so joinery skips the site with a reason instead (fu 203).

Follow-up 205 found that the answer depends on how the cut is **stored**. Measured 2026-10-10 on its
probe (a 20in shelf between two sides, a 1/2 × 1/2in corner notch at its far end, full thickness,
default dados):

| Stored as | `storedAsShape` returns | Result |
|---|---|---|
| `face: 'length', from: 'max'` | unchanged | far dado **skipped**; shelf 20.25in; one dado |
| `face: 'width', from: 'min'`, positioned along length | unchanged | **joins**; shelf 20.5in; two dados; no problems |

The follow-up named `cutIntoEnd` as the cause. It is not only that: `storedAsShape` returns BOTH forms
unchanged (a corner notch reaches the end and a side edge, so neither form is canonical; it re-stores
only the run/position swap, never the face), so `rebaseCuts` itself is storage-dependent here —
follow-up 199's shape reading never covered a cut that can enter from two faces.

The user chose: both forms should JOIN (a notch sitting at the end stays put; the part grows past it).

## 2. The rule

In `rebaseCuts`, before its filter, each cut with `face === d` that REACHES the moving end — stored from that
end, or (amended 2026-10-10, follow-up 245) stored from the other end with a depth spanning all of `d` — is
**re-faced** when it can be (a partial-depth cut at the far end does not reach the moving end and is left
as stored):

1. Read its box `r = cutRegion(before, c)` on the board as it was before the resize.
2. Find another dimension `f ≠ d` whose span in `r` reaches one of the board's faces on `f`
   (`r[f][0] <= ε` → `from: 'min'`, or `r[f][1] >= before[f] − ε` → `from: 'max'`). Prefer the face
   whose span is the SHALLOWER (the natural entry), then `thickness` before `width` before `length` for
   a tie, so the choice is deterministic.
3. Build the candidate: `face: f`, that `from`, `depth` = the span on `f`; the third dimension `g`
   (neither `d` nor `f`) is `across`, with `stopMin`/`stopMax` from `r[g]`; `d` is the POSITION axis,
   with `offset`/`width` from `r[d]`.
4. **Guard:** the candidate is accepted only if `cutRegion(before, candidate)` equals `r` within
   `1e-9` on every axis (the same tolerance `rebaseCuts` already uses for widths). Otherwise the cut
   keeps its stored form (and still refuses).
5. An accepted candidate replaces the cut (same `id`) and then flows through `rebaseCuts`' existing
   rule: positioned along `d` at the moving end, it **stays where it is** in the world — the part grows
   past it, or a trim clips it (a cut the trim removes entirely is dropped, as today).

A cut with no other face to enter from (a mortise bored into the end grain, interior on both other
axes) is not re-faced and still throws / refuses with today's reason.

**One function, two callers.** The re-facing lives in one helper (`refaceFromEnd(board, cut, d, end)`
→ `Cut | null`) used by `rebaseCuts` AND by `cutIntoEnd`: `cutIntoEnd` reports a cut into the end only
when it is stored into the end AND the helper returns null. The check and the throw cannot disagree.

**What is NOT changed.** No load-time step; no document's stored cuts change except where joinery
itself resizes the part and had to move the cut. `storedAsShape`, `pocketFor`, `cutShape` and the
cut-list/diagram formatting are untouched (they read whatever form is stored, by shape). No schema
change. Invariants 40 (same-cut by `CUT_GEOMETRY_FIELDS`), 41 (refusals before any mutation; every
`resize` pre-checked by `cutIntoEnd`) and 44 (turns through `endFacing`; `rebaseCuts` works in part
dimensions) hold as stated.

## 3. Tests

- **The probe, both forms**: same applied joints (`dado`, `dado`), shelf length 20.5in, the notch's
  world box unchanged, `checkDesign` clean. Expected values derived by hand (shelf 20 + 2 × 0.25 dado
  depth; notch world box from the part's original position), not read from the code.
- **Existing skip tests flip** (`recipes.test.ts`, "a part already cut into the end a tenon or dado
  would grow is skipped"; the rigid-turn "shelf already cut" fixture): they now join; rewrite their
  expectations by hand, keeping each one's "nothing else moved" assertions.
- **Still refused**: an end-grain mortise (interior on both other axes) at the end a tenon would grow —
  skipped with today's reason, NOTHING changed.
- **A trim through a notch** (a panel's rabbet line or receiver trim) clips the notch and keeps the
  rest of its box in place.
- **Turned parts** (inv 44): the probe's shelf at 90° and 180°, built with `chiralPart`-style asymmetry
  (the notch on one side only), same outcome as unturned carried by the turn.
- **The guard**: a cut whose re-faced form cannot reproduce the box exactly keeps its stored form and
  refuses (construct one, or show by mutation that removing the guard turns a test red).
- **Mutation-test every new test** (drop the helper from `cutIntoEnd`; drop it from `rebaseCuts`;
  invert the face preference; remove the guard).

## 4. Follow-up 206

The half-lap partners-coplanar check spans every axis; narrowing it per axis is not a one-line change
because the drop's collision sweep also excludes partners on every axis. No real design reaches it and
the refusal is safe. The user chose: **pin the refusal with a test** (its reason text,
`<E>'s half-lap partners do not lie in one plane`, NOTHING changed) and close 206 with that reason. If
no path through `findSites` can build the case, the test drives `applyJoints` with hand-built sites,
and says so.
