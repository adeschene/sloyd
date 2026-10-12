import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LumberPricesDialog } from './LumberPricesDialog';
import { defaultShop, type ShopSettings } from '../document/purchase';

const setup = (over: Partial<{ readFailed: boolean; save: boolean }> = {}) => {
  const onSave = vi.fn(async (_s: ShopSettings) => over.save ?? true);
  const onClose = vi.fn();
  render(<LumberPricesDialog shop={defaultShop()} readFailed={over.readFailed ?? false} onSave={onSave} onClose={onClose} />);
  return { onSave, onClose };
};
const field = (name: string) => screen.getByRole('textbox', { name });
const saveBtn = () => screen.getByRole('button', { name: 'Save' });

describe('LumberPricesDialog', () => {
  it('saves an edited board-foot price and closes', async () => {
    const { onSave, onClose } = setup();
    fireEvent.change(field('Oak: price per board foot'), { target: { value: '8.50' } });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSave.mock.calls[0]![0].materials.oak).toEqual({ mode: 'board-foot', pricePerBoardFoot: 8.5, wasteFactor: 1.3 });
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
    expect(onSave.mock.calls[0]![0].materials.oak).toEqual({ mode: 'piece', stock: [
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
    expect(onSave.mock.calls[0]![0].materials.pine).toEqual(defaultShop().materials.pine);
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
    const onSave = vi.fn(async (_s: ShopSettings) => true);
    render(<LumberPricesDialog shop={shop} readFailed={false} onSave={onSave} onClose={() => {}} />);
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
    const saved = onSave.mock.calls[0]![0];
    const pineDefault = defaultShop().materials.pine as { mode: 'piece'; stock: { price: number | null }[] };
    expect(saved.materials.pine).toEqual({ ...pineDefault, stock: pineDefault.stock.map((x, i) => (i === 0 ? { ...x, price: 4 } : x)) });
    expect(saved.materials.oak).toEqual({ mode: 'board-foot', pricePerBoardFoot: 11, wasteFactor: 1.5 });
    expect(saved.extra).toEqual(shop.extra); // a material this build does not know is carried through
  });
});
