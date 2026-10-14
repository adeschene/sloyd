# Custom materials — chunk 2 (nominal names) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parts of nominal-size lumber (pine, and custom materials marked "sold in nominal sizes") carry their nominal names (2×4 = 1½ × 3½) in the cut list, the Buying section and a Properties size picker; new nominal materials default to dimensional-lumber stock.

**Architecture:** One table and matcher in `src/units/nominal.ts` (exact match, 1e-9). The `nominal` flag already round-trips in `CustomMaterial` and `MaterialInfo` (chunk 1); this chunk sets it on pine, reads it through the catalog in `cutlist.ts`/`purchase.ts`/Properties, and exposes the checkbox in the Materials & prices dialog. No schema change.

**Tech Stack:** TypeScript, React, Zustand, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-14-sloyd-custom-materials-design.md` §5 (chunk 2 = §8 item 2). Chunk 1 is deployed (schema 15, `index-DyeArqLP.js`); read CLAUDE.md invariant 49.

## Global Constraints

- **No schema change**: `CURRENT_VERSION` stays 15. A rollback to chunk 1 is free.
- Nominal → actual: 1 → ¾, 2 → 1½, 3 → 2½, 4 → 3½, 6 → 5½, 8 → 7¼, 10 → 9¼, 12 → 11¼ (inches). Named sections: 1×2, 1×3, 1×4, 1×6, 1×8, 1×10, 1×12, 2×2, 2×3, 2×4, 2×6, 2×8, 2×10, 2×12, 4×4, 4×6, 6×6. The glyph is `×` (U+00D7), already used on the sheet.
- The match is EXACT: thickness × width (either order) equals a section's actual pair within **1e-9**; never rounded (invariant 18: round what is bought, never what is machined).
- Names show ONLY for a part whose material's catalog entry has `nominal: true` (pine, or a custom material with the switch on).
- Strings a person reads are built in `cutlist.ts` / `purchase.ts` / `units`, never assembled in a component (invariant 19). Drawings (Plans sheet, part diagrams, sheet-layout SVG labels) keep actual dimensions.
- Whole-foot stock lengths read `8′` (U+2032 prime); any other length reads as `formatLength` gives it today.
- Pine's stored default stock (¾ × 1½…11¼ at 72/96) is unchanged, so nobody's stored prices move.
- `npm run build` is the typecheck gate. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Branch `custom-materials-2`; merge locally `--no-ff`. Mutation-test every "exact" and ordering test.

## Review Focus

1. **A cut-list row whose boards print alike but are not all the same section** (3½ and 3½ + 1e-6 print identically) — the row must show NO name rather than the representative's. Pinned in Task 2.
2. **An existing pine project** — its ¾ × 3½ rows now read "1×4"; an oak row of the same size does not. Pinned in Task 2.
3. **A multi-selection mixing sections** — the Nominal size select reads "mixed"; choosing 2×4 sets every part in ONE undo entry. Pinned in Task 4.
4. **Turning a material's nominal switch off** — its names disappear everywhere (catalog-driven), its stored stock list stays. Pinned in Task 2 (cut list with `nominal` false) and Task 5 (dialog round trip).
5. **A stock length that is not whole feet** (100") — reads `2×4 × 100"` (exact inches), never a fractional foot like `8.33′`. Pinned in Task 1 (`stockLengthText`) and Task 3 (the Buy line).

---

### Task 1: The nominal table, pine's flag, nominal default stock

**Files:**
- Create: `src/units/nominal.ts`, `src/units/nominal.test.ts`
- Modify: `src/document/types.ts` (`MATERIALS` type and pine entry)
- Modify: `src/document/materials.ts` (`builtInInfo`)
- Modify: `src/document/purchase.ts` (`defaultBuying`)
- Test: `src/document/materials.test.ts`, `src/document/purchase.test.ts`

**Interfaces:**
- Produces: `NOMINAL_ACTUAL`, `interface NominalSection { name: string; thickness: number; width: number }`, `NOMINAL_SECTIONS: readonly NominalSection[]` (thinner first, in the order listed in Global Constraints), `nominalName(thickness: number, width: number): string | null`, `stockLengthText(length: number, precision: number): string`; `MATERIALS[id].nominal?: true` (pine only); `catalog.get('pine').nominal === true`; `defaultBuying(material: string, nominal = false): MaterialBuying`; `NOMINAL_DEFAULT_STOCK` (exported for tests).

