import { describe, expect, it, vi } from 'vitest';
import { runRefine } from './run';
import { REFINE_MAX, plainForRefine } from './refine';
import { documentToDesign } from '../document/refineDesign';
import { createBoard, createDocument, flatDocument, migrateDocument, writeBackFlat } from '../document/document';
import type { Board, FlatDocument, SloydDocument } from '../document/document';
import type { Dovetail } from '../document/types';
import { applyJoints } from './joints/recipes';
import type { JointChoice } from './joints/recipes';
import { findSites, jointKey } from './joints/sites';
import type { Site } from './joints/sites';
import { defaultChoice } from './joints/choose';
import { gateUnjoin, sameJoined } from './joints/unjoin';
import type { RecordedJoint } from './joints/unjoin';
import { REPAIR_REFUSAL, changedDovetailed, repairDocument } from './joints/repair';
import { applyBoxJoints, boxJointPlan } from '../document/boxJoints';
import { designToDocument, toWireDesign } from '../document/generated';
import type { GeneratedDesign } from '../document/generated';
import type { LlmClient, LlmRequest, LlmResult } from '../llm/types';
import { applyDovetails, dovetailPlan } from '../document/dovetails';
import { dovetailsOf } from '../document/dovetailModel';
import { cornerJointed } from '../document/leanKeep';
import * as fingerClaim from './joints/fingerClaim';
import f1 from './joints/fixtures/1-frames-duplicates.json?raw';

vi.mock('./joints/fingerClaim', async (orig) => {
  const a = await orig<typeof import('./joints/fingerClaim')>();
  return { ...a, changedBoxJointed: vi.fn(a.changedBoxJointed) };
});

const usage = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 };
/** A scripted model (`run.test.ts`' pattern): each step answered in turn, a design step in the wire form. */
function fakeClient(steps: unknown[]) {
  const seen: unknown[][] = [];
  let i = 0;
  const client: LlmClient = {
    userTurn: (text) => ({ role: 'user', text }),
    estimateCostUsd: () => 0,
    complete: vi.fn(async (req: LlmRequest): Promise<LlmResult> => {
      seen.push([...req.messages]);
      const step = steps[Math.min(i, steps.length - 1)] as Partial<GeneratedDesign>;
      const turn = Object.freeze({ role: 'assistant', n: i++ });
      const json = step && Array.isArray(step.parts) && Array.isArray(step.assemblies) ? toWireDesign(step as GeneratedDesign) : step;
      return { json, assistantTurn: turn, usage };
    }),
  };
  return { client, seen };
}

const RS = { instruction: 'change it', width: null, depth: null, height: null, detail: 'moderate' as const };
const go = (client: LlmClient, doc: SloydDocument) => runRefine(client, doc, RS, new AbortController().signal, () => {});
/** The design Refine sends, echoed back unchanged. */
const plainEcho = (d: SloydDocument) => {
  const p = plainForRefine(d); if ('refused' in p) throw new Error(p.refused.message);
  const r = documentToDesign(p.plain, REFINE_MAX); if ('refused' in r) throw new Error(r.refused.message);
  return r.design;
};

const DOVETAILS = { slope: 8, count: null, swap: false };
/** A drawer (box joints' Refine fixture), its four butt corners dovetailed by the planner, `dx` along X. */
const drawerBoards = (dx = 0): Board[] => {
  const fb = (id: string, name: string, z: number) => createBoard({ id, name, posture: 'on-edge', rotation: 0, length: 12, width: 4, thickness: 0.5, position: [dx + 0.5, 0, z] });
  const side = (id: string, name: string, x: number) => createBoard({ id, name, posture: 'on-edge', rotation: 90, length: 17, width: 4, thickness: 0.5, position: [dx + x, 0, 0] });
  const doc = { ...createDocument('Drawer'), boards: [fb('df', 'Drawer front', 0), fb('db', 'Drawer back', 16.5), side('dl', 'Drawer left', 0), side('dr', 'Drawer right', 12.5)] };
  const plan = dovetailPlan(doc, ['df', 'db', 'dl', 'dr'], DOVETAILS);
  if (typeof plan === 'string') throw new Error(plan);
  return applyDovetails(doc, plan).boards as Board[];
};
const DRAWER = ['Drawer front', 'Drawer back', 'Drawer left', 'Drawer right'];
const bp = (name: string, at: [number, number, number], size: [number, number, number]) =>
  ({ name, role: '', miters: [], bevels: [], chamfers: [], holes: [], bands: [], tapers: [], material: 'pine', at: { x: at[0], y: at[1], z: at[2] }, size: { x: size[0], y: size[1], z: size[2] } });
const caseFlat = flatDocument(designToDocument({ name: 'Case', assemblies: [], parts: [
  bp('Left side', [0, 0, 0], [0.75, 30, 11.25]), bp('Right side', [20.75, 0, 0], [0.75, 30, 11.25]),
  bp('Bottom', [0.75, 0, 0], [20, 0.75, 11.25]), bp('Top', [0.75, 29.25, 0], [20, 0.75, 11.25]), bp('Shelf', [0.75, 15, 0], [20, 0.75, 11.25]),
] }).doc);
const caseSites = findSites(caseFlat);
const joinedCase = migrateDocument(applyJoints(caseFlat, caseSites, caseSites.map((s) => defaultChoice(s, caseFlat, caseSites))).doc);
const byName = (d: SloydDocument) => { const f = flatDocument(d); return { ...f, boards: [...f.boards].sort((a, b) => a.name.localeCompare(b.name)) }; };
const board = (d: FlatDocument, n: string) => d.boards.find((b) => b.name === n)!;

