import { describe, expect, it, vi } from 'vitest';
import { designToDocument } from '../../document/generated';
import { groupItems } from '../../document/document';
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
const design = (...parts: P[]) => designToDocument({
  name: 'T',
  parts: parts.map((p) => ({ name: p.name, material: 'oak', at: { x: p.at[0], y: p.at[1], z: p.at[2] }, size: { x: p.size[0], y: p.size[1], z: p.size[2] } })),
}).doc;
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
const run = (c: LlmClient, d = CORNER) => runJoinery(c, d, new AbortController().signal, () => {});
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
    const linked = (names: string[], d = RAILED) => ({ ...d, boards: d.boards.map((b) => (names.includes(b.name) ? { ...b, link: 'L' } : b)) });
    const railedIds = findSites(RAILED).map((s) => s.id);
    const railed = { joints: railedIds.map((site) => ({ site, joint: 'mortise-tenon', tenonLength: 0.5 })) };

    // applyJoints ends in migrateDocument, whose load repair (repairLinks) already unlinks
    // parts it cut differently, so runJoinery needs no call of its own; these pin that.
    it('two linked legs joinery cuts on different faces come out unlinked', async () => {
      const out = await run(client(railed), linked(['Leg A', 'Leg B']));
      if ('noSites' in out) throw new Error('expected sites');
      const legs = out.result.doc.boards.filter((b) => b.name.startsWith('Leg'));
      expect(legs.length).toBe(2);
      for (const l of legs) expect('link' in l).toBe(false);
    });

    it('a linked pair joinery does not cut keeps its link', async () => {
      const d = linked(['Spare', 'Spare 2']);
      const out = await run(client(railed), d);
      if ('noSites' in out) throw new Error('expected sites');
      const kept = out.result.doc.boards.filter((b) => b.link === 'L').map((b) => b.name);
      expect(kept.sort()).toEqual(['Spare', 'Spare 2']);
    });
  });

  it('returns the TREE: a grouped design comes back with its instance (assemblies spec §6.1)', async () => {
    const grouped = groupItems(CORNER, null, CORNER.boards.map((b) => b.id))!.doc;
    const out = await run(client(long), grouped);
    if ('noSites' in out) throw new Error('expected sites');
    expect(out.result.doc.instances).toHaveLength(1);
  });
});
