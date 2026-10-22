import { beforeAll, describe, expect, it } from 'vitest';
import workbenchRaw from '../../document/fixtures/simple-workbench.sloyd?raw';
import { designToDocument } from '../../document/generated';
import { clippedRegion, flatDocument, groupItems, migrateDocument } from '../../document/document';
import type { Board, CurveCut, Dimension, FlatDocument, ProfileCut, ProfileSide, Region, SloydDocument } from '../../document/document';
import { worldBox } from '../../document/designCheck';
import { archCurve, cornerCurve, curveFaults, localSegments, spanOf, uvDims, wasteContains } from '../../document/curves';
import type { P2, ViewCurve } from '../../document/curves';
import { geometryBoard, profileFaults } from '../../document/profiles';
import { profilePath } from '../../document/profilePath';
import { profileAirTester } from '../../document/runout';
import { sweptAirTester } from '../../document/sweep';
import { axisDimensions, boardExtents, DIMENSION_ORDER, endFacing } from '../../document/geometry';
import { SHAKER_TABLE_JSON } from '../../document/shakerTableFixture';
import { rotateQuarter } from '../../document/turnFixtures';
import { worldParts } from '../../document/tree';
import { defaultChoice } from './choose';
import { featureAllowed } from './featureZones';
import type { RuledOut } from './featureZones';
import { applyJoints, tenonSection } from './recipes';
import type { JoinResult, JointChoice } from './recipes';
import { findSites, rangesOf } from './sites';
import type { JointKind, Site } from './sites';

// Joinery features chunk 2, spec §7, the oracle: after `featureAllowed` narrows the sites, no joint the model may choose
// takes wood from a curve or an edge profile, and no curve or profile is lost or moved in the wood. Judged INDEPENDENTLY of
// the zones: never through `JoinWatch`, `featureRegions.ts` or `rectOverlapsWaste`, but by point sampling each joint's wood
// against the stock probe's own air testers (`wasteContains`, `profileAirTester`, `sweptAirTester`) read through
// `geometryBoard` on the part as it was stored, and each part's frame shift read off its world box (P5).

type V3 = [number, number, number];
type P = { name: string; at: V3; size: V3; material?: string };
const design = (...parts: P[]) => flatDocument(designToDocument({
  name: 'T',
  parts: parts.map((p) => ({ name: p.name, material: p.material ?? 'oak', at: { x: p.at[0], y: p.at[1], z: p.at[2] }, size: { x: p.size[0], y: p.size[1], z: p.size[2] } })),
}).doc);

// A whole design turned rigidly about one pivot by k quarter turns (as recipes.test's fu 217 fixtures), so the
// board-local features meet the joints through every turn.
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

const FIXTURES: { label: string; make: () => FlatDocument }[] = [
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
];

// ---------------------------------------------------------------------------------------------------------------------
// The features (task brief): on every part, board-local so every turn and posture meets them the same way, each kept only
// when the part then has no `curveFaults` / `profileFaults` at all (added in this order, one at a time). The end-to-end
// roundover's side carries nothing else, so it stays a STRAIGHT profile (a curve on its side would make it swept, `isSwept`)
// and the P7 run-through exception is reachable; the arch and the corner sit on the stopped roundover's side, the arch
// below the stopped run (whose path stays one straight chord, so it stays straight with its run-outs).

