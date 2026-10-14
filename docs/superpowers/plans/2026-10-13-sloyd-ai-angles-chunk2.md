# AI angles, chunk 2 — Generate and Refine read and write miters, bevels and chamfers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The design schema gains `miters`, `bevels` and `chamfers` in world words, so Generate can emit them and Refine
keeps them (exactly, when untouched), the change list names them, chamfered legs link as one component, and the model is
told how to use them and fed back the angle-at-joint fault.

**Architecture:** A new `document/angleWorld.ts` (beside `taperWorld.ts`) is the ONE place a design miter, bevel or
chamfer crosses to stored cuts (`angleCutsFor`, through `miterCut`/`bevelCut`/`chamferCut`) and back (`worldAngles`,
structural standard forms), plus `angleRatiosOf` (degree text → stored slope, for exact round trips). `generated.ts`
parses and converts the three arrays; `refineDesign.ts` writes them; `designDiff.ts` diffs them; `roleLinks.ts` re-stores
them under turns; the design fault widens to `angle-joint`.

**Tech Stack:** TypeScript, Vitest. Two paid live runs at the end, each only with the user's approval at the time.

**Spec:** `docs/superpowers/specs/2026-10-13-sloyd-ai-angles-design.md` (§5–§8.1 are this chunk; read §1's rulings and §3's
joint rule — chunk 1 shipped it).

## Global Constraints

- **No document schema change**: `CURRENT_VERSION` stays 14. Only the DESIGN schema (what the model writes) changes.
- **Strict structured output**: every property of every schema object is `required`, `additionalProperties: false`
  (pinned by `generated.test.ts`' DESIGN_SCHEMA tests). An unused array is `[]`.
- **World words through invariant 44's helpers only**: `dirToLocal` / `localToDir` (taperWorld.ts); never a hand turn.
- **Stored forms are the Properties writers'**: `miterCut`, `bevelCut`, `chamferCut` — a generated cut is stored exactly
  as a hand-made one. Degrees reach a writer only through `ratioFor` (→ `miterRatio`); 45° is exactly 1.
- **One canonical order** of a part's angle cuts: tapers first (taperCutsFor's order, unchanged), then miters, bevels,
  chamfers (`ANGLE_KINDS` order), each by its stored fields — `sameShared` compares angle cuts index by index.
- **Exactness**: an untouched angle cut comes back from Refine byte for byte (legs via the exact set; angles via the
  exact-angle map). Measured while planning: `run × (depth ÷ run) === depth` for every 0.1° step 0.1°–89.9° and 21 common
  stock widths (18,879 cases, 0 failures), so reading a slope as depth ÷ run and rewriting run × ratio is exact.
- **The `→ units` edge rule**: person-facing strings (change list, refusals) are built in `document/`; model-facing text
  (converter faults, design faults) in world words with plain decimal inches.
- **Tapers byte for byte**: taper conversion, wording, and existing taper tests unchanged except renames this plan names.
- **Paid runs**: none in tests; the two live runs in Task 8 each need the user's explicit approval at the time. The key
  never goes into chat or a file.
- **Ruled while planning (spec §8 deviation)**: `CHARS_PER_TOKEN` is NOT re-measured. The estimate already counts the
  prompt's and schema's actual characters (`prefixChars`); the ratio is a property of the tokenizer on this kind of text
  (measured 1.9–2.3, rounded to 2 toward the larger bill). Task 8's paid runs report real usage against the estimate.

## Review Focus

1. **A mitered frame from Generate**: the two parts' BOXES overlap at each corner by design (the miters remove it); the
   checks measure overlap on real bodies, so a flat picture frame converts and checks with no overlap. Pinned in Task 2.
2. **An assembly part with angle cuts through Refine**: definitions are translation-only, so a definition-local chamfer
   must round-trip in the definition's frame. Pinned in Task 4.
3. **A hand-made part whose encoding orient would change** (its length is not its longest side): Refine re-encodes it,
   so an angle cut the converter would reject on the re-encoded part must be refused up front (`'angle-form'`), not sent.
   Pinned in Task 4.
4. **The model's own orderings and slips**: a chamfer edge written in either order gives one stored part; the same edge
   twice, two miters at one end, a long point on the wrong axis are faults, never silently accepted. Pinned in Task 1.
5. **A model that rounds an angle Refine sent unrounded** (37.49999… returned as 37.5): it must still store the same
   slope when the original was made in Properties at 37.5. Pinned in Task 4.

---

### Task 1: `angleWorld.ts` — world angles ↔ stored cuts

**Files:**
- Create: `src/document/angleWorld.ts`
- Test: `src/document/angleWorld.test.ts`

**Interfaces:**
- Consumes: `Dir`, `DIRS`, `dirToLocal`, `localToDir` (taperWorld.ts); `ANGLE_KINDS`, `angleCutRemovesNothing`,
  `angleCutValues`, `bevelAcross`, `bevelCut`, `chamferCut`, `miterCut`, `miterDegrees`, `miterRatio` (angleCuts.ts).
- Produces:
  - `interface WorldMiter { end: Dir; longPoint: Dir; angle: number }`
  - `interface WorldBevel { face: Dir; longPoint: Dir; angle: number }`
  - `interface WorldChamfer { edge: [Dir, Dir]; legs: [number, number] }`
  - `interface WorldAngles { miters: WorldMiter[]; bevels: WorldBevel[]; chamfers: WorldChamfer[] }`
  - `noAngles(): WorldAngles` (fresh empty)
  - `type AngleFaultCode = 'direction' | 'angle' | 'legs' | 'no-wood'`
  - `ratioFor(degrees: number, exact?: ReadonlyMap<number, number>): number`
  - `angleCutsFor(b: Board, a: WorldAngles, exact?: ReadonlyMap<number, number>): { cuts: Omit<AngleCut, 'id'>[] } | { fault: string; code: AngleFaultCode }`
  - `worldAngles(b: Board): WorldAngles | null`
  - `angleRatiosOf(boards: readonly Board[]): Map<number, number>`
  - `sortAngleCuts<T extends Omit<AngleCut, 'id'>>(cuts: T[]): T[]` (kind order, then stored fields)

- [ ] **Step 1: Write the failing tests**

