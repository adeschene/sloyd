# Sloyd — Add joinery (phase 2, follow-up 171)

**Date:** 2026-10-04 · **Status:** approved in conversation, section by section
**Builds on:**
- `2026-10-03-sloyd-generate-design.md` (the LLM seam, the repair loop, `checkDesign`, §4.4);
- `2026-10-03-sloyd-held-and-stable-design.md` (contacts, invariant 39);
- `2026-10-04-sloyd-stopped-cuts-design.md` (stops, which is what makes a mortise possible).

Every rule in those still holds unless this document says otherwise.

## 1. Purpose and scope

The Generate spec's phase 2 was "refine and joinery". The user chose to build **joinery first**,
as one action:

- **"Add joinery…"** takes the open design, generated or hand-made.
- It returns the same piece, joined, using four joints: **mortise and tenon**, **dado / stopped
  dado**, **rabbet** and **half-lap**.

**The approach, chosen from three.** The code finds every place two parts meet (a *site*). **One
model call** picks a joint and its sizes for each site, from a list the code allows. The code
builds the joints from tested recipes.

- The geometry is therefore right by construction.
- The model supplies only the woodworking judgment.
- If the call fails, every site gets a built-in default (§5.3).

**Success:**
- Your workbench export and a generated bookcase come back with believable joints.
- Their cut lists show mortises, tenons, dados and rabbets.
- `checkDesign` finds no new problems, or the repair loop clears them.

**Out of scope:**
- Refine by instruction (a follow-up of its own).
- Joinery inside Generate's own runs.
- Angled and round joints, dowels, screws and hardware.
- Choosing a joint by hand.
- Any schema change. Joints are `Cut`s plus resized or moved parts.

## 2. Architecture

```
src/generate/joints/
  sites.ts      findSites(doc) → Site[]                      pure
  pocket.ts     pocketFor(board, worldBox) → Cut              pure — the ONE world→cut converter
  recipes.ts    applyJoints(doc, sites, choices) → JoinResult pure
  choose.ts     JOINERY_PROMPT, JOINT_SCHEMA, siteMessage, parseChoices, defaultChoice
src/generate/run.ts    runRepairLoop (generic) + runGeneration (Generate's adapter) + runJoinery
src/useJoinery.ts      the React side: one run, cost, cancel, the write
src/panels/JoineryDialog.tsx
```

- **Layers.** `generate/joints/` imports only `document` and `llm`, like the rest of
  `generate/`. `useJoinery.ts` sits beside `useGenerations.ts` because it owns React state and
  the storage write.
- **The model call.** It uses the existing `LlmClient`: structured output, adaptive thinking,
  medium effort, and the same key and model setting. `llm/` gains nothing.
- **The write.** `useJoinery` writes **only** through `createProject(doc, { activate: false })`
  (invariant 36). No `switchToken` bump, no `replaceDocument`, no store action. The Open
  button calls `openProject`.

## 3. Sites (`sites.ts`)

### 3.1 Contacts

`designCheck.ts`'s private `contactsOf` is exported as `faceContacts(doc)`. Its rule does not
change: face planes coincide within `TOUCH`, and the shared span is greater than `TOUCH` on both
other axes.

- **Sites are found from boxes, not solids.** A part that already carries a real joint is
  already interpenetrating its neighbour. It is therefore not a face contact, and is never
  joined twice.
- **Already-joined pairs need no special case.** A design that already has joinery, like the
  stopped-cuts scene, simply yields no site at those pairs.

### 3.2 Classifying a contact

For a contact between parts P and Q on world axis `k`, read **which of each part's own
dimensions faces the contact**: `axisDimensions(P)[k]`.

**Precedence, top to bottom. The first rule that matches wins.**

| # | Condition | Site kind | Entering part | Receiving part |
|---|---|---|---|---|
| 1 | Both parts show their `length` (two ends meet) | — not a site (butt) | | |
| 2 | One part shows its `length` AND its whole end lies inside the contact | **end into face** | that part (E) | the other (R) |
| 3 | One part shows its `thickness`, is **at most 1/2″ thick**, AND the other shows its `width` | **face against edge** | the part showing `thickness` (the panel, E) | the other (R) |
| 4 | Both show `thickness`, the thicknesses are equal within `TOUCH`, and they CROSS | **crossing** | the part on the +k side (E, the mover) | the other (R) |
| 5 | Anything else | — not a site | | |

