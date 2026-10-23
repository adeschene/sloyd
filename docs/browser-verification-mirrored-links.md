# Browser verification — mirrored links (fu 432)

Spec: `docs/superpowers/specs/2026-10-23-sloyd-mirrored-links-design.md`. Master `a2ad5f6` (merge) / `cc6e8f4`.

Dev server `:5199`, the user's profile, Playwright MCP (DOM-dispatched clicks: Playwright's own clicks time out under
software GL); key presence only; no `localStorage.clear()`; test projects left. Readouts through `worldParts` →
`worldHoles` / `worldBands`, stored records through `migrateDocument`.

1. **By hand: Link + Mirrored (Review Focus 1). PASS.** New project "Live — mirrored case sides": two upright 30 × 12 × 3/4
   sides at turn 90, each a 4-pin row on world +x and veneer on −z. Parts list: Left, Shift+Right → Link; the note reads
   `Linked with 1 other part: every edit but name, position, turn and Mirrored changes all 2.` Right side → tick Mirrored:
   its pins on world −x (inside), edging still −z, turn 90 → 270, position [20, 0, 0] and extents unchanged; the ⇋ badge on
   its row.
2. **A shared edit through the mirrored side, three times (Review Focus 2). PASS.** `updateHoleRow` on the right side to
   stations 8, 10, 8.5: the Shape holds `from: 'max', station: 8.5` (the left side's hand, exact); left pins +x y 8.5, right
   −x y 8.5.
3. **Refine "make the sides 2 inches taller" (paid, ≈ $0.04). PASS.** Change list: the two resizes only. Result
   (`id_mvllmcqe_8`, version 21): one Shape, Left unflagged turn 90, Right `mirrored: true` turn 270; both 32"; pins +x/−x at
   y 8.5; edging −z on both.
4. **Unlink, undo (Review Focus 4). PASS.** Two plain parts, no `mirrored` key, no shapes, every world feature and pose
   unchanged; undo restores the identical document object.
5. **Generate "a plywood bookcase with adjustable shelves and oak edging" (paid, ≈ $0.06). PASS.** `Plywood Bookcase with
   Adjustable Shelves` (`id_mvllo6e2_w`): Left and Right side one Shape, Right `mirrored`; pins on the inside faces (+x / −x),
   oak edging on the front (+z) of both — fu 432's case, now linked.

Paid calls: 2 of 10.
