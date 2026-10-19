import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { createBoard, defaultHingeCup, partGeometry, sectionCaps, stockChecks, taperCut } from '../document/document';
import { smoothJoins } from '../document/bodies';
import type { Board, Body, HoleRow } from '../document/document';
import { chamferCut } from '../document/angleCuts';
import { defaultHole } from '../document/holes';
import { mirrorPart } from '../document/frames';
import { bodyMesh, holesMesh } from './grainTiling';
import { apronArch, bowFront, chiralTwoSide, cornerGap, endToEnd, frontAndEnds, frontOnly, loop, notchEdge, overlapCases, plainLoop,
  shortEnds, stationFrontToBack, stationFrontToRight, stationRightToBack, stopOnArch, stopOnCorner, stopOnNotch, topCorners, twoSideSharp,
  wrapFour, wrapThree, zoneStop } from '../document/sweepFixtures';

/**
 * Chunk c1 (swept rebuild speed): the speed fixes change no observable output. For every swept fixture (and a few parts
 * that reach the same shared primitives — clip, ring, clipPolygon, minusCover — through angle cuts, holes and section caps)
 * the bodies (every face's normal and vertices as Float64 bytes, its tags as JSON in key order, the body's box), the edges
 * (Float64 bytes), the smooth joins, every body's mesh (positions, uvs, normals as Float32 bytes, groups), the holes' mesh
 * and a section cap are hashed. The pins were taken on master 7794999, before any fix. They must not move.
 *
 * Each fixture is hashed as built and at a length 1.000123× (the perf guard's kind of key: a fresh geometry, other floats).
 */
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

