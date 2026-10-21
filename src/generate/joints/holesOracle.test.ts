import { beforeAll, describe, expect, it } from 'vitest';
import workbenchRaw from '../../document/fixtures/simple-workbench.sloyd?raw';
import { designToDocument } from '../../document/generated';
import { clippedRegion, flatDocument, groupItems, migrateDocument } from '../../document/document';
import type { Board, FlatDocument, HoleRow, Region, SloydDocument } from '../../document/document';
import { worldBox } from '../../document/designCheck';
import { holeInstances, holeRegion } from '../../document/holes';
import { holeFaults } from '../../document/holeFaults';
import { boardExtents } from '../../document/geometry';
import { SHAKER_TABLE_JSON } from '../../document/shakerTableFixture';
import { rotateQuarter } from '../../document/turnFixtures';
import { worldParts } from '../../document/tree';
import { defaultChoice } from './choose';
import { featureAllowed } from './featureZones';
import { applyJoints } from './recipes';
import type { JoinResult, JointChoice } from './recipes';
import { findSites, rangesOf } from './sites';
import type { JointKind, Site } from './sites';

// Joinery-holes spec §7, the oracle: after `featureAllowed` narrows the sites, no joint the model may choose takes wood
// from a hole, and no hole is lost. Measured directly, never through the `JoinWatch` the zones are built on, so a zone
// row that is missing (or a move made by an earlier joint that shifts a later patch) shows up here.

type V3 = [number, number, number];
type P = { name: string; at: V3; size: V3; material?: string };
const design = (...parts: P[]) => flatDocument(designToDocument({
  name: 'T',
  parts: parts.map((p) => ({ name: p.name, material: p.material ?? 'oak', at: { x: p.at[0], y: p.at[1], z: p.at[2] }, size: { x: p.size[0], y: p.size[1], z: p.size[2] } })),
}).doc);

// A whole design turned rigidly about one pivot by k quarter turns (as recipes.test's fu 217 fixtures), so the grid's
// board-local holes meet the joints through every turn.
const PIVOT: V3 = [7, 0, 3];
const quarterTurned = (parts: P[], k: number) => {
  const doc = design(...parts);
  for (const b of doc.boards) {
    const e = boardExtents(b);
    let a = [...b.position] as V3;
    let c: V3 = [a[0] + e[0], a[1] + e[1], a[2] + e[2]];
    for (let i = 0; i < k; i += 1) { a = rotateQuarter(a, PIVOT); c = rotateQuarter(c, PIVOT); }
    b.rotation = ((b.rotation + 90 * k) % 360) as Board['rotation'];
    b.position = [0, 1, 2].map((i) => Math.min(a[i]!, c[i]!)) as V3;
  }
  return doc;
};

