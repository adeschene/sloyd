import { describe, expect, it } from 'vitest';
import type { Board, Cut, SloydDocument } from './types';
import { stretchPlan, type StretchPlan } from './stretch';
import { apronTable, framedTable, linkedApronTable } from './stretchFixtures';
import { squareStoolDocument } from './stoolFixture';
import { stretcherPlan, type StretcherPlan } from './stretchers';
import { seatedIn, tenonJoints } from './tenonJoints';
import { builtTenons } from './roundTenons';
import { itemExtents } from './align';
import { flatDocument, partAt, worldParts } from './tree';
import { mapWorld } from './treeEdit';
import { copiesDiffer, inRemovedBand, linkDiffers, STRETCH_LINE_INSIDE, STRETCH_SIZE_POSITIVE } from './stretchText';

// Every expectation is computed by hand off the fixtures' input numbers (stretchFixtures.ts), never by the code under test.

const ok = (r: ReturnType<typeof stretchPlan>): StretchPlan => {
  if (r === null) throw new Error('expected a plan, got null');
  if ('refused' in r) throw new Error(`refused: ${r.refused}`);
  return r;
};
const refusal = (r: ReturnType<typeof stretchPlan>): string => {
  if (r === null || !('refused' in r)) throw new Error('expected a refusal');
  return r.refused;
};
const byName = (doc: SloydDocument, name: string): Board => {
  const b = worldParts(doc).find((p) => p.name === name);
  if (!b) throw new Error(`no part ${name}`);
  return b;
};
const idOf = (doc: SloydDocument, name: string) => byName(doc, name).id;
const idsOf = (doc: SloydDocument, ...names: string[]) => names.map((n) => idOf(doc, n));
const rootIds = (doc: SloydDocument) => [...doc.boards.map((b) => b.id), ...doc.instances.map((i) => i.id)];

/** The test's own deep compare (never the planner's): numbers within 1e-9, every other leaf exactly. */
function closeTo(a: unknown, b: unknown, path = ''): string | null {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-9 ? null : `${path}: ${a} vs ${b}`;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b ? null : `${path}: ${String(a)} vs ${String(b)}`;
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  if (ka.join() !== kb.join()) return `${path}: keys ${ka.join()} vs ${kb.join()}`;
  for (const key of ka) {
    const m = closeTo((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], `${path}.${key}`);
    if (m) return m;
  }
  return null;
}

const cheek = (id: string, at: number): Cut => ({
  id, face: 'thickness', from: 'max', across: 'width', offset: at, width: 1, depth: 0.25, stopMin: 0, stopMax: 0,
});

describe('stretchPlan: the apron table widened on X by 6 at the middle', () => {
  const doc = apronTable();
  const p = ok(stretchPlan(doc, rootIds(doc), 0, 54, 24));

  it('the numbers: from 48, to 54, delta 6', () => {
    expect([p.axis, p.line, p.from, p.to, p.delta]).toEqual([0, 24, 48, 54, 6]);
  });
  it('grows / moves / stays list exactly the parts, in tree order', () => {
    expect(p.grows).toEqual(idsOf(doc, 'Front apron', 'Back apron', 'Top'));
    expect(p.moves).toEqual(idsOf(doc, 'Right back leg', 'Right front leg', 'Right apron'));
    expect(p.stays).toEqual(idsOf(doc, 'Left back leg', 'Left front leg', 'Left apron'));
  });
  it('the top and both long aprons grow 6, their min corners kept', () => {
    expect(byName(p.doc, 'Top').length).toBe(54);
    expect(byName(p.doc, 'Top').position).toEqual([0, 28.5, 0]);
    for (const n of ['Front apron', 'Back apron']) expect(byName(p.doc, n).length).toBe(50.5);
    expect(byName(p.doc, 'Front apron').position).toEqual([1.75, 24.5, 22.75]);
  });
  it('each long apron: the near cheek the same object, the far cheek shifted 6 (43.5 → 49.5)', () => {
    for (const n of ['Front apron', 'Back apron']) {
      const was = partAt(doc, idOf(doc, n)) as Board;
      const now = partAt(p.doc, idOf(doc, n)) as Board;
      expect(now.cuts[0]).toBe(was.cuts[0]);
      expect(now.cuts[1]).toEqual(cheek('far', 49.5));
    }
  });
  it('the right legs and right apron move +6 on X, their mortises the same objects', () => {
    for (const [n, x] of [['Right back leg', 52.25], ['Right front leg', 52.25], ['Right apron', 52.75]] as const) {
      const was = partAt(doc, idOf(doc, n)) as Board;
      const now = partAt(p.doc, idOf(doc, n)) as Board;
      expect(now.position).toEqual([x, was.position[1], was.position[2]]);
      expect(now.cuts).toBe(was.cuts);
      expect(now.length).toBe(was.length);
    }
  });
  it('the left legs and left apron are the same stored objects', () => {
    for (const n of ['Left back leg', 'Left front leg', 'Left apron']) expect(partAt(p.doc, idOf(doc, n))).toBe(partAt(doc, idOf(doc, n)));
  });
});

