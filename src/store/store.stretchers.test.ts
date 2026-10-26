import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './store';
import { flatDocument, migrateDocument, snapPointsFor, worldParts } from '../document/document';
import type { Definition, SloydDocument } from '../document/document';
import { checkDesign, type DesignLimits } from '../document/designCheck';
import { tenonJoints } from '../document/tenonJoints';
import { toWorld } from '../document/snapPoints';
import { squareStoolDocument } from '../document/stoolFixture';
import { stretcherOf, stretcherPlan, type StretcherPlan } from '../document/stretchers';
import { STRETCHER_NOT_A_STRETCHER, stretcherLinkNote } from '../document/stretcherText';

/**
 * Stretchers Task 4: the store actions. Each decides every refusal before `edit()` (the planner's), writes the plan in ONE
 * `edit` through the write-back (inv 46), takes one undo entry (none for a no-op, inv 4), and re-judges held points (inv 24).
 */
const s = () => useStore.getState();
const setup = (doc: SloydDocument) => {
  useStore.setState({ doc, selectedIds: [], openPath: null, hiddenIds: [], past: [], future: [], tool: 'select', grabbed: null, tapeAnchor: null, tapeHover: null, tapeAxis: null, explode: 0, gesturing: false, gestureSnapshotTaken: false });
};

const NO_LIMITS: DesignLimits = { width: null, depth: null, height: null, maxParts: 100 };
const kindsOf = (doc: SloydDocument) => checkDesign(flatDocument(doc), NO_LIMITS).map((v) => `${v.kind}:${v.parts.join(',')}`);
const world = () => worldParts(s().doc);
const part = (name: string) => world().find((b) => b.name === name)!;
const legs = (a: string, b: string): [string, string] => [part(a).id, part(b).id];
const rungs = () => world().filter((b) => b.name.startsWith('Stretcher'));
const rungJoints = (doc: SloydDocument) => {
  const flat = flatDocument(doc);
  return tenonJoints(flat).filter((j) => flat.boards[j.a]!.name.includes('Stretcher'));
};
const O = { size: 1, diameter: 5 / 8 } as const;

/** `x` with every `id` and `shape` key removed, at any depth (the plan, the store and each fixture call mint their own). */
function bare(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(bare);
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).filter(([k]) => k !== 'id' && k !== 'shape').map(([k, v]) => [k, bare(v)]));
  return x;
}

/** Deep equality with every number within `tol`. */
function expectClose(a: unknown, b: unknown, tol = 1e-9, path = '$'): void {
  if (typeof a === 'number' && typeof b === 'number') {
    expect(Math.abs(a - b), path).toBeLessThanOrEqual(tol);
  } else if (a && b && typeof a === 'object' && typeof b === 'object') {
    expect(Object.keys(a).sort(), path).toEqual(Object.keys(b).sort());
    for (const k of Object.keys(a)) expectClose((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], tol, `${path}.${k}`);
  } else {
    expect(a, path).toEqual(b);
  }
}

function planOf(doc: SloydDocument, ids: [string, string], height: number): StretcherPlan {
  const p = stretcherPlan(doc, ids, { height, ...O });
  if (typeof p === 'string') throw new Error(p);
  return p;
}

/** The square-set stool's parts as one definition, placed once as `i1` at `position`, turned `rotation`. */
function placed(position: [number, number, number], rotation: 0 | 90 | 180 | 270): SloydDocument {
  const doc = squareStoolDocument();
  const d: Definition = { id: 'd', boards: doc.boards, instances: [], hardware: [] };
  return migrateDocument({ ...doc, boards: [], definitions: [d], instances: [{ id: 'i1', name: 'Stool', definition: 'd', position, rotation }] });
}

beforeEach(() => setup(squareStoolDocument()));

