import { cleanName } from '../document/names';
import { nextId } from '../document/ids';
import { PACK_SIZE_MAX, sameHardwareType } from '../document/hardwareModel';
import type { HardwareType } from '../document/types';

/**
 * The Materials dialog's Hardware section (hardware spec §5.2): pure rows, parsing and refusals, as `bandTypesDraft.ts`
 * is for the band types. Drafts are TEXT; Save stays off until every live row parses. Hardware types are PROJECT state:
 * a Save writes them in the one project edit.
 */
export type HardwareField = 'name' | 'packSize' | 'pricePerPack';
export interface HardwareRow { id: string; original: HardwareType | null; draft: Record<HardwareField, string>; deleted: boolean }
/** `usedBy` counts the placed holders using a type, read off the STORED document (`hardwareUsedBy`). */
export interface HardwareCtx { usedBy: (typeId: string) => number }

const priceText = (v: number | null) => (v === null ? '' : String(v));
const PRICE_RE = /^(?:\d+(?:\.\d*)?|\.\d+)$/;
const WHOLE_RE = /^\d+$/;

const rowOf = (t: HardwareType): HardwareRow => ({
  id: t.id, original: t, deleted: false,
  draft: { name: t.name, packSize: String(t.packSize), pricePerPack: priceText(t.pricePerPack) },
});
export const initialHardwareRows = (types: readonly HardwareType[]): HardwareRow[] => types.map(rowOf);
const live = (rows: readonly HardwareRow[]) => rows.filter((r) => !r.deleted);

/** A new row from a preset (name and pack size; price empty), named by the band rows' local free-name rule among the
 *  live rows' drafts (`Hinge`, `Hinge 2`, …), its id from `nextId()`. */
export function newHardwareRow(preset: { name: string; packSize: number }, rows: readonly HardwareRow[]): HardwareRow {
  const taken = new Set(live(rows).map((r) => (r.draft.name ?? '').trim().toLowerCase()));
  let name = preset.name;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${preset.name} ${n}`;
  return { id: nextId(), original: null, deleted: false, draft: { name, packSize: String(preset.packSize), pricePerPack: '' } };
}

function packOf(text: string): number | undefined {
  const s = text.trim();
  if (!WHOLE_RE.test(s)) return undefined;
  const v = Number(s);
  return v >= 1 && v <= PACK_SIZE_MAX ? v : undefined;
}
function priceOf(text: string): number | null | undefined {
  const s = text.trim();
  if (s === '') return null;
  return PRICE_RE.test(s) ? Number(s) : undefined;
}

/** The type a row's draft describes, or null while any field is refused. */
function fromDraft(r: HardwareRow): HardwareType | null {
  const name = cleanName(r.draft.name.trim());
  const packSize = packOf(r.draft.packSize), pricePerPack = priceOf(r.draft.pricePerPack);
  if (!name || packSize === undefined || pricePerPack === undefined) return null;
  return { id: r.id, name, packSize, pricePerPack };
}

/** Keyed AFTER `cleanName` (the loader renames `›` to `>`, so `A›B` and `A>B` are one name). */
const keyOf = (name: string) => cleanName(name.trim()).toLowerCase();
const nameKey = (r: HardwareRow) => keyOf(r.draft.name);
const nameTyped = (r: HardwareRow) => r.original === null || nameKey(r) !== keyOf(r.original.name);

/** Why this row cannot be saved, or null. Order (spec §5.2): a deletion in use, the name, the pack size, the price. A
 *  name clash refuses only when one side's name was TYPED (the band types' amended rule: the loader keeps imported
 *  clashes, and refusing them untouched would block every Save). */
export function hardwareRowRefusal(r: HardwareRow, rows: readonly HardwareRow[], ctx: HardwareCtx): string | null {
  if (r.deleted) {
    const n = r.original ? ctx.usedBy(r.id) : 0;
    return n === 0 ? null : `Used by ${n} — remove it from them first.`;
  }
  const key = nameKey(r);
  if (!key) return 'Give the hardware type a name.';
  const other = live(rows).find((o) => o.id !== r.id && nameKey(o) === key);
  if (other && (nameTyped(r) || nameTyped(other))) return `Another hardware type is called "${other.draft.name.trim()}".`;
  if (packOf(r.draft.packSize) === undefined) return `Pack size must be a whole number from 1 to ${PACK_SIZE_MAX}.`;
  if (priceOf(r.draft.pricePerPack) === undefined) return 'Price must be dollars or empty.';
  return null;
}

/** The hardware types a Save writes: `{ refused }` for the first refusal; null when nothing changed; else the whole
 *  list in row order, deleted rows out. */
export function planHardwareTypes(rows: readonly HardwareRow[], original: readonly HardwareType[], ctx: HardwareCtx): HardwareType[] | null | { refused: string } {
  for (const r of rows) {
    const why = hardwareRowRefusal(r, rows, ctx);
    if (why) return { refused: why };
  }
  const next = live(rows).map((r) => fromDraft(r)!);
  const same = next.length === original.length && next.every((t, i) => sameHardwareType(t, original[i]!));
  return same ? null : next;
}

/** Whether one field's draft parses (the field's `aria-invalid`); the rule-level refusals are `hardwareRowRefusal`'s. */
export function hardwareFieldValid(r: HardwareRow, key: HardwareField): boolean {
  if (key === 'name') return r.draft.name.trim() !== '';
  return key === 'packSize' ? packOf(r.draft.packSize) !== undefined : priceOf(r.draft.pricePerPack) !== undefined;
}

/** After a Save that reported a failed browser write (see `rebaseBandRows`): each row takes the stored type with its id
 *  as its original, a deleted row the project no longer has leaves, an unsaved new row the project now holds becomes a
 *  stored row. Drafts are kept. */
export function rebaseHardwareRows(rows: readonly HardwareRow[], types: readonly HardwareType[]): HardwareRow[] {
  return rows.flatMap((r): HardwareRow[] => {
    const t = types.find((x) => x.id === r.id);
    if (t) return [{ ...r, original: t }];
    return r.original === null ? [r] : [];
  });
}