Create `src/document/angleWorld.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import type { Board, Posture, Rotation } from './document';
import { chamferCut, miterCut, miterRatio } from './angleCuts';
import { axisDimensions } from './geometry';
import { DIRS } from './taperWorld';
import type { Dir } from './taperWorld';
import { angleCutsFor, angleRatiosOf, noAngles, ratioFor, sortAngleCuts, worldAngles } from './angleWorld';
import type { WorldAngles } from './angleWorld';

const POSTURES: Posture[] = ['flat', 'on-edge', 'upright'];
const TURNS: Rotation[] = [0, 90, 180, 270];
const poses = () => POSTURES.flatMap((posture) => TURNS.map((rotation) => createBoard({ name: `P ${posture} ${rotation}`, length: 20, width: 3, thickness: 1.5, posture, rotation })));
const axisOf = (b: Board, dim: 'length' | 'width' | 'thickness') => 'xyz'[axisDimensions(b).indexOf(dim)]!;
const dir = (b: Board, dim: 'length' | 'width' | 'thickness', sign: '-' | '+') => `${sign}${axisOf(b, dim)}` as Dir;
const stored = (b: Board, a: WorldAngles, exact?: ReadonlyMap<number, number>) => {
  const r = angleCutsFor(b, a, exact);
  if ('fault' in r) throw new Error(r.fault);
  return { ...b, angleCuts: r.cuts.map((c, i) => ({ id: `a${i}`, ...c })) };
};
/** A CHIRAL set: a miter, a bevel and an unequal-legged chamfer, each on a different world side. */
const hand = (b: Board): WorldAngles => ({
  miters: [{ end: dir(b, 'length', '+'), longPoint: dir(b, 'width', '-'), angle: 37.5 }],
  bevels: [{ face: dir(b, 'thickness', '+'), longPoint: dir(b, 'width', '+'), angle: 15 }],
  chamfers: [{ edge: [dir(b, 'width', '-'), dir(b, 'thickness', '-')], legs: [0.25, 0.125] }],
});

describe('angleCutsFor / worldAngles (AI-angles spec §5.2, §5.3)', () => {
  for (const b of poses()) {
    it(`${b.name}: design → stored → design round-trips, and every cut lands on the world side it names`, () => {
      const a = hand(b);
      const s = stored(b, a);
      expect(s.angleCuts.map((c) => c.kind)).toEqual(['miter', 'bevel', 'chamfer']);
      const back = worldAngles(s)!;
      expect(back.miters).toEqual([{ ...a.miters[0], angle: back.miters[0]!.angle }]);
      expect(back.miters[0]!.angle).toBeCloseTo(37.5, 9);
      expect(back.bevels[0]!.face).toBe(a.bevels[0]!.face);
      expect(back.bevels[0]!.longPoint).toBe(a.bevels[0]!.longPoint);
      expect(back.chamfers).toHaveLength(1);
      // The chamfer's legs follow its faces whatever order the edge is written in (DIRS-rank normalised).
      const ch = back.chamfers[0]!;
      const legOf = (d: Dir) => ch.legs[ch.edge.indexOf(d)];
      expect(legOf(dir(b, 'width', '-'))).toBe(0.25);
      expect(legOf(dir(b, 'thickness', '-'))).toBe(0.125);
      // Re-storing what was read gives the same cuts exactly (exact-angle map from the stored part).
      const again = stored(b, back, angleRatiosOf([s]));
      expect(again.angleCuts.map(({ id: _i, ...c }) => c)).toEqual(s.angleCuts.map(({ id: _i, ...c }) => c));
    });
  }
  it('a chamfer edge written in either order gives one stored part', () => {
    const b = poses()[0]!;
    const e: [Dir, Dir] = [dir(b, 'width', '+'), dir(b, 'thickness', '+')];
    const x = stored(b, { ...noAngles(), chamfers: [{ edge: e, legs: [0.25, 0.125] }] });
    const y = stored(b, { ...noAngles(), chamfers: [{ edge: [e[1], e[0]], legs: [0.125, 0.25] }] });
    expect(y.angleCuts).toEqual(x.angleCuts);
  });
  it('the canonical order: miters, bevels, chamfers, each by stored fields, whatever the input order', () => {
    const b = poses()[0]!;
    const a = hand(b);
    const two: WorldAngles = { ...a, chamfers: [...a.chamfers, { edge: [dir(b, 'width', '+'), dir(b, 'thickness', '+')], legs: [0.125, 0.125] }] };
    const rev: WorldAngles = { miters: a.miters, bevels: a.bevels, chamfers: [...two.chamfers].reverse() };
    expect(stored(b, rev).angleCuts).toEqual(stored(b, two).angleCuts);
    expect(sortAngleCuts([...stored(b, two).angleCuts].reverse())).toEqual(stored(b, two).angleCuts);
  });
  it('45° is stored as ratio 1 exactly; any other angle is rounded to 0.1° unless the exact map has it', () => {
    expect(ratioFor(45)).toBe(1);
    expect(ratioFor(37.46)).toBe(miterRatio(37.5));
    expect(ratioFor(37.46, new Map([[37.46, 0.7]]))).toBe(0.7);
  });
  it('angleRatiosOf maps the degree text worldAngles writes to the stored slope', () => {
    const b = poses()[0]!;
    const s = stored(b, hand(b));
    const m = angleRatiosOf([s]);
    const deg = worldAngles(s)!.miters[0]!.angle;
    expect(m.get(deg)).toBe(s.angleCuts[0]!.points[1][1] / s.angleCuts[0]!.points[1][0]);
  });
  it('worldAngles is null for a cut no row can describe (an offset miter; a kind whose shape does not match)', () => {
    const b = poses()[0]!;
    const m = { id: 'm', ...miterCut({ end: 'max', across: 'width', longSide: 'min', ratio: 1 }, b) };
    expect(worldAngles({ ...b, angleCuts: [m] })).not.toBeNull();
    expect(worldAngles({ ...b, angleCuts: [{ ...m, points: [[0, 0.5], [3, 3.5]] }] })).toBeNull();
    const ch = { id: 'c', ...chamferCut({ face: 'width', from: 'max', along: 'thickness', alongFrom: 'max', legFace: 0.25, legAlong: 0.25 }, b) };
    expect(worldAngles({ ...b, angleCuts: [{ ...ch, kind: 'bevel' }] })).toBeNull();
    expect(worldAngles({ ...b, angleCuts: [] })).toEqual(noAngles());
  });
});

describe('angleCutsFor — faults (Review Focus 4)', () => {
  const b = poses()[0]!;
  const L = (s: '-' | '+') => dir(b, 'length', s);
  const W = (s: '-' | '+') => dir(b, 'width', s);
  const T = (s: '-' | '+') => dir(b, 'thickness', s);
  const fault = (a: Partial<WorldAngles>) => {
    const r = angleCutsFor(b, { ...noAngles(), ...a });
    return 'fault' in r ? r.code : null;
  };
  it.each([
    ['a miter on a side, not an end', { miters: [{ end: W('+'), longPoint: T('-'), angle: 45 }] }, 'direction'],
    ['two miters at one end', { miters: [{ end: L('+'), longPoint: W('-'), angle: 45 }, { end: L('+'), longPoint: T('-'), angle: 30 }] }, 'direction'],
    ['a miter long point on an end', { miters: [{ end: L('+'), longPoint: L('-'), angle: 45 }] }, 'direction'],
    ['a bevel on an end', { bevels: [{ face: L('+'), longPoint: W('-'), angle: 15 }] }, 'direction'],
    ['a bevel long point not across its face', { bevels: [{ face: T('+'), longPoint: T('-'), angle: 15 }] }, 'direction'],
    ['a chamfer edge on one axis', { chamfers: [{ edge: [W('+'), W('-')], legs: [0.125, 0.125] }] as WorldAngles['chamfers'] }, 'direction'],
    ['the same chamfer edge twice', { chamfers: [{ edge: [W('+'), T('+')], legs: [0.125, 0.125] }, { edge: [T('+'), W('+')], legs: [0.25, 0.25] }] as WorldAngles['chamfers'] }, 'direction'],
    ['an angle of 0', { miters: [{ end: L('+'), longPoint: W('-'), angle: 0.04 }] }, 'angle'],
    ['an angle of 90', { bevels: [{ face: T('+'), longPoint: W('-'), angle: 89.96 }] }, 'angle'],
    ['a zero leg', { chamfers: [{ edge: [W('+'), T('+')], legs: [0, 0.125] }] as WorldAngles['chamfers'] }, 'legs'],
    ['a miter deeper than the length', { miters: [{ end: L('+'), longPoint: W('-'), angle: 89 }] }, 'no-wood'],
    ['two miters leaving no wood', { miters: [{ end: L('+'), longPoint: W('-'), angle: 80 }, { end: L('-'), longPoint: W('-'), angle: 80 }] }, 'no-wood'],
    ['a bevel deeper than its face', { bevels: [{ face: T('+'), longPoint: W('-'), angle: 60 }] }, 'no-wood'],
    ['a chamfer leg longer than the part', { chamfers: [{ edge: [W('+'), T('+')], legs: [0.125, 2] }] as WorldAngles['chamfers'] }, 'no-wood'],
  ])('%s → %s', (_n, a, code) => {
    expect(fault(a as Partial<WorldAngles>)).toBe(code);
  });
  it('the boundary angles and depths that ARE allowed', () => {
    expect(fault({ miters: [{ end: L('+'), longPoint: W('-'), angle: 0.05 }] })).toBeNull();
    expect(fault({ chamfers: [{ edge: [W('+'), T('+')], legs: [3, 1.5] }] })).toBeNull();   // legs equal to the dims
  });
});

void DIRS;
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/document/angleWorld.test.ts`
Expected: FAIL — cannot resolve `./angleWorld`.

- [ ] **Step 3: Implement**

Create `src/document/angleWorld.ts`:

