import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { useStore } from '../store/store';
import { createBoard, createDocument } from '../document/document';
import type { Board, Definition, HardwareType, HardwareUse, Instance, SloydDocument } from '../document/document';
import { Properties } from './Properties';

const TYPES: HardwareType[] = [
  { id: 'h1', name: 'Hinge', packSize: 1, pricePerPack: null },
  { id: 'h2', name: 'Pull', packSize: 1, pricePerPack: null },
];
const plain = (over: Partial<Board> = {}) => createBoard({ id: 'a', name: 'Door', length: 30, width: 12, thickness: 0.75, ...over });
const inst = (id: string, name: string): Instance => ({ id, name, definition: 'd1', position: [0, 0, 0], rotation: 0 });
const def = (hardware: HardwareUse[] = []): Definition => ({ id: 'd1', boards: [], instances: [], hardware });
const load = (over: Partial<SloydDocument>) => {
  useStore.getState().replaceDocument({ ...createDocument('T'), hardwareTypes: TYPES, ...over });
};
const open = (over: Partial<SloydDocument>, select: string | null = 'a', onNew = () => {}) => {
  load(over);
  if (select) useStore.getState().selectBoard(select);
  render(<Properties onNewHardwareType={onNew} />);
};
const hw = () => (useStore.getState().doc.boards[0] as Board).hardware;
const undoDepth = () => useStore.getState().past.length;
const add = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  await user.click(screen.getByRole('button', { name: '+ Add hardware' }));
  await user.click(screen.getByRole('button', { name }));
};

afterEach(() => { vi.restoreAllMocks(); act(() => useStore.getState().setExplode(0)); });

