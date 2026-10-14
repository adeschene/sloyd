import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MaterialsDialog } from './MaterialsDialog';
import { defaultShop, type ShopSettings } from '../document/purchase';
import type { SavePlan } from './materialsDraft';
import { EXPLODED_TITLE } from './ViewportControls';

type SaveOut = { shop: ShopSettings; plan: SavePlan };
const fixed = { project: [], library: [], libraryReadFailed: false, locked: false, newFor: null };
const setup = (over: Partial<{ readFailed: boolean; save: boolean }> = {}) => {
  const onSave = vi.fn(async (_: SaveOut) => (over.save ?? true ? null : 'Could not save your prices: this browser is not letting Sloyd store settings.'));
  const onClose = vi.fn();
  render(<MaterialsDialog shop={defaultShop()} readFailed={over.readFailed ?? false} {...fixed} onSave={onSave} onClose={onClose} />);
  return { onSave, onClose };
};
const field = (name: string) => screen.getByRole('textbox', { name });
const saveBtn = () => screen.getByRole('button', { name: 'Save' });

describe('MaterialsDialog — prices', () => {
  it('saves an edited board-foot price and closes', async () => {
    const { onSave, onClose } = setup();
    fireEvent.change(field('Oak: price per board foot'), { target: { value: '8.50' } });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSave.mock.calls[0]![0].shop.materials.oak).toEqual({ mode: 'board-foot', pricePerBoardFoot: 8.5, wasteFactor: 1.3 });
  });

  it('refuses invalid input rather than clamping: Save is disabled while any field is bad', () => {
    setup();
    for (const v of ['-1', 'abc']) {
      fireEvent.change(field('Oak: price per board foot'), { target: { value: v } });
      expect(saveBtn()).toBeDisabled();
      expect(field('Oak: price per board foot')).toHaveAttribute('aria-invalid', 'true');
    }
    fireEvent.change(field('Oak: price per board foot'), { target: { value: '' } });
    fireEvent.change(field('Oak: waste factor'), { target: { value: '3.5' } });
    expect(saveBtn()).toBeDisabled();
    fireEvent.change(field('Oak: waste factor'), { target: { value: '3' } });
    expect(saveBtn()).toBeEnabled();
  });

  it('switches a material to by-the-piece, adds and removes sizes', async () => {
    const { onSave } = setup();
    fireEvent.change(screen.getByRole('combobox', { name: 'Oak: bought' }), { target: { value: 'piece' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add oak size' }));
    expect(saveBtn()).toBeDisabled(); // the new size has no width yet
    fireEvent.change(field('Oak size 1: width'), { target: { value: '5 1/2' } });
    fireEvent.change(field('Oak size 1: price'), { target: { value: '22' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add oak size' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Oak size 2' }));
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]![0].shop.materials.oak).toEqual({ mode: 'piece', stock: [
      { id: expect.any(String), thickness: 0.75, width: 5.5, length: 96, price: 22 },
    ] });
  });

  it('shows pine\'s default sizes, parses them back exactly, and resets one material', async () => {
    const { onSave } = setup();
    // Defaults run width-major: 1½×72, 1½×96, 2½×72, 2½×96, 3½×72, 3½×96, 5½×72 → size 7 is 5½ wide.
    expect(field('Pine size 7: width')).toHaveValue('5-1/2"');
    fireEvent.change(field('Pine size 1: price'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset pine to defaults' }));
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]![0].shop.materials.pine).toEqual(defaultShop().materials.pine);
  });

  it('says when stored prices could not be read, and when saving fails', async () => {
    const { onClose } = setup({ readFailed: true, save: false });
    expect(screen.getByText(/could not be read; showing defaults/)).toBeInTheDocument();
    fireEvent.click(saveBtn());
    expect(await screen.findByText(/Could not save/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cancels without saving', () => {
    const { onSave, onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('keeps a material\'s settings when its mode is switched away and back (final review)', async () => {
    const shop = defaultShop();
    shop.materials.oak = { mode: 'board-foot', pricePerBoardFoot: 9, wasteFactor: 1.5 };
    shop.extra = { ash: { mode: 'board-foot', pricePerBoardFoot: 6, wasteFactor: 1.4 } };
    const onSave = vi.fn(async (_: SaveOut) => null as string | null);
    render(<MaterialsDialog shop={shop} readFailed={false} {...fixed} onSave={onSave} onClose={() => {}} />);
    const mode = (name: string) => screen.getByRole('combobox', { name });
    // Unsaved edits first: only the stash (not the stored value) can bring these back.
    fireEvent.change(field('Pine size 1: price'), { target: { value: '4' } });
    fireEvent.change(field('Oak: price per board foot'), { target: { value: '11' } });
    // Pine: by the piece → board foot → by the piece keeps all 14 sizes and the edit.
    fireEvent.change(mode('Pine: bought'), { target: { value: 'board-foot' } });
    fireEvent.change(mode('Pine: bought'), { target: { value: 'piece' } });
    expect(screen.getAllByRole('textbox', { name: /^Pine size \d+: width$/ })).toHaveLength(14);
    expect(field('Pine size 1: price')).toHaveValue('4');
    // Oak: board foot ($9, 1.5) → by the piece → board foot keeps both.
    fireEvent.change(mode('Oak: bought'), { target: { value: 'piece' } });
    fireEvent.change(mode('Oak: bought'), { target: { value: 'board-foot' } });
    expect(field('Oak: price per board foot')).toHaveValue('11');
    expect(field('Oak: waste factor')).toHaveValue('1.5');
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.calls[0]![0].shop;
    const pineDefault = defaultShop().materials.pine as { mode: 'piece'; stock: { price: number | null }[] };
    expect(saved.materials.pine).toEqual({ ...pineDefault, stock: pineDefault.stock.map((x, i) => (i === 0 ? { ...x, price: 4 } : x)) });
    expect(saved.materials.oak).toEqual({ mode: 'board-foot', pricePerBoardFoot: 11, wasteFactor: 1.5 });
    expect(saved.extra).toEqual(shop.extra); // a material this build does not know is carried through
  });

  it('Save keeps stored custom-material entries the dialog does not edit (task 3 review)', async () => {
    const shop = defaultShop();
    shop.materials['m-s-ash1'] = { mode: 'board-foot', pricePerBoardFoot: 9, wasteFactor: 1.4 };
    const onSave = vi.fn(async (_: SaveOut) => null as string | null);
    render(<MaterialsDialog shop={shop} readFailed={false} {...fixed} onSave={onSave} onClose={() => {}} />);
    fireEvent.change(field('Oak: price per board foot'), { target: { value: '8' } });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.calls[0]![0].shop;
    expect(saved.materials['m-s-ash1']).toEqual({ mode: 'board-foot', pricePerBoardFoot: 9, wasteFactor: 1.4 });
    expect(saved.materials.oak).toEqual({ mode: 'board-foot', pricePerBoardFoot: 8, wasteFactor: 1.3 });
  });
});

const ash = { id: 'm-s-ash1', label: 'Ash', color: '#d8c8a8', kind: 'solid' as const };
const libAsh = { id: 'm-s-ash2', label: 'Ash', color: '#ccbb99', kind: 'solid' as const };
const open = (over: Partial<Parameters<typeof MaterialsDialog>[0]> = {}) => {
  const onSave = vi.fn(async (_: { shop: ShopSettings; plan: SavePlan }) => null as string | null);
  const onClose = vi.fn();
  render(<MaterialsDialog shop={defaultShop()} readFailed={false} project={[]} library={[]} libraryReadFailed={false}
    locked={false} newFor={null} onSave={onSave} onClose={onClose} {...over} />);
  return { onSave, onClose };
};

describe('MaterialsDialog — definitions (custom materials spec §4.1)', () => {
  it('adds a material: Save sends it to the library and its default prices', async () => {
    const { onSave } = open();
    fireEvent.click(screen.getByRole('button', { name: 'Add material' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'New material: name' }), { target: { value: 'Sapele' } });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const { plan, shop } = onSave.mock.calls[0]![0];
    expect(plan.library).toHaveLength(1);
    expect(plan.library![0]).toMatchObject({ label: 'Sapele', kind: 'solid' });
    expect(plan.project).toEqual([]);
    expect(shop.materials[plan.library![0]!.id]).toEqual({ mode: 'board-foot', pricePerBoardFoot: null, wasteFactor: 1.3 });
  });
  it('refuses a duplicate label and disables Save', () => {
    open({ project: [ash] });
    fireEvent.click(screen.getByRole('button', { name: 'Add material' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'New material: name' }), { target: { value: ' ash' } });
    expect(screen.getByText('Another material is already called "Ash".')).toBeInTheDocument();
    expect(saveBtn()).toBeDisabled();
  });
  it('New material… opens with a new row and assigns it on Save', async () => {
    const { onSave } = open({ newFor: { ids: ['a'], kind: 'solid' } });
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'New material: name' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'New material: name' }), { target: { value: 'Sapele' } });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]![0].plan.assign).toMatchObject({ ids: ['a'] });
  });
  it('a new row can switch to a sheet kind; its prices follow it to the new id', async () => {
    const { onSave } = open({ newFor: { ids: ['a'], kind: 'sheet-veneered' } });
    expect(screen.getByRole('textbox', { name: 'New material: sheet length' })).toHaveValue('96');
    fireEvent.change(screen.getByRole('combobox', { name: 'New material: kind' }), { target: { value: 'sheet-plain' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'New material: name' }), { target: { value: 'Hardboard' } });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const { plan, shop } = onSave.mock.calls[0]![0];
    expect(plan.assign!.material).toMatch(/^m-p-/);
    expect(shop.materials[plan.assign!.material]).toEqual({ mode: 'sheet', pricePerSheet: null });
    expect(Object.keys(shop.materials).filter((k) => k.startsWith('m-v-'))).toEqual([]);
  });
  it('an unsaved new row can be removed: it and its prices leave the Save', async () => {
    const { onSave } = open();
    fireEvent.click(screen.getByRole('button', { name: 'Add material' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove New material' }));
    expect(screen.queryByRole('textbox', { name: 'New material: name' })).toBeNull();
    expect(saveBtn()).toBeEnabled();
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const { plan, shop } = onSave.mock.calls[0]![0];
    expect(plan).toEqual({ project: [], library: null, assign: null });
    expect(Object.keys(shop.materials).sort()).toEqual(Object.keys(defaultShop().materials).sort());
  });
  it('the remove button names the typed label; the New material… row has none; it is off while locked', () => {
    const props = { shop: defaultShop(), readFailed: false, project: [], library: [], libraryReadFailed: false,
      newFor: { ids: ['a'], kind: 'solid' as const }, onSave: async () => null, onClose: () => {} };
    const { rerender } = render(<MaterialsDialog {...props} locked={false} />);
    // Not the piece sizes' own "Remove <label> size N" buttons.
    const removes = () => screen.queryAllByRole('button', { name: /^Remove (?!.* size \d+$)/ }).map((b) => b.getAttribute('aria-label'));
    expect(removes()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Add material' }));
    const names = screen.getAllByRole('textbox', { name: 'New material: name' });
    fireEvent.change(names[1]!, { target: { value: 'Iroko' } });
    expect(removes()).toEqual(['Remove Iroko']);
    rerender(<MaterialsDialog {...props} locked={true} />);
    expect(screen.getByRole('button', { name: 'Remove Iroko' })).toBeDisabled();
  });
  it('a solid new row switched to a sheet starts the sheet\'s prices, not the solid\'s draft', async () => {
    const { onSave } = open();
    fireEvent.click(screen.getByRole('button', { name: 'Add material' }));
    fireEvent.change(field('New material: price per board foot'), { target: { value: '5' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'New material: kind' }), { target: { value: 'sheet-veneered' } });
    expect(field('New material: price per sheet')).toHaveValue('');
    fireEvent.change(screen.getByRole('textbox', { name: 'New material: name' }), { target: { value: 'Baltic birch' } });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const { plan, shop } = onSave.mock.calls[0]![0];
    expect(shop.materials[plan.library![0]!.id]).toEqual({ mode: 'sheet', pricePerSheet: null });
  });
  it('shows one "Ash" note pair for an imported clash and refuses Add to library', () => {
    open({ project: [ash], library: [libAsh] });
    expect(screen.getByText(/Same name as a project material/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add to library' }));
    expect(screen.getByText('Your library already has a material called "Ash" — rename one first.')).toBeInTheDocument();
    expect(saveBtn()).toBeDisabled();
  });
  it('locked (exploded): definitions disabled, Save sends prices only', async () => {
    const { onSave } = open({ project: [ash], locked: true });
    expect(screen.getByRole('textbox', { name: 'Ash: name' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add material' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add material' })).toHaveAttribute('title', EXPLODED_TITLE);
    expect(screen.getByRole('textbox', { name: 'Ash: name' })).toHaveAttribute('title', EXPLODED_TITLE);
    fireEvent.change(field('Oak: price per board foot'), { target: { value: '8' } });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]![0].plan).toEqual({ project: [], library: null, assign: null });
  });
  it('stays open and shows the message when the save reports a failure', async () => {
    const { onSave, onClose } = open({ project: [ash] });
    onSave.mockResolvedValueOnce('Could not save your material library: …');
    fireEvent.change(screen.getByRole('textbox', { name: 'Ash: name' }), { target: { value: 'White ash' } });
    fireEvent.click(saveBtn());
    expect(await screen.findByText('Could not save your material library: …')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
  it('unreadable library: library-only controls are disabled, project rows still edit (task 6 carry-over)', async () => {
    const walnut = { id: 'm-s-wal1', label: 'Black walnut', color: '#5a3a28', kind: 'solid' as const };
    const { onSave } = open({ project: [ash], library: [walnut], libraryReadFailed: true });
    expect(screen.getByText('Your saved materials could not be read; the library will not be changed.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Black walnut: name' })).toBeDisabled();
    expect(screen.getByLabelText('Black walnut: colour')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete Black walnut from your library' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add to library' })).toBeDisabled();
    // A brand-new material would only ever reach the library, so it cannot be added either.
    expect(screen.getByRole('button', { name: 'Add material' })).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Ash: name' }), { target: { value: 'White ash' } });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]![0].plan).toMatchObject({ project: [{ id: 'm-s-ash1', label: 'White ash' }], library: null });
  });
  it('unreadable library: New material… still makes the project material', async () => {
    const { onSave } = open({ libraryReadFailed: true, newFor: { ids: ['a'], kind: 'solid' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'New material: name' }), { target: { value: 'Sapele' } });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]![0].plan).toMatchObject({ project: [{ label: 'Sapele' }], library: null, assign: { ids: ['a'] } });
  });
  it('deletes a library-only material, and Undo delete brings it back', async () => {
    const walnut = { id: 'm-s-wal1', label: 'Black walnut', color: '#5a3a28', kind: 'solid' as const };
    const { onSave } = open({ library: [walnut, libAsh] });
    fireEvent.click(screen.getByRole('button', { name: 'Delete Black walnut from your library' }));
    expect(screen.getByRole('button', { name: 'Undo delete' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Ash from your library' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Undo delete' })[1]!);
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]![0].plan.library).toEqual([libAsh]);
  });
  it('Use library version replaces the project copy with the library\'s', async () => {
    const { onSave } = open({ project: [ash], library: [{ ...ash, color: '#aabbcc' }] });
    expect(screen.getByText('Differs from your library')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use library version' }));
    expect(screen.queryByText('Differs from your library')).toBeNull();
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]![0].plan.project).toEqual([{ ...ash, color: '#aabbcc' }]);
  });
  it('a custom material\'s stored price shows in its row and saves back', async () => {
    const shop = defaultShop();
    shop.materials['m-s-ash1'] = { mode: 'board-foot', pricePerBoardFoot: 9, wasteFactor: 1.4 };
    const { onSave } = open({ shop, project: [ash] });
    expect(field('Ash: price per board foot')).toHaveValue('9');
    fireEvent.change(field('Ash: price per board foot'), { target: { value: '10' } });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]![0].shop.materials['m-s-ash1']).toEqual({ mode: 'board-foot', pricePerBoardFoot: 10, wasteFactor: 1.4 });
  });
  it('after a partial failure the assigned new row is a stored material: no kind select, no second assign (fix round 1)', async () => {
    let rerender: (ui: ReactElement) => void = () => {};
    const props = (project: typeof ash[]) => ({ shop: defaultShop(), readFailed: false, project, library: [], libraryReadFailed: false,
      locked: false, newFor: { ids: ['a'], kind: 'solid' as const }, onClose: () => {} });
    // App applies the project edit before the failed browser write resolves: the props change first.
    const onSave = vi.fn(async ({ plan }: { shop: ShopSettings; plan: SavePlan }) => {
      rerender(<MaterialsDialog {...props(plan.project as typeof ash[])} onSave={onSave} />);
      return 'Could not save your prices: …';
    });
    ({ rerender } = render(<MaterialsDialog {...props([])} onSave={onSave} />));
    fireEvent.change(screen.getByRole('textbox', { name: 'New material: name' }), { target: { value: 'Sapele' } });
    fireEvent.click(saveBtn());
    expect(await screen.findByText('Could not save your prices: …')).toBeInTheDocument();
    const first = onSave.mock.calls[0]![0].plan.assign!.material;
    await waitFor(() => expect(screen.queryByRole('combobox', { name: /kind/ })).toBeNull());
    fireEvent.change(screen.getByRole('textbox', { name: 'Sapele: name' }), { target: { value: 'Red sapele' } });
    // A material added now is a library material: "New material…" was spent on the first Save.
    fireEvent.click(screen.getByRole('button', { name: 'Add material' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'New material: name' }), { target: { value: 'Iroko' } });
    // No longer the assigned row, so it can be taken back out.
    expect(screen.getByRole('button', { name: 'Remove Iroko' })).toBeEnabled();
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls[1]![0].plan).toMatchObject({ assign: null, project: [{ id: first, label: 'Red sapele' }] });
  });
});
