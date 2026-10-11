import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { createDocument } from '../document/document';
import { GuidesFooter } from './GuidesFooter';

const st = () => useStore.getState();
beforeEach(() => st().replaceDocument(createDocument('Test')));

/** Adds a guide through the store's own action (store.ts:344). */
const addGuide = (at: [number, number, number]) => act(() => st().addGuide(at));
const toggle = () => screen.getByRole('button', { name: /^Guides · \d+$/ });

describe('GuidesFooter (ui-polish spec §4.5)', () => {
  it('is closed by default and shows the count', () => {
    render(<GuidesFooter />);
    expect(toggle()).toHaveAccessibleName('Guides · 0');
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/No guides/)).toBeNull();
  });

  it('opens itself when a guide is placed', () => {
    render(<GuidesFooter />);
    addGuide([12, 0, 4]);
    expect(toggle()).toHaveAccessibleName('Guides · 1');
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /^Remove guide at/ })).toBeInTheDocument();
  });

  it('stays as the user left it when a guide is removed or anything else changes', async () => {
    render(<GuidesFooter />);
    addGuide([12, 0, 4]);
    addGuide([24, 0, 4]);
    await userEvent.click(toggle());                     // user closes it
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    act(() => st().removeGuide(st().doc.guides[0]!.id));
    act(() => st().addBoard());
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens and closes by hand', async () => {
    render(<GuidesFooter />);
    await userEvent.click(toggle());
    expect(screen.getByText(/No guides/)).toBeInTheDocument();
    await userEvent.click(toggle());
    expect(screen.queryByText(/No guides/)).toBeNull();
  });

  it('opens when the count goes up for any reason — e.g. undoing a Clear all', () => {
    render(<GuidesFooter />);
    addGuide([12, 0, 4]);
    act(() => st().clearGuides());
    // (closing by hand is not needed: the count went down; it stays open)
    act(() => st().undo());
    expect(toggle()).toHaveAccessibleName('Guides · 1');
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
  });
});
