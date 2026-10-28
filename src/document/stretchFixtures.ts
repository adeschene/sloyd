// TEST-ONLY. The parametric-resize (stretch) fixtures: a 48 × 30 × 24 apron table and the same table with its end frames as
// two placements of one definition. Every number is dyadic, so a stretch's arithmetic is exact and hand-computable. Never
// import a test module instead; never import this from production code.
import { createBoard, createDocument, migrateDocument } from './document';
import type { Board, Cut, SloydDocument } from './types';
import { linkByRole } from './roleLinks';

/** A leg mortise for an apron 24.5–28.5 high: face width, across thickness, at length u 25–28 (stored from the MIN end). */
const mortiseFromMin = (id: string, from: 'min' | 'max'): Cut => ({
  id, face: 'width', from, across: 'thickness', offset: 25, width: 3, depth: 1, stopMin: 0.5, stopMax: 0.5,
});
/** The same mortise as a stopped cut along the length: its top stop measured from the MAX end (28.5 − 28 = 0.5). */
const mortiseFromMax = (id: string, from: 'min' | 'max'): Cut => ({
  id, face: 'width', from, across: 'length', offset: 0.5, width: 0.75, depth: 1, stopMin: 25, stopMax: 0.5,
});
/** An apron's end rebate (a tenon cheek), 1 long at length u `at`, across the whole width. */
const cheek = (id: string, at: number): Cut => ({
  id, face: 'thickness', from: 'max', across: 'width', offset: at, width: 1, depth: 0.25, stopMin: 0, stopMax: 0,
});

/** A 1.75-square leg 28.5 tall, upright (Y its length, X its width, Z its thickness). */
const leg = (name: string, x: number, z: number, cuts: Cut[]): Board =>
  createBoard({ name, length: 28.5, width: 1.75, thickness: 1.75, posture: 'upright', position: [x, 0, z], cuts });
/** A long apron along X, on edge (X its length, Y its width, Z its thickness), between the legs: x 1.75–46.25, y 24.5–28.5. */
const longApron = (name: string, z: number): Board =>
  createBoard({ name, length: 44.5, width: 4, thickness: 0.75, posture: 'on-edge', position: [1.75, 24.5, z],
    cuts: [cheek('near', 0), cheek('far', 43.5)] });
/** A short apron along Z, on edge turned 90 (X its thickness, Z its length): z 1.75–22.25, y 24.5–28.5. */
const shortApron = (name: string, x: number, cuts: Cut[] = []): Board =>
  createBoard({ name, length: 20.5, width: 4, thickness: 0.75, posture: 'on-edge', rotation: 90, position: [x, 24.5, 1.75], cuts });
/** The top, flat: X its length 48, Z its width 24, y 28.5–30. */
const top = (): Board => createBoard({ name: 'Top', length: 48, width: 24, thickness: 1.5, position: [0, 28.5, 0] });

/**
 * The apron table, all root parts: x 0–48, y 0–30, z 0–24. Legs at the four corners (Left back at the origin); the front
 * (+Z) and back long aprons; the left and right short aprons; the top. Every leg carries one mortise at u 25–28: Left back
 * stores it from the MIN end (`offset`), Right back from the MAX end (a stopped cut, `stopMax` 0.5); the front legs from
 * min. Each long apron has a cheek at each end (u 0–1 and 43.5–44.5). Board order: Left back leg, Left front leg, Right
 * back leg, Right front leg, Front apron, Back apron, Left apron, Right apron, Top.
 */
export function apronTable(): SloydDocument {
  return migrateDocument({ ...createDocument('Apron table'), boards: [
    leg('Left back leg', 0, 0, [mortiseFromMin('m', 'max')]),
    leg('Left front leg', 0, 22.25, [mortiseFromMin('m', 'max')]),
    leg('Right back leg', 46.25, 0, [mortiseFromMax('m', 'min')]),
    leg('Right front leg', 46.25, 22.25, [mortiseFromMin('m', 'min')]),
    longApron('Front apron', 22.75),
    longApron('Back apron', 0.5),
    shortApron('Left apron', 0.5),
    shortApron('Right apron', 46.75),
    top(),
  ] });
}

/**
 * The same table with each end frame (a back leg, a front leg and a short apron) as a placement of ONE definition `frame`,
 * drawn in the left frame's place: `End frame` at the origin, `End frame 2` mirrored at x 48 (a mirror reflects across
 * local X, so its parts land at x 46.25–48 and its apron at 46.75–47.5, as the plain table's). The long aprons and the top
 * are root parts. `turned`: the second placement turned 180° at (48, 0, 24) instead of mirrored, so its local front leg
 * sits at the world BACK (z 0–1.75).
 */
export function framedTable(o: { turned?: boolean } = {}): SloydDocument {
  const frame = { id: 'frame', boards: [
    leg('Back leg', 0, 0, [mortiseFromMin('m', 'max')]),
    leg('Front leg', 0, 22.25, [mortiseFromMin('m', 'max')]),
    shortApron('End apron', 0.5, [cheek('near', 0), cheek('far', 19.5)]),
  ], instances: [], hardware: [] };
  const second = o.turned
    ? { id: 'iR', name: 'End frame 2', definition: 'frame', position: [48, 0, 24], rotation: 180 }
    : { id: 'iR', name: 'End frame 2', definition: 'frame', position: [48, 0, 0], rotation: 0, mirrored: true };
  return migrateDocument({
    ...createDocument('Framed table'),
    boards: [longApron('Front apron', 22.75), longApron('Back apron', 0.5), top()],
    definitions: [frame],
    instances: [{ id: 'iL', name: 'End frame', definition: 'frame', position: [0, 0, 0], rotation: 0 }, second],
  });
}

/** The apron table with its two long aprons LINKED (one Shape, `linkByRole`): the same cheeks, ids included. Front apron
 *  is the Shape's first user (board order). */
export function linkedApronTable(): SloydDocument {
  const doc = apronTable();
  const aprons = doc.boards.filter((b) => b.name === 'Front apron' || b.name === 'Back apron');
  return linkByRole(doc, new Map(aprons.map((b) => [b.id, 'apron'])));
}