```ts
import type { AngleCut, Board, CutFrom, Dimension } from './types';
import { DIMENSION_ORDER, axisDimensions } from './geometry';
import { ANGLE_KINDS, angleCutRemovesNothing, angleCutValues, bevelAcross, bevelCut, chamferCut, miterCut, miterDegrees, miterRatio } from './angleCuts';
import { DIRS, dirToLocal, localToDir } from './taperWorld';
import type { Dir } from './taperWorld';

/**
 * Miters, bevels and chamfers in WORLD words (AI-angles spec §5): the design schema's form. The ONE place a design
 * miter, bevel or chamfer crosses to stored cuts and back, through invariant 44's helpers, writing through the
 * Properties writers so a generated cut is stored exactly as a hand-made one. Model-facing text only (no `→ units`).
 */
export interface WorldMiter { end: Dir; longPoint: Dir; angle: number }
export interface WorldBevel { face: Dir; longPoint: Dir; angle: number }
export interface WorldChamfer { edge: [Dir, Dir]; legs: [number, number] }
export interface WorldAngles { miters: WorldMiter[]; bevels: WorldBevel[]; chamfers: WorldChamfer[] }
export const noAngles = (): WorldAngles => ({ miters: [], bevels: [], chamfers: [] });

/** Which rule a cut broke — for a caller that words it for a PERSON (Refine's refusal). */
export type AngleFaultCode = 'direction' | 'angle' | 'legs' | 'no-wood';

const AXES = 'xyz';
const rank = (d: Dir) => DIRS.indexOf(d);
const tenth = (deg: number) => Math.round(deg * 10) / 10;

/**
 * Degrees → the stored slope: a degree value Refine wrote (`exact`, from `angleRatiosOf`) maps back to the stored ratio,
 * exactly; any other is rounded to 0.1° (the angle field's resolution) and written through `miterRatio` (45° → 1).
 */
export function ratioFor(degrees: number, exact?: ReadonlyMap<number, number>): number {
  const hit = exact?.get(degrees);
  return hit !== undefined ? hit : miterRatio(tenth(degrees));
}

/** Kind order (`ANGLE_KINDS`), then the stored fields in `ANGLE_CUT_KEYS` order (strings before numbers never mix). */
export function sortAngleCuts<T extends Omit<AngleCut, 'id'>>(cuts: T[]): T[] {
  const cmp = (x: T, y: T) => {
    const k = ANGLE_KINDS.indexOf(x.kind) - ANGLE_KINDS.indexOf(y.kind);
    if (k !== 0) return k;
    const a = angleCutValues(x as AngleCut);
    const b = angleCutValues(y as AngleCut);
    for (let i = 0; i < a.length; i += 1) {
      const p = a[i]!;
      const q = b[i]!;
      if (p === q) continue;
      return typeof p === 'number' && typeof q === 'number' ? p - q : String(p) < String(q) ? -1 : 1;
    }
    return 0;
  };
  return [...cuts].sort(cmp);
}

/**
 * Design angles → stored cuts on `b` (oriented; legs already snapped), in the canonical order (§5.2), or the first rule
 * broken, as a phrase the caller prefixes with the part's name: "has a miter at +x, …".
 */
export function angleCutsFor(b: Board, a: WorldAngles, exact?: ReadonlyMap<number, number>): { cuts: Omit<AngleCut, 'id'>[] } | { fault: string; code: AngleFaultCode } {
  const L = AXES[axisDimensions(b).indexOf('length')]!.toUpperCase();
  const angleOk = (deg: number) => exact?.has(deg) === true || (tenth(deg) > 0 && tenth(deg) < 90);
  const cuts: Omit<AngleCut, 'id'>[] = [];
  const ends = new Set<CutFrom>();
  for (const m of a.miters) {
    const e = dirToLocal(b, m.end);
    if (e.dim !== 'length') return { fault: `has a miter at ${m.end}, which is not an end of the part; a miter cuts an end (its length runs along ${L})`, code: 'direction' };
    if (ends.has(e.from)) return { fault: `has two miters at its ${m.end} end`, code: 'direction' };
    ends.add(e.from);
    const lp = dirToLocal(b, m.longPoint);
    if (lp.dim === 'length') return { fault: `has a miter at its ${m.end} end whose long point ${m.longPoint} is an end; the long point is on a side`, code: 'direction' };
    if (!angleOk(m.angle)) return { fault: `has a miter at its ${m.end} end whose angle (${m.angle}) is not between 0 and 90 degrees`, code: 'angle' };
    const ratio = ratioFor(m.angle, exact);
    if (b[lp.dim] * ratio > b.length) return { fault: `has a miter at its ${m.end} end that cuts deeper than the part is long`, code: 'no-wood' };
    cuts.push(miterCut({ end: e.from, across: lp.dim as 'width' | 'thickness', longSide: lp.from, ratio }, b));
  }
  // Two miters: their deepest points together must leave wood along the length (conservative: either long side).
  if (cuts.length === 2 && cuts[0]!.points[1][1] + cuts[1]!.points[1][1] >= b.length) {
    return { fault: 'has miters at both ends that leave no wood between them', code: 'no-wood' };
  }
  for (const v of a.bevels) {
    const f = dirToLocal(b, v.face);
    if (f.dim === 'length') return { fault: `has a bevel on ${v.face}, which is an end of the part; a bevel is cut on a side`, code: 'direction' };
    const across = bevelAcross(f.dim as 'width' | 'thickness');
    const lp = dirToLocal(b, v.longPoint);
    if (lp.dim !== across) {
      return { fault: `has a bevel on ${v.face} whose long point ${v.longPoint} is not across that face (use ${localToDir(b, across, 'min')} or ${localToDir(b, across, 'max')})`, code: 'direction' };
    }
    if (!angleOk(v.angle)) return { fault: `has a bevel on ${v.face} whose angle (${v.angle}) is not between 0 and 90 degrees`, code: 'angle' };
    const ratio = ratioFor(v.angle, exact);
    if (b[across] * ratio > b[f.dim]) return { fault: `has a bevel on ${v.face} that cuts deeper than the part is thick there`, code: 'no-wood' };
    cuts.push(bevelCut({ face: f.dim as 'width' | 'thickness', from: f.from, longSide: lp.from, ratio }, b));
  }
  for (const c of a.chamfers) {
    const [p, q] = c.edge.map((d) => dirToLocal(b, d)) as [{ dim: Dimension; from: CutFrom }, { dim: Dimension; from: CutFrom }];
    const edge = `${c.edge[0]}/${c.edge[1]}`;
    if (p.dim === q.dim) return { fault: `has a chamfer on ${edge}, which is not an edge (both faces are on one axis)`, code: 'direction' };
    if (!(c.legs[0] > 0 && c.legs[1] > 0)) return { fault: `has a chamfer on the ${edge} edge whose legs are not both above 0`, code: 'legs' };
    if (c.legs[0] > b[p.dim] || c.legs[1] > b[q.dim]) return { fault: `has a chamfer on the ${edge} edge with a leg longer than the part is across`, code: 'no-wood' };
    const first = DIMENSION_ORDER.indexOf(p.dim) < DIMENSION_ORDER.indexOf(q.dim);
    const [f, g, lf, lg] = first ? [p, q, c.legs[0], c.legs[1]] : [q, p, c.legs[1], c.legs[0]];
    cuts.push(chamferCut({ face: f.dim, from: f.from, along: g.dim, alongFrom: g.from, legFace: lf, legAlong: lg }, b));
  }
  const seen = new Set<string>();
  for (const c of cuts) {
    const key = `${c.kind}|${c.face}|${c.from}|${c.along}|${c.alongFrom}`;
    if (seen.has(key)) return { fault: `has two ${c.kind}s on the same ${c.kind === 'chamfer' ? 'edge' : 'face'}`, code: 'direction' };
    seen.add(key);
    if (angleCutRemovesNothing(b, c as AngleCut)) return { fault: `has a ${c.kind} that removes no wood`, code: 'no-wood' };
  }
  return { cuts: sortAngleCuts(cuts) };
}

/**
 * A part's miters, bevels and chamfers in design form (§5.3), each list in one canonical order (DIRS rank), a chamfer's
 * edge normalised to DIRS rank with its legs following. Recognised STRUCTURALLY — the exact shape its writer stores —
 * so its numbers read back exactly; null when any non-taper cut has another shape (Refine refuses those, §6.1).
 */
export function worldAngles(b: Board): WorldAngles | null {
  const out = noAngles();
  for (const c of b.angleCuts) {
    if (c.kind === 'taper') continue;
    const [[s0, q0], [s1, q1]] = c.points;
    if (c.kind === 'miter' || c.kind === 'bevel') {
      const shaped = c.kind === 'miter'
        ? c.face === 'length' && c.along !== 'length'
        : c.face !== 'length' && c.along === bevelAcross(c.face as 'width' | 'thickness');
      if (!(shaped && s0 === 0 && q0 === 0 && s1 === b[c.along] && Number.isFinite(q1) && q1 > 0)) return null;
      const angle = miterDegrees(q1 / s1);
      const longPoint = localToDir(b, c.along, c.alongFrom);
      if (c.kind === 'miter') out.miters.push({ end: localToDir(b, 'length', c.from), longPoint, angle });
      else out.bevels.push({ face: localToDir(b, c.face, c.from), longPoint, angle });
    } else {
      const canonical = c.face !== c.along && DIMENSION_ORDER.indexOf(c.face) < DIMENSION_ORDER.indexOf(c.along);
      if (!(canonical && s0 === 0 && q1 === 0 && Number.isFinite(q0) && q0 > 0 && Number.isFinite(s1) && s1 > 0)) return null;
      const p = { d: localToDir(b, c.face, c.from), leg: q0 };
      const q = { d: localToDir(b, c.along, c.alongFrom), leg: s1 };
      const [x, y] = rank(p.d) <= rank(q.d) ? [p, q] : [q, p];
      out.chamfers.push({ edge: [x.d, y.d], legs: [x.leg, y.leg] });
    }
  }
  out.miters.sort((x, y) => rank(x.end) - rank(y.end) || rank(x.longPoint) - rank(y.longPoint) || x.angle - y.angle);
  out.bevels.sort((x, y) => rank(x.face) - rank(y.face) || rank(x.longPoint) - rank(y.longPoint) || x.angle - y.angle);
  out.chamfers.sort((x, y) => rank(x.edge[0]) - rank(y.edge[0]) || rank(x.edge[1]) - rank(y.edge[1]) || x.legs[0] - y.legs[0] || x.legs[1] - y.legs[1]);
  return out;
}

/**
 * The exact-angle map (§6.2): each degree value `worldAngles` writes for a miter or bevel on these parts → its stored
 * slope (depth ÷ run, read off the points). `ratioFor` uses it so an untouched angle is re-stored exactly. Two slopes
 * printing the same degree value keep the first (they differ by float noise only).
 */
export function angleRatiosOf(boards: readonly Board[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const b of boards) {
    for (const c of b.angleCuts) {
      if (c.kind !== 'miter' && c.kind !== 'bevel') continue;
      const [[, ], [s1, q1]] = c.points;
      if (!(s1 > 0 && q1 > 0)) continue;
      const deg = miterDegrees(q1 / s1);
      if (!out.has(deg)) out.set(deg, q1 / s1);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run src/document/angleWorld.test.ts && npm run build`
Expected: PASS; build 0. If a pose's round-trip fails on `toEqual` of re-stored cuts, read why — never loosen to
`toBeCloseTo` on stored values (the exactness constraint).

- [ ] **Step 5: Mutate**

(a) In `worldAngles`, swap `[x, y] = rank(p.d) <= rank(q.d) ? [p, q] : [q, p]` to always `[p, q]`: the edge-order test must
fail. (b) In `angleCutsFor`, drop the `ends.has` check: "two miters at one end" must fail. (c) Replace `ratioFor`'s
`hit !== undefined ? hit :` with nothing: the exact-map test must fail. Restore; PASS.

- [ ] **Step 6: Commit**

```bash
git add src/document/angleWorld.ts src/document/angleWorld.test.ts
git commit -m "feat(document): angleWorld — miters, bevels and chamfers in world words, to stored cuts and back (AI-angles §5.2, §5.3)"
```

---

### Task 2: The design schema and the converter (`generated.ts`)

**Files:**
- Modify: `src/document/generated.ts` (schema, `GeneratedPart`, `isPart`, `partOf`, `RejectedPart`, `convertPart`,
  `designToDocument` opts)
