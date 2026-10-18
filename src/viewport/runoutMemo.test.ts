import { createHash } from 'node:crypto';
import { vi } from 'vitest';
import { createBoard, defaultProfile, PROFILE_EDGES, partGeometry, archCurve, cornerCurve, defaultHingeCup, defaultShelfPinRow } from '../document/document';
import type { Board, CurveCut, HoleRow } from '../document/document';
import type { ProfileCut, ProfileEnd, ProfileKind } from '../document/types';
import { boardBodies, profileEdgeName, profileEdgeOf } from '../document/bodies';
import { canonicalRun, geometryBoard } from '../document/profiles';
import { spanOf } from '../document/curves';
import { bodyMesh } from './grainTiling';

// Counts runoutNormals' builds (the real function runs).
const calls = vi.hoisted(() => ({ n: 0 }));
vi.mock('../document/runout', async (orig) => {
  const actual = await orig<typeof import('../document/runout')>();
  return { ...actual, runoutNormals: (...a: Parameters<typeof actual.runoutNormals>) => { calls.n += 1; return actual.runoutNormals(...a); } };
});

/**
 * Final fix F1 (profile runs a2): a stopped profile's run-out normals are built ONCE per part — memoised on partGeometry's
 * frozen bodies — not once per bodyMesh call (~54 per ogee part), and the meshes are byte-for-byte what they were.
 */
const shelf = { length: 30, width: 10, thickness: 0.75 };
const sizes = { roundover: { size: 0.25, fillet: 0 }, cove: { size: 0.375, fillet: 0 }, ogee: { size: 0.5, fillet: 0 }, bead: { size: 0.25, fillet: 0.0625 }, thumbnail: { size: 0.75, depth: 0.25 } } as const;
function stopped(kind: keyof typeof sizes, lo: number | null, hi: number | null, facing: 'face' | 'edge' = 'face', len = 30): Board {
  const dims = { ...shelf, length: len };
  const side = { across: 'width' as const, from: 'max' as const };
  const start: ProfileEnd = lo === null ? { side, through: 'min' } : { side, from: 'min', at: lo };
  const end: ProfileEnd = hi === null ? { side: { ...side }, through: 'max' } : { side: { ...side }, from: 'max', at: hi };
  const p: ProfileCut = { id: 'p', face: 'max', kind: kind as ProfileKind, ...sizes[kind], facing, run: canonicalRun(dims, 'max', { start, end }) };
  return createBoard({ ...dims, profiles: [p] });
}

const arch = { id: 'a', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1.5 }) };
const corners = (['min', 'max'] as const).flatMap((uf) => (['min', 'max'] as const).map((vf) => ({ id: `${uf}${vf}`, ...cornerCurve({ through: 'thickness', uFrom: uf, vFrom: vf, radius: 2 }) })));
const endCorner = { id: 'y', ...cornerCurve({ through: 'length', uFrom: 'min', vFrom: 'max', radius: 0.5 }) };
const notchL: CurveCut = {
  id: 'L', through: 'thickness', uFrom: 'min', vFrom: 'min', start: [10, 0],
  segments: [
    { type: 'line', to: [16, 0] }, { type: 'line', to: [16, 1] }, { type: 'line', to: [12, 1] }, { type: 'line', to: [12, 2.5] },
    { type: 'arc', to: [10, 2.5], side: 'right', rise: 0.5 }, { type: 'line', to: [10, 0] },
  ],
};
const side = { length: 36, width: 11.25, thickness: 0.75 };
const sideArch = { id: 'a', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 4, span: 28, rise: 1 }) };
const stile = { length: 30, width: 5, thickness: 0.75 };
const stileArch = { id: 'a', ...archCurve({ through: 'thickness', along: 'length', side: 'max', from: 'min', start: 6, span: 18, rise: 1 }) };
const top = { length: 36, width: 20, thickness: 0.75 };
const fourEdge = (kind: 'roundover' | 'cove' | 'bead' | 'ogee') =>
  createBoard({ ...top, curves: PROFILE_EDGES.filter((e) => e.vFrom === 'max').map((e, i) => ({ id: `p${i}`, ...defaultProfile(top, kind, e) })) });