describe('the Hardware section (hardware spec §5.1)', () => {
  it('a refused or no-op add leaves no pending focus to steal later', async () => {
    const user = userEvent.setup();
    open({ boards: [plain()] });
    const real = useStore.getState().setHardware;
    act(() => useStore.setState({ setHardware: () => {} }));
    await add(user, 'Hinge');
    act(() => useStore.setState({ setHardware: real }));
    act(() => useStore.getState().setHardware({ kind: 'part', id: 'a' }, 'h1', 2));
    expect(screen.getByLabelText('Hinge')).not.toHaveFocus();
  });

  it('an empty holder shows only + Add hardware ▾; choosing Hinge writes count 1 and focuses the count', async () => {
    const user = userEvent.setup();
    open({ boards: [plain()] });
    expect(screen.getByRole('heading', { name: 'Hardware' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    await add(user, 'Hinge');
    expect(hw()).toEqual([{ type: 'h1', count: 1 }]);
    const field = screen.getByLabelText('Hinge');
    expect(field).toHaveFocus();
    expect(field).toHaveValue('1');
  });

  it.each(['0', '2.5', '-1', '1000', '1e3', ''])('count refusal %j: the field errors, keeps focus, the doc is untouched', async (typed) => {
    const user = userEvent.setup();
    open({ boards: [plain({ hardware: [{ type: 'h1', count: 3 }] })] });
    const before = useStore.getState().doc;
    const field = screen.getByLabelText('Hinge');
    await user.clear(field);
    if (typed) await user.type(field, typed);
    await user.keyboard('{Enter}');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveFocus();
    expect(useStore.getState().doc).toBe(before);
  });

  it('a non-numeric entry says the hardware words', async () => {
    const user = userEvent.setup();
    open({ boards: [plain({ hardware: [{ type: 'h1', count: 3 }] })] });
    const field = screen.getByLabelText('Hinge');
    await user.clear(field);
    await user.type(field, '2.5{Enter}');
    expect(screen.getByText('Enter a whole number, 1 to 999')).toBeInTheDocument();
  });

  it('a valid count commits as one undo entry', async () => {
    const user = userEvent.setup();
    open({ boards: [plain({ hardware: [{ type: 'h1', count: 3 }] })] });
    const n = undoDepth();
    const field = screen.getByLabelText('Hinge');
    await user.clear(field);
    await user.type(field, '999{Enter}');
    expect(hw()).toEqual([{ type: 'h1', count: 999 }]);
    expect(undoDepth()).toBe(n + 1);
  });

  it('Remove deletes the entry as one undo entry', async () => {
    const user = userEvent.setup();
    open({ boards: [plain({ hardware: [{ type: 'h1', count: 3 }] })] });
    const n = undoDepth();
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(hw()).toEqual([]);
    expect(undoDepth()).toBe(n + 1);
    expect(screen.queryByLabelText('Hinge')).toBeNull();
  });

  it('a type already on the holder is greyed Already added and not clickable', async () => {
    const user = userEvent.setup();
    open({ boards: [plain({ hardware: [{ type: 'h1', count: 3 }] })] });
    const before = useStore.getState().doc;
    await user.click(screen.getByRole('button', { name: '+ Add hardware' }));
    const item = screen.getByRole('button', { name: /^Hinge/ });
    expect(item).toBeDisabled();
    expect(item).toHaveTextContent('Already added');
    await user.click(item);
    expect(useStore.getState().doc).toBe(before);
    expect(screen.getByRole('button', { name: 'Pull' })).toBeEnabled();
  });

  it('New hardware type… calls onNewHardwareType', async () => {
    const user = userEvent.setup();
    const onNew = vi.fn();
    open({ boards: [plain()] }, 'a', onNew);
    await user.click(screen.getByRole('button', { name: '+ Add hardware' }));
    await user.click(screen.getByRole('button', { name: 'New hardware type…' }));
    expect(onNew).toHaveBeenCalledTimes(1);
  });

  it('an assembly placed twice with [{h1, 3}] reads Counted once per copy (2): 6 Hinge in all.', () => {
    open({ instances: [inst('i1', 'Cab'), { ...inst('i2', 'Cab 2') }], definitions: [def([{ type: 'h1', count: 3 }])] }, 'i1');
    expect(screen.getByRole('heading', { name: 'Hardware' })).toBeInTheDocument();
    expect(screen.getByText('Counted once per copy (2): 6 Hinge in all.')).toBeInTheDocument();
  });

  it('two types are totalled per type, never summed together (fu 412, the user\'s ruling)', () => {
    const three = [inst('i1', 'Drawer'), inst('i2', 'Drawer 2'), inst('i3', 'Drawer 3')];
    open({ instances: three, definitions: [def([{ type: 'h2', count: 1 }, { type: 'h1', count: 2 }])] }, 'i1');
    expect(screen.getByText('Counted once per copy (3): 3 Pull, 6 Hinge in all.')).toBeInTheDocument();
  });

  it('a part placed once shows no per-copy note', () => {
    open({ boards: [plain({ hardware: [{ type: 'h1', count: 3 }] })] });
    expect(screen.queryByText(/Counted once per copy/)).toBeNull();
  });

  it('the empty state at the root edits the project under Project hardware', async () => {
    const user = userEvent.setup();
    open({ boards: [plain()] }, null);
    expect(screen.getByText('Select a part to edit it.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Project hardware' })).toBeInTheDocument();
    await add(user, 'Pull');
    expect(useStore.getState().doc.hardware).toEqual([{ type: 'h2', count: 1 }]);
  });

  it('with an assembly open the empty state edits its definition under <name> hardware', async () => {
    const user = userEvent.setup();
    load({ instances: [inst('i1', 'Cab')], definitions: [def()] });
    act(() => useStore.getState().openAssembly('i1'));
    render(<Properties onNewHardwareType={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Cab hardware' })).toBeInTheDocument();
    await add(user, 'Hinge');
    const s = useStore.getState().doc;
    expect(s.definitions[0]!.hardware).toEqual([{ type: 'h1', count: 1 }]);
    expect(s.hardware).toEqual([]);
  });

  it('exploded disables the section inside the edit lock', () => {
    open({ boards: [plain({ hardware: [{ type: 'h1', count: 3 }] })] });
    act(() => useStore.getState().setExplode(1));
    const lock = screen.getByRole('heading', { name: 'Hardware' }).closest('fieldset.edit-lock')!;
    expect(lock).toBeDisabled();
    for (const b of within(lock as HTMLElement).getAllByRole('button')) expect(b).toBeDisabled();
    expect(screen.getByLabelText('Hinge')).toBeDisabled();
  });
});

describe('the Hardware section on a shaped part (inv 43)', () => {
  it('renders for a linked part and a count edit lands on the Shape', async () => {
    const user = userEvent.setup();
    load({ boards: [plain({ id: 'a', name: 'A', hardware: [{ type: 'h1', count: 2 }] }), plain({ id: 'b', name: 'B', hardware: [{ type: 'h1', count: 2 }] })] });
    act(() => { useStore.getState().linkBoards(['a', 'b']); useStore.getState().selectBoard('a'); });
    expect(useStore.getState().doc.shapes).toHaveLength(1);
    render(<Properties onNewHardwareType={() => {}} />);
    const field = screen.getByLabelText('Hinge');
    expect(field).toHaveValue('2');
    await user.clear(field);
    await user.type(field, '7{Enter}');
    expect(useStore.getState().doc.shapes[0]!.hardware).toEqual([{ type: 'h1', count: 7 }]);
  });
});