const side = (from: 'min' | 'max'): ProfileSide => ({ across: 'width', from });
const CANDIDATES: ((b: Board) => { curve?: CurveCut; profile?: ProfileCut })[] = [
  () => ({ profile: { id: 'o-e2e', face: 'max', kind: 'roundover', size: 0.25, fillet: 0, facing: 'face', run: { start: { side: side('min'), through: 'min' }, end: { side: side('min'), through: 'max' } } } }),
  (b) => ({ profile: { id: 'o-stop', face: 'max', kind: 'roundover', size: 0.25, fillet: 0, facing: 'face', run: { start: { side: side('max'), from: 'min', at: b.length / 4 }, end: { side: side('max'), from: 'min', at: (3 * b.length) / 4 } } } }),
  (b) => ({ curve: { id: 'o-arch', ...archCurve({ through: 'thickness', along: 'length', side: 'max', from: 'min', start: 0.08 * b.length, span: 0.12 * b.length, rise: Math.min(b.width / 4, 0.03 * b.length) }) } }),
  () => ({ curve: { id: 'o-corner', ...cornerCurve({ through: 'thickness', uFrom: 'max', vFrom: 'max', radius: 0.5 }) } }),
  // (4) Not the brief's: an arch on the length-max END side, along the width, clear of both long edges, so a rabbet (its
  // pocket along a receiver's long arris, its panel trimmed along its own long edges) can go through beside a feature.
  (b) => ({ curve: { id: 'o-end-arch', ...archCurve({ through: 'thickness', along: 'width', side: 'max', from: 'min', start: 0.3 * b.width, span: 0.4 * b.width, rise: Math.min(0.1 * b.width, b.length / 8) }) } }),
];
const OGEE_LOOP: ProfileCut = { id: 'o-loop', face: 'max', kind: 'ogee', size: 0.5, fillet: 0, facing: 'face', run: { loop: true } };

const faultKeys = (b: Board): string[] => [
  ...b.curves.flatMap((c) => curveFaults(b, c).map((f) => `curve ${c.id} ${JSON.stringify(f)}`)),
  ...b.profiles.flatMap((p) => profileFaults(b, p).map((f) => `profile ${p.id} ${JSON.stringify(f)}`)),
];
const tally = { placed: 0, kept: 0, byId: new Map<string, [number, number]>() };
const count = (id: string, kept: boolean) => {
  const t = tally.byId.get(id) ?? [0, 0];
  t[0] += 1; if (kept) t[1] += 1;
  tally.byId.set(id, t);
  tally.placed += 1; if (kept) tally.kept += 1;
};
/** `b` with the candidates added one at a time, each kept only when the part is then fault-free (the shaker top's ogee loop
 *  first, so the brief's swept feature is always present: the loop rules out the top's own straight profiles instead). */
function decorate(b: Board, loop: boolean, only: readonly number[]): Board {
  let out: Board = { ...b, curves: [], profiles: [] };
  const tryAdd = (curve?: CurveCut, profile?: ProfileCut) => {
    const next: Board = { ...out, curves: curve ? [...out.curves, curve] : out.curves, profiles: profile ? [...out.profiles, profile] : out.profiles };
    const ok = faultKeys(next).length === 0;
    count((curve ?? profile)!.id, ok);
    if (ok) out = next;
  };
  if (loop) tryAdd(undefined, OGEE_LOOP);
  for (const i of only) { const { curve, profile } = CANDIDATES[i]!(b); tryAdd(curve, profile); }
  return out;
}
const decorated = (doc: FlatDocument, label: string, only: readonly number[]): FlatDocument => ({
  ...doc, boards: doc.boards.map((b) => decorate(b, label === 'shaker table' && b.name === SHAKER_TOP, only)),
});
/** The brief's set on every part; then the curves alone and the profiles alone, so that more joints are made beside
 *  features (the full set rules out every half-lap, whose notch crosses both long arrises, and with them gone the profiles
 *  alone let max-end tenons through, which the corner otherwise rules out). No variant lets a rabbet through: its pocket
 *  runs along a receiver's arris, and its panel is trimmed along its own long edges or corners, all of which carry features. */
const VARIANTS: { name: string; only: readonly number[] }[] = [
  { name: 'all four', only: [0, 1, 2, 3] },
  { name: 'curves only', only: [2, 3] },
  { name: 'profiles only', only: [0, 1] },
  { name: 'end arch', only: [4] },
];
const SHAKER_TOP = 'Top';

// ---------------------------------------------------------------------------------------------------------------------
// The independent judge.

/** One stored feature as the stock probe sees it: `air(q)` at a board-local point q of the part AS STORED (never a view of a
 *  joined board). `through` and `span` for a curve or straight profile (a view curve); a swept profile has neither. */
