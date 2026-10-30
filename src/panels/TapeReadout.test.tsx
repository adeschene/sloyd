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

describe('TapeReadout lines (construction-lines spec §3.2, plan A1)', () => {
  const lockZ = (withLine = false) => {
    useStore.getState().replaceDocument(createDocument('T'));
    if (withLine) useStore.getState().addGuideLine({ at: [1, 2, 0], axis: 'z' });
    act(() => {
      useStore.getState().setTool('tape');
      useStore.getState().setTapeAnchor({ at: [1, 2, 3], owner: { type: 'guide', id: 'x' } } as never);
      useStore.getState().setTapeAxis('z');
    });
    render(<TapeReadout />);
    return screen.getByLabelText('Guide distance from anchor');
  };
  const hint = () => document.querySelector('.tape-readout-hint')!.textContent;

  it('Enter with nothing typed places the line and clears anchor and axis', async () => {
    const box = lockZ();
    expect(hint()).toBe('Along Z — Enter for a line, or type a distance');
    await userEvent.type(box, '{Enter}');
    expect(useStore.getState().doc.guides).toEqual([expect.objectContaining({ at: [1, 2, 0], axis: 'z' })]);
    expect(useStore.getState().tapeAnchor).toBeNull();
    expect(useStore.getState().tapeAxis).toBeNull();
    expect(screen.queryByTestId('tape-readout-error')).toBeNull();
  });

  it('a duplicate adds nothing, keeps anchor and axis, and the hint says so', async () => {
    const box = lockZ(true);
    expect(hint()).toBe('Along Z — that line is already there; type a distance');
    await userEvent.type(box, '{Enter}');
    expect(useStore.getState().doc.guides).toHaveLength(1);
    expect(useStore.getState().tapeAnchor).not.toBeNull();
    expect(useStore.getState().tapeAxis).toBe('z');
  });

  it('typing restores "Enter to place"; a typed distance still places a point', async () => {
    const box = lockZ();
    await userEvent.type(box, '3');
    expect(hint()).toBe('Along Z — Enter to place');
    await userEvent.type(box, '{Enter}');
    const g = useStore.getState().doc.guides;
    expect(g).toHaveLength(1);
    expect(g[0]).toEqual(expect.objectContaining({ at: [1, 2, 6] }));
    expect(g[0]!.axis).toBeUndefined();
  });

  it('anchored with no axis, empty Enter adds no guide (no-direction as before)', async () => {
    const box = lockZ();
    act(() => useStore.getState().setTapeAxis(null));
    await userEvent.type(box, '{Enter}');
    expect(useStore.getState().doc.guides).toHaveLength(0);
    expect(screen.getByTestId('tape-readout-error').textContent).toBe('Hover a point, or press X / Y / Z');
  });

  describe('no axis, a hover', () => {
    const hov = { at: [4, 6, 3], owner: { type: 'guide', id: 'h' } } as never;
    const oblique = (stored = false) => {
      const box = lockZ();
      if (stored) useStore.getState().addGuideLine({ at: [1, 2, 3], to: [4, 6, 3] });
      act(() => {
        useStore.getState().setTapeAxis(null);
        useStore.getState().setTapeHover(hov);
      });
      return box;
    };

    it('Enter in the input adds one oblique guide and clears the anchor', async () => {
      const box = oblique();
      await userEvent.type(box, '{Enter}');
      expect(useStore.getState().doc.guides).toEqual([expect.objectContaining({ at: [1, 2, 3], to: [4, 6, 3] })]);
      expect(useStore.getState().tapeAnchor).toBeNull();
    });

    it('Enter with no hover shows the no-direction error and adds nothing', async () => {
      const box = lockZ();
      act(() => useStore.getState().setTapeAxis(null));
      await userEvent.type(box, '{Enter}');
      expect(useStore.getState().doc.guides).toHaveLength(0);
      expect(screen.getByTestId('tape-readout-error').textContent).toBe('Hover a point, or press X / Y / Z');
    });

    it('the hint offers the line with a hover, the distance without', () => {
      oblique();
      expect(hint()).toBe('Enter for a line through both points, or type a distance');
      act(() => useStore.getState().setTapeHover(null));
      expect(hint()).toBe('Type a distance, Enter to place');
    });

    it('the hint says an already-stored line is there', () => {
      oblique(true);
      expect(hint()).toBe('That line is already there; type a distance');
    });

    it('a typed 3 with a hover still adds a guide point', async () => {
      const box = oblique();
      await userEvent.type(box, '3{Enter}');
      const g = useStore.getState().doc.guides;
      expect(g).toHaveLength(1);
      expect('to' in g[0]! ? g[0]!.to : undefined).toBeUndefined();
      expect(g[0]!.axis).toBeUndefined();
    });
  });
});
