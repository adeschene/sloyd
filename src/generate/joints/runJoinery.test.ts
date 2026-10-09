import { worldParts } from '../../document/tree';
import { describe, expect, it, vi } from 'vitest';
import { designToDocument } from '../../document/generated';
import type { SloydDocument } from '../../document/document';
import { flatDocument, groupItems, sharedOf } from '../../document/document';
import { LlmError } from '../../llm/types';
import type { LlmClient, LlmResult } from '../../llm/types';
import { runJoinery } from '../run';
import { applyJoints } from './recipes';
import { findSites } from './sites';

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
  });
});