/** Every stopped case (curvesPerf's, curvesWatertight's, the new watertight rows) and every curvesPerf fixture. */
const cases: [string, () => Board][] = [
  ['stopped roundover 3..27', () => stopped('roundover', 3, 3)],
  ['stopped cove 3..27', () => stopped('cove', 3, 3)],
  ['stopped ogee 3..27', () => stopped('ogee', 3, 3)],
  ['half-stopped roundover ..20', () => stopped('roundover', null, 10)],
  ['roundover stopped 0.1 in', () => stopped('roundover', 0.1, 0.1)],
  ['stopped bead, face', () => stopped('bead', 3, 3, 'face')],
  ['stopped bead, edge', () => stopped('bead', 3, 3, 'edge')],
  ['stopped thumbnail, face', () => stopped('thumbnail', 3, 3, 'face')],
  ['stopped thumbnail, edge', () => stopped('thumbnail', 3, 3, 'edge')],
  ['arched apron', () => createBoard({ length: 30, width: 5, thickness: 0.75, curves: [arch] })],
  ['four corners', () => createBoard({ length: 36, width: 20, thickness: 0.75, curves: corners })],
  ['arch + end corner', () => createBoard({ length: 30, width: 5, thickness: 0.75, curves: [arch, endCorner] })],
  ['L notch', () => createBoard({ length: 30, width: 5, thickness: 0.75, curves: [notchL] })],
  ['bookcase side', () => {
    const b = createBoard({ ...side, curves: [sideArch] });
    const row = defaultShelfPinRow(b)!;
    const holes: HoleRow[] = [{ id: 'f', ...row, inset: 2 }, { id: 'b', ...row, acrossFrom: 'max', inset: 2 }];
    return createBoard({ ...side, curves: [sideArch], holes });
  }],
  ['stile + cup', () => {
    const b = createBoard({ ...stile, curves: [stileArch] });
    return createBoard({ ...stile, curves: [stileArch], holes: [{ id: 'c', ...defaultHingeCup(b), station: 10 }] });
  }],
  ...(['roundover', 'cove', 'bead', 'ogee'] as const).map((k): [string, () => Board] => [`four-edge ${k}`, () => fourEdge(k)]),
  ['ogee + bead shelf', () => {
    const dims = { width: 10, thickness: 0.75 };
    return createBoard({ length: 36, ...dims, curves: [
      { id: 'o', ...defaultProfile({ length: 36, ...dims }, 'ogee') },
      { id: 'b', ...defaultProfile({ length: 36, ...dims }, 'bead', { through: 'width', uFrom: 'max', vFrom: 'max' }) },
    ] });
  }],
];

const PINNED: Record<string, string> = {
  "stopped roundover 3..27": '9278ab48842b3491',
  "stopped cove 3..27": '2f59128d198bd0be',
  "stopped ogee 3..27": 'ecaba16efcc4f4bf',
  "half-stopped roundover ..20": '9603441d2ce60c6e',
  "roundover stopped 0.1 in": '9afbb4cfbb4b70eb',
  "stopped bead, face": '8199608a917766d3',
  "stopped bead, edge": '3808db9fc116a700',
  "stopped thumbnail, face": 'a72d1367d2c94e40',
  "stopped thumbnail, edge": 'f7eddb53e89111b6',
  "arched apron": '535f5617f20940e2',
  "four corners": 'bf894d9cfc5fd5a5',
  "arch + end corner": 'aef964048d20c852',
  "L notch": 'c0b73c7f52de251d',
  "bookcase side": '7fa7e18c6df1d264',
  "stile + cup": 'c1d1caf4db936a14',
  "four-edge roundover": 'eff1e50c1f8924dc',
  "four-edge cove": 'ac7309a530d44b90',
  "four-edge bead": 'ced9a3e37228945b',
  "four-edge ogee": '6e262b80ca43394a',
  "ogee + bead shelf": '9741c1a763ac8893',
};

const EDGES_PINNED: Record<string, string> = {
  "stopped roundover 3..27": '1d467409d2707bcd:35',
  "stopped cove 3..27": '28987c2119a1bb74:43',
  "stopped ogee 3..27": '066f54d46878a300:50',
  "half-stopped roundover ..20": 'a8a9cc51740c0225:27',
  "roundover stopped 0.1 in": '0f6942c1655e7580:27',
  "stopped bead, face": '1c9cf8c446c78daf:53',
  "stopped bead, edge": '8fcfcbb7d9b1ae54:45',
  "stopped thumbnail, face": '96c1be7c0ee9faf4:48',
  "stopped thumbnail, edge": 'd175a4dd52892589:36',
  "arched apron": '650b12015251b2cf:52',
  "four corners": '9f64cc60b2c7f4cc:104',
  "arch + end corner": '21a6e5838c50224c:74',
  "L notch": '46f1d53737db57ca:50',
  "bookcase side": '2fc7511d56d4b022:46',
  "stile + cup": '00fd561ac3f508e8:46',
  "four-edge roundover": 'ffe7f4bf817eb742:24',
  "four-edge cove": '1efa5815f08640cc:36',
  "four-edge bead": 'b8e3a2c82ca88316:36',
  "four-edge ogee": '12419524b89b0d1e:40',
  "ogee + bead shelf": 'e81b0aff96c11b36:39',
};

function edgeHash(b: Board): string {
  const e = partGeometry(b).edges;
  const h = createHash('sha256');
  h.update(Buffer.from(Float64Array.from(e.flatMap(([a, c]) => [a.length, a.width, a.thickness, c.length, c.width, c.thickness])).buffer));
  return `${h.digest('hex').slice(0, 16)}:${e.length}`;
}

