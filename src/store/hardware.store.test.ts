import { useStore } from './store';
import { createDocument, worldParts } from '../document/document';
import type { Board, HardwareType, SloydDocument } from '../document/document';

const s = () => useStore.getState();
const TYPES: HardwareType[] = [
  { id: 'h-hinge', name: 'Hinge', packSize: 1, pricePerPack: 2 },
  { id: 'h-screw', name: 'Screw', packSize: 100, pricePerPack: null },
];
const part = (id: string, x: number): Board => ({ id, name: id, length: 28, width: 1.75, thickness: 1.75,
  position: [x, 0, 0], rotation: 0, posture: 'upright', grain: 'length', material: 'oak', cuts: [], angleCuts: [], holes: [],
  curves: [], profiles: [], bands: [], cornerRule: 'long', hardware: [] });
const base = (): SloydDocument => ({ ...createDocument('HW'), hardwareTypes: TYPES, boards: [part('a', 0), part('b', 10)] });

beforeEach(() => s().replaceDocument(base()));

describe('setHardware', () => {
  it('a part set is one undo entry and undo restores the previous doc', () => {
    const before = s().doc;
    const past = s().past.length;
    s().setHardware({ kind: 'part', id: 'a' }, 'h-hinge', 2);
    expect(worldParts(s().doc).find((b) => b.id === 'a')!.hardware).toEqual([{ type: 'h-hinge', count: 2 }]);
    expect(s().past.length).toBe(past + 1);
    s().undo();
    expect(s().doc).toBe(before);
  });

  it('null removes; a no-op set writes no entry', () => {
    s().setHardware({ kind: 'part', id: 'a' }, 'h-hinge', 2);
    const past = s().past.length;
    const doc = s().doc;
    s().setHardware({ kind: 'part', id: 'a' }, 'h-hinge', 2);
    s().setHardware({ kind: 'part', id: 'b' }, 'h-hinge', null);
    expect(s().past.length).toBe(past);
    expect(s().doc).toBe(doc);
    s().setHardware({ kind: 'part', id: 'a' }, 'h-hinge', null);
    expect(worldParts(s().doc).find((b) => b.id === 'a')!.hardware).toEqual([]);
    expect(s().past.length).toBe(past + 1);
  });

  it('a shaped part set lands on its Shape and changes every user', () => {
    s().linkBoards(['a', 'b']);
    s().setHardware({ kind: 'part', id: 'a' }, 'h-screw', 4);
    expect(s().doc.shapes[0]!.hardware).toEqual([{ type: 'h-screw', count: 4 }]);
    expect(worldParts(s().doc).map((b) => b.hardware)).toEqual([[{ type: 'h-screw', count: 4 }], [{ type: 'h-screw', count: 4 }]]);
  });

  it('an assembly set changes its definition', () => {
    s().selectAll();
    s().groupSelected();
    const path = s().doc.instances[0]!.id;
    s().setHardware({ kind: 'assembly', path }, 'h-hinge', 3);
    expect(s().doc.definitions[0]!.hardware).toEqual([{ type: 'h-hinge', count: 3 }]);
    expect(s().doc.hardware).toEqual([]);
  });

  it('a project set writes doc.hardware', () => {
    s().setHardware({ kind: 'project' }, 'h-screw', 12);
    expect(s().doc.hardware).toEqual([{ type: 'h-screw', count: 12 }]);
  });

  it('is refused while exploded', () => {
    s().setExplode(0.5);
    const doc = s().doc;
    s().setHardware({ kind: 'project' }, 'h-screw', 12);
    expect(s().doc).toBe(doc);
  });

  it('is refused for an unknown type and for counts 0, 1000, 2.5', () => {
    const doc = s().doc;
    const past = s().past.length;
    s().setHardware({ kind: 'project' }, 'h-nope', 1);
    for (const n of [0, 1000, 2.5, Number.NaN]) s().setHardware({ kind: 'project' }, 'h-hinge', n);
    expect(s().doc).toBe(doc);
    expect(s().past.length).toBe(past);
  });
});

describe('applyMaterials hardware types', () => {
  it('adds the type in one entry; an identical list adds none', () => {
    const next = [...TYPES, { id: 'h-pull', name: 'Pull', packSize: 1, pricePerPack: 3 }];
    const past = s().past.length;
    const before = s().doc;
    s().applyMaterials([], undefined, undefined, next);
    expect(s().doc.hardwareTypes).toEqual(next);
    expect(s().past.length).toBe(past + 1);
    s().applyMaterials([], undefined, undefined, next.map((t) => ({ ...t })));
    expect(s().past.length).toBe(past + 1);
    s().undo();
    expect(s().doc).toBe(before);
  });

  it('rides the assign path in the same entry', () => {
    const next = [...TYPES, { id: 'h-pull', name: 'Pull', packSize: 1, pricePerPack: 3 }];
    const past = s().past.length;
    s().applyMaterials([], { ids: ['a'], material: 'pine' }, undefined, next);
    expect(s().doc.hardwareTypes).toEqual(next);
    expect(worldParts(s().doc)[0]!.material).toBe('pine');
    expect(s().past.length).toBe(past + 1);
  });
});
