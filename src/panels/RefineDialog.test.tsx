import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CHANGES_SHOWN, RefineDialog } from './RefineDialog';
import type { RefineRun } from '../useRefine';

const base = {
  hasKey: true, libraryAvailable: true, projectName: 'Box', refusal: null as string | null, initialDetail: 'moderate' as const,
  model: 'claude-opus-5-5', estimate: () => 0.05, run: null as RefineRun | null, live: false,
  onRun: vi.fn(), onCancel: vi.fn(), onOpenProject: vi.fn(), onOpenSettings: vi.fn(), onClose: vi.fn(),
};
const refineButton = () => screen.getByRole('button', { name: 'Refine' });

describe('RefineDialog', () => {
  it('shows a refusal and disables Refine', () => {
    render(<RefineDialog {...base} refusal="There is nothing to refine yet." />);
    expect(screen.getByRole('status').textContent).toBe('There is nothing to refine yet.');
    expect(refineButton()).toHaveProperty('disabled', true);
  });

  it('disables Refine for a blank instruction or a bad limit (review focus 5)', () => {
    render(<RefineDialog {...base} />);
    expect(refineButton()).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('Instruction'), { target: { value: '   ' } });
    expect(refineButton()).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('Instruction'), { target: { value: 'taller' } });
    expect(refineButton()).toHaveProperty('disabled', false);
    fireEvent.change(screen.getByLabelText('Max width'), { target: { value: 'wide' } });
    expect(refineButton()).toHaveProperty('disabled', true);
  });

  it('preselects the detail it is given and sends the settings', () => {
    const onRun = vi.fn();
    render(<RefineDialog {...base} onRun={onRun} />);
    expect((screen.getByLabelText('Detail') as HTMLSelectElement).value).toBe('moderate');
    fireEvent.change(screen.getByLabelText('Instruction'), { target: { value: 'taller' } });
    fireEvent.change(screen.getByLabelText('Max height'), { target: { value: '36' } });
    fireEvent.click(refineButton());
    expect(onRun).toHaveBeenCalledWith({ instruction: 'taller', width: null, depth: null, height: 36, detail: 'moderate' });
  });

  it('shows the result: counts, new issues, at most CHANGES_SHOWN changes and "and N more"', () => {
    const changes = Array.from({ length: CHANGES_SHOWN + 3 }, (_, i) => ({ kind: 'added' as const, subject: 'part' as const, name: `P${i}`, copies: 1, text: `Added P${i}` }));
    const run: RefineRun = { status: 'ready', projectId: 'p1', projectName: 'Box — refined', costUsd: 0.07, outcome: {
      doc: {} as never, usage: {} as never, changes,
      violations: [{ kind: 'hangs', message: 'Shelf is not held.', parts: ['Shelf'] }],
      present: [{ kind: 'overlap', message: 'A passes 0.5in into B along X.', parts: ['A', 'B'] }, { kind: 'tips', message: 't', parts: [] }],
    } };
    render(<RefineDialog {...base} run={run} />);
    expect(screen.getByText("Saved as 'Box — refined'")).toBeTruthy();
    expect(screen.getByText('1 new issue · 2 already present')).toBeTruthy();
    expect(screen.getByText('Shelf is not held.')).toBeTruthy();
    expect(screen.getAllByRole('listitem').filter((li) => li.textContent?.startsWith('Added P'))).toHaveLength(CHANGES_SHOWN);
    expect(screen.getByText('and 3 more')).toBeTruthy();
  });
});
