/**
 * TEST-ONLY (chunk c2): the swept fixtures chunk c1's identity pins hash (`viewport/sweptIdentity.test.ts`), shared by c2's
 * mesh and edge tests. Moved verbatim from sweptIdentity.test.ts. Never import a test module for these: it re-registers its
 * suite.
 */
import { archCurve, createBoard, defaultArch, defaultBow, defaultHingeCup, defaultNotch, defaultProfile, defaultShelfPinRow, PROFILE_EDGES, taperCut } from './document';
import type { Board, CurveCut, HoleRow } from './document';
import { chamferCut } from './angleCuts';
import { defaultHole } from './holes';
import { mirrorPart } from './frames';
import { apronArch, bowFront, chiralTwoSide, cornerGap, endToEnd, frontAndEnds, frontOnly, loop, notchEdge, overlapCases, plainLoop,
  shortEnds, stationFrontToBack, stationFrontToRight, stationRightToBack, stopOnArch, stopOnCorner, stopOnNotch, topCorners, twoSideSharp,
  wrapFour, wrapThree, zoneStop } from './sweepFixtures';

const side = (across: 'length' | 'width', from: 'min' | 'max') => ({ across, from });
const sweptTop = topCorners(2);
const cupClear: HoleRow = { id: 'cup', ...defaultHingeCup(createBoard({ length: 36, width: 20, thickness: 0.75 })), station: 10, inset: 2 };
const archHole: HoleRow = { id: 'h', ...defaultHole(stopOnArch), station: 21, inset: 1.75 };
const dadoChamfer: Board = { ...sweptTop,
  cuts: [{ id: 'd', face: 'thickness', from: 'max', across: 'width', offset: 17.625, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 }],
  angleCuts: [{ id: 'ch', ...chamferCut({ face: 'width', from: 'min', along: 'thickness', alongFrom: 'min', legFace: 0.25, legAlong: 0.25 }, sweptTop) }] };
const angled = createBoard({ length: 30, width: 4, thickness: 1.5,
  cuts: [{ id: 'd', face: 'thickness', from: 'max', across: 'width', offset: 10, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 }],
  angleCuts: [
    { id: 't', ...taperCut({ face: 'width', from: 'min', end: 'min', start: 22, amount: 1 }) },
    { id: 'c', ...chamferCut({ face: 'width', from: 'max', along: 'thickness', alongFrom: 'max', legFace: 0.25, legAlong: 0.25 }, { length: 30, width: 4, thickness: 1.5 }) },
  ] });

