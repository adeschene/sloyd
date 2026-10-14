import { MATERIALS, type CustomMaterial, type MaterialKind } from '../document/types';
import { labelKey, mintMaterialId, sameMaterial, validateCustomMaterial } from '../document/materials';
import { formatLength, parseLength } from '../units/length';

export type RowSource = 'project' | 'library' | 'new';
/** Text drafts: a field may hold text that does not parse yet; Save stays off until every row does. */
export interface DefDraft { label: string; color: string; sheetLength: string; sheetWidth: string; nominal: boolean }
export interface Row {
  id: string;
  kind: MaterialKind;
  source: RowSource;
  /** The stored value this row started from (project copy, or library entry); null for a new row. */
  original: CustomMaterial | null;
  draft: DefDraft;
  addToLibrary: boolean;
  deleted: boolean;
}
export interface SavePlan { project: CustomMaterial[]; library: CustomMaterial[] | null; assign: { ids: string[]; material: string } | null }

const lengthText = (v: number) => formatLength(v, 64);
const toDraft = (m: CustomMaterial): DefDraft => ({
  label: m.label, color: m.color, nominal: m.nominal === true,
  sheetLength: m.sheet ? lengthText(m.sheet.length) : '', sheetWidth: m.sheet ? lengthText(m.sheet.width) : '',
});
const row = (m: CustomMaterial, source: RowSource): Row =>
  ({ id: m.id, kind: m.kind, source, original: m, draft: toDraft(m), addToLibrary: false, deleted: false });

export function initialRows(project: readonly CustomMaterial[], library: readonly CustomMaterial[]): Row[] {
  const ids = new Set(project.map((m) => m.id));
  return [...project.map((m) => row(m, 'project')), ...library.filter((m) => !ids.has(m.id)).map((m) => row(m, 'library'))];
}

const DEFAULT_SHEET: Record<MaterialKind, [string, string]> = { solid: ['', ''], 'sheet-veneered': ['96', '48'], 'sheet-plain': ['96', '48'] };
export function newRow(kind: MaterialKind, rows: readonly Row[], random?: () => number): Row {
  const [sheetLength, sheetWidth] = DEFAULT_SHEET[kind];
  return {
    id: mintMaterialId(kind, new Set(rows.map((r) => r.id)), random), kind, source: 'new', original: null,
    draft: { label: '', color: '#c8a878', sheetLength, sheetWidth, nominal: false }, addToLibrary: false, deleted: false,
  };
}

/** Kind is fixed once stored (spec §4.1); an unsaved new row may still change it, which re-mints its id. */
export function setRowKind(r: Row, kind: MaterialKind, rows: readonly Row[], random?: () => number): Row {
  if (r.source !== 'new' || r.kind === kind) return r;
  const fresh = newRow(kind, rows, random);
  return { ...fresh, draft: { ...fresh.draft, label: r.draft.label, color: r.draft.color } };
}

/** The label was typed: a new row, or one whose label (trimmed, case-insensitive) moved off the stored one. */
export const labelTyped = (r: Row) => r.original === null || labelKey(r.draft.label) !== labelKey(r.original.label);

export function useLibraryVersion(r: Row, library: readonly CustomMaterial[]): Row {
  const lib = library.find((m) => m.id === r.id);
  return lib ? { ...r, draft: toDraft(lib) } : r;
}

const positiveLength = (t: string) => { const v = parseLength(t); return v !== null && v > 0 ? v : undefined; };

/** The material a row's draft describes, or undefined while any field is refused. */
export function fromDraft(r: Row): CustomMaterial | undefined {
  // An untouched field keeps its stored value exactly (display rounds; stored is exact, inv 5).
  const keep = (text: string, stored: number | undefined) =>
    stored !== undefined && text === lengthText(stored) ? stored : positiveLength(text);
  const o = r.original?.sheet;
  const sheet = r.kind === 'solid' ? undefined
    : { length: keep(r.draft.sheetLength, o?.length), width: keep(r.draft.sheetWidth, o?.width) };
  if (sheet && (sheet.length === undefined || sheet.width === undefined)) return undefined;
  return validateCustomMaterial({
    id: r.id, kind: r.kind, label: r.draft.label, color: r.draft.color,
    ...(r.kind === 'solid' && r.draft.nominal ? { nominal: true } : {}),
    ...(sheet ? { sheet } : {}),
  }) ?? undefined;
}