// Every recipes.test fixture that starts with no cuts, sites from `findSites` (the hand-built-site fixtures are left
// out: findSites never offers their sites, and `featureAllowed` is fed what findSites finds).
const LEG_RAIL: P[] = [
  { name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] },
  { name: 'Rail', at: [1.75, 23.5, 0.5], size: [18, 3.5, 0.75] },
];
const RAIL_TWO_LEGS: P[] = [...LEG_RAIL, { name: 'Far leg', at: [19.75, 0, 0], size: [1.75, 28, 1.75] }];
const SIDES_SHELF: P[] = [
  { name: 'Left side', at: [0, 0, 0], size: [0.75, 30, 11.25] },
  { name: 'Right side', at: [20.75, 0, 0], size: [0.75, 30, 11.25] },
  { name: 'Shelf', at: [0.75, 12, 0], size: [20, 0.75, 11.25] },
];
const CABINET_BACK: P[] = [
  { name: 'Left', at: [0, 0, 0], size: [0.75, 30, 11.25] },
  { name: 'Right', at: [20.75, 0, 0], size: [0.75, 30, 11.25] },
  { name: 'Shelf', at: [0.75, 12, 0], size: [20, 0.75, 11.25] },
  { name: 'Back', at: [0, 0, 11.25], size: [21.5, 30, 0.25] },
];
const BACK_CASE: P[] = [
  { name: 'LeftSide', at: [0, 0, 0], size: [0.75, 30, 12] },
  { name: 'RightSide', at: [20.75, 0, 0], size: [0.75, 30, 12] },
  { name: 'Back', at: [0, 0, -0.25], size: [21.5, 30, 0.25] },
];
const CAB: P[] = [
  { name: 'Left side', at: [0, 0, 0], size: [0.75, 30, 11.25] },
  { name: 'Right side', at: [23.25, 0, 0], size: [0.75, 30, 11.25] },
  { name: 'Top', at: [0.75, 29.25, 0], size: [22.5, 0.75, 11.25] },
  { name: 'Bottom', at: [0.75, 0, 0], size: [22.5, 0.75, 11.25] },
  { name: 'Back', at: [0, 0, -0.25], size: [24, 30, 0.25], material: 'plywood' },
];
const LAP: P[] = [
  { name: 'Lower', at: [0, 5, 9], size: [20, 0.75, 2] },
  { name: 'Upper', at: [9, 5.75, 0], size: [2, 0.75, 20] },
];
const LAP_LEGS: P[] = [
  { name: 'Leg XL', at: [0, 0, 13.5], size: [3, 30, 3] },
  { name: 'Leg XR', at: [33, 0, 13.5], size: [3, 30, 3] },
  { name: 'Leg ZF', at: [16.5, 0, -3], size: [3, 30, 3] },
  { name: 'Leg ZB', at: [16.5, 0, 30], size: [3, 30, 3] },
  { name: 'Rail A', at: [3, 20, 13.5], size: [30, 1, 3] },
  { name: 'Rail B', at: [16.5, 21, 0], size: [3, 1, 30] },
];
const BOOKCASE: P[] = [
  { name: 'Back', at: [0, 0, -0.25], size: [31.5, 72, 0.25] },
  { name: 'Left side', at: [0, 0, 0], size: [0.75, 72, 11.25] },
  { name: 'Right side', at: [30.75, 0, 0], size: [0.75, 72, 11.25] },
  { name: 'Bottom', at: [0.75, 0, 0], size: [30, 0.75, 11.25] },
  { name: 'Top', at: [0.75, 71.25, 0], size: [30, 0.75, 11.25] },
  { name: 'Shelf 1', at: [0.75, 24, 0], size: [30, 0.75, 11.25] },
];
const STAGE1 = (eWidth: number): P[] => [
  { name: 'R', at: [0, 27.25, 0], size: [20, 0.75, 3] },
  { name: 'Leg1', at: [1, 0, 0.625], size: [1.75, 27.25, 1.75] },
  { name: 'Leg2', at: [17.25, 0, 0.625], size: [1.75, 27.25, 1.75] },
  { name: 'E', at: [0.25, 28, -3], size: [eWidth, 0.75, 9] },
];
const BLOCKER_CASE: P[] = [...BACK_CASE, { name: 'Top', at: [0, 30, -0.25], size: [21.5, 0.75, 12.25] }];
const foot = (name: string, x: number): P => ({ name, at: [x, 0, 0], size: [2, 2, 11.25] });