describe('addStretcher (stretchers spec §6.1)', () => {
  it('the front rung on the stool: one undo entry; the rung selected; undo restores the before exactly; redo re-applies', () => {
    const before = s().doc;
    expect(s().addStretcher(legs('Front right', 'Front left'), 6, O.size, O.diameter)).toBeNull();
    expect(s().past.length).toBe(1);
    const after = s().doc;
    expect(rungs()).toHaveLength(1);
    expect(s().selectedIds).toEqual([rungs()[0]!.id]);
    expect(rungJoints(after)).toHaveLength(2);
    expect(kindsOf(after)).toEqual([]);
    s().undo();
    expect(s().doc).toEqual(before);
    s().redo();
    expect(s().doc).toEqual(after);
  });

  it('agrees with stretcherPlan: the same rung, the same rows (ids aside)', () => {
    const doc0 = s().doc;
    const ids = legs('Front right', 'Front left');
    const p = planOf(doc0, ids, 6);
    expect(s().addStretcher(ids, 6, O.size, O.diameter)).toBeNull();
    const rung = rungs()[0]!;
    expect(bare(rung)).toEqual(bare(p.rung));
    expect(rung.name).toBe(p.rung.name);
    for (const e of p.legs) expect(bare(world().find((b) => b.id === e.id)!.holes)).toEqual(bare(e.holes));
    // The linked legs got the socket too (the plan's notes name them).
    expect(p.notes).toEqual([stretcherLinkNote('Back left'), stretcherLinkNote('Back right')]);
    expect(part('Back left').holes).toHaveLength(1);
    expect(part('Back right').holes).toHaveLength(1);
  });

  it('the back rung then reuses the linked rows: 4 joints, clean, one entry each', () => {
    expect(s().addStretcher(legs('Front right', 'Front left'), 6, O.size, O.diameter)).toBeNull();
    const shapes = s().doc.shapes;
    expect(s().addStretcher(legs('Back left', 'Back right'), 6, O.size, O.diameter)).toBeNull();
    expect(s().past.length).toBe(2);
    // No row written again: every Shape (where the legs' rows live) is the same object.
    expect(s().doc.shapes).toBe(shapes);
    expect(rungJoints(s().doc)).toHaveLength(4);
    expect(kindsOf(s().doc)).toEqual([]);
  });

  it('a refusal returns the planner\'s sentence and writes nothing', () => {
    const doc = s().doc;
    const ids = legs('Front right', 'Front left');
    const sentence = stretcherPlan(doc, ids, { height: 16.5, ...O });
    expect(typeof sentence).toBe('string');
    expect(s().addStretcher(ids, 16.5, O.size, O.diameter)).toBe(sentence);
    expect(s().doc).toBe(doc);
    expect(s().past.length).toBe(0);
    expect(s().selectedIds).toEqual([]);
  });

  it('a stale leg id does nothing and returns null (the hole actions\' convention)', () => {
    const doc = s().doc;
    expect(s().addStretcher([part('Front right').id, 'gone'], 6, O.size, O.diameter)).toBeNull();
    expect(s().doc).toBe(doc);
    expect(s().past.length).toBe(0);
  });

  it('inside an assembly (the stool grouped): the rung is a sibling of the legs, the world result the same as at the root', () => {
    const ids0 = legs('Front right', 'Front left');
    expect(s().addStretcher(ids0, 6, O.size, O.diameter)).toBeNull();
    const rootWorld = world();
    setup(squareStoolDocument());
    s().selectAll();
    s().groupSelected();
    const path = s().selectedIds[0]!;
    s().openAssembly(path);
    const ids = legs('Front right', 'Front left');
    expect(ids.every((id) => id.startsWith(`${path}/`))).toBe(true);
    expect(s().addStretcher(ids, 6, O.size, O.diameter)).toBeNull();
    expect(s().past.length).toBe(2); // the group, then the stretcher
    expect(s().doc.boards).toEqual([]);
    const rung = rungs()[0]!;
    expect(rung.id).toBe(`${path}/${rung.id.split('/').pop()}`);
    expect(s().selectedIds).toEqual([rung.id]);
    expect(bare(world())).toEqual(bare(rootWorld));
    expect(kindsOf(s().doc)).toEqual([]);
  });

  it('inside an assembly placed away from the origin and TURNED: the world rung is the plan\'s, joined, clean', () => {
    setup(placed([3, 0, -2], 90));
    s().openAssembly('i1');
    const ids = legs('Front right', 'Front left');
    const p = planOf(s().doc, ids, 6);
    expect(s().addStretcher(ids, 6, O.size, O.diameter)).toBeNull();
    expect(s().doc.definitions[0]!.boards.some((b) => b.name === p.rung.name)).toBe(true);
    const rung = rungs()[0]!;
    expect(rung.id.startsWith('i1/')).toBe(true);
    expectClose(bare(rung), bare(p.rung));
    expect(rungJoints(s().doc)).toHaveLength(2);
    expect(kindsOf(s().doc)).toEqual([]);
    expect(stretcherOf(world(), rung)!.seated).toBe(true);
  });

  it('refused while exploded (inv 47) and mid-gesture: null, nothing changed (the store\'s convention)', () => {
    const doc = s().doc;
    const ids = legs('Front right', 'Front left');
    s().setExplode(0.5);
    expect(s().addStretcher(ids, 6, O.size, O.diameter)).toBeNull();
    expect(s().doc).toBe(doc);
    s().setExplode(0);
    s().beginGesture();
    expect(s().addStretcher(ids, 6, O.size, O.diameter)).toBeNull();
    s().endGesture();
    expect(s().doc).toBe(doc);
    expect(s().past.length).toBe(0);
    expect(s().selectedIds).toEqual([]);
  });

  it('a held tape point on a leg, away from the socket, survives Add (inv 24: judgeHeld keeps a point still there)', () => {
    const leg = part('Front right');
    // The top's highest point: nowhere near a socket at h = 6.
    const top = snapPointsFor(leg).reduce((a, b) => (b.at[1] > a.at[1] ? b : a));
    useStore.setState({ tapeAnchor: top, tapeHover: top });
    expect(s().addStretcher(legs('Front right', 'Front left'), 6, O.size, O.diameter)).toBeNull();
    expect(s().tapeAnchor).toBe(top);
    expect(s().tapeHover).toBe(top);
  });

  it('a held tape point the new socket swallows is dropped (inv 24: judgeHeld after the edit)', () => {
    // The rung at the height of Front right's mid-length: its tilted socket's mouth covers the inner face's centre
    // lattice point without being centred on it, so that point goes.
    const leg = part('Front right');
    const h = toWorld(leg, { length: leg.length / 2, width: leg.width / 2, thickness: leg.thickness / 2 })[1];
    const ids = legs('Front right', 'Front left');
    const p = planOf(s().doc, ids, h);
    const e = p.legs.find((x) => x.id === leg.id)!;
    const after = snapPointsFor({ ...leg, holes: e.holes });
    const gone = snapPointsFor(leg).find((q) => !after.some((r) => r.kind === q.kind && r.at.every((v, i) => Math.abs(v - q.at[i]!) <= 1e-9)));
    expect(gone).toBeDefined();
    useStore.setState({ tapeAnchor: gone! });
    expect(s().addStretcher(ids, h, O.size, O.diameter)).toBeNull();
    expect(s().tapeAnchor).toBeNull();
  });
});

