import { BrowserStorageAdapter, AUTOSAVE_KEY, LIBRARY_KEY, PROJECT_PREFIX } from './browser';
import { createBoard, createDocument, DocumentError } from '../document/document';
import { LAYOUT_VERSION } from './libraryIndex';

class FakeStorage implements Storage {
  private map = new Map<string, string>();
  full = false;
  /** Every key ever passed to setItem, success or failure, in call order. */
  written: string[] = [];

  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.get(k) ?? null; }
  removeItem(k: string) { this.map.delete(k); }
  setItem(k: string, v: string) {
    this.written.push(k);
    if (this.full) {
      const e = new Error('QuotaExceededError');
      e.name = 'QuotaExceededError';
      throw e;
    }
    this.map.set(k, v);
  }
}

/**
 * Simulates a write that silently does not persist: setItem for a
 * `sloyd.project.*` key succeeds (no throw) but reading it straight back
 * returns null, as a corrupted/dropped write would. Exists to pin
 * `adopt`'s write-verify-then-commit ORDER: without the round-trip check
 * gating the index write, this storage would still end up with a committed
 * index pointing at an unreadable project.
 */
class GhostProjectWriteStorage extends FakeStorage {
  getItem(k: string) {
    if (k.startsWith(PROJECT_PREFIX)) return null;
    return super.getItem(k);
  }
}

/**
 * Project writes stop ROUND-TRIPPING once this is set: `setItem` still
 * succeeds, but reading a `sloyd.project.*` key back returns null, the way a
 * dropped or corrupted write would. Index writes keep working throughout, and
 * that combination is the whole point — the QUOTA variant self-recovers (the
 * index write fails too, so the row survives and the next autosave restores
 * it), and only a dropped project write with a working index loses data.
 * Toggleable, unlike `GhostProjectWriteStorage` above, so a test can set a
 * library up normally and then break it partway through.
 */
class DroppedProjectWriteStorage extends FakeStorage {
  dropProjectWrites = false;
  getItem(k: string) {
    if (this.dropProjectWrites && k.startsWith(PROJECT_PREFIX)) return null;
    return super.getItem(k);
  }
}

const docWithBoard = () => {
  const doc = createDocument('Bench');
  doc.boards.push(createBoard({ name: 'Top' }));
  return doc;
};

/**
 * Seed an index naming exactly these ids. `autoSave` REFUSES an id with no
 * index row (see its own comment), so any test calling it directly has to say
 * which projects the library knows about — seeding is not incidental setup.
 */
const seedIndex = (store: Storage, ...ids: string[]) => {
  store.setItem(
    LIBRARY_KEY,
    JSON.stringify({
      layout: LAYOUT_VERSION,
      activeId: ids[0] ?? '',
      projects: ids.map((id) => ({ id, name: id, savedAt: 1, createdAt: 1 })),
    }),
  );
};

