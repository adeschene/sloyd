# Swept rebuild speed, chunk c2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut a swept part's rebuild (bodies + edges + mesh) toward the user's target of "all under 40 ms". Draw a shaped part as ONE mesh. Drop seam faces another body covers exactly, without subtracting them. Make no edge candidate of a face other bodies cover completely.

**Architecture:** The bodies are not touched (`boardBodies`, `sweep.ts`: byte for byte). Three changes sit on top of them:
- **Stage 1.** `partMesh` (grainTiling) concatenates a shaped part's per-body meshes by material, and BoardMesh draws that one geometry.
- **Stage 2.** A new document module, `seams.ts`, holds the seam index and `uncovered`, moved verbatim out of grainTiling. It adds `faceCover`: every face's visible remainder, with exact twin pairs short-circuited to nothing, memoised on the frozen bodies.
- **Stage 3.** `curvedEdges`' fast path reads the same `faceCover` and makes no candidate line from a face whose remainder is empty. Such a face still gives its wings.

**Tech Stack:** TypeScript, Vitest, three.js / react-three-fiber, Vite. Playwright MCP for the browser timing and the live pass.

**Spec:** `docs/superpowers/specs/2026-10-19-sloyd-swept-speed-c2-design.md` (approved 2026-10-19).

## Measured before planning (master `52ebda5`, c1 as deployed; this file alone, min of 9, ms)

| Row | bodies | edges (of which `bodyEdges`) | mesh (of which the first body: seams + weld) | total |
|---|---|---|---|---|
| ogee loop (313 bodies) | 10.6 | 23.6 (13.9) | 28–32 (16.0) | 63–72 |
| cove loop | 8.6 | 17.6 (11.1) | 19.0 (11.6) | 45–49 |
| bead loop | 7.5 | 18.3 (11.7) | 15.5 (8.9) | 41–42 |
| two loops | 11.4 | 14.2 (7.6) | 9.5 (4.3) | 35–37 |
| two-side cove | 9.1 | 16.5 (12.0) | 16.7 (9.0) | 43–44 |

Three throwaway prototypes were run on master and reverted:
- **Twin skip in `curvedPart`** (stage 2): the ogee loop's mesh fell 28 → 18 ms (cove 19 → 13, bead 16 → 12, two-side cove 17 → 13). All 54 `sweptIdentity` pins stayed byte-identical, and `curvesWatertight` passed.
- **Lazy per-face data in `bodyEdges`:** no gain, so it is not in this plan. Of the ogee loop's 782 faces, 521 are read as wings anyway. The cost is in judging lines.
- **No candidate from a fully covered face** (stage 3): of the ogee loop's 416 judged lines, only 52 draw anything. 208 judge to no wings at all and 104 judge nothing. With the skip, `bodyEdges` fell 14 → 7.7 ms (cove 11 → 6.7, bead 11.7 → 9.9, two loops 7.6 → 7.4, two-side cove 12 → 8.4). All 307 `sweepEdges` tests passed: fast == reference, segments and joins. `sweptIdentity`'s edge slot moved (order only).

**Expected after all three stages** (estimate): ogee loop ~45–50 ms; cove, bead, two loops and two-side cove ~33–38. **The ogee loop is not expected to reach 40 by this spec's stages.** Task 5 ends with that gate and reports to the user. It does not invent a fourth stage.

## Amendments to the spec this plan makes (for the user's review with the plan)

- **A1 — Stage 2 decides by the twin test alone; no `internal` tag on the bodies.**
  - Spec §1 pins the bodies byte for byte (`sweptIdentity`'s bodies slot, `sweepEdges`' `BODIES`). Both hash every face's tags, so a new tag in `buildPieces` breaks them. That contradicts §1.
  - §2.2 defines "present" as a partner body with an opposite, coplanar face equal within `BODY_EPS`: that IS `withoutSeams`' twin test. A twin can only be another body's face lying against this one, so stock is on both sides and the face cannot be seen.
  - The tag would only have pre-filtered which faces are tested. Hashing every face is O(faces).
  - The spec's third mutation ("tag a face that is not internal") has no tag to mutate. It is replaced by "loosen the twin test" (Task 3).
