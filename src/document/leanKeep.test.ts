import { describe, expect, it } from 'vitest';
import { createBoard, createDocument, flatDocument, migrateDocument } from './document';
import type { Board, SloydDocument, StoredBoard } from './types';
import { applyBoxJoints, boxJointPlan, fingerSets } from './boxJoints';
import { hasHeads, keepsExactly, keptAssemblyLinkRefusal, keptNote, keptParts, keptWhy, leaningInAssembly } from './leanKeep';
import { documentToDesign } from './refineDesign';
import { designToDocument } from './generated';
import type { GeneratedDesign, GeneratedPart } from './generated';
import { linksToShapes } from './linksToShapes';
import { isShaped } from './shapes';
import { stoolDocument, stoolLegs } from './stoolFixture';

/** A drawer, butt corners jointed at 1/2" (as `boxJoints.test.ts` builds it). */
const drawerBoards = (): Board[] => {
  const fb = (id: string, name: string, z: number) => createBoard({ id, name, posture: 'on-edge', rotation: 0, length: 12, width: 4, thickness: 0.5, position: [0.5, 0, z] });
  const side = (id: string, name: string, x: number) => createBoard({ id, name, posture: 'on-edge', rotation: 90, length: 17, width: 4, thickness: 0.5, position: [x, 0, 0] });
  const doc = { ...createDocument('Drawer'), boards: [fb('f', 'Front', 0), fb('b', 'Back', 16.5), side('l', 'Side left', 0), side('r', 'Side right', 12.5)] };
  const plan = boxJointPlan(doc, ['f', 'b', 'l', 'r'], { width: 0.5, swap: false });
  if (typeof plan === 'string') throw new Error(plan);
  return applyBoxJoints(doc, plan).boards as Board[];
};
const HEADER_TAIL = ', which the design format cannot describe, so they are not in the design above. Sloyd keeps each exactly where it is; the bounds are world inches:';

describe('Refine keeps box-jointed parts (box-joints spec §7)', () => {
  it('keepsExactly reads a recognised finger set; a broken one (a notch removed) keeps nothing', () => {
    const [front] = drawerBoards();
    expect(fingerSets(front!)).toHaveLength(2);
    expect(keepsExactly(front!)).toBe(true);
    const set = fingerSets(front!)[0]!;
    const broken = { ...front!, cuts: front!.cuts.filter((c) => c.id !== set.cutIds[1] && !fingerSets(front!)[1]!.cutIds.includes(c.id)) };
    expect(fingerSets(broken)).toEqual([]);
    expect(keepsExactly(broken)).toBe(false);
  });

  it('the note: `has box joints`, and box joints in the header only when a box-jointed part is kept', () => {
    const doc = migrateDocument({ ...createDocument('Drawer'), boards: drawerBoards() });
    expect(keptParts(doc).names).toEqual(['Front', 'Back', 'Side left', 'Side right']);
    const lines = keptNote(doc)!.split('\n');
    expect(lines[0]).toBe(`These parts lean, have angled holes or have box joints${HEADER_TAIL}`);
    expect(lines.slice(1, 5)).toEqual([
      '"Front" has box joints and is kept as is: x 0 to 13, y 0 to 4, z 0 to 0.5.',
      '"Back" has box joints and is kept as is: x 0 to 13, y 0 to 4, z 16.5 to 17.',
      '"Side left" has box joints and is kept as is: x 0 to 0.5, y 0 to 4, z 0 to 17.',
      '"Side right" has box joints and is kept as is: x 12.5 to 13, y 0 to 4, z 0 to 17.',
    ]);
  });

  it('with a round tenon kept too, the header names both, tenons first', () => {
    const rung = { ...createBoard({ id: 'g', name: 'Rung', length: 18, width: 1.5, thickness: 1.25, posture: 'flat', position: [30, 0, 0] }), tenons: [{ id: 't1', end: 'max' as const, diameter: 0.75, length: 1 }] };
    const doc = migrateDocument({ ...createDocument('Drawer'), boards: [...drawerBoards(), rung] });
    const note = keptNote(doc)!;
    expect(note.split('\n')[0]).toBe(`These parts lean, have angled holes, have round tenons or have box joints${HEADER_TAIL}`);
    expect(note).toContain('"Rung" has round tenons and is kept as is:');
  });
});

