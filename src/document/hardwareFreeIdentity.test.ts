import { describe, expect, it } from 'vitest';
import { buildCutList, createBoard, createDocument, flatDocument } from './document';
import { designToDocument, parseDesign } from './generated';
import { SHAKER_TABLE_JSON } from './shakerTableFixture';
import { buildPurchase, defaultShop } from './purchase';
import type { FlatDocument } from './types';

/** Hardware spec §4: a project with no hardware gives exactly today's cut list and Buying, with or without the new parameter
 *  and with hardware TYPES defined but never used (types are not entries). */
const shaker = (): FlatDocument => flatDocument(designToDocument(parseDesign(SHAKER_TABLE_JSON)!, { centre: false }).doc);
const sheets = (): FlatDocument => flatDocument({
  ...createDocument('S'),
  boards: [
    createBoard({ id: 'a', name: 'Side', material: 'plywood', length: 30, width: 23.25, thickness: 0.75 }),
    createBoard({ id: 'b', name: 'Rail', material: 'pine', length: 34.5, width: 3.5, thickness: 0.75 }),
  ],
});
const TYPES = [{ id: 'h1', name: 'Hinge', packSize: 1, pricePerPack: 2 }];

describe('a hardware-free document: the cut list and Buying are unchanged', () => {
  it.each([['shaker table', shaker], ['sheet goods', sheets]] as const)('%s', (_n, make) => {
    const d = make();
    const withTypes: FlatDocument = { ...d, hardwareTypes: TYPES };
    const shop = defaultShop();
    expect(buildCutList(withTypes)).toEqual(buildCutList(d));
    const list = buildCutList(d);
    const three = buildPurchase(d, list, shop);
    expect(buildPurchase(d, list, shop, [])).toEqual(three);
    expect(buildPurchase(withTypes, buildCutList(withTypes), shop, [])).toEqual(three);
    expect(three.hardware).toBeNull();
  });
});