- **A2 — Stage 3 removes CANDIDATES, never faces.**
  - The plan does not extend `sectionSeams` to decide every swept–swept line (spec §2.3). Instead, `bodyEdges` makes no candidate line from a face that other bodies cover completely (its `faceCover` remainder is empty). Every face stays a wing (b2's lesson, inv 16: a dropped face drew phantom lines).
  - Measured, the bulk of the judged lines are internal (312 of 416 on the ogee loop), not section–section.
  - A crease is always bounded by a face you can see, whose own edge still makes its candidate. So the drawn set is unchanged.
  - The test is the spec's own: fast == reference on every b1/b2 fixture, the 153-case sweep, the overlap cases, `CREASE_MIN`.
- **A3 — No memo on `partMesh`.**
  - Spec §2.1 memoises it "on the frozen bodies". But frozen bodies are SHARED between parts with one `geometryKey`, which carries no pose and no id. A mesh's positions (pose: `axisFrame`) and UVs (`boardUVOffset(board.id)`) differ per part.
  - A bodies-keyed memo would hand one part another's mesh. BoardMesh's own `useMemo`, keyed on `boardUVSignature`, is the memo. It already rebuilds once per new geometry.
- **A4 — Stage 3 is not skipped.** The measurement above already shows rows within 15% of 40 after stage 2, which is spec §2.3's condition. Task 4's gate step still re-measures and records the decision.

## Global Constraints

- No change to the bodies: `boardBodies` / `sweep.ts`' pieces byte for byte. In `sweptIdentity` the bodies and caps slots never move, and the edges slot moves only in Task 4. `sweepEdges`' `BODIES` hashes never move.
- No change to what is cut, drawn or stored. No schema change (18).
- A part that is not `shapedPart` renders exactly as today: the `BoxGeometry` route and `bodyMeshIdentity`'s bytes.
- Guards are LOWERED only, to ⌈worst × 1.25⌉ of the minimum of 9, taken alone (this file, twice) and in full runs (`npm test`, twice). A row whose ⌈worst × 1.25⌉ ≤ 40 goes to 40. A guard is never raised, and never loosened silently.
- `viewport/` has no unit tests of React components. BoardMesh is verified in a real browser. Pure functions in `grainTiling.ts` are unit-tested as today.
- Close the Playwright browser before any test suite. Never run tests and `npm run build` in parallel.
- Never `localStorage.clear()` on a dev origin. Leave dev test projects in place.
- Branch `perf-c2`. No PR: merge locally with `git merge --no-ff`, verify the merged tree, delete the branch. **Merge and deploy only on the user's word.**
- `npm test` does not typecheck: run `npm run build` before claiming anything compiles.
- A review finding that conflicts with the spec or with a user ruling is a human decision.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Two parts sharing one frozen bodies array** (copies, a shaped component, a turned copy). Each must draw its OWN positions and UVs. A memo keyed on bodies would draw one part's mesh at another's pose and grain offset. Pinned in Task 2.
2. **A shaped part becoming plain mid-session** (its last curve or profile removed), and the reverse. BoardMesh must switch between one merged mesh and per-body meshes, and dispose the old geometries. Checked live in Task 6.
3. **Picking and fading on the merged mesh.** A click selects once (`stopPropagation`). A section hides picks on the removed side. Fading remounts the materials. Checked live in Task 6.
4. **A drawing pin that hashes a swept part's edges in order.** Stage 3 reorders `bodyEdges`' lines. Any moved pin must be shown to be the same merged runs before it is re-recorded (Task 4).
5. **An unfrozen bodies array** (tests, `boardBodiesForTest`). `faceCover` must compute fresh, never memoise it. Pinned in Task 3.

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `src/document/meshCases.ts` | **Create** (TEST-ONLY, Task 2) | `SWEPT_CASES`: the 54 swept fixtures `sweptIdentity` hashes, moved verbatim. `CURVED_CASES`: the plain curved parts (arches, notches, a bow, the L-notch, arch + dado, the four-edge sets, the holed side and stile) that stages 1 and 2 also reach. Imports document modules only. |
| `src/viewport/sweptIdentity.test.ts` | Modify (Tasks 2, 4) | Import the cases. The mesh slot hashes `partMesh` for a shaped part (re-recorded once). Edge slot re-recorded in Task 4. |
| `src/viewport/grainTiling.ts` | Modify (Tasks 2, 3) | `partMesh` and `concatMeshes` (shared with `holesMesh`). In Task 3, `curvedPart` reads `faceCover`, and the seam code moves out. |
| `src/viewport/BoardMesh.tsx` | Modify (Task 2) | One `<mesh>` for a shaped part. |
| `src/viewport/partMesh.test.ts` | **Create** (Task 2) | `partMesh` == concatenation; two parts sharing bodies. |
| `src/viewport/curvesWatertight.test.ts` | Modify (Task 2) | `unmatchedEdges` reads `partMesh`. |
| `src/viewport/curvesPerf.test.ts` | Modify (Tasks 2, 5) | `rebuild()` times `partMesh`. Guards lowered in Task 5. |
| `src/document/seams.ts` | **Create** (Task 3) | `seamIndex`, `facingAgainst`, `uncovered` (moved verbatim), `twinFaces`, `faceCover`. |
| `src/viewport/twinSkip.test.ts` | **Create** (Task 3) | Stage 2's coverage, grain and normal, leak, partner-removed and mutation-resistant tests. |
| `src/document/bodies.ts` | Modify (Task 4) | `curvedEdges`' fast path skips candidates of fully covered faces. |
| `src/document/sweepEdges.test.ts` | Modify (Task 4) | fast == reference on every `meshCases` fixture with a built swept profile. |
| `docs/browser-verification-swept-speed-c2.md` | **Create** (Tasks 1, 6) | Browser timings before and after; the live pass. |
| `CLAUDE.md`, `docs/history.md`, `docs/follow-ups.md` | Modify (Task 6) | The round's record. |

---

### Task 1: Branch and the browser baseline (production build, before stage 1)

**Files:**
- Create: `docs/browser-verification-swept-speed-c2.md`

**Interfaces:**
- Produces: the baseline table (min of the last 9 of 12 Length commits, ms), which Task 6 compares against.

- [ ] **Step 1: Branch**

```bash
cd /home/alec/docker/sloyd && git checkout -b perf-c2 && mkdir -p tmp/c2 && git status --short
```
Expected: `Switched to a new branch 'perf-c2'`, and a clean tree. `tmp/` is gitignored: every scratch log below goes in `tmp/c2/` (run `mkdir -p tmp/c2` again if it is gone).

- [ ] **Step 2: Build and serve the production bundle on its own port**

```bash
cd /home/alec/docker/sloyd && npm run build 2>&1 | tail -3
```
Expected: `✓ built in …`. Then start the preview in the background (Bash `run_in_background: true`):
```bash
cd /home/alec/docker/sloyd && npx vite preview --port 5181 --host 127.0.0.1 --strictPort
```
Leave the dev server on 5180 running. This origin (`127.0.0.1:5181`) is test-only. Its storage holds only what this task imports.

- [ ] **Step 3: Load the ogee loop**

In the Playwright browser (create a new tab), open `http://127.0.0.1:5181/`. Import `.playwright-mcp/swept-check.sloyd.json` through the project menu's Import:
1. Use `browser_file_upload` after clicking Import.
2. Use `page.evaluate` clicks if plain clicks time out under software GL.

Then:
1. Select **Cove top** in the parts list.
2. In its Profiles row, set **Profile** to **Roman ogee**. A kind change takes the ogee's default size; record the size the row shows.
3. Confirm the bench line reads `Roman ogee … all round the thickness face (max side)`.

- [ ] **Step 4: Time 12 Length commits**

Run with `browser_run_code_unsafe` (timeout 300000):
```js
async (page) => {
  const times = [];
  for (let i = 0; i < 12; i += 1) {
    const v = i % 2 === 0 ? '36 1/64' : '36';
    times.push(await page.evaluate(async (v) => {
      const label = [...document.querySelectorAll('label')].find((l) => l.textContent === 'Length');
      const input = document.getElementById(label.htmlFor);
      input.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, v);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const t0 = performance.now();
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return performance.now() - t0;
    }, v));
  }
  const last = times.slice(3);
  return { times: times.map((t) => +t.toFixed(1)), min: +Math.min(...last).toFixed(1), median: +last.sort((a, b) => a - b)[4].toFixed(1) };
}
```
Expected: 12 numbers. Read the bench line again: it must still say `Roman ogee` and its Length must read `36"` (the last commit). If the line or the length did not change on a commit, the timing measured nothing: stop and fix the driver.

- [ ] **Step 5: Record**

Create `docs/browser-verification-swept-speed-c2.md`:
```markdown
# Browser verification — swept rebuild speed, chunk c2

**Setup:** 2026-10-19. Production build (`npm run build` + `vite preview`, port 5181), the Playwright MCP browser under
software GL. Project: `.playwright-mcp/swept-check.sloyd.json` (gitignored), **Cove top** switched to Roman ogee <size>
all round. Each commit types the part's Length (36" ↔ 36 1/64") and presses Enter; the time is from the Enter to the second
animation frame after it (the commit, React's render, the geometry rebuild and one painted frame). Min and median of the
last 9 of 12.

## Before stage 1 (perf-c2 at <hash>, c1's code)

| Row | min (ms) | median (ms) | all 12 |
|---|---|---|---|
| ogee loop, Length commit | <min> | <median> | <times> |
```
Fill in every `<…>` from Step 4. Then close the Playwright browser (`browser_close`) and stop the preview (TaskStop).

- [ ] **Step 6: Commit**

```bash
git add docs/browser-verification-swept-speed-c2.md
git commit -m "docs: chunk c2 browser baseline (production build, ogee loop Length commit)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Stage 1 — one geometry per shaped part

**Files:**
- Create: `src/document/meshCases.ts`
- Create: `src/viewport/partMesh.test.ts`
- Modify: `src/viewport/grainTiling.ts` (`holesMesh` at :1054–1085; add `concatMeshes`, `partMesh`)
- Modify: `src/viewport/BoardMesh.tsx` (the `geometries` memo, :141–198)
- Modify: `src/viewport/sweptIdentity.test.ts`
- Modify: `src/viewport/curvesWatertight.test.ts` (`unmatchedEdges`, :20–49)
- Modify: `src/viewport/curvesPerf.test.ts` (`rebuild`, :52–60)

**Interfaces:**
- Produces:
  - `export type PartMeshData = { positions: Float32Array; uvs: Float32Array; normals: Float32Array; groups: { start: number; count: number; materialIndex: number }[] }`
  - `export function partMesh(board: Board, bodies: readonly Body[], holes: readonly Hole[]): PartMeshData` (Task 3 adds an optional 4th parameter `opts?: { twins?: boolean }`).
  - `export const SWEPT_CASES: [string, Board][]` and `export const CURVED_CASES: [string, Board][]` from `src/document/meshCases.ts`.

- [ ] **Step 1: Move the fixture list out of `sweptIdentity.test.ts`**

Create `src/document/meshCases.ts`. Its header:
```ts
/**
 * TEST-ONLY (chunk c2): the swept fixtures chunk c1's identity pins hash (`viewport/sweptIdentity.test.ts`), shared by c2's
 * mesh and edge tests. Moved verbatim from sweptIdentity.test.ts. Never import a test module for these: it re-registers its
 * suite.
 */
```
Then move verbatim, from `sweptIdentity.test.ts`:
- every line from `const side = (across: 'length' | 'width', from: 'min' | 'max') => ({ across, from });` through the closing `];` of `const cases`;
- the imports those lines use.

Rename `cases` to `export const SWEPT_CASES: [string, Board][]`. Rewrite the imports for the document directory:
- `'../document/document'` → `'./document'`;
- `'../document/sweepFixtures'` → `'./sweepFixtures'`;
- likewise `./angleCuts`, `./holes`, `./frames`.

In `sweptIdentity.test.ts`:
1. Delete the moved lines and the imports only they used.
2. Add `import { SWEPT_CASES } from '../document/meshCases';`.
3. Replace `it.each(cases)` with `it.each(SWEPT_CASES)`.

Then append the plain curved parts (stages 1 and 2 reach every `shapedPart`, not only swept ones; taken from `curvesWatertight.test.ts` and `curvesPerf.test.ts`). Add `archCurve, defaultArch, defaultBow, defaultHingeCup, defaultNotch, defaultProfile, defaultShelfPinRow, PROFILE_EDGES` to the `./document` import and `CurveCut, HoleRow` to the type import:
```ts
/** Chunk c2: plain curved parts (no swept profile). Every one is a shapedPart, so partMesh and faceCover reach them too. */
const apron = { length: 30, width: 5, thickness: 0.75 };
const arch: CurveCut = { id: 'a', ...defaultArch(apron)! };
const notch: CurveCut = { id: 'n', ...defaultNotch(apron)! };
const bow: CurveCut = { id: 'b', ...defaultBow(apron) };
const notchL: CurveCut = {
  id: 'L', through: 'thickness', uFrom: 'min', vFrom: 'min', start: [10, 0],
  segments: [
    { type: 'line', to: [16, 0] }, { type: 'line', to: [16, 1] }, { type: 'line', to: [12, 1] }, { type: 'line', to: [12, 2.5] },
    { type: 'arc', to: [10, 2.5], side: 'right', rise: 0.5 }, { type: 'line', to: [10, 0] },
  ],
};
const archDado = { id: 'c1', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 28, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
const top = { length: 36, width: 20, thickness: 0.75 };
const fourEdge = (kind: 'roundover' | 'cove' | 'bead' | 'ogee') => createBoard({ ...top,
  curves: PROFILE_EDGES.filter((e) => e.vFrom === 'max').map((e, i): CurveCut => ({ id: `${kind}${i}`, ...defaultProfile(top, kind, e) })) });
const shelf = { length: 36, width: 10, thickness: 0.75 };
const bookSide = { length: 36, width: 11.25, thickness: 0.75 };
const sideArch: CurveCut = { id: 'a', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 4, span: 28, rise: 1 }) };
const pinRows = (b: Board): HoleRow[] => { const row = defaultShelfPinRow(b)!; return [{ id: 'f', ...row, inset: 2 }, { id: 'b', ...row, acrossFrom: 'max', inset: 2 }]; };
const stile = { length: 30, width: 5, thickness: 0.75 };
const stileArch: CurveCut = { id: 'a', ...archCurve({ through: 'thickness', along: 'length', side: 'max', from: 'min', start: 6, span: 18, rise: 1 }) };
export const CURVED_CASES: [string, Board][] = [
  ['the default Arch', createBoard({ ...apron, curves: [arch] })],
  ['the default Half-round notch', createBoard({ ...apron, curves: [notch] })],
  ['a Bow on a part lengthened past its span', createBoard({ ...apron, length: 36, curves: [bow] })],
  ['an L-shaped notch with one arc', createBoard({ ...apron, curves: [notchL] })],
  ['the Arch beside a dado', createBoard({ ...apron, curves: [arch], cuts: [archDado] })],
  ...(['roundover', 'cove', 'bead', 'ogee'] as const).map((k): [string, Board] => [`a top with the four-edge ${k} set`, fourEdge(k)]),
  ['a shelf with an ogee on a long edge and a bead on an end', createBoard({ ...shelf, curves: [
    { id: 'o', ...defaultProfile(shelf, 'ogee') }, { id: 'b', ...defaultProfile(shelf, 'bead', { through: 'width', uFrom: 'max', vFrom: 'max' }) }] })],
  ['an arched bookcase side with two shelf-pin rows', createBoard({ ...bookSide, curves: [sideArch], holes: pinRows(createBoard({ ...bookSide, curves: [sideArch] })) })],
  ['an arched stile with a 35 mm hinge cup', createBoard({ ...stile, curves: [stileArch],
    holes: [{ id: 'c', ...defaultHingeCup(createBoard({ ...stile, curves: [stileArch] })), station: 10 }] })],
];
```

Run:
```bash
npx vitest run src/viewport/sweptIdentity.test.ts 2>&1 | tail -4
```
Expected: `Tests  54 passed (54)`. The same pins, so the move changed nothing.

- [ ] **Step 2: Write the failing `partMesh` tests**

Create `src/viewport/partMesh.test.ts`:
```ts
import { partGeometry } from '../document/document';
import type { Board } from '../document/document';
import { geometryBoard, shapedPart } from '../document/profiles';
import { CURVED_CASES, SWEPT_CASES } from '../document/meshCases';
import { topCorners, loop } from '../document/sweepFixtures';
import { bodyMesh, drawsAsBox, partMesh } from './grainTiling';

