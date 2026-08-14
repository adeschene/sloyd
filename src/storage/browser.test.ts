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

const docWithBoard = () => {
  const doc = createDocument('Bench');
  doc.boards.push(createBoard({ name: 'Top' }));
  return doc;
};

describe('autoSave / loadAutoSaved', () => {
  it('round-trips a document through the id it is given', async () => {
    // autoSave now writes to the project it is told, not to AUTOSAVE_KEY —
    // loadAutoSaved is the legacy read path openLibrary uses for adoption,
    // not autoSave's counterpart any more. loadProject is.
    const fake = new FakeStorage();
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
    fake.full = true;
    const a = new BrowserStorageAdapter(fake);
    await a.autoSave('some-id', docWithBoard());
    expect(a.available).toBe(false);
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
