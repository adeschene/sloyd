import { describe, expect, it } from 'vitest';
import f1 from './fixtures/1-frames-duplicates.json?raw';
import f2 from './fixtures/2-frames-phantom.json?raw';
import f3 from './fixtures/3-frames-turned.json?raw';
import f4 from './fixtures/4-cases-every-kind.json?raw';
import f5 from './fixtures/5-rail-enters-once.json?raw';
import f6 from './fixtures/6-nested.json?raw';
import { flatDocument, makeUniqueItem, migrateDocument, removeItems, writeBackFlat } from '../../document/document';
import type { Board, Cut, FlatDocument, SloydDocument } from '../../document/document';
import { findSites, jointKey } from './sites';
import { applyJoints } from './recipes';
import { cutBox, gateUnjoin, sameCut, sameJoined } from './unjoin';
import type { RecordedJoint } from './unjoin';
import { REPAIR_REFUSAL, repairDocument, repairJoints, splitCopies, storedKeys } from './repair';

type Fx = { plain: SloydDocument; choices: RecordedJoint[]; damaged: SloydDocument };
const load = (raw: string): Fx => { const j = JSON.parse(raw); return { plain: migrateDocument(j.plain), choices: j.choices, damaged: migrateDocument(j.damaged) }; };
const DAMAGED: [string, string, number][] = [['1', f1, 2], ['2', f2, 3], ['3', f3, 2], ['4', f4, 12], ['6', f6, 12]];

/** Today's (fixed) joinery over the saved plain input and choices: independent of the code under test. */
function oracle(fx: Fx): FlatDocument {
  const flat = flatDocument(fx.plain);
  const sites = findSites(flat);
  const rec = new Map(fx.choices.map((c) => [jointKey(c.enter, c.receive, c.axis, c.side), c.choice]));
  const key = (s: (typeof sites)[number]) => jointKey(flat.boards[s.enter]!.name, flat.boards[s.receive]!.name, s.axis, s.side);
  return applyJoints(flat, sites, sites.map((s) => ({ site: s.id, ...(rec.get(key(s)) ?? { joint: 'butt' as const }) }))).doc;
}
/**
 * Today's joinery as the app stores it: written back into the tree, then flattened. The oracle's own
 * ids are re-minted (applyJoints ends in migrateDocument, which re-mints a `/` id, invariant 33), so
 * it has no twins; the write-back maps by index and keeps the tree's ids, as useJoinery does.
 */
const joinedTodayDoc = (fx: Fx): SloydDocument => migrateDocument(writeBackFlat(fx.plain, flatDocument(fx.plain).boards, oracle(fx).boards));
const joinedToday = (fx: Fx): FlatDocument => flatDocument(joinedTodayDoc(fx));
/** repairJoints over a document, with its storage keys (spec §2 step 4). */
const repairOf = (doc: SloydDocument) => repairJoints(flatDocument(doc), storedKeys(doc));
/** A storage key no other part has: for a board appended to a flat list (an unrelated part). */
let fresh = 0;
const freshKey = () => `test-only\u0000${++fresh}`;
const repaired = (fx: Fx) => {
  const flat = flatDocument(fx.damaged);
  const r = repairJoints(flat, storedKeys(fx.damaged));
  if (r === null || 'refused' in r) throw new Error(`expected a repair, got ${JSON.stringify(r)}`);
  return { flat, r, out: { ...flat, boards: r.boards } as FlatDocument };
};

describe('the fixtures are damaged as recorded', () => {
  it.each(DAMAGED)('fixture %s: Refine’s gate refuses it', (_n, raw) => {
    expect(gateUnjoin(flatDocument(load(raw).damaged))).toHaveProperty('refused');
  });
});

