import { migrateDocument } from './document';
import { worldParts, partAt, childrenOf, instanceAt } from './tree';
import { assemblyDoc } from './treeFixtures';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const raw = (patch: Record<string, unknown> = {}): Any => ({ ...JSON.parse(JSON.stringify(assemblyDoc())), ...patch });
const defs = (): Any => JSON.parse(JSON.stringify(assemblyDoc().definitions));

describe('loading assemblies (assemblies spec §2.4)', () => {
  it('a clean file round-trips unchanged', () => {
    expect(migrateDocument(raw())).toEqual(assemblyDoc());
  });

  it('step 1: a duplicate definition id keeps the FIRST definition', () => {
    const d = defs();
    const doc = migrateDocument(raw({ definitions: [...d, { id: 'd2', boards: [], instances: [] }] }));
    expect(partAt(doc, 'i1/i2/b3')!.name).toBe('Pin');
    expect(doc.definitions.filter((x) => x.id === 'd2')).toHaveLength(1);
  });

  it('step 2: an instance naming a missing definition is dropped', () => {
    const r = raw();
    r.instances.push({ id: 'i9', name: 'Ghost', definition: 'nope', position: [0, 0, 0], rotation: 0 });
    expect(childrenOf(migrateDocument(r), null)).toEqual(['r1', 'i1']);
  });

  it('step 3: an instance that would contain its own definition is dropped', () => {
    const d = defs();
    d[1].instances.push({ id: 'loop', name: 'Loop', definition: 'd2', position: [0, 0, 0], rotation: 0 });
    const doc = migrateDocument(raw({ definitions: d }));
    expect(childrenOf(doc, 'i1/i2')).toEqual(['i1/i2/b3']);
  });

  it('step 4: below v11, a second reference to one definition gets its own copy', () => {
    const r = raw({ version: 10 });
    r.instances.push({ id: 'i7', name: 'Drawer 2', definition: 'd1', position: [30, 0, 0], rotation: 0 });
    const doc = migrateDocument(r);
    expect(instanceAt(doc, 'i1')!.definition).toBe('d1');
    expect(instanceAt(doc, 'i7')!.definition).not.toBe('d1');
    expect(worldParts(doc)).toHaveLength(7);
    expect(new Set(doc.definitions.map((x) => x.id)).size).toBe(doc.definitions.length);
  });

  it('step 4: from v11, a second reference keeps sharing the definition, fixed once', () => {
    const r = raw();
    r.instances.push({ id: 'i7', name: 'Drawer 2', definition: 'd1', position: [30, 0, 0], rotation: 0 });
    const doc = migrateDocument(r);
    expect(instanceAt(doc, 'i7')!.definition).toBe('d1');
    expect(doc.definitions.map((x) => x.id)).toEqual(['d1', 'd2']);
    expect(worldParts(doc)).toHaveLength(7);
  });

  it('step 4: a shared definition that would contain itself is still dropped as a cycle', () => {
    const d = defs();
    d[1].instances.push({ id: 'loop', name: 'Loop', definition: 'd1', position: [0, 0, 0], rotation: 0 });
    const r = raw({ definitions: d });
    r.instances.push({ id: 'i7', name: 'Drawer 2', definition: 'd1', position: [30, 0, 0], rotation: 0 });
    const doc = migrateDocument(r);
    expect(childrenOf(doc, 'i1/i2')).toEqual(['i1/i2/b3']);
    expect(childrenOf(doc, 'i7/i2')).toEqual(['i7/i2/b3']);
    expect(doc.definitions.find((x) => x.id === 'd2')!.instances).toEqual([]);
  });

  it("step 1: a definition whose id is the root's storage id ('ROOT') is dropped with its instances; the file opens", () => {
    const r = raw({ definitions: [...defs(), { id: 'ROOT', boards: [{ id: 'q', name: 'Q', length: 2, width: 1, thickness: 1, position: [0, 0, 0] }], instances: [] }] });
    r.instances.push({ id: 'i9', name: 'Rooted', definition: 'ROOT', position: [0, 0, 0], rotation: 0 });
    const doc = migrateDocument(r);
    expect(childrenOf(doc, null)).toEqual(['r1', 'i1']);
    expect(doc.definitions.some((x) => x.id === 'ROOT')).toBe(false);
    expect(doc.boards.map((b) => b.id)).toEqual(['r1']);
  });

  it('step 5: an unreferenced definition is dropped', () => {
    const doc = migrateDocument(raw({ definitions: [...defs(), { id: 'dz', boards: [], instances: [] }] }));
    expect(doc.definitions.map((x) => x.id)).toEqual(['d1', 'd2']);
  });

  it('step 6: an id containing / is re-minted; sibling names are deduped across parts and assemblies', () => {
    const r = raw();
    r.boards[0].id = 'r/1';
    r.boards[0].name = 'Drawer';
    const doc = migrateDocument(r);
    expect(doc.boards[0]!.id.includes('/')).toBe(false);
    expect(doc.boards[0]!.name).toBe('Drawer');
    expect(doc.instances[0]!.name).toBe('Drawer (1)');
  });

  it('step 6: a duplicate id within one container keeps the first', () => {
    const d = defs();
    d[0].boards[1].id = 'b1';
    const doc = migrateDocument(raw({ definitions: d }));
    expect(partAt(doc, 'i1/b1')!.name).toBe('Side');
    expect(childrenOf(doc, 'i1')).toHaveLength(3);
  });

  it('drops a malformed instance instead of refusing the file', () => {
    const r = raw();
    r.instances.push({ id: 'bad', definition: 'd1', position: [0, 'x', 0] });
    r.instances.push({ name: 'no id', definition: 'd1', position: [0, 0, 0] });
    expect(childrenOf(migrateDocument(r), null)).toEqual(['r1', 'i1']);
  });
});
