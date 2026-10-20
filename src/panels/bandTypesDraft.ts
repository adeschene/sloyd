import { bandFaultText, bandFaults, newBandType, sameBandType, BUILT_IN_BAND_ID } from '../document/banding';
import { cleanName } from '../document/names';
import type { BandType, Board } from '../document/types';
import { formatLength, imperialAt, parseLength } from '../units/length';

/**
 * The Materials dialog's Edge banding section (edge banding spec §5.2): pure rows, parsing and refusals, as
 * `materialsDraft.ts` is for the material rows. Drafts are TEXT: a field may hold text that does not parse yet, and Save
 * stays off until every live row does. Band types are PROJECT state: a Save writes them in the one project edit.
 */
export interface BandRow { id: string; kind: 'tape' | 'solid'; original: BandType | null; draft: Record<string, string>; deleted: boolean }
export interface BandCtx { parts: readonly Board[]; solids: ReadonlySet<string> }

// Ruling P1 (metric display): the dialog's sizes stay imperial, shown and typed as inches.
const UNITS = imperialAt(64);
const lengthText = (v: number) => formatLength(v, UNITS);
const priceText = (v: number | null) => (v === null ? '' : String(v));
const PRICE_RE = /^(?:\d+(?:\.\d*)?|\.\d+)$/;

function toDraft(t: BandType): Record<string, string> {
  const base = { name: t.name, thickness: lengthText(t.thickness), lengthAllowance: lengthText(t.lengthAllowance) };
  return t.kind === 'tape'
    ? { ...base, tapeWidth: lengthText(t.tapeWidth), price: priceText(t.pricePerFoot) }
    : { ...base, material: t.material, widthAllowance: lengthText(t.widthAllowance) };
}
const rowOf = (t: BandType): BandRow => ({ id: t.id, kind: t.kind, original: t, draft: toDraft(t), deleted: false });

export const initialBandRows = (types: readonly BandType[]): BandRow[] => types.map(rowOf);
const live = (rows: readonly BandRow[]) => rows.filter((r) => !r.deleted);

/** A new row with spec §2.1's defaults (`newBandType`, the one home), named uniquely among the live rows' drafts. */
export function newBandRow(kind: 'tape' | 'solid', rows: readonly BandRow[]): BandRow {
  // newBandType reads only the taken NAMES; the drafts are what a Save would store.
  const taken = live(rows).map((r) => ({ name: r.draft.name?.trim() ?? '' }) as BandType);
  const t = newBandType(kind, taken);
  return { ...rowOf(t), original: null };
}

/** A length field: an untouched field keeps its stored value exactly (display rounds; stored is exact, inv 5). Refused
 *  (undefined) when it does not parse or is negative — never clamped. */
function lengthOf(text: string | undefined, stored: number | undefined): number | undefined {
  const s = text ?? '';
  if (stored !== undefined && s === lengthText(stored)) return stored;
  const v = parseLength(s, UNITS);
  return v !== null && Number.isFinite(v) && v >= 0 ? v : undefined;
}
function priceOf(text: string | undefined): number | null | undefined {
  const s = (text ?? '').trim();
  if (s === '') return null;
  return PRICE_RE.test(s) ? Number(s) : undefined;
}

type Field = { key: string; label: string };
const BASE_FIELDS: Field[] = [{ key: 'thickness', label: 'Thickness' }, { key: 'lengthAllowance', label: 'Length allowance' }];
const KIND_FIELDS: Record<BandRow['kind'], Field[]> = {
  tape: [{ key: 'tapeWidth', label: 'Tape width' }], solid: [{ key: 'widthAllowance', label: 'Width allowance' }],
};
const storedNumber = (r: BandRow, key: string) => {
  const v = (r.original as unknown as Record<string, unknown> | null)?.[key];
  return typeof v === 'number' ? v : undefined;
};

/** The band type a row's draft describes, or null while any field is refused (the rule-level refusals are
 *  `bandRowRefusal`'s). */
export function fromDraft(r: BandRow): BandType | null {
  const num = (key: string) => lengthOf(r.draft[key], storedNumber(r, key));
  const name = cleanName((r.draft.name ?? '').trim());
  const thickness = num('thickness'), lengthAllowance = num('lengthAllowance');
  if (!name || thickness === undefined || lengthAllowance === undefined) return null;
  if (r.kind === 'tape') {
    const tapeWidth = num('tapeWidth'), pricePerFoot = priceOf(r.draft.price);
    if (tapeWidth === undefined || tapeWidth <= 0 || pricePerFoot === undefined) return null;
    return { id: r.id, name, kind: 'tape', thickness, lengthAllowance, tapeWidth, pricePerFoot };
  }
  const widthAllowance = num('widthAllowance');
  if (widthAllowance === undefined || thickness <= 0) return null;
  return { id: r.id, name, kind: 'solid', thickness, lengthAllowance, material: r.draft.material ?? '', widthAllowance };
}

