import { useEffect, useRef, useState } from 'react';
import { MATERIALS, isSheetGood } from '../document/types';
import {
  defaultBuying, DEFAULT_WASTE_FACTOR, WASTE_FACTOR_MAX, WASTE_FACTOR_MIN,
  type MaterialBuying, type ShopSettings,
} from '../document/purchase';
import { formatLength, parseLength } from '../units/length';

interface Props {
  shop: ShopSettings;
  /** The stored value could not be read and defaults are showing (spec §2.2). */
  readFailed: boolean;
  /** Resolves false when the write failed; the dialog stays open and says so. */
  onSave: (s: ShopSettings) => Promise<boolean>;
  onClose: () => void;
}

/** Text drafts: a field may hold text that does not parse yet; Save stays off until every field does. */
type DraftSize = { id: string; thickness: string; width: string; length: string; price: string };
type Draft =
  | { mode: 'board-foot'; price: string; waste: string }
  | { mode: 'piece'; stock: DraftSize[] }
  | { mode: 'sheet'; price: string };

const PRICE_RE = /^(?:\d+(?:\.\d*)?|\.\d+)$/;
const priceText = (v: number | null) => (v === null ? '' : String(v));
const lengthText = (v: number) => formatLength(v, 64);

function toDraft(b: MaterialBuying): Draft {
  if (b.mode === 'board-foot') return { mode: 'board-foot', price: priceText(b.pricePerBoardFoot), waste: String(b.wasteFactor) };
  if (b.mode === 'sheet') return { mode: 'sheet', price: priceText(b.pricePerSheet) };
  return { mode: 'piece', stock: b.stock.map((s) => ({ id: s.id, thickness: lengthText(s.thickness), width: lengthText(s.width), length: lengthText(s.length), price: priceText(s.price) })) };
}

/** A price: empty means "no price"; anything else must be a non-negative decimal. Refused, never clamped. */
function parsePrice(t: string): number | null | undefined {
  const s = t.trim();
  if (s === '') return null;
  return PRICE_RE.test(s) ? Number(s) : undefined;
}
function parseDim(t: string): number | undefined {
  const v = parseLength(t);
  return v !== null && v > 0 ? v : undefined;
}
function parseWaste(t: string): number | undefined {
  const v = Number(t.trim());
  return t.trim() !== '' && Number.isFinite(v) && v >= WASTE_FACTOR_MIN && v <= WASTE_FACTOR_MAX ? v : undefined;
}

/** The parsed entry, or undefined when any field is refused. */
function fromDraft(d: Draft): MaterialBuying | undefined {
  if (d.mode === 'board-foot') {
    const price = parsePrice(d.price);
    const waste = parseWaste(d.waste);
    return price === undefined || waste === undefined ? undefined : { mode: 'board-foot', pricePerBoardFoot: price, wasteFactor: waste };
  }
  if (d.mode === 'sheet') {
    const price = parsePrice(d.price);
    return price === undefined ? undefined : { mode: 'sheet', pricePerSheet: price };
  }
  const stock = d.stock.map((s) => ({ id: s.id, thickness: parseDim(s.thickness), width: parseDim(s.width), length: parseDim(s.length), price: parsePrice(s.price) }));
  if (stock.some((s) => s.thickness === undefined || s.width === undefined || s.length === undefined || s.price === undefined)) return undefined;
  return { mode: 'piece', stock: stock as { id: string; thickness: number; width: number; length: number; price: number | null }[] };
}

/**
 * Lumber & prices (lumber yield and cost spec §2.3). Browser-level settings, not the project: Save writes
 * through StorageAdapter, Cancel discards, nothing is undoable. The SettingsDialog modal pattern; its own
 * Escape listener closes it (it renders above the cut list, which ignores Escape while it is open).
 */