const cases: [string, Board][] = [
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

const f64 = (xs: readonly number[]) => Buffer.from(Float64Array.from(xs).buffer);
const f32 = (a: Float32Array) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const hex = (h: ReturnType<typeof createHash>) => h.digest('hex').slice(0, 16);

function bodiesHash(bodies: readonly Body[]): string {
  const h = createHash('sha256');
  for (const b of bodies) {
    h.update(b.box ? `box:${JSON.stringify(Object.keys(b.box))}` : 'nobox');
    if (b.box) h.update(f64([...b.box.length, ...b.box.width, ...b.box.thickness]));
    h.update(`faces:${b.faces.length}`);
    for (const f of b.faces) {
      h.update(f64(f.n));
      h.update(`v${f.verts.length}`);
      h.update(f64(f.verts.flat()));
      h.update(JSON.stringify(Object.entries(f).filter(([k]) => k !== 'n' && k !== 'verts')));
    }
  }
  return hex(h);
}

function identity(made: Board): string {
  // A fixed id: the UV offset is hashed from it.
  const board = { ...made, id: 'pin' };
  const g = partGeometry(board);
  const hb = bodiesHash(g.bodies);
  const he = createHash('sha256');
  he.update(f64(g.edges.flatMap(([a, c]) => [a.length, a.width, a.thickness, c.length, c.width, c.thickness])));
  for (const j of smoothJoins(board)) he.update(f64([...j.a, ...j.b, g.bodies.findIndex((b) => b.faces.includes(j.f1)), g.bodies.findIndex((b) => b.faces.includes(j.f2))]));
  const hm = createHash('sha256');
  for (const body of g.bodies) {
    const m = bodyMesh(board, body, g.holes, g.bodies);
    hm.update(f32(m.positions)); hm.update(f32(m.uvs));
    if (m.normals) hm.update(f32(m.normals));
    hm.update(JSON.stringify(m.groups));
  }
  if (g.holes.length > 0) {
    const hs = holesMesh(board, g.holes, g.bodies, stockChecks(board));
    hm.update('holes');
    if (hs) { hm.update(f32(hs.positions)); hm.update(f32(hs.normals)); hm.update(f32(hs.uvs)); hm.update(JSON.stringify(hs.groups)); }
  }
  const hc = createHash('sha256');
  for (const [axis, at] of [['top', 0.6], ['front', 7.3]] as const) {
    const c = sectionCaps(board, { axis, at, flip: false });
    hc.update(c ? 'cap' : 'none');
    if (c) { for (const p of c.pieces) hc.update(f64(p.flat())); hc.update(f64(c.outline.flat(2))); }
  }
  return `${hb}:${hex(he)}:${hex(hm)}:${hex(hc)}`;
}

const at = (b: Board, k: number): Board => ({ ...b, length: b.length * k });

// Taken at 7794999 (master, before chunk c1), `bodies:edges:mesh:caps`, as built and at 1.000123×.
const PINNED: Record<string, [string, string]> = {
  "roundover E2E arched apron": ['be44d803b0e92a22:23babd213b5cbee7:f1ad7387b5e3b563:6ab1c7993f10a1b5', '18bfe93175f1a15f:9fdd4fa5fea3408f:cd2b0c461bf3ad1e:d51179e185effe95'],
  "roundover loop 2\" corners": ['e1be2a75a4d999b2:839e294fb33760bb:f0ab375323af5979:72cd59278404440e', 'd2cea88c2c9ec422:0e841946ff92281f:e8e22ae21944e29c:911a37cc1f733317'],
  "roundover loop 1/2\" corners": ['3371e29d42274a8c:9b35e23a4c1e0706:93f09017cac42287:4f23ebf12c743f6d', '365b0b014fd8f176:99f25f4a1d0f7cf6:994ce758b749b7d3:eaf317194fa88332'],
  "thumbnail loop": ['fb413c86f2ff0a05:82a649ad65ca8e07:16b42e4bfc3924e9:0e61d8fc37fa1b43', 'd59e4a5fe9cd838b:dc0fecc927ef4b7c:6abcfad039cfae23:a2cbda27777fa02f'],
  "bead loop": ['dd0782e7f15df49b:e628035d7dd92609:b08e191368f6835d:5d940c0ea82f15d5', '7363e2b6f8d53688:95705f687fef0205:0e2478c422db62dd:59df758b9c68022a'],
  "cove loop": ['033fc1fc469fd39c:37119f93bb6fa00d:6ab61bde9ace94e6:7a26ba2da6695935', '7a11621eae39db86:529a332c9ef4adcc:38cacd1c5b1bf638:6227b603658c30ad'],
  "cove loop + fillet": ['d6ec3931aa24af12:2a47b11ddaaee920:d1456656f0cd2bc6:545b8dc43a9dbc97', '86ced6fe37b2f7af:5e03a1bd2400a357:eb3f83ec228e788d:0edf5dae453032d4'],
  "ogee loop": ['6622779bcd443fb4:2f370a6568f7f863:0544dc0619e5fa3f:481ac7dcaa9faff2', '004c4ecbf29b2346:194fbe9945f2612f:4a3851d488a83c6e:a98d2713f8d676d6'],
  "ogee loop facing the edge": ['ada490499c241e5e:6fb43997e04f7426:5b61152adfda88d1:1e0df3b3ead49481', 'c1d8a784efbd7bb3:0968e39d054a616d:dc6392166f866440:41b14f817d7260c9'],
  "roundover notch": ['a03ec578742ac5c6:dbdfa84e3a1e38b8:564b06599f3382ff:624c140b17c70dac', '81fd51caf72739c1:aa000fff7bac3188:47c1902bfe87a2b8:54c2681c491ffe31'],
  "roundover E2E front (B1)": ['ecb68603c37d5fcb:351cb5c795b11c4e:da4357d3455f2369:48b840ba2c7a2134', '73b37f6b1d65a119:77d23a2075444afa:743a61923544043a:1755d177b6004af1'],
  "cove E2E front (B1)": ['699737a07567b2f6:88902700e1864d82:3bfe83958d160fab:c34f7653fc9830a7', '8da770858e14ca14:8f4774b28c86bf61:372670e2519e81c3:64c92a61baf55ee1'],
  "loop + hinge cup": ['e1be2a75a4d999b2:839e294fb33760bb:eaf158e546ecfe13:a4925ddda71d0a2b', 'd2cea88c2c9ec422:0e841946ff92281f:c54a661337bc449d:f1509ed3b88a6cea'],
  "two loops": ['73e56b3a9d53ce1a:bcba6689dd556856:3fe9fce676725349:b7351bb22426069b', 'f65ee77340121a69:bb15b60134dc6b00:2cadef4300bb527d:194e8db2b12cac4c'],
  "loop over a dado and a chamfer": ['6e1bcd74b9f58581:5bae7eab1d9902ef:d5c64ad89cb0e580:08290bd35c7d5fcf', '9f81df1b07b7b0dd:7b1c0ddb9cae9d44:c31a095d8c3a6020:2d850278144fe575'],
  "plain loop": ['b580b379278f5dc1:211a56c20c1075f4:f30082a454eef13b:08e1780024888be6', 'da902bbeeaf5c542:a96e6dd3bda29a00:db1a1ec8be9e36a3:c55122369f218fc3'],
  "stopOnCorner": ['63489ccc0ebf2242:7df2d92d02c0c522:a0f001cb5d78800c:14210a70804155d6', '97c2c6187590bac6:c62ea73f8940823b:a59da66a58b035f0:1e23608c38997634'],
  "stopOnCorner cove": ['f1a71e8bf7c13a2a:33630f4a7b315c3f:e54fa7041ec3fd35:2531dd73b21108f5', '8f881ccb208506e9:6970d3fb731168bc:4e3c0ff1d2c59bb5:ca62e0042f2f873a'],
  "stopOnArch": ['3c4765bdbdba2d79:af5a7f17500286ab:a4de190d32d2ecaf:02ca893b751894b4', '8acef57f158c57e1:945e7b97b1bb6382:4c03a70784ab4063:34192c7422881c4b'],
  "stopOnNotch": ['7f156f1444676cef:3e4893afa06a81cb:a78834bce31fca6f:10e26b1191384e2f', '40a93654b9917245:636010054fb25be5:af673b39c98b38fc:f2c0b255c871eb6f'],
  "bowFront": ['982d0503279d0aaa:bcdc9e46eabe2dcb:bb46a488b0b50266:e2e3a78a22eb4b63', '77196fdbcdea3476:1fb7faa7294953e7:2bafe9a1260dc418:01b3b4e354f1983c'],
  "frontAndEnds": ['2e13454cafce27cf:1c9dc2fcff35cafb:f20085da9cea00ce:2f14c38df2f3c705', '90b3fc2831763d25:4424b939f6194f4c:2ceba9331728a439:c8638f04a85e11e1'],
  "frontAndEnds cove": ['2904660925264a66:26d4637cef02f84b:5230460bce675741:cd1f400a857a6d09', '6cb63f00d6422357:bfbf7859329d45f1:17816f636908eeb9:f7f3fc9e4e5822af'],
  "twoSideSharp": ['fbfb1a3e6869ad3a:1015dbe214a4b22e:bc3a4742ceaba52f:517d6abd29202e59', '6a7179eb5574df2d:0cdb10172f542eb6:aafb810699fe7535:a7a4b84c79a80861'],
  "zoneStop": ['0e8f97d4aed7ecde:1203c066f09f82f6:8e21187406844931:213b01f976b8bbf5', '9261439bfbdd136b:57a390fc3c1dee4a:e2d156fcd0e20567:aaaf701f044425a2'],
  "wrapThree": ['cca450e32bd3005f:b9c55b74a82b0259:16d1192174f583ab:ab726d82aefa7c09', '6d35e88bc6c439b4:4f2035c05a5823f6:260cb8202a2da94c:d8b36c427ec2a06e'],
  "wrapFour": ['b77481d72daa4522:eeb32803dbfecc49:4e8964b344d40434:9b786ebacc55a949', 'b4bb266ea573a2ea:c9a04c4aa47439b0:5e423785e85097a9:c06522ed29a20993'],
  "stationRightToBack": ['662e4593cb3c1bbe:8cde2babf4c7371d:7c4ab969d98b1637:4563270bf6a22013', '11c77f9f7c88ac90:29caf2f338baae41:f37b00d2e46aea74:74078e4079dedcc7'],
  "stationFrontToBack": ['84ca2ffb06918f9c:d5ccf3c33c44df06:e3bc66251bede76d:16454edfd6be0ef0', '2928fdfe16cf45e3:7b594c2c6a31b26b:a4ac4425c5e11e4c:594eae37d9d647e5'],
  "stationFrontToRight": ['0e4773970bea7fca:f4fa0e9a84437ba3:1a713431b72b930d:98a337cffbb81947', '33e0ac898ca7961d:f7c3d436ac97e00a:966b2be972934269:857364b879403006'],
  "shortEnds": ['6a6b4e1ad1ddc914:3329f78db2a997d9:dbf763fdb1153610:f8b9ceee2d9ba81f', 'd1cf0393bf6026ad:0af41693aafa5f9f:d1bf220b9cf34ca5:e4f606cf52089640'],
  "chiralTwoSide flat": ['9fb186f77c952be2:f50925584c48d8fa:8dd8aa0b3da6a881:79343bd81ef5a8da', 'a3582684d21e2400:1d020ae853858f34:3d8e1443ee19f79b:5bb0b7b3235b17cb'],
  "chiralTwoSide flat mirrored": ['2adf8fd6cd00029f:690623b006f1c854:f03b6815d614dd88:2c490605926e9c5b', 'fd30f04a77c1824a:e61b490a011bfadd:7b162e1c4d727a16:15d1123f29089af2'],
  "chiralTwoSide upright": ['9fb186f77c952be2:f50925584c48d8fa:1449ebcadfd4306b:296a7b9df0c2e8e5', 'a3582684d21e2400:1d020ae853858f34:b3f429a86cc88b5f:e00a60fcf4f93065'],
  "chiralTwoSide on-edge": ['9fb186f77c952be2:f50925584c48d8fa:6863c3bb55d08b05:b25563201aae55e2', 'a3582684d21e2400:1d020ae853858f34:e52c8733201e79b1:5117d9f13f61489b'],
  "ogee loop upright, turned": ['6622779bcd443fb4:2f370a6568f7f863:bc835cbd1616c60d:15fe443c2ac2caf6', '004c4ecbf29b2346:194fbe9945f2612f:745607c2dc8da6fe:e23ecf1cd27b68ab'],
  "stopOnArch + bore": ['3c4765bdbdba2d79:af5a7f17500286ab:b9cfe0788de2467a:acde4daf79d808af', '8acef57f158c57e1:945e7b97b1bb6382:f18a754a90466b3d:152ca35a298e747e'],
  "cornerGap 0.1 0.1": ['bda0c68e9e459ea4:d4948508723cbe2a:e765461141d40338:5df3460c88bdb312', 'f28c6711cc846ab2:578d825f357222ba:bed7ffd7533a6448:60cac77171869eea'],
  "cornerGap 0.05 0.3": ['2c65af679de9e810:41a891a3e8bea62c:32c91b6d7f5f2f1b:9795f28174a56a77', '0916859cdbee0e14:1d1630caca312366:c235fb747ad4b40d:8e2a8fac9133ba93'],
  "overlap: roundover 1/4, stops 0.1\" and 0.1\" from the corner": ['bda0c68e9e459ea4:d4948508723cbe2a:e765461141d40338:5df3460c88bdb312', 'f28c6711cc846ab2:578d825f357222ba:bed7ffd7533a6448:60cac77171869eea'],
  "overlap: roundover 1/4, stops 0.2\" and 0.05\" from the corner": ['3561bc6d292d1178:b697ef0f4d6b3cfe:2fa5f358ff72f0ee:4db7dea8b7dc8db0', '1896baeb8277d119:922a1b3c03251e15:978177ef840e2623:214bf738f05f1a6e'],
  "overlap: cove 3/8 + 1/16 fillet, stops 0.1\" and 0.1\" from the corner": ['0acf1e60460c0c17:063e944b0f78626a:527f5d14cc6fa3ea:280835496b6d5533', '06b55d77d3e8ea94:c577b39e42e856ab:f842cd782247bfab:17cf1f55c53c028d'],
  "overlap: cove 3/8 + 1/16 fillet, stops 0.2\" and 0.05\" from the corner": ['c18a43607efb3c7e:c92efcfacea83302:5e612309b9cffe3d:b2ae241d26334d70', 'b3ba96d00c2d62b9:b46b8ea14f02f1e4:e6a5add14f9c3bd2:f7c7e1048c442266'],
  "overlap: ogee 3/8, stops 0.1\" and 0.1\" from the corner": ['b4e4fd082dce50a0:5ba393a0e89c8257:d52ff903321a11d5:5c3bdf44bb4d0cd6', '56cd1ca24734c72c:32e7f482e9333f52:fbc9cfce59b47656:91c33e9eede97797'],
  "overlap: ogee 3/8, stops 0.2\" and 0.05\" from the corner": ['7d5a3b1aac044b94:223ba4ec309fd9fd:7d13696d16e90dbc:bb4fbf566a2c6584', 'd985a6e7ceb98065:a55b393305ef19a6:6775b7bdbf4209b1:6cd9043c711ec9af'],
  "overlap: ogee 3/8 facing the edge, stops 0.1\" and 0.1\" from the corner": ['f441e009ab0b9424:c628c73557184c1b:6cafc1dabbc05d1c:2f77ee1b2e5fc3c2', 'a668fbdafcf454f5:8ea3543f22ed9912:b9ae4d8bbcab63b2:081366106e4c7636'],
  "overlap: ogee 3/8 facing the edge, stops 0.2\" and 0.05\" from the corner": ['b8a4796afdcf00d3:0b558e94e442b22a:88e274c956c1b1fb:e1c133a2f62ba8f2', 'c847277124d25191:689c0189c6f77691:e768a109776c29e1:bc9583f11afb4077'],
  "overlap: bead 1/4 + 1/16 quirk, stops 0.1\" and 0.1\" from the corner": ['5dc9c8f630d2c317:3aa6655449e7f055:06c8c3251cdcb205:be35b23f7fed88c0', '11fbb1108b08d44f:c97c9a693d91ab0f:9fc3db19ce2bee6b:d3dc0a69de7892b1'],
  "overlap: bead 1/4 + 1/16 quirk, stops 0.2\" and 0.05\" from the corner": ['d2cbc585240a5923:ccb2b50aa66141c3:05201d8a98873a94:2bbb9908df2c257c', '8973568454a9bed6:239404b73b941788:35d537eb65a6aeae:8ca18d153c699873'],
  "overlap: thumbnail 3/4 × 1/4, stops 0.1\" and 0.1\" from the corner": ['e62842ef8411a9c4:b9534461b23fae1e:16dd81ed654c4cdb:f5c95a583161fc46', '22f1665d9aec8b4d:7caeaf673e45e1c6:253830b914692fac:bbbf4843dd0803a1'],
  "overlap: thumbnail 3/4 × 1/4, stops 0.2\" and 0.05\" from the corner": ['db10053af2011b4a:588faa990a7917c2:161d7bda86330440:479443f81d825398', 'c1965edf10c51e51:fd4b685e291fa22b:bf069d62b3d5e486:d85834043ca2487b'],
  "overlap: ogee 3/8 facing the edge, mirrored along its length (mirrorPart)": ['afa5659ad22532e0:256bee7043210bb7:b23da7cdebe928f4:d5db1646801b0ec1', '5a12fa7e5cb6bf8d:32bd7714f1a1e483:1ffdfa44abe30ab7:d7ab23b987ab65b9'],
  "overlap: bead 1/4 + 1/16 quirk on face min": ['dbac3751b1a6404c:236981718015971e:a25013398869fb84:61a590d45233664c', '190dd5e74aa1b043:f2992c5e9326776a:d755c3a21cedd6b8:830a824107324e11'],
  "angled (taper, chamfer, dado; no curves)": ['8cdab7b19d2ad8c4:c9053a4ff47d10e1:afe9cf4c51d20d62:c68338784aabe700', '2d5421164cad73a1:ea3034915f784b47:2a7e3bf49c4c35ee:a7c7e23d3706a9dd'],
};

describe('swept parts build byte-for-byte what they built before chunk c1', () => {
  it.each(cases)('%s', (name, board) => {
    const got: [string, string] = [identity(board), identity(at(board, 1.000123))];
    if (process.env.SLOYD_PIN_LOG) appendFileSync(process.env.SLOYD_PIN_LOG, `  ${JSON.stringify(name)}: ['${got[0]}', '${got[1]}'],\n`);
    expect(partGeometry(board).bodies.length, name).toBeGreaterThan(0);
    expect(got).toEqual(PINNED[name]);
  });
});
