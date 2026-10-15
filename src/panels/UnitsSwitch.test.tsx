import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { createDocument } from '../document/document';
import { UnitsSwitch } from './UnitsSwitch';
import { EXPLODED_TITLE } from './ViewportControls';

beforeEach(() => useStore.getState().replaceDocument(createDocument('T')));
it('shows the project units and switches them', async () => {
  render(<UnitsSwitch />);
  const group = screen.getByRole('group', { name: 'Units' });
  expect(screen.getByRole('button', { name: 'in' })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(screen.getByRole('button', { name: 'mm' }));
  expect(useStore.getState().doc.units.display).toBe('metric-mm');
  expect(screen.getByRole('button', { name: 'mm' })).toHaveAttribute('aria-pressed', 'true');
  expect(group).toBeInTheDocument();
});
it('is disabled while exploded', () => {
  useStore.getState().addBoard();
  useStore.getState().setExplode(0.5);
  render(<UnitsSwitch />);
  expect(screen.getByRole('button', { name: 'mm' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'in' })).toBeDisabled();
  expect(screen.getByRole('group', { name: 'Units' })).toHaveAttribute('title', EXPLODED_TITLE);
});
