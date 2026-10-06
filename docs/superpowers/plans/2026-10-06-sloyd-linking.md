# Linked Parts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parts can be linked so they stay identical: an edit to one linked part's size, material,
grain, posture or cuts reaches every member. Each part keeps its own name, position and turn.

**Architecture:**
- **The label.** `Board.link?: string` is a label shared by the members. Every part still carries its
  own fields, and the store keeps the members equal.
- **The pure layer.** `src/document/links.ts` holds:
  - `LINK_FIELDS`, the ONE compiler-checked table of shared versus own fields;
  - `sameShared`;
  - `linkPlan`, the ONE decider for what Link will do, used by the store AND the panel;
  - `repairLinks` and `dissolveSingletons`.
- **The store.** Edits propagate inside the same `edit()`.
- **Schema 9.** Load runs `repairLinks`, and joinery's output is repaired before it is returned.

**Tech Stack:** TypeScript strict, React 19, Zustand 5, Vitest 4 + RTL.

**Spec:** `docs/superpowers/specs/2026-10-06-sloyd-linking-design.md`. Read it first; it is the
authority.

## Global Constraints

- **Branch** `linking`, off master at `21a1736`. Commit to the branch only.
- **Tests and build.** `npm test` must stay green (1843 tests across 63 files at the start), and
  `npm run build` must pass. `npm test` does NOT typecheck.
- **`CURRENT_VERSION` becomes 9 in Task 1.** It is a document-level change, so there is no per-board
  migration step.
- **The fields.**
  - Shared: `length`, `width`, `thickness`, `material`, `grain`, `posture`, `cuts`.
  - Own: `id`, `name`, `position`, `rotation`, `link`.
  - Decided ONLY by `LINK_FIELDS`, which must `satisfies Record<keyof Board, 'shared' | 'own'>`.
- **The source.** On Link, the first selected part wins.
- **Merging.** Any already-linked selected part brings its WHOLE link, unselected members included.
- **Propagation.** It happens inside the SAME `edit()` as the triggering edit, so there is one undo
  entry. It reaches hidden and unselected members. Name, position and rotation never propagate.
- **Unlinked parts carry no `link` key at all.** An unlinked part's object has no `link` key, never
  `link: undefined`. That keeps serialised files byte-identical and `toEqual` honest.
- **Repair never moves geometry.** A differing member is UNLINKED, never rewritten. A label held by
  only one part is dropped.
- **Invariant 24.** `dropHeldIfGone` runs for every board an edit touched, members included. The
  board-precise `grabbed` clause in `updateBoards` stays for the TARGETS only.
- **Invariant 33 still holds.** Nothing references a board by id; a link is a label.
- **Bare-field selectors** (invariant 34).
- **Mutation-test every new test.** Break the code it guards, confirm red, then revert BY HAND, never
  with `git checkout` over uncommitted work. Name each mutation and its result in the report. A test
  that cannot fail does not count.
- **Style.** Terse comments that state WHY. No new dependencies.

**Ruling recorded here (controller, while planning).** Spec §3.5 says joinery's output is "passed
through `repairLinks` before it is saved". It is applied where `runJoinery` returns its result
document, in the generate layer, which may import `document`. That way `useJoinery` (which only saves)
and any future caller get a consistent document. Cost if wrong: none; the load repair would catch it
anyway.

## Review Focus

1. **Linking a part to itself through a merge.** The selection holds A and B, and B is already linked
   with C (unselected). C must take A's values too, and the result is ONE link of three (Task 2 test).
2. **A propagated posture change on a member** that is turned 90°. Each member pivots about its OWN
   centre, and no member jumps (Task 2 test: footprint centres unchanged).
3. **Undo straight after Link.** The parts' old values AND their old (absent) links come back in one
   step (Task 2 test).
4. **A file with two different labels on parts that are identical.** They stay two separate links.
   The repair never merges (Task 1 test).
5. **The parts list name button of a linked row** must keep its exact accessible name. The chain icon
   sits OUTSIDE the button (Task 4 test: `getByRole('button', { name: 'Board' })` still finds it).

---

### Task 1: The document layer — `links.ts`, `Board.link`, schema 9

**Files:**
- Create: `src/document/links.ts`, `src/document/links.test.ts`.
- Modify:
  - `src/document/types.ts` (`Board.link?: string`);
  - `src/document/document.ts`: `CURRENT_VERSION`, `validateBoard`'s `link`, `repairLinks` in
    `migrateDocument`, and a re-export of `./links`.
- Test: `src/document/document.test.ts`.

**Interfaces:**
- **Produces** (from `src/document/links.ts`, re-exported by `document.ts`):
  - `export const LINK_FIELDS`, the table described in Global Constraints;
  - `export type SharedField`, the keys of `LINK_FIELDS` whose value is `'shared'`;
  - `export const SHARED_KEYS: SharedField[]`;
  - `export function sharedOf(b: Board): Pick<Board, SharedField>`: cuts are copied to new objects
    with the SAME ids;
  - `export function sharedPatch(patch: Partial<Board>): Partial<Pick<Board, SharedField>>`;
  - `export function sameShared(a: Board, b: Board): boolean`;
  - `export function withoutLink(b: Board): Board`: the board with no `link` key;
  - `export function dissolveSingletons(boards: Board[]): Board[]`;
  - `export function repairLinks(boards: Board[]): Board[]`;
  - `export interface LinkPlan { source: Board; members: string[]; changing: string[]; label: string | null }`;
  - `export function linkPlan(boards: readonly Board[], ids: readonly string[]): LinkPlan | null`.
