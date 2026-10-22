import { beforeAll, describe, expect, it } from 'vitest';
import workbenchRaw from '../../document/fixtures/simple-workbench.sloyd?raw';
import { designToDocument } from '../../document/generated';
import { BUILT_IN_BAND_ID, canonicalBands, clippedRegion, flatDocument, groupItems, migrateDocument } from '../../document/document';
import type { Band, BandType, Board, CornerRule, Dimension, FlatDocument, ProfileSide, Region, SloydDocument } from '../../document/document';
import { worldBox } from '../../document/designCheck';
import { visibleRun } from '../../document/banding';
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

// Joinery features chunk 3, spec §7, the bands oracle: after `featureAllowed` narrows the sites, no joint the model may
// choose takes wood from an edge band's strip, grows or trims a banded end, or loses a band; a tenoned edged rail's strip
// still runs its plain length. Judged INDEPENDENTLY of the zones: never through `JoinWatch` or `featureRegions.ts`
// (`bandRegions`), but on strips built here from the band types, each joined part's frame shift read off its world box
// (P9, as chunk 2's oracle reads P5's). Fixtures and quarter turns: `curvesOracle.test.ts`' list (copied: a test module is
// never imported).

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
// The bands (task brief), board-local so every turn and posture meets them the same way. Each part takes a ROLE read off
// its own dimensions: a leg (square section) carries nothing; a rail (narrower than 8") carries edging on both long
// edges; a panel is a shelf when its thickness is vertical in the world (tape on its front, width-min, edge) and a side
// otherwise (3/4" solid edging on its front edge). Further variants let dados house a banded shelf (no side edging), put a
// band at t === shoulder (1/2" rails, open: kept), put bands ON ends and on a rabbeted back's trimmed edge (ends), and let a
// half-lap through beside bands (taped rails: a notch crosses both long edges, so any solid edging there rules it out).

const solid = (t: number, id: string): BandType => ({ id, name: `Edging ${id}`, kind: 'solid', thickness: t, lengthAllowance: 0.5, material: 'maple', widthAllowance: 0.0625 });
const QUARTER = solid(0.25, 'oracle-solid-quarter');
const HALF = solid(0.5, 'oracle-solid-half');
const THREE_QUARTER = solid(0.75, 'oracle-solid-three-quarter');
const THICK_TAPE: BandType = { id: 'oracle-thick-tape', name: 'Thick tape', kind: 'tape', thickness: 0.0625, lengthAllowance: 0.5, tapeWidth: 1, pricePerFoot: null };
const ORACLE_TYPES = [QUARTER, HALF, THREE_QUARTER, THICK_TAPE];
const TAPE = BUILT_IN_BAND_ID;

const W_MIN: ProfileSide = { across: 'width', from: 'min' };
const W_MAX: ProfileSide = { across: 'width', from: 'max' };
const L_MIN: ProfileSide = { across: 'length', from: 'min' };
const L_MAX: ProfileSide = { across: 'length', from: 'max' };

type Role = 'leg' | 'rail' | 'shelf' | 'side';
const roleOf = (b: Board): Role => {
  if (Math.abs(b.width - b.thickness) <= 1e-9) return 'leg';
  if (b.width < 8) return 'rail';
  return axisDimensions(b)[1] === 'thickness' ? 'shelf' : 'side';
};
type Layout = Partial<Record<Role, { bands: [ProfileSide, string][]; cornerRule?: CornerRule }>>;
const VARIANTS: { name: string; layout: Layout }[] = [
  { name: 'brief', layout: {
    rail: { bands: [[W_MIN, QUARTER.id], [W_MAX, QUARTER.id]], cornerRule: 'mitre' },
    shelf: { bands: [[W_MIN, TAPE]] },
    side: { bands: [[W_MIN, THREE_QUARTER.id]] },
  } },
  { name: 'no side edging', layout: {
    rail: { bands: [[W_MIN, QUARTER.id], [W_MAX, QUARTER.id]] },
    shelf: { bands: [[W_MIN, TAPE], [W_MAX, QUARTER.id]] },
  } },
  { name: 'half-inch rails', layout: {
    rail: { bands: [[W_MIN, HALF.id], [W_MAX, THICK_TAPE.id]] },
    shelf: { bands: [[W_MIN, THICK_TAPE.id]] },
  } },
  { name: 'ends', layout: {
    rail: { bands: [[W_MIN, QUARTER.id], [L_MIN, TAPE]], cornerRule: 'ends' },
    shelf: { bands: [[L_MIN, TAPE]] },
    side: { bands: [[W_MAX, THICK_TAPE.id], [L_MAX, QUARTER.id]] },
  } },
  // Tape (no region) on a rail's long edges lets a half-lap's notch through; solid edging on one end sits clear of it.
  { name: 'taped rails', layout: {
    rail: { bands: [[W_MIN, TAPE], [W_MAX, TAPE], [L_MIN, QUARTER.id]] },
    side: { bands: [[W_MIN, TAPE]] },
  } },
];

