import { describe, expect, it } from 'vitest';
import { buildCutList, weightSentence } from './cutlist';
import { createBoard, createDocument } from './document';
import { catalogOf } from './materials';
import { strips } from './banding';
import { formatWeight } from '../units/quantity';
import { IMPERIAL } from '../units/length';
import type { BandType, Board, CustomMaterial, FlatDocument, SloydDocument } from './types';

const flat = (boards: Board[], extra: Partial<SloydDocument> = {}): FlatDocument => ({ ...createDocument('T'), boards, ...extra } as FlatDocument);
const lb = (b: Board, density: number) => (b.length * b.width * b.thickness / 1728) * density;
const ash: CustomMaterial = { id: 'm-s-ash00001', label: 'Ash', color: '#d8c8a0', kind: 'solid' };
const elm: CustomMaterial = { id: 'm-s-elm00001', label: 'Elm', color: '#c8b890', kind: 'solid' };

describe('the cut list prints weight (weight spec §5.1)', () => {
  const top = createBoard({ id: 't', name: 'Top', material: 'oak', length: 36, width: 20, thickness: 1 });
  const leg = createBoard({ id: 'l', name: 'Leg', material: 'pine', length: 28, width: 1.5, thickness: 1.5 });

  it('each group carries its pounds and its weight; the project line is the sum of the groups', () => {
    const list = buildCutList(flat([top, leg]));
    const oak = list.groups.find((g) => g.material === 'oak')!;
    const pine = list.groups.find((g) => g.material === 'pine')!;
    expect(oak.pounds).toBeCloseTo(lb(top, 44), 12);
    expect(oak.weight).toBe(formatWeight(lb(top, 44), IMPERIAL));
    expect(pine.weight).toBe(formatWeight(lb(leg, 28), IMPERIAL));
    expect(list.pounds).toBe(list.groups.reduce((s, g) => s + g.pounds!, 0));
    expect(list.weight).toBe(`Weight: about ${formatWeight(lb(top, 44) + lb(leg, 28), IMPERIAL)}`);
  });

  it('walnut edging lands in the walnut group, never in the plywood one', () => {
    const walnut: BandType = { id: 'w', name: 'Walnut edging 1/4"', kind: 'solid', thickness: 0.25, lengthAllowance: 0.5, material: 'walnut', widthAllowance: 0.0625 };
    const shelf = createBoard({ id: 's', name: 'Shelf', length: 30, width: 12, thickness: 0.75, material: 'plywood', bands: [{ side: { across: 'width', from: 'max' }, type: 'w' }] });
    const list = buildCutList(flat([shelf], { bandTypes: [walnut] }));
    const w = list.groups.find((g) => g.material === 'walnut')!;
    const p = list.groups.find((g) => g.material === 'plywood')!;
    const [st] = strips(shelf, [walnut]);
    const sv = st!.finished * st!.width * shelf.thickness; // the finished strip (final review I1)
    expect(w.pounds).toBeCloseTo((sv / 1728) * 38, 12);
    expect(p.pounds).toBeCloseTo(((30 * 12 * 0.75 - sv) / 1728) * 36, 12);
    expect(list.pounds).toBeCloseTo(w.pounds! + p.pounds!, 12);
  });

  it('an unweighed material: its group says so and the project line names it', () => {
    const a = createBoard({ id: 'a', name: 'Rail', material: ash.id });
    const list = buildCutList(flat([top, a], { materials: [ash] }));
    expect(list.groups.find((g) => g.material === ash.id)!.weight).toBe('no density');
    expect(list.groups.find((g) => g.material === ash.id)!.pounds).toBeNull();
    expect(list.weight).toBe(`Weight: about ${formatWeight(lb(top, 44), IMPERIAL)}, not counting Ash (no density)`);
  });

  it('nothing weighed: not known, never about 0 lb; two names join with `and`', () => {
    const a = createBoard({ id: 'a', name: 'Rail', material: ash.id });
    const e = createBoard({ id: 'e', name: 'Stile', material: elm.id });
    expect(buildCutList(flat([a], { materials: [ash] })).weight).toBe('Weight: not known (Ash has no density)');
    expect(buildCutList(flat([a, e], { materials: [ash, elm] })).weight).toBe('Weight: not known (Ash and Elm have no density)');
    expect(buildCutList(flat([top, a, e], { materials: [ash, elm] })).weight).toMatch(/, not counting Ash and Elm \(no density\)$/);
  });

  it('a metric project prints kg; an empty project prints no line', () => {
    const list = buildCutList(flat([top], { units: { display: 'metric-mm', precision: 16 } }));
    expect(list.weight).toMatch(/^Weight: about \d+(\.\d)? kg$/);
    expect(buildCutList(flat([])).weight).toBeNull();
  });
});

describe('weightSentence (Properties, weight spec §5.2)', () => {
  const doc = flat([], { materials: [ash, elm] });
  const cat = catalogOf(doc);
  it('about, partial, three names, not known', () => {
    expect(weightSentence({ pounds: 6.2, unweighed: [] }, cat, IMPERIAL)).toBe('about 6.2 lb');
    expect(weightSentence({ pounds: 6.2, unweighed: [ash.id] }, cat, IMPERIAL)).toBe('about 6.2 lb, not counting Ash');
    expect(weightSentence({ pounds: 6.2, unweighed: ['oak', ash.id, elm.id] }, cat, IMPERIAL)).toBe('about 6.2 lb, not counting Oak, Ash and Elm');
    expect(weightSentence({ pounds: 0, unweighed: [ash.id] }, cat, IMPERIAL)).toBe('not known');
  });
});