- **`linkPlan`'s fields:**
  - `members` is every board that will carry the label, in document order;
  - `changing` is the members other than the source whose shared fields differ from the source;
  - `label` is the label to use. It is null when a fresh one must be minted.
- **When `linkPlan` returns null:** fewer than 2 known ids, OR the plan would change nothing (every
  member already shares one label and matches the source).

- [ ] **Step 1: Failing tests.** Write `src/document/links.test.ts`:

```ts
import { createBoard } from './document';
import type { Board } from './document';
import { LINK_FIELDS, SHARED_KEYS, dissolveSingletons, linkPlan, repairLinks, sameShared, sharedOf, withoutLink } from './links';

const leg = (over: Partial<Board> = {}): Board =>
  ({ ...createBoard({ name: 'Leg', length: 28, width: 1.75, thickness: 1.75, posture: 'upright' }), ...over });
const cut = { id: 'c1', face: 'width', from: 'max', across: 'length', offset: 0.5, width: 0.75, depth: 1, stopMin: 22, stopMax: 2 } as const;

describe('LINK_FIELDS', () => {
  it('shares exactly the spec\'s seven fields', () => {
    expect([...SHARED_KEYS].sort()).toEqual(['cuts', 'grain', 'length', 'material', 'posture', 'thickness', 'width']);
    expect(LINK_FIELDS.rotation).toBe('own');
    expect(LINK_FIELDS.position).toBe('own');
  });
});

describe('sameShared', () => {
  it('is false when any shared field differs, true when only own fields differ', () => {
    const a = leg({ cuts: [cut] });
    expect(sameShared(a, { ...a, id: 'x', name: 'Other', position: [9, 9, 9], rotation: 180, link: 'L' })).toBe(true);
    for (const patch of [{ length: 29 }, { width: 2 }, { thickness: 2 }, { material: 'walnut' }, { grain: 'width' as const }, { posture: 'flat' as const }]) {
      expect(sameShared(a, { ...a, ...patch })).toBe(false);
    }
    expect(sameShared(a, { ...a, cuts: [] })).toBe(false);
    expect(sameShared(a, { ...a, cuts: [{ ...cut, id: 'c2' }] })).toBe(false);
    expect(sameShared(a, { ...a, cuts: [{ ...cut, stopMax: 3 }] })).toBe(false);
  });
});

describe('sharedOf / withoutLink', () => {
  it('copies cuts with the same ids, never the same objects', () => {
    const a = leg({ cuts: [cut] });
    const s = sharedOf(a);
    expect(s.cuts).toEqual(a.cuts);
    expect(s.cuts[0]).not.toBe(a.cuts[0]);
  });
  it('withoutLink removes the key entirely', () => {
    expect('link' in withoutLink(leg({ link: 'L' }))).toBe(false);
  });
});

describe('repairLinks', () => {
  it('unlinks members that differ from the FIRST member, never changing their geometry', () => {
    const a = leg({ id: 'a', link: 'L' });
    const b = leg({ id: 'b', link: 'L' });
    const c = leg({ id: 'c', link: 'L', length: 30 });
    const out = repairLinks([a, b, c]);
    expect(out.map((x) => x.link)).toEqual(['L', 'L', undefined]);
    expect('link' in out[2]!).toBe(false);
    expect(out[2]!.length).toBe(30);
  });
  it('clears a label left on one part', () => {
    const out = repairLinks([leg({ id: 'a', link: 'L' }), leg({ id: 'b', length: 30, link: 'L' })]);
    expect(out.every((x) => !('link' in x))).toBe(true);
  });
  it('never merges two labels, even on identical parts (Review Focus 4)', () => {
    const out = repairLinks([leg({ id: 'a', link: 'L1' }), leg({ id: 'b', link: 'L1' }), leg({ id: 'c', link: 'L2' }), leg({ id: 'd', link: 'L2' })]);
    expect(out.map((x) => x.link)).toEqual(['L1', 'L1', 'L2', 'L2']);
  });
  it('returns the same array when nothing changes', () => {
    const boards = [leg({ id: 'a' }), leg({ id: 'b', link: 'L' }), leg({ id: 'c', link: 'L' })];
    expect(repairLinks(boards)).toBe(boards);
    expect(dissolveSingletons(boards)).toBe(boards);
  });
});

describe('linkPlan', () => {
  it('first selected is the source; changing lists the members that differ', () => {
    const a = leg({ id: 'a', length: 30 });
    const b = leg({ id: 'b' });
    const c = leg({ id: 'c', length: 30 });
    const plan = linkPlan([a, b, c], ['c', 'b', 'a'])!;
    expect(plan.source.id).toBe('c');
    expect(plan.members).toEqual(['a', 'b', 'c']);
    expect(plan.changing).toEqual(['b']);
    expect(plan.label).toBeNull();
  });
  it('brings the WHOLE link of an already-linked part, unselected members included', () => {
    const a = leg({ id: 'a', length: 30 });
    const b = leg({ id: 'b', link: 'L' });
    const c = leg({ id: 'c', link: 'L' });
    const plan = linkPlan([a, b, c], ['a', 'b'])!;
    expect(plan.members).toEqual(['a', 'b', 'c']);
    expect(plan.changing).toEqual(['b', 'c']);
    expect(plan.label).toBe('L');
  });
  it('is null for fewer than two parts, or when nothing would change', () => {
    const b = leg({ id: 'b', link: 'L' });
    const c = leg({ id: 'c', link: 'L' });
    expect(linkPlan([b, c], ['b'])).toBeNull();
    expect(linkPlan([b, c], ['b', 'c'])).toBeNull();
  });
});
```

  In `document.test.ts`, add the following:

