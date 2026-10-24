import type { Shape, SloydDocument, StoredBoard } from './types';
import { leans } from './lean';
import { isTilted } from './holeTilt';
import type { Board } from './types';
import { partBounds } from './worldBounds';
import { isShaped, resolveBoard, shapeMap } from './shapes';
import { flatDocument, parentPath } from './tree';

/**
 * What Refine keeps exactly as stored (splayed legs spec §8; angled holes spec §9): every ROOT part that leans or has a
 * tilted hole row (the design format has no word for either) — its stored record (lean,
 * position, turn, features, Shape reference and mirror flag) and the Shapes those records point to. The design format
 * describes parts as world boxes and every world-word converter assumes part axes equal world axes, so a leaning part is
 * never sent to the model as a part, never converted back from it, and never linked by role (`linkByRole` skips it: it
 * has no role). A Shape's users all share its lean (`LINK_FIELDS.lean` is shared), so a kept Shape has only kept users.
 *
 * Root only: a leaning part inside an assembly is refused (`leaningInAssembly`), because its definition is rebuilt from
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

/** A part Refine keeps as stored: it leans or has a tilted hole row (the ONE predicate; angled holes spec §9). */
export const keepsExactly = (b: Board): boolean => leans(b) || b.holes.some(isTilted);

/** The ONE decision of what Refine keeps (splayed legs spec §8; angled holes §9): every root part whose resolved form leans or has a tilted row. */
export function keptParts(doc: SloydDocument): KeptParts {
  const shapes = shapeMap(doc);
  const boards = doc.boards.filter((b) => {
    const r = resolveBoard(shapes, b);
    return r !== null && keepsExactly(r);
  });
  const used = new Set(boards.filter(isShaped).map((b) => b.shape));
  return { boards, shapes: doc.shapes.filter((s) => used.has(s.id)), names: boards.map((b) => b.name) };
}

/** The flat name of the first kept (leaning, or with a tilted row) part placed inside an assembly, or null (Refine refuses it, `documentToDesign`). */
export function leaningInAssembly(doc: SloydDocument): string | null {
  return flatDocument(doc).boards.find((b) => parentPath(b.id) !== null && keepsExactly(b))?.name ?? null;
}

/**
 * The kept parts as the model sees them (splayed legs spec §8, "what the model sees"): context in the USER turn, never in
 * the design JSON or `SYSTEM_PROMPT`. One line per part with its REAL world bounds (`partBounds`, R2: the leaned bodies,
 * never the pre-lean box), saying why it is kept (it leans, has angled holes) and that it is kept as is, and one line telling the model not to return it. Null
 * when nothing is kept.
 */
export function keptNote(doc: SloydDocument): string | null {
  const kept = new Set(keptParts(doc).names);
  if (kept.size === 0) return null;
  const n = (v: number) => +v.toFixed(3);
  const lines = flatDocument(doc).boards.filter((b) => kept.has(b.name)).map((b) => {
    const { min, max } = partBounds(b);
    const why = leans(b) ? (b.holes.some(isTilted) ? 'leans, has angled holes' : 'leans') : 'has angled holes';
    return `"${b.name}" ${why} and is kept as is: x ${n(min[0])} to ${n(max[0])}, y ${n(min[1])} to ${n(max[1])}, z ${n(min[2])} to ${n(max[2])}.`;
  });
  return [
    'These parts lean or have angled holes, which the design format cannot describe, so they are not in the design above. Sloyd keeps each exactly where it is; the bounds are world inches:',
    ...lines,
    'Fit the rest of the design to them, and do not return a part with any of these names: one would be dropped.',
  ].join('\n');
}
