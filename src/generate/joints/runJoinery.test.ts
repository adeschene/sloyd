import { worldParts } from '../../document/tree';
import { describe, expect, it, vi } from 'vitest';
import { designToDocument } from '../../document/generated';
import type { Board, FlatDocument, SloydDocument } from '../../document/document';
import { flatDocument, groupItems, migrateDocument, sharedOf, writeBackFlat } from '../../document/document';
import { LlmError } from '../../llm/types';
import type { LlmClient, LlmResult } from '../../llm/types';
import { runJoinery } from '../run';
import { applyJoints } from './recipes';
import { findSites, jointKey } from './sites';
import { defaultChoice, validChoice } from './choose';
import { checkDesign } from '../../document/designCheck';
import { ARCH } from '../../document/curveFixtures';
import { taperCut } from '../../document/angleCuts';
import { axisFrame, endFacing } from '../../document/geometry';
import type { AngleCut } from '../../document/types';

vi.mock('./recipes', async (orig) => {
  const a = await orig<typeof import('./recipes')>();
  return { ...a, applyJoints: vi.fn(a.applyJoints) };
});

type P = { name: string; at: [number, number, number]; size: [number, number, number] };
const design = (...parts: P[]) => flatDocument(designToDocument({
  name: 'T',
  parts: parts.map((p) => ({ name: p.name, material: 'oak', at: { x: p.at[0], y: p.at[1], z: p.at[2] }, size: { x: p.size[0], y: p.size[1], z: p.size[2] } })),
}).doc);
const usage = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 };
const client = (...answers: (unknown | Error)[]): LlmClient => {
  let i = 0;
  return {
    complete: vi.fn(async (): Promise<LlmResult> => {
      const a = answers[Math.min(i++, answers.length - 1)];
      if (a instanceof Error) throw a;
      return { json: a, assistantTurn: { n: i }, usage };
    }),
    userTurn: (t) => t,
    estimateCostUsd: () => 0.01,
  };
};
const CORNER = design(
  { name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] },
  { name: 'Rail X', at: [1.75, 23.5, 0.5], size: [18, 3, 0.75] },
  { name: 'Rail Z', at: [0.5, 23.5, 1.75], size: [0.75, 3, 18] },
);
const RAILED = design(
  { name: 'Leg A', at: [0, 0, 0], size: [1.75, 28, 1.75] },
  { name: 'Leg B', at: [19.75, 0, 0], size: [1.75, 28, 1.75] },
  { name: 'Rail', at: [1.75, 23.5, 0.5], size: [18, 3, 0.75] },
  { name: 'Spare', at: [1.75, 23.5, 10], size: [18, 3, 0.75] },
  { name: 'Spare 2', at: [1.75, 23.5, 20], size: [18, 3, 0.75] },
);
const run = (c: LlmClient, d: SloydDocument = CORNER) => runJoinery(c, d, new AbortController().signal, () => {});
const ids = findSites(CORNER).map((s) => s.id);
const long = { joints: ids.map((site) => ({ site, joint: 'mortise-tenon', tenonLength: 1.25 })) };
const short = { joints: ids.map((site) => ({ site, joint: 'mortise-tenon', tenonLength: 0.5 })) };

