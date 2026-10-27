import type { Board, Shape, SloydDocument, StoredBoard } from './types';
import { leans } from './lean';
import { isTilted } from './holeTilt';
import { hasTenons } from './roundTenons';
import { hasCompoundCut } from './angleCuts';
import { fingerSets } from './boxJoints';
import { partBounds } from './worldBounds';
import { isShaped, resolveBoard, shapeMap } from './shapes';
import { flatDocument, parentPath } from './tree';

/**
 * What Refine keeps exactly as stored (splayed legs spec §8; angled holes spec §9; round tenons spec §9): every ROOT part
 * that leans, has a tilted hole row or has a round tenon (the design format has no word for any of them) — its stored record (lean,
 * position, turn, features, Shape reference and mirror flag) and the Shapes those records point to. The design format
 * describes parts as world boxes and every world-word converter assumes part axes equal world axes, so a leaning part is
 * never sent to the model as a part, never converted back from it, and never linked by role (`linkByRole` skips it: it
 * has no role). A Shape's users all share its lean, its holes and its tenons (`LINK_FIELDS.lean`, `holes` and `tenons` are shared), so a kept Shape has only kept users.
 *
 * Root only: a kept part (leaning, with a tilted row or with a round tenon) inside an assembly is refused (`leaningInAssembly`), because its definition is rebuilt from
 * the model's assembly. At the root a part's flat name is its stored name and its world part is its resolved record.
 */
export interface KeptParts {
  /** The kept stored records, in the document's order (the same objects). */
  boards: StoredBoard[];
  /** The Shapes they point to, in the document's order. */
  shapes: Shape[];
  /** Their flat names, in the same order. */
  names: string[];
}

/** A part Refine keeps as stored: it leans, has a tilted hole row, has a round tenon, has a compound end cut or has a
 *  recognised box joint (the ONE predicate; angled holes spec §9, round tenons spec §9, square-set legs spec §4,
 *  box-joints spec §7: the design format has no word for fingers, and a box-jointed part is one unit with its mates).
 *  A tenon is read off the stored list, faulted or not: a faulted one is kept verbatim too. A compound cut is kept so no world-word converter (`worldAngles`,
 *  `angleCutsFor`) ever reads it as a single-slope miter and drops its `across`; it exists only on a leg that leans, or did
 *  (Clear lean keeps it), so the leaning wording of the kept list and the assembly refusal stands. */
export const keepsExactly = (b: Board): boolean =>
  leans(b) || b.holes.some(isTilted) || hasTenons(b) || hasCompoundCut(b) || fingerSets(b).length > 0;

/** The ONE decision of what Refine keeps (splayed legs spec §8; angled holes §9; round tenons §9): every root part whose resolved form leans, has a tilted row or has a round tenon. */
export function keptParts(doc: SloydDocument): KeptParts {
  const shapes = shapeMap(doc);
  const boards = doc.boards.filter((b) => {
    const r = resolveBoard(shapes, b);
    return r !== null && keepsExactly(r);
  });
  const used = new Set(boards.filter(isShaped).map((b) => b.shape));
  return { boards, shapes: doc.shapes.filter((s) => used.has(s.id)), names: boards.map((b) => b.name) };
}

/** The flat name of the first kept (leaning, with a tilted row or with a round tenon) part placed inside an assembly, or null (Refine refuses it, `documentToDesign`). */
export function leaningInAssembly(doc: SloydDocument): string | null {
  return flatDocument(doc).boards.find((b) => parentPath(b.id) !== null && keepsExactly(b))?.name ?? null;
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
  const kept = new Set(keptParts(doc).names);
  if (kept.size === 0) return null;
  const n = (v: number) => +v.toFixed(3);
  const lines = flatDocument(doc).boards.filter((b) => kept.has(b.name)).map((b) => {
    const { min, max } = partBounds(b);
    const why = whyKept(b);
    return `"${b.name}" ${why} and is kept as is: x ${n(min[0])} to ${n(max[0])}, y ${n(min[1])} to ${n(max[1])}, z ${n(min[2])} to ${n(max[2])}.`;
  });
  // The header names round tenons only when one is kept, and box joints only when a box-jointed part is kept (box-joints
  // spec §7), so a document with neither has its message byte for byte as before.
  const keptBoards = flatDocument(doc).boards.filter((b) => kept.has(b.name));
  const kinds = ['lean', 'have angled holes', ...(keptBoards.some(hasTenons) ? ['have round tenons'] : []),
    ...(keptBoards.some((b) => fingerSets(b).length > 0) ? ['have box joints'] : [])];
  return [
    `These parts ${kinds.slice(0, -1).join(', ')} or ${kinds[kinds.length - 1]}, which the design format cannot describe, so they are not in the design above. Sloyd keeps each exactly where it is; the bounds are world inches:`,
    ...lines,
    'Fit the rest of the design to them, and do not return a part with any of these names: one would be dropped.',
  ].join('\n');
}