```ts
describe('v9: linked parts', () => {
  const doc = (version: number, boards: unknown[]) => ({ version, name: 'D', units: { display: 'imperial-fractional', precision: 16 }, stock: { kerf: 0.125 }, guides: [], boards });
  const raw = (over: Record<string, unknown>) => ({ ...createBoard({ length: 10, width: 2, thickness: 1 }), ...over });

  it('CURRENT_VERSION is 9; a v8 file loads with no links; a version above 9 is refused', () => {
    expect(CURRENT_VERSION).toBe(9);
    const d = migrateDocument(doc(8, [raw({ id: 'a' }), raw({ id: 'b' })]));
    expect(d.boards.every((b) => !('link' in b))).toBe(true);
    expect(() => migrateDocument(doc(10, []))).toThrow();
  });

  it('keeps a valid link, drops a non-string or empty one', () => {
    const d = migrateDocument(doc(9, [raw({ id: 'a', link: 'L' }), raw({ id: 'b', link: 'L' }), raw({ id: 'c', link: 7 }), raw({ id: 'd', link: '' })]));
    expect(d.boards.map((b) => b.link)).toEqual(['L', 'L', undefined, undefined]);
    expect('link' in d.boards[2]!).toBe(false);
  });

  it('repairs on load: a differing member is unlinked, unchanged', () => {
    const d = migrateDocument(doc(9, [raw({ id: 'a', link: 'L' }), raw({ id: 'b', link: 'L' }), raw({ id: 'c', link: 'L', length: 11 })]));
    expect(d.boards.map((b) => b.link)).toEqual(['L', 'L', undefined]);
    expect(d.boards[2]!.length).toBe(11);
  });
});
```

  - **Import `CURRENT_VERSION` and `createBoard`** if the file does not already import them.
  - **Existing tests that pin `CURRENT_VERSION` 8 or a saved `version: 8`** move to 9. Those that use
    9 as "a future version" move to 10. That is the spec's change; name each one in the report.
  - **Run.** Expected: FAIL.

- [ ] **Step 2: Implement.**
  - **`src/document/types.ts`.** Add to `Board`:

```ts
  /**
   * The label of the link this part belongs to, or absent (linking spec §2).
   * Parts sharing a label share LINK_FIELDS' 'shared' fields; the store keeps
   * them equal. A label, never a board id, so invariant 33 holds. An unlinked
   * part has NO key, not `link: undefined`.
   */
  link?: string;
```

  - **`src/document/links.ts`:**