/**
 * Chunk c2, stage 1 (spec §2.1): a shaped part draws ONE geometry, its bodies' meshes concatenated material by material in
 * BoxGeometry face order, bodies in order within each material, one group per material. So the merged mesh is exactly
 * today's triangles, re-laid: every attribute's slice for material m equals the per-body slices for m, back to back.
 */
function concatenated(board: Board): Map<number, { positions: number[]; uvs: number[]; normals: number[] }> {
  const { bodies, holes } = partGeometry(board);
  const out = new Map<number, { positions: number[]; uvs: number[]; normals: number[] }>();
  for (const body of bodies) {
    const m = bodyMesh(board, body, holes, bodies);
    for (const g of m.groups) {
      const slot = out.get(g.materialIndex) ?? { positions: [], uvs: [], normals: [] };
      slot.positions.push(...m.positions.subarray(g.start * 3, (g.start + g.count) * 3));
      slot.uvs.push(...m.uvs.subarray(g.start * 2, (g.start + g.count) * 2));
      slot.normals.push(...m.normals!.subarray(g.start * 3, (g.start + g.count) * 3));
      out.set(g.materialIndex, slot);
    }
  }
  return out;
}

const shaped = [...SWEPT_CASES, ...CURVED_CASES].filter(([, b]) => shapedPart(geometryBoard(b)));

