import { BrowserStorageAdapter, AUTOSAVE_KEY } from './browser';
import { createBoard, createDocument, DocumentError } from '../document/document';

class FakeStorage implements Storage {
  private map = new Map<string, string>();
  full = false;

  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.get(k) ?? null; }
  removeItem(k: string) { this.map.delete(k); }
  setItem(k: string, v: string) {
    if (this.full) {
      const e = new Error('QuotaExceededError');
      e.name = 'QuotaExceededError';
      throw e;
    }
    this.map.set(k, v);
  }
}

const docWithBoard = () => {
  const doc = createDocument('Bench');
  doc.boards.push(createBoard({ name: 'Top' }));
  return doc;
};

describe('autoSave / loadAutoSaved', () => {
  it('round-trips a document', async () => {
    const fake = new FakeStorage();
    const a = new BrowserStorageAdapter(fake);
    const doc = docWithBoard();
    await a.autoSave(doc);
    expect(await a.loadAutoSaved()).toEqual(doc);
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
    await a.autoSave(docWithBoard());
    expect(a.available).toBe(false);
  });

  it('reports unavailability when storage itself is missing', async () => {
    const a = new BrowserStorageAdapter(null);
    await a.autoSave(docWithBoard());
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