```ts
import type { Board } from './types';
import { CUT_GEOMETRY_KEYS } from './cuts';

/**
 * Which Board fields a link shares (linking spec §2). The ONE table: linking,
 * propagation and the load repair all read it, and `satisfies` makes a new
 * Board field fail tsc until it is classified (invariant 40's argument).
 */
export const LINK_FIELDS = {
  id: 'own', name: 'own', position: 'own', rotation: 'own', link: 'own',
  length: 'shared', width: 'shared', thickness: 'shared', material: 'shared',
  grain: 'shared', posture: 'shared', cuts: 'shared',
} as const satisfies Record<keyof Board, 'shared' | 'own'>;

export type SharedField = {
  [K in keyof typeof LINK_FIELDS]: (typeof LINK_FIELDS)[K] extends 'shared' ? K : never;
}[keyof typeof LINK_FIELDS];

export const SHARED_KEYS = (Object.keys(LINK_FIELDS) as (keyof typeof LINK_FIELDS)[])
  .filter((k): k is SharedField => LINK_FIELDS[k] === 'shared');

/** A board's shared fields, cuts copied (same ids, new objects) so no two
 *  members ever hold one Cut object. */
export function sharedOf(b: Board): Pick<Board, SharedField> {
  return {
    length: b.length, width: b.width, thickness: b.thickness,
    material: b.material, grain: b.grain, posture: b.posture,
    cuts: b.cuts.map((c) => ({ ...c })),
  };
}

/** The shared part of a patch: what propagates to the other members. */
export function sharedPatch(patch: Partial<Board>): Partial<Pick<Board, SharedField>> {
  const out: Partial<Pick<Board, SharedField>> = {};
  for (const k of SHARED_KEYS) if (patch[k] !== undefined) (out as Record<string, unknown>)[k] = patch[k];
  return out;
}

/** Every shared field equal, exactly (stored values, invariant 18). Cuts in
 *  order, by id and every CUT_GEOMETRY field. */
export function sameShared(a: Board, b: Board): boolean {
  for (const k of SHARED_KEYS) {
    if (k === 'cuts') {
      if (a.cuts.length !== b.cuts.length) return false;
      for (let i = 0; i < a.cuts.length; i += 1) {
        const ca = a.cuts[i]!;
        const cb = b.cuts[i]!;
        if (ca.id !== cb.id || CUT_GEOMETRY_KEYS.some((f) => ca[f] !== cb[f])) return false;
      }
    } else if (a[k] !== b[k]) {
      return false;
    }
  }
  return true;
}

export function withoutLink(b: Board): Board {
  const { link: _link, ...rest } = b;
  return rest;
}

/** A label held by one part is not a link: drop it. Same array when unchanged. */
export function dissolveSingletons(boards: Board[]): Board[] {
  const count = new Map<string, number>();
  for (const b of boards) if (b.link) count.set(b.link, (count.get(b.link) ?? 0) + 1);
  if (![...count.values()].some((n) => n < 2)) return boards;
  return boards.map((b) => (b.link && count.get(b.link)! < 2 ? withoutLink(b) : b));
}

/**
 * Make every link consistent WITHOUT moving any geometry (linking spec §3.5):
 * a member whose shared fields differ from its label's FIRST member, in
 * document order, is unlinked; then singletons are dropped. Never merges two
 * labels. Same array when unchanged.
 */
export function repairLinks(boards: Board[]): Board[] {
  const first = new Map<string, Board>();
  let changed = false;
  const out = boards.map((b) => {
    if (!b.link) return b;
    const ref = first.get(b.link);
    if (!ref) { first.set(b.link, b); return b; }
    if (sameShared(ref, b)) return b;
    changed = true;
    return withoutLink(b);
  });
  return dissolveSingletons(changed ? out : boards);
}

export interface LinkPlan { source: Board; members: string[]; changing: string[]; label: string | null }

/**
 * What Link will do (linking spec §3.1). The ONE decider, used by the store's
 * linkBoards AND the panel's "will match" line, so the two cannot disagree.
 * The source is the FIRST selected part; any selected part that is already
 * linked brings its whole link. Null for fewer than two parts, or when the
 * members already share one label and match (a no-op, invariant 4).
 */
export function linkPlan(boards: readonly Board[], ids: readonly string[]): LinkPlan | null {
  const chosen = [...new Set(ids)].flatMap((id) => boards.filter((b) => b.id === id));
  if (chosen.length < 2) return null;
  const source = chosen[0]!;
  const labels = new Set(chosen.flatMap((b) => (b.link ? [b.link] : [])));
  const picked = new Set(chosen.map((b) => b.id));
  const members = boards.filter((b) => picked.has(b.id) || (b.link !== undefined && labels.has(b.link)));
  const changing = members.filter((b) => b.id !== source.id && !sameShared(source, b)).map((b) => b.id);
  const label = source.link ?? [...labels][0] ?? null;
  const oneLabel = members.every((b) => b.link !== undefined && b.link === members[0]!.link);
  if (oneLabel && changing.length === 0) return null;
  return { source, members: members.map((b) => b.id), changing, label };
}
```

  - **`src/document/document.ts`:**
    - **`CURRENT_VERSION = 9`.** Prepend a doc paragraph in the file's existing style. The argument
      is SILENT DATA LOSS on round-trip: a v8 build drops every `link` and autosaves. It is
      document-level and has no per-board step.
    - **`validateBoard`.** Add to the `board` object
      `...(typeof b.link === 'string' && b.link.trim() ? { link: b.link } : {}),`.
    - **`migrateDocument`.** `boards: repairLinks(dedupeNames(rawBoards.map(...)))`.
    - **Re-export.** Add `export * from './links';` beside the other re-exports. Check that nothing
      collides.

- [ ] **Step 3: Run.** Run `npx vitest run src/document`, then `npm test` and `npm run build`.

- [ ] **Step 4: Mutation-test.** Each must turn red, then revert by hand:
  - mark `rotation` as `'shared'`;
  - drop the cut id comparison in `sameShared`;
  - make `repairLinks` compare against the PREVIOUS member, not the first;
  - make `repairLinks` delete the member, not unlink it;
  - make `linkPlan` ignore unselected members of chosen labels;
  - make `linkPlan`'s no-op check ignore `changing`;
  - make `validateBoard` keep an empty `link`.

- [ ] **Step 5: Commit.**

```bash
git add src/document/links.ts src/document/links.test.ts src/document/types.ts src/document/document.ts src/document/document.test.ts
git commit -m "feat(document): links — LINK_FIELDS, sameShared, linkPlan, repair on load; schema 9"
```

---

### Task 2: The store — link, unlink, propagation

**Files:**
- Modify: `src/store/store.ts`.
- Test: `src/store/store.test.ts` (a new `describe('linked parts', …)` at the end).

**Interfaces:**
- **Consumes** (Task 1): `linkPlan`, `sharedOf`, `sharedPatch`, `withoutLink`, `dissolveSingletons`.
- **Produces:**
  - `linkBoards: (ids: string[]) => void`;
  - `unlinkBoards: (ids: string[]) => void`;
  - `selectLinked: (id: string) => void`.

- [ ] **Step 1: Failing tests.** Append to `src/store/store.test.ts`:

```ts
describe('linked parts', () => {
  const st = () => useStore.getState();
  const board = (id: string) => st().doc.boards.find((b) => b.id === id)!;
  const leg = (patch: Partial<Board> = {}) => {
    st().addBoard();
    const id = st().doc.boards.at(-1)!.id;
    st().updateBoard(id, { length: 28, width: 1.75, thickness: 1.75, posture: 'upright', ...patch });
    return id;
  };

  it('Link: the first selected part wins; position and turn stay each part\'s own; one undo entry', () => {
    const a = leg({ length: 30, position: [0, 0, 0] });
    const b = leg({ position: [10, 0, 0], rotation: 90 });
    st().addCut(a);
    const past = st().past.length;
    st().linkBoards([a, b]);
    expect(st().past.length).toBe(past + 1);
    expect(board(b).length).toBe(30);
    expect(board(b).cuts.map((c) => c.id)).toEqual(board(a).cuts.map((c) => c.id));
    expect(board(b).cuts[0]).not.toBe(board(a).cuts[0]);
    expect(board(b).position).toEqual([10, 0, 0]);
    expect(board(b).rotation).toBe(90);
    expect(board(a).link).toBeDefined();
    expect(board(b).link).toBe(board(a).link);
  });

  it('Link brings a selected part\'s WHOLE link, unselected members included (Review Focus 1)', () => {
    const a = leg({ length: 30 });
    const b = leg();
    const c = leg();
    st().linkBoards([b, c]);
    st().linkBoards([a, b]);
    expect([a, b, c].map((id) => board(id).length)).toEqual([30, 30, 30]);
    expect(new Set([a, b, c].map((id) => board(id).link)).size).toBe(1);
  });

  it('a propagated posture change pivots each member about its OWN centre (Review Focus 2)', () => {
    const a = leg({ position: [0, 0, 0] });
    const b = leg({ position: [20, 0, 5], rotation: 90 });
    st().linkBoards([a, b]);
    const centre = (id: string) => { const x = board(id); const e = boardExtents(x); return [x.position[0] + e[0] / 2, x.position[2] + e[2] / 2]; };
    const before = [centre(a), centre(b)];
    st().updateBoard(a, { posture: 'flat' });
    expect(board(b).posture).toBe('flat');
    expect([centre(a), centre(b)]).toEqual(before);
  });

  it('propagates shared edits to every member — hidden too — as one undo entry; own fields do not', () => {
    const a = leg();
    const b = leg();
    const c = leg();
    st().linkBoards([a, b, c]);
    st().setHidden(c, true);
    const past = st().past.length;
    st().updateBoard(a, { length: 33, material: 'walnut' });
    expect(st().past.length).toBe(past + 1);
    expect([a, b, c].map((id) => board(id).length)).toEqual([33, 33, 33]);
    expect(board(c).material).toBe('walnut');
    st().updateBoard(a, { name: 'Only A', position: [99, 0, 0], rotation: 180 });
    expect(board(b).name).not.toBe('Only A');
    expect(board(b).position[0]).not.toBe(99);
    expect(board(b).rotation).not.toBe(180);
  });

  it('cut add / edit / remove reach every member with the same cut id', () => {
    const a = leg();
    const b = leg();
    st().linkBoards([a, b]);
    st().addCut(b);
    const id = board(b).cuts[0]!.id;
    expect(board(a).cuts.map((c) => c.id)).toEqual([id]);
    st().updateCut(a, id, { depth: 0.5 });
    expect(board(b).cuts[0]!.depth).toBe(0.5);
    st().removeCut(b, id);
    expect(board(a).cuts).toEqual([]);
  });

  it('a group edit reaches unselected members of the selected parts\' links', () => {
    const a = leg();
    const b = leg();
    const x = leg();
    const y = leg();
    st().linkBoards([a, b]);
    st().updateBoards([a, x], { thickness: 2 });
    expect(board(b).thickness).toBe(2);
    expect(board(y).thickness).toBe(1.75);
  });

  it('Unlink keeps values; unlinking or deleting one of two dissolves the other', () => {
    const a = leg({ length: 30 });
    const b = leg();
    st().linkBoards([a, b]);
    st().unlinkBoards([b]);
    expect('link' in board(b)).toBe(false);
    expect('link' in board(a)).toBe(false);
    expect(board(b).length).toBe(30);
    const c = leg();
    st().linkBoards([a, c]);
    st().deleteBoards([c]);
    expect('link' in board(a)).toBe(false);
  });

  it('Duplicate and Copy in a row copies join the link', () => {
    const a = leg();
    const b = leg();
    st().linkBoards([a, b]);
    st().duplicateBoards([a]);
    st().copyInRow([a], 3, 0, 1, 5);
    const label = board(a).link;
    expect(st().doc.boards.filter((x) => x.link === label)).toHaveLength(5);
  });

  it('selectLinked selects every visible member', () => {
    const a = leg();
    const b = leg();
    const c = leg();
    st().linkBoards([a, b, c]);
    st().setHidden(c, true);
    st().selectLinked(a);
    expect(st().selectedIds).toEqual([a, b]);
  });

  it('undo after Link restores values AND the absent links (Review Focus 3)', () => {
    const a = leg({ length: 30 });
    const b = leg();
    st().linkBoards([a, b]);
    st().undo();
    expect(board(b).length).toBe(28);
    expect('link' in board(b)).toBe(false);
  });

  it('invariant 24: a tape anchor on another member\'s cut drops when a propagated cut edit moves it', () => {
    const a = leg();
    const b = leg();
    st().linkBoards([a, b]);
    st().addCut(a);
    const cutPt = cutSnapPoints(board(b))[0]!;
    st().setTapeAnchor(cutPt);
    st().updateCut(a, board(a).cuts[0]!.id, { offset: 3 });
    expect(st().tapeAnchor).toBeNull();
    const corner = boardSnapPoints(board(b)).find((p) => p.kind === 'corner')!;
    st().setTapeAnchor(corner);
    st().updateCut(a, board(a).cuts[0]!.id, { offset: 4 });
    expect(st().tapeAnchor).not.toBeNull();
  });
});
```

  - **Imports.** Import `boardExtents` and `cutSnapPoints` if not already imported. `Board` is
    already imported from Task 2 of an earlier round.
  - **About the box-corner test:** the corner is chosen from `boardSnapPoints`. If the leg's cut
    removes that corner, pick a corner `stockProbe` keeps. Assert the anchor is kept only for a point
    that is still offered.
  - **Run.** Expected: FAIL.