describe('repairJoints on the damaged fixtures', () => {
  it.each(DAMAGED)('fixture %s equals today’s joinery over its plain input (the oracle)', (_n, raw) => {
    const fx = load(raw);
    expect(sameJoined(repaired(fx).out, oracle(fx))).toBe(true);
  });
  it.each(DAMAGED)('fixture %s removes exactly the recorded count', (_n, raw, n) => {
    expect(repaired(load(raw)).r.dropped).toBe(n);
  });
  it.each(DAMAGED)('fixture %s is subtractive: everything but cuts as stored, every surviving cut a stored cut object’s values', (_n, raw) => {
    const { flat, out } = repaired(load(raw));
    out.boards.forEach((b, i) => {
      const { cuts, ...rest } = b; const { cuts: was, ...wasRest } = flat.boards[i]!;
      expect(rest).toEqual(wasRest);
      for (const c of cuts) expect(was).toContainEqual(c);
    });
  });
  it.each(DAMAGED)('fixture %s passes Refine’s gate afterwards', (_n, raw) => {
    expect(gateUnjoin(repaired(load(raw)).out)).not.toHaveProperty('refused');
  });
});

describe('repairJoints returns null for designs this bug did not damage', () => {
  it('a plain design', () => { expect(repairOf(load(f1).plain)).toBeNull(); });
  it('fixture 5 (joined by the buggy code, undamaged: waste cuts were never aliased)', () => {
    expect(repairOf(load(f5).damaged)).toBeNull();
  });
  it('a shared assembly joined with TODAY’s joinery', () => {
    const o = joinedToday(load(f2));
    expect(o.boards.some((b) => b.cuts.length > 0 && o.boards.some((t) => t !== b && t.id.split('/').pop() === b.id.split('/').pop()))).toBe(true); // twins with cuts: past the pre-check
    expect(repairOf(joinedTodayDoc(load(f2)))).toBeNull();
  });
  it('the same with a hand-added cut (evidence rule: Refine’s gate message stands)', () => {
    const doc = joinedTodayDoc(load(f2));
    const o = flatDocument(doc);
    const i = o.boards.findIndex((b) => b.name === 'Back › Leg');
    // 3in lower along the leg (an offset change would put it off the board, removing nothing).
    const c0 = o.boards[i]!.cuts[0]!;
    const hand = { ...c0, id: 'hand', stopMin: c0.stopMin - 3, stopMax: c0.stopMax + 3 };
    const flat = { ...o, boards: o.boards.map((b, k) => (k === i ? { ...b, cuts: [...b.cuts, hand] } : b)) };
    expect(repairJoints(flat, storedKeys(doc))).toBeNull();
  });
  it('an unrelated part sharing a twin’s id but not its name, carrying its mortise twice (name condition)', () => {
    // Stored apart (a fresh key), so step 4 cannot make its mortise a stray whatever the name rule
    // says; the doubled mortise is what pins the name: taken for a twin, step 2 would drop one copy
    // (evidence) and the other, unexplained and no stray, would refuse.
    const doc = joinedTodayDoc(load(f1));
    const o = flatDocument(doc);
    const leg = o.boards.find((b) => b.name === 'Front › Leg')!;
    expect(leg.cuts.length).toBeGreaterThan(0);
    const spare: Board = { ...leg, id: `elsewhere/${leg.id.split('/').pop()}`, name: 'Elsewhere › Spare', position: [100, 0, 100], cuts: [...leg.cuts, { ...leg.cuts[0]!, id: 'again' }] };
    expect(repairJoints({ ...o, boards: [...o.boards, spare] }, [...storedKeys(doc), freshKey()])).toBeNull();
  });
  it('a copy Made Unique, then its entering part deleted: the orphaned pocket is not the bug’s (final review I1)', () => {
    // Today's joinery over shared frames; Make Unique on Back (ids kept); delete Back › Rail. The Back
    // leg's mortise is now unexplained and equals the Front leg's explained one, but the two legs are
    // stored apart: not a twin stray, so no note (spec §2 step 4, the user's ruling).
    const joined = joinedTodayDoc(load(f1));
    expect(repairDocument(joined)).toBeNull();
    const back = joined.instances.find((x) => x.name === 'Back')!;
    const unique = makeUniqueItem(joined, back.id)!;
    expect(unique).not.toBeNull();
    const rail = flatDocument(unique).boards.find((b) => b.name === 'Back › Rail')!;
    const doc = migrateDocument(removeItems(unique, [rail.id]));
    expect(flatDocument(doc).boards.some((b) => b.name === 'Back › Rail')).toBe(false);
    expect(gateUnjoin(flatDocument(doc))).toHaveProperty('refused'); // the orphan really is unexplained
    expect(repairDocument(doc)).toBeNull();
  });
});

