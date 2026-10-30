import { render, screen } from '@testing-library/react';
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
    expect(screen.getByText('Line along X · Y 12" · Z 3-1/2"')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove line along X at Y 12", Z 3-1/2"' }));
    expect(useStore.getState().doc.guides).toEqual([]);
  });

  it('prints a Y line as X then Z', () => {
    useStore.getState().addGuideLine({ at: [2, 0, 5], axis: 'y' });
    render(<GuidesList />);
    expect(screen.getByText('Line along Y · X 2" · Z 5"')).toBeInTheDocument();
  });

  it('prints a line in mm in a metric project', () => {
    useStore.getState().setUnitsDisplay('metric-mm');
    useStore.getState().addGuideLine({ at: [0, 300 / 25.4, 0], axis: 'z' });
    render(<GuidesList />);
    expect(screen.getByText('Line along Z · X 0 mm · Y 300 mm')).toBeInTheDocument();
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
