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
});
