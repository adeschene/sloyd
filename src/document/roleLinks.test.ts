import { describe, expect, it } from 'vitest';
import { designToDocument } from './generated';
import type { GeneratedAssembly, GeneratedDesign, GeneratedPart } from './generated';
import { migrateDocument } from './document';
import { isShaped } from './shapes';
import { worldParts } from './tree';

const v = (x: number, y: number, z: number) => ({ x, y, z });
const part = (name: string, role: string, at: [number, number, number], size: [number, number, number]): GeneratedPart =>
  ({ name, role, material: 'oak', at: v(...at), size: v(...size) });
const d = (parts: GeneratedPart[], assemblies: GeneratedAssembly[] = []): GeneratedDesign => ({ name: 'T', parts, assemblies });
const LEG: [number, number, number] = [1.75, 28, 1.75];
const legs = (role = 'leg') => [
  part('Leg 1', role, [0, 0, 0], LEG), part('Leg 2', role, [20, 0, 0], LEG),
  part('Leg 3', role, [0, 0, 20], LEG), part('Leg 4', role, [20, 0, 20], LEG),
];
const shapedNames = (doc: ReturnType<typeof designToDocument>['doc']) =>
  [...doc.boards, ...doc.definitions.flatMap((x) => x.boards)].filter(isShaped).map((b) => b.name).sort();

describe('linkByRole (through designToDocument)', () => {
  it('links equal parts of one role', () => {
    const { doc } = designToDocument(d(legs()));
    expect(doc.shapes).toHaveLength(1);
    expect(shapedNames(doc)).toEqual(['Leg 1', 'Leg 2', 'Leg 3', 'Leg 4']);
  });

  it('leaves a differing part of the role plain', () => {
    const ps = legs();
    ps[3] = part('Leg 4', 'leg', [20, 0, 20], [1.75, 27, 1.75]);
    const { doc } = designToDocument(d(ps));
    expect(shapedNames(doc)).toEqual(['Leg 1', 'Leg 2', 'Leg 3']);
  });

  it('links each class of equal parts within one role separately', () => {
    const { doc } = designToDocument(d([
      part('Case L', 'side', [0, 0, 0], [0.75, 30, 12]), part('Case R', 'side', [20, 0, 0], [0.75, 30, 12]),
      part('Drawer L', 'side', [2, 0, 0], [0.5, 4, 10]), part('Drawer R', 'side', [10, 0, 0], [0.5, 4, 10]),
    ]));
    expect(doc.shapes).toHaveLength(2);
    expect(shapedNames(doc)).toHaveLength(4);
  });

  it('does not link equal parts with different roles', () => {
    const { doc } = designToDocument(d([
      part('Top', 'top', [0, 30, 0], [30, 0.75, 11]), part('Shelf', 'shelf', [0, 10, 0], [30, 0.75, 11]),
    ]));
    expect(doc.shapes).toHaveLength(0);
  });

  it('does not link parts with no role', () => {
    const { doc } = designToDocument(d(legs('')));
    expect(doc.shapes).toHaveLength(0);
  });

  it("treats role spelling drift as one role (review focus 3)", () => {
    const ps = legs();
    ps[0] = { ...ps[0], role: 'Leg' };
    ps[1] = { ...ps[1], role: ' leg ' };
    const { doc } = designToDocument(d(ps));
    expect(shapedNames(doc)).toHaveLength(4);
  });

  it('counts a part in a definition placed 3× as ONE user, so alone it stays plain', () => {
    const { doc } = designToDocument(d([], [{
      name: 'Drawer', parts: [part('Side', 'side', [0, 0, 0], [0.5, 4, 10])],
      placements: [{ name: 'A', at: v(0, 0, 0) }, { name: 'B', at: v(0, 5, 0) }, { name: 'C', at: v(0, 10, 0) }],
    }]));
    expect(doc.shapes).toHaveLength(0);
  });

  it('links a loose part with an equal assembly part of the same role', () => {
    const { doc } = designToDocument(d([part('Leg', 'leg', [30, 0, 0], LEG)], [{
      name: 'Frame', parts: [part('Leg', 'leg', [0, 0, 0], LEG)], placements: [{ name: 'F', at: v(0, 0, 0) }],
    }]));
    expect(doc.shapes).toHaveLength(1);
    expect(isShaped(doc.boards[0])).toBe(true);
    expect(isShaped(doc.definitions[0].boards[0])).toBe(true);
  });

  it('links equal shelves running along X and along Z (rotation is own)', () => {
    const { doc } = designToDocument(d([
      part('Shelf A', 'shelf', [0, 0, 0], [30, 0.75, 11]), part('Shelf B', 'shelf', [0, 5, 0], [11, 0.75, 30]),
    ]));
    expect(doc.shapes).toHaveLength(1);
    const [a, b] = worldParts(doc);
    expect([a.length, a.width, a.thickness, a.posture]).toEqual([b.length, b.width, b.thickness, b.posture]);
  });

  it('never stores a role', () => {
    const { doc } = designToDocument(d(legs(), [{
      name: 'Drawer', parts: [part('Side', 'side', [0, 0, 0], [0.5, 4, 10]), part('Side 2', 'side', [5, 0, 0], [0.5, 4, 10])],
      placements: [{ name: 'A', at: v(0, 30, 0) }],
    }]));
    const keys = new Set<string>();
    const walk = (x: unknown): void => {
      if (Array.isArray(x)) x.forEach(walk);
      else if (typeof x === 'object' && x !== null) for (const [k, val] of Object.entries(x)) { keys.add(k); walk(val); }
    };
    walk(doc);
    expect(keys.has('role')).toBe(false);
    expect(JSON.stringify(doc)).not.toMatch(/#\d/); // no class label leaked into a name or id
  });

  it('a linked generated document survives migrateDocument unchanged', () => {
    const { doc } = designToDocument(d(legs()));
    expect(migrateDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  });
});