describe('autoSave / loadAutoSaved', () => {
  it('round-trips a document through the id it is given', async () => {
    // autoSave now writes to the project it is told, not to AUTOSAVE_KEY —
    // loadAutoSaved is the legacy read path openLibrary uses for adoption,
    // not autoSave's counterpart any more. loadProject is.
    const fake = new FakeStorage();
    seedIndex(fake, 'some-id');
    const a = new BrowserStorageAdapter(fake);
    const doc = docWithBoard();
    await a.autoSave('some-id', doc);
    expect(await a.loadProject('some-id')).toEqual(doc);
  });

  it('returns null when nothing has been saved', async () => {
    const a = new BrowserStorageAdapter(new FakeStorage());
    expect(await a.loadAutoSaved()).toBeNull();
  });

  it('returns null rather than throwing on malformed stored JSON', async () => {
    const fake = new FakeStorage();
    fake.setItem(AUTOSAVE_KEY, '{not json');
    const a = new BrowserStorageAdapter(fake);
    expect(await a.loadAutoSaved()).toBeNull();
  });

  it('returns null when stored JSON is valid but not a Sloyd document', async () => {
    const fake = new FakeStorage();
    fake.setItem(AUTOSAVE_KEY, '{"hello":"world"}');
    const a = new BrowserStorageAdapter(fake);
    expect(await a.loadAutoSaved()).toBeNull();
  });

  it('reports unavailability instead of throwing when the quota is exceeded', async () => {
    const fake = new FakeStorage();
    // Seeded BEFORE `full` is set, and load-bearing: without a row for
    // 'some-id' the refusal added for Finding 1 short-circuits ahead of
    // `setItem` and this test goes green without ever reaching the quota path
    // it is named for — a cannot-fail test manufactured by an unrelated fix.
    seedIndex(fake, 'some-id');
    fake.full = true;
    const a = new BrowserStorageAdapter(fake);
    await a.autoSave('some-id', docWithBoard());
    expect(a.available).toBe(false);
  });

  it('refuses an id with no index row rather than writing a project nothing lists (Finding 1)', async () => {
    const fake = new FakeStorage();
    const a = new BrowserStorageAdapter(fake, () => 1000);
    const { activeId } = await a.openLibrary();

    await a.autoSave('ghost', createDocument('Ghost'));

    // `touchEntry` only ever updates a row that ALREADY exists, so writing
    // here would produce a key no `listProjects` can ever show while
    // reporting success — and, worse, would flip `available` back to true
    // after a real failure had turned it off.
    expect(a.available).toBe(false);
    expect(fake.getItem(PROJECT_PREFIX + 'ghost')).toBeNull();
    expect((await a.listProjects()).map((p) => p.id)).toEqual([activeId]);
  });

  it('reports unavailability when storage itself is missing', async () => {
    const a = new BrowserStorageAdapter(null);
    await a.autoSave('some-id', docWithBoard());
    expect(a.available).toBe(false);
    expect(await a.loadAutoSaved()).toBeNull();
  });
});

describe('parseProjectFile', () => {
  it('accepts a serialized document', () => {
    const a = new BrowserStorageAdapter(new FakeStorage());
    const doc = docWithBoard();
    expect(a.parseProjectFile(JSON.stringify(doc))).toEqual(doc);
  });

  it('throws DocumentError with a readable message on malformed JSON', () => {
    const a = new BrowserStorageAdapter(new FakeStorage());
    expect(() => a.parseProjectFile('{not json')).toThrow(DocumentError);
    expect(() => a.parseProjectFile('{not json')).toThrow(/not a valid Sloyd project file/i);
  });

  it('propagates the version message for a future-version file', () => {
    const a = new BrowserStorageAdapter(new FakeStorage());
    const future = JSON.stringify({ ...createDocument(), version: 99 });
    expect(() => a.parseProjectFile(future)).toThrow(/newer version of Sloyd/i);
  });
});

describe('importProject', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('rejects (does not hang) when the file picker is cancelled via the `cancel` event', async () => {
    const a = new BrowserStorageAdapter(new FakeStorage());
    let capturedInput: HTMLInputElement | undefined;
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
      this: HTMLInputElement,
    ) {
      capturedInput = this;
    });

    const promise = a.importProject();
    expect(capturedInput).toBeDefined();
    capturedInput!.dispatchEvent(new Event('cancel'));

    await expect(promise).rejects.toMatchObject({
      name: 'DocumentError',
      message: expect.stringMatching(/cancel/i),
      // FileMenu branches on this field, not the message text (see Fix 7 in
      // the final review) — pin the producer side of that contract here so
      // a change to this constructor call can't silently break it.
      cancelled: true,
    });
  });

  it('rejects via the focus-fallback when the browser fires neither `change` nor `cancel`', async () => {
    vi.useFakeTimers();
    const a = new BrowserStorageAdapter(new FakeStorage());
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});

    const promise = a.importProject();
    // Attach the rejection handler before advancing timers so the rejection
    // that fires mid-`advanceTimersByTimeAsync` is never briefly unhandled.
    const assertion = expect(promise).rejects.toMatchObject({
      name: 'DocumentError',
      message: expect.stringMatching(/cancel/i),
      cancelled: true,
    });
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(400);

    await assertion;
  });

  it('resolves normally when a file is chosen, and does not also fire the focus-fallback', async () => {
    vi.useFakeTimers();
    const a = new BrowserStorageAdapter(new FakeStorage());
    const doc = docWithBoard();
    const file = new File([JSON.stringify(doc)], 'bench.sloyd', { type: 'application/json' });

    let capturedInput: HTMLInputElement | undefined;
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
      this: HTMLInputElement,
    ) {
      capturedInput = this;
      Object.defineProperty(this, 'files', { value: [file], configurable: true });
    });

    const promise = a.importProject();
    window.dispatchEvent(new Event('focus'));
    capturedInput!.dispatchEvent(new Event('change'));
    await vi.advanceTimersByTimeAsync(400);

    await expect(promise).resolves.toEqual(doc);
  });
});