- [ ] **Step 1: Branch** — `git checkout -b custom-materials-2`.

- [ ] **Step 2: Write the failing tests** — `src/units/nominal.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { NOMINAL_SECTIONS, nominalName, stockLengthText } from './nominal';

describe('nominal names (custom materials spec §5)', () => {
  it('lists the seventeen sections, thinner side first', () => {
    expect(NOMINAL_SECTIONS.map((s) => s.name)).toEqual([
      '1×2', '1×3', '1×4', '1×6', '1×8', '1×10', '1×12',
      '2×2', '2×3', '2×4', '2×6', '2×8', '2×10', '2×12', '4×4', '4×6', '6×6',
    ]);
    expect(NOMINAL_SECTIONS.find((s) => s.name === '2×4')).toEqual({ name: '2×4', thickness: 1.5, width: 3.5 });
    expect(NOMINAL_SECTIONS.find((s) => s.name === '1×12')).toEqual({ name: '1×12', thickness: 0.75, width: 11.25 });
  });
  it('matches exactly, in either order', () => {
    expect(nominalName(1.5, 3.5)).toBe('2×4');
    expect(nominalName(3.5, 1.5)).toBe('2×4');
    expect(nominalName(0.75, 3.5)).toBe('1×4');
    expect(nominalName(3.5, 3.5)).toBe('4×4');
    expect(nominalName(1.5, 3.5 + 1e-10)).toBe('2×4');
  });
  it('never rounds: 3/8 short or 1e-6 off is no name', () => {
    expect(nominalName(0.75, 3.375)).toBeNull();
    expect(nominalName(1.5, 3.5 + 1e-6)).toBeNull();
    expect(nominalName(1, 4)).toBeNull();
  });
  it('writes whole-foot lengths in feet and anything else as today', () => {
    expect(stockLengthText(96, 16)).toBe('8′');
    expect(stockLengthText(144, 16)).toBe('12′');
    expect(stockLengthText(100, 16)).toBe('100"');
    expect(stockLengthText(72.5, 16)).toBe('72-1/2"');
  });
});
```

(Confirm `formatLength(100, 16)` really prints `100"` and `formatLength(72.5, 16)` `72-1/2"` by reading `src/units/length.test.ts`; if the format differs, use the real strings — the rule is "exactly what `formatLength` prints".)

Append to `materials.test.ts`: `it('pine is the one nominal built-in', () => { expect(builtInCatalog().ids.filter((id) => builtInCatalog().get(id)!.nominal)).toEqual(['pine']); });`

Append to `purchase.test.ts`:

```ts
describe('nominal default stock (custom materials spec §5.4)', () => {
  it('a nominal custom solid defaults to dimensional lumber by the piece, no prices', () => {
    const b = defaultBuying('m-s-spf1', true);
    expect(b.mode).toBe('piece');
    const names = (b as Extract<typeof b, { mode: 'piece' }>).stock.map((s) => `${nominalName(s.thickness, s.width)} ${s.length}`);
    expect(names).toEqual([
      ...['1×2', '1×3', '1×4', '1×6', '1×8', '1×10', '1×12'].map((n) => `${n} 96`),
      ...['2×2', '2×3', '2×4', '2×6', '2×8', '2×10', '2×12'].flatMap((n) => [96, 120, 144].map((l) => `${n} ${l}`)),
      '4×4 96',
    ]);
    expect((b as Extract<typeof b, { mode: 'piece' }>).stock.every((s) => s.price === null)).toBe(true);
    expect(new Set((b as Extract<typeof b, { mode: 'piece' }>).stock.map((s) => s.id)).size).toBe(29);
  });
  it('the flag changes nothing for pine, sheets or a non-nominal solid', () => {
    expect(defaultBuying('pine', true)).toEqual(defaultBuying('pine'));
    expect(defaultBuying('m-v-bb55', true)).toEqual({ mode: 'sheet', pricePerSheet: null });
    expect(defaultBuying('m-s-ash1')).toEqual({ mode: 'board-foot', pricePerBoardFoot: null, wasteFactor: 1.3 });
  });
});
```