const FIXTURES: { label: string; make: () => FlatDocument; layout?: (b: Board) => HoleRow[] }[] = [
  { label: 'leg and rail', make: () => design(...LEG_RAIL) },
  { label: 'rail between two legs', make: () => design(...RAIL_TWO_LEGS) },
  { label: 'side and shelf', make: () => design({ name: 'Side', at: [0, 0, 0], size: [0.75, 30, 11.25] }, { name: 'Shelf', at: [0.75, 12, 0], size: [20, 0.75, 11.25] }) },
  { label: 'shelf between two sides', make: () => design(...SIDES_SHELF) },
  { label: 'two tenons into one corner leg', make: () => design(
    { name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] },
    { name: 'Rail X', at: [1.75, 23.5, 0.5], size: [18, 3.5, 0.75] },
    { name: 'Rail Z', at: [0.5, 23.5, 1.75], size: [0.75, 3.5, 18] },
  ) },
  { label: 'rail entering from the max face', make: () => design({ name: 'Rail', at: [0, 23.5, 0.5], size: [18, 3.5, 0.75] }, { name: 'Leg', at: [18, 0, 0], size: [1.75, 28, 1.75] }) },
  { label: 'shelf entering from the max face', make: () => design({ name: 'Shelf', at: [0, 12, 0], size: [20, 0.75, 11.25] }, { name: 'Side', at: [20, 0, 0], size: [0.75, 30, 11.25] }) },
  { label: 'cabinet with a rabbeted back', make: () => design(...CABINET_BACK) },
  { label: 'back panel between two sides', make: () => design(...BACK_CASE) },
  { label: 'centre partition', make: () => design(
    { name: 'Left', at: [0, 0, 0], size: [0.75, 30, 11.25] },
    { name: 'Right', at: [20.75, 0, 0], size: [0.75, 30, 11.25] },
    { name: 'Partition', at: [10.375, 0, 0], size: [0.75, 30, 11.25] },
    { name: 'Back', at: [0, 0, 11.25], size: [21.5, 30, 0.25] },
  ) },
  { label: 'drawer (re-grounded)', make: () => design(
    { name: 'SideL', at: [0, 0.25, 0], size: [0.5, 4, 12] },
    { name: 'SideR', at: [9.5, 0.25, 0], size: [0.5, 4, 12] },
    { name: 'Front', at: [0.5, 0.25, 0], size: [9, 4, 0.5] },
    { name: 'BackP', at: [0.5, 0.25, 11.5], size: [9, 4, 0.5] },
    { name: 'Bottom', at: [0, 0, 0], size: [10, 0.25, 12] },
  ) },
  { label: 'half-lap', make: () => design(...LAP) },
  { label: 'half-lap stretcher grid', make: () => design(
    { name: 'LowA', at: [0, 5, 0], size: [20, 0.75, 2] },
    { name: 'LowB', at: [0, 5, 10], size: [20, 0.75, 2] },
    { name: 'UpA', at: [2, 5.75, -4], size: [2, 0.75, 20] },
    { name: 'UpB', at: [12, 5.75, -4], size: [2, 0.75, 20] },
  ) },
  { label: 'half-lap drop blocked', make: () => design(...LAP, { name: 'Block', at: [9, 5, 0], size: [2, 0.75, 2] }) },
  { label: 'half-lap partners in different planes', make: () => {
    const doc = design(
      { name: 'LowA', at: [0, 5, 0], size: [20, 0.75, 2] },
      { name: 'LowB', at: [0, 5, 10], size: [20, 0.75, 2] },
      { name: 'Upper', at: [2, 5.75, -4], size: [2, 0.75, 20] },
    );
    const lowB = doc.boards.find((b) => b.name === 'LowB')!;
    lowB.thickness = 0.72;
    lowB.position[1] = doc.boards.find((b) => b.name === 'LowA')!.position[1] + 0.06;
    return doc;
  } },
  ...[[0.73, 0.02], [0.77, -0.02]].map(([thickness, gap]) => ({ label: `half-lap off-grid (${thickness})`, make: () => {
    const doc = design(...LAP);
    const lo = doc.boards.find((b) => b.name === 'Lower')!;
    const up = doc.boards.find((b) => b.name === 'Upper')!;
    up.thickness = thickness!;
    up.position[1] = lo.position[1] + lo.thickness + gap!;
    return doc;
  } })),
  { label: 'half-lap three-layer stack', make: () => design(
    { name: 'A', at: [0, 0, 9], size: [20, 0.75, 3] },
    { name: 'B', at: [9, 0.75, -10], size: [3, 0.75, 30] },
    { name: 'C', at: [0, 1.5, 16], size: [20, 0.75, 3] },
  ) },
  { label: 'half-lap stack sharing a footprint', make: () => design(
    { name: 'A', at: [0, 0, 9], size: [20, 0.75, 3] },
    { name: 'B', at: [9, 0.75, 0], size: [3, 0.75, 20] },
    { name: 'C', at: [0, 1.5, 9], size: [20, 0.75, 3] },
  ) },
  { label: 'half-lap deep drop blocked', make: () => design(
    { name: 'A', at: [0, 0, 9], size: [20, 0.75, 3] },
    { name: 'B', at: [9, 0.75, -10], size: [3, 0.75, 30] },
    { name: 'C', at: [0, 1.5, 16], size: [20, 0.75, 3] },
    { name: 'Stand', at: [-3, 0, 16], size: [2.5, 0.75, 3] },
    { name: 'D', at: [-3, 0.75, 16], size: [5, 0.65, 3] },
  ) },
  { label: 'half-lap five-part grid', make: () => design(
    { name: 'A1', at: [0, 0, 2], size: [20, 0.75, 3] },
    { name: 'A2', at: [0, 0, 15], size: [20, 0.75, 3] },
    { name: 'B1', at: [3, 0.75, 0], size: [3, 0.75, 20] },
    { name: 'B2', at: [14, 0.75, 0], size: [3, 0.75, 20] },
    { name: 'C', at: [0, 1.5, 8.5], size: [20, 0.75, 3] },
  ) },
  { label: 'rail tenoned at its far end first', make: () => design(
    { name: 'Right leg', at: [20, 0, 0], size: [1.75, 28, 1.75] },
    { name: 'Left leg', at: [0, 0, 0], size: [1.75, 28, 1.75] },
    { name: 'Rail', at: [1.75, 23.5, 0.5], size: [18.25, 3.5, 0.75] },
  ) },
  { label: 'simple workbench, legs listed right before left', make: () => {
    const raw = JSON.parse(workbenchRaw);
    raw.boards = [raw.boards[1], raw.boards[0], raw.boards[3], raw.boards[2], ...raw.boards.slice(4)];
    return flatDocument(migrateDocument(raw));
  } },
  { label: 'simple workbench', make: () => flatDocument(migrateDocument(JSON.parse(workbenchRaw))) },
  { label: 'tenoned shelf behind a back rabbet', make: () => design(
    { name: 'Shelf', at: [0.75, 12, 0], size: [20, 0.75, 11.25] },
    { name: 'Left', at: [0, 0, 0], size: [0.75, 30, 11.25] },
    { name: 'Right', at: [20.75, 0, 0], size: [0.75, 30, 11.25] },
    { name: 'Back', at: [0, 0, -0.25], size: [21.5, 30, 0.25] },
  ) },
  { label: 'tenons and a half-lap on one part, legs first', make: () => design(...LAP_LEGS) },
  { label: 'tenons and a half-lap on one part, rails first', make: () => design(...LAP_LEGS.slice(4), ...LAP_LEGS.slice(0, 4)) },
  { label: 'bookcase, back first', make: () => design(...BOOKCASE) },
  { label: 'bookcase, back last', make: () => design(...BOOKCASE.slice(1), BOOKCASE[0]!) },
  { label: 'side growing up into a top', make: () => design(
    { name: 'Back', at: [0, 0, -0.25], size: [31.5, 72, 0.25] },
    { name: 'Left side', at: [0, 0, 0], size: [0.75, 71.25, 11.25] },
    { name: 'Right side', at: [30.75, 0, 0], size: [0.75, 71.25, 11.25] },
    { name: 'Top', at: [0, 71.25, 0], size: [31.5, 0.75, 11.25] },
    { name: 'Bottom', at: [0.75, 0, 0], size: [30, 0.75, 11.25] },
  ) },
  { label: 'footed case (run-out rule)', make: () => design(
    { name: 'Bottom', at: [0.75, 2, 0], size: [29.25, 0.75, 11.25] },
    { name: 'Top', at: [0.75, 41.25, 0], size: [29.25, 0.75, 11.25] },
    { name: 'Left side', at: [0, 2, 0], size: [0.75, 40, 11.25] },
    { name: 'Right side', at: [30, 2, 0], size: [0.75, 40, 11.25] },
    foot('Foot L', -1.25), foot('Foot R', 30.75),
  ) },
  { label: 'back grooved into an overhanging top', make: () => design(
    { name: 'Top', at: [0, 71.25, -0.25], size: [31.5, 0.75, 11.5] },
    { name: 'Back', at: [0, 0, -0.25], size: [31.5, 71.25, 0.25] },
    { name: 'Left side', at: [0, 0, 0], size: [0.75, 71.25, 11.25] },
    { name: 'Right side', at: [30.75, 0, 0], size: [0.75, 71.25, 11.25] },
  ) },
  { label: 'back carrying a cleat', make: () => design(...BACK_CASE, { name: 'Cleat', at: [0.75, 26, -1], size: [20, 3, 0.75] }) },
  { label: 'back carrying a two-deep chain', make: () => design(...BACK_CASE,
    { name: 'Spacer', at: [0.75, 26, -1], size: [20, 3, 0.75] },
    { name: 'Rail', at: [0.75, 26, -1.75], size: [20, 3, 0.75] }) },
  { label: 'back carrying a high cleat past a shelf', make: () => design(...BACK_CASE,
    { name: 'Shelf', at: [0.75, 12, 0], size: [20, 0.75, 12] }, { name: 'Cleat', at: [0.75, 28, -1], size: [20, 3, 0.75] }) },
  { label: 'back carry refused by a top', make: () => design(...BACK_CASE,
    { name: 'Shelf', at: [0.75, 12, 0], size: [20, 0.75, 12] }, { name: 'Top', at: [0, 30, -0.25], size: [21.5, 0.75, 12.25] },
    { name: 'Cleat', at: [0.75, 28, -1], size: [20, 3, 0.75] }) },
  { label: 'panel rabbeted on both faces', make: () => design(
    { name: 'Panel', at: [0, 0, 0], size: [21.5, 30, 0.25] },
    { name: 'LF', at: [0, 0, 0.25], size: [0.75, 30, 11.75] },
    { name: 'RF', at: [20.75, 0, 0.25], size: [0.75, 30, 11.75] },
    { name: 'LB', at: [0, 0, -12], size: [0.75, 30, 12] },
    { name: 'RB', at: [20.75, 0, -12], size: [0.75, 30, 12] },
  ) },
  { label: 'cabinet, back rabbeted on four sides', make: () => design(...CAB) },
  { label: 'cabinet, back listed first', make: () => design(CAB[4]!, ...CAB.slice(0, 4)) },
  { label: 'bookcase with a raised bottom and a shelf', make: () => design(
    { name: 'Left side', at: [0, 0, 0], size: [0.75, 36, 11.25] },
    { name: 'Right side', at: [23.25, 0, 0], size: [0.75, 36, 11.25] },
    { name: 'Top', at: [0.75, 35.25, 0], size: [22.5, 0.75, 11.25] },
    { name: 'Bottom', at: [0.75, 2, 0], size: [22.5, 0.75, 11.25] },
    { name: 'Shelf', at: [0.75, 18, 0], size: [22.5, 0.75, 11.25] },
    { name: 'Back', at: [0, 0, -0.25], size: [24, 36, 0.25], material: 'plywood' },
  ) },
  { label: 'shelf 1/8in short of a trimming back', make: () => design(...CAB.slice(0, 4), CAB[4]!, { name: 'Shelf', at: [0.75, 15, 0.125], size: [22.5, 0.75, 11.125] }) },
  { label: 'shelf butting a trimming back', make: () => design(...CAB, { name: 'Shelf', at: [0.75, 15, 0], size: [22.5, 0.75, 11.25] }) },
  { label: 'a strip the back would pass through', make: () => design(...CAB,
    { name: 'Shelf', at: [0.75, 15, 0], size: [22.5, 0.75, 11.25] }, { name: 'Strip', at: [6, 10, 0], size: [4, 3, 0.125] }) },
  { label: 'legs tenoned up into a rail, a lap clear of the tongue', make: () => design(...STAGE1(1)) },
  { label: 'legs tenoned up into a rail, a lap over the tongue', make: () => design(...STAGE1(1.5)) },
  { label: 'cleat carried toward a top (2.5in)', make: () => design(...BLOCKER_CASE, { name: 'Cleat', at: [0.75, 28, -1], size: [20, 2.5, 0.75] }) },
  { label: 'cleat carried toward a top (3in)', make: () => design(...BLOCKER_CASE, { name: 'Cleat', at: [0.75, 28, -1], size: [20, 3, 0.75] }) },
  { label: 'back overhanging a side, a part in the overhang', make: () => design(
    { name: 'LeftSide', at: [0.5, 0, 0], size: [0.75, 30, 12] },
    { name: 'Back', at: [0, 0, -0.25], size: [21.5, 30, 0.25] },
    { name: 'X', at: [0, 0, 0], size: [0.5, 30, 0.25] },
  ) },
  { label: 'back 1/8in off one side', make: () => design(
    { name: 'LeftSide', at: [0, 0, 0], size: [0.75, 30, 12] },
    { name: 'RightSide', at: [20.75, 0, 0.125], size: [0.75, 30, 12] },
    { name: 'Back', at: [0, 0, -0.25], size: [21, 30, 0.25] },
  ) },
  ...[1, 2, 3].flatMap((k) => [
    { label: `rail between two legs, turned ${90 * k}`, make: () => quarterTurned(RAIL_TWO_LEGS, k) },
    { label: `shelf between two sides, turned ${90 * k}`, make: () => quarterTurned(SIDES_SHELF, k) },
    { label: `cabinet with a rabbeted back, turned ${90 * k}`, make: () => quarterTurned(CABINET_BACK, k) },
    { label: `half-lap, turned ${90 * k}`, make: () => quarterTurned(LAP, k) },
  ]),
  ...([0, 90, 180, 270] as const).map((rot) => ({ label: `leg and rail inside an assembly turned ${rot}`, make: () => {
    const flat = design(...LEG_RAIL);
    const g = groupItems(flat, null, worldParts(flat).map((b) => b.id))!.doc;
    const grouped: SloydDocument = { ...g, instances: g.instances.map((i) => ({ ...i, rotation: rot, position: [5.3, 0, 2.1] as V3 })) };
    return flatDocument(grouped);
  } })),
  { label: 'shaker table', make: () => flatDocument(designToDocument(SHAKER_TABLE_JSON as never, { centre: false }).doc) },
  // The grid lands in every crossing notch, so with it correct code rules half-lap out at every lap fixture. These two
  // place their holes by hand instead, beside the notches (some TANGENT to a notch's end: touching is allowed), so a
  // half-lap is really applied through the holes, single-partner and in a grid. Notches are board-local length spans.
  ...[0, 1].map((k) => ({ label: `half-lap, holes beside the notch${k ? ', turned 90' : ''}`, make: () => (k ? quarterTurned(LAP, 1) : design(...LAP)),
    // Both parts are notched over length [9, 11]: 8.875 and 11.125 touch it, 4 and 16 are clear.
    layout: (b: Board) => pinsAt(b, [4, 8.875, 11.125, 16]) })),
  { label: 'half-lap stretcher grid, one lap set clear', make: () => design(
    { name: 'LowA', at: [0, 5, 0], size: [20, 0.75, 2] },
    { name: 'LowB', at: [0, 5, 10], size: [20, 0.75, 2] },
    { name: 'UpA', at: [2, 5.75, -4], size: [2, 0.75, 20] },
    { name: 'UpB', at: [12, 5.75, -4], size: [2, 0.75, 20] },
  ),
  // LowA and LowB are notched over [2, 4] (by UpA) and [12, 14] (by UpB); UpA and UpB over [4, 6] and [14, 16]. One hole
  // in UpA's notch in LowA rules UpA's lap set out; UpB's set, clear (14.125 and 6.125 tangent), is applied.
  layout: (b: Board) => pinsAt(b, b.name === 'LowA' ? [3, 8, 14.125, 17.5] : b.name.startsWith('Low') ? [8, 14.125, 17.5] : [6.125, 10]) },
];

