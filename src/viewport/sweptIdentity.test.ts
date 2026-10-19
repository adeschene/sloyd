import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { partGeometry, sectionCaps, stockChecks } from '../document/document';
import { smoothJoins } from '../document/bodies';
import type { Board, Body } from '../document/document';
import { bodyMesh, holesMesh, partMesh } from './grainTiling';
import { geometryBoard, shapedPart } from '../document/profiles';
import { SWEPT_CASES } from '../document/meshCases';

/**
 * Chunk c1 (swept rebuild speed): the speed fixes change no observable output. For every swept fixture (and a few parts
 * that reach the same shared primitives — clip, ring, clipPolygon, minusCover — through angle cuts, holes and section caps)
 * the bodies (every face's normal and vertices as Float64 bytes, its tags as JSON in key order, the body's box), the edges
 * (Float64 bytes), the smooth joins, every body's mesh (positions, uvs, normals as Float32 bytes, groups), the holes' mesh
 * and a section cap are hashed. The pins were taken on master 7794999, before any fix. The bodies and caps slots never move; chunk c2 re-recorded the mesh slot
 * (stage 1, partMesh) and the edges slot (stage 3), each with its proof (partMesh.test.ts; sweepEdges.test.ts' fast == reference), as the PINNED comment records.
 *
 * Each fixture is hashed as built and at a length 1.000123× (the perf guard's kind of key: a fresh geometry, other floats).
 */
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
  if (shapedPart(geometryBoard(board))) {
    // Chunk c2 (stage 1): a shaped part draws ONE geometry (partMesh), hashed as drawn.
    const m = partMesh(board, g.bodies, g.holes);
    hm.update(f32(m.positions)); hm.update(f32(m.uvs)); hm.update(f32(m.normals)); hm.update(JSON.stringify(m.groups));
  } else {
    for (const body of g.bodies) {
      const m = bodyMesh(board, body, g.holes, g.bodies);
      hm.update(f32(m.positions)); hm.update(f32(m.uvs));
      if (m.normals) hm.update(f32(m.normals));
      hm.update(JSON.stringify(m.groups));
    }
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

// Taken at 7794999 (master, before chunk c1), `bodies:edges:mesh:caps`, as built and at 1.000123×. Chunk c2 stage 1: a shaped
// part's mesh slot re-recorded as partMesh (its per-body meshes re-laid by material; partMesh.test.ts proves the re-laying),
// every other slot unchanged. Chunk c2 stage 3: the edges slot re-recorded for every swept case (a covered face makes no
// candidate, so lines are created in another order; sweepEdges.test.ts proves the same runs and joins against the reference).
const PINNED: Record<string, [string, string]> = {
  "roundover E2E arched apron": ['be44d803b0e92a22:23babd213b5cbee7:e1a7dbd0b6b1c7f2:6ab1c7993f10a1b5', '18bfe93175f1a15f:9fdd4fa5fea3408f:3414e33ed6e57130:d51179e185effe95'],
  "roundover loop 2\" corners": ['e1be2a75a4d999b2:839e294fb33760bb:65d7d5f5b5261982:72cd59278404440e', 'd2cea88c2c9ec422:0e841946ff92281f:990c0155f228fcc9:911a37cc1f733317'],
  "roundover loop 1/2\" corners": ['3371e29d42274a8c:9b35e23a4c1e0706:39af33a900922ba5:4f23ebf12c743f6d', '365b0b014fd8f176:99f25f4a1d0f7cf6:1a1ddea44eb82410:eaf317194fa88332'],
  "thumbnail loop": ['fb413c86f2ff0a05:82a649ad65ca8e07:5f2c00fa17cfc363:0e61d8fc37fa1b43', 'd59e4a5fe9cd838b:dc0fecc927ef4b7c:c7263169a7b73192:a2cbda27777fa02f'],
  "bead loop": ['dd0782e7f15df49b:e628035d7dd92609:63468321b510482b:5d940c0ea82f15d5', '7363e2b6f8d53688:95705f687fef0205:7655f8c382ccedd8:59df758b9c68022a'],
  "cove loop": ['033fc1fc469fd39c:d45d0147f236f675:de69f3f07dfdcc9a:7a26ba2da6695935', '7a11621eae39db86:eccce9dfef962477:5f9df46cd003af5f:6227b603658c30ad'],
  "cove loop + fillet": ['d6ec3931aa24af12:4eedad1d10623214:34f6c4ce33360937:545b8dc43a9dbc97', '86ced6fe37b2f7af:0d0b8adcd93f1850:99f3516c1a8607af:0edf5dae453032d4'],
  "ogee loop": ['6622779bcd443fb4:82b06285a773acce:bdeb7524b209ca1a:481ac7dcaa9faff2', '004c4ecbf29b2346:0711ae79583b3307:48d2c7c03ef557c9:a98d2713f8d676d6'],
  "ogee loop facing the edge": ['ada490499c241e5e:11683ddc39eceb8a:f84d70ef92a80c94:1e0df3b3ead49481', 'c1d8a784efbd7bb3:a565e6b8a86222f4:c27bd482e1fc64a1:41b14f817d7260c9'],
  "roundover notch": ['a03ec578742ac5c6:dbdfa84e3a1e38b8:4f1cd2248ce5c13e:624c140b17c70dac', '81fd51caf72739c1:aa000fff7bac3188:500a9453cfe15f91:54c2681c491ffe31'],
  "roundover E2E front (B1)": ['ecb68603c37d5fcb:8dcde93f3d31e4c7:f7ee5247f8c50fe3:48b840ba2c7a2134', '73b37f6b1d65a119:2703ffc55c9cda12:fa974ddef5298ec4:1755d177b6004af1'],
  "cove E2E front (B1)": ['699737a07567b2f6:0024c960db89c911:da95a9281c3bdb4d:c34f7653fc9830a7', '8da770858e14ca14:feafe078c7ca071e:076367d63a7d1dee:64c92a61baf55ee1'],
  "loop + hinge cup": ['e1be2a75a4d999b2:839e294fb33760bb:7d975bb0f03fdedb:a4925ddda71d0a2b', 'd2cea88c2c9ec422:0e841946ff92281f:1a6d0d4518922e73:f1509ed3b88a6cea'],
  "two loops": ['73e56b3a9d53ce1a:bcba6689dd556856:acccd690375ad0dd:b7351bb22426069b', 'f65ee77340121a69:bb15b60134dc6b00:2f5070d7d2cb8cbf:194e8db2b12cac4c'],
  "loop over a dado and a chamfer": ['6e1bcd74b9f58581:5bae7eab1d9902ef:bff79cda78f25c79:08290bd35c7d5fcf', '9f81df1b07b7b0dd:7b1c0ddb9cae9d44:70e732e6a38d3ba0:2d850278144fe575'],
  "plain loop": ['b580b379278f5dc1:211a56c20c1075f4:f0431e245c56c784:08e1780024888be6', 'da902bbeeaf5c542:a96e6dd3bda29a00:59701a89326e85e5:c55122369f218fc3'],
  "stopOnCorner": ['63489ccc0ebf2242:7df2d92d02c0c522:4479f4f2d877f46c:14210a70804155d6', '97c2c6187590bac6:c62ea73f8940823b:f6967f1de60aec7e:1e23608c38997634'],
  "stopOnCorner cove": ['f1a71e8bf7c13a2a:afae55236e35dc60:98ec4c19fb895321:2531dd73b21108f5', '8f881ccb208506e9:840042c27b670afa:137538b30878b993:ca62e0042f2f873a'],
  "stopOnArch": ['3c4765bdbdba2d79:af5a7f17500286ab:d6c492df678567a1:02ca893b751894b4', '8acef57f158c57e1:945e7b97b1bb6382:30a13b7e8fa463ff:34192c7422881c4b'],
  "stopOnNotch": ['7f156f1444676cef:3e4893afa06a81cb:014a3dc22172bd59:10e26b1191384e2f', '40a93654b9917245:636010054fb25be5:82e6de0be62cbcf8:f2c0b255c871eb6f'],
  "bowFront": ['982d0503279d0aaa:bcdc9e46eabe2dcb:ea1a8f79319227db:e2e3a78a22eb4b63', '77196fdbcdea3476:1fb7faa7294953e7:e7712a51b3dd7215:01b3b4e354f1983c'],
  "frontAndEnds": ['2e13454cafce27cf:1c9dc2fcff35cafb:cf67fdffafebfbe9:2f14c38df2f3c705', '90b3fc2831763d25:4424b939f6194f4c:4fc6942d583dc89c:c8638f04a85e11e1'],
  "frontAndEnds cove": ['2904660925264a66:c287e2757d799890:b8799a9d6463993d:cd1f400a857a6d09', '6cb63f00d6422357:a2133eb171346619:605fb1a90769ad60:f7f3fc9e4e5822af'],
  "twoSideSharp": ['fbfb1a3e6869ad3a:1015dbe214a4b22e:79c18677e6c14d0c:517d6abd29202e59', '6a7179eb5574df2d:0cdb10172f542eb6:e2dc3c06665ea08e:a7a4b84c79a80861'],
  "zoneStop": ['0e8f97d4aed7ecde:1203c066f09f82f6:b529881c3a45bd5b:213b01f976b8bbf5', '9261439bfbdd136b:57a390fc3c1dee4a:667e7816738de8d1:aaaf701f044425a2'],
  "wrapThree": ['cca450e32bd3005f:b9c55b74a82b0259:423aa6adac8040b3:ab726d82aefa7c09', '6d35e88bc6c439b4:4f2035c05a5823f6:cce734dea3436ec2:d8b36c427ec2a06e'],
  "wrapFour": ['b77481d72daa4522:eeb32803dbfecc49:cf53caa87800c02b:9b786ebacc55a949', 'b4bb266ea573a2ea:c9a04c4aa47439b0:2538ac5b173b5fc1:c06522ed29a20993'],
  "stationRightToBack": ['662e4593cb3c1bbe:8cde2babf4c7371d:c6c1749f96bd6d40:4563270bf6a22013', '11c77f9f7c88ac90:29caf2f338baae41:ff40549f7f79a900:74078e4079dedcc7'],
  "stationFrontToBack": ['84ca2ffb06918f9c:10f1829dc856b212:f1bd6a6eaf3609ea:16454edfd6be0ef0', '2928fdfe16cf45e3:19d52daf581e065a:4ad451f950915526:594eae37d9d647e5'],
  "stationFrontToRight": ['0e4773970bea7fca:f4fa0e9a84437ba3:37c103fe9e1c3332:98a337cffbb81947', '33e0ac898ca7961d:f7c3d436ac97e00a:d76646a625da8f49:857364b879403006'],
  "shortEnds": ['6a6b4e1ad1ddc914:9d573c00c974ab3d:767538c6a29336de:f8b9ceee2d9ba81f', 'd1cf0393bf6026ad:ef25279c928601e4:236e59c842eedb18:e4f606cf52089640'],
  "chiralTwoSide flat": ['9fb186f77c952be2:f50925584c48d8fa:9a0a7ed4009970be:79343bd81ef5a8da', 'a3582684d21e2400:1d020ae853858f34:41fea01b3a0aef19:5bb0b7b3235b17cb'],
  "chiralTwoSide flat mirrored": ['2adf8fd6cd00029f:690623b006f1c854:55583108d21dfb8f:2c490605926e9c5b', 'fd30f04a77c1824a:dbdcdfbf05ae0cea:ac037aa2be5924fe:15d1123f29089af2'],
  "chiralTwoSide upright": ['9fb186f77c952be2:f50925584c48d8fa:e74381723182f841:296a7b9df0c2e8e5', 'a3582684d21e2400:1d020ae853858f34:0754e21a1dd76d51:e00a60fcf4f93065'],
  "chiralTwoSide on-edge": ['9fb186f77c952be2:f50925584c48d8fa:88ec9d5dc7299793:b25563201aae55e2', 'a3582684d21e2400:1d020ae853858f34:8457b842f6ea12ed:5117d9f13f61489b'],
  "ogee loop upright, turned": ['6622779bcd443fb4:82b06285a773acce:6f57c971372e9a44:15fe443c2ac2caf6', '004c4ecbf29b2346:0711ae79583b3307:c45b128430cf2265:e23ecf1cd27b68ab'],
  "stopOnArch + bore": ['3c4765bdbdba2d79:af5a7f17500286ab:515a3d6d2742605f:acde4daf79d808af', '8acef57f158c57e1:945e7b97b1bb6382:c4a6cfb882da0a26:152ca35a298e747e'],
  "cornerGap 0.1 0.1": ['bda0c68e9e459ea4:61017bfcf16d29a9:d239d591147d5133:5df3460c88bdb312', 'f28c6711cc846ab2:fcb4ee411d9566b2:748b7e711a8587a1:60cac77171869eea'],
  "cornerGap 0.05 0.3": ['2c65af679de9e810:41a891a3e8bea62c:9f3dd777ad966f3f:9795f28174a56a77', '0916859cdbee0e14:1d1630caca312366:055d12aa739ca65e:8e2a8fac9133ba93'],
  "overlap: roundover 1/4, stops 0.1\" and 0.1\" from the corner": ['bda0c68e9e459ea4:61017bfcf16d29a9:d239d591147d5133:5df3460c88bdb312', 'f28c6711cc846ab2:fcb4ee411d9566b2:748b7e711a8587a1:60cac77171869eea'],
  "overlap: roundover 1/4, stops 0.2\" and 0.05\" from the corner": ['3561bc6d292d1178:b697ef0f4d6b3cfe:21057deb0fb5b4a5:4db7dea8b7dc8db0', '1896baeb8277d119:cc986662a65c8330:775c02fbe82e6e36:214bf738f05f1a6e'],
  "overlap: cove 3/8 + 1/16 fillet, stops 0.1\" and 0.1\" from the corner": ['0acf1e60460c0c17:d78ea2ce9d9d581d:13ea8d4fc87d3c2e:280835496b6d5533', '06b55d77d3e8ea94:e0fb1f5c53f8146a:0f289ecc68fcd7c7:17cf1f55c53c028d'],
  "overlap: cove 3/8 + 1/16 fillet, stops 0.2\" and 0.05\" from the corner": ['c18a43607efb3c7e:3e1c5cd4a1b860a3:45c5242d21c3ae7a:b2ae241d26334d70', 'b3ba96d00c2d62b9:6519fef72df659a9:ba261a399a559efa:f7c7e1048c442266'],
  "overlap: ogee 3/8, stops 0.1\" and 0.1\" from the corner": ['b4e4fd082dce50a0:31e50e8bfa46a69d:e1bab381f1a9a7cb:5c3bdf44bb4d0cd6', '56cd1ca24734c72c:49ba354438683734:b255eff61400cc92:91c33e9eede97797'],
  "overlap: ogee 3/8, stops 0.2\" and 0.05\" from the corner": ['7d5a3b1aac044b94:9043044566a093b1:c6fc46ddde8a01ac:bb4fbf566a2c6584', 'd985a6e7ceb98065:47b653ef155d785e:2a037db0903a2629:6cd9043c711ec9af'],
  "overlap: ogee 3/8 facing the edge, stops 0.1\" and 0.1\" from the corner": ['f441e009ab0b9424:b1ac0f65ef09a719:01e2b725ccbf3776:2f77ee1b2e5fc3c2', 'a668fbdafcf454f5:17e78821274a01cd:c3f06852740a3a5f:081366106e4c7636'],
  "overlap: ogee 3/8 facing the edge, stops 0.2\" and 0.05\" from the corner": ['b8a4796afdcf00d3:876d0b6cf86088db:f9c23470590e3b75:e1c133a2f62ba8f2', 'c847277124d25191:1ed50173214dbc5a:1f37a85a90afc4fd:bc9583f11afb4077'],
  "overlap: bead 1/4 + 1/16 quirk, stops 0.1\" and 0.1\" from the corner": ['5dc9c8f630d2c317:bf3435ab3f6bee26:f0cbbce004b8ae5e:be35b23f7fed88c0', '11fbb1108b08d44f:3c50db8b0fe4f83b:7f59194e21360ed6:d3dc0a69de7892b1'],
  "overlap: bead 1/4 + 1/16 quirk, stops 0.2\" and 0.05\" from the corner": ['d2cbc585240a5923:9d5bdb13ea7212c6:8afd59ca6ab00dc6:2bbb9908df2c257c', '8973568454a9bed6:3d0668aa8d0e85e1:1d873c932a8e9bc3:8ca18d153c699873'],
  "overlap: thumbnail 3/4 × 1/4, stops 0.1\" and 0.1\" from the corner": ['e62842ef8411a9c4:90403cad95c99a63:2cfead5d1ab94cc0:f5c95a583161fc46', '22f1665d9aec8b4d:7c3edebe1c436659:a3345382d9efb19d:bbbf4843dd0803a1'],
  "overlap: thumbnail 3/4 × 1/4, stops 0.2\" and 0.05\" from the corner": ['db10053af2011b4a:588faa990a7917c2:27146a7df6430fba:479443f81d825398', 'c1965edf10c51e51:0f4c11a7df7bf980:a7bcd7a8ab1f1f79:d85834043ca2487b'],
  "overlap: ogee 3/8 facing the edge, mirrored along its length (mirrorPart)": ['afa5659ad22532e0:9ae900f1ebddf0ea:75437ea2c25f643c:d5db1646801b0ec1', '5a12fa7e5cb6bf8d:599316cfa25c9802:d8fce62e96624916:d7ab23b987ab65b9'],
  "overlap: bead 1/4 + 1/16 quirk on face min": ['dbac3751b1a6404c:1a2b8b10539dbeeb:27e327efee4a6747:61a590d45233664c', '190dd5e74aa1b043:567383fa6fc4a8c6:0400c0b40d196272:830a824107324e11'],
  "angled (taper, chamfer, dado; no curves)": ['8cdab7b19d2ad8c4:c9053a4ff47d10e1:afe9cf4c51d20d62:c68338784aabe700', '2d5421164cad73a1:ea3034915f784b47:2a7e3bf49c4c35ee:a7c7e23d3706a9dd'],
};

describe('swept parts build byte-for-byte what they built before chunk c1', () => {
  it.each(SWEPT_CASES)('%s', (name, board) => {
    const got: [string, string] = [identity(board), identity(at(board, 1.000123))];
    if (process.env.SLOYD_PIN_LOG) appendFileSync(process.env.SLOYD_PIN_LOG, `  ${JSON.stringify(name)}: ['${got[0]}', '${got[1]}'],\n`);
    expect(partGeometry(board).bodies.length, name).toBeGreaterThan(0);
    expect(got).toEqual(PINNED[name]);
  });
});
