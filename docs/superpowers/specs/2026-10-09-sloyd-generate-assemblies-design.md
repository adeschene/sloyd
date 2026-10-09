# Sloyd — assemblies and components in generated prototypes

**Date:** 2026-10-09 · **Status:** approved 2026-10-09; amended while planning (§2 role normalisation and optional TS fields, §3 step 1 placement rejection, §5.3 the "fix the assembly" conditions).
**Builds on:**
- **Generate** (`docs/superpowers/specs/2026-10-03-sloyd-generate-design.md`): the schema, the
  converter, `checkDesign`, the repair loop.
- **Assemblies** (`2026-10-06-sloyd-assemblies-design.md`, schema 10, invariant 46) and
  **components** (`2026-10-06-sloyd-components-design.md`, schema 11, invariant 45).
- **Invariants:** 8, 11, 18, 25, 33, 36, 37, 38, 39, 41, 45 and 46.
- **Precedence:** every rule in those documents still holds unless this one says otherwise.

## 1. Problem and goal

**The problem.** Generate returns a flat list of world boxes. A prototype arrives with no
assemblies and no shared parts, however obviously it is made of repeated units. That costs twice:
- **Editing.** Three drawers are fifteen unrelated parts; four legs are four. Changing a drawer
  means changing it three times, or regrouping and relinking by hand.
- **Detail.** Every repeated part costs output tokens and counts against the detail cap, so a
  six-drawer dresser does not fit under Moderate (30 parts).

**Goal.** The model can describe a multi-part unit once and place it several times; Sloyd builds
real shared assemblies from that, and links loose parts that play the same role and come out
identical.

**Success.** Ask for a three-drawer chest. The prototype opens with one drawer assembly placed three
times (an edit inside any drawer changes all three) and its four legs linked. The drawer's parts
count once against the detail cap.

**The user's rulings, made in conversation:**
- **Both goals** (easier editing and more detail per cap).
- **Approach B:** the model authors assemblies — parts in a local frame, placed by translation
  only, one level deep. Sloyd decides components. Rejected: (A) the model authors the whole tree
  (local frames, turns, shapes), because frame composition and sameness are where it is weakest and
  one bad placement fans out into many violations; (C) flat parts with repeat hints, because it
  expresses rows only (not a 2×2 of legs, not drawers in a case) and yields assemblies only as a
  side effect.
- **The cap counts DISTINCT parts**, with a ceiling on placed parts.
- **Components need role AND exact equality.** The model tags parts with a role; Sloyd links equal
  parts of one role. Rejected: linking every equal part (a top and a shelf that coincide in size
  would edit together), and no linking.
- **Reuse `linksToShapes`** and amend invariant 45 (§4.3), rather than routing through the store's
  Link.
- **Collapse repeated violations by authored part** (§5.3).

**Out of scope:** nested assemblies, turned placements, refine by instruction (fu 179), any
change to joinery.

## 2. What the model sends

`DESIGN_SCHEMA` becomes (every property required, as today, to suit structured outputs):

```
{ name: string,
  parts: Part[],                         // loose parts, WORLD coordinates (as today)
  assemblies: [ { name: string,
                  parts: Part[],         // LOCAL coordinates, in the assembly's own frame
                  placements: [ { name: string, at: Vec3 } ] } ] }

Part = { name, role, material, at, size }   // role: a short word ("leg", "side"), or "" for none
```

- `assemblies` may be `[]`. A design with no assemblies is today's design plus `role`.
- An assembly holds parts only — no nested assemblies. Placements have no turn.
- A placement's `at` is where the assembly's local origin goes in the world.
- `parseDesign` extends its shape check to every assembly part and placement (material in
  `MATERIALS`, `role` a string, `at`/`size` `Vec3`). An empty `parts` with no assembly parts is
  still unusable. A design whose loose parts are empty but has assembly parts is usable.

**`role` is conversion input only.** It never reaches a stored part, a shape, or the document.
Roles are normalised (`trim().toLowerCase()`) before comparison, so "Leg" and " leg" are one role.

`role` and `assemblies` are required of the MODEL (schema and `parseDesign`), but optional in the
TypeScript input type of `designToDocument`, so the hand-built test fixtures that call it with flat
literals stay terse. A value `parseDesign` returns always has both.

## 3. Converting to a document