describe('partMesh: a shaped part\'s bodies in one geometry (chunk c2, stage 1)', () => {
  it('the fixtures are shaped parts, every body through bodyMesh', () => {
    expect(shaped.length).toBeGreaterThan(50 + CURVED_CASES.length);
    expect(CURVED_CASES.every(([, b]) => shapedPart(geometryBoard(b)))).toBe(true);
    for (const [name, b] of shaped) {
      const { bodies, holes } = partGeometry(b);
      expect(bodies.every((body) => !drawsAsBox(b, body, holes)), name).toBe(true);
    }
  });
  it.each(shaped)('%s: the per-body meshes, re-laid by material', (_name, board) => {
    const { bodies, holes } = partGeometry(board);
    const m = partMesh(board, bodies, holes);
    const want = concatenated(board);
    // One group per material present, ascending, contiguous from 0, covering every vertex.
    expect(m.groups.map((g) => g.materialIndex)).toEqual([...want.keys()].sort((a, b) => a - b));
    let at = 0;
    for (const g of m.groups) { expect(g.start).toBe(at); at += g.count; }
    expect(at * 3).toBe(m.positions.length);
    expect(m.uvs.length).toBe(at * 2);
    expect(m.normals.length).toBe(at * 3);
    for (const g of m.groups) {
      const w = want.get(g.materialIndex)!;
      expect(Array.from(m.positions.subarray(g.start * 3, (g.start + g.count) * 3))).toEqual(w.positions);
      expect(Array.from(m.uvs.subarray(g.start * 2, (g.start + g.count) * 2))).toEqual(w.uvs);
      expect(Array.from(m.normals.subarray(g.start * 3, (g.start + g.count) * 3))).toEqual(w.normals);
    }
  });
  // Review Focus 1: two parts with one geometry key share partGeometry's frozen bodies; each draws its own pose and grain offset.
  it('two parts sharing frozen bodies each get their own mesh (no memo on the bodies)', () => {
    const base = topCorners(2, loop('p1', 0.375, 'ogee'));
    const a: Board = { ...base, id: 'a' };
    const b: Board = { ...base, id: 'b', posture: 'upright', rotation: 90 };
    const ga = partGeometry(a), gb = partGeometry(b);
    expect(gb.bodies).toBe(ga.bodies);   // the fixture is what it claims: one shared, frozen array
    const ma = partMesh(a, ga.bodies, ga.holes);
    const mb = partMesh(b, gb.bodies, gb.holes);
    expect(Array.from(ma.positions)).not.toEqual(Array.from(mb.positions));
    expect(Array.from(ma.uvs)).not.toEqual(Array.from(mb.uvs));
    const wb = concatenated(b);
    for (const g of mb.groups) expect(Array.from(mb.positions.subarray(g.start * 3, (g.start + g.count) * 3))).toEqual(wb.get(g.materialIndex)!.positions);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/viewport/partMesh.test.ts 2>&1 | tail -6`
Expected: FAIL. `partMesh` is not exported (a TypeError: `partMesh is not a function`, or an import error).

- [ ] **Step 4: Implement `concatMeshes` and `partMesh`; make `holesMesh` use the helper**

In `src/viewport/grainTiling.ts`, replace the body of `holesMesh` from `const meshes = holes.map(…)` to its `return`, and add the two functions after it:
```ts
export function holesMesh(board: Board, holes: readonly Hole[], bodies: readonly Body[], checks: StockChecks = stockChecks(board)): PartMeshData | null {
  if (holes.length === 0) return null;
  return concatMeshes(holes.map((h) => holeMesh(board, h, bodies, checks)));
}

/** A mesh with explicit normals: positions and normals (xyz), uvs (uv), one group per material in BoxGeometry order. */
export type PartMeshData = { positions: Float32Array; uvs: Float32Array; normals: Float32Array; groups: { start: number; count: number; materialIndex: number }[] };

/**
 * Meshes laid out back to back material by material in BoxGeometry order (as packGroups lays one mesh out), each mesh's
 * slice for a material copied straight in, in mesh order: holesMesh's layout since final review 2, shared by partMesh
 * (chunk c2). No intermediate number arrays: a part rebuilds every drag frame.
 */
function concatMeshes(meshes: readonly PartMeshData[]): PartMeshData {
  const counts = new Array<number>(6).fill(0);
  for (const m of meshes) for (const g of m.groups) counts[g.materialIndex]! += g.count;
  const total = counts.reduce((a, b) => a + b, 0);
  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  const uvs = new Float32Array(total * 2);
  const groups: { start: number; count: number; materialIndex: number }[] = [];
  const at = new Array<number>(6).fill(0);
  let start = 0;
  counts.forEach((count, materialIndex) => {
    if (count === 0) return;
    groups.push({ start, count, materialIndex });
    at[materialIndex] = start;
    start += count;
  });
  for (const m of meshes) {
    for (const g of m.groups) {
      const v = at[g.materialIndex]!;
      positions.set(m.positions.subarray(g.start * 3, (g.start + g.count) * 3), v * 3);
      normals.set(m.normals.subarray(g.start * 3, (g.start + g.count) * 3), v * 3);
      uvs.set(m.uvs.subarray(g.start * 2, (g.start + g.count) * 2), v * 2);
      at[g.materialIndex] = v + g.count;
    }
  }
  return { positions, normals, uvs, groups };
}

/**
 * Chunk c2, stage 1 (spec §2.1): a SHAPED part's whole mesh (shapedPart: curves or swept profiles), so BoardMesh draws it
 * as ONE mesh, one draw call per material, instead of one mesh per body (313 for an ogee loop). Every body goes through
 * bodyMesh (drawsAsBox is false on a shaped part), which returns explicit normals for one, and is board-centred, so
 * concatenation needs no offset. Not memoised (amendment A3): frozen bodies are shared by every part with one geometryKey,
 * which carries no pose and no id, while positions follow the part's pose and uvs its id; BoardMesh's useMemo, keyed on
 * boardUVSignature, is the memo.
 */
export function partMesh(board: Board, bodies: readonly Body[], holes: readonly Hole[]): PartMeshData {
  return concatMeshes(bodies.map((body) => {
    const m = bodyMesh(board, body, holes, bodies);
    return { positions: m.positions, uvs: m.uvs, normals: m.normals!, groups: m.groups };
  }));
}
```
Make `holeMesh`'s declared return type `PartMeshData` too. It already returns those four fields.

- [ ] **Step 5: Run the new tests and the holes pins**

Run:
```bash
npx vitest run src/viewport/partMesh.test.ts src/viewport/sweptIdentity.test.ts src/viewport/holesPerf.test.ts src/viewport/bodyMeshIdentity.test.ts 2>&1 | tail -5
```
Expected: all pass. `sweptIdentity` still hashes per-body meshes and `holesMesh`, which is now through `concatMeshes`, so its holes bytes are unchanged.

- [ ] **Step 6: The mesh slot hashes what is drawn — re-record it once**

In `sweptIdentity.test.ts`:
1. Import `partMesh` beside `bodyMesh`, and `geometryBoard, shapedPart` from `'../document/profiles'`.
2. In `identity()`, replace the per-body loop:
```ts
  const hm = createHash('sha256');
  if (shapedPart(geometryBoard(board))) {
    // Chunk c2 (stage 1): a shaped part draws ONE geometry (partMesh), hashed as drawn.
    const m = partMesh(board, g.bodies, g.holes);
    hm.update(f32(m.positions)); hm.update(f32(m.uvs)); hm.update(f32(m.normals)); hm.update(JSON.stringify(m.groups));
  } else {
    for (const body of g.bodies) {
      const m = bodyMesh(board, body, g.holes, g.bodies);
      hm.update(f32(m.positions)); hm.update(f32(m.uvs));
      if (m.normals) hm.update(f32(m.normals));
      hm.update(JSON.stringify(m.groups));
    }
  }
```
Then regenerate:
```bash
cd /home/alec/docker/sloyd && rm -f tmp/c2/c2-pins.txt && SLOYD_PIN_LOG=tmp/c2/c2-pins.txt npx vitest run src/viewport/sweptIdentity.test.ts > /dev/null 2>&1; wc -l tmp/c2/c2-pins.txt
```
Expected: 54 lines.

Check that ONLY the mesh slot (the third `:` field) moved, in both lengths, for every case:
```bash
cd /home/alec/docker/sloyd && python3 - <<'EOF'
import re, ast
src = open('src/viewport/sweptIdentity.test.ts').read()
old = dict(re.findall(r'^\s*(".*?"): (\[.*?\]),$', src, re.M))
new = dict(re.findall(r'^\s*(".*?"): (\[.*?\]),$', open('tmp/c2/c2-pins.txt').read(), re.M))
assert old.keys() == new.keys(), (len(old), len(new))
moved = 0
for k in old:
    for a, b in zip(ast.literal_eval(old[k]), ast.literal_eval(new[k])):
        fa, fb = a.split(':'), b.split(':')
        assert fa[0] == fb[0] and fa[1] == fb[1] and fa[3] == fb[3], (k, a, b)
        moved += fa[2] != fb[2]
print('ok; mesh slots moved:', moved)
EOF
```
Expected: `ok; mesh slots moved: 106` (53 shaped cases × 2 lengths; the `angled` case keeps its per-body hash). If any other field moved, stop: stage 1 must not touch bodies, edges or caps.

Replace the `PINNED` table's entries with the log's lines. Above `PINNED`, change the comment to:
```ts
// Taken at 7794999 (master, before chunk c1), `bodies:edges:mesh:caps`, as built and at 1.000123×. Chunk c2 stage 1: a shaped
// part's mesh slot re-recorded as partMesh (its per-body meshes re-laid by material; partMesh.test.ts proves the re-laying),
// every other slot unchanged.
```
Run `npx vitest run src/viewport/sweptIdentity.test.ts 2>&1 | tail -3`. Expected: `54 passed`.

- [ ] **Step 7: The leak check and the perf guard read `partMesh`**

In `curvesWatertight.test.ts` `unmatchedEdges`, replace the `const meshes = bodies.map(…)` block:
```ts
  for (const body of bodies) expect(drawsAsBox(board, body, holes)).toBe(false);
  // Chunk c2 (stage 1): the one geometry BoardMesh draws.
  const meshes = [partMesh(board, bodies, holes).positions];
```
Import `partMesh` and drop `bodyMesh` from that file's import if it is no longer used. Update the doc comment's sentence "so the merged bodyMesh output over all bodies is exactly what BoardMesh draws" to "so partMesh (every body's bodyMesh, one geometry) is exactly what BoardMesh draws".

In `curvesPerf.test.ts` `rebuild()`, replace `for (const body of g.bodies) bodyMesh(board, body, g.holes, g.bodies);` with `partMesh(board, g.bodies, g.holes);`. Import `partMesh` instead of `bodyMesh`. Add to the file's header comment: `Chunk c2: the mesh is partMesh, the one geometry BoardMesh draws.`

Run:
```bash
npx vitest run src/viewport/curvesWatertight.test.ts src/viewport/curvesPerf.test.ts 2>&1 | tail -4
```
Expected: all pass.

- [ ] **Step 8: BoardMesh draws a shaped part as one mesh**

In `src/viewport/BoardMesh.tsx`:
1. Import `partMesh` from `./grainTiling`.
2. In the `geometries` memo, after the placeholder branch, replace `items: [ ...bodies.map(…), ...[holesMesh(…)].flatMap(…) ]` with:
```tsx
    // Explicit normals: no computeVertexNormals.
    const meshGeo = (m: { positions: Float32Array; normals: Float32Array; uvs: Float32Array; groups: { start: number; count: number; materialIndex: number }[] }) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(m.uvs, 2));
      for (const g of m.groups) geo.addGroup(g.start, g.count, g.materialIndex);
      return { geo, center: [0, 0, 0] as [number, number, number] };
    };
    // Chunk c2 (stage 1, spec §2.1): a shaped part (curves or swept profiles) is ONE geometry, its bodies' meshes re-laid by
    // material (partMesh): one <mesh>, not one per body (313 for an ogee loop). Every other part is drawn as before.
    const shaped = shapedPart(geometryBoard(board));
    return {
      placeholder: false,
      items: [
        ...(shaped ? [meshGeo(partMesh(board, bodies, holes))] : bodies.map((body) => {
          // … the existing per-body arrow function, unchanged …
        })),
        // Every hole's wall and bottom (holes spec §3.2) in ONE geometry (final review 2: one mesh per part, not per
        // hole). A part with no holes adds nothing.
        ...[holesMesh(board, holes, bodies, checks)].flatMap((m) => (m ? [meshGeo(m)] : [])),
      ],
    };
```
Keep the per-body arrow function's body exactly as it is today, comments included. `shapedPart` and `geometryBoard` are already imported. The JSX that maps `geometries.items` to `<mesh>` stays unchanged. Every carried-over prop (materials, `polygonOffset`, clipping, `faded`, shadows, `raycast`, `onClick`/`onDoubleClick`) applies to the one mesh as it applied to each.

Update the memo's leading comment from "One geometry per solid." to "One geometry per solid — or, for a shaped part, one for all of them (chunk c2)."

- [ ] **Step 9: Typecheck and the full suite**

Close the Playwright browser if open. Then run:
```bash
cd /home/alec/docker/sloyd && npm run build 2>&1 | tail -3 && npm test > tmp/c2/c2-t2.txt 2>&1; tail -6 tmp/c2/c2-t2.txt
```
Expected:
- the build prints `✓ built`;
- every test passes, the count being the master count (6419) plus `partMesh.test.ts`' tests.

A wall-clock guard failing once under load is re-run alone; report it either way.

- [ ] **Step 10: Commit**

```bash
git add src/document/meshCases.ts src/viewport/partMesh.test.ts src/viewport/grainTiling.ts src/viewport/BoardMesh.tsx src/viewport/sweptIdentity.test.ts src/viewport/curvesWatertight.test.ts src/viewport/curvesPerf.test.ts
git commit -m "perf(c2 stage 1): a shaped part draws one geometry (partMesh), not a mesh per body

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Stage 2 — seam faces another body covers exactly drop without subtraction

**Files:**
- Create: `src/document/seams.ts`
- Create: `src/viewport/twinSkip.test.ts`
- Modify: `src/viewport/grainTiling.ts`:
  - move out lines :830–910: `uncovered`, `facingAgainst`, `KEY`, `KEY_WINDOW`, `SeamIndex`, `seamIndexes`, `seamIndex`, with their doc comments;
  - change `curvedPart` (:616–637), `bodyMesh`'s signature (:376) and `partMesh`.

**Interfaces:**
- Consumes: `partMesh`, `PartMeshData` (Task 2); `SWEPT_CASES` (Task 2).
- Produces (in `src/document/seams.ts`):
  - `export function seamIndex(bodies: readonly Body[]): SeamIndex`
  - `export function uncovered(f: BodyFace, body: Body, index: SeamIndex): BodyFace[]`
  - `export function twinFaces(bodies: readonly Body[]): Set<BodyFace>`
  - `export interface FaceCover { remains: Map<BodyFace, BodyFace[]>; twins: number }`
  - `export function faceCover(bodies: readonly Body[], opts?: { twins?: boolean }): FaceCover`: every face of every body maps to its visible remainder (`[]` when fully covered). Memoised on a FROZEN array when `opts` is absent.
  - In `grainTiling.ts`: `bodyMesh(board, body, holes?, bodies?, opts?: { twins?: boolean })` and `partMesh(board, bodies, holes, opts?: { twins?: boolean })`. `opts.twins === false` is TEST ONLY: today's route for every face.

- [ ] **Step 1: Move the seam code verbatim into `src/document/seams.ts`**

Create `src/document/seams.ts` with this header and imports:
```ts
import { HOLE_EPS, minusCover } from './holes';
import type { Body, BodyFace } from './bodies';
import type { V3 } from './angleCuts';

/**
 * A part's seams (chunk c2: moved from viewport/grainTiling.ts, where the mesh used them, so the edges can read the same
 * cover). A seam is a face another body of the part lies against — coplanar, facing the opposite way — so between them is
 * stock and that much of the face is never seen. `uncovered` (ruling R11; curves spec §3.4) subtracts the covers;
 * `faceCover` (chunk c2, stage 2) gives every face its remainder, an exact twin pair short-circuited.
 */
```
Cut lines :830–910 of `grainTiling.ts` and paste them below the header unchanged, from the `/**` above `function uncovered` through the closing `}` of `function seamIndex`. Add `export` to `function uncovered`, `function seamIndex` and `interface SeamIndex`.

In `grainTiling.ts`:
1. Add `import { faceCover, seamIndex, uncovered } from '../document/seams';`.
2. Remove `HOLE_EPS` and `minusCover` from its `'../document/document'` import, only if nothing else in the file still uses them; check with `grep -n "HOLE_EPS\|minusCover" src/viewport/grainTiling.ts`.

Run:
```bash
npx vitest run src/viewport/sweptIdentity.test.ts src/viewport/bodyMeshIdentity.test.ts src/viewport/curvesWatertight.test.ts 2>&1 | tail -4
```
Expected: all pass. A verbatim move changes no byte.

Commit:
```bash
git add src/document/seams.ts src/viewport/grainTiling.ts
git commit -m "refactor(c2): the seam index and uncovered move to document/seams.ts, verbatim

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 2: Write the failing stage 2 tests**

Create `src/viewport/twinSkip.test.ts`:
```ts
import { boardBodiesForTest } from '../document/bodies';
import { partGeometry } from '../document/document';
import type { Board } from '../document/document';
import { faceCover, twinFaces } from '../document/seams';
import { geometryBoard, shapedPart } from '../document/profiles';
import { CURVED_CASES, SWEPT_CASES } from '../document/meshCases';
import { loop, stopOnCorner, topCorners } from '../document/sweepFixtures';
import { partMesh, type PartMeshData } from './grainTiling';

/**
 * Chunk c2, stage 2 (spec §2.2, amendment A1): a face another body's face covers EXACTLY — opposite, coplanar, the same
 * polygon within BODY_EPS (withoutSeams' twin test) — has stock on both sides and draws nothing, without minusCover. The
 * criterion is not byte-identity: the visible surface per material keeps its area within 1e-9, every drawn point keeps its
 * material, uv and normal, and the mesh stays watertight (curvesWatertight reads partMesh). The reference is today's route
 * for every face (`twins: false`).
 */
// Every shaped part: the swept fixtures and the plain curved ones (a split arch, the four-edge sets, a holed arched side —
// mergeHoledPlanes reads faceCover's per-body faces too).
const shaped = [...SWEPT_CASES, ...CURVED_CASES].filter(([, b]) => shapedPart(geometryBoard(b)));
const ogee = topCorners(2, loop('p1', 0.375, 'ogee'));

type T = { p: number[]; uv: number[]; n: number[] };
function triangles(m: PartMeshData): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const g of m.groups) {
    const list: T[] = [];
    for (let t = g.start; t < g.start + g.count; t += 3) {
      list.push({ p: Array.from(m.positions.subarray(t * 3, t * 3 + 9)), uv: Array.from(m.uvs.subarray(t * 2, t * 2 + 6)), n: Array.from(m.normals.subarray(t * 3, t * 3 + 9)) });
    }
    out.set(g.materialIndex, list);
  }
  return out;
}
const area = (p: number[]) => {
  const ax = p[3]! - p[0]!, ay = p[4]! - p[1]!, az = p[5]! - p[2]!, bx = p[6]! - p[0]!, by = p[7]! - p[1]!, bz = p[8]! - p[2]!;
  return Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx) / 2;
};
const areas = (m: PartMeshData) => new Map([...triangles(m)].map(([k, ts]) => [k, ts.reduce((s, t) => s + area(t.p), 0)]));

