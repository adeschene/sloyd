# Browser verification — mirrored instances (schema 13)

Date: 2026-10-11. Dev server (Vite, port 5199), Playwright, software GL (fu 26a: geometry, not shading). Spec:
`docs/superpowers/specs/2026-10-11-sloyd-mirrored-instances-design.md` §7. Read from the DOM and the stored project;
screenshots timed out under llvmpipe and were not retried (the findings are textual).

## Fixture

Imported a hand-written v13 file: one assembly "Cabinet" (definition `dc`) holding an upright Side 30 × 12 × 3/4in
with a one-handed stopped dado (thickness max face, across width, 10in from the length min end, stopped 4in short of
the max end) and a flat Top 12-3/4 × 12 × 3/4in. Cabinet box x ∈ [0, 12.75].

## 1. Copy mirrored

Selected "Cabinet" in the parts list; Properties showed the "Mirrored" checkbox and "Copy mirrored". Clicking Copy
mirrored added "Cabinet (1)" (selected), shared (×2 badge on both rows) with the ⇋ badge on the copy only. Stored:
`{ id, name: "Cabinet (1)", definition: "dc", position: [25.5, 0, 0], rotation: 0, mirrored: true }`, the original
unchanged (no `mirrored` key). The copy's box is x ∈ [12.75, 25.5]: it abuts the original on its +X side.

## 2. The cut list

- Cabinet › Side: "… 10" from the length min end, running across the width, stopped 4" short of the **max** end".
- Cabinet (1) › Side: "… 10" from the length min end, running across the width, stopped 4" short of the **min** end".
- The two Sides are separate rows (a left and a right); the symmetric Top is one row, "2 × … Cabinet › Top, Cabinet (1) › Top".

## 3. An edit on the mirrored half

Opened Cabinet (1), selected its Side: Properties showed the world (mirrored) values — X 13-1/2", stops 4" near /
0" far. Typed 14 into "From the end". Stored definition cut: `offset 14, stopMin 0, stopMax 4` (written back
un-mirrored). Cut list afterwards: both Sides read "14" from the length min end", stops still mirrored (max end / min
end). The left half followed the right as its mirror image.

## Console and cleanup

0 errors; warnings only the known Three.js deprecations (THREE.Clock, PCFSoftShadowMap). The imported project was
deleted through the project menu; the dev profile is back to its 16 projects with the stored key intact.