const BUILT_IN_LABELS = new Map(Object.values(MATERIALS).map((m) => [labelKey(m.label), m.label]));
const live = (rows: readonly Row[]) => rows.filter((r) => !r.deleted);

export function rowRefusal(r: Row, rows: readonly Row[]): string | null {
  const key = labelKey(r.draft.label);
  if (!key) return 'Give the material a name.';
  if (r.kind !== 'solid' && (positiveLength(r.draft.sheetLength) === undefined || positiveLength(r.draft.sheetWidth) === undefined)) {
    return 'Sheet sizes must be positive lengths.';
  }
  const builtIn = BUILT_IN_LABELS.get(key);
  if (builtIn !== undefined && labelTyped(r)) return `Another material is already called "${builtIn}".`;
  const other = live(rows).find((o) => o.id !== r.id && labelKey(o.draft.label) === key);
  // A clash refuses only when one side's LABEL was typed; an imported pair is shown, not blocked (edit where you are).
  if (other && (labelTyped(r) || labelTyped(other))) return `Another material is already called "${other.draft.label.trim()}".`;
  if (!fromDraft(r)) return 'Choose a colour.';
  return null;
}

export function rowNotes(r: Row, rows: readonly Row[], library: readonly CustomMaterial[]) {
  const lib = library.find((m) => m.id === r.id);
  const parsed = fromDraft(r);
  const key = labelKey(r.draft.label);
  return {
    differs: r.source === 'project' && lib !== undefined && parsed !== undefined && !sameMaterial(lib, parsed),
    notInLibrary: r.source === 'project' && lib === undefined,
    libraryLabelClash: r.source !== 'library' && library.some((m) => m.id !== r.id && labelKey(m.label) === key),
    sameNameAsProject: r.source === 'library' && live(rows).some((o) => o.source === 'project' && labelKey(o.draft.label) === key),
  };
}

export function planSave(input: {
  rows: readonly Row[]; library: readonly CustomMaterial[]; libraryWritable: boolean; assignIds: string[] | null; locked: boolean;
}): SavePlan | { refused: string } {
  const { rows, library, libraryWritable, assignIds, locked } = input;
  if (locked) return { project: [], library: null, assign: null };
  for (const r of live(rows)) {
    const why = rowRefusal(r, rows);
    if (why) return { refused: why };
    if (r.addToLibrary && rowNotes(r, rows, library).libraryLabelClash) {
      return { refused: `Your library already has a material called "${r.draft.label.trim()}" — rename one first.` };
    }
  }
  const parsed = new Map(live(rows).map((r) => [r.id, fromDraft(r)!]));
  const changed = (r: Row) => r.original === null || !sameMaterial(r.original, parsed.get(r.id)!);
  const newRows = live(rows).filter((r) => r.source === 'new');
  const assigned = assignIds && newRows[0] ? newRows[0] : null;

  const project = live(rows).filter((r) => (r.source === 'project' && changed(r)) || r === assigned).map((r) => parsed.get(r.id)!);

  let lib: CustomMaterial[] | null = null;
  if (libraryWritable) {
    let next = [...library];
    const upsert = (m: CustomMaterial) => {
      const i = next.findIndex((x) => x.id === m.id);
      next = i >= 0 ? next.map((x, j) => (j === i ? m : x)) : [...next, m];
    };
    for (const r of rows) {
      if (r.deleted) { if (r.source === 'library') next = next.filter((m) => m.id !== r.id); continue; }
      const m = parsed.get(r.id)!;
      if (r.source === 'project') {
        if ((changed(r) || r.addToLibrary) && !rowNotes(r, rows, library).libraryLabelClash) upsert(m);
      } else if (changed(r)) {
        upsert(m);
      }
    }
    const seen: CustomMaterial[] = [];
    for (const m of next) {
      const k = labelKey(m.label);
      const twin = seen.find((e) => labelKey(e.label) === k);
      if (twin) {
        const a = library.find((x) => x.id === twin.id), b = library.find((x) => x.id === m.id);
        const preExisting = a !== undefined && b !== undefined && labelKey(a.label) === k && labelKey(b.label) === k;
        if (!preExisting) return { refused: `Your library would have two materials called "${m.label.trim()}" — rename one first.` };
      }
      seen.push(m);
    }
    const same = next.length === library.length && next.every((m, i) => sameMaterial(m, library[i]!));
    lib = same ? null : next;
  }
  return { project, library: lib, assign: assigned && assignIds ? { ids: assignIds, material: assigned.id } : null };
}