describe('the dovetailed drawer fixture', () => {
  it('every corner is dovetailed, and no part has a cut (a dovetail is not a cut)', () => {
    for (const b of drawerBoards()) {
      expect(dovetailsOf(b).length, b.name).toBe(2);
      expect(b.cuts, b.name).toEqual([]);
      expect(cornerJointed(b)).toBe(true);
    }
  });
});

describe('gateUnjoin never sees a dovetail (dovetails spec §7, the builder check)', () => {
  it('a dovetailed drawer with no other cut: no joint read, the plain parts are the parts', () => {
    const flat = flatDocument(migrateDocument({ ...createDocument('Drawer'), boards: drawerBoards() }));
    const g = gateUnjoin(flat);
    if ('refused' in g) throw new Error(g.refused);
    expect(g.joints).toEqual([]);
    expect(g.plain).toEqual(flat.boards);
  });

  it('a joined cabinet plus a dovetailed drawer: the gate reads the cabinet\'s joints only, the drawer plain as it is', () => {
    const doc = migrateDocument({ ...joinedCase, boards: [...joinedCase.boards, ...drawerBoards(100)] });
    const flat = flatDocument(doc);
    const g = gateUnjoin(flat);
    if ('refused' in g) throw new Error(g.refused);
    expect(g.joints.length).toBeGreaterThan(0);
    for (const j of g.joints) expect(DRAWER.includes(j.enter) || DRAWER.includes(j.receive)).toBe(false);
    for (const n of DRAWER) expect(g.plain.find((b) => b.name === n)).toEqual(board(flat, n));
  });
});

