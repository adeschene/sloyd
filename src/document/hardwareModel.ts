import type { HardwareType, HardwareUse } from './types';

/** The most of one type a single holder may carry (hardware spec §2.2); a merge past it is refused (Amended P1). */
export const HARDWARE_COUNT_MAX = 999;
/** The largest pack size a type may state (hardware spec §2.1). */
export const PACK_SIZE_MAX = 10000;

/** Every field of a `HardwareUse`, exact (inv 40): a new field fails tsc until it is listed here. */
export const HARDWARE_FIELDS = { type: true, count: true } as const satisfies Record<keyof HardwareUse, true>;
const HARDWARE_KEYS = Object.keys(HARDWARE_FIELDS) as (keyof HardwareUse)[];

export const copyHardwareUse = (u: HardwareUse): HardwareUse => ({ type: u.type, count: u.count });

/** Equal in order, every `HARDWARE_FIELDS` key exact. */
export function sameHardware(a: readonly HardwareUse[], b: readonly HardwareUse[]): boolean {
  return a.length === b.length && a.every((x, i) => HARDWARE_KEYS.every((k) => x[k] === b[i]![k]));
}

/** One entry per type (the first wins), sorted by `type`. */
export function canonicalHardware(uses: readonly HardwareUse[]): HardwareUse[] {
  const seen = new Set<string>();
  const kept = uses.filter((u) => { if (seen.has(u.type)) return false; seen.add(u.type); return true; }).map(copyHardwareUse);
  return kept.sort((p, q) => (p.type < q.type ? -1 : p.type > q.type ? 1 : 0));
}

/** `type` set to `count` (null removes it), the rest kept; canonical. */
export function withHardwareUse(uses: readonly HardwareUse[], type: string, count: number | null): HardwareUse[] {
  const rest = uses.filter((u) => u.type !== type);
  return canonicalHardware(count === null ? rest : [...rest, { type, count }]);
}

/** Counts added per type, canonical; null when any sum passes `HARDWARE_COUNT_MAX` (Amended P1: Ungroup refuses). */
export function mergeHardware(a: readonly HardwareUse[], b: readonly HardwareUse[]): HardwareUse[] | null {
  const sums = new Map<string, number>();
  for (const u of [...a, ...b]) sums.set(u.type, (sums.get(u.type) ?? 0) + u.count);
  const out: HardwareUse[] = [];
  for (const [type, count] of sums) {
    if (count > HARDWARE_COUNT_MAX) return null;
    out.push({ type, count });
  }
  return canonicalHardware(out);
}

/** The Add-type menu's presets (hardware spec §5.2): name and pack size, price null. */
export const HARDWARE_PRESETS: readonly { name: string; packSize: number }[] = [
  { name: 'Hinge', packSize: 1 },
  { name: 'Drawer slides (pair)', packSize: 1 },
  { name: 'Pull', packSize: 1 },
  { name: 'Knob', packSize: 1 },
  { name: 'Screw', packSize: 100 },
  { name: 'Shelf pin', packSize: 20 },
  { name: 'Dowel', packSize: 50 },
  { name: 'Other', packSize: 1 },
];

export function sameHardwareType(a: HardwareType, b: HardwareType): boolean {
  return a.id === b.id && a.name === b.name && a.packSize === b.packSize && a.pricePerPack === b.pricePerPack;
}

/** `doc` with its hardware types replaced by `next`: the SAME object when `next` is undefined or equal type by type
 *  (edit()'s no-op test, inv 4). */
export function withHardwareTypes<T extends { hardwareTypes: HardwareType[] }>(doc: T, next: readonly HardwareType[] | undefined): T {
  if (next === undefined) return doc;
  if (next.length === doc.hardwareTypes.length && next.every((t, i) => sameHardwareType(t, doc.hardwareTypes[i]!))) return doc;
  return { ...doc, hardwareTypes: [...next] };
}