export const SWEPT_CASES: [string, Board][] = [
  ['roundover E2E arched apron', apronArch],
  ['roundover loop 2" corners', sweptTop],
  ['roundover loop 1/2" corners', topCorners(0.5)],
  ['thumbnail loop', topCorners(2, loop('p1', 0.75, 'thumbnail'))],
  ['bead loop', topCorners(2, loop('p1', 0.25, 'bead'))],
  ['cove loop', topCorners(2, loop('p1', 0.375, 'cove'))],
  ['cove loop + fillet', topCorners(2, { ...loop('p1', 0.375, 'cove'), fillet: 1 / 16 })],
  ['ogee loop', topCorners(2, loop('p1', 0.375, 'ogee'))],
  ['ogee loop facing the edge', topCorners(2, { ...loop('p1', 0.375, 'ogee'), facing: 'edge' })],
  ['roundover notch', notchEdge],
  ['roundover E2E front (B1)', frontOnly],
  ['cove E2E front (B1)', topCorners(2, endToEnd('p1', side('width', 'min'), 0.375, 'cove'))],
  ['loop + hinge cup', { ...sweptTop, holes: [cupClear] }],
  ['two loops', { ...sweptTop, profiles: [loop('t'), loop('m', 0.25, 'roundover', 'min')] }],
  ['loop over a dado and a chamfer', dadoChamfer],
  ['plain loop', plainLoop],
  ['stopOnCorner', stopOnCorner()],
  ['stopOnCorner cove', stopOnCorner('cove', 0.375)],
  ['stopOnArch', stopOnArch],
  ['stopOnNotch', stopOnNotch],
  ['bowFront', bowFront],
  ['frontAndEnds', frontAndEnds()],
  ['frontAndEnds cove', frontAndEnds('cove', 0.375)],
  ['twoSideSharp', twoSideSharp],
  ['zoneStop', zoneStop()],
  ['wrapThree', wrapThree()],
  ['wrapFour', wrapFour()],
  ['stationRightToBack', stationRightToBack()],
  ['stationFrontToBack', stationFrontToBack()],
  ['stationFrontToRight', stationFrontToRight()],
  ['shortEnds', shortEnds()],
  ['chiralTwoSide flat', chiralTwoSide('flat')],
  ['chiralTwoSide flat mirrored', mirrorPart(chiralTwoSide('flat'))],
  ['chiralTwoSide upright', chiralTwoSide('upright')],
  ['chiralTwoSide on-edge', chiralTwoSide('on-edge')],
  ['ogee loop upright, turned', { ...topCorners(2, loop('p1', 0.375, 'ogee')), posture: 'upright', rotation: 90 }],
  ['stopOnArch + bore', { ...stopOnArch, holes: [archHole] }],
  ['cornerGap 0.1 0.1', cornerGap(0.1, 0.1)],
  ['cornerGap 0.05 0.3', cornerGap(0.05, 0.3)],
  ...overlapCases().map(({ name, board }): [string, Board] => [`overlap: ${name}`, board]),
  ['angled (taper, chamfer, dado; no curves)', angled],
];

/** Chunk c2: plain curved parts (no swept profile). Every one is a shapedPart, so partMesh and faceCover reach them too. */
const apron = { length: 30, width: 5, thickness: 0.75 };
const arch: CurveCut = { id: 'a', ...defaultArch(apron)! };
const notch: CurveCut = { id: 'n', ...defaultNotch(apron)! };
const bow: CurveCut = { id: 'b', ...defaultBow(apron) };
const notchL: CurveCut = {
  id: 'L', through: 'thickness', uFrom: 'min', vFrom: 'min', start: [10, 0],
  segments: [
    { type: 'line', to: [16, 0] }, { type: 'line', to: [16, 1] }, { type: 'line', to: [12, 1] }, { type: 'line', to: [12, 2.5] },
    { type: 'arc', to: [10, 2.5], side: 'right', rise: 0.5 }, { type: 'line', to: [10, 0] },
  ],
};
const archDado = { id: 'c1', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 28, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
const top = { length: 36, width: 20, thickness: 0.75 };
const fourEdge = (kind: 'roundover' | 'cove' | 'bead' | 'ogee') => createBoard({ ...top,
  curves: PROFILE_EDGES.filter((e) => e.vFrom === 'max').map((e, i): CurveCut => ({ id: `${kind}${i}`, ...defaultProfile(top, kind, e) })) });
const shelf = { length: 36, width: 10, thickness: 0.75 };
const bookSide = { length: 36, width: 11.25, thickness: 0.75 };
const sideArch: CurveCut = { id: 'a', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 4, span: 28, rise: 1 }) };
const pinRows = (b: Board): HoleRow[] => { const row = defaultShelfPinRow(b)!; return [{ id: 'f', ...row, inset: 2 }, { id: 'b', ...row, acrossFrom: 'max', inset: 2 }]; };
const stile = { length: 30, width: 5, thickness: 0.75 };
const stileArch: CurveCut = { id: 'a', ...archCurve({ through: 'thickness', along: 'length', side: 'max', from: 'min', start: 6, span: 18, rise: 1 }) };
export const CURVED_CASES: [string, Board][] = [
  ['the default Arch', createBoard({ ...apron, curves: [arch] })],
  ['the default Half-round notch', createBoard({ ...apron, curves: [notch] })],
  ['a Bow on a part lengthened past its span', createBoard({ ...apron, length: 36, curves: [bow] })],
  ['an L-shaped notch with one arc', createBoard({ ...apron, curves: [notchL] })],
  ['the Arch beside a dado', createBoard({ ...apron, curves: [arch], cuts: [archDado] })],
  ...(['roundover', 'cove', 'bead', 'ogee'] as const).map((k): [string, Board] => [`a top with the four-edge ${k} set`, fourEdge(k)]),
  ['a shelf with an ogee on a long edge and a bead on an end', createBoard({ ...shelf, curves: [
    { id: 'o', ...defaultProfile(shelf, 'ogee') }, { id: 'b', ...defaultProfile(shelf, 'bead', { through: 'width', uFrom: 'max', vFrom: 'max' }) }] })],
  ['an arched bookcase side with two shelf-pin rows', createBoard({ ...bookSide, curves: [sideArch], holes: pinRows(createBoard({ ...bookSide, curves: [sideArch] })) })],
  ['an arched stile with a 35 mm hinge cup', createBoard({ ...stile, curves: [stileArch],
    holes: [{ id: 'c', ...defaultHingeCup(createBoard({ ...stile, curves: [stileArch] })), station: 10 }] })],
];