describe('stretchPlan: the apron table raised on Y by 2 at the middle', () => {
  const doc = apronTable();
  const p = ok(stretchPlan(doc, rootIds(doc), 1, 32, 15));

  it('the legs grow 2 (28.5 → 30.5); the aprons and the top move up 2', () => {
    expect(p.grows).toEqual(idsOf(doc, 'Left back leg', 'Left front leg', 'Right back leg', 'Right front leg'));
    expect(p.moves).toEqual(idsOf(doc, 'Front apron', 'Back apron', 'Left apron', 'Right apron', 'Top'));
    expect(p.stays).toEqual([]);
    for (const n of ['Left back leg', 'Right back leg']) {
      expect(byName(p.doc, n).length).toBe(30.5);
      expect(byName(p.doc, n).position[1]).toBe(0);
    }
    for (const n of ['Front apron', 'Back apron', 'Left apron', 'Right apron']) expect(byName(p.doc, n).position[1]).toBe(26.5);
    expect(byName(p.doc, 'Top').position[1]).toBe(30.5);
  });
  it('the mortise stored from MIN (Left back leg): offset 25 → 27, so world y 27–30', () => {
    const c = byName(p.doc, 'Left back leg').cuts[0]!;
    expect([c.offset, c.width, c.stopMin, c.stopMax]).toEqual([27, 3, 0.5, 0.5]);
  });
  it('the mortise stored from MAX (Right back leg, stopped): stopMin 25 → 27, stopMax 0.5 kept, so world y 27–(30.5 − 0.5)', () => {
    const c = byName(p.doc, 'Right back leg').cuts[0]!;
    expect([c.stopMin, c.stopMax, c.offset, c.width]).toEqual([27, 0.5, 0.5, 0.75]);
    expect(byName(p.doc, 'Right back leg').length - c.stopMax).toBe(30);
  });
});

describe('stretchPlan: shrink back (Review Focus 4)', () => {
  it('widen 6 at x 24, then shrink 6 at x 24: every world part equals the original to 1e-9', () => {
    const doc = apronTable();
    const wide = ok(stretchPlan(doc, rootIds(doc), 0, 54, 24));
    const back = ok(stretchPlan(wide.doc, rootIds(doc), 0, 48, 24));
    expect(back.delta).toBe(-6);
    expect(closeTo(worldParts(back.doc), worldParts(doc))).toBeNull();
  });
  it('the same on the framed table deepened on Z', () => {
    const doc = framedTable();
    const deep = ok(stretchPlan(doc, rootIds(doc), 2, 30, 12));
    const back = ok(stretchPlan(deep.doc, rootIds(doc), 2, 24, 12));
    expect(closeTo(worldParts(back.doc), worldParts(doc))).toBeNull();
  });
});

