# Browser verification — align and space evenly

Date: 2026-10-28. Dev server (`npm run dev -- --port 5199`, started fresh) on branch `align`. **Nobody watched this run:** there was no
X server, so it was driven headless from a node script with the Playwright MCP's own library (`/opt/google/chrome/chrome`, SwiftShader,
`DISPLAY` unset, a scratch profile). No paid call; production untouched. The project "Align check" is in the SCRATCH profile on
`:5199`, left in place.

## The carcase

Sides 30 × 12 × 3/4 upright at x 0 and 23-1/4; a bottom and a top 22-1/2 × 12 × 3/4 at y 0 and 29-1/4; three shelves 22-1/2 × 11 × 3/4
at uneven heights (y 7, 9, 21) and uneven depths (front edges at z 11-1/2, 11, 11-1/4).

## Space evenly along Y

Selected Bottom, Shelf 2, Shelf 1, Shelf 3, Top (deliberately out of order). The panel read `to Bottom (selected first)`. After
`Space evenly along Y`, the parts (y min–max) read `[0, 0.75]`, `[7.3125, 8.0625]`, `[14.625, 15.375]`, `[21.9375, 22.6875]`,
`[29.25, 30]`: every gap `6.5625`. By hand: (29.25 − 0.75 − 3 × 0.75) / 4 = 6.5625. Bottom and Top did not move.

## Align front (Z)

Selected Left side, then the three shelves. The panel read `to Left side (selected first)`. After `Align front (Z)` every front (max z)
read `12`: the shelves flush with the side's front.

## Undo

Two entries were pushed, one per click. Two undos restored every shelf's original y and z (7 / 0.5, 9 / 0, 21 / 0.25).

A screenshot of the panel was taken: the Align section under the action bar, with the anchor named on the right, the three axis rows
and the Space evenly row. Software GL: the screenshot shows layout only (fu 26a).