describe('exportProject', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    // jsdom does not implement these; stub them for the duration of this suite.
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  it('names the file from the sanitized document name', async () => {
    const a = new BrowserStorageAdapter(new FakeStorage());
    const doc = { ...docWithBoard(), name: 'My Bench!' };

    // jsdom would otherwise attempt (and log a warning about) a real
    // navigation to the fake blob: URL when the anchor is clicked.
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    let capturedAnchor: HTMLAnchorElement | undefined;
    vi.spyOn(document.body, 'appendChild').mockImplementation(function (
      this: HTMLElement,
      node: Node,
    ) {
      if (node instanceof HTMLAnchorElement) capturedAnchor = node;
      return HTMLElement.prototype.appendChild.call(this, node) as Node;
    });

    await a.exportProject(doc);

    expect(capturedAnchor?.download).toBe('My-Bench.sloyd');
  });

  it('removes the anchor and revokes the object URL even when click() throws', async () => {
    const a = new BrowserStorageAdapter(new FakeStorage());
    const doc = docWithBoard();

    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('blocked by CSP');
    });

    let capturedAnchor: HTMLAnchorElement | undefined;
    vi.spyOn(document.body, 'appendChild').mockImplementation(function (
      this: HTMLElement,
      node: Node,
    ) {
      if (node instanceof HTMLAnchorElement) capturedAnchor = node;
      return HTMLElement.prototype.appendChild.call(this, node) as Node;
    });

    await expect(a.exportProject(doc)).rejects.toThrow('blocked by CSP');

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    expect(capturedAnchor).toBeDefined();
    expect(document.body.contains(capturedAnchor!)).toBe(false);
  });
});