describe('runJoinery', () => {
  it('the joined result keeps the project\'s custom materials (custom materials spec §6)', async () => {
    const ash = { id: 'm-s-ash1', label: 'Ash', color: '#d8c8a8', kind: 'solid' as const };
    const doc = migrateDocument({ ...CORNER, materials: [ash], boards: CORNER.boards.map((b) => ({ ...b, material: 'm-s-ash1' })) });
    expect(doc.materials).toEqual([ash]);
    const out = await run(client(short), doc);
    if ('refused' in out || 'noSites' in out) throw new Error('expected a join');
    expect(flatDocument(out.result.doc).boards.some((b) => b.cuts.length > 0)).toBe(true);
    expect(out.result.doc.boards.map((b) => (b as Board).material)).toEqual(['m-s-ash1', 'm-s-ash1', 'm-s-ash1']);
    expect(out.result.doc.materials).toEqual([ash]);
  });

  it('the joined result keeps a metric project\'s units (metric-display spec)', async () => {
    const doc = migrateDocument({ ...CORNER, units: { display: 'metric-mm', precision: 16 } });
    expect(doc.units.display).toBe('metric-mm');
    const out = await run(client(short), doc);
    if ('refused' in out || 'noSites' in out) throw new Error('expected a join');
    expect(flatDocument(out.result.doc).boards.some((b) => b.cuts.length > 0)).toBe(true);
    expect(out.result.doc.units).toEqual({ display: 'metric-mm', precision: 16 });
  });

  it('repairs a tenon collision: the second answer clears it', async () => {
    const c = client(long, short);
    const out = await run(c);
    if ('noSites' in out || 'refused' in out) throw new Error('expected sites');
    expect(c.complete).toHaveBeenCalledTimes(2);
    expect(out.violations).toEqual([]);
    expect(out.fallback).toBeUndefined();
  });

  it('makes no call when there are no sites', async () => {
    const c = client(long);
    const out = await run(c, design({ name: 'Lone', at: [0, 0, 0], size: [10, 1, 10] }));
    expect(out).toEqual({ noSites: true });
    expect(c.complete).not.toHaveBeenCalled();
  });

  it('builds the defaults when the FIRST call fails, and says why', async () => {
    const out = await run(client(new LlmError('overloaded', 'Overloaded.')));
    if ('noSites' in out || 'refused' in out) throw new Error('expected sites');
    expect(out.fallback).toBe('Overloaded.');
    expect(out.result.applied.map((a) => a.joint)).toEqual(['mortise-tenon', 'mortise-tenon']);
  });

  it('a rejected key throws and builds nothing', async () => {
    await expect(run(client(new LlmError('auth', 'API key was rejected')))).rejects.toMatchObject({ kind: 'auth' });
  });

  it('counts only problems the joinery introduced', async () => {
    const d = design(
      { name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] },
      { name: 'Rail', at: [1.75, 23.5, 0.5], size: [18, 3, 0.75] },
      { name: 'Float', at: [50, 40, 0], size: [5, 1, 5] },
    );
    const site = findSites(d)[0].id;
    const c = client({ joints: [{ site, joint: 'mortise-tenon', tenonLength: 1 }] });
    const out = await run(c, d);
    if ('noSites' in out || 'refused' in out) throw new Error('expected sites');
    expect(c.complete).toHaveBeenCalledTimes(1);
    expect(out.violations).toEqual([]);
    expect(out.preexisting.map((v) => v.parts)).toContainEqual(['Float']);
  });

  it('a metric project\'s preexisting fault carries its mm copy (fu 355)', async () => {
    const d = { ...design(
      { name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] },
      { name: 'Rail', at: [1.75, 23.5, 0.5], size: [18, 3, 0.75] },
      { name: 'Float', at: [50, 40, 0], size: [5, 1, 5] },
    ), units: { display: 'metric-mm' as const, precision: 16 } };
    const site = findSites(d)[0].id;
    const out = await run(client({ joints: [{ site, joint: 'mortise-tenon', tenonLength: 1 }] }), d);
    if ('noSites' in out || 'refused' in out) throw new Error('expected sites');
    const float = out.preexisting.find((v) => v.parts[0] === 'Float')!;
    expect(float.message).toMatch(/\d(\.\d+)?in away\.$/);
    expect(float.shown).toMatch(/\d mm away\.$/);
  });

  it.each(['cancelled', 'auth'] as const)('%s after a usable attempt still rejects', async (kind) => {
    await expect(run(client(long, new LlmError(kind, 'x')))).rejects.toMatchObject({ kind });
  });

  it('our own bug is not reported as a model failure', async () => {
    vi.mocked(applyJoints).mockImplementationOnce(() => { throw new Error('boom'); });
    await expect(run(client(long))).rejects.toThrow('boom');
  });

  it('keeps the usage spent before the failure when it falls back', async () => {
    const out = await run(client(null, new LlmError('overloaded', 'busy')));
    if ('noSites' in out || 'refused' in out) throw new Error('expected sites');
    expect(out.fallback).toBe('busy');
    expect(out.usage.inputTokens).toBe(10);
  });

  describe('links (linking spec 3.5)', () => {
    // Links are shapes (components spec §3.2): the named parts become users of one shape 'L'.
    const linked = (names: string[], d = RAILED): SloydDocument => {
      const first = worldParts(d).find((b) => names.includes(b.name))!;
      return {
        ...d,
        shapes: [{ id: 'L', ...sharedOf(first) }],
        boards: worldParts(d).map((b) => (names.includes(b.name)
          ? { id: b.id, name: b.name, position: b.position, rotation: b.rotation, shape: 'L' } : b)),
      };
    };
    const railedIds = findSites(RAILED).map((s) => s.id);
    const railed = { joints: railedIds.map((site) => ({ site, joint: 'mortise-tenon', tenonLength: 0.5 })) };

    // Follow-up 223 CLOSED (components spec §5): linked legs whose mortises come
    // out identical stay ONE shape. Each leg here has its rail on the same side,
    // at the same height, so the two mortises are the same cut in each leg's frame.
    const TWIN = design(
      { name: 'Leg A', at: [0, 0, 0], size: [1.75, 28, 1.75] },
      { name: 'Rail A', at: [1.75, 23.5, 0.5], size: [18, 3, 0.75] },
      { name: 'Leg B', at: [30, 0, 0], size: [1.75, 28, 1.75] },
      { name: 'Rail B', at: [31.75, 23.5, 0.5], size: [18, 3, 0.75] },
    );
    it('two linked legs joinery cuts identically stay ONE shape, sharing cut ids (follow-up 223)', async () => {
      const twinned = { joints: findSites(TWIN).map((site) => ({ site: site.id, joint: 'mortise-tenon', tenonLength: 0.5 })) };
      const out = await run(client(twinned), linked(['Leg A', 'Leg B'], TWIN));
      if ('noSites' in out || 'refused' in out) throw new Error('expected sites');
      const legs = worldParts(out.result.doc).filter((b) => b.name.startsWith('Leg'));
      expect(legs.length).toBe(2);
      expect(legs[0]!.cuts.length).toBeGreaterThan(0);
      expect(legs[0]!.shape).toBeDefined();
      expect(legs[1]!.shape).toBe(legs[0]!.shape);
      expect(legs[1]!.cuts.map((c) => c.id)).toEqual(legs[0]!.cuts.map((c) => c.id));
      expect(out.result.doc.shapes).toHaveLength(1);
    });

    it('two linked legs joinery cuts on different faces come out unlinked', async () => {
      const out = await run(client(railed), linked(['Leg A', 'Leg B']));
      if ('noSites' in out || 'refused' in out) throw new Error('expected sites');
      const legs = worldParts(out.result.doc).filter((b) => b.name.startsWith('Leg'));
      expect(legs.length).toBe(2);
      for (const l of legs) expect('shape' in l).toBe(false);
    });

    // Joinery-holes spec §4.5: the Shape carries the hole row (holes are a SHARED field, inv 45), so a join that cuts only
    // ONE user must split it. Joinery's write-back is replayed here (applyJoints, then writeBackFlat) because `run` still
    // refuses holed documents until the wiring task lifts it.
    const onlyLegA = (shared: Partial<Board>): { doc: SloydDocument; out: SloydDocument } => {
      const d = linked(['Leg A', 'Leg B']);
      const withShared: SloydDocument = { ...d, shapes: d.shapes.map((sh) => ({ ...sh, ...shared })) };
      const flat = flatDocument(withShared);
      const sites = findSites(flat);
      const legA = flat.boards.findIndex((b) => b.name === 'Leg A');
      const choices = sites.map((s) => (s.receive === legA
        ? { site: s.id, joint: 'mortise-tenon' as const, tenonLength: 0.5 } : { site: s.id, joint: 'butt' as const }));
      const joined = applyJoints(flat, sites, choices);
      return { doc: withShared, out: migrateDocument(writeBackFlat(withShared, flat.boards, worldParts(joined.doc))) };
    };
    const HOLES = [{ id: 'h1', face: 'width' as const, from: 'max' as const, diameter: 0.25, depth: 0.5, along: 'length' as const, alongFrom: 'min' as const, station: 10, count: 1, pitch: 0, acrossFrom: 'min' as const, inset: 0.875 }];

    it('two parts on one shape with an angle cut: only one tenoned unlinks the pair (the fixture the hole case follows)', () => {
      const { out } = onlyLegA({ angleCuts: [{ id: 'a1', kind: 'taper', face: 'width', from: 'min', along: 'length', alongFrom: 'min', points: [[0, 0.5], [3, 0]] }] });
      const legs = worldParts(out).filter((b) => b.name.startsWith('Leg'));
      expect(legs.map((l) => l.angleCuts.length)).toEqual([1, 1]);
      expect(out.shapes).toHaveLength(0); // the cut differs, so neither user keeps the shape (a one-user shape dissolves, inv 45)
    });

    it('two parts on one shape with a hole row: only one tenoned', () => {
      const { doc, out } = onlyLegA({ holes: HOLES });
      const legs = (d: SloydDocument) => worldParts(d).filter((b) => b.name.startsWith('Leg'));
      expect(legs(out).filter((l) => l.cuts.length > 0).map((l) => l.name)).toEqual(['Leg A']);
      // Every hole row is where it was: joinery grew only Leg A across its width, and the row is measured from the min end.
      expect(legs(out).map((l) => l.holes)).toEqual(legs(doc).map((l) => l.holes));
      expect(legs(out).map((l) => l.holes.length)).toEqual([1, 1]);
      expect(legs(out).map((l) => l.position)).toEqual(legs(doc).map((l) => l.position));
      expect(out.shapes).toHaveLength(0); // the cut differs, so neither user keeps the shape (a one-user shape dissolves, inv 45)
    });

    it('a linked pair joinery does not cut keeps its link', async () => {
      const d = linked(['Spare', 'Spare 2']);
      const out = await run(client(railed), d);
      if ('noSites' in out || 'refused' in out) throw new Error('expected sites');
      const kept = worldParts(out.result.doc).filter((b) => b.shape !== undefined && b.shape === worldParts(out.result.doc).find((x) => x.name === 'Spare')!.shape).map((b) => b.name);
      expect(kept.sort()).toEqual(['Spare', 'Spare 2']);
    });
  });

  // Follow-up 222: the same three link outcomes on the FALLBACK path (the model failed, so the
  // defaults are built), which goes through the same applyJoints and migrateDocument.
  describe('links on the fallback path (fu 222)', () => {
    const linkedOn = (names: string[], d: SloydDocument): SloydDocument => {
      const first = worldParts(d).find((b) => names.includes(b.name))!;
      return {
        ...d,
        shapes: [{ id: 'L', ...sharedOf(first) }],
        boards: worldParts(d).map((b) => (names.includes(b.name)
          ? { id: b.id, name: b.name, position: b.position, rotation: b.rotation, shape: 'L' } : b)),
      };
    };
    const busy = () => client(new LlmError('overloaded', 'busy'));
    const TWIN = design(
      { name: 'Leg A', at: [0, 0, 0], size: [1.75, 28, 1.75] },
      { name: 'Rail A', at: [1.75, 23.5, 0.5], size: [18, 3, 0.75] },
      { name: 'Leg B', at: [30, 0, 0], size: [1.75, 28, 1.75] },
      { name: 'Rail B', at: [31.75, 23.5, 0.5], size: [18, 3, 0.75] },
    );

    it('linked legs the defaults cut identically stay ONE shape', async () => {
      const out = await run(busy(), linkedOn(['Leg A', 'Leg B'], TWIN));
      if ('noSites' in out || 'refused' in out) throw new Error('expected sites');
      expect(out.fallback).toBe('busy');
      const legs = worldParts(out.result.doc).filter((b) => b.name.startsWith('Leg'));
      expect(legs[0]!.cuts.length).toBeGreaterThan(0);
      expect(legs[0]!.shape).toBeDefined();
      expect(legs[1]!.shape).toBe(legs[0]!.shape);
      expect(out.result.doc.shapes).toHaveLength(1);
    });

    it('linked legs the defaults cut on different faces come out unlinked', async () => {
      const out = await run(busy(), linkedOn(['Leg A', 'Leg B'], RAILED));
      if ('noSites' in out || 'refused' in out) throw new Error('expected sites');
      expect(out.fallback).toBe('busy');
      const legs = worldParts(out.result.doc).filter((b) => b.name.startsWith('Leg'));
      expect(legs.some((l) => l.cuts.length > 0)).toBe(true);
      for (const l of legs) expect('shape' in l).toBe(false);
    });

    it('a linked pair the defaults do not cut keeps its link', async () => {
      const out = await run(busy(), linkedOn(['Spare', 'Spare 2'], RAILED));
      if ('noSites' in out || 'refused' in out) throw new Error('expected sites');
      expect(out.fallback).toBe('busy');
      const parts = worldParts(out.result.doc);
      const shape = parts.find((b) => b.name === 'Spare')!.shape;
      expect(shape).toBeDefined();
      expect(parts.filter((b) => b.shape === shape).map((b) => b.name).sort()).toEqual(['Spare', 'Spare 2']);
    });
  });

  it('returns the TREE: a grouped design comes back with its instance (assemblies spec §6.1)', async () => {
    const grouped = groupItems(CORNER, null, worldParts(CORNER).map((b) => b.id))!.doc;
    const out = await run(client(long), grouped);
    if ('noSites' in out || 'refused' in out) throw new Error('expected sites');
    expect(out.result.doc.instances).toHaveLength(1);
  });
});