/** Barycentric weights of q in triangle p (3 × xyz), or null when q is off its plane (1e-6) or outside (−1e-7). */
function bary(p: number[], q: number[]): [number, number, number] | null {
  const v0 = [p[3]! - p[0]!, p[4]! - p[1]!, p[5]! - p[2]!], v1 = [p[6]! - p[0]!, p[7]! - p[1]!, p[8]! - p[2]!], v2 = [q[0]! - p[0]!, q[1]! - p[1]!, q[2]! - p[2]!];
  const n = [v0[1]! * v1[2]! - v0[2]! * v1[1]!, v0[2]! * v1[0]! - v0[0]! * v1[2]!, v0[0]! * v1[1]! - v0[1]! * v1[0]!];
  const nl = Math.hypot(n[0]!, n[1]!, n[2]!);
  if (nl === 0 || Math.abs((n[0]! * v2[0]! + n[1]! * v2[1]! + n[2]! * v2[2]!) / nl) > 1e-6) return null;
  const d = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  const d00 = d(v0, v0), d01 = d(v0, v1), d11 = d(v1, v1), d20 = d(v2, v0), d21 = d(v2, v1);
  const den = d00 * d11 - d01 * d01;
  const v = (d11 * d20 - d01 * d21) / den, w = (d00 * d21 - d01 * d20) / den, u = 1 - v - w;
  return u < -1e-7 || v < -1e-7 || w < -1e-7 ? null : [u, v, w];
}
/** Every drawn triangle's centroid lies in a reference triangle of the same material, where the reference's interpolated uv
 *  and normal equal the drawn ones' (1e-5: Float32 rounding). Reference triangles bucketed by their plane. */
function sameGrain(got: PartMeshData, ref: PartMeshData): string | null {
  const key = (p: number[]) => {
    const n = [(p[4]! - p[1]!) * (p[8]! - p[2]!) - (p[5]! - p[2]!) * (p[7]! - p[1]!), (p[5]! - p[2]!) * (p[6]! - p[0]!) - (p[3]! - p[0]!) * (p[8]! - p[2]!), (p[3]! - p[0]!) * (p[7]! - p[1]!) - (p[4]! - p[1]!) * (p[6]! - p[0]!)];
    const l = Math.hypot(n[0]!, n[1]!, n[2]!);
    const u = n.map((x) => x / l);
    return `${u.map((x) => Math.round(x * 1e3)).join(',')}|${Math.round((u[0]! * p[0]! + u[1]! * p[1]! + u[2]! * p[2]!) * 1e4)}`;
  };
  const R = triangles(ref);
  const buckets = new Map<string, T[]>();
  for (const [m, ts] of R) for (const t of ts) { const k = `${m}|${key(t.p)}`; buckets.set(k, [...(buckets.get(k) ?? []), t]); }
  for (const [m, ts] of triangles(got)) {
    for (const t of ts) {
      const c = [0, 1, 2].map((i) => (t.p[i]! + t.p[3 + i]! + t.p[6 + i]!) / 3);
      const cuv = [0, 1].map((i) => (t.uv[i]! + t.uv[2 + i]! + t.uv[4 + i]!) / 3);
      const cn = [0, 1, 2].map((i) => (t.n[i]! + t.n[3 + i]! + t.n[6 + i]!) / 3);
      const hit = (buckets.get(`${m}|${key(t.p)}`) ?? []).find((r) => {
        const w = bary(r.p, c);
        if (!w) return false;
        const uv = [0, 1].map((i) => w[0] * r.uv[i]! + w[1] * r.uv[2 + i]! + w[2] * r.uv[4 + i]!);
        const nn = [0, 1, 2].map((i) => w[0] * r.n[i]! + w[1] * r.n[3 + i]! + w[2] * r.n[6 + i]!);
        return uv.every((x, i) => Math.abs(x - cuv[i]!) <= 1e-5) && nn.every((x, i) => Math.abs(x - cn[i]!) <= 1e-5);
      });
      if (!hit) return `material ${m}: no reference triangle carries the drawn point ${c.map((x) => x.toFixed(6)).join(',')} with its uv and normal`;
    }
  }
  return null;
}

