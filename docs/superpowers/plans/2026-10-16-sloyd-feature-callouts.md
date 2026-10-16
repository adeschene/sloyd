# Feature Callouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lettered tags on the Plans sheet's Front/Side/Plan trios mark every hole row, angle cut and curve, with a key list
under each trio giving each letter's short bench line (fu 333, 279, 362).

**Architecture:** `document/featureKeys.ts` names each feature and builds its key line; `drawView` tags every drawn segment
with the feature it belongs to (one hidden-line pass, no second); `document/plans.ts` decides which trio keys which part;
`panels/planKeys.ts` (pure) picks each feature's view, letters, anchors and places the tags; `PlanTrio` draws them and the key
list.

**Tech Stack:** TypeScript, React 18, Vitest + Testing Library, SVG.

**Spec:** `docs/superpowers/specs/2026-10-16-sloyd-feature-callouts-design.md` (approved 2026-10-16).

## Global Constraints

- Branch `feature-callouts` from master; `git merge --no-ff` locally after the final review; no pull request; delete the branch.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Test-first; every new test is seen RED before its code, or mutated after (house rule: a test justified by an ordering, a
  refusal or a "cannot exceed" property is mutated).
- No schema change (`CURRENT_VERSION` stays 17).
- Every shown string is built in the module that builds it (inv 19); lengths only through `units/length.ts` with the
  DOCUMENT's units (inv 52); hole sizes through `holeLengthText`.
- A part with no holes, angle cuts or curves draws byte-for-byte as before (deep-equal `Drawing`, identical SVG); `pathOf`
  output unchanged; `bodyEdges` untouched (inv 16, 47).
- A drawing's segments are only TAGGED: the visible/hidden split, the segment list and its order are unchanged for every part.
- `npm run build` is the typecheck gate; `npm test` the full suite (4561 tests across 153 files before this round).

## Rulings made while writing this plan (for the user's review)

