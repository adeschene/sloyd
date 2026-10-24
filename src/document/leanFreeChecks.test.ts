import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { checkDesign, type DesignLimits } from './designCheck';
import { createBoard, createDocument, flatDocument, migrateDocument, worldParts } from './document';
import type { FlatDocument } from './document';
import type { Board } from './types';
import { chamferCut, miterCut, taperCut } from './angleCuts';
import { endFacing } from './geometry';
import { designToDocument, parseDesign } from './generated';
import { writeBackFlat } from './treeEdit';
import { SHAKER_TABLE_JSON } from './shakerTableFixture';
import workbenchRaw from './fixtures/simple-workbench.sloyd?raw';
import { findSites } from '../generate/joints/sites';
import { applyJoints } from '../generate/joints/recipes';
import { defaultChoice } from '../generate/joints/choose';
import type { Units } from '../units/length';

/**
 * Splayed legs §7.2 (Global Constraints: lean-free documents byte for byte): the design checks of a document with no
 * leaning part are exactly as before. Every literal below was captured on the tree BEFORE Task 11 touched
 * `designCheck.ts` (the `bandFreeIdentity` pattern). Never re-capture a literal to make this pass.
 */
const sha = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 16);
const NO_LIMITS: DesignLimits = { width: null, depth: null, height: null, maxParts: 100 };
const MM: Units = { display: 'metric-mm', precision: 16 };
const docOf = (...boards: Board[]): FlatDocument => ({ ...createDocument('T'), boards });
const box = (name: string, at: [number, number, number], size: [number, number, number]): Board =>
  createBoard({ name, position: at, length: size[0], thickness: size[1], width: size[2], posture: 'flat', rotation: 0 });

/** The generated Shaker table, unjoined and joined (tenons, tapers; bandFreeIdentity's flow). */
function shakerPlain(): FlatDocument {
  return flatDocument(designToDocument(parseDesign(SHAKER_TABLE_JSON)!, { centre: false }).doc);
}
function shakerJoined(): FlatDocument {
  const made = designToDocument(parseDesign(SHAKER_TABLE_JSON)!, { centre: false });
  const flat = flatDocument(made.doc);
  const sites = findSites(flat);
  const joined = applyJoints(flat, sites, sites.map((s) => defaultChoice(s, flat, sites)));
  return flatDocument(migrateDocument(writeBackFlat(made.doc, flat.boards, worldParts(joined.doc))));
}
const workbench = () => flatDocument(migrateDocument(JSON.parse(workbenchRaw)));

/** Every check kind at once: too small, an overlap, a floating island, a hanging shelf, a tip, angled parts. */
function mixed(): FlatDocument {
  const leg = (name: string, x: number, z: number) =>
    createBoard({ name, posture: 'upright', position: [x, 0, z], length: 20, width: 1.5, thickness: 1.5 });
  const tapered = { ...leg('Tapered', 30, 0), angleCuts: [{ id: 't', ...taperCut({ face: 'width', from: 'max', end: 'min', start: 10, amount: 0.5 }) }] };
  const top = createBoard({ name: 'Top', position: [0, 20, 0], length: 18, width: 18, thickness: 1 });
  const up = { face: 'width' as const, along: 'thickness' as const, alongFrom: endFacing(top, 1, 1), legFace: 0.25, legAlong: 0.25 };
  const chamfered: Board = { ...top, angleCuts: [{ id: 'c1', ...chamferCut({ ...up, from: endFacing(top, 2, -1) }, top) }] };
  const stile = createBoard({ name: 'Stile', posture: 'upright', position: [40, 0, 0], length: 12, width: 1.5, thickness: 0.75 });
  const mitred: Board = { ...stile, angleCuts: [{ id: 'm', ...miterCut({ end: endFacing(stile, 1, 1), across: 'width', longSide: endFacing(stile, 0, 1), ratio: 1 }, stile) }] };
  return docOf(
    leg('Leg 1', 0, 0), leg('Leg 2', 16.5, 0), leg('Leg 3', 0, 16.5), leg('Leg 4', 16.5, 16.5), chamfered,
    box('Shelf', [1.5, 8, 0], [15, 0.75, 18]),             // touches legs on both X ends by a sliver: hangs
    box('Sliver', [5, 21, 5], [4, 1 / 16, 4]),            // too small
    box('Sunk', [8, 20.5, 8], [3, 2, 3]),                 // overlaps the top
    box('IslandA', [60, 5, 0], [10, 1, 10]), box('IslandB', [60, 6, 0], [10, 1, 10]),
    tapered, box('Block', [30.25, 0, 0], [2, 2, 1.5]),    // a block beside a tapered leg
    mitred,
  );
}

/** A heavy post overhanging a base's +X edge, and a tapered-leg stool whose footprint shrinks: tips (taperChecks). */
function tipping(): FlatDocument {
  const base = createBoard({ name: 'Base', length: 10, width: 10, thickness: 0.5, posture: 'flat', position: [0, 0, 0] });
  const post = createBoard({ name: 'Post', length: 20, width: 4, thickness: 4, posture: 'upright', position: [8, 0.5, 3] });
  return docOf(base, post);
}

const run = (doc: FlatDocument, limits = NO_LIMITS, display?: Units) => checkDesign(doc, limits, display);

describe('lean-free check results unchanged (splayed legs §7.2)', () => {
  it.each([
    ['shaker table', shakerPlain, NO_LIMITS, undefined],
    ['shaker table, joined', shakerJoined, NO_LIMITS, undefined],
    ['simple workbench', workbench, NO_LIMITS, undefined],
    ['simple workbench, metric display, tight limits', workbench, { width: 10, depth: 10, height: 10, maxParts: 3 }, MM],
    ['every kind at once', mixed, NO_LIMITS, undefined],
    ['every kind at once, metric display', mixed, { width: 20, depth: 20, height: 20, maxParts: 5 }, MM],
    ['a tip', tipping, NO_LIMITS, undefined],
    ['a tip, metric display', tipping, NO_LIMITS, MM],
  ] as const)('%s', (name, make, limits, display) => {
    const v = run(make(), limits, display);
    const pinned: Record<string, [string, string]> = {
      'shaker table': ['', '4f53cda18c2baa0c'],
      'shaker table, joined': ['', '4f53cda18c2baa0c'],
      'simple workbench': ['hangs:Lower shelf', '393528d5568bf9a6'],
      'simple workbench, metric display, tight limits': ['too-large: | too-large: | too-large: | too-many-parts: | hangs:Lower shelf', '17a3f6d0f772e6c1'],
      'every kind at once': ['too-small:Sliver | overlap:Sunk,Top | overlap:Sunk,Sliver | overlap:Block,Tapered | unsupported:IslandA | unsupported:IslandB | hangs:Shelf', '4877f39d143646fb'],
      'every kind at once, metric display': ['too-small:Sliver | overlap:Sunk,Top | overlap:Sunk,Sliver | overlap:Block,Tapered | unsupported:IslandA | unsupported:IslandB | too-large: | too-large: | too-many-parts: | hangs:Shelf', '0451e0965005fd5a'],
      'a tip': ['tips:', '9f2a1ec68f2c13a2'],
      'a tip, metric display': ['tips:', '05033ceae3691be6'],
    };
    expect([v.map((x) => `${x.kind}:${x.parts.join(',')}`).join(' | '), sha(v)]).toEqual(pinned[name]);
  });
});
