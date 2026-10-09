import { describe, expect, it } from 'vitest';
import { carryGrain, documentToDesign } from './refineDesign';
import { designToDocument } from './generated';
import type { GeneratedDesign, GeneratedPart } from './generated';
import { createDocument } from './document';
import { boardExtents } from './geometry';
import { flatDocument } from './tree';
import type { Cut, SloydDocument } from './types';

const MAX = { distinct: 60, placed: 240 };
const v = (x: number, y: number, z: number) => ({ x, y, z });
const part = (name: string, at: [number, number, number], size: [number, number, number], role = ''): GeneratedPart =>
  ({ name, role, material: 'oak', at: v(...at), size: v(...size) });
const LEG: [number, number, number] = [1.75, 28, 1.75];
const TABLE: GeneratedDesign = {
  name: 'Table',
  parts: [part('Top', [0, 28, 0], [30, 1, 20]),
    part('Leg 1', [0, 0, 0], LEG, 'leg'), part('Leg 2', [28.25, 0, 0], LEG, 'leg'),
    part('Leg 3', [0, 0, 18.25], LEG, 'leg'), part('Leg 4', [28.25, 0, 18.25], LEG, 'leg')],
  assemblies: [{ name: 'Drawer', parts: [part('Front', [0, 0, 0], [10, 4, 0.75]), part('Side', [0, 0, 0.75], [0.75, 4, 10])],
    placements: [{ name: 'Left drawer', at: v(2, 20, 0) }, { name: 'Right drawer', at: v(16, 20, 0) }] }],
};
const table = () => designToDocument(TABLE).doc;
const CUT: Cut = { id: 'c1', face: 'thickness', from: 'min', across: 'width', offset: 6, width: 0.75, depth: 0.375, stopMin: 0, stopMax: 0 };
const refused = (doc: SloydDocument) => { const r = documentToDesign(doc, MAX); return 'refused' in r ? r.refused : null; };
const snapshot = (doc: SloydDocument) => flatDocument(doc).boards
  .map((b) => [b.name, b.material, b.position, boardExtents(b)] as const)
  .sort((a, b) => a[0].localeCompare(b[0]));

describe('documentToDesign', () => {
  it('round-trips: converting back (centre: false) reproduces every placed part exactly', () => {
    const doc = table();
    const r = documentToDesign(doc, MAX);
    if ('refused' in r) throw new Error(r.refused.message);
    const back = designToDocument(r.design, { centre: false }).doc;
    expect(snapshot(back)).toEqual(snapshot(doc));
    expect(back.definitions).toHaveLength(1);
    expect(back.instances.map((i) => [i.name, i.position])).toEqual(doc.instances.map((i) => [i.name, i.position]));
  });

  it('gives each shape one linked-<k> role and other parts ""', () => {
    const r = documentToDesign(table(), MAX);
    if ('refused' in r) throw new Error('refused');
    expect(r.design.parts.map((p) => p.role)).toEqual(['', 'linked-1', 'linked-1', 'linked-1', 'linked-1']);
    expect(r.design.assemblies![0].parts.map((p) => p.role)).toEqual(['', '']);
  });

  it('names an assembly after its first placement', () => {
    const r = documentToDesign(table(), MAX);
    if ('refused' in r) throw new Error('refused');
    expect(r.design.assemblies![0].name).toBe('Left drawer');
    expect(r.design.assemblies![0].placements.map((p) => p.name)).toEqual(['Left drawer', 'Right drawer']);
  });

  it('refuses an empty design', () => {
    expect(refused(createDocument('E'))).toEqual({ reason: 'empty', message: 'There is nothing to refine yet.' });
  });

  it('refuses a design with a cut', () => {
    const doc = table();
    const withCut = { ...doc, boards: doc.boards.map((b, i) => (i === 0 ? { ...b, cuts: [CUT] } : b)) } as SloydDocument;
    expect(refused(withCut)).toEqual({ reason: 'cuts', message: 'Refine works on prototypes without joints. Refine first, then add joinery.' });
  });

  it('refuses a turned assembly', () => {
    const doc = table();
    const turned = { ...doc, instances: doc.instances.map((i, k) => (k === 0 ? { ...i, rotation: 90 as const } : i)) };
    expect(refused(turned)?.message).toBe('Refine cannot keep a turned assembly. Turn it back to 0°, or ungroup it.');
  });

  it('refuses a nested assembly', () => {
    const doc = table();
    const d0 = doc.definitions[0];
    const inner = { id: 'inner', name: 'Inner', definition: d0.id, position: [0, 0, 0] as [number, number, number], rotation: 0 as const };
    const nested = { ...doc, definitions: [{ ...d0, instances: [inner] }] };
    expect(refused(nested)?.reason).toBe('nested');
    expect(refused(nested)?.message).toBe('Refine cannot keep an assembly inside another assembly. Ungroup the inner one.');
  });

  it('refuses at 61 distinct parts and not at 60', () => {
    const many = (n: number) => designToDocument({ name: 'M', parts: Array.from({ length: n }, (_, i) => part(`P${i}`, [i * 2, 0, 0], [1, 1, 1])), assemblies: [] }).doc;
    expect(refused(many(60))).toBeNull();
    expect(refused(many(61))).toEqual({ reason: 'too-large', message: 'This design has 61 distinct parts; Refine handles up to 60.' });
  });

  it('refuses at 241 placed parts and not at 240', () => {
    const placed = (n: number) => designToDocument({ name: 'M', parts: [], assemblies: [{ name: 'A', parts: [part('X', [0, 0, 0], [1, 1, 1])],
      placements: Array.from({ length: n }, (_, i) => ({ name: `C${i}`, at: v(i * 2, 0, 0) })) }] }).doc;
    expect(refused(placed(240))).toBeNull();
    expect(refused(placed(241))).toEqual({ reason: 'too-large', message: '241 placed parts; Refine handles up to 240.' });
  });

  it('checks refusals in order: a cut AND a turn reports the cut', () => {
    const doc = table();
    const both = { ...doc, boards: doc.boards.map((b, i) => (i === 0 ? { ...b, cuts: [CUT] } : b)),
      instances: doc.instances.map((i) => ({ ...i, rotation: 90 as const })) } as SloydDocument;
    expect(refused(both)?.reason).toBe('cuts');
  });
});

describe('carryGrain', () => {
  const original = designToDocument({ name: 'G', parts: [{ ...part('Shelf', [0, 0, 0], [30, 0.75, 11]), grain: 'width' }],
    assemblies: [{ name: 'D', parts: [{ ...part('Front', [0, 0, 0], [10, 4, 0.75]), grain: 'width' }], placements: [{ name: 'Top drawer', at: v(0, 5, 0) }] }] }).doc;

  it('gives a part of the same flat name the original grain, and leaves others without one', () => {
    const out = carryGrain({ name: 'G', parts: [part('Shelf', [0, 0, 0], [30, 0.75, 11]), part('New', [0, 1, 0], [5, 1, 1])], assemblies: [] }, original);
    expect(out.parts.map((p) => p.grain)).toEqual(['width', undefined]);
    expect('grain' in out.parts[1]).toBe(false);
  });

  it('matches an assembly part through its placements', () => {
    const out = carryGrain({ name: 'G', parts: [], assemblies: [{ name: 'Whatever', parts: [part('Front', [0, 0, 0], [10, 4, 0.75])],
      placements: [{ name: 'Top drawer', at: v(0, 5, 0) }] }] }, original);
    expect(out.assemblies![0].parts[0].grain).toBe('width');
  });
});
