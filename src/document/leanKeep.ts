import type { Board, Definition, Instance, Shape, SloydDocument, StoredBoard } from './types';
import { leans } from './lean';
import { isTilted } from './holeTilt';
import { hasTenons } from './roundTenons';
import { hasCompoundCut } from './angleCuts';
import { fingerSets } from './boxJoints';
import { partBounds } from './worldBounds';
import { isShaped, resolveBoard, shapeMap } from './shapes';
import { flatDocument, instancesOn, lastSegment, parentPath } from './tree';

/**
 * What Refine keeps exactly as stored (splayed legs spec §8; angled holes spec §9; round tenons spec §9): every ROOT part
 * that leans, has a tilted hole row or has a round tenon (the design format has no word for any of them) — its stored record (lean,
 * position, turn, features, Shape reference and mirror flag) and the Shapes those records point to. The design format
 * describes parts as world boxes and every world-word converter assumes part axes equal world axes, so a leaning part is
 * never sent to the model as a part, never converted back from it, and never linked by role (`linkByRole` skips it: it
 * has no role). A Shape's users all share its lean, its holes and its tenons (`LINK_FIELDS.lean`, `holes` and `tenons` are shared), so a kept Shape has only kept users.
 *
 * Root only, for those kinds: a kept part (leaning, with a tilted row, a round tenon or a compound cut) inside an assembly is
 * refused (`leaningInAssembly`), because its definition is rebuilt from the model's assembly. At the root a part's flat name
 * is its stored name and its world part is its resolved record.
 *
 * Box joints keep the WHOLE assembly instead (box-joints spec §7, Amended 2026-10-27, the user's ruling): a definition any of
 * whose parts has a recognised finger set is kept as stored, every part of it, with every root placement of it. The unit
 * is the assembly, never one part spliced into a definition the model rebuilt.
 */
export interface KeptParts {
  /** The kept ROOT stored records, in the document's order (the same objects). */
  boards: StoredBoard[];
  /** The Shapes every kept board points to, root and definition, in the document's order. */
  shapes: Shape[];
  /** The kept root boards' flat names, in the same order. */
  names: string[];
  /** The kept definitions (a box-jointed part inside), in the document's order (the same objects). */
  definitions: Definition[];
  /** Every root placement of a kept definition, in the document's order (the same objects). */
  instances: Instance[];
  /** Their names, in the same order. */
  placements: string[];
}

/** A part Refine keeps as stored: it leans, has a tilted hole row, has a round tenon, has a compound end cut or has a
 *  recognised box joint (the ONE predicate; angled holes spec §9, round tenons spec §9, square-set legs spec §4,
 *  box-joints spec §7: the design format has no word for fingers, and a box-jointed part is one unit with its mates).
 *  A tenon is read off the stored list, faulted or not: a faulted one is kept verbatim too. A compound cut is kept so no world-word converter (`worldAngles`,
 *  `angleCutsFor`) ever reads it as a single-slope miter and drops its `across`; it exists only on a leg that leans, or did
 *  (Clear lean keeps it), so the leaning wording of the kept list and the assembly refusal stands. */
export const keepsExactly = (b: Board): boolean => keptForMoreThanFingers(b) || fingerSets(b).length > 0;

/** `keepsExactly` without its box-joint clause: the kinds that, inside an assembly, still refuse (`leaningInAssembly`; box-joints
 *  spec §7, Amended: widening those is a follow-up). */
const keptForMoreThanFingers = (b: Board): boolean => leans(b) || b.holes.some(isTilted) || hasTenons(b) || hasCompoundCut(b);

/** The ONE decision of what Refine keeps (splayed legs spec §8; angled holes §9; round tenons §9; box-joints spec §7, Amended):
 *  every root part whose resolved form `keepsExactly`, and every definition holding a part with a recognised finger set, with
 *  its root placements. */
export function keptParts(doc: SloydDocument): KeptParts {
  const shapes = shapeMap(doc);
  const boards = doc.boards.filter((b) => {
    const r = resolveBoard(shapes, b);
    return r !== null && keepsExactly(r);
  });
  const definitions = doc.definitions.filter((d) => d.boards.some((b) => {
    const r = resolveBoard(shapes, b);
    return r !== null && fingerSets(r).length > 0;
  }));
  const defIds = new Set(definitions.map((d) => d.id));
  const instances = doc.instances.filter((i) => defIds.has(i.definition));
  const used = new Set([...boards, ...definitions.flatMap((d) => d.boards)].filter(isShaped).map((b) => b.shape));
  return { boards, shapes: doc.shapes.filter((s) => used.has(s.id)), names: boards.map((b) => b.name),
    definitions, instances, placements: instances.map((i) => i.name) };
}

/** The flat name of the first part placed inside an assembly that is kept for more than box joints (it leans, has a tilted
 *  row, a round tenon or a compound end cut), or null (Refine refuses it, `documentToDesign`). A part kept ONLY for box joints
 *  keeps its whole assembly instead (box-joints spec §7, Amended). */
export function leaningInAssembly(doc: SloydDocument): string | null {
  return flatDocument(doc).boards.find((b) => parentPath(b.id) !== null && keptForMoreThanFingers(b))?.name ?? null;
}

/** A kept assembly linked outside itself (box-joints spec §7, Amended; context copy). */
const keptAssemblyLinked = (part: string) =>
  `Refine can't keep a box-jointed assembly whose parts are linked to parts outside it — Unlink first: ${part}.`;

