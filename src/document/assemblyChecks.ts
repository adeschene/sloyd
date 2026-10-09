import type { SloydDocument } from './types';
import type { Violation } from './designCheck';
import type { Authored } from './generated';

/**
 * Generation's assembly-aware checks (generate-assemblies spec §5). Written for
 * the model, like designCheck's messages; not a person-facing string, so no
 * `→ units` edge. checkDesign itself is untouched: its maxParts stays PLACED
 * parts, which joinery relies on.
 */

/** Parts the model had to describe: loose parts plus each definition's parts once. */
export function distinctParts(doc: SloydDocument): number {
  return doc.boards.length + doc.definitions.reduce((n, d) => n + d.boards.length, 0);
}

export function distinctPartsViolation(doc: SloydDocument, cap: number): Violation | null {
  const n = distinctParts(doc);
  return n > cap
    ? { kind: 'too-many-parts', message: `${n} distinct parts; the limit is ${cap} (an assembly's parts count once).`, parts: [] }
    : null;
}

/**
 * One fault, one report (invariant 39's rule, across placements): violations
 * whose parts map to the same AUTHORED parts (`Drawer › Front`, not
 * `Drawer 3 › Front`) and share a kind merge into one, keeping the first
 * message and the first-appearance order. The suffix says where:
 * "every placement … fix the assembly" only when EVERY merged violation lies
 * inside a single placement (no loose part, no second placement) and the group
 * covers all of the assembly's placements, of which there are at least two;
 * otherwise the placements involved are listed. A violation with no assembly
 * part, or no parts, passes through as the same object.
 */
export function collapseViolations(violations: readonly Violation[], authored: Authored): Violation[] {
  interface Group { first: Violation; labels: string[]; placements: Set<string>; assemblies: Set<string>; internal: boolean }
  const out: (Violation | Group)[] = [];
  const groups = new Map<string, Group>();
  for (const v of violations) {
    const who = v.parts.map((n) => authored.parts.get(n));
    if (!who.some((a) => a?.assembly)) { out.push(v); continue; }
    const labels = v.parts.map((n, i) => who[i]?.label ?? n);
    const key = JSON.stringify([v.kind, [...labels].sort()]);
    let g = groups.get(key);
    if (!g) {
      g = { first: v, labels, placements: new Set(), assemblies: new Set(), internal: true };
      groups.set(key, g);
      out.push(g);
    }
    const pls = new Set(who.map((a) => a?.placement ?? null));
    if (pls.size !== 1 || pls.has(null)) g.internal = false;
    for (const a of who) if (a?.placement && a.assembly) { g.placements.add(a.placement); g.assemblies.add(a.assembly); }
  }
  return out.map((x) => {
    if (!('first' in x)) return x;
    const [asm] = x.assemblies;
    const all = x.assemblies.size === 1 ? authored.placements.get(asm!) ?? [] : [];
    const every = x.internal && all.length > 1 && all.every((p) => x.placements.has(p));
    const where = every ? ` (in every placement of ${asm} — fix the assembly)` : ` (in ${[...x.placements].join(', ')})`;
    return { kind: x.first.kind, message: `${x.first.message}${where}`, parts: x.labels };
  });
}