- [ ] **Step 2: Implement.** In `src/store/store.ts`:
  - **A private helper**, beside `copyBoard`:

```ts
  /** Every OTHER member of the links the given boards belong to (linking spec
   *  §3.2). Empty for unlinked boards. */
  const mates = (boards: Board[], ids: ReadonlySet<string>): Set<string> => {
    const labels = new Set(boards.flatMap((b) => (ids.has(b.id) && b.link ? [b.link] : [])));
    return new Set(boards.filter((b) => !ids.has(b.id) && b.link !== undefined && labels.has(b.link)).map((b) => b.id));
  };
```

  - **`updateBoards`.** After `targets` (and its board-precise `grabbed` clause, which stays for the
    targets):

```ts
      // Propagation (linking spec §3.2): the shared part of the patch reaches
      // every other member of the targets' links, in the SAME edit — one undo
      // entry — hidden members included. Name, position and rotation never do.
      const shared = sharedPatch(patch);
      const others = Object.keys(shared).length === 0 ? new Set<string>() : mates(get().doc.boards, targets);
      edit((doc) => ({
        ...doc,
        boards: doc.boards.map((b) =>
          targets.has(b.id) ? patchBoard(b, patch) : others.has(b.id) ? patchBoard(b, shared) : b),
      }));
      for (const id of [...targets, ...others]) dropHeldIfGone(id);
```

    This replaces the existing `edit` call and the `dropHeldIfGone` loop.
  - **`addCut`, `updateCut`, `removeCut`.** Apply to the board AND its mates. Example for `addCut`.
    The cut is computed once from the clicked board, with ONE `nextId()`:

```ts
      const all = new Set([boardId, ...mates(get().doc.boards, new Set([boardId]))]);
      edit((doc) => ({
        ...doc,
        boards: doc.boards.map((b) => (all.has(b.id) ? { ...b, cuts: [...b.cuts, { ...cut }] } : b)),
      }));
      for (const id of all) dropHeldIfGone(id);
```

    `updateCut` and `removeCut` follow the same shape, mapping `cutId` on every board in `all`. A mate
    that lacks the cut id is left unchanged; the repair rules make that unreachable.
  - **`linkBoards`:**

```ts
    linkBoards: (ids) => {
      const plan = linkPlan(get().doc.boards, ids);
      if (!plan) return; // fewer than two, or nothing would change (invariant 4)
      const label = plan.label ?? `link_${nextId()}`;
      const members = new Set(plan.members);
      edit((doc) => ({
        ...doc,
        boards: doc.boards.map((b) => {
          if (!members.has(b.id)) return b;
          // The source keeps its values; every other member takes them through
          // patchBoard, so a posture change pivots it about its own centre.
          const next = b.id === plan.source.id ? b : patchBoard(b, sharedOf(plan.source));
          return { ...next, link: label };
        }),
      }));
      for (const id of members) dropHeldIfGone(id);
    },
```

  - **`unlinkBoards`:**

```ts
    unlinkBoards: (ids) => {
      const drop = new Set(ids.filter((id) => get().doc.boards.some((b) => b.id === id && b.link)));
      if (drop.size === 0) return;
      edit((doc) => ({
        ...doc,
        boards: dissolveSingletons(doc.boards.map((b) => (drop.has(b.id) ? withoutLink(b) : b))),
      }));
    },
```

  - **`deleteBoards`.** Its edit's board list becomes
    `dissolveSingletons(doc.boards.filter((b) => !doomed.has(b.id)))`.
  - **`selectLinked`.** Through `selectionPatch`, which drops hidden ids:

```ts
    selectLinked: (id) => {
      const b = get().doc.boards.find((x) => x.id === id);
      if (!b?.link) return;
      set(selectionPatch(get().doc.boards.filter((x) => x.link === b.link).map((x) => x.id)));
    },
```

  - **The interface entries,** each with a one-line doc comment.
  - **Import** `linkPlan`, `sharedOf`, `sharedPatch`, `withoutLink` and `dissolveSingletons`.
  - **Copies.** `copyBoard` already spreads the source, `link` included, so copies join. Leave it,
    and add a comment there saying so.