describe('stretchPlan: copies (spec §6)', () => {
  const defPart = (doc: SloydDocument, name: string) => doc.definitions[0]!.boards.find((b) => b.name === name)! as Board;

  it('framedTable widened on X: the left frame stays and the right one moves as PLACEMENTS; the definition is the same object', () => {
    const doc = framedTable();
    const p = ok(stretchPlan(doc, rootIds(doc), 0, 54, 24));
    expect(p.stays).toEqual(['iL']);
    expect(p.moves).toEqual(['iR']);
    expect(p.grows).toEqual(idsOf(doc, 'Front apron', 'Back apron', 'Top'));
    expect(p.doc.definitions[0]).toBe(doc.definitions[0]);
    expect(p.doc.instances.find((i) => i.id === 'iR')!.position).toEqual([54, 0, 0]);
    expect(p.doc.instances.find((i) => i.id === 'iL')).toBe(doc.instances.find((i) => i.id === 'iL'));
  });

  it('framedTable deepened on Z: both frames span and agree; the definition is written once, its front leg moved 6 ONCE', () => {
    const doc = framedTable();
    const p = ok(stretchPlan(doc, rootIds(doc), 2, 30, 12));
    const leg = (i: string) => `${i}/${defPart(doc, 'Front leg').id}`;
    const apron = (i: string) => `${i}/${defPart(doc, 'End apron').id}`;
    expect(p.grows).toEqual([idOf(doc, 'Top'), apron('iL'), apron('iR')]);
    expect(p.moves).toEqual([idOf(doc, 'Front apron'), leg('iL'), leg('iR')]);
    // Local and world z: 22.25 + 6 = 28.25, not 34.25 (moved twice).
    expect(defPart(p.doc, 'Front leg').position).toEqual([0, 0, 28.25]);
    expect(defPart(p.doc, 'Back leg')).toBe(defPart(doc, 'Back leg'));
    expect(defPart(p.doc, 'End apron').length).toBe(26.5);
    // Turned 90, the apron's length runs toward world −Z in iL (its far end is u 0) and, mirrored, toward +Z in iR. The
    // line is at u 20.5 − (12 − 1.75) = 10.25 either way: the u 0–1 cheek stays where it is stored, the u 19.5–20.5 one
    // (at the world back, the fixed side, in iL) is shifted 6 from the min end: 25.5. Both placements lower to that.
    expect(defPart(p.doc, 'End apron').cuts).toEqual([cheek('near', 0), cheek('far', 25.5)]);
    expect(defPart(p.doc, 'End apron').cuts[0]).toBe(defPart(doc, 'End apron').cuts[0]);
    for (const i of ['iL', 'iR']) {
      const w = worldParts(p.doc);
      expect(w.find((b) => b.id === leg(i))!.position[2]).toBe(28.25);
      const a = w.find((b) => b.id === apron(i))!;
      expect(a.position[2]).toBe(1.75);
      expect(a.length).toBe(26.5);
    }
    expect(byName(p.doc, 'Top').width).toBe(30);
    expect(byName(p.doc, 'Front apron').position[2]).toBe(28.75);
  });

  it('one frame turned 180° (its front leg at the world back): copiesDiffer, naming the first placement found changed', () => {
    const doc = framedTable({ turned: true });
    const before = structuredClone(doc);
    // iR's local back leg moves (world front) while iL's local front leg does: the definition's back leg is lowered
    // through iR, so iL's back leg (expected to stay) moves too. iL's parts are walked first.
    expect(refusal(stretchPlan(doc, rootIds(doc), 2, 30, 12))).toBe(copiesDiffer('End frame'));
    expect(doc).toEqual(before);
  });

  it('a definition with a placement outside the selection, edited inside: copiesDiffer for that placement', () => {
    const doc = framedTable();
    expect(refusal(stretchPlan(doc, ['iL'], 2, 30, 12))).toBe(copiesDiffer('End frame 2'));
  });
});

describe('stretchPlan: links (spec §6)', () => {
  it('two linked aprons both grown 6: one Shape still holds both', () => {
    const doc = linkedApronTable();
    const fa = partAt(doc, idOf(doc, 'Front apron'))!;
    const ba = partAt(doc, idOf(doc, 'Back apron'))!;
    expect('shape' in fa && 'shape' in ba && fa.shape === ba.shape).toBe(true);
    const p = ok(stretchPlan(doc, rootIds(doc), 0, 54, 24));
    expect(p.doc.shapes.length).toBe(doc.shapes.length);
    const fa2 = partAt(p.doc, fa.id)!;
    const ba2 = partAt(p.doc, ba.id)!;
    expect('shape' in fa2 && 'shape' in ba2 && fa2.shape === ba2.shape).toBe(true);
    expect(byName(p.doc, 'Front apron').length).toBe(50.5);
    expect(byName(p.doc, 'Back apron').length).toBe(50.5);
  });
  it('one linked apron grown while its unselected mate is not: linkDiffers', () => {
    const doc = linkedApronTable();
    const ids = rootIds(doc).filter((id) => id !== idOf(doc, 'Back apron'));
    const before = structuredClone(doc);
    expect(refusal(stretchPlan(doc, ids, 0, 54, 24))).toBe(linkDiffers('Front apron', 'Back apron'));
    expect(doc).toEqual(before);
  });
});

