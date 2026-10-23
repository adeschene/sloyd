# Browser verification — shop words (Refine's change list; the prompt names +z the front)

Spec: `docs/superpowers/specs/2026-10-23-sloyd-shop-words-design.md`. Branch `shop-words` at `4225bfd`.

**Dev server:** `npx vite --port 5199`, the user's profile, driven through the Playwright MCP (the user able to watch).
`sloyd.llm.v1` was checked for presence only (model `claude-opus-5-5`); the key was never read into the chat. No
`localStorage.clear()`; test projects left in place (the 2026-10-17 ruling). Results are DOM readouts of the done view and
`localStorage` read through `migrateDocument` → `flatDocument` → `boardExtents` / `worldHoles`. No screenshots kept.
Paid runs: 3 (≈ $0.08 + $0.04 + $0.04), within the 10 pre-approved per feature.

## 1. Generate "a bookcase with adjustable shelves" (1 generation, Moderate). PASS

"Ready, ≈ $0.08"; opened as **Bookcase with Adjustable Shelves** (`id_mvkk6po8_k`). World boxes:

- Back panel: z −6 .. −5.5 — **the smallest z**; the open face is at +z, Sloyd's Front.
- Front kick at z 5 .. 5.75, back kick at z −5.5 .. −4.75; shelves z −5.5 .. 5.5.
- Left side x −18 .. −17.25 with rows on `+x` (z 2, z 10); Right side x 17.25 .. 18 with rows on `-x` (z 2, z 10) — inside faces.

The pre-change bookcase (`id_mvkg0l4t_g`, this morning) had its back panel at +z.

## 2. Refine that bookcase: "move the shelf pins 1 inch closer to the front". PASS

"Done, ≈ $0.04", saved as "Bookcase with Adjustable Shelves — refined", "0 new issues · 0 already present". The done view, verbatim:

```
Left side: hole row on the inside face moved 1" toward the front
Left side: hole row on the inside face moved 1" toward the front
Left side is no longer linked
Right side: hole row on the inside face moved 1" toward the front
Right side: hole row on the inside face moved 1" toward the front
Right side is no longer linked
```

The user's words ("on the inside face") end to end; one line per moved row where the AI-holes run printed an "added" and a
"removed" line each.

## 3. Refine the OLD bookcase (`id_mvkg0l4t_g`, back panel at +z), same instruction. Behaviour PASS; words → fu 431

"Done, ≈ $0.04". The done view reads `hole row on the inside face moved 1" toward the back` (×2 per side) and the two "no longer
linked" lines. Claude moved the rows toward the project's OPEN face (−z, away from its back panel) — the same move as the
AI-holes live check before the prompt change, so the new sentence did not turn Refine around on an old project. The words are
world-true for Sloyd's convention and wrong for this back-to-front project: recorded as fu 431 (the user's call).
