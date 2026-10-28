import { describe, expect, it } from 'vitest';
import { CURRENT_VERSION, createDocument, migrateDocument, validateViews } from './document';
import type { SavedView } from './types';
import { rekeyViews } from './views';

/** Schema 29 (saved views spec §2): `views` on the document. */
const good = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'v1', name: 'Front', camera: { ortho: false, position: [10, 20, 30], target: [0, 5, 0] },
  section: null, explode: 0, hidden: [], ...over,
});
const goodOrtho = (over: Record<string, unknown> = {}): Record<string, unknown> =>
  good({ id: 'v2', name: 'Plan', camera: { ortho: true, position: [0, 50, 0], target: [0, 0, 0], height: 40 }, ...over });
const cam = (over: Record<string, unknown>) => ({ ortho: false, position: [1, 2, 3], target: [0, 0, 0], ...over });
const load = (views: unknown) => migrateDocument({ ...createDocument('T'), views }).views;

describe('schema 29: SavedView (saved views spec §2)', () => {
  it('createDocument has no views', () => {
    expect(createDocument().views).toEqual([]);
    expect(CURRENT_VERSION).toBe(29);
  });

  it('a 28 file loads with views []', () => {
    const { views: _v, ...rest } = createDocument('T');
    expect(migrateDocument({ ...rest, version: 28 }).views).toEqual([]);
  });

  it('a 30 file is refused', () => {
    expect(() => migrateDocument({ ...createDocument('T'), version: 30 })).toThrow(/newer version of Sloyd/);
  });

  it('round trip', () => {
    const doc = { ...createDocument('T'), views: [good(), goodOrtho()] as unknown as SavedView[] };
    const back = migrateDocument(JSON.parse(JSON.stringify(doc)));
    expect(back.views).toEqual(doc.views);
  });

  describe('drops', () => {
    const cases: [string, unknown][] = [
      ['non-object', 'x'],
      ['name not a string', good({ name: 4 })],
      ['name blank', good({ name: '   ' })],
      ['ortho not boolean', good({ camera: cam({ ortho: 'yes' }) })],
      ['position of 2 numbers', good({ camera: cam({ position: [1, 2] }) })],
      ['target with NaN', good({ camera: cam({ target: [0, NaN, 0] }) })],
      ['ortho height 0', goodOrtho({ camera: cam({ ortho: true, height: 0 }) })],
      ['ortho height missing', goodOrtho({ camera: cam({ ortho: true }) })],
      ['explode Infinity', good({ explode: Infinity })],
      ['section bad axis', good({ section: { axis: 'diagonal', at: 1, flip: false } })],
      ['section at NaN', good({ section: { axis: 'top', at: NaN, flip: false } })],
      ['section flip not boolean', good({ section: { axis: 'top', at: 1, flip: 'no' } })],
    ];
    for (const [label, v] of cases) it(label, () => expect(validateViews([v])).toEqual([]));
  });

  describe('keeps and repairs', () => {
    it('clamps explode', () => {
      expect(validateViews([good({ explode: 1.5 })])[0]!.explode).toBe(1);
      expect(validateViews([good({ explode: -0.2 })])[0]!.explode).toBe(0);
    });
    it('drops a perspective height', () => {
      const v = validateViews([good({ camera: cam({ height: 5 }) })])[0]!;
      expect('height' in v.camera).toBe(false);
    });
    it('keeps an ortho height and a valid section', () => {
      const v = validateViews([goodOrtho({ section: { axis: 'side', at: 3, flip: true } })])[0]!;
      expect(v.camera.height).toBe(40);
      expect(v.section).toEqual({ axis: 'side', at: 3, flip: true });
    });
    it('filters and dedupes hidden', () => {
      expect(validateViews([good({ hidden: ['a', 3, 'a', 'b'] })])[0]!.hidden).toEqual(['a', 'b']);
      expect(validateViews([good({ hidden: 'x' })])[0]!.hidden).toEqual([]);
    });
    it('trims the name', () => {
      expect(validateViews([good({ name: '  Joint  ' })])[0]!.name).toBe('Joint');
    });
    it('deduplicates names in order', () => {
      const v = validateViews([good({ id: 'a', name: 'Joint' }), good({ id: 'b', name: 'Joint' })]);
      expect(v[0]!.name).toBe('Joint');
      expect(v[1]!.name).not.toBe('Joint');
    });
    it('repairs duplicate ids, first keeps', () => {
      const v = validateViews([good({ id: 'v1', name: 'A' }), good({ id: 'v1', name: 'B' })]);
      expect(v[0]!.id).toBe('v1');
      expect(v[1]!.id).not.toBe('v1');
    });
    it('non-array views is []', () => {
      expect(load('nope')).toEqual([]);
      expect(load(undefined)).toEqual([]);
    });
  });
});

describe('rekeyViews (saved views spec §2)', () => {
  const withHidden = (hidden: string[]) => ({ ...createDocument('T'), views: [good({ hidden }) as unknown as SavedView] });
  it('maps ids through rekey', () => {
    const out = rekeyViews(withHidden(['a', 'b']), (p) => (p === 'a' ? 'g/a' : p));
    expect(out.views[0]!.hidden).toEqual(['g/a', 'b']);
  });
  it('lifts a dissolved assembly to its children, deduplicated', () => {
    const out = rekeyViews(withHidden(['g', 'a']), (p) => p, (p) => (p === 'g' ? ['a', 'b'] : null));
    expect(out.views[0]!.hidden).toEqual(['a', 'b']);
  });
  it('returns the same doc when nothing changes', () => {
    const d = withHidden(['a']);
    expect(rekeyViews(d, (p) => p)).toBe(d);
  });
});