`designToDocument(design)` returns `{ doc, rejected, authored }` (`authored` is §5.3's map).

1. **Snap** every loose part, every assembly part and every placement origin to `SNAP_INCHES`
   (invariant 25: model output is a free value, like a drag). Finiteness and positive size are
   checked after the snap, per part, as today. World = origin + local, so every world coordinate
   stays on the grid. A placement whose origin is not finite after the snap is rejected on its own
   (`"<placement> (placement of <assembly>)"`, `'not-finite'`); the other placements stay.
2. **Encode** each part with `orient`, unchanged. A placement has no turn, so a local box has the
   same extents in the world.
3. **Drop** an assembly with no placements, or whose every part was rejected, reporting it as a
   `RejectedPart` with a new reason (`'unplaced'` or `'empty'`), named by the assembly. A rejected
   assembly part is reported as `"<part> (in assembly <assembly>)"`.
4. **Centre.** Bounds are taken over the PLACED world parts (loose parts plus every placement's
   parts). The shift is applied to loose parts' positions and to instance origins ONLY — never to
   definition-local coordinates — and, as today, is a multiple of `SNAP_INCHES` on X and Z, with
   the lowest part landing on y = 0.
5. **Build the raw tree:** loose parts as root `boards`; one `Definition` per kept assembly; one
   `Instance` per placement (`rotation: 0`, the model's placement name, `definition` the assembly's
   definition id). Every part, instance and definition id is minted with `nextId` here, so the role
   map (§4) can key on ids that survive load.
6. **`migrateDocument`** at `version: 11`, the gate an imported file passes: it validates, dedupes
   names among siblings (invariant 8 — placement names and loose part names share the root's
   namespace) and repairs ids (invariant 33; none should need it). `repairTree`'s
   `copyShared: version < 11` is false, so placements keep sharing one definition.
7. **Link by role** (§4), then `dissolveShapes(pruneShapes(…))`.
8. **Return the tree.** Today's `flatDocument(…)` wrapper (an identity on a flat document) goes:
   `doc` is the TREE document, typed `SloydDocument`, which `runGeneration` returns and
   `useGenerations` saves (`createProject(…, { activate: false })`, invariant 36, unchanged).
   Checks flatten it themselves (§5.1).

The result must survive another `migrateDocument` unchanged (a test).

**No schema bump.** `instances`, `definitions` and `shapes` all exist in v11. Rolling back past
this round costs nothing.

## 4. Components: role plus exact equality

### 4.1 Labels

After step 6, for each role (non-empty), take its STORED parts (a part inside a definition is one
stored part however many times the assembly is placed). Split them into classes by `sameShared`
(exact, invariant 18). Each class is labelled `"<role>#<k>"`. Parts with role `""` get no label.

Splitting by class matters: a model that calls both the case sides and the drawer sides `"side"`
gets each equal group linked among itself, instead of only whichever group `linksToShapes` meets
first. The role still keeps a top and a shelf apart.

### 4.2 Building

The label map (stored part object → label, built from the migrated doc by id) goes to
`linksToShapes`, unchanged. A class with one stored member gets a shape with one user, which
`dissolveShapes` removes (invariant 45's "users counted as STORED parts").

- **Scope:** document-wide — loose parts and parts inside definitions, and across them (a loose
  "leg" and an assembly's "leg" that are equal share one shape).
- **Posture is shared, rotation is own** (`LINK_FIELDS`). Two equal shelves running along X and
  along Z still link. `orient` is deterministic, so equal sizes always get equal encodings (a
  test). Linked parts share a posture, so fu 215 does not arise.
- Generated parts have no cuts, so `sameShared`'s cut comparison is vacuous here.

### 4.3 Invariant 45, amended

`linkPlan` remains the ONE decider for a user's Link (store and panel). Add:
> `linksToShapes` is the ONE label→shape builder, with two callers: the v10→v11 step and
> generation's role linking. Both judge equality by `sameShared` only.

## 5. Checks, the cap, the repair loop

### 5.1 Checks

`checkDesign` runs on `flatDocument(tree)` — the flattening joinery already uses. Overlap, held,
tips and the size limits are measured on placed world solids, unchanged (invariants 38, 39).
**`checkDesign` itself does not change**, and nothing in joinery changes.

### 5.2 The cap

- `checkDesign`'s `maxParts` keeps meaning PLACED parts (joinery calls it with that meaning).
  Generation passes the **ceiling**: 4 × the detail cap (Simple 48, Moderate 120, Detailed 240).
- Generation adds its own **distinct-part** check: the converted document's root parts plus every
  definition's parts, each counted once, against `DETAIL_CAPS`. Kind `'too-many-parts'`, message
  e.g. `14 distinct parts; the limit is 12 (an assembly's parts count once).`
- `userMessage`'s hard-limit line states both:
  `- At most 30 different parts (an assembly's parts count once) and 120 placed parts (moderate detail).`
  This changes the pinned literal in `prompt.test.ts` deliberately.

### 5.3 Collapsing repeated violations

A defect inside a definition appears once per placement. Left alone it biases "fewest violations"
toward fewer placements and tells the model six times about a one-place fix.

`authored` maps every flat display name to `{ label, placement }`:
- a loose part → `{ label: <stored name>, placement: null }`;
- an assembly part → `{ label: "<assembly> › <part>", placement: <instance's stored name> }`.
  Assembly names are deduped among themselves for this purpose.

`collapseViolations(violations, authored)`: violations with the same `kind` and the
same sorted set of authored labels merge into one, which keeps the first message, takes the
authored labels as `parts`, and appends:
- `" (in every placement of <A> — fix the assembly)"` only when (a) every merged violation lies
  inside ONE placement (no loose part, no second placement), (b) the group covers all of assembly
  A's placements, and (c) A has at least two placements; otherwise
- `" (in <P1>, <P2>)"` listing the placements involved.

(a) is an amendment made while planning: without it, drawers placed too close together (Drawer 1
overlapping Drawer 2, Drawer 2 overlapping Drawer 3) would be told to "fix the assembly" when the
fix is the spacing. (c) keeps a once-placed assembly's report naming its placement.

A violation with no assembly part passes through unchanged. Violations without parts
(`too-many-parts`) pass through unchanged. This lives in the generate path only; joinery's
`problemKey` is untouched.

The merged list is what the repair loop scores ("fewest"), what `repairMessage` sends, and what
the finished run's "N issues" counts.

### 5.4 Prompt

`SYSTEM_PROMPT` gains, as fixed text (it must stay a cacheable prefix):
- when to use an assembly: a multi-part unit that repeats, or forms a natural unit (a drawer, a
  door, a base);
- its parts are in its own coordinates, its min corner at its origin by convention; a placement's
  `at` is where that origin goes; no turns, no nesting;
- `role`: the same word for parts that are the same part (all four legs), `""` otherwise;
- feedback names an assembly part as `Placement › Part`, and "fix the assembly" means change the
  assembly's parts, not a placement.

The "no joinery in this tool yet" line stays as it is (it is about generation).

## 6. UI

- Detail options read `Simple (up to 12 different parts)`.
- Nothing else is new: assemblies appear in the parts list and linked parts show as linked through
  existing UI.

## 7. Testing

TDD. Every equality, boundary and ordering test is mutated to confirm it can fail.

- **`parseDesign`:** accepts assemblies; refuses a bad placement, a missing `role`, an unknown
  material inside an assembly; accepts no loose parts with assembly parts; refuses no parts at all.
- **`designToDocument`:** world = local + origin after snap and centre; centring never changes
  definition-local coordinates; placements share one definition; placement names deduped against
  loose parts; unplaced and fully rejected assemblies dropped and reported; a rejected assembly part
  named with its assembly; no `role` anywhere in the output (stored parts, shapes, definitions);
  `migrateDocument` round trip is a no-op.
- **Role linking:** equal same-role parts link; a differing same-role part stays plain; two classes
  in one role each link; equal parts with different roles do not; a role's only stored member is a
  part in a definition placed 3× → one user → plain; a loose part and an assembly part of one role
  share; equal sizes → equal encodings.
- **Cap:** distinct at cap and cap+1; placed at ceiling and ceiling+1; a design under the distinct
  cap but over the ceiling fails only the ceiling.
- **Collapse:** one definition defect placed 6× → one violation with "fix the assembly"; a defect
  in 2 of 3 placements names those two; two different defects stay two; loose-only violations pass
  through byte-identical.
- **`runGeneration`** (fake client): "fewest" counts merged violations; the repair message carries
  the collapsed wording.
- **Round trip:** a generated tree through `runJoinery` keeps a definition shared where its
  mortises are identical.
- **`prompt.test.ts`:** the updated literal; `SYSTEM_PROMPT` still has nothing per-run.

**Live check (dev server, Playwright, the user watching):** one paid Generate run, approved at the
time — "a 3-drawer chest". Confirm the assembly in the parts list, that an edit inside one drawer
changes all three, and that the legs are linked. Optionally one paid joinery run on the result.
Production: page load, bundle hash at the edge and in-network, CSP header, `localStorage`
confirmed cleared.

## 8. Docs when it ships

- CLAUDE.md: invariant 45's amendment (§4.3), a Rounds row, Status.
- `docs/history.md`: the round's narrative.
- `docs/follow-ups.md`: anything left open.
