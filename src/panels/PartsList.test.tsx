import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { createBoard, createDocument, sharedOf } from '../document/document';
import { PartsList } from './PartsList';
import { assemblyDoc, cabinetsDoc } from '../document/treeFixtures';

beforeEach(() => useStore.getState().replaceDocument(createDocument('Test')));

/** 'Board', 'Board (1)', 'Board (2)', nothing selected, list rendered. */
const threeParts = () => {
  act(() => {
    const s = useStore.getState();
    s.addBoard();
    s.addBoard();
    s.addBoard();
    useStore.getState().selectBoard(null);
  });
  render(<PartsList />);
  return useStore.getState().doc.boards.map((b) => b.id);
};
const ids = () => useStore.getState().selectedIds;

describe('PartsList selection', () => {
  it('a plain click selects just that part', async () => {
    const [, b] = threeParts();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Board' }));
    await user.click(screen.getByRole('button', { name: 'Board (1)' }));
    expect(ids()).toEqual([b]);
  });

  it('Shift-click, Ctrl-click and Cmd-click each toggle a part', async () => {
    const [a, b, c] = threeParts();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Board' }));
    await user.keyboard('{Shift>}');
    await user.click(screen.getByRole('button', { name: 'Board (2)' }));
    await user.keyboard('{/Shift}');
    expect(ids()).toEqual([a, c]);
    await user.keyboard('{Control>}');
    await user.click(screen.getByRole('button', { name: 'Board' }));
    await user.keyboard('{/Control}');
    expect(ids()).toEqual([c]);
    await user.keyboard('{Meta>}');
    await user.click(screen.getByRole('button', { name: 'Board (1)' }));
    await user.keyboard('{/Meta}');
    expect(ids()).toEqual([c, b]);
  });

  it('marks every selected row, and only those', () => {
    const [a, , c] = threeParts();
    act(() => {
      useStore.getState().toggleSelected(a);
      useStore.getState().toggleSelected(c);
    });
    expect(screen.getByRole('button', { name: 'Board' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Board' })).toHaveClass('selected');
    expect(screen.getByRole('button', { name: 'Board (1)' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Board (1)' })).not.toHaveClass('selected');
    expect(screen.getByRole('button', { name: 'Board (2)' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('PartsList hiding', () => {
  it('each row has an eye whose label carries the state', async () => {
    const [a] = threeParts();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Hide Board' }));
    expect(useStore.getState().hiddenIds).toEqual([a]);
    expect(screen.getByRole('button', { name: 'Show Board' })).toBeInTheDocument();
  });

  it('the Show eye restores a hidden part', async () => {
    threeParts();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Hide Board' }));
    await user.click(screen.getByRole('button', { name: 'Show Board' }));
    expect(useStore.getState().hiddenIds).toEqual([]);
    expect(screen.getByRole('button', { name: 'Hide Board' })).toBeInTheDocument();
  });

  it("a hidden row's name is disabled, and only its eye works", async () => {
    threeParts();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Hide Board' }));
    const name = screen.getByRole('button', { name: 'Board' });
    expect(name).toBeDisabled();
    await user.click(name);
    expect(useStore.getState().selectedIds).toEqual([]);
  });

  it('Show all (N) appears only while something is hidden, and shows everything', async () => {
    threeParts();
    const user = userEvent.setup();
    expect(screen.queryByRole('button', { name: /^Show all/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Hide Board' }));
    await user.click(screen.getByRole('button', { name: 'Hide Board (2)' }));
    await user.click(screen.getByRole('button', { name: 'Show all (2)' }));
    expect(useStore.getState().hiddenIds).toEqual([]);
    expect(screen.queryByRole('button', { name: /^Show all/ })).toBeNull();
  });

  it('a linked row shows a labelled chain icon outside its name button', () => {
    const [a, b] = threeParts();
    act(() => useStore.getState().linkBoards([a!, b!]));
    expect(screen.getAllByRole('img', { name: 'Linked, 2 parts' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Board' })).toBeInTheDocument();
  });
});

describe('PartsList tree', () => {
  it('shows assemblies as collapsible rows and opens the parent of a nested row', async () => {
    useStore.getState().replaceDocument(assemblyDoc());
    render(<PartsList />);
    expect(screen.getByRole('button', { name: 'Drawer' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Collapse Drawer' }));
    expect(screen.queryByRole('button', { name: 'Side' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Expand Drawer' }));
    await userEvent.click(screen.getByRole('button', { name: 'Pin' }));
    expect(useStore.getState().openPath).toBe('i1/i2');
    expect(useStore.getState().selectedIds).toEqual(['i1/i2/b3']);
  });

  it('the eye is disabled under a hidden ancestor, not on the hidden ancestor itself', () => {
    useStore.getState().replaceDocument(assemblyDoc());
    act(() => useStore.getState().setHidden('i1', true));
    render(<PartsList />);
    expect(screen.getByRole('button', { name: 'Side is hidden with Drawer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Show Drawer' })).toBeEnabled();
  });

  it('a covered eye names the NEAREST hidden ancestor, at any depth (fu 227)', () => {
    useStore.getState().replaceDocument(assemblyDoc());
    act(() => useStore.getState().setHidden('i1', true));
    const { unmount } = render(<PartsList />);
    expect(screen.getByRole('button', { name: 'Pin is hidden with Drawer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Peg is hidden with Drawer' })).toBeDisabled();
    unmount();
    useStore.getState().replaceDocument(assemblyDoc());
    act(() => useStore.getState().setHidden('i1/i2', true));
    render(<PartsList />);
    expect(screen.getByRole('button', { name: 'Pin is hidden with Peg' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Show Peg' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Hide Side' })).toBeEnabled();
  });

  it('with both a nested and an outer assembly hidden, a covered eye names the nested one', () => {
    useStore.getState().replaceDocument(assemblyDoc());
    act(() => { useStore.getState().setHidden('i1/i2', true); useStore.getState().setHidden('i1', true); });
    expect(useStore.getState().hiddenIds).toEqual(expect.arrayContaining(['i1', 'i1/i2']));
    render(<PartsList />);
    expect(screen.getByRole('button', { name: 'Pin is hidden with Peg' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Peg is hidden with Drawer' })).toBeDisabled();
  });

  it('the eye is disabled on the open assembly and its ancestors, not on its children', () => {
    useStore.getState().replaceDocument(assemblyDoc());
    act(() => { useStore.getState().openAssembly('i1/i2'); });
    render(<PartsList />);
    expect(screen.getByRole('button', { name: "Drawer is open and can't be hidden" })).toBeDisabled();
    expect(screen.getByRole('button', { name: "Peg is open and can't be hidden" })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Hide Pin' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Hide Top' })).toBeEnabled();
  });
});

describe('PartsList shared copies', () => {
  it('badges each of two instances of one definition', () => {
    const d = assemblyDoc();
    // No nested peg: its definition would be placed twice as well and badge too.
    const flat = { ...d, definitions: d.definitions.map((x) => (x.id === 'd1' ? { ...x, instances: [] } : x)) };
    const i3 = { ...d.instances[0]!, id: 'i3', name: 'Drawer 2', position: [20, 0, 0] as [number, number, number] };
    useStore.getState().replaceDocument({ ...flat, instances: [...d.instances, i3] });
    render(<PartsList />);
    expect(screen.getAllByRole('img', { name: 'Shared, 2 copies' })).toHaveLength(2);
  });

  // Fu 231: a nested definition's own badge. The drawer inside the cabinet is
  // placed once per cabinet (3) plus once at the root (1); the cabinet is 3.
  it('badges a nested assembly by its own placements, not its parent\'s', () => {
    useStore.getState().replaceDocument(cabinetsDoc());
    render(<PartsList />);
    expect(screen.getAllByRole('img', { name: 'Shared, 3 copies' })).toHaveLength(3);
    // 3 nested drawers + the loose one; the unshared 'Solo' has no badge.
    expect(screen.getAllByRole('img', { name: 'Shared, 4 copies' })).toHaveLength(4);
    expect(screen.getAllByRole('img', { name: /^Shared/ })).toHaveLength(7);
    expect(screen.getByRole('button', { name: 'Solo' }).closest('li')?.textContent).not.toMatch(/×/);
  });
});

describe('PartsList mirrored badge', () => {
  it('a mirrored assembly row shows the Mirrored badge; an unmirrored one does not', () => {
    const d = assemblyDoc();
    useStore.getState().replaceDocument({ ...d, instances: d.instances.map((i) => ({ ...i, mirrored: true })) });
    render(<PartsList />);
    expect(screen.getAllByRole('img', { name: 'Mirrored' })).toHaveLength(1);
  });

  it('a mirrored linked PART row shows the Mirrored badge beside its link badge (fu 432); its unmirrored mate none', () => {
    const shape = { id: 's1', ...sharedOf(createBoard()) };
    useStore.getState().replaceDocument({
      ...createDocument('Pair'), shapes: [shape],
      boards: [
        { id: 'l', name: 'Left', position: [0, 0, 0], rotation: 0, shape: 's1' },
        { id: 'r', name: 'Right', position: [40, 0, 0], rotation: 0, shape: 's1', mirrored: true },
      ],
    });
    render(<PartsList />);
    const badges = screen.getAllByRole('img', { name: 'Mirrored' });
    expect(badges).toHaveLength(1);
    const row = screen.getByRole('button', { name: 'Right' }).closest('li')!;
    expect(row).toContainElement(badges[0]!);
    expect(row.querySelector('[aria-label="Linked, 2 parts"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Left' }).closest('li')!.querySelector('[aria-label="Mirrored"]')).toBeNull();
  });
});