- [ ] **Step 3: Run to verify they fail** — `npx vitest run src/units/nominal.test.ts src/document/materials.test.ts src/document/purchase.test.ts` → FAIL (module missing; pine not nominal; flag ignored).

- [ ] **Step 4: Implement** — `src/units/nominal.ts`:

```ts
import { formatLength } from './length';

/** US softwood dimensional lumber: nominal inches → actual (custom materials spec §5.1). */
export const NOMINAL_ACTUAL: Readonly<Record<number, number>> = { 1: 0.75, 2: 1.5, 3: 2.5, 4: 3.5, 6: 5.5, 8: 7.25, 10: 9.25, 12: 11.25 };

export interface NominalSection { name: string; thickness: number; width: number }

const NAMED: readonly (readonly [number, number])[] = [
  [1, 2], [1, 3], [1, 4], [1, 6], [1, 8], [1, 10], [1, 12],
  [2, 2], [2, 3], [2, 4], [2, 6], [2, 8], [2, 10], [2, 12], [4, 4], [4, 6], [6, 6],
];

/** The named sections, thinner side as thickness. */
export const NOMINAL_SECTIONS: readonly NominalSection[] = NAMED.map(([t, w]) => ({
  name: `${t}×${w}`, thickness: NOMINAL_ACTUAL[t]!, width: NOMINAL_ACTUAL[w]!,
}));

/** Far below 1/64", far above float drift: the cut list's flush tolerance. Never a rounding (invariant 18). */
const EPS = 1e-9;

/** The section's name when thickness × width (either order) IS one, else null (spec §5.2). */
export function nominalName(thickness: number, width: number): string | null {
  const [a, b] = thickness <= width ? [thickness, width] : [width, thickness];
  return NOMINAL_SECTIONS.find((s) => Math.abs(s.thickness - a) <= EPS && Math.abs(s.width - b) <= EPS)?.name ?? null;
}

/** A stock board's length as a yard writes it: whole feet as `8′`, anything else exactly as `formatLength`. */
export function stockLengthText(length: number, precision: number): string {
  const feet = length / 12;
  return Number.isInteger(feet) ? `${feet}′` : formatLength(length, precision);
}
```

`types.ts`: `MATERIALS: Record<string, { label: string; color: string; nominal?: true; sheet?: SheetStock }>` and `pine: { label: 'Pine', color: '#d9b98a', nominal: true },` (comment: "sold in nominal sizes (spec §5): a ¾ × 3½ pine part is a 1×4").

`materials.ts` `builtInInfo`: `nominal: m.nominal === true` instead of `false`.

`purchase.ts`:

```ts
/** A new nominal material's stock (spec §5.4): 1× at 8′; 2× at 8′, 10′, 12′; 4×4 at 8′. No prices. */
export const NOMINAL_DEFAULT_STOCK: readonly StockBoard[] = [
  ...NOMINAL_SECTIONS.filter((s) => s.thickness === 0.75).map((s) => [s, 96] as const),
  ...NOMINAL_SECTIONS.filter((s) => s.thickness === 1.5).flatMap((s) => [96, 120, 144].map((l) => [s, l] as const)),
  ...NOMINAL_SECTIONS.filter((s) => s.name === '4×4').map((s) => [s, 96] as const),
].map(([s, l]) => ({ id: `n${s.name.replace('×', 'x')}x${l}`, thickness: s.thickness, width: s.width, length: l, price: null }));

/** A material's default buying entry. `nominal`: a custom solid sold in nominal sizes (spec §5.4); pine keeps its own list. */
export function defaultBuying(material: string, nominal = false): MaterialBuying {
  if (isSheetGood(material)) return { mode: 'sheet', pricePerSheet: null };
  if (material === 'pine') { /* unchanged */ }
  if (nominal) return { mode: 'piece', stock: NOMINAL_DEFAULT_STOCK.map((s) => ({ ...s })) };
  return { mode: 'board-foot', pricePerBoardFoot: null, wasteFactor: DEFAULT_WASTE_FACTOR };
}
```