describe('runRefine keeps dovetailed parts (dovetails spec §7)', () => {
  it('a dovetail-only project: no joinery, the drawer back byte for byte, the note says why, a reused kept name dropped', async () => {
    const doc = migrateDocument({ ...createDocument('Drawer'), boards: drawerBoards() });
    const echo = plainEcho(doc);
    expect(echo.parts.map((p) => p.name)).toEqual([]);
    const { client, seen } = fakeClient([{ ...echo, parts: [...echo.parts, bp('Drawer front', [0, 0, 0], [12, 4, 0.5]), bp('Shelf', [30, 0, 0], [20, 0.75, 10])] }]);
    const out = await go(client, doc);
    if ('refused' in out) throw new Error(out.refused.message);
    expect(out.joints).toBeNull();
    for (const n of DRAWER) expect(out.doc.boards.filter((b) => b.name === n), n).toEqual(doc.boards.filter((b) => b.name === n));
    // The dialog's kept line names dovetails, not box joints.
    expect(out.leaning).toEqual({ kept: DRAWER, why: DRAWER.map(() => 'dovetails'), replaced: ['Drawer front'] });
    const sent = JSON.stringify(seen[0]);
    expect(sent).toContain('These parts lean, have angled holes or have dovetails, which the design format cannot describe');
    expect(sent).toContain('\\"Drawer front\\" has dovetails and is kept as is: x 0 to 13, y 0 to 4, z 0 to 0.5.');
  });

  it('a JOINED cabinet plus a dovetailed ROOT drawer, refined unchanged: one call, the joints re-applied, the drawer exactly', async () => {
    const doc = migrateDocument({ ...joinedCase, boards: [...joinedCase.boards, ...drawerBoards(100)] });
    const { client } = fakeClient([plainEcho(doc)]);
    const out = await go(client, doc);
    if ('refused' in out) throw new Error(out.refused.message);
    expect(client.complete).toHaveBeenCalledTimes(1);
    const before = flatDocument(doc);
    const after = flatDocument(out.doc);
    for (const n of DRAWER) {
      expect(out.doc.boards.filter((b) => b.name === n), n).toEqual(doc.boards.filter((b) => b.name === n));
      const [p, q] = [board(before, n), board(after, n)];
      expect(dovetailsOf(q), n).toEqual(dovetailsOf(p));
      expect([q.length, q.width, q.thickness, ...q.position], n).toEqual([p.length, p.width, p.thickness, ...p.position]);
    }
    expect(sameJoined(byName(out.doc), byName(doc))).toBe(true);
    expect(out.joints!.kept).toBeGreaterThan(0);
    expect(out.joints!.notJoined).toBeUndefined();
    expect(out.leaning).toEqual({ kept: DRAWER, why: DRAWER.map(() => 'dovetails'), replaced: [] });
  });

  it('the model adds a part meeting the kept drawer: those meetings stay butt (no joinery call), the drawer exactly', async () => {
    const doc = migrateDocument({ ...joinedCase, boards: [...joinedCase.boards, ...drawerBoards(100)] });
    const echo = plainEcho(doc);
    const { client } = fakeClient([{ ...echo, parts: [...echo.parts, bp('Drawer stop', [100, 0, 17], [13, 4, 0.75])] }]);
    const out = await go(client, doc);
    if ('refused' in out) throw new Error(out.refused.message);
    const f = flatDocument(out.doc);
    const sites = findSites(f);
    const pair = (s: Site) => [f.boards[s.enter]!.name, f.boards[s.receive]!.name];
    expect(sites.filter((s) => pair(s).includes('Drawer stop') && pair(s).some((n) => DRAWER.includes(n))).length).toBeGreaterThan(0);
    for (const n of DRAWER) expect(out.doc.boards.filter((b) => b.name === n), n).toEqual(doc.boards.filter((b) => b.name === n));
    expect(client.complete).toHaveBeenCalledTimes(1);
    expect(out.joints).toMatchObject({ chosen: 0, skipped: [] });
    expect(out.joints!.notJoined).toBeUndefined();
  });

  it('(c) a re-join that would change a kept dovetailed part comes back UNJOINED with the dovetail sentence (the guard, forced)', async () => {
    const doc = migrateDocument({ ...joinedCase, boards: [...joinedCase.boards, ...drawerBoards(100)] });
    const { client } = fakeClient([plainEcho(doc)]);
    const guard = vi.mocked(fingerClaim.changedBoxJointed);
    guard.mockImplementationOnce(() => 'Drawer left');
    const out = await go(client, doc);
    if ('refused' in out) throw new Error(out.refused.message);
    // The dovetailed root parts are guarded (`cornerJointed`).
    expect(guard).toHaveBeenCalledWith(doc, expect.anything(), DRAWER);
    expect(out.joints).toEqual({ kept: 0, chosen: 0, dropped: 0, skipped: [], notes: [],
      notJoined: 'Joinery would have changed Drawer left, which Refine keeps as it is for its dovetails, so the design comes back unjoined.' });
    for (const b of flatDocument(out.doc).boards.filter((x) => !DRAWER.includes(x.name))) expect(b.cuts, b.name).toEqual([]);
    for (const n of DRAWER) expect(out.doc.boards.filter((b) => b.name === n), n).toEqual(doc.boards.filter((b) => b.name === n));
  });

  /** The dovetailed drawer as ONE definition (four dovetailed sides and a plain bottom) placed twice beside the joined case. */
  const withDrawerAssembly = (base: SloydDocument) => migrateDocument({ ...base,
    definitions: [...base.definitions, { id: 'dd', boards: [...drawerBoards(), createBoard({ id: 'bt', name: 'Bottom', length: 12, width: 16, thickness: 0.25, posture: 'flat', position: [0.5, 0.5, 0.5] })], instances: [], hardware: [] }],
    instances: [...base.instances, { id: 'i1', name: 'Drawer 1', definition: 'dd', position: [100, 0, 0], rotation: 0 }, { id: 'i2', name: 'Drawer 2', definition: 'dd', position: [120, 0, 0], rotation: 0 }] });
  const drawerDef = (d: SloydDocument) => d.definitions.find((x) => x.boards.some((b) => b.name === 'Drawer front'));
  const ASSEMBLY_FLAT = ['Drawer 1', 'Drawer 2'].flatMap((p) => [...DRAWER, 'Bottom'].map((n) => `${p} › ${n}`));

  it('a JOINED cabinet plus a kept dovetailed drawer ASSEMBLY, refined unchanged: the definition and placements exactly', async () => {
    const doc = withDrawerAssembly(joinedCase);
    const def = drawerDef(doc)!;
    const { client, seen } = fakeClient([plainEcho(doc)]);
    const out = await go(client, doc);
    if ('refused' in out) throw new Error(out.refused.message);
    expect(client.complete).toHaveBeenCalledTimes(1);
    expect(drawerDef(out.doc)).toEqual(def);
    for (const n of ASSEMBLY_FLAT) expect(dovetailsOf(board(flatDocument(out.doc), n)), n).toEqual(dovetailsOf(board(flatDocument(doc), n)));
    expect(out.doc.instances.filter((i) => i.definition === def.id)).toEqual(doc.instances.filter((i) => i.definition === def.id));
    expect(sameJoined(byName(out.doc), byName(doc))).toBe(true);
    expect(out.joints!.kept).toBeGreaterThan(0);
    expect(out.joints!.notJoined).toBeUndefined();
    expect(out.leaning).toEqual({ kept: ['Drawer 1', 'Drawer 2'], why: ['dovetails', 'dovetails'], replaced: [] });
    expect(out.changes).toEqual([]);
    const sent = JSON.stringify(seen[0]);
    expect(sent).toContain('These parts lean, have angled holes or have dovetails, which');
    expect(sent).toContain('\\"Drawer 1\\" is an assembly with dovetails and is kept as is:');
  });

  it('the (c) guard covers every part of a kept dovetailed assembly; a plain part of it takes its assembly\'s sentence', async () => {
    const doc = withDrawerAssembly(joinedCase);
    const { client } = fakeClient([plainEcho(doc)]);
    const guard = vi.mocked(fingerClaim.changedBoxJointed);
    guard.mockImplementationOnce(() => 'Drawer 2 › Bottom');
    const out = await go(client, doc);
    if ('refused' in out) throw new Error(out.refused.message);
    expect(guard).toHaveBeenCalledWith(doc, expect.anything(), ASSEMBLY_FLAT);
    expect(out.joints!.notJoined).toBe('Joinery would have changed Drawer 2 › Bottom, which Refine keeps as it is for its dovetails, so the design comes back unjoined.');
    expect(drawerDef(out.doc)).toEqual(drawerDef(doc));
  });
});

