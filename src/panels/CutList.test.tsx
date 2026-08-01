import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { createBoard, createDocument } from '../document/document';
import type { Board } from '../document/document';
import { CutList } from './CutList';

const load = (...boards: Partial<Board>[]) =>
  useStore.getState().replaceDocument({
    ...createDocument('Test'),
    boards: boards.map((b, i) => createBoard({ name: `P${i}`, ...b })),
  });

beforeEach(() => useStore.getState().replaceDocument(createDocument('Test')));

describe('CutList', () => {
  it('says so when there are no parts', () => {
    render(<CutList onClose={() => {}} />);
    expect(screen.getByText('No parts yet.')).toBeInTheDocument();
  });

  it('renders a group header, a quantity and the part names', () => {
    load({ material: 'oak', thickness: 0.75, length: 24, width: 3.5 },
         { material: 'oak', thickness: 0.75, length: 24, width: 3.5 });
    render(<CutList onClose={() => {}} />);

    expect(screen.getByRole('heading', { name: 'Oak — 3/4"' })).toBeInTheDocument();
    expect(screen.getByText('2 ×')).toBeInTheDocument();
    expect(screen.getByText('24" × 3-1/2"')).toBeInTheDocument();
    expect(screen.getByText('P0, P1')).toBeInTheDocument();
  });

  it('renders a setup line under a row that has joinery', () => {
    load({ cuts: [{ id: 'c1', face: 'thickness', from: 'min', across: 'width',
                    offset: 6, width: 0.75, depth: 0.25 }] });
    render(<CutList onClose={() => {}} />);
    expect(screen.getByText(/3\/4" dado, 1\/4" deep/)).toBeInTheDocument();
  });

  it('closes on the close button', async () => {
    let closed = false;
    render(<CutList onClose={() => { closed = true; }} />);
    await userEvent.click(screen.getByLabelText('Close cut list'));
    expect(closed).toBe(true);
  });

  it('closes on Escape', async () => {
    let closed = false;
    render(<CutList onClose={() => { closed = true; }} />);
    await userEvent.keyboard('{Escape}');
    expect(closed).toBe(true);
  });

  it('takes focus on mount', () => {
    // The other half of confining the keyboard to the sheet (App makes the
    // rest of the app inert): without this, focus stays on the toolbar button
    // that opened it, which has just become unfocusable, so focus falls to
    // <body> and the first Tab goes wherever the browser decides.
    const { container } = render(<CutList onClose={() => {}} />);
    expect(document.activeElement).toBe(container.querySelector('.cutlist-sheet'));
  });

  it('renders two identical setup lines without duplicate React keys', () => {
    // Two clicks of "Add cut" on one board: `addCut` derives its defaults from
    // the board alone, so the second cut differs from the first only in `id` —
    // which both `cutSignature` and `setupLine` exclude — and the two lines are
    // the same string. Keying on the line text collided. React WARNS rather
    // than dropping a node, so asserting that both lines render passes either
    // way; the console is the only place the defect is visible.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cut = { face: 'thickness' as const, from: 'min' as const, across: 'width' as const,
                  offset: 6, width: 0.75, depth: 0.25 };
    load({ cuts: [{ ...cut, id: 'c1' }, { ...cut, id: 'c2' }] });
    const { container } = render(<CutList onClose={() => {}} />);

    expect(container.querySelectorAll('.cutlist-setup li')).toHaveLength(2);
    const dupKeyWarning = spy.mock.calls.some((args) =>
      args.some((a) => typeof a === 'string' && /same key/i.test(a)),
    );
    expect(dupKeyWarning).toBe(false);
    spy.mockRestore();
  });

  const dadoed = {
    cuts: [{ id: 'c1', face: 'thickness' as const, from: 'min' as const,
             across: 'width' as const, offset: 6, width: 0.75, depth: 0.375 }],
  };

  it('draws a joinery row by default and leaves a plain row undrawn', () => {
    load(dadoed, {});
    const { container } = render(<CutList onClose={() => {}} />);
    expect(container.querySelectorAll('.cutlist-diagram')).toHaveLength(1);
  });

  it('draws nothing when diagrams are turned off', async () => {
    load(dadoed, {});
    const { container } = render(<CutList onClose={() => {}} />);
    await userEvent.selectOptions(screen.getByLabelText('Diagrams'), 'none');
    expect(container.querySelectorAll('.cutlist-diagram')).toHaveLength(0);
  });

  it('draws every row when asked for all parts', async () => {
    load(dadoed, {});
    const { container } = render(<CutList onClose={() => {}} />);
    await userEvent.selectOptions(screen.getByLabelText('Diagrams'), 'all');
    expect(container.querySelectorAll('.cutlist-diagram')).toHaveLength(2);
  });

  it('starts a fresh open at joinery only', () => {
    load(dadoed, {});
    const first = render(<CutList onClose={() => {}} />);
    expect(first.container.querySelectorAll('.cutlist-diagram')).toHaveLength(1);
    first.unmount();
    const second = render(<CutList onClose={() => {}} />);
    expect(second.container.querySelectorAll('.cutlist-diagram')).toHaveLength(1);
  });

  it('keeps the setup line beside the drawing rather than replacing it', () => {
    load(dadoed);
    render(<CutList onClose={() => {}} />);
    expect(screen.getByText(/3\/4" dado, 3\/8" deep/)).toBeInTheDocument();
    expect(screen.getByText(/Schematic — not to scale/)).toBeInTheDocument();
  });
});