describe('repairJoints refuses damage it cannot account for', () => {
  const keys2 = storedKeys(load(f2).damaged);
  const tweak = (raw: string, name: string, f: (b: Board) => Board) => {
    const flat = flatDocument(load(raw).damaged);
    return { ...flat, boards: flat.boards.map((b) => (b.name === name ? f(b) : b)) };
  };
  it('a damaged fixture plus a hand-added cut', () => {
    const flat = tweak(f2, 'Front › Rail', (b) => ({ ...b, cuts: [...b.cuts, { ...b.cuts[0]!, id: 'hand', offset: b.cuts[0]!.offset + 1 }] }));
    expect(repairJoints(flat, keys2)).toEqual({ refused: REPAIR_REFUSAL });
  });
  it('a phantom moved 1/16in (a near-miss is not a twin stray)', () => {
    const o = oracle(load(f2));
    const back = o.boards.findIndex((b) => b.name === 'Back › Leg');
    const isPhantom = (c: Cut) => !o.boards[back]!.cuts.some((d) => sameCut(c, d));
    const flat = tweak(f2, 'Back › Leg', (b) => ({ ...b, cuts: b.cuts.map((c) => (isPhantom(c) ? { ...c, offset: c.offset + 1 / 16 } : c)) }));
    expect(repairJoints(flat, keys2)).toEqual({ refused: REPAIR_REFUSAL });
  });
  it('a damaged fixture with a joined part resized by hand', () => {
    // The shelf is dadoed at both ends, so a longer shelf cannot round-trip (a rail's free end could).
    // Measured: the deeper overlap reads back as a deeper dado, so the pocket IS explained and the
    // step-5 re-join match refuses (a stored cut on `Left case › Right` has no match). The emptiness
    // condition is pinned by the shortened-shelf test below, not by this one.
    const flat = tweak(f4, 'Left case › Shelf', (b) => ({ ...b, length: b.length + 0.5 }));
    expect(repairJoints(flat, storedKeys(load(f4).damaged))).toEqual({ refused: REPAIR_REFUSAL });
  });
  it('a damaged fixture with a joined part shortened by hand, still partly in its pocket (filled, so not a stray)', () => {
    // Measured: the lengthened shelf above is caught by the re-join match (step 5), its pocket read
    // back as a deeper dado. Shortened by less than the dado depth, the shelf's far pocket is no
    // longer inside its overlap (unexplained) yet still partly filled; the twin case's identical
    // pocket is explained. Only the emptiness condition refuses it.
    const flat = tweak(f4, 'Left case › Shelf', (b) => ({ ...b, length: b.length - 1 / 8 }));
    expect(repairJoints(flat, storedKeys(load(f4).damaged))).toEqual({ refused: REPAIR_REFUSAL });
  });
  it('a damaged fixture with a part placed inside its phantom (occupied, so not a stray)', () => {
    const flat = flatDocument(load(f2).damaged);
    const o = oracle(load(f2));
    const back = flat.boards.findIndex((b) => b.name === 'Back › Leg');
    // The phantom: the Back leg's cut that today's joinery does not make.
    const phantom = flat.boards[back]!.cuts.find((c) => !o.boards[back]!.cuts.some((d) => sameCut(c, d)))!;
    const box = cutBox(flat.boards[back]!, phantom);
    const filler: Board = { ...flat.boards[0]!, id: 'filler', name: 'Filler', cuts: [], posture: 'flat', rotation: 0,
      position: [...box.min] as [number, number, number], length: box.max[0] - box.min[0], width: box.max[2] - box.min[2], thickness: box.max[1] - box.min[1] };
    // Check the filler really covers the box (posture decides which dimension runs on which axis):
    // if worldSolids(filler)[0] does not equal the box, fix the FILLER's dimensions, not the expectation.
    expect(repairJoints({ ...flat, boards: [...flat.boards, filler] }, [...keys2, freshKey()])).toEqual({ refused: REPAIR_REFUSAL });
  });
});