describe('runJoinery on a generated assembly', () => {
  it('keeps the definition shared when every copy gets identical joints', async () => {
    const tree = designToDocument({ name: 'Frames', parts: [], assemblies: [{
      name: 'Frame',
      parts: [
        { name: 'Leg', role: '', material: 'oak', at: { x: 0, y: 0, z: 0 }, size: { x: 1.75, y: 28, z: 1.75 } },
        { name: 'Rail', role: '', material: 'oak', at: { x: 1.75, y: 23.5, z: 0.5 }, size: { x: 18, y: 3, z: 0.75 } },
      ],
      placements: [{ name: 'Front', at: { x: 0, y: 0, z: 0 } }, { name: 'Back', at: { x: 0, y: 0, z: 30 } }],
    }] }).doc;
    const out = await run(client(new LlmError('overloaded', 'Overloaded.')), tree);
    if ('noSites' in out || 'refused' in out) throw new Error('expected sites');
    const doc = out.result.doc;
    expect(doc.definitions).toHaveLength(1);
    expect(doc.instances.map((i) => i.definition)).toEqual([doc.definitions[0].id, doc.definitions[0].id]);
    expect(worldParts(doc).some((b) => b.cuts.length > 0)).toBe(true);
    // Each copy's mortise is cut once: the flat twins share one `cuts` array, and a
    // whole-array clone in applyJoints kept that aliasing, so the stored Leg got both.
    const leg = doc.definitions[0].boards.find((b) => b.name === 'Leg') as Board;
    expect(leg.cuts).toHaveLength(1);
    expect(worldParts(doc).map((b) => b.cuts.length)).toEqual([1, 4, 1, 4]);
  });
});

