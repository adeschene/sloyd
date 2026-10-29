import { readFileSync } from 'node:fs';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { buildCutList, createBoard, createDocument, flatDocument } from '../document/document';
import type { Board } from '../document/document';
import { assemblyDoc } from '../document/treeFixtures';
import { CutList } from './CutList';
import { anchorsFor, layoutBalloons } from './planBalloons';
import { hardwareTotals } from '../document/hardware';
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

  it('a banded project carries the banding note in the header; a band-free one does not (edge banding spec §4.1)', () => {
    const note = /Cut sizes are before banding/;
    load({ material: 'plywood' });
    const { unmount } = render(<CutList onClose={() => {}} />);
    expect(screen.queryByText(note)).toBeNull();
    unmount();
    load({ material: 'plywood', bands: [{ side: { across: 'width', from: 'min' }, type: 'band-iron-on' }] });
    render(<CutList onClose={() => {}} />);
    expect(screen.getByText(note).closest('header')).not.toBeNull();
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

  it('a metric cut list carries the sheet note, even with diagrams off; an imperial one does not', async () => {
    load(dadoed, {});
    const first = render(<CutList onClose={() => {}} />);
    expect(screen.queryByText('Dimensions in mm')).toBeNull();
    // fu 357: only a metric sheet takes the named print page that repeats the note in every page's margin.
    expect(first.container.querySelector('.cutlist-sheet')).not.toHaveClass('sheet-metric');
    first.unmount();
    act(() => useStore.getState().setUnitsDisplay('metric-mm'));
    const second = render(<CutList onClose={() => {}} />);
    await userEvent.selectOptions(screen.getByLabelText('Diagrams'), 'none');
    expect(screen.getByText('Dimensions in mm')).toBeInTheDocument();
    expect(second.container.querySelector('.cutlist-sheet')).toHaveClass('sheet-metric');
  });

  it('sheet prose reads the trade size; a metric project adds its mm, and the oversize line names the part in mm', () => {
    load({ material: 'plywood', thickness: 0.75, length: 24, width: 12, name: 'Side' },
         { material: 'plywood', thickness: 0.75, length: 98, width: 24, name: 'Side' });
    const imperial = render(<CutList onClose={() => {}} />);
    expect(imperial.container.textContent).toContain('1 sheet (96" × 48")');
    expect(imperial.container.textContent).toContain('Side (98" × 24") does not fit a 96" × 48" sheet.');
    imperial.unmount();
    act(() => useStore.getState().setUnitsDisplay('metric-mm'));
    const metric = render(<CutList onClose={() => {}} />);
    expect(metric.container.textContent).toContain('1 sheet (96" × 48" (2438 × 1219 mm))');
    expect(metric.container.textContent).toContain('Side (2489 × 610 mm) does not fit a 96" × 48" (2438 × 1219 mm) sheet.');
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
      expect(within(buying).getByText('Buy 1 × 1×6 × 8′ · $12.00')).toBeInTheDocument();
      expect(within(buying).getByText('Estimated materials: $31.50')).toBeInTheDocument();
      expect(within(buying).getByRole('img', { name: '1×6 × 8′ — board 1, 1 part' })).toBeInTheDocument();
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

  it('a pine 1×4 row shows its nominal name beside unchanged dims', () => {
    load({ name: 'Rail', material: 'pine', thickness: 0.75, length: 24, width: 3.5 });
    const { container } = render(<CutList onClose={() => {}} />);
    const row = container.querySelector('.cutlist-row')!;
    expect(row.querySelector('.cutlist-nominal')?.textContent).toBe('1×4');
    expect(row.querySelector('.cutlist-dims')?.textContent).toBe('24" × 3-1/2"');
    expect(row.querySelector('.cutlist-names')?.textContent).toBe('1×4 Rail');
  });
});

// Fu 98: the saw kerf had no control. Four 48 × 24 panels fill a 96 × 48 sheet exactly with no kerf; at the default
// 1/8" no two fit side by side or stacked (48 + 1/8 + 48 > 96), so each needs its own sheet. The field is the project's kerf,
// one undoable edit.
describe('the Saw kerf field (fu 98)', () => {
  const panels = () => load(...[1, 2, 3, 4].map((i) => ({ material: 'plywood', thickness: 0.75, length: 48, width: 24, name: `Panel ${i}` })));
  it('shows the project kerf and re-packs the sheets when it changes', async () => {
    panels();
    const { container } = render(<CutList onClose={() => {}} />);
    const field = screen.getByLabelText('Saw kerf');
    expect(field).toHaveValue('1/8"');
    expect(container.textContent).toContain('4 sheets (96" × 48")');
    await userEvent.clear(field); await userEvent.type(field, '0{Enter}');
    expect(useStore.getState().doc.stock.kerf).toBe(0);
    expect(container.textContent).toContain('1 sheet (96" × 48")');
  });
  it('refuses a kerf no saw cuts, keeping the stored one', async () => {
    panels();
    render(<CutList onClose={() => {}} />);
    const field = screen.getByLabelText('Saw kerf');
    await userEvent.clear(field); await userEvent.type(field, '1{Enter}');
    expect(screen.getByText(/Must be at most/)).toBeInTheDocument();
    expect(useStore.getState().doc.stock.kerf).toBe(0.125);
  });
});

// Plans balloons spec §2.1: each row leads with its number, the one a Plans sheet balloon cites.
describe('row numbers (plans balloons §2.1)', () => {
  it('leads each row with its number, in display order', () => {
    load({ name: 'Short', length: 12 }, { name: 'Long', length: 30 });
    const { container } = render(<CutList onClose={() => {}} />);
    const nums = [...container.querySelectorAll('.cutlist-row > .cutlist-num')].map((e) => e.textContent);
    expect(nums).toEqual(['1', '2']);
    expect(container.querySelector('.cutlist-row')!.firstElementChild).toHaveClass('cutlist-num');
  });
  // The user's ruling (plan Task 2): a layout's small parts carry their ROW number, one series with the column.
  it('a layout key cites the cut-list row number, not its own count', () => {
    load(
      { material: 'plywood', thickness: 0.75, length: 30, width: 11.25, name: 'Side' },
      { material: 'plywood', thickness: 0.75, length: 30, width: 1.5, name: 'Cleat A' },
      { material: 'plywood', thickness: 0.75, length: 30, width: 1.5, name: 'Cleat B' },
    );
    const { container } = render(<CutList onClose={() => {}} />);
    const cleatRow = [...container.querySelectorAll('.cutlist-row')].find((r) => r.textContent!.includes('Cleat A'))!;
    const n = cleatRow.querySelector('.cutlist-num')!.textContent;
    expect(n).toBe('2');
    const key = [...container.querySelectorAll('.cutlist-layout-key li')].map((li) => li.textContent);
    expect(key).toEqual([`${n}. Cleat A — 30" × 1-1/2"`, `${n}. Cleat B — 30" × 1-1/2"`]);
  });
});

// Glue-ups spec §5: a glue strip in a Buying layout takes its part's cut-list row number, for a part inside an assembly too
// (its flat id has a path, which `glueStripPart` reads up to the LAST tag).
describe('glue strips in a board layout (glue-ups spec §5)', () => {
  it("a glue strip in a board layout carries its part's row number (glue-ups spec §5)", () => {
    // Pine 3/4 × 4 × 10 from 3/4 × 1-1/2 × 96 only: 4/2 + 1/8 > 1-1/2, 4/3 + 1/8 = 1.458 → 3 strips 1.458 × 11, index-tier thin.
    const panel = createBoard({ id: 'panel', name: 'Panel', material: 'pine', length: 10, width: 4, thickness: 0.75 });
    useStore.getState().replaceDocument({
      ...createDocument('Glue'),
      // Oak sorts before Pine, so the panel's row is 3; oak is bought by the board foot and draws no layout of its own.
      boards: [createBoard({ name: 'Back', material: 'oak', length: 20, width: 10, thickness: 0.75 }),
        createBoard({ name: 'Side', material: 'oak', length: 30, width: 12, thickness: 0.75 })],
      instances: [{ id: 'i1', name: 'Box', definition: 'd1', position: [40, 0, 0], rotation: 0 }],
      definitions: [{ id: 'd1', boards: [panel], instances: [], hardware: [] }],
    });
    const s = defaultShop();
    s.materials.pine = { mode: 'piece', stock: [{ id: 'x', thickness: 0.75, width: 1.5, length: 96, price: null }] };
    const { container } = render(<CutList onClose={() => {}} shop={s} />);
    const row = [...container.querySelectorAll('.cutlist-row')].find((r) => r.textContent!.includes('Panel'))!;
    const n = row.querySelector('.cutlist-num')!.textContent!;
    expect(Number(n)).toBeGreaterThan(2);   // after both oak rows, so the layout's own counter could not pass for it
    const buying = screen.getByRole('region', { name: 'Buying' });
    const layout = buying.querySelector('svg')!;
    // All three strips cite the panel's number; the layout's own counter would print 1, 2, 3 instead.
    expect(within(layout as unknown as HTMLElement).getAllByText(n).length).toBeGreaterThanOrEqual(3);
  });
});

// Fu 383, the user's ruling 2026-10-16 ("yes, new page per section"): a printed cut list split its material sections across
// pages wherever they fell. Not `?raw`: Vitest hands CSS back as '' (palette.test.ts reads it the same way).
describe('printed page breaks (fu 383)', () => {
  const css = readFileSync('src/styles.css', 'utf8');
  const print = css.slice(css.indexOf('@media print {'));
  // Every print rule naming `selector` (one selector may sit in several lists), their bodies joined.
  const rule = (selector: string) => {
    const re = new RegExp(`(^|[,}\\s])${selector.replace(/[.+*()]/g, '\\$&')}\\s*[,{]`, 'gm');
    const bodies = [...print.matchAll(re)].map((m) => print.slice(print.indexOf('{', m.index), print.indexOf('}', m.index) + 1));
    expect(bodies.length, `${selector} has a print rule`).toBeGreaterThan(0);
    return bodies.join(' ');
  };

  it('every material section after the first, and Buying, starts a new page', () => {
    expect(rule('.cutlist-group + .cutlist-group')).toMatch(/break-before:\s*page/);
    expect(rule('.cutlist-buying')).toMatch(/break-before:\s*page/);
  });

  it('the first section follows the title, not a blank page', () => {
    expect(print).not.toMatch(/(^|[,}\s])\.cutlist-group\s*\{[^}]*break-before/m);
  });

  it('a section heading never ends a page, and a subtotal never starts one', () => {
    expect(rule('.cutlist-group h3')).toMatch(/break-after:\s*avoid/);
    expect(rule('.cutlist-buying h3')).toMatch(/break-after:\s*avoid/);
    expect(rule('.cutlist-buying-entry h4')).toMatch(/break-after:\s*avoid/);
    expect(rule('.cutlist-subtotal')).toMatch(/break-before:\s*avoid/);
  });

  it('the sections are siblings, so `+` reaches every one after the first', () => {
    load({ name: 'A', material: 'pine' }, { name: 'B', material: 'walnut' }, { name: 'C', material: 'oak' });
    const { container } = render(<CutList onClose={() => {}} />);
    const groups = [...container.querySelectorAll('.cutlist-group')];
    expect(groups).toHaveLength(3);
    for (const g of groups.slice(1)) expect(g.previousElementSibling?.classList.contains('cutlist-group')).toBe(true);
    // The weight round's project line (weight spec §5.1) sits under the groups, before Buying; the groups stay siblings.
    const total = container.querySelector('.cutlist-buying')?.previousElementSibling;
    expect(total?.classList.contains('cutlist-weight-total')).toBe(true);
    expect(total?.previousElementSibling?.classList.contains('cutlist-group')).toBe(true);
  });

  it('a by-the-piece board layout labels each strip with its strip row\'s number (edge banding spec §4.4)', () => {
    const maple = { id: 'm', name: 'Maple edging', kind: 'solid' as const, thickness: 0.25, lengthAllowance: 0.5, material: 'walnut', widthAllowance: 0.0625 };
    useStore.getState().replaceDocument({
      ...createDocument('Test'),
      bandTypes: [maple],
      boards: [createBoard({ name: 'Back', material: 'plywood', length: 20, width: 10, thickness: 0.75 }),
        createBoard({ name: 'Shelf', material: 'plywood', length: 30, width: 12, thickness: 0.75,
        bands: [{ side: { across: 'length', from: 'min' }, type: 'm' }] })],
    });
    const s = defaultShop();
    s.materials.walnut = { mode: 'piece', stock: [{ id: 'k', thickness: 1, width: 6, length: 96, price: null }] };
    const { container } = render(<CutList onClose={() => {}} shop={s} />);
    const maple$ = [...container.querySelectorAll('.cutlist-group')].find((g) => g.querySelector('h3')?.textContent?.includes('Walnut'))!;
    const num = maple$.querySelector('.cutlist-num')!.textContent!;
    const buying = screen.getByRole('region', { name: 'Buying' });
    const layout = buying.querySelector('svg')!;
    expect(Number(num)).toBeGreaterThan(2);   // after both plywood rows, so a bare index (1) could not pass for it
    expect(within(layout as unknown as HTMLElement).getAllByText(num).length).toBeGreaterThan(0);
  });
});

describe('Hardware (hardware spec §4)', () => {
  const hwDoc = (withHardware = true) => {
    const door = createBoard({ id: 'door', name: 'Left door', material: 'pine', length: 20, width: 10, thickness: 0.75, hardware: withHardware ? [{ type: 'h1', count: 2 }] : [] });
    return {
      ...createDocument('HW'),
      hardwareTypes: [{ id: 'h1', name: 'Euro hinge, 35 mm', packSize: 1, pricePerPack: 4.5 }],
      instances: [1, 2].map((n) => ({ id: `i${n}`, name: 'Base cabinet', definition: 'd1', position: [n * 30, 0, 0] as [number, number, number], rotation: 0 as const })),
      definitions: [{ id: 'd1', boards: [door], instances: [], hardware: [] }],
    };
  };

  it('renders the section after the groups and before Buying, with name, total and where-used', () => {
    useStore.getState().replaceDocument(hwDoc());
    const { container } = render(<CutList onClose={() => {}} />);
    const section = screen.getByRole('region', { name: 'Hardware' });
    expect(within(section).getByRole('heading', { name: 'Hardware' })).toBeInTheDocument();
    const row = within(section).getByText('Euro hinge, 35 mm').closest('tr')!;
    expect(within(row).getByText('4')).toBeInTheDocument();
    expect(within(row).getByText('Base cabinet › Left door: 2 × 2')).toBeInTheDocument();
    // Under the groups, the weight round's project line first (weight spec §5.1), then Hardware.
    expect(section.previousElementSibling?.classList.contains('cutlist-weight-total')).toBe(true);
    expect(section.previousElementSibling?.previousElementSibling?.classList.contains('cutlist-group')).toBe(true);
    expect(section.nextElementSibling?.classList.contains('cutlist-buying')).toBe(true);
    expect(container.querySelectorAll('.cutlist-hardware')).toHaveLength(1);
  });

  it('is absent with no hardware', () => {
    useStore.getState().replaceDocument(hwDoc(false));
    render(<CutList onClose={() => {}} />);
    expect(screen.queryByRole('region', { name: 'Hardware' })).toBeNull();
  });

  it('Buying gets a Hardware block after Edge banding, and the total includes it', () => {
    useStore.getState().replaceDocument(hwDoc());
    render(<CutList onClose={() => {}} />);
    const buying = screen.getByRole('region', { name: 'Buying' });
    const heads = within(buying).getAllByRole('heading', { level: 4 }).map((h) => h.textContent);
    expect(heads[heads.length - 1]).toBe('Hardware');
    expect(within(buying).getByText('Euro hinge, 35 mm: buy 4 · $18.00')).toBeInTheDocument();
    expect(within(buying).getByText(/Estimated materials: \$18\.00/)).toBeInTheDocument();
  });

  it('is not numbered and contributes no balloon: the balloon layout is unchanged (plans balloons)', () => {
    const doc = hwDoc();
    const plain = { ...doc, hardwareTypes: [], definitions: [{ ...doc.definitions[0]!, boards: [{ ...doc.definitions[0]!.boards[0]!, hardware: [] }] }] };
    const balloons = (d: typeof doc) => {
      const rows = buildCutList(flatDocument(d)).groups.flatMap((g) => g.rows).map((r) => ({ number: r.number, boardIds: r.boardIds }));
      const ids = rows.flatMap((r) => r.boardIds);
      const segs = ids.flatMap((id, k) => [{ part: id, a: [k * 10, 0] as [number, number], b: [k * 10 + 8, 0] as [number, number] }, { part: id, a: [k * 10, 0] as [number, number], b: [k * 10, 6] as [number, number] }]);
      const drawing = { visible: segs, hidden: [], bounds: { min: [0, 0] as [number, number], max: [Math.max(10, ids.length * 10), 6] as [number, number] } };
      const plan = anchorsFor(drawing, rows);
      return { rows, plan, layout: layoutBalloons(drawing, plan) };
    };
    expect(balloons(doc)).toEqual(balloons(plain as unknown as typeof doc));
    useStore.getState().replaceDocument(doc);
    const { container } = render(<CutList onClose={() => {}} />);
    expect(container.querySelector('.cutlist-hardware .cutlist-num')).toBeNull();
  });

  it('Buying lists Edge banding, then Hardware', () => {
    const tape = { id: 'tb', name: 'Oak tape', kind: 'tape' as const, thickness: 0.02, lengthAllowance: 0, tapeWidth: 1, pricePerFoot: 1 };
    const doc = hwDoc();
    const d0 = doc.definitions[0]!;
    useStore.getState().replaceDocument({ ...doc, bandTypes: [tape],
      definitions: [{ ...d0, boards: [{ ...d0.boards[0]!, bands: [{ side: { across: 'length', from: 'min' }, type: 'tb' }] } as never] }] });
    render(<CutList onClose={() => {}} />);
    const heads = within(screen.getByRole('region', { name: 'Buying' })).getAllByRole('heading', { level: 4 }).map((h) => h.textContent);
    expect(heads.slice(-2)).toEqual(['Edge banding', 'Hardware']);
  });

  it('hiding a part leaves the totals unchanged (inv 43)', () => {
    const doc = { ...createDocument('HW'), hardwareTypes: hwDoc().hardwareTypes,
      boards: [createBoard({ id: 'b1', name: 'Door', material: 'pine', length: 20, width: 10, thickness: 0.75, hardware: [{ type: 'h1', count: 3 }] })] };
    useStore.getState().replaceDocument(doc);
    const totals = hardwareTotals(useStore.getState().doc);
    const first = render(<CutList onClose={() => {}} />);
    const before = first.container.querySelector('.cutlist-hardware')!.textContent;
    expect(before).toContain('Door: 3');
    act(() => useStore.getState().setHidden('b1', true));
    expect(useStore.getState().hiddenIds).toContain('b1');
    expect(hardwareTotals(useStore.getState().doc)).toEqual(totals);
    first.unmount();
    const again = render(<CutList onClose={() => {}} />);
    expect(again.container.querySelector('.cutlist-hardware')!.textContent).toBe(before);
  });
});

describe('Labels… (part labels spec §4.1)', () => {
  it('calls onOpenLabels, and is absent without it', () => {
    useStore.getState().replaceDocument(createDocument('L'));
    const onOpenLabels = vi.fn();
    const first = render(<CutList onClose={() => {}} onOpenLabels={onOpenLabels} />);
    fireEvent.click(screen.getByRole('button', { name: 'Labels…' }));
    expect(onOpenLabels).toHaveBeenCalledOnce();
    first.unmount();
    render(<CutList onClose={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Labels…' })).toBeNull();
  });
});
