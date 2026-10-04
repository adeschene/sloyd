import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { JoineryDialog } from './JoineryDialog';
import type { JoineryRun } from '../useJoinery';
import type { JoineryOutcome } from '../generate/run';

const noop = () => {};
const base = {
  hasKey: true, libraryAvailable: true, projectName: 'Bench',
  sites: ['Rail → Leg: end into face', 'Shelf → Leg: face against edge'],
  model: 'claude-sonnet-5-5', estimateUsd: 0.02 as number | null,
  run: null as JoineryRun | null, live: false,
  onRun: noop, onCancel: noop, onOpenProject: noop, onOpenSettings: noop, onClose: noop,
};
const draw = (over: Partial<typeof base> & Record<string, unknown> = {}) => render(<JoineryDialog {...base} {...over} />);

const outcome = (over: Partial<JoineryOutcome> = {}, result: Partial<JoineryOutcome['result']> = {}): JoineryOutcome => ({
  result: {
    doc: {} as never,
    applied: [
      { site: 0, joint: 'mortise-tenon' }, { site: 1, joint: 'dado' }, { site: 2, joint: 'butt' },
    ],
    skipped: [], moved: [], trimmed: [], sizeBefore: [21.5, 30, 11.5], sizeAfter: [21.5, 30, 11.5], ...result,
  },
  notes: [], violations: [], preexisting: [], usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  ...over,
});
const ready = (o: JoineryOutcome): JoineryRun => ({ status: 'ready', projectId: 'p1', projectName: 'Bench — joined', outcome: o, costUsd: 0.02 });

describe('JoineryDialog', () => {
  it('without a key the primary button sets one up', async () => {
    const onOpenSettings = vi.fn();
    draw({ hasKey: false, onOpenSettings });
    await userEvent.click(screen.getByRole('button', { name: 'Set up your API key' }));
    expect(onOpenSettings).toHaveBeenCalled();
  });

  it('with no sites it says so and cannot run', () => {
    draw({ sites: [], estimateUsd: null });
    expect(screen.getByText('No joints to add — no parts meet end-to-face, face-to-edge, or crossing.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add joinery' })).toBeDisabled();
  });

  it('ready: lists each site, shows the estimate, and runs', async () => {
    const onRun = vi.fn();
    draw({ onRun });
    expect(screen.getByText('Rail → Leg: end into face')).toBeInTheDocument();
    expect(screen.getByText('Shelf → Leg: face against edge')).toBeInTheDocument();
    expect(screen.getByText(/≈ \$0\.02/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add joinery' }));
    expect(onRun).toHaveBeenCalled();
  });

  it('done: names the saved project, summarises joints without counting butts, and opens it', async () => {
    const onOpenProject = vi.fn();
    draw({ run: ready(outcome()), onOpenProject });
    expect(screen.getByText("Saved as 'Bench — joined'")).toBeInTheDocument();
    expect(screen.getByText('2 joints: 1 mortise and tenon, 1 dado')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open Bench — joined' }));
    expect(onOpenProject).toHaveBeenCalledWith('p1');
  });

  it('pluralises the joint words', () => {
    draw({ run: ready(outcome({}, { applied: [
      { site: 0, joint: 'dado' }, { site: 1, joint: 'dado' }, { site: 2, joint: 'stopped-dado' },
      { site: 3, joint: 'stopped-dado' }, { site: 4, joint: 'rabbet' }, { site: 5, joint: 'rabbet' },
      { site: 6, joint: 'half-lap' }, { site: 7, joint: 'half-lap' }, { site: 8, joint: 'mortise-tenon' }, { site: 9, joint: 'mortise-tenon' },
    ] })) });
    expect(screen.getByText('10 joints: 2 mortise and tenon, 2 dados, 2 stopped dados, 2 rabbets, 2 half-laps')).toBeInTheDocument();
  });

  it('reports a changed overall size', () => {
    draw({ run: ready(outcome({}, { sizeAfter: [21.5, 30, 11.25] })) });
    expect(screen.getByText('Overall depth now 11-1/4" (was 11-1/2")')).toBeInTheDocument();
  });

  it('lists moved and trimmed parts, notes, preexisting and remaining violations', () => {
    draw({ run: ready(outcome({
      notes: ['Shelf got a rabbet.'],
      preexisting: [{ kind: 'unsupported', message: 'Lid floats.', parts: ['Lid'] }],
      violations: [{ kind: 'overlap', message: 'Rail overlaps Leg.', parts: ['Rail', 'Leg'] }],
    }, { moved: ['Back'], trimmed: ['Back', 'Shelf'] })) });
    expect(screen.getByText('Moved: Back. Trimmed: Back, Shelf.')).toBeInTheDocument();
    expect(screen.getByText('Shelf got a rabbet.')).toBeInTheDocument();
    expect(screen.getByText('Already in the original: Lid floats.')).toBeInTheDocument();
    expect(screen.getByText('Rail overlaps Leg.')).toBeInTheDocument();
  });

  it('a fallback names the model failure, with no doubled period', () => {
    draw({ run: ready(outcome({ fallback: 'Overloaded.' })) });
    expect(screen.getByText('Joints chosen by built-in rules — the model call failed: Overloaded.')).toBeInTheDocument();
  });

  it('a fallback reason without a period still ends in exactly one', () => {
    draw({ run: ready(outcome({ fallback: 'no usable answer' })) });
    expect(screen.getByText('Joints chosen by built-in rules — the model call failed: no usable answer.')).toBeInTheDocument();
  });

  it('shows progress with Cancel while live, and a failure', async () => {
    const onCancel = vi.fn();
    const { unmount } = draw({ live: true, run: { status: 'repairing', round: 1, issues: 2, costUsd: null }, onCancel });
    expect(screen.getByText(/Fixing 2 issues/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
    unmount();
    draw({ run: { status: 'failed', error: 'Boom.', costUsd: null } });
    expect(screen.getByText('Failed: Boom.')).toBeInTheDocument();
  });
});
