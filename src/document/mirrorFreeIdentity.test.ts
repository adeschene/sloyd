import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createDocument, migrateDocument, worldParts } from './document';
import { sharedOf } from './links';
import { chiralAll } from './sweepFixtures';
import type { Board, SloydDocument } from './types';
import { designToDocument, parseDesign } from './generated';
import { SHAKER_TABLE_JSON } from './shakerTableFixture';
import workbenchRaw from './fixtures/simple-workbench.sloyd?raw';

/**
 * Mirrored links (fu 432, Global Constraints: byte for byte). A document with no mirrored part loads, re-saves and
 * resolves exactly as it did at schema 20. Every hash below was captured on the tree BEFORE schema 21 (the
 * `bandFreeIdentity` pattern); `version` is the only key dropped. Never re-capture a literal to make this pass.
 */
const noVersion = (k: string, v: unknown) => (k === 'version' ? undefined : v);
/** Minted ids carry `Date.now()` (ids.ts), so each is renamed by first appearance; their relations are kept (bandFreeIdentity). */
function canonical(json: string): string {
  const seen = new Map<string, string>();
  return json.replace(/id_[0-9a-z]+_[0-9a-z]+/g, (m) => seen.get(m) ?? (seen.set(m, `ID${seen.size}`), `ID${seen.size - 1}`));
}
const sha = (x: unknown) => createHash('sha256').update(canonical(JSON.stringify(x, noVersion))).digest('hex').slice(0, 16);

const at = (b: Board, id: string, name: string, x: number, rotation: Board['rotation'] = 0): Board =>
  ({ ...b, id, name, rotation, position: [x, 0, 0] });
const user = (id: string, name: string, x: number, rotation: Board['rotation']) =>
  ({ id, name, position: [x, 0, 2] as [number, number, number], rotation, shape: 'sh1' });

/** Schema-20 raw files with literal ids: plain featured parts, a Shape (every feature kind) with users at the root and
 *  in an assembly, and that assembly placed twice, once through a MIRRORED instance (`Instance.mirrored`, schema 13). */
function raw20(): SloydDocument {
  const doc: SloydDocument = {
    ...createDocument('Mirror-free'),
    boards: [
      at(chiralAll('flat'), 'p1', 'Top', 0, 90),
      at(chiralAll('on-edge'), 'p2', 'Apron', 30),
      user('s1', 'Left side', 60, 0),
      user('s2', 'Right side', 90, 270),
    ],
    instances: [
      { id: 'i1', name: 'Drawer', definition: 'd1', position: [0, 10, 40], rotation: 0 },
      { id: 'i2', name: 'Drawer 2', definition: 'd1', position: [50, 10, 40], rotation: 90, mirrored: true },
    ],
    definitions: [{ id: 'd1', boards: [user('s3', 'Side', 0, 180), at(chiralAll('upright'), 'p3', 'Front', 10, 270)], instances: [], hardware: [] }],
    shapes: [{ id: 'sh1', ...sharedOf(chiralAll('upright')) }],
  };
  return JSON.parse(JSON.stringify({ ...doc, version: 20 })) as SloydDocument;
}

/** The repo's own fixtures: the Shaker table as Generate builds it, re-saved at schema 20, and the simple workbench file. */
const shaker20 = (): unknown => JSON.parse(JSON.stringify({ ...designToDocument(parseDesign(SHAKER_TABLE_JSON)!, { centre: false }).doc, version: 20 }));
const workbench = (): unknown => JSON.parse(workbenchRaw);

const hasMirroredKey = (bs: readonly object[]) => bs.some((b) => 'mirrored' in b);

describe('a mirror-free schema-20 document is byte for byte as before (fu 432)', () => {
  it('re-saves identically apart from version', () => {
    expect(sha(migrateDocument(raw20()))).toBe('f7dbb547e0e2e322');
  });
  it('resolves identically (worldParts)', () => {
    expect(sha(worldParts(migrateDocument(raw20())))).toBe('19a01ba66eb4478c');
  });
  it.each([['shaker table', shaker20, '4fca9364dfed4c4f', '5f205f824ebad9fa'], ['simple workbench', workbench, 'aaeb75296e6c0cb7', 'd23883de37064e34']] as const)(
    '%s re-saves and resolves identically', (_n, make, save, world) => {
      const d = migrateDocument(make());
      expect(sha(d)).toBe(save);
      expect(sha(worldParts(d))).toBe(world);
      expect(hasMirroredKey(worldParts(d))).toBe(false);
    });
  it('no stored or resolved part carries a `mirrored` key', () => {
    const d = migrateDocument(raw20());
    expect(hasMirroredKey(d.boards)).toBe(false);
    expect(hasMirroredKey(d.definitions.flatMap((x) => x.boards))).toBe(false);
    expect(hasMirroredKey(worldParts(d))).toBe(false);
  });
});
