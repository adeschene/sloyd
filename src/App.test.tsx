import { worldParts } from './document/tree';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { useStore } from './store/store';
import { createDocument, createBoard, boardSnapPoints } from './document/document';
import type { SloydDocument } from './document/document';
import type { ProjectEntry } from './storage/types';
import { storage } from './storage/browser';
import { assemblyDoc } from './document/treeFixtures';
import { designToDocument } from './document/generated';
import { groupItems } from './document/document';

// The 3D viewport needs a real ResizeObserver and a WebGL-capable canvas,
// neither of which jsdom provides. App's restore/autosave wiring doesn't
// depend on the viewport at all, so it's stubbed out here.
//
// The stub records its props: `shortcutsSuspended` is the only way the cut
// list can reach `CameraKeys`' window listener, and the wiring is testable
// here even though the listener itself is not (the viewport is r3f and is
// verified in a browser by design).
const viewportProps = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));
vi.mock('./viewport/Viewport', () => ({
  Viewport: (props: Record<string, unknown>) => {
    viewportProps.current = props;
    return null;
  },
}));

// A small in-memory stand-in for the library half of StorageAdapter (R4).
// Real enough to behave — openLibrary/loadProject/createProject etc. all
// read and write the same map — but with no persistence of its own, so
// `reset()` in beforeEach (R5) is what stops one test's projects leaking
// into the next (the exact shape of follow-up 148).
type FakeProject = { entry: ProjectEntry; doc: SloydDocument };

// `storage.available` was a static `true` literal on the mock object, and
// `autoSave` a bare `vi.fn()` that never touched it — so nothing in this
// file could exercise the setAvailable/StorageBanner wiring at all. That
// blind spot is exactly why Finding 2 (browser.ts's corrupt-index refusal
// leaving `_available` untouched, so the app claims "Saved locally" while
// writing nothing) was invisible to a green suite. `mockAvailable` is now
// mutated by the fake itself, the same way the real adapter mutates
// `_available`: `autoSave` flips it false on a falsy id (mirroring
// `BrowserStorageAdapter.autoSave`'s own guard) and true on a real save;
// `failNextOpenLibrary()` flips it false the way the real corrupt/
// unrecognised-index branch does. Read via a getter on the mock object
// below, so `storage.available` always reflects the current value.
let mockAvailable = true;

function makeLibraryFake() {
  const projects = new Map<string, FakeProject>();
  let activeId = '';
  let counter = 0;
  let failNextOpen = false;
  // A monotonic stand-in for `savedAt`/`createdAt`, not `Date.now()`: two
  // entries created back to back in a test can land in the same
  // millisecond, and `listProjects` (below) sorts most-recently-saved
  // first — a real ordering property tests rely on. A tied `Date.now()`
  // would make that sort a no-op (stable sort keeps insertion order) and
  // silently flip which project a "most recent" assertion picks.
  let clock = 0;
  const tick = () => ++clock;

  return {
    reset() {
      projects.clear();
      activeId = '';
      counter = 0;
      clock = 0;
      failNextOpen = false;
      mockAvailable = true;
    },
    /** Seed a project directly (bypassing createProject) and make it active. */
    seed(doc: SloydDocument, id = `p${++counter}`) {
      projects.set(id, {
        entry: { id, name: doc.name, savedAt: tick(), createdAt: tick() },
        doc,
      });
      activeId = id;
      return id;
    },
    /**
     * Models `browser.ts`'s corrupt/unrecognised-LIBRARY_KEY refusal
     * (Finding 2): the next `openLibrary()` call degrades to a read-only
     * legacy view — `activeId: ''`, `libraryAvailable: false` — and flips
     * `available` false, the way the real adapter now does.
     */
    failNextOpenLibrary() {
      failNextOpen = true;
    },
    async openLibrary() {
      if (failNextOpen) {
        failNextOpen = false;
        mockAvailable = false;
        return { activeId: '', doc: useStore.getState().doc, libraryAvailable: false };
      }
      const p = projects.get(activeId);
      if (p) return { activeId, doc: p.doc, libraryAvailable: true };
      // Nothing seeded for this test: behave like "restore has nothing to
      // adopt" by handing back the document already in the store, under a
      // fresh id, rather than silently swapping in an unrelated document.
      const doc = useStore.getState().doc;
      const id = `p${++counter}`;
      projects.set(id, {
        entry: { id, name: doc.name, savedAt: tick(), createdAt: tick() },
        doc,
      });
      activeId = id;
      return { activeId, doc, libraryAvailable: true };
    },
    async loadProject(id: string) {
      // Mirrors browser.ts's own loadProject: a JSON round-trip through
      // localStorage and migrateDocument, so the caller never gets back the
      // SAME object identity that is sitting in `projects`. Returning the
      // stored object by reference would let a test that edits after
      // switching and asserts the OTHER project's stored document is
      // untouched pass for the wrong reason — the edit would be mutating
      // the very object this fake still considers "stored".
      const p = projects.get(id);
      return p ? structuredClone(p.doc) : null;
    },
    async listProjects(): Promise<ProjectEntry[]> {
      // Mirrors `sortEntries` (storage/libraryIndex.ts): most recently
      // saved first, `createdAt` as the tiebreak. The real adapter's
      // `listProjects` is documented to return this order, and the
      // project-switch test below depends on it to pick a specific row.
      return [...projects.values()]
        .map((p) => p.entry)
        .sort((a, b) => b.savedAt - a.savedAt || b.createdAt - a.createdAt);
    },
    /**
     * Models `createProject`'s `activate` parameter, which this fake used to
     * ignore while unconditionally activating what it wrote — the SIXTH
     * divergence between this fake and the real adapter (follow-up 156
     * enumerates the first five). App now passes `{ activate: false }` and
     * calls `setActiveProject` itself, on the far side of the in-flight
     * token, so a fake that activates regardless would report a persisted
     * active project the real adapter never wrote.
     */
    async createProject(doc: SloydDocument, options?: { activate?: boolean }) {
      const id = `p${++counter}`;
      projects.set(id, {
        entry: { id, name: doc.name, savedAt: tick(), createdAt: tick() },
        doc,
      });
      if (options?.activate ?? true) activeId = id;
      return id;
    },
    async duplicateProject(id: string) {
      const p = projects.get(id);
      if (!p) return null;
      const newId = `p${++counter}`;
      const name = `${p.entry.name} copy`;
      projects.set(newId, {
        entry: { id: newId, name, savedAt: tick(), createdAt: tick() },
        doc: { ...p.doc, name },
      });
      return newId;
    },
    /**
     * Models `browser.ts`'s real contract (storage/types.ts): resolves
     * `{ activeId, doc } | null`, where `null` covers TWO cases — an unknown
     * id (nothing to delete) and a successful delete of a project other
     * than the active one (a "background delete", which must not move the
     * caret out from under whatever is currently open). Only deleting the
     * ACTIVE project returns non-null, and deleting the last project never
     * leaves a no-project state — it manufactures a fresh Untitled one, the
     * same as the real adapter.
     */
    async deleteProject(id: string) {
      const existed = projects.has(id);
      const wasActive = activeId === id;
      if (existed) projects.delete(id);
      if (!wasActive) return null;

      if (projects.size === 0) {
        const doc = createDocument();
        const newId = `p${++counter}`;
        projects.set(newId, {
          entry: { id: newId, name: doc.name, savedAt: tick(), createdAt: tick() },
          doc,
        });
        activeId = newId;
        return { activeId, doc };
      }

      const next = [...projects.values()][0];
      activeId = next.entry.id;
      return { activeId, doc: structuredClone(next.doc) };
    },
    async setActiveProject(id: string) {
      activeId = id;
    },
    /**
     * Mirrors `BrowserStorageAdapter.autoSave`: writes the document into the
     * SAME map `loadProject`/`listProjects` read, not just the module-level
     * `mockAvailable` flag the default mock used to flip in isolation. Without
     * this, nothing an autosave ever "persists" is visible to a later
     * `loadProject` — a switch-away-and-back test would read back the
     * project's ORIGINAL document forever, no matter how long a real-timer
     * test waited for the debounce.
     */
    autoSave(id: string, doc: SloydDocument) {
      if (!id) return;
      const existing = projects.get(id);
      projects.set(id, {
        entry: existing
          ? { ...existing.entry, name: doc.name, savedAt: tick() }
          : { id, name: doc.name, savedAt: tick(), createdAt: tick() },
        doc,
      });
    },
  };
}

const fake = makeLibraryFake();

const openLibrary = vi.fn(() => fake.openLibrary());
const loadProject = vi.fn((...args: [string]) => fake.loadProject(...args));
const listProjects = vi.fn(() => fake.listProjects());
const createProject = vi.fn<
  (doc: SloydDocument, options?: { activate?: boolean }) => Promise<string | null>
>((...args: [SloydDocument, { activate?: boolean }?]) => fake.createProject(...args));
const duplicateProject = vi.fn((...args: [string]) => fake.duplicateProject(...args));
const deleteProject = vi.fn((...args: [string]) => fake.deleteProject(...args));
const setActiveProject = vi.fn((...args: [string]) => fake.setActiveProject(...args));
// Mirrors `BrowserStorageAdapter.autoSave`'s own guard (a falsy id refuses
// and flips `available` false) so the banner path is reachable through the
// real call path rather than only by hand-setting `mockAvailable`. Also
// writes through to `fake`'s own map (see `fake.autoSave`'s comment) so a
// document that autosaves is actually there for a later `loadProject`.
const defaultAutoSave = async (id: string, doc: SloydDocument) => {
  mockAvailable = Boolean(id);
  fake.autoSave(id, doc);
};
const autoSave = vi.fn<(id: string, doc: SloydDocument) => Promise<void>>(defaultAutoSave);
let llmSettings: import('./storage/types').LlmSettings | null = null;
const getLlmSettings = vi.fn(async () => llmSettings);
const setLlmSettings = vi.fn(async (s: import('./storage/types').LlmSettings) => { llmSettings = s; return true; });
const clearLlmSettings = vi.fn(async () => { llmSettings = null; });
let shopSettings: import('./document/purchase').ShopSettings | null = null;
const getShopSettings = vi.fn(async () => ({ settings: shopSettings ?? (await import('./document/purchase')).defaultShop(), readFailed: false }));
const setShopSettings = vi.fn(async (s: import('./document/purchase').ShopSettings) => { shopSettings = s; return true; });
let materialLibrary: import('./document/types').CustomMaterial[] = [];
const getMaterialLibrary = vi.fn(async () => ({ materials: materialLibrary, readFailed: false }));
const setMaterialLibrary = vi.fn(async (m: import('./document/types').CustomMaterial[]) => { materialLibrary = m; return true; });
const exportProject = vi.fn().mockResolvedValue(undefined);
const exportImage = vi.fn().mockResolvedValue(undefined);
const importProject = vi.fn();