describe('fitStretcher (stretchers spec §6.3, §6.4)', () => {
  const twoRungs = () => {
    expect(s().addStretcher(legs('Front right', 'Front left'), 6, O.size, O.diameter)).toBeNull();
    expect(s().addStretcher(legs('Back left', 'Back right'), 6, O.size, O.diameter)).toBeNull();
  };

  it('a fitted rung is a no-op: null, the same document, no undo entry (inv 4)', () => {
    twoRungs();
    const doc = s().doc;
    const n = s().past.length;
    for (const r of rungs()) expect(s().fitStretcher(r.id)).toBeNull();
    expect(s().doc).toBe(doc);
    expect(s().past.length).toBe(n);
  });

  it('after a rake edit on all four legs and Level the ends: ONE entry re-fits both rungs; 4 joints, clean; undo/redo exact', () => {
    twoRungs();
    // All four legs together (ruling T3a: one leg's rake alone makes the stool's rungs not square), through the store.
    const all = ['Front left', 'Front right', 'Back left', 'Back right'].map((n) => part(n).id);
    expect(s().setLean(all, { rake: 10 }, { keepSign: true })).toBeNull();
    expect(s().levelEnds(part('Front right').id)).toBeNull();
    expect(s().levelEnds(part('Front left').id)).toBeNull();
    for (const r of rungs()) expect(stretcherOf(world(), r)!.seated).toBe(false);
    const before = s().doc;
    const n = s().past.length;
    const front = rungs()[0]!;
    expect(s().fitStretcher(front.id)).toBeNull();
    expect(s().past.length).toBe(n + 1);
    const after = s().doc;
    expect(rungJoints(after)).toHaveLength(4);
    expect(kindsOf(after)).toEqual([]);
    for (const r of rungs()) expect(stretcherOf(world(), r)!.seated).toBe(true);
    // A second press changes nothing.
    expect(s().fitStretcher(front.id)).toBeNull();
    expect(s().doc).toBe(after);
    s().undo();
    expect(s().doc).toEqual(before);
    s().redo();
    expect(s().doc).toEqual(after);
  });

  it('a held tape point on the rung\'s end is dropped when the re-fit moves it (inv 24)', () => {
    twoRungs();
    const all = ['Front left', 'Front right', 'Back left', 'Back right'].map((n) => part(n).id);
    s().setLean(all, { rake: 10 }, { keepSign: true });
    s().levelEnds(part('Front right').id);
    s().levelEnds(part('Front left').id);
    const front = rungs()[0]!;
    const end = snapPointsFor(front).reduce((a, b) => (b.at[0] > a.at[0] ? b : a));
    useStore.setState({ tapeAnchor: end });
    expect(s().fitStretcher(front.id)).toBeNull();
    expect(s().tapeAnchor).toBeNull();
  });

  it('a refusal returns the planner\'s sentence and writes nothing', () => {
    twoRungs();
    // Front left's Shape no longer square-set: the turned-leg sentence.
    const fl = part('Front left');
    const lean = { x: fl.lean!.x, z: fl.lean!.z, face: fl.lean!.face };
    useStore.setState({ doc: { ...s().doc, shapes: s().doc.shapes.map((sh) => (sh.id === fl.shape ? { ...sh, lean } : sh)) } });
    const doc = s().doc;
    const n = s().past.length;
    expect(s().fitStretcher(rungs()[0]!.id)).toBe('Set Front left square to the sides first (Lean).');
    expect(s().doc).toBe(doc);
    expect(s().past.length).toBe(n);
  });

  it('a part that is not a stretcher is refused with the internal sentence; a stale id is null', () => {
    const doc = s().doc;
    expect(s().fitStretcher(part('Front right').id)).toBe(STRETCHER_NOT_A_STRETCHER);
    expect(s().fitStretcher('gone')).toBeNull();
    expect(s().doc).toBe(doc);
    expect(s().past.length).toBe(0);
  });

  it('refused while exploded (inv 47) and mid-gesture: null, nothing changed', () => {
    twoRungs();
    const all = ['Front left', 'Front right', 'Back left', 'Back right'].map((n) => part(n).id);
    s().setLean(all, { rake: 10 }, { keepSign: true });
    s().levelEnds(part('Front right').id);
    s().levelEnds(part('Front left').id);
    const doc = s().doc;
    const n = s().past.length;
    const front = rungs()[0]!;
    s().setExplode(0.5);
    expect(s().fitStretcher(front.id)).toBeNull();
    expect(s().doc).toBe(doc);
    s().setExplode(0);
    s().beginGesture();
    expect(s().fitStretcher(front.id)).toBeNull();
    s().endGesture();
    expect(s().doc).toBe(doc);
    expect(s().past.length).toBe(n);
  });
});