describe('Refine keeps a box-jointed ASSEMBLY whole (box-joints spec §7, Amended 2026-10-27)', () => {
  const MAX = { distinct: 100, placed: 300 };
  const tableTop = () => createBoard({ id: 'tt', name: 'Table top', length: 40, width: 20, thickness: 0.75, posture: 'flat', position: [0, 0, 0] });
  /** The drawer's bottom: no finger set and no groove (a stored groove is a cut no joint explains: the gate refuses it). */
  const bottom = () => createBoard({ id: 'bt', name: 'Bottom', length: 12, width: 16, thickness: 0.25, posture: 'flat', position: [0.5, 0.5, 0.5] });
  /** The jointed drawer as ONE definition (four jointed sides and a plain bottom) placed twice, beside a plain root table top. */
  const chest = (opts: { defExtra?: StoredBoard[]; rootExtra?: StoredBoard[]; link?: boolean } = {}): SloydDocument => {
    const bt = bottom();
    const roots: StoredBoard[] = [tableTop(), ...(opts.rootExtra ?? [])];
    const raw: SloydDocument = { ...createDocument('Chest'), boards: roots,
      definitions: [{ id: 'dd', boards: [...drawerBoards(), bt, ...(opts.defExtra ?? [])], instances: [], hardware: [] }],
      instances: [{ id: 'i1', name: 'Drawer 1', definition: 'dd', position: [0, 0, 30], rotation: 0 }, { id: 'i2', name: 'Drawer 2', definition: 'dd', position: [20, 0, 30], rotation: 0 }] };
    if (!opts.link) return migrateDocument(raw);
    // The bottom linked to a root panel of the same size (one Shape, a user inside the kept set and one outside it).
    const shelf = roots.find((b) => b.name === 'Shelf')!;
    return migrateDocument(linksToShapes(raw, new Map([[bt, 'L'], [shelf, 'L']])));
  };
  const shelf = () => createBoard({ id: 'sh', name: 'Shelf', length: 12, width: 16, thickness: 0.25, posture: 'flat', position: [50, 0, 0] });
  const part = (name: string, at: [number, number, number], size: [number, number, number]): GeneratedPart =>
    ({ name, role: '', material: 'pine', at: { x: at[0], y: at[1], z: at[2] }, size: { x: size[0], y: size[1], z: size[2] }, tapers: [], miters: [], bevels: [], chamfers: [], holes: [], bands: [], profiles: [] });
  const design = (doc: SloydDocument): GeneratedDesign => {
    const r = documentToDesign(doc, MAX);
    if ('refused' in r) throw new Error(r.refused.message);
    return r.design;
  };

  it('keptParts: the drawer definition and both placements (the same objects), no root board', () => {
    const doc = chest();
    const kept = keptParts(doc);
    expect(kept.definitions).toHaveLength(1);
    expect(kept.definitions[0]).toBe(doc.definitions[0]);
    expect(kept.instances).toHaveLength(2);
    expect(kept.instances[0]).toBe(doc.instances[0]);
    expect(kept.instances[1]).toBe(doc.instances[1]);
    expect(kept.placements).toEqual(['Drawer 1', 'Drawer 2']);
    expect(kept.boards).toEqual([]);
    expect(kept.names).toEqual([]);
    expect(kept.shapes).toEqual([]);
  });

  it('documentToDesign: not refused, and the drawer is left out of `assemblies`', () => {
    const doc = chest();
    expect(leaningInAssembly(doc)).toBeNull();
    expect(keptAssemblyLinkRefusal(doc)).toBeNull();
    const d = design(doc);
    expect(d.assemblies).toEqual([]);
    expect(d.parts.map((p) => p.name)).toEqual(['Table top']);
  });

  it('a LEANING part inside the drawer definition keeps the existing refusal, word for word (R5)', () => {
    const doc = chest({ defExtra: [{ ...stoolLegs()[0]!, id: 'lg' }] });
    expect(documentToDesign(doc, MAX)).toEqual({ refused: { reason: 'lean-assembly',
      message: "Refine can't keep a leaning part, a part with angled holes or a part with a round tenon inside an assembly yet — Ungroup it first: Drawer 1 › Front right." } });
  });

  it('the drawer bottom linked to a root panel refuses, naming the panel (R3)', () => {
    const doc = chest({ rootExtra: [shelf()], link: true });
    const bt = doc.definitions[0]!.boards.find((b) => b.name === 'Bottom')!;
    expect(isShaped(bt)).toBe(true);
    expect(keptParts(doc).shapes.map((s) => s.id)).toEqual([isShaped(bt) ? bt.shape : '']);
    const sentence = "Refine can't keep a box-jointed assembly whose parts are linked to parts outside it — Unlink first: Shelf.";
    expect(keptAssemblyLinkRefusal(doc)).toBe(sentence);
    expect(documentToDesign(doc, MAX)).toEqual({ refused: { reason: 'lean-assembly', message: sentence } });
  });

  it('why R3 refuses: rebuilt from the design, the outside user leaves the kept Shape one user short, and the kept bottom loses it', () => {
    const doc = chest({ rootExtra: [shelf()], link: true });
    const kept = keptParts(doc);
    // The same geometry unlinked gives the design the refusal would otherwise have let through.
    const out = designToDocument(design(chest({ rootExtra: [shelf()] })), { centre: false, kept });
    const bt = out.doc.definitions[0]!.boards.find((b) => b.name === 'Bottom')!;
    expect(isShaped(bt)).toBe(false);
    expect(out.doc.definitions[0]).not.toEqual(kept.definitions[0]);
  });

  it('designToDocument: the kept drawer goes back exactly; a placement and a loose part echoing its placements are dropped (R1, R2)', () => {
    const doc = chest();
    const kept = keptParts(doc);
    const d = design(doc);
    const echoed: GeneratedDesign = { ...d, parts: [...d.parts, part('Drawer 2', [20, 0, 30], [13, 4, 17])],
      assemblies: [{ name: 'Drawer 1', parts: [part('Front', [0, 0, 0], [12, 4, 0.5])], placements: [{ name: 'Drawer 1', at: { x: 0, y: 0, z: 30 } }] }] };
    const out = designToDocument(echoed, { centre: false, kept });
    expect(out.doc.definitions).toEqual(doc.definitions);
    expect(out.doc.instances).toEqual(doc.instances);
    expect(out.doc.boards.map((b) => b.name)).toEqual(['Table top']);
    expect(out.replaced).toEqual(['Drawer 2', 'Drawer 1']);
    // The emptied echo assembly goes silently: never `unplaced`, nothing about it fed back.
    expect(out.rejected).toEqual([]);
    expect(flatDocument(out.doc).boards.map((b) => b.name)).toEqual(flatDocument(doc).boards.map((b) => b.name));
  });

  it('R1: a model placement the gate trims onto a kept name is renamed, never the kept one', () => {
    const doc = chest();
    const kept = keptParts(doc);
    const d = design(doc);
    const echoed: GeneratedDesign = { ...d,
      assemblies: [{ name: 'Crate', parts: [part('Slat', [0, 0, 0], [12, 4, 0.5])], placements: [{ name: 'Drawer 1 ', at: { x: 60, y: 0, z: 0 } }] }] };
    const out = designToDocument(echoed, { centre: false, kept });
    expect(out.doc.instances.map((i) => i.name)).toEqual(['Drawer 1', 'Drawer 2', 'Drawer 1 (1)']);
    expect(out.doc.instances.slice(0, 2)).toEqual(doc.instances);
    expect(out.replaced).toEqual([]);
  });

  it('R2: a loose part the gate trims onto a kept placement name is dropped (parts are deduped before placements)', () => {
    const doc = chest();
    const kept = keptParts(doc);
    const d = design(doc);
    const out = designToDocument({ ...d, parts: [...d.parts, part(' Drawer 2 ', [60, 0, 0], [12, 4, 0.5])] }, { centre: false, kept });
    expect(out.doc.instances).toEqual(doc.instances);
    expect(out.doc.boards.map((b) => b.name)).toEqual(['Table top']);
    expect(out.replaced).toEqual(['Drawer 2']);
  });

  it('lean-only (no box joints): a model placement named like a kept leg survives, renamed by the gate, as before', () => {
    const doc = stoolDocument();
    const kept = keptParts(doc);
    expect(kept.names).toContain('Front right');
    expect(kept.placements).toEqual([]);
    const d = design(doc);
    const out = designToDocument({ ...d, assemblies: [{ name: 'Crate', parts: [part('Slat', [0, 0, 0], [12, 4, 0.5])], placements: [{ name: 'Front right', at: { x: 60, y: 0, z: 0 } }] }] },
      { centre: false, kept });
    expect(out.doc.instances.map((i) => i.name)).toEqual(['Front right (1)']);
    expect(out.doc.boards.filter((b) => b.name === 'Front right')).toEqual(kept.boards.filter((b) => b.name === 'Front right'));
    expect(out.replaced).toEqual([]);
    expect(out.rejected).toEqual([]);
  });

  it('the floor: a kept drawer at y 0 and model parts whose lowest is y 2 — nothing shifts', () => {
    const doc = chest();
    const kept = keptParts(doc);
    const out = designToDocument({ name: 'Chest', parts: [part('Lid', [0, 2, 0], [40, 0.75, 20])], assemblies: [] }, { centre: false, kept });
    expect(out.doc.boards.find((b) => b.name === 'Lid')!.position[1]).toBe(2);
    expect(out.doc.instances).toEqual(doc.instances);
  });

  it('keptNote: one line per kept placement with its world bounds, box joints in the header', () => {
    const lines = keptNote(chest())!.split('\n');
    expect(lines[0]).toBe(`These parts lean, have angled holes or have box joints${HEADER_TAIL}`);
    expect(lines.slice(1, -1)).toEqual([
      '"Drawer 1" is an assembly with box joints and is kept as is: x 0 to 13, y 0 to 4, z 30 to 47.',
      '"Drawer 2" is an assembly with box joints and is kept as is: x 20 to 33, y 0 to 4, z 30 to 47.',
    ]);
  });
});