describe('capabilities', () => {
  it('reports no recent files or real paths in the browser', () => {
    const a = new BrowserStorageAdapter(new FakeStorage());
    expect(a.capabilities).toEqual({ recentFiles: false, realPaths: false });
  });

  it('lists no recent projects', async () => {
    const a = new BrowserStorageAdapter(new FakeStorage());
    expect(await a.listRecent()).toEqual([]);
  });
});

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

  it('does not commit the index when the adopted project write silently fails to persist', async () => {
    // Pins the write-verify-THEN-commit ORDER in `adopt`: setItem succeeds
    // (no throw) but the round-trip read comes back null, as a dropped or
    // corrupted write would. If the index write were ever moved ahead of
    // the verification, this would still end up with a committed index
    // pointing at an unreadable project.
    const store = new GhostProjectWriteStorage();
    const legacy = docWithBoard();
    store.setItem(AUTOSAVE_KEY, JSON.stringify(legacy));

    const { libraryAvailable, doc } = await new BrowserStorageAdapter(store, () => 1000).openLibrary();

    expect(libraryAvailable).toBe(false);
    expect(doc).toEqual(legacy);
    expect(store.getItem(LIBRARY_KEY)).toBeNull();
  });

  it('never calls setItem on AUTOSAVE_KEY during adoption', async () => {
    // Finding 3: the byte-identity test above cannot distinguish "never
    // written" from "written back with identical bytes" — a v6 document
    // round-trips through migrateDocument unchanged either way. Assert on
    // the call log itself instead.
    const store = new FakeStorage();
    store.setItem(AUTOSAVE_KEY, JSON.stringify(docWithBoard()));
    store.written = []; // isolate to writes made by openLibrary itself

    await new BrowserStorageAdapter(store, () => 1000).openLibrary();

    expect(store.written).not.toContain(AUTOSAVE_KEY);
  });

  it('refuses to adopt over a present index it cannot parse (an unrecognised layout)', async () => {
    // The worst case from Finding 2: a newer build's `layout: 2` index,
    // naming real projects, must not be silently rewritten to a
    // single-entry layout-1 index built from the stale legacy document.
    const store = new FakeStorage();
    const foreignIndex = {
      layout: 2,
      activeId: 'p1',
      projects: [{ id: 'p1', name: 'Future Project', savedAt: 5, createdAt: 5 }],
    };
    const rawIndex = JSON.stringify(foreignIndex);
    store.setItem(LIBRARY_KEY, rawIndex);
    store.setItem(AUTOSAVE_KEY, JSON.stringify(docWithBoard()));
    store.written = []; // isolate to writes made by openLibrary itself

    const { doc, libraryAvailable } = await new BrowserStorageAdapter(store, () => 1000).openLibrary();

    expect(libraryAvailable).toBe(false);
    // Byte-identical: nothing was written, to the index or anywhere else.
    expect(store.getItem(LIBRARY_KEY)).toBe(rawIndex);
    expect(store.written).toEqual([]);
    expect(doc.name).toBe('Bench');
  });

  it('falls back to the most recently saved loadable project when activeId names a missing key', async () => {
    const store = new FakeStorage();
    const older = docWithBoard();
    older.name = 'Older';
    const newer = docWithBoard();
    newer.name = 'Newer';
    store.setItem(PROJECT_PREFIX + 'older-id', JSON.stringify(older));
    store.setItem(PROJECT_PREFIX + 'newer-id', JSON.stringify(newer));
    const index = {
      layout: LAYOUT_VERSION,
      activeId: 'missing-id',
      projects: [
        { id: 'older-id', name: 'Older', savedAt: 1000, createdAt: 1000 },
        { id: 'newer-id', name: 'Newer', savedAt: 2000, createdAt: 2000 },
      ],
    };
    store.setItem(LIBRARY_KEY, JSON.stringify(index));

    const { activeId, doc, libraryAvailable } = await new BrowserStorageAdapter(store, () => 3000).openLibrary();

    expect(libraryAvailable).toBe(true);
    expect(activeId).toBe('newer-id');
    expect(doc.name).toBe('Newer');
    // Must not re-adopt: still exactly the two projects the index named.
    expect(JSON.parse(store.getItem(LIBRARY_KEY)!).projects).toHaveLength(2);
  });

  it('adds a fresh Untitled project to an existing empty index, never re-adopting the legacy key', async () => {
    const store = new FakeStorage();
    const staleLegacy = docWithBoard();
    staleLegacy.name = 'Stale';
    store.setItem(AUTOSAVE_KEY, JSON.stringify(staleLegacy));
    const index = { layout: LAYOUT_VERSION, activeId: '', projects: [] };
    store.setItem(LIBRARY_KEY, JSON.stringify(index));

    const { doc, libraryAvailable } = await new BrowserStorageAdapter(store, () => 1000).openLibrary();

    expect(libraryAvailable).toBe(true);
    expect(doc.name).toBe('Untitled');
    expect(doc.boards).toEqual([]);
    const updated = JSON.parse(store.getItem(LIBRARY_KEY)!);
    expect(updated.projects).toHaveLength(1);
  });

  it('refuses to adopt over a present index that is corrupt JSON, even with a real project key present', async () => {
    // Fix round 2, finding 2 reopened: readJSON collapsed "present but
    // corrupt" into the same null as "absent", so this shape used to sail
    // past the absent-key check and adopt over a real, orphaned project.
    const store = new FakeStorage();
    const real = docWithBoard();
    store.setItem(PROJECT_PREFIX + 'p1', JSON.stringify(real));
    const rawIndex = '{not json at all';
    store.setItem(LIBRARY_KEY, rawIndex);
    store.setItem(AUTOSAVE_KEY, JSON.stringify(docWithBoard()));
    store.written = []; // isolate to writes made by openLibrary itself

    const { doc, libraryAvailable } = await new BrowserStorageAdapter(store, () => 1000).openLibrary();

    expect(libraryAvailable).toBe(false);
    expect(store.getItem(LIBRARY_KEY)).toBe(rawIndex);
    expect(store.written).toEqual([]);
    expect(doc.name).toBe('Bench');
  });

  // Fix round on Task 4, Finding 2: this refusal branch used to leave
  // `_available` untouched, so a working store with an unusable index left
  // the app claiming "Saved locally" while writing nothing anywhere and a
  // reload would lose the session. A refused index means one EXISTS, so
  // adoption already happened and AUTOSAVE_KEY is stale by definition —
  // writing to it would destroy the round's entire rollback story, so there
  // is no honest place left to persist to and `available` must say so.
  it('flips `available` false on a refused (corrupt or unrecognised) index, even with a working store', async () => {
    const store = new FakeStorage();
    store.setItem(LIBRARY_KEY, '{not json at all');

    const adapter = new BrowserStorageAdapter(store, () => 1000);
    expect(adapter.available).toBe(true); // sanity: the store itself works

    const { libraryAvailable } = await adapter.openLibrary();

    expect(libraryAvailable).toBe(false);
    expect(adapter.available).toBe(false);
  });

  it('treats a present-but-empty-string index as PRESENT, not absent', async () => {
    const store = new FakeStorage();
    store.setItem(LIBRARY_KEY, '');
    store.setItem(AUTOSAVE_KEY, JSON.stringify(docWithBoard()));
    store.written = []; // isolate to writes made by openLibrary itself

    const { doc, libraryAvailable } = await new BrowserStorageAdapter(store, () => 1000).openLibrary();

    expect(libraryAvailable).toBe(false);
    expect(store.getItem(LIBRARY_KEY)).toBe('');
    expect(store.written).toEqual([]);
    expect(doc.name).toBe('Bench');
  });

  it('adds a fresh Untitled project when the index names projects but none of them are loadable (R9)', async () => {
    const store = new FakeStorage();
    const index = {
      layout: LAYOUT_VERSION,
      activeId: 'missing-a',
      projects: [
        { id: 'missing-a', name: 'A', savedAt: 1000, createdAt: 1000 },
        { id: 'missing-b', name: 'B', savedAt: 2000, createdAt: 2000 },
      ],
    };
    store.setItem(LIBRARY_KEY, JSON.stringify(index));
    store.setItem(AUTOSAVE_KEY, JSON.stringify(docWithBoard()));

    const { activeId, doc, libraryAvailable } = await new BrowserStorageAdapter(store, () => 3000).openLibrary();

    expect(libraryAvailable).toBe(true);
    expect(doc.name).toBe('Untitled');
    expect(doc.boards).toEqual([]);
    const updated = JSON.parse(store.getItem(LIBRARY_KEY)!);
    // The two unloadable entries are kept as-is; a third, loadable one joins them.
    expect(updated.projects).toHaveLength(3);
    expect(updated.activeId).toBe(activeId);
  });

  it('does not commit the index when addUntitledProject writes a project that silently fails to persist', async () => {
    // Extends the write-verify-then-commit pin (finding 1) to the second
    // place that shape is written, not just `adopt`.
    const store = new GhostProjectWriteStorage();
    const rawIndex = JSON.stringify({ layout: LAYOUT_VERSION, activeId: '', projects: [] });
    store.setItem(LIBRARY_KEY, rawIndex);

    const { libraryAvailable } = await new BrowserStorageAdapter(store, () => 1000).openLibrary();

    expect(libraryAvailable).toBe(false);
    expect(store.getItem(LIBRARY_KEY)).toBe(rawIndex);
  });
});

