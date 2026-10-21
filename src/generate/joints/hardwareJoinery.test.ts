import { describe, expect, it, vi } from 'vitest';
import f2 from './fixtures/2-frames-phantom.json?raw';
import { designToDocument } from '../../document/generated';
import { flatDocument, migrateDocument } from '../../document/document';
import type { SloydDocument } from '../../document/document';
import { hardwareTotals } from '../../document/hardware';
import type { HardwareType, HardwareUse } from '../../document/types';
import { LlmError } from '../../llm/types';
import type { LlmClient } from '../../llm/types';
import { runJoinery } from '../run';
import { repairDocument } from './repair';

/**
 * Add joinery and Repair ACCEPT hardware projects (hardware spec §6): the write-back edits cuts and sizes through changed
 * fields only (invariant 46), and a split-off definition copy carries its assembly's hardware (`copyDefinition`, the
 * spec's *Amended (builder check)*). A split re-mints definition ids, so the assertion is totals unchanged and every
 * placed part's entries byte-identical, never the document as a whole.
 */

const TYPES: HardwareType[] = [
  { id: 'h1', name: 'Hinge', packSize: 1, pricePerPack: null },
  { id: 'h2', name: 'Pull', packSize: 1, pricePerPack: 3 },
  { id: 'h3', name: 'Screw', packSize: 100, pricePerPack: 9 },
  { id: 'h4', name: 'Shelf pin', packSize: 20, pricePerPack: null },
];
const hw = (...e: [string, number][]): HardwareUse[] => e.map(([type, count]) => ({ type, count }));
const v = (x: number, y: number, z: number) => ({ x, y, z });
/** Two role-linked shelves well away from the frames (one Shape, no meeting with anything). */
const SHELVES = designToDocument({ name: 'S', assemblies: [], parts: [
  { name: 'Shelf A', role: 'shelf', material: 'oak', at: v(100, 0, 0), size: v(20, 0.75, 10) },
  { name: 'Shelf B', role: 'shelf', material: 'oak', at: v(100, 0, 40), size: v(20, 0.75, 10) },
] }).doc;

/**
 * Hardware on every holder kind, through the load gate: the loose `Stretcher` (a plain part that gets a joint), the
 * frame's `Leg` (a part inside an assembly placed twice), the shaped shelves (on their Shape), the frame's definition
 * (an assembly placed twice) and the project.
 */
function kit(doc: SloydDocument): SloydDocument {
  return migrateDocument({
    ...doc,
    hardwareTypes: TYPES,
    hardware: hw(['h3', 40]),
    boards: [...doc.boards.map((b) => (b.name === 'Stretcher' ? { ...b, hardware: hw(['h2', 1]) } : b)), ...SHELVES.boards],
    shapes: [...doc.shapes, ...SHELVES.shapes.map((s) => ({ ...s, hardware: hw(['h4', 4]) }))],
    definitions: doc.definitions.map((d) => ({ ...d, hardware: hw(['h3', 8]),
      boards: d.boards.map((b) => (b.name === 'Leg' ? { ...b, hardware: hw(['h1', 2]) } : b)) })),
  });
}

/** Per type: the type and its total. Not the where-used lines: a split turns one holder placed twice into two placed
 *  once each (`Frame × 2` becomes `Front`, `Back`), with the same total. */
const totals = (doc: SloydDocument) => hardwareTotals(doc).map((t) => [t.type.id, t.total]);
const typeTotals = (doc: SloydDocument) => hardwareTotals(doc).map((t) => ({ type: t.type, total: t.total }));
const partEntries = (doc: SloydDocument) => Object.fromEntries(flatDocument(doc).boards.map((b) => [b.name, JSON.stringify(b.hardware)]));
const EXPECTED = [['h1', 4], ['h2', 1], ['h3', 56], ['h4', 8]];

/** Both sides of the claim: totals unchanged, and every placed part's entries byte-identical (none lost, none added). */
function expectKept(before: SloydDocument, after: SloydDocument) {
  expect(totals(after)).toEqual(totals(before));
  expect(typeTotals(after)).toEqual(typeTotals(before));
  expect(partEntries(after)).toEqual(partEntries(before));
}

describe('Add joinery keeps hardware (hardware spec §6)', () => {
  // runJoinery.test's 'twins that get DIFFERENT joints' design: the Stretcher enters the FRONT leg only, so the Frame
  // definition splits. An overloaded client: every site takes its default joint, no call answered (no paid call).
  const frames = kit(designToDocument({ name: 'Frames', parts: [
    { name: 'Stretcher', role: '', material: 'oak', at: v(-10, 10, 0.5), size: v(10, 3, 0.75) },
  ], assemblies: [{
    name: 'Frame',
    parts: [
      { name: 'Leg', role: '', material: 'oak', at: v(0, 0, 0), size: v(1.75, 28, 1.75) },
      { name: 'Rail', role: '', material: 'oak', at: v(1.75, 23.5, 0.5), size: v(18, 3, 0.75) },
    ],
    placements: [{ name: 'Front', at: v(0, 0, 0) }, { name: 'Back', at: v(0, 0, 30) }],
  }] }).doc);
  const client: LlmClient = {
    complete: vi.fn(async () => { throw new LlmError('overloaded', 'Overloaded.'); }),
    userTurn: (t) => t,
    estimateCostUsd: () => 0,
  };

  it('the fixture is what it claims: every holder kind carries hardware', () => {
    expect(totals(frames)).toEqual(EXPECTED);
    expect(frames.definitions).toHaveLength(1);
    expect(frames.shapes).toHaveLength(1);
    expect(frames.shapes[0]!.hardware).toEqual(hw(['h4', 4]));
  });

  it('joins and splits the shared frame; totals and every part\'s entries are unchanged', async () => {
    const out = await runJoinery(client, frames, new AbortController().signal, () => {});
    if ('noSites' in out || 'refused' in out) throw new Error('expected sites');
    const doc = out.result.doc;
    expect(out.result.applied.length).toBeGreaterThan(0);
    expect(doc.definitions).toHaveLength(2);   // the split this test is about
    expect(doc.definitions.map((d) => d.hardware)).toEqual([hw(['h3', 8]), hw(['h3', 8])]);
    expect(doc.hardware).toEqual(hw(['h3', 40]));
    expect(doc.hardwareTypes).toEqual(TYPES);
    expectKept(frames, doc);
  });
});

describe('Repair keeps hardware (hardware spec §6)', () => {
  // Fixture 2: Repair splits Front from Back (repair.test's 'fixture 2 splits Front from Back').
  const damaged = kit(JSON.parse(f2).damaged);

  it('the fixture is what it claims: every holder kind carries hardware', () => {
    expect(totals(damaged)).toEqual(EXPECTED);
    expect(damaged.shapes).toHaveLength(1);
  });

  it('repairs and splits; totals and every part\'s entries are unchanged', () => {
    const r = repairDocument(damaged);
    if (r === null || 'refused' in r) throw new Error('expected a repair');
    expect(r.splits).toEqual([['Front', 'Back']]);
    expect(r.doc.definitions).toHaveLength(2);
    expect(r.doc.hardware).toEqual(hw(['h3', 40]));
    expect(r.doc.hardwareTypes).toEqual(TYPES);
    expectKept(damaged, r.doc);
  });
});