describe('runJoinery — twins that get DIFFERENT joints', () => {
  it('split the definition: each copy keeps only its own mortises (a899b51)', async () => {
    const tree = designToDocument({ name: 'Frames', parts: [
      // A loose stretcher entering the FRONT leg only, from -X.
      { name: 'Stretcher', role: '', material: 'oak', at: { x: -10, y: 10, z: 0.5 }, size: { x: 10, y: 3, z: 0.75 } },
    ], assemblies: [{
      name: 'Frame',
      parts: [
        { name: 'Leg', role: '', material: 'oak', at: { x: 0, y: 0, z: 0 }, size: { x: 1.75, y: 28, z: 1.75 } },
        { name: 'Rail', role: '', material: 'oak', at: { x: 1.75, y: 23.5, z: 0.5 }, size: { x: 18, y: 3, z: 0.75 } },
      ],
      placements: [{ name: 'Front', at: { x: 0, y: 0, z: 0 } }, { name: 'Back', at: { x: 0, y: 0, z: 30 } }],
    }] }).doc;
    const out = await run(client(new LlmError('overloaded', 'Overloaded.')), tree);
    if ('noSites' in out || 'refused' in out) throw new Error('expected sites');
    expect(out.result.applied.map((a) => a.joint)).toEqual(['mortise-tenon', 'mortise-tenon', 'mortise-tenon']);
    const doc = out.result.doc;
    const legCuts = (name: string) => flatDocument(doc).boards.find((b) => b.name === name)!.cuts.length;
    expect([legCuts('Front › Leg'), legCuts('Back › Leg')]).toEqual([2, 1]);
    expect(doc.definitions).toHaveLength(2);
    expect(new Set(doc.instances.map((i) => i.definition)).size).toBe(2);
  });
});