/**
 * The refusal when a kept assembly's part shares a Shape with a placed part outside the kept set, or null (box-joints spec
 * §7, Amended; R3). The kept Shape goes back as stored, so its users must all be kept: a model-rebuilt user would leave it
 * one user short (`dissolveShapes` would unlink a kept part) or put a kept part's shared fields on a part the model changed.
 * Names the outside user's flat name, the first Shape (document order) and its first placed outside user (flat order).
 */
export function keptAssemblyLinkRefusal(doc: SloydDocument): string | null {
  const kept = keptParts(doc);
  if (kept.definitions.length === 0) return null;
  const keptDefs = new Set(kept.definitions.map((d) => d.id));
  const keptRoots = new Set(kept.boards.map((b) => b.id));
  const inside = new Set(kept.definitions.flatMap((d) => d.boards).filter(isShaped).map((b) => b.shape));
  const defs = new Map(doc.definitions.map((d) => [d.id, d]));
  // Each placed part's stored record and whether it is kept, by its world path.
  const placed = flatDocument(doc).boards.flatMap((fb) => {
    const at = parentPath(fb.id);
    if (at === null) {
      const b = doc.boards.find((x) => x.id === fb.id);
      return b ? [{ name: fb.name, stored: b, kept: keptRoots.has(b.id) }] : [];
    }
    const d = defs.get(instancesOn(doc, at)?.at(-1)?.definition ?? '');
    const b = d?.boards.find((x) => x.id === lastSegment(fb.id));
    return d && b ? [{ name: fb.name, stored: b, kept: keptDefs.has(d.id) }] : [];
  });
  for (const s of doc.shapes) {
    if (!inside.has(s.id)) continue;
    const out = placed.find((p) => !p.kept && isShaped(p.stored) && p.stored.shape === s.id);
    if (out) return keptAssemblyLinked(out.name);
  }
  return null;
}

/** Why a kept part is kept, in the note's words: the existing two-reason forms unchanged, a round tenon and then box
 *  joints appended (box-joints spec §7). A compound end cut is named only on a part kept for nothing else (a leg whose
 *  lean was cleared), so a leaning leg's line is byte for byte as before. */
function whyKept(b: Board): string {
  const why = [leans(b) && 'leans', b.holes.some(isTilted) && 'has angled holes', hasTenons(b) && 'has round tenons',
    fingerSets(b).length > 0 && 'has box joints'].filter((w): w is string => w !== false);
  if (why.length === 0) return 'has a compound end cut';
  if (why.length === 1) return why[0]!;
  return `${why.slice(0, -1).join(', ')} and ${why[why.length - 1]},`;
}

/**
 * The kept parts as the model sees them (splayed legs spec §8, "what the model sees"): context in the USER turn, never in
 * the design JSON or `SYSTEM_PROMPT`. One line per part with its REAL world bounds (`partBounds`, R2: the leaned bodies,
 * never the pre-lean box), saying why it is kept (it leans, has angled holes, has round tenons) and that it is kept as is, and one line telling the model not to return it. Null
 * when nothing is kept.
 */
export function keptNote(doc: SloydDocument): string | null {
  const keptAll = keptParts(doc);
  const kept = new Set(keptAll.names);
  if (kept.size === 0 && keptAll.instances.length === 0) return null;
  const n = (v: number) => +v.toFixed(3);
  const bounds = (min: readonly number[], max: readonly number[]) =>
    `x ${n(min[0]!)} to ${n(max[0]!)}, y ${n(min[1]!)} to ${n(max[1]!)}, z ${n(min[2]!)} to ${n(max[2]!)}`;
  const flat = flatDocument(doc).boards;
  const keptBoards = flat.filter((b) => parentPath(b.id) === null && kept.has(b.name));
  const lines = keptBoards.map((b) => {
    const { min, max } = partBounds(b);
    return `"${b.name}" ${whyKept(b)} and is kept as is: ${bounds(min, max)}.`;
  });
  // One line per kept placement (box-joints spec §7, Amended): the world bounds over its parts, in the same number format.
  for (const inst of keptAll.instances) {
    const own = flat.filter((b) => parentPath(b.id) === inst.id).map(partBounds);
    if (own.length === 0) continue;
    const min = [0, 1, 2].map((k) => Math.min(...own.map((o) => o.min[k]!)));
    const max = [0, 1, 2].map((k) => Math.max(...own.map((o) => o.max[k]!)));
    lines.push(`"${inst.name}" is an assembly with box joints and is kept as is: ${bounds(min, max)}.`);
  }
  // The header names round tenons only when one is kept, and box joints only when a box-jointed part or assembly is kept
  // (box-joints spec §7), so a document with neither has its message byte for byte as before.
  const kinds = ['lean', 'have angled holes', ...(keptBoards.some(hasTenons) ? ['have round tenons'] : []),
    ...(keptBoards.some((b) => fingerSets(b).length > 0) || keptAll.instances.length > 0 ? ['have box joints'] : [])];
  return [
    `These parts ${kinds.slice(0, -1).join(', ')} or ${kinds[kinds.length - 1]}, which the design format cannot describe, so they are not in the design above. Sloyd keeps each exactly where it is; the bounds are world inches:`,
    ...lines,
    'Fit the rest of the design to them, and do not return a part with any of these names: one would be dropped.',
  ].join('\n');
}
