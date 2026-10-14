import { BrowserStorageAdapter, SHOP_KEY } from './browser';
import { defaultShop } from '../document/purchase';

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

describe('shop settings storage', () => {
  it('reads defaults, unflagged, when nothing is stored', async () => {
    expect(await new BrowserStorageAdapter(new MemoryStorage()).getShopSettings()).toEqual({ settings: defaultShop(), readFailed: false });
  });

  it('round-trips what it stores', async () => {
    const a = new BrowserStorageAdapter(new MemoryStorage());
    const s = defaultShop();
    s.materials.oak = { mode: 'board-foot', pricePerBoardFoot: 7.25, wasteFactor: 1.5 };
    expect(await a.setShopSettings(s)).toBe(true);
    expect(await a.getShopSettings()).toEqual({ settings: s, readFailed: false });
  });

  it('keeps unknown ids (extra) and custom prices across a write and a read', async () => {
    const store = new MemoryStorage();
    const a = new BrowserStorageAdapter(store);
    const s = defaultShop();
    const ash = { mode: 'board-foot' as const, pricePerBoardFoot: 9, wasteFactor: 1.4 };
    s.materials['m-s-ash1'] = ash;
    s.extra = { 'future-key': { mode: 'sheet', pricePerSheet: 70 } };
    expect(await a.setShopSettings(s)).toBe(true);
    const stored = JSON.parse(store.getItem(SHOP_KEY)!);
    expect('extra' in stored).toBe(false);
    expect(stored.materials['future-key']).toEqual({ mode: 'sheet', pricePerSheet: 70 });
    const back = await a.getShopSettings();
    expect(back.readFailed).toBe(false);
    expect(back.settings.materials['m-s-ash1']).toEqual(ash);
    expect(back.settings.extra).toEqual({ 'future-key': { mode: 'sheet', pricePerSheet: 70 } });
    expect('future-key' in back.settings.materials).toBe(false);
  });

  it('recovers entries a faulty earlier write left in a top-level extra; materials wins a shared key', async () => {
    const store = new MemoryStorage();
    const ash = { mode: 'board-foot', pricePerBoardFoot: 9, wasteFactor: 1.4 };
    store.setItem(SHOP_KEY, JSON.stringify({
      layout: 1,
      materials: { oak: { mode: 'board-foot', pricePerBoardFoot: 8, wasteFactor: 1.5 }, 'future-key': { v: 'materials' } },
      extra: { 'm-s-ash1': ash, 'future-key': { v: 'extra' }, 'other-key': { v: 2 } },
    }));
    const back = await new BrowserStorageAdapter(store).getShopSettings();
    expect(back.readFailed).toBe(false);
    expect(back.settings.materials['m-s-ash1']).toEqual(ash);
    expect(back.settings.materials.oak).toEqual({ mode: 'board-foot', pricePerBoardFoot: 8, wasteFactor: 1.5 });
    expect(back.settings.extra).toEqual({ 'future-key': { v: 'materials' }, 'other-key': { v: 2 } });
  });

  it('reads unparseable or newer values as defaults, flagged, and never overwrites them', async () => {
    for (const raw of ['{not json', JSON.stringify({ layout: 2, materials: {} })]) {
      const store = new MemoryStorage();
      store.setItem(SHOP_KEY, raw);
      expect(await new BrowserStorageAdapter(store).getShopSettings()).toEqual({ settings: defaultShop(), readFailed: true });
      expect(store.getItem(SHOP_KEY)).toBe(raw);
    }
  });

  it('refuses to store when storage is full or missing', async () => {
    const store = new MemoryStorage();
    store.full = true;
    expect(await new BrowserStorageAdapter(store).setShopSettings(defaultShop())).toBe(false);
    expect(await new BrowserStorageAdapter(null).setShopSettings(defaultShop())).toBe(false);
    expect(await new BrowserStorageAdapter(null).getShopSettings()).toEqual({ settings: defaultShop(), readFailed: false });
  });
});
