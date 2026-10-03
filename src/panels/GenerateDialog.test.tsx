import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GenerateDialog } from './GenerateDialog';
import type { RunRow } from '../useGenerations';

const props = (over: Partial<Parameters<typeof GenerateDialog>[0]> = {}) => ({
  hasKey: true, libraryAvailable: true, rows: [] as RunRow[], live: 0,
  onGenerate: vi.fn(), onCancel: vi.fn(), onOpenProject: vi.fn(), onOpenSettings: vi.fn(), onClose: vi.fn(),
  ...over,
});

describe('GenerateDialog', () => {
  it('generates with parsed limits and the chosen count', async () => {
    const p = props();
    render(<GenerateDialog {...p} />);
    await userEvent.type(screen.getByLabelText('Description'), 'A five-shelf bookcase');
    await userEvent.type(screen.getByLabelText('Max width'), '3\'');
    await userEvent.type(screen.getByLabelText('Max height'), '72');
    await userEvent.selectOptions(screen.getByLabelText('Primary material'), 'plywood');
    await userEvent.selectOptions(screen.getByLabelText('Style'), 'shaker');
    await userEvent.click(screen.getByRole('radio', { name: '3' }));
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));
    expect(p.onGenerate).toHaveBeenCalledWith({
      description: 'A five-shelf bookcase', width: 36, depth: null, height: 72,
      material: 'plywood', style: 'shaker', detail: 'moderate',
    }, 3);
  });

  it('disables Generate for a whitespace-only description', async () => {
    render(<GenerateDialog {...props()} />);
    await userEvent.type(screen.getByLabelText('Description'), '   ');
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();
  });

  it.each(['abc', '-3', '0'])('blocks an unparseable or non-positive max size: %s', async (bad) => {
    render(<GenerateDialog {...props()} />);
    await userEvent.type(screen.getByLabelText('Description'), 'a box');
    await userEvent.type(screen.getByLabelText('Max depth'), bad);
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();
    expect(screen.getByText(/not a length/i)).toBeInTheDocument();
  });

  it('disables Generate while a batch is live — a double click cannot start two', async () => {
    render(<GenerateDialog {...props({ live: 2 })} />);
    await userEvent.type(screen.getByLabelText('Description'), 'a box');
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });

  it('replaces Generate with a settings link when there is no key', async () => {
    const p = props({ hasKey: false });
    render(<GenerateDialog {...p} />);
    expect(screen.queryByRole('button', { name: 'Generate' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /set up your api key/i }));
    expect(p.onOpenSettings).toHaveBeenCalled();
  });

  it('disables Generate with the reason when the library is unavailable', async () => {
    render(<GenerateDialog {...props({ libraryAvailable: false })} />);
    await userEvent.type(screen.getByLabelText('Description'), 'a box');
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();
    expect(screen.getByText(/storage is unavailable/i)).toBeInTheDocument();
  });

  it('shows a retry after an unusable answer as a retry, with no issue count', () => {
    const rows: RunRow[] = [{ key: 1, letter: null, status: 'retrying', round: 2, costUsd: null }];
    render(<GenerateDialog {...props({ rows })} />);
    expect(screen.getByText('Retrying (round 2/3)…')).toBeInTheDocument();
    expect(screen.queryByText(/fixing/i)).not.toBeInTheDocument();
  });

  it('renders each run row and opens a ready project', async () => {
    const rows: RunRow[] = [
      { key: 1, letter: 'A', status: 'repairing', round: 1, issues: 2, costUsd: null },
      { key: 2, letter: 'B', status: 'ready', projectId: 'p2', projectName: 'Bench — B', issues: 1, costUsd: 0.081 },
      { key: 3, letter: 'C', status: 'failed', error: 'Rate limited.', costUsd: null },
    ];
    const p = props({ rows });
    render(<GenerateDialog {...p} />);
    expect(screen.getByText(/fixing 2 issues \(round 1\/3\)/i)).toBeInTheDocument();
    expect(screen.getByText(/1 issue/)).toBeInTheDocument();
    expect(screen.getByText('≈ $0.08')).toBeInTheDocument();
    expect(screen.getByText(/rate limited/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open Bench — B' }));
    expect(p.onOpenProject).toHaveBeenCalledWith('p2');
  });
});
