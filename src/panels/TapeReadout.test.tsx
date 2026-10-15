import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { boardSnapPoints, createDocument, worldParts } from '../document/document';
import { TapeReadout } from './TapeReadout';

// The readout parses the typed distance in the PROJECT's units (metric-display spec): a bare number is mm in a metric
// project. Driven like App.test's tape block — an anchor and a locked axis in the store — with the readout alone.
const anchored = (display: 'imperial-fractional' | 'metric-mm') => {
  useStore.getState().replaceDocument(createDocument('T'));
  useStore.getState().addBoard();
  if (display === 'metric-mm') useStore.getState().setUnitsDisplay('metric-mm');
  const board = worldParts(useStore.getState().doc)[0]!;
  const origin = boardSnapPoints(board).find((p) => p.at[0] === 0 && p.at[1] === 0 && p.at[2] === 0)!;
  expect(origin).toBeDefined();
  act(() => {
    useStore.getState().setTool('tape');
    useStore.getState().setTapeAnchor(origin);
    useStore.getState().setTapeAxis('x');
  });
  render(<TapeReadout />);
  return screen.getByLabelText('Guide distance from anchor');
};

describe('TapeReadout units', () => {
  it('a metric project reads a typed 250 as 250 mm: the guide lands at exactly 250 / 25.4', async () => {
    const box = anchored('metric-mm');
    await userEvent.type(box, '250{Enter}');
    const guides = useStore.getState().doc.guides;
    expect(guides).toHaveLength(1);
    expect(guides[0]!.at).toEqual([250 / 25.4, 0, 0]);
    expect(guides[0]!.at[0]).toBe(250 / 25.4);
  });
  it('an imperial project reads the same 250 as inches', async () => {
    const box = anchored('imperial-fractional');
    await userEvent.type(box, '250{Enter}');
    expect(useStore.getState().doc.guides[0]!.at[0]).toBe(250);
  });
});