describe('the dialog\'s kept kinds: box joints and dovetails, both when both (dovetails spec §7)', () => {
  const boxDrawer = (dx: number): Board[] => {
    const fb = (id: string, name: string, z: number) => createBoard({ id, name, posture: 'on-edge', rotation: 0, length: 12, width: 4, thickness: 0.5, position: [dx + 0.5, 0, z] });
    const side = (id: string, name: string, x: number) => createBoard({ id, name, posture: 'on-edge', rotation: 90, length: 17, width: 4, thickness: 0.5, position: [dx + x, 0, 0] });
    const doc = { ...createDocument('Drawer'), boards: [fb('bf', 'Box front', 0), fb('bb', 'Box back', 16.5), side('bl', 'Box left', 0), side('br', 'Box right', 12.5)] };
    const plan = boxJointPlan(doc, ['bf', 'bb', 'bl', 'br'], { width: 0.5, swap: false });
    if (typeof plan === 'string') throw new Error(plan);
    return applyBoxJoints(doc, plan).boards as Board[];
  };

  it('a box-jointed drawer and a dovetailed drawer kept at the root: each named with its own kind', async () => {
    const doc = migrateDocument({ ...createDocument('Drawers'), boards: [...drawerBoards(), ...boxDrawer(40)] });
    // Every part is kept, so the model returns one new part (an empty design is no usable design).
    const echo = plainEcho(doc);
    const { client } = fakeClient([{ ...echo, parts: [...echo.parts, bp('Shelf', [80, 0, 0], [20, 0.75, 10])] }]);
    const out = await go(client, doc);
    if ('refused' in out) throw new Error(out.refused.message);
    expect(out.leaning).toEqual({ kept: [...DRAWER, 'Box front', 'Box back', 'Box left', 'Box right'], why: [...DRAWER.map(() => 'dovetails'), 'box joints', 'box joints', 'box joints', 'box joints'], replaced: [] });
  });

  it('one kept assembly holding both: both kinds in one reason', async () => {
    const doc = migrateDocument({ ...createDocument('Drawers'), boards: [createBoard({ id: 'tt', name: 'Table top', length: 40, width: 20, thickness: 0.75, posture: 'flat', position: [0, 0, 0] })],
      definitions: [{ id: 'dd', boards: [...drawerBoards(), ...boxDrawer(40)], instances: [], hardware: [] }],
      instances: [{ id: 'i1', name: 'Drawers', definition: 'dd', position: [0, 0, 30], rotation: 0 }] });
    const { client } = fakeClient([plainEcho(doc)]);
    const out = await go(client, doc);
    if ('refused' in out) throw new Error(out.refused.message);
    expect(out.leaning).toEqual({ kept: ['Drawers'], why: ['box joints and dovetails'], replaced: [] });
  });
});

describe('the Repair guard (`changedDovetailed`)', () => {
  const drawer = drawerBoards();
  const parts = () => structuredClone(drawer);
  it('unchanged, or only the order of a part\'s cuts: null', () => {
    expect(changedDovetailed(parts(), parts())).toBeNull();
  });
  it('a dovetailed part whose size, position, dovetails or cuts differ is named', () => {
    const at = (f: (b: Board) => Board) => parts().map((b) => (b.name === 'Drawer left' ? f(b) : b));
    expect(changedDovetailed(parts(), at((b) => ({ ...b, length: b.length + 0.125 })))).toBe('Drawer left');
    expect(changedDovetailed(parts(), at((b) => ({ ...b, position: [b.position[0], b.position[1] + 1, b.position[2]] })))).toBe('Drawer left');
    expect(changedDovetailed(parts(), at((b) => ({ ...b, dovetails: dovetailsOf(b).map((d) => ({ ...d, slope: 6 })) })))).toBe('Drawer left');
    expect(changedDovetailed(parts(), at((b) => ({ ...b, cuts: [{ id: 'x', face: 'thickness', from: 'min', across: 'length', offset: 1, width: 0.25, depth: 0.25, stopMin: 0, stopMax: 0 }] })))).toBe('Drawer left');
  });
});

describe('the re-join guard reads dovetails (`changedBoxJointed`)', () => {
  it('a kept part whose dovetails differ is named; the same part unchanged is not', () => {
    const doc = migrateDocument({ ...createDocument('Drawer'), boards: drawerBoards() });
    const actual = vi.mocked(fingerClaim.changedBoxJointed);
    expect(actual(doc, doc, DRAWER)).toBeNull();
    const changed = { ...doc, boards: doc.boards.map((b) => (b.name === 'Drawer back'
      ? { ...b, dovetails: dovetailsOf(b as Board).map((d): Dovetail => ({ ...d, slope: 6 })) } : b)) };
    expect(actual(doc, changed, DRAWER)).toBe('Drawer back');
  });
});

