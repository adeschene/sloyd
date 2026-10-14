import { describe, expect, it } from 'vitest';
import { BrowserStorageAdapter, MATERIALS_KEY } from './browser';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  full = false;
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.get(k) ?? null; }
  removeItem(k: string) { this.map.delete(k); }
  setItem(k: string, v: string) {
    if (this.full) throw Object.assign(new Error('QuotaExceededError'), { name: 'QuotaExceededError' });
    this.map.set(k, v);
  }
}

const ash = { id: 'm-s-ash1', label: 'Ash', color: '#d8c8a8', kind: 'solid' as const };

describe('the material library (custom materials spec §2.4)', () => {
  it('reads absent as empty, not failed, and writes nothing', async () => {
    const store = new MemoryStorage();
    expect(await new BrowserStorageAdapter(store).getMaterialLibrary()).toEqual({ materials: [], readFailed: false });
    expect(store.getItem(MATERIALS_KEY)).toBeNull();
  });
  it('round-trips', async () => {
    const a = new BrowserStorageAdapter(new MemoryStorage());
    expect(await a.setMaterialLibrary([ash])).toBe(true);
    expect(await a.getMaterialLibrary()).toEqual({ materials: [ash], readFailed: false });
  });
  it.each([['unparseable', '{'], ['another layout', JSON.stringify({ layout: 2, materials: [ash] })], ['not an object', '[]'],
    ['layout 1 with no materials array', JSON.stringify({ layout: 1, materials: { 'm-s-ash1': ash } })],
    ['layout 1 with materials missing', JSON.stringify({ layout: 1 })]])(
    '%s reads as empty and FAILED, and the stored value is left alone', async (_, raw) => {
      const store = new MemoryStorage();
      store.setItem(MATERIALS_KEY, raw);
      expect(await new BrowserStorageAdapter(store).getMaterialLibrary()).toEqual({ materials: [], readFailed: true });
      expect(store.getItem(MATERIALS_KEY)).toBe(raw);
    });
  it('drops a malformed entry without failing the read', async () => {
    const store = new MemoryStorage();
    store.setItem(MATERIALS_KEY, JSON.stringify({ layout: 1, materials: [ash, { id: 'pine' }] }));
    expect(await new BrowserStorageAdapter(store).getMaterialLibrary()).toEqual({ materials: [ash], readFailed: false });
  });
  it('reports a failed write', async () => {
    const store = new MemoryStorage();
    store.setItem = () => { throw new Error('quota'); };
    expect(await new BrowserStorageAdapter(store).setMaterialLibrary([ash])).toBe(false);
  });
});