export function LumberPricesDialog({ shop, readFailed, onSave, onClose }: Props) {
  const sheet = useRef<HTMLDivElement>(null);
  const keys = Object.keys(MATERIALS);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(keys.map((m) => [m, toDraft(shop.materials[m] ?? defaultBuying(m))])));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const nextId = useRef(0);
  // The draft a material had in each mode it has been switched AWAY from, so switching back restores it
  // instead of starting blank (final review: a round trip used to drop pine's sizes and oak's price).
  const stash = useRef<Record<string, Partial<Record<Draft['mode'], Draft>>>>({});
  const switchMode = (m: string, mode: 'board-foot' | 'piece') => {
    const d = drafts[m]!;
    stash.current[m] = { ...stash.current[m], [d.mode]: d };
    const stored = shop.materials[m];
    const next = stash.current[m]?.[mode]
      ?? (stored && stored.mode === mode ? toDraft(stored)
        : mode === 'piece'
          ? (defaultBuying(m).mode === 'piece' ? toDraft(defaultBuying(m)) : { mode: 'piece', stock: [] })
          : { mode: 'board-foot', price: '', waste: String(DEFAULT_WASTE_FACTOR) });
    set(m, next);
  };

  useEffect(() => { sheet.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const parsed = Object.fromEntries(keys.map((m) => [m, fromDraft(drafts[m]!)]));
  const valid = keys.every((m) => parsed[m] !== undefined);
  const set = (m: string, d: Draft) => setDrafts((all) => ({ ...all, [m]: d }));
  const setSize = (m: string, i: number, field: keyof DraftSize, value: string) => {
    const d = drafts[m] as Extract<Draft, { mode: 'piece' }>;
    set(m, { ...d, stock: d.stock.map((s, j) => (j === i ? { ...s, [field]: value } : s)) });
  };
  const freshId = (d: Extract<Draft, { mode: 'piece' }>) => {
    let id = '';
    while (!id || d.stock.some((s) => s.id === id)) id = `new${nextId.current++}`;
    return id;
  };

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    const ok = await onSave({
      layout: 1,
      // Stored entries for ids this dialog does not edit (custom materials, which validateShop keeps in
      // `materials`) ride through; the parsed built-ins win over them.
      materials: {
        ...Object.fromEntries(Object.entries(shop.materials).filter(([k]) => !(k in MATERIALS))),
        ...(parsed as Record<string, MaterialBuying>),
      },
      ...(shop.extra ? { extra: shop.extra } : {}),
    });
    setSaving(false);
    if (ok) onClose();
    else setError('Could not save: this browser is not letting Sloyd store settings.');
  };

  const bad = (ok: boolean) => (ok ? undefined : true);
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Lumber and prices">
      <div className="modal-sheet lumber-sheet" ref={sheet} tabIndex={-1}>
        <h2>Lumber &amp; prices</h2>
        <p className="modal-note">Stored in this browser, for every project. Leave a price empty if you don't know it.</p>
        {readFailed && <p className="field-error" role="status">Saved prices could not be read; showing defaults. Saving will replace them.</p>}
        {keys.map((m) => {
          const d = drafts[m]!;
          const label = MATERIALS[m]!.label;
          return (
            <fieldset className="lumber-material" key={m}>
              <legend>{label}</legend>
              {!isSheetGood(m) && (
                <label>
                  Bought
                  <select className="input" aria-label={`${label}: bought`} value={d.mode}
                    onChange={(e) => switchMode(m, e.target.value === 'piece' ? 'piece' : 'board-foot')}>
                    <option value="board-foot">By the board foot</option>
                    <option value="piece">By the piece</option>
                  </select>
                </label>
              )}
              {d.mode === 'board-foot' && (
                <>
                  <label>Price per bd ft ($)
                    <input className="input" aria-label={`${label}: price per board foot`} value={d.price}
                      aria-invalid={bad(parsePrice(d.price) !== undefined)} onChange={(e) => set(m, { ...d, price: e.target.value })} />
                  </label>
                  <label>Waste factor
                    <input className="input" aria-label={`${label}: waste factor`} value={d.waste}
                      aria-invalid={bad(parseWaste(d.waste) !== undefined)} onChange={(e) => set(m, { ...d, waste: e.target.value })} />
                  </label>
                </>
              )}
              {d.mode === 'sheet' && (
                <label>Price per sheet ($)
                  <input className="input" aria-label={`${label}: price per sheet`} value={d.price}
                    aria-invalid={bad(parsePrice(d.price) !== undefined)} onChange={(e) => set(m, { ...d, price: e.target.value })} />
                </label>
              )}
              {d.mode === 'piece' && (
                <ul className="lumber-sizes">
                  {d.stock.map((s, i) => (
                    <li key={s.id}>
                      {(['thickness', 'width', 'length'] as const).map((f) => (
                        <input key={f} className="input" aria-label={`${label} size ${i + 1}: ${f}`} value={s[f]}
                          aria-invalid={bad(parseDim(s[f]) !== undefined)} onChange={(e) => setSize(m, i, f, e.target.value)} />
                      ))}
                      <input className="input" aria-label={`${label} size ${i + 1}: price`} value={s.price}
                        aria-invalid={bad(parsePrice(s.price) !== undefined)} onChange={(e) => setSize(m, i, 'price', e.target.value)} />
                      <button aria-label={`Remove ${label} size ${i + 1}`}
                        onClick={() => set(m, { ...d, stock: d.stock.filter((_, j) => j !== i) })}>✕</button>
                    </li>
                  ))}
                  <li>
                    <button onClick={() => set(m, { ...d, stock: [...d.stock, { id: freshId(d), thickness: '3/4', width: '', length: '96', price: '' }] })}>
                      Add {label.toLowerCase()} size
                    </button>
                  </li>
                </ul>
              )}
              <button className="lumber-reset" onClick={() => set(m, toDraft(defaultBuying(m)))}>Reset {label.toLowerCase()} to defaults</button>
            </fieldset>
          );
        })}
        {!valid && <p className="field-error" role="status">Fix the highlighted fields: prices are dollars (or empty), sizes are positive lengths, waste factor is {WASTE_FACTOR_MIN}–{WASTE_FACTOR_MAX}.</p>}
        {error && <p className="field-error" role="status">{error}</p>}
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!valid || saving} onClick={() => void save()}>Save</button>
        </div>
      </div>
    </div>
  );
}
