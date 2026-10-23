import type { SloydDocument } from './types';
import type { Violation } from './designCheck';
import type { Authored } from './generated';

/**
 * Generation's assembly-aware checks (generate-assemblies spec §5). Written for
 * the model, like designCheck's messages; not a person-facing string, so no
 * `→ units` edge. checkDesign itself is untouched: its maxParts stays PLACED
 * parts, which joinery relies on.
 */

/**
 * Parts the model had to describe: loose parts plus the parts of each
 * definition a placement reaches, once (root instances, then recursively
 * through definitions' own instances). An unplaced definition is not counted:
 * it is dropped from the design Refine hands the model (fu 239).
 */
export function distinctParts(doc: SloydDocument): number {
  const defs = new Map(doc.definitions.map((d) => [d.id, d]));
  const seen = new Set<string>();
  const reach = (instances: readonly { definition: string }[]) => {
    for (const i of instances) {
      const d = defs.get(i.definition);
      if (!d || seen.has(d.id)) continue;
      seen.add(d.id);
      reach(d.instances);
    }
  };
  reach(doc.instances);
  let n = doc.boards.length;
  for (const id of seen) n += defs.get(id)!.boards.length;
  return n;
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
 * message and the first-appearance order. A fault INSIDE one placement (all its
 * parts share one placement) never merges with one BETWEEN placements or with a
 * loose part, even when the authored labels coincide. The suffix says where:
 * "every placement … fix the assembly" only for an 'overlap' whose merged
 * violations all lie inside a single placement and whose group covers all of the
 * assembly's placements, of which there are at least two; every other kind, and
 * every other shape of fault, lists the placements involved in AUTHORED order
 * (by assembly first appearance, then the order the model wrote them). A
 * violation with no assembly part, or no parts, passes through as the same object.
 */
export function collapseViolations(violations: readonly Violation[], authored: Authored): Violation[] {
  interface Group { first: Violation; labels: string[]; placements: Set<string>; assemblies: Set<string>; internal: boolean }
  const out: (Violation | Group)[] = [];
  const groups = new Map<string, Group>();
  for (const v of violations) {
    const who = v.parts.map((n) => authored.parts.get(n));
    if (!who.some((a) => a?.assembly)) { out.push(v); continue; }
    const labels = v.parts.map((n, i) => who[i]?.label ?? n);
    const pls = new Set(who.map((a) => a?.placement ?? null));
    const internal = pls.size === 1 && !pls.has(null);
    // Two DIFFERENT hole (or band) faults on one part are two problems (AI-holes spec §3.1; AI-bands spec §3.2): the
    // message joins the key, less the flat name it starts with, which differs per placement (the same row in every
    // placement still merges).
    const own = (v.kind === 'hole-fault' || v.kind === 'band-fault') && v.parts.length === 1 && v.message.startsWith(v.parts[0]!) ? v.message.slice(v.parts[0]!.length) : null;
    const key = JSON.stringify([v.kind, internal, [...labels].sort(), own]);
    let g = groups.get(key);
    if (!g) {
      g = { first: v, labels, placements: new Set(), assemblies: new Set(), internal };
      groups.set(key, g);
      out.push(g);
    }
    for (const a of who) if (a?.placement && a.assembly) { g.placements.add(a.placement); g.assemblies.add(a.assembly); }
  }
  return out.map((x) => {
    if (!('first' in x)) return x;
    const [asm] = x.assemblies;
    const all = x.assemblies.size === 1 ? authored.placements.get(asm!) ?? [] : [];
    const every = x.first.kind === 'overlap' && x.internal && all.length > 1 && all.every((p) => x.placements.has(p));
    const ordered = [...x.assemblies].flatMap((a) => (authored.placements.get(a) ?? []).filter((p) => x.placements.has(p)));
    const where = every ? ` (in every placement of ${asm} — fix the assembly)` : ` (in ${ordered.join(', ')})`;
    const shown = x.first.shown === undefined ? {} : { shown: `${x.first.shown}${where}` };
    return { kind: x.first.kind, message: `${x.first.message}${where}`, ...shown, parts: x.labels };
  });
}
