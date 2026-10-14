import {
  DEFAULT_MATERIAL, MATERIALS, isCustomMaterialId, materialKind,
  type Board, type CustomMaterial, type MaterialKind, type SheetStock, type SloydDocument, type StoredBoard,
} from './types';

/** What pruning and upserting need. Structural, so this module builds before `SloydDocument` has `materials`. */
export type MaterialDoc = Pick<SloydDocument, 'boards' | 'definitions' | 'shapes'> & { materials: CustomMaterial[] };

/** Everything a page shows about one material (custom materials spec §3). */
export interface MaterialInfo {
  id: string;
  label: string;
  color: string;
  kind: MaterialKind;
  nominal: boolean;
  sheet?: SheetStock;
  builtIn: boolean;
}

/** Built-ins + one document's custom materials. Labels, colours and sheet sizes come only from here. */
export interface MaterialCatalog {
  get(id: string): MaterialInfo | undefined;
  /** Built-ins in MATERIALS order, then the document's, in stored order. */
  ids: readonly string[];
  /** The raw id for an unknown one (a code-built part), never `undefined` on a page. */
  label(id: string): string;
  /** Pine's colour for an unknown one, as BoardMesh always fell back. */
  color(id: string): string;
}

export const BUILT_IN_MATERIAL_IDS: ReadonlySet<string> = new Set(Object.keys(MATERIALS));

const KIND_LETTER: Record<MaterialKind, string> = { solid: 's', 'sheet-veneered': 'v', 'sheet-plain': 'p' };
const COLOR = /^#[0-9a-fA-F]{6}$/;
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** Trimmed and lower-cased: the one way two labels are compared (spec §4.1). */
export const labelKey = (label: string) => label.trim().toLowerCase();

/** A fresh custom id of this kind, not in `taken`. Random so two browsers cannot collide by accident (§2.2). */
export function mintMaterialId(kind: MaterialKind, taken: ReadonlySet<string> = new Set(), random: () => number = Math.random): string {
  for (;;) {
    const body = random().toString(36).slice(2, 12).replace(/[^a-z0-9]/g, '').padEnd(8, '0');
    const id = `m-${KIND_LETTER[kind]}-${body}`;
    if (!taken.has(id)) return id;
  }
}

/** One stored entry, or null to drop it (spec §2.3). Fields foreign to the kind are dropped, the entry kept. */
export function validateCustomMaterial(raw: unknown): CustomMaterial | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.id !== 'string' || !isCustomMaterialId(m.id)) return null;
  const kind = materialKind(m.id);
  if (m.kind !== kind) return null;
  const label = typeof m.label === 'string' ? m.label.trim() : '';
  if (!label) return null;
  if (typeof m.color !== 'string' || !COLOR.test(m.color)) return null;
  const out: CustomMaterial = { id: m.id, label, color: m.color.toLowerCase(), kind };
  if (kind === 'solid') {
    if (m.nominal === true) out.nominal = true;
    return out;
  }
  const s = m.sheet;
  if (typeof s !== 'object' || s === null) return null;
  const { length, width } = s as Record<string, unknown>;
  if (!positive(length) || !positive(width)) return null;
  out.sheet = { length, width };
  return out;
}

