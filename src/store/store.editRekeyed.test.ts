import { vi } from 'vitest';

// No real group/ungroup can return an unchanged document, so the no-op guard in
// editRekeyed is reached through the narrowest honest seam: groupItems is made to
// return the SAME document (a no-op edit) when `noop` is set.
const seam = vi.hoisted(() => ({ noop: false }));
vi.mock('../document/document', async (orig) => {
  const actual = await orig<typeof import('../document/document')>();
  return {
    ...actual,
    groupItems: (...args: Parameters<typeof actual.groupItems>) =>
      seam.noop ? { doc: args[0], rekey: (p: string) => p, path: 'x' } : actual.groupItems(...args),
  };
});

import { useStore } from './store';
import { createDocument } from '../document/document';
import { worldParts } from '../document/tree';

const st = () => useStore.getState();

beforeEach(() => {
  seam.noop = false;
  st().replaceDocument(createDocument('Test'));
});

describe('editRekeyed with nothing changed (final-fix 4)', () => {
  it('a no-op group leaves the undo history untouched, and a hide run keeps its entry', () => {
    st().addBoard(); st().addBoard();
    const [a, b] = worldParts(st().doc).map((p) => p.id) as [string, string];
    st().setHidden(a, true);
    const past = st().past;
    st().selectBoard(b);
    seam.noop = true;
    st().groupSelected();
    expect(st().past).toEqual(past);
    expect(st().hiddenIds).toEqual([a]);
    st().undo();
    expect(st().hiddenIds).toEqual([]);
  });

  it('a no-op group on an empty history does not invent an entry', () => {
    st().addBoard();
    const b = worldParts(st().doc)[0]!.id;
    st().replaceDocument(st().doc); // empty past
    st().selectBoard(b);
    seam.noop = true;
    st().groupSelected();
    expect(st().past).toHaveLength(0);
  });
});