(import `NOMINAL_SECTIONS` from `../units/nominal`; the 1× filter excludes 2×2 because its thickness is 1.5 — note 1×2's width is 1.5, thickness 0.75, so the filter on thickness is right.)

- [ ] **Step 5: Run** — `npx vitest run && npm run build` → PASS, clean. (Existing tests asserting pine's catalog `nominal: false` — if any — change to `true`: read each.)

- [ ] **Step 6: Mutate** — change `EPS` to `1e-5`: the "1e-6 off" case must go red. Drop the swap in `nominalName`: "either order" must go red. Restore.

- [ ] **Step 7: Commit** — `feat(nominal): the nominal table and matcher, pine sold in nominal sizes, nominal default stock`.

---

### Task 2: Cut list rows carry their nominal name

**Files:**
- Modify: `src/document/cutlist.ts` (`CutListRow`, `buildCutList`)
- Modify: `src/panels/CutList.tsx:121-127` (row markup), `src/styles.css` (one rule near `.cutlist-names`, roles only)
- Test: `src/document/cutlist.test.ts`, `src/panels/CutList.test.tsx`

**Interfaces:**
- Consumes: `nominalName` (Task 1), `catalogOf`.
- Produces: `CutListRow.nominal: string | null` — the name when the material is nominal AND every board on the row is that same section; else null.

- [ ] **Step 1: Write the failing tests** — `cutlist.test.ts`:

```ts
describe('nominal names on rows (custom materials spec §5.3)', () => {
  const spf = { id: 'm-s-spf1', label: 'SPF', color: '#e0c890', kind: 'solid' as const, nominal: true as const };
  const list = (boards: Board[], materials = [spf]) => buildCutList({ ...createDocument(), boards, materials } as FlatDocument);
  const part = (id: string, material: string, width: number, thickness: number, length = 36) =>
    createBoard({ id, name: id, material, width, thickness, length });

  it('a pine 3/4 × 3-1/2 row reads 1×4; the same oak row has no name', () => {
    const l = list([part('a', 'pine', 3.5, 0.75), part('b', 'oak', 3.5, 0.75)]);
    const row = (m: string) => l.groups.find((g) => g.material === m)!.rows[0]!;
    expect(row('pine').nominal).toBe('1×4');
    expect(row('oak').nominal).toBeNull();
  });
  it('a nominal custom material names 2×4, either way round', () => {
    expect(list([part('a', 'm-s-spf1', 3.5, 1.5)]).groups[0]!.rows[0]!.nominal).toBe('2×4');
    expect(list([part('a', 'm-s-spf1', 1.5, 3.5)]).groups.flatMap((g) => g.rows)[0]!.nominal).toBe('2×4');
  });
  it('a row whose boards print alike but are not all the section has NO name', () => {
    const l = list([part('a', 'm-s-spf1', 3.5, 1.5), part('b', 'm-s-spf1', 3.5 + 1e-6, 1.5)]);
    const rows = l.groups[0]!.rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.qty).toBe(2);
    expect(rows[0]!.nominal).toBeNull();
  });
  it('switching the material off clears the name', () => {
    expect(list([part('a', 'm-s-spf1', 3.5, 1.5)], [{ ...spf, nominal: undefined } as never]).groups[0]!.rows[0]!.nominal).toBeNull();
  });
  it('3/8 short is no name', () => {
    expect(list([part('a', 'pine', 3.375, 0.75)]).groups[0]!.rows[0]!.nominal).toBeNull();
  });
});
```

(`createBoard`'s width/thickness/posture: confirm a flat part keeps the given numbers; use whatever this file's existing helpers do.)

`CutList.test.tsx`: a document with one pine 24 × 3½ × ¾ part shows the text `1×4` inside the row's `.cutlist-nominal`, and the row's dims text is unchanged (`24" × 3-1/2"`).

- [ ] **Step 2: Run to verify they fail** → FAIL (`nominal` undefined).

- [ ] **Step 3: Implement** — `CutListRow`, after `dims`:

```ts
  /**
   * The nominal name (`2×4`) when the material is sold in nominal sizes and EVERY board on the row is exactly that
   * section; null otherwise (custom materials spec §5.3). Not the representative's: a row collapses boards that PRINT
   * alike, and naming them all after the first would round what is machined (invariant 18).
   */
  nominal: string | null;
```

In `buildCutList`, when a row is created: `nominal: catalog.get(board.material)?.nominal ? nominalName(board.thickness, board.width) : null,`. When a later board joins an existing row (beside `row.qty += 1`):

```ts
    if (row.qty > 0 && row.nominal !== null && nominalName(board.thickness, board.width) !== row.nominal) row.nominal = null;
```

(place it BEFORE `row.qty += 1`, so the first board is not compared with itself.)

`CutList.tsx`, in the names cell:

```tsx
<span className="cutlist-names">
  {row.nominal && <span className="cutlist-nominal">{row.nominal}</span>}
  {row.names.join(', ')}
</span>
```

`styles.css`, next to the `.cutlist-names` rule: `.cutlist-nominal { font-weight: 600; color: var(--ink); margin-right: 0.5em; }` (roles only — read which role names exist at the top of the file; use the one the other cut-list emphasis uses).

- [ ] **Step 4: Run** — `npx vitest run && npm run build` → PASS, clean.

- [ ] **Step 5: Mutate** — remove the join-check line: "print alike" must go red. Make creation ignore `catalog.get(...).nominal`: the oak case must go red. Restore.

- [ ] **Step 6: Commit** — `feat(nominal): cut list rows name their nominal section (every board, exactly)`.

---

### Task 3: Buying names nominal stock sizes

**Files:**
- Modify: `src/document/purchase.ts` (`sizeDims`, `byThePiece`, `buildPurchase`)
- Test: `src/document/purchase.test.ts`

**Interfaces:**
- Consumes: `nominalName`, `stockLengthText` (Task 1), `catalogOf`.
- Produces: `byThePiece(material, label, parts, stock, kerf, p, nominal: boolean)`; `buildPurchase` passes `catalog.get(m)?.nominal === true` and uses `defaultBuying(m, nominal)` for an absent entry.

- [ ] **Step 1: Write the failing tests**

```ts
describe('Buying names nominal sizes (custom materials spec §5.3)', () => {
  const spf = { id: 'm-s-spf1', label: 'SPF', color: '#e0c890', kind: 'solid' as const, nominal: true as const };
  const doc = (boards: Board[], materials: CustomMaterial[] = [spf]) => ({ ...createDocument(), boards, materials }) as FlatDocument;
  const run = (d: FlatDocument, shop = defaultShop()) => buildPurchase(d, buildCutList(d), shop);

  it('a nominal material with no stored entry buys from the nominal list and names it', () => {
    const d = doc([createBoard({ id: 'a', name: 'Stud', material: 'm-s-spf1', length: 90, width: 3.5, thickness: 1.5 })]);
    expect(run(d).entries[0]!.lines).toEqual(['Buy 1 × 2×4 × 8′ · no price']);
  });
  it('pine stock reads 1×4 × 6′; a size that is not a section reads as before', () => {
    const d = doc([createBoard({ id: 'a', name: 'Rail', material: 'pine', length: 24, width: 3.5, thickness: 0.75 })], []);
    expect(run(d).entries[0]!.lines[0]).toMatch(/^Buy 1 × 1×4 × 6′ · /);
    const shop = defaultShop();
    shop.materials.pine = { mode: 'piece', stock: [{ id: 'odd', thickness: 0.75, width: 3.4, length: 100, price: null }] };
    const d2 = doc([createBoard({ id: 'a', name: 'Rail', material: 'pine', length: 24, width: 3, thickness: 0.75 })], []);
    expect(run(d2, shop).entries[0]!.lines[0]).toMatch(/^Buy 1 × 3\/4" × 3-.*" × 100" · /);
  });
  it('a non-whole-foot nominal board keeps its exact length', () => {
    const shop = defaultShop();
    shop.materials['m-s-spf1'] = { mode: 'piece', stock: [{ id: 'x', thickness: 1.5, width: 3.5, length: 100, price: null }] };
    const d = doc([createBoard({ id: 'a', name: 'Stud', material: 'm-s-spf1', length: 90, width: 3.5, thickness: 1.5 })]);
    expect(run(d, shop).entries[0]!.lines).toEqual(['Buy 1 × 2×4 × 100" · no price']);
  });
  it('an oak by-the-piece entry of the same section is NOT named (oak is not nominal)', () => {
    const shop = defaultShop();
    shop.materials.oak = { mode: 'piece', stock: [{ id: 'o', thickness: 0.75, width: 3.5, length: 96, price: null }] };
    const d = doc([createBoard({ id: 'a', name: 'Rail', material: 'oak', length: 24, width: 3.5, thickness: 0.75 })], []);
    expect(run(d, shop).entries[0]!.lines[0]).toMatch(/^Buy 1 × 3\/4" × 3-1\/2" × 96" · /);
  });
});
```

(Read today's exact pine line in `purchase.test.ts` / `App.test.tsx` — e.g. `Buy 1 × 3/4" × 5-1/2" × 72" · no price` — and update every existing expectation that a pine section now renames, e.g. to `Buy 1 × 1×6 × 6′ · no price`. List every changed expectation in the report.)

- [ ] **Step 2: Run to verify they fail** → FAIL.

- [ ] **Step 3: Implement** — replace `sizeDims` with:

```ts
/** A stock size as the yard names it: `2×4 × 8′` for a nominal material's section, else actual `t × w × l`. */
const sizeDims = (s: StockBoard, p: number, nominal: boolean) => {
  const name = nominal ? nominalName(s.thickness, s.width) : null;
  return name !== null
    ? `${name} × ${stockLengthText(s.length, p)}`
    : `${formatLength(s.thickness, p)} × ${formatLength(s.width, p)} × ${formatLength(s.length, p)}`;
};
```

Thread `nominal` into `byThePiece` (new last parameter) and every `sizeDims` call inside it (the Buy line, the fu 273 notes, the layout `title`). Keep `nesting.sheet` (`sheet: dims` — the SheetLayout key label) on the ACTUAL dimensions: build it with `sizeDims(s, p, false)` so no new glyph reaches a measured SVG label (invariant 19). In `buildPurchase`: `const nominal = catalog.get(m)?.nominal === true;`, `const buying = shop.materials[m] ?? defaultBuying(m, nominal);`, and pass `nominal` to `byThePiece`.

- [ ] **Step 4: Run** — `npx vitest run && npm run build` → PASS, clean.

- [ ] **Step 5: Mutate** — make `sizeDims` ignore `nominal`: the oak case must go red. Pass `false` from `buildPurchase`: the SPF case must go red. Restore.

- [ ] **Step 6: Commit** — `feat(nominal): Buying names nominal stock sizes (2×4 × 8′)`.

---

### Task 4: Properties — a Nominal size select

**Files:**
- Modify: `src/panels/Properties.tsx` (group form Size block ~`:420-428`, single form ~`:599-607`)
- Test: `src/panels/Properties.test.tsx`

**Interfaces:**
- Consumes: `NOMINAL_SECTIONS`, `nominalName`, `catalogOf`, store `updateBoards`.
- Produces: a `NominalSize` component inside `Properties.tsx`, rendered under each Size grid. Spec §5.3 amendments
  (approved with this plan): label "Nominal size"; keep each part's stored thickness/width order when the selection shares it.

- [ ] **Step 1: Write the failing tests**

```ts
describe('Nominal size (custom materials spec §5.3)', () => {
  it('shows only when every selected part is a nominal material, reading the current name', () => {
    // replaceDocument: part 'a' pine 24 × 3-1/2 × 3/4; select 'a'
    render(<Properties />);
    expect(screen.getByRole('combobox', { name: 'Nominal size' })).toHaveValue('1×4');
    // set 'a' to oak through the store → the select is gone
  });
  it('reads Custom for a non-section size, and choosing Custom changes nothing', () => {
    // part 'a' pine 24 × 3 × 3/4; select 'a'
    render(<Properties />);
    const sel = screen.getByRole('combobox', { name: 'Nominal size' });
    expect(sel).toHaveValue('custom');
    const doc = useStore.getState().doc;
    fireEvent.change(sel, { target: { value: 'custom' } });
    expect(useStore.getState().doc).toBe(doc);
  });
  it('keeps a part stored thicker-than-wide the same way round (spec §5.3, amended)', () => {
    // part 'a' pine stored thickness 3.5, width 0.75 (reads 1×4); select 'a'
    render(<Properties />);
    const sel = screen.getByRole('combobox', { name: 'Nominal size' });
    expect(sel).toHaveValue('1×4');
    fireEvent.change(sel, { target: { value: '2×6' } });
    const b = useStore.getState().doc.boards[0] as Board;
    expect([b.thickness, b.width]).toEqual([5.5, 1.5]);
  });
  it('a mixed selection reads mixed; choosing 2×4 sets every part in ONE undo entry', () => {
    // parts 'a' (pine 1×4) and 'b' (pine 1×6); select both
    render(<Properties />);
    const sel = screen.getByRole('combobox', { name: 'Nominal size' });
    expect(sel).toHaveValue('');
    const n = useStore.getState().past.length;
    fireEvent.change(sel, { target: { value: '2×4' } });
    const parts = useStore.getState().doc.boards as Board[];
    expect(parts.map((b) => [b.thickness, b.width])).toEqual([[1.5, 3.5], [1.5, 3.5]]);
    expect(useStore.getState().past.length).toBe(n + 1);
  });
});
```

(Fill the arrange comments with this file's existing helpers.)

- [ ] **Step 2: Run to verify they fail** → FAIL.

- [ ] **Step 3: Implement**

```tsx
/**
 * The Nominal size select (custom materials spec §5.3): only when every part's material is sold in nominal sizes.
 * Shows the shared section, `Custom`, or `mixed`; choosing a section sets thickness and width in ONE edit (the
 * normal reorient path, invariant 2). `Custom` changes nothing.
 */
function NominalSize({ ids, boards }: { ids: string[]; boards: Board[] }) {
  const doc = useStore((s) => s.doc);
  const catalog = catalogOf(doc);
  if (boards.length === 0 || !boards.every((b) => catalog.get(b.material)?.nominal)) return null;
  const names = new Set(boards.map((b) => nominalName(b.thickness, b.width) ?? 'custom'));
  const value = names.size === 1 ? [...names][0]! : '';
  return (
    <div className="field">
      <label htmlFor="nominal-size">Nominal size</label>
      <select id="nominal-size" className="input" value={value} onChange={(e) => {
        const s = NOMINAL_SECTIONS.find((x) => x.name === e.target.value);
        if (!s) return;
        // Keep the parts' stored order when they all share it, so a board stored thicker-than-wide does not turn
        // over (spec §5.3, amended); a selection mixing orders takes the thinner side as thickness.
        const reversed = boards.every((b) => b.thickness > b.width);
        useStore.getState().updateBoards(ids, reversed ? { thickness: s.width, width: s.thickness } : { thickness: s.thickness, width: s.width });
      }}>
        {value === '' && <option value="" disabled>mixed</option>}
        <option value="custom">Custom</option>
        {NOMINAL_SECTIONS.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
      </select>
    </div>
  );
}
```

Render `<NominalSize ids={selectedIds} boards={boards} />` after the group form's Size grid (inside the `allParts` branch) and `<NominalSize ids={[board.id]} boards={[board]} />` after the single form's. Use the resolved boards the form already has (shared fields come from the Shape).

- [ ] **Step 4: Run** — `npx vitest run && npm run build` → PASS, clean.

- [ ] **Step 5: Mutate** — split the update into two `updateBoards` calls: the one-entry test must go red. Drop the
  `reversed` branch: the thicker-than-wide test must go red. Restore.

- [ ] **Step 6: Commit** — `feat(nominal): Properties' Nominal size select`.

---

### Task 5: The dialog's "Sold in nominal sizes" switch

**Files:**
- Modify: `src/panels/MaterialDefinition.tsx` (a checkbox for solid kinds)
- Modify: `src/panels/MaterialsDialog.tsx` (nominal-aware `defaultBuying`; a new row's price draft follows its switch)
- Test: `src/panels/MaterialsDialog.test.tsx`

**Interfaces:**
- Consumes: `defaultBuying(id, nominal)` (Task 1); `DefDraft.nominal` and `fromDraft` (chunk 1 — already round-trip `nominal`).
- Produces: checkbox `aria-label="<name>: sold in nominal sizes"`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('Sold in nominal sizes (custom materials spec §5)', () => {
  it('a new solid with the switch on starts from the nominal stock list and saves nominal: true', async () => {
    const { onSave } = open();
    fireEvent.click(screen.getByRole('button', { name: 'Add material' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'New material: name' }), { target: { value: 'SPF' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'New material: sold in nominal sizes' }));
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const { plan, shop } = onSave.mock.calls[0]![0];
    const m = plan.library![0]!;
    expect(m.nominal).toBe(true);
    expect(shop.materials[m.id]).toEqual(defaultBuying(m.id, true));
  });
  it('the switch is offered only for solid kinds', () => {
    open({ project: [{ id: 'm-v-bb55', label: 'Baltic birch', color: '#e8d8b8', kind: 'sheet-veneered', sheet: { length: 60, width: 60 } }] });
    expect(screen.queryByRole('checkbox', { name: 'Baltic birch: sold in nominal sizes' })).toBeNull();
  });
  it('turning a stored material off keeps its stock list and saves nominal off', async () => {
    const spf = { id: 'm-s-spf1', label: 'SPF', color: '#e0c890', kind: 'solid' as const, nominal: true as const };
    const shop = defaultShop();
    shop.materials['m-s-spf1'] = defaultBuying('m-s-spf1', true);
    const { onSave } = open({ project: [spf], shop });
    fireEvent.click(screen.getByRole('checkbox', { name: 'SPF: sold in nominal sizes' }));
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const out = onSave.mock.calls[0]![0];
    expect(out.plan.project[0]).not.toHaveProperty('nominal');
    expect(out.shop.materials['m-s-spf1']).toEqual(defaultBuying('m-s-spf1', true));
  });
});
```

(Check the file's `open` helper accepts a `shop` override; add it if not.)

- [ ] **Step 2: Run to verify they fail** → FAIL.

- [ ] **Step 3: Implement** — `MaterialDefinition.tsx`, inside the solid branch (where sheet fields are not shown):

```tsx
{row.kind === 'solid' && (
  <label className="material-nominal">
    <input type="checkbox" aria-label={`${name}: sold in nominal sizes`} checked={d.nominal} disabled={disabled} title={disabledTitle}
      onChange={(e) => onChange({ nominal: e.target.checked })} />
    Sold in nominal sizes (2×4, 1×6…)
  </label>
)}
```

`MaterialsDialog.tsx`: every `defaultBuying(id)` for a row id becomes `defaultBuying(id, nominalOf(id))` where `nominalOf = (id: string) => rows.find((r) => r.id === id)?.draft.nominal ?? false` (built-ins: `false`, pine handled inside `defaultBuying`). In the row's `onChange`, when `patch.nominal !== undefined` and the row is `source === 'new'`, also reset that row's price draft to `toDraft(defaultBuying(r.id, patch.nominal))` and clear its stash (as `changeKind` does) — a stored row's prices are never touched by the switch.

- [ ] **Step 4: Run** — `npx vitest run && npm run build` → PASS, clean.

- [ ] **Step 5: Mutate** — reset prices on the switch for stored rows too: "turning a stored material off keeps its stock list" must go red. Restore.

- [ ] **Step 6: Commit** — `feat(nominal): the dialog's Sold in nominal sizes switch; new nominal materials start from dimensional stock`.

---

### Task 6: Gate, live check, records, merge

**Files:** `docs/browser-verification-custom-materials.md` (a "Chunk 2" section), `docs/follow-ups.md` (266 closed; residue), `docs/feature-gaps.md` (§3 nominal row), `CLAUDE.md` (Status, Rounds row, Where-things-live: `units/nominal.ts`, test count), `docs/history.md`, the spec Status line.

- [ ] **Step 1: Gate** — `npm run build && npx vitest run`; whole-branch review per the execution method.
- [ ] **Step 2: Browser pass on the dev server** (the user watching; never `localStorage.clear()` on a dev origin — record the start state, delete only what this check creates): a pine 24 × 3½ × ¾ part → cut list row shows `1×4`, Buying `Buy 1 × 1×4 × 6′`; Nominal size → 2×4 sets 1½ × 3½ (one undo reverts); a new "SPF" material with the switch on → its Buying from the nominal list (`2×4 × 8′`); an oak 3½ × ¾ part shows no name; the dialog's checkbox layout. The `′` glyph and the row's name read correctly on screen (screenshot into the gitignored workspace).
- [ ] **Step 3: Records** — as listed in Files; commit `docs: custom materials chunk 2 — nominal names; verification, records`.
- [ ] **Step 4: Merge** — ask the user; then `git checkout master && git merge --no-ff custom-materials-2`, build + tests on the merged tree, delete the branch. Deploy only on the user's word (no schema change: rollback to chunk 1 is free).
