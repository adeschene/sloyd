# Sloyd — shop words in Refine's change list (2026-10-23)

Size: a small change (described and approved in chat, 2026-10-23). Owed item from the AI-holes round: "world-face
words (`+x`) in the change list" — the user's ruling: reword to shop words, e.g. "45 holes added on the inside face".

## Why

Refine's done view lists what changed ("Left side: 45 holes added on +x, 1/4" Ø"). `+x` is the design schema's word,
not the bench's. The same list prints tapers, miters, bevels and chamfers in the same world words.

A finding during the review: Sloyd's Front view looks at the piece's +z side (`drawing.ts` `FRONT`, `TOP`'s comment),
but `SYSTEM_PROMPT` never says so, and the generated bookcase put its back panel at +z — so its Plans "Front" view
showed the back. "Toward the front" in a change line is only honest once Claude and Sloyd agree.

## What (the user's approval covers all of it)

1. **Faces by where they look, relative to the piece** (`document/shopWords.ts`, pure, imports no `units`):
   - a face looking up (+y) is the **top** face, down (−y) the **bottom** face;
   - an x or z face is **inside** when it looks toward the middle of its frame, **outside** when it looks away;
   - a part centred in its frame on that axis (within 1e-6: a middle divider, a lone part) falls back to the absolute
     word: −x **left**, +x **right**, +z **front**, −z **back** (Sloyd's Front view; right as seen from the front).
2. **Ends and directions are absolute**: a miter's end, a taper's thin end, a row's running direction and a move read
   top / bottom / left / right / front / back.
3. **The frame**: a top-level part's frame is the whole piece (the world box of every flat part). A part inside a
   placement takes that PLACEMENT's own parts as its frame *(Claude's call: a drawer front's knob hole reads "outside
   face" in every drawer, so one definition change across placements still collapses to one "(×N)" line)*. Each side of
   the diff words its own rows with its own document's frame.
4. **Matching never reads words.** Rows, tapers and angle cuts are still matched on raw directions; only the printed
   text changes *(Claude's call: `+x` and `+z` faces can both read "inside", so a word key would merge two cuts)*.
5. **A moved hole row is one line.** After exact matching, an added row and a removed row on the same face with the same
   displayed diameter, depth (or through), count and — for a row of more than one — pitch and running direction are a
   move, paired nearest-first by first centre: `hole row on the inside face moved 1" toward the back`. Each axis whose
   displayed delta is not zero is named; a move below display precision prints nothing (the resize rule).
6. **Several faces in one taper line** are counted: `inside face`, `2 inside faces`, `inside and outside faces`,
   `2 inside and 1 outside faces`.
7. **The prompt names the front.** `SYSTEM_PROMPT`'s coordinates line says +x is the piece's right and +z its front (the
   side you stand at to use it). One paid Generate run checks a case comes back with its back panel at the smallest z.

Wordings, before → after (bookcase sides, single-part rail, lone leg):

| before | after |
|---|---|
| `45 holes added on +x, 1/4" Ø` | `45 holes added on the inside face, 1/4" Ø` |
| `hole row on +x removed` | `hole row on the inside face removed` |
| `hole row on +y now running toward +z` | `hole row on the top face now running toward the front` |
| add + remove pair | `hole row on the inside face moved 1" toward the back` |
| `taper added (+x, +z; 22" from the -y end, 3/8" off)` (lone leg) | `taper added (right and front faces; 22" from the bottom end, 3/8" off)` |
| `miter added (+x end; 45.0°, long point -z)` | `miter added (right end; 45.0°, long point on the back face)` |
| `chamfer added (+y/+z edge; …)` | `chamfer added (top/front edge; …)` |

## Not in scope

Model-facing text (repair messages, `message` fields) keeps world words — the model speaks the schema. The bench line
and the Plans key already use part-local words. No schema change, no bump.
