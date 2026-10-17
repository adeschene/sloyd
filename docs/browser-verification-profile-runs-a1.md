# Browser verification — profile runs, chunk a1 (schema 18: the profiles list)

Date: 2026-10-17. Two dev servers side by side, the Playwright MCP browser:
- **before:** `master` (`fc2da8e`, schema 17) from a temporary worktree on port 5181;
- **after:** branch `profile-runs-a1` (`3d37e3f`) on port 5180.

The same v17 fixture, `.playwright-mcp/edge-profiles-check.sloyd.json` (gitignored), was imported into each through
Project ▾ → Import…. It holds:
- **Top** 36 × 20 × 3/4 with four 1/4" roundovers;
- **Shelf** 30 × 10 × 3/4 with an ogee, a bead and a thumbnail;
- **Old rail** 24 × 3 × 3/4 with a pre-chunk through-length rounded corner.

The test projects were left in place (the user's dev-profile ruling).

The comparison is a DOM readout hashed in the page (SHA-256, first 8 bytes), not screenshots: the claim is "byte for byte".

| Readout | master (v17 code) | branch (v18 code) |
|---|---|---|
| Profiles section text, Top / Shelf / Old rail | `96c36493…` / `78a25697…` / `582e3043…` | identical |
| Cut list text (bench lines, the four-edge collapse, Buying) | `eadc334c…` (3460 chars) | identical |
| Cut list SVG (diagrams, hatch), React `useId` ids stripped | `678cd160…` … 20 blocks of 500 chars, 9996 chars | identical, block for block |
| Plans key list (`A Roundover 1/4" (4×)` … `E Roundover 3/8"`) | `83331401…` | identical |
| Plans sheet SVG (every `<svg>` on the page) | `63a4f8c2…` (23 065 chars) | identical |

- **The ids:** the cut list's raw SVG differed only in React `useId` pattern ids (`hatchr3` against `hatchr1b`), which follow render
  order, not the model. With them stripped, the two are equal, block for block, after a fresh load on each side.
- **Storage:** the branch autosaved both "Edge profiles check" projects as `version: 18`, with every profile in `profiles`
  (Top 4, Shelf 3, Old rail 1) and none left in `curves`. That includes the one saved by a v17 build in an earlier session.
- **An edit on the branch:**
  - Old rail → Fillet 1/16" changed the bench line to `…, top on the thickness face (max side), with a 1/16" fillet`.
  - Ctrl+Z restored `Roundover 3/8" on the edge between the width face (max side) and the thickness face (max side), along the length`.
- **Console:** 0 errors on both servers. The warnings are the known THREE deprecations and the software-GL stall.
- **Not captured:** a viewport screenshot, which timed out under software GL. The viewport reads the same bodies and mesh,
  pinned byte for byte by `profilesView.test.ts` (`bodyMesh`, `boardUVSignature`, `drawsAsBox`).