describe('joinery leaves a dovetailed part alone (dovetails spec §7)', () => {
  /** A carcass: two upright sides 3/4" thick, 30" tall, 11-1/4" deep, a flat top dovetailed into both, a shelf between
   *  the sides; a cap board on the outside of the left side, which the top's left end meets; two brackets on the right
   *  side's outside face: one at the dovetailed top end, one well below it. */
  const carcass = (): FlatDocument => {
    const side = (id: string, name: string, x: number) => createBoard({ id, name, posture: 'upright', rotation: 90, length: 30, width: 11.25, thickness: 0.75, position: [x, 0, 0] });
    const top = createBoard({ id: 't', name: 'Top', posture: 'flat', rotation: 0, length: 20, width: 11.25, thickness: 0.75, position: [0.75, 29.25, 0] });
    const base = { ...createDocument('Carcass'), boards: [side('l', 'Left side', 0), side('r', 'Right side', 20.75), top] };
    const plan = dovetailPlan(base, ['l', 'r', 't'], DOVETAILS);
    if (typeof plan === 'string') throw new Error(plan);
    const done = applyDovetails(base, plan);
    const shelf = createBoard({ id: 's', name: 'Shelf', posture: 'flat', rotation: 0, length: 20, width: 11.25, thickness: 0.75, position: [0.75, 15, 0] });
    const cap = createBoard({ id: 'c', name: 'Cap', posture: 'upright', rotation: 90, length: 4, width: 11.25, thickness: 0.75, position: [-0.75, 27, 0] });
    const bracket = (id: string, name: string, y: number) => createBoard({ id, name, posture: 'flat', rotation: 0, length: 3, width: 2, thickness: 0.5, position: [21.5, y, 4] });
    return flatDocument(migrateDocument({ ...done, boards: [...done.boards, shelf, cap, bracket('bh', 'High bracket', 29.5), bracket('bl', 'Low bracket', 10)] }));
  };
  const LEFT_ALONE = (n: string) => `${n} has dovetails, so joinery leaves its size and place alone`;
  const siteOf = (doc: FlatDocument, sites: Site[], e: string, r: string) =>
    sites.find((s) => doc.boards[s.enter]!.name === e && doc.boards[s.receive]!.name === r);
  const only = (sites: Site[], picks: Map<Site, Omit<JointChoice, 'site'>>): JointChoice[] =>
    sites.map((s) => ({ site: s.id, ...(picks.get(s) ?? { joint: 'butt' as const }) }));

  it('the fixture: the top and both sides dovetailed, the top running to the sides\' outside faces', () => {
    const doc = carcass();
    for (const n of ['Top', 'Left side', 'Right side']) expect(dovetailsOf(board(doc, n)).length, n).toBeGreaterThan(0);
    expect(board(doc, 'Top').position[0]).toBe(0);
    expect(board(doc, 'Top').length).toBe(21.5);
  });

  it('the shelf joins in dados; a tenon that would grow the top into the cap is skipped with the dovetail sentence', () => {
    const doc = carcass();
    const sites = findSites(doc);
    const shelfL = siteOf(doc, sites, 'Shelf', 'Left side')!;
    const shelfR = siteOf(doc, sites, 'Shelf', 'Right side')!;
    const topCap = siteOf(doc, sites, 'Top', 'Cap')!;
    expect([shelfL, shelfR, topCap].every(Boolean)).toBe(true);
    const out = applyJoints(doc, sites, only(sites, new Map<Site, Omit<JointChoice, 'site'>>([
      [shelfL, { joint: 'dado', depth: 0.25 }], [shelfR, { joint: 'dado', depth: 0.25 }], [topCap, { joint: 'mortise-tenon', tenonLength: 0.5 }]])));
    expect(out.skipped).toEqual([{ site: topCap.id, reason: LEFT_ALONE('Top') }]);
    expect(out.applied).toEqual(expect.arrayContaining([{ site: shelfL.id, joint: 'dado' }, { site: shelfR.id, joint: 'dado' }]));
    expect(board(out.doc, 'Top')).toEqual(board(doc, 'Top'));
    expect(board(out.doc, 'Cap')).toEqual(board(doc, 'Cap'));
    // The shelf grew into both sides; each side took a groove, its dovetails as they were.
    expect(board(out.doc, 'Shelf').length).toBe(20.5);
    for (const n of ['Left side', 'Right side']) {
      expect(board(out.doc, n).cuts.length, n).toBe(1);
      expect(dovetailsOf(board(out.doc, n)), n).toEqual(dovetailsOf(board(doc, n)));
    }
  });

  it('a tenon or dado whose pocket would reach a dovetailed end is skipped with the dovetail sentence; one clear of it joins', () => {
    const doc = carcass();
    const sites = findSites(doc);
    const high = siteOf(doc, sites, 'High bracket', 'Right side')!;
    const low = siteOf(doc, sites, 'Low bracket', 'Right side')!;
    expect(high).toBeDefined();
    expect(low).toBeDefined();
    for (const c of [{ joint: 'mortise-tenon' as const, tenonLength: 0.5 }, { joint: 'dado' as const, depth: 0.25 }]) {
      const out = applyJoints(doc, sites, only(sites, new Map([[high, c], [low, c]])));
      expect(out.skipped, c.joint).toEqual([{ site: high.id, reason: LEFT_ALONE('Right side') }]);
      expect(out.applied, c.joint).toContainEqual({ site: low.id, joint: c.joint });
      expect(board(out.doc, 'High bracket')).toEqual(board(doc, 'High bracket'));
      expect(board(out.doc, 'Right side').cuts.length, c.joint).toBe(1);
    }
  });

  it('a groove running straight THROUGH the dovetailed end along its run is the store\'s exemption: it joins', () => {
    // A strip whose end meets the right side's outside face from y 26 up to the side's top (y 30): its dado runs along the
    // side's length out through the dovetailed end, as `dovetailCutRefusal` exempts a drawer bottom's groove.
    const doc = carcass();
    const strip = createBoard({ id: 'sp', name: 'Strip', posture: 'on-edge', rotation: 0, length: 3, width: 4, thickness: 0.5, position: [21.5, 26, 4] });
    const withStrip = flatDocument(migrateDocument({ ...doc, boards: [...doc.boards, strip] }));
    const sites = findSites(withStrip);
    const site = siteOf(withStrip, sites, 'Strip', 'Right side')!;
    expect(site).toBeDefined();
    const out = applyJoints(withStrip, sites, only(sites, new Map([[site, { joint: 'dado' as const, depth: 0.25 }]])));
    expect(out.skipped).toEqual([]);
    const groove = board(out.doc, 'Right side').cuts;
    expect(groove).toHaveLength(1);
    expect(groove[0]!.across).toBe('length');
    expect(dovetailsOf(board(out.doc, 'Right side'))).toEqual(dovetailsOf(board(withStrip, 'Right side')));
  });

  it('a half-lap notching a dovetailed end is refused with the dovetail sentence, changing nothing', () => {
    // A rail lying across the top's dovetailed left end (X [0, 3/4]), from above, along Z past the top's depth: the top
    // runs past it along X. E (the rail) would drop into the top's plane and both would be notched there. DEFENSIVE: with
    // the left side in place the drop is refused first (the corner square is the side's wood too), so the side is left
    // out here; the top's stored dovetails are as they were.
    const doc = carcass();
    const rail = createBoard({ id: 'x', name: 'Rail', posture: 'flat', rotation: 90, length: 13.25, width: 1, thickness: 0.75, position: [0.25, 30, -1] });
    const withRail = flatDocument(migrateDocument({ ...doc, boards: [...doc.boards.filter((b) => b.name !== 'Left side'), rail] }));
    const e = withRail.boards.findIndex((b) => b.name === 'Rail');
    const r = withRail.boards.findIndex((b) => b.name === 'Top');
    const site: Site = { id: 1, kind: 'crossing', enter: e, receive: r, axis: 1, side: -1, allowed: ['half-lap'], stopEnds: [] };
    const out = applyJoints(withRail, [site], [{ site: 1, joint: 'half-lap' }]);
    expect(out.skipped).toEqual([{ site: 1, reason: LEFT_ALONE('Top') }]);
    expect(out.doc.boards).toEqual(withRail.boards);
  });
});

