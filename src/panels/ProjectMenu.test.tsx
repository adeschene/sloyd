import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectMenu } from './ProjectMenu';
import { storage } from '../storage/browser';

const entries = [
  { id: 'b', name: 'Shaker end table', savedAt: 2000, createdAt: 0 },
  { id: 'a', name: 'Workbench', savedAt: 1000, createdAt: 0 },
];

beforeEach(() => {
  vi.spyOn(storage, 'listProjects').mockResolvedValue(entries);
});

const open = async () => {
  const user = userEvent.setup();
  await user.click(screen.getByLabelText('Open project menu'));
  return user;
};

describe('ProjectMenu', () => {
  it('lists projects in the order the adapter returned them', async () => {
    render(<ProjectMenu activeId="a" onOpen={vi.fn()} onNew={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} onImport={vi.fn()} />);
    await open();
    const rows = await screen.findAllByRole('menuitemradio');
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Shaker end table'),
      expect.stringContaining('Workbench'),
    ]);
  });

  it('marks the active project', async () => {
    render(<ProjectMenu activeId="a" onOpen={vi.fn()} onNew={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} onImport={vi.fn()} />);
    await open();
    expect(await screen.findByRole('menuitemradio', { name: /Workbench/ })).toBeChecked();
  });

  it('opens a project on click', async () => {
    const onOpen = vi.fn();
    render(<ProjectMenu activeId="a" onOpen={onOpen} onNew={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} onImport={vi.fn()} />);
    const user = await open();
    await user.click(await screen.findByRole('menuitemradio', { name: /Shaker/ }));
    expect(onOpen).toHaveBeenCalledWith('b');
  });

  it('needs two clicks to delete, and says so in between', async () => {
    // Undo is per-document; there is no cross-project undo and no trash.
    const onDelete = vi.fn();
    render(<ProjectMenu activeId="a" onOpen={vi.fn()} onNew={vi.fn()} onDuplicate={vi.fn()} onDelete={onDelete} onImport={vi.fn()} />);
    const user = await open();
    await user.click((await screen.findAllByLabelText(/^Delete /))[0]);
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(await screen.findByRole('button', { name: 'Delete?' }));
    expect(onDelete).toHaveBeenCalledWith('b');
  });

  it('abandons a pending delete when another row is touched', async () => {
    const onDelete = vi.fn();
    render(<ProjectMenu activeId="a" onOpen={vi.fn()} onNew={vi.fn()} onDuplicate={vi.fn()} onDelete={onDelete} onImport={vi.fn()} />);
    const user = await open();
    await user.click((await screen.findAllByLabelText(/^Delete /))[0]);
    await user.click((await screen.findAllByLabelText(/^Duplicate /))[1]);
    expect(screen.queryByRole('button', { name: 'Delete?' })).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('closes on Escape without opening anything', async () => {
    const onOpen = vi.fn();
    render(<ProjectMenu activeId="a" onOpen={onOpen} onNew={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} onImport={vi.fn()} />);
    const user = await open();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('exposes duplicate and delete to the keyboard, not hover alone', async () => {
    // Hover-only reveal would put both operations out of reach without a
    // pointer. They are always in the DOM; CSS handles the reveal.
    render(<ProjectMenu activeId="a" onOpen={vi.fn()} onNew={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} onImport={vi.fn()} />);
    await open();
    expect(await screen.findAllByLabelText(/^Duplicate /)).toHaveLength(2);
    expect(await screen.findAllByLabelText(/^Delete /)).toHaveLength(2);
  });
});
