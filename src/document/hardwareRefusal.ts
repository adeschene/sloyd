import type { Container } from './tree';
import type { Definition, SloydDocument } from './types';
import { NAME_SEPARATOR, flatDocument } from './tree';

/**
 * Who carries hardware Refine cannot map (hardware spec §6): the flat (display) names of the placed parts whose hardware
 * is non-empty, then the path names of the placed assemblies whose definition's is. The PROJECT never: its hardware names
 * no part, so Refine carries it. Takes the STORED document (Amended (planning) P2): `flatDocument` empties `definitions`.
 */
export function hardwareHolders(doc: SloydDocument): string[] {
  const parts = flatDocument(doc).boards.filter((b) => b.hardware.length > 0).map((b) => b.name);
  const defs = new Map<string, Definition>(doc.definitions.map((d) => [d.id, d]));
  const assemblies: string[] = [];
  // displayNames' walk (tree.ts), over instances: one name per placement, a cycle guarded the same way.
  const walk = (c: Container, prefix: string, onPath: Set<string>) => {
    for (const inst of c.instances) {
      const d = defs.get(inst.definition);
      if (!d || onPath.has(d.id)) continue;
      if (d.hardware.length > 0) assemblies.push(prefix + inst.name);
      walk(d, `${prefix}${inst.name}${NAME_SEPARATOR}`, new Set([...onPath, d.id]));
    }
  };
  walk(doc, '', new Set());
  return [...parts, ...assemblies];
}

const list = (names: string[]) => `${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}`;

/**
 * Refine's refusal for hardware on parts or assemblies (hardware spec §6), or null. Decided at entry, before any paid
 * call: the refined design's parts are new, so their hardware could not be mapped. Joinery and Repair accept it.
 */
export function hardwareRefusal(doc: SloydDocument): string | null {
  const names = hardwareHolders(doc);
  if (names.length === 0) return null;
  return `Refine doesn't handle hardware on parts yet (${list(names)}). Refine before adding hardware, or remove it first.`;
}