- Modify: `src/document/designCheck.ts` (`rejectedViolations`' `say` gains `angle`)
- Modify: every test fixture that reaches `parseDesign` (see Step 4)
- Test: `src/document/generated.test.ts` (new `describe` + the DESIGN_SCHEMA `required` pins)

**Interfaces:**
- Consumes: Task 1's `WorldMiter`, `WorldBevel`, `WorldChamfer`, `angleCutsFor`, `sortAngleCuts`; `boardBodies` (bodies.ts).
- Produces:
  - `GeneratedPart` gains optional `miters?: WorldMiter[]; bevels?: WorldBevel[]; chamfers?: WorldChamfer[]` (required
    from the model, like `tapers`).
  - `RejectedPart['reason']` gains `'angle'`.
  - `designToDocument(design, opts: { centre?: boolean; exact?: ReadonlySet<number>; exactAngles?: ReadonlyMap<number, number> })`.

- [ ] **Step 1: Write the failing tests**

In `src/document/generated.test.ts`, change the pinned `required` list at ~line 315 to
`['name', 'role', 'material', 'at', 'size', 'tapers', 'miters', 'bevels', 'chamfers']`, and append:

```ts
describe('miters, bevels and chamfers in the design (AI-angles spec §5)', () => {
  const v = (x: number, y: number, z: number) => ({ x, y, z });
  const base = { role: '', material: 'oak', tapers: [], miters: [], bevels: [], chamfers: [] };
  it('the schema: each array is required and strict', () => {
    const part = (DESIGN_SCHEMA as any).properties.parts.items;
    expect(part.properties.miters.items.required).toEqual(['end', 'longPoint', 'angle']);
    expect(part.properties.bevels.items.required).toEqual(['face', 'longPoint', 'angle']);
    expect(part.properties.chamfers.items.required).toEqual(['edge', 'legs']);
    for (const k of ['miters', 'bevels', 'chamfers']) expect(part.properties[k].items.additionalProperties).toBe(false);
  });
  it('parseDesign refuses a part without the arrays, and copies only schema fields', () => {
    const p = { name: 'Top', ...base, at: v(0, 0, 0), size: v(18, 0.75, 12) };
    const { miters: _m, ...noMiters } = p;
    expect(parseDesign({ name: 'T', parts: [noMiters], assemblies: [] })).toBeNull();
    const ok = parseDesign({ name: 'T', parts: [{ ...p, chamfers: [{ edge: ['+y', '+z'], legs: [0.125, 0.125], extra: 1 }] }], assemblies: [] });
    expect(ok!.parts[0]!.chamfers).toEqual([{ edge: ['+y', '+z'], legs: [0.125, 0.125] }]);
  });
  it('a chamfered top converts: the chamfer is stored on the faces it names, legs snapped', () => {
    const { doc, rejected } = designToDocument({ name: 'T', parts: [
      { name: 'Top', ...base, at: v(0, 0, 0), size: v(18, 0.75, 12), chamfers: [{ edge: ['+y', '+z'], legs: [0.13, 0.13] }] },
    ] }, { centre: false });
    expect(rejected).toEqual([]);
    const b = doc.boards[0] as Board;
    expect(b.angleCuts).toHaveLength(1);
    expect(worldAngles(b)!.chamfers).toEqual([{ edge: ['+y', '+z'], legs: [0.125, 0.125] }]);
  });
  it('a flat mitered picture frame converts and checks with no overlap (Review Focus 1)', () => {
    // 12 x 12 outside, 1.5 wide, 3/4 thick, lying on the floor (Y up). Each member its full outside length; the
    // corners overlap as boxes, the miters (long point outside) remove it.
    const m = (end: string, longPoint: string) => ({ end, longPoint, angle: 45 });
    const { doc, rejected } = designToDocument({ name: 'Frame', parts: [
      { name: 'Front', ...base, at: v(0, 0, 0), size: v(12, 0.75, 1.5), miters: [m('-x', '-z'), m('+x', '-z')] },
      { name: 'Back', ...base, at: v(0, 0, 10.5), size: v(12, 0.75, 1.5), miters: [m('-x', '+z'), m('+x', '+z')] },
      { name: 'Left', ...base, at: v(0, 0, 0), size: v(1.5, 0.75, 12), miters: [m('-z', '-x'), m('+z', '-x')] },
      { name: 'Right', ...base, at: v(10.5, 0, 0), size: v(1.5, 0.75, 12), miters: [m('-z', '+x'), m('+z', '+x')] },
    ] } as never, { centre: false });
    expect(rejected).toEqual([]);
    expect(checkDesign(flatDocument(doc), { width: null, depth: null, height: null, maxParts: 10 })).toEqual([]);
  });
  it('a fault rejects the part, worded for the model', () => {
    const { rejected } = designToDocument({ name: 'T', parts: [
      { name: 'Rail', ...base, at: v(0, 0, 0), size: v(18, 3, 0.75), miters: [{ end: '+y', longPoint: '-z', angle: 45 }] },
    ] } as never);
    expect(rejected).toEqual([{ name: 'Rail', reason: 'angle', detail: expect.stringMatching(/^Rail has a miter at \+y, which is not an end of the part/) }]);
  });
  it('angle cuts leaving no wood together are rejected (bodies empty)', () => {
    const { rejected } = designToDocument({ name: 'T', parts: [
      { name: 'Stick', ...base, at: v(0, 0, 0), size: v(10, 1, 1), chamfers: [
        { edge: ['+y', '+z'], legs: [1, 1] }, { edge: ['-y', '-z'], legs: [1, 1] },
      ] },
    ] } as never);
    expect(rejected.map((r) => r.reason)).toEqual(['angle']);
  });
  it('tapers first, then miters, bevels, chamfers — one stored order whatever the model wrote', () => {
    const p = { name: 'Leg', ...base, at: v(0, 0, 0), size: v(1.75, 28, 1.75),
      tapers: [{ faces: ['+x'], toward: '-y', start: 20, amount: 0.25 }], chamfers: [{ edge: ['-x', '-z'], legs: [0.125, 0.125] }, { edge: ['-x', '+z'], legs: [0.125, 0.125] }] };
    const a = designToDocument({ name: 'T', parts: [p] } as never).doc.boards[0] as Board;
    const b = designToDocument({ name: 'T', parts: [{ ...p, chamfers: [...p.chamfers].reverse() }] } as never).doc.boards[0] as Board;
    expect(a.angleCuts.map((c) => c.kind)).toEqual(['taper', 'chamfer', 'chamfer']);
    expect(b.angleCuts.map(({ id: _i, ...c }) => c)).toEqual(a.angleCuts.map(({ id: _i, ...c }) => c));
  });
  it('exactAngles keeps a stored slope; without it the angle is rounded to 0.1°', () => {
    const p = { name: 'Rail', ...base, at: v(0, 0, 0), size: v(18, 3, 0.75), miters: [{ end: '+x', longPoint: '-z', angle: 37.4999 }] };
    const plain = designToDocument({ name: 'T', parts: [p] } as never, { centre: false }).doc.boards[0] as Board;
    expect(plain.angleCuts[0]!.points[1][1]).toBe(0.75 * miterRatio(37.5));
    const kept = designToDocument({ name: 'T', parts: [p] } as never, { centre: false, exactAngles: new Map([[37.4999, 0.77]]) }).doc.boards[0] as Board;
    expect(kept.angleCuts[0]!.points[1][1]).toBe(0.75 * 0.77);
  });
});
```

(Imports to add at the top of generated.test.ts as needed: `worldAngles` from `./angleWorld`, `miterRatio` from
`./angleCuts`, `checkDesign` from `./designCheck`, `flatDocument` from `./tree`, `Board` type.)

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/document/generated.test.ts`
Expected: FAIL — the schema has no `miters`; `designToDocument` ignores `chamfers`.

- [ ] **Step 3: Implement**

In `src/document/generated.ts`:

1. Imports: `import { angleCutsFor, sortAngleCuts } from './angleWorld'; import type { WorldBevel, WorldChamfer, WorldMiter } from './angleWorld'; import { boardBodies } from './bodies';`
2. `GeneratedPart` gains `miters?: WorldMiter[]; bevels?: WorldBevel[]; chamfers?: WorldChamfer[];` with the comment
   "Required from the model (parseDesign checks them); optional here like `tapers`."
3. `RejectedPart['reason']` gains `| 'angle'`; its doc comment: "`detail` is the whole message, set for `'taper'` and `'angle'`."
4. Schemas, after `taperSchema`:

```ts
/** One miter, bevel or chamfer in world words (AI-angles spec §5.1); the converter checks directions and numbers. */
const miterSchema = {
  type: 'object',
  properties: { end: dirSchema, longPoint: dirSchema, angle: { type: 'number' } },
  required: ['end', 'longPoint', 'angle'],
  additionalProperties: false,
};
const bevelSchema = {
  type: 'object',
  properties: { face: dirSchema, longPoint: dirSchema, angle: { type: 'number' } },
  required: ['face', 'longPoint', 'angle'],
  additionalProperties: false,
};
const chamferSchema = {
  type: 'object',
  properties: { edge: { type: 'array', items: dirSchema }, legs: { type: 'array', items: { type: 'number' } } },
  required: ['edge', 'legs'],
  additionalProperties: false,
};
```

   and in `partSchema.properties`: `miters: { type: 'array', items: miterSchema }, bevels: { type: 'array', items: bevelSchema }, chamfers: { type: 'array', items: chamferSchema },`
   with `required: ['name', 'role', 'material', 'at', 'size', 'tapers', 'miters', 'bevels', 'chamfers']`.
5. Parsing:

```ts
const isMiter = (m: unknown): boolean => isObj(m) && isDir(m.end) && isDir(m.longPoint) && typeof m.angle === 'number';
const isBevel = (m: unknown): boolean => isObj(m) && isDir(m.face) && isDir(m.longPoint) && typeof m.angle === 'number';
// Arrays cannot be length-constrained in the schema: exactly two of each here.
const isChamfer = (m: unknown): boolean => isObj(m) && Array.isArray(m.edge) && m.edge.length === 2 && m.edge.every(isDir) &&
  Array.isArray(m.legs) && m.legs.length === 2 && m.legs.every((n) => typeof n === 'number');
```

   `isPart` adds `&& Array.isArray(p.miters) && p.miters.every(isMiter) && Array.isArray(p.bevels) && p.bevels.every(isBevel) && Array.isArray(p.chamfers) && p.chamfers.every(isChamfer)`;
   `partOf` adds
   `miters: (p.miters ?? []).map((m) => ({ end: m.end, longPoint: m.longPoint, angle: m.angle })), bevels: (p.bevels ?? []).map((m) => ({ face: m.face, longPoint: m.longPoint, angle: m.angle })), chamfers: (p.chamfers ?? []).map((m) => ({ edge: [m.edge[0], m.edge[1]] as [WorldChamfer['edge'][0], WorldChamfer['edge'][1]], legs: [m.legs[0], m.legs[1]] as [number, number] })),`
6. `convertPart(p, label, rejected, exact?, exactAngles?)`: after the taper block (which returns `made.cuts`), add:

```ts
  // Miters, bevels and chamfers (AI-angles spec §5.2): legs snapped as size is, unless exact; angles through ratioFor.
  const chamfers = (p.chamfers ?? []).map((c) => ({ ...c, legs: c.legs.map((l) => (exact?.has(l) ? l : snap(l))) as [number, number] }));
  if (!chamfers.every((c) => c.legs.every(usable)) || ![...(p.miters ?? []), ...(p.bevels ?? [])].every((m) => Number.isFinite(m.angle))) {
    rejected.push({ name: label, reason: 'angle', detail: `${label} has a miter, bevel or chamfer whose numbers are not finite or are beyond 10,000in.` });
    return null;
  }
  const board = { id: '', angleCuts: [], ...fields } as Board;
  const angled = angleCutsFor(board, { miters: p.miters ?? [], bevels: p.bevels ?? [], chamfers }, exactAngles);
  if ('fault' in angled) {
    rejected.push({ name: label, reason: 'angle', detail: `${label} ${angled.fault}.` });
    return null;
  }
  const angleCuts = [...made.cuts, ...sortAngleCuts(angled.cuts)].map((c) => ({ id: nextId(), ...c }));
  // Together they must leave wood (spec §5.2): the part's real bodies are not empty.
  if (angleCuts.length > 0 && boardBodies({ ...board, angleCuts }).length === 0) {
    rejected.push({ name: label, reason: 'angle', detail: `${label} has angle cuts that together leave no wood.` });
    return null;
  }
  return { ...fields, angleCuts };
```

   (replacing the old `return { ...fields, angleCuts: made.cuts.map(...) }`; `made` is the taper result already
   checked). Thread `exactAngles` from `designToDocument`'s opts to both `convertPart` calls, and add
   `exactAngles?: ReadonlyMap<number, number>` to the opts type and its doc comment.
7. In `src/document/designCheck.ts`' `rejectedViolations`, add `angle: (n) => \`${n} has a miter, bevel or chamfer that cannot be built.\`,`.

- [ ] **Step 4: Fixtures that reach `parseDesign`**

The model must now send the three arrays, so every fixture passed through `parseDesign` (directly, or as a fake
client's JSON in `run.test.ts`, `refine.test.ts`, `useGenerations.test.tsx`, `App.test.tsx`, `unjoin.test.ts`,
`tapers.test.ts`, `prompt.test.ts`, and `shakerTableFixture.ts`) gains `miters: [], bevels: [], chamfers: []` beside its
`tapers`. Run `npx vitest run > <workspace>/t2.log 2>&1` and fix exactly the fixtures whose tests now fail on a null
parse. Fixtures given straight to `designToDocument` (not parsed) need nothing: the fields are optional there.

- [ ] **Step 5: Run to see them pass**

Run: `npx vitest run && npm run build`
Expected: PASS (whole suite); build 0.

- [ ] **Step 6: Mutate**

(a) Drop `'miters'` from `required`: the schema pin fails. (b) Remove the `boardBodies` check: "leaving no wood together"
fails. (c) Use `angled.cuts` instead of `sortAngleCuts(angled.cuts)` AND reverse the order inside `angleCutsFor`'s return
temporarily: the order test fails (then restore both). Restore; PASS.

- [ ] **Step 7: Commit**

```bash
git add -A src
git commit -m "feat(generate): the design schema carries miters, bevels and chamfers; the converter stores them (AI-angles §5.1, §5.2)"
```

---

### Task 3: The design fault and the `angle-joint` rename

**Files:**
- Modify: `src/document/designCheck.ts` (`ViolationKind`: `'taper-joint'` → `'angle-joint'`; `taperJointViolations` →
  `jointViolations`)
- Modify: `src/generate/joints/tapers.ts` (`taperFaults` → `jointFaults`)
- Modify: `src/generate/run.ts` (imports and both `taperFaults` calls)
- Modify: `src/document/refineDesign.ts` (`RefusalReason`: `'taper-joint'` → `'angle-joint'`), `src/generate/refine.ts`
  (lines 64-65, 86-88), `src/panels/RefineDialog.tsx:135`
- Test: `src/generate/joints/tapers.test.ts`, `src/generate/run.test.ts`, `src/generate/refine.test.ts` (renames + one new test)

**Interfaces:**
- Consumes: `taperConflicts`, `angleConflicts`, `findSites` (tapers.ts); `TaperConflict`, `AngleConflict` (angledRefusal.ts).
- Produces: `jointViolations(flat: FlatDocument, tapers: readonly TaperConflict[], angles: readonly AngleConflict[]): Violation[]`
  (designCheck.ts); `jointFaults(flat: FlatDocument): Violation[]` (tapers.ts); `ViolationKind` and `RefusalReason`
  with `'angle-joint'`.

- [ ] **Step 1: Write the failing test**

In `src/generate/joints/tapers.test.ts`, rename every `taperFaults` → `jointFaults` and every `'taper-joint'` →
`'angle-joint'` (import `jointFaults` from `./tapers`), then append inside the `angleConflicts` describe:

```ts
  it('the design fault: a miter at a joint goes back to the model as angle-joint, in world words (spec §5.4)', () => {
    const doc = withPart(CORNER, 'Rail X', railMiter(-1));
    const f = jointFaults(doc);
    expect(f).toEqual([{ kind: 'angle-joint', parts: ['Rail X', 'Leg'],
      message: "Rail X's miter runs into where it meets Leg (a joint goes there) — move it off that end or face, or remove it." }]);
    // A taper conflict on the same part wins, worded as before.
    const both = withPart(withLeg(CORNER, inside(24)), 'Leg', (b) => [...inside(24)(b), chamfer(b, [0, 1], [2, -1], 0.75)]);
    expect(jointFaults(both).filter((v) => v.parts[0] === 'Leg')).toHaveLength(1);
    expect(jointFaults(both)[0]!.message).toContain("Leg's taper toward");
  });
```

In `run.test.ts` and `refine.test.ts`, rename `'taper-joint'` → `'angle-joint'` wherever a test asserts that kind or reason.

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/generate/joints/tapers.test.ts`
Expected: FAIL — `jointFaults` is not exported.

- [ ] **Step 3: Implement**

In `designCheck.ts`: `ViolationKind` gets `'angle-joint'` in place of `'taper-joint'`; import `AngleConflict` with
`TaperConflict` from `./angledRefusal`; replace `taperJointViolations` with:

```ts
/**
 * The angle-at-joint rule as a DESIGN fault (AI-tapers spec §5.3; AI-angles spec §5.4), for the model: world words,
 * plain decimal inches, one per part — a taper conflict's wording (unchanged) when the part has one, else its angle
 * conflict's. The taper advice is a LIMIT floored to SNAP_INCHES: the converter snaps `start` to 1/16, so advice off
 * that grid would snap past the meeting and conflict again. Not part of checkDesign (joinery's gate); evaluateDesign adds it.
 */
export function jointViolations(flat: FlatDocument, tapers: readonly TaperConflict[], angles: readonly AngleConflict[]): Violation[] {
  const out: Violation[] = tapers.map(({ part, other, end, nearest }) => {
    const b = flat.boards[part]!;
    const o = flat.boards[other]!;
    const dir = localToDir(b, 'length', end);
    const limit = Math.floor(nearest / SNAP_INCHES + 1e-9) * SNAP_INCHES;
    const message = limit === 0
      ? `${b.name}'s taper toward ${dir} runs to its ${dir} end, where it meets ${o.name} (a joint goes there) \u2014 taper the other end, or remove the taper.`
      : `${b.name}'s taper toward ${dir} runs into where it meets ${o.name} (a joint goes there) \u2014 start it ${limit}in or less from its ${dir} end, or remove it.`;
    return { kind: 'angle-joint' as const, message, parts: [b.name, o.name] };
  });
  const tapered = new Set(tapers.map((c) => c.part));
  for (const { part, other, kind } of angles) {
    if (tapered.has(part)) continue;
    const b = flat.boards[part]!;
    const o = flat.boards[other]!;
    out.push({ kind: 'angle-joint', parts: [b.name, o.name],
      message: `${b.name}'s ${kind} runs into where it meets ${o.name} (a joint goes there) \u2014 move it off that end or face, or remove it.` });
  }
  return out;
}
```

(Keep the two taper message strings byte-for-byte as they are today — copy them from the current function, `—`
escapes included; only `kind` changes.)

In `tapers.ts` replace `taperFaults` with:

```ts
/** The angle-at-joint rule on a DESIGN (AI-tapers spec 5.3; AI-angles spec §5.4): every conflict as an `angle-joint` fault, for evaluateDesign and Refine's preexisting set. */
export function jointFaults(flat: FlatDocument): Violation[] {
  const sites = findSites(flat);
  return jointViolations(flat, taperConflicts(flat, sites), angleConflicts(flat, sites));
}
```

(update its `designCheck` import: `jointViolations` instead of `taperJointViolations`). In `run.ts` import and call
`jointFaults` in both places. Rename the reason in `refineDesign.ts`' `RefusalReason`, `refine.ts` (`reason: 'angle-joint'`,
the `joined` test, and the comment), and `RefineDialog.tsx:135` (`v.kind === 'angle-joint'`).

- [ ] **Step 4: Run to see it pass**

Run: `npx vitest run src/generate/ src/document/ src/panels/RefineDialog.test.tsx && npm run build`
Expected: PASS; build 0; `grep -rn "taper-joint\|taperFaults\|taperJointViolations" src` prints nothing.

- [ ] **Step 5: Mutate**

Delete the `if (tapered.has(part)) continue;` line: the "taper wins" assertion fails. Restore; PASS.

- [ ] **Step 6: Commit**

```bash
git add -A src
git commit -m "feat(generate): the angle-joint design fault for miters, bevels and chamfers; taper-joint renamed angle-joint (AI-angles §5.4)"
```

---

### Task 4: Refine reads and writes them

**Files:**
- Modify: `src/document/refineDesign.ts` (`box`, `designValues`, `documentToDesign`'s refusals, `RefusalReason`)
- Modify: `src/document/angledRefusal.ts` (delete `angledParts` and `angledRefusal`), `src/document/document.ts` (their
  re-exports), `src/document/angledRefusal.test.ts` (delete their tests)
- Modify: `src/generate/refine.ts` (`plainForRefine` drops the angled gate), `src/generate/refine.ts`' `KEEP_LINE`
- Modify: `src/generate/run.ts` (`EvaluateOpts.exactAngles`; `runRefine` passes it)
- Test: `src/document/refineDesign.test.ts`, `src/generate/refine.test.ts`

**Interfaces:**
- Consumes: Task 1's `worldAngles`, `angleCutsFor`, `angleRatiosOf`, `AngleFaultCode`; Task 2's `exactAngles` option.
- Produces: `RefusalReason` without `'angled'`, with `'angle-form'`; `EvaluateOpts.exactAngles?: ReadonlyMap<number, number>`.

- [ ] **Step 1: Write the failing tests**

Append to `src/document/refineDesign.test.ts` (imports: `chamferCut, miterCut, bevelCut, miterRatio` from `./angleCuts`,
`worldAngles, angleRatiosOf` from `./angleWorld`; the file already has `documentToDesign`, `designValues`,
`designToDocument`, `orient`, `boardExtents`, `createBoard`, `createDocument`, `MAX`):

```ts
describe('documentToDesign — miters, bevels and chamfers (AI-angles spec §6)', () => {
  const POSTURES: Posture[] = ['flat', 'on-edge', 'upright'];
  const TURNS: Rotation[] = [0, 90, 180, 270];
  const angled = (b: Board): Board => ({ ...b, angleCuts: [
    { id: 'm', ...miterCut({ end: 'max', across: 'width', longSide: 'min', ratio: miterRatio(37.5) }, b) },
    { id: 'v', ...bevelCut({ face: 'thickness', from: 'max', longSide: 'max', ratio: miterRatio(15) }, b) },
    { id: 'c', ...chamferCut({ face: 'width', from: 'min', along: 'thickness', alongFrom: 'min', legFace: 0.25, legAlong: 0.125 }, b) },
  ] });
  const parts = POSTURES.flatMap((posture) => TURNS.map((rotation) =>
    angled(createBoard({ name: `P ${posture} ${rotation}`, length: 20, width: 3, thickness: 1.5, posture, rotation, position: [0, 0, 0] }))));
  for (const b of parts) {
    it(`${b.name}: round-trips exactly through the design (untouched angles keep their slope)`, () => {
      const doc = { ...createDocument('T'), boards: [b] };
      const r = documentToDesign(doc, MAX);
      if ('refused' in r) throw new Error(r.refused.message);
      expect({ miters: r.design.parts[0]!.miters, bevels: r.design.parts[0]!.bevels, chamfers: r.design.parts[0]!.chamfers }).toEqual(worldAngles(b));
      const back = designToDocument(r.design, { centre: false, exact: designValues(r.design), exactAngles: angleRatiosOf([b]) }).doc.boards[0]! as Board;
      expect(worldAngles(back)).toEqual(worldAngles(b));
      const o = orient(boardExtents(b));
      if (o.posture === b.posture && o.rotation === b.rotation) {
        expect(back.angleCuts.map(({ id: _i, ...c }) => c)).toEqual(b.angleCuts.map(({ id: _i, ...c }) => c));
      }
    });
  }
  it('without the exact-angle map a non-45° slope can drift (the map is what keeps it)', () => {
    const b = { ...createBoard({ name: 'R', length: 20, width: 3, thickness: 0.75 }), angleCuts: [
      { id: 'm', ...miterCut({ end: 'max', across: 'width', longSide: 'min', ratio: 0.7 }, createBoard({ length: 20, width: 3, thickness: 0.75 })) },
    ] };
    const r = documentToDesign({ ...createDocument('T'), boards: [b] }, MAX);
    if ('refused' in r) throw new Error(r.refused.message);
    const plain = designToDocument(r.design, { centre: false }).doc.boards[0] as Board;
    const kept = designToDocument(r.design, { centre: false, exactAngles: angleRatiosOf([b]) }).doc.boards[0] as Board;
    expect(kept.angleCuts[0]!.points).toEqual(b.angleCuts[0]!.points);
    expect(plain.angleCuts[0]!.points).not.toEqual(b.angleCuts[0]!.points);   // rounded to 0.1°: a different slope
  });
  it('a model that rounds 37.4999… back to 37.5 still stores the Properties slope (Review Focus 5)', () => {
    const b = parts[0]!;
    const r = documentToDesign({ ...createDocument('T'), boards: [b] }, MAX);
    if ('refused' in r) throw new Error(r.refused.message);
    const rounded = { ...r.design, parts: [{ ...r.design.parts[0]!, miters: r.design.parts[0]!.miters!.map((m) => ({ ...m, angle: 37.5 })) }] };
    const back = designToDocument(rounded, { centre: false, exact: designValues(rounded), exactAngles: angleRatiosOf([b]) }).doc.boards[0] as Board;
    expect(back.angleCuts.find((c) => c.kind === 'miter')!.points).toEqual(b.angleCuts.find((c) => c.kind === 'miter')!.points);
  });
  it('an assembly part keeps its chamfer in the definition frame (Review Focus 2)', () => {
    const part = { ...createBoard({ id: 'p', name: 'Slat', length: 20, width: 3, thickness: 0.75, position: [0, 0, 0] }), angleCuts: [
      { id: 'c', ...chamferCut({ face: 'width', from: 'max', along: 'thickness', alongFrom: 'max', legFace: 0.125, legAlong: 0.125 }, createBoard({ length: 20, width: 3, thickness: 0.75 })) },
    ] };
    const doc = { ...createDocument('T'), definitions: [{ id: 'd', boards: [part], instances: [] }],
      instances: [{ id: 'i1', name: 'A', definition: 'd', position: [0, 0, 0] as [number, number, number], rotation: 0 as const }, { id: 'i2', name: 'B', definition: 'd', position: [0, 0, 10] as [number, number, number], rotation: 0 as const }] };
    const r = documentToDesign(doc, MAX);
    if ('refused' in r) throw new Error(r.refused.message);
    expect(r.design.assemblies![0]!.parts[0]!.chamfers).toEqual(worldAngles(part)!.chamfers);
  });
  it("refuses, before any call, a cut it can't describe ('angle-form'), naming the part and kind", () => {
    const b = parts[0]!;
    const odd = { ...b, angleCuts: [{ ...b.angleCuts[0]!, points: [[0, 0.5], [3, 3.5]] as [[number, number], [number, number]] }] };
    const r = documentToDesign({ ...createDocument('T'), boards: [odd] }, MAX);
    expect('refused' in r && r.refused).toEqual({ reason: 'angle-form', message: `${b.name}'s miter can't be described to Refine — edit it in Properties first.` });
  });
  it('refuses a cut the converter would reject on the re-encoded part (Review Focus 3)', () => {
    // Stored with WIDTH 22 > length 20: orient re-encodes it with the 22 side as its length, so its miter across the
    // old length (now the width) would cut deeper than the new part is long... use a miter at its old LENGTH end, which
    // is a side of the re-encoded part: not an end any more.
    const b = { ...createBoard({ name: 'Wide', length: 20, width: 22, thickness: 0.75, position: [0, 0, 0] }) };
    const withMiter = { ...b, angleCuts: [{ id: 'm', ...miterCut({ end: 'max', across: 'thickness', longSide: 'min', ratio: 1 }, b) }] };
    const r = documentToDesign({ ...createDocument('T'), boards: [withMiter] }, MAX);
    expect('refused' in r && r.refused.reason).toBe('angle-form');
    expect('refused' in r && r.refused.message).toContain("Wide's miter can't be described to Refine (");
  });
  it('designValues carries chamfer legs (exact set)', () => {
    const r = documentToDesign({ ...createDocument('T'), boards: [parts[0]!] }, MAX);
    if ('refused' in r) throw new Error(r.refused.message);
    expect(designValues(r.design).has(0.125)).toBe(true);
    expect(designValues(r.design).has(0.25)).toBe(true);
  });
});
```

Also, in `refineDesign.test.ts` (~line 241), replace the `reason: 'angled'` assertion: that fixture's miter is stored in
a taper's shape, so it is now refused as `'angle-form'` (assert that reason). In `refine.test.ts`, REPLACE the
`describe('refine — angled documents (spec §6)')` block (its `angled` fixture is the same taper-shaped "miter") with:

```ts
describe('refine — angled documents (AI-angles spec §6)', () => {
  const odd: SloydDocument = { ...createDocument('T'), boards: [createBoard({ id: 'leg', name: 'Leg', angleCuts: [{ ...TAPER, kind: 'miter' as const }] })] };
  it('a taper document passes plainForRefine', () => {
    const tapered: SloydDocument = { ...createDocument('T'), boards: [createBoard({ id: 'leg', name: 'Leg', angleCuts: [TAPER] })] };
    expect('plain' in plainForRefine(tapered)).toBe(true);
  });
  it('plainForRefine no longer refuses angled documents', () => {
    expect('plain' in plainForRefine(odd)).toBe(true);
  });
  it("documentToDesign refuses a miter it can't describe, as angle-form", () => {
    const r = documentToDesign(odd, REFINE_MAX);
    expect('refused' in r && r.refused.reason).toBe('angle-form');
  });
});

// A joined CHAMFERED corner (AI-angles spec §6.3): the corner above, the Leg chamfered on its -x/-z vertical edge (no
// rail reaches it), joined with short mortise-tenons.
const legChamfer = (b: Board): AngleCut => {
  const p = { dim: axisFrame(b)[0]!.dim, from: endFacing(b, 0, -1) };
  const q = { dim: axisFrame(b)[2]!.dim, from: endFacing(b, 2, -1) };
  const order = ['length', 'width', 'thickness'];
  const [f, g] = order.indexOf(p.dim) < order.indexOf(q.dim) ? [p, q] : [q, p];
  return { id: 'k', ...chamferCut({ face: f.dim, from: f.from, along: g.dim, alongFrom: g.from, legFace: 0.125, legAlong: 0.125 }, b) };
};
describe('plainForRefine — a joined chamfered design (AI-angles spec §6.3)', () => {
  it('reads the joints back and returns the plain parts with the chamfer intact', () => {
    const flat0 = flatDocument(designToDocument({ name: 'Corner', assemblies: [], parts: [
      cornerPart('Leg', [0, 0, 0], [1.75, 28, 1.75]), cornerPart('Rail X', [1.75, 23.5, 0.5], [18, 3, 0.75]), cornerPart('Rail Z', [0.5, 23.5, 1.75], [0.75, 3, 18]),
    ] }).doc);
    const flat = { ...flat0, boards: flat0.boards.map((b) => (b.name === 'Leg' ? { ...b, angleCuts: [legChamfer(b)] } : b)) };
    const sites = findSites(flat);
    const joined = migrateDocument(applyJoints(flat, sites, sites.map((s) => ({ site: s.id, joint: 'mortise-tenon' as const, tenonLength: 0.5 }))).doc);
    expect(flatDocument(joined).boards.find((b) => b.name === 'Leg')!.cuts.length).toBeGreaterThan(0);
    const r = plainForRefine(joined);
    if ('refused' in r) throw new Error(r.refused.message);
    expect(flatDocument(r.plain).boards.find((b) => b.name === 'Leg')!.angleCuts).toEqual([legChamfer(flat.boards.find((b) => b.name === 'Leg')!)]);
  });
});
```

(`cornerPart` and `TAPER` already exist in the file; move this block below `cornerPart`'s declaration. Add `chamferCut`
to the `../document/angleCuts` import. `cornerPart` sends no `miters`/`bevels`/`chamfers`, which is fine: it goes to
`designToDocument`, not `parseDesign`.)

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/document/refineDesign.test.ts src/generate/refine.test.ts`
Expected: FAIL — `documentToDesign` refuses `'angled'`; the design has no `miters`.

- [ ] **Step 3: Implement**

In `refineDesign.ts`:

```ts
import { angleCutsFor, worldAngles, angleRatiosOf } from './angleWorld';
import type { AngleFaultCode } from './angleWorld';
// remove: import { angledParts, angledRefusal } from './angledRefusal';

export type RefusalReason = 'empty' | 'cuts' | 'turned' | 'nested' | 'too-large' | 'joints' | 'mirrored' | 'taper-form' | 'angle-form' | 'angle-joint';

/** Each angle-converter fault, in the person's words. */
const ANGLE_REASON: Record<AngleFaultCode, string> = {
  direction: 'its faces no longer describe it on the reshaped part',
  angle: 'its angle is out of range',
  legs: "its legs don't describe a chamfer",
  'no-wood': 'it would leave no wood',
};
```

`box(...)` spreads `...(worldAngles(b) ?? { miters: [], bevels: [], chamfers: [] })` into the returned part beside
`tapers`. `designValues`' `addTapers` also adds every chamfer leg (`for (const c of p.chamfers ?? []) { out.add(c.legs[0]); out.add(c.legs[1]); }`).

In `documentToDesign`, replace the `angledParts`/`angledRefusal` block with, AFTER the two taper-form blocks:

```ts
  // A miter, bevel or chamfer Refine cannot describe exactly is refused, never rewritten (AI-angles spec §6.1).
  const flatBoards = flatDocument(doc).boards;
  const oddKind = (b: Board) => b.angleCuts.find((c) => c.kind !== 'taper' && worldAngles({ ...b, angleCuts: [c] }) === null)?.kind;
  const oddAngles = flatBoards.flatMap((b) => { const k = oddKind(b); return k ? [{ name: b.name, kind: k }] : []; });
  if (oddAngles.length === 1) return refuse('angle-form', `${oddAngles[0]!.name}'s ${oddAngles[0]!.kind} can't be described to Refine — edit it in Properties first.`);
  if (oddAngles.length > 1) return refuse('angle-form', `The angle cuts on ${oddAngles.slice(0, 3).map((o) => o.name).join(', ')}${oddAngles.length > 3 ? '…' : ''} can't be described to Refine — edit them in Properties first.`);
  // …and one the converter would reject on the part as the design re-encodes it (orient), as fu 309 does for tapers.
  const unbuildable = flatBoards.flatMap((b) => {
    const a = worldAngles(b);
    if (!a || a.miters.length + a.bevels.length + a.chamfers.length === 0) return [];
    const made = angleCutsFor({ ...b, ...orient(boardExtents(b)) }, a, angleRatiosOf([b]));
    if (!('fault' in made)) return [];
    const kind = (['miter', 'bevel', 'chamfer'] as const).find((k) => made.fault.includes(`${k}`)) ?? 'angle cut';
    return [{ name: b.name, kind, why: ANGLE_REASON[made.code] }];
  });
  if (unbuildable.length === 1) {
    const [u] = unbuildable;
    return refuse('angle-form', `${u!.name}'s ${u!.kind} can't be described to Refine (${u!.why}) — edit it in Properties first.`);
  }
  if (unbuildable.length > 1) {
    return refuse('angle-form', `The angle cuts on ${unbuildable.slice(0, 3).map((u) => u.name).join(', ')}${unbuildable.length > 3 ? '…' : ''} can't be described to Refine — edit them in Properties first.`);
  }
```

In `angledRefusal.ts`, delete `angledParts`, `shown` (if now unused) and `angledRefusal`; drop them from `document.ts`'
re-export; delete their tests in `angledRefusal.test.ts` (keep the file's `jointRefusal`/taper tests, if any, or delete the
file if it becomes empty — record which).

In `refine.ts`' `plainForRefine`, delete the two `angledRefusal` lines and the import. Update `KEEP_LINE` to
`'Keep every part you are not asked to change exactly as it is: the same name, role, material, size, position, tapers, miters, bevels and chamfers. Keep assembly and placement names. Return the whole design.'`
(and its pinned test string).

In `run.ts`: `EvaluateOpts` gains `exactAngles?: ReadonlyMap<number, number>;`, `evaluateDesign` passes
`exactAngles: opts.exactAngles` to `designToDocument`, and `runRefine`'s evaluate passes
`exactAngles: angleRatiosOf(plainFlat0.boards)` (import `angleRatiosOf` from `../document/angleWorld`; `plainFlat0` is the
flat plain original already computed at ~line 226 — read the surrounding lines to confirm its name).

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run && npm run build`
Expected: PASS; build 0.

- [ ] **Step 5: Mutate**

(a) Pass `exactAngles: undefined` in `runRefine` and confirm the round-trip tests through `documentToDesign` +
`designToDocument` still pass (they pass the map themselves) — then confirm by a one-off that `runRefine`'s wiring is
what a run uses: grep `angleRatiosOf` in run.ts shows the one call; restore. (b) Remove the `unbuildable` block: Review
Focus 3's test fails. (c) Remove the `oddAngles` block: the `'angle-form'` test fails. Restore; PASS.

- [ ] **Step 6: Commit**

```bash
git add -A src
git commit -m "feat(refine): Refine reads and writes miters, bevels and chamfers, keeping untouched angles exactly (AI-angles §6)"
```

---

### Task 5: The change list

**Files:**
- Modify: `src/document/designDiff.ts` (`ChangeKind` `'taper'` → `'angle'`; new `angleLines`)
- Test: `src/document/designDiff.test.ts` (rename `'taper'` → `'angle'` in kind assertions; new `describe`)

**Interfaces:**
- Consumes: `worldAngles`, `noAngles`, `WorldAngles` (Task 1).
- Produces: `ChangeKind` with `'angle'` (no `'taper'`).

- [ ] **Step 1: Write the failing tests**

Append to `src/document/designDiff.test.ts` (imports: `chamferCut, miterCut, miterRatio` from `./angleCuts`):

```ts
describe('diffDesigns — miters, bevels and chamfers (AI-angles spec §6.4)', () => {
  const rail = (name = 'Rail') => createBoard({ name, length: 18, width: 3, thickness: 0.75, position: [0, 0, 0] });
  const doc = (b: Board) => ({ ...createDocument('T'), boards: [b] });
  const miter = (b: Board, ratio: number) => ({ id: 'm', ...miterCut({ end: 'max', across: 'width', longSide: 'min', ratio }, b) });
  const ch = (b: Board, leg: number) => ({ id: 'c', ...chamferCut({ face: 'width', from: 'max', along: 'thickness', alongFrom: 'max', legFace: leg, legAlong: leg }, b) });
  it('added, changed and removed, one line each, in world words at display precision', () => {
    const b = rail();
    const lines = (before: Board, after: Board) => diffDesigns(doc(before), doc(after)).filter((c) => c.kind === 'angle').map((c) => c.text);
    const m45 = { ...b, angleCuts: [miter(b, 1)] };
    const m30 = { ...b, angleCuts: [miter(b, miterRatio(30))] };
    const c8 = { ...b, angleCuts: [ch(b, 0.125)] };
    expect(lines(b, m45)).toEqual(['Rail: miter added (+x end; 45.0°, long point -y)']);
    expect(lines(m45, m30)).toEqual(['Rail: miter changed (+x end; 30.0°, long point -y)']);
    expect(lines(m45, b)).toEqual(['Rail: miter removed (+x end)']);
    expect(lines(b, c8)).toEqual(['Rail: chamfer added (+y/+z edge; 1/8" × 1/8")']);
    // Below display precision: no line.
    expect(lines(m45, { ...b, angleCuts: [miter(b, 1.0000000001)] })).toEqual([]);
  });
  it('taper lines are kind angle too', () => {
    expect(['added', 'removed', 'resized', 'moved', 'material', 'angle', 'linked', 'unlinked']).toContain('angle');
  });
});
```

(Before writing the expected strings, check the board's world axes with `axisFrame` in a one-off: a default flat board
has length on X, width on Z… read `createBoard`'s defaults and correct the DIRECTIONS in the expected strings to what
`worldAngles` reports for this board — the FORMAT is what this test pins: `<kind> <added|changed|removed> (<where>; <detail>)`,
`<where>` = `<dir> end` (miter), `<dir> face` (bevel), `<dir>/<dir> edge` (chamfer); `<detail>` = `<deg.toFixed(1)>°, long
point <dir>` or `<leg> × <leg>` via `formatLength`.)

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/document/designDiff.test.ts`
Expected: FAIL — no `'angle'` lines.

- [ ] **Step 3: Implement**

In `designDiff.ts`: `ChangeKind` `'taper'` → `'angle'`; the taper push becomes `push('angle', …, key('angle', …))`; then
after it:

```ts
    for (const t of angleLines(worldAngles(o.b) ?? noAngles(), worldAngles(e.b) ?? noAngles(), len)) push('angle', 'part', n, `${n}: ${t}`, key('angle', `: ${t}`));
```

and add:

```ts
/**
 * One part's miter, bevel and chamfer lines (AI-angles spec §6.4): matched by where they are — a miter by its end, a
 * bevel by its face, a chamfer by its edge — then added, changed (its displayed detail differs) or removed, in kind
 * order. `worldAngles` is never null here: Refine refuses a cut it cannot describe before any call.
 */
function angleLines(before: WorldAngles, after: WorldAngles, len: (n: number) => string): string[] {
  type Entry = { kind: 'miter' | 'bevel' | 'chamfer'; where: string; detail: string };
  const deg = (a: number) => `${a.toFixed(1)}°`;
  const entries = (a: WorldAngles): Entry[] => [
    ...a.miters.map((m) => ({ kind: 'miter' as const, where: `${m.end} end`, detail: `${deg(m.angle)}, long point ${m.longPoint}` })),
    ...a.bevels.map((v) => ({ kind: 'bevel' as const, where: `${v.face} face`, detail: `${deg(v.angle)}, long point ${v.longPoint}` })),
    ...a.chamfers.map((c) => ({ kind: 'chamfer' as const, where: `${c.edge[0]}/${c.edge[1]} edge`, detail: `${len(c.legs[0])} × ${len(c.legs[1])}` })),
  ];
  const was = new Map(entries(before).map((x) => [`${x.kind}|${x.where}`, x]));
  const now = new Map(entries(after).map((x) => [`${x.kind}|${x.where}`, x]));
  const out: string[] = [];
  for (const [k, x] of now) {
    const old = was.get(k);
    if (!old) out.push(`${x.kind} added (${x.where}; ${x.detail})`);
    else if (old.detail !== x.detail) out.push(`${x.kind} changed (${x.where}; ${x.detail})`);
  }
  for (const [k, x] of was) if (!now.has(k)) out.push(`${x.kind} removed (${x.where})`);
  return out;
}
```

Import `noAngles, worldAngles` and type `WorldAngles` from `./angleWorld`. Rename `'taper'` → `'angle'` in existing
designDiff tests' kind filters.

- [ ] **Step 4: Run to see it pass**

Run: `npx vitest run src/document/designDiff.test.ts src/generate/ src/panels/ && npm run build`
Expected: PASS; build 0.

- [ ] **Step 5: Mutate**

Change `old.detail !== x.detail` to `false`: the "changed" assertion fails. Restore; PASS.

- [ ] **Step 6: Commit**

```bash
git add -A src
git commit -m "feat(refine): the change list names miters, bevels and chamfers; change kind taper → angle (AI-angles §6.4)"
```

---

### Task 6: Linking re-stores every kind under turns

**Files:**
- Modify: `src/document/roleLinks.ts` (`turnCandidates`)
- Test: `src/document/roleLinks.test.ts`

**Interfaces:**
- Consumes: `worldAngles`, `angleCutsFor`, `angleRatiosOf` (Task 1).
- Produces: `turnCandidates(b)` re-stores miters, bevels and chamfers too; still `[]` for rectangular cuts or an
  undescribable cut.

- [ ] **Step 1: Write the failing test**

Append to `src/document/roleLinks.test.ts`, inside or after `describe('turned links (fu 301)')`:

```ts
describe('turned links with chamfers (AI-angles spec §7)', () => {
  type Dir = '+x' | '-x' | '+z' | '-z';
  const chamfered = (name: string, at: [number, number, number], edge: [Dir, Dir], role = 'leg'): GeneratedPart =>
    ({ ...part(name, role, at, LEG), chamfers: [{ edge, legs: [0.25, 0.25] }] });
  // Each leg chamfered on its OUTSIDE vertical corner: four different stored parts until turned.
  const outside = (role = 'leg') => [
    chamfered('Leg FL', [0, 0, 0], ['-x', '-z'], role), chamfered('Leg FR', [20, 0, 0], ['+x', '-z'], role),
    chamfered('Leg BL', [0, 0, 20], ['-x', '+z'], role), chamfered('Leg BR', [20, 0, 20], ['+x', '+z'], role),
  ];
  it('four legs chamfered on their outside corners become ONE component, each world leg unchanged', () => {
    const unlinked = designToDocument(d(outside(''))).doc;
    const { doc } = designToDocument(d(outside()));
    expect(doc.shapes).toHaveLength(1);
    const w = (x: typeof doc) => flatDocument(x).boards.map((b) => ({ name: b.name, box: boardExtents(b), at: b.position, a: worldAngles(b) })).sort((p, q) => p.name.localeCompare(q.name));
    expect(w(doc)).toEqual(w(unlinked));
  });
  it('a leg with a rectangular cut is not turned (fu 314)', () => {
    const b = flatDocument(designToDocument(d([chamfered('Leg', [0, 0, 0], ['-x', '-z'])])).doc).boards[0]!;
    expect(turnCandidates({ ...b, cuts: [{ id: 'k', face: 'width', from: 'min', across: 'length', offset: 2, width: 1, depth: 0.25, stopMin: 0, stopMax: 0 }] })).toEqual([]);
  });
});
```

(Imports: `worldAngles` from `./angleWorld`.)

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/document/roleLinks.test.ts`
Expected: FAIL — four shapes or none (the chamfered legs are not turned).

- [ ] **Step 3: Implement**

In `roleLinks.ts` (import `angleCutsFor, angleRatiosOf, worldAngles` from `./angleWorld`), replace `turnCandidates`' body:

```ts
export function turnCandidates(b: Board): Board[] {
  if (b.cuts.length > 0) return [];
  const world = worldTapers(b);
  const angles = worldAngles(b);
  if (world === null || angles === null) return [];
  // Re-stored with the part's OWN slopes (exact-angle map), so a turned candidate can equal its representative exactly.
  const exact = angleRatiosOf([b]);
  const box = boardExtents(b);
  const grainAxis = axisDimensions(b).indexOf(b.grain);
  return TURNS.filter((r) => r !== b.rotation).flatMap((rotation): Board[] => {
    const t: Board = { ...b, rotation };
    if (boardExtents(t).some((v, i) => v !== box[i]) || axisDimensions(t).indexOf(b.grain) !== grainAxis) return [];
    const made = taperCutsFor(t, world);
    if ('fault' in made) return [];
    const more = angleCutsFor(t, angles, exact);
    if ('fault' in more) return [];
    return [{ ...t, angleCuts: [...made.cuts, ...more.cuts].map((c, i) => ({ id: b.angleCuts[i]?.id ?? nextId(), ...c })) }];
  });
}
```

Update its doc comment: "…its tapers, miters, bevels and chamfers re-stored on the same world faces through taperWorld
and angleWorld (inv 44). None for a part with rectangular cuts, or a cut either cannot describe."

- [ ] **Step 4: Run to see it pass**

Run: `npx vitest run src/document/ && npm run build`
Expected: PASS (the Shaker table and fu 301 tests included); build 0.

- [ ] **Step 5: Mutate**

Pass `undefined` instead of `exact` to `angleCutsFor`: confirm whether the chamfer test still passes (chamfers carry no
angle). Add a temporary fixture with an outside-corner BEVEL at a non-45° angle on each leg to show the map matters; if
it fails without `exact` keep it as a permanent test, else record why in the ledger. Restore; PASS.

- [ ] **Step 6: Commit**

```bash
git add -A src
git commit -m "feat(generate): role linking turns parts with miters, bevels and chamfers too (AI-angles §7)"
```

---

### Task 7: The prompt

**Files:**
- Modify: `src/generate/prompt.ts` (`SYSTEM_PROMPT`)
- Test: `src/generate/prompt.test.ts`

**Interfaces:** none new.

- [ ] **Step 1: Write the failing test**

In `src/generate/prompt.test.ts`, change the pinned `'Each part is an axis-aligned box, optionally tapered.'` to
`'Each part is an axis-aligned box, optionally tapered, mitered, beveled or chamfered.'`, and add:

```ts
  it('describes miters, bevels and chamfers and their two rules (AI-angles spec §8)', () => {
    for (const s of [
      'Angles:',
      '"chamfers"',
      '"bevels"',
      '"miters"',
      'Two mitered parts meeting at a corner overlap as boxes there',
      'A miter does not hold a part',
      'Never cut an angle where a part joins another',
      'Use "miters": [], "bevels": [] and "chamfers": [] for every part without them.',
    ]) expect(SYSTEM_PROMPT).toContain(s);
  });
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/generate/prompt.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `SYSTEM_PROMPT`, change `- Each part is an axis-aligned box, optionally tapered.` to
`- Each part is an axis-aligned box, optionally tapered, mitered, beveled or chamfered.`, change
`- Parts touch face to face. Parts must NOT pass into each other` to
`- Parts touch face to face. Parts must NOT pass into each other (except where two miters meet, below)`, and insert after
the Tapers section (before `Rules every design must follow:`):

```
Angles:
- Besides tapers, a part may carry three kinds of angle cut, each in world directions like tapers.
- "chamfers": a small slope on one edge, for comfort and looks. "edge" names the two faces that meet there (["+y", "+z"] is the top edge on a part's +z side), "legs" how far it cuts into each face, in the same order (usually equal, 1/8 to 1/4in). Chamfer the exposed top edges of tops and the outer corners of legs.
- "bevels": a whole side cut at an angle, like a raised panel's edge. "face" is the side cut, "longPoint" is the side across that face that keeps its full size, "angle" is degrees from square (10 to 20 is usual).
- "miters": an end cut at an angle so two parts meet at a corner, like a picture frame. "end" is the end cut (an end of the part's longest side), "longPoint" is the side whose edge stays full length (the outside of the frame), "angle" is degrees (45 for a square corner).
- Two mitered parts meeting at a corner overlap as boxes there: give each part its full outside length; the miters remove the overlap.
- A miter does not hold a part: miter only where the parts rest on something else, such as a frame lying flat or box sides standing on a bottom. Never use miters alone to hold a part up.
- Never cut an angle where a part joins another: joinery refuses it. A small chamfer or bevel running along a rail's length may pass through its joined ends if it stays clear of the tenon: about a third of the thickness from a broad face, and the smaller of 1/2in and a quarter of the width from an edge.
- Use "miters": [], "bevels": [] and "chamfers": [] for every part without them.
```

(Keep `SYSTEM_PROMPT` free of anything per-run — it is the cached prefix.)

- [ ] **Step 4: Run to see it pass**

Run: `npx vitest run src/generate/ && npm run build`
Expected: PASS; build 0.

- [ ] **Step 5: Mutate**

Delete the "A miter does not hold a part" line: the new test fails. Restore; PASS.

- [ ] **Step 6: Commit**

```bash
git add src/generate/prompt.ts src/generate/prompt.test.ts
git commit -m "feat(generate): the prompt teaches miters, bevels and chamfers and their two rules (AI-angles §8)"
```

---

### Task 8: Records, the full gate, the live runs

**Files:**
- Modify: `CLAUDE.md` (invariants 38, 41, 44, 45, 48; Where-things-live: `angleWorld.ts`, `generated.ts`, `refineDesign.ts`,
  `roleLinks.ts`, `designDiff.ts`, `designCheck.ts`, `tapers.ts`; Status; Rounds row; test count)
- Modify: `docs/follow-ups.md` (276/277 status; new residue entries from the ledger)
- Modify: `docs/history.md`, the spec's status line, `docs/browser-verification-ai-angles.md` (a "Chunk 2" section)

- [ ] **Step 1: The full gate**

Run: `npm run build` and `npx vitest run` (output to the workspace). Expected: build 0, all green; record the count.

- [ ] **Step 2: Live runs — STOP AND ASK FIRST**

Each run costs money and needs the user's explicit approval at the time (CLAUDE.md, the deployment rule). Ask, with the
estimate the dialog shows, before EACH:
1. Generate "a mitered picture frame and a chamfered side table" (dev server, a fresh origin port, the user's key entered
   by the user — never echoed): read the result's parts' angle cuts (DOM: Properties' Angles rows, or the cut list's
   bench lines), its checks, and the actual usage against the estimate.
2. Refine that table with "chamfer the top's edges": read the change list lines and that every untouched part's angles are
   unchanged.
If the user declines a run, record it as not run. Clean up exactly what the check created (delete by key; never
`localStorage.clear()` on an origin that held anything before).

- [ ] **Step 3: Records**

- CLAUDE.md invariant 48: Refine accepts every kind in standard form (`worldTapers` + `worldAngles`), refusing
  `'taper-form'`/`'angle-form'`; `angledRefusal` is gone. Invariant 45/44: `turnCandidates` re-stores every kind through
  `taperWorld`/`angleWorld`. Invariant 38: drop "Refine accepts tapers … refuses any other angle cut". Where-things-live:
  add `angleWorld.ts` ("WorldMiter/WorldBevel/WorldChamfer: design angles in world words; angleCutsFor (design → stored via
  the Properties writers), worldAngles (structural standard forms), angleRatiosOf (the exact-angle map), ratioFor,
  sortAngleCuts"); `generated.ts` (three arrays); `designDiff.ts` (`angleLines`); `designCheck.ts` (`jointViolations`);
  `tapers.ts` (`jointFaults`). Status + Rounds row "AI angles (chunk 2)". Test count.
- follow-ups: 276 stays open for the joint kinds; 277 closed; new entries for deferred minors and anything the live runs
  show.
- history narrative; verification doc "Chunk 2" section with the live runs' readouts (or "not run, declined").

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/
git commit -m "docs: AI angles chunk 2 — records, live runs"
```
