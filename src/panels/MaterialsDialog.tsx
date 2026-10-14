import { useEffect, useRef, useState } from 'react';
import { MATERIALS, isSheetGood, type CustomMaterial, type MaterialKind } from '../document/types';
import {
  defaultBuying, DEFAULT_WASTE_FACTOR, WASTE_FACTOR_MAX, WASTE_FACTOR_MIN,
  type MaterialBuying, type ShopSettings,
} from '../document/purchase';
import { formatLength, parseLength } from '../units/length';
import {
  initialRows, newRow, planSave, rebaseRows, rowNotes, rowRefusal, setRowKind,
  // Not a React hook, whatever its name says: a pure row transform, called from a click handler.
  useLibraryVersion as libraryVersionOf,
  type DefDraft, type Row, type SavePlan,
} from './materialsDraft';
import { MaterialDefinition } from './MaterialDefinition';
import { EXPLODED_TITLE } from './ViewportControls';

interface Props {
  shop: ShopSettings;
  /** The stored prices could not be read and defaults are showing (lumber yield spec §2.2). */
  readFailed: boolean;
  /** This project's custom materials (doc.materials). */
  project: CustomMaterial[];
  library: CustomMaterial[];
  /** The library could not be read: library writes are off, and the dialog says so. */
  libraryReadFailed: boolean;
  /** Exploded (invariant 47): definitions are read-only; Save writes prices only. */
  locked: boolean;
  /** "New material…" from Properties: these parts take the new material on Save; `kind` starts the new row. */
  newFor: { ids: string[]; kind: MaterialKind } | null;
  /** Resolves null on success, else the message to show (the dialog then stays open). */
  onSave: (out: { shop: ShopSettings; plan: SavePlan }) => Promise<string | null>;
  onClose: () => void;
}

const LIBRARY_UNREADABLE_TITLE = 'Your saved materials could not be read';

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
 * Materials & prices (lumber yield and cost spec §2.3; custom materials spec §4.1). Prices are browser-level
 * settings; definitions are the project's copies and the browser's library. Save hands App ONE plan (the project
 * edit, one undo entry; the library; the prices), Cancel discards. The SettingsDialog modal pattern; its own Escape
 * listener closes it (it renders above the cut list, which ignores Escape while it is open).
 */
