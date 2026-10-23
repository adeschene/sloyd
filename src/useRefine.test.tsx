import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { progressPatch, useRefine } from './useRefine';
import { designToDocument, toWireDesign } from './document/generated';
import { documentToDesign } from './document/refineDesign';
import { REFINE_MAX } from './generate/refine';
import { LlmError } from './llm/types';
import type { LlmClient, LlmResult } from './llm/types';
import { storage } from './storage';

vi.mock('./storage', () => ({ storage: { available: true, createProject: vi.fn() } }));
const createProject = storage.createProject as unknown as ReturnType<typeof vi.fn>;
const usage = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };
const doc = designToDocument({ name: 'Box', parts: [
  { name: 'Base', role: '', material: 'pine', at: { x: 0, y: 0, z: 0 }, size: { x: 10, y: 1, z: 10 } },
], assemblies: [] }).doc;
// The model's answer: the design echoed back (documentToDesign writes every part's `holes`, AI-holes spec §3.2), sent in the
// wire form (`toWireDesign`, AI-profiles spec R6.4).
const echo = (() => {
  const r = documentToDesign(doc, REFINE_MAX); if ('refused' in r) throw new Error('refused');
  return r.design;
})();
const S = { instruction: 'taller', width: null, depth: null, height: null, detail: 'simple' as const };
const client = (complete: LlmClient['complete']): LlmClient => ({ complete: vi.fn(complete), userTurn: (t) => t, estimateCostUsd: () => 0.02 });
const ok = async (): Promise<LlmResult> => ({ json: toWireDesign(echo), assistantTurn: {}, usage });
const setup = () => {
  const onCreated = vi.fn();
  const onStorageVerdict = vi.fn();
  return { ...renderHook(() => useRefine({ onCreated, onStorageVerdict })), onCreated };
};
beforeEach(() => { createProject.mockReset().mockResolvedValue('p1'); });

describe('useRefine', () => {
  it('writes the refined design WITHOUT activating it, named "<name> — refined"', async () => {
    const { result, onCreated } = setup();
    act(() => result.current.start(client(ok), doc, S));
    await waitFor(() => expect(result.current.live).toBe(false));
    expect(createProject).toHaveBeenCalledTimes(1);
    expect(createProject.mock.calls[0][1]).toEqual({ activate: false });
    expect(createProject.mock.calls[0][0].name).toBe('Box — refined');
    expect(result.current.run).toMatchObject({ status: 'ready', projectId: 'p1', projectName: 'Box — refined' });
    expect(onCreated).toHaveBeenCalledWith('p1');
  });

  it('refining a refined project counts instead of stacking (fu 237)', async () => {
    const { result } = setup();
    act(() => result.current.start(client(ok), { ...doc, name: 'Box — refined' }, S));
    await waitFor(() => expect(result.current.live).toBe(false));
    expect(createProject.mock.calls[0][0].name).toBe('Box — refined 2');
    expect(result.current.run).toMatchObject({ projectName: 'Box — refined 2' });
  });

  it('a refused design writes nothing and says why', async () => {
    const { result } = setup();
    const empty = { ...doc, boards: [] };
    act(() => result.current.start(client(ok), empty, S));
    await waitFor(() => expect(result.current.live).toBe(false));
    expect(createProject).not.toHaveBeenCalled();
    expect(result.current.run).toMatchObject({ status: 'failed', error: 'There is nothing to refine yet.' });
  });

  it('a cancel landing after the model answered writes nothing', async () => {
    const { result } = setup();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    act(() => result.current.start(client(async () => { await gate; return { json: toWireDesign(echo), assistantTurn: {}, usage }; }), doc, S));
    act(() => result.current.cancel());
    release();
    await waitFor(() => expect(result.current.live).toBe(false));
    expect(createProject).not.toHaveBeenCalled();
    expect(result.current.run?.status).toBe('cancelled');
  });

  it('a rejected key writes nothing and says why', async () => {
    const { result } = setup();
    act(() => result.current.start(client(async () => { throw new LlmError('auth', 'API key was rejected — check Settings.'); }), doc, S));
    await waitFor(() => expect(result.current.live).toBe(false));
    expect(createProject).not.toHaveBeenCalled();
    expect(result.current.run).toMatchObject({ status: 'failed', error: 'API key was rejected — check Settings.' });
  });
  // fu 168: an attempt that answered, then a call that failed — the first call's tokens were spent and are reported.
  it('reports what was spent before a failing call (fu 168)', async () => {
    const { result } = setup();
    let n = 0;
    const c: LlmClient = {
      complete: vi.fn(async () => {
        n += 1;
        if (n === 1) return { json: {}, assistantTurn: {}, usage: { ...usage, inputTokens: 300 } };
        throw new LlmError('network', 'Network error.');
      }),
      userTurn: (t) => t,
      estimateCostUsd: (u) => u.inputTokens / 100,
    };
    act(() => result.current.start(c, doc, S));
    await waitFor(() => expect(result.current.live).toBe(false));
    expect(result.current.run).toMatchObject({ status: 'failed', costUsd: 3 });
  });

  it('reports no cost when the first call fails (fu 168)', async () => {
    const { result } = setup();
    const c: LlmClient = {
      complete: vi.fn(async () => { throw new LlmError('network', 'Network error.'); }),
      userTurn: (t) => t,
      estimateCostUsd: (u) => u.inputTokens / 100,
    };
    act(() => result.current.start(c, doc, S));
    await waitFor(() => expect(result.current.live).toBe(false));
    expect(result.current.run).toMatchObject({ status: 'failed', costUsd: null });
  });

});

describe('progressPatch', () => {
  it('maps the joinery stage designing phase to joining', () => {
    expect(progressPatch({ phase: 'designing', stage: 'join' })).toEqual({ status: 'joining', join: true });
  });
  it('keeps a plain designing phase as designing', () => {
    expect(progressPatch({ phase: 'designing' })).toEqual({ status: 'designing', join: false });
  });
  it('keeps the joinery stage on its repair and retry rounds (fu 242)', () => {
    expect(progressPatch({ phase: 'repairing', round: 1, issues: 2, stage: 'join' })).toEqual({ status: 'repairing', round: 1, issues: 2, join: true });
    expect(progressPatch({ phase: 'retrying', round: 2, stage: 'join' })).toEqual({ status: 'retrying', round: 2, join: true });
  });
  it('a design round says join: false outright, so a merged run never inherits it', () => {
    expect(progressPatch({ phase: 'repairing', round: 1, issues: 2 })).toEqual({ status: 'repairing', round: 1, issues: 2, join: false });
    expect(progressPatch({ phase: 'retrying', round: 1 })).toEqual({ status: 'retrying', round: 1, join: false });
  });
});
