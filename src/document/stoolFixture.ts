// TEST-ONLY. A staked stool (splayed legs spec §3.4's idiom, §8's Refine keep): four levelled leaning legs, linked by role
// (two Shapes: each leg shares one with its 180° twin), and a 14 x 1.5 x 14 seat resting on their level tops at y = 16. Shared
// by joinery's refusal (generate/joints/tapers.test.ts), Refine's base and message (generate/refine.test.ts) and the
// end-to-end keep (generate/run.test.ts), so the three cannot drift. Never import a test module instead. `squareStool…`:
// the same stool square-set (schema 25), its ends compound miters (levelEnds.test.ts, legSockets.test.ts); `cleared…`: that
// stool after Clear lean, its compound end cuts kept (square-set legs spec §4.1; joinery's and Refine's compound refusal and keep).
import { createBoard, createDocument, migrateDocument } from './document';
import type { Board, SloydDocument } from './types';
import { boardExtents } from './geometry';
import { chooseFace, slopeOf } from './lean';
import { levelPlan } from './levelEnds';
import { mirrorPart } from './frames';
import { linkByRole } from './roleLinks';

const IN = { display: 'imperial-fractional', precision: 16 } as const;

const turned180 = (b: Board): Board => {
  const e = boardExtents(b);
  return { ...b, rotation: ((b.rotation + 180) % 360) as Board['rotation'], position: [0 - (b.position[0] + e[0]), b.position[1], 0 - (b.position[2] + e[2])] };
};

const level = (b: Board): Board => {
  const p = levelPlan(b, IN);
  if (typeof p === 'string') throw new Error(p);
  return { ...b, length: p.length, position: p.position, angleCuts: p.angleCuts };
};

/** The four levelled legs as world parts: rake 8° and splay 12° outward at every corner, pivots at (±5, 16, ±5). */
export function stoolLegs(): Board[] {
  return legs(false);
}

/** The same four legs SQUARE-SET (schema 25, square-set legs spec §3.3): each lean `square: true`, so every end is one
 *  compound miter. Front left is still Front right's mirror (`mirrorPart`), the back legs their 180° turns. */
export function squareStoolLegs(): Board[] {
  return legs(true);
}

function legs(square: boolean): Board[] {
  const x = slopeOf(12);
  const z = slopeOf(8);
  const fr = createBoard({ name: 'Front right', length: 16, width: 1.5, thickness: 1.5, posture: 'upright', position: [4.25, 0, 4.25],
    lean: { x, z, face: chooseFace(createBoard({ posture: 'upright' }), x, z), ...(square ? { square: true as const } : {}) } });
  const fl = { ...mirrorPart(fr), name: 'Front left' };
  return [fr, fl, { ...turned180(fr), name: 'Back left' }, { ...turned180(fl), name: 'Back right' }].map(level);
}

export const stoolSeat = (y = 16): Board => createBoard({ name: 'Seat', length: 14, width: 14, thickness: 1.5, posture: 'flat', position: [-7, y, -7] });

/** The stool through the load gate, its legs linked by role: Front right with Back left, Front left with Back right. */
export function stoolDocument(): SloydDocument {
  return stoolOf(stoolLegs());
}

/** The square-set stool through the load gate, linked by role as `stoolDocument` is. */
export function squareStoolDocument(): SloydDocument {
  return stoolOf(squareStoolLegs());
}

function stoolOf(legs: Board[]): SloydDocument {
  const doc = migrateDocument({ ...createDocument('Stool'), boards: [...legs, stoolSeat()] });
  return linkByRole(doc, new Map(doc.boards.filter((b) => b.name !== 'Seat').map((b) => [b.id, 'leg'])));
}

/** The square-set stool after Clear lean (square-set legs spec §4.1): every lean removed (on the Shapes, where a linked leg
 *  keeps it, and on any unshaped part), the compound end cuts kept, through the load gate. Linked as `squareStoolDocument`. */
export function clearedSquareStoolDocument(): SloydDocument {
  const doc = squareStoolDocument();
  const unlean = <T extends object>(x: T): T => { const { lean: _lean, ...rest } = x as T & { lean?: unknown }; return rest as T; };
  return migrateDocument({ ...doc, boards: doc.boards.map(unlean), shapes: doc.shapes.map(unlean) });
}

/** The stool with one rectangular cut on its seat: a joined project (Refine's joint gate and Repair read its cuts). */
export function stoolWithCut(): SloydDocument {
  const doc = stoolDocument();
  return migrateDocument({ ...doc, boards: doc.boards.map((b) => (b.name === 'Seat' ? { ...(b as Board), cuts: [
    { id: 'c1', face: 'thickness', from: 'max', across: 'width', offset: 6, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 },
  ] } : b)) });
}