function meshHash(made: Board): string {
  // A fixed id: the UV offset is hashed from it, and createBoard's ids depend on creation order.
  const board = { ...made, id: 'pin' };
  const g = partGeometry(board);
  const h = createHash('sha256');
  for (const body of g.bodies) {
    const m = bodyMesh(board, body, g.holes, g.bodies);
    h.update(Buffer.from(m.positions.buffer, m.positions.byteOffset, m.positions.byteLength));
    h.update(Buffer.from(m.uvs.buffer, m.uvs.byteOffset, m.uvs.byteLength));
    if (m.normals) h.update(Buffer.from(m.normals.buffer, m.normals.byteOffset, m.normals.byteLength));
    h.update(JSON.stringify(m.groups));
  }
  return h.digest('hex').slice(0, 16);
}

describe('bodyMesh output is unchanged by the run-out memo (final fix F1)', () => {
  it('every stopped fixture is what it claims: a stopped profile with run-out faces', () => {
    for (const [name, make] of cases.filter(([n]) => n.includes('stopped'))) {
      const b = make();
      expect(b.profiles, name).toHaveLength(1);
      expect(spanOf(geometryBoard(b).curves[0]!), name).toBeDefined();
      expect(partGeometry(b).bodies.some((body) => body.faces.some((f) => f.runout !== undefined)), name).toBe(true);
    }
  });
  // Hashes taken at 38cec08, before the memo (positions, UVs, normals and groups of every body, in order).
  it.each(cases)('%s: byte-for-byte', (name, make) => {
    expect(meshHash(make())).toBe(PINNED[name]);
  });
  // The edges too (taken at 38cec08, in a detached worktree): bodyEdges' speedups change no segment, order or float.
  it.each(cases)('%s: edges byte-for-byte', (name, make) => {
    expect(edgeHash(make())).toBe(EDGES_PINNED[name]);
  });
});

let tick = 0;
describe('a stopped profile\'s run-out normals are built once per part (final fix F1)', () => {
  it.each(cases.filter(([n]) => n.startsWith('stopped')))('%s: one build over every body', (_name, make) => {
    // A geometry no other test has built (the memo lives as long as partGeometry's cached bodies).
    tick += 1;
    const made = make();
    const board = { ...made, length: made.length + tick * 1e-6 };
    const g = partGeometry(board);
    const withRunout = g.bodies.filter((body) => body.faces.some((f) => f.runout !== undefined)).length;
    expect(withRunout).toBeGreaterThan(1);
    calls.n = 0;
    for (const body of g.bodies) bodyMesh(board, body, g.holes, g.bodies);
    expect(calls.n).toBe(1);
    // The memo lives with the frozen bodies: a second rebuild of the same geometry builds nothing.
    for (const body of g.bodies) bodyMesh(board, body, g.holes, g.bodies);
    expect(calls.n).toBe(1);
  });
  it('unfrozen bodies are never a memo key: each call builds its own', () => {
    const board = stopped('ogee', 3, 3);
    const bodies = boardBodies(geometryBoard(board));
    expect(Object.isFrozen(bodies)).toBe(false);
    calls.n = 0;
    const runoutBody = bodies.find((body) => body.faces.some((f) => f.runout !== undefined))!;
    bodyMesh(board, runoutBody, [], bodies);
    bodyMesh(board, runoutBody, [], bodies);
    expect(calls.n).toBe(2);
  });

});

// Final fix F6: ONE builder and ONE parser of a cap's `profileEdge`, beside each other in bodies.ts.
describe('profileEdgeName / profileEdgeOf (final fix F6)', () => {
  it('round-trips, a curve id holding the separator included; an untagged face is null', () => {
    expect(profileEdgeOf({ profileEdge: profileEdgeName('id:with:colons', 3, 5) })).toEqual({ curve: 'id:with:colons', a: 3, b: 5 });
    expect(profileEdgeOf({})).toBeNull();
  });
  it('every tagged face of every stopped fixture parses to its own curve and an outline run', () => {
    let runs = 0;
    for (const [name, make] of cases.filter(([n]) => n.startsWith('stopped'))) {
      for (const body of partGeometry(make()).bodies) for (const f of body.faces) {
        const e = profileEdgeOf(f);
        if (!e) continue;
        expect(f.profileEdge, name).toBe(profileEdgeName(e.curve, e.a, e.b));
        expect(e.curve, name).toBe('p');
        expect(Number.isInteger(e.a) && Number.isInteger(e.b), name).toBe(true);
        if (e.a !== e.b) runs += 1;
      }
    }
    expect(runs).toBeGreaterThan(0);   // the ogee's collinear inflection chords: a run of more than one edge
  });
});