describe('Repair never changes a dovetailed part (dovetails spec §7)', () => {
  const damaged = () => migrateDocument(JSON.parse(f1).damaged);
  /** `doc` with one dovetail stored on the definition part named `own` (every placement of it). */
  const dovetailOn = (doc: SloydDocument, own: string): SloydDocument => migrateDocument({ ...doc,
    definitions: doc.definitions.map((d) => ({ ...d, boards: d.boards.map((b) => (b.name === own
      ? { ...b, dovetails: [{ id: 'dv', dim: 'length', end: 'min', role: 'tails', count: 1, slope: 8, pin: 0.25, depth: 0.1 } as Dovetail] } : b)) })),
    boards: doc.boards.map((b) => (b.name === own ? { ...b, dovetails: [{ id: 'dv', dim: 'length', end: 'min', role: 'tails', count: 1, slope: 8, pin: 0.25, depth: 0.1 } as Dovetail] } : b)) });
  const own = (n: string) => n.split(' › ').pop()!;

  it('the fixture repairs, changing some parts\' cuts and leaving others\'', () => {
    const doc = damaged();
    const r = repairDocument(doc);
    if (r === null || 'refused' in r) throw new Error('expected a repair');
    const [a, b] = [flatDocument(doc).boards, flatDocument(r.doc).boards];
    expect(a.some((x, i) => x.cuts.length !== b[i]!.cuts.length)).toBe(true);
    expect(a.some((x, i) => x.cuts.length === b[i]!.cuts.length)).toBe(true);
  });

  it('a dovetailed part the repair would change: the repair refuses', () => {
    const doc = damaged();
    const r = repairDocument(doc);
    if (r === null || 'refused' in r) throw new Error('expected a repair');
    const [a, b] = [flatDocument(doc).boards, flatDocument(r.doc).boards];
    const changed = own(a.find((x, i) => x.cuts.length !== b[i]!.cuts.length)!.name);
    const withDovetail = dovetailOn(doc, changed);
    expect(flatDocument(withDovetail).boards.some((x) => own(x.name) === changed && dovetailsOf(x).length === 1)).toBe(true);
    expect(repairDocument(withDovetail)).toEqual({ refused: REPAIR_REFUSAL });
  });

  it('a dovetailed drawer beside the damage: the repair stands, the drawer exactly as it was', () => {
    const doc0 = damaged();
    const doc = migrateDocument({ ...doc0, boards: [...doc0.boards, ...drawerBoards(200)] });
    const r = repairDocument(doc);
    if (r === null || 'refused' in r) throw new Error(`expected a repair, got ${JSON.stringify(r)}`);
    for (const n of DRAWER) expect(r.doc.boards.filter((b) => b.name === n), n).toEqual(doc.boards.filter((b) => b.name === n));
  });

  it('a dovetailed drawer with no joints: nothing to repair', () => {
    expect(repairDocument(migrateDocument({ ...createDocument('Drawer'), boards: drawerBoards() }))).toBeNull();
  });
});

describe('a dovetailed drawer, then its bottom joined in grooves: Refine reads and re-applies the joints', () => {
  it('dovetail the corners, join the bottom into the front and back, Refine unchanged: not refused, dovetails intact, joints back', async () => {
    const plain = migrateDocument({ ...createDocument('Drawer'), boards: drawerBoards() });
    // The bottom's length runs along Z, so its ends enter the front and back; its grooves end at the pins' zones (touching).
    const bottom = createBoard({ id: 'bt', name: 'Bottom', posture: 'flat', rotation: 90, length: 16, width: 12, thickness: 0.25, position: [0.5, 0.5, 0.5] });
    const before = migrateDocument({ ...plain, boards: [...plain.boards, bottom] });
    const flat = flatDocument(before);
    const sites = findSites(flat);
    const into = sites.filter((s) => flat.boards[s.enter]!.name === 'Bottom');
    expect(into.map((s) => flat.boards[s.receive]!.name).sort()).toEqual(['Drawer back', 'Drawer front']);
    const joined = applyJoints(flat, sites, sites.map((s) => (into.includes(s)
      ? { site: s.id, joint: 'dado' as const, depth: 0.25 } : { site: s.id, joint: 'butt' as const })));
    expect(joined.skipped).toEqual([]);
    const doc = migrateDocument(writeBackFlat(before, flat.boards, joined.doc.boards));
    for (const n of ['Drawer front', 'Drawer back']) expect(board(flatDocument(doc), n).cuts, n).toHaveLength(1);
    const g = gateUnjoin(flatDocument(doc));
    if ('refused' in g) throw new Error(g.refused);
    expect(g.joints.map((j: RecordedJoint) => jointKey(j.enter, j.receive, j.axis, j.side))).toHaveLength(2);
    const { client } = fakeClient([plainEcho(doc)]);
    const out = await go(client, doc);
    if ('refused' in out) throw new Error(out.refused.message);
    expect(out.joints!.notJoined).toBeUndefined();
    expect(out.joints!.kept).toBe(2);
    // Exactly, but for the re-cut groove's id (a recorded joint is re-applied as recorded: a new pocket, ids ignored).
    const noCutIds = (b: Board) => ({ ...b, cuts: b.cuts.map(({ id: _id, ...c }) => c) });
    const [fo, fd] = [flatDocument(out.doc), flatDocument(doc)];
    for (const n of DRAWER) {
      expect(noCutIds(board(fo, n)), n).toEqual(noCutIds(board(fd, n)));
      expect(dovetailsOf(board(fo, n)), n).toEqual(dovetailsOf(board(fd, n)));
    }
    expect(out.leaning).toEqual({ kept: DRAWER, why: DRAWER.map(() => 'dovetails'), replaced: [] });
  });
});

