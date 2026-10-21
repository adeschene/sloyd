import { useEffect, useMemo, useRef, useState } from 'react';
import { MATERIALS, isSheetGood, type BandType, type Board, type CustomMaterial, type HardwareType, type MaterialKind } from '../document/types';
import { HARDWARE_PRESETS } from '../document/hardwareModel';
import { BUILT_IN_BAND, BUILT_IN_BAND_ID } from '../document/banding';
import {
  defaultBuying, DEFAULT_WASTE_FACTOR, WASTE_FACTOR_MAX, WASTE_FACTOR_MIN,
  type MaterialBuying, type ShopSettings,
} from '../document/purchase';
import { IMPERIAL, formatLength, imperialAt, parseLength } from '../units/length';
import {
  initialRows, newRow, planSave, rebaseRows, rowNotes, rowRefusal, setRowKind,
  // Not a React hook, whatever its name says: a pure row transform, called from a click handler.
  useLibraryVersion as libraryVersionOf,
  type DefDraft, type Row, type SavePlan,
} from './materialsDraft';
import { MaterialDefinition } from './MaterialDefinition';
import { EXPLODED_TITLE } from './ViewportControls';
import { Popover } from './Popover';
import {
  bandFieldValid, initialBandRows, newBandRow, planBandTypes, rebaseBandRows, type BandRow,
} from './bandTypesDraft';
import {
  hardwareFieldValid, initialHardwareRows, newHardwareRow, planHardwareTypes, rebaseHardwareRows, type HardwareField, type HardwareRow,
} from './hardwareTypesDraft';

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
  /** "New solid edging…" from the Banding section: the Edge banding section opens with a new Solid row, its name focused. */
  newBand?: 'solid' | null;
  /** The project's band types (doc.bandTypes; edge banding spec §5.2). App always passes the three band props; the
   *  defaults serve only tests that do not look at the Edge banding section. */
  bandTypes?: BandType[];
  /** The project's world parts: a band type a part uses cannot be deleted, nor edited to ADD a fault to it. */
  parts?: Board[];
  /** The materials a solid band type may name (Amended (planning) P4): built-in solids and this project's custom solids. */
  solids?: string[];
  /** "New hardware type…" from Properties' Hardware section: the Hardware section opens with a new `Other` row, its name focused. */
  newHardware?: boolean;
  /** The project's hardware types (doc.hardwareTypes; hardware spec §5.2). App always passes both hardware props. */
  hardwareTypes?: HardwareType[];
  /** How many placed holders use a type, read off the STORED document: a type in use cannot be deleted. */
  hardwareUsedBy?: (id: string) => number;
  /** Resolves null on success, else the message to show (the dialog then stays open). */
  onSave: (out: { shop: ShopSettings; plan: SavePlan }) => Promise<string | null>;
  onClose: () => void;
}

const nominalIn = (rows: readonly Row[], id: string) => rows.find((r) => r.id === id)?.draft.nominal ?? false;

const BUILT_IN_SOLIDS = Object.keys(MATERIALS).filter((m) => !isSheetGood(m));
const NO_PARTS: Board[] = [];
const DEFAULT_BAND_TYPES: BandType[] = [BUILT_IN_BAND];
const NO_HARDWARE: HardwareType[] = [];
const NOT_USED = () => 0;
const OTHER_PRESET = HARDWARE_PRESETS.find((p) => p.name === 'Other')!;

const LIBRARY_UNREADABLE_TITLE = 'Your saved materials could not be read';

/** Text drafts: a field may hold text that does not parse yet; Save stays off until every field does. */
type DraftSize = { id: string; thickness: string; width: string; length: string; price: string };
type Draft =
  | { mode: 'board-foot'; price: string; waste: string }
  | { mode: 'piece'; stock: DraftSize[] }
  | { mode: 'sheet'; price: string };