function banded(doc: FlatDocument, layout: Layout): FlatDocument {
  const types = [...doc.bandTypes];
  for (const t of ORACLE_TYPES) if (!types.some((x) => x.id === t.id)) types.push(t);
  return {
    ...doc,
    bandTypes: types,
    boards: doc.boards.map((b) => {
      const l = layout[roleOf(b)];
      if (!l) return b;
      const bands: Band[] = canonicalBands(l.bands.map(([side, type]) => ({ side: { ...side }, type })));
      return { ...b, bands, cornerRule: l.cornerRule ?? b.cornerRule };
    }),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// The independent judge.

const EPS = 1e-9;
const whole = (b: Pick<Board, Dimension>): Region => ({ length: [0, b.length], width: [0, b.width], thickness: [0, b.thickness] });
/** Open overlap: more than EPS on every dimension. */
const overlaps = (a: Region, b: Region) => DIMENSION_ORDER.every((d) => Math.min(a[d][1], b[d][1]) - Math.max(a[d][0], b[d][0]) > EPS);
/** The dimension a band on `side` runs along: the broad face's other dimension. */
const runOf = (side: ProfileSide): Dimension => (side.across === 'width' ? 'length' : 'width');
const onEnd = (band: Band, d: Dimension, end: 'min' | 'max') => band.side.across === d && band.side.from === end;

/** A band's strip on the part AS STORED (spec §3.3): its type's thickness in from its side, the full run and thickness;
 *  null for a type with no thickness. Built here from the type, never through `bandRegions`. */
type Strip = { band: Band; type: BandType; region: Region | null };
const stripsOf = (b: Board, types: readonly BandType[]): Strip[] => b.bands.map((band) => {
  const type = types.find((t) => t.id === band.type)!;
  if (!(type.thickness > 0)) return { band, type, region: null };
  const r = whole(b);
  const a = band.side.across;
  r[a] = band.side.from === 'min' ? [0, type.thickness] : [b[a] - type.thickness, b[a]];
  return { band, type, region: r };
});

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

const GROWING: readonly JointKind[] = ['mortise-tenon', 'dado', 'stopped-dado'];
type Run = { label: string; choices: JointChoice[]; out: JoinResult };
type Seen = {
  cutsJudged: number; sideCutsJudged: number; trims: number; dadoHousedSolid: number; dadoHousedTape: number;
  tenonExempt: number; tenonAtShoulder: number; runsChecked: number; shortLo: number; shortHi: number;
};

/** The brief's assertions on one run: every breach, labelled with fixture, run and part. */
function breaches(input: FlatDocument, sites: readonly Site[], { label, out }: Run, seen: Seen): string[] {
  const found: string[] = [];
  const names = out.doc.boards.map((b) => b.name);
  if (JSON.stringify(names) !== JSON.stringify(input.boards.map((b) => b.name))) return [`${label}: parts renamed or reordered ${JSON.stringify(names)}`];
  const moved = new Set(out.moved);
  // Each growing joint's end, read off its site (world axis and side, `endFacing`) on the entering part as stored.
  const grownBy = new Map<string, Set<JointKind>>();
  for (const a of out.applied) {
    if (!GROWING.includes(a.joint)) continue;
    const s = sites.find((x) => x.id === a.site)!;
    const b = input.boards[s.enter]!;
    const key = `${s.enter}|${axisDimensions(b)[s.axis]}|${endFacing(b, s.axis, s.side)}`;
    if (!grownBy.has(key)) grownBy.set(key, new Set());
    grownBy.get(key)!.add(a.joint);
  }
  let reloadedBoards: Board[] | null = null;
  const loaded = () => (reloadedBoards ??= flatDocument(migrateDocument(out.doc)).boards);
  input.boards.forEach((before, i) => {
    const after = out.doc.boards[i]!;
    const at = `${label} / ${after.name}`;
    // 3. Every band survives with its side, type and cornerRule, and through the loader.
    const bandsOf = (b: Board) => JSON.stringify([b.bands, b.cornerRule]);
    if (bandsOf(after) !== bandsOf(before)) { found.push(`${at}: bands ${bandsOf(before)} -> ${bandsOf(after)}`); return; }
    if (bandsOf(loaded()[i]!) !== bandsOf(before)) { found.push(`${at}: bands after the loader ${bandsOf(before)} -> ${bandsOf(loaded()[i]!)}`); return; }
    if (before.bands.length === 0) return;
    const g = growthOf(before, after, out.lowered, moved.has(after.name));
    if (typeof g === 'string') { found.push(`${at}: ${g}`); return; }
    const toOriginal = (r: Region): Region => {
      const o = { ...r };
      for (const d of DIMENSION_ORDER) o[d] = [r[d][0] - g[d].min, r[d][1] - g[d].min];
      return o;
    };
    const strips = stripsOf(before, input.bandTypes);
    const role = roleOf(before);

    // 1. No new or changed rectangular cut's region, in the original frame, overlaps a band's strip (open, EPS).
    const fresh = after.cuts.filter((c) => !before.cuts.some((o) => JSON.stringify(o) === JSON.stringify(c)));
    fresh.forEach((c, j) => {
      const box = toOriginal(clippedRegion(after, c));
      seen.cutsJudged += 1;
      if (role === 'side') seen.sideCutsJudged += 1;
      for (const s of strips) {
        if (s.region && overlaps(box, s.region)) found.push(`${at}: cut ${j} ${JSON.stringify(box)} meets the ${s.type.id} strip on ${JSON.stringify(s.band.side)} (original frame)`);
      }
    });

    // 2. No growth at a banded end; a band running along a tenon's growth clears the tenon section (P11); no trim at a
    //    banded end, and no trimmed slab meets a strip that does not run along the trim.
    let tenonOnly = true;
    let grewLength = false;
    for (const d of DIMENSION_ORDER) {
      for (const end of ['min', 'max'] as const) {
        const amount = g[d][end];
        if (amount > EPS) {
          const kinds = grownBy.get(`${i}|${d}|${end}`);
          if (!kinds) { found.push(`${at}: grew ${amount} at ${d} ${end} with no growing joint there`); continue; }
          if (d === 'length') grewLength = true;
          if ([...kinds].some((k) => k !== 'mortise-tenon')) tenonOnly = false;
          for (const s of strips) {
            if (onEnd(s.band, d, end)) { found.push(`${at}: grew ${amount} at ${d} ${end}, which carries a ${s.type.id} band`); continue; }
            if (s.band.side.across === d) continue; // the far end
            if (d === 'thickness') { found.push(`${at}: grew through the thickness with a ${s.type.id} band`); continue; }
            // The band runs along d.
            if (kinds.has('dado') || kinds.has('stopped-dado')) { if (s.region) seen.dadoHousedSolid += 1; else seen.dadoHousedTape += 1; }
            if (!kinds.has('mortise-tenon')) continue;
            if (d !== 'length') { found.push(`${at}: tenon grown along ${d} beside a ${s.type.id} band`); continue; }
            if (!s.region) { seen.tenonExempt += 1; continue; }
            const { shoulder } = tenonSection(before.thickness, before.width);
            const [lo, hi] = s.region.width;
            if (Math.min(hi, before.width - shoulder) - Math.max(lo, shoulder) > EPS) {
              found.push(`${at}: tenon grown at ${end} where the ${s.type.id} strip ${JSON.stringify(s.region.width)} meets the section (${shoulder}, ${before.width - shoulder})`);
            } else {
              seen.tenonExempt += 1;
              if (Math.abs(s.type.thickness - shoulder) <= EPS) seen.tenonAtShoulder += 1;
            }
          }
        } else if (amount < -EPS) {
          seen.trims += 1;
          const slab = whole(before);
          slab[d] = end === 'min' ? [0, -amount] : [before[d] + amount, before[d]];
          for (const s of strips) {
            if (onEnd(s.band, d, end)) { found.push(`${at}: trimmed ${-amount} at ${d} ${end}, which carries a ${s.type.id} band`); continue; }
            if (runOf(s.band.side) === d) continue; // shortened with the part
            // Defensive: reached for a far-end band (12 times over the fixtures, measured), but it can flag only a thickness
            // trim (no recipe makes one) or a slab deeper than the part less the band — never seen.
            if (s.region && overlaps(s.region, slab)) found.push(`${at}: trimmed slab at ${d} ${end} meets the ${s.type.id} strip on ${JSON.stringify(s.band.side)}`);
          }
        }
      }
    }

    // 4. A tenoned edged rail (every growth a tenon's): each solid strip along its length runs exactly its plain length,
    //    from where the original wood starts.
    if (!(grewLength && tenonOnly)) return;
    for (const s of strips) {
      if (s.type.kind !== 'solid' || runOf(s.band.side) !== 'length') continue;
      const run = visibleRun(after, s.band.side, s.type.thickness);
      seen.runsChecked += 1;
      if (run.shortLo) seen.shortLo += 1;
      if (run.shortHi) seen.shortHi += 1;
      const [lo, hi] = [g.length.min, g.length.min + before.length];
      if (Math.abs(run.lo - lo) > EPS || Math.abs(run.hi - hi) > EPS) {
        found.push(`${at}: the ${s.type.id} strip on ${JSON.stringify(s.band.side)} runs [${run.lo}, ${run.hi}], not its plain length [${lo}, ${hi}]`);
      }
    }
  });
  return found;
}

/** Each narrowed site's allowed kinds at their range BOUNDS (each alone, every other site butt); half-lap and rabbet units
 *  together, as the model may choose them. */
function perKindRuns(doc: FlatDocument, sites: Site[]): { label: string; choices: JointChoice[] }[] {
  const runs: { label: string; choices: JointChoice[] }[] = [];
  const units = new Set<string>();
  const bounds = (r: [number, number]) => (r[0] === r[1] ? [r[0]] : [r[0], r[1]]);
  for (const s of sites) {
    const r = rangesOf(s, doc);
    for (const kind of s.allowed) {
      const at = `site ${s.id} ${kind}`;
      switch (kind) {
        case 'butt': break;
        case 'mortise-tenon':
          for (const t of bounds(r.tenonLength)) runs.push({ label: `${at} ${t}`, choices: [{ site: s.id, joint: kind, tenonLength: t }] });
          break;
        case 'dado':
          for (const depth of bounds(r.dadoDepth)) runs.push({ label: `${at} ${depth}`, choices: [{ site: s.id, joint: kind, depth }] });
          break;
        case 'stopped-dado':
          for (const e of s.stopEnds) for (const depth of bounds(r.dadoDepth)) for (const inset of bounds(r.inset(e))) {
            runs.push({ label: `${at} stopped ${e.end} ${e.axis} ${depth} ${inset}`, choices: [{ site: s.id, joint: kind, depth, stopAt: e, inset }] });
          }
          break;
        case 'half-lap': {
          runs.push({ label: at, choices: [{ site: s.id, joint: kind }] });
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

describe('the bands oracle: no joint takes wood from an edge band (joinery features spec §7, chunk 3)', () => {
  const results: { label: string; variant: string; input: FlatDocument; sites: Site[]; ruledOut: RuledOut[]; defaults: JointChoice[]; runs: Run[] }[] = [];
  const seen: Seen = { cutsJudged: 0, sideCutsJudged: 0, trims: 0, dadoHousedSolid: 0, dadoHousedTape: 0, tenonExempt: 0, tenonAtShoulder: 0, runsChecked: 0, shortLo: 0, shortHi: 0 };
  const found: string[] = [];
  beforeAll(() => {
    for (const { label: fixture, make } of FIXTURES) for (const { name, layout } of VARIANTS) {
      const label = `${fixture} [${name}]`;
      const input = banded(make(), layout);
      const all = findSites(input);
      const { sites, ruledOut } = featureAllowed(input, all);
      const leftButt = (s: Site) => s.allowed.length === 1 && s.allowed[0] === 'butt';
      const defaults = sites.map((s) => defaultChoice(s, input, sites));
      const asRun = sites.map((s, i) => (leftButt(s) ? { site: s.id, joint: 'butt' as const } : defaults[i]!));
      const runs: Run[] = [{ label: `${label} / defaults`, choices: asRun, out: applyJoints(input, sites, asRun) }];
      for (const r of perKindRuns(input, sites)) runs.push({ label: `${label} / ${r.label}`, choices: r.choices, out: applyJoints(input, sites, r.choices) });
      results.push({ label, variant: name, input, sites, ruledOut, defaults, runs });
      for (const run of runs) found.push(...breaches(input, sites, run, seen));
    }
  }, 120_000);

  it('every band\'s type resolves, and the bands survive the loader on every fixture (so a lost one is joinery\'s)', () => {
    const bad: string[] = [];
    for (const { label, input } of results) {
      for (const b of input.boards) for (const band of b.bands) if (!input.bandTypes.some((t) => t.id === band.type)) bad.push(`${label} / ${b.name}: ${band.type}`);
      const loaded = flatDocument(migrateDocument(input));
      expect(loaded.boards.map((b) => [b.bands, b.cornerRule]), label).toEqual(input.boards.map((b) => [b.bands, b.cornerRule]));
    }
    expect(bad).toEqual([]);
  });

  it('defaultChoice picks only a kind the narrowed site still allows (spec §3.5)', () => {
    const bad: string[] = [];
    for (const { label, sites, defaults } of results) {
      sites.forEach((s, i) => { if (!s.allowed.includes(defaults[i]!.joint)) bad.push(`${label} / site ${s.id}: ${defaults[i]!.joint} not in ${s.allowed.join(', ')}`); });
    }
    expect(bad).toEqual([]);
  });

  it('every run: no cut meets a strip, no banded end grown or trimmed, every band kept, tenoned strips run their plain length', () => {
    expect(found).toEqual([]);
  });

  it('is not vacuous: joints beside bands, kinds ruled out by a band, the P11 exemptions and P12 runs exercised', () => {
    const applied = results.flatMap((r) => r.runs.flatMap((run) => run.out.applied.filter((a) => a.joint !== 'butt').map((a) => a.joint as JointKind)));
    expect(new Set(applied)).toEqual(new Set(['mortise-tenon', 'dado', 'stopped-dado', 'rabbet', 'half-lap']));
    // Joints made with a banded part on either side, per kind.
    const besideBands = new Set(results.flatMap((r) => r.runs.flatMap((run) => run.out.applied.filter((a) => {
      const s = r.sites.find((x) => x.id === a.site)!;
      return a.joint !== 'butt' && (r.input.boards[s.enter]!.bands.length > 0 || r.input.boards[s.receive]!.bands.length > 0);
    }).map((a) => a.joint))));
    expect(besideBands).toEqual(new Set(['mortise-tenon', 'dado', 'stopped-dado', 'rabbet', 'half-lap']));
    expect(results.some((r) => r.ruledOut.some((o) => o.feature === 'edge band')), 'a kind ruled out by a band').toBe(true);
    expect(results.some((r) => r.ruledOut.some((o) => o.feature === 'edge band' && roleOf(r.input.boards[o.part]!) === 'side')), 'by a side panel\'s edging').toBe(true);
    expect(results.some((r) => r.variant === 'ends' && r.ruledOut.some((o) => o.feature === 'edge band')), 'by a band on an end').toBe(true);
    expect(seen.cutsJudged, 'cuts judged on banded parts').toBeGreaterThan(0);
    expect(seen.sideCutsJudged, 'cuts judged on an edged side panel').toBeGreaterThan(0);
    expect(seen.trims, 'trims of banded parts').toBeGreaterThanOrEqual(4);
    expect(seen.dadoHousedSolid, 'a dado housing a part with solid edging along it').toBeGreaterThan(0);
    expect(seen.dadoHousedTape, 'a dado housing a taped part').toBeGreaterThan(0);
    expect(seen.tenonExempt, 'a tenon grown beside a band clear of its section').toBeGreaterThan(0);
    expect(seen.tenonAtShoulder, 'a tenon beside a strip exactly at the shoulder (open)').toBeGreaterThan(0);
    expect(seen.runsChecked, 'tenoned edged rails\' visible runs').toBeGreaterThan(0);
    expect(seen.shortLo, 'a run shortened at its min end').toBeGreaterThan(0);
    expect(seen.shortHi, 'a run shortened at its max end').toBeGreaterThan(0);
    // F2: a stopped dado joined into a receiver whose band with a strip lies on the side facing the stop end (the groove
    // clears it: the cut assertion above judges every such run).
    const beside = results.flatMap((r) => r.runs.flatMap((run) => run.out.applied.filter((a) => {
      if (a.joint !== 'stopped-dado') return false;
      const s = r.sites.find((x) => x.id === a.site)!;
      const at = run.choices.find((c) => c.site === a.site)!.stopAt!;
      const R = r.input.boards[s.receive]!;
      const facing: ProfileSide = { across: axisDimensions(R)[at.axis] as ProfileSide['across'], from: endFacing(R, at.axis, at.end === 'min' ? -1 : 1) };
      return stripsOf(R, r.input.bandTypes).some((x) => x.region && x.band.side.across === facing.across && x.band.side.from === facing.from);
    }).map((a) => `${r.label} / ${run.label} / site ${a.site}`)));
    expect(beside.length, 'a stopped dado beside the receiver\'s edging').toBeGreaterThan(0);
  });
});