- [ ] **Step 3: Run.** Run `npx vitest run src/store`, then `npm test` and `npm run build`.

- [ ] **Step 4: Mutation-test.** Each must turn red, then revert by hand:
  - propagate the FULL patch to the mates (the "own fields" test);
  - skip the mates in `updateBoards` (the propagation test);
  - mint a separate cut id per member in `addCut` (the cut test);
  - skip `dissolveSingletons` in `unlinkBoards`, then in `deleteBoards` (the dissolve test);
  - drop `withoutLink` in `copyBoard`. Copies must still join, so instead make `copyBoard` strip
    `link` and confirm the copies test goes red;
  - skip `dropHeldIfGone` for the mates (the invariant 24 test);
  - make `linkBoards` set values by plain spread instead of `patchBoard` (the pivot test).

- [ ] **Step 5: Commit.**

```bash
git add src/store/store.ts src/store/store.test.ts
git commit -m "feat(store): link, unlink, select linked; shared edits propagate to every member in one undo entry"
```

---

### Task 3: Joinery returns consistent links

**Files:**
- Modify: `src/generate/run.ts`, wherever `runJoinery` builds its returned result document.
- Test: `src/generate/runJoinery.test.ts`, or wherever `runJoinery`'s tests live (find them).

**Interfaces:**
- **Consumes:** `repairLinks` (Task 1).

- [ ] **Step 1: Failing test.**
  - **The fixture.** Use the existing fixture with a rail between two legs. Joinery gives the two legs
    mortises on facing (different) faces. Give both legs `link: 'L'` and identical shared fields
    before the run. Use the existing test's mocked model / default-choice setup.
  - **The assertion.** In the returned result document, neither leg carries `link`.
  - **A second case.** For a fixture where no linked part is cut, the links are kept.
  - **Run.** Expected: FAIL (the legs keep `'L'`).

- [ ] **Step 2: Implement.**
  - At the single point where `runJoinery` produces its result document, set
    `boards: repairLinks(doc.boards)`.
  - Comment: joinery cuts parts one at a time, so linked parts cut differently must come out unlinked
    (linking spec §3.5). Repair never moves geometry.
  - **One home.** If several return paths produce the document, apply it once, at the shared exit.

- [ ] **Step 3: Run and mutate.**
  - Run `npx vitest run src/generate`, then `npm test` and `npm run build`.
  - Mutation: remove the `repairLinks` call. The test must go red. Revert.

- [ ] **Step 4: Commit.**

```bash
git add src/generate
git commit -m "feat(joinery): the joined design unlinks parts it cut differently"
```

---

### Task 4: The controls

**Files:**
- Modify: `src/panels/Properties.tsx` (group and single panels), `src/panels/PartsList.tsx`,
  `src/styles.css`.
- Test: `src/panels/Properties.test.tsx`, `src/panels/PartsList.test.tsx`.

**Interfaces:**
- **Consumes:**
  - `linkPlan` (Task 1);
  - `linkBoards`, `unlinkBoards` and `selectLinked` (Task 2).

- [ ] **Step 1: Failing tests.**
  - **In `Properties.test.tsx`:**

```tsx
describe('linking controls', () => {
  const st = () => useStore.getState();
  const two = (lenB = 28) => {
    act(() => {
      st().addBoard(); st().addBoard();
      const [a, b] = st().doc.boards.map((x) => x.id);
      st().updateBoard(a!, { length: 28 });
      st().updateBoard(b!, { length: lenB });
      st().selectBoard(a!); st().toggleSelected(b!);
    });
    return st().doc.boards.map((x) => x.id);
  };

  it('offers Link with a "will match" line only when the parts differ', async () => {
    two(30);
    render(<Properties />);
    expect(screen.getByText(/Linking makes 1 part match Board:/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Link' }));
    expect(new Set(st().doc.boards.map((b) => b.link)).size).toBe(1);
    expect(st().doc.boards[1]!.length).toBe(28);
  });

  it('no "will match" line for identical parts; Link hidden once they are one link; Unlink shown', async () => {
    two();
    render(<Properties />);
    expect(screen.queryByText(/Linking makes/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Link' }));
    expect(screen.queryByRole('button', { name: 'Link' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Unlink' })).toBeInTheDocument();
  });

  it('single panel for a linked part: the block, Select linked, Unlink', async () => {
    const [a, b] = two();
    act(() => { st().linkBoards([a!, b!]); st().selectBoard(a!); });
    render(<Properties />);
    expect(screen.getByText(/Linked with 1 other part/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Select linked' }));
    expect(st().selectedIds).toEqual([a, b]);
  });

  it('single panel Unlink makes the part independent', async () => {
    const [a, b] = two();
    act(() => { st().linkBoards([a!, b!]); st().selectBoard(a!); });
    render(<Properties />);
    await userEvent.click(screen.getByRole('button', { name: 'Unlink' }));
    expect(st().doc.boards.every((x) => !('link' in x))).toBe(true);
  });
});
```

  - **In `PartsList.test.tsx`** (Review Focus 5):