describe('the Repair guard (`changedDovetailed`): every clause (final review, 2026-10-27)', () => {
  const drawer = drawerBoards();
  const parts = () => structuredClone(drawer);
  const at = (f: (b: Board) => Board) => parts().map((b) => (b.name === 'Drawer left' ? f(b) : b));
  const cut = (id: string, offset: number) =>
    ({ id, face: 'thickness' as const, from: 'min' as const, across: 'length' as const, offset, width: 0.25, depth: 0.125, stopMin: 0, stopMax: 0 });
  it('a width or a thickness change is named', () => {
    expect(changedDovetailed(parts(), at((b) => ({ ...b, width: b.width + 0.125 })))).toBe('Drawer left');
    expect(changedDovetailed(parts(), at((b) => ({ ...b, thickness: b.thickness + 0.125 })))).toBe('Drawer left');
  });
  it('the same cuts in another order (ids differing): null; a different cut set: named', () => {
    const before = at((b) => ({ ...b, cuts: [cut('a', 1), cut('b', 2)] }));
    expect(changedDovetailed(before, at((b) => ({ ...b, cuts: [cut('y', 2), cut('z', 1)] })))).toBeNull();
    expect(changedDovetailed(before, at((b) => ({ ...b, cuts: [cut('y', 2), cut('z', 1.5)] })))).toBe('Drawer left');
  });
  it('a dovetailed part missing from `after` is named; a plain part may change', () => {
    expect(changedDovetailed(parts(), parts().slice(0, 2))).toBe(parts()[2]!.name);
    const plain = createBoard({ id: 'p', name: 'Plain', length: 5, width: 4, thickness: 0.5 });
    expect(changedDovetailed([...parts(), plain], [...parts(), { ...plain, length: 6 }])).toBeNull();
  });
});

// ---- Half-blind twins (half-blind spec §7): the same keep and leave-alone rules, on a drawer whose front/back take PINS
// with a lap. They lean on `cornerJointed` alone; nothing here is half-blind specific code.
const HALF_BLIND = { slope: 8, count: null, swap: false, joint: 'half-blind' as const, lap: null };
const hbDrawerBoards = (dx = 0): Board[] => {
  const fb = (id: string, name: string, z: number) => createBoard({ id, name, posture: 'on-edge', rotation: 0, length: 12, width: 4, thickness: 0.5, position: [dx + 0.5, 0, z] });
  const side = (id: string, name: string, x: number) => createBoard({ id, name, posture: 'on-edge', rotation: 90, length: 17, width: 4, thickness: 0.5, position: [dx + x, 0, 0] });
  const doc = { ...createDocument('Drawer'), boards: [fb('df', 'Drawer front', 0), fb('db', 'Drawer back', 16.5), side('dl', 'Drawer left', 0), side('dr', 'Drawer right', 12.5)] };
  const plan = dovetailPlan(doc, ['df', 'db', 'dl', 'dr'], HALF_BLIND);
  if (typeof plan === 'string') throw new Error(plan);
  return applyDovetails(doc, plan).boards as Board[];
};
const lapped = (b: Board) => dovetailsOf(b).some((d) => d.lap !== undefined);

describe('half-blind drawer: the keep predicate and Refine', () => {
  it('the fixture: a lap on the pin parts, every part cornerJointed, no cuts', () => {
    const bs = hbDrawerBoards();
    expect(bs.filter(lapped).length).toBeGreaterThan(0);
    for (const b of bs) { expect(cornerJointed(b), b.name).toBe(true); expect(b.cuts, b.name).toEqual([]); }
  });

  it('a dovetail-only half-blind project: every part kept exactly, lap included', async () => {
    const doc = migrateDocument({ ...createDocument('Drawer'), boards: hbDrawerBoards() });
    const echo = plainEcho(doc);
    const { client } = fakeClient([{ ...echo, parts: [...echo.parts, bp('Shelf', [30, 0, 0], [20, 0.75, 10])] }]);
    const out = await go(client, doc);
    if ('refused' in out) throw new Error(out.refused.message);
    for (const n of DRAWER) expect(out.doc.boards.filter((b) => b.name === n), n).toEqual(doc.boards.filter((b) => b.name === n));
    expect(out.leaning).toMatchObject({ kept: DRAWER });
  });

  it('a JOINED cabinet plus a half-blind ROOT drawer: the drawer exactly, joints re-applied', async () => {
    const doc = migrateDocument({ ...joinedCase, boards: [...joinedCase.boards, ...hbDrawerBoards(100)] });
    const { client } = fakeClient([plainEcho(doc)]);
    const out = await go(client, doc);
    if ('refused' in out) throw new Error(out.refused.message);
    for (const n of DRAWER) expect(out.doc.boards.filter((b) => b.name === n), n).toEqual(doc.boards.filter((b) => b.name === n));
    expect(out.joints!.notJoined).toBeUndefined();
  });

  it('(c) the guard is called with the half-blind parts and forced to fire: unjoined with the dovetail sentence', async () => {
    const doc = migrateDocument({ ...joinedCase, boards: [...joinedCase.boards, ...hbDrawerBoards(100)] });
    const { client } = fakeClient([plainEcho(doc)]);
    const guard = vi.mocked(fingerClaim.changedBoxJointed);
    guard.mockImplementationOnce(() => 'Drawer left');
    const out = await go(client, doc);
    if ('refused' in out) throw new Error(out.refused.message);
    expect(guard).toHaveBeenCalledWith(doc, expect.anything(), DRAWER);
    expect(out.joints!.notJoined).toBe('Joinery would have changed Drawer left, which Refine keeps as it is for its dovetails, so the design comes back unjoined.');
  });

  it('the re-join guard names a part whose lap differs', () => {
    const doc = migrateDocument({ ...createDocument('Drawer'), boards: hbDrawerBoards() });
    const actual = vi.mocked(fingerClaim.changedBoxJointed);
    const changed = { ...doc, boards: doc.boards.map((b) => (lapped(b as Board)
      ? { ...b, dovetails: dovetailsOf(b as Board).map((d): Dovetail => ({ ...d, lap: (d.lap ?? 0.1) + 0.0625 })) } : b)) };
    expect(actual(doc, changed, DRAWER)).toEqual(expect.any(String));
  });
});

