import { describe, expect, it } from 'vitest';
import { buildCutList, flatDocument, groupItems } from './document';
import { assemblyDoc } from './treeFixtures';
import { ungroupItem } from './treeOps';

describe('the cut list reads the flat document (assemblies spec §6)', () => {
  it('a grouped document lists the same rows as its flat twin, apart from names', () => {
    const doc = assemblyDoc();
    const flatTwin = ungroupItem(ungroupItem(doc, 'i1')!.doc, 'i2')!.doc;
    // What the sheet PRINTS (formatted strings), so Ungroup's rounding below one
    // level cannot split a row that prints the same.
    const rows = (d: typeof doc) => buildCutList(flatDocument(d)).groups
      .flatMap((g) => g.rows.map((r) => ({ key: r.key, qty: r.qty, dims: r.dims, setup: r.setup })));
    expect(rows(groupItems(doc, null, ['r1'])!.doc)).toEqual(rows(flatTwin));
  });
  it('rows name parts by their display path', () => {
    const names = buildCutList(flatDocument(assemblyDoc())).groups.flatMap((g) => g.rows.flatMap((r) => r.names));
    expect(names).toContain('Drawer › Peg › Pin');
  });
});