describe('stretchPlan: a stretchered base (the square-set stool, front and back rungs at 6)', () => {
  const O = { height: 6, size: 1, diameter: 5 / 8 };
  const plan = (doc: SloydDocument, a: string, b: string): StretcherPlan => {
    const p = stretcherPlan(doc, [idOf(doc, a), idOf(doc, b)], O);
    if (typeof p === 'string') throw new Error(p);
    return p;
  };
  /** The plan applied by hand, as stretchers.test.ts does (the store's Task 4 path). */
  const apply = (doc: SloydDocument, p: StretcherPlan): SloydDocument => {
    let out: SloydDocument = { ...doc, boards: [...doc.boards, p.rung] };
    for (const e of p.legs) out = mapWorld(out, (w) => w.map((b) => (b.id === e.id ? { ...b, holes: e.holes } : b)));
    return out;
  };

  it('widened on X by 2 at x 0: the seat and both rungs grow 2, every tenon still seatedIn', () => {
    const one = apply(squareStoolDocument(), plan(squareStoolDocument(), 'Front right', 'Front left'));
    const doc = apply(one, plan(one, 'Back left', 'Back right'));
    const rungs = worldParts(doc).filter((b) => b.name.startsWith('Stretcher'));
    expect(rungs).toHaveLength(2);
    expect(tenonJoints(flatDocument(doc))).toHaveLength(4);
    const ext = itemExtents(doc, rootIds(doc));
    const min = Math.min(...ext.map((e) => e.min[0]!));
    const max = Math.max(...ext.map((e) => e.max[0]!));
    const p = ok(stretchPlan(doc, rootIds(doc), 0, max - min + 2, 0));
    expect(p.delta).toBeCloseTo(2, 12);
    expect([...p.grows].sort()).toEqual([idOf(doc, 'Seat'), ...rungs.map((r) => r.id)].sort());
    expect(p.moves).toEqual(idsOf(doc, 'Front right', 'Back right'));
    expect(p.stays).toEqual(idsOf(doc, 'Front left', 'Back left'));
    const legs = ['Front right', 'Front left', 'Back left', 'Back right'].map((n) => byName(p.doc, n));
    for (const r of rungs) {
      const now = worldParts(p.doc).find((b) => b.id === r.id)!;
      expect(now.length).toBe(r.length + p.delta);
      const ts = builtTenons(now);
      expect(ts).toHaveLength(2);
      for (const t of ts) expect(legs.some((leg) => leg.holes.some((row) => seatedIn(now, t, leg, row)))).toBe(true);
    }
    expect(tenonJoints(flatDocument(p.doc))).toHaveLength(4);
  });
});

describe('stretchPlan: line, size, no-op, no mutation', () => {
  const doc = apronTable();
  it('the line on the extent\'s face (either side), or outside: the line refusal', () => {
    for (const s of [0, 48, -1, 49, 1e-10]) expect(refusal(stretchPlan(doc, rootIds(doc), 0, 54, s))).toBe(STRETCH_LINE_INSIDE);
  });
  it('size 0 or less: the size refusal, before the line', () => {
    expect(refusal(stretchPlan(doc, rootIds(doc), 0, 0, 24))).toBe(STRETCH_SIZE_POSITIVE);
    expect(refusal(stretchPlan(doc, rootIds(doc), 0, -1, 0))).toBe(STRETCH_SIZE_POSITIVE);
  });
  it('|δ| ≤ 1e-9: null', () => {
    expect(stretchPlan(doc, rootIds(doc), 0, 48, 24)).toBeNull();
    expect(stretchPlan(doc, rootIds(doc), 0, 48 + 1e-10, 24)).toBeNull();
  });
  it('a refused walk (a shrink too short for the long aprons) leaves the document untouched', () => {
    const before = structuredClone(doc);
    // Shrink 46 at x 24 over Front apron and Top (extent 0–48): the apron ends at 46.25 < 24 + 46. Only spanning parts are
    // selected: with the whole table, Right back leg (x 46.25, inside the band 24–70) would refuse first (Ruling 7).
    const ids = idsOf(doc, 'Front apron', 'Top');
    expect(refusal(stretchPlan(doc, ids, 0, 2, 24))).toBe('Front apron is too short to shrink by 46" at this line.');
    expect(doc).toEqual(before);
  });
});

describe('stretchPlan: a shrink never moves a node that starts inside the removed band (Ruling 7)', () => {
  const doc = apronTable();
  const ids = idsOf(doc, 'Front apron', 'Back apron', 'Top');

  it('the repro: aprons at x 1.75, shrink 48 → 46 at x 1.5 (band 1.5–3.5): refused, naming Front apron (first in tree order)', () => {
    const before = structuredClone(doc);
    expect(refusal(stretchPlan(doc, ids, 0, 46, 1.5))).toBe(inRemovedBand('Front apron'));
    expect(inRemovedBand('Front apron')).toBe('Front apron sits in the wood this shrink removes — move the line or shrink less.');
    expect(doc).toEqual(before);
  });
  it('the boundary: shrink 48 → 46.5 at x 0.25 (band 0.25–1.75): the aprons start exactly at 1.75 = s + |δ|, so they pass and land at 0.25', () => {
    const p = ok(stretchPlan(doc, ids, 0, 46.5, 0.25));
    expect(p.delta).toBe(-1.5);
    expect(p.moves).toEqual(idsOf(doc, 'Front apron', 'Back apron'));
    expect(p.grows).toEqual(idsOf(doc, 'Top'));
    expect(byName(p.doc, 'Front apron').position).toEqual([0.25, 24.5, 22.75]);
    expect(byName(p.doc, 'Back apron').position).toEqual([0.25, 24.5, 0.5]);
    expect(byName(p.doc, 'Top').length).toBe(46.5);
  });
});
