# Refine designs with joints — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine works on joined designs: Sloyd reads the joints back (`unjoin`), gated by an exact round trip, refines the plain design, then re-applies every joint that still fits and asks the model only about new or no-longer-fitting meetings.

**Architecture:** `unjoin` + `gateUnjoin` (generate/joints) invert joinery on the flat design. `runJoinery` gains `fixed` choices: valid fixed sites are applied without asking; only open sites reach the one chooser call (none → no call). `runRefine` unjoins (writing the plain design back into the tree like joinery does), refines, and re-joins with the recorded joints as `fixed`.

**Tech Stack:** TypeScript, React, Vitest, Vite (`npm run build` is the typecheck gate).

**Spec:** `docs/superpowers/specs/2026-10-09-sloyd-refine-joined-design.md` (with its planning amendments). Evidence: the spike at `/tmp/claude-1000/-home-alec-docker-sloyd/01f4aa1e-9cd2-442a-a456-cb23d97b3c1f/scratchpad/spike-unjoin/spike-unjoin.test.ts` (126/126 exact round trips) and its `output.txt`. Read CLAUDE.md invariants 36, 40, 41, 46.

## Global Constraints

- No schema change; documents stay `version: 11`. Never adopt (invariant 36).
- The gate refusal message, verbatim: `Refine cannot account for this design's joints — for example, joinery was run twice, or a joined part or cut was edited by hand.`
- The exact compare ignores part ids and cut ids and compares, per part in order: name, position, length, width, thickness, posture, rotation, material, grain, and every cut's `CUT_GEOMETRY_KEYS` in order. Nothing tolerant.
- `jointKey(enter, receive, axis, side)` = `` `${enter}→${receive}|${axis}|${side}` `` over flat display names.
- A fixed choice is kept only when `validChoice` passes (kind in `site.allowed`; every size within `rangesOf(site, doc)` exactly; stopped dado `stopAt` in `site.stopEnds`). No clamping.
- No open sites → no joinery call. Without `fixed`, `runJoinery` behaves exactly as today (its tests unmodified).
- Dialog joints line, verbatim shape: `` `${kept} joints kept · ${chosen} chosen · ${dropped} dropped` ``. Estimate note: `plus a joinery call if new meetings appear`. Joining status: `Choosing joints…`.
- The document layer imports nothing from `generate`.
- Branch `refine-joined`; merge locally `--no-ff`; trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Mutate every equality, ordering and boundary test once and record it.

## Review Focus

1. **A joined design refined with no change at all.** Expected: one model call, zero joinery calls, the result equal to the original joined design (round trip), "No changes". Pinned in Task 3.
2. **A design with a hand-added cut, or joined twice dados-then-rabbets.** Expected: refused before any call with the gate message. Pinned in Tasks 1 and 3.
3. **A recorded tenon that no longer fits after a part got thinner.** Expected: re-chosen by the model, never clamped silently. Pinned in Task 2 (`validChoice`) and Task 3.
4. **A joined design with a shared drawer.** Expected: the drawer stays one shared definition after refining. Pinned in Task 3.
5. **Two sites between the same pair of parts on different axes.** Expected: their records stay apart (axis/side in the key). Pinned in Task 1.

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `src/generate/joints/sites.ts` | modify | `jointKey` |
| `src/generate/joints/unjoin.ts` | create | `unjoin`, `gateUnjoin`, `sameJoined`, `RecordedJoint` |
| `src/generate/joints/choose.ts` | modify | `validChoice` |
| `src/generate/run.ts` | modify | `runJoinery(…, { fixed })`, `JoineryOutcome.kept`, `runRefine` joined flow |
| `src/generate/refine.ts` | modify | `plainForRefine`; `refineRefusal`/estimate use it |
| `src/document/refineDesign.ts` | modify | `RefusalReason` gains `'joints'` |
| `src/useRefine.ts`, `src/panels/RefineDialog.tsx`, `src/App.tsx` | modify | joining status, joints line, estimate note |

---

### Task 0: Branch

- [ ] `cd /home/alec/docker/sloyd && git checkout -b refine-joined && npm test 2>&1 | grep -E "Tests "` — expect 2207 passing.

---

### Task 1: `unjoin`, `gateUnjoin`, `jointKey`

**Files:** Modify `src/generate/joints/sites.ts`; Create `src/generate/joints/unjoin.ts`, `src/generate/joints/unjoin.test.ts`.

**Interfaces — Produces:**
```ts
// sites.ts
export const jointKey = (enter: string, receive: string, axis: number, side: number) => `${enter}→${receive}|${axis}|${side}`;
// unjoin.ts
export interface RecordedJoint { enter: string; receive: string; axis: 0 | 1 | 2; side: -1 | 1; choice: Omit<JointChoice, 'site'> }
export function unjoin(flat: FlatDocument): { plain: Board[]; joints: RecordedJoint[] } | { refused: string };
export function sameJoined(a: FlatDocument, b: FlatDocument): boolean;
export const GATE_REFUSAL: string;
export function gateUnjoin(flat: FlatDocument): { plain: Board[]; joints: RecordedJoint[] } | { refused: string };
```

- [ ] **Step 1: Write the tests** `src/generate/joints/unjoin.test.ts`. Port the spike harness: copy, from the spike file, the `P` type and `design` helper (lines 207–211, but give each part `role: ''` and pass `assemblies: []` to `designToDocument`), `snap`/`clamp`/`Mode`/`forced`/`choicesFor` (lines 234–266), the fixtures `orders`, `CASE201`, `CASE183`, `lapStack`, `legs`, `rails`, `FIXTURES`, `MODES` (lines 298–362; the workbench import becomes `import workbenchRaw from '../../document/fixtures/simple-workbench.sloyd?raw';` — check an existing test for the exact `?raw` import form and the `migrateDocument` import path). Then:

```ts
import { describe, expect, it } from 'vitest';
import { GATE_REFUSAL, gateUnjoin, sameJoined, unjoin } from './unjoin';
import { applyJoints } from './recipes';
import type { JointChoice } from './recipes';
import { findSites, jointKey } from './sites';
import { defaultChoice } from './choose';
// + the imports the ported helpers need (designToDocument, flatDocument, migrateDocument, rangesOf, boxOf, SNAP_INCHES, types)

function roundTrip(P: FlatDocument, mode: Mode) {
  const sites = findSites(P);
  const choices = choicesFor(mode, P, sites);
  if (mode !== 'defaults' && choices.every((c) => c.joint === 'butt')) return null;
  const J = applyJoints(P, sites, choices).doc;
  const g = gateUnjoin(J);
  return { J, g, P };
}

describe('unjoin — every fixture × mode re-joins exactly (the spike, made permanent)', () => {
  const cases = FIXTURES.flatMap(([name, f]) => MODES.map((m) => [name, f, m] as const));
  it.each(cases)('%s / %s', (_name, f, mode) => {
    const r = roundTrip(f(), mode);
    if (!r) return;
    expect('refused' in r.g ? r.g.refused : null).toBeNull();
  });

  it('recovers the original plain design, except the documented ambiguities', () => {
    const ambiguous = new Set(['case + shelf 1/8 short (fu 201)']);
    for (const [name, f] of FIXTURES) for (const m of MODES) {
      const r = roundTrip(f(), m);
      if (!r || 'refused' in r.g) continue;
      const plain = { ...r.J, boards: r.g.plain };
      expect(sameJoined(plain, r.P) || ambiguous.has(name), `${name}/${m}`).toBe(true);
    }
  });

  it('assumes a shelf short of the back was butting it (spec §3.1)', () => {
    const short = FIXTURES.find(([n]) => n === 'case + shelf 1/8 short (fu 201)')![1]();
    const r = roundTrip(short, 'rabbet')!;
    if ('refused' in r.g) throw new Error(r.g.refused);
    const shelf = r.g.plain.find((b) => b.name === 'Shelf')!;
    expect(shelf.width).toBe(11.25); // butting: the full depth, not 11.125
  });
});

describe('gateUnjoin refusals (review focus 2)', () => {
  const bookcase = () => FIXTURES.find(([n]) => n === 'bookcase (cutlines)')![1]();
  const joinAll = (P: FlatDocument, pick: (s: Site) => boolean = () => true) => {
    const s = findSites(P);
    return applyJoints(P, s, s.map((x) => (pick(x) ? defaultChoice(x, P, s) : { site: x.id, joint: 'butt' as const }))).doc;
  };

  it('refuses a hand-added cut', () => {
    const J = joinAll(bookcase());
    const extra = structuredClone(J);
    const t = extra.boards.find((b) => b.name === 'Top')!;
    t.cuts.push({ id: 'hand', face: 'thickness', from: 'min', across: 'width', offset: 3, width: 0.5, depth: 0.25, stopMin: 0, stopMax: 0 });
    expect(gateUnjoin(extra)).toEqual({ refused: GATE_REFUSAL });
  });

  it('refuses a project joined twice, dados before rabbets', () => {
    const P = bookcase();
    const J1 = joinAll(P, (s) => s.kind === 'end-into-face');
    const J = joinAll(J1, (s) => s.kind === 'face-against-edge');
    expect(gateUnjoin(J)).toEqual({ refused: GATE_REFUSAL });
  });

  it('refuses a joined part resized by hand', () => {
    const J = structuredClone(joinAll(bookcase()));
    J.boards.find((b) => b.name === 'Shelf 1')!.length += 0.5;
    expect('refused' in gateUnjoin(J)).toBe(true);
  });

  it('accepts an unjoined design (nothing to explain)', () => {
    const r = gateUnjoin(bookcase());
    expect('refused' in r ? r.refused : null).toBeNull();
    if (!('refused' in r)) expect(r.joints).toEqual([]);
  });
});

describe('records', () => {
  it('key each joint by names, axis and side (review focus 5)', () => {
    const corner = FIXTURES.find(([n]) => n === 'corner leg, 2 rails')![1]();
    const r = roundTrip(corner, 'mortise-tenon')!;
    if ('refused' in r.g) throw new Error(r.g.refused);
    const keys = r.g.joints.map((j) => jointKey(j.enter, j.receive, j.axis, j.side));
    expect(new Set(keys).size).toBe(keys.length);
    expect(r.g.joints.every((j) => j.choice.joint === 'mortise-tenon' && typeof j.choice.tenonLength === 'number')).toBe(true);
  });
});

describe('sameJoined', () => {
  it('can fail on a 1/16 nudge and on a cut depth', () => {
    const J = (() => { const P = FIXTURES[0][1](); const s = findSites(P); return applyJoints(P, s, s.map((x) => defaultChoice(x, P, s))).doc; })();
    expect(sameJoined(J, structuredClone(J))).toBe(true);
    const a = structuredClone(J); a.boards[1].position[0] += 1 / 16;
    expect(sameJoined(a, J)).toBe(false);
    const b = structuredClone(J); b.boards[0].cuts[0].depth += 1 / 16;
    expect(sameJoined(b, J)).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect FAIL:** `npx vitest run src/generate/joints/unjoin.test.ts`

- [ ] **Step 3: Implement.** `src/generate/joints/sites.ts`: add `jointKey` (export, with a one-line doc comment: the identity of a joint across refines — flat display names plus the meeting's axis and side).

`src/generate/joints/unjoin.ts`: port the spike's `unjoin` (spike lines 20–202) with these changes:
- Imports from the repo's real paths (`../../document/document`, `../../document/designCheck` for `TOUCH`, `../../document/geometry`, `./sites`, `./recipes`, `./pocket`).
- Return type `{ plain: Board[]; joints: RecordedJoint[] } | { refused: string }`: `{ fail }` becomes `{ refused: <the spike's reason> }` (internal; `gateUnjoin` replaces it with `GATE_REFUSAL`); success returns `{ plain: boards, joints }` (drop `notes`).
- Each pushed joint becomes `{ enter, receive, axis: k as 0|1|2, side, choice: { joint, tenonLength?, depth?, stopAt?, inset? } }` — omit absent optional keys (don't set them to `undefined`).
- Keep the spike's four steps (grow joints, rabbets, half-laps, re-floor) and its "unexplained cuts" refusal unchanged in logic. Add the doc comment from spec §3 (one paragraph per kind, the §3.1 ambiguities, why it lives here).

Then add:
```ts
export const GATE_REFUSAL = "Refine cannot account for this design's joints — for example, joinery was run twice, or a joined part or cut was edited by hand.";

const cutSig = (c: Cut) => JSON.stringify(CUT_GEOMETRY_KEYS.map((k) => c[k]));

/** Exact, ids ignored (refine-joined spec §3.2). Nothing tolerant: the gate is only as good as this. */
export function sameJoined(a: FlatDocument, b: FlatDocument): boolean {
  if (a.boards.length !== b.boards.length) return false;
  return a.boards.every((p, i) => {
    const q = b.boards[i]!;
    return p.name === q.name && p.position.every((v, k) => v === q.position[k]) &&
      p.length === q.length && p.width === q.width && p.thickness === q.thickness &&
      p.posture === q.posture && p.rotation === q.rotation && p.material === q.material && p.grain === q.grain &&
      p.cuts.length === q.cuts.length && p.cuts.every((c, k) => cutSig(c) === cutSig(q.cuts[k]!));
  });
}

/**
 * unjoin, then prove it: re-join the plain parts with the recorded joints and
 * require the joined design back EXACTLY. Anything else refuses, before any
 * model call (refine-joined spec §3.2).
 */
export function gateUnjoin(flat: FlatDocument): { plain: Board[]; joints: RecordedJoint[] } | { refused: string } {
  const u = unjoin(flat);
  if ('refused' in u) return { refused: GATE_REFUSAL };
  const plain: FlatDocument = { ...flat, boards: u.plain };
  const sites = findSites(plain);
  const key = (s: Site) => jointKey(plain.boards[s.enter]!.name, plain.boards[s.receive]!.name, s.axis, s.side);
  const bySite = new Map(sites.map((s) => [key(s), s]));
  const choices: JointChoice[] = sites.map((s) => ({ site: s.id, joint: 'butt' }));
  for (const j of u.joints) {
    const s = bySite.get(jointKey(j.enter, j.receive, j.axis, j.side));
    if (!s) return { refused: GATE_REFUSAL };
    choices[sites.indexOf(s)] = { site: s.id, ...j.choice };
  }
  return sameJoined(applyJoints(plain, sites, choices).doc, flat) ? u : { refused: GATE_REFUSAL };
}
```

- [ ] **Step 4: Run, expect PASS:** `npx vitest run src/generate/joints && npm run build 2>&1 | tail -2`. Expect every fixture × mode case to pass (the spike measured 126/126). If any fails, compare with the spike file line by line before changing logic; report a real difference rather than loosening a test.
- [ ] **Step 5: Mutate:** in the half-lap step, drop the `level` repositioning → fixture cases go red (the gate refuses); in the rabbet step, skip untrimming `trimmedParts` → the fu 201 cases go red; in `sameJoined`, drop the cut comparison → "can fail on a cut depth" goes red. Restore each.
- [ ] **Step 6: Commit** `feat(refine-joined): unjoin and the exact round-trip gate` (+ trailer).

---

### Task 2: `validChoice` and `runJoinery`'s fixed choices

**Files:** Modify `src/generate/joints/choose.ts`, `src/generate/run.ts`; Test `src/generate/joints/choose.test.ts`, `src/generate/joints/runJoinery.test.ts`.

**Interfaces:**
- Consumes: `jointKey` (Task 1).
- Produces:
```ts
// choose.ts
export function validChoice(c: JointChoice, s: Site, doc: FlatDocument): boolean;
// run.ts
export type FixedJoints = ReadonlyMap<string, Omit<JointChoice, 'site'>>;
export interface JoineryOutcome { …existing…; kept: number }   // fixed choices applied; 0 without `fixed`
export function runJoinery(client, doc, signal, onProgress, opts?: { fixed?: FixedJoints }): Promise<JoineryOutcome | { noSites: true }>;
```

- [ ] **Step 1: Failing tests.**

`choose.test.ts`:
```ts
import { validChoice } from './choose';
import { findSites, rangesOf } from './sites';
import { designToDocument } from '../../document/generated';
import { flatDocument } from '../../document/document';

const flatOf = (parts: [string, [number, number, number], [number, number, number]][]) => flatDocument(designToDocument({
  name: 'V', assemblies: [],
  parts: parts.map(([name, at, size]) => ({ name, role: '', material: 'oak', at: { x: at[0], y: at[1], z: at[2] }, size: { x: size[0], y: size[1], z: size[2] } })),
}).doc);
const LEG_RAIL = flatOf([['Leg', [0, 0, 0], [1.75, 28, 1.75]], ['Rail', [1.75, 23.5, 0.5], [18, 3.5, 0.75]]]);
const SIDE_SHELF = flatOf([['Side', [0, 0, 0], [0.75, 30, 11.25]], ['Shelf', [0.75, 12, 0], [20, 0.75, 11.25]]]);

describe('validChoice (strict — review focus 3)', () => {
  it('accepts a tenon inside its range, at both ends, and rejects one outside without clamping', () => {
    const [s] = findSites(LEG_RAIL);
    const r = rangesOf(s, LEG_RAIL);
    expect(validChoice({ site: s.id, joint: 'mortise-tenon', tenonLength: r.tenonLength[0] }, s, LEG_RAIL)).toBe(true);
    expect(validChoice({ site: s.id, joint: 'mortise-tenon', tenonLength: r.tenonLength[1] }, s, LEG_RAIL)).toBe(true);
    expect(validChoice({ site: s.id, joint: 'mortise-tenon', tenonLength: r.tenonLength[1] + 1 / 16 }, s, LEG_RAIL)).toBe(false);
    expect(validChoice({ site: s.id, joint: 'mortise-tenon' }, s, LEG_RAIL)).toBe(false);
  });
  it('rejects a kind the site does not allow, and accepts butt', () => {
    const [s] = findSites(LEG_RAIL);
    expect(s.allowed.includes('half-lap')).toBe(false);
    expect(validChoice({ site: s.id, joint: 'half-lap' }, s, LEG_RAIL)).toBe(false);
    expect(validChoice({ site: s.id, joint: 'butt' }, s, LEG_RAIL)).toBe(true);
  });
  it('checks a stopped dado’s stop end and inset', () => {
    const [s] = findSites(SIDE_SHELF);
    expect(s.stopEnds.length).toBeGreaterThan(0);
    const at = s.stopEnds[0];
    const r = rangesOf(s, SIDE_SHELF);
    const ok = { site: s.id, joint: 'stopped-dado' as const, depth: r.dadoDepth[0], stopAt: at, inset: r.inset(at)[0] };
    expect(validChoice(ok, s, SIDE_SHELF)).toBe(true);
    expect(validChoice({ ...ok, stopAt: { axis: s.axis, end: 'min' as const } }, s, SIDE_SHELF)).toBe(false);
    expect(validChoice({ ...ok, inset: r.inset(at)[1] + 1 / 16 }, s, SIDE_SHELF)).toBe(false);
  });
});
```

`runJoinery.test.ts` (reuse `CORNER`, `client(...)`, `run`; import `jointKey`, `findSites`, `defaultChoice`, `flatDocument`):
```ts
describe('runJoinery — fixed choices', () => {
  const sites = findSites(CORNER);
  const keyOf = (s: (typeof sites)[number]) => jointKey(CORNER.boards[s.enter].name, CORNER.boards[s.receive].name, s.axis, s.side);
  const fixedAll = new Map(sites.map((s) => { const { site: _s, ...c } = defaultChoice(s, CORNER, sites); return [keyOf(s), c] as const; }));
  const go = (c: LlmClient, fixed: Map<string, unknown>) =>
    runJoinery(c, CORNER, new AbortController().signal, () => {}, { fixed: fixed as never });

  it('makes NO call when every site is fixed and valid, and reports them kept', async () => {
    const c = client(long);
    const out = await go(c, fixedAll);
    if ('noSites' in out) throw new Error('sites');
    expect(c.complete).not.toHaveBeenCalled();
    expect(out.kept).toBe(sites.length);
    expect(out.usage.inputTokens).toBe(0);
  });

  it('sends only the open sites to the model', async () => {
    const one = new Map([...fixedAll].slice(0, 1));
    const c = client(long);
    await go(c, one);
    const msg = String((c.complete as ReturnType<typeof vi.fn>).mock.calls[0][0].messages[0]);
    const listed = msg.split('Sites:\n')[1]!.split('\n').filter((l) => /^\d+\. /.test(l));
    expect(listed).toHaveLength(sites.length - 1);
  });

  it('re-chooses a fixed choice that is no longer valid (review focus 3)', async () => {
    const bad = new Map([...fixedAll].map(([k, c]) => [k, c.joint === 'mortise-tenon' ? { ...c, tenonLength: 99 } : c]));
    const c = client(long);
    const out = await go(c, bad);
    if ('noSites' in out) throw new Error('sites');
    expect(c.complete).toHaveBeenCalled();
    expect(out.kept).toBeLessThan(sites.length);
  });

  it('without fixed, kept is 0 and behaviour is unchanged', async () => {
    const out = await run(client(long, short));
    if ('noSites' in out) throw new Error('sites');
    expect(out.kept).toBe(0);
  });
});
```
(The client's `userTurn` is `(t) => t`, so `messages[0]` is the raw first user text. Adjust the `Sites:` split to `siteMessage`'s real format if it differs.)

- [ ] **Step 2: Run, expect FAIL:** `npx vitest run src/generate/joints`

- [ ] **Step 3: Implement.**

`choose.ts` (below `parseChoices`):
```ts
/**
 * Is a choice valid for a site as it stands — the kind allowed, every size
 * inside rangesOf, a stopped dado's end one of the site's stop ends? The same
 * sources parseChoices validates against, but STRICT: parseChoices clamps a
 * model's answer; a KEPT joint must reproduce its geometry exactly, so an
 * out-of-range one is re-chosen instead (refine-joined spec §4).
 */
export function validChoice(c: JointChoice, s: Site, doc: FlatDocument): boolean {
  if (!s.allowed.includes(c.joint)) return false;
  const r = rangesOf(s, doc);
  const within = (v: number | undefined, [lo, hi]: [number, number]) => typeof v === 'number' && v >= lo && v <= hi;
  switch (c.joint) {
    case 'mortise-tenon': return within(c.tenonLength, r.tenonLength);
    case 'dado': return within(c.depth, r.dadoDepth);
    case 'stopped-dado': {
      const at = c.stopAt && s.stopEnds.find((e) => e.axis === c.stopAt!.axis && e.end === c.stopAt!.end);
      return !!at && within(c.depth, r.dadoDepth) && within(c.inset, r.inset(at));
    }
    case 'rabbet': return within(c.depth, r.rabbetDepth);
    default: return true;
  }
}
```
Check `range()`'s return shape in `sites.ts` (it may be `[lo, hi]` or an empty/inverted range when nothing fits) and handle an inverted range as "nothing valid".

`run.ts` — `runJoinery`:
- Signature gains `opts: { fixed?: FixedJoints } = {}`; add `export type FixedJoints = ReadonlyMap<string, Omit<JointChoice, 'site'>>;` and `kept: number` on `JoineryOutcome`.
- After `const sites = findSites(flat)` (and the `noSites` return):
```ts
  const keyOf = (s: Site) => jointKey(flat.boards[s.enter]!.name, flat.boards[s.receive]!.name, s.axis, s.side);
  const fixed = new Map<number, JointChoice>();
  for (const s of sites) {
    const f = opts.fixed?.get(keyOf(s));
    const c = f && { site: s.id, ...f };
    if (c && validChoice(c, s, flat)) fixed.set(s.id, c);
  }
  const open = sites.filter((s) => !fixed.has(s.id));
  const merge = (chosen: JointChoice[]) => sites.map((s) => fixed.get(s.id) ?? chosen.find((c) => c.site === s.id) ?? { site: s.id, joint: 'butt' as const });
```
- `build(choices, notes)` is called with `merge(choicesForOpen)` everywhere it is called today; the model sees `siteMessage(flat, open)` and `parseChoices(res.json, open, flat)`; the defaults fallback uses `open.map((s) => defaultChoice(s, flat, sites))`.
- If `open.length === 0`: return `{ ...build(merge([]), []), usage: ZERO_USAGE, kept: fixed.size }` with **no call**.
- Every other return adds `kept: fixed.size`. Import `jointKey` and `Site` from `./joints/sites`, `validChoice` from `./joints/choose`.
- Do not change anything else in `runJoinery` (the preexisting/introduced logic, the write-back). Update its doc comment with one sentence about `fixed`.

- [ ] **Step 4: Run, expect PASS:** `npm test 2>&1 | grep -E "Tests |FAIL"; npm run build 2>&1 | tail -2` — every existing joinery/useJoinery/App test unmodified and green.
- [ ] **Step 5: Mutate:** skip `validChoice` (accept any fixed) → "re-chooses … no longer valid" goes red; send all sites to the model → "only the open sites" goes red; remove the zero-open early return → "NO call" goes red; `<= hi` → `< hi` → the upper-bound case goes red. Restore.
- [ ] **Step 6: Commit** `feat(refine-joined): runJoinery keeps valid fixed choices and asks only about open sites` (+ trailer).

---

### Task 3: Refine a joined design

**Files:** Modify `src/document/refineDesign.ts` (`RefusalReason`), `src/generate/refine.ts`, `src/generate/run.ts`; Test `src/generate/run.test.ts`, `src/generate/refine.test.ts`.

**Interfaces:**
- Consumes: `gateUnjoin`, `RecordedJoint` (Task 1); `runJoinery(…, { fixed })`, `JoineryOutcome.kept` (Task 2).
- Produces:
```ts
// refineDesign.ts
export type RefusalReason = 'empty' | 'cuts' | 'turned' | 'nested' | 'too-large' | 'joints';
// refine.ts
export function plainForRefine(doc: SloydDocument): { plain: SloydDocument; joints: RecordedJoint[] | null } | { refused: RefineRefusal };
// run.ts
export interface JointsSummary { kept: number; chosen: number; dropped: number; skipped: string[] }
export interface RefineOutcome { …existing…; joints: JointsSummary | null }
export type RefineProgress = RunProgress & { stage?: 'join' };
export function runRefine(client, doc, settings, signal, onProgress: (p: RefineProgress) => void): Promise<RefineOutcome | { refused: RefineRefusal }>;
```

- [ ] **Step 1: Failing tests** — add to `src/generate/run.test.ts` a `describe('runRefine — joined designs')` (imports: `applyJoints`, `findSites` from `./joints/…`, `defaultChoice`, `documentToDesign`, `REFINE_MAX`, `flatDocument`, `writeBackFlat`/`worldParts`/`migrateDocument` as needed, `sameJoined`). Fixture: a bookcase (sides, top, bottom, two shelves, a back — reuse the cutlines bookcase dimensions from the spike file line 352–356) joined with defaults via `applyJoints` on its flat document; `joined = migrateDocument(applyJoints(...).doc)`. `plainDesign = documentToDesign(<plain of joined>)` — obtain it as `plainForRefine(joined)` then `documentToDesign(plain.plain, REFINE_MAX)`. Joinery answers are only needed for open sites; script the fake client with `[refinedDesign, joineryAnswer]`.

```ts
it('refines a joined design unchanged: one call, no joinery call, the same joined design back (review focus 1)', async () => {
  const echo = plainEcho(joined);                       // documentToDesign of the plain tree
  const { client } = fakeClient([echo]);
  const out = await go(client, joined);
  if ('refused' in out) throw new Error(out.refused.message);
  expect(client.complete).toHaveBeenCalledTimes(1);
  expect(sameJoined(flatDocument(out.doc), flatDocument(joined))).toBe(true);
  expect(out.joints).toMatchObject({ chosen: 0, dropped: 0 });
  expect(out.joints!.kept).toBeGreaterThan(0);
  expect(out.changes).toEqual([]);
});

it('adds a shelf: two calls, and the joinery message lists only the new sites', async () => {
  const echo = plainEcho(joined);
  const withShelf = { ...echo, parts: [...echo.parts, { ...echo.parts.find((p) => p.name === 'Shelf 1')!, name: 'Shelf 3', at: { ...echo.parts.find((p) => p.name === 'Shelf 1')!.at, y: 60 } }] };
  const { client, seen } = fakeClient([withShelf, { joints: [] }]);
  const out = await go(client, joined);
  if ('refused' in out) throw new Error(out.refused.message);
  expect(client.complete).toHaveBeenCalledTimes(2);
  const joinMsg = String(seen[1][0] && (seen[1][0] as { text: string }).text);
  const listed = joinMsg.split('Sites:\n')[1]!.split('\n').filter((l) => /^\d+\. /.test(l));
  expect(listed.every((l) => l.includes('Shelf 3'))).toBe(true);
  expect(out.joints!.chosen).toBe(listed.length);
});

it('removes a shelf: its joints are dropped, no joinery call', async () => {
  const echo = plainEcho(joined);
  const without = { ...echo, parts: echo.parts.filter((p) => p.name !== 'Shelf 2') };
  const { client } = fakeClient([without]);
  const out = await go(client, joined);
  if ('refused' in out) throw new Error(out.refused.message);
  expect(client.complete).toHaveBeenCalledTimes(1);
  expect(out.joints!.dropped).toBeGreaterThan(0);
});

it('a joined design the gate cannot explain is refused with no call (review focus 2)', async () => {
  const bad = structuredClone(joined);
  (bad.boards.find((b) => b.name === 'Top') as Board).cuts.push({ id: 'h', face: 'thickness', from: 'min', across: 'width', offset: 3, width: 0.5, depth: 0.25, stopMin: 0, stopMax: 0 });
  const { client } = fakeClient([GOOD]);
  const out = await go(client, bad);
  expect(out).toEqual({ refused: { reason: 'joints', message: GATE_REFUSAL } });
  expect(client.complete).not.toHaveBeenCalled();
});

it('a side made thinner re-chooses the joints into it instead of clamping (review focus 3)', async () => {
  // Thin both sides from their OUTER faces to 3/8in, so every shelf still touches them but the recorded
  // dado depths (and the back's rabbet depths) no longer fit their ranges.
  const echo = plainEcho(joined);
  const thin = { ...echo, parts: echo.parts.map((p) =>
    p.name === 'Left side' ? { ...p, at: { ...p.at, x: p.at.x + 0.375 }, size: { ...p.size, x: 0.375 } }
      : p.name === 'Right side' ? { ...p, size: { ...p.size, x: 0.375 } } : p) };
  const { client } = fakeClient([thin, { joints: [] }]);   // joinery's empty answer → its defaults, no notes
  const out = await go(client, joined);
  if ('refused' in out) throw new Error(out.refused.message);
  expect(client.complete).toHaveBeenCalledTimes(2);
  expect(out.joints!.chosen).toBeGreaterThanOrEqual(1);
});

it('keeps a shared assembly shared after refining (review focus 4)', async () => {
  const v3 = (x: number, y: number, z: number) => ({ x, y, z });
  const tree = designToDocument({ name: 'Frames', parts: [], assemblies: [{ name: 'Frame',
    parts: [{ name: 'Leg', role: '', material: 'oak', at: v3(0, 0, 0), size: v3(1.75, 28, 1.75) },
      { name: 'Rail', role: '', material: 'oak', at: v3(1.75, 23.5, 0.5), size: v3(18, 3, 0.75) }],
    placements: [{ name: 'Front', at: v3(0, 0, 0) }, { name: 'Back', at: v3(0, 0, 30) }] }] }).doc;
  const jo = await runJoinery(fakeClient([new LlmError('overloaded', 'Overloaded.')]).client, tree, new AbortController().signal, () => {});
  if ('noSites' in jo) throw new Error('sites');
  const joinedTree = jo.result.doc;
  expect(joinedTree.definitions).toHaveLength(1);
  const { client } = fakeClient([plainEcho(joinedTree)]);
  const out = await go(client, joinedTree);
  if ('refused' in out) throw new Error(out.refused.message);
  expect(out.doc.definitions).toHaveLength(1);
  expect(out.doc.instances.map((i) => i.definition)).toEqual([out.doc.definitions[0].id, out.doc.definitions[0].id]);
});
```
Helpers for this describe (define at its top):
```ts
const RS = { instruction: 'change it', width: null, depth: null, height: null, detail: 'moderate' as const };
const go = (client: LlmClient, doc: SloydDocument) => runRefine(client, doc, RS, new AbortController().signal, () => {});
const plainEcho = (d: SloydDocument) => {
  const p = plainForRefine(d); if ('refused' in p) throw new Error(p.refused.message);
  const r = documentToDesign(p.plain, REFINE_MAX); if ('refused' in r) throw new Error(r.refused.message);
  return r.design;
};
const bp = (name: string, at: [number, number, number], size: [number, number, number]) =>
  ({ name, role: '', material: 'pine', at: { x: at[0], y: at[1], z: at[2] }, size: { x: size[0], y: size[1], z: size[2] } });
const bookFlat = flatDocument(designToDocument({ name: 'Bookcase', assemblies: [], parts: [
  bp('Back', [0, 0, -0.25], [31.5, 72, 0.25]), bp('Left side', [0, 0, 0], [0.75, 72, 11.25]), bp('Right side', [30.75, 0, 0], [0.75, 72, 11.25]),
  bp('Bottom', [0.75, 0, 0], [30, 0.75, 11.25]), bp('Top', [0.75, 71.25, 0], [30, 0.75, 11.25]),
  bp('Shelf 1', [0.75, 24, 0], [30, 0.75, 11.25]), bp('Shelf 2', [0.75, 48, 0], [30, 0.75, 11.25]),
] }).doc);
const bookSites = findSites(bookFlat);
const joined: SloydDocument = migrateDocument(applyJoints(bookFlat, bookSites, bookSites.map((s) => defaultChoice(s, bookFlat, bookSites))).doc);
``` Also in `refine.test.ts`: `refineRefusal(joinedBookcase)` is `null`; `refineRefusal(<bookcase with a hand-added cut>)` is the gate message; `plainForRefine` of an unjoined design returns `{ plain: <same doc>, joints: null }`.

- [ ] **Step 2: Run, expect FAIL:** `npx vitest run src/generate`

- [ ] **Step 3: Implement.**

`src/document/refineDesign.ts`: add `'joints'` to `RefusalReason`.

`src/generate/refine.ts`:
```ts
import { gateUnjoin } from './joints/unjoin';
import type { RecordedJoint } from './joints/unjoin';
import { flatDocument, migrateDocument, worldParts, writeBackFlat } from '../document/document';

/**
 * The design Refine works on (refine-joined spec §2): unchanged when nothing is
 * cut; otherwise its joints are read back (gateUnjoin) and the plain parts are
 * written into the tree the way runJoinery writes its result back
 * (invariant 46), so copies that come out identical stay shared.
 */
export function plainForRefine(doc: SloydDocument): { plain: SloydDocument; joints: RecordedJoint[] | null } | { refused: RefineRefusal } {
  const flat = flatDocument(doc);
  if (!flat.boards.some((b) => b.cuts.length > 0)) return { plain: doc, joints: null };
  const g = gateUnjoin(flat);
  if ('refused' in g) return { refused: { reason: 'joints', message: g.refused } };
  return { plain: migrateDocument(writeBackFlat(doc, flat.boards, g.plain)), joints: g.joints };
}
```
`refineRefusal(doc)`: `const p = plainForRefine(doc); if ('refused' in p) return p.refused.message; const r = documentToDesign(p.plain, REFINE_MAX); return 'refused' in r ? r.refused.message : null;` `detailFor` is unchanged (part counts do not change).

`src/generate/run.ts` — `runRefine`:
```ts
export interface JointsSummary { kept: number; chosen: number; dropped: number; skipped: string[] }
export type RefineProgress = RunProgress & { stage?: 'join' };
```
Rewrite the body:
```ts
  const base = plainForRefine(doc);
  if ('refused' in base) return { refused: base.refused };
  const from = documentToDesign(base.plain, REFINE_MAX);
  if ('refused' in from) return { refused: from.refused };
  const preexisting = new Set(checkDesign(flatDocument(base.plain), limitsOf(settings)).map(problemKey));
  const out = await runRepairLoop(client, { /* as today, but carryGrain(d, base.plain) and designValues(from.design) */ }, signal, onProgress);
  let refined: SloydDocument = { ...out.doc, stock: doc.stock, units: doc.units, guides: doc.guides };
  let violations = out.violations;
  let usage = out.usage;
  let joints: JointsSummary | null = null;
  if (base.joints) {
    const fixed: FixedJoints = new Map(base.joints.map((j) => [jointKey(j.enter, j.receive, j.axis, j.side), j.choice]));
    // DROPPED = a record whose meeting no longer exists on the refined plain design;
    // a record whose meeting exists but whose choice no longer fits is re-chosen (counted in `chosen`).
    const plainFlat = flatDocument(refined);
    const siteKeys = new Set(findSites(plainFlat).map((s) => jointKey(plainFlat.boards[s.enter]!.name, plainFlat.boards[s.receive]!.name, s.axis, s.side)));
    const dropped = base.joints.filter((j) => !siteKeys.has(jointKey(j.enter, j.receive, j.axis, j.side))).length;
    const jo = await runJoinery(client, refined, signal, (p) => onProgress({ ...p, stage: 'join' }), { fixed });
    if ('noSites' in jo) {
      joints = { kept: 0, chosen: 0, dropped, skipped: [] };
    } else {
      refined = { ...jo.result.doc, stock: doc.stock, units: doc.units, guides: doc.guides };
      violations = [...violations, ...jo.violations];
      usage = addUsage(usage, jo.usage);
      const applied = jo.result.applied.filter((a) => a.joint !== 'butt').length;
      joints = { kept: jo.kept, chosen: Math.max(0, applied - jo.kept), dropped, skipped: jo.result.skipped.map((s) => s.reason) };
    }
  }
  return { doc: refined, violations, present: out.present, changes: diffDesigns(doc, refined), usage, joints };
```
Keep `diffDesigns(doc, refined)` against the ORIGINAL joined `doc` (spec §4). Import `findSites`, `jointKey` from `./joints/sites` and `plainForRefine` from `./refine`.

`refineEstimateUsd`: use `plainForRefine(doc)` first (refused → null), then `documentToDesign(base.plain, …)`.

- [ ] **Step 4: Run, expect PASS:** `npm test 2>&1 | grep -E "Tests |FAIL"; npm run build 2>&1 | tail -2` — the existing refine tests unchanged and green.
- [ ] **Step 5: Mutate:** pass no `fixed` to `runJoinery` → "unchanged: one call" goes red (all sites go to the model); count `dropped` as `base.joints.length - jo.kept` → "a side made thinner" or "removes a shelf" goes red; drop the `writeBackFlat` in `plainForRefine` and return the flat plain → the shared-assembly test goes red. Restore.
- [ ] **Step 6: Commit** `feat(refine-joined): refine reads joints back, refines plain, re-joins with fixed choices` (+ trailer).

---

### Task 4: The dialog

**Files:** Modify `src/useRefine.ts`, `src/panels/RefineDialog.tsx`, `src/App.tsx`; Test `src/useRefine.test.tsx`, `src/panels/RefineDialog.test.tsx`.

**Interfaces:**
- Consumes: `RefineProgress`, `RefineOutcome.joints` (Task 3).
- Produces: `RefineStatus` gains `'joining'`; `RefineDialog` prop `joined: boolean`.

- [ ] **Step 1: Failing tests.**
`RefineDialog.test.tsx`:
```tsx
it('shows the joinery-call note in the estimate for a joined design', () => {
  render(<RefineDialog {...base} joined />);
  expect(screen.getByText('plus a joinery call if new meetings appear')).toBeTruthy();
});
it('shows the joints line on a joined result', () => {
  const run: RefineRun = { status: 'ready', projectId: 'p1', projectName: 'Box — refined', costUsd: 0.1, outcome: {
    doc: {} as never, usage: {} as never, changes: [], violations: [], present: [],
    joints: { kept: 26, chosen: 3, dropped: 2, skipped: ['Shelf 3 no longer meets Left after an earlier joint'] } } };
  render(<RefineDialog {...base} joined run={run} />);
  expect(screen.getByText('26 joints kept · 3 chosen · 2 dropped')).toBeTruthy();
  expect(screen.getByText('Shelf 3 no longer meets Left after an earlier joint')).toBeTruthy();
});
it('says "Choosing joints…" while joining', () => {
  render(<RefineDialog {...base} joined run={{ status: 'joining', costUsd: null }} live />);
  expect(screen.getByText('Choosing joints…')).toBeTruthy();
});
```
Add `joined={false}` to `base` and `joints: null` wherever an existing test builds an outcome.
`useRefine.test.tsx`: a progress callback with `stage: 'join'` and `phase: 'designing'` sets status `'joining'` (drive it with a fake client whose second call is the joinery call; or unit-test `progressPatch` if you export it — prefer exporting `progressPatch` and testing it directly).

- [ ] **Step 2: Run, expect FAIL:** `npx vitest run src/useRefine.test.tsx src/panels/RefineDialog.test.tsx`

- [ ] **Step 3: Implement.**
- `useRefine.ts`: `RefineStatus` adds `'joining'`; `progressPatch(p: RefineProgress)`: `p.stage === 'join' && p.phase === 'designing'` → `{ status: 'joining' }`; join-stage repairs/retries map as today (export `progressPatch`).
- `RefineDialog.tsx`: prop `joined: boolean`; in the estimate paragraph, when `p.joined`, append `<span>plus a joinery call if new meetings appear</span>`; `statusText` case `'joining'` → `'Choosing joints…'`; in the result block, when `out.joints`, render `<p>{`${out.joints.kept} joints kept · ${out.joints.chosen} chosen · ${out.joints.dropped} dropped`}</p>` and each skipped reason as `<p>`.
- `App.tsx`: pass `joined={worldParts(doc).some((b) => b.cuts.length > 0)}` (compute inside the existing `refineInfo` memo and pass `refineInfo.joined`).

- [ ] **Step 4: Run, expect PASS:** `npm test 2>&1 | grep -E "Tests |FAIL"; npm run build 2>&1 | tail -2`
- [ ] **Step 5: Mutate:** drop the `stage === 'join'` branch → the joining test goes red; drop the note → the estimate test goes red. Restore.
- [ ] **Step 6: Commit** `feat(refine-joined): the dialog shows joining and the joints line` (+ trailer).

---

### Task 5: Live check, docs, merge (controller; needs the user)

- [ ] Full gate: `npm test`, `npm run build`.
- [ ] Live check (dev server, Playwright, the user watching; **ask before each paid run**): generate or reuse a small bookcase, Add joinery (paid), then Refine it twice — "make it 2in taller" (expect one refine call and no joinery call, all joints kept) and "add a shelf" (expect a small joinery call). Read storage: untouched parts' cuts identical to the joined original; the joints line matches. Record in `docs/browser-verification-refine-joined.md`; delete only the projects the check created.
- [ ] Docs: close fu 238 (Status line); new follow-ups for anything left; CLAUDE.md "Where things live" (`generate/joints/unjoin.ts`; `runJoinery`'s `fixed`; `validChoice`), test count, Status open list; `docs/history.md` entry.
- [ ] Merge locally (`--no-ff`), re-verify on master, delete the branch; ask the user before deploying.