export function MaterialsDialog({ shop, readFailed, project, library, libraryReadFailed, locked, newFor, onSave, onClose }: Props) {
  const sheet = useRef<HTMLDivElement>(null);
  const newName = useRef<HTMLInputElement>(null);
  const builtIns = Object.keys(MATERIALS);
  const [rows, setRows] = useState<Row[]>(() => {
    const r = initialRows(project, library);
    return newFor ? [...r, newRow(newFor.kind, r)] : r;
  });
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries([...builtIns, ...rows.map((r) => r.id)].map((m) => [m, toDraft(shop.materials[m] ?? defaultBuying(m))])));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // A Save that reported a failure leaves the dialog open over a CHANGED project (App applies the project edit
  // first): the rows are rebased on the props as they stand after it, in an effect, since the props may land a
  // render later than the resolved promise. Once the assigned material is stored, "New material…" is spent.
  const [rebasePending, setRebasePending] = useState(false);
  const [assignDone, setAssignDone] = useState(false);
  const savedAssign = useRef<string | null>(null);
  useEffect(() => {
    if (!rebasePending) return;
    setRows((all) => rebaseRows(all, project, library));
    if (savedAssign.current !== null && project.some((m) => m.id === savedAssign.current)) setAssignDone(true);
    setRebasePending(false);
  }, [rebasePending, project, library]);
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

  // "New material…" opens on the new row's name; otherwise the sheet takes focus, as before.
  useEffect(() => { (newFor ? newName.current : sheet.current)?.focus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const liveRows = rows.filter((r) => !r.deleted);
  const keys = [...builtIns, ...liveRows.map((r) => r.id)];
  const parsed = Object.fromEntries(keys.map((m) => [m, fromDraft(drafts[m]!)]));
  const valid = keys.every((m) => parsed[m] !== undefined);
  const result = planSave({ rows, library, libraryWritable: !libraryReadFailed, assignIds: newFor && !assignDone ? newFor.ids : null, locked });
  const refusals = new Map(liveRows.map((r) => [r.id, rowRefusal(r, rows)]));
  const rowRefused = [...refusals.values()].some((why) => why !== null);
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

  const replaceRow = (id: string, next: Row) => setRows((all) => all.map((r) => (r.id === id ? next : r)));
  const editRow = (r: Row, patch: Partial<DefDraft>) => replaceRow(r.id, { ...r, draft: { ...r.draft, ...patch } });
  const addMaterial = () => {
    const r = newRow('solid', rows);
    setRows([...rows, r]);
    set(r.id, toDraft(defaultBuying(r.id)));
  };
  // A new row's kind change re-mints its id; its price draft MOVES to the new id, started from the new kind's
  // defaults (the old draft's mode no longer fits the kind).
  const changeKind = (r: Row, kind: MaterialKind) => {
    const next = setRowKind(r, kind, rows);
    if (next === r) return;
    replaceRow(r.id, next);
    setDrafts((all) => {
      const { [r.id]: _old, ...rest } = all;
      return { ...rest, [next.id]: toDraft(defaultBuying(next.id)) };
    });
    delete stash.current[r.id];
  };

  const save = async () => {
    if (!valid || 'refused' in result) return;
    setSaving(true);
    const listed = new Set(keys);
    const message = await onSave({
      shop: {
        layout: 1,
        // Stored entries for ids this dialog does not list (a library material deleted earlier, one used only by
        // another project) ride through; the parsed entries of every listed id win over them (task 3's rule).
        materials: {
          ...Object.fromEntries(Object.entries(shop.materials).filter(([k]) => !listed.has(k))),
          ...(parsed as Record<string, MaterialBuying>),
        },
        ...(shop.extra ? { extra: shop.extra } : {}),
      },
      plan: result,
    });
    setSaving(false);
    if (message === null) onClose();
    else {
      setError(message);
      savedAssign.current = result.assign?.material ?? null;
      setRebasePending(true);
    }
  };

  const bad = (ok: boolean) => (ok ? undefined : true);
  const prices = (m: string, label: string) => {
    const d = drafts[m]!;
    return (
      <>
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
      </>
    );
  };

  // Definition controls: every one is off while exploded (invariant 47). A control whose only effect is on the
  // library is also off while the library is unreadable — planSave would silently drop it.
  const lockTitle = locked ? EXPLODED_TITLE : undefined;
  const libraryOff = locked || libraryReadFailed;
  const libraryTitle = locked ? EXPLODED_TITLE : libraryReadFailed ? LIBRARY_UNREADABLE_TITLE : undefined;
  const newForId = newFor ? rows.find((r) => r.source === 'new')?.id : undefined;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Materials and prices">
      <div className="modal-sheet lumber-sheet" ref={sheet} tabIndex={-1}>
        <h2>Materials &amp; prices</h2>
        <p className="modal-note">Leave a price empty if you don't know it.</p>
        {readFailed && <p className="field-error" role="status">Saved prices could not be read; showing defaults. Saving will replace them.</p>}
        {libraryReadFailed && <p className="field-error" role="status">Your saved materials could not be read; the library will not be changed.</p>}
        {builtIns.map((m) => (
          <fieldset className="lumber-material" key={m}>
            <legend>{MATERIALS[m]!.label}</legend>
            {prices(m, MATERIALS[m]!.label)}
          </fieldset>
        ))}
        {rows.map((r) => {
          const name = r.original?.label ?? 'New material';
          const notes = rowNotes(r, rows, library);
          const why = refusals.get(r.id) ?? null;
          // A library-only row edits only the library.
          const defOff = r.deleted || (r.source === 'library' ? libraryOff : locked);
          const defTitle = r.source === 'library' ? libraryTitle : lockTitle;
          return (
            <fieldset className={`lumber-material custom-material${r.deleted ? ' is-deleted' : ''}`} key={r.id}>
              <legend>{name}</legend>
              <MaterialDefinition row={r} name={name} disabled={defOff} disabledTitle={defTitle}
                onChange={(patch) => editRow(r, patch)}
                onKind={r.source === 'new' ? (k) => changeKind(r, k) : undefined}
                nameRef={r.id === newForId ? newName : undefined} />
              {notes.differs && (
                <p className="material-note">Differs from your library{' '}
                  <button disabled={locked} title={lockTitle} onClick={() => replaceRow(r.id, libraryVersionOf(r, library))}>Use library version</button>
                </p>
              )}
              {notes.notInLibrary && (
                <p className="material-note">Only in this project{' '}
                  <button aria-pressed={r.addToLibrary} disabled={libraryOff} title={libraryTitle}
                    onClick={() => replaceRow(r.id, { ...r, addToLibrary: !r.addToLibrary })}>Add to library</button>
                </p>
              )}
              {r.source === 'project' && notes.libraryLabelClash && (
                <p className="material-note">Your library has another material with this name — rename one to add it to the library</p>
              )}
              {notes.sameNameAsProject && (
                <p className="material-note">Same name as a project material — rename it to use it here</p>
              )}
              {r.source === 'library' && (r.deleted ? (
                <p className="material-note">Deleted from your library on Save{' '}
                  <button disabled={libraryOff} title={libraryTitle} onClick={() => replaceRow(r.id, { ...r, deleted: false })}>Undo delete</button>
                </p>
              ) : (
                <button className="material-delete" aria-label={`Delete ${name} from your library`} disabled={libraryOff} title={libraryTitle}
                  onClick={() => replaceRow(r.id, { ...r, deleted: true })}>
                  {/* ActionBar's trash glyph. */}
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.8 6.5v5M9.2 6.5v5" />
                  </svg>
                </button>
              ))}
              {why && <p className="field-error" role="status">{why}</p>}
              {!r.deleted && (
                <fieldset className="lumber-prices">
                  <legend>Prices</legend>
                  {prices(r.id, name)}
                </fieldset>
              )}
            </fieldset>
          );
        })}
        <button disabled={libraryOff} title={libraryTitle} onClick={addMaterial}>Add material</button>
        {!valid && <p className="field-error" role="status">Fix the highlighted fields: prices are dollars (or empty), sizes are positive lengths, waste factor is {WASTE_FACTOR_MIN}–{WASTE_FACTOR_MAX}.</p>}
        {'refused' in result && !rowRefused && <p className="field-error" role="status">{result.refused}</p>}
        {error && <p className="field-error" role="status">{error}</p>}
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!valid || 'refused' in result || saving} onClick={() => void save()}>Save</button>
        </div>
        <p className="modal-note">Your materials and prices are stored in this browser; each project also keeps a copy of the materials it uses. Undo reverts a project's copy, not your library or prices.</p>
      </div>
    </div>
  );
}