/**
 * The deterministic hole grid (task brief): on every part, two rows of three 1/4in holes at 1/5, 1/2 and 4/5 of the
 * length, inset half the width, half the thickness deep, one row from each thickness face; and one 1/4in hole drilled
 * 3/4in into the length's min end, centred. Board-local, so every turn and posture meets it the same way.
 */
const grid = (b: Board): HoleRow[] => {
  const across = { along: 'length' as const, alongFrom: 'min' as const, station: b.length / 5, count: 3, pitch: 0.3 * b.length, acrossFrom: 'min' as const, inset: b.width / 2 };
  return [
    { id: 'oracle-tmin', face: 'thickness', from: 'min', diameter: 0.25, depth: b.thickness / 2, ...across },
    { id: 'oracle-tmax', face: 'thickness', from: 'max', diameter: 0.25, depth: b.thickness / 2, ...across },
    { id: 'oracle-end', face: 'length', from: 'min', diameter: 0.25, depth: 0.75, along: 'width', alongFrom: 'min', station: b.width / 2, count: 1, pitch: 0, acrossFrom: 'min', inset: b.thickness / 2 },
  ];
};
/** A hand layout: one 1/4in hole at each length station from EACH thickness face (half the thickness deep, inset half the
 *  width, as the grid), plus the grid's end hole. */