- **"Whole end inside the contact"** means the contact's area is at least E's end area minus
  1e-6. This is what keeps a cleat lapped under a seat out of rule 2: the cleat's end is not the
  part touching.
- **Crossing** means that on one in-plane axis E extends past R at both ends, and on the other
  in-plane axis R extends past E at both ends.
- **Why rule 3 needs a thin panel** (a correction made while writing the plan). Without the
  limit, a 3/4″ top resting on an apron's edge matches rule 3 exactly as a back panel on a
  side's edge does. Every table top would then be dropped into rabbets. Back and bottom panels
  are thin, while tops and shelves are not, so 1/2″ separates them. An apron under a top is
  therefore not a site.
- **Why rule 2 comes first.** A top sitting on a side's end matches rule 2, with the side
  entering the top's underside, before rule 3 could read it as the top's face against an edge.
  A top on a side is a dado or a mortise in the top, not a rabbet.

Sites are numbered from 1 in a stable order: by E's index, then R's index, then axis.

### 3.3 What each site allows

Every site allows **`butt`**, which leaves it as it is.

| Kind | Joint | Allowed only if |
|---|---|---|
| end into face | `mortise-tenon` | E's thickness ≥ 1/2″, and R's depth along `k` ≥ 3/4″ |
| end into face | `dado` | R's depth along `k` ≥ 1/4″ |
| end into face | `stopped-dado` | `dado` is allowed, AND E's end reaches R's edge on at least one in-plane axis (named in the site) |
| face against edge | `rabbet` | R's thickness (the dimension the rabbet's `depth` runs across) ≥ 1/4″ |
| crossing | `half-lap` | always (rule 4 already requires equal thickness) |

A site's description carries:
- its kind;
- E's and R's names;
- the world axis and side;
- the contact's world box;
- its allowed joints, with each size's range (§5.2).

For `stopped-dado` it also names the ends that may be stopped, as world directions, e.g.
`"+Z (front)"`. A world axis is only ever named by its sign and letter. "Front" is a hint in the
prompt, not a rule.

## 4. The recipes

### 4.1 `pocketFor(board, worldBox)`: the single converter

This turns a world-space box into **one** `Cut` on `board` that removes exactly
`worldBox ∩ board`.

- **Converting the box.** Map the box to part-local spans through `axisDimensions(board)`
  and `board.position`, using invariant 2's min-corner rule. Then clip it to the board.
- **Choosing the face.** `face` is a dimension where the clipped box touches the board's
  boundary:
  - touching at 0 gives `from: 'min'` with `depth = hi`;
  - touching at the far end gives `from: 'max'` with `depth = dim − lo`.
  - If it touches on several dimensions, choose the one where the box is shallowest; on a tie,
    the earlier in `DIMENSION_ORDER`.
- **The other two dimensions.**
  - `across` is the one the box spans **fully** if there is one; otherwise the earlier in
    `DIMENSION_ORDER`.
  - `stopMin = lo` and `stopMax = dim − hi` on `across`.
  - The remaining dimension is the position axis: `offset = lo`, `width = hi − lo`.
- **A box that touches no face** (an enclosed void) cannot be cut. That is a recipe bug, so
  `pocketFor` **throws** rather than returning something wrong.
- **Ids.** Cut ids come from `nextId()`, and `takeId` repairs any duplicates on load
  (invariant 33).

**This is the only place a world box becomes a cut**, and it gets invariant 41 (§9).

### 4.2 Sizes

Every size is rounded to 1/16″ (`SNAP_INCHES`), **then** clamped to its range. The range is
re-snapped inward, so the clamp lands on a 1/16″ value.

### 4.3 Mortise and tenon (end into face)

E is the rail. R is the leg.

- **E grows** by `L` at the touching end. If that is E's min end, E's position moves back by
  `L` along `k`.
- **The tenon's cross-section:**
  - thickness `tt = max(1/4, snap(T/3))`, where T is E's thickness;
  - cheeks `c = (T − tt)/2`;
  - edge shoulders `s = min(1/2, snap(W/4))`, where W is E's width;
  - the tenon is centred on E's section.
- **E gets up to four `pocketFor` cuts** inside its new extension, removing everything that is
  not the tenon: two cheek boxes and two shoulder boxes. A zero-size box is skipped.