describe('repairJoints reorders to the re-join’s order', () => {
  it('a damaged fixture with one part’s stored cuts reversed still repairs, in the oracle’s order', () => {
    const fx = load(f4);
    const flat = flatDocument(fx.damaged);
    const i = flat.boards.findIndex((b) => b.name === 'Left case › Left');
    const rev = { ...flat, boards: flat.boards.map((b, k) => (k === i ? { ...b, cuts: [...b.cuts].reverse() } : b)) };
    const r = repairJoints(rev, storedKeys(fx.damaged));
    if (r === null || 'refused' in r) throw new Error('expected a repair');
    expect(sameJoined({ ...flat, boards: r.boards }, oracle(fx))).toBe(true);
  });
});

describe('repairDocument', () => {
  it('fixtures 1, 4 and 6 keep their definitions shared; nothing split', () => {
    for (const raw of [f1, f4, f6]) {
      const fx = load(raw); const r = repairDocument(fx.damaged);
      if (r === null || 'refused' in r) throw new Error('expected a repair');
      expect(r.doc.definitions).toHaveLength(fx.damaged.definitions.length);
      expect(r.splits).toEqual([]);
    }
  });
  it('fixture 2 splits Front from Back (their copies now differ)', () => {
    const fx = load(f2); const r = repairDocument(fx.damaged);
    if (r === null || 'refused' in r) throw new Error('expected a repair');
    expect(r.doc.definitions).toHaveLength(2);
    expect(r.splits).toEqual([['Front', 'Back']]);
  });
  it('fixture 3 stays split as stored', () => {
    const fx = load(f3); const r = repairDocument(fx.damaged);
    if (r === null || 'refused' in r) throw new Error('expected a repair');
    expect(r.doc.definitions).toHaveLength(fx.damaged.definitions.length);
    expect(r.splits).toEqual([]);
  });
  it('the written-back tree flattens to the repaired parts', () => {
    const fx = load(f2); const r = repairDocument(fx.damaged);
    if (r === null || 'refused' in r) throw new Error('expected a repair');
    expect(sameJoined(flatDocument(r.doc), oracle(fx))).toBe(true);
  });
  it.each(DAMAGED)('fixture %s: repairing the repaired document finds nothing (review focus 5)', (_n, raw) => {
    const r = repairDocument(load(raw).damaged);
    if (r === null || 'refused' in r) throw new Error('expected a repair');
    expect(repairDocument(r.doc)).toBeNull();
  });
  it('passes a refusal and a null through', () => {
    expect(repairDocument(load(f5).damaged)).toBeNull();
  });
});

describe('splitCopies', () => {
  it('names nested placements by display path', () => {
    const fx = load(f6);
    // Split the inner Frame by hand: give the second bench's Front its own copy of the definition.
    const after = structuredClone(fx.damaged);
    const outer = after.definitions.find((d) => d.instances.length > 0)!;
    const inner = after.definitions.find((d) => d.id === outer.instances[0]!.definition)!;
    after.definitions.push({ ...structuredClone(inner), id: 'copy' });
    outer.instances[0]!.definition = 'copy';
    const names = splitCopies(fx.damaged, after).flat();
    expect(names.every((n) => n.includes(' › '))).toBe(true);
    expect(names).toHaveLength(4);
  });
});