const pinsAt = (b: Board, stations: number[]): HoleRow[] => [
  ...stations.flatMap((station, i) => (['min', 'max'] as const).map((from): HoleRow => ({
    id: `oracle-pin${i}-${from}`, face: 'thickness', from, diameter: 0.25, depth: b.thickness / 2,
    along: 'length', alongFrom: 'min', station, count: 1, pitch: 0, acrossFrom: 'min', inset: b.width / 2,
  }))),
  grid(b)[2]!,
];
const holed = (doc: FlatDocument, layout: (b: Board) => HoleRow[] = grid): FlatDocument => ({ ...doc, boards: doc.boards.map((b) => ({ ...b, holes: layout(b) })) });

const DIMS = ['length', 'width', 'thickness'] as const;
/** Overlap beyond float noise on all three dimensions: touching is allowed (spec §3.3, amended). */
const overlapBeyondNoise = (a: Region, b: Region) => DIMS.every((d) => Math.min(a[d][1], b[d][1]) - Math.max(a[d][0], b[d][0]) > 1e-9);
const holesOf = (b: Board) => b.holes.flatMap((r) => holeInstances(b, r));
const faultKeys = (b: Board) => new Set(b.holes.flatMap((r) => holeFaults(b, r).map((f) => `${r.id} ${JSON.stringify(f)}`)));

