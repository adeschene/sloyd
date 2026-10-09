import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SloydDocument } from '../document/document';
import { JOINERY_WARNING, REPAIR_NOTE, RepairNotice, nameList } from './RepairNotice';

const ok = { doc: {} as SloydDocument, dropped: 3, splits: [] };
const base = { check: ok, context: 'refine' as const, libraryAvailable: true, run: null, onRepair: vi.fn(), onOpenProject: vi.fn() };
const btn = () => screen.queryByRole('button', { name: 'Repair joints' });

describe('RepairNotice', () => {
  it('shows the note and the button; the click calls onRepair', () => {
    const onRepair = vi.fn();
    render(<RepairNotice {...base} onRepair={onRepair} />);
    screen.getByText(REPAIR_NOTE);
    fireEvent.click(btn()!);
    expect(onRepair).toHaveBeenCalledTimes(1);
  });
  it('joinery adds the warning; refine does not', () => {
    const { unmount } = render(<RepairNotice {...base} context="refine" />);
    expect(screen.queryByText(JOINERY_WARNING)).toBeNull();
    unmount();
    render(<RepairNotice {...base} context="joinery" />);
    screen.getByText(JOINERY_WARNING);
  });
  it.each(['refine', 'joinery'] as const)('a refused check shows its text and no button (%s)', (context) => {
    render(<RepairNotice {...base} context={context} check={{ refused: 'X' }} />);
    screen.getByText('X');
    expect(btn()).toBeNull();
  });
  it('disables the button when storage is unavailable and while saving (review focus 4)', () => {
    const { unmount } = render(<RepairNotice {...base} libraryAvailable={false} />);
    expect(btn()).toHaveProperty('disabled', true);
    unmount();
    render(<RepairNotice {...base} run={{ status: 'saving' }} />);
    expect(btn()).toHaveProperty('disabled', true);
  });
  it('done: the saved line, one split line per split, and Open', () => {
    const onOpen = vi.fn();
    render(<RepairNotice check={ok} context="refine" libraryAvailable run={{ status: 'ready', projectId: 'p9', projectName: 'Frames — repaired', dropped: 3, splits: [['Front', 'Back']] }} onRepair={vi.fn()} onOpenProject={onOpen} />);
    screen.getByText("Saved as 'Frames — repaired' — 3 stray cuts removed.");
    screen.getByText('Front and Back no longer match, so they are no longer shared.');
    fireEvent.click(screen.getByRole('button', { name: 'Open Frames — repaired' }));
    expect(onOpen).toHaveBeenCalledWith('p9');
    expect(btn()).toBeNull();
  });
  it('one stray cut is singular', () => {
    render(<RepairNotice {...base} run={{ status: 'ready', projectId: 'p', projectName: 'F — repaired', dropped: 1, splits: [] }} />);
    screen.getByText("Saved as 'F — repaired' — 1 stray cut removed.");
  });
  it('a failed run shows its error', () => {
    render(<RepairNotice {...base} run={{ status: 'failed', error: 'Boom' }} />);
    screen.getByText('Boom');
  });
  it('nameList', () => {
    expect(nameList(['A'])).toBe('A');
    expect(nameList(['A', 'B'])).toBe('A and B');
    expect(nameList(['A', 'B', 'C'])).toBe('A, B and C');
  });
});