/** The live rows as band types (a row that does not parse keeps its original, or is left out when new). */
function listed(rows: readonly BandRow[], swap?: { id: string; type: BandType | null }): BandType[] {
  return live(rows).flatMap((r) => {
    const t = swap && r.id === swap.id ? swap.type : (fromDraft(r) ?? r.original);
    return t ? [t] : [];
  });
}

/** Why this row cannot be saved, or null. Order (spec §5.2): the name, each number, a solid's thickness and material, a
 *  deletion in use, then the fault rule — an edit that ADDS a (side, kind) fault to a part using the type. */
export function bandRowRefusal(r: BandRow, rows: readonly BandRow[], ctx: BandCtx): string | null {
  const users = ctx.parts.filter((p) => p.bands.some((b) => b.type === r.id));
  if (r.deleted) {
    if (r.id === BUILT_IN_BAND_ID || users.length === 0) return null;
    return users.length === 1 ? 'Used by 1 part — change its bands first.' : `Used by ${users.length} parts — change their bands first.`;
  }
  const key = (r.draft.name ?? '').trim().toLowerCase();
  if (!key) return 'Give the band type a name.';
  const other = live(rows).find((o) => o.id !== r.id && (o.draft.name ?? '').trim().toLowerCase() === key);
  if (other) return `Another band type is called "${other.draft.name!.trim()}".`;
  for (const f of [...BASE_FIELDS, ...KIND_FIELDS[r.kind]]) {
    const v = lengthOf(r.draft[f.key], storedNumber(r, f.key));
    if (v === undefined || (f.key === 'tapeWidth' && v <= 0)) return `${f.label} must be a length.`;
  }
  if (r.kind === 'tape' && priceOf(r.draft.price) === undefined) return 'Price must be dollars or empty.';
  if (r.kind === 'solid') {
    if (lengthOf(r.draft.thickness, storedNumber(r, 'thickness')) === 0) return 'Solid edging needs a thickness.';
    if (!ctx.solids.has(r.draft.material ?? '')) return 'Edging comes from solid wood.';
  }
  // The fault rule: only a part using this type can change. Before: the list with this row as stored; after: as drafted
  // (this row's draft, which `rows` may hold an older copy of).
  const drafted = fromDraft(r);
  if (r.original && drafted && users.length > 0) {
    const before = listed(rows, { id: r.id, type: r.original });
    const after = listed(rows, { id: r.id, type: drafted });
    for (const p of users) {
      const had = new Set(bandFaults(p, before).map((f) => `${f.side.across}:${f.side.from}:${f.kind}`));
      const added = bandFaults(p, after).find((f) => !had.has(`${f.side.across}:${f.side.from}:${f.kind}`));
      if (added) return `${p.name}: ${bandFaultText(added.kind)}.`;
    }
  }
  return null;
}

/** The band types a Save writes: `{ refused }` for the first refusal; null when nothing changed (every live row equal
 *  to its original, none new, none deleted); else the whole list in row order, deleted rows out. */
export function planBandTypes(rows: readonly BandRow[], original: readonly BandType[], ctx: BandCtx): BandType[] | null | { refused: string } {
  for (const r of rows) {
    const why = bandRowRefusal(r, rows, ctx);
    if (why) return { refused: why };
  }
  const next = live(rows).map((r) => fromDraft(r)!);
  const same = next.length === original.length && next.every((t, i) => sameBandType(t, original[i]!));
  return same ? null : next;
}

/** Whether one field's draft parses (the field's `aria-invalid`); the rule-level refusals are `bandRowRefusal`'s. */
export function bandFieldValid(r: BandRow, key: string): boolean {
  if (key === 'price') return priceOf(r.draft.price) !== undefined;
  const v = lengthOf(r.draft[key], storedNumber(r, key));
  if (v === undefined) return false;
  if (key === 'tapeWidth') return v > 0;
  return !(key === 'thickness' && r.kind === 'solid' && v === 0);
}

/**
 * After a Save that reported a failed browser write the dialog stays open over a CHANGED project (App applies the project
 * edit first): each row takes the stored type with its id as its original, a deleted row the project no longer has leaves,
 * an unsaved new row the project now holds becomes a stored row. Drafts are kept.
 */
export function rebaseBandRows(rows: readonly BandRow[], types: readonly BandType[]): BandRow[] {
  return rows.flatMap((r): BandRow[] => {
    const t = types.find((x) => x.id === r.id);
    if (t) return [{ ...r, original: t }];
    return r.original === null ? [r] : [];
  });
}
