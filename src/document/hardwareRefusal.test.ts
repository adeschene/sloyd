import { describe, expect, it } from 'vitest';
import { hardwareHolders, hardwareRefusal } from './hardwareRefusal';
import { createBoard, createDocument } from './document';
import type { Board, Definition, HardwareType, HardwareUse, Instance, Shape, SloydDocument } from './types';

const TYPES: HardwareType[] = [{ id: 'h1', name: 'Hinge', packSize: 1, pricePerPack: null }];
const HW: HardwareUse[] = [{ type: 'h1', count: 2 }];
const part = (id: string, hardware: HardwareUse[] = []): Board => createBoard({ id, name: id, length: 10, width: 4, thickness: 0.75, hardware });
const inst = (id: string, name: string, definition: string): Instance => ({ id, name, definition, position: [0, 0, 0], rotation: 0 });
const docWith = (over: Partial<SloydDocument>): SloydDocument => ({ ...createDocument('HW'), hardwareTypes: TYPES, ...over });
const message = (names: string) => `Refine doesn't handle hardware on parts yet (${names}). Refine before adding hardware, or remove it first.`;

describe('hardwareRefusal (hardware spec §6)', () => {
  it('nothing refused with no hardware, or with the PROJECT\'s only (Refine carries it)', () => {
    expect(hardwareRefusal(docWith({ boards: [part('Shelf')] }))).toBeNull();
    expect(hardwareRefusal(docWith({ boards: [part('Shelf')], hardware: HW }))).toBeNull();
    expect(hardwareHolders(docWith({ boards: [part('Shelf')], hardware: HW }))).toEqual([]);
  });

  it('names a part, by its flat name', () => {
    expect(hardwareRefusal(docWith({ boards: [part('Door', HW), part('Shelf')] }))).toBe(message('Door'));
  });

  it('names a shaped part (its hardware lives on the Shape)', () => {
    const shape: Shape = { id: 's1', length: 10, width: 4, thickness: 0.75, material: 'oak', grain: 'length', posture: 'flat', cuts: [], angleCuts: [], holes: [], curves: [], profiles: [], bands: [], cornerRule: 'long', hardware: HW };
    const shaped = (id: string) => ({ id, name: id, position: [0, 0, 0] as [number, number, number], rotation: 0 as const, shape: 's1' });
    expect(hardwareHolders(docWith({ boards: [shaped('Left door'), shaped('Right door')], shapes: [shape] }))).toEqual(['Left door', 'Right door']);
  });

  it('names an assembly by each placement\'s path name, after the parts; a part inside by its flat name', () => {
    const drawer: Definition = { id: 'd1', boards: [part('Front', HW)], instances: [], hardware: HW };
    const cabinet: Definition = { id: 'd2', boards: [], instances: [inst('i3', 'Drawer', 'd1')], hardware: [] };
    const doc = docWith({ boards: [part('Top', HW)], instances: [inst('i1', 'Left', 'd2'), inst('i2', 'Right', 'd2')], definitions: [drawer, cabinet] });
    expect(hardwareHolders(doc)).toEqual(['Top', 'Left › Drawer › Front', 'Right › Drawer › Front', 'Left › Drawer', 'Right › Drawer']);
    expect(hardwareRefusal(doc)).toBe(message('Top, Left › Drawer › Front, Right › Drawer › Front…'));
  });

  it('an assembly alone is named', () => {
    const drawer: Definition = { id: 'd1', boards: [part('Front')], instances: [], hardware: HW };
    expect(hardwareRefusal(docWith({ instances: [inst('i1', 'Drawer', 'd1')], definitions: [drawer] }))).toBe(message('Drawer'));
  });
});
