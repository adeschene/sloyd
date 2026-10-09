# Browser verification — refine designs with joints (2026-10-09)

Dev server (`npm run dev -- --port 5199`) on branch `refine-joined` at `8a32030`, Playwright MCP
(headed, the user watching), software GL. The user approved the paid runs. The profile's stored key
was used as stored.

## 1. A real joined design

Generated "A small bookcase, 30in wide and 36in tall, with two shelves and a plywood back" (Simple,
`≈ $0.04`): 8 loose parts. **Add joinery** with the model (`≈ $0.03`): 13 joints — 10 stopped dados,
3 rabbets; the back moved, Bottom/Shelf 1/Shelf 2/back trimmed; overall depth 11-3/4 → 11-1/4.
19 cuts stored.

## 2. The gate accepts it

Refine opened on the joined project with no refusal, the instruction box present, Detail Simple, the
estimate `≈ $0.01` plus `plus a joinery call if new meetings appear`.

## 3. Refine "Make it 2in taller" — one call, every joint kept

`Done`, `≈ $0.02` (one refine call; **no joinery call**). `0 new issues · 0 already present`.
**`13 joints kept · 0 chosen · 0 dropped`.** Changes: back and both sides 2in longer, Top moved Y +2".

Stored, against the joined original (unchanged, still active):
- Toe kick, Bottom, Shelf 1, Shelf 2: cuts, positions and sizes byte-identical.
- Top: cuts identical, position +2in.
- Left side (6 cuts before and after): the four dados at 3, 13.75, 24.5 identical; the back rabbet's
  stop grew 33 → 35 and the top dado moved 35.25 → 37.25 — exactly the 2in.

## 4. Refine "Add a third shelf, evenly spacing the three shelves" — only the new meetings asked

`Done`, `≈ $0.03` (refine + one joinery call). **`13 joints kept · 2 chosen · 0 dropped`.**
Changes: Shelf 1 and Shelf 2 moved down, `Added Shelf 3 (29" × 10-3/4" × 3/4")`.
Stored: Shelf 3 has its 2 joints and came out linked with the other shelves (identical joints); the
left side gained one dado (6 → 7 cuts); Toe kick, Bottom, Shelf 1, Shelf 2, Top and the back have
byte-identical cuts (the moved shelves kept their joints).

## Console / cleanup

0 errors. The four projects this check created were deleted through the project menu; the profile's
16 older projects and its key are untouched.

## Not confirmed live

Re-opening a colliding kept joint, the metric/off-grid tolerance, and a refused joined design (unit
and run tests only).