```tsx
  it('a linked row shows a labelled chain icon outside its name button', () => {
    const [a, b] = threeParts();
    act(() => useStore.getState().linkBoards([a!, b!]));
    expect(screen.getAllByRole('img', { name: 'Linked, 2 parts' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Board' })).toBeInTheDocument();
  });
```

  - **Wording.**
    - **Singular and plural:** "1 part" vs "N parts", and "1 other part" vs "N other parts".
    - **The source name** in "match <name>" is the source's name, here `Board` (the first created).
  - **Run.** Expected: FAIL.

- [ ] **Step 2: Implement.**
  - **`GroupProperties`.**
    - Subscribe to `linkBoards` and `unlinkBoards` (bare fields). Compute
      `const plan = useMemo(() => linkPlan(allBoards, selectedIds), [allBoards, selectedIds]);`
      BEFORE the early return.
    - **Above the button row:**

```tsx
      {plan && plan.changing.length > 0 && (
        <p className="link-note">
          Linking makes {plan.changing.length} {plan.changing.length === 1 ? 'part' : 'parts'} match {plan.source.name}: size, material, grain, posture and cuts.
        </p>
      )}
```

    - **In the row:** `{plan && <button onClick={() => linkBoards(selectedIds)}>Link</button>}` and
      `{boards.some((b) => b.link) && <button onClick={() => unlinkBoards(selectedIds)}>Unlink</button>}`.
  - **The single panel.** Under the name field, when `board.link`:

```tsx
      {linkedCount > 0 && (
        <div className="link-block">
          <p>Linked with {linkedCount} other {linkedCount === 1 ? 'part' : 'parts'}: edits to size, material, grain, posture or cuts change all {linkedCount + 1}.</p>
          <div className="row">
            <button onClick={() => selectLinked(board.id)}>Select linked</button>
            <button onClick={() => unlinkBoards([board.id])}>Unlink</button>
          </div>
        </div>
      )}
```

    - `linkedCount` is the number of OTHER boards sharing `board.link`, computed from a bare
      `s.doc.boards` subscription with `useMemo`.
    - **Hook order.** Keep every hook above the component's early returns.
  - **`PartsList.tsx`.** After the name `<button>`, inside the row `<li>`:

```tsx
              {b.link && (
                <span className="part-link" role="img" aria-label={`Linked, ${linkCount.get(b.link)} parts`}>
                  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
                    <path d="M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 013.5 3.5l-1 1M9 11.5l-1 1A2.5 2.5 0 014.5 9l1-1" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                </span>
              )}
```

    - `linkCount` is a `useMemo` `Map` of label → count over `boards`.
  - **`styles.css`.** Use existing tokens only:

```css
.part-link {
  flex: none;
  display: flex;
  align-items: center;
  padding: 0 6px;
  color: var(--ink-dim);
}

.link-note,
.link-block p {
  margin: 6px 0;
  color: var(--ink-dim);
}
```

- [ ] **Step 3: Run.** Run `npx vitest run src/panels`, then `npm test` and `npm run build`.

- [ ] **Step 4: Mutation-test.** Each must turn red, then revert by hand:
  - show the note whenever a plan exists (the identical-parts test);
  - always show Link (the "hidden once linked" test);
  - put the chain icon INSIDE the name button (Review Focus 5);
  - make Select linked call `selectBoard(board.id)`.

- [ ] **Step 5: Commit.**

```bash
git add src/panels/Properties.tsx src/panels/PartsList.tsx src/panels/Properties.test.tsx src/panels/PartsList.test.tsx src/styles.css
git commit -m "feat(panels): Link and Unlink, the will-match line, the linked block, a chain icon per linked row"
```

---

### Task 5: Docs

**Files:** `CLAUDE.md`, `docs/history.md`, `docs/follow-ups.md`.

- [ ] **Step 1: CLAUDE.md.**
  - **New invariant 45** (append; never renumber). It must say:
    - `LINK_FIELDS` is the ONE shared-versus-own table, checked by `satisfies`;
    - `linkPlan` is the ONE decider for Link (store and panel);
    - propagation runs inside the SAME `edit()` and reaches hidden members;
    - name, position and rotation never propagate;
    - repair UNLINKS and never moves geometry, and never merges labels;
    - an unlinked part has NO `link` key;
    - a link is a label, not an id (invariant 33 holds);
    - `dropHeldIfGone` runs for every member touched.
  - **Versioning.** v8→v9: `link`, document-level. Its argument is silent data loss on round-trip.
  - **`CURRENT_VERSION`:** 9 everywhere it is stated, the Status headline included.
  - **"Where things live":**
    - `links.ts`;
    - the store's link actions and `mates`;
    - `runJoinery`'s repair;
    - the Properties and PartsList additions.
  - **Status.** A paragraph saying "on branch, not merged", that it is the last repeated-parts round,
    and that rolling back strands v9 files, so export first.
  - **Rounds table.** A row with schema 9.
  - **Test counts and the follow-ups range,** updated.
- [ ] **Step 2: docs/history.md.** The round's entry at the top of "What each round did". Include:
  - the user's rulings: first selected wins, copies join, posture shared;
  - the planning ruling (repair in `runJoinery`);
  - any execution rulings.
- [ ] **Step 3: docs/follow-ups.md.** Residues numbered from 221.
- [ ] **Step 4: Commit.**

```bash
git add CLAUDE.md docs/history.md docs/follow-ups.md
git commit -m "docs: linked parts round — invariant 45, schema 9, where things live"
```
