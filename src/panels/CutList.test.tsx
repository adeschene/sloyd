import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { createBoard, createDocument } from '../document/document';
import type { Board } from '../document/document';
import { assemblyDoc } from '../document/treeFixtures';
import { CutList } from './CutList';
import { defaultShop, type ShopSettings } from '../document/purchase';

const load = (...boards: Partial<Board>[]) =>
  useStore.getState().replaceDocument({
    ...createDocument('Test'),
    boards: boards.map((b, i) => createBoard({ name: `P${i}`, ...b })),
  });

beforeEach(() => useStore.getState().replaceDocument(createDocument('Test')));

describe('CutList', () => {
  it('names parts inside assemblies by their display path (assemblies spec §6)', () => {
    useStore.getState().replaceDocument(assemblyDoc());
    render(<CutList onClose={() => {}} />);
    // Scoped to the row names: the Buying section below also names the part (a planing note).
    expect(screen.getByText(/Drawer › Peg › Pin/, { selector: '.cutlist-names' })).toBeInTheDocument();
  });

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
                    offset: 6, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 }] });
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
                  offset: 6, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
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
             across: 'width' as const, offset: 6, width: 0.75, depth: 0.375, stopMin: 0, stopMax: 0 }],
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

  it('renders the stock total for each row and the group subtotal', () => {
    // Two DIFFERENTLY sized boards on purpose. An earlier version of this test
    // used two identical ones, which collapse onto a single row — so the row
    // and the subtotal printed the same string and an assertion on that string
    // passed even if the row's own cell were deleted. Distinct sizes give three
    // distinct strings, so each assertion can only be satisfied by the element
    // it is actually about.
    //   24 x 5-1/2 x 3/4 =  99      in3 -> 0.69 bd ft
    //   36 x 7-1/4 x 3/4 = 195.75   in3 -> 1.36 bd ft
    //                      294.75   in3 -> 2.05 bd ft (subtotal)
    load({ material: 'pine', thickness: 0.75, length: 24, width: 5.5 },
         { material: 'pine', thickness: 0.75, length: 36, width: 7.25 });
    const { container } = render(<CutList onClose={() => {}} />);
    expect(screen.getByText('0.69 bd ft')).toBeInTheDocument();
    expect(screen.getByText('1.36 bd ft')).toBeInTheDocument();
    expect(container.querySelector('.cutlist-subtotal .cutlist-stock')?.textContent)
      .toBe('2.05 bd ft');
  });

  describe('Buying (lumber yield and cost spec §4)', () => {
    const shop = (): ShopSettings => {
      const s = defaultShop();
      s.materials.oak = { mode: 'board-foot', pricePerBoardFoot: 10, wasteFactor: 1.3 };
      s.materials.pine = { mode: 'piece', stock: [{ id: 'A', thickness: 0.75, width: 5.5, length: 96, price: 12 }] };
      return s;
    };

    it('lists what to buy per material and an exact total', () => {
      // Oak 48 × 6 × ¾ = 1.5 bd ft × 1.3 = 1.95 × $10 = $19.50. Pine 30 × 5 × ¾ on one A board = $12. Total $31.50.
      load({ name: 'Top', material: 'oak', thickness: 0.75, length: 48, width: 6 },
           { name: 'Rail', material: 'pine', thickness: 0.75, length: 30, width: 5 });
      render(<CutList onClose={() => {}} shop={shop()} />);
      const buying = screen.getByRole('region', { name: 'Buying' });
      expect(within(buying).getByText('Oak — 3/4": buy 1.95 bd ft (1.50 bd ft net × 1.3) · $19.50')).toBeInTheDocument();
      expect(within(buying).getByText('Buy 1 × 3/4" × 5-1/2" × 96" · $12.00')).toBeInTheDocument();
      expect(within(buying).getByText('Estimated materials: $31.50')).toBeInTheDocument();
      expect(within(buying).getByRole('img', { name: '3/4" × 5-1/2" × 96" — board 1, 1 part' })).toBeInTheDocument();
    });

    it('hides the board layouts with the Layouts toggle', async () => {
      load({ name: 'Rail', material: 'pine', thickness: 0.75, length: 30, width: 5 });
      render(<CutList onClose={() => {}} shop={shop()} />);
      await userEvent.click(screen.getByRole('checkbox', { name: 'Layouts' }));
      expect(screen.queryByRole('img', { name: /board 1/ })).toBeNull();
    });

    it('offers the prices dialog, and leaves Escape to it while suspended', async () => {
      const onOpenPrices = vi.fn();
      let closed = false;
      const { rerender } = render(<CutList onClose={() => { closed = true; }} onOpenPrices={onOpenPrices} />);
      await userEvent.click(screen.getByRole('button', { name: 'Materials & prices…' }));
      expect(onOpenPrices).toHaveBeenCalled();
      rerender(<CutList onClose={() => { closed = true; }} onOpenPrices={onOpenPrices} suspended />);
      await userEvent.keyboard('{Escape}');
      expect(closed).toBe(false);
    });
  });
});
