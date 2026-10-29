import type { Board, Definition, Instance, Shape, SloydDocument, StoredBoard } from './types';
import { leans } from './lean';
import { isTilted } from './holeTilt';
import { hasHead } from './holes';
import { hasTenons } from './roundTenons';
import { hasCompoundCut } from './angleCuts';
import { fingerSets } from './boxJoints';
import { hasDovetails } from './dovetailModel';
import { DOVETAIL_KEPT_WHY, dovetailedAssemblyLinked, mixedAssemblyLinked } from './dovetailText';
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
 * is the assembly, never one part spliced into a definition the model rebuilt. Dovetails (dovetails spec §7) and a
 * counterbored or countersunk hole row (counterbores spec §9, the user's ruling 2026-10-29) take the same route
 * (`keptWhole`).
 */
export interface KeptParts {
  /** The kept ROOT stored records, in the document's order (the same objects). */
  boards: StoredBoard[];
  /** The Shapes every kept board points to, root and definition, in the document's order. */
  shapes: Shape[];
  /** The kept root boards' flat names, in the same order. */
  names: string[];
  /** The kept definitions (a corner-jointed or headed part inside, `keptWhole`), in the document's order (the same objects). */
  definitions: Definition[];
  /** Every root placement of a kept definition, in the document's order (the same objects). */
  instances: Instance[];
  /** Their names, in the same order. */
  placements: string[];
}

/** A part Refine keeps as stored: it leans, has a tilted hole row, has a round tenon, has a compound end cut, has a
 *  corner joint (a recognised box joint or a stored dovetail, `cornerJointed`) or has a counterbored or countersunk hole
 *  row (`keptWhole`) (the ONE predicate; angled holes spec §9, round tenons spec §9, square-set legs spec §4, box-joints
 *  spec §7, dovetails spec §7, counterbores spec §9: the design format has no word for fingers, dovetails or a hole's head,
 *  and a corner-jointed part is one unit with its mates).
 *  A tenon is read off the stored list, faulted or not: a faulted one is kept verbatim too. A compound cut is kept so no world-word converter (`worldAngles`,
 *  `angleCutsFor`) ever reads it as a single-slope miter and drops its `across`; it exists only on a leg that leans, or did
 *  (Clear lean keeps it), so the leaning wording of the kept list and the assembly refusal stands. */
export const keepsExactly = (b: Board): boolean => keptForMoreThanFingers(b) || keptWhole(b);

/** A part with a corner joint: a recognised finger set or a stored dovetail (dovetails spec §7). THE ONE predicate every
 *  KEEP and LEAVE-ALONE site reads (Refine's kept parts and assemblies, joinery's size-and-place rule, the re-join guard).
 *  The finger CLAIM sites (`fingerClaim.ts`, `refineDesign.ts`, `cutlist.ts`) stay finger-only: a dovetail is not a cut,
 *  so there is nothing of it to claim. A dovetail is read off the stored list, faulted or not, as a tenon. */
export const cornerJointed = (b: Board): boolean => fingerSets(b).length > 0 || hasDovetails(b);

/** A part with a counterbored or countersunk hole row (counterbores spec §9): the design format has no word for a head. */
export const hasHeads = (b: Board): boolean => b.holes.some(hasHead);

/** A part Refine keeps exactly AND keeps its assembly whole for (counterbores spec §9, the user's ruling 2026-10-29, "Keep
 *  assembly whole"): a corner joint or a head. Read ONLY at Refine's keep sites (`keepsExactly`, `keptParts`' definitions,
 *  the joined-Refine re-join guard in `run.ts`). `cornerJointed` itself does NOT take the head clause: its other readers
 *  (joinery's size-and-place rule, Repair's `changedDovetailed`, the finger claim sites) keep their meaning, so joinery may
 *  still resize a headed part, its rows keeping their stations, as for any holed part (spec §9's boundary). */
export const keptWhole = (b: Board): boolean => cornerJointed(b) || hasHeads(b);

/** `keepsExactly` without its box-joint clause: the kinds that, inside an assembly, still refuse (`leaningInAssembly`; box-joints
 *  spec §7, Amended: widening those is a follow-up). */
const keptForMoreThanFingers = (b: Board): boolean => leans(b) || b.holes.some(isTilted) || hasTenons(b) || hasCompoundCut(b);

/** The ONE decision of what Refine keeps (splayed legs spec §8; angled holes §9; round tenons §9; box-joints spec §7, Amended;
 *  counterbores spec §9): every root part whose resolved form `keepsExactly`, and every definition holding a part that is
 *  `keptWhole` (a corner joint or a head), with its root placements. */
export function keptParts(doc: SloydDocument): KeptParts {
  const shapes = shapeMap(doc);
  const boards = doc.boards.filter((b) => {
    const r = resolveBoard(shapes, b);
    return r !== null && keepsExactly(r);
  });
  const definitions = doc.definitions.filter((d) => d.boards.some((b) => {
    const r = resolveBoard(shapes, b);
    return r !== null && keptWhole(r);
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

/** A kept assembly linked outside itself (box-joints spec §7, Amended; context copy), by the kind of the kept definition
 *  holding the linked part (dovetails spec §7: the other two sentences live in `dovetailText.ts`). A kind with heads names
 *  every kind it holds (counterbores spec §9). */
const keptAssemblyLinked = (kind: CornerKind, part: string) =>
  kindHasHeads(kind) ? `Refine can't keep an assembly with ${kind} whose parts are linked to parts outside it — Unlink first: ${part}.`
    : kind === 'dovetails' ? dovetailedAssemblyLinked(part)
      : kind === 'box joints and dovetails' ? mixedAssemblyLinked(part)
        : `Refine can't keep a box-jointed assembly whose parts are linked to parts outside it — Unlink first: ${part}.`;

/** The (c) sentence for a kept part the re-join would change, kept for its counterbores or countersinks (counterbores spec
 *  §9; the box-joint and dovetail sentences are `boxJointJoinChanged` and `dovetailJoinChanged`, in the same form). */
export const headJoinChanged = (part: string) =>
  `Joinery would have changed ${part}, which Refine keeps as it is for its counterbores or countersinks, so the design comes back unjoined.`;

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
    if (!out) continue;
    const holder = kept.definitions.find((d) => d.boards.some((b) => isShaped(b) && b.shape === s.id))!;
    return keptAssemblyLinked(definitionKind(doc, holder), out.name);
  }
  return null;
}

/** A kept assembly's words (dovetails spec §7, "both when both"; counterbores spec §9): the kinds it holds, in the order
 *  `box joints`, `dovetails`, `counterbores or countersinks`, joined `a and b` / `a, b and c`. Test it with `kindHas…`. */
export type CornerKind = string;

const HEADS_KIND = 'counterbores or countersinks';

/** A definition's kept-kind words, read off its own parts resolved (as `keptParts` decides it): the kinds present, in order;
 *  none (a definition `keptParts` would not keep) reads `box joints`, as before. The three corner-joint outputs (`box joints`,
 *  `dovetails`, `box joints and dovetails`) are unchanged. */
export function definitionKind(doc: SloydDocument, def: Definition): CornerKind {
  const shapes = shapeMap(doc);
  const own = def.boards.map((b) => resolveBoard(shapes, b)).filter((b): b is Board => b !== null);
  const kinds = [own.some((b) => fingerSets(b).length > 0) && 'box joints', own.some(hasDovetails) && 'dovetails',
    own.some(hasHeads) && HEADS_KIND].filter((w): w is string => w !== false);
  if (kinds.length === 0) return 'box joints';
  return kinds.length === 1 ? kinds[0]! : `${kinds.slice(0, -1).join(', ')} and ${kinds[kinds.length - 1]}`;
}

/** A kept placement's corner-joint words: its definition's (`definitionKind`). */
export function assemblyKind(doc: SloydDocument, inst: Instance): CornerKind {
  const def = doc.definitions.find((d) => d.id === inst.definition);
  return def ? definitionKind(doc, def) : 'box joints';
}

/** Why Refine keeps each of `kept`'s names, in `[...names, ...placements]` order (the copy review, 2026-10-27: the dialog's
 *  `Kept exactly as is: Drawer (dovetails)` names only the reasons that apply). A root part reads its own kinds, resolved, in
 *  `keepsExactly`'s order; a placement its assembly's (`assemblyKind`). */
export function keptWhy(doc: SloydDocument, kept: KeptParts): string[] {
  const shapes = shapeMap(doc);
  const part = (b: StoredBoard): string => {
    const r = resolveBoard(shapes, b);
    if (!r) return '';
    return [leans(r) && 'leaning', r.holes.some(isTilted) && 'angled holes', hasTenons(r) && 'round tenon',
      hasCompoundCut(r) && 'compound end cut', fingerSets(r).length > 0 && 'box joints', hasDovetails(r) && 'dovetails',
      hasHeads(r) && HEADS_KIND]
      .filter((w): w is string => typeof w === 'string').join(', ');
  };
  return [...kept.boards.map(part), ...kept.instances.map((i) => assemblyKind(doc, i))];
}

/** The kind names box joints / dovetails / heads (a mixed assembly names each it holds; `definitionKind` never returns
 *  none of them). */
export const kindHasBoxJoints = (k: CornerKind) => k.includes('box joints');
export const kindHasDovetails = (k: CornerKind) => k.includes('dovetails');
export const kindHasHeads = (k: CornerKind) => k.includes(HEADS_KIND);

/** Why a kept part is kept, in the note's words: the existing two-reason forms unchanged, a round tenon and then box
 *  joints, dovetails and heads appended (box-joints spec §7, dovetails spec §7, counterbores spec §9). A compound end cut
 *  is named only on a part kept for nothing else (a leg whose lean was cleared), so a leaning leg's line is byte for byte
 *  as before. */
function whyKept(b: Board): string {
  const why = [leans(b) && 'leans', b.holes.some(isTilted) && 'has angled holes', hasTenons(b) && 'has round tenons',
    fingerSets(b).length > 0 && 'has box joints', hasDovetails(b) && DOVETAIL_KEPT_WHY, hasHeads(b) && 'has counterbores or countersinks']
    .filter((w): w is string => w !== false);
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
    lines.push(`"${inst.name}" is an assembly with ${assemblyKind(doc, inst)} and is kept as is: ${bounds(min, max)}.`);
  }
  // The header names round tenons only when one is kept, and box joints only when a box-jointed part or assembly is kept
  // (box-joints spec §7), so a document with neither has its message byte for byte as before.
  // Dovetails likewise (dovetails spec §7): a kept assembly counts as box joints unless it has dovetails and no box joints;
  // a mixed one names both. Counterbores or countersinks likewise (counterbores spec §9), last.
  const asmKinds = keptAll.instances.map((i) => assemblyKind(doc, i));
  const kinds = ['lean', 'have angled holes', ...(keptBoards.some(hasTenons) ? ['have round tenons'] : []),
    ...(keptBoards.some((b) => fingerSets(b).length > 0) || asmKinds.some(kindHasBoxJoints) ? ['have box joints'] : []),
    ...(keptBoards.some(hasDovetails) || asmKinds.some(kindHasDovetails) ? ['have dovetails'] : []),
    ...(keptBoards.some(hasHeads) || asmKinds.some(kindHasHeads) ? ['have counterbores or countersinks'] : [])];
  return [
    `These parts ${kinds.slice(0, -1).join(', ')} or ${kinds[kinds.length - 1]}, which the design format cannot describe, so they are not in the design above. Sloyd keeps each exactly where it is; the bounds are world inches:`,
    ...lines,
    'Fit the rest of the design to them, and do not return a part with any of these names: one would be dropped.',
  ].join('\n');
}
