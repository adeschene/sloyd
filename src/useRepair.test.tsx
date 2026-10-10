import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import f2 from './generate/joints/fixtures/2-frames-phantom.json?raw';
import { migrateDocument } from './document/document';
import { useRepair } from './useRepair';
import { storage } from './storage/browser';

vi.mock('./storage/browser', () => ({ storage: { available: true, createProject: vi.fn() } }));
const createProject = storage.createProject as unknown as ReturnType<typeof vi.fn>;
const fx = JSON.parse(f2);
const damaged2 = migrateDocument(fx.damaged);
const plain2 = migrateDocument(fx.plain);
const setup = () => {
  const onCreated = vi.fn();
  const onStorageVerdict = vi.fn();
  return { ...renderHook(() => useRepair({ onCreated, onStorageVerdict })), onCreated };
};
beforeEach(() => { createProject.mockReset(); });

describe('useRepair', () => {
  it('writes the repair WITHOUT activating it, named "<name> — repaired", and reports the count and the split', async () => {
    createProject.mockResolvedValue('p1');
    const { result, onCreated } = setup();
    await act(() => result.current.repair(damaged2));
    expect(createProject).toHaveBeenCalledTimes(1);
    expect(createProject.mock.calls[0]![1]).toEqual({ activate: false });
    expect(createProject.mock.calls[0]![0].name).toBe(`${damaged2.name} — repaired`);
    expect(result.current.run).toEqual({ status: 'ready', projectId: 'p1', projectName: `${damaged2.name} — repaired`, dropped: 3, splits: [['Front', 'Back']] });
    expect(onCreated).toHaveBeenCalledWith('p1');
  });

  it('repairing a project named "— repaired" counts instead of stacking (fu 237)', async () => {
    createProject.mockResolvedValue('p1');
    const { result } = setup();
    await act(() => result.current.repair({ ...damaged2, name: 'Frames — repaired' }));
    expect(createProject.mock.calls[0]![0].name).toBe('Frames — repaired 2');
    expect(result.current.run).toMatchObject({ projectName: 'Frames — repaired 2' });
  });
  it('two clicks write one project (review focus 3)', async () => {
    let release!: (v: string) => void;
    createProject.mockReturnValue(new Promise<string>((r) => { release = r; }));
    const { result } = setup();
    let a!: Promise<void>, b!: Promise<void>;
    act(() => { a = result.current.repair(damaged2); b = result.current.repair(damaged2); });
    release('p1'); await act(() => Promise.all([a, b]));
    expect(createProject).toHaveBeenCalledTimes(1);
  });
  it('a failed write says so (review focus 4)', async () => {
    createProject.mockResolvedValue(null);
    const { result } = setup();
    await act(() => result.current.repair(damaged2));
    expect(result.current.run).toEqual({ status: 'failed', error: 'Could not save the project — storage is unavailable.' });
  });
  it('a write that throws says so, and a later click runs again', async () => {
    createProject.mockRejectedValueOnce(new Error('quota exceeded'));
    const { result } = setup();
    await act(() => result.current.repair(damaged2));
    expect(result.current.run).toEqual({ status: 'failed', error: 'quota exceeded' });
    createProject.mockResolvedValueOnce('p2');
    await act(() => result.current.repair(damaged2));
    expect(result.current.run).toMatchObject({ status: 'ready', projectId: 'p2' });
  });
  it('a throw that is not an Error still fails the run', async () => {
    createProject.mockRejectedValueOnce('nope');
    const { result } = setup();
    await act(() => result.current.repair(damaged2));
    expect(result.current.run).toEqual({ status: 'failed', error: 'Unexpected error.' });
  });
  it('an undamaged document writes nothing', async () => {
    const { result } = setup();
    await act(() => result.current.repair(plain2));
    expect(createProject).not.toHaveBeenCalled();
    expect(result.current.run).toEqual({ status: 'failed', error: 'Nothing to repair.' });
  });
  it('reset clears the run', async () => {
    createProject.mockResolvedValue('p1');
    const { result } = setup();
    await act(() => result.current.repair(damaged2));
    expect(result.current.run).not.toBeNull();
    act(() => result.current.reset());
    expect(result.current.run).toBeNull();
  });
});
