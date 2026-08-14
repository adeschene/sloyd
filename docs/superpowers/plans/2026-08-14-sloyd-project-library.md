# Project Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Sloyd multiple projects resident in the browser — create, switch, duplicate and delete — behind the existing `StorageAdapter` seam, adopting today's single `sloyd.autosave.v1` slot without orphaning it.

**Architecture:** A JSON index (`sloyd.library.v1`) names every project and which is active; each project's document lives at `sloyd.project.<id>`. Index manipulation is a pure module so it can be tested without a `Storage`; the adapter owns all key access. The active project id becomes an explicit argument to `autoSave`, which is what closes the switch race. Switching is a `replaceDocument` call — the store learns nothing about projects.

**Tech Stack:** TypeScript, React 19, Zustand, Vitest, `@testing-library/react`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-14-sloyd-project-library-design.md` — read it before Task 1. The plan argues from it; where they disagree the spec wins, and a disagreement is worth stopping over rather than resolving silently.

## Global Constraints

- **`CURRENT_VERSION` stays 6.** No task adds a field to `SloydDocument`. Spec §2.1.
- **`sloyd.autosave.v1` is never deleted and never written after adoption.** It is the whole rollback story. Spec §2.2.
- **Storage layout versions separately from the document**: `layout: 1` inside the index, never compared against `CURRENT_VERSION`.
- **Nothing outside `src/storage/` may touch `localStorage`.** Panels and `App` go through the adapter. Spec §1.
- **`autoSave` must never throw** (invariant 7) — this survives the signature change unchanged.
- **Switching routes through `replaceDocument`** — no new store action, no direct `doc` write. Invariant 24, spec §3.1.
- **No `window.confirm` anywhere in this feature**, and Import's existing one is deleted. Spec §3.2, §5.
- **Key names, exact:** `sloyd.library.v1`, `sloyd.project.<id>`, `sloyd.autosave.v1`.
- `npm test` does **not** typecheck. Run `npm run build` before claiming anything compiles.

---

### Task 1: The index as a pure module

`libraryIndex.ts` knows the *shape* of the index and nothing about `Storage`. Splitting it out is what lets the ordering and malformed-entry rules be tested without a fake key-value store, and keeps the adapter to key access.

**Files:**
- Create: `src/storage/libraryIndex.ts`
- Create: `src/storage/libraryIndex.test.ts`
- Modify: `src/storage/types.ts` (add `ProjectEntry`, `LibraryIndex`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `LAYOUT_VERSION: 1`
  - `parseIndex(raw: unknown): LibraryIndex | null`
  - `sortEntries(entries: ProjectEntry[]): ProjectEntry[]`
  - `touchEntry(index: LibraryIndex, id: string, name: string, now: number): LibraryIndex`
  - `removeEntry(index: LibraryIndex, id: string): LibraryIndex`
  - types `ProjectEntry { id, name, savedAt, createdAt }`, `LibraryIndex { layout, activeId, projects }`

- [ ] **Step 1: Add the two types to `src/storage/types.ts`**

Append below the existing `RecentEntry` interface:

```ts
/** One row in the project library. Index metadata, never document data. */
export interface ProjectEntry {
  id: string;
  /** Mirrors doc.name so the list renders without parsing every project. */
  name: string;
  savedAt: number;
  createdAt: number;
}

/**
 * The library index. `layout` versions the ARRANGEMENT OF KEYS, which is a
 * different thing from a document's `version` and must never be compared
 * against CURRENT_VERSION — they change for unrelated reasons.
 */
