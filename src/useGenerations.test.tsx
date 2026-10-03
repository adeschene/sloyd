import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGenerations } from './useGenerations';
import { LlmError } from './llm/types';
import type { LlmClient, LlmResult } from './llm/types';
import type { GenerateSettings } from './generate/prompt';
import { storage } from './storage/browser';
import { useStore } from './store/store';

vi.mock('./storage/browser', () => ({
  storage: { available: true, createProject: vi.fn() },
}));
const createProject = storage.createProject as unknown as ReturnType<typeof vi.fn>;

const settings: GenerateSettings = {
  description: 'a box', width: null, depth: null, height: null, material: 'any', style: 'any', detail: 'simple',
};
const usage = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };
const GOOD = {
  name: 'Bench',
  parts: [{ name: 'Top', material: 'pine', at: { x: 0, y: 0, z: 0 }, size: { x: 10, y: 1, z: 10 } }],
};
const ok = (): Promise<LlmResult> => Promise.resolve({ json: GOOD, assistantTurn: {}, usage });

function client(complete: LlmClient['complete']): LlmClient {
  return { complete: vi.fn(complete), userTurn: (t) => t, estimateCostUsd: () => 0.01 };
}
const setup = () => {
  const onCreated = vi.fn();
  const onStorageVerdict = vi.fn();
  const hook = renderHook(() => useGenerations({ onCreated, onStorageVerdict }));
  return { ...hook, onCreated, onStorageVerdict };
};

beforeEach(() => {
  let n = 0;
  createProject.mockReset().mockImplementation(async () => `p${++n}`);
});

describe('useGenerations', () => {
  it('writes each finished design as a project WITHOUT activating it, lettered A/B/C', async () => {
    const { result, onCreated } = setup();
    act(() => result.current.start(client(ok), settings, 3));
    await waitFor(() => expect(result.current.live).toBe(0));
    expect(createProject).toHaveBeenCalledTimes(3);
    for (const call of createProject.mock.calls) expect(call[1]).toEqual({ activate: false });
    expect(createProject.mock.calls.map((c) => c[0].name).sort()).toEqual(['Bench — A', 'Bench — B', 'Bench — C']);
    expect(result.current.rows.map((r) => r.status)).toEqual(['ready', 'ready', 'ready']);
    expect(onCreated).toHaveBeenCalledTimes(3);
  });

  it('does not suffix a single generation', async () => {
    const { result } = setup();
    act(() => result.current.start(client(ok), settings, 1));
    await waitFor(() => expect(result.current.live).toBe(0));
    expect(createProject.mock.calls[0][0].name).toBe('Bench');
  });

  it('never touches the open document or its undo history', async () => {
    const before = useStore.getState().doc;
    const past = useStore.getState().past.length;
    const { result } = setup();
    act(() => result.current.start(client(ok), settings, 2));
    await waitFor(() => expect(result.current.live).toBe(0));
    expect(useStore.getState().doc).toBe(before);
    expect(useStore.getState().past.length).toBe(past);
  });

  it('ignores start() while a batch is live — a double click is one batch', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const c = client(async () => { await gate; return ok(); });
    const { result } = setup();
    act(() => result.current.start(c, settings, 1));
    act(() => result.current.start(c, settings, 1));
    expect(result.current.rows).toHaveLength(1);
    release();
    await waitFor(() => expect(result.current.live).toBe(0));
    expect(createProject).toHaveBeenCalledTimes(1);
  });

  it('cancel writes nothing for runs still in flight', async () => {
    const c = client((_req, signal) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new LlmError('cancelled', 'Cancelled.')));
    }));
    const { result } = setup();
    act(() => result.current.start(c, settings, 2));
    act(() => result.current.cancel());
    await waitFor(() => expect(result.current.live).toBe(0));
    expect(createProject).not.toHaveBeenCalled();
    expect(result.current.rows.map((r) => r.status)).toEqual(['cancelled', 'cancelled']);
  });

  it('a cancel landing after the model ANSWERED still writes nothing', async () => {
    const { result } = setup();
    // The client resolves with a good design despite the abort — the race
    // the post-run guard exists for; runGeneration itself never checks it.
    const c = client(async () => {
      act(() => result.current.cancel());
      return ok();
    });
    act(() => result.current.start(c, settings, 1));
    await waitFor(() => expect(result.current.live).toBe(0));
    expect(createProject).not.toHaveBeenCalled();
    expect(result.current.rows[0].status).toBe('cancelled');
  });

  it('an auth failure stops every run and says why on each row', async () => {
    let calls = 0;
    const c = client((_req, signal) => {
      if (++calls === 1) return Promise.reject(new LlmError('auth', 'API key was rejected — check Settings.'));
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(new LlmError('cancelled', 'Cancelled.')));
      });
    });
    const { result } = setup();
    act(() => result.current.start(c, settings, 3));
    await waitFor(() => expect(result.current.live).toBe(0));
    expect(result.current.rows.every((r) => r.status === 'failed' && r.error?.includes('API key'))).toBe(true);
    expect(createProject).not.toHaveBeenCalled();
  });

  it('a rate limit fails only its own run', async () => {
    let calls = 0;
    const c = client(() => (++calls === 1 ? Promise.reject(new LlmError('rate-limit', 'Rate limited.')) : ok()));
    const { result } = setup();
    act(() => result.current.start(c, settings, 2));
    await waitFor(() => expect(result.current.live).toBe(0));
    expect(result.current.rows.map((r) => r.status).sort()).toEqual(['failed', 'ready']);
  });

  it('reports a failed project write and asks App to refresh the storage verdict', async () => {
    createProject.mockResolvedValue(null);
    const { result, onStorageVerdict } = setup();
    act(() => result.current.start(client(ok), settings, 1));
    await waitFor(() => expect(result.current.live).toBe(0));
    expect(result.current.rows[0]).toMatchObject({ status: 'failed', error: expect.stringMatching(/storage/i) });
    expect(onStorageVerdict).toHaveBeenCalled();
  });
});