interface Feature { id: string; word: 'curve' | 'profile' | 'swept'; through?: Dimension; stopLo?: boolean; stopHi?: boolean; air: (q: V3) => boolean }
const featureCache = new WeakMap<Board, Feature[]>();
function featuresOf(b: Board): Feature[] {
  const hit = featureCache.get(b);
  if (hit) return hit;
  const view = geometryBoard(b);
  const plain = b.curves.length;
  const out: Feature[] = view.curves.map((c, i): Feature => {
    const vc = c as ViewCurve;
    const sp = spanOf(vc);
    const base = { id: c.id, through: c.through, stopLo: !!sp?.stopLo, stopHi: !!sp?.stopHi };
    if (i < plain) {
      // A plain curve: its waste on the real outline, extruded through `through` (unbounded along it: growth extends it).
      const segs = localSegments(view, c);
      const [u, v] = uvDims(c.through).map((d) => DIMENSION_ORDER.indexOf(d));
      return { ...base, word: 'curve', air: (q) => wasteContains(segs, [q[u!]!, q[v!]!] as P2, 'open') };
    }
    return { ...base, word: 'profile', air: profileAirTester(view, vc) };
  });
  for (const p of view.profiles) out.push({ id: p.id, word: 'swept', air: sweptAirTester(view, p) });
  featureCache.set(b, out);
  return out;
}

/** A view curve that runs straight out through `end` of `d` (P7 condition 2): `through === d`, and that end is no stop. */
const runsThrough = (f: Feature, d: Dimension, end: 'min' | 'max') => f.through === d && !(end === 'min' ? f.stopLo : f.stopHi);
/** P7 conditions 1 and 2 at a growing end. Condition 3 is ASSERTED (assertion 2), never assumed. */
const p7 = (f: Feature, d: Dimension, end: 'min' | 'max') => d === 'length' && runsThrough(f, d, end);

const SHRINK = 1e-6;
/** n × n × n points of a box's interior, shrunk by 1e-6; a box thinner than that on any dimension holds none. */
function lattice(box: Region, n = 7): V3[] {
  const axes = DIMENSION_ORDER.map((d) => {
    const [lo, hi] = [box[d][0] + SHRINK, box[d][1] - SHRINK];
    if (!(hi > lo)) return [];
    return Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));
  });
  const pts: V3[] = [];
  for (const x of axes[0]!) for (const y of axes[1]!) for (const z of axes[2]!) pts.push([x, y, z]);
  return pts;
}
const whole = (b: Pick<Board, Dimension>): Region => ({ length: [0, b.length], width: [0, b.width], thickness: [0, b.thickness] });
const insideClosed = (box: Region, p: V3) => DIMENSION_ORDER.every((d, i) => p[i]! >= box[d][0] - 1e-9 && p[i]! <= box[d][1] + 1e-9);

type Growth = Record<Dimension, { min: number; max: number }>;
/**
 * Each end's growth (positive) or trim (negative), read off the part's WORLD box before and after (P5's shift is
 * `g[d].min`): the re-ground's drop added back, a world side mapped to its local end by `endFacing`. A moved part translates
 * along one axis, on a dimension it did not resize (a half-lap's drop, a rabbet panel's move); a moved part resized at
 * both ends of a dimension with no such translation seen is reported, never guessed.
 */