const PRICE_RE = /^(?:\d+(?:\.\d*)?|\.\d+)$/;
const priceText = (v: number | null) => (v === null ? '' : String(v));
// Ruling P1 (metric display): stock and sheet sizes in the Materials dialog stay imperial.
const lengthText = (v: number) => formatLength(v, imperialAt(64));

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
  // Ruling P1: typed as inches, as `lengthText` shows them, whatever the project's units.
  const v = parseLength(t, IMPERIAL);
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
export function MaterialsDialog({
  shop, readFailed, project, library, libraryReadFailed, locked, newFor, newBand = null, onSave, onClose,
  bandTypes = DEFAULT_BAND_TYPES, parts = NO_PARTS, solids = BUILT_IN_SOLIDS,
  newHardware = false, hardwareTypes = NO_HARDWARE, hardwareUsedBy = NOT_USED,
}: Props) {
  const sheet = useRef<HTMLDivElement>(null);
  const newName = useRef<HTMLInputElement>(null);
  const newBandName = useRef<HTMLInputElement>(null);
  const newHardwareName = useRef<HTMLInputElement>(null);
  const builtIns = Object.keys(MATERIALS);
  const [rows, setRows] = useState<Row[]>(() => {
    const r = initialRows(project, library);
    return newFor ? [...r, newRow(newFor.kind, r)] : r;
  });
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries([...builtIns, ...rows.map((r) => r.id)].map((m) => [m, toDraft(shop.materials[m] ?? defaultBuying(m, nominalIn(rows, m)))])));
  const [bandRows, setBandRows] = useState<BandRow[]>(() => {
    const r = initialBandRows(bandTypes);
    return newBand ? [...r, newBandRow(newBand, r)] : r;
  });
  // Read off the KEPT state, never recorded inside the initializer: StrictMode runs initializers twice and keeps one result.
  const [newBandId] = useState<string | null>(() => (newBand ? bandRows[bandRows.length - 1]!.id : null));
  const [hardwareRows, setHardwareRows] = useState<HardwareRow[]>(() => {
    const r = initialHardwareRows(hardwareTypes);
    return newHardware ? [...r, newHardwareRow(OTHER_PRESET, r)] : r;
  });
  const [newHardwareId] = useState<string | null>(() => (newHardware ? hardwareRows[hardwareRows.length - 1]!.id : null));
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
    setBandRows((all) => rebaseBandRows(all, bandTypes));
    setHardwareRows((all) => rebaseHardwareRows(all, hardwareTypes));
    if (savedAssign.current !== null && project.some((m) => m.id === savedAssign.current)) setAssignDone(true);
    setRebasePending(false);
  }, [rebasePending, project, library, bandTypes, hardwareTypes]);
  const nextId = useRef(0);
  // Built-ins are false here (pine is handled inside defaultBuying); a row follows its draft's switch.
  const nominalOf = (id: string) => nominalIn(rows, id);
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
          ? (defaultBuying(m, nominalOf(m)).mode === 'piece' ? toDraft(defaultBuying(m, nominalOf(m))) : { mode: 'piece', stock: [] })
          : { mode: 'board-foot', price: '', waste: String(DEFAULT_WASTE_FACTOR) });
    set(m, next);
  };

  // "New material…" and "New solid edging…" open on the new row's name; otherwise the sheet takes focus, as before.
  useEffect(() => {
    const target = newFor ? newName.current : newBand ? newBandName.current : newHardware ? newHardwareName.current : sheet.current;
    target?.focus();
    if (target === newBandName.current || target === newHardwareName.current) target?.scrollIntoView?.({ block: 'center' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
  // Band types are project state: off while exploded (invariant 47), so a locked Save plans none.
  const bandCtx = useMemo(() => ({ parts, solids: new Set(solids) }), [parts, solids]);
  const bandPlan = locked ? null : planBandTypes(bandRows, bandTypes, bandCtx);
  const bandRefused = bandPlan !== null && 'refused' in bandPlan ? bandPlan.refused : null;
  // Hardware types are project state too: off while exploded. The usage counts come from the STORED document.
  const hardwareCtx = useMemo(() => ({ usedBy: hardwareUsedBy }), [hardwareUsedBy]);
  const hardwarePlan = locked ? null : planHardwareTypes(hardwareRows, hardwareTypes, hardwareCtx);
  const hardwareRefused = hardwarePlan !== null && 'refused' in hardwarePlan ? hardwarePlan.refused : null;
  const refused = 'refused' in result || bandRefused !== null || hardwareRefused !== null;
  // The materials' row refusals show on their rows; the rest (a library clash, a band type's, a hardware type's) in the one element below.
  const shownRefusal = 'refused' in result && !rowRefused ? result.refused : (bandRefused ?? hardwareRefused);
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
  const editRow = (r: Row, patch: Partial<DefDraft>) => {
    replaceRow(r.id, { ...r, draft: { ...r.draft, ...patch } });
    // A NEW row's prices follow its nominal switch (they start from the switched defaults, as a kind change does);
    // a stored row's prices are the user's and are never touched by it.
    if (patch.nominal !== undefined && patch.nominal !== r.draft.nominal && r.source === 'new') {
      set(r.id, toDraft(defaultBuying(r.id, patch.nominal)));
      delete stash.current[r.id];
    }
  };
  const addMaterial = () => {
    const r = newRow('solid', rows);
    setRows([...rows, r]);
    set(r.id, toDraft(defaultBuying(r.id, r.draft.nominal)));
  };
  // An unsaved new row (not the one "New material…" assigns) can be taken back out: the row and its price draft
  // go entirely — nothing was stored, so there is nothing to mark deleted.
  const removeNewRow = (r: Row) => {
    setRows((all) => all.filter((x) => x.id !== r.id));
    setDrafts((all) => {
      const { [r.id]: _gone, ...rest } = all;
      return rest;
    });
    delete stash.current[r.id];
  };
  // A new row's kind change re-mints its id; its price draft MOVES to the new id, started from the new kind's
  // defaults (the old draft's mode no longer fits the kind).
  const changeKind = (r: Row, kind: MaterialKind) => {
    const next = setRowKind(r, kind, rows);
    if (next === r) return;
    replaceRow(r.id, next);
    setDrafts((all) => {
      const { [r.id]: _old, ...rest } = all;
      return { ...rest, [next.id]: toDraft(defaultBuying(next.id, next.draft.nominal)) };
    });
    delete stash.current[r.id];
  };

  const save = async () => {
    if (!valid || 'refused' in result || (bandPlan !== null && 'refused' in bandPlan) || hardwareRefused !== null) return;
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
      plan: { ...result, bandTypes: bandPlan, hardwareTypes: hardwarePlan !== null && 'refused' in hardwarePlan ? null : hardwarePlan },
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
        <button className="lumber-reset" onClick={() => set(m, toDraft(defaultBuying(m, nominalOf(m))))}>Reset {label.toLowerCase()} to defaults</button>
      </>
    );
  };

  // Definition controls: every one is off while exploded (invariant 47). A control whose only effect is on the
  // library is also off while the library is unreadable — planSave would silently drop it.
  const lockTitle = locked ? EXPLODED_TITLE : undefined;
  const libraryOff = locked || libraryReadFailed;
  const libraryTitle = locked ? EXPLODED_TITLE : libraryReadFailed ? LIBRARY_UNREADABLE_TITLE : undefined;
  const newForId = newFor ? rows.find((r) => r.source === 'new')?.id : undefined;
  // The row a Save will assign (planSave's `assigned`: the first new row, while New material… is unspent).
  const assignRowId = newFor && !assignDone ? newForId : undefined;

  // The Edge banding section (edge banding spec §5.2). One fieldset: disabled while exploded (invariant 47), which
  // disables every control inside it, the add menu's trigger included.
  const solidLabel = (id: string) => MATERIALS[id]?.label ?? project.find((m) => m.id === id)?.label ?? id;
  const editBand = (r: BandRow, key: string, value: string) =>
    setBandRows((all) => all.map((x) => (x.id === r.id ? { ...x, draft: { ...x.draft, [key]: value } } : x)));
  const bandInput = (r: BandRow, name: string, key: string, text: string) => (
    <label>{text}
      <input className="input" aria-label={`${name}: ${text.toLowerCase()}`} value={r.draft[key] ?? ''}
        aria-invalid={bad(bandFieldValid(r, key))} onChange={(e) => editBand(r, key, e.target.value)} />
    </label>
  );
  const bandSection = (
    <fieldset className="lumber-material band-types" disabled={locked} title={lockTitle}>
      <legend>Edge banding</legend>
      {bandRows.map((r) => {
        const name = r.original?.name ?? r.draft.name ?? '';
        const options = solids.includes(r.draft.material ?? '') ? solids : [...solids, r.draft.material ?? ''];
        return (
          <div className={`band-type${r.deleted ? ' is-deleted' : ''}`} key={r.id}>
            <label>Name
              <input className="input band-name" aria-label={`${name}: name`} value={r.draft.name ?? ''} disabled={r.deleted}
                ref={r.id === newBandId ? newBandName : undefined}
                aria-invalid={bad((r.draft.name ?? '').trim() !== '')} onChange={(e) => editBand(r, 'name', e.target.value)} />
            </label>
            <span className="band-kind">{r.kind === 'tape' ? 'Tape' : 'Solid'}</span>
            {!r.deleted && (
              <>
                {bandInput(r, name, 'thickness', 'Thickness')}
                {bandInput(r, name, 'lengthAllowance', 'Length allowance')}
                {r.kind === 'tape' ? (
                  <>
                    {bandInput(r, name, 'tapeWidth', 'Tape width')}
                    {bandInput(r, name, 'price', 'Price per foot')}
                  </>
                ) : (
                  <>
                    <label>Material
                      <select className="input" aria-label={`${name}: material`} value={r.draft.material ?? ''}
                        onChange={(e) => editBand(r, 'material', e.target.value)}>
                        {options.map((m) => <option key={m} value={m}>{solidLabel(m)}</option>)}
                      </select>
                    </label>
                    {bandInput(r, name, 'widthAllowance', 'Width allowance')}
                  </>
                )}
              </>
            )}
            {r.id !== BUILT_IN_BAND_ID && (r.original === null ? (
              <button aria-label={`Remove ${name}`} onClick={() => setBandRows((all) => all.filter((x) => x.id !== r.id))}>✕</button>
            ) : r.deleted ? (
              <span className="material-note">Deleted on Save{' '}
                <button onClick={() => setBandRows((all) => all.map((x) => (x.id === r.id ? { ...x, deleted: false } : x)))}>Undo delete</button>
              </span>
            ) : (
              <button aria-label={`Delete ${name}`}
                onClick={() => setBandRows((all) => all.map((x) => (x.id === r.id ? { ...x, deleted: true } : x)))}>✕</button>
            ))}
          </div>
        );
      })}
      <Popover label="+ Add band type ▾" items={[
        { label: 'Tape', run: () => setBandRows((all) => [...all, newBandRow('tape', all)]) },
        { label: 'Solid', run: () => setBandRows((all) => [...all, newBandRow('solid', all)]) },
      ]} />
    </fieldset>
  );

  // The Hardware section (hardware spec §5.2), the band section's shape: one fieldset, disabled while exploded.
  const editHardware = (r: HardwareRow, key: HardwareField, value: string) =>
    setHardwareRows((all) => all.map((x) => (x.id === r.id ? { ...x, draft: { ...x.draft, [key]: value } } : x)));
  const hardwareInput = (r: HardwareRow, name: string, key: HardwareField, text: string, ref?: React.Ref<HTMLInputElement>) => (
    <label>{text}
      <input className="input" aria-label={`${name}: ${text.toLowerCase()}`} value={r.draft[key]} ref={ref}
        aria-invalid={bad(hardwareFieldValid(r, key))} onChange={(e) => editHardware(r, key, e.target.value)} />
    </label>
  );
  const hardwareSection = (
    <fieldset className="lumber-material band-types" disabled={locked} title={lockTitle}>
      <legend>Hardware</legend>
      {hardwareRows.map((r) => {
        const name = r.original?.name ?? (r.draft.name || 'New hardware type');
        return (
          <div className={`band-type${r.deleted ? ' is-deleted' : ''}`} key={r.id}>
            <label>Name
              <input className="input band-name" aria-label={`${name}: name`} value={r.draft.name} disabled={r.deleted}
                ref={r.id === newHardwareId ? newHardwareName : undefined}
                aria-invalid={bad(hardwareFieldValid(r, 'name'))} onChange={(e) => editHardware(r, 'name', e.target.value)} />
            </label>
            {!r.deleted && (
              <>
                {hardwareInput(r, name, 'packSize', 'Pack size')}
                {hardwareInput(r, name, 'pricePerPack', 'Price per pack')}
              </>
            )}
            {r.original === null ? (
              <button aria-label={`Remove ${name}`} onClick={() => setHardwareRows((all) => all.filter((x) => x.id !== r.id))}>✕</button>
            ) : r.deleted ? (
              <span className="material-note">Deleted on Save{' '}
                <button onClick={() => setHardwareRows((all) => all.map((x) => (x.id === r.id ? { ...x, deleted: false } : x)))}>Undo delete</button>
              </span>
            ) : (
              <button aria-label={`Delete ${name}`}
                onClick={() => setHardwareRows((all) => all.map((x) => (x.id === r.id ? { ...x, deleted: true } : x)))}>✕</button>
            )}
          </div>
        );
      })}
      <Popover label="+ Add hardware type ▾"
        items={HARDWARE_PRESETS.map((p) => ({ label: p.name, run: () => setHardwareRows((all) => [...all, newHardwareRow(p, all)]) }))} />
    </fieldset>
  );

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
              {r.source === 'new' && r.id !== assignRowId && (
                <button className="material-delete" aria-label={`Remove ${r.draft.label.trim() || 'New material'}`}
                  disabled={locked} title={lockTitle} onClick={() => removeNewRow(r)}>✕</button>
              )}
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
        {bandSection}
        {hardwareSection}
        {!valid && <p className="field-error" role="status">Fix the highlighted fields: prices are dollars (or empty), sizes are positive lengths, waste factor is {WASTE_FACTOR_MIN}–{WASTE_FACTOR_MAX}.</p>}
        {shownRefusal !== null && <p className="field-error" role="status">{shownRefusal}</p>}
        {error && <p className="field-error" role="status">{error}</p>}
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!valid || refused || saving} onClick={() => void save()}>Save</button>
        </div>
        <p className="modal-note">Your materials and prices are stored in this browser; each project also keeps a copy of the materials it uses, and its own band types and tape prices. Undo reverts the project's copies and band types, not your library or material prices.</p>
      </div>
    </div>
  );
}
