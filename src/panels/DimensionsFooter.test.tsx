import { act, render, screen } from '@testing-library/react';
import { useStore } from '../store/store';
import { createBoard, createDocument, snapPointsFor, worldParts } from '../document/document';
import type { PlacedDimension } from '../document/types';
import { DimensionsFooter } from './DimensionsFooter';

const st = () => useStore.getState();
const dim: PlacedDimension = { id: 'd1', a: { at: [0, 0, 0] }, b: { at: [0, 29, 0] }, axis: 'y' };
const withDims = (dims: PlacedDimension[]) => ({ ...createDocument('Test'), boards: [createBoard({ id: 'r1' })], dimensions: dims });
const toggle = () => screen.getByRole('button', { name: /^Dimensions · \d+$/ });

beforeEach(() => st().replaceDocument(withDims([])));

describe('DimensionsFooter (placed-dimensions spec §5)', () => {
  it('renders nothing at 0', () => {
    render(<DimensionsFooter />);
    expect(screen.queryByRole('button', { name: /^Dimensions/ })).toBeNull();
  });

  it('opens itself when a dimension is added, and stays as left after a hand close', () => {
    render(<DimensionsFooter />);
    const pts = snapPointsFor(worldParts(st().doc)[0]!);
    const a = pts[0]!;
    const b = pts.find((p) => Math.abs(p.at[0] - a.at[0]) > 1e-6 && Math.abs(p.at[1] - a.at[1]) < 1e-9 && Math.abs(p.at[2] - a.at[2]) < 1e-9)!;
    act(() => { st().addDimension(a, b, 'x'); });
    expect(toggle()).toHaveAccessibleName('Dimensions · 1');
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Delete dimension' })).toBeEnabled();
  });

  it('starts closed for a project that already has dimensions', () => {
    st().replaceDocument(withDims([dim]));
    render(<DimensionsFooter />);
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('disables delete while exploded', () => {
    st().replaceDocument(withDims([dim]));
    render(<DimensionsFooter />);
    act(() => st().setExplode(1));
    act(() => toggle().click());
    expect(screen.getByRole('button', { name: 'Delete dimension' })).toBeDisabled();
  });
});