type Run = { label: string; choices: JointChoice[]; out: JoinResult };

/** Assertions 1–4 on one run: every breach, labelled with fixture, run and part, so a red run is already the report. */
function breaches(input: FlatDocument, { label, out }: Run): string[] {
  const found: string[] = [];
  const names = out.doc.boards.map((b) => b.name);
  if (JSON.stringify(names) !== JSON.stringify(input.boards.map((b) => b.name))) return [`${label}: parts renamed or reordered ${JSON.stringify(names)}`];
  const moved = new Set(out.moved);
  input.boards.forEach((before, i) => {
    const after = out.doc.boards[i]!;
    const at = `${label} / ${after.name}`;
    // 4. Every hole row survives, by id and count (the loader DROPS a malformed row, which would pass 1–3 vacuously).
    const rows = (b: Board) => JSON.stringify(b.holes.map((r) => [r.id, r.count]));
    if (rows(after) !== rows(before)) { found.push(`${at}: hole rows ${rows(before)} -> ${rows(after)}`); return; }
    // 1. No cut overlaps a bore.
    const bores = holesOf(after).map((h) => ({ h, r: holeRegion(h) }));
    for (const c of after.cuts) {
      const box = clippedRegion(after, c);
      for (const { h, r } of bores) if (overlapBeyondNoise(box, r)) found.push(`${at}: cut ${JSON.stringify(box)} meets hole ${h.row}#${h.index} ${JSON.stringify(r)}`);
    }
    // 2. No new hole fault.
    const was = faultKeys(before);
    for (const k of faultKeys(after)) if (!was.has(k)) found.push(`${at}: new hole fault ${k}`);
    // 3. A part nothing moved keeps every hole where it was in the world (the re-ground's drop added back); a moved part
    //    moves every hole by one rigid offset, so no hole slides in its wood.
    const worldHoles = (b: Board) => holesOf(b).map((h) => worldBox(b, holeRegion(h)));
    const w0 = worldHoles(before);
    const w1 = worldHoles(after).map((w) => ({ min: [w.min[0]!, w.min[1]! + out.lowered, w.min[2]!], max: [w.max[0]!, w.max[1]! + out.lowered, w.max[2]!] }));
    const offset = moved.has(after.name) && w0.length > 0 ? [0, 1, 2].map((k) => w1[0]!.min[k]! - w0[0]!.min[k]!) : [0, 0, 0];
    w0.forEach((w, j) => {
      const off = [0, 1, 2].some((k) => Math.abs(w1[j]!.min[k]! - offset[k]! - w.min[k]!) > 1e-9 || Math.abs(w1[j]!.max[k]! - offset[k]! - w.max[k]!) > 1e-9);
      if (off) found.push(`${at}: hole ${j} moved in the wood ${JSON.stringify(w)} -> ${JSON.stringify(w1[j])} (part offset ${JSON.stringify(offset)})`);
    });
  });
  return found;
}