/**
 * Simulates a store where every OTHER key persists normally but a write to
 * LIBRARY_KEY throws while `failIndex` is set — e.g. that key straddling a
 * quota boundary a smaller project key does not. Distinct from
 * GhostProjectWriteStorage (which drops a PROJECT key's write silently):
 * this one throws, and only on the index key, so a caller's own project
 * write can genuinely succeed while the index commit that is supposed to
 * follow it fails. Exists to probe fix-round-1 Finding 1: `available` must
 * not be set true after a successful project write if the index write that
 * follows it fails — `FakeStorage.full` can't isolate this because it fails
 * on the FIRST setItem, masking the ordering bug behind a single catch.
 * `failIndex` starts false so tests can seed LIBRARY_KEY before arming it.
 */
class FailingIndexWriteStorage extends FakeStorage {
  failIndex = false;
  setItem(k: string, v: string) {
    if (this.failIndex && k === LIBRARY_KEY) {
      this.written.push(k);
      const e = new Error('QuotaExceededError');
      e.name = 'QuotaExceededError';
      throw e;
    }
    super.setItem(k, v);
  }
}

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
    expect(JSON.parse(store.getItem(PROJECT_PREFIX + other!)!).boards).toEqual([]);
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

  it('autoSave does not report available when the index write fails, even though the project write persisted (Finding 1)', async () => {
    const store = new FailingIndexWriteStorage();
    store.setItem(LIBRARY_KEY, JSON.stringify({
      layout: LAYOUT_VERSION,
      activeId: 'p1',
      projects: [{ id: 'p1', name: 'Bench', savedAt: 1, createdAt: 1 }],
    }));
    store.failIndex = true;
    const adapter = new BrowserStorageAdapter(store, () => 5000);

    await adapter.autoSave('p1', createDocument('Renamed'));

    // The project write DID persist...
    expect(JSON.parse(store.getItem(PROJECT_PREFIX + 'p1')!).name).toBe('Renamed');
    // ...but `available` must reflect the index write's failure, not the
    // unrelated project write's success. This is the half of invariant 7
    // that `autoSave` not throwing does not by itself satisfy.
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
    expect(JSON.parse(store.getItem(PROJECT_PREFIX + id!)!).name).toBe('Fresh');
    expect((await adapter.listProjects()).map((p) => p.name)).toContain('Fresh');
  });

  it('does not commit the index when createProject writes a project that silently fails to persist', async () => {
    // Extends the write-verify-then-commit pin to the third caller of the
    // shared primitive (R10) — adopt and addUntitledProject already have
    // this test's siblings in the openLibrary suite above.
    const store = new GhostProjectWriteStorage();
    const rawIndex = JSON.stringify({
      layout: LAYOUT_VERSION,
      activeId: 'existing',
      projects: [{ id: 'existing', name: 'Existing', savedAt: 1, createdAt: 1 }],
    });
    store.setItem(LIBRARY_KEY, rawIndex);
    const adapter = new BrowserStorageAdapter(store, () => 1000);

    await adapter.createProject(createDocument('Doomed'));

    expect(adapter.available).toBe(false);
    expect(store.getItem(LIBRARY_KEY)).toBe(rawIndex);
  });

  it('createProject does not report available, returns null, and cleans up the orphaned key when the index write fails (Finding 1)', async () => {
    const store = new FailingIndexWriteStorage();
    store.setItem(LIBRARY_KEY, JSON.stringify({ layout: LAYOUT_VERSION, activeId: '', projects: [] }));
    store.failIndex = true;
    const adapter = new BrowserStorageAdapter(store, () => 1000);
    const before = store.length;

    const id = await adapter.createProject(createDocument('Doomed'));

    expect(id).toBeNull();
    expect(adapter.available).toBe(false);
    // No permanent orphan: the project key that was written before the
    // index commit failed is cleaned up, not left behind with no row.
    expect(store.length).toBe(before);
  });

  it('deleting the last project reports failure when the replacement cannot be written, and no later autosave claims success for the deleted one (Finding 1)', async () => {
    // The end-to-end shape of the critical finding. The storage double fails
    // PROJECT writes while letting INDEX writes through: the quota variant
    // self-recovers, this one does not.
    const store = new DroppedProjectWriteStorage();
    const adapter = new BrowserStorageAdapter(store, () => 1000);
    const { activeId } = await adapter.openLibrary();
    store.dropProjectWrites = true;

    const next = await adapter.deleteProject(activeId);

    // The index is now empty and the replacement `createProject` failed, so
    // there is nothing for the caller to adopt — which leaves React's
    // `activeId` still naming the DELETED project.
    expect(next).toBeNull();
    expect(adapter.available).toBe(false);
    expect(await adapter.listProjects()).toEqual([]);

    // That stale id is exactly what the next autosave arrives with. It must
    // stay refused: writing the key would succeed, `touchEntry` would map no
    // row, the index write would succeed, and `available` would flip back to
    // TRUE — the indicator reading "Saved locally" while the work is
    // invisible to the menu and gone on the next reload.
    await adapter.autoSave(activeId, docWithBoard());

    expect(adapter.available).toBe(false);
    expect(await adapter.listProjects()).toEqual([]);
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

  // Fix round 1, Finding 1: `duplicateProject` delegates to `createProject`,
  // which used to unconditionally activate the id it just wrote — so a
  // duplicate silently repointed the PERSISTED active project at the copy
  // while the caller's own `activeId` state, the on-screen document and the
  // menu's `aria-current` all stayed on the original. No data loss (both
  // documents persist, autosave keeps writing the original id), but the
  // NEXT BOOT would open the copy instead of what the user was looking at.
  // Read the index straight off `store`, not through `listProjects` (which
  // doesn't expose `activeId`) or `openLibrary` (which would itself repair
  // a wrong value by re-deriving `ordered` — this test needs the raw
  // written value, not openLibrary's best effort to recover from it).
  it('duplicateProject does not move the persisted active project to the copy', async () => {
    const { store, adapter, activeId } = await boot();

    const copyId = await adapter.duplicateProject(activeId);

    const index = JSON.parse(store.getItem(LIBRARY_KEY)!);
    expect(index.activeId).toBe(activeId);
    expect(index.activeId).not.toBe(copyId);
  });

  it('deleteProject removes the key and the row', async () => {
    const { store, adapter, activeId } = await boot();
    const other = await adapter.createProject(createDocument('Other'));

    await adapter.deleteProject(other!);

    expect(store.getItem(PROJECT_PREFIX + other!)).toBeNull();
    expect((await adapter.listProjects()).map((p) => p.id)).toEqual([activeId]);
  });

  it('deleting a project that is NOT active leaves the active project untouched (Finding 2)', async () => {
    // Bounds against `activeId`, a value pinned via `setActiveProject` —
    // a call independent of `deleteProject` — rather than a value
    // `deleteProject` picks itself (invariant 23's shape: a test that
    // derives its expectation from the call under test cannot fail).
    let clock = 1000;
    const { store, adapter, activeId } = await boot(() => clock);
    clock = 2000;
    const other = await adapter.createProject(createDocument('Other'));
    clock = 3000;
    const another = await adapter.createProject(createDocument('Another'));
    // createProject moves the active pointer to whatever it just created —
    // pin it back to the original project, independent of the delete below.
    await adapter.setActiveProject(activeId);

    const result = await adapter.deleteProject(other!);

    // null means "nothing about the open project changed" (Finding 4) — a
    // background delete must never hand the caller a different active
    // project than the one it already had open.
    expect(result).toBeNull();
    const index = JSON.parse(store.getItem(LIBRARY_KEY)!);
    expect(index.activeId).toBe(activeId);
    expect((await adapter.listProjects()).map((p) => p.id).sort()).toEqual(
      [activeId, another].sort(),
    );
  });

  it('deleting the active project switches to the most recently saved survivor, not merely the last-inserted or first-inserted one (Finding 6)', async () => {
    // The survivor with the highest savedAt sits in the MIDDLE of the
    // remaining projects' insertion order, so this can only pass if the
    // code actually sorts by savedAt — picking `[0]` or `[length - 1]`
    // without sorting both land on the wrong project.
    let clock = 1000;
    const { adapter, activeId } = await boot(() => clock);
    clock = 2000;
    await adapter.createProject(createDocument('InsertedFirst'));
    clock = 5000;
    const mostRecent = await adapter.createProject(createDocument('MostRecentlySaved'));
    clock = 3000;
    await adapter.createProject(createDocument('InsertedLast'));
    // createProject already left `InsertedLast` active as a side effect —
    // pin it back to the ORIGINAL boot project explicitly so this test
    // actually deletes the active project.
    await adapter.setActiveProject(activeId);

    const next = await adapter.deleteProject(activeId);

    expect(next).not.toBeNull();
    expect(next!.activeId).toBe(mostRecent);
    expect(next!.doc.name).toBe('MostRecentlySaved');
  });

  it('deleting the last project leaves a fresh Untitled active', async () => {
    // There is never a no-project state, so no component has to render one.
    const { adapter, activeId } = await boot();
    const next = await adapter.deleteProject(activeId);

    expect(next).not.toBeNull();
    expect(next!.doc.name).toBe('Untitled');
    expect(next!.doc.boards).toEqual([]);
    expect(await adapter.listProjects()).toHaveLength(1);
    expect(next!.activeId).toBe((await adapter.listProjects())[0].id);
  });

  it('setActiveProject records which project is open', async () => {
    const { store, adapter, activeId } = await boot();
    await adapter.createProject(createDocument('Other'));

    await adapter.setActiveProject(activeId);

    expect(JSON.parse(store.getItem(LIBRARY_KEY)!).activeId).toBe(activeId);
  });
});