function growthOf(before: Board, after: Board, lowered: number, moved: boolean): Growth | string {
  const wb = worldBox(before, whole(before));
  const wa = worldBox(after, whole(after));
  wa.min[1] += lowered; wa.max[1] += lowered;
  const dims = axisDimensions(before);
  if (JSON.stringify(dims) !== JSON.stringify(axisDimensions(after))) return 'posture changed';
  const g = { length: { min: 0, max: 0 }, width: { min: 0, max: 0 }, thickness: { min: 0, max: 0 } } as Growth;
  // Joinery moves a part along ONE axis (a rabbet panel along its face normal, a half-lap's drop): when a dimension it did
  // not resize carries the translation, the resized ones did not move.
  const movedOnUnresized = [0, 1, 2].some((a) => Math.abs(after[dims[a]!] - before[dims[a]!]) <= 1e-9 && Math.abs(wb.min[a]! - wa.min[a]!) > 1e-9);
  for (let a = 0; a < 3; a += 1) {
    const d = dims[a]!;
    const lo = wb.min[a]! - wa.min[a]!;
    const hi = wa.max[a]! - wb.max[a]!;
    const resized = Math.abs(after[d] - before[d]) > 1e-9;
    if (!resized) {
      if (!moved && (Math.abs(lo) > 1e-9 || Math.abs(hi) > 1e-9)) return `unmoved part translated on axis ${a} (${lo}, ${hi})`;
      continue;
    }
    if (moved && !movedOnUnresized && Math.abs(lo) > 1e-9 && Math.abs(hi) > 1e-9) return `moved part resized at both ends of ${d}: frame ambiguous`;
    const [atMin, atMax] = endFacing(before, a, -1) === 'min' ? [lo, hi] : [hi, lo];
    g[d] = { min: Math.abs(atMin) > 1e-9 ? atMin : 0, max: Math.abs(atMax) > 1e-9 ? atMax : 0 };
    if (Math.abs(before[d] + g[d].min + g[d].max - after[d]) > 1e-9) return `growth of ${d} does not add up`;
  }
  return g;
}

/** World (length, width) or (u, v) points of a 2D board-local point, compared on the world axes of those two dimensions. */
const worldOf = (b: Board, dims: [Dimension, Dimension], p: P2, lowered: number): number[] => {
  const r = whole(b);
  r[dims[0]] = [p[0], p[0]];
  r[dims[1]] = [p[1], p[1]];
  const w = worldBox(b, r);
  const axes = axisDimensions(b);
  return dims.map((d) => { const a = axes.indexOf(d); return w.min[a]! + (a === 1 ? lowered : 0); });
};
const curvePoints = (b: Board, c: CurveCut): P2[] => localSegments(b, c).flatMap((s) => [s.a, s.b]);
/** A profile's fixed points: its path's station ends (`at`, length × width); a loop's every chord end. */
const profilePoints = (b: Board, p: ProfileCut, loopToo: boolean): P2[] | null => {
  const path = profilePath(b, p);
  if (!path) return null;
  if (path.loop) return loopToo ? path.chords.flatMap((c) => [c.a, c.b]) : [];
  return (path.ends ?? []).flatMap((e) => (e.kind === 'station' ? [e.at] : []));
};

type Run = { label: string; choices: JointChoice[]; out: JoinResult };
/** What the oracle saw the P7 exception carry: a growth at `end` through which an exempt feature's waste runs, and whether
 *  the run was one mortise-tenon alone and this its entering part, so the growth is that tenon's. */
type Exemption = { label: string; part: string; end: 'min' | 'max'; tenon: boolean };

