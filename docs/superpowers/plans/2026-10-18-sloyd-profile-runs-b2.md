# Profile runs, chunk b2 (stops on a turned path, two-side runs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a stopped profile follows the outline. A Start or Stop may sit on an arch, a bow, a notch or a corner arc, and runs
out there with the cutter revolved about the bit's axis 1/4" outside the outline (B6, §4.2 *(b2)*). A stopped run may start
on one side and stop on another, following the outline round every corner between (B3: a rounded top profiled front and
ends, the back left plain). It is built, shaded, edged, drawn, faulted, worded, keyed and edited like b1's swept profiles, and
saved a2 stops on a turned path pick it up on load, falling back to a2's cut when the bit does not fit (B10/I1 extended).

**Architecture:**
- **One path home (b1's).** `profilePath.ts` gains the STOP: a station is the outline point at its run-dimension coordinate
  on its side's stretch (B2, `stationPoint`), and a run's path is the outline CCW from Start to Stop, one side or two
  (`PathEnd` kind `'stop'`). `isSwept` (Q2) widens: a station run is swept unless its whole path is one straight chord.
- **One run-out home (a2's), widened.** `runout.ts` gains `StopFrame` and `stopRunoutPieces`: a2's inscribed sectors written
  in a general plan frame (forward F along the station's model chord, N into the wood, axis `BEARING` outside). a2's own
  functions, and b1's B1 stations (which use them), are untouched: their bytes stay.
- **The construction is b1's.** `sweep.ts` builds the band for a path that ends at stops exactly as it does for B1 stations
  (`planChain` gives a stop end a square end ray and a station clip); `boardBodies` subtracts `stopRunoutPieces` after b1's
  run-outs. The probe (Task 1) proves it on today's code.
- **The readers learn the stop:** faults (stop-off on a stretch, the zone, two-side forms), the fallback, probes and holes,
  normals, edges (a2's run-out rule keyed by profile id), the Plans sheet, diagrams, words, keys, the row (a Stop side).

**Tech Stack:** TypeScript, React, Zustand, Vitest. `npm test` does NOT typecheck. `npm run build` (`tsc -b && vite build`) is
the gate.

**Spec:** `docs/superpowers/specs/2026-10-17-sloyd-profile-runs-design.md`. Read these before any task:
- §1: R5, R6, R9, R10, B1 (with its ε amendment: ε is build-only, never decides a fault, and has a fallback), B1a, B2, B3, B4,
  B5, B6, B7, B10 (with I1: "Fall back to straight"), and the planning rulings P9–P19, I1, I2, Q1–Q8 with every *Amended* block;
- §3.1 (travel, canonical forms, mirroring), §3.2's *(B)* line (b2 lifts the refusal of ends on two sides, no bump), §3.3,
  §4.1, §4.2 *(b2)*, §5 (the two-side words), §6 (the second Side select).
- `docs/history.md`, "What profile runs chunk b1 did": every ruling and what it cost. `docs/follow-ups.md` 392 and 393.

**Planning questions** (below) are the spec's silences for b2. The user answers them before Task 2; the controller writes the
answers into the spec as *Amended (planning, b2)* Q9–Q27 and edits this plan wherever an answer differs from the
recommendation. Every task assumes the recommendations.

**The probe** (`docs/superpowers/plans/b2-probe/`, written and run by Task 1): `probe.ts.txt` is throwaway and runs as
`npx tsx`; copy it to a scratch directory as `probe.ts` to run it. It holds the frame run-out (`frameRunout`), a hand-made
stop path fed to b1's construction (`stopPath`, `bandPieces`), the end-chord zone (`zone`, `snapped`) and the independent
oracle (`oracle`). `results.txt` holds its numbers. Port from it; never import it.

## Planning questions

Each line: the case, the recommendation, and its cost. (Q1–Q8 are b1's; these continue the numbering.)

- **Q9 Which runs are swept.** A loop, a two-side run, an End to end on a turned side (b1), or a one-side STATION run whose
  path (Start to Stop, the fault path: no ε, no zone) is not exactly one chord free of any curve. A stop on a cut side's
  straight stretch (the arched apron from 0.5 to 2.5) stays a2's view curve byte for byte (B4). A one-side station run with
  no path (a station off its stretch, an untraceable outline) also stays a2's. *Cost:* a stop beside a line-only clipped
  corner keeps a2's prism (it cuts air there), as b1 kept that End to end.
- **Q10 A SAVED a2 stop on a turned path (B10 for stops).** It follows the outline on load, as B10 made End to end follow.
  When its swept faults are non-empty and its straight faults (a2's: `curveFaults` of its view curve and a2's profile faults)
  are empty, it is built, drawn, worded and keyed EXACTLY as a2 built it (I1, extended to one-side station runs; a two-side
  run is new in b2 and never falls back). To keep b1's I2 ruling (a saved a2 stop inside a corner arc beside a B10 End to
  end: both build), stops are decided FIRST: a station run's fallback is judged against every other profile by its shape;
  every other judgement then reads a fallen-back station run as straight (its I2 coverage: straight chords only).
  *Cost:* a saved stop over an arch or round a corner changes look on upgrade when it fits (the fix B10 asked for); one b1
  test assertion changes (`profilesFinal.test.ts:40`, the stop's own `profileFaults` becomes `[{ kind: 'overlap', other: 'b' }]`
  while both still build exactly as on b1, pinned by hash); the row's fallback note reads "too tight" even when the cause is
  an overlap (fu 393(6), now commoner: recommend Task 9 words it by cause, `Runs straight: it would overlap another profile
  if it followed the curve.` for overlap).
- **Q11 Where a station sits.** On the MODEL chords at its run-dimension coordinate (B2), so the band, the cover and the
  overlap judgement read one point. A station exactly on a chord vertex belongs to the run-side chord (a start: the chord
  starting there; a stop: the chord ending there). *Cost:* none measurable (probe case C: no step, 0 mismatches).
- **Q12 The run-out's frame.** The station's MODEL chord: F along it away from the run, N its inward normal, the axis
  `BEARING` outside along −N, the forward half bounded by the plane across the chord. The true arc's tangent would put the
  band (built on chords) and the run-out in two frames: a step. *Cost:* the axis sits off the true normal by at most half a
  chord angle (≤ 0.2 rad at R10's limit); invisible. Probe: steps ≤ 1.3e-7" (the probe's own 1e-6 offset).
- **Q13 The end-chord zone.** A station closer than reach·tan(φ/2) to the next CONVEX path vertex inward (φ the turn there)
  swallows its end piece: the skeleton returns null and today's rule would fault it `too-tight`. It is BUILT at that vertex
  instead (the run shortened, never lengthened), and like B1's ε this never decides a fault: every fault, the cover and the
  overlap read the typed station; the skeleton test reads the snapped one. *Cost:* the built stop is up to reach·tan(φ/2)
  short of the typed one: 0.008" for a 1/4" roundover on 2" corners, about 0.05" at R10's limit (a 1/4" roundover on 1/4"
  corners), 0.07" for a 1/2" roundover on 1/2" corners. Probe: D1 swallowed, D2 builds with 0 mismatches.
- **Q14 A stop inside a neighbour's B1 ε.** A stop on the next side within ε of the tangent point where a neighbour's End to
  end runs out is judged at the tangent point (ε never decides) and is clean; the two built cuts overlap by up to ε (≤ 0.084").
  *Cost:* a doubled cut there, invisible when the two sections match. b1's own ruling, kept.
- **Q15 Tight arcs and stops.** R10 and B5 are judged on the PATH's arcs only, as b1: a stop ON a concave arc of radius at
  least `BEARING` builds (probe F: the half-round notch); a tight arc beyond a stop is no fault (the bit never follows it).
  *Cost:* none; a stop placed so its run-out reaches a tight arc's wood cuts what a fixed bit would.
- **Q16 Two-side direction and extent.** A two-side run always runs CCW looking at its face from Start to Stop (§3.1); it
  may pass up to three sides; it is never re-ordered (only a one-side run has P11's canonical swap) and has no "crossed"
  state; a run whose Start and Stop are one point is `stop-off`. *Cost:* the user must pick Start and Stop in travel order
  (the words, Q21, say which sides are cut).
- **Q17 `through` ends in a stopped or two-side run.** Allowed (I2: a typed 0 or full length). A through end must name the
  end where travel ENTERS Start's side, or LEAVES Stop's side; any other through end is kept and faulted `stop-off` (it is
  unreachable from the row). At a corner arc a through end carries round to the far tangent point exactly as End to end
  (B1, with ε and B1a). *Cost:* none.
- **Q18 B1a, widened.** A mitre at a shared corner arc's middle is made between any two runs whose ENDS are `through` at that
  arc on one face (End to end pairs are unchanged byte for byte). A run that passes the arc in its middle is no partner: it
  overlaps (Q19). *Cost:* a half-stopped run and an End to end meeting at a corner mitre rather than both running out.
- **Q19 Overlap.** Judged on path cover (Q6), the two-side path included: a two-side run passing a corner arc that a
  neighbour's End to end takes overlaps it. *Cost:* none beyond Q6.
- **Q20 Mirroring.** `mirrorProfile` is unchanged: every reflection swaps Start and Stop and flips each end's flags by its own
  side (inv 44). Pinned for two-side runs with a chiral pose. *Cost:* none.
- **Q21 Words.** A one-side swept stop reads chunk 1's line, `, round the corner(s)` only for a through end carrying round a
  corner arc, then a2's `, from <a> to <b> (stopped)`. A two-side run reads `<name> on <face><top><fillet>, from <Start>
  round <between> to <Stop> (stopped)`: `<Start>` is `the length min end at 4"` (a station from its run dimension's min end)
  or `the length min end at its width max end` (a through end); `<between>` is `the corner` (adjacent sides), `<side>` (one
  side between) or `<side> and <side>` (two). Example: `Roundover 1/4" on the thickness face (max side), from the length min
  end at 4" round the width min side to the length max end at 4" (stopped)`. *Cost:* §5's example gains the face clause and
  says width MIN (see the contradictions).
- **Q22 Keys.** Every stopped run, swept or straight, one side or two: `<name><fillet>, stopped` (P15; no corner words, no
  positions). *Cost:* a stopped run round a corner keys like a straight stop of the same profile.
- **Q23 The four-edge collapse.** Never for a stopped or two-side run (P15). Unchanged.
- **Q24 Part diagrams.** Q8 for every swept stop: the face's thickness view opens, its inner line is drawn up to each stop's
  plane (no run-out arc drawn), its note listed; no end-view hatch (P16). *Cost:* the run-out's footprint is not drawn.
- **Q25 Snap points.** P17 at every b2 stop: the section's two junction points on the stop plane, as `'corner'`s. B1
  stations keep none (b1's bytes). *Cost:* none.
- **Q26 The row.**
  - Face, Run, **Side** (Start's side, as today), **Stop side** (new, Stopped only, default the Side), Start, Stop (each field
    "from the <its side's run dimension> min end").
  - Side on a one-side run moves both ends (a2). On a two-side run it moves only Start; Stop side moves only Stop. Equal sides
    make a one-side run, put in canonical order.
  - A moved end keeps its station number when that adds no fault, else it is seeded `min(3, L/4)` in from the corner where
    travel leaves Start's side (for Start) or enters Stop's side (for Stop).
  - Face on a two-side run swaps Start and Stop, so the same sides stay profiled (the thickness mirror's own rule).
  - Typing an end where its side's travel leaves (Start) or enters (Stop) is refused as the `stop-off` it would add.
  - *Cost:* a seeded station the user did not type (the a2 precedent: Run → Stopped seeds 3").
- **Q27 Presets and Facing.** `+ Add profile ▾` is unchanged (End to end presets; B7's greying is gone). An asymmetric
  two-side run's Facing reads `Top: the edge` and its bench line `, top on the edge`, as a loop's (Q7 amended). *Cost:* none.

**Spec contradictions found while planning** (for the controller to put to the user):
1. §5's two-side example, `from the length min end at 4" round the width max side to the length max end at 4"`: on the top
   (face max) the CCW travel of §3.1/P11 from the length min end to the length max end passes the width MIN side. The
   example either means the bottom face or names the wrong side; it also names no face, so a top and a bottom run would read
   alike. Q21 recommends the face clause and the travel's true side.
2. §4.1's `stop-off` includes "a run-out whose cutter would leave the face", but P13 (a2) rules a run-out past the part's end
   is no fault, and a2/b1 implement P13. b2 keeps P13.
3. Q6's I2 amendment (a station run's coverage is its side's straight chords only) rests on "a2's prism follows no curve";
   B6 makes station runs follow. Q10 keeps I2 for station runs that fall back, and only for them.

## Global Constraints

- **No schema bump** (18). b2 lifts the loader's refusal of ends on two sides and nothing else (§3.2 *(B)*). b1 refuses a
  two-side document; rolling back to b1 (`dc49b01`) also builds saved turned stops as a2 did.
- **Byte for byte:** every a1, a2 and b1 run that b2 does not make swept keeps every reader's output. These pins pass
  UNTOUCHED in every task (a test may gain cases, never lose or change one, except the list below):
  `src/document/drawingIdentity.test.ts` (both blocks, the second is the curved-scene hash), `src/document/profilesView.test.ts`,
  `src/document/diagramIdentity.test.ts`, `src/viewport/bodyMeshIdentity.test.ts`, `src/viewport/runoutMemo.test.ts` (mesh
  and edge hashes), `src/document/sweepEdges.test.ts` (fast == reference, and every `BODIES` hash), and
  `src/document/profilesFinal.test.ts` (the I1 hashes on 65947fd).
- **The pin command** (the LAST run step of every task, browser closed; every file passes untouched):
  `npx vitest run src/document/drawingIdentity.test.ts src/document/profilesView.test.ts src/document/diagramIdentity.test.ts src/document/sweepEdges.test.ts src/document/profilesFinal.test.ts src/viewport/bodyMeshIdentity.test.ts src/viewport/runoutMemo.test.ts`
  (`profilesFinal.test.ts:40` excepted, once Task 3 changes it by design).
- **The only b1 tests b2 changes, by design** (each named in its task, the change reviewed):
  - `profilePath.test.ts:58` (`a station run is never swept in b1`) and `:248` (no path for a station run or two sides);
  - `profilesLoad.test.ts:78-80` and `:184-187` (ends on two sides refuse);
  - `panels/Profiles.test.tsx:790-807` (B7's greyed Stopped);
  - `profilesFinal.test.ts:40` (the I2 stop's own `profileFaults`, Q10).
- **Swept (Q9).** **Stops (Q11–Q13):** a station is a point on the model chords; its frame is its model chord; the
  end-chord zone snaps the BUILT station only.
- **The run-out on a curve (§4.2 *(b2)*, Q12):** `stopRunoutPieces` is a2's inscribed construction in the frame (F, N), exact
  on every sector ray. a2's `runoutPieces` and b1's `sweptRunouts` are unchanged; a B1 station (the far tangent point) keeps
  them.
- **Tags:**
  - a stop's run-out faces carry `runout: 'lo' | 'hi'` (the path's face-frame end 0 / end 1);
  - they carry `profileEdge: profileEdgeName(<profile id>, a, b)` from `sectionEdgeNamer` of the profile's section, as b1's
    run-outs do.
- **Faults (Q6 + b2):** `stop-off` gains a station off its side's stretch, a two-side run of zero length, and an inconsistent
  through end (Q17). Authoring refuses an ADDED fault; a fault a resize or curve edit causes is KEPT and noted, never
  clamped. A faulted swept profile builds nothing.
- **Words (Q21), keys (Q22).** One home each: `curveText.ts`, `featureKeys.ts`.
- **Performance:** `curvesPerf.test.ts`' method (minimum of 9, a fresh `geometryKey` per run, bodies + edges + mesh). Task 1
  sets each guard by its rule (40 ms where the probe's TOTAL × 1.8 ≤ 40; else `ceil(TOTAL × 1.8 × 1.25)`, recorded for
  chunk c). Task 6 commits the product's measured minimum + 25% where that is higher (b1's Q4 amendment). The cases:

  | Case | Fixture | Planning smoke run, probe TOTAL |
  |---|---|---|
  | Roundover 1/4" stop on a 2" corner arc to 30" | `stopOnCorner()` | 18.0 ms |
  | Cove 3/8", the same | `stopOnCorner('cove', 0.375)` | 21.4 ms |
  | Roundover 1/4" stops on the arch (10", 20") | `stopOnArch` | 19.1 ms |
  | Roundover 3/8" stop on the notch (14.5") to 25" | `stopOnNotch` | 22.7 ms |
  | Roundover 1/4" stops on a bow (5", 25") | `bowFront` | 11.1 ms |
  | Roundover 1/4", two sides, front and ends | `frontAndEnds()` | 22.3 ms |
  | Cove 3/8", two sides, front and ends | `frontAndEnds('cove', 0.375)` | 44.0 ms |

  **Close the Playwright browser before any full-suite run** (a2: its GPU process at ~250% CPU failed wall-clock guards).
- **Watertight (inv 50):** every b2 case has 0 unmatched directed edges, holes included.
- **Invariants touched:** 16, 44, 47, 48, 50, 53 (written into CLAUDE.md in Task 10). Never `board[dim] - x` at a call site;
  a station becomes a coordinate only through `endPos`, and a point only through `stationPoint`.
- **Process:**
  - Commit after each task with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Branch `profile-runs-b2`, from master.
  - Mutate every refusal, ordering and "cannot exceed" test (plan-supplied tests have been wrong more than ten times).

**Fixtures** (added to `src/document/sweepFixtures.ts`, TEST-ONLY, in Task 2; b1's are unchanged):

| Name | Part | Profile |
|---|---|---|
| `twoSide(id, sA, atA, sB, atB, size?, kind?)` | — | face max, `run: { start: { side: sA, from: 'min', at: atA }, end: { side: sB, from: 'min', at: atB } }` |
| `stopOnCorner(kind?, size?)` | `topCorners(2)` | stopped on the front (`{across:'width', from:'min'}`) from 1.1 (on the min-u corner arc, mid-chord) to 30 |
| `stopOnArch` | `apronArch`'s part | roundover 1/4, stopped on the arched side from 10 to 20 (both on the arch) |
| `stopOnNotch` | `notchEdge`'s part | roundover 3/8, stopped from 14.5 (on the notch) to 25 |
| `bowFront` | 30 × 5 × 3/4, `bowCurve({through:'thickness', along:'length', side:'min', span:30, rise:0.5})` | roundover 1/4, stopped 5 to 25 |
| `frontAndEnds(kind?, size?)` | `topCorners(2)` | `twoSide('p1', {across:'length', from:'min'}, 4, {across:'length', from:'max'}, 4)` |
| `twoSideSharp` | 30 × 10 × 3/4, no curves | `twoSide('p1', {across:'width', from:'min'}, 20, {across:'length', from:'max'}, 5)` (round a SHARP corner: R6's mitre) |
| `chiralTwoSide(posture)` | `chiralCurved(posture)` | `twoSide('p1', {across:'length', from:'max'}, 3, {across:'width', from:'max'}, 14)` (round its 1" corner) |

## Review Focus

1. **A saved a2 stop on a turned path** (Q10): it follows when the bit fits; when it does not, every reader equals a2's output;
   beside a B10 End to end, both build exactly as on b1. Nothing vanishes. Task 3 pins all three with `fingerprint` hashes
   taken on `dc49b01`.
2. **A two-side run on a mirrored or turned copy** (inv 44, Q20): the world wood is the mirror image of the original's and the
   words name the mirrored sides. Task 2 pins the path, Task 4 the wood (`chiralTwoSide`, `mirrorPart`, through thickness).
3. **A curve edit or resize that moves a station across a tangent point:** the run changes builder (swept ↔ a2) with no jump in
   wood; a Curves edit that ADDS a fault to the stop is refused, one that only re-routes it is accepted. Task 4 pins the volume
   continuity, Task 9 the Curves refusal and acceptance.
4. **A hole beside a curved run-out** (P14 on a curve): refused when it would meet the run-out's reach along the stop's chord,
   allowed once clear. Task 5 pins both sides of the boundary, with a mutation.
5. **Changing Start's side or the Stop side in the row** (Q26): a fitting number is kept, an unfitting one re-seeded, equal
   sides make a canonical one-side run, Face swaps a two-side run's ends, one undo entry each. Task 9 pins each.

---

### Task 1: The probe (throwaway): a run-out on a curve, and a two-side path

**Files:**
- Create: `docs/superpowers/plans/b2-probe/probe.ts.txt`, `docs/superpowers/plans/b2-probe/results.txt`
- Read: `src/document/sweep.ts` (`sweptPlan` :170-203, `buildPieces` :233-301), `src/document/skeleton.ts` (`planChain`
  :79-118), `src/document/runout.ts` (`runoutPieces` :90-152), `docs/superpowers/plans/b1-probe/probe.ts.txt` (its method)

**Interfaces:** none (no product code).

- [ ] **Step 1: Write the probe.** Save this as `docs/superpowers/plans/b2-probe/probe.ts.txt`. A planning smoke run executed
  it on `6e32533`: the full run on the text before one cosmetic edit (the `frame` helper inside `build`), and only case G
  re-run on this exact text:

```ts
// THROWAWAY probe (profile runs chunk b2, Task 1; spec §4.2 (b2), B2, B3, B6): a STOP on a turned path. The swept band is
// b1's construction (planChain → pathSkeleton → band × kept section, plus the rest of the outline) fed a HAND-MADE path that
// ends at a station on any outline chord; the run-out beyond each station is the cutter revolved about the bit's axis
// BEARING outside the station's chord along its outward normal, bounded by the plane across the chord (the forward half):
// a2's inscribed sectors, written in a general plan frame (F forward, N into the wood). Not product code; run with
// `npx tsx probe.ts [case prefix]` from a scratch copy (rename .txt → .ts). Product modules are imported, never changed.
import { createBoard } from '/home/alec/docker/sloyd/src/document/document';
import type { Board, CurveCut, ProfileCut, ProfileSide } from '/home/alec/docker/sloyd/src/document/types';
import { boardBodies, bodyEdges, bodyVolume, clipConvex, type Body, type BodyFace } from '/home/alec/docker/sloyd/src/document/bodies';
import { archCurve, bowCurve, cornerCurve, convexPieces, inPolygonClosed, twiceArea, CURVE_SEGMENTS_MAX, CURVE_TOLERANCE, type P2, type ViewCurve } from '/home/alec/docker/sloyd/src/document/curves';
import { faceOutline, sideStretch, type FaceOutline, type ProfilePath, type PathEnd } from '/home/alec/docker/sloyd/src/document/profilePath';
import { leftNormal, pathSkeleton, planChain, tidy } from '/home/alec/docker/sloyd/src/document/skeleton';
import { bandReach, keptSection, oneSideCurve } from '/home/alec/docker/sloyd/src/document/sweep';
import { outlineRun, profileSection, runoutPieces, sectionFrame, BEARING } from '/home/alec/docker/sloyd/src/document/runout';
import { bodyMesh } from '/home/alec/docker/sloyd/src/viewport/grainTiling';
import { appendFileSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';

type V3 = [number, number, number];
type H = { n: V3; d: number };
const OUT = process.env.OUT ?? './results.txt';   // run from the scratch copy's directory
const log = (s: string) => { console.log(s); appendFileSync(OUT, s + '\n'); };
const deepFreeze = <T,>(o: T): T => { if (typeof o === 'object' && o !== null && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };
const NOHOLES: never[] = Object.freeze([]) as never[];
const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const dot = (a: P2, b: P2) => a[0] * b[0] + a[1] * b[1];
const len = (a: P2) => Math.hypot(a[0], a[1]);
const unit = (a: P2): P2 => { const l = len(a); return [a[0] / l, a[1] / l]; };
const dot3 = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const distSeg = (q: P2, a: P2, b: P2) => { const d = sub(b, a); const t = Math.max(0, Math.min(1, dot(sub(q, a), d) / dot(d, d))); return len(sub(q, [a[0] + t * d[0], a[1] + t * d[1]])); };
const clip2 = (poly: readonly P2[], n: P2, d: number): P2[] => {
  const out: P2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!, ga = dot(n, a) + d, gb = dot(n, b) + d;
    if (ga >= 0) out.push(a);
    if (ga * gb < 0) { const t = ga / (ga - gb); out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); }
  }
  return out;
};
const minOf9 = (f: () => void) => { for (let i = 0; i < 3; i++) f(); const ts: number[] = []; for (let i = 0; i < 9; i++) { const t0 = performance.now(); f(); ts.push(performance.now() - t0); } return Math.min(...ts); };

// ---------- the path: a station is a point on its side's stretch at run coordinate x (B2), on the MODEL chords ----------
interface Station { k: number; t: number; at: P2 }
const runAxis = (s: ProfileSide) => (s.across === 'width' ? 0 : 1);
function stationOn(board: Board, o: FaceOutline, side: ProfileSide, x: number): Station {
  const s = sideStretch(board, o, side);
  if (!s) throw new Error('no stretch');
  const n = o.chords.length, kk = runAxis(side);
  for (let i = s.from; ; i = (i + 1) % n) {
    const c = o.chords[i]!;
    const xa = c.a[kk]!, xb = c.b[kk]!;
    if (xa !== xb && (x - xa) * (x - xb) <= 0) {
      const t = (x - xa) / (xb - xa);
      return { k: i, t, at: t === 0 ? c.a : t === 1 ? c.b : [c.a[0] + t * (c.b[0] - c.a[0]), c.a[1] + t * (c.b[1] - c.a[1])] };
    }
    if (i === s.to) break;
  }
  throw new Error(`station ${x} not on the stretch`);
}
/** A start on a chord's far end is the next chord's start; an end on a chord's near end is the previous chord's end. */
function normalStation(o: FaceOutline, st: Station, start: boolean): Station {
  const n = o.chords.length;
  if (start && st.t === 1) return { k: (st.k + 1) % n, t: 0, at: o.chords[(st.k + 1) % n]!.a };
  if (!start && st.t === 0) return { k: (st.k - 1 + n) % n, t: 1, at: o.chords[(st.k - 1 + n) % n]!.b };
  return st;
}
/** A chord's unit travel direction (plan CCW). */
const dirOf = (o: FaceOutline, k: number) => unit(sub(o.chords[k]!.b, o.chords[k]!.a));
/** The CCW path from station s to station e (face max), as b1's ProfilePath: both ends `station`, tangent along their own
 *  chord away from the run (planChain's station ray is then the chord's own normal: the band ends square to the chord). */
function stopPath(o: FaceOutline, s: Station, e: Station, sideS: ProfileSide, sideE: ProfileSide): ProfilePath {
  const n = o.chords.length;
  const cover: { chord: number; t0: number; t1: number }[] = [];
  if (s.k === e.k && s.t < e.t) cover.push({ chord: s.k, t0: s.t, t1: e.t });
  else {
    if (s.t < 1) cover.push({ chord: s.k, t0: s.t, t1: 1 });
    for (let i = (s.k + 1) % n; i !== e.k; i = (i + 1) % n) cover.push({ chord: i, t0: 0, t1: 1 });
    if (e.t > 0) cover.push({ chord: e.k, t0: 0, t1: e.t });
  }
  const at = (c: { chord: number; t0: number; t1: number }, t: number): P2 => { const ch = o.chords[c.chord]!; return t === 0 ? ch.a : t === 1 ? ch.b : [ch.a[0] + t * (ch.b[0] - ch.a[0]), ch.a[1] + t * (ch.b[1] - ch.a[1])]; };
  const chords = cover.map((c) => ({ ...o.chords[c.chord]!, a: at(c, c.t0), b: at(c, c.t1) }));
  const u0 = dirOf(o, cover[0]!.chord), u1 = dirOf(o, cover[cover.length - 1]!.chord);
  const ends: [PathEnd, PathEnd] = [
    { kind: 'station', at: chords[0]!.a, tangent: [-u0[0] + 0, -u0[1] + 0], side: sideS },
    { kind: 'station', at: chords[chords.length - 1]!.b, tangent: u1, side: sideE },
  ];
  return { chords, loop: false, ends, cover };
}
/** The end-chord zone (planning question Q13): the distance from a station to the next path vertex inward under which the
 *  skeleton swallows the end piece — reach · tan(φ/2), φ the turn at that vertex (0 when the turn is concave). */
function zone(o: FaceOutline, s: Station, start: boolean, reach: number): { piece: number; limit: number } {
  const n = o.chords.length, c = o.chords[s.k]!;
  const l = len(sub(c.b, c.a));
  const piece = start ? (1 - s.t) * l : s.t * l;
  const other = start ? (s.k + 1) % n : (s.k - 1 + n) % n;
  const u = dirOf(o, s.k), w = dirOf(o, other);
  const [a, b] = start ? [u, w] : [w, u];
  const turn = Math.atan2(a[0] * b[1] - a[1] * b[0], dot(a, b));   // > 0: a left (convex, wood-side) turn
  return { piece, limit: turn > 0 ? reach * Math.tan(turn / 2) : 0 };
}
/** Snap-back (build only): a station inside the zone is built at that vertex — the run shortened, never lengthened. */
function snapped(o: FaceOutline, s: Station, start: boolean): Station {
  const n = o.chords.length;
  return start ? { k: (s.k + 1) % n, t: 0, at: o.chords[(s.k + 1) % n]!.a } : { k: (s.k - 1 + n) % n, t: 1, at: o.chords[(s.k - 1 + n) % n]!.b };
}

// ---------- the band: b1's construction (sweep.ts' sweptPlan + buildPieces, tags dropped), from today's exports ----------
function bandPieces(board: Board, p: ProfileCut, path: ProfilePath): { planes: H[]; bb: number[] }[] | null {
  const o = faceOutline(board)!;
  const chain = planChain(board, path, 'max');
  if (!chain) return null;
  const sec = keptSection(board, p);
  const sk = pathSkeleton(chain.chords, false, bandReach(sec), chain.rays);
  if (!sk) return null;   // an end chord swallowed (the zone)
  let faces = sk.faces, wave = sk.wave;
  for (const st of chain.stations) {
    faces = faces.map((f) => (f.length >= 3 ? tidy(clip2(f, st.n, st.d)) : f));
    const w: P2[] = [];
    for (let i = 0; i < wave.length; i++) {
      const a = wave[i]!, g = dot(st.n, a) + st.d;
      if (g >= 0) w.push(a);
      if (i + 1 < wave.length) { const b = wave[i + 1]!, gb = dot(st.n, b) + st.d; if (g * gb < 0) { const t = g / (g - gb); w.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); } }
    }
    wave = w;
  }
  const m = o.chords.length, c0 = path.cover[0]!, c1 = path.cover[path.cover.length - 1]!;
  const rest: P2[] = [];
  const push = (q: P2) => { if (!rest.length || len(sub(rest[rest.length - 1]!, q)) > 1e-12) rest.push(q); };
  push(chain.chords[chain.chords.length - 1]!.b);
  push(o.chords[c1.chord]!.b);
  for (let k = (c1.chord + 1) % m; k !== c0.chord; k = (k + 1) % m) push(o.chords[k]!.b);
  push(o.chords[c0.chord]!.a);
  push(chain.chords[0]!.a);
  for (const q of wave) push(q);
  if (rest.length > 1 && len(sub(rest[0]!, rest[rest.length - 1]!)) <= 1e-12) rest.pop();
  const f = sectionFrame(board, oneSideCurve(p));
  const prism = (poly: readonly P2[]): H[] => poly.flatMap((a, i) => {
    const b = poly[(i + 1) % poly.length]!, l = len(sub(b, a));
    if (l < 1e-14) return [];
    const nn: V3 = [-(b[1] - a[1]) / l, (b[0] - a[0]) / l, 0];
    return [{ n: nn, d: -(nn[0] * a[0] + nn[1] * a[1]) }];
  });
  const bb = (poly: readonly P2[]) => [Math.min(...poly.map((q) => q[0])), Math.min(...poly.map((q) => q[1])), Math.max(...poly.map((q) => q[0])), Math.max(...poly.map((q) => q[1]))];
  const out: { planes: H[]; bb: number[] }[] = [];
  faces.forEach((face, i) => {
    if (face.length < 3 || twiceArea(face) / 2 < 1e-14) return;
    const ch = chain.chords[i]!, nIn = leftNormal(ch.a, ch.b), nP = dot(nIn, ch.a);
    for (const fp of convexPieces(face, face.map(() => false)).map((x) => x.pts)) {
      for (const kp of sec.pieces) {
        const planes = prism(fp);
        kp.pts.forEach((a, j) => {
          const b = kp.pts[(j + 1) % kp.pts.length]!, l = len(sub(b, a));
          if (l < 1e-14) return;
          const ns = -(b[1] - a[1]) / l, nt = (b[0] - a[0]) / l, c = -(ns * a[0] + nt * a[1]);
          planes.push({ n: [ns * nIn[0], ns * nIn[1], nt * f.vIn], d: c - ns * nP - nt * f.vIn * f.vFace });
        });
        out.push({ planes, bb: bb(fp) });
      }
    }
  });
  const r = tidy(rest);
  if (r.length >= 3 && twiceArea(r) / 2 > 1e-14) for (const rp of convexPieces(r, r.map(() => false))) out.push({ planes: prism(rp.pts), bb: bb(rp.pts) });
  return out;
}

// ---------- the run-out on a curve (spec §4.2 (b2)): a2's inscribed sectors in a general plan frame ----------
function sectors(r: number): number {
  const step = CURVE_TOLERANCE >= 2 * r ? Math.PI : 2 * Math.acos(1 - CURVE_TOLERANCE / r);
  return Math.min(CURVE_SEGMENTS_MAX, Math.max(2, Math.ceil(Math.PI / step - 1e-9)));
}
/** Waste pieces (inside: n·x + d >= 0) beyond a station at `at`: F forward (away from the run, along the station's chord),
 *  N into the wood (the chord's inward normal); the axis BEARING outside: at − BEARING·N. θ from −π/2 (out, into air) to
 *  π/2 (N, into the wood): dir(θ) = cos θ·F + sin θ·N; s = m·(x − axis)/cos h − BEARING (exact on each sector ray). */
function frameRunout(board: Board, p: ProfileCut, at: P2, F: P2, N: P2): H[][] {
  const c = oneSideCurve(p);
  const f = sectionFrame(board, c);
  const sec = profileSection(board, c);
  const pieces = convexPieces(sec.pts, sec.arc).map(({ pts }) => pts.flatMap((a, i) => {
    const b = pts[(i + 1) % pts.length]!, l = len(sub(b, a));
    if (l < 1e-14) return [];
    const ns = -(b[1] - a[1]) / l, nt = (b[0] - a[0]) / l;
    return [{ ns, nt, c: -(ns * a[0] + nt * a[1]), diagonal: outlineRun(sec.pts, a, b) === null }];
  })).map((es) => [...es.filter((e) => !e.diagonal), ...es.filter((e) => e.diagonal)]);   // a2's order: diagonals last
  const maxS = Math.max(...sec.pts.map((q) => q[0]));
  const n = sectors(BEARING + maxS);
  const axis: P2 = [at[0] - BEARING * N[0], at[1] - BEARING * N[1]];
  const dir = (th: number): P2 => [F[0] * Math.cos(th) + N[0] * Math.sin(th), F[1] * Math.cos(th) + N[1] * Math.sin(th)];
  const out: H[][] = [];
  for (let i = 0; i < n; i++) {
    const th0 = -Math.PI / 2 + (i / n) * Math.PI, th1 = -Math.PI / 2 + ((i + 1) / n) * Math.PI;
    const m = dir((th0 + th1) / 2);
    const radial = (th: number): H => { const d = dir(th); let a = -d[1], b = d[0]; if (a * m[0] + b * m[1] < 0) { a = -a; b = -b; } return { n: [a, b, 0], d: -(a * axis[0] + b * axis[1]) }; };
    const ch = Math.cos((th1 - th0) / 2), mA = dot(m, axis);
    for (const edges of pieces) {
      out.push([radial(th0), radial(th1), ...edges.map((e) => {
        const nx = (e.ns * m[0]) / ch, ny = (e.ns * m[1]) / ch, nz = e.nt * f.vIn, l = Math.hypot(nx, ny, nz);
        return { n: [nx / l, ny / l, nz / l] as V3, d: (e.c - (e.ns * mA) / ch - e.ns * BEARING - e.nt * f.vIn * f.vFace) / l };
      })]);
    }
  }
  return out;
}

// ---------- bodies: the box intersected with the band pieces (b1's sweepBodies), then each run-out subtracted ----------
const volOf = (faces: BodyFace[]) => bodyVolume({ box: null, faces });
function intersect(bodies: Body[], pieces: { planes: H[]; bb: number[] }[]): Body[] {
  const out: Body[] = [];
  for (const body of bodies) for (const pc of pieces) {
    let f = body.faces;
    for (const h of pc.planes) { f = clipConvex(f, h); if (f.length === 0) break; }
    if (f.length >= 4 && volOf(f) > 1e-12) out.push({ box: null, faces: f });
  }
  return out;
}
function subtract(bodies: Body[], pieces: H[][]): Body[] {
  let parts = bodies.map((b) => b.faces);
  for (const piece of pieces) {
    const next: BodyFace[][] = [];
    for (const part of parts) {
      if (piece.some((h) => part.every((f) => f.verts.every((q) => dot3(h.n, q) + h.d <= 1e-9)))) { next.push(part); continue; }
      let rest = part; const frags: BodyFace[][] = [];
      for (const h of piece) {
        if (rest.length === 0) break;
        const outside = clipConvex(rest, { n: [-h.n[0], -h.n[1], -h.n[2]], d: -h.d });
        if (outside.length >= 4 && volOf(outside) > 1e-12) frags.push(outside);
        rest = clipConvex(rest, h);
      }
      if (rest.length < 4 || volOf(rest) <= 1e-12) next.push(part); else next.push(...frags);
    }
    parts = next;
  }
  return parts.map((faces) => ({ box: null, faces }));
}

// ---------- the INDEPENDENT oracle (b1's sweptAirTester rule, frame-general; no construction plane) ----------
function oracle(board: Board, p: ProfileCut, path: ProfilePath, frames: { at: P2; F: P2; N: P2 }[]) {
  const pts = profileSection(board, oneSideCurve(p)).pts;
  const { reach, depth } = keptSection(board, p);
  const tau = (s: number) => {
    if (!(s >= 0 && s <= reach)) return 0;
    let best = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!, b = pts[(i + 1) % pts.length]!, lo = Math.min(a[0], b[0]), hi = Math.max(a[0], b[0]);
      if (s < lo - 1e-15 || s > hi + 1e-15) continue;
      const t = hi - lo < 1e-15 ? Math.max(a[1], b[1]) : a[1] + ((s - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
      if (t > best) best = t;
    }
    return best;
  };
  const segs = path.chords.map((c) => [c.a, c.b] as [P2, P2]);
  const outline = faceOutline(board)!.chords.map((c) => c.a);
  const axes = frames.map((fr) => ({ ...fr, axis: [fr.at[0] - BEARING * fr.N[0], fr.at[1] - BEARING * fr.N[1]] as P2 }));
  const D = (q: P2) => {
    let beyond = Infinity;
    for (const a of axes) if (dot(sub(q, a.at), a.F) > 0) beyond = Math.min(beyond, len(sub(q, a.axis)) - BEARING);
    if (beyond !== Infinity) return beyond;
    let d = Infinity; for (const [a, b] of segs) d = Math.min(d, distSeg(q, a, b));
    return d;
  };
  const tauAt = (q: P2) => { const d = D(q); return d >= 0 && d < reach ? tau(d) : 0; };
  const near = (q: P2, margin = 0.05) => segs.some(([a, b]) => distSeg(q, a, b) <= reach + margin) || axes.some((a) => len(sub(q, a.axis)) <= BEARING + reach + margin);
  return { tauAt, near, inside: (q: P2) => inPolygonClosed(outline, q), depth, reach, outline };
}
function inBodiesFn(bodies: Body[]) {
  const bs = bodies.map((b) => ({ planes: b.faces.map((f) => ({ n: f.n, d: dot3(f.n, f.verts[0]!) })),
    lo: [0, 1, 2].map((k) => Math.min(...b.faces.flatMap((f) => f.verts.map((v) => v[k]!)))), hi: [0, 1, 2].map((k) => Math.max(...b.faces.flatMap((f) => f.verts.map((v) => v[k]!)))) }));
  return (q: V3) => bs.some((b) => q.every((x, k) => x >= b.lo[k]! - 1e-12 && x <= b.hi[k]! + 1e-12) && b.planes.every((h) => dot3(h.n, q) <= h.d + 1e-12));
}
function watertight(board: Board, bodies0: Body[]) {
  const count = new Map<string, number>(); let tris = 0;
  const bodies = deepFreeze(structuredClone(bodies0));
  for (const body of bodies) {
    const q = bodyMesh(board, body, NOHOLES, bodies).positions;
    const key = (i: number) => `${q[3 * i]},${q[3 * i + 1]},${q[3 * i + 2]}`;
    for (let t = 0; t < q.length / 9; t++) { tris++; const k = [key(3 * t), key(3 * t + 1), key(3 * t + 2)]; for (let e = 0; e < 3; e++) { const ed = `${k[e]}|${k[(e + 1) % 3]}`; count.set(ed, (count.get(ed) ?? 0) + 1); } }
  }
  let unmatched = 0; for (const [ed, n] of count) { const [a, b] = ed.split('|'); if ((count.get(`${b}|${a}`) ?? 0) !== n) unmatched++; }
  return { tris, unmatched };
}

// ---------- cases ----------
const side = (across: 'length' | 'width', from: 'min' | 'max'): ProfileSide => ({ across, from });
const prof = (kind: ProfileCut['kind'], size: number): ProfileCut => ({ id: 'p', face: 'max', kind, size, ...(kind === 'thumbnail' ? { depth: 0.25 } : { fillet: kind === 'bead' ? 1 / 16 : 0 }), facing: 'face', run: { loop: true } });
const corners = (r: number): CurveCut[] => (['min', 'max'] as const).flatMap((u) => (['min', 'max'] as const).map((v) => ({ id: `c${u}${v}`, ...cornerCurve({ through: 'thickness', uFrom: u, vFrom: v, radius: r }) })));
const top = (r: number) => ({ length: 36, width: 20, thickness: 0.75, curves: corners(r) });
const apron = (c: Omit<CurveCut, 'id'>) => ({ length: 30, width: 5, thickness: 0.75, curves: [{ id: 'c1', ...c }] });
const ARCH = archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1.25 });
const NOTCH = archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 14, span: 2, rise: 1 });
const BOW = bowCurve({ through: 'thickness', along: 'length', side: 'min', span: 30, rise: 0.5 });
interface Case { name: string; dims: { length: number; width: number; thickness: number; curves: CurveCut[] }; p: ProfileCut; s: [ProfileSide, number | 'vertex' | 'zone']; e: [ProfileSide, number]; snap?: boolean }
const front = side('width', 'min');
const cases: Case[] = [
  { name: 'A roundover 1/4, stop on a convex 2" corner arc (u 1.1, mid-chord) to the front at 30', dims: top(2), p: prof('roundover', 0.25), s: [front, 1.1], e: [front, 30] },
  { name: 'B cove 3/8, the same', dims: top(2), p: prof('cove', 0.375), s: [front, 1.1], e: [front, 30] },
  { name: 'C roundover 1/4, the stop ON a chord vertex of the corner arc', dims: top(2), p: prof('roundover', 0.25), s: [front, 'vertex'], e: [front, 30] },
  { name: 'D1 roundover 1/4, the stop inside the end-chord zone, truncated', dims: top(2), p: prof('roundover', 0.25), s: [front, 'zone'], e: [front, 30] },
  { name: 'D2 roundover 1/4, the stop inside the end-chord zone, snapped back', dims: top(2), p: prof('roundover', 0.25), s: [front, 'zone'], e: [front, 30], snap: true },
  { name: 'E roundover 1/4, both stops on the concave arch (10, 20)', dims: apron(ARCH), p: prof('roundover', 0.25), s: [front, 10], e: [front, 20] },
  { name: 'F roundover 3/8, a stop on the concave half-round notch (14.5) to 25', dims: apron(NOTCH), p: prof('roundover', 0.375), s: [front, 14.5], e: [front, 25] },
  { name: 'G roundover 1/4, both stops on a convex bow (5, 25)', dims: apron(BOW), p: prof('roundover', 0.25), s: [front, 5], e: [front, 25] },
  { name: 'H roundover 1/4, two sides: the length min end at 4 round the front to the length max end at 4', dims: top(2), p: prof('roundover', 0.25), s: [side('length', 'min'), 4], e: [side('length', 'max'), 4] },
  { name: 'I cove 3/8, two sides, the same', dims: top(2), p: prof('cove', 0.375), s: [side('length', 'min'), 4], e: [side('length', 'max'), 4] },
];

writeFileSync(OUT, '');
log(`load: ${loadavg().map((x) => x.toFixed(2)).join(' ')}`);
const only = process.argv[2];
for (const cs of cases) {
  if (only && !cs.name.startsWith(only)) continue;
  log(`\n## ${cs.name}`);
  const make = (k = 1) => createBoard({ ...cs.dims, length: cs.dims.length * k });
  const board = make();
  const o = faceOutline(board)!;
  const { reach } = keptSection(board, cs.p);
  const T = board.thickness;
  // Resolve the start station.
  let s0: Station;
  if (cs.s[1] === 'vertex' || cs.s[1] === 'zone') {
    // The corner arc's middle chord vertex at the front's min end (the 2" corner: 12 chords, vertex 6 at 45°).
    const arc = o.chords.map((c, i) => ({ c, i })).filter(({ c }) => c.curve === 'cminmin');
    const v = arc[Math.floor(arc.length / 2)]!;
    if (cs.s[1] === 'vertex') s0 = { k: v.i, t: 0, at: v.c.a };
    else {
      const prev = (v.i - 1 + o.chords.length) % o.chords.length;
      const z = zone(o, { k: prev, t: 0, at: o.chords[prev]!.a }, true, reach);
      const l = len(sub(o.chords[prev]!.b, o.chords[prev]!.a));
      const t = 1 - (0.5 * z.limit) / l;   // half the zone short of the vertex
      const c = o.chords[prev]!;
      s0 = { k: prev, t, at: [c.a[0] + t * (c.b[0] - c.a[0]), c.a[1] + t * (c.b[1] - c.a[1])] };
    }
  } else s0 = normalStation(o, stationOn(board, o, cs.s[0], cs.s[1]), true);
  const e0 = normalStation(o, stationOn(board, o, cs.e[0], cs.e[1]), false);
  const zs = zone(o, s0, true, reach), ze = zone(o, e0, false, reach);
  log(`  stations: start chord ${s0.k} t ${s0.t.toFixed(6)} at (${s0.at.map((x) => x.toFixed(4))}) zone ${zs.piece.toFixed(5)} vs limit ${zs.limit.toFixed(5)}; end chord ${e0.k} t ${e0.t.toFixed(6)} zone ${ze.piece.toFixed(5)} vs limit ${ze.limit.toFixed(5)}`);
  const build = (b: Board, ol: FaceOutline, s: Station, e: Station) => {
    const sb = cs.snap && zone(ol, s, true, reach).piece < zone(ol, s, true, reach).limit ? snapped(ol, s, true) : s;
    const eb = cs.snap && zone(ol, e, false, reach).piece < zone(ol, e, false, reach).limit ? snapped(ol, e, false) : e;
    const path = stopPath(ol, sb, eb, cs.s[0], cs.e[0]);
    const pieces = bandPieces(b, cs.p, path);
    if (!pieces) return null;
    const frame = (st: Station, start: boolean) => { const u = dirOf(ol, st.k); return { at: st.at, F: (start ? [-u[0], -u[1]] : u) as P2, N: leftNormal(ol.chords[st.k]!.a, ol.chords[st.k]!.b) }; };
    const frames = [frame(sb, true), frame(eb, false)];
    let bodies = intersect(boardBodies(createBoard({ length: b.length, width: b.width, thickness: b.thickness })), pieces);
    for (const fr of frames) bodies = subtract(bodies, frameRunout(b, cs.p, fr.at, fr.F, fr.N));
    return { bodies, path, frames, pieces: pieces.length };
  };
  const built = build(board, o, s0, e0);
  if (!built) { log('  SKELETON NULL: the end chord was swallowed (expected only for D1)'); continue; }
  const { bodies } = built;
  // The oracle reads the TRUE (typed) stations, never the snapped ones.
  const truth = stopPath(o, s0, e0, cs.s[0], cs.e[0]);
  const tf = (st: Station, start: boolean) => { const u = dirOf(o, st.k); return { at: st.at, F: (start ? [-u[0], -u[1]] : u) as P2, N: leftNormal(o.chords[st.k]!.a, o.chords[st.k]!.b) }; };
  const orc = oracle(board, cs.p, truth, [tf(s0, true), tf(e0, false)]);
  const v = bodies.reduce((a, b) => a + bodyVolume(b), 0);
  const ov = (seed: number) => {
    let rnd = seed; const rand = () => { rnd = (rnd * 1103515245 + 12345) % 2147483648; return rnd / 2147483648; };
    const h = 0.004, C = 0.256; let waste = 0;
    for (let cx = 0; cx < board.length; cx += C) for (let cy = 0; cy < board.width; cy += C) {
      if (!orc.near([cx + C / 2, cy + C / 2], 0.05 + C)) continue;   // a cell holding waste has its centre within reach + C·√2/2
      const nx = Math.round(C / h);   // a whole number of samples per cell (C / h = 62.5 double-counted a strip)
      for (let i = 0; i < nx; i++) for (let j = 0; j < nx; j++) {
        const q: P2 = [cx + (i + rand()) * h, cy + (j + rand()) * h];
        if (orc.inside(q)) waste += orc.tauAt(q) * h * h;
      }
    }
    return (twiceArea(orc.outline) / 2) * T - waste;
  };
  const o1 = ov(1), o2 = ov(99), om = (o1 + o2) / 2, wv = (twiceArea(orc.outline) / 2) * T - om;
  log(`  bodies ${bodies.length} (pieces ${built.pieces}), all convex ${bodies.every((b) => b.faces.every((f) => b.faces.every((g) => g.verts.every((q) => dot3(f.n, q) <= dot3(f.n, f.verts[0]!) + 1e-7))))}`);
  log(`  volume ${v.toFixed(5)} oracle ${om.toFixed(5)} (seed spread ${Math.abs(o1 - o2).toExponential(1)}) err ${(v - om).toExponential(2)} = ${((100 * (v - om)) / wv).toFixed(3)}% of the waste (${wv.toFixed(4)})`);
  // Pointwise: 50k points near the path and the run-outs; a mismatch's distance from the nearer TRUE station plane.
  const inB = inBodiesFn(bodies);
  let rnd = 7; const rand = () => { rnd = (rnd * 1103515245 + 12345) % 2147483648; return rnd / 2147483648; };
  let tested = 0, bad = 0, far = 0;
  while (tested < 50000) {
    const q: P2 = [rand() * board.length, rand() * board.width];
    if (!orc.near(q) || !orc.inside(q)) continue;
    const t = rand() * orc.depth * 1.2; tested++;
    if ((t > orc.tauAt(q)) !== inB([q[0], q[1], T - t])) {
      bad++;
      const dPlane = Math.min(...[tf(s0, true), tf(e0, false)].map((fr) => Math.abs(dot(sub(q, fr.at), fr.F))));
      far = Math.max(far, dPlane);
    }
  }
  log(`  pointwise: ${bad}/${tested} misclassified; the farthest from a true station plane ${far.toExponential(2)}"`);
  // The step at each BUILT station: the waste width along N just behind and just beyond the plane, at 60 depths.
  for (const [i, fr] of built.frames.entries()) {
    let step = 0, at = 0;
    for (let t = 0.002; t < orc.depth; t += orc.depth / 60) {
      const w = (sgn: number) => {
        const q = (s: number): V3 => [fr.at[0] + sgn * 1e-6 * fr.F[0] + s * fr.N[0], fr.at[1] + sgn * 1e-6 * fr.F[1] + s * fr.N[1], T - t];
        let lo = 0, hi = reach + 0.01; if (!inB(q(hi))) return NaN;
        for (let k = 0; k < 50; k++) { const mid = (lo + hi) / 2; if (inB(q(mid))) hi = mid; else lo = mid; }
        return hi;
      };
      const d = Math.abs(w(-1) - w(1));
      if (d > step) { step = d; at = t; }
    }
    log(`  station ${i === 0 ? 'start' : 'end'}: max step across the station plane ${step.toExponential(2)}" (t ${at.toFixed(3)})`);
  }
  // a2 equivalence: a station on a STRAIGHT side, the frame run-out against a2's runoutPieces on the same span.
  for (const [i, fr] of built.frames.entries()) {
    const ch = o.chords[(i === 0 ? s0 : e0).k]!;
    if (ch.curve !== undefined) continue;
    const sd = i === 0 ? cs.s[0] : cs.e[0];
    const c = oneSideCurve(cs.p, sd);
    const k = c.through === 'length' ? 0 : 1, x = fr.at[k]!;
    const span = fr.F[k]! > 0 ? { lo: 0, hi: x, stopLo: false, stopHi: true } : { lo: x, hi: board[c.through], stopLo: true, stopHi: false };
    const a2 = runoutPieces(board, { ...c, span } as ViewCurve).map((x) => x.planes);
    const mine = frameRunout(board, cs.p, fr.at, fr.F, fr.N);
    let worst = a2.length === mine.length ? 0 : Infinity;
    if (worst === 0) a2.forEach((pc, j) => pc.forEach((h, q) => { const g = mine[j]![q]!; worst = Math.max(worst, Math.hypot(h.n[0] - g.n[0], h.n[1] - g.n[1], h.n[2] - g.n[2]), Math.abs(h.d - g.d)); }));
    log(`  a2 equivalence at the ${i === 0 ? 'start' : 'end'} (a straight side): ${a2.length} pieces, worst plane difference ${worst.toExponential(2)}`);
  }
  let tick = 0;
  const tB = minOf9(() => { tick++; const b = make(1 + tick * 1e-9); const ol = faceOutline(b)!; build(b, ol, normalStation(ol, stationOn(b, ol, cs.s[0], typeof cs.s[1] === 'number' ? cs.s[1] : s0.at[0]), true), normalStation(ol, stationOn(b, ol, cs.e[0], cs.e[1]), false)); });
  let raw: unknown[] = [];
  const tE = minOf9(() => { raw = bodyEdges(bodies); });
  const fb = deepFreeze(structuredClone(bodies));
  const tM = minOf9(() => { for (const body of fb) bodyMesh(board, body, NOHOLES, fb); });
  const wt = watertight(board, bodies);
  log(`  ms (min of 9): bodies ${tB.toFixed(1)}, +bodyEdges ${tE.toFixed(1)} [${raw.length} raw], mesh ${tM.toFixed(1)} (tris ${wt.tris}, unmatched edges ${wt.unmatched}); TOTAL ≈ ${(tB + tE + tM).toFixed(1)} ms`);
}
log(`load: ${loadavg().map((x) => x.toFixed(2)).join(' ')}`);
```

- [ ] **Step 2: Run it** with the Playwright browser CLOSED:
  `mkdir -p <scratchpad>/b2-probe && cp docs/superpowers/plans/b2-probe/probe.ts.txt <scratchpad>/b2-probe/probe.ts && cd <scratchpad>/b2-probe && OUT=./results.txt npx --yes tsx probe.ts`
  (about 5 minutes; the volume integration dominates). Copy `results.txt` to `docs/superpowers/plans/b2-probe/results.txt`.
  The planning smoke run (6e32533, load ~1) read, per case: volume error 2.9e-4 (A), 1.33e-3 (B), 3.0e-4 (C), 7.6e-4 (D2),
  3.0e-4 (E), 4.2e-4 (F), 7.9e-5 (G), 3.5e-4 (H), 1.38e-3 in³ (I); 0/50000 misclassified everywhere; every step ≤ 1.32e-7";
  D1 SKELETON NULL; a2 equivalence ≤ 6.1e-13; 0 unmatched edges; TOTALs as in Global Constraints. Your numbers govern.

- [ ] **Step 3: Apply the decision rules**, pre-written here, and append the verdict of each to `results.txt` under
  `## Verdicts`:
  - **R-a Wood.** Every case but D1: 0/50000 misclassified; all bodies convex; |error| ≤ 1e-3 in³ + 6e-4 in³ per station of a
    multi-piece kind (a cove, an ogee, a bead: a2's shipped sector chord approximation, b1 Task 3's ruling). A failure stops
    the round: report the case to the controller before Task 2 (the construction or the frame is wrong).
  - **R-b Step.** Every station's step ≤ 1e-6" (the probe's own 1e-6 offset reads ~1.3e-7). A failure means Q12's frame is
    wrong: stop and report.
  - **R-c Zone.** D1 reads `SKELETON NULL` and D2 builds with 0 mismatches (the snapped station is up to the zone's limit
    from the typed one). If D2 mismatches, or D1 builds, Q13's rule is wrong for this geometry: stop and report.
  - **R-d a2 equivalence.** On a straight side the frame run-out equals a2's to ≤ 1e-12 per plane coefficient. Not bytes:
    that is why b1's B1 stations keep a2's code (Global Constraints).
  - **R-e Watertight.** 0 unmatched edges in every case; otherwise record it for Task 6 (it is the mesh's to fix, not the
    construction's).
  - **R-f Perf.** Each case's guard is 40 ms when TOTAL × 1.8 ≤ 40 (the product read 1.1–1.8× b1's probe), else
    `ceil(TOTAL × 1.8 × 1.25)`, recorded for chunk c and reported to the controller before Task 6.
- [ ] **Step 4: Commit** (docs only): `git add docs/superpowers/plans/b2-probe && git commit -m "probe: a run-out on a curve and a two-side path (profile runs b2)"`

---

### Task 2: `profilePath.ts` — stations on a stretch, stop ends, two-side paths, Q9's swept

**Files:**
- Modify: `src/document/profilePath.ts` (`PathEnd` :44, `profilePath` :384-451, `builtPath` :371, `isSwept` :459-468, the
  End to end branch's end handling :409-439 extracted), `src/document/skeleton.ts` (`StationClip` :30, `planChain` :94-117),
  `src/document/sweepFixtures.ts`
- Test: `src/document/profilePath.test.ts` (b2 block; `:58` and `:248` changed by design)

**Interfaces:**
- Consumes: `sideStretch`, `faceOutline`, `mitre`, `stationExtension`, `throughRay` (this file); `endPos`, `reachDepth`,
  `runDim` (`profiles.ts`).
- Produces:
  ```ts
  // profilePath.ts
  export type PathEnd = { kind: 'through'; ray: P2 } | { kind: 'station'; at: P2; tangent: P2; side: ProfileSide }
    | { kind: 'mitre'; at: P2; ray: P2 }
    /** b2: a user's Start or Stop (B2). Plan vectors: `tangent` along the station's MODEL chord away from the run, `normal`
     *  that chord's plan inward normal (into the wood, the plan-CCW left normal). */
    | { kind: 'stop'; at: P2; tangent: P2; normal: P2; side: ProfileSide };
  export interface StationPoint { chord: number; t: number; at: P2 }
  export function stationPoint(board: Pick<Board, Dimension>, outline: FaceOutline, side: ProfileSide, x: number): StationPoint | null;
  export function stopZone(outline: FaceOutline, sp: StationPoint, first: boolean, reach: number): number;   // Q13's limit
  export function throughConsistent(p: ProfileCut): boolean;                                                  // Q17
  export function profilePath(board: PathBoard, p: ProfileCut, opts?: { build?: boolean; snap?: boolean }): ProfilePath | null;
  export function builtPath(board: PathBoard, p: ProfileCut): ProfilePath | null;    // { build: true }: ε and the zone
  export function judgedPath(board: PathBoard, p: ProfileCut): ProfilePath | null;   // { snap: true }: the zone, never ε
  // skeleton.ts
  export interface StationClip { n: P2; d: number; at: P2; tangent: P2; side: ProfileSide; stop?: { N: P2; end: 'lo' | 'hi' } }
  ```

- [ ] **Step 1: Fixtures.** Append to `sweepFixtures.ts`:
  ```ts
  import { bowCurve } from './curves';
  import { chiralCurved } from './turnFixtures';
  import { faceOutline } from './profilePath';
  import type { Posture } from './types';
  export const twoSide = (id: string, sA: ProfileSide, atA: number, sB: ProfileSide, atB: number, size = 0.25, kind: ProfileCut['kind'] = 'roundover'): ProfileCut =>
    ({ ...endToEnd(id, sA, size, kind), run: { start: { side: { ...sA }, from: 'min', at: atA }, end: { side: { ...sB }, from: 'min', at: atB } } });
  const stoppedAs = (id: string, s: ProfileSide, lo: number, hi: number, size: number, kind: ProfileCut['kind']): ProfileCut =>
    ({ ...endToEnd(id, s, size, kind), run: { start: { side: s, from: 'min', at: lo }, end: { side: { ...s }, from: 'min', at: hi } } });
  export const stopOnCorner = (kind: ProfileCut['kind'] = 'roundover', size = 0.25): Board => topCorners(2, stoppedAs('p1', side('width', 'min'), 1.1, 30, size, kind));
  export const stopOnArch: Board = { ...apronArch, profiles: [stopped('p1', side('width', 'min'), 10, 20)] };
  export const stopOnNotch: Board = { ...notchEdge, profiles: [stoppedAs('p1', side('width', 'min'), 14.5, 25, 0.375, 'roundover')] };
  export const bowFront: Board = createBoard({ length: 30, width: 5, thickness: 0.75,
    curves: [{ id: 'c1', ...bowCurve({ through: 'thickness', along: 'length', side: 'min', span: 30, rise: 0.5 }) }],
    profiles: [stopped('p1', side('width', 'min'), 5, 25)] });
  export const frontAndEnds = (kind: ProfileCut['kind'] = 'roundover', size = 0.25): Board =>
    topCorners(2, twoSide('p1', side('length', 'min'), 4, side('length', 'max'), 4, size, kind));
  export const twoSideSharp: Board = createBoard({ length: 30, width: 10, thickness: 0.75,
    profiles: [twoSide('p1', side('width', 'min'), 20, side('length', 'max'), 5)] });
  export const chiralTwoSide = (posture: Posture): Board =>
    ({ ...chiralCurved(posture), profiles: [twoSide('p1', side('length', 'max'), 3, side('width', 'max'), 14)] });
  /** Q13: a front stop half the end-chord zone short of the 2" corner arc's 45° chord vertex (12 chords: the turn there is
   *  π/24, the zone 0.25·tan(π/48)), to 30". Read off the outline, so it is exactly where the zone says. */
  export const zoneStop = (): Board => {
    const b = topCorners(2), o = faceOutline(b)!;
    const arc = o.chords.filter((c) => c.curve === 'cminmin'), c = arc[5]!;
    const l = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]);
    const t = 1 - (0.5 * 0.25 * Math.tan(Math.PI / 48)) / l;
    return topCorners(2, stopped('p1', side('width', 'min'), c.a[0] + t * (c.b[0] - c.a[0]), 30));
  };
  ```
  `turnFixtures.ts` is itself test-only and imports no test module, so this import is safe. Check `chiralCurved`'s corner
  `k2` (radius 1, max/max) lies between the length max end and the width max side.

- [ ] **Step 2: Write the failing tests** (`profilePath.test.ts`, a new `describe('b2: stops and two-side paths')`):
  ```ts
  const W_MIN = { across: 'width', from: 'min' } as const, L_MIN = { across: 'length', from: 'min' } as const, L_MAX = { across: 'length', from: 'max' } as const;
  it('stationPoint: a station on a corner arc is the model chord point at its run coordinate (B2)', () => {
    const b = stopOnCorner(), o = faceOutline(b)!;
    const sp = stationPoint(b, o, W_MIN, 1.1)!;
    expect(o.chords[sp.chord]!.curve).toBe('cminmin');
    expect(Math.abs(sp.at[0] - 1.1)).toBeLessThanOrEqual(1e-12);
    expect(sp.t).toBeGreaterThan(0); expect(sp.t).toBeLessThan(1);
    expect(stationPoint(b, o, W_MIN, 0)).not.toBeNull();                  // the far tangent point is ON the stretch
    expect(stationPoint(b, o, W_MIN, -0.1)).toBeNull();
    expect(stationPoint(b, o, W_MIN, 36.1)).toBeNull();
  });
  it('a stop path starts mid-chord on the arc and ends on the front; both ends are stops on their own chords (Q11, Q12)', () => {
    const b = stopOnCorner(), path = profilePath(b, b.profiles[0]!)!, o = faceOutline(b)!;
    const [s, e] = path.ends!;
    if (s.kind !== 'stop' || e.kind !== 'stop') throw new Error('expected stops');
    const c0 = o.chords[path.cover[0]!.chord]!, cl = o.chords[path.cover[path.cover.length - 1]!.chord]!;
    expect(c0.curve).toBe('cminmin'); expect(cl.curve).toBeUndefined();
    const u = (c: { a: number[]; b: number[] }) => { const l = Math.hypot(c.b[0]! - c.a[0]!, c.b[1]! - c.a[1]!); return [(c.b[0]! - c.a[0]!) / l, (c.b[1]! - c.a[1]!) / l]; };
    expect(s.tangent[0]).toBeCloseTo(-u(c0)[0]!, 12); expect(s.tangent[1]).toBeCloseTo(-u(c0)[1]!, 12);
    expect(e.tangent).toEqual([1, 0]); expect(e.normal).toEqual([0, 1]);
    expect(e.at[0]).toBeCloseTo(30, 12);
  });
  it('a station exactly on a chord vertex belongs to the run-side chord (Q11)', () => {
    const b = stopOnCorner(), o = faceOutline(b)!;
    const arc = o.chords.map((c, i) => ({ c, i })).filter(({ c }) => c.curve === 'cminmin');
    const v = arc[6]!;   // the 45° vertex of the 12-chord arc
    const at = v.c.a[0]!;
    const q = { ...b.profiles[0]!, run: { ...(b.profiles[0]!.run as { start: ProfileEnd; end: ProfileEnd }), start: { side: W_MIN, from: 'min' as const, at } } };
    expect(profilePath(b, q)!.cover[0]).toEqual({ chord: v.i, t0: 0, t1: 1 });
  });
  it('a one-side stop stored REVERSED (a mirrored copy, edited: fu 392(5)) walks as its canonical form, never round the outline', () => {
    const b = stopOnCorner(), p = b.profiles[0]!, run = p.run as { start: ProfileEnd; end: ProfileEnd };
    const rev = { ...p, run: { start: run.end, end: run.start } };
    const r = { ...b, profiles: [rev] };
    expect(profilePath(r, rev)).toEqual(profilePath(b, p));
    expect(builtPath(r, rev)).toEqual(builtPath(b, p));
    expect(isSwept(r, rev)).toBe(isSwept(b, p));
    // and a reversed half-stopped run keeps its through end (throughConsistent reads the canonical order)
    const half = { ...p, run: { start: { side: W_MIN, from: 'min' as const, at: 20 }, end: { side: { ...W_MIN }, through: 'min' as const } } };
    expect(profilePath({ ...b, profiles: [half] }, half)!.ends![0]!.kind).toBe('station');
  });
  it('two sides: the length min end at 4 round the front to the length max end at 4 (B3), every corner chord covered once', () => {
    const b = frontAndEnds(), path = profilePath(b, b.profiles[0]!)!, o = faceOutline(b)!;
    expect(path.loop).toBe(false);
    expect(path.ends!.map((e) => e.kind)).toEqual(['stop', 'stop']);
    const ids = path.cover.map((c) => o.chords[c.chord]!.curve ?? '-');
    expect(ids.filter((x) => x === 'cminmin')).toHaveLength(12);
    expect(ids.filter((x) => x === 'cmaxmin')).toHaveLength(12);
    expect(ids.filter((x) => x === 'cmaxmax' || x === 'cminmax')).toHaveLength(0);   // the back is left plain
    expect(new Set(path.cover.map((c) => c.chord)).size).toBe(path.cover.length);
    const [s, e] = path.ends! as [Extract<PathEnd, { kind: 'stop' }>, Extract<PathEnd, { kind: 'stop' }>];
    expect(s.at).toEqual([0, 4]); expect(e.at).toEqual([36, 4]);
    expect(s.side).toEqual(L_MIN); expect(e.side).toEqual(L_MAX);
  });
  it('face min: the same stored run is the plan path reversed, its ends swapped (§3.1)', () => {
    const b = frontAndEnds(), p = { ...b.profiles[0]!, face: 'min' as const };
    // On the bottom, CCW from below from the length min end goes round the BACK to the length max end.
    const ids = profilePath(b, p)!.cover.map((c) => faceOutline(b)!.chords[c.chord]!.curve ?? '-');
    expect(ids.filter((x) => x === 'cminmax' || x === 'cmaxmax')).toHaveLength(24);
    expect(ids.filter((x) => x === 'cminmin' || x === 'cmaxmin')).toHaveLength(0);
  });
  it('a through end in a stopped run carries round its corner arc to the far tangent point as End to end (Q17, B1)', () => {
    const b = topCorners(2, { ...endToEnd('p1', W_MIN), run: { start: { side: W_MIN, through: 'min' }, end: { side: { ...W_MIN }, from: 'min', at: 20 } } });
    const path = profilePath(b, b.profiles[0]!)!;
    expect(path.ends![0]).toEqual({ kind: 'station', at: [0, 2], tangent: [0, 1], side: L_MIN });
    expect(path.ends![1]!.kind).toBe('stop');
    // built: B1's ε along the length min end, as frontOnly's
    expect((builtPath(b, b.profiles[0]!)!.ends![0] as { at: P2 }).at[1]).toBeCloseTo(2 + 2 * 0.25 * Math.tan(Math.PI / 96), 12);
  });
  it('an inconsistent through end (the side\'s LEAVING end as a Start) has no path (Q17)', () => {
    const p = { ...endToEnd('p1', W_MIN), run: { start: { side: W_MIN, through: 'max' as const }, end: { side: L_MAX, from: 'min' as const, at: 4 } } };
    expect(throughConsistent(p)).toBe(false);
    expect(profilePath(topCorners(2, p), p)).toBeNull();
  });
  it('the end-chord zone: the typed stop is the fault path\'s, the BUILT one sits at the vertex (Q13)', () => {
    const b0 = stopOnCorner(), o = faceOutline(b0)!;
    const arc = o.chords.map((c, i) => ({ c, i })).filter(({ c }) => c.curve === 'cminmin');
    const prev = arc[5]!, v = arc[6]!;
    const sp0: StationPoint = { chord: prev.i, t: 0, at: prev.c.a };
    const limit = stopZone(o, sp0, true, 0.25);
    expect(limit).toBeCloseTo(0.25 * Math.tan(Math.PI / 48), 12);   // 12 chords: the turn is π/24
    const l = Math.hypot(prev.c.b[0] - prev.c.a[0], prev.c.b[1] - prev.c.a[1]);
    const t = 1 - (0.5 * limit) / l;
    const x = prev.c.a[0] + t * (prev.c.b[0] - prev.c.a[0]);
    const p = { ...b0.profiles[0]!, run: { start: { side: W_MIN, from: 'min' as const, at: x }, end: { side: { ...W_MIN }, from: 'min' as const, at: 30 } } };
    const b = { ...b0, profiles: [p] };
    expect(profilePath(b, p)!.cover[0]!.chord).toBe(prev.i);
    expect(builtPath(b, p)!.cover[0]).toEqual({ chord: v.i, t0: 0, t1: 1 });
    expect(judgedPath(b, p)!.cover[0]).toEqual({ chord: v.i, t0: 0, t1: 1 });
    expect(judgedPath(frontOnly, frontOnly.profiles[0]!)).toEqual(profilePath(frontOnly, frontOnly.profiles[0]!));   // never ε
  });
  it('B1a widened (Q18): a stop\'s through end at a corner arc mitres with an End to end neighbour; a stop in the middle does not', () => {
    const half = { ...endToEnd('a', W_MIN), run: { start: { side: W_MIN, through: 'min' as const }, end: { side: { ...W_MIN }, from: 'min' as const, at: 20 } } };
    const b = createBoard({ ...topCorners(2), profiles: [half, endToEnd('l', L_MIN)] });
    expect(profilePath(b, b.profiles[0]!)!.ends![0]!.kind).toBe('mitre');
    expect(profilePath(b, b.profiles[1]!)!.ends![1]!.kind).toBe('mitre');
    const mid = createBoard({ ...topCorners(2), profiles: [stopOnCorner().profiles[0]!, endToEnd('l', L_MIN)] });
    expect(profilePath(mid, mid.profiles[1]!)!.ends!.map((e) => e.kind)).toEqual(['station', 'station']);
  });
  it('Q9: a stop whose path is one straight chord is straight; one on a curve, round a corner or on two sides is swept', () => {
    expect(isSwept(apronArch, stopped('q', W_MIN, 0.5, 2.5))).toBe(false);   // before the arch
    expect(isSwept(stopOnArch, stopOnArch.profiles[0]!)).toBe(true);
    expect(isSwept(stopOnCorner(), stopOnCorner().profiles[0]!)).toBe(true);
    expect(isSwept(topCorners(2), stopped('q', W_MIN, 3, 33))).toBe(false);   // the front's straight stretch only
    expect(isSwept(frontAndEnds(), frontAndEnds().profiles[0]!)).toBe(true);
    expect(isSwept(twoSideSharp, twoSideSharp.profiles[0]!)).toBe(true);
  });
  it('mirroring a two-side run (Q20, inv 44): the mirrored part\'s path is the mirror image of the original\'s', () => {
    const b = chiralTwoSide('flat');
    const m = mirrorPart(b);   // along length
    const P = (x: Board) => profilePath(x, x.profiles[0]!)!.chords.flatMap((c) => [c.a, c.b]);
    const mirrored = P(b).map(([u, v]) => [b.length - u!, v!]);
    const mp = P(m);
    for (const q of mirrored) expect(mp.some((r) => Math.hypot(r[0]! - q[0]!, r[1]! - q[1]!) <= 1e-9)).toBe(true);
    const t = { ...b, profiles: [mirrorProfile(b.profiles[0]!, 'thickness')] };
    expect(new Set(P(t).map((q) => q.join()))).toEqual(new Set(P(b).map((q) => q.join())));   // the same plan stretch
  });
  ```
  Change `:58` to `it('a station run whose path turns is swept (b2); on one straight chord it is not')` with the `stopOnArch` /
  `apronArch` 0.5–2.5 assertions above, and `:248` to `it('a station run and ends on two sides have paths (b2)')`: the
  `stopped('q', W_MIN, 5, 25)` path is non-null, and the test's own `two` run (`start: { side: W_MIN, through: 'min' }`,
  `end: { side: L_MAX, through: 'max' }`: consistent, Q17) has a path along the front and up the length max end, its two
  ends `through`, and `isSwept` is now `true`. Mutations: drop the vertex normalisation, drop the one-side canonicalisation, use the true arc's tangent for `tangent`, snap in the fault path, skip
  the face-min reversal for two sides, keep B1a End-to-end-only. Each must fail a test.

- [ ] **Step 3: Run:** `npx vitest run src/document/profilePath.test.ts`. Expected: the b2 block FAILS (no `stationPoint`).

- [ ] **Step 4: Implement.**
  - **Extract** the End to end branch's two end treatments (:413-439) into module functions, unchanged in behaviour:
    ```ts
    type Opts = { build?: boolean; snap?: boolean };
    /** The plan START of a stretch at its corner (B1/B1a/R6, the End to end branch's own code, moved): sharp → a through ray
     *  off the adjacent outline chord; a corner arc → a B1a mitre when `neighbourTakes`, else B1's station at the far tangent
     *  point (with ε when building). `first0` is the UNTRIMMED first chord. */
    function openStart(board: PathBoard, outline: FaceOutline, p: ProfileCut, s: Stretch, E: number, pieces: Piece[], first0: OutlineChord, reach: number, opts?: Opts): { pieces: Piece[]; end: PathEnd } | null;
    /** The plan END likewise; `pieces` already carry the start's mitre trim, `last0` is the UNTRIMMED last chord. */
    function openEnd(board: PathBoard, outline: FaceOutline, p: ProfileCut, s: Stretch, E: number, pieces: Piece[], last0: OutlineChord, reach: number, opts?: Opts): { pieces: Piece[]; end: PathEnd } | null;
    ```
    `E` is the side's rectangle edge (`edgeOfSide`); each derives its corner chords from `s` as today. The End to end branch calls them in that
    order; every b1 pin (`profilePath.test.ts`, `sweepEdges.test.ts` `BODIES`) holds unchanged.
  - `neighbourTakes(board, outline, p, adj, corner, atEnd)` (Q18), now a module function: a profile on the same face, not a
    loop, whose plan-ordered END (`atEnd`) or START is a `through` end on `adj` whose stretch holds `corner[0]`. For two End to
    end profiles it is today's test.
    ```ts
    const planEnds = (q: ProfileCut): [ProfileEnd, ProfileEnd] | null => ('loop' in q.run ? null : q.face === 'max' ? [q.run.start, q.run.end] : [q.run.end, q.run.start]);
    function neighbourTakes(board: PathBoard, outline: FaceOutline, p: ProfileCut, adj: ProfileSide, corner: number[], atEnd: boolean): boolean {
      return (board.profiles ?? []).some((q) => {
        if (q === p || q.id === p.id || q.face !== p.face) return false;
        const ends = planEnds(q);
        const e = ends && ends[atEnd ? 1 : 0];
        if (!e || !('through' in e) || !sameSide(e.side, adj)) return false;
        const t = sideStretch(board, outline, adj);
        return !!t && stretchIndices(outline.chords.length, t).includes(corner[0]!);
      });
    }
    ```
    p's START corner asks `neighbourTakes(..., SIDES[prevEdge(E)]!, startCorner, true)` (the neighbour ENDS there); its END
    corner `neighbourTakes(..., SIDES[nextEdge(E)]!, endCorner, false)`.
  - `stationPoint` (B2):
    ```ts
    export function stationPoint(board: Pick<Board, Dimension>, outline: FaceOutline, side: ProfileSide, x: number): StationPoint | null {
      const s = sideStretch(board, outline, side);
      if (!s) return null;
      const k = side.across === 'width' ? 0 : 1;
      for (const i of stretchIndices(outline.chords.length, s)) {
        const c = outline.chords[i]!;
        const xa = c.a[k]!, xb = c.b[k]!;
        if (xa === xb || (x - xa) * (x - xb) > 0) continue;
        const t = (x - xa) / (xb - xa);
        return { chord: i, t, at: t === 0 ? c.a : t === 1 ? c.b : [c.a[0] + t * (c.b[0] - c.a[0]), c.a[1] + t * (c.b[1] - c.a[1])] };
      }
      return null;
    }
    ```
  - `stopZone` (Q13), the probe's `zone`:
    ```ts
    export function stopZone(outline: FaceOutline, sp: StationPoint, first: boolean, reach: number): number {
      const n = outline.chords.length;
      const dir = (i: number): P2 => { const c = outline.chords[i]!; const l = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]); return [(c.b[0] - c.a[0]) / l, (c.b[1] - c.a[1]) / l]; };
      const [a, b] = first ? [dir(sp.chord), dir((sp.chord + 1) % n)] : [dir((sp.chord - 1 + n) % n), dir(sp.chord)];
      const turn = Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]);   // > 0: convex (a left turn)
      return turn > 0 ? reach * Math.tan(turn / 2) : 0;
    }
    ```
  - `throughConsistent` (Q17):
    ```ts
    /** Plan-CCW enters each rectangle edge (SIDES order) at: the front and the length max end at min, the others at max. */
    const ENTERS: readonly CutFrom[] = ['min', 'min', 'max', 'max'];
    const other = (f: CutFrom): CutFrom => (f === 'min' ? 'max' : 'min');
    export function throughConsistent(p: ProfileCut): boolean {
      if ('loop' in p.run || endToEnd(p.run)) return true;
      const [ps, pe] = p.face === 'max' ? [p.run.start, p.run.end] : [p.run.end, p.run.start];
      const ok = (e: ProfileEnd, first: boolean) => !('through' in e) || e.through === (first ? ENTERS[edgeOfSide(e.side)]! : other(ENTERS[edgeOfSide(e.side)]!));
      return ok(ps, true) && ok(pe, false);
    }
    ```
    (A one-side run's through ends are consistent by construction: `canonicalRun` orders by travel.)
  - The **b2 branch** of `profilePath`, for a run that is neither a loop nor End to end (`endToEnd`, `endPos`, `oneSide`,
    `canonicalRun` imported from `profiles.ts`, as `reachDepth` already is):
    ```ts
    function stopRun(board: PathBoard, outline: FaceOutline, p: ProfileCut, opts?: Opts): ProfilePath | null {
      if ('loop' in p.run) return null;
      // A one-side run is walked in its CANONICAL order (P11): a copy mirrored along the run dimension and then edited can sit
      // reversed in memory until the next load (fu 392(5)); walked as stored it would wrap round the whole outline. A two-side
      // run is never re-ordered (Q16).
      if (oneSide(p.run)) p = { ...p, run: canonicalRun(board, p.face, p.run) };
      if (!throughConsistent(p)) return null;
      const run = p.run as { start: ProfileEnd; end: ProfileEnd };
      const m = outline.chords.length, reach = reachDepth(p)[0];
      // The plan walk is CCW looking at the max face; a run travels CCW looking at ITS face, so for face min the plan walk
      // runs from the stored end to the stored start (the shared tail reverses it back).
      const [ps, pe] = p.face === 'max' ? [run.start, run.end] : [run.end, run.start];
      const pt = (i: number, t: number): P2 => { const c = outline.chords[i]!; return t === 0 ? c.a : t === 1 ? c.b : [c.a[0] + t * (c.b[0] - c.a[0]), c.a[1] + t * (c.b[1] - c.a[1])]; };
      type Pos = { chord: number; t: number };
      const station = (e: Extract<ProfileEnd, { at: number }>, first: boolean): Pos | null => {
        const sp = stationPoint(board, outline, e.side, endPos(board, e));
        if (!sp) return null;
        let pos: Pos = { chord: sp.chord, t: sp.t };
        // Q11: on a vertex, the run-side chord.
        if (first && pos.t === 1) pos = { chord: (pos.chord + 1) % m, t: 0 };
        if (!first && pos.t === 0) pos = { chord: (pos.chord - 1 + m) % m, t: 1 };
        // Q13 (build and the skeleton's judgement only): inside the end-chord zone, built at the next vertex inward.
        if (opts?.build || opts?.snap) {
          const c = outline.chords[pos.chord]!, l = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]);
          if ((first ? 1 - pos.t : pos.t) * l < stopZone(outline, { ...pos, at: pt(pos.chord, pos.t) }, first, reach)) {
            pos = first ? { chord: (pos.chord + 1) % m, t: 0 } : { chord: (pos.chord - 1 + m) % m, t: 1 };
          }
        }
        return pos;
      };
      const s0 = 'through' in ps ? sideStretch(board, outline, ps.side) : null;
      const s1 = 'through' in pe ? sideStretch(board, outline, pe.side) : null;
      if (('through' in ps && !s0) || ('through' in pe && !s1)) return null;
      const a = 'through' in ps ? { chord: s0!.from, t: 0 } : station(ps, true);
      const b = 'through' in pe ? { chord: s1!.to, t: 1 } : station(pe, false);
      if (!a || !b) return null;
      const A = pt(a.chord, a.t), B = pt(b.chord, b.t);
      if (Math.hypot(A[0] - B[0], A[1] - B[1]) <= EPS) return null;   // Q16: the two ends one point
      const piece = (i: number, t0: number, t1: number): Piece => ({ chord: { ...outline.chords[i]!, a: pt(i, t0), b: pt(i, t1) }, index: i, t0, t1 });
      let pieces: Piece[] = [];
      if (a.chord === b.chord && a.t < b.t) pieces = [piece(a.chord, a.t, b.t)];
      else {
        pieces.push(piece(a.chord, a.t, 1));
        for (let i = (a.chord + 1) % m; i !== b.chord; i = (i + 1) % m) pieces.push(piece(i, 0, 1));
        pieces.push(piece(b.chord, 0, b.t));
      }
      const first0 = pieces[0]!.chord, last0 = pieces[pieces.length - 1]!.chord;
      const stopEnd = (c: OutlineChord, first: boolean, side: ProfileSide): PathEnd => {
        const d: P2 = [c.b[0] - c.a[0], c.b[1] - c.a[1]], l = Math.hypot(d[0], d[1]);
        const u: P2 = [d[0] / l, d[1] / l];
        return { kind: 'stop', at: first ? c.a : c.b, tangent: first ? [-u[0] + 0, -u[1] + 0] : [u[0] + 0, u[1] + 0], normal: [-u[1] + 0, u[0] + 0], side: { ...side } };
      };
      let e0: PathEnd, e1: PathEnd;
      if ('through' in ps) { const r = openStart(board, outline, p, s0!, edgeOfSide(ps.side), pieces, first0, reach, opts); if (!r) return null; pieces = r.pieces; e0 = r.end; }
      else e0 = stopEnd(first0, true, ps.side);
      if ('through' in pe) { const r = openEnd(board, outline, p, s1!, edgeOfSide(pe.side), pieces, last0, reach, opts); if (!r) return null; pieces = r.pieces; e1 = r.end; }
      else e1 = stopEnd(last0, false, pe.side);
      return { chords: pieces.map((x) => x.chord), loop: false, ends: [e0, e1], cover: pieces.map((x) => ({ chord: x.index, t0: x.t0, t1: x.t1 })) };
    }
    ```
    `profilePath` calls it when the run is neither a loop nor End to end, then applies the existing face-min tail.
  - `builtPath` passes `{ build: true }` (ε and the zone); `judgedPath` passes `{ snap: true }`. In `profilePath`, ε is taken
    only under `build`, the zone under `build || snap`.
  - `isSwept` (Q9): unchanged for loops and End to end. Ends on two sides → true. A one-side station run → its fault path
    (`profilePath(board, p)`, no options); false when null; else
    `!(path.cover.length === 1 && outline.chords[path.cover[0]!.chord]!.curve === undefined)`.
  - `planChain` (skeleton.ts) gains the stop:
    ```ts
    if (e.kind === 'stop') {
      // b2: the band ends square to the stop's own chord (Q12): the ray is that chord's inward normal, the clip the plane
      // across it. Recomputed from the PLAN chord, so face min (ends swapped above) needs nothing more.
      const u = sub(ch.b, ch.a), l = len(u);
      const t: P2 = start ? [-u[0] / l + 0, -u[1] / l + 0] : [u[0] / l + 0, u[1] / l + 0];
      const N = leftNormal(ch.a, ch.b);
      const end: 'lo' | 'hi' = (face === 'max') === start ? 'lo' : 'hi';   // the path's face-frame end 0 / end 1
      stations.push({ n: [-t[0] + 0, -t[1] + 0], d: dot(t, P), at: P, tangent: t, side: e.side, stop: { N, end } });
      return N;
    }
    ```
    placed before the existing station branch (:107), which keeps B1's `station` ends byte for byte.

- [ ] **Step 5: Run** `npx vitest run src/document/profilePath.test.ts src/document/sweepEdges.test.ts src/document/profilesView.test.ts src/document/drawingIdentity.test.ts`. Expected: PASS; mutate per Step 2; restore.

- [ ] **Pins:** run the pin command (Global Constraints), browser closed. Expected: PASS, every pinned file untouched.

- [ ] **Step 6: Commit.** `git add src/document/profilePath.ts src/document/skeleton.ts src/document/sweepFixtures.ts src/document/profilePath.test.ts && git commit -m "profilePath: stations on a stretch, stop ends, two-side paths; Q9's swept (profile runs b2)"`

---

### Task 3: The loader, faults, and the fallback for stops (Q10)

**Files:**
- Modify: `src/document/document.ts` (`validateProfiles` :549-617: :585's refusal, the push at :606-610, the comment above
  :546), `src/document/profiles.ts` (`canonicalRun` :195, `judge` :374-417, `fallsBack` :452-457, `geometryBoard` :465-497),
  `src/document/curveText.ts` (`RUNS_STRAIGHT_NOTE`: a note per cause, Q10)
- Test: `src/document/profilesLoad.test.ts` (`:78-80`, `:184-187` changed by design), `src/document/profiles.test.ts`,
  `src/document/profilesFinal.test.ts` (`:41` changed by design; a new b2 block), `src/document/sweepView.test.ts`

**Interfaces:**
- Consumes: `stationPoint`, `throughConsistent`, `profilePath`, `judgedPath`, `isSwept` (Task 2).
- Produces:
  ```ts
  // profiles.ts
  /** Q10: a swept-shaped one-side STATION run whose swept faults are non-empty while its straight faults (a2's) are none,
   *  judged against every other profile by its shape. Memoised per stored part. */
  export function stopFallsBack(board: FaultBoard & Pick<Board, 'curves'>, q: ProfileCut): boolean;
  /** The fallback note, by cause (Q10): the first swept fault's kind. */
  export function fallbackCause(c: object): ProfileFault['kind'] | null;
  // curveText.ts
  export function runsStraightNote(kind: ProfileFault['kind']): string;
  ```

- [ ] **Step 1: Write the failing tests.**
  - `profilesLoad.test.ts`:
    - `frontAndEnds().profiles[0]` saved in a v18 file LOADS and round-trips byte for byte; its run is NOT re-ordered (no
      canonical swap for two sides), and `twoSide(..., L_MAX, 4, L_MIN, 4)` (the long way round) loads as stored too.
    - A two-side run with an inconsistent through end loads (KEPT) and faults `stop-off` (Q17).
    - Replace `:78-80`'s refusal case and `:184-187` with these loads (changed by design: §3.2 *(B)*).
    - A loop still loads; every other refusal at `:70-90` still refuses. Mutation: keep `canonicalRun` swapping two-side
      runs; the long-way test must catch it.
  - `profiles.test.ts`, faults:
    ```ts
    it('stop-off (b2): a station off its stretch, a zero-length two-side run, an inconsistent through end', () => {
      const lineCorner = createBoard({ length: 30, width: 10, thickness: 0.75,
        curves: [{ id: 'k', through: 'thickness', uFrom: 'min', vFrom: 'min', start: [0, 0], segments: [{ type: 'line', to: [2, 0] }, { type: 'line', to: [0, 2] }, { type: 'line', to: [0, 0] }] }] });
      const off = twoSide('t', W_MIN, 1, L_MAX, 5);   // 1" lies in the clipped corner's waste: not on the front's stretch
      expect(profileFaults({ ...lineCorner, profiles: [off] }, off).map((f) => f.kind)).toContain('stop-off');
      const b = topCorners(2), atEnd = twoSide('t', W_MIN, 1.2, L_MIN, 0);   // a station AT an end of its side, as a2
      expect(profileFaults({ ...b, profiles: [atEnd] }, atEnd).map((f) => f.kind)).toContain('stop-off');
      // zero length: both ends on the 2" corner arc's 45° vertex, named from the front and from the length min end
      const o = faceOutline(b)!, V = o.chords.filter((c) => c.curve === 'cminmin')[6]!.a;
      const zero = twoSide('t', W_MIN, V[0], L_MIN, V[1]);
      expect(profileFaults({ ...b, profiles: [zero] }, zero)).toEqual([{ kind: 'stop-off' }]);
      const bad = { ...twoSide('t', W_MIN, 5, L_MAX, 4), run: { start: { side: W_MIN, through: 'max' as const }, end: { side: L_MAX, from: 'min' as const, at: 4 } } };
      expect(profileFaults({ ...b, profiles: [bad] }, bad)).toEqual([{ kind: 'stop-off' }]);
      const fine = frontAndEnds();
      expect(profileFaults(fine, fine.profiles[0]!)).toEqual([]);
    });
    it('too-tight on a stop: the path\'s arcs only (Q15); the zone never decides (Q13)', () => {
      const tight = topCorners(0.25, twoSide('t', L_MIN, 4, L_MAX, 4, 0.375));
      expect(profileFaults(tight, tight.profiles[0]!)).toEqual([{ kind: 'too-tight' }]);
      // a 30 × 5 apron with a 2" corner and a notch tighter than the bearing (r 0.2): a stop round the corner that ends
      // before the notch is swept and clean (the notch lies outside its path); one running through the notch is too tight
      const apronCN = (hi: number) => createBoard({ length: 30, width: 5, thickness: 0.75, curves: [
        { id: 'k', ...cornerCurve({ through: 'thickness', uFrom: 'min', vFrom: 'min', radius: 2 }) },
        { id: 'n', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 14, span: 0.4, rise: 0.2 }) }],
        profiles: [stopped('q', W_MIN, 1, hi)] });
      expect(isSwept(apronCN(10), apronCN(10).profiles[0]!)).toBe(true);
      expect(profileFaults(apronCN(10), apronCN(10).profiles[0]!)).toEqual([]);
      expect(profileFaults(apronCN(20), apronCN(20).profiles[0]!)).toEqual([{ kind: 'too-tight' }]);
      // a stop half the zone short of a 2" corner chord vertex: clean (its skeleton is judged on the snapped path)
      expect(profileFaults(zoneStop(), zoneStop().profiles[0]!)).toEqual([]);
    });
    it('overlap on a two-side path (Q19): passing a corner arc a neighbour\'s End to end takes', () => {
      const b = createBoard({ ...topCorners(2), profiles: [frontAndEnds().profiles[0]!, endToEnd('e', L_MAX)] });
      expect(profileFaults(b, b.profiles[0]!)).toEqual([{ kind: 'overlap', other: 'e' }]);
      const clean = createBoard({ ...topCorners(2), profiles: [frontAndEnds().profiles[0]!, endToEnd('k', { across: 'width', from: 'max' })] });
      expect(profileFaults(clean, clean.profiles[0]!)).toEqual([]);   // the back: B1 stations at the far tangent points touch only
    });
    ```
    `zoneStop()` is Task 2's fixture. Mutations: judge the skeleton on the fault path (the zone test fails); judge R10 on every
    outline arc (the notch test fails).
  - `profilesFinal.test.ts`, a new `describe('Q10: saved a2 stops on a turned path (B10 for stops)')`, loaded through
    `loaded(...)`:
    - `tightStop = loaded(top(0.25, [{ ...stop('s', side('width', 'min'), 0.1, 30), size: 0.375 }]))`: swept-shaped,
      `profileFaults` = `[{ kind: 'too-tight' }]`, the view holds it as its a2 view curve with its span, and
      `fingerprint(tightStop)` equals the constants taken on `dc49b01` (Step 2).
    - `i2Pair = loaded(top(2, [stop('a', side('width', 'min'), 1, 30), e2e('b', side('length', 'min'))]))`: 'a' runs straight,
      'b' builds swept, and `fingerprint(i2Pair)` equals `dc49b01`'s.
    - `fits = loaded({ ...apronArch, profiles: [stop('a', side('width', 'min'), 10, 20)] })`: it FOLLOWS (`builtSwept` holds
      'a'; its bodies differ from `dc49b01`'s — the B10 change, recorded).
    - Change `:41` to `expect(b.profiles.map((p) => profileFaults(b, p))).toEqual([[{ kind: 'overlap', other: 'b' }], []])`
      and add `expect(viewProfileFaults(geometryBoard(b).curves.find((c) => c.id === 'a')!)).toEqual([])` (the row's own
      faults). The rest of the I2 test is unchanged.
    - Mutation: decide the stop's fallback with its neighbours resolved (phase 2); `i2Pair`'s hash must fail.
  - `sweepView.test.ts`: a fallen-back stop's view curve carries `span` and `runsStraight`; `fallbackCause` names
    `'too-tight'` for `tightStop` and `'overlap'` for `i2Pair`'s 'a'; a fitting stop is in `view.profiles`.

- [ ] **Step 2: Take the hashes on dc49b01.**
  `git archive dc49b01 src | tar -x -C <scratchpad>/b1src` (with `ln -s /home/alec/docker/sloyd/node_modules <scratchpad>/b1src/node_modules`
  and the repo's `vitest.config.*`/`tsconfig*.json` copied beside it), then copy `profilesFinal.test.ts`'s `fingerprint`,
  `loaded`, `top`, `stop`, `e2e` helpers and the two fixtures into one scratch test there that prints
  `JSON.stringify(fingerprint(x))` for each, run it with `npx vitest run`, and paste the two records into the new block as
  `B1_STOPS`. Never take them from the branch.

- [ ] **Step 3: Run:** `npx vitest run src/document/profilesLoad.test.ts src/document/profiles.test.ts src/document/profilesFinal.test.ts src/document/sweepView.test.ts`. Expected: the new tests FAIL.

- [ ] **Step 4: Implement.**
  - **Loader:** delete :585's `ends on two sides` refusal; the push uses `canonicalRun` as today. Fix the doc comment above
    `validateProfiles` (two-side runs load since b2; nothing else changes).
  - `canonicalRun`: `if (!oneSide(run)) return run;` at the top (Q16: a two-side run is never re-ordered).
  - `judge(board, p, straight, phase1 = false)`:
    - **stop-off**, for a run that is neither a loop nor End to end: a2's rule for one side, unchanged; for two sides, any
      station with `endPos <= 0 || >= L`, or `!stationPoint(...)`, or `!throughConsistent(p)`, or — when the outline traces —
      `profilePath(stored, p) === null` (zero length, Q16).
    - In the swept branch, `runs-off` is pushed for a missing path only when no `stop-off` was; the skeleton test reads
      `judgedPath` (Q13); R10/B5 read `profilePath`'s chords (Q15).
    - **overlap:** a one-side station run `q` that `stopFallsBack` is read as STRAIGHT unless `phase1`: a2's rule when `p`
      is straight too, else its I2 coverage (`coverage(stored, outline, q, false)`). Under `phase1` every `q` is read by its
      shape (b1's rule).
  - `stopFallsBack` (Q10): `oneSide(q.run) && !endToEnd(q.run) && isSwept(stored, q)`, then
    `judge(stored, q, false, true).length > 0 && judge(stored, q, true, true).length === 0 && curveFaults(stored, profileAsCurve(q)).length === 0`.
    Memoised in a `WeakMap<object, Map<ProfileCut, boolean>>` on the stored part (a panel's trial part computes fresh).
  - `fallsBack` (geometryBoard): a one-side station run returns `stopFallsBack(board, p)`; End to end keeps b1's code; a
    two-side run never falls back. `stopFallsBack` keeps its phase-1 judgements in its OWN memo: the view's fault cache
    (`judged`, `straight`) stays what `profileFaults` returns (phase 2), so the row, the words and `builtSwept` read one
    judgement. (Phase-2 faults are a subset of phase-1's: a fallen-back neighbour claims less, never more.)
  - `fallbackCause(c)`: the first kind of the cached swept judgement for a fallen-back view curve, else null.
  - `runsStraightNote(kind)` (curveText.ts, one home): `too-tight` → today's `RUNS_STRAIGHT_NOTE` text exactly; `overlap` →
    `Runs straight: it would overlap another profile if it followed the curve.`; `runs-off` / `stop-off` →
    `Runs straight: it would run off the part if it followed the curve.`. Keep `RUNS_STRAIGHT_NOTE` exported (b1's tests).

- [ ] **Step 5: Run** Step 3's command, then `npx vitest run src/document`. Expected: PASS; mutate per Step 1; restore.

- [ ] **Step 5b: Measure Q9's cost.** `isSwept` now builds a path for every station run, and `judge`/`coverage` call it for
  every pair. Before and after this task (stash to compare): the `curvesPerf` rows `a shelf with a stopped roundover/cove/ogee`
  (thin headroom, fu 392(6)), and b1's M1 panel cost (`profileFaultsGuard.test.ts`' timing, or a 200-call loop of
  `profileFaults` on a part with two stops and a swept End to end). If either regresses by more than 10%, memoise
  `profilePath` per (part object, profile object, opts) in a `WeakMap` (deep-frozen results, as `faceOutline`) and re-measure;
  record both numbers in the task report.

- [ ] **Pins:** run the pin command (Global Constraints), browser closed. Expected: PASS, every pinned file untouched.

- [ ] **Step 6: Commit.** `git commit -m "profiles: two-side runs load; stop faults; saved turned stops follow or fall back, stops decided first (profile runs b2)"`

---

### Task 4: The run-out on a curve — `stopRunoutPieces` and the bodies

**Files:**
- Modify: `src/document/runout.ts` (new `StopFrame`, `stopAxis`, `stopRunoutPieces`; `sectors` exported for the frame form),
  `src/document/sweep.ts` (new `sweptStops`; `sweptPlan` unchanged: `planChain` already clips at stops),
  `src/document/bodies.ts` (after the B1 loop :197-205)
- Create: `src/document/sweepStops.test.ts` (with an oracle ported from the probe's `oracle`)
- Read: `docs/superpowers/plans/b2-probe/probe.ts.txt` (`frameRunout`, `oracle`)

**Interfaces:**
- Consumes: `builtPath`, `planChain`'s `StationClip.stop` (Task 2); `builtSwept` (b1, now holding swept stops by Task 3).
- Produces:
  ```ts
  // runout.ts
  /** A swept profile's stop (b2, §4.2 (b2), Q12): plan (length, width) vectors — F along the stop's MODEL chord away from
   *  the run, N that chord's inward normal — and the run-out tag. The bit's axis is at − BEARING·N. */
  export interface StopFrame { at: P2; F: P2; N: P2; end: 'lo' | 'hi' }
  export function stopAxis(fr: StopFrame): P2;
  /** `runoutPieces` for one stop in its frame: the same pieces, planes, order and tags, exact on every sector ray. `c`
   *  gives only the (s, t) section and the broad face (any one-side curve of the profile: `oneSideCurve(p)`). */
  export function stopRunoutPieces(board: Pick<Board, Dimension>, c: ViewCurve, fr: StopFrame): { planes: Half[]; onArc: boolean[]; edge: ([number, number] | null)[]; runout: 'lo' | 'hi' }[];
  // sweep.ts
  export function sweptStops(view: SweepBoard, p: ProfileCut): readonly StopFrame[];   // from the BUILT path, memoised per (view, id)
  ```

- [ ] **Step 1: Write the failing tests** (`sweepStops.test.ts`):
  - **The oracle** (`stopOracle(board, p)`): the probe's `oracle`, reading `profilePath` (the TYPED stops) for the chords
    and each stop's frame from the path's own ends; past a B1 station it uses a2's axis (`BEARING` outside the side).
    It never reads `sweptStops` or any piece.
  - **The oracle must be able to fail:** with `boardBodies` of the part WITHOUT its profile, it misclassifies points.
  - **Wood** (two seeds, 0.004" grid in whole-number cells as the probe; 50,000 points), the probe's R-a bound, for:
    `stopOnCorner()`, `stopOnCorner('cove', 0.375)`, `stopOnArch`, `stopOnNotch`, `bowFront`, `frontAndEnds()`,
    `frontAndEnds('cove', 0.375)`, `zoneStop()` (mismatches only within the zone of the typed stop).
  - **The sharp corner** (`twoSideSharp`, R6's mitre: the oracle's distance rounds it, so a closed form instead): the waste
    volume is `A·(L1 + L2 − 2·s̄) + 2·π·(BEARING + s̄)·A` within 2e-3 in³, with `A`, `s̄` the area and s-centroid of
    `profileSection(...).pts` and L1 = 30 − 20 (front, from the stop to the corner), L2 = 5 (the end, from the corner to the
    stop) — Pappus for each half-turn run-out, the mitre removing the centroid's offset at the corner. Two run-outs are on
    straight sides, so the bound includes a2's sector-chord shortfall (≤ 2·6e-4).
  - **No step** at every stop: the probe's width readout (±1e-6 along F) differs by ≤ 1e-6" at 60 depths.
  - **Frame = a2 on a straight side** (R-d): for `frontAndEnds()`'s stops, `stopRunoutPieces` equals `runoutPieces` of the
    spanned one-side curve to 1e-12 per coefficient, piece for piece.
  - **Every body convex** (b1's check).
  - **Review Focus 2:** `chiralTwoSide('flat')`, mirrored by `mirrorPart` and through the thickness (`mirrorProfile`): world
    volume equal to 1e-9 and 100,000 world points classified as the mirror image of the original's.
  - **Review Focus 3:** `stopped('q', W_MIN, r - 1e-6, 30)` and `stopped('q', W_MIN, r, 30)` on `topCorners(r)` for r = 2: the
    first is swept, the second straight (Q9), and their volumes differ by ≤ 1e-5 in³ (no jump at the builder switch).
  - **No regression:** every `sweepEdges.test.ts` fixture's bodies hash as pinned (run that file).
- [ ] **Step 2: Run:** `npx vitest run src/document/sweepStops.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `stopRunoutPieces`: port the probe's `frameRunout`, keeping `runoutPieces`' return shape: pieces from
    `convexPieces(sec.pts, sec.arc)`, edges with `outlineRun` indices (`edge`), diagonals last, `onArc` per plane
    (`[false, false, ...edges.map((e) => e.arc)]`), `runout: fr.end`; the sector count from `sectors(BEARING + maxS)`.
    `runoutPieces` itself is untouched.
  - `sweptStops(view, p)`: from `planChain(view, builtPath(view, p), p.face).stations`, each clip with `stop`:
    `{ at, F: tangent, N: stop.N, end: stop.end }`. Memoised in a `WeakMap` on the view, keyed by profile id, deep-frozen.
  - `boardBodies`, after the B1 run-out loop:
    ```ts
    // A swept profile's STOPS (profile runs b2, §4.2 (b2)): the cutter revolved about the bit's axis BEARING outside the
    // stop's chord, beyond the plane across it, subtracted as a2's are.
    for (const p of swept) {
      const stops = sweptStops(board, p);
      if (stops.length === 0) continue;
      const c = oneSideCurve(p);
      const name = sectionEdgeNamer(profileSection(board, c).pts, p.id);
      for (const fr of stops) {
        const pieces = stopRunoutPieces(board, c, fr).map((x) => ({ ...x, edge: x.edge.map(name) }));
        bodies = bodies.flatMap((body) => subtractPieces(body.faces, pieces, p.id)
          .flatMap((f) => (f === body.faces ? [body] : f.length >= 4 ? [{ box: null, faces: f }] : [])));
      }
    }
    ```
- [ ] **Step 4: Run** Step 2's command, then `npx vitest run src/document src/viewport` (browser closed). Expected: PASS.
- [ ] **Pins:** run the pin command (Global Constraints), browser closed. Expected: PASS, every pinned file untouched.

- [ ] **Step 5: Commit.** `git commit -m "runout: a stop's run-out in its chord's frame; the bodies subtract it (profile runs b2)"`

---

### Task 5: The stock probe, hole faults and snap points at a stop

**Files:**
- Modify: `src/document/sweep.ts` (`sweptWaste` :384-419: stops among `stations`; `sweptWasteMeets` :463-482 unchanged in
  form), `src/document/snapPoints.ts` (the swept block :183-205: P17 at stops)
- Test: `src/document/sweepProbes.test.ts` (extend)

**Interfaces:**
- Consumes: `sweptStops`, `stopAxis` (Task 4); `profilePath` / `builtPath` ends of kind `'stop'` (Task 2).

- [ ] **Step 1: Failing tests:**
  - `stockProbe(stopOnCorner())`: a point 0.05" in from the outline at depth 0.1, 0.1" beyond the start stop along F (inside
    the cutter: ρ − BEARING < reach) is air; 0.6" beyond (outside the cutter's reach) is stock; a point on the run-out's
    surface (ρ − BEARING on the section arc) is stock (P3's open form).
  - `stopOnArch`: the same at the concave arch's stop.
  - **Review Focus 4**, a 1/4" hole (r = 0.125) from the top, 3/8" deep, beyond `stopOnArch`'s START stop (on the arch,
    r ≈ 58"), read off `profilePath(...).ends[0]` (`at`, `tangent`, `normal`): centred at
    `at + tangent·(BEARING + reach + δ) + normal·0.3`, 0.3" inside the wood (clear of the arch's waste by 0.175"). P14 extends
    the band along the tangent by `BEARING + reach`, so the hole meets the reach exactly at `δ* = √((reach + r)² − 0.3²)`:
    - `δ = δ* − 0.01` → `breaks-out` keyed `:curve:p1`;
    - `δ = δ* + 0.01` → clean;
    - mutation: drop the stops from `sweptWaste`'s stations; the near case must fail.
  - Snap points (Q25): `boardSnapPoints(stopOnCorner())` offers, at each stop, the section's two junction points on the stop
    plane — (s, t) = (reach, 0) and (0, depth), `keptSection`'s reach and depth, at `at + s·N` — as `'corner'`s, and no point in air
    (each `stockProbe`-checked). `frontOnly`'s B1 stations still offer none (b1's bytes: its snap hash is unchanged).
- [ ] **Step 2: Run:** `npx vitest run src/document/sweepProbes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `sweptWaste`'s `stations` take every `'stop'` end too: `{ at, tangent, axis: [at[0] − BEARING·normal[0], at[1] − BEARING·normal[1]] }`
    (the fault path's for hole faults, the built path's for the probe, as today). B1's `'station'` ends keep `outward(e.side)`.
  - `sweptWasteMeets` then extends the band at each stop along its tangent by `BEARING + reach` with no change of code.
  - Snap points: for each built swept profile, for each `sweptStops` frame, the junction points (reach, 0) and (0, depth)
    (`keptSection`) as board-local points `at + s·N` at thickness `vFace + vIn·t` (`sectionFrame` of `oneSideCurve(p)`),
    kind `'corner'`, owner the board (as P17's straight marks are).
- [ ] **Step 4: Run** Step 2's command and `npx vitest run src/document`. Expected: PASS.
- [ ] **Pins:** run the pin command (Global Constraints), browser closed. Expected: PASS, every pinned file untouched.

- [ ] **Step 5: Commit.** `git commit -m "sweep: a stop's run-out is air to the probe; holes near it break out; its corners snap (profile runs b2)"`

---

### Task 6: The mesh — run-out normals in a frame, watertight, perf guards

**Files:**
- Modify: `src/document/runout.ts` (new `stopRunoutNormals`), `src/viewport/grainTiling.ts` (`runoutFor` :375-392),
  `src/viewport/curvesWatertight.test.ts`, `src/viewport/curvesPerf.test.ts`
- Create: `src/viewport/stopNormals.test.ts`

**Interfaces:**
- Consumes: `StopFrame`, `stopAxis`, `sweptStops` (Task 4).
- Produces: `stopRunoutNormals(board, c, fr): ReturnType<typeof runoutNormals>` (the same three methods, `arcOf`, `normal`,
  `lineNormals`, with ρ⃗ the plan offset from `stopAxis(fr)`), memoised with the run-outs' on the frozen bodies (a2's fix F1).

- [ ] **Step 1: Failing tests** (`stopNormals.test.ts`):
  - On `stopOnCorner()` (roundover): at a vertex on the stop plane, the band face's normal (`sweptNormals`) and the run-out
    face's normal (`bodyMesh`'s) agree within 1e-6.
  - A run-out vertex's normal equals the revolved section arc's normal computed independently from `stopAxis` and the
    section's arc centre (within 1e-9).
  - On `frontAndEnds()` (straight stops), `stopRunoutNormals` agrees with `runoutNormals` of the spanned one-side curve
    within 1e-12 at 100 vertices.
- [ ] **Step 2:** Add watertight rows (`unmatched === 0`, `capCracks` 0) for every Task 4 wood case, `chiralTwoSide('flat')`
  and its mirror, and `stopOnArch` with a 1/4" hole clear of the run-out.
- [ ] **Step 3:** Add the `curvesPerf` rows of the Global Constraints' table at Task 1's guards.
- [ ] **Step 4: Run:** `npx vitest run src/viewport/stopNormals.test.ts src/viewport/curvesWatertight.test.ts src/viewport/curvesPerf.test.ts` (browser closed). Expected: the normals tests FAIL; record which watertight and perf rows pass already.
- [ ] **Step 5: Implement.**
  - `stopRunoutNormals`: `runoutNormals`' body with `stOf` reading `rx = p[0] − axis[0]`, `ry = p[1] − axis[1]`, ρ = hypot,
    t = vIn·(p[2] − vFace), and lifting as `[ns·rx/ρ, ns·ry/ρ, nt·vIn]`. `runoutNormals` is untouched.
  - `runoutFor`: for a profile id, the candidates are its `sweptRunouts` curves (b1, as today) and its `sweptStops` frames;
    among those whose end tag matches the face's `runout`, the one whose axis is nearest the face's first vertex. A part
    with no stop builds no frame (its normals byte for byte: `runoutMemo.test.ts` untouched).
- [ ] **Step 6: Run** Step 4's command. Expected: PASS. A perf row over its guard: measure the product's minimum of 9 alone
  and in a full run; commit the measured minimum + 25% (b1's Q4 amendment) and report it for chunk c.
- [ ] **Pins:** run the pin command (Global Constraints), browser closed. Expected: PASS, every pinned file untouched.

- [ ] **Step 7: Commit.** `git commit -m "bodyMesh: a stop's run-out shades smooth in its frame; watertight rows and perf guards (profile runs b2)"`

---

### Task 7: Edges, part diagrams and the Plans sheet

**Files:**
- Modify: `src/document/bodies.ts` (`curvedEdges`' `stopped` map :811-813), `src/document/curveDrawing.ts` (only if a test
  below needs it: `profileSilhouettes` :331 reads joins and needs nothing new)
- Test: `src/document/sweepEdges.test.ts` (new cases only), `src/document/sweepDiagram.test.ts`, `src/document/profileDrawing.test.ts`,
  `src/document/sweepDrawing.test.ts`

- [ ] **Step 1: Failing tests:**
  - `boardEdges(stopOnCorner())`: no line inside the run-out (its facets join each other and the band by a2's rule); the
    run-out's outline on the top face and on the side face is drawn; across the stop plane no line between the band and the
    run-out (one section, Q12).
  - Fast == reference for every b2 fixture (add them to a NEW array beside `sweptEdgeCases`; never edit `BODIES`).
  - `buildDiagrams(stopOnCorner())`: the top's thickness view opens; its inner line ends on each stop's plane (its end
    points within 1e-9 of the planes); no end-view hatch (Q24). `frontAndEnds()`: one open inner line round the front and
    both corners, ending on the two stop planes.
  - Plans sheet: `profileDrawing`'s ray oracle (`mismatches`) is 0 in FRONT, SIDE, TOP and ISO for `stopOnCorner()`,
    `stopOnArch`, `frontAndEnds()` and `frontAndEnds('cove', 0.375)`; every run-out segment carries the profile's
    `featureTag`; a run-out's contour in ISO is a facet chain (`profileSilhouettes`).
- [ ] **Step 2: Run:** `npx vitest run src/document/sweepEdges.test.ts src/document/sweepDiagram.test.ts src/document/profileDrawing.test.ts src/document/sweepDrawing.test.ts`. Expected: the edge tests FAIL (the run-outs' facets are drawn).
- [ ] **Step 3: Implement.** In `curvedEdges`, register each swept profile with a stop beside its B1 run-outs, so a2's
  `a2Pair` joins its run-out faces:
  ```ts
  for (const p of swept) if (!stopped.has(p.id) && sweptStops(board, p).length > 0) stopped.set(p.id, curveOutline(board, oneSideCurve(p)).smooth);
  ```
  (the section's smooth flags are the same for every one-side curve of the profile; the key is the profile id the faces'
  `profileEdge` names). If a Plans test still fails, fix it in `curveDrawing.ts` and record why; `drawingIdentity.test.ts`
  stays untouched.
- [ ] **Step 4: Run** Step 2's command, then `npx vitest run src/document/drawingIdentity.test.ts src/document/profilesView.test.ts src/document/diagramIdentity.test.ts`. Expected: PASS.
- [ ] **Pins:** run the pin command (Global Constraints), browser closed. Expected: PASS, every pinned file untouched.

- [ ] **Step 5: Commit.** `git commit -m "edges: a stop's run-out joins smoothly; diagrams and the Plans sheet draw stops (profile runs b2)"`

---

### Task 8: Words and keys

**Files:**
- Modify: `src/document/curveText.ts` (`sweptRun` :142-148, `sweptLine` :158-166, a new `stopWords`), `src/document/featureKeys.ts`
  (`sweptText` :96-99)
- Test: `src/document/curveText.test.ts`, `src/document/featureKeys.test.ts`

**Interfaces:**
- Produces: `stopWords(view, p, units): string` — `, from <a> to <b> (stopped)` for one side; `, from <Start> round <between>
  to <Stop> (stopped)` for two (Q21).

- [ ] **Step 1: Failing tests** (exact strings, imperial):
  - `stopOnCorner()`: `` `Roundover 1/4" on the edge between the width face (min side) and the thickness face (max side), along the length, from ${formatLength(1.1, IMPERIAL)} to 30" (stopped)` ``
    (the station's text from `formatLength`, never hand-typed).
  - `stopOnArch`: chunk 1's line plus `, from 10" to 20" (stopped)`.
  - A half-stopped run through the front's min corner arc (`start: through 'min'`, `end: at 20`) on `topCorners(2)`:
    chunk 1's line, `, round the corner`, then `, from the length min end to 20" (stopped)`.
  - `frontAndEnds()`: `Roundover 1/4" on the thickness face (max side), from the length min end at 4" round the width min side to the length max end at 4" (stopped)`.
  - `twoSide('t', W_MIN, 20, L_MAX, 5)` on `twoSideSharp`: `… from the width min side at 20" round the corner to the length max end at 5" (stopped)`.
  - The long way (`twoSide('t', L_MAX, 4, L_MIN, 4)` on `topCorners(2)`): `… round the width max side to …`.
  - A bead two-side run facing the edge: `Bead 1/4" with a 1/16" quirk on the thickness face (max side), top on the edge, from …`.
  - A faulted two-side run appends `— check: a stop runs off the part`.
  - Keys: every one of the above keys as `<name><fillet>, stopped` (Q22); a stopped cove with a fillet keys
    `Cove 3/8", with a 1/16" fillet, stopped`.
  - Mutation: drop the face clause; name the sides between in plan order rather than the face's travel; each must fail.
- [ ] **Step 2: Run:** `npx vitest run src/document/curveText.test.ts src/document/featureKeys.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `sweptRun`: unchanged for a loop and End to end; for any other run it counts only its `through` ends whose stretch end is
    `'arc'`.
  - `sweptLine`: a one-side run reads `profileLine(profileToFields(p))` + run words + `stopWords`; a two-side run reads
    `${profileName(p, units)} on ${faceName('thickness', p.face)}${top}${filletWords(p, units)}${stopWords(view, p, units)}`
    (`top` as for a loop).
  - `stopWords`, two sides: each end `edgeName({ dim: side.across, side: side.from })`, then ` at <formatLength(endPos)>` for
    a station or ` at its <runDim> <through> end` for a through end; `<between>` from the face's travel order of the four
    edges (face max `[0, 1, 2, 3]`, face min `[0, 3, 2, 1]` in `SIDES` order), the edges strictly between Start's and
    Stop's: none → `the corner`, one → its name, two → `<a> and <b>`.
  - `sweptText` (keys): a run that is neither a loop nor End to end appends `, stopped` and no run words.
- [ ] **Step 4: Run** Step 2's command. Expected: PASS.
- [ ] **Pins:** run the pin command (Global Constraints), browser closed. Expected: PASS, every pinned file untouched.

- [ ] **Step 5: Commit.** `git commit -m "words: stopped runs on a turned path and two-side runs; keys ', stopped' (profile runs b2)"`

---

### Task 9: The row — Stop side, Stopped on any side, side changes; Curves under a stop

**Files:**
- Modify: `src/panels/Profiles.tsx` (`TURNED_STOP` :43 and its use :118-119 removed; `p` :86; `run0`/`side` :96-100;
  `build` :103-110; `withSide` :148; `stationEdit` :178-197; the Side select :214-223; a Stop side select; the fallback note
  :92-94 by cause)
- Test: `src/panels/Profiles.test.tsx` (`:790-807` changed by design), `src/panels/Curves.test.tsx`

- [ ] **Step 1: Failing tests:**
  - On `stopOnCorner()`'s part: Run → Stopped is offered on the cornered front (B7 lifted); the row shows Side, Stop side,
    Start and Stop; its line is `sweptLine`'s.
  - **Review Focus 5:**
    - Stop side → `Length max end` on a front stop 1.1–30: the stored end becomes `{ side: L_MAX, from: 'min', at: 3 }`
      (30 does not fit a 20" side: seeded `min(3, L/4)` past the corner the travel enters), Start unchanged, one undo entry;
    - then Side → `Length min end`: only Start moves, keeping 1.1 (it fits), one undo entry;
    - Side → the Stop side's own side: a one-side run in canonical order;
    - Face → Bottom on a two-side run: Start and Stop swap (the same sides profiled), one undo entry;
    - typing in Start a value at the side's leaving end is refused with `A stop runs off the part — move it first.` (the
      field's own error, typed text kept).
  - The Start and Stop labels name each end's own run dimension (`Start (from the width min end)` on a length-min-end start).
  - A two-side asymmetric row's Facing offers `Top: the edge`.
  - A fallen-back saved stop (`tightStop`, Task 3) shows `Runs straight: too tight to follow the curve.`; the `i2Pair` stop
    shows the overlap note (Q10).
  - Curves, **Review Focus 3:** on `stopOnCorner()`:
    - shrinking the min/min corner to 1" is accepted (the stop at 1.1 now lies on the front's straight chord: the profile
      becomes straight; its line unchanged);
    - shrinking it to 0.2" with a 3/8" stop through the arc is refused with the profile's words (an ADDED `too-tight`);
    - mutation: compare fault kinds before and after, or skip the comparison; the refuse test must catch it.
  - Change `:790-807` (B7) to assert Stopped is enabled on a turned side.
- [ ] **Step 2: Run:** `npx vitest run src/panels/Profiles.test.tsx src/panels/Curves.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Remove `TURNED_STOP` and its refusal (B7 lifted).
  - `p`: a two-side run reads its fields as its START side's one-side run (`throughRun(side)`), as a loop reads the
    default edge's; `build` puts the stored run back (a Face change on a two-side run swaps its ends, Q26).
  - `const stopSide = run0.end.side; const twoSides = !loop && !sameSide(side, stopSide);`
  - Side select: one side → `build(withSide(s))` (both ends, as today); two sides → Start only. Stop side select (Stopped
    only) → End only. A moved end keeps its station when `profileFaults` gains nothing, else is seeded per Q26 (via
    `travelSign(face, side)`: the leaving end for Start, the entering end for Stop). Equal sides → `canonicalRun`.
  - `stationEdit`: for two sides, each field edits its own end with no crossing check (Q16); I2's typed 0 / full length
    becomes a `through` end only where consistent (Q17); the rest goes through `attempt`, so an added `stop-off` is refused.
  - The fallback note: `runsStraightNote(fallbackCause(curve) ?? 'too-tight')`.
  - Curves.tsx needs no change (it judges every profile's faults before and after); its tests pin the stop cases.
- [ ] **Step 4: Run** Step 2's command, then `npm test` (browser closed) and `npm run build`. Expected: PASS, build clean.
- [ ] **Pins:** run the pin command (Global Constraints), browser closed. Expected: PASS, every pinned file untouched.

- [ ] **Step 5: Commit.** `git commit -m "Profiles: Stopped on any side, a Stop side select, side changes; Curves refuses an edit that adds a stop fault (profile runs b2)"`

---

### Task 10: Live pass, docs, merge (the controller's)

- [ ] **Step 1: Live pass** on the dev server (`npm run dev -- --port 5180`) with the Playwright MCP browser; leave the test
  projects in place; never clear the dev profile. **Close the browser before any suite run.** On a new project:
  1. A 36 × 20 × 3/4 top with Rounded corners (2"). Add a Roundover; Run → Stopped (now offered); Side `Length min end`, Stop
     side `Length max end`, Start 4, Stop 4. Bench line: `… on the thickness face (max side), from the length min end at 4"
     round the width min side to the length max end at 4" (stopped)` (Q21). Iso screenshot: front and ends profiled, the back
     plain, run-outs at both stops.
  2. On a second top, a stop on the front from 1.1" (on the corner arc) to 30": the run-out sits on the arc (screenshot,
     close up).
  3. A 30 × 5 × 3/4 apron with an Arch: a stop from 10" to 20" on the arched side.
  4. A mirrored copy of item 1's part: the profile mirrors (screenshot).
  5. Import a v18 file built from `tightStop` and `i2Pair` (Task 3) through `migrateDocument`: the tight stop reads
     `Runs straight: too tight…`, the I2 pair's stop the overlap note; both look as on b1.
  6. Shrink item 2's corner to 1": the stop becomes straight, nothing jumps; to 0.2" with a 3/8" roundover: refused.
  7. The Plans key (`, stopped`) and the cut list notes (the inner line up to the stop planes).
  8. Open "Swept profiles check", "Edge profiles check" and "Stopped profiles check": unchanged.
  9. Undo each step. Console: 0 errors.

  Record DOM readouts and one screenshot per spatial finding.
- [ ] **Step 2: Docs.**
  - `docs/browser-verification-profile-runs-b2.md`.
  - **CLAUDE.md:**
    - the Status bullet (b2: chunk b complete; what can deploy; rollback to b1 refuses a two-side run, and builds saved turned
      stops as a2);
    - a Rounds row;
    - Where things live: `profilePath.ts` (`stationPoint`, the `'stop'` end, `judgedPath`), `runout.ts` (`StopFrame`,
      `stopRunoutPieces`, `stopRunoutNormals`), `sweep.ts` (`sweptStops`), `profiles.ts` (`stopFallsBack`, the decision
      order), the new fixtures;
    - inv 16 (a stop's run-out draws no facet lines; its outline does), inv 44 (two-side runs swap on every mirror),
      inv 47 (stops on paper), inv 48 (a stop's run-out in its chord's frame), inv 50 (stop rows watertight; normals
      memoised), inv 53 (stops on a turned path; two-side runs; the decision order);
    - the Versioning row's 17→18 note (two sides load since b2);
    - the test count.
  - **`docs/follow-ups.md`:** 390 closed (chunk b complete); 393(3) re-read against Q18; a new residue entry (394) with every
    review minor, the probe's perf rows for chunk c, and the Q13 zone's cost.
  - **`docs/history.md`:** the round's section, with each ruling and its cost.
  - **The spec:** the Status line; the Planning questions' answers as *Amended (planning, b2)* Q9–Q27 (if not already written
    before Task 2); the contradictions' resolutions.
- [ ] **Step 3: Merge** (no PRs): `git checkout master && git merge --no-ff profile-runs-b2`, then `npm test && npm run build`
  on the merged tree (browser closed), then `git branch -d profile-runs-b2`. **Deploy only on the user's word.** No schema
  change; rolling back to `dc49b01` refuses a project holding a two-side run (export first) and builds saved turned stops
  as a2 did.