describe('stage 2: exact twins draw nothing (chunk c2)', () => {
  it('the ogee loop has twins, and each draws nothing', () => {
    const { bodies } = partGeometry(ogee);
    const twins = twinFaces(bodies);
    expect(twins.size).toBeGreaterThan(100);
    const cover = faceCover(bodies);
    expect(cover.twins).toBe(twins.size);
    for (const f of twins) expect(cover.remains.get(f)).toEqual([]);
  });
  it('the reference route takes no shortcut (twins: false)', () => {
    const { bodies } = partGeometry(ogee);
    expect(faceCover(bodies, { twins: false }).twins).toBe(0);
  });
  // Review Focus 5: an unfrozen bodies array is never memoised.
  it('an unfrozen bodies array is covered afresh', () => {
    const bodies = boardBodiesForTest(ogee, {});
    expect(Object.isFrozen(bodies)).toBe(false);
    expect(faceCover(bodies)).not.toBe(faceCover(bodies));
    const frozen = partGeometry(ogee).bodies;
    expect(faceCover(frozen)).toBe(faceCover(frozen));
  });
  it.each(shaped)('%s: the same visible area per material (1e-9), material, uv and normal at every drawn point', (_name, board) => {
    const { bodies, holes } = partGeometry(board);
    const got = partMesh(board, bodies, holes);
    const ref = partMesh(board, bodies, holes, { twins: false });
    const a = areas(got), b = areas(ref);
    expect([...a.keys()]).toEqual([...b.keys()]);
    for (const [m, x] of b) expect(Math.abs(a.get(m)! - x), `material ${m}`).toBeLessThanOrEqual(1e-9);
    expect(sameGrain(got, ref)).toBeNull();
  });
  // Spec §2.2's partner-removed fixtures: a stop's run-out and a dado reshape faces next to the band; nothing they touch is
  // a twin unless its partner still lies exactly against it.
  it('partner-removed parts (a stop, a dado through the band) are in the list and drop twins elsewhere', () => {
    const names = shaped.map(([n]) => n);
    expect(names).toContain('stopOnCorner');
    expect(names).toContain('loop over a dado and a chamfer');
    expect(twinFaces(partGeometry(stopOnCorner()).bodies).size).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/viewport/twinSkip.test.ts 2>&1 | tail -6`
Expected: FAIL, because `faceCover` / `twinFaces` are not exported from `../document/seams`.

- [ ] **Step 4: Implement `twinFaces` and `faceCover`**

Append to `src/document/seams.ts`:
```ts
/**
 * Chunk c2, stage 2 (spec §2.2, amendment A1): every face with an exact TWIN — a face of another body, facing the opposite
 * way, with the same polygon within 1e-9 per coordinate (BODY_EPS; withoutSeams' test in bodies.ts, the same key and
 * comparison) — paired off greedily in body then face order, as withoutSeams pairs them. A twin lies against its partner
 * over its whole area: stock on both sides, never seen. Where a later subtraction (a run-out, a stop, another curve, a cut)
 * reshaped either side, the polygons differ and neither is a twin; the face takes `uncovered` as before.
 */
export function twinFaces(bodies: readonly Body[]): Set<BodyFace> {
  const keyOf = (f: BodyFace) => {
    let sum = 0, xor = 0;
    for (const p of f.verts) {
      const h = Math.imul(Math.round(p[0] * 1e6), 73856093) ^ Math.imul(Math.round(p[1] * 1e6), 19349663) ^ Math.imul(Math.round(p[2] * 1e6), 83492791);
      sum = (sum + h) | 0;
      xor ^= h;
    }
    return (Math.imul(sum, 31) ^ xor ^ f.verts.length) | 0;
  };
  const E = 1e-9;
  const byKey = new Map<number, BodyFace[]>();
  const owner = new Map<BodyFace, Body>();
  const drop = new Set<BodyFace>();
  const same = (a: BodyFace, b: BodyFace) => owner.get(a) !== owner.get(b) && a.verts.length === b.verts.length
    && a.n[0] * b.n[0] + a.n[1] * b.n[1] + a.n[2] * b.n[2] < -1 + E
    && a.verts.every((p) => b.verts.some((q) => Math.abs(p[0] - q[0]) <= E && Math.abs(p[1] - q[1]) <= E && Math.abs(p[2] - q[2]) <= E));
  for (const b of bodies) for (const f of b.faces) {
    owner.set(f, b);
    const k = keyOf(f);
    const list = byKey.get(k);
    const twin = list?.find((g) => !drop.has(g) && same(f, g));
    if (twin) { drop.add(twin); drop.add(f); continue; }
    if (list) list.push(f); else byKey.set(k, [f]);
  }
  return drop;
}

/** Every face's visible remainder: `[]` for a twin (no subtraction), else `uncovered`'s pieces (the face itself when nothing
 *  covers it). `twins` counts the faces short-circuited. */
export interface FaceCover { remains: Map<BodyFace, BodyFace[]>; twins: number }
const covers = new WeakMap<readonly Body[], FaceCover>();

/**
 * Chunk c2 (stages 2 and 3): the mesh's and the edges' one view of what other bodies cover. Built once per FROZEN bodies
 * array (partGeometry's) and kept by its identity, as seamIndex is (board-local, no pose: shared by every part with those
 * bodies); an unfrozen array is covered afresh (invariant 50's rule). `opts.twins === false` (TEST ONLY) takes today's route
 * for every face and is never memoised.
 */
export function faceCover(bodies: readonly Body[], opts?: { twins?: boolean }): FaceCover {
  const memo = !opts && Object.isFrozen(bodies);
  if (memo) { const hit = covers.get(bodies); if (hit) return hit; }
  const twins = opts?.twins === false ? new Set<BodyFace>() : twinFaces(bodies);
  const index = seamIndex(bodies);
  const remains = new Map<BodyFace, BodyFace[]>();
  for (const body of bodies) for (const f of body.faces) remains.set(f, twins.has(f) ? [] : uncovered(f, body, index));
  const cover = { remains, twins: twins.size };
  if (memo) covers.set(bodies, cover);
  return cover;
}
```
Note: `twinFaces` checks that the two faces belong to different bodies (`owner`). `withoutSeams` does not need that check: two faces of one convex body cannot be opposite and coplanar with one polygon. It is kept as a guard that costs nothing.

In `grainTiling.ts`:
1. Change `bodyMesh`'s signature to `bodyMesh(board: Board, body: Body, holes: readonly Hole[] = [], bodies?: readonly Body[], opts?: { twins?: boolean })`, and its call to `curvedPart(board, bodies, holes, opts)`.
2. Change `partMesh` to take `opts?: { twins?: boolean }` and pass it to `bodyMesh(board, body, holes, bodies, opts)`.
3. In `curvedPart`, change the signature to `curvedPart(board, bodies, holes, opts?: { twins?: boolean })` and replace:
```ts
  const hit = curvedParts.get(bodies);
  if (hit && hit.holes === holes) return hit;
  const index = seamIndex(bodies);
  const { points, canon } = welder();
  const faces = new Map<Body, BodyFace[]>();
  for (const body of bodies) {
    faces.set(body, body.faces.flatMap((f) => uncovered(f, body, index)).map((f) => {
```
with:
```ts
  const hit = opts ? undefined : curvedParts.get(bodies);
  if (hit && hit.holes === holes) return hit;
  // Chunk c2 (stage 2): each face's remainder from faceCover — an exact twin draws nothing without minusCover.
  const cover = faceCover(bodies, opts);
  const { points, canon } = welder();
  const faces = new Map<Body, BodyFace[]>();
  for (const body of bodies) {
    faces.set(body, body.faces.flatMap((f) => cover.remains.get(f)!).map((f) => {
```
Change its memo write to `if (!opts && Object.isFrozen(bodies)) curvedParts.set(bodies, part);`. Add to `curvedPart`'s doc comment: `Chunk c2: the seams come from faceCover (document/seams.ts), an exact twin pair dropped without subtraction.`

The holed, uncurved route in `bodyMesh` (`seams ? body.faces.flatMap((f) => uncovered(f, body, seams))`) stays on `uncovered`, so `bodyMeshIdentity` keeps its bytes.

- [ ] **Step 5: Run the tests**

Run:
```bash
npx vitest run src/viewport/twinSkip.test.ts src/viewport/curvesWatertight.test.ts src/viewport/sweptIdentity.test.ts src/viewport/bodyMeshIdentity.test.ts src/viewport/partMesh.test.ts src/viewport/sweptNormals.test.ts src/viewport/stopNormals.test.ts src/viewport/runoutMemo.test.ts 2>&1 | tail -5
```
Expected: all pass.

The planning prototype left all 54 `sweptIdentity` pins byte-identical, so their mesh slot is expected NOT to move. If some do move:
1. Confirm that `twinSkip.test.ts` and `curvesWatertight` pass for those fixtures.
2. Re-record only the mesh slot, with Task 2 Step 6's script, changing its assertion to require fields 0, 1 and 3 unchanged.
3. Add one line above `PINNED`: `Chunk c2 stage 2: the mesh slot re-recorded for <names> (exact twins dropped without minusCover; twinSkip.test.ts proves area, grain and normals).`

If `twinSkip`'s area check fails on a fixture, stop and report the fixture, the material and the difference. A sliver the twin test drops but `minusCover` kept is the spike's unproven case, and the ruling belongs to the user.

- [ ] **Step 6: Mutate the tests (do not commit the mutations)**

Apply each mutation alone. Run `npx vitest run src/viewport/twinSkip.test.ts src/viewport/curvesWatertight.test.ts`, record the result, then revert with `git checkout src/document/seams.ts`.

1. **Drop every face with ANY opposite coplanar face, regardless of its partner's polygon.** In `faceCover`'s loop, replace `twins.has(f) ? [] : uncovered(f, body, index)` with `index.faces.some((g, k) => index.owner[k] !== body && g.n[0] * f.n[0] + g.n[1] * f.n[1] + g.n[2] * f.n[2] < -1 + 1e-9 && Math.abs(g.n[0] * (g.verts[0]![0] - f.verts[0]![0]) + g.n[1] * (g.verts[0]![1] - f.verts[0]![1]) + g.n[2] * (g.verts[0]![2] - f.verts[0]![2])) <= 1e-9) ? [] : uncovered(f, body, index)`.
   Expected: the area check FAILS on the partner-removed fixtures (a partly covered face lost), and/or the leak check fails.
2. **Drop none:** `const twins = new Set<BodyFace>();` unconditionally.
   Expected: `the ogee loop has twins, and each draws nothing` FAILS (`cover.twins` 0).
3. **Loosen the twin test** (the stand-in for "tag a non-internal face", A1): in `twinFaces`' `same`, compare only `a.verts[0]` against `b.verts[0]` instead of every vertex.
   Expected: the area or leak check FAILS on some fixture.

If a mutation survives, report it with the reason. An equivalent mutant is a ruling, not a pass.

- [ ] **Step 7: Full suite and typecheck, then commit**

```bash
cd /home/alec/docker/sloyd && npm run build 2>&1 | tail -3 && npm test > tmp/c2/c2-t3.txt 2>&1; tail -6 tmp/c2/c2-t3.txt
```
Expected: the build prints `✓ built`, and every test passes.
```bash
git add src/document/seams.ts src/viewport/twinSkip.test.ts src/viewport/grainTiling.ts src/viewport/sweptIdentity.test.ts
git commit -m "perf(c2 stage 2): exact twin seams draw nothing without minusCover (faceCover)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Stage 3 — no edge candidate from a face other bodies cover completely

**Files:**
- Modify: `src/document/bodies.ts` (`curvedEdges`, :827–979)
- Modify: `src/document/sweepEdges.test.ts`
- Modify: `src/viewport/sweptIdentity.test.ts` (the edges slot, re-recorded only with Step 5's proof)

**Interfaces:**
- Consumes: `faceCover(bodies).remains` (Task 3).
- Produces: no new export. `curvedEdges`' fast path changes its candidates only.

- [ ] **Step 1: The gate (spec §2.3)**

Measure every `curvesPerf` row after stage 2, alone and in one full run:
```bash
cd /home/alec/docker/sloyd && rm -f tmp/c2/c2-perf-s2.txt && SLOYD_PERF_LOG=tmp/c2/c2-perf-s2.txt npx vitest run src/viewport/curvesPerf.test.ts > /dev/null 2>&1; rm -f tmp/c2/c2-perf-s2-full.txt && SLOYD_PERF_LOG=tmp/c2/c2-perf-s2-full.txt npm test > /dev/null 2>&1; uptime; sort -t$'\t' -k2 -n -r tmp/c2/c2-perf-s2-full.txt | head -8
```
Rule:
- **Stage 3 runs** if any row is over 40 ms, or over 34 ms in the full run.
- **Otherwise skip it.** Record `Task 4: skipped by spec §2.3's gate (worst full-run row <name> <ms>)` in the ledger and go to Task 5.

The planning measurement expects it to run.

- [ ] **Step 2: Write the failing test — fast == reference on every shared fixture**

In `src/document/sweepEdges.test.ts`:
1. Import `SWEPT_CASES` from `'./meshCases'`.
2. After the `b2EdgeCases` describe, add:
```ts
// Chunk c2 (stage 3, amendment A2): the fast path makes no candidate of a face other bodies cover completely; every face
// stays a wing. Judged as every fast path is: fast == reference, segments and joins, no crease joined — on every swept
// fixture chunk c1's identity pins hash (meshCases.ts), the loops among them.
describe('the fast swept edges equal the reference on every swept identity fixture (chunk c2)', () => {
  const built = SWEPT_CASES.filter(([, b]) => builtSwept(geometryBoard(b)).length > 0);
  it('the fixtures are what they claim', () => { expect(built.length).toBeGreaterThan(50); });
  it.each(built)('%s', (_name, board) => fastIsReference(board));
});
```
Run: `npx vitest run src/document/sweepEdges.test.ts 2>&1 | tail -4`.
Expected: PASS. This pins today's fast path on the shared list before the change; the RED comes from the mutations in Step 4. Record the count.

- [ ] **Step 3: Implement the candidate skip**

In `curvedEdges`, add the `faceCover` import (`import { faceCover } from './seams';`) and replace:
```ts
  const fast = sweptHere.length > 0 && !opts?.reference;
  if (fast) bodies = withoutSeams(bodies);
```
with:
```ts
  const fast = sweptHere.length > 0 && !opts?.reference;
  // Chunk c2 (stage 3, amendment A2): what other bodies cover, read off the bodies AS GIVEN (partGeometry's frozen array, so
  // the mesh's faceCover is reused) before the seams are dropped. A face with no visible remainder makes no candidate below.
  const hidden = fast ? faceCover(bodies).remains : null;
  if (fast) bodies = withoutSeams(bodies);
```
Then replace:
```ts
  const judged = bodyEdges(bodies, keep, (o, u) => smoothOn(o, u).map((s) => s.n), smoothPair, joins,
    seams?.skip);
```
with:
```ts
  // Chunk c2 (stage 3): a face other bodies cover completely (faceCover's remainder empty) is inside the part: an edge of its
  // own is never the only edge on a stretch you can see — a crease is bounded by a face that is seen, whose own edge makes the
  // candidate — so it makes none, and the lines only such faces made (most of a loop's: 312 of the ogee's 416) are not judged.
  // It still gives its wings to every line that is judged (inv 16: a face taken away as a wing drew phantom lines).
  const covered = hidden ? (f: BodyFace) => hidden.get(f)!.length === 0 : null;
  const skip = covered ? (f: BodyFace, a: V3) => covered(f) || (seams?.skip(f, a) ?? false) : seams?.skip;
  const judged = bodyEdges(bodies, keep, (o, u) => smoothOn(o, u).map((s) => s.n), smoothPair, joins, skip);
```
Add to the comment above `const fast`, after "the same line set and the same joins, pinned on every swept fixture (sweepEdges.test.ts).": ` Chunk c2: a face the part's other bodies cover completely makes no candidate (it stays a wing).`

- [ ] **Step 4: Run, then mutate**

Run:
```bash
npx vitest run src/document/sweepEdges.test.ts src/viewport/sweptIdentity.test.ts 2>&1 | grep -E "Tests |FAIL" | head -20
```
Expected: `sweepEdges` all pass. `sweptIdentity` may fail in its EDGES slot only: the lines are created in another order. That is Step 5.

Mutations, each alone. Run `npx vitest run src/document/sweepEdges.test.ts`, then `git checkout src/document/bodies.ts` and re-apply Step 3.
1. **Skip a partly covered face too:** in `covered`, `hidden.get(f)!.length === 0` → `hidden.get(f)![0] !== f` (any face whose remainder is not the face itself, i.e. any cover at all).
   Expected: FAIL (a visible remainder's crease lost).
2. **Take covered faces away as WINGS too:** pass `bodies.map((b) => ({ box: b.box, faces: b.faces.filter((f) => !covered!(f)) }))` to `bodyEdges` instead of `bodies`.
   Expected: FAIL (b2's phantom lines; fast ≠ reference).

Record both results.

- [ ] **Step 5: Re-record the edges slot only with proof**

For every `sweptIdentity` case whose edges slot moved:
1. Confirm it is in Step 2's `built` list and passed there. Fast == reference proves the same merged runs.
2. Regenerate with Task 2 Step 6's commands. Change the script's assertion to require fields 0, 2 and 3 unchanged, and count field 1.
3. Replace the moved entries.
4. Above `PINNED` add: `Chunk c2 stage 3: the edges slot re-recorded for every swept case (a covered face makes no candidate, so lines are created in another order; sweepEdges.test.ts proves the same runs and joins against the reference).`

Then run the full suite. A DRAWING test whose hash moved (Review Focus 4: `drawingIdentity`, the Plans sheet, part diagrams) is re-recorded only after its segments are shown to be the same merged runs: compare with `sweepEdges.test.ts`' `merged`/`sameRuns` in a scratch test. Name each such pin in the commit message.

- [ ] **Step 6: Typecheck, full suite, commit**

```bash
cd /home/alec/docker/sloyd && npm run build 2>&1 | tail -3 && npm test > tmp/c2/c2-t4.txt 2>&1; tail -6 tmp/c2/c2-t4.txt
git add src/document/bodies.ts src/document/sweepEdges.test.ts src/viewport/sweptIdentity.test.ts
git commit -m "perf(c2 stage 3): a face other bodies cover completely makes no edge candidate (stays a wing)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Guards lowered, the stage table, and the 40 ms gate

**Files:**
- Modify: `src/viewport/curvesPerf.test.ts`

**Interfaces:**
- Consumes: Tasks 2–4.

- [ ] **Step 1: Measure every row, four ways**

Close the Playwright browser. Then run in sequence, never in parallel:
```bash
cd /home/alec/docker/sloyd && rm -f tmp/c2/c2-alone-*.txt tmp/c2/c2-full-*.txt && for i in 1 2; do uptime; SLOYD_PERF_LOG=tmp/c2/c2-alone-$i.txt npx vitest run src/viewport/curvesPerf.test.ts > /dev/null 2>&1; done
for i in 1 2; do uptime; SLOYD_PERF_LOG=tmp/c2/c2-full-$i.txt npm test > tmp/c2/c2-full-$i-out.txt 2>&1; tail -4 tmp/c2/c2-full-$i-out.txt; done
python3 - <<'EOF'
import collections
rows = collections.defaultdict(list)
for f in ['alone-1', 'alone-2', 'full-1', 'full-2']:
    for line in open(f'tmp/c2/c2-{f}.txt'):
        name, ms = line.rstrip('\n').rsplit('\t', 1)
        rows[name].append((f, float(ms)))
for name, xs in rows.items():
    worst = max(x for _, x in xs)
    import math
    print(f"{worst:6.1f}  {max(40, math.ceil(worst * 1.25)):4d}  {name}  {xs}")
EOF
```
Expected: one line per row, giving the worst minimum, the proposed guard and the four minimums. Both full runs pass.

- [ ] **Step 2: Lower the guards**

For each row whose current guard is above 40, set it to `min(current, max(40, ⌈worst × 1.25⌉))`. Never raise a guard. Today those rows are:
- the bead loop (71);
- the cove loop (62);
- the ogee loop (89);
- the two loops (51);
- the two-side cove (62).

Every 40 ms row stays 40. Each changed row's comment gets one line, in the file's own style:
```ts
    // Chunk c2: <a>–<b> alone, <c>–<d> full → ⌈<worst> × 1.25⌉ = <n>.
```
Where a guard reaches 40, the line ends `→ 40`. The two loops row's `it` title carries its bound (`at most 51 ms`); keep the title and the bound in step.

Run: `npx vitest run src/viewport/curvesPerf.test.ts 2>&1 | tail -3`. Expected: all pass.

- [ ] **Step 3: Write the stage table**

Re-run the planning breakdown on the branch: bodies, edges, mesh and total per row, min of 9, this file alone. Use a scratch test. Its body is this plan's "Measured before planning" harness, timing `partMesh` instead of the per-body loop. Keep it out of the commit: create it as `src/viewport/zzStages.local.test.ts` and delete it after.

Keep the table for Task 6's history entry, with columns `Row | before c2 | after stage 1 | after stage 2 | after stage 3`. Use Task 1's planning numbers for "before", and the Task 3 and 4 gate measurements for the middle columns where they were taken.

- [ ] **Step 4: The 40 ms gate**

If every row's worst minimum is ≤ 40 alone: record `c2 meets the target` and go on. If not (the ogee loop is expected at ~45–50):
1. Do not start any further restructure.
2. Commit what is done (Step 5).
3. In the final report to the user, give the stage table and the remaining cost per stage for the over-40 rows:
   - bodies (~11 ms, `sweepBodies`);
   - `sectionSeams` (~5);
   - per-body mesh emission and swept normals (~11 on the ogee loop).
4. Present those three levers as the next decision. That is a spec amendment for the user, not part of this plan.

- [ ] **Step 5: Commit**

```bash
git add src/viewport/curvesPerf.test.ts
git commit -m "perf(c2): guards lowered from fresh measurements (min of 9, alone and full)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Browser after, the live pass, and the round's record

**Files:**
- Modify: `docs/browser-verification-swept-speed-c2.md`
- Modify: `CLAUDE.md`, `docs/history.md`, `docs/follow-ups.md`
- Create (if spatial): `docs/img/swept-speed-c2-*.png`

- [ ] **Step 1: The production timing after**

Repeat Task 1 Steps 2–4 on the branch head:
1. `npm run build`;
2. `vite preview` on 5181;
3. the same project, which the 5181 origin still holds: select Cove top, already Roman ogee;
4. the same 12 commits.

Append to the verification doc:
```markdown
## After stage 3 (perf-c2 at <hash>)

| Row | min (ms) | median (ms) | all 12 |
|---|---|---|---|
| ogee loop, Length commit | <min> | <median> | <times> |

Before → after: <min before> → <min after> ms (min), <median before> → <median after> (median).
```
Stop the preview.

- [ ] **Step 2: The live pass on the dev server (port 5180, software GL)**

Use the dev profile's existing projects ("Swept profiles check", "Stops on curves check"). Leave them in place. For each check, record a DOM readout or a screenshot under `docs/img/` if spatial.
1. **A swept loop draws whole.** Loop top and Cove top: no missing faces or cracks at Front, Iso and Top. Screenshot Iso of Cove top as `docs/img/swept-speed-c2-cove-top.png`.
2. **A stop and a two-side run:** Corner stop and Front and ends, at Iso.
3. **Picking.** Click the middle of Loop top's broad face: it selects, and the parts list shows ONE selection. Shift-click toggles it off once (Review Focus 3).
4. **Section.** Turn Section on (Top, through the loop's band). The cap shows, with no z-fight speckle against the merged faces. A click on the removed side passes through to what is drawn.
5. **Fading.** Open an assembly holding another part, if the project has one. Otherwise use the "Hide others" / group path the dev project allows. The swept part draws faded and grey; on close, its grain returns.
6. **Shaped ↔ plain** (Review Focus 2). On Loop top:
   1. Remove the profile: the part draws as boxes, with its edges.
   2. Undo: the loop is back, one mesh.
   3. Check the console for errors at each step.
7. **Console:** 0 errors; only the known warnings (the THREE deprecations, the software-GL performance message).

Append a `## Live pass (dev server, software GL)` section with one bullet per check. Add a `## Not exercised live` section: real-hardware shading (fu 393/394, for the user's eye), and a resize DRAG's feel. Close the browser.

- [ ] **Step 3: The round's record**

In `CLAUDE.md`:
1. **Status:** after the chunk c1 bullet, add a **Chunk c2** bullet in the same style:
   - branch `perf-c2`, not merged;
   - what each stage did (one sentence each);
   - the amendments A1–A4 awaiting the user's review;
   - the measured before → after per over-40 row;
   - whether "all under 40" was met (and, if not, the three named levers left);
   - no schema change; rollback free.
2. **Rounds shipped** table: one row, `chunk c2 | 10-19 | — | …`.
3. **Where things live:**
   - add `seams.ts` under `document/`: `seamIndex`, `uncovered` (moved from grainTiling), `twinFaces`, `faceCover` (the mesh's and the fast edges' one cover, memoised on frozen bodies);
   - add `meshCases.ts` (TEST-ONLY) beside `sweepFixtures.ts`;
   - in the `viewport/` entry, add `partMesh` (a shaped part's ONE geometry; no memo on bodies, A3).
4. **Invariant 16:** append one sentence: "The fast path makes no candidate of a face the part's other bodies cover completely (`faceCover`); it stays a wing (chunk c2)."
5. **Invariant 50:**
   - replace the guard numbers sentence with Task 5's;
   - add "A shaped part is ONE geometry (`partMesh`), never memoised on the bodies (they are shared across poses and ids). An exact twin seam draws nothing without `minusCover` (`faceCover`), judged by area, grain and normals against the reference route (`twinSkip.test.ts`)."
6. **Commands:** the test count from the last full run.

In `docs/history.md`, add a `## Chunk c2 (2026-10-19)` section:
- the stage table (Task 5 Step 3);
- the amendments and why;
- the prototypes from planning;
- the mutation results from Tasks 3 and 4;
- the browser timings before and after;
- the gate outcome.

In `docs/follow-ups.md`, on 393 and 394, append a `**Status:**` line naming c2's measured rows and what remains open. Close an entry only if all its speed rows are now ≤ 40; otherwise leave it open with the remaining rows.

- [ ] **Step 4: Verify and commit**

```bash
cd /home/alec/docker/sloyd && npm run build 2>&1 | tail -2 && git status --short
git add docs/browser-verification-swept-speed-c2.md docs/img CLAUDE.md docs/history.md docs/follow-ups.md
git commit -m "docs: chunk c2 — one geometry per shaped part, twin seams, covered-face candidates; browser timings, live pass

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: a clean tree. The branch stays unmerged: **merge and deploy on the user's word only.**