/** Assertions 1–7 on one run: every breach, labelled with fixture, run and part, so a red run is already the report. */
type Seen = { trims: number };
function breaches(input: FlatDocument, sites: readonly Site[], { label, choices, out }: Run, exemptions: Exemption[], seen: Seen): string[] {
  const found: string[] = [];
  const names = out.doc.boards.map((b) => b.name);
  if (JSON.stringify(names) !== JSON.stringify(input.boards.map((b) => b.name))) return [`${label}: parts renamed or reordered ${JSON.stringify(names)}`];
  const moved = new Set(out.moved);
  // A per-kind run joining ONE site by mortise-tenon (every other site butt): its entering part grows at one end only.
  const tenons = choices.filter((c) => c.joint !== 'butt');
  const tenoned = tenons.length === 1 && tenons[0]!.joint === 'mortise-tenon' && out.applied.some((x) => x.site === tenons[0]!.site && x.joint === 'mortise-tenon')
    ? sites.find((s) => s.id === tenons[0]!.site)!.enter : -1;
  let reloadedBoards: Board[] | null = null;
  const loaded = () => (reloadedBoards ??= flatDocument(migrateDocument(out.doc)).boards);
  input.boards.forEach((before, i) => {
    const after = out.doc.boards[i]!;
    const at = `${label} / ${after.name}`;
    const tenonRun = i === tenoned;
    // 6. Nothing is lost: curve and profile ids and counts survive.
    const ids = (b: Board) => JSON.stringify([b.curves.map((c) => c.id), b.profiles.map((p) => p.id)]);
    if (ids(after) !== ids(before)) { found.push(`${at}: features ${ids(before)} -> ${ids(after)}`); return; }
    //    ... and through the loader: a rebased entry `migrateDocument` would DROP is lost all the same.
    const reloaded = loaded()[i]!;
    if (ids(reloaded) !== ids(before)) { found.push(`${at}: features after the loader ${ids(before)} -> ${ids(reloaded)}`); return; }
    // 7. No new fault.
    const was = new Set(faultKeys(before));
    for (const k of faultKeys(after)) if (!was.has(k)) found.push(`${at}: new fault ${k}`);
    const feats = featuresOf(before);
    if (feats.length === 0) return;
    const g = growthOf(before, after, out.lowered, moved.has(after.name));
    if (typeof g === 'string') { found.push(`${at}: ${g}`); return; }
    const toOriginal = (p: V3): V3 => [p[0] - g.length.min, p[1] - g.width.min, p[2] - g.thickness.min];
    const cuts = after.cuts.filter((c) => !before.cuts.some((o) => o.id === c.id)).map((c) => clippedRegion(after, c));

    // 1. No new cut's box holds feature waste, except a run-through feature's new wood (judged in the original frame).
    cuts.forEach((box, j) => {
      const hits = new Set<string>();
      for (const p of lattice(box)) {
        const q = toOriginal(p);
        for (const f of feats) {
          if (hits.has(f.id) || !f.air(q)) continue;
          const beyond = f.through === undefined ? null : q[DIMENSION_ORDER.indexOf(f.through)]! < 0 ? 'min' : q[DIMENSION_ORDER.indexOf(f.through)]! > before[f.through] ? 'max' : null;
          if (beyond && runsThrough(f, f.through!, beyond)) continue;
          hits.add(f.id);
          found.push(`${at}: cut ${j} ${JSON.stringify(box)} holds ${f.word} ${f.id}'s waste at ${JSON.stringify(q)} (original frame)`);
        }
      }
    });

    for (const d of DIMENSION_ORDER) {
      for (const end of ['min', 'max'] as const) {
        const amount = g[d][end];
        if (amount > 1e-9) {
          // 3. No growing end was entered: on the old end plane (1e-6 inside the old wood), no waste of a feature that does
          //    not run through it (P7 conditions 1 and 2).
          const plane = whole(before);
          plane[d] = [0, 1];
          const k = DIMENSION_ORDER.indexOf(d);
          const onPlane = lattice(plane).filter((q) => q[k] === SHRINK).map((q): V3 => { const r = [...q] as V3; r[k] = end === 'min' ? SHRINK : before[d] - SHRINK; return r; });
          let exemptAtEnd = false;
          for (const f of feats) {
            const wet = onPlane.some((q) => f.air(q));
            if (!wet) continue;
            if (p7(f, d, end)) { exemptAtEnd = true; continue; }
            found.push(`${at}: grew ${amount} at ${d} ${end} where ${f.word} ${f.id} reaches the end`);
          }
          // 2. No tenon is shaped: every kept point of the new slab (not inside any of the part's cuts) is outside every
          //    feature's waste; a P7 feature's waste may run into the new wood only OUTSIDE the tenon's section (its
          //    condition 3, open), which the dado and stopped dado honour too (spec §3.4: the housing shows a gap there).
          const slab = whole(after);
          slab[d] = end === 'min' ? [0, amount] : [after[d] - amount, after[d]];
          const { cheek, shoulder } = tenonSection(before.thickness, before.width);
          const inSection = (q: V3) => q[1] > shoulder && q[1] < before.width - shoulder && q[2] > cheek && q[2] < before.thickness - cheek;
          const hits = new Set<string>();
          for (const p of lattice(slab)) {
            if (cuts.some((box) => insideClosed(box, p))) continue;
            const q = toOriginal(p);
            for (const f of feats) {
              if (hits.has(f.id) || !f.air(q)) continue;
              if (p7(f, d, end) && !inSection(q)) continue;
              hits.add(f.id);
              found.push(`${at}: kept new wood at ${d} ${end} holds ${f.word} ${f.id}'s waste at ${JSON.stringify(q)} (original frame)`);
            }
          }
          if (exemptAtEnd) exemptions.push({ label, part: after.name, end, tenon: tenonRun });
        } else if (amount < -1e-9) {
          // 4. No trimmed slab held waste (on the part before joining) of a feature that does not run through that end.
          const slab = whole(before);
          slab[d] = end === 'min' ? [0, -amount] : [before[d] + amount, before[d]];
          const hits = new Set<string>();
          seen.trims += 1;
          for (const q of lattice(slab)) {
            for (const f of feats) {
              if (hits.has(f.id) || runsThrough(f, d, end) || !f.air(q)) continue;
              hits.add(f.id);
              found.push(`${at}: trimmed slab at ${d} ${end} held ${f.word} ${f.id}'s waste at ${JSON.stringify(q)}`);
            }
          }
        }
      }
    }

    // 5. Features stay put: a part nothing moved keeps every curve's outline ends and every profile's station ends (a loop's
    //    chords too, when the part kept its size) where they were in the world, within 1e-9.
    if (moved.has(after.name)) return;
    const near = (x: number[], y: number[]) => x.every((v, k) => Math.abs(v - y[k]!) <= 1e-9);
    before.curves.forEach((c, j) => {
      const dims = uvDims(c.through);
      const [p0, p1] = [curvePoints(before, c), curvePoints(after, after.curves[j]!)];
      p0.forEach((p, k) => { if (!near(worldOf(before, dims, p, 0), worldOf(after, dims, p1[k]!, out.lowered))) found.push(`${at}: curve ${c.id} point ${k} moved in the wood`); });
    });
    const sameSize = DIMENSION_ORDER.every((d) => after[d] === before[d]);
    before.profiles.forEach((p, j) => {
      const [p0, p1] = [profilePoints(before, p, sameSize), profilePoints(after, after.profiles[j]!, sameSize)];
      if (!p0) return;
      if (!p1 || p1.length !== p0.length) { found.push(`${at}: profile ${p.id}'s path lost its ends`); return; }
      p0.forEach((q, k) => { if (!near(worldOf(before, ['length', 'width'], q, 0), worldOf(after, ['length', 'width'], p1[k]!, out.lowered))) found.push(`${at}: profile ${p.id} point ${k} moved in the wood`); });
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

describe('the oracle: no joint takes wood from a curve or profile (joinery features spec §7, chunk 2)', () => {
  const results: { label: string; input: FlatDocument; sites: Site[]; ruledOut: RuledOut[]; defaults: JointChoice[]; runs: Run[] }[] = [];
  const exemptions: Exemption[] = [];
  const seen: Seen = { trims: 0 };
  const found: string[] = [];
  beforeAll(() => {
    for (const { label: fixture, make } of FIXTURES) for (const { name, only } of VARIANTS) {
      const label = `${fixture} [${name}]`;
      const input = decorated(make(), fixture, only);
      const all = findSites(input);
      const { sites, ruledOut } = featureAllowed(input, all);
      // The default run as runJoinery builds it: a site features left with only butt is joined as a butt, never chosen.
      const leftButt = (s: Site) => s.allowed.length === 1 && s.allowed[0] === 'butt';
      const defaults = sites.map((s) => defaultChoice(s, input, sites));
      const asRun = sites.map((s, i) => (leftButt(s) ? { site: s.id, joint: 'butt' as const } : defaults[i]!));
      const runs: Run[] = [{ label: `${label} / defaults`, choices: asRun, out: applyJoints(input, sites, asRun) }];
      for (const r of perKindRuns(input, sites)) runs.push({ label: `${label} / ${r.label}`, choices: r.choices, out: applyJoints(input, sites, r.choices) });
      results.push({ label, input, sites, ruledOut, defaults, runs });
      for (const run of runs) found.push(...breaches(input, sites, run, exemptions, seen));
    }
  }, 120_000);

  it('every kept feature is waste somewhere in its own part (the testers read board-local length, width, thickness)', () => {
    const dry: string[] = [];
    for (const { label, input } of results) {
      for (const b of input.boards) {
        const pts = lattice(whole(b), 13);
        for (const f of featuresOf(b)) if (!pts.some((q) => f.air(q))) dry.push(`${label} / ${b.name}: ${f.id} holds no waste`);
      }
    }
    expect(dry).toEqual([]);
  });

  it('the features survive the loader on every fixture (so a lost one is joinery\'s, not the fixture\'s)', () => {
    for (const { label, input } of results) {
      const loaded = flatDocument(migrateDocument(input));
      const ids = (doc: FlatDocument) => doc.boards.map((b) => [b.curves.map((c) => c.id), b.profiles.map((p) => p.id)]);
      expect(ids(loaded), label).toEqual(ids(input));
    }
  });

  it('defaultChoice picks only a kind the narrowed site still allows (spec §3.5)', () => {
    const bad: string[] = [];
    for (const { label, sites, defaults } of results) {
      sites.forEach((s, i) => { if (!s.allowed.includes(defaults[i]!.joint)) bad.push(`${label} / site ${s.id}: ${defaults[i]!.joint} not in ${s.allowed.join(', ')}`); });
    }
    expect(bad).toEqual([]);
  });

  it('every run: no joint takes wood from a feature, features stay put, none is lost, no new fault', () => {
    expect(found).toEqual([]);
  });

  it('is not vacuous: joints applied, kinds ruled out by a curve and by a profile, the P7 exemption exercised', () => {
    const applied = results.flatMap((r) => r.runs.flatMap((run) => run.out.applied.filter((a) => a.joint !== 'butt').map((a) => a.joint as JointKind)));
    expect(applied.length).toBeGreaterThan(0);
    expect(new Set(applied)).toEqual(new Set(['mortise-tenon', 'dado', 'stopped-dado', 'rabbet', 'half-lap']));
    // A rabbet goes through beside a feature (its panel or a receiver carries one; the end-arch variant), so assertion 1
    // judges a rabbet pocket and assertion 4 samples a trim slab of a part with features.
    const featured = (b: Board) => b.curves.length + b.profiles.length > 0;
    const rabbetsBesideFeatures = results.flatMap((r) => r.runs.flatMap((run) => run.out.applied.filter((a) => {
      const site = r.sites.find((s) => s.id === a.site)!;
      return a.joint === 'rabbet' && (featured(r.input.boards[site.enter]!) || featured(r.input.boards[site.receive]!));
    })));
    expect(rabbetsBesideFeatures.length).toBeGreaterThan(0);
    expect(seen.trims, 'trim slabs sampled on parts with features').toBeGreaterThan(0);
    const words = new Set(results.flatMap((r) => r.ruledOut.map((o) => o.feature)));
    expect(words.has('curve')).toBe(true);
    expect([...words].some((w) => w.endsWith('profile'))).toBe(true);
    // A tenon grown through a run-through roundover at a part's local MIN end: the end P5's shift moves (dropping the
    // exception, or judging in the current frame, rules every one of these out).
    expect(exemptions.filter((e) => e.tenon && e.end === 'min').length).toBeGreaterThan(0);
    expect(exemptions.filter((e) => e.tenon && e.end === 'max').length).toBeGreaterThan(0);
    expect(exemptions.filter((e) => !e.tenon).length, 'a dado or stopped dado housing a run-through roundover').toBeGreaterThan(0);
    // Every kind of feature is present: plain curves, straight and stopped profiles, a swept loop.
    const kinds = new Set(results.flatMap((r) => r.input.boards.flatMap((b) => featuresOf(b).map((f) => `${f.word}${f.stopLo || f.stopHi ? ' stopped' : ''}`))));
    expect(kinds).toEqual(new Set(['curve', 'profile', 'profile stopped', 'swept']));
  });
});
