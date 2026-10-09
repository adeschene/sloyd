import { worldParts } from '../../document/tree';
import { describe, expect, it, vi } from 'vitest';
import { designToDocument } from '../../document/generated';
import type { Board, SloydDocument } from '../../document/document';
import { flatDocument, groupItems, sharedOf } from '../../document/document';
import { LlmError } from '../../llm/types';
import type { LlmClient, LlmResult } from '../../llm/types';
import { runJoinery } from '../run';
import { applyJoints } from './recipes';
import { findSites, jointKey } from './sites';
import { defaultChoice } from './choose';

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
  it('repairs a tenon collision: the second answer clears it', async () => {
    const c = client(long, short);
    const out = await run(c);
    if ('noSites' in out) throw new Error('expected sites');
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
    if ('noSites' in out) throw new Error('expected sites');
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
    if ('noSites' in out) throw new Error('expected sites');
    expect(c.complete).toHaveBeenCalledTimes(1);
    expect(out.violations).toEqual([]);
    expect(out.preexisting.map((v) => v.parts)).toContainEqual(['Float']);
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
    if ('noSites' in out) throw new Error('expected sites');
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
      if ('noSites' in out) throw new Error('expected sites');
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
      if ('noSites' in out) throw new Error('expected sites');
      const legs = worldParts(out.result.doc).filter((b) => b.name.startsWith('Leg'));
      expect(legs.length).toBe(2);
      for (const l of legs) expect('shape' in l).toBe(false);
    });

    it('a linked pair joinery does not cut keeps its link', async () => {
      const d = linked(['Spare', 'Spare 2']);
      const out = await run(client(railed), d);
      if ('noSites' in out) throw new Error('expected sites');
      const kept = worldParts(out.result.doc).filter((b) => b.shape !== undefined && b.shape === worldParts(out.result.doc).find((x) => x.name === 'Spare')!.shape).map((b) => b.name);
      expect(kept.sort()).toEqual(['Spare', 'Spare 2']);
    });
  });

  it('returns the TREE: a grouped design comes back with its instance (assemblies spec §6.1)', async () => {
    const grouped = groupItems(CORNER, null, worldParts(CORNER).map((b) => b.id))!.doc;
    const out = await run(client(long), grouped);
    if ('noSites' in out) throw new Error('expected sites');
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
    if ('noSites' in out) throw new Error('expected sites');
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

describe('runJoinery — fixed choices', () => {
  const sites = findSites(CORNER);
  const keyOf = (s: (typeof sites)[number]) => jointKey(CORNER.boards[s.enter].name, CORNER.boards[s.receive].name, s.axis, s.side);
  const fixedAll = new Map(sites.map((s) => { const { site: _s, ...c } = defaultChoice(s, CORNER, sites); return [keyOf(s), c] as const; }));
  const go = (c: LlmClient, fixed: Map<string, unknown>) =>
    runJoinery(c, CORNER, new AbortController().signal, () => {}, { fixed: fixed as never });

  it('makes NO call when every site is fixed and valid, and reports them kept', async () => {
    const c = client(long);
    const out = await go(c, fixedAll);
    if ('noSites' in out) throw new Error('sites');
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
    if ('noSites' in out) throw new Error('sites');
    expect(c.complete).toHaveBeenCalled();
    expect(out.kept).toBeLessThan(sites.length);
  });

  it('chosen counts the OPEN sites sent to the chooser: all without fixed, the rest with some fixed, 0 with none open', async () => {
    const none = await run(client(long));
    const one = await go(client(long), new Map([...fixedAll].slice(0, 1)));
    const all = await go(client(long), fixedAll);
    if ('noSites' in none || 'noSites' in one || 'noSites' in all) throw new Error('sites');
    expect([none.chosen, one.chosen, all.chosen]).toEqual([sites.length, sites.length - 1, 0]);
  });

  it('a chosen butt still counts as chosen', async () => {
    const butts = { joints: ids.map((site) => ({ site, joint: 'butt' })) };
    const out = await run(client(butts));
    if ('noSites' in out) throw new Error('sites');
    expect(out.result.applied.every((a) => a.joint === 'butt')).toBe(true);
    expect(out.chosen).toBe(sites.length);
  });

  it('fixed butts are applied without a call but are not counted as kept', async () => {
    const butts = new Map([...fixedAll].map(([k]) => [k, { joint: 'butt' }]));
    const c = client(long);
    const out = await go(c, butts);
    if ('noSites' in out) throw new Error('sites');
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
    if ('noSites' in out) throw new Error('sites');
    expect(c.complete).not.toHaveBeenCalled();
    expect(out.result.skipped.map((s) => s.reason)).toEqual(['moving Upper would drive it into Block']);
    const nonButt = [...fixed.values()].filter((f) => f.joint !== 'butt').length;
    expect(nonButt).toBeGreaterThan(0);
    expect(out.kept).toBe(nonButt - 1);
  });

  it('without fixed, kept is 0 and behaviour is unchanged', async () => {
    const out = await run(client(long, short));
    if ('noSites' in out) throw new Error('sites');
    expect(out.kept).toBe(0);
  });
});
