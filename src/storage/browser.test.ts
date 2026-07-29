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