/** The P1 trial sizes over the NARROWED sites: each (site, kind) alone, every other site butt; a rabbet unit together. */
function perKindRuns(doc: FlatDocument, sites: Site[]): { label: string; choices: JointChoice[] }[] {
  const runs: { label: string; choices: JointChoice[] }[] = [];
  const units = new Set<string>();
  for (const s of sites) {
    const r = rangesOf(s, doc);
    for (const kind of s.allowed) {
      const at = `site ${s.id} ${kind}`;
      switch (kind) {
        case 'butt': break;
        case 'mortise-tenon': runs.push({ label: at, choices: [{ site: s.id, joint: kind, tenonLength: r.tenonLength[1] }] }); break;
        case 'dado': runs.push({ label: at, choices: [{ site: s.id, joint: kind, depth: r.dadoDepth[1] }] }); break;
        case 'stopped-dado':
          for (const e of s.stopEnds) runs.push({ label: `${at} stopped ${e.end} ${e.axis}`, choices: [{ site: s.id, joint: kind, depth: r.dadoDepth[1], stopAt: e, inset: r.inset(e)[0] }] });
          break;
        case 'half-lap': {
          runs.push({ label: at, choices: [{ site: s.id, joint: kind }] });
          // A part lapping several partners can only drop when every lap is cut (alone, its drop meets the other
          // partner and is skipped), so its laps on one axis also run together: the model may choose them all.
          const key = `lap ${s.enter}|${s.axis}`;
          if (units.has(key)) break;
          units.add(key);
          const partners = sites.filter((m) => m.allowed.includes('half-lap') && m.enter === s.enter && m.axis === s.axis);
          if (partners.length > 1) runs.push({ label: `half-lap unit ${key}`, choices: partners.map((m) => ({ site: m.id, joint: 'half-lap' as const })) });
          break;
        }
        case 'rabbet': {
          const key = `${s.enter}|${s.axis}|${s.side}`;
          if (units.has(key)) break;
          units.add(key);
          const members = sites.filter((m) => m.allowed.includes('rabbet') && `${m.enter}|${m.axis}|${m.side}` === key);
          for (const i of [0, 1] as const) {
            runs.push({ label: `rabbet unit ${key} at depth[${i}]`, choices: members.map((m) => ({ site: m.id, joint: 'rabbet' as const, depth: rangesOf(m, doc).rabbetDepth[i] })) });
          }
          break;
        }
      }
    }
  }
  return runs;
}