/** A list: malformed entries dropped, a duplicate id keeps the FIRST (invariant 33's scope: per list). */
export function validateCustomMaterials(raw: unknown): CustomMaterial[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: CustomMaterial[] = [];
  for (const item of raw) {
    const m = validateCustomMaterial(item);
    if (!m || seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

export function sameMaterial(a: CustomMaterial, b: CustomMaterial): boolean {
  return a.id === b.id && a.label === b.label && a.color === b.color && a.kind === b.kind &&
    (a.nominal === true) === (b.nominal === true) &&
    a.sheet?.length === b.sheet?.length && a.sheet?.width === b.sheet?.width;
}

const builtInInfo = (id: string): MaterialInfo => {
  const m = MATERIALS[id]!;
  return { id, label: m.label, color: m.color, kind: materialKind(id), nominal: false, ...(m.sheet ? { sheet: m.sheet } : {}), builtIn: true };
};
const customInfo = (m: CustomMaterial): MaterialInfo => ({
  id: m.id, label: m.label, color: m.color, kind: m.kind, nominal: m.nominal === true, builtIn: false,
  ...(m.sheet ? { sheet: { length: m.sheet.length, width: m.sheet.width, rotate: m.kind === 'sheet-plain' ? 'free' : 'grain' } } : {}),
});

function makeCatalog(customs: readonly CustomMaterial[]): MaterialCatalog {
  const map = new Map<string, MaterialInfo>([...BUILT_IN_MATERIAL_IDS].map((id) => [id, builtInInfo(id)]));
  for (const c of customs) if (!map.has(c.id)) map.set(c.id, customInfo(c));
  const ids = [...map.keys()];
  const fallback = map.get(DEFAULT_MATERIAL)!;
  return {
    get: (id) => map.get(id),
    ids,
    label: (id) => map.get(id)?.label ?? id,
    color: (id) => (map.get(id) ?? fallback).color,
  };
}

const BUILT_IN = makeCatalog([]);
const memo = new WeakMap<readonly CustomMaterial[], MaterialCatalog>();

export const builtInCatalog = (): MaterialCatalog => BUILT_IN;

/** Built-ins + `doc.materials`, memoised on the array's identity (every render shares one per document state). */
export function catalogOf(doc: { materials: readonly CustomMaterial[] }): MaterialCatalog {
  let c = memo.get(doc.materials);
  if (!c) {
    c = makeCatalog(doc.materials);
    memo.set(doc.materials, c);
  }
  return c;
}

const plainMaterial = (b: StoredBoard): string | undefined => ('material' in b ? (b as Board).material : undefined);

/** Every material id a stored part (root or definition) or a shape names. */
export function materialUses(doc: Pick<SloydDocument, 'boards' | 'definitions' | 'shapes'>): Set<string> {
  const out = new Set<string>();
  for (const b of [...doc.boards, ...doc.definitions.flatMap((d) => d.boards)]) {
    const m = plainMaterial(b);
    if (m !== undefined) out.add(m);
  }
  for (const s of doc.shapes) out.add(s.material);
  return out;
}

/** Drop custom materials nothing uses (spec §2.3). The SAME object when nothing goes (edit()'s no-op test). */
export function pruneMaterials<T extends MaterialDoc>(doc: T): T {
  const used = materialUses(doc);
  const kept = doc.materials.filter((m) => used.has(m.id));
  return kept.length === doc.materials.length ? doc : { ...doc, materials: kept };
}

/** Replace by id, append new; the SAME object when nothing changes. Unused entries are pruned by edit(). */
export function upsertMaterials<T extends MaterialDoc>(doc: T, ms: readonly CustomMaterial[]): T {
  let materials = doc.materials;
  for (const m of ms) {
    const i = materials.findIndex((x) => x.id === m.id);
    if (i >= 0 && sameMaterial(materials[i]!, m)) continue;
    materials = i >= 0 ? materials.map((x, j) => (j === i ? m : x)) : [...materials, m];
  }
  return materials === doc.materials ? doc : { ...doc, materials };
}

/** Library entries the picker may list (spec §4.1–4.2): not in the project, and named like no built-in and no
 *  project material — so one label never shows twice. */
export function pickerLibrary(project: readonly CustomMaterial[], library: readonly CustomMaterial[]): CustomMaterial[] {
  const ids = new Set(project.map((m) => m.id));
  const taken = new Set([...Object.values(MATERIALS).map((m) => labelKey(m.label)), ...project.map((m) => labelKey(m.label))]);
  return library.filter((m) => !ids.has(m.id) && !taken.has(labelKey(m.label)));
}
