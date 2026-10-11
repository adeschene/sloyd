# UI polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle Sloyd in a grey-and-walnut palette and regroup its controls (project-level header, floating viewport controls, a compact side panel) so nothing wraps, overlaps or scrolls sideways at 1366–1920+.

**Architecture:** CSS gets a two-layer palette — raw grey/walnut/oak tokens, and *surface roles* (`--sunk`, `--surface`, `--raised`, `--control`, `--rule`, `--ink`…) that every rule reads; grey chrome re-points the roles in one context selector. Two small new components carry the regrouping: `Popover` (a disclosure menu copying `ProjectMenu`'s closing rules, used by Claude ▾ and More ▾) and `ViewportControls` (tools and view toggles floating over the canvas). Properties gets an `ActionBar` (three actions, More ▾, a trash icon) and grid layouts; Guides becomes a self-opening footer. No store, document or geometry code changes.

**Tech Stack:** React 19 + TypeScript, Zustand store, Vitest + Testing Library (jsdom), plain CSS (`src/styles.css`), react-three-fiber (colour constants only).

**Spec:** `docs/superpowers/specs/2026-10-11-sloyd-ui-polish-design.md` (read it first; this plan argues from it).

## Global Constraints

- **No behaviour change** except one: the Guides footer opens itself when the guide count goes up (spec §4.5).
- Every existing control stays. Accessible names stay the same except, by decision: the grain select's label `Runs` → `Grain runs`; Grid/Origin/Guides become toggle **buttons** with `aria-pressed` (were checkboxes); Generate/Refine/Add joinery live under a trigger named `Claude` (while generating: `Claude · Generating d/t…`).
- **Invariant 27**: no new `window` `keydown` listener. Popups bind Escape on their own subtree and `pointerdown` on `window` only while open (ProjectMenu's pattern).
- **Invariant 28**: `<TapeReadout />` stays unconditionally mounted in `.viewport-stack`, bottom-right.
- **Invariant 19**: `--font-num` stays monospace; no CSS font-size on diagram text.
- **Invariants 5, 9**: `DimensionField` and `NameField` are not edited — only wrapped.
- **Invariant 43**: "Hide others" keeps calling `hideUnselected`.
- `ProjectMenu.tsx` is NOT refactored onto `Popover` (CLAUDE.md "ProjectMenu.tsx" rule).
- After Task 1 no `--graphite-` or `--brass` token survives anywhere in `src/` (grep is the check).
- Target widths: 1920×1080 primary, 1366×768 must be clean; below 1366 not designed for.
- Work on branch `ui-polish`; finish with `git merge --no-ff` into `master`, verify the merged tree, delete the branch. **No pull requests.**
- `npm test` does not typecheck: run `npm run build` before claiming anything compiles.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Focus after a menu item opens a dialog**: App records `document.activeElement` as the dialog's opener; if that is a menu item that then unmounts, closing the dialog drops focus to `<body>`. Expected: focus returns to the menu's trigger. Pinned in Task 2 (Popover: focus is on the trigger when the item's action runs).
2. **Escape inside a popup must not reach App's Escape ladder** (which would also drop a tape anchor or switch tool). Pinned in Task 2 (a `window` keydown spy sees nothing).
3. **Selection change with Copy in a row open**: today the form resets because it sits inside the selection-keyed root. Lifting its `open` state must not keep it open for a new selection. Pinned in Task 5.
4. **Clicking a floating chip must not reach the canvas** (no deselect, no Move/Tape click). Live check in Task 3, step 9.
5. **More ▾ popup clipped by the sidebar's scroll container** (`.sidebar { overflow: hidden }`, `.panel-props { overflow-y: auto }`). Expected: fully visible for a part with no cuts at 1366. Live check in Task 5, step 10; the popup is end-aligned for that reason.

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `src/styles.css` | modify throughout | palette, surface roles, every layout rule below |
| `src/palette.test.ts` | create | token contrast floors; no `graphite`/`brass` token left |
| `src/viewport/Viewport.tsx`, `BoardMesh.tsx`, `SnapMarker.tsx` | modify constants / comments | viewport colours |
| `src/panels/Popover.tsx` (+ `.test.tsx`) | create | disclosure menu: trigger, popup of buttons, closing rules |
| `src/panels/ViewportControls.tsx` (+ `.test.tsx`) | create | tools, view toggles, Move hint, over the canvas |
| `src/panels/Toolbar.tsx` (+ test) | modify | project-level header; Claude ▾ |
| `src/App.tsx` | modify | wire ViewportControls; Guides footer |
| `src/panels/ActionBar.tsx` (+ `.test.tsx`) | create | `splitActions`, the action row, trash icon, Copy in a row's open state |
| `src/panels/CopyInRow.tsx` (+ test) | modify | `open`/`onOpenChange` props; no opener button of its own |
| `src/panels/Properties.tsx` (+ test) | modify | ActionBar, kind chip, grids, labels, cut cards |
| `src/panels/GuidesFooter.tsx` (+ `.test.tsx`) | create | the collapsible, self-opening Guides footer |
| `src/panels/CutList.tsx`, `GenerateDialog.tsx` | modify (classes only) | consistent controls |
| `docs/browser-verification-ui-polish.md`, `docs/img/ui-polish-*.png`, `docs/history.md`, `docs/follow-ups.md`, `CLAUDE.md` | create / modify | the record |

---

### Task 0: Branch and baseline

**Files:** none

- [ ] **Step 1: Branch**

```bash
cd /home/alec/docker/sloyd && git checkout -b ui-polish
```

- [ ] **Step 2: Baseline**

Run: `npm test 2>&1 | tail -5 && npm run build 2>&1 | tail -3`
Expected: 2881 tests passing across 94 files; build succeeds. Note the exact counts — later tasks report deltas against them.

- [ ] **Step 3: Baseline print screenshot (for Task 8's comparison)**

Start the dev server (`npm run dev -- --port 5180 --host 127.0.0.1`, background). In Playwright at 1920×1080: open `http://127.0.0.1:5180/`, add three boards via the "+ Add board" button, add a cut to one (select it → "Add cut"), open "Cut list", tick "Sheet layouts", choose Diagrams "All parts", then `emulateMedia({ media: 'print' })` and take a full-page screenshot to `docs/img/ui-polish-print-before.png`. Reset media to screen. Clear `localStorage` (`localStorage.clear()`) and confirm `localStorage.length === 0`.

---

### Task 1: Palette — tokens, surface roles, viewport colours

**Files:**
- Modify: `src/styles.css` (`:root` block lines 15–48, header comment lines 1–13, and every `--graphite-*` / `--brass*` / hard-coded chrome colour)
- Create: `src/palette.test.ts`
- Modify: `src/viewport/Viewport.tsx:23,222,225,325`, `src/viewport/BoardMesh.tsx:15`, `src/viewport/SnapMarker.tsx:10-18` (comment only)

**Interfaces:**
- Produces (CSS custom properties every later task uses): raw `--grey-*`, `--walnut-*`, `--accent`, `--accent-bright`, `--accent-dim`, `--on-accent`; roles `--sunk`, `--surface`, `--raised`, `--raised-2`, `--control`, `--control-hover`, `--rule`, `--rule-soft`, `--rule-strong`, `--ink`, `--ink-dim`, `--ink-faint`. Grey context selector: `.toolbar, .viewport-controls, .viewport-hint, .tape-readout`.

- [ ] **Step 1: Write the failing test**

Create `src/palette.test.ts`:

```ts
import css from './styles.css?raw';

/** The hex value of a raw palette token declared in styles.css. */
function token(name: string): string {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\b`));
  if (!m) throw new Error(`--${name} is not declared as a 6-digit hex`);
  return m[1]!;
}

/** WCAG 2.x relative luminance. */
function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('palette (ui-polish spec §2)', () => {
  // Guards the two below against a stylesheet that loaded as '' (they would pass vacuously).
  it('reads the stylesheet', () => expect(css).toContain(':root {'));

  // Body text and labels on each surface they sit on: WCAG AA, 4.5:1.
  it.each([
    ['walnut-ink', 'walnut-900'],
    ['walnut-ink-dim', 'walnut-900'],
    ['walnut-ink-dim', 'walnut-800'],
    ['walnut-ink-faint', 'walnut-900'],
    ['grey-ink', 'grey-850'],
    ['grey-ink-dim', 'grey-850'],
    ['grey-ink-dim', 'grey-700'],
    ['accent', 'walnut-900'],
    ['accent-bright', 'grey-900'],
    ['on-accent', 'accent'],
    ['alert', 'walnut-900'],
    ['alert', 'walnut-800'],
  ])('%s on %s is at least 4.5:1', (fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it('retires the graphite and brass tokens entirely', () => {
    expect(css).not.toMatch(/--graphite-/);
    expect(css).not.toMatch(/--brass/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/palette.test.ts`
Expected: FAIL — `--walnut-ink is not declared as a 6-digit hex` (and the retire test fails on `--graphite-`). The `reads the stylesheet` case must PASS here; if it fails, `?raw` is not loading CSS under Vitest — replace the import with `import { readFileSync } from 'node:fs'; const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');` and continue.

- [ ] **Step 3: Replace the header comment and `:root`**

Replace `styles.css` lines 1–48 (the header comment and the whole `:root { … }` block) with:

```css
/*
 * Sloyd — a grey-steel bench top with walnut drawers.
 *
 * Two materials, two jobs. Grey is the chrome you reach for: the toolbar and
 * the controls floating over the view. Walnut is where the work is described:
 * the side panel, the dialogs, the cut list. Honey oak is the one live colour —
 * the selection, the active tool, the primary action. The viewport is pale
 * maple, the bright surface everything frames. Every number is set in a
 * monospace face with tabular figures so fractional inches stack in a column
 * the way they do on a cut list.
 *
 * Signature: the tick rule under the toolbar, minor ticks every 8px and an oak
 * major every 96px, like the edge of a machinist's scale.
 *
 * Rules never name a raw token for a surface, a control, a rule or ink: they
 * read the ROLES below (--surface, --control, --ink…). Walnut is the default;
 * the grey context selector re-points the roles, so one button rule serves both.
 */

:root {
  /* Grey — the toolbar and anything floating over the view. */
  --grey-900: #22211f;
  --grey-850: #2a2927;
  --grey-800: #32302e;
  --grey-700: #3a3836;
  --grey-600: #464441;
  --grey-rule: #4b4946;
  --grey-rule-soft: #383634;
  --grey-rule-strong: #5c5a56;
  --grey-ink: #ece9e4;
  --grey-ink-dim: #c8c3bb;
  --grey-ink-faint: #a19c94;

  /* Walnut — panels, dialogs, the cut list sheet. */
  --walnut-950: #1f1914;
  --walnut-900: #2b241e;
  --walnut-850: #322920;
  --walnut-800: #3a3027;
  --walnut-700: #4a3d31;
  --walnut-600: #5a4a3b;
  --walnut-rule: #463b31;
  --walnut-rule-soft: #382f27;
  --walnut-rule-strong: #5e4e3f;
  --walnut-ink: #ece4d6;
  --walnut-ink-dim: #b9ad9c;
  --walnut-ink-faint: #a09482;

  /* Honey oak — the one live colour. */
  --accent: #c8955a;
  --accent-bright: #e3b47c;
  --accent-dim: #7d5a33;
  --on-accent: #23190f;

  /* Alerts and warnings (values re-checked against walnut). */
  --alert: #e8806a;
  --alert-bg: #2c1c19;
  --alert-bg-strong: #4a2b26;
  --alert-border: #6d3d34;
  --alert-bright: #f3c4b8;

  --warn-bg: #382d17;
  --warn-border: #5a481f;
  --warn-ink: #efd9a5;

  /* ROLES — walnut by default. */
  --sunk: var(--walnut-950);
  --surface: var(--walnut-900);
  --raised: var(--walnut-850);
  --raised-2: var(--walnut-800);
  --control: var(--walnut-800);
  --control-hover: var(--walnut-700);
  --rule: var(--walnut-rule);
  --rule-soft: var(--walnut-rule-soft);
  --rule-strong: var(--walnut-rule-strong);
  --ink: var(--walnut-ink);
  --ink-dim: var(--walnut-ink-dim);
  --ink-faint: var(--walnut-ink-faint);

  --font-ui: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --font-num: ui-monospace, 'SF Mono', 'JetBrains Mono', 'Roboto Mono', Menlo,
    Consolas, monospace;

  --radius: 3px;
  color-scheme: dark;
}

/* The grey context: chrome you reach for. Re-points the roles; rules do not change. */
.toolbar,
.viewport-controls,
.viewport-hint,
.tape-readout {
  --sunk: var(--grey-900);
  --surface: var(--grey-850);
  --raised: var(--grey-800);
  --raised-2: var(--grey-700);
  --control: var(--grey-700);
  --control-hover: var(--grey-600);
  --rule: var(--grey-rule);
  --rule-soft: var(--grey-rule-soft);
  --rule-strong: var(--grey-rule-strong);
  --ink: var(--grey-ink);
  --ink-dim: var(--grey-ink-dim);
  --ink-faint: var(--grey-ink-faint);
}
```

- [ ] **Step 4: Rename every old token reference (mechanical)**

Run (order matters — longest names first):

```bash
cd /home/alec/docker/sloyd && sed -i \
  -e 's/--graphite-950/--sunk/g' -e 's/--graphite-900/--surface/g' \
  -e 's/--graphite-850/--raised/g' -e 's/--graphite-800/--raised-2/g' \
  -e 's/--graphite-700/--control/g' -e 's/--graphite-600/--control-hover/g' \
  -e 's/--brass-bright/--accent-bright/g' -e 's/--brass-dim/--accent-dim/g' \
  -e 's/--brass/--accent/g' \
  -e 's/border-color: #545b63;/border-color: var(--rule-strong);/' \
  -e 's/color: #1a1408;/color: var(--on-accent);/' \
  -e 's/rgba(12, 14, 16, 0.72)/rgba(20, 15, 11, 0.72)/g' \
  src/styles.css
grep -rn "graphite\|brass" src --include=*.css --include=*.ts --include=*.tsx | grep -v "\.test\." 
```

Expected: the grep prints only comment lines (styles.css prose such as "brass on graphite", `SnapMarker.tsx`'s comment). Edit each remaining comment to say "oak"/"accent" and "walnut"/"grey" as it applies — words only, no rule changes. Then `.input.invalid { background: #2c1c19; }` → `background: var(--alert-bg);`.

- [ ] **Step 5: Run the palette test**

Run: `npx vitest run src/palette.test.ts`
Expected: PASS. If a contrast pair fails, adjust that raw token's VALUE (spec §2 allows nudging values; roles do not change) — lighten the ink or darken the surface — and record the final values in Task 9's verification doc. Do not lower the 4.5 floor.

- [ ] **Step 6: Viewport constants**

- `src/viewport/Viewport.tsx:23`: `const GROUND = '#ebe3d4';`
- `src/viewport/Viewport.tsx:222`: `cellColor="#d3c7b3"`; line 225: `sectionColor="#9c8f7b"`
- `src/viewport/Viewport.tsx:325`: `groundColor="#bfb29e"`
- `src/viewport/BoardMesh.tsx:15`: `const SELECTED = '#c8955a';`
- `src/viewport/SnapMarker.tsx:10-18`: update the comment's quoted values to `ground #ebe3d4, grid #d3c7b3/#9c8f7b, oak #c8955a` and "brass" → "oak". **Do not change** `corner`, `edge-mid`, `face-center`, `guide` or `RING_COLOR` values (spec §2.1).

- [ ] **Step 7: Full suite and build**

Run: `npm test 2>&1 | tail -5 && npm run build 2>&1 | tail -3`
Expected: baseline + 14 tests (the palette file), all passing; build succeeds.

- [ ] **Step 8: Mutate**

Temporarily set `--walnut-ink-dim: #6a6052;` → run `npx vitest run src/palette.test.ts` → expect the two `walnut-ink-dim` cases RED. Revert. Temporarily add a line `/* --brass */` to styles.css → retire test RED. Revert.

- [ ] **Step 9: Commit**

```bash
git add src/styles.css src/palette.test.ts src/viewport/Viewport.tsx src/viewport/BoardMesh.tsx src/viewport/SnapMarker.tsx
git commit -m "style(ui-polish): grey and walnut palette with surface roles; oak accent; maple viewport

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `Popover` — the shared disclosure menu

**Files:**
- Create: `src/panels/Popover.tsx`
- Create: `src/panels/Popover.test.tsx`
- Modify: `src/styles.css` (append a `/* --- popover */` section after the project-menu section)

**Interfaces:**
- Produces:
  ```ts
  export interface PopoverItem { label: string; detail?: string; run: () => void }
  export function Popover(props: {
    label: ReactNode;            // trigger content; put any caret in <span aria-hidden="true">
    items: PopoverItem[];
    title?: string;              // trigger tooltip
    align?: 'start' | 'end';     // popup edge aligned with the trigger; default 'start'
    className?: string;          // on the root
  }): JSX.Element
  ```
  Each item is a `<button aria-label={label}>` (so its accessible name is exactly `label`, the `detail` line notwithstanding). The trigger carries `aria-expanded`.

- [ ] **Step 1: Write the failing tests**

Create `src/panels/Popover.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Popover } from './Popover';

function setup(run = vi.fn()) {
  render(
    <div>
      <Popover label={<>Claude<span aria-hidden="true"> ▾</span></>}
        items={[{ label: 'Generate…', detail: 'A new prototype', run }, { label: 'Refine…', run: vi.fn() }]} />
      <button>outside</button>
    </div>,
  );
  return { trigger: screen.getByRole('button', { name: 'Claude' }), run };
}

describe('Popover', () => {
  it('is closed until its trigger is clicked, and says so with aria-expanded', async () => {
    const { trigger } = setup();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Generate…' })).toBeNull();
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Generate…' })).toBeInTheDocument();
    expect(screen.getByText('A new prototype')).toBeInTheDocument();
  });

  it('runs an item, closes, and has focus on the trigger by the time the item runs', async () => {
    let focusedDuringRun: Element | null = null;
    const { trigger } = setup(vi.fn(() => { focusedDuringRun = document.activeElement; }));
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('button', { name: 'Generate…' }));
    expect(focusedDuringRun).toBe(trigger);
    expect(screen.queryByRole('button', { name: 'Generate…' })).toBeNull();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes on Escape, returns focus to the trigger, and keeps the key from reaching window', async () => {
    const { trigger } = setup();
    const onWindowKey = vi.fn();
    window.addEventListener('keydown', onWindowKey);
    await userEvent.click(trigger);
    screen.getByRole('button', { name: 'Refine…' }).focus();
    await userEvent.keyboard('{Escape}');
    window.removeEventListener('keydown', onWindowKey);
    expect(screen.queryByRole('button', { name: 'Refine…' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(onWindowKey).not.toHaveBeenCalled();
  });

  it('closes on a pointerdown outside it, not on one inside it', async () => {
    const { trigger } = setup();
    await userEvent.click(trigger);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Refine…' }));
    expect(screen.getByRole('button', { name: 'Refine…' })).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'outside' }));
    expect(screen.queryByRole('button', { name: 'Refine…' })).toBeNull();
  });

  it('closes when focus leaves it (Tab past the last item)', async () => {
    const { trigger } = setup();
    await userEvent.click(trigger);
    screen.getByRole('button', { name: 'Refine…' }).focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'outside' }));
    expect(screen.queryByRole('button', { name: 'Refine…' })).toBeNull();
  });

  it('adds no window pointerdown listener while closed', () => {
    const add = vi.spyOn(window, 'addEventListener');
    setup();
    expect(add.mock.calls.filter(([t]) => t === 'pointerdown')).toHaveLength(0);
    add.mockRestore();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/panels/Popover.test.tsx`
Expected: FAIL — `Failed to resolve import "./Popover"`.

- [ ] **Step 3: Implement**

Create `src/panels/Popover.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FocusEvent, ReactNode } from 'react';

export interface PopoverItem {
  label: string;
  /** A second, quieter line under the label. Not part of the accessible name. */
  detail?: string;
  run: () => void;
}

interface Props {
  label: ReactNode;
  items: PopoverItem[];
  title?: string;
  align?: 'start' | 'end';
  className?: string;
}

/**
 * A disclosure menu: a trigger and a popup of plain buttons (ui-polish spec §3.1).
 * Deliberately not an ARIA menu, like ProjectMenu, and closed by the same rules:
 * Escape on its own subtree (never a window keydown listener — invariant 27),
 * an outside pointerdown on window only while open, focus leaving it, or an item
 * being chosen. ProjectMenu keeps its own copy of these rules on purpose (its
 * arm/disarm focus handling is its own; CLAUDE.md "ProjectMenu.tsx").
 *
 * Choosing an item focuses the trigger BEFORE running it: an item that opens a
 * dialog has App record `document.activeElement` as the place to return focus,
 * and the item itself is about to unmount.
 */
export function Popover({ label, items, title, align = 'start', className }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        trigger.current?.focus();
        setOpen(false);
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const el = root.current;
    el?.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      el?.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  const onFocusOut = useCallback((e: FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    if (!next || !root.current?.contains(next)) setOpen(false);
  }, []);

  return (
    <div className={className ? `popover ${className}` : 'popover'} ref={root} onBlur={onFocusOut}>
      <button ref={trigger} className="popover-trigger" aria-expanded={open} title={title}
        onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      {open && (
        <div className={`popover-popup popover-${align}`}>
          {items.map((it) => (
            <button key={it.label} className="popover-item" aria-label={it.label}
              onClick={() => { trigger.current?.focus(); setOpen(false); it.run(); }}>
              <span className="popover-item-label">{it.label}</span>
              {it.detail && <span className="popover-item-detail">{it.detail}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Styles**

Append to `src/styles.css` after the project-menu section (before `/* ---- workspace */`):

```css
/* ---------------------------------------------------------------- popover */

.popover { position: relative; display: inline-flex; }

.popover-trigger { white-space: nowrap; }

.popover-popup {
  position: absolute;
  top: calc(100% + 4px);
  z-index: 6;
  min-width: 13rem;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 4px;
  background: var(--raised);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  box-shadow: 0 6px 18px rgb(0 0 0 / 0.35);
}

.popover-start { left: 0; }
.popover-end { right: 0; }

.popover-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  text-align: left;
  background: none;
  border: none;
  padding: 6px 8px;
  white-space: nowrap;
}

.popover-item:hover:not(:disabled) { background: var(--control); border-color: transparent; }

.popover-item-detail { font-size: 11px; font-weight: 400; color: var(--ink-faint); }
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/panels/Popover.test.tsx`
Expected: PASS (6).

- [ ] **Step 6: Mutate**

One at a time, each run must turn its test RED, then revert: (a) delete `e.stopPropagation();` → the Escape test fails on `onWindowKey`; (b) move `trigger.current?.focus();` in the item onClick to after `it.run();` → the "focus on the trigger by the time the item runs" test fails; (c) delete the `if (!open) return;` guard → the "no window pointerdown listener while closed" test fails.

- [ ] **Step 7: Commit**

```bash
git add src/panels/Popover.tsx src/panels/Popover.test.tsx src/styles.css
git commit -m "feat(ui-polish): Popover — a disclosure menu with ProjectMenu's closing rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `ViewportControls` — tools and view over the canvas

**Files:**
- Create: `src/panels/ViewportControls.tsx`, `src/panels/ViewportControls.test.tsx`
- Modify: `src/panels/Toolbar.tsx` (remove tools, view toggles, Move hint and their props), `src/panels/Toolbar.test.tsx` (remove the tests that move), `src/App.tsx:840-847,903-917` (wire), `src/styles.css` (toolbar-hint/checkbox rules → overlay rules)

**Interfaces:**
- Produces:
  ```ts
  export function ViewportControls(props: {
    orthographic: boolean; onToggleProjection: () => void;
    showGrid: boolean; onToggleGrid: () => void;
    showAxes: boolean; onToggleAxes: () => void;
    showGuides: boolean; onToggleGuides: () => void;
  }): JSX.Element
  ```
  (the same prop names and doc comments Toolbar had; move the comments with them).
- Toolbar's `Props` loses `orthographic`, `onToggleProjection`, `showGrid`, `onToggleGrid`, `showAxes`, `onToggleAxes`, `showGuides`, `onToggleGuides`.

- [ ] **Step 1: Write the failing tests**

Create `src/panels/ViewportControls.test.tsx`. Port each Toolbar test that is about these controls, asserting `aria-pressed` where it asserted `checked`:

```tsx
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { createDocument } from '../document/document';
import { ViewportControls } from './ViewportControls';

beforeEach(() => useStore.getState().replaceDocument(createDocument('Test')));

const noop = () => {};
function renderControls(overrides: Partial<Parameters<typeof ViewportControls>[0]> = {}) {
  return render(
    <ViewportControls orthographic={false} onToggleProjection={noop} showGrid onToggleGrid={noop}
      showAxes onToggleAxes={noop} showGuides onToggleGuides={noop} {...overrides} />,
  );
}
const btn = (name: string) => screen.getByRole('button', { name });

describe('ViewportControls tools', () => {
  afterEach(() => { act(() => useStore.getState().setTool('select')); });

  it('presses the active tool and switches tool on click', async () => {
    renderControls();
    expect(btn('Select')).toHaveAttribute('aria-pressed', 'true');
    expect(btn('Tape')).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(btn('Tape'));
    expect(useStore.getState().tool).toBe('tape');
    expect(btn('Tape')).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(btn('Move'));
    expect(useStore.getState().tool).toBe('move');
  });

  it('shows "Select a part to move" in the Move tool exactly while nothing is selected', () => {
    renderControls();
    act(() => useStore.getState().setTool('move'));
    expect(screen.getByText('Select a part to move')).toBeInTheDocument();
    act(() => useStore.getState().addBoard());
    expect(screen.queryByText('Select a part to move')).not.toBeInTheDocument();
    act(() => {
      useStore.getState().addBoard();
      useStore.getState().selectAll();
    });
    expect(screen.queryByText('Select a part to move')).not.toBeInTheDocument();
    act(() => useStore.getState().selectBoard(null));
    expect(screen.getByText('Select a part to move')).toBeInTheDocument();
  });
});

describe('ViewportControls projection', () => {
  it('presses Perspective or Orthographic to match, and only the other one toggles', async () => {
    const onToggleProjection = vi.fn();
    renderControls({ orthographic: false, onToggleProjection });
    expect(btn('Perspective')).toHaveAttribute('aria-pressed', 'true');
    expect(btn('Orthographic')).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(btn('Perspective'));
    expect(onToggleProjection).not.toHaveBeenCalled();
    await userEvent.click(btn('Orthographic'));
    expect(onToggleProjection).toHaveBeenCalledTimes(1);
  });

  it('when orthographic, Orthographic is pressed and Perspective toggles', async () => {
    const onToggleProjection = vi.fn();
    renderControls({ orthographic: true, onToggleProjection });
    expect(btn('Orthographic')).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(btn('Orthographic'));
    expect(onToggleProjection).not.toHaveBeenCalled();
    await userEvent.click(btn('Perspective'));
    expect(onToggleProjection).toHaveBeenCalledTimes(1);
  });
});

describe('ViewportControls view toggles', () => {
  it.each([
    ['Grid', 'showGrid', 'onToggleGrid'],
    ['Origin', 'showAxes', 'onToggleAxes'],
    ['Guides', 'showGuides', 'onToggleGuides'],
  ] as const)('%s reflects its state with aria-pressed and asks its parent to toggle', async (name, flag, cb) => {
    const { unmount } = renderControls({ [flag]: false });
    expect(btn(name)).toHaveAttribute('aria-pressed', 'false');
    unmount();
    const spy = vi.fn();
    renderControls({ [flag]: true, [cb]: spy });
    expect(btn(name)).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(btn(name));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('drives the grid and the origin axes independently (follow-up 30)', async () => {
    const onToggleGrid = vi.fn();
    const onToggleAxes = vi.fn();
    renderControls({ showGrid: true, showAxes: false, onToggleGrid, onToggleAxes });
    await userEvent.click(btn('Origin'));
    expect(onToggleAxes).toHaveBeenCalledTimes(1);
    expect(onToggleGrid).not.toHaveBeenCalled();
  });

  it('keeps the toggles out of the document and off the undo stack', async () => {
    renderControls();
    const docBefore = useStore.getState().doc;
    const undoDepthBefore = useStore.getState().past.length;
    await userEvent.click(btn('Grid'));
    await userEvent.click(btn('Origin'));
    await userEvent.click(btn('Guides'));
    expect(useStore.getState().doc).toBe(docBefore);
    expect(useStore.getState().past.length).toBe(undoDepthBefore);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/panels/ViewportControls.test.tsx`
Expected: FAIL — cannot resolve `./ViewportControls`.

- [ ] **Step 3: Implement `ViewportControls`**

Create `src/panels/ViewportControls.tsx`. Move the eight props' doc comments verbatim from `Toolbar.tsx` `Props` (lines 21–40) into this file's `Props`, and move the Move-hint comment (Toolbar.tsx lines 158–163) onto the hint:

```tsx
import { useStore } from '../store/store';

interface Props {
  /** True when the viewport is drawing through an orthographic camera. */
  orthographic: boolean;
  onToggleProjection: () => void;
  /* …showGrid / onToggleGrid / showAxes / onToggleAxes / showGuides / onToggleGuides,
     with their doc comments moved verbatim from Toolbar.tsx… */
  showGrid: boolean;
  onToggleGrid: () => void;
  showAxes: boolean;
  onToggleAxes: () => void;
  showGuides: boolean;
  onToggleGuides: () => void;
}

/**
 * The controls that act on the VIEW, floating over it (ui-polish spec §3.2):
 * tools top-left, projection and visibility top-right, the Move hint
 * bottom-left. Rendered inside `.viewport-stack`, so `.app-shell`'s `inert`
 * covers them, and as siblings of the canvas, so a click on one never reaches
 * R3F (no deselect, no Move/Tape click). `role="group"`, not "toolbar": a toolbar
 * promises arrow-key roving focus, which these do not implement.
 */
export function ViewportControls({
  orthographic, onToggleProjection, showGrid, onToggleGrid,
  showAxes, onToggleAxes, showGuides, onToggleGuides,
}: Props) {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const hasSelection = useStore((s) => s.selectedIds.length > 0);

  return (
    <>
      <div className="viewport-controls viewport-controls-tools" role="group" aria-label="Tools">
        <div className="segmented">
          <button onClick={() => setTool('select')} aria-pressed={tool === 'select'}
            title="Select tool — click a part to select it, drag its gizmo to move it (Esc)">Select</button>
          <button onClick={() => setTool('move')} aria-pressed={tool === 'move'}
            title="Move tool — click a corner or midpoint, then click one on another part to snap them together (M)">Move</button>
          <button onClick={() => setTool('tape')} aria-pressed={tool === 'tape'}
            title="Tape measure — click a point, then click another to measure and place a guide point; type a distance to place it partway (T)">Tape</button>
        </div>
      </div>

      <div className="viewport-controls viewport-controls-view" role="group" aria-label="View">
        <div className="segmented">
          <button aria-pressed={!orthographic} onClick={() => { if (orthographic) onToggleProjection(); }}
            title="Perspective view">Perspective</button>
          <button aria-pressed={orthographic} onClick={() => { if (!orthographic) onToggleProjection(); }}
            title="Orthographic view — parallel projection, for checking alignment">Orthographic</button>
        </div>
        <div className="segmented">
          <button aria-pressed={showGrid} onClick={onToggleGrid} title="Show the ground grid">Grid</button>
          <button aria-pressed={showAxes} onClick={onToggleAxes} title="Show the origin axes">Origin</button>
          <button aria-pressed={showGuides} onClick={onToggleGuides} title="Show tape-measure guide points">Guides</button>
        </div>
      </div>

      {tool === 'move' && !hasSelection && (
        // (moved comment from Toolbar.tsx: why the hint exists and why Move stays enabled)
        <p className="viewport-hint">Select a part to move</p>
      )}
    </>
  );
}
```

Write out the six omitted prop doc comments verbatim (copy from Toolbar.tsx) — the `/* … */` above marks where, it is not to be left in the file.

- [ ] **Step 4: Remove them from Toolbar**

In `src/panels/Toolbar.tsx`: delete the eight props from `Props` and from the destructuring; delete `tool`, `setTool`, `hasSelection` selectors; delete JSX lines 141–191 (the divider before Select through the Guides label) — keep the `toolbar-divider` + Undo/Redo before them. In `src/panels/Toolbar.test.tsx`: delete from `renderToolbar` the props `orthographic`, `onToggleProjection`, `showGrid`, `onToggleGrid`, `showAxes`, `onToggleAxes`, `showGuides`, `onToggleGuides`; delete the describe blocks `Toolbar view toggles` EXCEPT its last test `opens the cut list` (move that test into a new `describe('Toolbar', …)`), `Guides checkbox`, `Tape button`, `the Move tool hint`. Remove the now-unused `act` import if unused.

- [ ] **Step 5: Wire it in App**

In `src/App.tsx`: remove the eight props from `<Toolbar …>` (lines ~841–848). Inside `.viewport-stack`, between `<Viewport … />` and the TapeReadout comment, add:

```tsx
            <ViewportControls
              orthographic={orthographic}
              onToggleProjection={() => setOrthographic((v) => !v)}
              showGrid={showGrid}
              onToggleGrid={() => setShowGrid((v) => !v)}
              showAxes={showAxes}
              onToggleAxes={() => setShowAxes((v) => !v)}
              showGuides={showGuides}
              onToggleGuides={() => setShowGuides((v) => !v)}
            />
```

and `import { ViewportControls } from './panels/ViewportControls';`. `<TapeReadout />` stays exactly where it is, unconditional (invariant 28).

- [ ] **Step 6: Styles**

In `src/styles.css`: delete `.toolbar-hint`, `.checkbox.toolbar-checkbox` / `.toolbar-checkbox` rules (search `toolbar-hint`, `toolbar-checkbox`). Add after `.viewport-stack { … }`:

```css
/* Floating chrome over the canvas (ui-polish spec §3.2). Grey context (see :root). */
.viewport-controls {
  position: absolute;
  top: 12px;
  z-index: 2;
  display: flex;
  gap: 6px;
  padding: 4px;
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  border: 1px solid var(--rule);
  border-radius: 5px;
  box-shadow: 0 3px 10px rgb(0 0 0 / 0.2);
}

.viewport-controls-tools { left: 12px; }
.viewport-controls-view { right: 12px; }

.segmented { display: inline-flex; }
.segmented > button { border-radius: 0; margin-left: -1px; white-space: nowrap; }
.segmented > button:first-child { border-radius: var(--radius) 0 0 var(--radius); margin-left: 0; }
.segmented > button:last-child { border-radius: 0 var(--radius) var(--radius) 0; }
.segmented > button[aria-pressed='true'] { position: relative; z-index: 1; box-shadow: inset 0 -2px 0 var(--accent); }

.viewport-hint {
  position: absolute;
  left: 12px;
  bottom: 12px;
  z-index: 2;
  margin: 0;
  padding: 5px 10px;
  font-size: 12px;
  color: var(--ink-dim);
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  border: 1px solid var(--rule);
  border-radius: 5px;
  white-space: nowrap;
}
```

Also change the `.tape-readout` rule's background/border to `var(--surface)` / `var(--rule)` if they name other tokens (it is in the grey context now).

- [ ] **Step 7: Run tests and build**

Run: `npx vitest run src/panels/ViewportControls.test.tsx src/panels/Toolbar.test.tsx src/App.test.tsx && npm run build 2>&1 | tail -3`
Expected: PASS; build succeeds (a missed Toolbar prop is a compile error — fix it, do not cast).

- [ ] **Step 8: Mutate**

(a) Change Perspective's handler to call `onToggleProjection()` unconditionally → the "only the other one toggles" tests RED. (b) Change the hint condition to `tool === 'move'` → hint test RED. Revert both.

- [ ] **Step 9: Live check (Review Focus 4)**

Dev server, Playwright, 1920×1080: add a board, select it (click it in the parts list). Click the `Grid` chip, then `Orthographic`, then `Perspective`. After each, evaluate `useStore`-free DOM check: the parts-list row for the board still has `aria-pressed="true"` (the part stays selected). Switch to Tape, click the `Grid` chip: no tape anchor appears (no tape readout box visible). Screenshot `docs/img/ui-polish-overlays.png`. Clear localStorage and confirm empty.

- [ ] **Step 10: Commit**

```bash
git add src/panels/ViewportControls.tsx src/panels/ViewportControls.test.tsx src/panels/Toolbar.tsx src/panels/Toolbar.test.tsx src/App.tsx src/styles.css docs/img/ui-polish-overlays.png
git commit -m "feat(ui-polish): tools and view toggles float over the viewport; Move hint bottom-left

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The header — Claude ▾ and a grey toolbar

**Files:**
- Modify: `src/panels/Toolbar.tsx`, `src/panels/Toolbar.test.tsx`, `src/styles.css` (toolbar section, lines ~80–143)

**Interfaces:**
- Consumes: `Popover`, `PopoverItem` from Task 2.
- Produces: no new exports. Toolbar props unchanged from Task 3's.

- [ ] **Step 1: Rewrite the Generate/Refine tests (failing)**

In `src/panels/Toolbar.test.tsx`, replace the `Toolbar Refine button` and `Toolbar Generate button` describe blocks with:

```tsx
const claude = (name = 'Claude') => screen.getByRole('button', { name });

describe('Toolbar Claude menu', () => {
  it.each([
    ['Generate…', 'onOpenGenerate'],
    ['Refine…', 'onOpenRefine'],
    ['Add joinery…', 'onOpenJoinery'],
  ] as const)('%s asks its parent to open its dialog', async (item, cb) => {
    const spy = vi.fn();
    renderToolbar({ [cb]: spy });
    await userEvent.click(claude());
    await userEvent.click(screen.getByRole('button', { name: item }));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('reads Claude when nothing is running', () => {
    renderToolbar();
    expect(claude()).toBeInTheDocument();
  });

  it('counts finished runs on the trigger while a batch is live — done = total − live', () => {
    renderToolbar({ generating: { live: 1, total: 3 } });
    expect(claude('Claude · Generating 2/3…')).toBeInTheDocument();
  });

  it('still opens Generate while a batch is live', async () => {
    const onOpenGenerate = vi.fn();
    renderToolbar({ generating: { live: 2, total: 2 }, onOpenGenerate });
    await userEvent.click(claude('Claude · Generating 0/2…'));
    await userEvent.click(screen.getByRole('button', { name: 'Generate…' }));
    expect(onOpenGenerate).toHaveBeenCalledTimes(1);
  });

  it('opens Settings from the gear', async () => {
    const onOpenSettings = vi.fn();
    renderToolbar({ onOpenSettings });
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/panels/Toolbar.test.tsx`
Expected: FAIL — no button named `Claude`.

- [ ] **Step 3: Implement**

In `src/panels/Toolbar.tsx` add `import { Popover } from './Popover';`, update the `generating` prop's doc comment to say the label now rides on the Claude trigger, and make the returned JSX:

```tsx
  const done = generating ? generating.total - generating.live : 0;
  return (
    <header className="toolbar">
      {/* Left: the document and the things that change it. */}
      <div className="toolbar-group">
        <span className="brand">Sloyd</span>
        {/* …the doc-name <input> and the libraryAvailable && <ProjectMenu …/> exactly as today… */}
        <span className="toolbar-divider" />
        <button className="btn-primary" onClick={addBoard}>+ Add board</button>
        <button onClick={onOpenCutList} title="Cut list — parts, quantities and joinery">Cut list</button>
        <Popover
          className="claude-menu"
          title="Generate, refine or add joinery with Claude"
          label={<>{generating ? `Claude · Generating ${done}/${generating.total}…` : 'Claude'}<span aria-hidden="true"> ▾</span></>}
          items={[
            { label: 'Generate…', detail: 'A new prototype from a description', run: onOpenGenerate },
            { label: 'Refine…', detail: 'Change this design by instruction', run: onOpenRefine },
            { label: 'Add joinery…', detail: 'Choose joints; saved as a new project', run: onOpenJoinery },
          ]}
        />
        <span className="toolbar-divider" />
        <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">↶</button>
        <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">↷</button>
      </div>

      {/* Right: settings, then the document's state on disk. */}
      <div className="toolbar-group toolbar-right">
        <button onClick={onOpenSettings} aria-label="Settings" title="Settings">⚙</button>
        {children}
      </div>
    </header>
  );
```

(The doc-name input and ProjectMenu JSX are unchanged — keep them verbatim.)

- [ ] **Step 4: Header styles**

In `src/styles.css` toolbar section: `.toolbar { background: var(--surface); }` (already via rename; confirm), add `flex-wrap: nowrap; min-width: 0;` to `.toolbar`, and add:

```css
.toolbar button { white-space: nowrap; }
.toolbar .btn-primary { color: var(--on-accent); }
.doc-name { width: 180px; }
```

Remove the `.doc-name { width: 200px; … }` width (the rule above replaces it; keep `flex: none; font-weight: 500;`).

- [ ] **Step 5: Run tests and build**

Run: `npx vitest run src/panels/Toolbar.test.tsx src/App.test.tsx && npm run build 2>&1 | tail -3`
Expected: PASS; build succeeds.

- [ ] **Step 6: Mutate**

Swap `run: onOpenRefine` and `run: onOpenJoinery` → two `it.each` cases RED. Change `done` to `generating.live` → the count test RED. Revert.

- [ ] **Step 7: Live check — header fits**

Dev server, Playwright. At 1366×768 and at 1920×1080, evaluate:

```js
() => { const h = document.querySelector('.toolbar');
  const r = [...h.querySelectorAll('button, input, .save-indicator, .brand')].map(e => e.getBoundingClientRect());
  const overlap = r.some((a, i) => r.some((b, j) => i < j && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5));
  return { fits: h.scrollWidth === h.clientWidth, docFits: document.documentElement.scrollWidth === innerWidth,
           oneLine: [...h.querySelectorAll('button')].every(b => b.getBoundingClientRect().height < 34), overlap }; }
```

Expected at both sizes: `fits: true, docFits: true, oneLine: true, overlap: false`. Open the Claude menu and screenshot `docs/img/ui-polish-header-1920.png` and `…-1366.png`. Choose "Settings" → close it with its Close button → `document.activeElement` is the ⚙ button. Open Claude ▾ → "Generate…" → close the dialog → `document.activeElement` is the Claude trigger (Review Focus 1). Clear localStorage; confirm empty.

- [ ] **Step 8: Commit**

```bash
git add src/panels/Toolbar.tsx src/panels/Toolbar.test.tsx src/styles.css docs/img/ui-polish-header-*.png
git commit -m "feat(ui-polish): a project-level header; Generate, Refine and Add joinery under Claude ▾

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `ActionBar` — three actions, More ▾, a trash icon

**Files:**
- Create: `src/panels/ActionBar.tsx`, `src/panels/ActionBar.test.tsx`
- Modify: `src/panels/CopyInRow.tsx` (props), `src/panels/CopyInRow.test.tsx`, `src/panels/Properties.tsx` (three action rows), `src/panels/Properties.test.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: `Popover` (Task 2).
- Produces:
  ```ts
  export interface Action { label: string; run: () => void }
  /** Marks where "Copy in a row…" sits in the order; the bar owns its form's open state. */
  export const COPY_IN_ROW = 'copy-in-row' as const;
  export type ActionEntry = Action | typeof COPY_IN_ROW;
  export function splitActions<T>(actions: T[], visible?: number): { shown: T[]; more: T[] }  // visible defaults to 3
  export function ActionBar(props: { actions: ActionEntry[]; onDelete: () => void }): JSX.Element
  ```
  `CopyInRow` becomes `CopyInRow({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void })` and renders nothing while closed.

- [ ] **Step 1: Write the failing unit tests**

Create `src/panels/ActionBar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { createDocument } from '../document/document';
import { ActionBar, COPY_IN_ROW, splitActions } from './ActionBar';

beforeEach(() => useStore.getState().replaceDocument(createDocument('Test')));

describe('splitActions', () => {
  it('shows the first three in order and puts the rest, in order, under More', () => {
    expect(splitActions([1, 2, 3, 4, 5])).toEqual({ shown: [1, 2, 3], more: [4, 5] });
    expect(splitActions([1, 2])).toEqual({ shown: [1, 2], more: [] });
  });
});

describe('ActionBar', () => {
  const a = (label: string) => ({ label, run: vi.fn() });

  it('renders three buttons, More with the rest, and Delete as an icon button named Delete', async () => {
    const onDelete = vi.fn();
    const acts = [a('One'), a('Two'), a('Three'), a('Four')];
    render(<ActionBar actions={acts} onDelete={onDelete} />);
    for (const n of ['One', 'Two', 'Three']) expect(screen.getByRole('button', { name: n })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Four' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.click(screen.getByRole('button', { name: 'Four' }));
    expect(acts[3]!.run).toHaveBeenCalledTimes(1);
    const del = screen.getByRole('button', { name: 'Delete' });
    expect(del.textContent).toBe('');
    await userEvent.click(del);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('renders no More when there are three actions or fewer', () => {
    render(<ActionBar actions={[a('One'), a('Two')]} onDelete={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
  });

  it('opens its own Copy in a row form from the entry, and Cancel closes it', async () => {
    useStore.getState().addBoard();
    render(<ActionBar actions={[a('One'), a('Two'), a('Three'), COPY_IN_ROW]} onDelete={vi.fn()} />);
    expect(screen.queryByRole('group', { name: 'Copy in a row' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.click(screen.getByRole('button', { name: 'Copy in a row…' }));
    expect(screen.getByRole('group', { name: 'Copy in a row' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('group', { name: 'Copy in a row' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/panels/ActionBar.test.tsx`
Expected: FAIL — cannot resolve `./ActionBar`.

- [ ] **Step 3: Implement `ActionBar` and change `CopyInRow`'s props**

Create `src/panels/ActionBar.tsx`:

```tsx
import { useState } from 'react';
import { CopyInRow } from './CopyInRow';
import { Popover } from './Popover';

export interface Action { label: string; run: () => void }

/** Marks where "Copy in a row…" sits in the order; the bar owns its form's open state. */
export const COPY_IN_ROW = 'copy-in-row' as const;
export type ActionEntry = Action | typeof COPY_IN_ROW;

/** The first `visible` actions as buttons, the rest under More ▾ (ui-polish spec §4.2). */
export function splitActions<T>(actions: T[], visible = 3): { shown: T[]; more: T[] } {
  return { shown: actions.slice(0, visible), more: actions.slice(visible) };
}

/**
 * The selection's actions: three visible, More ▾ for the rest, Delete as a
 * trash icon pinned right. Each Properties panel lists its actions in priority
 * order and the split is positional, so which three show follows from the order
 * (spec §4.2's table) and from the same conditions that showed each action before.
 *
 * Rendered INSIDE each panel's selection-keyed root: Copy in a row's open state
 * lives here so a selection change remounts it closed, exactly as the form
 * behaved when it owned that state itself.
 */
export function ActionBar({ actions, onDelete }: { actions: ActionEntry[]; onDelete: () => void }) {
  const [rowOpen, setRowOpen] = useState(false);
  const resolved: Action[] = actions.map((a) =>
    a === COPY_IN_ROW ? { label: 'Copy in a row…', run: () => setRowOpen(true) } : a);
  const { shown, more } = splitActions(resolved);
  return (
    <>
      <div className="action-bar">
        {shown.map((a) => <button key={a.label} onClick={a.run}>{a.label}</button>)}
        {more.length > 0 && (
          <Popover className="action-more" align="end"
            label={<>More<span aria-hidden="true"> ▾</span></>} items={more} />
        )}
        <button className="action-delete danger" aria-label="Delete" title="Delete" onClick={onDelete}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.8 6.5v5M9.2 6.5v5" />
          </svg>
        </button>
      </div>
      <CopyInRow open={rowOpen} onOpenChange={setRowOpen} />
    </>
  );
}
```

In `src/panels/CopyInRow.tsx`: change the signature to `export function CopyInRow({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void })`; delete `const [open, setOpen] = useState(false);`; replace every `setOpen(false)` with `onOpenChange(false)`; replace the closed branch `if (!open) { return <button className="copy-row-open" …>Copy in a row…</button>; }` with `if (!open) return null;`. Update its doc comment: the opener now lives in `ActionBar` (More ▾), which is rendered inside each panel's selection-keyed root, so a selection change still remounts it closed and reset. Delete the `.copy-row-open` CSS rule.

- [ ] **Step 4: Run the unit tests**

Run: `npx vitest run src/panels/ActionBar.test.tsx`
Expected: PASS (4).

- [ ] **Step 5: Use it in the three Properties panels**

In `src/panels/Properties.tsx` add `import { ActionBar, COPY_IN_ROW } from './ActionBar';` and remove the `CopyInRow` import.

GroupProperties — replace the `<div className="row">…</div>` and `<CopyInRow />` (lines ~394–403) with:

```tsx
      <ActionBar
        actions={[
          ...(plan && !('refused' in plan) ? [{ label: 'Link', run: () => linkBoards(selectedIds) }] : []),
          { label: 'Duplicate', run: () => duplicateBoards(selectedIds) },
          { label: 'Group', run: () => useStore.getState().groupSelected() },
          { label: 'Hide others', run: hideUnselected },
          ...(allParts && boards.some((b) => b.shape) ? [{ label: 'Unlink', run: () => unlinkBoards(selectedIds) }] : []),
          ...(anyAssembly ? [{ label: 'Ungroup', run: () => useStore.getState().ungroupSelected() }] : []),
          COPY_IN_ROW,
        ]}
        onDelete={() => deleteBoards(selectedIds)}
      />
```

Move it to directly under the `<h3>` title line (before `{allParts && <>`), and keep the `plan.refused` / link-note paragraphs directly under the ActionBar (they describe Link).

InstanceProperties — replace its `.row` and `<CopyInRow />` with (placed directly after the NameField, before the assembly note):

```tsx
      <ActionBar
        actions={[
          { label: 'Duplicate', run: () => duplicateBoards([path]) },
          { label: 'Ungroup', run: () => useStore.getState().ungroupSelected() },
          { label: 'Hide others', run: hideUnselected },
          { label: 'Copy mirrored', run: () => useStore.getState().copyMirrored(path) },
          COPY_IN_ROW,
          ...(copies >= 2 && copyHere ? [{ label: 'Select copies', run: () => selectCopies(path) }] : []),
          ...(refs >= 2 ? [{ label: 'Make Unique', run: () => makeUnique(path) }] : []),
          { label: 'Group', run: () => useStore.getState().groupSelected() },
        ]}
        onDelete={() => deleteBoards([path])}
      />
```

Single part — replace the final `.row` and `<CopyInRow />` with (placed directly after the NameField, before the link block):

```tsx
      <ActionBar
        actions={[
          { label: 'Duplicate', run: () => duplicateBoard(board.id) },
          { label: 'Group', run: () => useStore.getState().groupSelected() },
          { label: 'Hide others', run: hideUnselected },
          COPY_IN_ROW,
        ]}
        onDelete={() => deleteBoard(board.id)}
      />
```

- [ ] **Step 6: Re-route the existing tests**

Add near the top of `src/panels/Properties.test.tsx` and `src/panels/CopyInRow.test.tsx`:

```ts
/** Opens the action row's More ▾ (ui-polish spec §4.2). */
const openMore = () => userEvent.click(screen.getByRole('button', { name: 'More' }));
```

Run `npx vitest run src/panels/Properties.test.tsx src/panels/CopyInRow.test.tsx`. For every failure "Unable to find role button name X" where X is now under More, insert `await openMore();` before that lookup — change nothing else in the test. Then, so negative assertions cannot pass vacuously, find every absence assertion on an action that can live under More:

```bash
grep -rn "queryByRole('button', { name: '\(Copy mirrored\|Copy in a row…\|Select copies\|Make Unique\|Unlink\|Ungroup\|Group\|Hide others\)' })" src --include=*.test.tsx
```

and insert `await openMore();` before each (make the test `async` if it is not). Known instance: `offers no Make Unique for a drawer inside a cabinet placed twice` — it becomes `async` and opens More before `queryByRole(... 'Make Unique')`. In CopyInRow.test.tsx, the helper at line ~17–20 opens More before clicking `Copy in a row…`, and the test at ~198 opens More before asserting the button is present.

- [ ] **Step 7: Add the per-selection split tests and the Review Focus 3 test**

Append to `src/panels/Properties.test.tsx`:

```tsx
describe('the action row (ui-polish spec §4.2)', () => {
  const st = () => useStore.getState();
  const shown = () => [...document.querySelectorAll('.action-bar > button:not(.action-delete)')].map((b) => b.textContent);
  const moreItems = async () => {
    await openMore();
    return [...document.querySelectorAll('.popover-item')].map((b) => b.getAttribute('aria-label'));
  };

  it('one part: Duplicate, Group, Hide others; More holds Copy in a row…', async () => {
    st().addBoard();
    st().selectBoard(worldParts(st().doc)[0]!.id);
    render(<Properties />);
    expect(shown()).toEqual(['Duplicate', 'Group', 'Hide others']);
    expect(await moreItems()).toEqual(['Copy in a row…']);
  });

  it('one assembly: Duplicate, Ungroup, Hide others; More holds the rest in order', async () => {
    st().replaceDocument(assemblyDoc());
    act(() => st().selectItem('i1', false));
    render(<Properties />);
    expect(shown()).toEqual(['Duplicate', 'Ungroup', 'Hide others']);
    expect(await moreItems()).toEqual(['Copy mirrored', 'Copy in a row…', 'Group']);
  });

  it('several parts that can link: Link, Duplicate, Group visible', async () => {
    act(() => { st().addBoard(); st().addBoard(); });
    const [a, b] = worldParts(st().doc).map((x) => x.id);
    act(() => { st().selectBoard(a!); st().toggleSelected(b!); });
    render(<Properties />);
    expect(shown()).toEqual(['Link', 'Duplicate', 'Group']);
    expect(await moreItems()).toEqual(['Hide others', 'Copy in a row…']);
  });

  it('several parts that cannot link: Duplicate, Group, Hide others visible', async () => {
    act(() => { st().addBoard(); st().addBoard(); });
    const [a, b] = worldParts(st().doc).map((x) => x.id);
    act(() => { st().linkBoards([a!, b!]); st().selectBoard(a!); st().toggleSelected(b!); });
    render(<Properties />);
    expect(shown()).toEqual(['Duplicate', 'Group', 'Hide others']);
    expect(await moreItems()).toEqual(['Unlink', 'Copy in a row…']);
  });

  it('a selection change closes an open Copy in a row form', async () => {
    act(() => { st().addBoard(); st().addBoard(); });
    const [a, b] = worldParts(st().doc).map((x) => x.id);
    act(() => st().selectBoard(a!));
    render(<Properties />);
    await openMore();
    await userEvent.click(screen.getByRole('button', { name: 'Copy in a row…' }));
    expect(screen.getByRole('group', { name: 'Copy in a row' })).toBeInTheDocument();
    act(() => st().selectBoard(b!));
    expect(screen.queryByRole('group', { name: 'Copy in a row' })).toBeNull();
  });
});
```

The "cannot link" fixture is two parts already linked: the existing test `no "will match" line for identical parts; Link hidden once they are one link; Unlink shown` (Properties.test.tsx ~1204) establishes that such a pair shows no Link and shows Unlink.

- [ ] **Step 8: Styles**

Append to `src/styles.css` (properties section):

```css
/* Measured (spec §4.1): the assembly row is 302px of buttons + gap + trash + padding + scrollbar. */
.sidebar { width: clamp(380px, 20vw, 420px); }          /* replaces width: 312px */

.action-bar { display: flex; align-items: center; gap: 4px; margin: 8px 0 4px; }
.action-bar > button, .action-more .popover-trigger { padding: 4px 8px; white-space: nowrap; }
.action-delete { margin-left: auto; padding: 4px 7px; color: var(--alert); display: inline-flex; align-items: center; }
.action-delete svg { display: block; }
```

- [ ] **Step 9: Run tests, build, mutate**

Run: `npx vitest run src/panels && npm run build 2>&1 | tail -3` — PASS, builds. Mutate: `splitActions(resolved)` → `splitActions(resolved, 4)` → the four split tests RED; move `useState(false)` for `rowOpen` from ActionBar up into GroupProperties-level (simulate by rendering `<CopyInRow open />` outside the keyed div is too invasive — instead temporarily give the single-part root `key="fixed"`) → the selection-change test RED. Revert both.

- [ ] **Step 10: Live check (Review Focus 5)**

Dev server, 1366×768 (sidebar at its 380px minimum): add a board, select it, open More ▾ — the popup is fully inside the sidebar (its `getBoundingClientRect()` lies within `.sidebar`'s). Then the WORST case: add two boards, Group them, select the assembly, Duplicate it (a shared copy), and select one copy — More ▾ now holds Copy mirrored, Copy in a row…, Select copies, Make Unique, Group. Check: the action row is one line (`.action-bar` height < 34px), the trash button's right edge ≤ the panel's content right edge, and the open More ▾ popup lies within `.sidebar`. If the row does not fit, report the measured widths rather than shrinking padding ad hoc (the 380px floor came from a measurement; a new one changes the spec). Screenshot `docs/img/ui-polish-actions.png`. Clear localStorage; confirm empty.

- [ ] **Step 11: Commit**

```bash
git add src/panels/ActionBar.tsx src/panels/ActionBar.test.tsx src/panels/CopyInRow.tsx src/panels/CopyInRow.test.tsx src/panels/Properties.tsx src/panels/Properties.test.tsx src/styles.css docs/img/ui-polish-actions.png
git commit -m "feat(ui-polish): the action row — three actions, More ▾, Delete as a trash icon

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Properties fields — kind chip, grids, labels, cut cards

**Files:**
- Modify: `src/panels/Properties.tsx`, `src/panels/Properties.test.tsx`, `src/styles.css` (`.field*`, `.properties .name`, `.cut*`, `.checkbox`)

**Interfaces:**
- Consumes: ActionBar (Task 5) placement.
- Produces: CSS classes `.field-grid`, `.field-grid-2`, `.field-grid-3`, `.props-name`, `.kind-chip`, `.cut-remove`, `.h3-count` (Task 8 reuses `.field` and `.field-grid-3`).

- [ ] **Step 1: Update the label tests first (failing)**

In `src/panels/Properties.test.tsx` replace every `getByLabelText('Runs')` with `getByLabelText('Grain runs')` (lines ~368–447, 954 (the list `['Length', 'Width', 'Thickness', 'Runs']` → `'Grain runs'`), 979, 1064, 1073). Add:

```tsx
describe('Properties layout labels (ui-polish spec §4)', () => {
  it('names the kind beside the name: Part for a part, Assembly for an assembly', () => {
    useStore.getState().addBoard();
    useStore.getState().selectBoard(worldParts(useStore.getState().doc)[0]!.id);
    const { unmount } = render(<Properties />);
    expect(screen.getByText('Part', { selector: '.kind-chip' })).toBeInTheDocument();
    unmount();
    useStore.getState().replaceDocument(assemblyDoc());
    act(() => useStore.getState().selectItem('i1', false));
    render(<Properties />);
    expect(screen.getByText('Assembly', { selector: '.kind-chip' })).toBeInTheDocument();
  });

  it('labels Material with a real <label>, keeping its accessible name', () => {
    useStore.getState().addBoard();
    useStore.getState().selectBoard(worldParts(useStore.getState().doc)[0]!.id);
    render(<Properties />);
    expect(screen.getByLabelText('Material').tagName).toBe('SELECT');
  });
});
```

Run: `npx vitest run src/panels/Properties.test.tsx` — Expected: FAIL (no `Grain runs` label, no `.kind-chip`).

- [ ] **Step 2: Markup — single part**

In the single-part return of `Properties()`:

```tsx
    <div className="properties" key={board.id}>
      <div className="props-name">
        <NameField value={board.name} onCommit={commitName} />
        <span className="kind-chip">Part</span>
      </div>
      {/* ActionBar from Task 5 */}
      {/* link-block unchanged */}

      <h3>Size</h3>
      <div className="field-grid field-grid-3">
        {/* the three DimensionFields, unchanged */}
      </div>

      <h3>Position</h3>
      <div className="field-grid field-grid-3">
        {/* X, Y, Z DimensionFields, unchanged */}
      </div>

      <h3>Orientation &amp; stock</h3>
      {/* keep the Posture/Turn comment and the Grain comment here */}
      <div className="field-grid field-grid-2">
        <PostureField board={board} />
        <div className="field">
          <label htmlFor="turn">Turn</label>
          {/* turn select unchanged */}
        </div>
        <div className="field">
          <label htmlFor="grain">Grain runs</label>
          {/* grain select unchanged */}
        </div>
        <div className="field">
          <label htmlFor="material">Material</label>
          <select id="material" className="input" value={board.material}
            onChange={(e) => updateBoard(board.id, { material: e.target.value })}>
            {Object.entries(MATERIALS).map(([key, m]) => (
              <option key={key} value={key}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      <h3>Cuts{board.cuts.length > 0 && <span className="h3-count"> · {board.cuts.length}</span>}</h3>
      {/* CutRow map unchanged */}
      <button className="add-cut" onClick={() => addCut(board.id)}>+ Add cut</button>
    </div>
```

Delete the old `material-heading` comment (the `<label>` makes it moot). `.field-wide` is no longer used here.

- [ ] **Step 3: Markup — GroupProperties and InstanceProperties**

GroupProperties: title `<h3 className="props-title">…selected</h3>` stays an `h3`; Dimensions → `<h3>Size</h3>` + `.field-grid.field-grid-3` around the three fields; Grain + Material → `<h3>Stock</h3>` + `.field-grid.field-grid-2` holding two `.field`s labelled `Grain runs` (`htmlFor="grain"`) and `Material` (`<label htmlFor="material">`, `id="material"` on the select; remove `aria-labelledby` and `material-heading`).

InstanceProperties:

```tsx
      <div className="props-name">
        <NameField value={inst.name} onCommit={(typed) => useStore.getState().renameItem(path, typed)} />
        <span className="kind-chip">Assembly</span>
      </div>
      {/* ActionBar (Task 5) */}
      <p className="assembly-note">Double-click it in the view to edit its parts.</p>
      {copies >= 2 && <p className="link-note">Shared by {copies} copies: edits inside change all of them.</p>}
      <h3>Orientation</h3>
      <div className="field-grid field-grid-2">
        <div className="field">
          <label htmlFor="turn">Turn</label>
          {/* turn select unchanged */}
        </div>
        <label className="checkbox field-grid-checkbox">
          <input type="checkbox" checked={inst.mirrored === true}
            onChange={(e) => useStore.getState().mirrorAssembly(path, e.target.checked)} />
          Mirrored
        </label>
      </div>
```

The assembly note loses its "Assembly — " prefix (the chip says it). Check: `grep -rn "Assembly — double-click" src` — if a test matches the old text, update the test's text to the new one.

- [ ] **Step 4: Markup — the cut card**

In `CutRow`: the head becomes

```tsx
      <div className="cut-head">
        <span className="cut-label">{word}</span>
        <button className="cut-remove"
          aria-label={`Remove cut (${word}, offset ${formatLength(cut.offset, precision)})`}
          onClick={() => removeCut(board.id, cut.id)}>
          ✕
        </button>
      </div>
```

and wrap the three select `.field`s and the five DimensionFields (in their existing order) in one `<div className="field-grid field-grid-2">…</div>`. Relabel the two stop fields per spec §4.4: `label="Stop short — near end"` and `label="Stop short — far end"` (no test matches the old text — checked with `grep -rn "Stop short of" src`). The two notes and the `field-error` stay outside the grid, where they are.

- [ ] **Step 5: CSS**

In `src/styles.css`, replace the `.properties .name`, `.field`, `.field label`, `.field .input`, `.field-wide .input`, `.field-error` (keep its colour/typography), `.cut`, `.cut-head`, `.cut-label` and `.checkbox` rules with:

```css
.props-name { display: flex; align-items: center; gap: 8px; }
.props-name .name { flex: 1; min-width: 0; font-size: 13px; font-weight: 600; padding: 6px 8px; }
.props-title { margin: 0; padding: 0; border: 0; font-family: var(--font-ui); font-size: 13px;
  font-weight: 600; letter-spacing: 0; text-transform: none; color: var(--ink); }
.kind-chip { flex: none; font-family: var(--font-num); font-size: 10px; letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--ink-dim); border: 1px solid var(--rule);
  border-radius: 10px; padding: 2px 7px; }
.h3-count { letter-spacing: 0.05em; }

/* A field is a label over its control (ui-polish spec §4.3, §5). */
.field { display: flex; flex-direction: column; align-items: stretch; gap: 3px; margin-bottom: 6px; min-width: 0; }
.field label { font-size: 11px; color: var(--ink-dim); }
.field .input { width: 100%; }
.field input.input { font-family: var(--font-num); font-size: 12px; font-variant-numeric: tabular-nums;
  text-align: right; letter-spacing: 0.01em; }

.field-grid { display: grid; gap: 6px 8px; margin-bottom: 6px; }
.field-grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.field-grid-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.field-grid > .field { margin-bottom: 0; }
.field-grid > .field-error,
.field-grid > .field-note,
.field-grid > .field:has(> .field-error) { grid-column: 1 / -1; }
.field-grid { grid-auto-flow: dense; }
.field-grid-checkbox { align-self: end; padding-bottom: 6px; }

.cut { background: var(--raised); border: 1px solid var(--rule); border-radius: 4px;
  padding: 8px; margin: 0 0 8px; }
.cut-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.cut-label { font-weight: 600; text-transform: capitalize; }
.cut-remove { padding: 0 6px; line-height: 1.6; background: none; color: var(--ink-dim); }
.cut-remove:hover:not(:disabled) { background: var(--alert-bg-strong); border-color: var(--alert-border); color: var(--alert-bright); }

.checkbox { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ink); cursor: pointer; }
```

Keep `.field-error`'s typography rule but drop its `flex: 0 0 100%` (column layout now). (`NameField` renders `<input className="input name">`, NameField.tsx:66.)

- [ ] **Step 6: Run tests, build**

Run: `npm test 2>&1 | tail -5 && npm run build 2>&1 | tail -3`
Expected: all PASS; build succeeds. A failure that finds a label by its old text other than `Runs` means a label changed by accident — restore the old text.

- [ ] **Step 7: Mutate**

Remove `htmlFor="material"` → the Material label test RED. Revert.

- [ ] **Step 8: Live check**

Dev server at 1920×1080 and 1366×768: one part with one cut selected — no label inside `.properties` wraps (every `.field label` has `getBoundingClientRect().height` < 18), and at 1920 the whole panel including the cut card shows without scrolling `.panel-props` (`scrollHeight <= clientHeight`). Assembly: the Mirrored checkbox and its text share one line. At 1366, type `abc` into Width and press Enter: the error spans the whole Size row under the fields (its `getBoundingClientRect().width` ≈ the grid's), not an ~100px column; choose a refused posture if a fixture gives one (else skip and note it) and check Turn back-fills beside Posture. Screenshots `docs/img/ui-polish-part-1920.png`, `…-assembly-1366.png`. Clear localStorage; confirm empty.

- [ ] **Step 9: Commit**

```bash
git add src/panels/Properties.tsx src/panels/Properties.test.tsx src/styles.css docs/img/ui-polish-part-1920.png docs/img/ui-polish-assembly-1366.png
git commit -m "feat(ui-polish): Properties side by side — kind chip, Size/Position rows, 2×2 stock, cut cards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The Guides footer and the side panel's frame

**Files:**
- Create: `src/panels/GuidesFooter.tsx`, `src/panels/GuidesFooter.test.tsx`
- Modify: `src/App.tsx` (the `panel-guides` section), `src/styles.css` (`.sidebar`, `.panel-parts`, `.panel-guides`)

**Interfaces:**
- Consumes: `GuidesList` (unchanged).
- Produces: `export function GuidesFooter(): JSX.Element` — renders the whole `<section className="panel panel-guides">`.

- [ ] **Step 1: Write the failing tests**

Create `src/panels/GuidesFooter.test.tsx`:

```tsx
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { createDocument } from '../document/document';
import { GuidesFooter } from './GuidesFooter';

const st = () => useStore.getState();
beforeEach(() => st().replaceDocument(createDocument('Test')));

/** Adds a guide through the store's own action (store.ts:344). */
const addGuide = (at: [number, number, number]) => act(() => st().addGuide(at));
const toggle = () => screen.getByRole('button', { name: /^Guides · \d+$/ });

describe('GuidesFooter (ui-polish spec §4.5)', () => {
  it('is closed by default and shows the count', () => {
    render(<GuidesFooter />);
    expect(toggle()).toHaveAccessibleName('Guides · 0');
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/No guides/)).toBeNull();
  });

  it('opens itself when a guide is placed', () => {
    render(<GuidesFooter />);
    addGuide([12, 0, 4]);
    expect(toggle()).toHaveAccessibleName('Guides · 1');
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /^Remove guide at/ })).toBeInTheDocument();
  });

  it('stays as the user left it when a guide is removed or anything else changes', async () => {
    render(<GuidesFooter />);
    addGuide([12, 0, 4]);
    addGuide([24, 0, 4]);
    await userEvent.click(toggle());                     // user closes it
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    act(() => st().removeGuide(st().doc.guides[0]!.id));
    act(() => st().addBoard());
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens and closes by hand', async () => {
    render(<GuidesFooter />);
    await userEvent.click(toggle());
    expect(screen.getByText(/No guides/)).toBeInTheDocument();
    await userEvent.click(toggle());
    expect(screen.queryByText(/No guides/)).toBeNull();
  });

  it('opens when the count goes up for any reason — e.g. undoing a Clear all', () => {
    render(<GuidesFooter />);
    addGuide([12, 0, 4]);
    act(() => st().clearGuides());
    // (closing by hand is not needed: the count went down; it stays open)
    act(() => st().undo());
    expect(toggle()).toHaveAccessibleName('Guides · 1');
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
  });
});
```

(`addGuide(at)`, `removeGuide(id)` and `clearGuides()` are the store's existing actions, `store.ts:344-346`.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/panels/GuidesFooter.test.tsx`
Expected: FAIL — cannot resolve `./GuidesFooter`.

- [ ] **Step 3: Implement**

Create `src/panels/GuidesFooter.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { GuidesList } from './GuidesList';

/**
 * Guides as a footer of the side panel (ui-polish spec §4.5): a count, closed
 * by default, opening ITSELF when the count goes up (a guide was placed — or an
 * undo brought one back, or an opened project has more). It never closes by
 * itself. Open/closed is view state local to this component: not in the
 * document, the store, undo or storage.
 */
export function GuidesFooter() {
  const count = useStore((s) => s.doc.guides.length);
  const [open, setOpen] = useState(false);
  const last = useRef(count);
  useEffect(() => {
    if (count > last.current) setOpen(true);
    last.current = count;
  }, [count]);

  return (
    <section className={open ? 'panel panel-guides open' : 'panel panel-guides'}>
      <h2>
        <button className="guides-toggle" aria-expanded={open} aria-controls="guides-body"
          onClick={() => setOpen((o) => !o)}>
          {`Guides · ${count}`}
          <span className="guides-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
        </button>
      </h2>
      {open && <div id="guides-body" className="guides-body"><GuidesList /></div>}
    </section>
  );
}
```

Note: the caret `<span>` is `aria-hidden`, so the button's accessible name is exactly `Guides · N`.

- [ ] **Step 4: Wire it**

In `src/App.tsx` replace

```tsx
            <section className="panel panel-guides">
              <h2>Guides</h2>
              <GuidesList />
            </section>
```

with `<GuidesFooter />`; swap the `GuidesList` import for `import { GuidesFooter } from './panels/GuidesFooter';`.

- [ ] **Step 5: Frame CSS**

In `src/styles.css`:

```css
.panel-parts { max-height: 35vh; }                        /* replaces max-height: 34% */
.panel-guides { padding-top: 8px; padding-bottom: 8px; }  /* closed: one line */
.panel-guides.open { max-height: 34%; }
.panel-guides:not(.open) h2 { margin-bottom: 0; }
.guides-toggle { display: flex; align-items: center; gap: 8px; width: 100%; padding: 0;
  background: none; border: 0; font: inherit; letter-spacing: inherit; text-transform: inherit; color: inherit; }
.guides-toggle:hover:not(:disabled) { background: none; color: var(--ink); }
.guides-caret { margin-left: auto; }
.guides-body { overflow-y: auto; min-height: 0; }
```

Remove the old `max-height: 34%` from the base `.panel-guides` rule (it moves to `.open`). The `.panel h2::after` leader line now sits after the button inside the h2; if it pushes the caret, set `.panel-guides h2::after { display: none; }`.

- [ ] **Step 6: Run tests, build**

Run: `npm test 2>&1 | tail -5 && npm run build 2>&1 | tail -3`
Expected: all PASS; build succeeds.

- [ ] **Step 7: Mutate**

(a) Delete the `useEffect` → "opens itself when a guide is placed" and the undo test RED. (b) Change `count > last.current` to `count !== last.current` → "stays as the user left it" RED. Revert both.

- [ ] **Step 8: Live check**

Dev server, 1920×1080: Tape tool, place a guide by clicking two board corners → the footer opens and lists it. 1366×768: with 12 parts (Add board ×12) the Parts list scrolls inside itself and Properties is still visible. Screenshot `docs/img/ui-polish-guides.png`. Clear localStorage; confirm empty.

- [ ] **Step 9: Commit**

```bash
git add src/panels/GuidesFooter.tsx src/panels/GuidesFooter.test.tsx src/App.tsx src/styles.css docs/img/ui-polish-guides.png
git commit -m "feat(ui-polish): Guides as a footer that opens itself when a guide is placed; wider side panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Dialogs, the cut list sheet and form controls

**Files:**
- Modify: `src/styles.css` (`.modal-sheet`, `.cutlist-sheet`, `.generate-*`, `.copy-row*`, global control rules), `src/panels/CutList.tsx` (two class names), `src/panels/GenerateDialog.tsx` (two class names)

**Interfaces:**
- Consumes: `.field`, `.field-grid`, `.field-grid-3`, `.checkbox` (Task 6).

- [ ] **Step 1: Class names**

- `src/panels/CutList.tsx`: the Diagrams `<select>` gets `className="input"`; the `<label className="cutlist-layout-mode">` becomes `<label className="checkbox cutlist-layout-mode">`. (Read lines ~60–80 to find the select and its label.)
- `src/panels/GenerateDialog.tsx`: `<div className="generate-limits">` → `<div className="field-grid field-grid-3 generate-limits">`; `<fieldset className="field generate-count">` stays, its radio `<label>`s get `className="checkbox"`.
- `src/panels/RefineDialog.tsx`: `<div className="generate-limits">` → `<div className="field-grid field-grid-3 generate-limits">`.

- [ ] **Step 2: CSS**

```css
/* One control style everywhere (ui-polish spec §5). */
input[type='checkbox'], input[type='radio'] {
  accent-color: var(--accent); width: 14px; height: 14px; margin: 0; cursor: pointer; flex: none;
}
select.input { cursor: pointer; }

.modal-sheet { background: var(--surface); border: 1px solid var(--rule-strong); }
.cutlist-sheet { background: var(--surface); }
.modal-sheet h2 { font-size: 16px; }
.generate-count { flex-direction: row; align-items: center; gap: 14px; margin: 0 0 6px; }
.generate-count legend { float: left; margin: 0 6px 0 0; font-size: 11px; color: var(--ink-dim); }
.copy-row { background: var(--raised); }
.cutlist-actions { align-items: center; }
```

Delete the old `.generate-limits { display: flex; gap: 8px; }` and `.generate-limit { … }` rules (the grid replaces them) and `.checkbox input { accent-color … }` (the global rule replaces it).

- [ ] **Step 3: Tests and build**

Run: `npm test 2>&1 | tail -5 && npm run build 2>&1 | tail -3`
Expected: all PASS; build succeeds. (Class-only changes: no test should change. If one does, stop and report it.)

- [ ] **Step 4: Live check — dialogs and print**

Dev server, 1920×1080. Open each of: Cut list (with Sheet layouts, Diagrams "All parts"), Claude ▾ → Generate…, → Refine…, → Add joinery…, ⚙ Settings, the project menu. Screenshot each to `docs/img/ui-polish-dialog-<name>.png`. Check in each: no native-grey control (every `select` has class `input`; computed `accent-color` of each checkbox/radio is the accent). Generate's Generations radios sit on one line after their legend; Max width/depth/height are one row of three.

Print: rebuild Task 0 Step 3's exact document, `emulateMedia({ media: 'print' })`, full-page screenshot `docs/img/ui-polish-print-after.png`. Compare with `ui-polish-print-before.png` (Python PIL `ImageChops.difference(...).getbbox()`); expected: identical or differing only in the accent-coloured stock figures by ≤ 5 per channel (brass `#c99a4e` → oak `#c8955a`). Any other difference is a regression — fix it. Clear localStorage; confirm empty.

- [ ] **Step 5: Commit**

```bash
git add src/styles.css src/panels/CutList.tsx src/panels/GenerateDialog.tsx src/panels/RefineDialog.tsx docs/img/ui-polish-dialog-*.png docs/img/ui-polish-print-*.png
git commit -m "style(ui-polish): walnut dialogs and sheet; one control style; Generate's limits in a row

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Live pass, record, merge

**Files:**
- Create: `docs/browser-verification-ui-polish.md`
- Modify: `docs/history.md`, `docs/follow-ups.md`, `CLAUDE.md`

- [ ] **Step 1: Whole-app live pass**

Dev server, Playwright (the user may watch). At 1920×1080 and 1366×768 repeat Task 4 Step 7's header check, Task 6 Step 8's panel check, and: the snap markers — Move tool, select a part, hover a corner, an edge midpoint and a face centre of a second part; screenshot `docs/img/ui-polish-snaps.png` and judge each marker colour against the maple ground. A marker that is hard to see is reported to the user as a decision (spec §2.1); do not change its colour. Measure and record the final contrast ratios (rerun `src/palette.test.ts` and copy the values). Clear localStorage; confirm empty.

- [ ] **Step 2: Write the verification record**

Create `docs/browser-verification-ui-polish.md` in the style of the existing `docs/browser-verification-*.md`: date, dev server port, viewport sizes, each check with its DOM readout and screenshot path, the print comparison result, contrast values, the snap-marker judgement, and an explicit "not verified here" list: real-GPU rendering of the new ground/selection colours (follow-up 26a — the user looks after deploy), real print-to-PDF (follow-ups 70/79/84 still stand).

- [ ] **Step 3: Record the round**

- `docs/history.md`: a "UI polish (2026-10-11)" section — what changed, the decisions (palette A, layout B, action table, Guides auto-open), the files added, what the live pass could and could not confirm.
- `docs/follow-ups.md`: add numbered entries for anything left open (at minimum: real-hardware look at the viewport colours; any snap marker judged weak; any value nudged for contrast).
- `CLAUDE.md`: add a rounds-table row `| ui polish | 10-11 | — | Grey/walnut palette; tools and view float over the viewport; Claude ▾; action row with More ▾ and a trash icon; Guides footer |`; in "Where things live" add `Popover.tsx`, `ViewportControls.tsx`, `ActionBar.tsx`, `GuidesFooter.tsx` under `panels/` and `palette.test.ts`; add a per-file rule: "**`Popover.tsx`**: focuses the trigger BEFORE running an item (App records the opener); Escape is bound on its subtree with `stopPropagation`, never on window (inv 27). ProjectMenu keeps its own copy." and "**`styles.css`**: rules read surface ROLES (`--surface`, `--control`, `--rule`, `--ink`…), never raw `--grey-*`/`--walnut-*`; grey chrome re-points the roles in one context selector." Update the test count under Commands. Status stays "production matches master" wording until the deploy.

- [ ] **Step 4: Full verification**

Run: `npm test 2>&1 | tail -5 && npm run build 2>&1 | tail -3 && grep -rn "graphite\|--brass" src | grep -v "\.test\." ; echo "grep exit $?"`
Expected: all tests pass (report the new count); build succeeds; the grep prints nothing (exit 1).

- [ ] **Step 5: Commit, merge, verify, delete branch**

```bash
git add docs/browser-verification-ui-polish.md docs/history.md docs/follow-ups.md CLAUDE.md docs/img/ui-polish-snaps.png
git commit -m "docs(ui-polish): live check, round record, follow-ups

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git checkout master
git merge --no-ff ui-polish -m "Merge branch 'ui-polish': grey/walnut palette, floating viewport controls, a tidy side panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
npm test 2>&1 | tail -5 && npm run build 2>&1 | tail -3
git branch -d ui-polish
```

Expected: the merged tree passes and builds.

- [ ] **Step 6: Deploy — ask first**

Stop and ask the user before deploying. On approval: follow `DEPLOYMENT.local.md`; confirm by bundle hash at the edge and in-network, the CSP header, and `localStorage` cleared in the verifying browser (CLAUDE.md "The deployment rule"). No schema change: rollback is free. Then ask the user to look at the viewport on real hardware (26a), and record the deploy in `docs/history.md`, `DEPLOYMENT.local.md` and CLAUDE.md Status.