describe('the oracle: no joint takes wood from a hole, and no hole is lost (joinery-holes spec §7)', () => {
  const results: { label: string; input: FlatDocument; sites: Site[]; ruledOut: number; defaults: JointChoice[]; runs: Run[] }[] = [];
  beforeAll(() => {
    for (const { label, make, layout } of FIXTURES) {
      const input = holed(make(), layout);
      const found = findSites(input);
      const { sites, ruledOut } = featureAllowed(input, found);
      // The default run as runJoinery builds it: a site features left with only butt is joined as a butt, never chosen.
      const leftButt = (s: Site) => s.allowed.length === 1 && s.allowed[0] === 'butt';
      const defaults = sites.map((s) => defaultChoice(s, input, sites));
      const asRun = sites.map((s, i) => (leftButt(s) ? { site: s.id, joint: 'butt' as const } : defaults[i]!));
      const runs: Run[] = [{ label: `${label} / defaults`, choices: asRun, out: applyJoints(input, sites, asRun) }];
      for (const r of perKindRuns(input, sites)) runs.push({ label: `${label} / ${r.label}`, choices: r.choices, out: applyJoints(input, sites, r.choices) });
      results.push({ label, input, sites, ruledOut: ruledOut.length, defaults, runs });
    }
  });

  it('the grid survives the loader on every fixture (so a lost row is joinery\'s, not the fixture\'s)', () => {
    for (const { label, input } of results) {
      const loaded = flatDocument(migrateDocument(input));
      expect(loaded.boards.map((b) => b.holes.map((r) => [r.id, r.count])), label).toEqual(input.boards.map((b) => b.holes.map((r) => [r.id, r.count])));
    }
  });

  it('defaultChoice picks only a kind the narrowed site still allows (spec §3.5)', () => {
    const bad: string[] = [];
    for (const { label, sites, defaults } of results) {
      sites.forEach((s, i) => { if (!s.allowed.includes(defaults[i]!.joint)) bad.push(`${label} / site ${s.id}: ${defaults[i]!.joint} not in ${s.allowed.join(', ')}`); });
    }
    expect(bad).toEqual([]);
  });

  it('every run: no cut meets a hole, no new hole fault, holes stay put in the wood, every row kept', () => {
    expect(results.flatMap(({ input, runs }) => runs.flatMap((run) => breaches(input, run)))).toEqual([]);
  });

  it('the hand-laid lap fixtures really lap: beside the notches applied, in UpA\'s notch ruled out', () => {
    const of = (label: string) => results.find((r) => r.label === label)!;
    const lapsIn = (label: string) => of(label).runs[0]!.out.applied.filter((a) => a.joint === 'half-lap').map((a) => a.site);
    for (const label of ['half-lap, holes beside the notch', 'half-lap, holes beside the notch, turned 90']) {
      expect(of(label).ruledOut, label).toBe(0);
      expect(lapsIn(label), label).toEqual([1]);
    }
    const grid = of('half-lap stretcher grid, one lap set clear');
    const name = (i: number) => grid.input.boards[i]!.name;
    expect(grid.sites.map((s) => [name(s.enter), name(s.receive), s.allowed]), 'narrowed').toEqual([
      ['UpA', 'LowA', ['butt']], ['UpA', 'LowB', ['butt']], ['UpB', 'LowA', ['half-lap', 'butt']], ['UpB', 'LowB', ['half-lap', 'butt']],
    ]);
    expect(lapsIn('half-lap stretcher grid, one lap set clear')).toEqual(grid.sites.filter((s) => name(s.enter) === 'UpB').map((s) => s.id));
  });

  it('is not vacuous: non-butt joints are applied, and kinds are ruled out', () => {
    const applied = results.flatMap((r) => r.runs.flatMap((run) => run.out.applied.filter((a) => a.joint !== 'butt').map((a) => a.joint as JointKind)));
    expect(applied.length).toBeGreaterThan(0);
    // Every kind the model may choose is exercised somewhere, through the holes.
    expect(new Set(applied)).toEqual(new Set(['mortise-tenon', 'dado', 'stopped-dado', 'rabbet', 'half-lap']));
    expect(results.reduce((n, r) => n + r.ruledOut, 0)).toBeGreaterThan(0);
  });
});
