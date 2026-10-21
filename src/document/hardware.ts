import type { Definition, HardwareType, HardwareUse, SloydDocument } from './types';
import { NAME_SEPARATOR, definitionAt, parentPath, partAt, placementsOf } from './tree';
import { resolveBoard, shapeMap } from './shapes';

/** What a hardware entry list is read from (hardware spec §3): a part by occurrence path, an assembly by instance path, or the project. */
export type HardwareTarget = { kind: 'part'; id: string } | { kind: 'assembly'; path: string } | { kind: 'project' };

/** One STORED holder's line: `each` of the type, carried `times` over (its placements). */
export interface HardwareUseLine { holder: string; each: number; times: number }
export interface HardwareTotal { type: HardwareType; total: number; uses: readonly HardwareUseLine[] }

interface Holder { name: string; hardware: readonly HardwareUse[]; times: number }

function deepFreeze<T>(o: T): T {
  if (typeof o !== 'object' || o === null || Object.isFrozen(o)) return o;
  Object.freeze(o);
  for (const v of Object.values(o)) deepFreeze(v);
  return o;
}

/** Every STORED holder with hardware, in `worldParts` order (parts, then each instance depth first), then the project.
 *  Holder names are the FIRST occurrence's flat path name (spec §3, Amended builder check). One walk; hidden-ness and
 *  `explode` are view state and never read (inv 43). A definition never placed has `times` 0 and is dropped. */
function holdersOf(doc: SloydDocument): Holder[] {
  const placed = placementsOf(doc);
  const defs = new Map(doc.definitions.map((d) => [d.id, d]));
  const shapes = shapeMap(doc);
  const out: Holder[] = [];
  const seenParts = new Set<string>();
  const seenDefs = new Set<string>();
  const walk = (c: { boards: SloydDocument['boards']; instances: SloydDocument['instances'] }, cid: string | null, prefix: string, times: number, onPath: Set<string>) => {
    for (const b of c.boards) {
      const key = `${cid ?? ''}\u0000${b.id}`;
      if (seenParts.has(key)) continue;
      seenParts.add(key);
      const hardware = resolveBoard(shapes, b)?.hardware ?? [];
      if (hardware.length > 0 && times > 0) out.push({ name: prefix + b.name, hardware, times });
    }
    for (const inst of c.instances) {
      const d: Definition | undefined = defs.get(inst.definition);
      if (!d || onPath.has(d.id)) continue;
      const name = prefix + inst.name;
      if (!seenDefs.has(d.id)) {
        seenDefs.add(d.id);
        const times = placed.get(d.id) ?? 0;
        if (d.hardware.length > 0 && times > 0) out.push({ name, hardware: d.hardware, times });
      }
      walk(d, d.id, name + NAME_SEPARATOR, placed.get(d.id) ?? 0, new Set([...onPath, d.id]));
    }
  };
  walk(doc, null, '', 1, new Set());
  if (doc.hardware.length > 0) out.push({ name: 'Project', hardware: doc.hardware, times: 1 });
  return out;
}

const cache = new WeakMap<SloydDocument, readonly HardwareTotal[]>();

/** THE hardware counter (spec §3): per type, the total over placed parts, assemblies (once per placement) and the
 *  project, with one where-used line per stored holder. Memoised per document object, deep-frozen; types with no use
 *  are omitted, `doc.hardwareTypes` order. */
export function hardwareTotals(doc: SloydDocument): readonly HardwareTotal[] {
  const hit = cache.get(doc);
  if (hit) return hit;
  const holders = holdersOf(doc);
  const out: HardwareTotal[] = [];
  for (const type of doc.hardwareTypes) {
    const uses: HardwareUseLine[] = [];
    for (const h of holders) for (const u of h.hardware) if (u.type === type.id) uses.push({ holder: h.name, each: u.count, times: h.times });
    const total = uses.reduce((s, l) => s + l.each * l.times, 0);
    if (total > 0) out.push({ type, total, uses });
  }
  const frozen = deepFreeze(out);
  cache.set(doc, frozen);
  return frozen;
}

/** The number of PLACED holders using a type (a part placed twice counts twice; the project once). */
export function hardwareUsedBy(doc: SloydDocument, typeId: string): number {
  return holdersOf(doc).reduce((s, h) => s + (h.hardware.some((u) => u.type === typeId) ? h.times : 0), 0);
}

/** How many times a target is placed: 1 for the project; a part's container's placements, an assembly's definition's. */
export function holderPlacements(doc: SloydDocument, target: HardwareTarget): number {
  if (target.kind === 'project') return 1;
  const def = target.kind === 'assembly' ? definitionAt(doc, target.path) : parentPath(target.id) === null ? null : definitionAt(doc, parentPath(target.id)!);
  if (!def) return target.kind === 'part' && parentPath(target.id) === null ? 1 : 0;
  return placementsOf(doc).get(def.id) ?? 0;
}

const NO_HARDWARE: readonly HardwareUse[] = Object.freeze([]);

/** The stored entry list of a target (a shaped part's from its Shape). Always a STORED array (or the frozen empty one),
 *  never a copy: it is read by store selectors, which must return a stable value (inv 43). */
export function holderHardware(doc: SloydDocument, target: HardwareTarget): readonly HardwareUse[] {
  if (target.kind === 'project') return doc.hardware;
  if (target.kind === 'assembly') return definitionAt(doc, target.path)?.hardware ?? NO_HARDWARE;
  const p = partAt(doc, target.id);
  if (!p) return NO_HARDWARE;
  if ('shape' in p && p.shape !== undefined) return doc.shapes.find((sh) => sh.id === p.shape)?.hardware ?? NO_HARDWARE;
  return (p as { hardware?: readonly HardwareUse[] }).hardware ?? NO_HARDWARE;
}

/** The cut list's where-used line (spec §4.1): `<holder>: <each>`, ` × <times>` when placed more than once, joined by `; `. */
export function hardwareUseText(t: HardwareTotal): string {
  return t.uses.map((l) => `${l.holder}: ${l.each}${l.times > 1 ? ` × ${l.times}` : ''}`).join('; ');
}
