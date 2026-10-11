import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { createDocument } from '../document/document';
import { ActionBar, COPY_IN_ROW, splitActions } from './ActionBar';

beforeEach(() => useStore.getState().replaceDocument(createDocument('Test')));

describe('splitActions', () => {
  it('shows the first three in order and puts the rest, in order, under More', () => {
    expect(splitActions([1, 2, 3, 4, 5])).toEqual({ shown: [1, 2, 3], more: [4, 5] });
    expect(splitActions([1, 2])).toEqual({ shown: [1, 2], more: [] });
  });
});

describe('ActionBar', () => {
  const a = (label: string) => ({ label, run: vi.fn() });

  it('renders three buttons, More with the rest, and Delete as an icon button named Delete', async () => {
    const onDelete = vi.fn();
    const acts = [a('One'), a('Two'), a('Three'), a('Four')];
    render(<ActionBar actions={acts} onDelete={onDelete} />);
    for (const n of ['One', 'Two', 'Three']) expect(screen.getByRole('button', { name: n })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Four' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.click(screen.getByRole('button', { name: 'Four' }));
    expect(acts[3]!.run).toHaveBeenCalledTimes(1);
    const del = screen.getByRole('button', { name: 'Delete' });
    expect(del.textContent).toBe('');
    await userEvent.click(del);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('renders no More when there are three actions or fewer', () => {
    render(<ActionBar actions={[a('One'), a('Two')]} onDelete={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
  });

  it('opens its own Copy in a row form from the entry, and Cancel closes it', async () => {
    useStore.getState().addBoard();
    render(<ActionBar actions={[a('One'), a('Two'), a('Three'), COPY_IN_ROW]} onDelete={vi.fn()} />);
    expect(screen.queryByRole('group', { name: 'Copy in a row' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.click(screen.getByRole('button', { name: 'Copy in a row…' }));
    expect(screen.getByRole('group', { name: 'Copy in a row' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('group', { name: 'Copy in a row' })).toBeNull();
  });
});