export interface LibraryIndex {
  layout: number;
  activeId: string;
  projects: ProjectEntry[];
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/storage/libraryIndex.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { LAYOUT_VERSION, parseIndex, sortEntries, touchEntry, removeEntry } from './libraryIndex';
import type { LibraryIndex } from './types';

const entry = (id: string, savedAt: number, createdAt = 0) => ({
  id, name: id, savedAt, createdAt,
});

const index = (...projects: ReturnType<typeof entry>[]): LibraryIndex => ({
  layout: LAYOUT_VERSION,
  activeId: projects[0]?.id ?? '',
  projects,
});

describe('parseIndex', () => {
  it('accepts a well-formed index', () => {
    const parsed = parseIndex(index(entry('a', 5)));
    expect(parsed?.projects).toHaveLength(1);
    expect(parsed?.activeId).toBe('a');
  });

  it('returns null for a non-object', () => {
    expect(parseIndex(null)).toBeNull();
    expect(parseIndex('nope')).toBeNull();
    expect(parseIndex(42)).toBeNull();
  });

  it('returns null for a layout it does not understand', () => {
    expect(parseIndex({ ...index(entry('a', 1)), layout: 99 })).toBeNull();
  });

  it('drops a malformed entry rather than refusing the whole index', () => {
    // Same argument as validateGuides: a saved library must always open.
    const raw = {
      layout: LAYOUT_VERSION,
      activeId: 'a',
      projects: [entry('a', 1), { id: '', name: 'x', savedAt: 1, createdAt: 0 }, null, { nope: true }],
    };
    expect(parseIndex(raw)?.projects.map((p) => p.id)).toEqual(['a']);
  });

  it('defaults a non-numeric timestamp to 0 instead of dropping the project', () => {
    // Losing a timestamp costs sort position. Losing the project costs work.
    const raw = {
      layout: LAYOUT_VERSION,
      activeId: 'a',
      projects: [{ id: 'a', name: 'A', savedAt: 'soon', createdAt: undefined }],
    };
    expect(parseIndex(raw)?.projects).toEqual([{ id: 'a', name: 'A', savedAt: 0, createdAt: 0 }]);
  });
});

describe('sortEntries', () => {
  it('puts the most recently saved first', () => {
    const sorted = sortEntries([entry('old', 1), entry('new', 9), entry('mid', 5)]);
    expect(sorted.map((p) => p.id)).toEqual(['new', 'mid', 'old']);
  });

  it('breaks a savedAt tie by createdAt, newest first', () => {
    const sorted = sortEntries([entry('first', 5, 1), entry('second', 5, 2)]);
    expect(sorted.map((p) => p.id)).toEqual(['second', 'first']);
  });

  it('does not mutate its argument', () => {
    const input = [entry('a', 1), entry('b', 2)];
    sortEntries(input);
    expect(input.map((p) => p.id)).toEqual(['a', 'b']);
  });
});

describe('touchEntry', () => {
  it('updates savedAt and adopts the current document name', () => {
    const next = touchEntry(index(entry('a', 1)), 'a', 'Renamed', 500);
    expect(next.projects[0]).toMatchObject({ name: 'Renamed', savedAt: 500 });
  });

  it('leaves other projects alone', () => {
    const next = touchEntry(index(entry('a', 1), entry('b', 2)), 'a', 'A', 500);
    expect(next.projects[1]).toEqual(entry('b', 2));
  });

  it('is a no-op for an unknown id', () => {
    const before = index(entry('a', 1));
    expect(touchEntry(before, 'ghost', 'G', 500)).toEqual(before);
  });
});

describe('removeEntry', () => {
  it('drops the named project', () => {
    const next = removeEntry(index(entry('a', 1), entry('b', 2)), 'a');
    expect(next.projects.map((p) => p.id)).toEqual(['b']);
  });

  it('leaves activeId alone — choosing the next active is the adapter’s job', () => {
    // Kept deliberately dumb: the adapter has to load a document to make that
    // choice, and this module must stay testable without one.
    const next = removeEntry(index(entry('a', 1), entry('b', 2)), 'a');
    expect(next.activeId).toBe('a');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/storage/libraryIndex.test.ts`
Expected: FAIL — `Failed to resolve import "./libraryIndex"`.

- [ ] **Step 4: Write the implementation**

Create `src/storage/libraryIndex.ts`:

```ts
import type { LibraryIndex, ProjectEntry } from './types';

/**
 * Versions the ARRANGEMENT OF KEYS, not any document inside them. Separate
 * from CURRENT_VERSION on purpose: a .sloyd file written by this build is
 * byte-identical to one written before the library existed.
 */
export const LAYOUT_VERSION = 1;

function parseEntry(raw: unknown): ProjectEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.id !== 'string' || !e.id) return null;
  if (typeof e.name !== 'string') return null;
  // A bad timestamp costs sort position; dropping the project costs work.
  // Default it, the way units.precision and stock.kerf are defaulted.
  return {
    id: e.id,
    name: e.name,
    savedAt: typeof e.savedAt === 'number' && Number.isFinite(e.savedAt) ? e.savedAt : 0,
    createdAt: typeof e.createdAt === 'number' && Number.isFinite(e.createdAt) ? e.createdAt : 0,
  };
}

/**
 * Parse a raw index, or null if it is unusable as a whole. A MALFORMED ENTRY
 * IS DROPPED rather than refused — validateGuides' argument applies verbatim:
 * a saved library must always open, and a project row has no nearest-legal
 * value to clamp toward.
 */
export function parseIndex(raw: unknown): LibraryIndex | null {
  if (!raw || typeof raw !== 'object') return null;
  const i = raw as Record<string, unknown>;
  if (i.layout !== LAYOUT_VERSION) return null;
  if (!Array.isArray(i.projects)) return null;
  const projects = i.projects.map(parseEntry).filter((p): p is ProjectEntry => p !== null);
  return {
    layout: LAYOUT_VERSION,
    activeId: typeof i.activeId === 'string' ? i.activeId : '',
    projects,
  };
}

/** Most recently saved first; ties broken by newest created. Pure, copies. */
export function sortEntries(entries: ProjectEntry[]): ProjectEntry[] {
  return [...entries].sort((a, b) => b.savedAt - a.savedAt || b.createdAt - a.createdAt);
}

/** Record a save against one project, adopting the document's current name. */
export function touchEntry(
  index: LibraryIndex,
  id: string,
  name: string,
  now: number,
): LibraryIndex {
  return {
    ...index,
    projects: index.projects.map((p) => (p.id === id ? { ...p, name, savedAt: now } : p)),
  };
}

/** Drop one project. Deliberately does NOT choose a new active id. */
export function removeEntry(index: LibraryIndex, id: string): LibraryIndex {
  return { ...index, projects: index.projects.filter((p) => p.id !== id) };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/storage/libraryIndex.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 6: Typecheck and commit**

```bash
npm run build
git add src/storage/libraryIndex.ts src/storage/libraryIndex.test.ts src/storage/types.ts
git commit -m "feat: the project library index as a pure module"
```

---

### Task 2: Adoption — the single autosave slot becomes project one

The highest-stakes task in the plan. `sloyd.autosave.v1` **is** the user's project and there is nothing to restore from; an adoption that orphans it destroys real work.

**Files:**
- Modify: `src/storage/browser.ts` (add `openLibrary`, keep `loadAutoSaved` as the legacy read it now feeds)
- Modify: `src/storage/browser.test.ts` (append an `openLibrary` describe block; the existing `FakeStorage` class at the top is reused as-is)

**Interfaces:**
- Consumes: `LAYOUT_VERSION`, `parseIndex` from Task 1.
- Produces:
  - `LIBRARY_KEY = 'sloyd.library.v1'`, `PROJECT_PREFIX = 'sloyd.project.'`
  - `openLibrary(): Promise<{ activeId: string; doc: SloydDocument; libraryAvailable: boolean }>`
  - `BrowserStorageAdapter` constructor gains an optional injected clock: `constructor(store?: Storage | null, now?: () => number)`

- [ ] **Step 1: Write the failing tests**

Append to `src/storage/browser.test.ts`:

```ts
describe('openLibrary — adoption', () => {
  it('adopts an existing autosave as project one', async () => {
    const store = new FakeStorage();
    const legacy = docWithBoard();
    store.setItem(AUTOSAVE_KEY, JSON.stringify(legacy));

    const adapter = new BrowserStorageAdapter(store, () => 1000);
    const { activeId, doc, libraryAvailable } = await adapter.openLibrary();

    expect(libraryAvailable).toBe(true);
    expect(doc).toEqual(legacy);
    const index = JSON.parse(store.getItem(LIBRARY_KEY)!);
    expect(index.layout).toBe(LAYOUT_VERSION);
    expect(index.activeId).toBe(activeId);
    expect(index.projects).toHaveLength(1);
    expect(JSON.parse(store.getItem(PROJECT_PREFIX + activeId)!)).toEqual(legacy);
  });

  it('LEAVES THE OLD KEY BYTE-FOR-BYTE INTACT', async () => {
    // This assertion IS the rollback story: a build from before this round
    // must find sloyd.autosave.v1 exactly as it left it. Do not delete this
    // test to tidy up, and do not "clean up" the old key it guards.
    const store = new FakeStorage();
    const raw = JSON.stringify(docWithBoard());
    store.setItem(AUTOSAVE_KEY, raw);

    await new BrowserStorageAdapter(store, () => 1000).openLibrary();

    expect(store.getItem(AUTOSAVE_KEY)).toBe(raw);
  });

  it('creates an Untitled project when there is no autosave', async () => {
    const store = new FakeStorage();
    const { doc } = await new BrowserStorageAdapter(store, () => 1000).openLibrary();
    expect(doc.name).toBe('Untitled');
    expect(doc.boards).toEqual([]);
    expect(JSON.parse(store.getItem(LIBRARY_KEY)!).projects).toHaveLength(1);
  });

  it('treats a corrupt autosave as an absent one, without throwing', async () => {
    const store = new FakeStorage();
    store.setItem(AUTOSAVE_KEY, '{not json');
    const { doc, libraryAvailable } = await new BrowserStorageAdapter(store, () => 1000).openLibrary();
    expect(libraryAvailable).toBe(true);
    expect(doc.name).toBe('Untitled');
    expect(store.getItem(AUTOSAVE_KEY)).toBe('{not json');
  });

  it('reads an existing library instead of re-adopting', async () => {
    const store = new FakeStorage();
    store.setItem(AUTOSAVE_KEY, JSON.stringify(docWithBoard()));
    const adapter = new BrowserStorageAdapter(store, () => 1000);
    const first = await adapter.openLibrary();

    // A later boot must not mint a second project from the same old key.
    const second = await new BrowserStorageAdapter(store, () => 2000).openLibrary();
    expect(second.activeId).toBe(first.activeId);
    expect(JSON.parse(store.getItem(LIBRARY_KEY)!).projects).toHaveLength(1);
  });

  it('degrades to the legacy document when the project write fails', async () => {
    // A failed adoption must leave TODAY'S APP, not an empty one.
    const store = new FakeStorage();
    const legacy = docWithBoard();
    store.setItem(AUTOSAVE_KEY, JSON.stringify(legacy));
    store.full = true;

    const { doc, libraryAvailable } = await new BrowserStorageAdapter(store, () => 1000).openLibrary();

    expect(libraryAvailable).toBe(false);
    expect(doc).toEqual(legacy);
    expect(store.getItem(LIBRARY_KEY)).toBeNull();
  });
});
```

Add `LIBRARY_KEY, PROJECT_PREFIX` to the existing import from `./browser` at the top of the file, and `LAYOUT_VERSION` from `./libraryIndex`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/storage/browser.test.ts`
Expected: FAIL — `LIBRARY_KEY` is not exported / `adapter.openLibrary is not a function`.

- [ ] **Step 3: Implement `openLibrary`**

In `src/storage/browser.ts`, add the keys beside `AUTOSAVE_KEY` and the clock to the constructor:

```ts
export const AUTOSAVE_KEY = 'sloyd.autosave.v1';
export const LIBRARY_KEY = 'sloyd.library.v1';
export const PROJECT_PREFIX = 'sloyd.project.';
```

```ts
  private now: () => number;

  constructor(store: Storage | null = safeLocalStorage(), now: () => number = () => Date.now()) {
    this.store = store;
    this.now = now;
    if (!store) this._available = false;
  }
```

Then the boot path:

```ts
  /**
   * The boot path. Reads the library, adopting the legacy single autosave
   * slot the first time. Never throws: a failure here degrades to the
   * pre-library app rather than to an empty one.
   */
  async openLibrary(): Promise<{ activeId: string; doc: SloydDocument; libraryAvailable: boolean }> {
    const legacy = (await this.loadAutoSaved()) ?? createDocument();

    if (!this.store) return { activeId: '', doc: legacy, libraryAvailable: false };

    const existing = parseIndex(readJSON(this.store, LIBRARY_KEY));
    if (existing && existing.projects.length > 0) {
      const activeId = existing.projects.some((p) => p.id === existing.activeId)
        ? existing.activeId
        : sortEntries(existing.projects)[0].id;
      const doc = await this.loadProject(activeId);
      if (doc) return { activeId, doc, libraryAvailable: true };
      // The index names a project whose key is gone. Fall through and adopt,
      // which is the same recovery as a first boot.
    }

    return this.adopt(legacy);
  }

  /**
   * Write new, verify, THEN commit the index. Never overwrite in place, and
   * NEVER delete AUTOSAVE_KEY — it costs a few KB and it is the entire
   * rollback story for this round. Nothing writes to it after this point.
   */
  private async adopt(doc: SloydDocument): Promise<{ activeId: string; doc: SloydDocument; libraryAvailable: boolean }> {
    const id = nextId();
    const at = this.now();
    try {
      this.store!.setItem(PROJECT_PREFIX + id, JSON.stringify(doc));
      // Verify the round-trip before committing the index to it.
      if (!this.store!.getItem(PROJECT_PREFIX + id)) throw new Error('project did not persist');
      const index: LibraryIndex = {
        layout: LAYOUT_VERSION,
        activeId: id,
        projects: [{ id, name: doc.name, savedAt: at, createdAt: at }],
      };
      this.store!.setItem(LIBRARY_KEY, JSON.stringify(index));
      this._available = true;
      return { activeId: id, doc, libraryAvailable: true };
    } catch {
      this._available = false;
      // Adoption is retried on the next boot: the absent index is the only
      // thing that triggers it, so nothing has to remember this failed.
      return { activeId: '', doc, libraryAvailable: false };
    }
  }

  async loadProject(id: string): Promise<SloydDocument | null> {
    if (!this.store || !id) return null;
    const raw = readJSON(this.store, PROJECT_PREFIX + id);
    if (raw === null) return null;
    try {
      return migrateDocument(raw);
    } catch {
      return null;
    }
  }
```

Add the module-level helper below `safeLocalStorage`:

```ts
/** Read and JSON.parse a key. Null for absent, unreadable or corrupt. */
function readJSON(store: Storage, key: string): unknown {
  let raw: string | null;
  try {
    raw = store.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
```

Extend the imports at the top of `browser.ts`:

```ts
import { DocumentError, createDocument, migrateDocument, nextId } from '../document/document';
import type { LibraryIndex } from './types';
import { LAYOUT_VERSION, parseIndex, sortEntries } from './libraryIndex';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/storage/browser.test.ts`
Expected: PASS — the six new tests plus every pre-existing one in the file.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run build
git add src/storage/browser.ts src/storage/browser.test.ts
git commit -m "feat: adopt the legacy autosave slot as the library's first project"
```

---

### Task 3: Project CRUD on the adapter

**Files:**
- Modify: `src/storage/browser.ts`
- Modify: `src/storage/types.ts` (the `StorageAdapter` interface)
- Modify: `src/storage/browser.test.ts`

**Interfaces:**
- Consumes: `openLibrary`, `loadProject`, `LIBRARY_KEY`, `PROJECT_PREFIX` from Task 2; `touchEntry`, `removeEntry`, `sortEntries` from Task 1.
- Produces, all on `StorageAdapter`:
  - `autoSave(id: string, doc: SloydDocument): Promise<void>` — **signature change**
  - `listProjects(): Promise<ProjectEntry[]>` — sorted, most recently saved first
  - `createProject(doc: SloydDocument): Promise<string>` — returns the new id
  - `duplicateProject(id: string): Promise<string | null>` — returns the new id
  - `deleteProject(id: string): Promise<{ activeId: string; doc: SloydDocument }>` — returns what to switch to
  - `setActiveProject(id: string): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Append to `src/storage/browser.test.ts`:

```ts
describe('project CRUD', () => {
  const boot = async (now = () => 1000) => {
    const store = new FakeStorage();
    const adapter = new BrowserStorageAdapter(store, now);
    const { activeId } = await adapter.openLibrary();
    return { store, adapter, activeId };
  };

  it('autoSave writes to the id it is given, not to a remembered one', async () => {
    const { store, adapter, activeId } = await boot();
    const other = await adapter.createProject(createDocument('Other'));

    const doc = docWithBoard();
    await adapter.autoSave(activeId, doc);

    expect(JSON.parse(store.getItem(PROJECT_PREFIX + activeId)!)).toEqual(doc);
    expect(JSON.parse(store.getItem(PROJECT_PREFIX + other)!).boards).toEqual([]);
  });

  it('autoSave updates the index name and timestamp', async () => {
    let clock = 1000;
    const { store, adapter, activeId } = await boot(() => clock);
    clock = 5000;
    await adapter.autoSave(activeId, createDocument('Renamed'));

    const row = JSON.parse(store.getItem(LIBRARY_KEY)!).projects[0];
    expect(row).toMatchObject({ name: 'Renamed', savedAt: 5000 });
  });

  it('autoSave never throws when storage is full', async () => {
    const { store, adapter, activeId } = await boot();
    store.full = true;
    await expect(adapter.autoSave(activeId, createDocument())).resolves.toBeUndefined();
    expect(adapter.available).toBe(false);
  });

  it('listProjects returns most recently saved first', async () => {
    let clock = 1000;
    const { adapter } = await boot(() => clock);
    clock = 3000;
    const second = await adapter.createProject(createDocument('Second'));

    const list = await adapter.listProjects();
    expect(list[0].id).toBe(second);
    expect(list).toHaveLength(2);
  });

  it('createProject stores the document and adds a row', async () => {
    const { store, adapter } = await boot();
    const id = await adapter.createProject(createDocument('Fresh'));
    expect(JSON.parse(store.getItem(PROJECT_PREFIX + id)!).name).toBe('Fresh');
    expect((await adapter.listProjects()).map((p) => p.name)).toContain('Fresh');
  });

  it('duplicateProject copies the document under a new id', async () => {
    const { adapter, activeId } = await boot();
    await adapter.autoSave(activeId, docWithBoard());

    const copyId = await adapter.duplicateProject(activeId);
    expect(copyId).not.toBe(activeId);
    const copy = await adapter.loadProject(copyId!);
    expect(copy!.boards).toHaveLength(1);
    expect(copy!.name).toBe('Bench copy');
  });

  it('duplicateProject returns null for an unknown id', async () => {
    const { adapter } = await boot();
    expect(await adapter.duplicateProject('ghost')).toBeNull();
  });

  it('deleteProject removes the key and the row', async () => {
    const { store, adapter, activeId } = await boot();
    const other = await adapter.createProject(createDocument('Other'));

    await adapter.deleteProject(other);

    expect(store.getItem(PROJECT_PREFIX + other)).toBeNull();
    expect((await adapter.listProjects()).map((p) => p.id)).toEqual([activeId]);
  });

  it('deleting the active project switches to the most recently saved survivor', async () => {
    let clock = 1000;
    const { adapter, activeId } = await boot(() => clock);
    clock = 2000;
    await adapter.createProject(createDocument('Older'));
    clock = 3000;
    const newest = await adapter.createProject(createDocument('Newest'));

    const next = await adapter.deleteProject(activeId);

    expect(next.activeId).toBe(newest);
    expect(next.doc.name).toBe('Newest');
  });

  it('deleting the last project leaves a fresh Untitled active', async () => {
    // There is never a no-project state, so no component has to render one.
    const { adapter, activeId } = await boot();
    const next = await adapter.deleteProject(activeId);

    expect(next.doc.name).toBe('Untitled');
    expect(next.doc.boards).toEqual([]);
    expect(await adapter.listProjects()).toHaveLength(1);
    expect(next.activeId).toBe((await adapter.listProjects())[0].id);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/storage/browser.test.ts`
Expected: FAIL — `adapter.createProject is not a function`.

- [ ] **Step 3: Update the `StorageAdapter` interface**

In `src/storage/types.ts`, replace the `autoSave` line and add the new methods:

```ts
  /**
   * Persist one project. Callers debounce; this must never throw (inv 7).
   *
   * The id is an EXPLICIT ARGUMENT, not adapter state, and that is what
   * closes the switch race: a debounce armed while project A was open would
   * otherwise fire after a switch and write A's document into B's slot —
   * silent data loss, invisible in any screenshot. Do not "simplify" this
   * back to a remembered active id.
   */
  autoSave(id: string, doc: SloydDocument): Promise<void>;
  /** Boot: read the library, adopting the legacy autosave slot on first run. */
  openLibrary(): Promise<{ activeId: string; doc: SloydDocument; libraryAvailable: boolean }>;
  /** One project's document, or null if its key is missing or unusable. */
  loadProject(id: string): Promise<SloydDocument | null>;
  /** Every project, most recently saved first. */
  listProjects(): Promise<ProjectEntry[]>;
  /** Store a new project and return its id. */
  createProject(doc: SloydDocument): Promise<string>;
  /** Copy a project under a new id, suffixed "copy". Null if id is unknown. */
  duplicateProject(id: string): Promise<string | null>;
  /** Delete a project and resolve with what should now be open. */
  deleteProject(id: string): Promise<{ activeId: string; doc: SloydDocument }>;
  /** Record which project is open, so the next boot returns to it. */
  setActiveProject(id: string): Promise<void>;
```

Delete `loadAutoSaved` from the **interface** — it stays on `BrowserStorageAdapter` as the legacy read `openLibrary` feeds, but nothing outside storage calls it any more. Import `ProjectEntry` into the file's type imports.

- [ ] **Step 4: Implement the CRUD methods in `browser.ts`**

```ts
  /** Read the index, or an empty one. Never throws. */
  private readIndex(): LibraryIndex {
    if (!this.store) return { layout: LAYOUT_VERSION, activeId: '', projects: [] };
    return parseIndex(readJSON(this.store, LIBRARY_KEY))
      ?? { layout: LAYOUT_VERSION, activeId: '', projects: [] };
  }

  /** Write the index. Returns false on failure; never throws. */
  private writeIndex(index: LibraryIndex): boolean {
    if (!this.store) return false;
    try {
      this.store.setItem(LIBRARY_KEY, JSON.stringify(index));
      return true;
    } catch {
      this._available = false;
      return false;
    }
  }

  async autoSave(id: string, doc: SloydDocument): Promise<void> {
    if (!this.store || !id) {
      this._available = false;
      return;
    }
    try {
      this.store.setItem(PROJECT_PREFIX + id, JSON.stringify(doc));
      this.writeIndex(touchEntry(this.readIndex(), id, doc.name, this.now()));
      this._available = true;
    } catch {
      // Quota exceeded, or private browsing. Never throw from an autosave —
      // the UI surfaces `available === false` as a banner instead.
      this._available = false;
    }
  }

  async listProjects(): Promise<ProjectEntry[]> {
    return sortEntries(this.readIndex().projects);
  }

  async createProject(doc: SloydDocument): Promise<string> {
    const id = nextId();
    const at = this.now();
    if (!this.store) return id;
    try {
      this.store.setItem(PROJECT_PREFIX + id, JSON.stringify(doc));
    } catch {
      this._available = false;
      return id;
    }
    const index = this.readIndex();
    this.writeIndex({
      ...index,
      activeId: id,
      projects: [...index.projects, { id, name: doc.name, savedAt: at, createdAt: at }],
    });
    return id;
  }

  async duplicateProject(id: string): Promise<string | null> {
    const doc = await this.loadProject(id);
    if (!doc) return null;
    // No uniqueness enforced across the library: projects are keyed by id, and
    // invariant 8 governs BOARD names inside a document. A library that
    // renamed your projects at you would be worse than two rows alike.
    return this.createProject({ ...doc, name: `${doc.name} copy` });
  }

  async deleteProject(id: string): Promise<{ activeId: string; doc: SloydDocument }> {
    try {
      this.store?.removeItem(PROJECT_PREFIX + id);
    } catch {
      this._available = false;
    }
    const index = removeEntry(this.readIndex(), id);

    // Never a no-project state: the last delete makes a fresh Untitled.
    if (index.projects.length === 0) {
      this.writeIndex(index);
      const doc = createDocument();
      const newId = await this.createProject(doc);
      return { activeId: newId, doc };
    }

    const next = sortEntries(index.projects)[0];
    this.writeIndex({ ...index, activeId: next.id });
    return { activeId: next.id, doc: (await this.loadProject(next.id)) ?? createDocument(next.name) };
  }

  async setActiveProject(id: string): Promise<void> {
    this.writeIndex({ ...this.readIndex(), activeId: id });
  }
```

Extend the `libraryIndex` import with `removeEntry, touchEntry` and the `./types` type import with `ProjectEntry`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/storage/`
Expected: PASS across `browser.test.ts` and `libraryIndex.test.ts`.

- [ ] **Step 6: Typecheck and commit**

`npm run build` fails here until Task 4 updates `App.tsx`'s `autoSave` call — that is expected, and it is the signature change doing its job. Note the error, do not patch `App.tsx` yet, and commit:

```bash
git add src/storage/
git commit -m "feat: project create, duplicate, delete and list on the storage adapter"
```

---

### Task 4: Wire `App` to the library, and close the switch race

**Files:**
- Modify: `src/App.tsx:67-106` (the restore and autosave effects)
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: `openLibrary`, `autoSave(id, doc)`, `loadProject`, `setActiveProject` from Tasks 2–3.
- Produces: `activeId` state and an `openProject(id: string): Promise<void>` callback, both passed down to `Toolbar` in Task 5.

- [ ] **Step 1: Write the failing test**

The full race test needs a switch the user can perform, so it lands in Task 5 once the menu exists. What this task can prove on its own is that the id reaches `autoSave` at all — the precondition for the race being closable.

Append to `src/App.test.tsx`:

```tsx
it('autosaves against the active project id, not a remembered one', async () => {
  vi.useFakeTimers();
  const writes: Array<{ id: string; name: string }> = [];
  const spy = vi.spyOn(storage, 'autoSave').mockImplementation(async (id, doc) => {
    writes.push({ id, name: doc.name });
  });

  try {
    render(<App />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    act(() => { useStore.getState().setDocumentName('Project A'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(700); });

    expect(writes).toHaveLength(1);
    expect(writes[0].name).toBe('Project A');
    expect(writes[0].id).toBeTruthy();
  } finally {
    spy.mockRestore();
    vi.useRealTimers();
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — `storage.autoSave` still called with one argument, so `id` is the document object and `writes[0].name` is undefined.

- [ ] **Step 3: Replace the restore effect**

In `src/App.tsx`, add state beside `restored`:

```ts
  const [activeId, setActiveId] = useState('');
  // False when adoption failed (spec §2.2). The session runs the legacy
  // single-slot path and the caret is not rendered — a failed adoption must
  // degrade to TODAY'S APP, not to an empty one or to a menu that lies.
  const [libraryAvailable, setLibraryAvailable] = useState(false);
```

Replace the body of the restore effect (`App.tsx:67-94`) so it opens the library rather than the single slot. The two hazards the existing comment documents — an edit landing mid-restore, and StrictMode's double invoke — are unchanged and their guards stay:

```ts
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const before = useStore.getState().doc;
      try {
        const { activeId: id, doc: saved, libraryAvailable: libraryOk } = await storage.openLibrary();
        if (cancelled) return;
        // The user edited while the restore was in flight — their work wins.
        if (useStore.getState().doc !== before) {
          setAvailable(storage.available);
          return;
        }
        setActiveId(id);
        setLibraryAvailable(libraryOk);
        replaceDocument(saved);
        setAvailable(storage.available);
      } catch {
        if (!cancelled) setAvailable(storage.available);
      } finally {
        if (!cancelled) restored.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [replaceDocument]);
```

- [ ] **Step 4: Make the autosave effect carry the id**

Replace the autosave effect (`App.tsx:97-106`):

```ts
  // Debounced autosave on every document change.
  //
  // `activeId` is in the dep list and passed EXPLICITLY, which is what makes
  // switching safe: a switch changes both it and `doc` in one render, and
  // this effect's cleanup clears the pending timer before the new one arms.
  // Drop the id from either place and a timer armed before a switch writes
  // the outgoing project into the incoming project's slot. See the race test
  // in App.test.tsx.
  useEffect(() => {
    if (!restored.current || !activeId) return;
    setSaving(true);
    const t = setTimeout(async () => {
      await storage.autoSave(activeId, doc);
      setAvailable(storage.available);
      setSaving(false);
    }, 600);
    return () => clearTimeout(t);
  }, [doc, activeId]);
```

- [ ] **Step 5: Add the switch callback**

Below the effects:

```ts
  // Switching IS a replaceDocument call (invariant 24, spec §3.1): a fresh
  // action would have to re-derive every held-point clearing rule, and a
  // wholesale rewrite of doc.boards is exactly what that invariant names.
  const openProject = useCallback(async (id: string) => {
    if (id === activeId) return;
    const doc = await storage.loadProject(id);
    if (!doc) return;
    setActiveId(id);
    replaceDocument(doc);
    await storage.setActiveProject(id);
  }, [activeId, replaceDocument]);
```

Add `useCallback` to the React import.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS, including the race test.

- [ ] **Step 7: Typecheck and commit**

```bash
npm run build
git add src/App.tsx src/App.test.tsx
git commit -m "feat: open the library on boot and pass the project id through autosave"
```

---

### Task 5: The project menu

**Files:**
- Create: `src/panels/ProjectMenu.tsx`
- Create: `src/panels/ProjectMenu.test.tsx`
- Modify: `src/panels/Toolbar.tsx:54-67` (caret beside the name input)
- Modify: `src/App.tsx` (pass the new props to `Toolbar`)
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `activeId`, `openProject` from Task 4; `listProjects`, `createProject`, `duplicateProject`, `deleteProject` from Task 3.
- Produces: `<ProjectMenu activeId onOpen onNew onDuplicate onDelete onImport />`, and `Toolbar` props `activeId: string`, `onOpenProject: (id: string) => void`.

- [ ] **Step 1: Write the failing tests**

Create `src/panels/ProjectMenu.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectMenu } from './ProjectMenu';
import { storage } from '../storage/browser';

const entries = [
  { id: 'b', name: 'Shaker end table', savedAt: 2000, createdAt: 0 },
  { id: 'a', name: 'Workbench', savedAt: 1000, createdAt: 0 },
];

beforeEach(() => {
  vi.spyOn(storage, 'listProjects').mockResolvedValue(entries);
});

const open = async () => {
  const user = userEvent.setup();
  await user.click(screen.getByLabelText('Open project menu'));
  return user;
};

describe('ProjectMenu', () => {
  it('lists projects in the order the adapter returned them', async () => {
    render(<ProjectMenu activeId="a" onOpen={vi.fn()} onNew={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} onImport={vi.fn()} />);
    await open();
    const rows = await screen.findAllByRole('menuitemradio');
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Shaker end table'),
      expect.stringContaining('Workbench'),
    ]);
  });

  it('marks the active project', async () => {
    render(<ProjectMenu activeId="a" onOpen={vi.fn()} onNew={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} onImport={vi.fn()} />);
    await open();
    expect(await screen.findByRole('menuitemradio', { name: /Workbench/ })).toBeChecked();
  });

  it('opens a project on click', async () => {
    const onOpen = vi.fn();
    render(<ProjectMenu activeId="a" onOpen={onOpen} onNew={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} onImport={vi.fn()} />);
    const user = await open();
    await user.click(await screen.findByRole('menuitemradio', { name: /Shaker/ }));
    expect(onOpen).toHaveBeenCalledWith('b');
  });

  it('needs two clicks to delete, and says so in between', async () => {
    // Undo is per-document; there is no cross-project undo and no trash.
    const onDelete = vi.fn();
    render(<ProjectMenu activeId="a" onOpen={vi.fn()} onNew={vi.fn()} onDuplicate={vi.fn()} onDelete={onDelete} onImport={vi.fn()} />);
    const user = await open();
    await user.click((await screen.findAllByLabelText(/^Delete /))[0]);
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(await screen.findByRole('button', { name: 'Delete?' }));
    expect(onDelete).toHaveBeenCalledWith('b');
  });

  it('abandons a pending delete when another row is touched', async () => {
    const onDelete = vi.fn();
    render(<ProjectMenu activeId="a" onOpen={vi.fn()} onNew={vi.fn()} onDuplicate={vi.fn()} onDelete={onDelete} onImport={vi.fn()} />);
    const user = await open();
    await user.click((await screen.findAllByLabelText(/^Delete /))[0]);
    await user.click((await screen.findAllByLabelText(/^Duplicate /))[1]);
    expect(screen.queryByRole('button', { name: 'Delete?' })).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('closes on Escape without opening anything', async () => {
    const onOpen = vi.fn();
    render(<ProjectMenu activeId="a" onOpen={onOpen} onNew={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} onImport={vi.fn()} />);
    const user = await open();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('exposes duplicate and delete to the keyboard, not hover alone', async () => {
    // Hover-only reveal would put both operations out of reach without a
    // pointer. They are always in the DOM; CSS handles the reveal.
    render(<ProjectMenu activeId="a" onOpen={vi.fn()} onNew={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} onImport={vi.fn()} />);
    await open();
    expect(await screen.findAllByLabelText(/^Duplicate /)).toHaveLength(2);
    expect(await screen.findAllByLabelText(/^Delete /)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/panels/ProjectMenu.test.tsx`
Expected: FAIL — `Failed to resolve import "./ProjectMenu"`.

- [ ] **Step 3: Write the component**

Create `src/panels/ProjectMenu.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { storage } from '../storage/browser';
import type { ProjectEntry } from '../storage/types';

interface Props {
  activeId: string;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onImport: () => void;
}

/** "2 min ago" — coarse on purpose; the exact second is never the question. */
function relativeTime(at: number, now: number): string {
  const mins = Math.floor((now - at) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export function ProjectMenu({ activeId, onOpen, onNew, onDuplicate, onDelete, onImport }: Props) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  // Which row's delete is armed. Two-step rather than window.confirm: it
  // keeps the project's name visible while you confirm, and this round
  // retires the app's only native dialog rather than adding a second.
  const [armed, setArmed] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    storage.listProjects().then(setProjects).catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    if (open) refresh();
    else setArmed(null);
  }, [open, refresh, activeId]);

  // Escape and outside-click are bound HERE, not in App's keydown effect.
  // Invariant 27 governs WINDOW-LEVEL shortcuts; these are scoped to a menu
  // that exists only while the interaction does, and the menu cannot be open
  // behind the cut list anyway — the shell is `inert`, and opening the cut
  // list is itself a toolbar click that closes this. Routing them through
  // App would mean threading menu state up to re-derive a guard for a state
  // that cannot occur.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
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

  const now = Date.now();

  return (
    <div className="project-menu" ref={root}>
      <button
        className="project-menu-caret"
        aria-label="Open project menu"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
      >
        ▾
      </button>
      {open && (
        <div className="project-menu-popup" role="menu">
          {projects.map((p) => (
            <div className="project-row" key={p.id}>
              <button
                role="menuitemradio"
                aria-checked={p.id === activeId}
                className="project-row-open"
                onClick={() => { setOpen(false); onOpen(p.id); }}
              >
                <span className="project-dot" aria-hidden="true">{p.id === activeId ? '●' : ''}</span>
                <span className="project-row-name">{p.name}</span>
                <span className="project-row-time">{relativeTime(p.savedAt, now)}</span>
              </button>
              <button
                className="project-row-action"
                aria-label={`Duplicate ${p.name}`}
                title="Duplicate"
                onClick={() => { setArmed(null); onDuplicate(p.id); refresh(); }}
              >
                ⧉
              </button>
              {armed === p.id ? (
                <button
                  className="project-row-action danger"
                  onClick={() => { setArmed(null); onDelete(p.id); refresh(); }}
                >
                  Delete?
                </button>
              ) : (
                <button
                  className="project-row-action"
                  aria-label={`Delete ${p.name}`}
                  title="Delete"
                  onClick={() => setArmed(p.id)}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <div className="project-menu-divider" />
          <button role="menuitem" className="project-menu-cmd" onClick={() => { setOpen(false); onNew(); }}>
            + New project
          </button>
          <button role="menuitem" className="project-menu-cmd" onClick={() => { setOpen(false); onImport(); }}>
            ⬆ Import…
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/panels/ProjectMenu.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 5: Mount it in the toolbar**

In `src/panels/Toolbar.tsx`, add `libraryAvailable: boolean`, `activeId: string`, `onOpenProject: (id: string) => void`, `onNewProject: () => void`, `onDuplicateProject: (id: string) => void`, `onDeleteProject: (id: string) => void` and `onImportProject: () => void` to `Props`, and render the menu immediately after the name input at `Toolbar.tsx:66`. The `libraryAvailable &&` guard is what makes a failed adoption degrade to today's app rather than to a menu that cannot do anything:

```tsx
        {libraryAvailable && (
        <ProjectMenu
          activeId={activeId}
          onOpen={onOpenProject}
          onNew={onNewProject}
          onDuplicate={onDuplicateProject}
          onDelete={onDeleteProject}
          onImport={onImportProject}
        />
        )}
```

**The name input stays exactly as it is** — renaming is what that field is for, and turning it into a menu trigger would trade a working affordance for a new one.

- [ ] **Step 6: Style it**

Add to `src/styles.css`, following the existing toolbar idiom (reuse the established custom properties rather than introducing new colours):

```css
.project-menu { position: relative; display: inline-flex; }
.project-menu-caret { padding: 0 0.4rem; }
.project-menu-popup {
  position: absolute; top: 100%; left: 0; z-index: 40; min-width: 20rem;
  display: flex; flex-direction: column;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 4px; box-shadow: 0 6px 18px rgb(0 0 0 / 0.35);
}
.project-row { display: flex; align-items: center; }
.project-row-open {
  flex: 1; display: flex; gap: 0.5rem; align-items: baseline;
  text-align: left; background: none; border: none;
}
.project-row-name { flex: 1; }
.project-row-time { font-family: var(--font-num); opacity: 0.6; font-size: 0.85em; }
/* Always in the DOM; only the VISIBILITY is hover-driven, and focus reveals
   them too — hover alone would put duplicate and delete out of reach
   without a pointer. */
.project-row-action { opacity: 0; background: none; border: none; }
.project-row:hover .project-row-action,
.project-row-action:focus-visible { opacity: 1; }
.project-row-action.danger { opacity: 1; color: var(--danger, #c0563a); }
.project-menu-divider { height: 1px; background: var(--border); margin: 0.25rem 0; }
.project-menu-cmd { text-align: left; background: none; border: none; }
```

Check the custom property names against the top of `styles.css` before pasting — use whatever `--surface` / `--border` are actually called in this file, and do **not** add a new colour if an existing one fits.

- [ ] **Step 7: Write the switch-race test, now that a user can switch**

This is the test Task 4 set up for. Append to `src/App.test.tsx`:

```tsx
it('does not write the outgoing project into the incoming project’s slot', async () => {
  // THE RACE: App debounces autosave 600ms on `doc`. If the active id lived
  // inside the adapter, a timer armed while A was open would fire after a
  // switch and write A's document into B's slot — silent data loss, and
  // invisible in every screenshot. This test fails the moment the id stops
  // being an explicit argument captured in the same closure as the doc.
  vi.useFakeTimers();
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const writes: Array<{ id: string; name: string }> = [];
  const spy = vi.spyOn(storage, 'autoSave').mockImplementation(async (id, doc) => {
    writes.push({ id, name: doc.name });
  });

  try {
    render(<App />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const idA = (await storage.listProjects())[0].id;

    // Edit project A, arming the debounce but NOT letting it fire.
    act(() => { useStore.getState().setDocumentName('Project A'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });

    // Switch away before the timer fires.
    await user.click(await screen.findByLabelText('Open project menu'));
    await user.click(await screen.findByRole('menuitem', { name: /New project/ }));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });

    const idB = useStore.getState().doc.name === 'Untitled'
      ? (await storage.listProjects()).find((p) => p.id !== idA)!.id
      : idA;
    expect(writes.filter((w) => w.id === idB && w.name === 'Project A')).toEqual([]);
  } finally {
    spy.mockRestore();
    vi.useRealTimers();
  }
});
```

If this test does not **fail** when you temporarily revert the id to adapter state, it is not testing the race — **stop and say so** rather than adjusting the assertion until it goes green. A test that cannot fail is the recurring shape in this repo's follow-up ledger (invariant 23).

- [ ] **Step 8: Run the full suite, typecheck, commit**

Run: `npm test` then `npm run build`
Expected: PASS. `Toolbar.test.tsx` needs its render call updated with the seven new props — do that, don't loosen the test.

```bash
git add src/panels/ProjectMenu.tsx src/panels/ProjectMenu.test.tsx src/panels/Toolbar.tsx src/panels/Toolbar.test.tsx src/styles.css src/App.tsx src/App.test.tsx
git commit -m "feat: the project menu"
```

---

### Task 6: New, duplicate, delete and import wired end to end

**Files:**
- Modify: `src/App.tsx` (the four handlers)
- Modify: `src/panels/FileMenu.tsx:21-44` (Import loses its confirm and its trigger)
- Modify: `src/panels/FileMenu.test.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 3–5.
- Produces: `importProjectIntoLibrary()` on `FileMenu`'s exported surface — see Step 3.

- [ ] **Step 1: Write the failing tests**

Append to `src/App.test.tsx`:

```tsx
it('creates a new project and switches to it', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(await screen.findByLabelText('Open project menu'));
  await user.click(await screen.findByRole('menuitem', { name: /New project/ }));

  expect(await screen.findByLabelText('Project name')).toHaveValue('Untitled');
  expect(useStore.getState().doc.boards).toEqual([]);
});

it('keeps each project’s boards in its own slot across a switch', async () => {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByLabelText('Project name');

  act(() => { useStore.getState().addBoard(); });
  const first = useStore.getState().doc.boards[0].id;

  await user.click(await screen.findByLabelText('Open project menu'));
  await user.click(await screen.findByRole('menuitem', { name: /New project/ }));
  expect(useStore.getState().doc.boards).toEqual([]);

  await user.click(await screen.findByLabelText('Open project menu'));
  const rows = await screen.findAllByRole('menuitemradio');
  await user.click(rows[rows.length - 1]);

  expect(useStore.getState().doc.boards[0].id).toBe(first);
});

it('deleting the last project leaves a usable app', async () => {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByLabelText('Project name');

  await user.click(await screen.findByLabelText('Open project menu'));
  await user.click((await screen.findAllByLabelText(/^Delete /))[0]);
  await user.click(await screen.findByRole('button', { name: 'Delete?' }));

  expect(await screen.findByLabelText('Project name')).toHaveValue('Untitled');
  act(() => { useStore.getState().addBoard(); });
  expect(useStore.getState().doc.boards).toHaveLength(1);
});
```

In `src/panels/FileMenu.test.tsx`, replace any test asserting the import confirm with:

```tsx
it('does not prompt before importing — every project has its own slot now', async () => {
  const confirm = vi.spyOn(window, 'confirm');
  // ...existing import-success setup from this file...
  expect(confirm).not.toHaveBeenCalled();
  confirm.mockRestore();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/App.test.tsx src/panels/FileMenu.test.tsx`
Expected: FAIL — no menu commands wired; the confirm spy still fires.

- [ ] **Step 3: Move Import into the library**

In `src/panels/FileMenu.tsx`, export the import flow so the menu can trigger it while `FileMenu` keeps owning the error surface. Replace `onImport` with:

```tsx
  const onImport = async () => {
    setError(null);
    try {
      // No confirm: importing creates a NEW library entry rather than
      // replacing what is on screen, so there is nothing to lose. The old
      // prompt asked permission for something that no longer happens.
      await onImported(await storage.importProject());
    } catch (err) {
      // importProject() rejects both when the user cancels the file picker
      // and when the chosen file is genuinely bad (corrupt JSON, wrong
      // version). A cancelled picker is not an error — keyed off the typed
      // `cancelled` field rather than sniffing the message text.
      if (err instanceof DocumentError) {
        if (!err.cancelled) setError(err.message);
      } else {
        setError('Could not open that file.');
      }
    }
  };
```

`FileMenu` takes a new prop `onImported: (doc: SloydDocument) => Promise<void>` and renders only the Export button plus the error span; `App` passes the same handler to both `FileMenu` and the menu's `onImport`.

- [ ] **Step 4: Wire the four handlers in `App.tsx`**

```tsx
  const newProject = useCallback(async () => {
    const doc = createDocument();
    const id = await storage.createProject(doc);
    setActiveId(id);
    replaceDocument(doc);
  }, [replaceDocument]);

  const importIntoLibrary = useCallback(async (doc: SloydDocument) => {
    const id = await storage.createProject(doc);
    setActiveId(id);
    replaceDocument(doc);
  }, [replaceDocument]);

  const duplicateProject = useCallback(async (id: string) => {
    // Duplicate does NOT switch: you asked for a copy, not to leave what you
    // were doing. The new row appears in the list on the menu's refresh.
    await storage.duplicateProject(id);
  }, []);

  const deleteProject = useCallback(async (id: string) => {
    const { activeId: next, doc } = await storage.deleteProject(id);
    if (id === activeId) {
      setActiveId(next);
      replaceDocument(doc);
    }
  }, [activeId, replaceDocument]);
```

Import `createDocument` and the `SloydDocument` type into `App.tsx`, and pass all four plus `openProject` and `activeId` to `Toolbar`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/App.test.tsx src/panels/FileMenu.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run the whole suite, typecheck, commit**

Run: `npm test` then `npm run build`
Expected: PASS. Note follow-up **140**'s known ~1-in-4 flake in `depthField.agreement.test.ts` (a 5000 ms timeout, reproduces on `master`) — if that is the only failure, re-run to confirm it is the flake and do not chase it.

```bash
git add src/App.tsx src/App.test.tsx src/panels/FileMenu.tsx src/panels/FileMenu.test.tsx src/panels/Toolbar.tsx
git commit -m "feat: new, duplicate, delete and import through the project library"
```

---

### Task 7: Browser verification and documentation

**Files:**
- Create: `docs/browser-verification-project-library.md`
- Modify: `CLAUDE.md` (rounds table, Where things live, Status)
- Modify: `docs/follow-ups.md`
- Modify: `docs/history.md`

- [ ] **Step 1: Verify adoption against the dev server, all four cases**

Run `npm run dev -- --port 5199`. For each case, seed `localStorage` **before** the first page load, then load and observe:

1. A hand-written v6 document at `sloyd.autosave.v1` → it appears as the only project, named as saved, boards intact.
2. No `sloyd.autosave.v1` → one `Untitled` project.
3. `sloyd.autosave.v1` set to `{not json` → one `Untitled` project, no error, **and the corrupt key still present afterward**.
4. A **v1-era** document (`version: 1`) at `sloyd.autosave.v1` → migrates and adopts, proving adoption runs the migration chain rather than trusting the raw shape.

In every case, confirm `sloyd.autosave.v1` is **unchanged** afterward — read it back, don't assume.

- [ ] **Step 2: Verify the menu**

Create three projects, switch between them, confirm boards stay with their own project, duplicate one, delete a non-active one, delete the active one, and delete down to the last. Reload between two of these to confirm the active project is restored.

- [ ] **Step 3: Write up what the browser could and could not confirm**

Create `docs/browser-verification-project-library.md` in the shape of the existing `docs/browser-verification-*.md` files. Record **negative** findings too — anything you could not confirm on this host belongs in the write-up and, if it stays unconfirmed, in `docs/follow-ups.md` as a numbered entry continuing from 150.

- [ ] **Step 4: Update `CLAUDE.md`**

- Add a rounds-table row: `| project library | 08-14 | — | multiple projects in the browser; \`sloyd.library.v1\` |`.
- Update the test count in Status to the real number from `npm test`.
- Add `storage/libraryIndex.ts` and `panels/ProjectMenu.tsx` to the "Where things live" tree with one-line rationales.
- Add an invariant, numbered **29**, for the autosave id: *the active project id is an explicit argument to `autoSave`, never adapter state* — with the race it prevents, per spec §3. **Do not renumber anything.**
- Add an invariant, numbered **30**, for adoption: *`sloyd.autosave.v1` is never deleted and never written after adoption*, with the rollback argument.
- Note in Status that schema stays at **6** and rollback past this round costs nothing at the document level.

- [ ] **Step 5: Add the narrative to `docs/history.md`**

Per the working agreement: `CLAUDE.md` is the rules, `docs/history.md` is the record. The reasoning — why the id lives in the index and not the document, why adoption verifies before committing, why the menu's Escape sits outside `App`'s keydown effect — goes in history, not back into `CLAUDE.md`.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md docs/
git commit -m "docs: record the project library round"
```

---

## Deployment

Not a task — a gate, and the user's call to trigger.

**Production is verified by page load only.** The adoption path acts on the verifying browser's real `sloyd.autosave.v1`, and loading the page once is enough to run it. So: deploy per `DEPLOYMENT.local.md`, load the page, confirm the bundle hash, and stop. Do **not** exercise new/switch/delete against production — and note that the usual "confirm `sloyd.autosave.v1` is absent afterward" check has a new meaning this round: adoption will have *created library keys* in whatever browser loads the page. Check and record what is there rather than assuming.