- **P1 Units in the key list.** The key list is an HTML note, like the part diagrams' notes, so it reads the bench lines'
  own formatting: `12 mm`, `6.4 mm dia`, not the bare mm of SVG dimension labels. Spec §3's metric example
  (`5 dia × 12 deep, every 32`) is amended to `Row of 21 holes, 6.4 mm dia × 10 mm deep, every 32 mm`. Imperial uses the
  straight `"` that `formatLength` prints (the spec's `″` was typography).
- **P2 No true view, hidden only.** Spec §2.3 has no step for a feature with no true view whose segments are all hidden (a
  hand-edited compound angle cut inside a case). It is keyed on its hidden lines in tie order (Front, Side, Plan) rather
  than listed as not shown, which would be false.
- **P3 Straight curve sides are not tagged.** `curveDrawEdges` knows the ARC chords; a straight outline side off the face
  boundary (hand-edited curves only; no preset has one) carries no tag. A hand-made curve of lines only is therefore listed
  "Not shown". Recorded as residue.

## Review Focus

1. A mirrored copy (schema 13) in the piece trio: its features' true views and tags must match the unmirrored copy's
   (directions compared by `|dot|`). Pinned in Task 1.
2. A metric project: key lines read mm through the bench-line helpers, holes at 0.1 mm. Pinned in Task 1.
3. Four rounded corners collapsed into one key line: ONE feature, and all four corners' segments belong to it. Pinned in
   Tasks 1 and 2.
4. A tag near the figure's edge never leaves the viewBox; a crowded figure never draws two overlapping tags. Pinned in
   Task 4.
5. An assembly placed three times: its trio keys its features once, counted as drawn. Pinned in Task 3.

---

### Task 1: Key lines — `document/featureKeys.ts`

**Files:**
- Modify: `src/document/holeText.ts` (export `holeSizeText`, `holePitchText`; `holeLineBase` uses them — byte-identical)
- Create: `src/document/featureKeys.ts`
- Test: `src/document/featureKeys.test.ts`

**Interfaces:**
- Consumes: `holeFaults` (`holeFaults.ts`), `curveFaults`, `archFields`, `bowFields`, `cornerFields`, `localSegments`
  (`curves.ts`), `curveLineEntries` (`curveText.ts`), `angleDegrees` (`angleText.ts`), `chamferFields`, `taperFields`,
  `depthAt`, `keptHalfSpace` (`angleCuts.ts`), `toWorld` (`snapPoints.ts`), `DIMENSION_ORDER` (`geometry.ts`).
- Produces:
  ```ts
  export type FeatureKind = 'hole' | 'angle' | 'curve';
  export const featureTag: (part: string, kind: FeatureKind, id: string) => string;   // `${part}:${kind}:${id}`
  export interface PartFeature {
    key: string;            // identity: the first tag
    tags: string[];         // every segment tag the feature owns (four for collapsed corners)
    part: string;           // the drawn part's id
    text: string;           // the key line, fault suffix included
    trueAxis: Vec3 | null;  // hole / curve: shows true looking along this (world, unit)
    trueNormal: Vec3 | null;// angle cut: shows true when the view direction lies in this plane (world, unit normal)
  }
  export const FAULT_SUFFIX = ' — check the cut list';
  export function partFeatures(b: Board, units: Units): PartFeature[];   // holes, then angle cuts, then curves, stored order
  ```
  From `holeText.ts`: `holeSizeText(r: HoleRow, units: Units): string` (`1/4" dia × 3/8" deep`, `… × through`, with the
  imperial mm aside), `holePitchText(r: HoleRow, units: Units): string` (`1-17/64" (32 mm)`, `32 mm`).

- [ ] **Step 1: Branch**

```bash
cd /home/alec/docker/sloyd && git switch -c feature-callouts
```

- [ ] **Step 2: Write the failing tests**

`src/document/featureKeys.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { archCurve, bowCurve, chamferCut, createBoard, defaultBevel, defaultHingeCup, defaultHole, defaultShelfPinRow, miterCut, taperCut } from './document';
import { defaultCorners } from './curves';
import { mirrorPart } from './frames';
import { IMPERIAL } from '../units/length';
import { ARCH } from './curveFixtures';
import { FAULT_SUFFIX, featureTag, partFeatures } from './featureKeys';
import type { Board } from './types';

const MM = { display: 'metric-mm' as const, precision: 16 };
const side = createBoard({ id: 's', length: 30, width: 11.25, thickness: 0.75 });
const texts = (b: Board, u = IMPERIAL) => partFeatures(b, u).map((f) => f.text);

describe('partFeatures: key lines (spec §3)', () => {
  it('a hole row, imperial and metric (ruling P1)', () => {
    const b = { ...side, holes: [{ id: 'r', ...defaultShelfPinRow(side)! }] };
    expect(texts(b)).toEqual(['Row of 21 holes, 1/4" dia × 3/8" deep, every 1-17/64" (32 mm)']);
    expect(texts(b, MM)).toEqual(['Row of 21 holes, 6.4 mm dia × 10 mm deep, every 32 mm']);
  });
  it('a single hole and a hinge cup keep the mm aside; a through hole', () => {
    expect(texts({ ...side, holes: [{ id: 'h', ...defaultHingeCup(side) }] })).toEqual(['Hole 1-3/8" (35 mm) dia × 1/2" deep']);
    expect(texts({ ...side, holes: [{ id: 'o', ...defaultHole(side), depth: 'through' }] })).toEqual(['Hole 1/4" dia × through']);
  });
  it('miter, bevel, chamfer (equal and unequal legs), taper (runs out, and does not)', () => {
    const rail = createBoard({ id: 'r', length: 20, width: 3, thickness: 0.75 });
    const cuts = [
      { id: 'm', ...miterCut({ end: 'max', across: 'width', longSide: 'min', ratio: 1 }, rail) },
      { id: 'v', ...defaultBevel(rail) },
      { id: 't', ...taperCut({ face: 'width', from: 'min', end: 'min', start: 18, amount: 0.5 }) },
      { id: 'c', ...chamferCut({ face: 'width', from: 'max', along: 'thickness', alongFrom: 'max', legFace: 0.25, legAlong: 0.25 }, rail) },
      { id: 'u', ...chamferCut({ face: 'width', from: 'min', along: 'thickness', alongFrom: 'max', legFace: 0.25, legAlong: 0.5 }, rail) },
    ];
    expect(texts({ ...rail, angleCuts: cuts })).toEqual(['Miter 45.0°', 'Bevel 15.0°', 'Taper 1/2" over 18"', 'Chamfer 1/4"', 'Chamfer 1/4" × 1/2"']);
    const both = { id: 'b', kind: 'taper' as const, face: 'width' as const, from: 'min' as const, along: 'length' as const, alongFrom: 'min' as const, points: [[0, 0.25], [20, 0.5]] as [[number, number], [number, number]] };
    expect(texts({ ...rail, angleCuts: [both] })).toEqual(['Taper 1/4" to 1/2"']);
  });
  it('arch, half-round notch, bow, one corner, four corners collapsed (one feature, four tags)', () => {
    const apron = createBoard({ id: 'a', length: 30, width: 5, thickness: 0.75 });
    expect(texts({ ...apron, curves: [ARCH] })).toEqual(['Arch, 24" span, 1-1/2" rise (radius 48-3/4")']);
    const notch = { id: 'n', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 14, span: 2, rise: 1 }) };
    expect(texts({ ...apron, curves: [notch] })).toEqual(['Half-round notch, 2" wide']);
    const rail = createBoard({ id: 'r', length: 18, width: 3, thickness: 0.75 });
    const bow = { id: 'w', ...bowCurve({ through: 'width', along: 'length', side: 'min', span: 18, rise: 0.5 }) };
    expect(texts({ ...rail, curves: [bow] })).toEqual(['Bow 1/2" over 18" (radius 81-1/4")']);
    const top = createBoard({ id: 'p', length: 36, width: 20, thickness: 0.75 });
    const four = defaultCorners(top).map((c, i) => ({ id: `k${i}`, ...c }));
    const fs = partFeatures({ ...top, curves: four }, IMPERIAL);
    expect(fs).toHaveLength(1);
    expect(fs[0]!.text).toMatch(/^Four rounded corners, \S+ radius$/);
    expect(fs[0]!.tags).toEqual(four.map((c) => featureTag('p', 'curve', c.id)));
    expect(texts({ ...top, curves: [four[0]!] })[0]).toMatch(/^Rounded corner, \S+ radius$/);
  });
  it('no position words, no through words (R1)', () => {
    const b = { ...side, holes: [{ id: 'r', ...defaultShelfPinRow(side)! }], curves: [] };
    for (const t of texts(b)) expect(t).not.toMatch(/ from | in from | side|face|cut through/);
  });
  it('a faulted hole and an overrunning angle cut end with the suffix', () => {
    const off = { ...side, holes: [{ id: 'o', ...defaultHole(side), inset: 50 }] };
    expect(texts(off)[0]!.endsWith(FAULT_SUFFIX)).toBe(true);
    const short = createBoard({ id: 'q', length: 2, width: 3, thickness: 0.75 });
    const deep = { id: 'm', kind: 'miter' as const, face: 'length' as const, from: 'max' as const, along: 'width' as const, alongFrom: 'min' as const, points: [[0, 0], [3, 3]] as [[number, number], [number, number]] };
    expect(texts({ ...short, angleCuts: [deep] })[0]!.endsWith(FAULT_SUFFIX)).toBe(true);
  });
});

describe('partFeatures: identity and true views', () => {
  it('keys and tags are featureTag of the drawn part', () => {
    const b = { ...side, holes: [{ id: 'r', ...defaultShelfPinRow(side)! }] };
    const [f] = partFeatures(b, IMPERIAL);
    expect(f!.key).toBe('s:hole:r');
    expect(f!.tags).toEqual(['s:hole:r']);
    expect(f!.part).toBe('s');
  });
  it('a hole in the thickness face of a flat part shows true looking down world Y', () => {
    const [f] = partFeatures({ ...side, holes: [{ id: 'r', ...defaultShelfPinRow(side)! }] }, IMPERIAL);
    expect(f!.trueAxis!.map((x) => Math.abs(Math.round(x)))).toEqual([0, 1, 0]);
    expect(f!.trueNormal).toBeNull();
  });
  it('a mirrored copy has the same true directions up to sign (Review Focus 1)', () => {
    const b = { ...side, holes: [{ id: 'r', ...defaultShelfPinRow(side)! }], angleCuts: [{ id: 't', ...taperCut({ face: 'width', from: 'min', end: 'min', start: 18, amount: 0.5 }) }] };
    const a = partFeatures(b, IMPERIAL);
    const m = partFeatures(mirrorPart(b), IMPERIAL);
    const abs = (v: number[] | null) => v && v.map((x) => Math.abs(x).toFixed(9));
    expect(m.map((f) => [abs(f.trueAxis), abs(f.trueNormal), f.text])).toEqual(a.map((f) => [abs(f.trueAxis), abs(f.trueNormal), f.text]));
  });
  it('a featureless part has no features', () => {
    expect(partFeatures(side, IMPERIAL)).toEqual([]);
  });
});
```

If a fixture's cut lands outside its part (a fault suffix appears where none is expected), the fixture is wrong, not
the code: check it against `angleCuts.ts`' writers (`miterCut`, `chamferCut`: legs into `face` and `along`).

- [ ] **Step 3: Run to verify RED**

Run: `npx vitest run src/document/featureKeys.test.ts`
Expected: FAIL — `Cannot find module './featureKeys'` (or a missing export).

- [ ] **Step 4: Export the hole size helpers (byte-identical refactor)**

In `src/document/holeText.ts`, above `holeLineBase`, add and use:

```ts
/** A hole's size as the bench line prints it (`1/4" dia × 3/8" deep`; imperial with the mm aside): ONE home, read by the
 *  bench line and the Plans sheet's key lines (feature callouts spec §3). */
export function holeSizeText(r: HoleRow, units: Units): string {
  const metric = isMetric(units);
  const dia = `${holeLengthText(r.diameter, units, 'diameter')}${metric ? '' : mm(r.diameter)}`;
  return `${dia} dia × ${r.depth === 'through' ? 'through' : `${formatLength(r.depth, units)} deep`}`;
}

/** A row's pitch as the bench line prints it (1/64 at least; imperial with the mm aside). */
export function holePitchText(r: HoleRow, units: Units): string {
  return `${holeLengthText(r.pitch, units, 'pitch')}${isMetric(units) ? '' : mm(r.pitch)}`;
}
```

and in `holeLineBase` replace the `dia`/`size` lines and the `pitch` line with `const size = holeSizeText(r, units);` and
`const pitch = holePitchText(r, units);` (remove the now-unused `dia`).

Run: `npx vitest run src/document/holeText.test.ts`
Expected: PASS, unchanged count (the bench lines are byte-identical).

- [ ] **Step 5: Write `featureKeys.ts`**

```ts
import type { AngleCut, Board, CurveCut, Dimension, HoleRow } from './types';
import type { Vec3 } from './frames';
import { formatLength, type Units } from '../units/length';
import { DIMENSION_ORDER } from './geometry';
import { toWorld } from './snapPoints';
import { holeFaults } from './holeFaults';
import { holePitchText, holeSizeText } from './holeText';
import { angleDegrees } from './angleText';
import { chamferFields, depthAt, keptHalfSpace, taperFields } from './angleCuts';
import { archFields, bowFields, cornerFields, curveFaults, localSegments } from './curves';
import { curveLineEntries } from './curveText';

/**
 * The Plans sheet's feature keys (feature callouts spec §2.2, §3): ONE home for a feature's identity, the segment tags it
 * owns, its key line (a short bench line: what it is and its key size, never where — the tag on the drawing is the where,
 * and the part diagram has the stations) and the directions it shows true from. Lengths through the document's units
 * (inv 52); every string built here (inv 19).
 */
export type FeatureKind = 'hole' | 'angle' | 'curve';
export const featureTag = (part: string, kind: FeatureKind, id: string) => `${part}:${kind}:${id}`;
export const FAULT_SUFFIX = ' — check the cut list';

export interface PartFeature {
  key: string;
  tags: string[];
  part: string;
  text: string;
  trueAxis: Vec3 | null;
  trueNormal: Vec3 | null;
}

const ORIGIN = { length: 0, width: 0, thickness: 0 };
/** A board-local direction in the drawing's frame, unit length (the composition's turn and mirror resolved by toWorld). */
function worldDir(b: Board, v: readonly number[]): Vec3 {
  const o = toWorld(b, ORIGIN);
  const p = toWorld(b, { length: v[0]!, width: v[1]!, thickness: v[2]! });
  const d = [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
  const l = Math.hypot(d[0]!, d[1]!, d[2]!);
  return [d[0]! / l, d[1]! / l, d[2]! / l];
}
const axisOf = (b: Board, dim: Dimension) => worldDir(b, DIMENSION_ORDER.map((d) => (d === dim ? 1 : 0)));
const radiusOf = (span: number, rise: number) => (span * span / 4 + rise * rise) / (2 * rise);

function holeText(r: HoleRow, units: Units): string {
  const size = holeSizeText(r, units);
  return r.count === 1 ? `Hole ${size}` : `Row of ${r.count} holes, ${size}, every ${holePitchText(r, units)}`;
}

/** An angle cut a later resize pushed past its part: its line runs deeper than the dimension it enters (fu 296's note). */
const overruns = (b: Board, c: AngleCut) => Math.max(depthAt(c, 0), depthAt(c, b[c.along])) > b[c.face] + 1e-9;

function angleText(b: Board, c: AngleCut, units: Units): string {
  const f = (n: number) => formatLength(n, units);
  const deg = `${angleDegrees(c).toFixed(1)}°`;
  switch (c.kind) {
    case 'miter': return `Miter ${deg}`;
    case 'bevel': return `Bevel ${deg}`;
    case 'chamfer': {
      const cf = chamferFields(c, b);
      if (!cf) return `Chamfer ${deg}`;
      return cf.legFace === cf.legAlong ? `Chamfer ${f(cf.legFace)}` : `Chamfer ${f(cf.legFace)} × ${f(cf.legAlong)}`;
    }
    case 'taper': {
      const A = b[c.along];
      const t = taperFields(c, b);
      if (t.amount > 0 && Number.isFinite(t.start) && t.start > 0 && t.start <= A + 1e-9) return `Taper ${f(t.amount)} over ${f(t.start)}`;
      return `Taper ${f(Math.max(0, depthAt(c, 0)))} to ${f(Math.max(0, depthAt(c, A)))}`;
    }
  }
}

function curveText(c: CurveCut, b: Board, units: Units, collapsed: boolean): string {
  const f = (n: number) => formatLength(n, units);
  const arch = archFields(c);
  if (arch) {
    if (arch.rise === arch.span / 2) return `Half-round notch, ${f(arch.span)} wide`;
    return `Arch, ${f(arch.span)} span, ${f(arch.rise)} rise (radius ${f(radiusOf(arch.span, arch.rise))})`;
  }
  const bow = bowFields(c);
  if (bow) return `Bow ${f(bow.rise)} over ${f(bow.span)} (radius ${f(radiusOf(bow.span, bow.rise))})`;
  const corner = cornerFields(c);
  if (corner) return `${collapsed ? 'Four rounded corners' : 'Rounded corner'}, ${f(corner.radius)} radius`;
  const segs = localSegments(b, c);
  const arcs = segs.filter((s) => s.kind === 'arc').length;
  const lines = segs.length - arcs;
  return `Curve: ${arcs} arc${arcs === 1 ? '' : 's'} and ${lines} line${lines === 1 ? '' : 's'}`;
}

export function partFeatures(b: Board, units: Units): PartFeature[] {
  const out: PartFeature[] = [];
  const push = (kind: FeatureKind, ids: string[], text: string, faulted: boolean, trueAxis: Vec3 | null, trueNormal: Vec3 | null) => {
    const tags = ids.map((id) => featureTag(b.id, kind, id));
    out.push({ key: tags[0]!, tags, part: b.id, text: faulted ? text + FAULT_SUFFIX : text, trueAxis, trueNormal });
  };
  for (const r of b.holes) push('hole', [r.id], holeText(r, units), holeFaults(b, r).length > 0, axisOf(b, r.face), null);
  for (const c of b.angleCuts) {
    const h = keptHalfSpace(b, c);
    push('angle', [c.id], angleText(b, c, units), overruns(b, c), null, h ? worldDir(b, h.n) : null);
  }
  // One feature per bench line: `curveLineEntries` is THE home of the four-corner collapse (curves spec Q6).
  for (const e of curveLineEntries(b, units)) {
    const cs = e.ids.map((id) => b.curves.find((c) => c.id === id)!);
    push('curve', e.ids, curveText(cs[0]!, b, units, e.ids.length === 4), cs.some((c) => curveFaults(b, c).length > 0), axisOf(b, cs[0]!.through), null);
  }
  return out;
}
```

If `localSegments`' element kind field is not `kind`, match `curveText.ts`'s use (`s.kind === 'arc'` there).
`curveLineEntries` already drops faulted corners from the collapse, so a faulted corner stays its own feature.

- [ ] **Step 6: Run to verify GREEN**

Run: `npx vitest run src/document/featureKeys.test.ts src/document/holeText.test.ts`
Expected: PASS.

- [ ] **Step 7: Mutate**

One at a time, each must turn a test red, then restore with `cp` from a backup (never `git checkout`):
- `FAULT_SUFFIX` appended unconditionally;
- `e.ids.length === 4` → `false`;
- `holeSizeText`'s mm aside dropped;
- `worldDir` returns the LOCAL vector (skip `toWorld`): the mirrored-copy test or the world-Y test must fail — if neither
  does, strengthen the world-Y test with a turned (rotation 90) part.

- [ ] **Step 8: Commit**

```bash
git add src/document/featureKeys.ts src/document/featureKeys.test.ts src/document/holeText.ts
git commit -m "feature callouts: key lines and feature identity (featureKeys.ts)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Tag the drawing — `drawing.ts`, `holeDrawing.ts`, `curveDrawing.ts`

**Files:**
- Modify: `src/document/holeDrawing.ts` (a tagged builder; the old export maps it)
- Modify: `src/document/curveDrawing.ts` (`DrawEdge.curve`, `silhouetteLines`' `curve`)
- Modify: `src/document/drawing.ts` (`Seg2.feature`, `Seg3.feature`, angle classification)
- Test: `src/document/drawing.test.ts`

**Interfaces:**
- Consumes: `featureTag` (Task 1), `keptHalfSpace` (`angleCuts.ts`).
- Produces: `Seg2 { a; b; part; feature?: string }` — `feature` is ABSENT (not `undefined`) on an untagged segment;
  `holeDrawingTagged(b, toward, visibleOnly?): { A: Vec3; E: Vec3; row: string }[]`;
  `DrawEdge { p; q; path?; curve?: string }`; `silhouetteLines(...)` items gain `curve: string`.

- [ ] **Step 1: Write the failing tests** (append to `src/document/drawing.test.ts`; add imports `defaultShelfPinRow`,
  `taperCut` from `./document`, `ARCH` from `./curveFixtures`, `defaultCorners` already imported from `./curves`)

```ts
describe('drawView: feature tags (feature callouts spec §4.1)', () => {
  const tags = (segs: Seg2[]) => new Set(segs.flatMap((s) => (s.feature ? [s.feature] : [])));
  it('a part with no features draws byte-for-byte as before: no segment carries the key at all', () => {
    const d = drawView([box('p', 10, 4, 2)], FRONT);
    for (const s of [...d.visible, ...d.hidden]) expect('feature' in s).toBe(false);
  });
  it('a hole row: its rims are tagged in its true view (Plan) and its walls in Front', () => {
    const b = box('s', 30, 11.25, 0.75);
    const pin = { id: 'r', ...defaultShelfPinRow(b)! };
    const withPins = { ...b, holes: [pin] };
    expect(tags(drawView([withPins], TOP).visible)).toEqual(new Set(['s:hole:r']));
    const front = drawView([withPins], FRONT);
    expect(tags([...front.visible, ...front.hidden]).has('s:hole:r')).toBe(true);
  });
  it('tagging changes nothing else: the same segments, in the same order, with the key removed', () => {
    const b = box('s', 30, 11.25, 0.75);
    const withPins = { ...b, holes: [{ id: 'r', ...defaultShelfPinRow(b)! }] };
    const strip = (segs: Seg2[]) => segs.map(({ a, b: e, part }) => ({ a, b: e, part }));
    for (const v of [FRONT, SIDE, TOP]) {
      const d = drawView([withPins], v);
      const again = drawView([withPins], v);
      expect(strip(d.visible)).toEqual(strip(again.visible));
      expect(d.visible.length + d.hidden.length).toBeGreaterThan(0);
    }
  });
  it('an angle cut: the taper face edges are tagged by plane membership', () => {
    const leg = box('L', 28, 1.75, 1.75, [0, 0, 0], { angleCuts: [{ id: 't', ...taperCut({ face: 'width', from: 'min', end: 'min', start: 20, amount: 0.5 }) }] });
    const all = (v: typeof FRONT) => { const d = drawView([leg], v); return tags([...d.visible, ...d.hidden]); };
    expect(all(FRONT).has('L:angle:t') || all(TOP).has('L:angle:t')).toBe(true);
    // An edge NOT on the taper's plane is untagged: the far end's square edges.
    const d = drawView([leg], SIDE);
    expect(d.visible.some((s) => !s.feature)).toBe(true);
  });
  it('a curve: arc chords in its true view and silhouettes across it are tagged', () => {
    const apron = box('a', 30, 5, 0.75, [0, 0, 0], { curves: [ARCH] });
    expect(tags(drawView([apron], TOP).visible).has('a:curve:c1')).toBe(true);
    const f = drawView([apron], FRONT);
    expect(tags([...f.visible, ...f.hidden]).has('a:curve:c1')).toBe(true);
  });
  it('four corners: every corner tagged with its own id (one feature owns all four, Task 1)', () => {
    const top = box('p', 36, 20, 0.75);
    const four = defaultCorners(top).map((c, i) => ({ id: `k${i}`, ...c }));
    expect(tags(drawView([{ ...top, curves: four }], TOP).visible)).toEqual(new Set(four.map((c) => `p:curve:${c.id}`)));
  });
});
```

Flat at turn 0 is length on X, THICKNESS on Y (up), width on Z — so a hole in the thickness face looks round from TOP, and an
arch cut through the thickness shows its outline from TOP. If an expectation's view is wrong for the fixture, the fixture
comment above `box` is the authority — fix the view, never weaken to "some view".

- [ ] **Step 2: Run to verify RED**

Run: `npx vitest run src/document/drawing.test.ts -t "feature tags"`
Expected: FAIL — the tag sets are empty (`feature` never set); the featureless test may already pass (it is the
byte-identity guard; its mutation is Step 6).

- [ ] **Step 3: Holes — a tagged builder**

In `src/document/holeDrawing.ts`, rename the body of `holeDrawingSegments` to a new export
`holeDrawingTagged(b, toward, visibleOnly = false): { A: Vec3; E: Vec3; row: string }[]`, changing every
`out.push([X, Y])` to `out.push({ A: X, E: Y, row: h.row })` (the wall loop destructures `h` too:
`for (const { h, C, A, r, clean } of frames)`), and make the old export a map:

```ts
export function holeDrawingSegments(b: Board, toward: readonly number[], visibleOnly = false): [Vec3, Vec3][] {
  return holeDrawingTagged(b, toward, visibleOnly).map(({ A, E }) => [A, E]);
}
```

Run: `npx vitest run src/document/holeDrawing.test.ts` — Expected: PASS, unchanged.

- [ ] **Step 4: Curves — carry the curve id**

In `src/document/curveDrawing.ts`: `export interface DrawEdge { p: V3; q: V3; path?: {…}; curve?: string }`; in
`curveDrawEdges` add `curve: c.id` to each chord object (`({ arc: s, …, k, curve: c.id })`) and return
`{ p, q, path: { … }, curve: ch.curve }` for a matched edge (the unmatched `{ p, q }` is unchanged). In `silhouetteLines`
the return type becomes `{ A: V3; E: V3; lift: V3; curve: string }[]` and the push is
`out.push({ A: W(q, t0), E: W(q, t1), lift, curve: c.id })`.

Run: `npx vitest run src/document/curveDrawing.test.ts` — Expected: PASS, unchanged.

- [ ] **Step 5: `drawing.ts` — Seg3/Seg2 carry the key; angle cuts by plane**

```ts
export interface Seg2 { a: P2; b: P2; part: string; feature?: string }
interface Seg3 { A: Vec3; E: Vec3; path?: { pts: Vec3[]; at: number[] }; lift?: Vec3; feature?: string }

/** The angle cut whose plane holds both board-local ends (feature callouts spec §4.1): the first in stored order. Edges
 *  are NOT built from faces here, so `bodyEdges` stays byte-for-byte; plane membership is the whole test. */
function angleTag(b: Board, p: readonly number[], q: readonly number[]): string | undefined {
  for (const c of b.angleCuts) {
    const h = keptHalfSpace(b, c);
    if (!h) continue;
    const on = (x: readonly number[]) => Math.abs(h.n[0] * x[0]! + h.n[1] * x[1]! + h.n[2] * x[2]! - h.d) <= DRAW_EPS;
    if (on(p) && on(q)) return featureTag(b.id, 'angle', c.id);
  }
  return undefined;
}
const withTag = <T extends object>(s: T, feature: string | undefined): T & { feature?: string } => (feature ? { ...s, feature } : s);
const v3 = (s: { length: number; width: number; thickness: number }) => [s.length, s.width, s.thickness];
```

`partSegments`: the uncurved branch becomes
`partGeometry(b).edges.map(([p, q]) => withTag({ A: toWorld(b, p), E: toWorld(b, q) }, angleTag(b, v3(p), v3(q))))`; in the
curved branch compute `const tag = e.curve ? featureTag(b.id, 'curve', e.curve) : angleTag(b, e.p, e.q);` and wrap each of
the three returns in `withTag(…, tag)`.

In `drawView`'s segment list:

```ts
...holeDrawingTagged(b, view.toward, visibleOnly).map(({ A, E, row }) => ({ A, E, feature: featureTag(b.id, 'hole', row) })),
...silhouetteLines(b, view.toward).map(({ curve, ...s }) => ({ ...s, feature: featureTag(b.id, 'curve', curve) })),
```

and in `push`, both `out.push({ a: …, b: …, part: b.id })` calls become
`out.push(withTag({ a: …, b: …, part: b.id }, seg.feature))`. Imports: `holeDrawingTagged`, `featureTag`
(`./featureKeys`), `keptHalfSpace` (`./angleCuts`).

`keptHalfSpace`'s plane is `n · x = d` in board-local (length, width, thickness) coordinates — the same frame as
`partGeometry` edges and `DrawEdge.p/q`. If the taper test stays red, print one edge's `n·p − d` to confirm the sign of `d`
before changing anything else.

- [ ] **Step 6: Run GREEN, then mutate**

Run: `npx vitest run src/document/drawing.test.ts src/document/holeDrawing.test.ts src/document/curveDrawing.test.ts`
Expected: PASS.

Mutations (each must go red; restore with `cp`):
- `withTag` always adds `feature` (even `undefined`): the featureless byte-identity test fails;
- `angleTag` returns the first cut without the plane test: the "untagged far end" assertion fails;
- the silhouette map drops `feature`: the curve Front test fails (if it does not, the arch's Front lines are chord edges
  edge-on — then assert on SIDE instead and record which view carries silhouettes).

Then the whole suite once: `npm test 2>&1 | tail -5` — Expected: all pass (every existing drawing test is the regression
guard that tagging changed nothing).

- [ ] **Step 7: Commit**

```bash
git add src/document/drawing.ts src/document/holeDrawing.ts src/document/curveDrawing.ts src/document/drawing.test.ts
git commit -m "feature callouts: drawView tags each segment with its feature

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Which trio keys which part — `document/plans.ts`

**Files:**
- Modify: `src/document/plans.ts`
- Test: `src/document/plans.test.ts`

**Interfaces:**
- Consumes: `planAssemblies`, `partsBelow` / `worldParts` ids (`joinPath`: `inst/part`).
- Produces: `PlanAssembly.keyed: ReadonlySet<string>` (ids of `parts` this trio keys);
  `export function pieceKeyed(doc: SloydDocument, assemblies: readonly PlanAssembly[]): ReadonlySet<string>`.

- [ ] **Step 1: Write the failing tests** (append to `plans.test.ts`; import `pieceKeyed`, `worldParts` from `./tree`)

```ts
describe('keyed parts (feature callouts spec §2.1)', () => {
  it('each part is keyed by its innermost LISTED assembly; the piece trio keys only loose parts', () => {
    const doc = cabinetsDoc();
    const as = planAssemblies(doc);
    expect([...pieceKeyed(doc, as)]).toEqual(['r']);
    const by = new Map(as.map((a) => [a.definition, [...a.keyed]]));
    expect(by.get('dc')).toEqual(['side']);    // dr/front belongs to dd, listed and deeper
    expect(by.get('dd')).toEqual(['front']);
    expect(by.get('ds')).toEqual(['only']);
  });
  it('every world part is keyed exactly once across the sheet (an assembly placed 3 times keys once)', () => {
    const doc = cabinetsDoc();
    const as = planAssemblies(doc);
    const owners = worldParts(doc).map((p) => p.id.split('/').at(-1)!);
    const keyedIds = [...pieceKeyed(doc, as), ...as.flatMap((a) => [...a.keyed])];
    expect(new Set(keyedIds)).toEqual(new Set(owners));
    expect(keyedIds).toHaveLength(new Set(keyedIds).size);
  });
  it('a sole-child wrapper is not listed, so its parts are keyed by the trio above', () => {
    const doc: SloydDocument = {
      ...createDocument('W'),
      instances: [{ id: 'w', name: 'Wrap', definition: 'dw', position: [0, 0, 0], rotation: 0 }],
      definitions: [{ id: 'dw', boards: [createBoard({ id: 'b', name: 'B' })], instances: [] }],
    };
    const as = planAssemblies(doc);
    expect(as).toEqual([]);
    expect([...pieceKeyed(doc, as)]).toEqual(['w/b']);
  });
});
```

- [ ] **Step 2: RED** — `npx vitest run src/document/plans.test.ts` → FAIL (`pieceKeyed` not exported; `keyed` undefined).

- [ ] **Step 3: Implement**

```ts
type Container = { boards: StoredBoard[]; instances: Instance[] };

/** The ids among `parts` (paths relative to `c`) that THIS trio keys: a part is keyed by the innermost LISTED assembly on
 *  its path (feature callouts spec §2.1), so a deeper listed definition on the path takes it. */
function keyedHere(doc: SloydDocument, c: Container, parts: readonly Board[], listed: ReadonlySet<string>): Set<string> {
  const defs = new Map(doc.definitions.map((d) => [d.id, d]));
  const out = new Set<string>();
  for (const b of parts) {
    let cur: Container = c;
    let mine = true;
    for (const seg of b.id.split(PATH_SEPARATOR).slice(0, -1)) {
      const d = defs.get(cur.instances.find((i) => i.id === seg)?.definition ?? '');
      if (!d) break;
      if (listed.has(d.id)) { mine = false; break; }
      cur = d;
    }
    if (mine) out.add(b.id);
  }
  return out;
}
```

In `planAssemblies`, build the filtered list first, then
`const listed = new Set(list.map((a) => a.definition));` and return
`list.map((a) => ({ ...a, keyed: keyedHere(doc, defs.get(a.definition)!, a.parts, listed) }))` (add `keyed` to the
interface with a doc comment). Export:

```ts
export function pieceKeyed(doc: SloydDocument, assemblies: readonly PlanAssembly[]): ReadonlySet<string> {
  return keyedHere(doc, doc, worldParts(doc), new Set(assemblies.map((a) => a.definition)));
}
```

(`PATH_SEPARATOR` and `worldParts` from `./tree`; if importing `worldParts` into `plans.ts` creates a cycle, use
`partsBelow(doc, doc)` — the same list.)

- [ ] **Step 4: GREEN** — `npx vitest run src/document/plans.test.ts` → PASS.

- [ ] **Step 5: Mutate** — `listed.has(d.id)` → `false` (every part keyed by the piece: the first two tests fail); drop the
  `break` after `mine = false` (must still pass — record that it is an optimisation, not a rule). Restore with `cp`.

- [ ] **Step 6: Commit**

```bash
git add src/document/plans.ts src/document/plans.test.ts
git commit -m "feature callouts: each part keyed by its innermost listed assembly's trio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Placement — `panels/planKeys.ts`

**Files:**
- Modify: `src/panels/planLayout.ts` (move `mapper` here as `toSvg`, exported; `PlanFigure.tsx` imports it)
- Create: `src/panels/planKeys.ts`
- Test: `src/panels/planKeys.test.ts`

**Interfaces:**
- Consumes: `PartFeature` (Task 1), `Drawing`/`Seg2.feature` (Task 2), `labelWidth`, `labelHeight` (`diagramLabels.ts`),
  `Placement` (`planLayout.ts`).
- Produces:
  ```ts
  export const KEY_LEADER = 14; export const KEY_PAD = 3; export const KEY_PUSHES = 8;
  export interface KeyView { view: View; d: Drawing; at: Placement }     // passed in the order Plan, Front, Side
  export interface KeyTag { letter: string; anchor: P2; centre: P2 }    // SVG units
  export interface KeyLine { letter: string; text: string; count: number; shown: string } // shown = text + ' (N×)' when N > 1
  export interface KeyPlan { radius: number; tags: KeyTag[]; lines: KeyLine[]; notShown: string[]; unkeyed: string[] }
  export function letterOf(i: number): string;
  export function chooseView(f: PartFeature, views: readonly KeyView[]): { i: number; hidden: boolean } | null;
  export function planKeys(features: readonly PartFeature[], views: readonly KeyView[], scale: number, size: { width: number; height: number }): KeyPlan;
  export const toSvg: (d: Drawing, at: Placement, scale: number) => (p: P2) => P2;   // in planLayout.ts
  ```

- [ ] **Step 1: Write the failing tests**

`src/panels/planKeys.test.ts` — synthetic drawings, so every rule is tested without geometry:

```ts
import { describe, expect, it } from 'vitest';
import { FRONT, SIDE, TOP, type Drawing, type Seg2 } from '../document/drawing';
import type { PartFeature } from '../document/featureKeys';
import { KEY_LEADER, chooseView, letterOf, planKeys, type KeyView } from './planKeys';

const seg = (a: [number, number], b: [number, number], part: string, feature?: string): Seg2 => (feature ? { a, b, part, feature } : { a, b, part });
const drawing = (visible: Seg2[], hidden: Seg2[] = []): Drawing => ({ visible, hidden, bounds: { min: [0, 0], max: [10, 10] } });
// A part's outline (untagged) 0..10 square, and a feature segment.
const box = (part: string) => [seg([0, 0], [10, 0], part), seg([10, 0], [10, 10], part), seg([10, 10], [0, 10], part), seg([0, 10], [0, 0], part)];
const views = (plan: Drawing, front: Drawing, side: Drawing): KeyView[] => [
  { view: TOP, d: plan, at: { x: 0, y: 0 } }, { view: FRONT, d: front, at: { x: 0, y: 200 } }, { view: SIDE, d: side, at: { x: 200, y: 200 } },
];
const hole = (key: string, text = 'Hole 1/4" dia × 3/8" deep', part = 'p'): PartFeature =>
  ({ key, tags: [key], part, text, trueAxis: [0, 1, 0], trueNormal: null });
const empty = drawing([]);

describe('letterOf', () => {
  it('A…Z then AA, AB', () => {
    expect([0, 25, 26, 27, 51, 52].map(letterOf)).toEqual(['A', 'Z', 'AA', 'AB', 'AZ', 'BA']);
  });
});

describe('chooseView (spec §2.3, ruling P2)', () => {
  const f = hole('p:hole:r');                     // true in Plan (looks down Y)
  const tagged = (hidden: boolean) => (hidden ? drawing(box('p'), [seg([2, 2], [3, 3], 'p', 'p:hole:r')]) : drawing([...box('p'), seg([2, 2], [3, 3], 'p', 'p:hole:r')]));
  it('1: true and visible beats visible elsewhere', () => {
    expect(chooseView(f, views(tagged(false), tagged(false), empty))).toEqual({ i: 0, hidden: false });
  });
  it('2: visible elsewhere beats true but hidden', () => {
    expect(chooseView(f, views(tagged(true), tagged(false), empty))).toEqual({ i: 1, hidden: false });
  });
  it('3: true and hidden when no view shows it visible (R4: shelf pins inside a case)', () => {
    expect(chooseView(f, views(tagged(true), tagged(true), empty))).toEqual({ i: 0, hidden: true });
  });
  it('P2: no true view, hidden only: the first hidden view in tie order Front, Side, Plan', () => {
    const compound = { ...f, trueAxis: null, trueNormal: [Math.SQRT1_2, 0, Math.SQRT1_2] as [number, number, number] };
    expect(chooseView(compound, views(tagged(true), empty, tagged(true)))).toEqual({ i: 2, hidden: true });
  });
  it('4: drawn nowhere is null', () => {
    expect(chooseView(f, views(empty, empty, empty))).toBeNull();
  });
  it('an angle cut is true where the view direction lies in its plane; ties go Front, Side, Plan', () => {
    const miter: PartFeature = { key: 'p:angle:m', tags: ['p:angle:m'], part: 'p', text: 'Miter 45.0°', trueAxis: null, trueNormal: [Math.SQRT1_2, Math.SQRT1_2, 0] };
    const vis = drawing([...box('p'), seg([2, 2], [3, 3], 'p', 'p:angle:m')]);
    // normal ⟂ Z (Front) only: Front is its true view even though Plan also draws it.
    expect(chooseView(miter, views(vis, vis, vis))).toEqual({ i: 1, hidden: false });
  });
});

describe('planKeys (spec §4.2–4.6)', () => {
  const size = { width: 400, height: 400 };
  it('letters by identical key line, in reading order Plan, Front, Side; counts every instance', () => {
    const plan = drawing([...box('p'), seg([9, 9], [10, 10], 'p', 'p:hole:r'), ...box('q'), seg([1, 1], [0, 0], 'q', 'q:hole:r')]);
    const front = drawing([...box('p'), seg([1, 1], [2, 2], 'p', 'p:angle:m')]);
    const fs: PartFeature[] = [
      { key: 'p:angle:m', tags: ['p:angle:m'], part: 'p', text: 'Miter 45.0°', trueAxis: null, trueNormal: [Math.SQRT1_2, Math.SQRT1_2, 0] },
      hole('p:hole:r'), hole('q:hole:r', undefined, 'q'),
    ];
    const k = planKeys(fs, views(plan, front, empty), 1, size);
    expect(k.lines.map((l) => [l.letter, l.text, l.count, l.shown])).toEqual([
      ['A', 'Hole 1/4" dia × 3/8" deep', 2, 'Hole 1/4" dia × 3/8" deep (2×)'],
      ['B', 'Miter 45.0°', 1, 'Miter 45.0°'],
    ]);
  });
  it('a faulted line never shares a letter with a clean one', () => {
    const plan = drawing([...box('p'), seg([9, 9], [10, 10], 'p', 'p:hole:a'), seg([1, 1], [0, 0], 'p', 'p:hole:b')]);
    const k = planKeys([hole('p:hole:a'), hole('p:hole:b', 'Hole 1/4" dia × 3/8" deep — check the cut list')], views(plan, empty, empty), 1, size);
    expect(k.lines.map((l) => l.letter)).toEqual(['A', 'B']);
  });
  it('the anchor is the feature point farthest from its part centre; the leader runs outward', () => {
    const plan = drawing([...box('p'), seg([6, 6], [9, 9], 'p', 'p:hole:r')]);
    const k = planKeys([hole('p:hole:r')], views(plan, empty, empty), 10, size);
    const t = k.tags[0]!;
    // drawing (9,9) → SVG (90, 10) at scale 10 (y flips about bounds.max = 10); the part centre (5,5) → (50, 50).
    expect(t.anchor).toEqual([90, 10]);
    expect(Math.hypot(t.centre[0] - 90, t.centre[1] - 10)).toBeCloseTo(KEY_LEADER + k.radius, 6);
    expect(t.centre[0]).toBeGreaterThan(90);
    expect(t.centre[1]).toBeLessThan(10 + 1e-9);
  });
  it('same-letter tags closer than a diameter merge (lined-up pin rows)', () => {
    const front = drawing([...box('p'), seg([9, 5], [10, 5], 'p', 'p:hole:r'), ...box('q'), seg([9, 5], [10, 5.001], 'q', 'q:hole:r')]);
    const fs = [hole('p:hole:r'), hole('q:hole:r', undefined, 'q')].map((f) => ({ ...f, trueAxis: [0, 0, 1] as [number, number, number] }));
    const k = planKeys(fs, views(empty, front, empty), 10, size);
    expect(k.tags).toHaveLength(1);
    expect(k.lines[0]!.count).toBe(2);
  });
  it('different letters never overlap: pushed out along their leaders (mutate the push to see it fail)', () => {
    const plan = drawing([...box('p'), seg([10, 10], [10, 10.0001], 'p', 'p:hole:a'), seg([10, 10], [9.9999, 10], 'p', 'p:angle:b')]);
    const fs: PartFeature[] = [hole('p:hole:a'), { key: 'p:angle:b', tags: ['p:angle:b'], part: 'p', text: 'Miter 45.0°', trueAxis: null, trueNormal: [0, 1, 0] }];
    const k = planKeys(fs, views(plan, empty, empty), 10, size);
    for (const [i, a] of k.tags.entries()) for (const b of k.tags.slice(i + 1)) {
      expect(Math.hypot(a.centre[0] - b.centre[0], a.centre[1] - b.centre[1])).toBeGreaterThanOrEqual(2 * k.radius - 1e-9);
    }
    expect(k.tags.length + k.unkeyed.length).toBe(2);
  });
  it('a tag never leaves the figure (Review Focus 4)', () => {
    const plan = drawing([...box('p'), seg([0, 10], [0, 10.0001], 'p', 'p:hole:r')]);   // the top-left corner
    const k = planKeys([hole('p:hole:r')], views(plan, empty, empty), 10, { width: 120, height: 120 });
    const t = k.tags[0]!;
    expect(t.centre[0]).toBeGreaterThanOrEqual(k.radius);
    expect(t.centre[1]).toBeGreaterThanOrEqual(k.radius);
  });
  it('a feature drawn nowhere is listed as not shown, once per key line', () => {
    const k = planKeys([hole('p:hole:a'), hole('q:hole:a', undefined, 'q')], views(empty, empty, empty), 1, size);
    expect(k.notShown).toEqual(['Hole 1/4" dia × 3/8" deep']);
    expect(k.tags).toEqual([]);
  });
  it('no features: an empty plan', () => {
    expect(planKeys([], views(empty, empty, empty), 1, size)).toMatchObject({ tags: [], lines: [], notShown: [], unkeyed: [] });
  });
});
```

- [ ] **Step 2: RED** — `npx vitest run src/panels/planKeys.test.ts` → FAIL (module not found).

- [ ] **Step 3: Move the mapper**

In `src/panels/planLayout.ts`:

```ts
import type { Drawing, P2 } from '../document/drawing';
/** Drawing coordinates to SVG: x from the view's min right, y flipped about its max up (SVG y runs down). */
export const toSvg = (d: Drawing, at: Placement, scale: number) => (p: P2): P2 =>
  [at.x + (p[0] - d.bounds.min[0]) * scale, at.y + (d.bounds.max[1] - p[1]) * scale];
```

In `PlanFigure.tsx` delete the local `mapper` and `type ToSvg`, import `toSvg`, and replace every `mapper(` with `toSvg(`
(`type ToSvg = ReturnType<typeof toSvg>` where a type is needed). Run `npx vitest run src/panels/PlanFigure.test.tsx` →
PASS unchanged.

- [ ] **Step 4: Write `planKeys.ts`**

```ts
import type { Drawing, P2, Seg2, View } from '../document/drawing';
import type { PartFeature } from '../document/featureKeys';
import { labelHeight, labelWidth } from './diagramLabels';
import { toSvg, type Placement } from './planLayout';

/**
 * The trio's feature keys (feature callouts spec §4): per feature one view (§2.3), letters by identical key line in
 * reading order (§4.2), one tag per instance on a drawn line (§4.3; inv 16), merged and pushed clear (§4.4). Pure; SVG
 * units throughout, so collisions are judged as drawn.
 */
export const KEY_LEADER = 14;
export const KEY_PAD = 3;
export const KEY_PUSHES = 8;

export interface KeyView { view: View; d: Drawing; at: Placement }
export interface KeyTag { letter: string; anchor: P2; centre: P2 }
export interface KeyLine { letter: string; text: string; count: number; shown: string }
export interface KeyPlan { radius: number; tags: KeyTag[]; lines: KeyLine[]; notShown: string[]; unkeyed: string[] }

export const letterOf = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : letterOf(Math.floor(i / 26) - 1) + letterOf(i % 26));

const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
/** Ties go Front, then Side, then Plan (§2.3); `views` arrive Plan, Front, Side. */
const TIE = [1, 2, 0];

function isTrue(f: PartFeature, toward: readonly number[]): boolean {
  if (f.trueAxis) return Math.abs(dot(f.trueAxis, toward)) >= 1 - 1e-9;
  if (f.trueNormal) return Math.abs(dot(f.trueNormal, toward)) <= 1e-9;
  return false;
}
const owns = (f: PartFeature) => (s: Seg2) => s.feature !== undefined && f.tags.includes(s.feature);

export function chooseView(f: PartFeature, views: readonly KeyView[]): { i: number; hidden: boolean } | null {
  const has = (i: number, hidden: boolean) => (hidden ? views[i]!.d.hidden : views[i]!.d.visible).some(owns(f));
  const tru = (i: number) => isTrue(f, views[i]!.view.toward);
  const steps: [(i: number) => boolean, boolean][] = [
    [(i) => tru(i) && has(i, false), false],
    [(i) => has(i, false), false],
    [(i) => tru(i) && has(i, true), true],
    [(i) => has(i, true), true],                // ruling P2
  ];
  for (const [ok, hidden] of steps) {
    const i = TIE.find(ok);
    if (i !== undefined) return { i, hidden };
  }
  return null;
}

const dist = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function planKeys(features: readonly PartFeature[], views: readonly KeyView[], scale: number, size: { width: number; height: number }): KeyPlan {
  interface Inst { text: string; vi: number; anchor: P2; dir: P2 }
  const insts: Inst[] = [];
  const notShown: string[] = [];
  for (const f of features) {
    const c = chooseView(f, views);
    if (!c) { if (!notShown.includes(f.text)) notShown.push(f.text); continue; }
    const v = views[c.i]!;
    const map = toSvg(v.d, v.at, scale);
    const own = (c.hidden ? v.d.hidden : v.d.visible).filter(owns(f));
    const all = [...v.d.visible, ...v.d.hidden].filter((s) => s.part === f.part).flatMap((s) => [s.a, s.b]);
    const centre: P2 = [
      (Math.min(...all.map((p) => p[0])) + Math.max(...all.map((p) => p[0]))) / 2,
      (Math.min(...all.map((p) => p[1])) + Math.max(...all.map((p) => p[1]))) / 2,
    ];
    let best = own[0]!.a;
    for (const s of own) for (const p of [s.a, s.b]) if (dist(p, centre) > dist(best, centre) + 1e-12) best = p;
    const A = map(best);
    const C = map(centre);
    const l = dist(A, C);
    insts.push({ text: f.text, vi: c.i, anchor: A, dir: l > 1e-9 ? [(A[0] - C[0]) / l, (A[1] - C[1]) / l] : [0, -1] });
  }
  insts.sort((x, y) => x.vi - y.vi || x.anchor[1] - y.anchor[1] || x.anchor[0] - y.anchor[0]);

  const lines: KeyLine[] = [];
  const lineOf = new Map<string, KeyLine>();
  for (const i of insts) {
    let line = lineOf.get(i.text);
    if (!line) { line = { letter: letterOf(lines.length), text: i.text, count: 0, shown: '' }; lines.push(line); lineOf.set(i.text, line); }
    line.count += 1;
  }
  for (const l of lines) l.shown = l.count > 1 ? `${l.text} (${l.count}×)` : l.text;

  const r = Math.max(labelHeight(), ...lines.map((l) => labelWidth(l.letter))) / 2 + KEY_PAD;
  const clamp = (p: P2): P2 => [Math.min(Math.max(p[0], r), size.width - r), Math.min(Math.max(p[1], r), size.height - r)];
  const at = (i: Inst, k: number) => clamp([i.anchor[0] + i.dir[0] * (KEY_LEADER + r + k * r), i.anchor[1] + i.dir[1] * (KEY_LEADER + r + k * r)]);
  const tags: KeyTag[] = [];
  const unkeyed: string[] = [];
  const ordered = [...insts].sort((x, y) => lines.indexOf(lineOf.get(x.text)!) - lines.indexOf(lineOf.get(y.text)!));
  for (const i of ordered) {
    const letter = lineOf.get(i.text)!.letter;
    let centre = at(i, 0);
    if (tags.some((t) => t.letter === letter && dist(t.centre, centre) < 2 * r)) continue;   // merge (§4.4)
    let k = 0;
    while (tags.some((t) => dist(t.centre, centre) < 2 * r - 1e-9) && k < KEY_PUSHES) centre = at(i, ++k);
    if (tags.some((t) => dist(t.centre, centre) < 2 * r - 1e-9)) { if (!unkeyed.includes(letter)) unkeyed.push(letter); continue; }
    tags.push({ letter, anchor: i.anchor, centre });
  }
  return { radius: lines.length > 0 ? r : 0, tags, lines, notShown, unkeyed };
}
```

`Array.prototype.sort` is stable, so `ordered` keeps reading order within a letter.

- [ ] **Step 5: GREEN** — `npx vitest run src/panels/planKeys.test.ts` → PASS.

- [ ] **Step 6: Mutate** (each red; restore with `cp`)
- `TIE = [0, 1, 2]`: the angle tie test fails;
- drop step 3 (`tru(i) && has(i, true)`): the R4 test returns P2's answer — must fail (if it passes because P2's tie order
  also lands on Plan, make the hidden segment present in Front too so the two steps disagree);
- remove the push loop (`while`): the overlap test fails;
- remove `clamp`: the never-leaves test fails;
- merge test: change `t.letter === letter` to `false` — the merge test fails.

- [ ] **Step 7: Commit**

```bash
git add src/panels/planKeys.ts src/panels/planKeys.test.ts src/panels/planLayout.ts src/panels/PlanFigure.tsx
git commit -m "feature callouts: view choice, letters and tag placement (planKeys.ts)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Draw the tags and the key list — `PlanTrio`, `PlansSheet`, CSS

**Files:**
- Modify: `src/panels/PlanFigure.tsx` (`PlanTrio` takes `keyed`, draws tags, key list, notes)
- Modify: `src/panels/PlansSheet.tsx` (passes `keyed`)
- Modify: `src/styles.css` (`plans-key*`, print block)
- Test: `src/panels/PlanFigure.test.tsx`, `src/panels/PlansSheet.test.tsx`

**Interfaces:**
- Consumes: `partFeatures` (Task 1), `PlanAssembly.keyed`, `pieceKeyed` (Task 3), `planKeys`, `KeyTag` (Task 4).
- Produces: `PlanTrio({ parts, units, label, keyed?: ReadonlySet<string> })` — no `keyed` keys nothing (today's output).

- [ ] **Step 1: Write the failing tests**

Append to `src/panels/PlanFigure.test.tsx` (import `defaultShelfPinRow` from `../document/document`):

```ts
describe('PlanTrio: feature keys (feature callouts spec §4.5)', () => {
  // Two case sides on edge (posture so the pin rows face each other is NOT needed: rows in each side's thickness face).
  const sideAt = (id: string, x: number) => {
    const b = createBoard({ id, name: id, length: 30, width: 11.25, thickness: 0.75, position: [x, 0, 0] });
    return { ...b, holes: [{ id: 'r', ...defaultShelfPinRow(b)! }] };
  };
  const parts = [sideAt('L', 0), sideAt('R', 40)];
  it('without keyed, nothing changes: no tags, no key list', () => {
    const { container } = render(<PlanTrio parts={parts} units={IMPERIAL} label="Sides" />);
    expect(container.querySelector('.plans-key-mark')).toBeNull();
    expect(container.querySelector('.plans-key')).toBeNull();
  });
  it('keyed: one letter for the two identical rows, counted (2×), a tag per side', () => {
    const { container } = render(<PlanTrio parts={parts} units={IMPERIAL} label="Sides" keyed={new Set(['L', 'R'])} />);
    const items = [...container.querySelectorAll('.plans-key li')].map((li) => li.textContent);
    expect(items).toEqual(['A Row of 21 holes, 1/4" dia × 3/8" deep, every 1-17/64" (32 mm) (2×)']);
    const letters = [...container.querySelectorAll('.plans-key-mark text')].map((t) => t.textContent);
    expect(letters).toEqual(['A', 'A']);
  });
  it('a part not keyed here draws no tag', () => {
    const { container } = render(<PlanTrio parts={parts} units={IMPERIAL} label="Sides" keyed={new Set(['L'])} />);
    expect(container.querySelectorAll('.plans-key-mark')).toHaveLength(1);
    expect(container.querySelector('.plans-key li')!.textContent).not.toMatch(/×\)$/);
  });
});
```

Append to `src/panels/PlansSheet.test.tsx` (follow its existing render helper for a store document): a document with a loose
part carrying an arch (`ARCH` on a 30 × 5 apron) → the piece trio's `.plans-key` lists `A Arch, 24" span, 1-1/2" rise
(radius 48-3/4")`; the exploded figure (`[aria-label="Exploded view"]`) contains no `.plans-key-mark`; a document using
`cabinetsDoc()` with a hole row on `dd`'s `front` lists that row under the `Cabinet › Drawer` section only (query the
section by its `h3` text and assert the other sections have no `.plans-key`).

- [ ] **Step 2: RED** — `npx vitest run src/panels/PlanFigure.test.tsx src/panels/PlansSheet.test.tsx` → FAIL (no
  `.plans-key`).

- [ ] **Step 3: Implement in `PlanFigure.tsx`**

```tsx
import { partFeatures } from '../document/featureKeys';
import { planKeys, type KeyTag } from './planKeys';

/** One feature tag (feature callouts spec §4.3): a leader from a dot on the drawn line to the circle's edge, the circle
 *  filled with the paper so the lines beneath are masked, the letter centred. */
function KeyMark({ t, r }: { t: KeyTag; r: number }) {
  const dx = t.centre[0] - t.anchor[0];
  const dy = t.centre[1] - t.anchor[1];
  const l = Math.hypot(dx, dy) || 1;
  const ex = t.centre[0] - (dx / l) * r;
  const ey = t.centre[1] - (dy / l) * r;
  return (
    <g className="plans-key-mark" data-letter={t.letter}>
      <path className="plans-leader" d={`M${t.anchor[0]} ${t.anchor[1]}L${ex} ${ey}`} />
      <circle className="plans-leader-dot" cx={t.anchor[0]} cy={t.anchor[1]} r={DOT_R} />
      <circle className="plans-key-tag" cx={t.centre[0]} cy={t.centre[1]} r={r} />
      <text x={t.centre[0]} y={t.centre[1] + (LABEL_ASCENT - LABEL_DESCENT) / 2} textAnchor="middle">{t.letter}</text>
    </g>
  );
}
```

Move `const DOT_R = 2.5;` above `KeyMark` (it is declared further down today). In `PlanTrio`: add `keyed` to the props
(`keyed?: ReadonlySet<string>`), and after `lay`:

```tsx
const features = useMemo(() => (keyed ? parts.filter((b) => keyed.has(b.id)).flatMap((b) => partFeatures(b, units)) : []), [parts, units, keyed]);
const keys = useMemo(() => planKeys(features,
  [{ view: TOP, d: top.d, at: lay.top }, { view: FRONT, d: front.d, at: lay.front }, { view: SIDE, d: side.d, at: lay.side }],
  lay.scale, lay), [features, views]);   // lay is a pure function of views
if (keys.notShown.length > 0) notes.push(`Not shown in these views: ${keys.notShown.join('; ')}.`);
if (keys.unkeyed.length > 0) notes.push(`Not keyed (no room): ${keys.unkeyed.join(', ')}.`);
```

(the two `notes.push` lines go after `drawn` is built, so the dimension notes keep their order first). Render the tags after
`{drawn}` inside the `<svg>`: `{keys.tags.map((t, n) => <KeyMark key={n} t={t} r={keys.radius} />)}`, and between the
`</svg>` and the notes list:

```tsx
{keys.lines.length > 0 && (
  <ul className="plans-key">
    {keys.lines.map((l) => <li key={l.letter}><span className="plans-key-letter">{l.letter}</span> {l.shown}</li>)}
  </ul>
)}
```

Update `PlanTrio`'s doc comment: "…and, when `keyed`, the features of those parts as lettered tags with a key list
(feature callouts spec §4)". `memo` still compares `keyed` by identity — PlansSheet must pass stable sets (Step 4).

- [ ] **Step 4: `PlansSheet.tsx`**

`const pieceKeys = useMemo(() => pieceKeyed(doc, assemblies), [doc, assemblies]);` then `keyed={pieceKeys}` on the piece
trio and `keyed={a.keyed}` on each assembly trio (`a` comes from the memoised `assemblies`, so its set is stable across
slider ticks — fu 263's memo holds).

- [ ] **Step 5: CSS** (`src/styles.css`, beside the balloon rules, reading surface roles only)

```css
.plans-key { margin: 6px 0 0; padding: 0; list-style: none; font-size: 12px; color: var(--ink); }
.plans-key-letter { display: inline-block; min-width: 1.8em; font-family: var(--font-num); font-weight: 600; }
.plans-key-mark text { fill: currentColor; stroke: none; font-family: var(--font-num); }
.plans-key-tag { fill: var(--surface); stroke: var(--ink-dim); stroke-width: 1.25; vector-effect: non-scaling-stroke; }
```

and in the print block, extend the existing lines: `.plans-figure, .plans-notes, .plans-key { color: #000; }`,
`.plans-balloon-ring, .plans-key-tag, .plans-figure .plans-leader { stroke: #000; }`, plus `.plans-key-tag { fill: #fff; }`.

- [ ] **Step 6: GREEN and the gate**

Run: `npx vitest run src/panels` → PASS. Then `npm run build 2>&1 | tail -3` → built, no type errors; `npm test 2>&1 | tail -5`
→ all pass. Record the new test count.

- [ ] **Step 7: Mutate** — render tags for every part (ignore `keyed`): "a part not keyed here" fails; drop `(N×)`
  (`shown = text`): the 2× test fails. Restore with `cp`.

- [ ] **Step 8: Commit**

```bash
git add src/panels/PlanFigure.tsx src/panels/PlansSheet.tsx src/styles.css src/panels/PlanFigure.test.tsx src/panels/PlansSheet.test.tsx
git commit -m "feature callouts: lettered tags and the key list on the elevations

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Live pass on the dev server, and the record

**Files:**
- Create: `docs/browser-verification-feature-callouts.md`
- Modify: `docs/follow-ups.md` (333, 279, 362 statuses; new residue entry 381), `CLAUDE.md` (Status, Rounds row, per-file rule,
  invariant 47's drawing note, Where-things-live entries, test count), `docs/history.md` ("What the feature callouts round did")

- [ ] **Step 1: Dev server** — `npx vite --port 5179 --strictPort` in the background (kill later by PID from `ss -ltnp`,
  never `pkill -f`). Record the profile's baseline `localStorage` keys from `http://localhost:5179/package.json` first (the
  dev profile is the user's; delete only keys this check creates).

- [ ] **Step 2: Three projects, through the UI** (Playwright MCP; hide canvases before screenshots:
  `document.querySelectorAll('canvas').forEach(c => c.style.display='none')`; screenshots under `.playwright-mcp/`):
  1. a bookcase: two sides with Shelf-pin rows on their inside faces, a top, an apron with an Arch — expect the pin rows keyed
     on dashed lines (R4) with one letter `(4×)` if both faces carry two rows, the arch keyed in Plan;
  2. a table: four tapered legs, four mitered aprons — taper and miter letters, counts;
  3. a metric cabinet in an assembly with Hinge cups on its doors — the hinge cups keyed on the assembly's trio only, mm text.
  For each: a screenshot of each trio and its key list, the DOM readout of `.plans-key li` texts, and print emulation
  (`emulateMedia print`) for page fit. Note crowding and tags over lines for the user's eye.

- [ ] **Step 3: Clean up** — delete the keys this check created, read back after 3 s from the non-app path, navigate to
  `about:blank`, stop the dev server by PID.

- [ ] **Step 4: Record** — `docs/browser-verification-feature-callouts.md` (what was seen, what software GL could not show);
  close 333, 279, 362 with their evidence (`**Status:** closed 2026-10-16 (feature callouts round) …`); new entry 381 for
  residue (rulings P1–P3, anything the live pass found, the real print owed with 254); CLAUDE.md: Status bullet, a Rounds row
  (`feature callouts | 10-16 | — | Lettered feature tags on the Plans sheet's elevations, a key list per trio (fu 333, 279,
  362)`), a per-file rule for `planKeys.ts`/`featureKeys.ts` (one home for key lines; tags only on drawn lines; view order;
  merge and push), the Where-things-live lines, inv 47's sentence that `drawView` TAGS segments by feature (the split
  unchanged), the test count; `docs/history.md` entry.

- [ ] **Step 5: Commit**

```bash
git add docs/ CLAUDE.md
git commit -m "docs: feature callouts — live pass, fu 333/279/362 closed, residue 381, CLAUDE.md

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Then the final whole-branch review, the merge (`git merge --no-ff feature-callouts`), the merged tree's `npm run build` and
full `npm test`, and the branch deleted. Deploy only on the user's word.