/**
 * Counterbores Task 4 (spec §6.1): headed rows — a counterbore and a countersink, each blind and through, on a plain part
 * and on an arched apron (the default arch splits the broad face into strips, so a mouth straddles them), and a
 * counterbored row of 20. Every row legal and clean (no fault). Shared by curvesWatertight and the headed perf cases.
 */
const plainPart = { length: 20, width: 10, thickness: 1.5 };
const headedRow = (over: Partial<HoleRow>): HoleRow => ({ id: 'hd', face: 'thickness', from: 'max', diameter: 0.25, depth: 1, along: 'length',
  alongFrom: 'min', station: 5, count: 1, pitch: 0, acrossFrom: 'min', inset: 3, ...over });
const counterbore = (over: Partial<HoleRow> = {}) => headedRow({ head: 'counterbore', headDiameter: 0.5, headDepth: 0.25, ...over });
const countersink = (over: Partial<HoleRow> = {}) => headedRow({ head: 'countersink', headDiameter: 0.5, headAngle: 82, ...over });
// On the apron (3/4" thick): centred across its 5" width, clear of the arch's crown (1 1/4" up), at the arch's middle.
const onApron = { station: 15, inset: 2.5, depth: 0.5 } as const;
export const HEADED_CASES: [string, Board][] = [
  ['a blind counterbore in a plain part', createBoard({ ...plainPart, holes: [counterbore()] })],
  ['a through counterbore in a plain part', createBoard({ ...plainPart, holes: [counterbore({ depth: 'through', from: 'min' })] })],
  ['a blind countersink in a plain part', createBoard({ ...plainPart, holes: [countersink()] })],
  ['a through 90° countersink in a plain part', createBoard({ ...plainPart, holes: [countersink({ depth: 'through', headAngle: 90 })] })],
  ['a blind counterbore on an arched apron', createBoard({ ...apron, curves: [arch], holes: [counterbore(onApron)] })],
  ['a through counterbore on an arched apron', createBoard({ ...apron, curves: [arch], holes: [counterbore({ ...onApron, depth: 'through' })] })],
  ['a blind countersink on an arched apron', createBoard({ ...apron, curves: [arch], holes: [countersink(onApron)] })],
  ['a through countersink on an arched apron', createBoard({ ...apron, curves: [arch], holes: [countersink({ ...onApron, depth: 'through', from: 'min' })] })],
  ['a counterbored row of 20', createBoard({ ...plainPart, holes: [counterbore({ count: 20, pitch: 0.75, station: 2, depth: 'through' })] })],
];
