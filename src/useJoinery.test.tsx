import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useJoinery } from './useJoinery';
import { designToDocument } from './document/generated';
import { findSites } from './generate/joints/sites';
import { LlmError } from './llm/types';
import type { LlmClient, LlmResult } from './llm/types';
import { storage } from './storage/browser';

vi.mock('./storage/browser', () => ({ storage: { available: true, createProject: vi.fn() } }));
const createProject = storage.createProject as unknown as ReturnType<typeof vi.fn>;
const usage = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };
const doc = designToDocument({ name: 'Bench', parts: [
  { name: 'Leg', material: 'oak', at: { x: 0, y: 0, z: 0 }, size: { x: 1.75, y: 28, z: 1.75 } },
  { name: 'Rail', material: 'oak', at: { x: 1.75, y: 23.5, z: 0.5 }, size: { x: 18, y: 3, z: 0.75 } },
] }).doc;
const answer = { joints: findSites(doc).map((s) => ({ site: s.id, joint: 'mortise-tenon', tenonLength: 1 })) };
const client = (complete: LlmClient['complete']): LlmClient => ({ complete: vi.fn(complete), userTurn: (t) => t, estimateCostUsd: () => 0.02 });
const ok = async (): Promise<LlmResult> => ({ json: answer, assistantTurn: {}, usage });
const setup = () => {
  const onCreated = vi.fn();
  const onStorageVerdict = vi.fn();
  return { ...renderHook(() => useJoinery({ onCreated, onStorageVerdict })), onCreated, onStorageVerdict };
};

beforeEach(() => { createProject.mockReset().mockResolvedValue('p1'); });

describe('useJoinery', () => {
  it('writes the joined design WITHOUT activating it, named "<name> — joined"', async () => {
    const { result, onCreated } = setup();
    act(() => result.current.start(client(ok), doc));
    await waitFor(() => expect(result.current.live).toBe(false));
    expect(createProject).toHaveBeenCalledTimes(1);
    expect(createProject.mock.calls[0][1]).toEqual({ activate: false });
    expect(createProject.mock.calls[0][0].name).toBe('Bench — joined');
    expect(result.current.run).toMatchObject({ status: 'ready', projectId: 'p1', projectName: 'Bench — joined' });
    expect(onCreated).toHaveBeenCalledWith('p1');
  });

  it('a rejected key writes nothing and says why', async () => {
    const { result } = setup();
    act(() => result.current.start(client(async () => { throw new LlmError('auth', 'API key was rejected — check Settings.'); }), doc));
    await waitFor(() => expect(result.current.live).toBe(false));
    expect(createProject).not.toHaveBeenCalled();
    expect(result.current.run).toMatchObject({ status: 'failed', error: 'API key was rejected — check Settings.' });
  });

  it('cancel writes nothing', async () => {
    const { result } = setup();
    const hang = (_r: unknown, signal: AbortSignal) => new Promise<LlmResult>((_, reject) => {
      signal.addEventListener('abort', () => reject(new LlmError('cancelled', 'Cancelled.')));
    });
    act(() => result.current.start(client(hang as LlmClient['complete']), doc));
    act(() => result.current.cancel());
    await waitFor(() => expect(result.current.live).toBe(false));
    expect(createProject).not.toHaveBeenCalled();
    expect(result.current.run?.status).toBe('cancelled');
  });

  it('a cancel that lands as the call resolves still writes nothing', async () => {
    const { result } = setup();
    let release!: () => void;
    const slow = () => new Promise<LlmResult>((res) => { release = () => res({ json: answer, assistantTurn: {}, usage }); });
    act(() => result.current.start(client(slow), doc));
    act(() => result.current.cancel());
    act(() => release());
    await waitFor(() => expect(result.current.live).toBe(false));
    expect(createProject).not.toHaveBeenCalled();
    expect(result.current.run?.status).toBe('cancelled');
  });

  it('a second start while one is live is ignored', async () => {
    const { result } = setup();
    const c = client(ok);
    act(() => { result.current.start(c, doc); result.current.start(c, doc); });
    await waitFor(() => expect(result.current.live).toBe(false));
    expect(createProject).toHaveBeenCalledTimes(1);
  });

  it('reset clears a finished run, and leaves a live one alone (final review M1)', async () => {
    const { result } = setup();
    act(() => result.current.start(client(ok), doc));
    await waitFor(() => expect(result.current.live).toBe(false));
    expect(result.current.run?.status).toBe('ready');
    act(() => result.current.reset());
    expect(result.current.run).toBeNull();

    let release!: () => void;
    const slow = () => new Promise<LlmResult>((res) => { release = () => res({ json: answer, assistantTurn: {}, usage }); });
    act(() => result.current.start(client(slow), doc));
    act(() => result.current.reset());
    expect(result.current.run?.status).toBe('choosing');
    act(() => release());
    await waitFor(() => expect(result.current.live).toBe(false));
  });
});