describe('runJoinery — alsoPresent', () => {
  it('a problem in alsoPresent is preexisting: not new, no repair call', async () => {
    const collide = JSON.stringify(['overlap', ['Rail X', 'Rail Z']]);
    const c = client(long, short);
    const out = await runJoinery(c, CORNER, new AbortController().signal, () => {}, { alsoPresent: new Set([collide]) });
    if ('noSites' in out || 'refused' in out) throw new Error('sites');
    expect(c.complete).toHaveBeenCalledTimes(1);
    expect(out.violations).toEqual([]);
    expect(out.preexisting.filter((v) => v.kind === 'overlap').map((v) => [...v.parts].sort())).toEqual([['Rail X', 'Rail Z']]);
  });
});

describe('runJoinery — fixed choices', () => {
  const sites = findSites(CORNER);
  const keyOf = (s: (typeof sites)[number]) => jointKey(CORNER.boards[s.enter].name, CORNER.boards[s.receive].name, s.axis, s.side);
  const fixedAll = new Map(sites.map((s) => { const { site: _s, ...c } = defaultChoice(s, CORNER, sites); return [keyOf(s), c] as const; }));
  const go = (c: LlmClient, fixed: Map<string, unknown>) =>
    runJoinery(c, CORNER, new AbortController().signal, () => {}, { fixed: fixed as never });

  it('makes NO call when every site is fixed and valid, and reports them kept', async () => {
    const c = client(long);
    const out = await go(c, fixedAll);
    if ('noSites' in out || 'refused' in out) throw new Error('sites');
    expect(c.complete).not.toHaveBeenCalled();
    expect(out.kept).toBe(sites.length);
    expect(out.usage.inputTokens).toBe(0);
  });

  it('sends only the open sites to the model', async () => {
    const one = new Map([...fixedAll].slice(0, 1));
    const c = client(long);
    await go(c, one);
    const msg = String((c.complete as ReturnType<typeof vi.fn>).mock.calls[0][0].messages[0]);
    const listed = msg.split('Sites:\n')[1]!.split('\n').filter((l) => /^\d+\. /.test(l));
    expect(listed).toHaveLength(sites.length - 1);
  });

  it('re-chooses a fixed choice that is no longer valid (review focus 3)', async () => {
    const bad = new Map([...fixedAll].map(([k, c]) => [k, c.joint === 'mortise-tenon' ? { ...c, tenonLength: 99 } : c]));
    const c = client(long);
    const out = await go(c, bad);
    if ('noSites' in out || 'refused' in out) throw new Error('sites');
    expect(c.complete).toHaveBeenCalled();
    expect(out.kept).toBeLessThan(sites.length);
  });

  it('chosen counts the OPEN sites sent to the chooser: all without fixed, the rest with some fixed, 0 with none open', async () => {
    const none = await run(client(long));
    const one = await go(client(long), new Map([...fixedAll].slice(0, 1)));
    const all = await go(client(long), fixedAll);
    if ('noSites' in none || 'noSites' in one || 'noSites' in all || 'refused' in none || 'refused' in one || 'refused' in all) throw new Error('sites');
    expect([none.chosen, one.chosen, all.chosen]).toEqual([sites.length, sites.length - 1, 0]);
  });

  it('a chosen butt still counts as chosen', async () => {
    const butts = { joints: ids.map((site) => ({ site, joint: 'butt' })) };
    const out = await run(client(butts));
    if ('noSites' in out || 'refused' in out) throw new Error('sites');
    expect(out.result.applied.every((a) => a.joint === 'butt')).toBe(true);
    expect(out.chosen).toBe(sites.length);
  });

  it('fixed butts are applied without a call but are not counted as kept', async () => {
    const butts = new Map([...fixedAll].map(([k]) => [k, { joint: 'butt' }]));
    const c = client(long);
    const out = await go(c, butts);
    if ('noSites' in out || 'refused' in out) throw new Error('sites');
    expect(c.complete).not.toHaveBeenCalled();
    expect(out.kept).toBe(0);
    expect(out.chosen).toBe(0);
  });

  it('a fixed choice applyJoints skips is not kept', async () => {
    // recipes.test's half-lap fixture: lapping Upper into Lower would drive it into Block, so it is skipped.
    const LAP = design(
      { name: 'Lower', at: [0, 5, 9], size: [20, 0.75, 2] },
      { name: 'Upper', at: [9, 5.75, 0], size: [2, 0.75, 20] },
      { name: 'Block', at: [9, 5, 0], size: [2, 0.75, 2] },
    );
    const ls = findSites(LAP);
    const key = (s: (typeof ls)[number]) => jointKey(LAP.boards[s.enter].name, LAP.boards[s.receive].name, s.axis, s.side);
    const fixed = new Map(ls.map((s) => {
      const { site: _s, ...c } = s.kind === 'crossing' ? { site: s.id, joint: 'half-lap' as const } : defaultChoice(s, LAP, ls);
      return [key(s), c] as const;
    }));
    const c = client(long);
    const out = await runJoinery(c, LAP, new AbortController().signal, () => {}, { fixed: fixed as never });
    if ('noSites' in out || 'refused' in out) throw new Error('sites');
    expect(c.complete).not.toHaveBeenCalled();
    expect(out.result.skipped.map((s) => s.reason)).toEqual(['moving Upper would drive it into Block']);
    const nonButt = [...fixed.values()].filter((f) => f.joint !== 'butt').length;
    expect(nonButt).toBeGreaterThan(0);
    expect(out.kept).toBe(nonButt - 1);
  });

  it('without fixed, kept is 0 and behaviour is unchanged', async () => {
    const out = await run(client(long, short));
    if ('noSites' in out || 'refused' in out) throw new Error('sites');
    expect(out.kept).toBe(0);
  });
});