describe('half-blind drawer: Repair', () => {
  it('the Repair guard names a half-blind part whose lap differs, and not an unchanged one', () => {
    const drawer = hbDrawerBoards();
    expect(changedDovetailed(structuredClone(drawer), structuredClone(drawer))).toBeNull();
    const after = structuredClone(drawer).map((b) => (lapped(b)
      ? { ...b, dovetails: dovetailsOf(b).map((d) => ({ ...d, lap: (d.lap ?? 0.1) + 0.0625 })) } : b));
    expect(changedDovetailed(drawer, after)).toEqual(expect.any(String));
  });

  it('a half-blind drawer beside the damage: the repair stands, the drawer exactly as it was', () => {
    const doc0 = migrateDocument(JSON.parse(f1).damaged);
    const doc = migrateDocument({ ...doc0, boards: [...doc0.boards, ...hbDrawerBoards(200)] });
    const r = repairDocument(doc);
    if (r === null || 'refused' in r) throw new Error(`expected a repair, got ${JSON.stringify(r)}`);
    for (const n of DRAWER) expect(r.doc.boards.filter((b) => b.name === n), n).toEqual(doc.boards.filter((b) => b.name === n));
  });

  it('a half-blind drawer with no joints: nothing to repair', () => {
    expect(repairDocument(migrateDocument({ ...createDocument('Drawer'), boards: hbDrawerBoards() }))).toBeNull();
  });
});

describe('joinery leaves a half-blind drawer alone', () => {
  const LEFT_ALONE = (n: string) => `${n} has dovetails, so joinery leaves its size and place alone`;
  /** Two brackets on the right side's outside face: one over the dovetailed front end, one well clear of it. */
  const withBrackets = () => {
    const bracket = (id: string, name: string, z: number) => createBoard({ id, name, posture: 'flat', rotation: 0, length: 3, width: 2, thickness: 0.5, position: [13, 1, z] });
    return flatDocument(migrateDocument({ ...createDocument('D'), boards: [...hbDrawerBoards(), bracket('bn', 'Near bracket', 0.25), bracket('bf', 'Far bracket', 8)] }));
  };
  it('a pocket reaching a half-blind end is skipped with the dovetail sentence; one clear of it joins; the drawer is untouched', () => {
    const doc = withBrackets();
    const sites = findSites(doc);
    const at = (e: string) => sites.find((s) => doc.boards[s.enter]!.name === e && doc.boards[s.receive]!.name === 'Drawer right')!;
    const [near, far] = [at('Near bracket'), at('Far bracket')];
    expect(near).toBeDefined();
    expect(far).toBeDefined();
    const c = { joint: 'dado' as const, depth: 0.25 };
    const choices = sites.map((s) => ({ site: s.id, ...(s === near || s === far ? c : { joint: 'butt' as const }) }));
    const out = applyJoints(doc, sites, choices);
    expect(out.skipped).toEqual([{ site: near.id, reason: LEFT_ALONE('Drawer right') }]);
    expect(out.applied).toContainEqual({ site: far.id, joint: 'dado' });
    for (const n of ['Drawer front', 'Drawer back', 'Drawer left']) expect(board(out.doc, n), n).toEqual(board(doc, n));
    expect(dovetailsOf(board(out.doc, 'Drawer right'))).toEqual(dovetailsOf(board(doc, 'Drawer right')));
    expect(board(out.doc, 'Drawer right').length).toBe(board(doc, 'Drawer right').length);
  });

  it('the same on the lapped PIN part: a plate over the front\'s dovetailed end is skipped, one clear of it joins', () => {
    const plate = (id: string, name: string, x: number) => createBoard({ id, name, posture: 'flat', rotation: 90, length: 3, width: 2, thickness: 0.5, position: [x, 1, -3] });
    const doc = flatDocument(migrateDocument({ ...createDocument('D'), boards: [...hbDrawerBoards(), plate('pn', 'Near plate', 0.25), plate('pf', 'Far plate', 6)] }));
    expect(lapped(board(doc, 'Drawer front'))).toBe(true);
    const sites = findSites(doc);
    const at = (e: string) => sites.find((s) => doc.boards[s.enter]!.name === e && doc.boards[s.receive]!.name === 'Drawer front')!;
    const [near, far] = [at('Near plate'), at('Far plate')];
    expect(near).toBeDefined();
    expect(far).toBeDefined();
    const out = applyJoints(doc, sites, sites.map((s) => ({ site: s.id, ...(s === near || s === far ? { joint: 'dado' as const, depth: 0.125 } : { joint: 'butt' as const }) })));
    expect(out.skipped).toEqual([{ site: near.id, reason: LEFT_ALONE('Drawer front') }]);
    expect(out.applied).toContainEqual({ site: far.id, joint: 'dado' });
    expect(dovetailsOf(board(out.doc, 'Drawer front'))).toEqual(dovetailsOf(board(doc, 'Drawer front')));
    expect(board(out.doc, 'Drawer front').length).toBe(board(doc, 'Drawer front').length);
  });
});
