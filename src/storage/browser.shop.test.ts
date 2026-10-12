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