describe('runJoinery — kept joints that collide are re-opened (refine-joined spec §4, F3)', () => {
  // A corner leg thinned to 1-1/2in: both recorded 7/8in tenons are still inside the tenon range
  // [1/2, 1-1/4], but on this leg they pass through each other.
  const THIN = design(
    { name: 'Leg', at: [0, 0, 0], size: [1.5, 28, 1.5] },
    { name: 'Rail X', at: [1.5, 23.5, 0.375], size: [18, 3, 0.75] },
    { name: 'Rail Z', at: [0.375, 23.5, 1.5], size: [0.75, 3, 18] },
  );
  const ts = findSites(THIN);
  const tkey = (s: (typeof ts)[number]) => jointKey(THIN.boards[s.enter].name, THIN.boards[s.receive].name, s.axis, s.side);
  const tenons = ts.filter((s) => THIN.boards[s.receive].name === 'Leg');
  const recorded = new Map(tenons.map((s) => [tkey(s), { joint: 'mortise-tenon' as const, tenonLength: 0.875 }]));
  const shortAnswer = { joints: tenons.map((s) => ({ site: s.id, joint: 'mortise-tenon', tenonLength: 0.5 })) };
  const overlapXZ = (v: { kind: string; parts: string[] }) => v.kind === 'overlap' && [...v.parts].sort().join() === 'Rail X,Rail Z';
  const listedIn = (c: LlmClient) => String((c.complete as ReturnType<typeof vi.fn>).mock.calls[0][0].messages[0])
    .split('Sites:\n')[1]!.split('\n').filter((l) => /^\d+\. /.test(l));

  it('the fixture: both 7/8in tenons are valid on the thin leg, and applied together they overlap', () => {
    expect(tenons).toHaveLength(2);
    for (const s of tenons) expect(validChoice({ site: s.id, ...recorded.get(tkey(s))! }, s, THIN)).toBe(true);
    const j = applyJoints(THIN, ts, ts.map((s) => ({ site: s.id, ...(recorded.get(tkey(s)) ?? { joint: 'butt' as const }) })));
    expect(checkDesign(flatDocument(j.doc), { width: null, depth: null, height: null, maxParts: 3 }).some(overlapXZ)).toBe(true);
    expect(checkDesign(THIN, { width: null, depth: null, height: null, maxParts: 3 }).some(overlapXZ)).toBe(false);
  });

  it('re-opens both: they go to the chooser, are not kept, and the shorter answer leaves no new overlap', async () => {
    const c = client(shortAnswer);
    const out = await runJoinery(c, THIN, new AbortController().signal, () => {}, { fixed: recorded });
    if ('noSites' in out || 'refused' in out) throw new Error('sites');
    expect(c.complete).toHaveBeenCalledTimes(1);
    const listed = listedIn(c);
    expect(listed).toHaveLength(2);
    expect(listed.some((l) => l.includes('Rail X'))).toBe(true);
    expect(listed.some((l) => l.includes('Rail Z'))).toBe(true);
    expect(out.kept).toBe(0);
    expect(out.chosen).toBe(2);
    expect(out.violations).toEqual([]);
    expect(out.result.applied.filter((a) => a.joint === 'mortise-tenon')).toHaveLength(2);
  });

  it('a problem the caller already had (alsoPresent) re-opens nothing: no call', async () => {
    const c = client(shortAnswer);
    const out = await runJoinery(c, THIN, new AbortController().signal, () => {}, {
      fixed: recorded, alsoPresent: new Set([JSON.stringify(['overlap', ['Rail X', 'Rail Z']])]),
    });
    if ('noSites' in out || 'refused' in out) throw new Error('sites');
    expect(c.complete).not.toHaveBeenCalled();
    expect(out.kept).toBe(2);
  });

  it('a fixed BUTT whose part a collision names stays butt and is not sent (spec §4 fixed butts)', async () => {
    // A cleat under Rail X meets it; that meeting was left butt. The tenon collision names Rail X.
    const CLEATED = design(
      { name: 'Leg', at: [0, 0, 0], size: [1.5, 28, 1.5] },
      { name: 'Rail X', at: [1.5, 23.5, 0.375], size: [18, 3, 0.75] },
      { name: 'Rail Z', at: [0.375, 23.5, 1.5], size: [0.75, 3, 18] },
      { name: 'Cleat', at: [8, 20.5, 0.375], size: [2, 3, 0.75] },
    );
    const cs = findSites(CLEATED);
    const ck = (s: (typeof cs)[number]) => jointKey(CLEATED.boards[s.enter].name, CLEATED.boards[s.receive].name, s.axis, s.side);
    const cleatSite = cs.find((s) => [CLEATED.boards[s.enter].name, CLEATED.boards[s.receive].name].includes('Cleat'));
    expect(cleatSite).toBeDefined();
    expect([CLEATED.boards[cleatSite!.enter].name, CLEATED.boards[cleatSite!.receive].name]).toContain('Rail X');
    const fixed = new Map<string, { joint: 'mortise-tenon'; tenonLength: number } | { joint: 'butt' }>(
      cs.map((s) => [ck(s), CLEATED.boards[s.receive].name === 'Leg' ? { joint: 'mortise-tenon', tenonLength: 0.875 } : { joint: 'butt' }]));
    const c = client(shortAnswer);
    const out = await runJoinery(c, CLEATED, new AbortController().signal, () => {}, { fixed });
    if ('noSites' in out || 'refused' in out) throw new Error('sites');
    const listed = listedIn(c);
    expect(listed).toHaveLength(2);
    expect(listed.some((l) => l.includes('Cleat'))).toBe(false);
    expect(out.result.applied.find((a) => a.site === cleatSite!.id)?.joint ?? 'butt').toBe('butt');
  });
});

