// TEST-ONLY. The parametric-resize (stretch) fixtures: a 48 × 30 × 24 apron table, the same table with its end frames as
// two placements of one definition, the table as ONE placement turned 90° or mirrored, a 24 × 36 × 12 bookcase (shelf-pin
// rows, dadoed fixed shelves, a plywood back) and a dovetailed drawer box. Every number is dyadic, so a stretch's arithmetic
// is exact and hand-computable. Never import a test module instead; never import this from production code.
import { createBoard, createDocument, migrateDocument } from './document';
import type { Board, Cut, HoleRow, SloydDocument } from './types';
import { linkByRole } from './roleLinks';
import { applyDovetails, dovetailPlan } from './dovetails';

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

/** The apron table as the ONE placement `Table` (id `i`) of a definition `t` holding its nine parts: at rotation 90 (local X
 *  runs toward world −Z, so the long aprons' u 0 ends sit at the world FRONT), or mirrored (across local X, so their u 0
 *  ends sit at the world RIGHT). */
export function placedTable(o: { rotation: 90 } | { mirrored: true }): SloydDocument {
  const t = apronTable();
  return migrateDocument({
    ...createDocument('Placed table'),
    definitions: [{ id: 't', boards: t.boards, instances: [], hardware: [] }],
    instances: [{ id: 'i', name: 'Table', definition: 't', position: [0, 0, 0], rotation: 0, ...o }],
  });
}

/** Shelf-pin rows on a bookcase side's inner face (drilled along the thickness from `from`), 1/4" bores 3/8" deep, two rows
 *  1.5 in from the front and back edges, centres at length `first`, `first + 2`, … (`count` of them). */
const pinRows = (from: 'min' | 'max', first: number, count: number, tag: string): HoleRow[] =>
  (['min', 'max'] as const).map((acrossFrom) => ({
    id: `${tag}-${acrossFrom}`, face: 'thickness', from, diameter: 0.25, depth: 0.375, along: 'length', alongFrom: 'min',
    station: first, count, pitch: 2, acrossFrom, inset: 1.5,
  }));
/** A fixed shelf's dado on a side's inner face: across the width, at length u `at`–`at + 0.75`, 3/8" deep. */
const dado = (id: string, from: 'min' | 'max', at: number): Cut => ({
  id, face: 'thickness', from, across: 'width', offset: at, width: 0.75, depth: 0.375, stopMin: 0, stopMax: 0,
});

/**
 * The bookcase, all root parts: x 0–24, y 0–36, z −0.25–12. Board order: Left side, Right side, Lower shelf, Upper shelf, Top,
 * Bottom, Back. The sides are upright turned 90 (Y their length 36, X their thickness 0.75, Z their width 12): Left at x 0
 * (inner face its thickness MAX), Right at x 23.25 (inner face its thickness MIN). Each side has dados at u 12–12.75 and
 * 24–24.75 and pin rows: `full` — centres 3, 5, …, 33 (16 holes; bores span u 2.875–33.125, clear of both dados); otherwise
 * two short groups, 3–9 and 27–33 (4 holes each; bores 2.875–9.125 and 26.875–33.125). The fixed shelves (flat, X their length
 * 23.25, x 0.375–23.625 into the dados; Y their thickness) at y 12–12.75 and 24–24.75. Top and bottom (flat, x 0.75–23.25) at
 * y 35.25–36 and 0–0.75. The back: plywood, upright (X its width 24, Y its length 36), 1/4" thick at z −0.25–0.
 */
export function bookcase(o: { full?: boolean } = {}): SloydDocument {
  const rows = (from: 'min' | 'max', tag: string) => (o.full
    ? pinRows(from, 3, 16, tag)
    : [...pinRows(from, 3, 4, `${tag}-low`), ...pinRows(from, 27, 4, `${tag}-high`)]);
  const side = (name: string, x: number, inner: 'min' | 'max') => createBoard({
    name, length: 36, width: 12, thickness: 0.75, posture: 'upright', rotation: 90, position: [x, 0, 0],
    cuts: [dado('lower', inner, 12), dado('upper', inner, 24)], holes: rows(inner, inner),
  });
  const flat = (name: string, x: number, y: number, length: number) =>
    createBoard({ name, length, width: 12, thickness: 0.75, posture: 'flat', position: [x, y, 0] });
  return migrateDocument({ ...createDocument('Bookcase'), boards: [
    side('Left side', 0, 'max'),
    side('Right side', 23.25, 'min'),
    flat('Lower shelf', 0.375, 12, 23.25),
    flat('Upper shelf', 0.375, 24, 23.25),
    flat('Top', 0.75, 35.25, 22.5),
    flat('Bottom', 0.75, 0, 22.5),
    createBoard({ name: 'Back', length: 36, width: 24, thickness: 0.25, posture: 'upright', position: [0, 0, -0.25], material: 'plywood' }),
  ] });
}

/**
 * A through-dovetailed drawer box (the dovetail planner's drawer, `dovetailPlan.test.ts`, at its defaults: 6 tall, sides
 * 1/2", front and back 3/4", inside 12 × 16), dovetailed by `dovetailPlan` at slope 8 (tails on the sides). Board order:
 * Front (`f`), Back (`b`), Side left (`l`), Side right (`r`). Front and back are on edge along X (X their length, 13 after
 * the plan: x 0–13; Y their width; Z their thickness), at z 0–0.75 and 16.75–17.5. The sides are on edge turned 90 (Z their
 * length 17.5, reversed; X their thickness), at x 0–0.5 and 12.5–13. Every dovetail's `dim` is the length; J is the width (Y).
 * The corner squares: X [0, 0.5] or [12.5, 13], Y [0, 6], Z [0, 0.75] or [16.75, 17.5].
 */
export function dovetailedDrawer(): SloydDocument {
  const fb = (id: string, name: string, z: number) => createBoard({
    id, name, posture: 'on-edge', rotation: 0, length: 12, width: 6, thickness: 0.75, position: [0.5, 0, z],
  });
  const side = (id: string, name: string, x: number) => createBoard({
    id, name, posture: 'on-edge', rotation: 90, length: 17.5, width: 6, thickness: 0.5, position: [x, 0, 0],
  });
  const doc: SloydDocument = { ...createDocument('Drawer'),
    boards: [fb('f', 'Front', 0), fb('b', 'Back', 16.75), side('l', 'Side left', 0), side('r', 'Side right', 12.5)] };
  const plan = dovetailPlan(doc, ['f', 'b', 'l', 'r'], { slope: 8, count: null, swap: false });
  if (typeof plan === 'string') throw new Error(plan);
  return applyDovetails(doc, plan);
}
