# Sloyd — document versioning, full table

> Split out of `CLAUDE.md` on 2026-10-20. `CLAUDE.md` keeps the rules and a one-line-per-step
> summary; this is the full table, including what each loader step validates and drops. Update it
> with every schema bump.


Every load path (open, import, autosave-restore) runs `migrateDocument` before the
document is trusted. `CURRENT_VERSION` is **19**. Steps run one version at a time, in
order, on RAW data before `validateBoard` (inv 11) — except v10→v11 and v11→v12, which run after.

| Step | Adds | Shape | Harm a build one version back would do |
|---|---|---|---|
| 1→2 `foldRotationToV2` | rotation fold | per-board, raw | — |
| 2→3 `addPostureToV3` | `posture` | per-board, raw | — |
| 3→4 `addCutsToV4` | `cuts` | per-board, raw | — |
| 4→5 | `stock.kerf` (default 0.125 if absent/non-numeric/outside [0,1) — defaulted, not clamped) | document-level | wrong number (sheet count) |
| 5→6 | `guides` (default `[]`; malformed guide dropped) | document-level | silent loss on round-trip |
| 6→7 | `Cut.stopMin`/`stopMax` (default 0) | document-level | wrong geometry |
| 7→8 `trueTurnsToV8` | true turns; mirrors cuts of 90° parts | per-board, raw | wrong geometry |
| 8→9 | `Board.link` | document-level | silent loss |
| 9→10 | `instances`, `definitions` (default `[]`) | document-level | every part in an assembly vanishes |
| 10→11 `linksToShapes` | `shapes` (default `[]`) | **after validation** | un-shares every component |
| 11→12 `onEdgeToV12` | on-edge cuts mirrored along thickness | **after validation** | wrong geometry (on-edge one-handed cuts mirrored) |
| 12→13 | `Instance.mirrored` (only `true` stored) | document-level, no step | wrong geometry (a mirrored copy drawn unmirrored) |
| 13→14 | `angleCuts` on parts and shapes (default `[]`; malformed or non-finite entry dropped, missing `kind` derived) | document-level, no step | silent loss on round trip (every taper/miter dropped) |
| 14→15 | `materials` (custom materials the parts and shapes use; default `[]`; validated BEFORE the parts so they see them; malformed entry or one whose `kind` disagrees with its id dropped; pruned on load and in `edit()`) | document-level, no step | silent loss (a custom material becomes pine, and the next save writes pine) |
| 15→16 | `holes` on parts and shapes (default `[]`; malformed entry dropped — non-finite, non-positive diameter or depth, non-integer count, negative pitch/station/inset, `along === face`, unknown enum; a faulted but well-formed row KEPT) | document-level, no step | silent loss on round trip (every hole dropped) |
| 16→17 | `curves` on parts and shapes (default `[]`; malformed entry dropped — non-finite number, unknown enum, no segments or more than 64, an arc with both/neither of `rise`/`radius`, a non-positive one, a zero chord, a rise over half its chord or a radius under half, an outline not closing EXACTLY at `start` (P1), crossing itself or enclosing no area; a faulted but well-formed curve KEPT); a string segment `type` other than `line`/`arc` REFUSES THE DOCUMENT (the newer-version gate keyed on content: a spline needs no bump) | document-level, no step | silent loss on round trip (every curve dropped) |
| 17→18 | `profiles` on parts and shapes (default `[]`; every curve `profileOf` recognises is MOVED in, keeping its id, on EVERY load; ids share the curve scope; malformed dropped — non-finite or non-positive size, a thumbnail depth outside (0, size), a negative fillet, a bead without a quirk, an unknown face or facing, a bad end; a symmetric kind normalised to facing `face`, an End to end run to min→max; a faulted but well-formed profile KEPT); an unknown `kind` string REFUSES THE DOCUMENT (spec P2: a later run needs no bump) — a station end loads since a2, a loop (exactly `{ loop: true }`) since b1, ends on two sides since b2 (kept as stored, never re-ordered; an inconsistent `through` end kept and faulted `stop-off`), so a2 refuses a b1 loop and b1 refuses a b2 two-side run | document-level, no step | silent loss (every profile dropped, then autosaved) |
| 18→19 | `bandTypes` (document; validated AFTER materials and BEFORE parts; the built-in `band-iron-on` re-added first if absent; malformed dropped — non-finite or negative number, `tapeWidth <= 0`, a SOLID type of thickness 0; an ABSENT tape `pricePerFoot` read as `null`; a solid type whose material is not a solid falls back to pine; ids by `takeId`, names deduped) and `bands` + `cornerRule` on parts and shapes (`bands` default `[]`; an unknown side, a non-string or dangling type, a second band on a side dropped; sorted to canonical order; `cornerRule` always stored, `'long' \| 'ends' \| 'mitre'`, absent or unknown read as `'long'`, P1); an unknown band type `kind` string REFUSES THE DOCUMENT (a later kind needs no bump); `pruneMaterials` keeps a band type's material | document-level, no step | silent loss (every band and band type dropped, then autosaved; a banded panel's FINISHED size printed as its cut size) |

- **A bump exists for the refusal gate, not for upgrading** — absent fields default
  regardless. Argue *your* field's harm; don't inherit another bump's argument.
- **v8's and v12's steps are NOT idempotent** (they mirror): the `d.version < 8` and
  `d.version < 12` guards are all that stop a file being re-mirrored on every load.
- **v10→v11 runs after validation**, guarded by `d.version < 11`, before `repairTree`,
  because it needs validated values and world order to judge equal link members (spec
  §8.3). Each link becomes one `Shape` from its first member; equal members become shaped
  parts; a differing member stays plain. `link` is read only from a file below v11.
- `validateShapes` drops a malformed shape (claiming no id) and a duplicate id (first
  wins); a definition whose id is literally `ROOT` is dropped (the write-back's root id).
  `repairTree(doc, { copyShared: version < 11 })` runs on every load (inv 46).
