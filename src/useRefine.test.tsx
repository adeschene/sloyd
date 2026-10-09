import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRefine } from './useRefine';
import { designToDocument } from './document/generated';
import { documentToDesign } from './document/refineDesign';
import { REFINE_MAX } from './generate/refine';
import { LlmError } from './llm/types';
import type { LlmClient, LlmResult } from './llm/types';
import { storage } from './storage/browser';

vi.mock('./storage/browser', () => ({ storage: { available: true, createProject: vi.fn() } }));
const createProject = storage.createProject as unknown as ReturnType<typeof vi.fn>;
const usage = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };
const doc = designToDocument({ name: 'Box', parts: [
  { name: 'Base', role: '', material: 'pine', at: { x: 0, y: 0, z: 0 }, size: { x: 10, y: 1, z: 10 } },
], assemblies: [] }).doc;
const echo = (() => { const r = documentToDesign(doc, REFINE_MAX); if ('refused' in r) throw new Error('refused'); return r.design; })();
const S = { instruction: 'taller', width: null, depth: null, height: null, detail: 'simple' as const };
const client = (complete: LlmClient['complete']): LlmClient => ({ complete: vi.fn(complete), userTurn: (t) => t, estimateCostUsd: () => 0.02 });
const ok = async (): Promise<LlmResult> => ({ json: echo, assistantTurn: {}, usage });
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
    act(() => result.current.start(client(async () => { await gate; return { json: echo, assistantTurn: {}, usage }; }), doc, S));
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
});
