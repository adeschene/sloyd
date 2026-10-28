import { act, fireEvent, render, screen } from '@testing-library/react';
import { useStore } from '../store/store';
import { createBoard, createDocument } from '../document/document';
import { LabelsSheet } from './LabelsSheet';

/** Part labels spec §4: the Labels sheet. */
const four = () => ({
  ...createDocument('Bookcase'),
  boards: [
    ...[0, 1, 2].map((i) => createBoard({ id: `s${i}`, name: `Side ${i + 1}`, material: 'oak', length: 30, width: 11.25, thickness: 0.75 })),
    createBoard({ id: 't', name: 'Top', material: 'oak', length: 32, width: 12, thickness: 0.75 }),
  ],
});
const cells = (c: HTMLElement) => c.querySelectorAll('.labels-cell');
const count = () => screen.getByText(/labels? on \d+ sheets?/).textContent;

describe('LabelsSheet', () => {
  beforeEach(() => act(() => useStore.getState().replaceDocument(four())));

  it('draws one page of 5160 with four labels, numbered from the cut list', () => {
    const { container } = render(<LabelsSheet onClose={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Labels — Bookcase' })).toBeInTheDocument();
    expect(count()).toBe('4 labels on 1 sheet');
    expect(container.querySelectorAll('.labels-page')).toHaveLength(1);
    expect(cells(container)).toHaveLength(30);
    const first = container.querySelector('.labels-cell:not(.labels-empty):not(.labels-skip)')!;
    expect(first.querySelector('.labels-num')!.textContent).toBe('1');
    expect(first.textContent).toContain('Top');
    expect(first.textContent).toContain('32" × 12" × 3/4"');
    expect(first.textContent).toContain('Oak · grain along length');
  });

  it('another stock, and a start part-way down the sheet', () => {
    const { container } = render(<LabelsSheet onClose={() => {}} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Stock' }), { target: { value: 'avery-5163' } });
    expect(cells(container)).toHaveLength(10);
    const start = screen.getByRole('textbox', { name: 'Start at' });
    fireEvent.change(start, { target: { value: '9' } });
    fireEvent.blur(start);
    expect(count()).toBe('4 labels on 2 sheets');
    expect(container.querySelectorAll('.labels-skip')).toHaveLength(8);
  });

  it('refuses a start past the sheet, keeping the last good one', () => {
    const { container } = render(<LabelsSheet onClose={() => {}} />);
    const start = screen.getByRole('textbox', { name: 'Start at' });
    fireEvent.change(start, { target: { value: '31' } });
    fireEvent.blur(start);
    expect(screen.getByText('Enter a label number from 1 to 30')).toBeInTheDocument();
    expect(container.querySelectorAll('.labels-page')).toHaveLength(1);
    expect(container.querySelectorAll('.labels-skip')).toHaveLength(0);
  });

  it('a metric project starts on L7160', () => {
    act(() => useStore.getState().setUnitsDisplay('metric-mm'));
    render(<LabelsSheet onClose={() => {}} />);
    expect(screen.getByRole('combobox', { name: 'Stock' })).toHaveValue('l7160');
  });

  it('an empty project: 0 labels on 0 sheets, no page', () => {
    act(() => useStore.getState().replaceDocument(createDocument('Empty')));
    const { container } = render(<LabelsSheet onClose={() => {}} />);
    expect(count()).toBe('0 labels on 0 sheets');
    expect(container.querySelector('.labels-page')).toBeNull();
  });

  it('closes on Escape and on its ✕', () => {
    const onClose = vi.fn();
    render(<LabelsSheet onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close labels' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
