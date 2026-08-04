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
});