describe('Refine keeps a headed part exactly, and its assembly whole (counterbores spec §9, the user\'s ruling 2026-10-29)', () => {
  /** A counterbored row (a screw pocket) through a panel's broad face. */
  const CB = { id: 'h1', face: 'thickness' as const, from: 'min' as const, diameter: 0.1875, depth: 'through' as const, along: 'length' as const,
    alongFrom: 'min' as const, station: 6, count: 1, pitch: 0, acrossFrom: 'min' as const, inset: 8, head: 'counterbore' as const, headDiameter: 0.375, headDepth: 0.25 };
  const headed = (id: string, name: string, at: [number, number, number]): Board =>
    ({ ...createBoard({ id, name, length: 12, width: 16, thickness: 0.75, posture: 'flat', position: at }), holes: [{ ...CB }] });
  const tableTop = () => createBoard({ id: 'tt', name: 'Table top', length: 40, width: 20, thickness: 0.75, posture: 'flat', position: [0, 0, 0] });

  it('keptParts keeps a headed root part verbatim (the same object), and the note says why', () => {
    const doc = migrateDocument({ ...createDocument('Shelf'), boards: [tableTop(), headed('sh', 'Shelf', [50, 0, 0])] });
    const sh = doc.boards.find((b) => b.name === 'Shelf')! as Board;
    expect(sh.holes[0]).toEqual({ ...CB });
    expect(keepsExactly(sh)).toBe(true);
    const kept = keptParts(doc);
    expect(kept.boards).toHaveLength(1);
    expect(kept.boards[0]).toBe(sh);
    expect(kept.names).toEqual(['Shelf']);
    expect(kept.definitions).toEqual([]);
    expect(keptWhy(doc, kept)).toEqual(['counterbores or countersinks']);
    const lines = keptNote(doc)!.split('\n');
    expect(lines[0]).toBe(`These parts lean, have angled holes or have counterbores or countersinks${HEADER_TAIL}`);
    expect(lines[1]).toBe('"Shelf" has counterbores or countersinks and is kept as is: x 50 to 62, y 0 to 0.75, z 0 to 16.');
    // A countersink keeps it the same; the headless row does not.
    const { head: _h, headDiameter: _d, headDepth: _p, ...plain } = CB;
    expect(keepsExactly({ ...sh, holes: [{ ...plain, head: 'countersink', headDiameter: 0.375, headAngle: 82 }] } as Board)).toBe(true);
    expect(keepsExactly({ ...sh, holes: [plain] } as Board)).toBe(false);
    expect(hasHeads({ ...sh, holes: [plain] } as Board)).toBe(false);
  });

  it('keeps the assembly holding a headed part: the definition and both placements, no refusal', () => {
    const doc = migrateDocument({ ...createDocument('Cabinet'), boards: [tableTop()],
      definitions: [{ id: 'dd', boards: [headed('sh', 'Shelf', [0, 0, 0]), createBoard({ id: 'sd', name: 'Side', length: 16, width: 12, thickness: 0.75, posture: 'upright', position: [12, 0, 0] })], instances: [], hardware: [] }],
      instances: [{ id: 'i1', name: 'Bay 1', definition: 'dd', position: [0, 0, 30], rotation: 0 }, { id: 'i2', name: 'Bay 2', definition: 'dd', position: [20, 0, 30], rotation: 0 }] });
    expect(leaningInAssembly(doc)).toBeNull();
    expect(keptAssemblyLinkRefusal(doc)).toBeNull();
    const kept = keptParts(doc);
    expect(kept.definitions).toHaveLength(1);
    expect(kept.definitions[0]).toBe(doc.definitions[0]);
    expect(kept.instances).toEqual(doc.instances);
    expect(kept.instances[0]).toBe(doc.instances[0]);
    expect(kept.placements).toEqual(['Bay 1', 'Bay 2']);
    expect(kept.boards).toEqual([]);
    expect(keptWhy(doc, kept)).toEqual(['counterbores or countersinks', 'counterbores or countersinks']);
    const d = documentToDesign(doc, { distinct: 100, placed: 300 });
    if ('refused' in d) throw new Error(d.refused.message);
    expect(d.design.assemblies).toEqual([]);
    expect(d.design.parts.map((p) => p.name)).toEqual(['Table top']);
    const lines = keptNote(doc)!.split('\n');
    expect(lines[0]).toBe(`These parts lean, have angled holes or have counterbores or countersinks${HEADER_TAIL}`);
    expect(lines[1]).toMatch(/^"Bay 1" is an assembly with counterbores or countersinks and is kept as is: /);
  });

  it('a headed part that is box-jointed too: both reasons, box joints first', () => {
    const [front, ...rest] = drawerBoards();
    const doc = migrateDocument({ ...createDocument('Drawer'), boards: [{ ...front!, holes: [{ ...CB, station: 3, inset: 2, headDepth: 0.125, diameter: 0.125, headDiameter: 0.25 }] }, ...rest] });
    const kept = keptParts(doc);
    expect(keptWhy(doc, kept)[0]).toBe('box joints, counterbores or countersinks');
    const lines = keptNote(doc)!.split('\n');
    expect(lines[0]).toBe(`These parts lean, have angled holes, have box joints or have counterbores or countersinks${HEADER_TAIL}`);
    expect(lines[1]).toMatch(/^"Front" has box joints and has counterbores or countersinks, and is kept as is: /);
  });
});