- **R gets `pocketFor(R, tenonWorldBox)`**, a stopped mortise.
- **`L`** is in the range [1/2″, R's depth along k − 1/4″]. Its default is
  `min(1-1/4″, snap(2/3 · R depth))`.

### 4.4 Dado and stopped dado (end into face)

- **E grows** by `d` into R, with the same end and position rule as §4.3.
- **R gets `pocketFor(R, E's grown end section × d)`.** If E does not span R's face on some
  axis, this pocket already stops short. `cutLabel` names it.
- **`d`** is in the range [1/8″, R's depth along k / 2]. Its default is
  `max(1/8, snap(R depth / 3))`.
- **Stopped dado.** The choice adds `stopAt` (one of the site's named ends) and `inset`.
  - `inset` is in the range [1/4″, E's extent along that axis / 2]. Its default is 3/4″, or
    the upper bound if that is smaller.
  - R's pocket is shortened by `inset` at that end.
  - E gets a notch, `pocketFor(E, extension ∩ inset strip)`, so nothing shows at the stopped
    end.

### 4.5 Rabbet (face against edge): this one moves a part

E is the panel. R is the part whose edge it covers.

- **E moves toward R** by its own thickness `t` along `k`. Its outer face then sits flush with
  R's edge.
  - **E moves once**, however many rabbet sites share that face (a back panel against two
    sides).
- **R gets `pocketFor(R, box)`.** The box is `t` deep along `k`, measured from R's edge. Across
  R's normal it runs `r` in from R's **inner** face, where `r` is the rabbet's `depth` choice.
  - "Inner" is the face on the same side as the panel's centre.
  - `r` is in the range [1/8″, R's thickness / 2]. Its default is `snap(R thickness / 2)`.
- **E is trimmed back to the rabbet line** if it reaches further across R than `r`.
- **Parts butting E's moving face are trimmed too.** This rule is added in the spec; it was not
  in the conversation.
  - Any OTHER part with a face contact against the face of E that moves is shortened along `k`
    by `t`, on that contacting side, so E can come forward. A shelf's back edge is the usual
    case.
  - Without this rule, every bookcase rabbet would push its back panel into the shelves.
  - A part shortened this way is listed in the result (§6).
- **The piece gets `t` shallower along `k`.** The result reports the change in overall size.

### 4.6 Half-lap (crossing)

The parts are the same thickness `t`.

- **E moves** toward R by `t` along `k`, so both lie in one plane.
- **Each gets a half-depth notch where they cross:**
  - E gets `pocketFor(E, crossing area × the half of the band on R's original side)`;
  - R gets `pocketFor(R, crossing area × the other half)`.

There are no sizes for the model to choose.

### 4.7 The result

`applyJoints` returns:

- `doc`, built through `migrateDocument` like any load;
- `applied`: the joint per site;
- `moved` and `trimmed`: the names of parts moved and trimmed;
- `sizeChange`: the overall X/Y/Z before and after.

It changes no names, and adds and removes no parts. Recipes run in site order. A site whose
parts an earlier site already moved is **recomputed from the current geometry**. It is not
reused from the original contact.

## 5. The choice (`choose.ts`)

### 5.1 The request

- **`JOINERY_PROMPT`** is a fixed system prompt, so the cached prefix holds. It covers:
  - the four joints;
  - what every size means;
  - the rules of thumb: a tenon about 2/3 of the receiving depth, a dado about 1/3 of the
    receiving thickness, and stopping a dado at the edge that shows;
  - that `butt` is a legitimate answer where a joint adds nothing;
  - that the answer must name every site.
- **The user message lists:**
  - each part: name, size, world box and material;
  - each site, as described in §3.3.

### 5.2 The schema and validation

```
{ joints: [ { site: integer, joint: 'mortise-tenon'|'dado'|'stopped-dado'|'rabbet'|'half-lap'|'butt',
              tenonLength?: number, depth?: number, stopAt?: string, inset?: number } ] }
```

`parseChoices` validates each entry against its site:

- **Unknown site numbers** are ignored.
- **A missing site** gets that site's **default** (§5.3).
- **A joint the site does not allow** gets the default.
- **A missing size** gets the default size.
- **A size out of range** is clamped (§4.2).
- **A `stopAt` not among the site's named ends** is replaced by the first named end.

Every substitution is recorded as a **note** and shown to the person, the way Generate shows
rejected parts.

### 5.3 Defaults

| Kind | Default joint |
|---|---|
| End into face, E's width > 4 × E's thickness (a shelf or panel) | `dado`, or `butt` if a dado isn't allowed |
| End into face, otherwise | `mortise-tenon`, falling back to `dado`, then `butt` |
| Face against edge | `rabbet`, or `butt` if not allowed |
| Crossing | `half-lap` |

Sizes use each joint's defaults from §4. The **defaults alone** are the answer whenever the call
fails for any reason other than the key (§6.2).

## 6. The run

### 6.1 The loop is generic

`runGeneration`'s loop becomes `runRepairLoop(client, adapter, signal, onProgress)`. The adapter
provides:
- the system prompt and schema;
- the first user message;
- `evaluate(res)`, which returns either `{ unusable, feedback }` or `{ doc, violations }`;
- `repairMessage(violations)`.

`runGeneration` becomes Generate's adapter, with its behaviour **unchanged**: every existing
`run.test.ts` test passes without edits, including invariant 37's identity test.

Everything else carries over unchanged for joinery:
- the append-only history, sent back exactly as received;
- `MAX_REPAIRS = 3`;
- keeping the fewest-violation attempt, with ties going to the later one.

**`runJoinery(client, doc, signal, onProgress)`:**
1. Finds the sites.
2. If there are none, returns `{ noSites: true }` **without** calling the model.
3. Otherwise runs the loop with the joinery adapter. Each attempt is: parse the choices, run
   `applyJoints`, then run the check.
4. A repair round sends the **new** problems and asks for the whole joint list again.

### 6.2 Errors

| Situation | Outcome |
|---|---|
| A rejected key (401/403, `LlmError` kind `auth`) | Stops the run. Nothing is written, and the key message is shown. |
| Cancel | Nothing is written. |
| The FIRST call fails any other way (network, overloaded, refused, unparseable) | **The defaults are built and checked once.** The result is saved with the note *"Joints chosen by built-in rules — the model call failed: <reason>."* |
| A REPAIR call fails | The best attempt so far is kept. This is a correction: Generate propagates the error and loses its attempt, so this is a new `keepBestOnError` option on `runRepairLoop`. Joinery turns it on; Generate keeps today's behaviour. |

### 6.3 The check (invariant 38, in one place)

- **Overlap is measured between solids.** `checkDesign`'s overlap test compares every pair of
  parts' **solids**: `boardSolids` mapped to world space with invariant 2's mapping, never
  `solidWorldBox`'s centre-relative boxes. Two parts overlap when any of their solids share more
  than `TOUCH` on all three axes. The message names the deepest overlap.
  - A design with no cuts has one solid per part, equal to its box, so **Generate's behaviour
    is unchanged**. Its existing tests pin that and must pass unedited.
- **Support, held and tips stay box-based.** A joint keeps the contacts they read: a rail's
  shoulders still meet the leg's face.
- **`Violation` gains `parts: string[]`.** These are the stored names the message is about, set
  by `checkDesign` and `rejectedViolations`.
  - Existing tests that compare violations exactly may add the field.
  - **Nothing else about a violation changes.**
- **Only new problems count.** Joinery checks the ORIGINAL document and the joined one, both
  with `limits = { width: null, depth: null, height: null, maxParts: doc.boards.length }`.
  - A problem is **new** if its key, `kind + '|' + sorted(parts).join(',')`, is not among the
    original's keys.
  - **Only new problems drive repairs and count toward "fewest".**
  - Old ones are reported once, as "already in the original".

## 7. The dialog and the hook

### 7.1 `JoineryDialog.tsx`

It uses the same overlay pattern as `GenerateDialog`, and joins `App`'s `dialog` union so
`modalOpen` covers it (invariant 27). It opens from **"Add joinery…"** in the toolbar, next to
"Generate…".

- **No key:** it says to add one in Settings, as Generate does.
- **Ready:**
  - the project's name;
  - the sites, one line each, e.g. *"Rail → Leg: end into face"*, in a scrolling list;
  - the model, read from Settings (a correction: Generate has no per-dialog model control, so
    this has none either; change it in Settings);
  - the cost estimate;
  - Run and Cancel.
- **No sites:** *"No joints to add — no parts meet end-to-face, face-to-edge, or crossing."*,
  with Run disabled.
- **Running:** a status line (choosing, or repairing round N), and Cancel.
- **Done:**
  - *"Saved as '<name> — joined'"*, with an **Open** button that calls `openProject`;
  - the summary, e.g. *"7 joints: 4 mortise and tenon, 2 dados, 1 rabbet"*;
  - any size change, e.g. *"Overall depth now 11-1/4″ (was 12″): the back sits in rabbets"*;
  - the parts moved and trimmed;
  - the notes;
  - any problems "already in the original";
  - any problems that remain;
  - the cost.
- **Failed:** the reason.

### 7.2 `useJoinery.ts`

- **One run at a time.**
- **The written project's name** is `"<name> — joined"`. The library's own naming handles a
  duplicate.
- **The write:** only `createProject(doc, { activate: false })`.
- **Cancel:** after a cancel, a post-run guard writes nothing, as `useGenerations` does.
- **Usage** is accumulated and shown with the existing price table.

## 8. Testing

**Unit tests, by module:**

- **`pocket.test.ts`**
  - Every posture, both turns, and a non-flat pose. `boardSolids` must show exactly
    `worldBox ∩ board` removed, measured by volume and by a probe grid. There are **no
    hand-written expected cuts**, because the bound has to come from outside the code under
    test (invariant 23).
  - It throws on an enclosed box.
- **`sites.test.ts`**
  - Each kind on small fixtures.
  - Precedence: a top on a side's end comes out as end into face.
  - A cleat lapped under a seat, and an apron under a top, are **not** sites.
  - An already-joined pair is not a site.
  - **The user's workbench** (`fixtures/simple-workbench.sloyd`) gives the expected site list,
    pinned.
- **`recipes.test.ts`**, for each joint:
  - zero overlap between solids;
  - conservation: the tenon volume equals the mortise void;
  - the labels from `cutLabel`;
  - names and part count unchanged.
  - Rabbet: the panel moved and trimmed, a butting shelf trimmed, and the size change
    reported.
  - **Two tenons into one corner leg** collide, and the check reports it.
- **`choose.test.ts`**: parsing, the per-site allowed joints, the clamp, the default, the
  `stopAt` fix-up, and the notes.
- **`designCheck.test.ts`**
  - solid overlap;
  - `parts` on every violation kind;
  - Generate's tests unedited;
  - "only new" against a design that already carries a problem.
- **`run.test.ts`**
  - every existing test unedited;
  - `runJoinery`: the repair after a collision (with a fake client), no sites → no call, the
    first-call failure → defaults, auth → throws.
- **Hook and dialog tests**: writes only through `createProject`, auth aborts, cancel writes
  nothing, Open calls `openProject`, and the no-sites state.

**Mutation testing** applies to every plan-supplied test. The hardest look goes to:
- `pocketFor`;
- the "only new problems" rule;
- the precedence of the site rules;
- the rabbet's trimming of butting parts.

**`npm run build`** is the type gate.

## 9. Invariants and docs

- **Invariant 38 is rewritten.** Overlap is measured between **solids**, so a cut explains an
  overlap by removing the wood. Do not raise `TOUCH`. Do not drop the check.
- **New invariant 41:**
  - `pocketFor` is the only place a world box becomes a `Cut`;
  - joinery never adopts (invariant 36 extended);
  - only problems the joinery introduced count, keyed on `kind` and `parts`, never parsed from
    message text.
- **CLAUDE.md:**
  - the file index for `generate/joints/`, `useJoinery.ts` and `JoineryDialog.tsx`;
  - Status;
  - the rounds row.
- **`docs/follow-ups.md`:**
  - 171 is closed for joinery;
  - a new entry for **refine by instruction**;
  - any residue the round finds.
- **`docs/browser-verification-joinery.md`:** the live pass.

## 10. The live check

Claude drives the dev server and the user watches. The user enters the key; it never appears in
chat. **Every paid run needs the user's OK first.**

1. **The user's workbench** (`fixtures/simple-workbench.sloyd`, imported):
   - legs and rails become mortise and tenon;
   - the shelf is housed.
2. **A generated bookcase:**
   - shelves go into dados, with stopped ones where the model chooses;
   - the back goes into rabbets, with the shelves trimmed;
   - the size change is reported.
3. **A forced collision.** Two rails enter one corner leg at the same height, and we watch a
   live repair shorten a tenon.

For each one:
- the 3D view;
- the cut list's joints;
- the result's notes;
- the cost, compared with the estimate.

`localStorage` is cleared afterward.
