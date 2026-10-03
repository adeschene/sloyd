import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGenerations } from './useGenerations';
import { LlmError } from './llm/types';
import type { LlmClient, LlmRequest, LlmResult } from './llm/types';
import { CONCEPTS_SCHEMA } from './generate/concepts';
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

const CONCEPTS = { concepts: [
  { title: 'Four legs', brief: 'Legs and aprons.' },
  { title: 'Trestle base', brief: 'Two slab ends and a stretcher.' },
  { title: 'Slab sides', brief: 'Two slabs carry the top.' },
] };
const isPlan = (req: LlmRequest) => req.schema === CONCEPTS_SCHEMA;
/** Planning calls go to `plan`, run calls to `run`. */
function planned(plan: LlmClient['complete'], run: LlmClient['complete'] = ok) {
  return client((req, signal) => (isPlan(req) ? plan(req, signal) : run(req, signal)));
}
const calls = (c: LlmClient) => (c.complete as ReturnType<typeof vi.fn>).mock.calls.map(([req]) => req as LlmRequest);
const runFirstMessages = (c: LlmClient) => calls(c).filter((r) => !isPlan(r)).map((r) => r.messages[0] as string);
const planOk = (json: unknown = CONCEPTS) => async (): Promise<LlmResult> => ({ json, assistantTurn: {}, usage });
const abortable = (_req: LlmRequest, signal: AbortSignal) => new Promise<LlmResult>((_, reject) => {
  signal.addEventListener('abort', () => reject(new LlmError('cancelled', 'Cancelled.')));
});

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
    const c = planned(planOk(), (_req, signal) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new LlmError('cancelled', 'Cancelled.')));
    }));
    const { result } = setup();
    act(() => result.current.start(c, settings, 2));
    await waitFor(() => expect(result.current.rows.every((r) => r.status === 'designing')).toBe(true));
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

  it('shows a round after an unusable answer as retrying, with its round number', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let calls = 0;
    const c = client(async () => {
      if (++calls === 1) return { json: null, unusable: 'unparseable', assistantTurn: {}, usage };
      await gate;
      return ok();
    });
    const { result } = setup();
    act(() => result.current.start(c, settings, 1));
    await waitFor(() => expect(result.current.rows[0].status).toBe('retrying'));
    expect(result.current.rows[0]).toMatchObject({ status: 'retrying', round: 1 });
    expect(result.current.rows[0].issues).toBeUndefined();
    release();
    await waitFor(() => expect(result.current.live).toBe(0));
    expect(result.current.rows[0].status).toBe('ready');
  });

  it('an auth failure stops every run and says why on each row', async () => {
    let calls = 0;
    const c = planned(planOk(), (_req, signal) => {
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
    const c = planned(planOk(), () => (++calls === 1 ? Promise.reject(new LlmError('rate-limit', 'Rate limited.')) : ok()));
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

describe('useGenerations — batch planning (fu 164)', () => {
  it('a batch of 1 makes no planning call and shows no plan line', async () => {
    const c = planned(planOk());
    const { result } = setup();
    act(() => result.current.start(c, settings, 1));
    expect(result.current.rows[0].status).toBe('designing');
    await waitFor(() => expect(result.current.live).toBe(0));
    expect(calls(c).some(isPlan)).toBe(false);
    expect(result.current.plan).toBeNull();
    expect(runFirstMessages(c)[0]).not.toContain('Design this version');
    expect(result.current.rows[0].concept).toBeUndefined();
  });

  it('plans ONCE, first, then gives each run a DIFFERENT concept', async () => {
    const c = planned(planOk());
    const { result } = setup();
    act(() => result.current.start(c, settings, 3));
    await waitFor(() => expect(result.current.live).toBe(0));
    const all = calls(c);
    expect(all.filter(isPlan)).toHaveLength(1);
    expect(isPlan(all[0])).toBe(true);
    const firsts = runFirstMessages(c);
    expect(firsts).toHaveLength(3);
    CONCEPTS.concepts.forEach((k, i) => {
      expect(firsts[i].endsWith(`Design this version: ${k.title} — ${k.brief}`)).toBe(true);
    });
    expect(result.current.rows.map((r) => r.concept)).toEqual(['Four legs', 'Trestle base', 'Slab sides']);
    expect(result.current.plan).toEqual({ status: 'ready', costUsd: 0.01 });
    expect(createProject).toHaveBeenCalledTimes(3);
  });

  it('rows wait, and NO run starts, while planning is out', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const c = planned(async () => { await gate; return planOk()(); });
    const { result } = setup();
    act(() => result.current.start(c, settings, 2));
    await waitFor(() => expect(calls(c)).toHaveLength(1));
    expect(result.current.rows.map((r) => r.status)).toEqual(['waiting', 'waiting']);
    expect(result.current.plan).toEqual({ status: 'planning', costUsd: null });
    expect(result.current.live).toBe(2);
    release();
    await waitFor(() => expect(result.current.live).toBe(0));
    expect(calls(c)).toHaveLength(3);
  });

  it.each([
    ['an unusable reply', async (): Promise<LlmResult> => ({ json: null, unusable: 'unparseable', assistantTurn: {}, usage }), 0.01],
    ['too few concepts', planOk({ concepts: [CONCEPTS.concepts[0]] }), 0.01],
    ['an overload', () => Promise.reject(new LlmError('overloaded', 'Overloaded.')), null],
  ] as const)('falls back to the built-in roles on %s, and the runs still go', async (_n, plan, cost) => {
    const c = planned(plan);
    const { result } = setup();
    act(() => result.current.start(c, settings, 3));
    await waitFor(() => expect(result.current.live).toBe(0));
    expect(result.current.plan).toEqual({ status: 'fallback', costUsd: cost });
    expect(result.current.rows.map((r) => r.concept)).toEqual(['Conventional', 'Minimal', 'Different support']);
    expect(runFirstMessages(c)[1]).toContain('Design this version: Minimal — ');
    expect(createProject).toHaveBeenCalledTimes(3);
  });

  it('a rejected key during planning fails every row and starts no run', async () => {
    const c = planned(() => Promise.reject(new LlmError('auth', 'API key was rejected — check Settings.')));
    const { result } = setup();
    act(() => result.current.start(c, settings, 3));
    await waitFor(() => expect(result.current.live).toBe(0));
    expect(calls(c)).toHaveLength(1);
    expect(result.current.plan).toMatchObject({ status: 'failed', error: 'API key was rejected — check Settings.' });
    expect(result.current.rows.every((r) => r.status === 'failed' && r.error?.includes('API key'))).toBe(true);
    expect(createProject).not.toHaveBeenCalled();
  });

  it('cancel during planning starts no run and writes nothing', async () => {
    const c = planned(abortable);
    const { result } = setup();
    act(() => result.current.start(c, settings, 2));
    act(() => result.current.cancel());
    await waitFor(() => expect(result.current.live).toBe(0));
    expect(calls(c)).toHaveLength(1);
    expect(result.current.plan?.status).toBe('cancelled');
    expect(result.current.rows.map((r) => r.status)).toEqual(['cancelled', 'cancelled']);
    expect(createProject).not.toHaveBeenCalled();
  });

  it('a cancel landing as planning RESOLVES still starts no run', async () => {
    const { result } = setup();
    // Planning answers despite the abort. Without the post-planning check the
    // runs would start, and the post-RUN guard would still write nothing — so
    // this asserts on run CALLS, not only on writes.
    const c = planned(async () => {
      act(() => result.current.cancel());
      return planOk()();
    });
    act(() => result.current.start(c, settings, 2));
    await waitFor(() => expect(result.current.live).toBe(0));
    expect(calls(c)).toHaveLength(1);
    expect(result.current.rows.map((r) => r.status)).toEqual(['cancelled', 'cancelled']);
    expect(result.current.plan?.status).toBe('cancelled');
    expect(createProject).not.toHaveBeenCalled();
  });

  it('a batch of 1 after a planned batch clears the plan line', async () => {
    const c = planned(planOk());
    const { result } = setup();
    act(() => result.current.start(c, settings, 2));
    await waitFor(() => expect(result.current.live).toBe(0));
    expect(result.current.plan).not.toBeNull();
    act(() => result.current.start(c, settings, 1));
    expect(result.current.plan).toBeNull();
    await waitFor(() => expect(result.current.live).toBe(0));
  });
});
