import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GuidesList } from './GuidesList';
import { useStore } from '../store/store';
import { createDocument } from '../document/document';

beforeEach(() => useStore.getState().replaceDocument(createDocument('Test')));

describe('GuidesList', () => {
  it('says so when there are no guides', () => {
    render(<GuidesList />);
    expect(screen.getByText(/no guides/i)).toBeInTheDocument();
  });

  it('lists each guide by its formatted coordinates', () => {
    useStore.getState().addGuide([12, 0.5, -6.25]);
    render(<GuidesList />);
    // formatLength joins a mixed number with a HYPHEN, not a space:
    // formatLength(-6.25, 16) === '-6-1/4"'. All three regexes match the one
    // coordinate span, which is the whole row's text.
    expect(screen.getByText(/12"/)).toBeInTheDocument();
    expect(screen.getByText(/1\/2"/)).toBeInTheDocument();
    expect(screen.getByText(/-6-1\/4"/)).toBeInTheDocument();
  });

  it('removes one guide without touching the others', async () => {
    useStore.getState().addGuide([1, 0, 0]);
    useStore.getState().addGuide([2, 0, 0]);
    render(<GuidesList />);
    const [first] = screen.getAllByRole('button', { name: /remove guide/i });
    await userEvent.click(first);
    expect(useStore.getState().doc.guides).toHaveLength(1);
    expect(useStore.getState().doc.guides[0].at[0]).toBe(2);
  });

  it('clears every guide', async () => {
    useStore.getState().addGuide([1, 0, 0]);
    useStore.getState().addGuide([2, 0, 0]);
    render(<GuidesList />);
    await userEvent.click(screen.getByRole('button', { name: /clear all/i }));
    expect(useStore.getState().doc.guides).toEqual([]);
  });

  it('lists a guide in mm in a metric project', () => {
    useStore.getState().setUnitsDisplay('metric-mm');
    useStore.getState().addGuide([0, 0, 0.75]);
    render(<GuidesList />);
    expect(screen.getByText('0 mm, 0 mm, 19 mm')).toBeInTheDocument();
  });

  it('says the empty text for points and lines', () => {
    render(<GuidesList />);
    expect(screen.getByText('No guides. Use the Tape tool to place a point or a line.')).toBeInTheDocument();
  });

  it('lists a line with its two fixed coordinates and removes it by the matching label', async () => {
    useStore.getState().addGuideLine({ at: [0, 12, 3.5], axis: 'x' });
    render(<GuidesList />);
    expect(screen.getByText('Line along X')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove line along X at Y 12", Z 3-1/2"' }));
    expect(useStore.getState().doc.guides).toEqual([]);
  });

  it('prints a Y line as X then Z', () => {
    useStore.getState().addGuideLine({ at: [2, 0, 5], axis: 'y' });
    render(<GuidesList />);
    expect(screen.getByText('Line along Y')).toBeInTheDocument();
  });

  it('prints a line in mm in a metric project', () => {
    useStore.getState().setUnitsDisplay('metric-mm');
    useStore.getState().addGuideLine({ at: [0, 300 / 25.4, 0], axis: 'z' });
    render(<GuidesList />);
    expect(screen.getByText('Line along Z')).toBeInTheDocument();
    expect((screen.getByLabelText('X of line along Z at X 0 mm, Y 300 mm') as HTMLInputElement).value).toBe('0 mm');
    expect((screen.getByLabelText('Y of line along Z at X 0 mm, Y 300 mm') as HTMLInputElement).value).toBe('300 mm');
  });

  it('words an oblique line by its two points', () => {
    useStore.getState().replaceDocument({ ...createDocument('T'), guides: [{ id: 'r', at: [1, 2, 3], to: [4, 5.5, 6] }] });
    render(<GuidesList />);
    expect(screen.getByText('Line through 1", 2", 3" and 4", 5-1/2", 6"')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove line through 1", 2", 3" and 4", 5-1/2", 6"' })).toBeInTheDocument();
  });

  it('prints an oblique line in mm in a metric project', () => {
    useStore.getState().replaceDocument({
      ...createDocument('T'),
      units: { display: 'metric-mm', precision: 16 },
      guides: [{ id: 'r', at: [1, 2, 3], to: [4, 5.5, 6] }],
    });
    render(<GuidesList />);
    expect(screen.getByText('Line through 25 mm, 51 mm, 76 mm and 102 mm, 140 mm, 152 mm')).toBeInTheDocument();
  });
});

describe('GuidesList editing (construction-lines-2 spec §5)', () => {
  // Each field's accessible name carries its row (unique across rows): `<A> of line along <X> at <fixed coordinates>`.
  const NAMES: Record<string, string> = {
    Y: 'Y of line along X at Y 12", Z 3-1/2"',
    Z: 'Z of line along X at Y 12", Z 3-1/2"',
  };
  const field = (name: string) => screen.getByLabelText(NAMES[name] ?? name) as HTMLInputElement;

  it('an axis row has its two fixed coordinates as fields', () => {
    useStore.getState().addGuideLine({ at: [0, 12, 3.5], axis: 'x' });
    render(<GuidesList />);
    expect(field('Y').value).toBe('12"');
    expect(field('Z').value).toBe('3-1/2"');
  });

  it('typing a value and Enter stores it', async () => {
    useStore.getState().addGuideLine({ at: [0, 12, 3.5], axis: 'x' });
    render(<GuidesList />);
    await userEvent.clear(field('Y'));
    await userEvent.type(field('Y'), '14{Enter}');
    expect((useStore.getState().doc.guides[0] as { at: number[] }).at).toEqual([0, 14, 3.5]);
  });

  it('blur without typing commits nothing', async () => {
    useStore.getState().addGuideLine({ at: [0, 12, 3.5], axis: 'x' });
    render(<GuidesList />);
    const past = useStore.getState().past.length;
    await userEvent.click(field('Y'));
    await userEvent.tab();
    expect(useStore.getState().past.length).toBe(past);
  });

  it('typing 1\' into a field showing 12" leaves the undo stack alone', async () => {
    useStore.getState().addGuideLine({ at: [0, 12, 3.5], axis: 'x' });
    render(<GuidesList />);
    const past = useStore.getState().past.length;
    await userEvent.clear(field('Y'));
    await userEvent.type(field('Y'), "1'{Enter}");
    expect(useStore.getState().past.length).toBe(past);
  });

  it('a value equal to another line is refused with its reason', async () => {
    useStore.getState().addGuideLine({ at: [0, 12, 3.5], axis: 'x' });
    useStore.getState().addGuideLine({ at: [0, 14, 3.5], axis: 'x' });
    render(<GuidesList />);
    const past = useStore.getState().past.length;
    const first = screen.getByLabelText('Y of line along X at Y 12", Z 3-1/2"');
    expect(screen.getByLabelText('Y of line along X at Y 14", Z 3-1/2"')).not.toBe(first);
    await userEvent.clear(first);
    await userEvent.type(first, '14{Enter}');
    expect(screen.getByText('That line is already there')).toBeInTheDocument();
    expect(useStore.getState().past.length).toBe(past);
  });

  it('oblique and point rows have no fields', () => {
    useStore.getState().replaceDocument({ ...createDocument('T'), guides: [{ id: 'r', at: [1, 2, 3], to: [4, 5, 6] }, { id: 'p', at: [1, 2, 3] }] });
    render(<GuidesList />);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  describe('selection (fu 591)', () => {
    const two = () => {
      useStore.getState().addGuideLine({ at: [0, 12, 3.5], axis: 'x' });
      useStore.getState().addGuideLine({ at: [0, 14, 3.5], axis: 'z' });
      return useStore.getState().doc.guides.map((g) => g.id);
    };
    const selectBtn = (text: string) => screen.getByRole('button', { name: text });

    it('the row text is a toggle button that selects its guide', async () => {
      const [a] = two();
      render(<GuidesList />);
      const btn = selectBtn('Line along X');
      expect(btn).toHaveAttribute('aria-pressed', 'false');
      await userEvent.click(btn);
      expect(useStore.getState().selectedGuideIds).toEqual([a]);
      expect(btn).toHaveAttribute('aria-pressed', 'true');
      expect(btn.closest('li')).toHaveClass('selected');
    });

    it('Shift-click toggles a second guide in', async () => {
      const [a, b] = two();
      render(<GuidesList />);
      await userEvent.click(selectBtn('Line along X'));
      fireEvent.click(selectBtn('Line along Z'), { shiftKey: true });
      expect(useStore.getState().selectedGuideIds).toEqual([a, b]);
    });

    it('typing in a field and clicking x leave the selection alone', async () => {
      const [a] = two();
      render(<GuidesList />);
      await userEvent.click(selectBtn('Line along X'));
      await userEvent.clear(field('Y'));
      await userEvent.type(field('Y'), '13{Enter}');
      expect(useStore.getState().selectedGuideIds).toEqual([a]);
      await userEvent.click(screen.getByRole('button', { name: /^Remove line along Z/ }));
      expect(useStore.getState().selectedGuideIds).toEqual([a]);
      expect(screen.queryByRole('button', { name: 'Line along Z' })).toBeNull();
    });

    it('the eye hides a guide: the row is hidden and its select button disabled', async () => {
      const [a] = two();
      render(<GuidesList />);
      await userEvent.click(selectBtn('Line along X'));
      await userEvent.click(screen.getByRole('button', { name: 'Hide Line along X' }));
      expect(useStore.getState().hiddenGuideIds).toEqual([a]);
      expect(useStore.getState().selectedGuideIds).toEqual([]);
      const btn = selectBtn('Line along X');
      expect(btn).toBeDisabled();
      expect(btn.closest('li')).toHaveClass('hidden');
      await userEvent.click(screen.getByRole('button', { name: 'Show Line along X' }));
      expect(useStore.getState().hiddenGuideIds).toEqual([]);
    });
  });
});