describe('refusing to write over an unusable (but present) index (Finding 3)', () => {
  // Reuses the same corrupt-JSON shape the openLibrary suite above already
  // pins for the read/adopt path; this describes the write path's mirror
  // rule — mutations must refuse it exactly like openLibrary does, not
  // default past it the way a plain read is allowed to.
  const corruptStore = () => {
    const store = new FakeStorage();
    const raw = '{not json at all';
    store.setItem(LIBRARY_KEY, raw);
    return { store, raw };
  };

  it('autoSave refuses rather than committing an empty index over a corrupt one', async () => {
    const { store, raw } = corruptStore();
    store.setItem(PROJECT_PREFIX + 'p1', JSON.stringify(createDocument('Existing')));

    const adapter = new BrowserStorageAdapter(store, () => 1000);
    await adapter.autoSave('p1', createDocument('Renamed'));

    expect(adapter.available).toBe(false);
    expect(store.getItem(LIBRARY_KEY)).toBe(raw);
  });

  it('createProject refuses rather than committing an empty index over a corrupt one', async () => {
    const { store, raw } = corruptStore();
    const adapter = new BrowserStorageAdapter(store, () => 1000);

    const id = await adapter.createProject(createDocument('New'));

    expect(id).toBeNull();
    expect(adapter.available).toBe(false);
    expect(store.getItem(LIBRARY_KEY)).toBe(raw);
  });

  it('deleteProject refuses rather than committing an empty index over a corrupt one, and leaves the project key alone too', async () => {
    const { store, raw } = corruptStore();
    store.setItem(PROJECT_PREFIX + 'p1', JSON.stringify(createDocument('Existing')));
    const adapter = new BrowserStorageAdapter(store, () => 1000);

    const result = await adapter.deleteProject('p1');

    expect(result).toBeNull();
    expect(adapter.available).toBe(false);
    expect(store.getItem(LIBRARY_KEY)).toBe(raw);
    // A partial delete — key gone, corrupt index left untouched — would be
    // worse than refusing the whole operation.
    expect(store.getItem(PROJECT_PREFIX + 'p1')).not.toBeNull();
  });

  it('setActiveProject refuses rather than committing an empty index over a corrupt one', async () => {
    const { store, raw } = corruptStore();
    const adapter = new BrowserStorageAdapter(store, () => 1000);

    await adapter.setActiveProject('p1');

    expect(adapter.available).toBe(false);
    expect(store.getItem(LIBRARY_KEY)).toBe(raw);
  });
});