vi.mock('./storage/browser', () => ({
  storage: {
    get available() {
      return mockAvailable;
    },
    capabilities: { recentFiles: false, realPaths: false },
    openLibrary: () => openLibrary(),
    loadProject: (...args: unknown[]) => loadProject(...(args as [string])),
    listProjects: () => listProjects(),
    createProject: (...args: unknown[]) =>
      createProject(...(args as [SloydDocument, { activate?: boolean }?])),
    duplicateProject: (...args: unknown[]) => duplicateProject(...(args as [string])),
    deleteProject: (...args: unknown[]) => deleteProject(...(args as [string])),
    setActiveProject: (...args: unknown[]) => setActiveProject(...(args as [string])),
    autoSave: (id: string, doc: SloydDocument) => autoSave(id, doc),
    getLlmSettings: () => getLlmSettings(),
    setLlmSettings: (s: import('./storage/types').LlmSettings) => setLlmSettings(s),
    clearLlmSettings: () => clearLlmSettings(),
    getShopSettings: () => getShopSettings(),
    setShopSettings: (s: import('./document/purchase').ShopSettings) => setShopSettings(s),
    getMaterialLibrary: () => getMaterialLibrary(),
    setMaterialLibrary: (m: import('./document/types').CustomMaterial[]) => setMaterialLibrary(m),
    exportProject: (...args: unknown[]) => exportProject(...args),
    exportImage: (...args: unknown[]) => exportImage(...args),
    importProject: (...args: unknown[]) => importProject(...args),
    listRecent: () => Promise.resolve([]),
  },
}));

// The Anthropic client is replaced wholesale so no test can reach the
// network: `complete` defers to whatever the current test put in
// `completeImpl`. The rest of the module (CLAUDE_MODELS, DEFAULT_MODEL) is
// the real one, because SettingsDialog reads it.
const completeImpl = vi.hoisted(() => ({ current: null as null | ((...a: unknown[]) => Promise<unknown>) }));
vi.mock('./llm/anthropic', async (orig) => {
  const real = await orig<typeof import('./llm/anthropic')>();
  return {
    ...real,
    // Never the real network from jsdom: the key check is a fetch.
    checkAnthropicKey: async () => ({ status: 'valid' as const }),
    AnthropicClient: class {
      userTurn(t: string) { return t; }
      estimateCostUsd() { return 0.01; }
      complete(...a: unknown[]) { return completeImpl.current!(...a); }
    },
  };
});

const reset = () => useStore.getState().replaceDocument(createDocument('Test'));