describe('runJoinery — tapered legs (AI-tapers spec §4)', () => {
  const face = (b: Board, axis: 0 | 2, start: number): AngleCut => ({
    id: `t${axis}`, ...taperCut({ face: axisFrame(b)[axis]!.dim as 'width' | 'thickness', from: endFacing(b, axis, 1), end: endFacing(b, 1, -1), start, amount: 0.375 }),
  });
  const tapered = (doc: FlatDocument, start: number): FlatDocument =>
    ({ ...doc, boards: doc.boards.map((b) => (b.name === 'Leg' ? { ...b, angleCuts: [face(b, 0, start), face(b, 2, start)] } : b)) });

  it('refuses a document with holes before any call (holes spec §6)', async () => {
    const c = client({ joints: [] });
    const holed = { ...CORNER, boards: CORNER.boards.map((b, i) => (i === 0 ? { ...b, holes: [{ id: 'h1', face: 'width' as const, from: 'max' as const, diameter: 0.375, depth: 1, along: 'length' as const, alongFrom: 'min' as const, station: 2, count: 1, pitch: 0, acrossFrom: 'min' as const, inset: 0.875 }] } : b)) };
    const out = await run(c, holed);
    expect('refused' in out).toBe(true);
    expect(c.complete).not.toHaveBeenCalled();
  });
  it('refuses a document with curves before any call (curves spec §7)', async () => {
    const c = client({ joints: [] });
    const curved = { ...CORNER, boards: CORNER.boards.map((b, i) => (i === 0 ? { ...b, curves: [ARCH] } : b)) };
    const before = JSON.stringify(curved);
    const out = await run(c, curved);
    expect('refused' in out).toBe(true);
    expect(c.complete).not.toHaveBeenCalled();
    expect(JSON.stringify(curved)).toBe(before);
  });
  it('refuses a taper that runs into a joint before any call, leaving the document alone', async () => {
    const c = client(short);
    const doc = tapered(CORNER, 24);
    const before = JSON.stringify(doc);
    const out = await run(c, doc);
    expect('refused' in out).toBe(true);
    expect(c.complete).not.toHaveBeenCalled();
    expect(JSON.stringify(doc)).toBe(before);
  });

  it('joins a leg tapered below its rails, and the joined leg passes the gate with its taper intact', async () => {
    const c = client(short);
    const doc = tapered(CORNER, 22);
    const cuts = doc.boards.find((b) => b.name === 'Leg')!.angleCuts;
    const out = await run(c, doc);
    if ('noSites' in out || 'refused' in out) throw new Error(`expected a run, got ${JSON.stringify(out)}`);
    expect(c.complete).toHaveBeenCalled();
    expect(out.violations).toEqual([]);
    expect(flatDocument(out.result.doc).boards.find((b) => b.name === 'Leg')!.angleCuts).toEqual(cuts);
  });

  it('a tenon grown at the untapered end leaves the taper exactly where it was', async () => {
    const TOP = design(
      { name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] },
      { name: 'Top', at: [-1, 28, -1], size: [4, 1, 4] },
    );
    const doc = tapered(TOP, 20);
    const ids = findSites(doc).map((s) => s.id);
    const c = client({ joints: ids.map((site) => ({ site, joint: 'mortise-tenon', tenonLength: 0.5 })) });
    const cuts = doc.boards.find((b) => b.name === 'Leg')!.angleCuts;
    const out = await run(c, doc);
    if ('noSites' in out || 'refused' in out) throw new Error(`expected a run, got ${JSON.stringify(out)}`);
    expect(out.result.applied.map((a) => a.joint)).toEqual(['mortise-tenon']);
    const leg = flatDocument(out.result.doc).boards.find((b) => b.name === 'Leg')!;
    expect(leg.length).toBe(28.5);
    expect(leg.angleCuts).toEqual(cuts);
  });
});