beforeEach(() => {
  reset();
  fake.reset();
  openLibrary.mockReset().mockImplementation(() => fake.openLibrary());
  loadProject.mockReset().mockImplementation((...args: [string]) => fake.loadProject(...args));
  listProjects.mockReset().mockImplementation(() => fake.listProjects());
  createProject.mockReset().mockImplementation(
    (...args: [SloydDocument, { activate?: boolean }?]) => fake.createProject(...args),
  );
  duplicateProject.mockReset().mockImplementation((...args: [string]) => fake.duplicateProject(...args));
  deleteProject.mockReset().mockImplementation((...args: [string]) => fake.deleteProject(...args));
  setActiveProject.mockReset().mockImplementation((...args: [string]) => fake.setActiveProject(...args));
  autoSave.mockReset().mockImplementation(defaultAutoSave);
  exportProject.mockReset().mockResolvedValue(undefined);
  exportImage.mockReset().mockResolvedValue(undefined);
  importProject.mockReset();
  llmSettings = null; getLlmSettings.mockClear(); setLlmSettings.mockClear(); clearLlmSettings.mockClear();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Opens the Claude ▾ menu and chooses one of its items. */
async function claudeItem(user: ReturnType<typeof userEvent.setup>, item: string) {
  await user.click(screen.getByRole('button', { name: /^Claude/ }));
  await user.click(screen.getByRole('button', { name: item }));
}

describe('App restore-on-mount', () => {
  it('does not clobber a document the user edited while the restore was in flight', async () => {
    const { promise, resolve } = deferred<{ activeId: string; doc: SloydDocument; libraryAvailable: boolean }>();
    openLibrary.mockReturnValue(promise);

    render(<App />);

    // The user edits the document before the (slow) restore resolves.
    await act(async () => {
      useStore.getState().addBoard();
    });
    const editedDoc = useStore.getState().doc;
    expect(editedDoc.boards).toHaveLength(1);
    const editedBoardId = worldParts(editedDoc)[0].id;

    // The restore now resolves with an unrelated saved document.
    const saved = { ...createDocument('Saved'), boards: [createBoard(), createBoard()] };
    await act(async () => {
      resolve({ activeId: 'p-saved', doc: saved, libraryAvailable: true });
      await promise;
    });

    // The user's edit must win — the saved document must not have replaced it.
    const finalDoc = useStore.getState().doc;
    expect(finalDoc).toBe(editedDoc);
    expect(finalDoc.boards).toHaveLength(1);
    expect(worldParts(finalDoc)[0].id).toBe(editedBoardId);
  });

  it('does not replace the document after the component has unmounted', async () => {
    const { promise, resolve } = deferred<{ activeId: string; doc: SloydDocument; libraryAvailable: boolean }>();
    openLibrary.mockReturnValue(promise);

    const { unmount } = render(<App />);
    const beforeDoc = useStore.getState().doc;

    unmount();

    const saved = { ...createDocument('Saved'), boards: [createBoard()] };
    await act(async () => {
      resolve({ activeId: 'p-saved', doc: saved, libraryAvailable: true });
      await promise;
    });

    expect(useStore.getState().doc).toBe(beforeDoc);
  });

  it('still marks the restore complete when there is nothing to restore', async () => {
    const initialDoc = useStore.getState().doc;
    openLibrary.mockResolvedValue({ activeId: 'p1', doc: initialDoc, libraryAvailable: true });

    await act(async () => {
      render(<App />);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Document unchanged (nothing to restore), but the autosave path should
    // now be armed — proven by an edit reaching autoSave after a debounce.
    expect(useStore.getState().doc).toBe(initialDoc);
  });

  it('autosaves an edit once the debounce elapses — proves autosave actually arms', async () => {
    // Deleting `restored.current = true` from any restore-completion path
    // leaves this false forever and autoSave() is never called for the rest
    // of the session — the only other assertion in this describe block
    // ("document unchanged") stays green even with that bug, so it does not
    // catch it. This one does.
    vi.useFakeTimers();
    try {
      const initialDoc = useStore.getState().doc;
      openLibrary.mockResolvedValue({ activeId: 'p1', doc: initialDoc, libraryAvailable: true });
      render(<App />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      act(() => {
        useStore.getState().addBoard();
      });
      const editedDoc = useStore.getState().doc;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(600);
      });

      expect(autoSave).toHaveBeenCalledWith('p1', editedDoc);
    } finally {
      vi.useRealTimers();
    }
  });

  // THE RACE THIS ROUND CLOSES (spec's headline hazard). The id must reach
  // autoSave as an explicit argument captured in the same effect closure as
  // the document — not read back off adapter state — or a timer armed while
  // one project is open can fire after a switch and write into the wrong
  // slot. This only proves the id reaches autoSave at all (the precondition);
  // the full switch-mid-debounce test lands in Task 5 once there is a menu
  // to switch from.
  it('autosaves against the active project id, not a remembered one', async () => {
    vi.useFakeTimers();
    const writes: Array<{ id: string; name: string }> = [];
    autoSave.mockImplementation(async (id: string, doc: SloydDocument) => {
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
      vi.useRealTimers();
    }
  });

  // "Boot loads your project" itself — every test above passes `initialDoc`
  // (or lets the fake default to the store's own current doc) as
  // `openLibrary`'s payload, so none of them can tell `replaceDocument(saved)`
  // apart from it being deleted outright. This mounts against a genuinely
  // DIFFERENT document and checks the store actually adopts it.
  it('adopts the document openLibrary returns', async () => {
    const saved = { ...createDocument('From library'), boards: [createBoard()] };
    openLibrary.mockResolvedValue({ activeId: 'p7', doc: saved, libraryAvailable: true });

    await act(async () => {
      render(<App />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(useStore.getState().doc).toBe(saved);
  });

  // The `!activeId` guard in the autosave effect is what stops a refused
  // adoption (spec §2.2, `browser.ts`'s "degrade to a read-only legacy view")
  // from calling `autoSave('', doc)` at all — real work, since that call
  // would itself be a no-op write with nothing to write to. It is NOT what
  // shows the banner: `available` is now set false inside `openLibrary`
  // itself (Finding 2), so the banner must appear from the restore alone,
  // before any autosave attempt ever happens. Both are asserted here.
  it('does not autosave when the library failed to open, and shows the banner', async () => {
    vi.useFakeTimers();
    try {
      fake.failNextOpenLibrary();
      render(<App />);
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });

      expect(screen.getByRole('alert')).toHaveTextContent(/can.t save to this browser/i);

      act(() => { useStore.getState().setDocumentName('Edited'); });
      await act(async () => { await vi.advanceTimersByTimeAsync(700); });

      expect(autoSave).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  // FINDING 1 REGRESSION TEST: an edit landing mid-restore must not
  // permanently disable autosave for the rest of the session. Before the
  // fix, `activeId`/`libraryAvailable` were only adopted on the branch that
  // also calls `replaceDocument` — so the edit-wins branch left `activeId`
  // at `''` forever, and the `!activeId` guard on the autosave effect
  // silently killed every later save while SaveIndicator kept claiming
  // "Saved locally". This mounts with a slow (deferred) restore, lets an
  // edit land first exactly like the existing "does not clobber" test, and
  // then proves autosave still arms afterward.
  it('still autosaves after an edit lands mid-restore', async () => {
    vi.useFakeTimers();
    try {
      const { promise, resolve } = deferred<{ activeId: string; doc: SloydDocument; libraryAvailable: boolean }>();
      openLibrary.mockReturnValue(promise);

      render(<App />);
      act(() => { useStore.getState().addBoard(); });

      await act(async () => {
        resolve({ activeId: 'p-mid-restore', doc: createDocument('Saved'), libraryAvailable: true });
        await promise;
        await vi.advanceTimersByTimeAsync(0);
      });

      act(() => { useStore.getState().setDocumentName('Edited after restore'); });
      const editedDoc = useStore.getState().doc;
      await act(async () => { await vi.advanceTimersByTimeAsync(700); });

      expect(autoSave).toHaveBeenCalledWith('p-mid-restore', editedDoc);
    } finally {
      vi.useRealTimers();
    }
  });

  // EXIT-CRITERION-2 DISCRIMINATING TEST (added during Task 5, not in the
  // brief). The brief's Step 7 race test (see "App project switching" below)
  // cannot fail on its own mutation instruction: `doc` alone is already in
  // the autosave effect's dep list, every switch calls `replaceDocument` with
  // a fresh object, so the effect's cleanup clears the outgoing timer before
  // any fake-timer advance happens — the test never reaches a state where a
  // timer armed before a switch is still pending after one, no matter how the
  // id reaches `autoSave`. This test targets the one path where `activeId`
  // changes and `doc` does NOT: the edit-wins branch of the restore, where
  // `setActiveId` is adopted but `replaceDocument` is skipped (see the
  // comment on that branch above). The existing "still autosaves after an
  // edit lands mid-restore" test masks this by editing the document again
  // afterward (`setDocumentName('Edited after restore')`), which changes
  // `doc` and reruns the effect regardless of whether `activeId` is a dep.
  // This test omits that second edit, so the ONLY thing that can rearm
  // autosave is `activeId` itself changing — which fails to fire the effect
  // at all if `activeId` is dropped from `}, [doc, activeId])`.
  it('arms autosave against the id adopted mid-restore, with no edit afterward', async () => {
    vi.useFakeTimers();
    try {
      const { promise, resolve } = deferred<{ activeId: string; doc: SloydDocument; libraryAvailable: boolean }>();
      openLibrary.mockReturnValue(promise);

      render(<App />);
      act(() => { useStore.getState().addBoard(); });
      const editedDoc = useStore.getState().doc;

      await act(async () => {
        resolve({ activeId: 'p-mid', doc: createDocument('Saved'), libraryAvailable: true });
        await promise;
        await vi.advanceTimersByTimeAsync(0);
      });
      await act(async () => { await vi.advanceTimersByTimeAsync(700); });

      expect(autoSave).toHaveBeenCalledWith('p-mid', editedDoc);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('App project switching', () => {
  it('does not write the outgoing project into the incoming project’s slot', async () => {
    // THE RACE: App debounces autosave 600ms on `doc`. If the active id lived
    // inside the adapter, a timer armed while A was open would fire after a
    // switch and write A's document into B's slot — silent data loss, and
    // invisible in every screenshot. This test fails the moment the id stops
    // being an explicit argument captured in the same closure as the doc.
    vi.useFakeTimers();
    const writes: Array<{ id: string; name: string }> = [];
    // The module-level `autoSave` mock, not `vi.spyOn(storage, 'autoSave')`:
    // this file's own convention (see "autosaves against the active project
    // id" above), and it matters here — spying directly on the mocked
    // storage object's property bypasses the same `mockAvailable` modelling
    // either way, but stacking a second mock on top of the module fn that
    // `beforeEach` already resets is the shape that goes stale first.
    autoSave.mockImplementation(async (id: string, doc: SloydDocument) => {
      writes.push({ id, name: doc.name });
    });

    try {
      render(<App />);
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      const idA = (await storage.listProjects())[0].id;

      // Edit project A, arming the debounce but NOT letting it fire.
      act(() => { useStore.getState().setDocumentName('Project A'); });
      await act(async () => { await vi.advanceTimersByTimeAsync(100); });

      // Switch away before the timer fires. fireEvent + getBy, not
      // userEvent + findBy: userEvent's pointer machinery and findBy's
      // waitFor both poll on real setTimeout under the hood, which never
      // fires under fake timers unless something else drives them, and both
      // buttons are already synchronously present (the popup's command row
      // does not wait on the async listProjects() fetch).
      act(() => { fireEvent.click(screen.getByLabelText('Open project menu')); });
      // Plain button, not `role="menuitem"` — ProjectMenu dropped its ARIA
      // menu roles (Finding 3, fix round 1): the popup is Tab-ordered
      // buttons, not a roving-tabindex menu.
      act(() => { fireEvent.click(screen.getByRole('button', { name: /New project/ })); });
      // onNewProject is async (createProject, then replaceDocument) — flush
      // its microtasks before advancing the debounce.
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      await act(async () => { await vi.advanceTimersByTimeAsync(2000); });

      const idB = useStore.getState().doc.name === 'Untitled'
        ? (await storage.listProjects()).find((p) => p.id !== idA)!.id
        : idA;
      expect(writes.filter((w) => w.id === idB && w.name === 'Project A')).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('flushes the outgoing project’s pending write before switching away', async () => {
    // THE OTHER HALF of the race test above, and a different question: that
    // one proves no document reaches the WRONG slot, by showing the effect's
    // cleanup cancels the outgoing timer. Nobody asked whether the cancelled
    // write ever happens at all — it did not, so the outgoing project's last
    // <=600ms of edits were silently discarded on every switch.
    //
    // The whole point is that the debounce is NEVER advanced past 600ms
    // between the edit and the switch. Add such a wait and this test passes
    // with the flush deleted.
    vi.useFakeTimers();
    const writes: Array<{ id: string; name: string }> = [];
    autoSave.mockImplementation(async (id: string, doc: SloydDocument) => {
      writes.push({ id, name: doc.name });
    });

    try {
      render(<App />);
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      const idA = (await storage.listProjects())[0].id;

      act(() => { useStore.getState().setDocumentName('Project A'); });
      await act(async () => { await vi.advanceTimersByTimeAsync(100); });
      expect(writes).toEqual([]);

      act(() => { fireEvent.click(screen.getByLabelText('Open project menu')); });
      act(() => { fireEvent.click(screen.getByRole('button', { name: /New project/ })); });
      // Microtasks only — `flushAutoSave` is awaited by the handler, not
      // scheduled on a timer, so this must not need the debounce to elapse.
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });

      expect(writes).toContainEqual({ id: idA, name: 'Project A' });
    } finally {
      vi.useRealTimers();
    }
  });

  // MINOR FINDING: ProjectMenu's Escape handler calls `e.stopPropagation()`,
  // and that call is load-bearing — without it, the same keydown would also
  // reach App's window-level listener and walk its grabbed/tapeAxis/
  // tapeAnchor/tool ladder, which (with nothing grabbed and no tape state)
  // resets `tool` to 'select'. Deleting `stopPropagation()` is invisible to
  // every other test in this file, since none of them open the project menu
  // with a non-'select' tool active. This one does.
  it('does not let Escape inside the project menu fall through to App’s tool ladder', async () => {
    const user = userEvent.setup();
    render(<App />);
    await act(async () => { await Promise.resolve(); });

    act(() => { useStore.getState().setTool('move'); });
    await user.click(screen.getByLabelText('Open project menu'));
    expect(screen.getByLabelText('Open project menu')).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{Escape}');

    expect(screen.getByLabelText('Open project menu')).toHaveAttribute('aria-expanded', 'false');
    expect(useStore.getState().tool).toBe('move');
  });

  // ---- Follow-up 159: a failed duplicate reports its cause -----------------
  //
  // ProjectMenu prints the message; App decides WHICH. Those tests pass a
  // cause straight in, so this is the only coverage of the decision itself —
  // and the decision is the subtle half. `duplicateProject` returns null for
  // two reasons and they are told apart by `storage.available`: a source it
  // could not load moves nothing (the store works, one project's data is
  // gone), while a write it could not commit flips the flag on its way out.
  describe('a duplicate that fails', () => {
    it('reports a missing source without claiming storage is broken', async () => {
      const user = userEvent.setup();
      // Listed, but its project key is gone underneath — the two-tab case
      // (154) or a hand edit. The adapter's own null path, not a mock of it.
      duplicateProject.mockResolvedValue(null);
      render(<App />);
      await act(async () => { await Promise.resolve(); });

      await user.click(screen.getByLabelText('Open project menu'));
      const dup = await screen.findByLabelText(/^Duplicate /);
      await user.click(dup);

      const err = await screen.findByRole('status');
      expect(err.textContent).toMatch(/missing/i);
      // The banner must NOT appear: persistence is fine, and saying it is
      // broken would send the user somewhere there is nothing to fix.
      expect(screen.queryByText(/not available|storage/i, { selector: '.storage-banner' })).toBeNull();
    });

    it('reports a write failure as a write failure', async () => {
      const user = userEvent.setup();
      duplicateProject.mockImplementation(async () => { mockAvailable = false; return null; });
      render(<App />);
      await act(async () => { await Promise.resolve(); });

      await user.click(screen.getByLabelText('Open project menu'));
      await user.click(await screen.findByLabelText(/^Duplicate /));

      expect((await screen.findByRole('status')).textContent).toMatch(/storage/i);
      expect((await screen.findByRole('status')).textContent).not.toMatch(/missing/i);
    });

    it('says nothing when the duplicate works', async () => {
      const user = userEvent.setup();
      render(<App />);
      await act(async () => { await Promise.resolve(); });

      await user.click(screen.getByLabelText('Open project menu'));
      await user.click(await screen.findByLabelText(/^Duplicate /));
      await waitFor(() => expect(duplicateProject).toHaveBeenCalled());

      expect(screen.queryByRole('status')).toBeNull();
    });
  });

  // ---- Follow-up 157: one shared in-flight token ---------------------------
  //
  // All four handlers that adopt a new active project (openProject,
  // onNewProject, onDeleteProject, importIntoLibrary) are
  // async-before-mutation, so two of them can be in flight at once and adopt
  // in EITHER order. No wrong-slot write is possible — every write is a
  // matched (id, doc) pair, which is invariant 29's whole point — but the
  // user could end on the project they did not choose, and the next boot
  // then opens it. `openProject` alone used to carry a boolean re-entry
  // guard that DECLINED the second click; a decline cannot be right here,
  // because it ends the session on the row the user did NOT click last.
  //
  // The rule the token buys, stated once: THE LAST HANDLER TO START OWNS THE
  // OUTCOME. An earlier one that resolves late abandons its adoption.
  //
  // MUTATE BOTH OF THESE (follow-up 155). A supersede guard is exactly the
  // REFUSAL shape that admits a test which observes only the end state and
  // cannot see the step that was skipped. Deleting the
  // `token !== switchToken.current` check from `openProject` must turn both
  // red; it was confirmed doing so.
  const settle = async () => {
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  };

  const openMenu = async () => {
    fireEvent.click(screen.getByLabelText('Open project menu'));
    // The popup's rows come from an async listProjects(); its command row
    // does not. Settle so both are present.
    await settle();
  };

  it('abandons an earlier switch that resolves after a later one has landed', async () => {
    const idA = fake.seed(createDocument('Project A'), 'pA');
    fake.seed(createDocument('Home'), 'pHome');

    let releaseA!: (doc: SloydDocument | null) => void;
    loadProject.mockImplementation(
      () => new Promise<SloydDocument | null>((resolve) => { releaseA = resolve; }),
    );

    render(<App />);
    await settle();
    expect(useStore.getState().doc.name).toBe('Home');

    // Click project A. Its load hangs.
    await openMenu();
    fireEvent.click(screen.getByRole('button', { name: /^Project A/ }));
    await settle();
    expect(useStore.getState().doc.name).toBe('Home');

    // While it hangs the user makes a new project, which lands.
    await openMenu();
    fireEvent.click(screen.getByRole('button', { name: /New project/ }));
    await settle();
    expect(useStore.getState().doc.name).toBe('Untitled');

    // Only now does A's load resolve. It must not adopt, and must not
    // repoint the persisted active project at itself.
    releaseA(createDocument('Project A'));
    await settle();

    expect(useStore.getState().doc.name).toBe('Untitled');
    expect(setActiveProject).not.toHaveBeenCalledWith(idA);
  });

  it('ends on the row the user clicked last when two loads resolve out of order', async () => {
    fake.seed(createDocument('Project A'), 'pA');
    const idB = fake.seed(createDocument('Project B'), 'pB');
    fake.seed(createDocument('Home'), 'pHome');

    const gates = new Map<string, (doc: SloydDocument | null) => void>();
    loadProject.mockImplementation(
      (id: string) => new Promise<SloydDocument | null>((resolve) => { gates.set(id, resolve); }),
    );

    render(<App />);
    await settle();

    await openMenu();
    fireEvent.click(screen.getByRole('button', { name: /^Project A/ }));
    await settle();

    await openMenu();
    fireEvent.click(screen.getByRole('button', { name: /^Project B/ }));
    await settle();

    // Both loads are open at once — which is only reachable because the
    // second click is no longer declined. Resolve them in the WRONG order:
    // the row the user ended on comes back first, the abandoned one second.
    expect(gates.size).toBe(2);
    gates.get('pB')!(createDocument('Project B'));
    await settle();
    gates.get('pA')!(createDocument('Project A'));
    await settle();

    expect(useStore.getState().doc.name).toBe('Project B');
    expect(setActiveProject).toHaveBeenLastCalledWith(idB);
    expect(setActiveProject).not.toHaveBeenCalledWith('pA');
  });
});

// ---- ui-polish spec §4.5: the Guides footer is closed on load and switch ----
//
// GuidesFooter opens itself when the guide count goes UP. Before App keyed it
// per project, its baseline was the count at mount — App mounts with an empty
// document and restore's replaceDocument raised the count, so the footer
// opened on every page load of a project with guides. MUTATE: drop the
// `key={activeId}` on <GuidesFooter> in App.tsx — the restore test goes red.
describe('App Guides footer across load and switch', () => {
  const settle = async () => {
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  };
  const withGuides = (name: string, n: number): SloydDocument => ({
    ...createDocument(name),
    guides: Array.from({ length: n }, (_, i) => ({ id: `g${i}`, at: [i * 6, 0, 0] as [number, number, number] })),
  });
  const guidesToggle = () => screen.getByRole('button', { name: /^Guides · \d+$/ });

  it('stays closed when the restored project has guides', async () => {
    fake.seed(withGuides('Saved', 2), 'pSaved');
    render(<App />);
    await settle();
    expect(guidesToggle()).toHaveAccessibleName('Guides · 2');
    expect(guidesToggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('stays closed after switching to another project with guides, then opens when a guide is placed', async () => {
    fake.seed(withGuides('Other', 3), 'pOther');
    // Home has none, so this test's red under the mutation comes from the
    // SWITCH, independently of the restore test above.
    fake.seed(withGuides('Home', 0), 'pHome');
    render(<App />);
    await settle();
    expect(guidesToggle()).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(screen.getByLabelText('Open project menu'));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: /^Other/ }));
    await settle();
    expect(useStore.getState().doc.name).toBe('Other');
    expect(guidesToggle()).toHaveAccessibleName('Guides · 3');
    expect(guidesToggle()).toHaveAttribute('aria-expanded', 'false');

    act(() => { useStore.getState().addGuide([30, 0, 0]); });
    expect(guidesToggle()).toHaveAccessibleName('Guides · 4');
    expect(guidesToggle()).toHaveAttribute('aria-expanded', 'true');
  });
});

// Module scope rather than inside 'App keyboard delete', where it started:
// the Generate tests below need the same "one board, selected, focus on a
// button rather than a field" starting point, because that is exactly the
// state in which a shortcut leaking past a dialog does damage.
const mountWithOneBoard = async () => {
  render(<App />);
  await act(async () => { await Promise.resolve(); });
  await act(async () => { useStore.getState().addBoard(); });
  const user = userEvent.setup();
  // Click the board in the parts list to set focus on the button, not on the
  // auto-focused Length input. This reflects the real path: the user clicks a
  // part, then presses Delete/Backspace from the button, not while editing.
  await user.click(screen.getByRole('button', { name: 'Board' }));
  return worldParts(useStore.getState().doc)[0].id;
};

describe('Materials & prices (lumber yield and cost spec §2.3, §4; custom materials spec §4.1)', () => {
  beforeEach(() => { shopSettings = null; materialLibrary = []; });

  it('opens above the cut list, saves a price the Buying section uses, and returns focus', async () => {
    // The default board is pine 24 × 5½ × ¾; default pine sizes carry no price, so the smallest that holds it
    // is chosen: ¾ × 5½ × 72 (size 7 in the default list: widths 1½,2½,3½ × 72/96, then 5½ × 72).
    await mountWithOneBoard();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Cut list' }));
    expect(screen.getByText('Buy 1 × 3/4" × 5-1/2" × 72" · no price')).toBeInTheDocument();
    const open = screen.getByRole('button', { name: 'Materials & prices…' });
    await user.click(open);
    expect(screen.getByRole('dialog', { name: 'Materials and prices' })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Cut list' }).hasAttribute('inert')).toBe(true);
    fireEvent.change(screen.getByRole('textbox', { name: 'Pine size 7: price' }), { target: { value: '9' } });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Materials and prices' })).toBeNull());
    expect(setShopSettings).toHaveBeenCalled();
    expect(screen.getByText('Buy 1 × 3/4" × 5-1/2" × 72" · $9.00')).toBeInTheDocument();
    expect(document.activeElement).toBe(open);
  });

  it('Escape closes the prices dialog but leaves the cut list open', async () => {
    await mountWithOneBoard();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Cut list' }));
    await user.click(screen.getByRole('button', { name: 'Materials & prices…' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Materials and prices' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Cut list' })).toBeInTheDocument();
  });
  it('a failed library write leaves the project edit standing; Save again adds no undo entry; a revert follows', async () => {
    const ash = { id: 'm-s-ash1', label: 'Ash', color: '#d8c8a8', kind: 'solid' as const };
    materialLibrary = [ash]; // read on mount: the library already holds Ash
    const id = await mountWithOneBoard();
    act(() => { useStore.getState().updateBoards([id], { material: 'm-s-ash1' }, [ash]); });
    setMaterialLibrary.mockResolvedValue(false);
    try {
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'Cut list' }));
      await user.click(screen.getByRole('button', { name: 'Materials & prices…' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Ash: name' }), { target: { value: 'White ash' } });
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(await screen.findByText(/Could not save your material library/)).toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: 'Materials and prices' })).toBeInTheDocument();
      expect(useStore.getState().doc.materials[0]!.label).toBe('White ash');
      expect(screen.getByText(/Could not save your material library/)).toHaveTextContent(/The project's changes were made\.$/);
      const n = useStore.getState().past.length;
      setMaterialLibrary.mockClear();
      await user.click(screen.getByRole('button', { name: 'Save' }));
      // The retry still writes the library (the edit's intent survives the rebase) and changes nothing in the project.
      await waitFor(() => expect(setMaterialLibrary).toHaveBeenCalledTimes(1));
      expect(await screen.findByText('Could not save your material library: this browser is not letting Sloyd store settings.')).toBeInTheDocument();
      expect(useStore.getState().past.length).toBe(n);
      // Fix round 1: the dialog's rows are rebased on what is now stored, so typing the old name back is a change.
      // Named by its STORED label, which is now White ash.
      fireEvent.change(screen.getByRole('textbox', { name: 'White ash: name' }), { target: { value: 'Ash' } });
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Materials and prices' })).toBeNull());
      expect(useStore.getState().doc.materials[0]!.label).toBe('Ash');
    } finally {
      setMaterialLibrary.mockImplementation(async (m) => { materialLibrary = m; return true; });
    }
  });

  it('a prices-only failure does not claim project changes', async () => {
    await mountWithOneBoard();
    setShopSettings.mockResolvedValue(false);
    try {
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'Cut list' }));
      await user.click(screen.getByRole('button', { name: 'Materials & prices…' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Oak: price per board foot' }), { target: { value: '8' } });
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(await screen.findByText('Could not save your prices: this browser is not letting Sloyd store settings.')).toBeInTheDocument();
    } finally {
      setShopSettings.mockImplementation(async (s) => { shopSettings = s; return true; });
    }
  });

  it('opened over the cut list, then exploded: the definitions lock', async () => {
    await mountWithOneBoard();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Cut list' }));
    await user.click(screen.getByRole('button', { name: 'Materials & prices…' }));
    expect(screen.getByRole('button', { name: 'Add material' })).toBeEnabled();
    act(() => { useStore.getState().setExplode(0.5); });
    try {
      expect(screen.getByRole('button', { name: 'Add material' })).toBeDisabled();
    } finally {
      act(() => { useStore.getState().setTool('select'); });
    }
  });
});

describe('App keyboard delete', () => {
  it('deletes the selected board on Delete', async () => {
    const id = await mountWithOneBoard();
    expect(useStore.getState().selectedIds).toEqual([id]);

    const user = userEvent.setup();
    await user.keyboard('{Delete}');

    expect(useStore.getState().doc.boards).toHaveLength(0);
    expect(useStore.getState().selectedIds).toEqual([]);
  });

  it('deletes the selected board on Backspace — the Mac "delete" key', async () => {
    await mountWithOneBoard();

    const user = userEvent.setup();
    await user.keyboard('{Backspace}');

    expect(useStore.getState().doc.boards).toHaveLength(0);
  });

  it('is undoable', async () => {
    const id = await mountWithOneBoard();

    const user = userEvent.setup();
    await user.keyboard('{Delete}');
    act(() => { useStore.getState().undo(); });

    expect(worldParts(useStore.getState().doc).map((b) => b.id)).toEqual([id]);
  });

  it('does nothing when no board is selected', async () => {
    await mountWithOneBoard();
    act(() => { useStore.getState().selectBoard(null); });

    const user = userEvent.setup();
    await user.keyboard('{Delete}');

    expect(useStore.getState().doc.boards).toHaveLength(1);
  });

  it('does not steal Backspace from a text field', async () => {
    await mountWithOneBoard();

    const user = userEvent.setup();
    const projectName = screen.getByLabelText('Project name');
    await user.click(projectName);
    await user.keyboard('{Backspace}');

    expect(useStore.getState().doc.boards).toHaveLength(1);

    // Blur before the test (and RTL's auto-unmount) ends. Focusing this field
    // calls the store's beginGesture(), and unmounting a still-focused field
    // does not fire blur in jsdom, so the gesture is left open. Follow-up 148
    // has since moved gesturing/gestureSnapshotTaken into the store's state,
    // where `beforeEach`'s replaceDocument resets them, so this blur is no
    // longer the only thing standing between a leaked gesture and the next
    // test in this file. It is KEPT anyway, and not as belt-and-braces: it
    // makes the test end in the state a real user's browser would also end in
    // (a blurred field closes its gesture), which is what the test should
    // have been doing regardless of where the flag lives.
    projectName.blur();
  });

  it('ignores a modified Delete', async () => {
    await mountWithOneBoard();

    const user = userEvent.setup();
    await user.keyboard('{Control>}{Delete}{/Control}');

    expect(useStore.getState().doc.boards).toHaveLength(1);
  });

  it('does not delete the selected board while the cut list is open', async () => {
    const id = await mountWithOneBoard();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Cut list' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Delete}');

    expect(useStore.getState().doc.boards).toHaveLength(1);
    expect(useStore.getState().selectedIds).toEqual([id]);
  });

  it('makes the rest of the app inert while the cut list is open', async () => {
    // The other half of the Delete guard above. The overlay stops the mouse,
    // but Tab used to walk into NameField, the project-name field and the
    // DimensionFields behind the scrim — all of which commit on change or
    // blur, so reading the sheet could silently rewrite the document.
    //
    // Asserted on the attribute rather than by tabbing: jsdom reflects `inert`
    // but does not implement its focus semantics, so a userEvent.tab() test
    // would pass identically with and without the fix. What the attribute
    // buys is verified in a real browser.
    await mountWithOneBoard();
    const shell = document.querySelector('.app-shell')!;
    expect(shell.hasAttribute('inert')).toBe(false);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Cut list' }));
    expect(shell.hasAttribute('inert')).toBe(true);

    await user.keyboard('{Escape}');
    expect(shell.hasAttribute('inert')).toBe(false);
  });

  it('suspends the viewport camera shortcuts while the cut list is open', async () => {
    // `f`/`Home` live on a window listener inside the Canvas, which `inert`
    // cannot reach: a window listener never sees which subtree the event came
    // from. Pressing `f` behind the sheet re-framed the camera invisibly and
    // handed the user back a moved view. Only the prop wiring is asserted —
    // the listener is r3f-side and is browser-verified by design.
    await mountWithOneBoard();
    expect(viewportProps.current?.shortcutsSuspended).toBe(false);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Cut list' }));
    expect(viewportProps.current?.shortcutsSuspended).toBe(true);

    await user.keyboard('{Escape}');
    expect(viewportProps.current?.shortcutsSuspended).toBe(false);
  });

  it('returns focus to the button that opened the cut list', async () => {
    await mountWithOneBoard();
    const user = userEvent.setup();
    const open = screen.getByRole('button', { name: 'Cut list' });

    await user.click(open);
    await user.keyboard('{Escape}');

    expect(document.activeElement).toBe(open);
  });

  it('opens the plans sheet as a modal and returns focus to its button', async () => {
    await mountWithOneBoard();
    const user = userEvent.setup();
    const open = screen.getByRole('button', { name: 'Plans' });
    await user.click(open);
    expect(screen.getByRole('dialog', { name: 'Plans' })).toBeInTheDocument();
    expect(document.querySelector('.app-shell')!.hasAttribute('inert')).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Close plans' }));
    expect(screen.queryByRole('dialog', { name: 'Plans' })).toBeNull();
    expect(document.activeElement).toBe(open);
  });

  it('does not steal Backspace from the Length field', async () => {
    // Regression test: Backspace must be blocked when editing dimensions,
    // not just for arbitrary text inputs. If a bypass for testing artifacts
    // ever crept in, this would fail.
    await mountWithOneBoard();

    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Length'));
    await user.keyboard('{Backspace}');

    expect(useStore.getState().doc.boards).toHaveLength(1);
  });
});

describe('App select all, and Delete on the whole selection', () => {
  /** Three boards; 'Board' clicked in the parts list so focus is on a button. */
  const mountWithThreeBoards = async () => {
    render(<App />);
    await act(async () => { await Promise.resolve(); });
    act(() => useStore.getState().setTool('select'));
    await act(async () => {
      useStore.getState().addBoard();
      useStore.getState().addBoard();
      useStore.getState().addBoard();
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Board' }));
    return { user, ids: worldParts(useStore.getState().doc).map((b) => b.id) };
  };

  it('Ctrl+A selects every part', async () => {
    const { user, ids } = await mountWithThreeBoards();
    await user.keyboard('{Control>}a{/Control}');
    expect(useStore.getState().selectedIds).toEqual(ids);
  });

  it('Cmd+A selects every part', async () => {
    const { user, ids } = await mountWithThreeBoards();
    await user.keyboard('{Meta>}a{/Meta}');
    expect(useStore.getState().selectedIds).toEqual(ids);
  });

  // Review Focus 2.
  it('Ctrl+A in a text field selects TEXT: the parts selection is unchanged and the event is not prevented', async () => {
    const { ids } = await mountWithThreeBoards();
    const projectName = screen.getByLabelText('Project name');
    act(() => projectName.focus());
    // fireEvent returns false iff a handler called preventDefault.
    expect(fireEvent.keyDown(projectName, { key: 'a', ctrlKey: true })).toBe(true);
    expect(useStore.getState().selectedIds).toEqual([ids[0]]);
    act(() => projectName.blur());
  });

  it('Ctrl+A does nothing while the cut list is open', async () => {
    const { user, ids } = await mountWithThreeBoards();
    await user.click(screen.getByRole('button', { name: 'Cut list' }));
    await user.keyboard('{Control>}a{/Control}');
    expect(useStore.getState().selectedIds).toEqual([ids[0]]);
  });

  it('Delete removes every selected part, as ONE undo entry', async () => {
    const { user, ids } = await mountWithThreeBoards();
    act(() => useStore.getState().toggleSelected(ids[2]!));
    const before = useStore.getState().past.length;
    await user.keyboard('{Delete}');
    expect(worldParts(useStore.getState().doc).map((b) => b.id)).toEqual([ids[1]]);
    expect(useStore.getState().past.length).toBe(before + 1);
  });

  it('Delete deletes nothing while a part is grabbed, however many are selected', async () => {
    const { user, ids } = await mountWithThreeBoards();
    act(() => {
      useStore.getState().toggleSelected(ids[1]!);
      useStore.getState().setTool('move');
      useStore.getState().grabSnapPoint(boardSnapPoints(worldParts(useStore.getState().doc)[0]!)[0]!);
    });
    await user.keyboard('{Delete}');
    expect(useStore.getState().doc.boards).toHaveLength(3);
    act(() => useStore.getState().setTool('select'));
  });

  it('H hides the selection', async () => {
    const { user, ids } = await mountWithThreeBoards();
    await user.keyboard('h');
    expect(useStore.getState().hiddenIds).toEqual([ids[0]]);
  });

  it('Shift+H hides everything else', async () => {
    const { user, ids } = await mountWithThreeBoards();
    await user.keyboard('{Shift>}H{/Shift}');
    expect(useStore.getState().hiddenIds).toEqual([ids[1], ids[2]]);
  });

  it("Alt+H shows all, matched by the physical key (a Mac's Option+H types ˙)", async () => {
    const { user, ids } = await mountWithThreeBoards();
    await user.keyboard('h');
    expect(useStore.getState().hiddenIds).toEqual([ids[0]]);
    fireEvent.keyDown(document.body, { key: '˙', code: 'KeyH', altKey: true });
    expect(useStore.getState().hiddenIds).toEqual([]);
  });

  it('Ctrl+H does nothing', async () => {
    await mountWithThreeBoards();
    fireEvent.keyDown(document.body, { key: 'h', code: 'KeyH', ctrlKey: true });
    expect(useStore.getState().hiddenIds).toEqual([]);
  });

  it('the key that types d on Dvorak (code KeyH) hides nothing', async () => {
    await mountWithThreeBoards();
    fireEvent.keyDown(document.body, { key: 'd', code: 'KeyH' });
    expect(useStore.getState().hiddenIds).toEqual([]);
  });

  it('H does nothing in a text field', async () => {
    await mountWithThreeBoards();
    // A bare input, NOT the project-name field: focusing that one opens a store
    // gesture, and hiding is refused mid-gesture, which would pass this test
    // with the isTextEntry guard deleted.
    const input = document.createElement('input');
    document.body.appendChild(input);
    act(() => input.focus());
    expect(useStore.getState().gesturing).toBe(false);
    fireEvent.keyDown(input, { key: 'h', code: 'KeyH' });
    expect(useStore.getState().hiddenIds).toEqual([]);
    act(() => input.blur());
    input.remove();
  });

  it('H does nothing while the cut list is open', async () => {
    const { user } = await mountWithThreeBoards();
    await user.click(screen.getByRole('button', { name: 'Cut list' }));
    await user.keyboard('h');
    expect(useStore.getState().hiddenIds).toEqual([]);
  });

  it('H then Ctrl+Z shows the part again', async () => {
    const { user, ids } = await mountWithThreeBoards();
    await user.keyboard('h');
    expect(useStore.getState().hiddenIds).toEqual([ids[0]]);
    await user.keyboard('{Control>}z{/Control}');
    expect(useStore.getState().hiddenIds).toEqual([]);
  });
});

// The Tape tool's type-anywhere capture. The MARKER and the preview are r3f and
// are verified in a browser by design; this block covers only what is DOM and
// logic — which keystroke is taken, what it does to the stored text, and the two
// guards the capture inherits by living inside App's existing keydown effect.
describe('App type-anywhere tape capture', () => {
  const anchoredTape = async () => {
    render(<App />);
    await act(async () => { await Promise.resolve(); });
    await act(async () => { useStore.getState().addBoard(); });
    const board = worldParts(useStore.getState().doc)[0];
    await act(async () => {
      useStore.getState().setTool('tape');
      useStore.getState().setTapeAnchor(boardSnapPoints(board)[0]);
    });
    const user = userEvent.setup();
    // addBoard auto-focuses the Length field, and the capture is deliberately
    // blocked while a text field has focus. Click the part in the list to move
    // focus to a button first — the same step the delete block above takes, for
    // the same reason.
    await user.click(screen.getByRole('button', { name: 'Board' }));
    return user;
  };

  const box = () => screen.getByLabelText('Guide distance from anchor') as HTMLInputElement;

  it('routes a leading digit into the readout and focuses it', async () => {
    const user = await anchoredTape();
    await user.keyboard('1');

    expect(useStore.getState().tapeTyped).toBe('1');
    expect(box().value).toBe('1');
    expect(document.activeElement).toBe(box());
  });

  // THE ORBIT CASE, and the reason the capture appends rather than replaces.
  // A drag past CLICK_DRAG_SLOP_PX is an orbit, not a click — the camera is
  // deliberately left usable between anchoring and placing — but a pointerdown
  // on the canvas BLURS this input while the anchor lives on. So the gesture
  // the tool is built around is "type 1, orbit, type 2", and a replacing
  // capture answers `2` while the box read `1` the whole way round. jsdom
  // cannot drag a canvas; blurring the input is the same shape, and it is the
  // half that matters — focus left, the anchor did not.
  it('appends to a number the user was interrupted mid-way through', async () => {
    const user = await anchoredTape();
    await user.keyboard('1');
    await act(async () => { box().blur(); });
    expect(useStore.getState().tapeTyped).toBe('1');

    await user.keyboard('2');

    expect(useStore.getState().tapeTyped).toBe('12');
    expect(box().value).toBe('12');
  });

  // The isTextEntry guard this capture inherits by living inside App's existing
  // keydown effect rather than in one of its own. Without it, typing a
  // dimension while the tape happened to be anchored would have its first
  // character stolen.
  it('does not capture while a text field has focus', async () => {
    const user = await anchoredTape();
    await user.click(screen.getByLabelText('Width'));
    await user.keyboard('5');

    expect(useStore.getState().tapeTyped).toBe('');
  });

  // This pins ORDERING, not the character set — and the distinction was found
  // by mutation, not by reading. Widening the capture to every single character
  // leaves this test green, because the M block sits ABOVE the capture in the
  // same effect and returns first. That is a real claim worth holding (arming
  // the tape must not cost you the tool shortcuts), but it is not the claim the
  // title used to make.
  it('leaves M reaching the Move binding above it', async () => {
    const user = await anchoredTape();
    await user.keyboard('m');

    expect(useStore.getState().tapeTyped).toBe('');
    expect(useStore.getState().tool).toBe('move');
  });

  // The character set itself, tested with a letter that has NO other binding —
  // the only kind that can distinguish "canBeginLength rejected it" from "some
  // earlier block ate it". Mutating the predicate to `e.key.length === 1` fails
  // here and nowhere else in this file.
  //
  // 'x' is no longer such a letter as of the cardinal-axis round — x/y/z are
  // now claimed by the axis-lock block above this capture, so 'q' is used
  // here instead. Do not reintroduce x/y/z for this purpose.
  it('does not capture a letter that no other binding claims', async () => {
    const user = await anchoredTape();
    await user.keyboard('q');

    expect(useStore.getState().tapeTyped).toBe('');
  });

  // The error must not outlive its cause. Enter with no target is refused, and
  // the cure is acquiring a target — which changes no CHARACTER, so an effect
  // keyed on the text alone leaves the box red over a measurement that would
  // now succeed, until Enter proves it by working. Nothing else in the suite
  // holds this: dropping `hovered` from that effect's key is otherwise silent.
  it('clears the refusal marking once a target is acquired', async () => {
    const user = await anchoredTape();
    await user.keyboard('5{Enter}');
    expect(box().className).toContain('invalid');
    // Refused, not committed: the anchor stays so the user can point somewhere
    // and try again, which is the whole reason this state is reachable.
    expect(useStore.getState().doc.guides).toHaveLength(0);
    expect(useStore.getState().tapeAnchor).not.toBeNull();

    const board = worldParts(useStore.getState().doc)[0];
    await act(async () => {
      useStore.getState().setTapeHover(boardSnapPoints(board)[1]);
    });

    expect(box().className).not.toContain('invalid');
    expect(box().value).toBe('5');
  });

  it('does nothing with no anchor — the tape must be measuring from somewhere', async () => {
    const user = await anchoredTape();
    await act(async () => { useStore.getState().clearTapeAnchor(); });
    await user.keyboard('7');

    expect(useStore.getState().tapeTyped).toBe('');
  });

  it('locks a world axis from the canvas and toggles it back off', async () => {
    const user = await anchoredTape();
    await user.keyboard('x');
    expect(useStore.getState().tapeAxis).toBe('x');
    await user.keyboard('x');
    expect(useStore.getState().tapeAxis).toBeNull();
  });

  it('does not lock an axis with no anchor', async () => {
    const user = await anchoredTape();
    await act(async () => { useStore.getState().clearTapeAnchor(); });
    await user.keyboard('y');
    expect(useStore.getState().tapeAxis).toBeNull();
  });

  // THE ONE THAT MATTERS. Ctrl+Z is `e.key === 'z'`, so an axis block guarding
  // modifiers with an early return would swallow undo entirely.
  it('leaves Ctrl+Z reaching the undo binding below it', async () => {
    const user = await anchoredTape();
    const before = useStore.getState().doc.boards.length;
    await act(async () => { useStore.getState().addBoard(); });
    await user.click(screen.getByRole('button', { name: 'Board' }));
    await user.keyboard('{Control>}z{/Control}');
    expect(useStore.getState().doc.boards).toHaveLength(before);
    expect(useStore.getState().tapeAxis).toBeNull();
  });

  it('backs out one level at a time on Escape: axis, then anchor, then tool', async () => {
    const user = await anchoredTape();
    await user.keyboard('z');
    expect(useStore.getState().tapeAxis).toBe('z');

    await user.keyboard('{Escape}');
    expect(useStore.getState().tapeAxis).toBeNull();
    expect(useStore.getState().tapeAnchor).not.toBeNull();

    await user.keyboard('{Escape}');
    expect(useStore.getState().tapeAnchor).toBeNull();
    expect(useStore.getState().tool).toBe('tape');

    await user.keyboard('{Escape}');
    expect(useStore.getState().tool).toBe('select');
  });

  it('does not lock an axis while the cut list is open', async () => {
    const user = await anchoredTape();
    await user.click(screen.getByRole('button', { name: /cut list/i }));
    await user.keyboard('x');
    expect(useStore.getState().tapeAxis).toBeNull();
  });

  const reason = () => screen.queryByTestId('tape-readout-error')?.textContent ?? null;

  it('names the cause when there is no direction at all', async () => {
    const user = await anchoredTape();
    await user.keyboard('5{Enter}');
    expect(box().className).toContain('invalid');
    expect(reason()).toMatch(/hover a point/i);
    expect(useStore.getState().doc.guides).toHaveLength(0);
  });

  it('names the cause when the number cannot be read', async () => {
    const user = await anchoredTape();
    const board = worldParts(useStore.getState().doc)[0];
    await act(async () => { useStore.getState().setTapeHover(boardSnapPoints(board)[25]); });
    await user.keyboard('.{Enter}');
    expect(box().className).toContain('invalid');
    expect(reason()).toMatch(/length/i);
  });

  // The distinction the boolean could not express: a hover is not an answer to
  // "can this be read as a length", so it must not clear that error.
  it('does not let a new hover clear an unparseable number', async () => {
    const user = await anchoredTape();
    const board = worldParts(useStore.getState().doc)[0];
    await act(async () => { useStore.getState().setTapeHover(boardSnapPoints(board)[25]); });
    await user.keyboard('.{Enter}');
    expect(box().className).toContain('invalid');

    await act(async () => { useStore.getState().setTapeHover(boardSnapPoints(board)[24]); });
    expect(box().className).toContain('invalid');
  });

  it('lets a new character clear an unparseable number', async () => {
    const user = await anchoredTape();
    const board = worldParts(useStore.getState().doc)[0];
    await act(async () => { useStore.getState().setTapeHover(boardSnapPoints(board)[25]); });
    await user.keyboard('.{Enter}');
    expect(box().className).toContain('invalid');
    await user.keyboard('5');
    expect(box().className).not.toContain('invalid');
  });

  // Pressing an axis key genuinely cures a no-direction refusal, and under the
  // boolean the red would have survived until Enter proved otherwise. This
  // calls setTapeAxis directly to pin TapeReadout's [hovered, axis] clearing
  // effect; the keyboard route to setTapeAxis is covered separately by 'shows
  // which axis is locked', 'changes the axis from inside the focused box,
  // keeping the number' and 'does not lock an axis while the cut list is
  // open' — the split is deliberate, not a gap.
  it('clears a no-direction refusal when an axis is locked', async () => {
    const user = await anchoredTape();
    await user.keyboard('5{Enter}');
    expect(box().className).toContain('invalid');
    await act(async () => { useStore.getState().setTapeAxis('y'); });
    expect(box().className).not.toContain('invalid');
  });

  it('places a guide along the locked axis with no target hovered at all', async () => {
    const user = await anchoredTape();
    const anchorAt = useStore.getState().tapeAnchor!.at;
    await act(async () => { useStore.getState().setTapeAxis('y'); });
    await user.keyboard('3 1/2{Enter}');

    const guides = useStore.getState().doc.guides;
    expect(guides).toHaveLength(1);
    expect(guides[0].at).toEqual([anchorAt[0], anchorAt[1] + 3.5, anchorAt[2]]);
    expect(useStore.getState().tapeAnchor).toBeNull();
  });

  it('places on the opposite side for a negative distance', async () => {
    const user = await anchoredTape();
    const anchorAt = useStore.getState().tapeAnchor!.at;
    await act(async () => { useStore.getState().setTapeAxis('x'); });
    await user.keyboard('-2{Enter}');
    expect(useStore.getState().doc.guides[0].at).toEqual([
      anchorAt[0] - 2, anchorAt[1], anchorAt[2],
    ]);
  });

  // §5.1: the lock is a lock. A hover latched before the axis was pressed must
  // not supply the direction.
  it('ignores a latched hover while an axis is locked', async () => {
    const user = await anchoredTape();
    const board = worldParts(useStore.getState().doc)[0];
    const anchorAt = useStore.getState().tapeAnchor!.at;
    await act(async () => {
      useStore.getState().setTapeHover(boardSnapPoints(board)[25]);
      useStore.getState().setTapeAxis('y');
    });
    await user.keyboard('1{Enter}');
    expect(useStore.getState().doc.guides[0].at).toEqual([
      anchorAt[0], anchorAt[1] + 1, anchorAt[2],
    ]);
  });

  it('shows which axis is locked', async () => {
    const user = await anchoredTape();
    expect(screen.queryByTestId('tape-readout-axis')).toBeNull();
    await user.keyboard('x');
    expect(screen.getByTestId('tape-readout-axis').textContent).toBe('X');
  });

  // The case App's listener CANNOT serve: isTextEntry early-returns once the
  // box has focus, so this branch is the only route to correcting a mis-pressed
  // axis mid-number.
  it('changes the axis from inside the focused box, keeping the number', async () => {
    const user = await anchoredTape();
    await user.keyboard('x');
    await user.keyboard('3');
    expect(document.activeElement).toBe(box());
    await user.keyboard('y');
    expect(useStore.getState().tapeAxis).toBe('y');
    expect(box().value).toBe('3');
  });

  it('does not type the axis letter into the box', async () => {
    const user = await anchoredTape();
    await user.keyboard('3');
    await user.keyboard('z');
    expect(box().value).toBe('3');
  });

  it('backs out the axis first on Escape from inside the box', async () => {
    const user = await anchoredTape();
    await user.keyboard('x3');
    await user.keyboard('{Escape}');
    expect(useStore.getState().tapeAxis).toBeNull();
    expect(useStore.getState().tapeAnchor).not.toBeNull();

    await user.keyboard('{Escape}');
    expect(useStore.getState().tapeAnchor).toBeNull();
  });
});

// The brief this round supplied two selectors that do not match the shipped
// DOM and were fixed rather than forced green (see task-6-report.md):
//  - ProjectMenu is DELIBERATELY not an ARIA menu (its own doc comment:
//    "considered and rejected") — its rows and commands are plain buttons,
//    not `menuitem`/`menuitemradio`.
//  - The armed delete button's accessible name is `Delete ${p.name}?`
//    (ProjectMenu.tsx), not the bare `'Delete?'` an exact-match query needs.
describe('project library: new, duplicate, delete, import', () => {
  it('creates a new project and switches to it', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByLabelText('Open project menu'));
    await user.click(await screen.findByRole('button', { name: /New project/ }));

    expect(await screen.findByLabelText('Project name')).toHaveValue('Untitled');
    expect(useStore.getState().doc.boards).toEqual([]);
  });

  it('keeps each project’s boards in its own slot across a switch', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByLabelText('Project name');

    act(() => { useStore.getState().addBoard(); });
    const first = worldParts(useStore.getState().doc)[0].id;

    // Autosave is debounced 600ms. Switching now FLUSHES the pending write
    // rather than cancelling it (see "flushes the outgoing project's pending
    // write before switching away" above), so this wait is no longer what
    // makes the board reach the stored 'Test' project — it is kept
    // deliberately anyway, so that this test goes on measuring per-project
    // ISOLATION and cannot start passing or failing for the flush's reasons.
    // Real timers, so the wait is real.
    await act(async () => { await new Promise((r) => setTimeout(r, 700)); });

    await user.click(await screen.findByLabelText('Open project menu'));
    await user.click(await screen.findByRole('button', { name: /New project/ }));
    expect(useStore.getState().doc.boards).toEqual([]);

    // Switch back to the original ('Test') project by name — robust to
    // row order, and exercises the same "own slot" property the brief's
    // position-based `rows[rows.length - 1]` was after.
    await user.click(await screen.findByLabelText('Open project menu'));
    await user.click(await screen.findByRole('button', { name: /^Test/ }));

    // openProject is fire-and-forget from the row's onClick (ProjectMenu
    // does not await it before closing the popup), so the switch's
    // loadProject/replaceDocument round trip needs its own wait rather than
    // being assumed complete the instant the click resolves.
    expect(await screen.findByLabelText('Project name')).toHaveValue('Test');
    expect(worldParts(useStore.getState().doc)[0].id).toBe(first);
  });

  it('deleting the last project leaves a usable app', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByLabelText('Project name');

    await user.click(await screen.findByLabelText('Open project menu'));
    await user.click((await screen.findAllByLabelText(/^Delete /))[0]);
    await user.click(await screen.findByRole('button', { name: /Delete .*\?/ }));

    expect(await screen.findByLabelText('Project name')).toHaveValue('Untitled');
    act(() => { useStore.getState().addBoard(); });
    expect(useStore.getState().doc.boards).toHaveLength(1);
  });

  // Minor 2 (fix round 1): a failed createProject during import used to
  // vanish silently at the import site — StorageBanner would eventually
  // cover it via the `available` flip, but that's easy to miss right after
  // the action that caused it. `importIntoLibrary` now throws a
  // DocumentError the FileMenu ref's try/catch surfaces as a normal alert.
  it('surfaces an error when importing fails to save into the library', async () => {
    const user = userEvent.setup();
    importProject.mockResolvedValue(createDocument('Imported'));
    createProject.mockResolvedValueOnce(null);
    render(<App />);
    await screen.findByLabelText('Project name');

    await user.click(await screen.findByLabelText('Open project menu'));
    await user.click(await screen.findByRole('button', { name: /Import/ }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Could not save the imported project.');
  });
});

describe('Generate', () => {
  const GOOD = {
    name: 'Bench',
    parts: [{ name: 'Top', role: '', miters: [], bevels: [], chamfers: [], tapers: [], material: 'pine', at: { x: 0, y: 0, z: 0 }, size: { x: 10, y: 1, z: 10 } }],
    assemblies: [],
  };
  const usage = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };

  beforeEach(() => {
    completeImpl.current = async () => ({ json: GOOD, assistantTurn: {}, usage });
  });

  it('suspends shortcuts and makes the shell inert while a dialog is open', async () => {
    // The exposure is focus OUTSIDE a text field — the sheet (focused on
    // mount) or a dialog button. Typing in the textarea proves nothing:
    // isTextEntry already returns early there.
    await mountWithOneBoard();
    // `tool` is not reset by `replaceDocument`, and the type-anywhere tests
    // above leave it on 'tape' — so without this the `m` assertion below
    // compares against a tool the test never chose. `setTool` also drops any
    // tape anchor or grab, either of which would make the Backspace assertion
    // pass for the wrong reason (the delete branch refuses while one is held).
    act(() => useStore.getState().setTool('select'));
    const boardId = worldParts(useStore.getState().doc)[0].id;
    useStore.getState().selectBoard(boardId);
    const pastBefore = useStore.getState().past.length;
    const user = userEvent.setup();
    await claudeItem(user, 'Generate…');
    expect(viewportProps.current?.shortcutsSuspended).toBe(true);
    expect(document.querySelector('.app-shell')!.hasAttribute('inert')).toBe(true);
    expect(document.activeElement).toBe(document.querySelector('.modal-sheet'));
    await user.keyboard('m');
    expect(useStore.getState().tool).toBe('select');
    await user.keyboard('{Backspace}');
    expect(useStore.getState().doc.boards).toHaveLength(1);
    await user.keyboard('{Control>}z{/Control}');
    expect(useStore.getState().past.length).toBe(pastBefore);
    await user.keyboard('{Escape}');
    expect(viewportProps.current?.shortcutsSuspended).toBe(false);
  });

  it('a finished generation lands in the library without switching or touching the document', async () => {
    llmSettings = { provider: 'anthropic', apiKey: 'k', model: 'claude-opus-5-5' };
    await mountWithOneBoard();
    const docBefore = useStore.getState().doc;
    const pastBefore = useStore.getState().past.length;
    const user = userEvent.setup();
    await claudeItem(user, 'Generate…');
    await user.type(screen.getByLabelText('Description'), 'a bench');
    await user.click(screen.getByRole('button', { name: 'Generate' }));
    await screen.findByRole('button', { name: 'Open Bench' });
    expect(createProject).toHaveBeenCalledWith(expect.objectContaining({ name: 'Bench' }), { activate: false });
    expect(setActiveProject).not.toHaveBeenCalled();
    expect(useStore.getState().doc).toBe(docBefore);
    expect(useStore.getState().past.length).toBe(pastBefore);
  });

  it('closing the dialog does not cancel; reopening shows the same rows', async () => {
    llmSettings = { provider: 'anthropic', apiKey: 'k', model: 'claude-opus-5-5' };
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    completeImpl.current = async () => { await gate; return { json: GOOD, assistantTurn: {}, usage }; };
    await mountWithOneBoard();
    const user = userEvent.setup();
    await claudeItem(user, 'Generate…');
    await user.type(screen.getByLabelText('Description'), 'a bench');
    await user.click(screen.getByRole('button', { name: 'Generate' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('button', { name: /generating 0\/1/i })).toBeInTheDocument();
    release();
    await claudeItem(user, 'Generate…');
    await screen.findByRole('button', { name: 'Open Bench' });
  });

  it('opening a generated project goes through openProject and clears its new badge', async () => {
    llmSettings = { provider: 'anthropic', apiKey: 'k', model: 'claude-opus-5-5' };
    await mountWithOneBoard();
    const user = userEvent.setup();
    await claudeItem(user, 'Generate…');
    await user.type(screen.getByLabelText('Description'), 'a bench');
    await user.click(screen.getByRole('button', { name: 'Generate' }));
    await user.click(await screen.findByRole('button', { name: 'Open Bench' }));
    await waitFor(() => expect(setActiveProject).toHaveBeenCalled());
    expect(useStore.getState().doc.name).toBe('Bench');
    await user.click(screen.getByRole('button', { name: 'Open project menu' }));
    // Wait for the list itself: the menu loads asynchronously, so asserting
    // the badge's absence before any row exists would pass vacuously.
    await screen.findByText('Bench', { selector: '.project-row-name' });
    expect(screen.queryByText('new')).toBeNull();
  });

  it('a generated project carries a new badge in the menu until opened', async () => {
    // The positive half of the test above, so its `queryByText('new')` is
    // known to be looking at something that can appear.
    llmSettings = { provider: 'anthropic', apiKey: 'k', model: 'claude-opus-5-5' };
    await mountWithOneBoard();
    const user = userEvent.setup();
    await claudeItem(user, 'Generate…');
    await user.type(screen.getByLabelText('Description'), 'a bench');
    await user.click(screen.getByRole('button', { name: 'Generate' }));
    await screen.findByRole('button', { name: 'Open Bench' });
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.click(screen.getByRole('button', { name: 'Open project menu' }));
    const name = await screen.findByText('Bench', { selector: '.project-row-name' });
    expect(name.closest('.project-row-open')!.querySelector('.project-row-new')).toHaveTextContent('new');
  });

  it('a generation landing mid-switch does not supersede the switch (invariant 32)', async () => {
    // Generation is NOT an adopting handler (spec §3.3): it must never bump
    // switchToken. If it did, a run finishing while a project switch is out
    // would make the switch find its token moved and abandon itself — the
    // user clicked a row and nothing happens. Nothing else pins this.
    llmSettings = { provider: 'anthropic', apiKey: 'k', model: 'claude-opus-5-5' };
    const otherDoc = createDocument('Other');
    const otherId = fake.seed(otherDoc);
    fake.seed(createDocument('Main'));
    await mountWithOneBoard();
    const held = deferred<SloydDocument | null>();
    loadProject.mockImplementationOnce(() => held.promise);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Open project menu' }));
    const row = await screen.findByText('Other', { selector: '.project-row-name' });
    await user.click(row.closest('button')!);
    await waitFor(() => expect(loadProject).toHaveBeenCalledWith(otherId));
    // The switch is now out, parked on loadProject. Run a generation to
    // completion underneath it.
    await claudeItem(user, 'Generate…');
    await user.type(screen.getByLabelText('Description'), 'a bench');
    await user.click(screen.getByRole('button', { name: 'Generate' }));
    await screen.findByRole('button', { name: 'Open Bench' });
    await act(async () => { held.resolve(structuredClone(otherDoc)); });
    await waitFor(() => expect(setActiveProject).toHaveBeenCalledWith(otherId));
    expect(useStore.getState().doc.name).toBe('Other');
  });

  it('Settings saves through the storage seam', async () => {
    await mountWithOneBoard();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /settings/i }));
    await user.type(screen.getByLabelText('API key'), 'sk-ant-x');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(setLlmSettings).toHaveBeenCalledWith({ provider: 'anthropic', apiKey: 'sk-ant-x', model: 'claude-opus-5-5' });
  });

  it('Forget key clears through the storage seam and closes the dialog', async () => {
    // SettingsDialog does not close itself on Forget; App does. Left open it
    // would keep offering "Saved — type to replace" for a key that is gone.
    llmSettings = { provider: 'anthropic', apiKey: 'k', model: 'claude-opus-5-5' };
    await mountWithOneBoard();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /settings/i }));
    // Found rather than got: the stored settings are read once on mount, and
    // Forget only renders once they have landed in App's state.
    await user.click(await screen.findByRole('button', { name: 'Forget key' }));
    expect(clearLlmSettings).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();
    expect(viewportProps.current?.shortcutsSuspended).toBe(false);
  });
});

describe('App assemblies', () => {
  it('Ctrl+G groups the selection, Ctrl+Shift+G ungroups it, Escape closes an open assembly last', async () => {
    render(<App />);
    await act(async () => { await Promise.resolve(); });
    act(() => { useStore.getState().replaceDocument(assemblyDoc()); useStore.getState().selectAll(); });
    fireEvent.keyDown(window, { key: 'g', ctrlKey: true });
    expect(useStore.getState().doc.instances).toHaveLength(1);
    fireEvent.keyDown(window, { key: 'G', ctrlKey: true, shiftKey: true });
    expect(useStore.getState().doc.instances.map((i) => i.id)).toEqual(['i1']);
    act(() => useStore.getState().openAssembly('i1'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useStore.getState().openPath).toBeNull();
  });

  // Fu 228: Ctrl+G is one of the window shortcuts, so it inherits both guards
  // (inv 27): never behind a modal, never from a text field. A blocked chord
  // is also NOT preventDefault-ed (the browser keeps its find-next).
  describe('Ctrl+G and Ctrl+Shift+G (fu 228)', () => {
    const mountGrouped = async () => {
      render(<App />);
      await act(async () => { await Promise.resolve(); });
      act(() => { useStore.getState().setTool('select'); useStore.getState().replaceDocument(assemblyDoc()); useStore.getState().selectAll(); });
      return userEvent.setup();
    };
    const ids = () => useStore.getState().doc.instances.map((i) => i.id);

    it('positive control: from the page body it groups, then ungroups, and prevents the browser default', async () => {
      await mountGrouped();
      expect(fireEvent.keyDown(document.body, { key: 'g', ctrlKey: true })).toBe(false);
      expect(ids()).toHaveLength(1);
      expect(ids()).not.toEqual(['i1']);
      expect(fireEvent.keyDown(document.body, { key: 'G', ctrlKey: true, shiftKey: true })).toBe(false);
      expect(ids()).toEqual(['i1']);
    });

    it('Cmd+G (metaKey) groups the same way; Alt+Ctrl+G does not', async () => {
      await mountGrouped();
      expect(fireEvent.keyDown(document.body, { key: 'g', ctrlKey: true, altKey: true })).toBe(true);
      expect(ids()).toEqual(['i1']);
      expect(fireEvent.keyDown(document.body, { key: 'g', metaKey: true })).toBe(false);
      expect(ids()).toHaveLength(1);
      expect(ids()).not.toEqual(['i1']);
    });

    it('does nothing in a text field: no group, no ungroup, not prevented', async () => {
      await mountGrouped();
      const field = screen.getByLabelText('Project name');
      act(() => field.focus());
      const past = useStore.getState().past.length;
      expect(fireEvent.keyDown(field, { key: 'g', ctrlKey: true })).toBe(true);
      expect(ids()).toEqual(['i1']);
      expect(fireEvent.keyDown(field, { key: 'G', ctrlKey: true, shiftKey: true })).toBe(true);
      expect(ids()).toEqual(['i1']);
      expect(useStore.getState().past.length).toBe(past);
      act(() => field.blur());
    });

    it.each([['the cut list', 'cutlist'], ['a dialog (Generate)', 'generate']])('does nothing behind %s: no group, no ungroup, not prevented', async (_name, button) => {
      const user = await mountGrouped();
      const past = useStore.getState().past.length;
      if (button === 'generate') await claudeItem(user, 'Generate…');
      else await user.click(screen.getByRole('button', { name: /cut list/i }));
      expect(document.querySelector('.app-shell')!.hasAttribute('inert')).toBe(true);
      expect(fireEvent.keyDown(window, { key: 'g', ctrlKey: true })).toBe(true);
      expect(ids()).toEqual(['i1']);
      // and the ungroup half, with an assembly selected
      act(() => useStore.getState().selectBoard('i1'));
      expect(fireEvent.keyDown(window, { key: 'G', ctrlKey: true, shiftKey: true })).toBe(true);
      expect(ids()).toEqual(['i1']);
      expect(useStore.getState().doc.boards.map((b) => b.id)).toEqual(['r1']);
      expect(useStore.getState().past.length).toBe(past);
    });
  });

  // Fu 228 / CLAUDE.md "App.tsx keys": Escape's ladder is grabbed, tapeAxis,
  // tapeAnchor, tool, and last the open assembly. One rung per press, and a
  // press with nothing left to back out of is not prevented.
  describe('Escape backs out one rung at a time (fu 228)', () => {
    const mount = async () => {
      render(<App />);
      await act(async () => { await Promise.resolve(); });
      act(() => { useStore.getState().setTool('select'); useStore.getState().replaceDocument(assemblyDoc()); });
    };
    const hold = (id: string) => boardSnapPoints(worldParts(useStore.getState().doc).find((b) => b.id === id)!)[0]!;
    const esc = (target: Window | Element = window) => fireEvent.keyDown(target, { key: 'Escape' });
    const state = () => {
      const t = useStore.getState();
      return [t.grabbed ? 'grabbed' : null, t.tapeAxis, t.tapeAnchor ? 'anchor' : null, t.tool, t.openPath];
    };

    it('runs grabbed, axis, anchor, tool, then each open level, and then does nothing (not prevented)', async () => {
      await mount();
      act(() => {
        useStore.getState().openAssembly('i1');
        useStore.getState().openAssembly('i1/i2');
        useStore.getState().setTool('tape');
        // setTool clears held points, so they are set after it
        useStore.setState({ grabbed: hold('r1') as never, tapeAxis: 'x', tapeAnchor: hold('r1') });
      });
      expect(state()).toEqual(['grabbed', 'x', 'anchor', 'tape', 'i1/i2']);
      const steps = [
        [null, 'x', 'anchor', 'tape', 'i1/i2'],
        [null, null, 'anchor', 'tape', 'i1/i2'],
        [null, null, null, 'tape', 'i1/i2'],
        [null, null, null, 'select', 'i1/i2'],
        [null, null, null, 'select', 'i1'],
        [null, null, null, 'select', null],
      ];
      for (const want of steps) {
        expect(esc()).toBe(false);                         // every rung that acts prevents the default
        expect(state()).toEqual(want);
      }
      expect(esc()).toBe(true);                            // nothing left: the event is not claimed
      expect(state()).toEqual([null, null, null, 'select', null]);
    });

    it('a grab goes before the tool even when only those two are held', async () => {
      await mount();
      act(() => { useStore.getState().setTool('move'); useStore.setState({ grabbed: hold('r1') as never }); });
      esc();
      expect(state()).toEqual([null, null, null, 'move', null]);
      esc();
      expect(state()).toEqual([null, null, null, 'select', null]);
    });

    it('the tool goes before an open assembly closes', async () => {
      await mount();
      act(() => { useStore.getState().openAssembly('i1'); useStore.getState().setTool('move'); });
      esc();
      expect(state()).toEqual([null, null, null, 'select', 'i1']);
      esc();
      expect(state()).toEqual([null, null, null, 'select', null]);
    });

    it('behind the cut list the held points survive: the sheet takes the first Escape, the ladder the second', async () => {
      await mount();
      const user = userEvent.setup();
      act(() => { useStore.getState().setTool('move'); useStore.setState({ grabbed: hold('r1') as never }); });
      await user.click(screen.getByRole('button', { name: /cut list/i }));
      await user.keyboard('{Escape}');
      expect(document.querySelector('.app-shell')!.hasAttribute('inert')).toBe(false);
      expect(state()).toEqual(['grabbed', null, null, 'move', null]);
      await user.keyboard('{Escape}');
      expect(state()).toEqual([null, null, null, 'move', null]);
    });

    it('in a text field Escape leaves the ladder alone', async () => {
      await mount();
      act(() => { useStore.getState().openAssembly('i1'); useStore.setState({ grabbed: hold('r1') as never }); });
      const field = screen.getByLabelText('Project name');
      act(() => field.focus());
      expect(esc(field)).toBe(true);
      expect(state()).toEqual(['grabbed', null, null, 'select', 'i1']);
      act(() => field.blur());
    });
  });

  it('Add joinery lists the sites of a design whose parts are all inside one assembly', async () => {
    llmSettings = { provider: 'anthropic', apiKey: 'k', model: 'claude-opus-5-5' };
    render(<App />);
    await act(async () => { await Promise.resolve(); });
    const flat = designToDocument({
      name: 'T',
      parts: [
        { name: 'Leg', material: 'oak', at: { x: 0, y: 0, z: 0 }, size: { x: 1.75, y: 28, z: 1.75 } },
        { name: 'Rail', material: 'oak', at: { x: 1.75, y: 23.5, z: 0.5 }, size: { x: 18, y: 3.5, z: 0.75 } },
      ],
    }).doc;
    const grouped = groupItems(flat, null, worldParts(flat).map((b) => b.id))!.doc;
    expect(grouped.boards).toHaveLength(0);
    act(() => { useStore.getState().replaceDocument(grouped); });
    const user = userEvent.setup();
    await claudeItem(user, 'Add joinery…');
    const dialog = await screen.findByRole('dialog', { name: 'Add joinery' });
    expect(dialog.querySelectorAll('li').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/No joints to add/)).toBeNull();
  });
});

describe('App edit lock while exploded', () => {
  it('locks Properties and the guides footer while exploded', async () => {
    await mountWithOneBoard();
    const lock = document.querySelector('.panel-props fieldset.edit-lock') as HTMLFieldSetElement;
    expect(lock.disabled).toBe(false);
    act(() => useStore.getState().setExplode(0.4));
    expect(lock.disabled).toBe(true);
    expect(lock.title).toBe('Slide Explode back to 0 to edit');
    // The Angles "+ Add ▾" menu trigger sits inside the lock, so it is disabled with it.
    const addAngle = screen.getByRole('button', { name: '+ Add' }) as HTMLButtonElement;
    expect(addAngle.matches(':disabled')).toBe(true);
    act(() => useStore.getState().setExplode(0));
    expect(addAngle.matches(':disabled')).toBe(false);
  });

  it('locks the guides footer while exploded', async () => {
    await mountWithOneBoard();
    const footer = document.querySelector('.panel-guides') as HTMLElement;
    const lock = footer.closest('fieldset.edit-lock') as HTMLFieldSetElement;
    expect(lock).not.toBeNull();
    expect(lock.disabled).toBe(false);
    act(() => useStore.getState().setExplode(0.4));
    expect(lock.disabled).toBe(true);
    expect(lock.title).toBe('Slide Explode back to 0 to edit');
    act(() => useStore.getState().setExplode(0));
  });
});
