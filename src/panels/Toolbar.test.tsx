import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { createDocument } from '../document/document';
import { Toolbar } from './Toolbar';

const reset = () => useStore.getState().replaceDocument(createDocument('Test'));

beforeEach(reset);

const noop = () => {};

describe('Toolbar view toggles', () => {
  it('reflects the grid state in the checkbox', () => {
    const { unmount } = render(
      <Toolbar orthographic={false} onToggleProjection={noop} showGrid onToggleGrid={noop} />,
    );
    expect(screen.getByLabelText('Grid')).toBeChecked();
    unmount();

    render(
      <Toolbar
        orthographic={false}
        onToggleProjection={noop}
        showGrid={false}
        onToggleGrid={noop}
      />,
    );
    expect(screen.getByLabelText('Grid')).not.toBeChecked();
  });

  it('asks its parent to toggle the grid when clicked', async () => {
    const onToggleGrid = vi.fn();
    render(
      <Toolbar
        orthographic={false}
        onToggleProjection={noop}
        showGrid
        onToggleGrid={onToggleGrid}
      />,
    );

    await userEvent.click(screen.getByLabelText('Grid'));

    expect(onToggleGrid).toHaveBeenCalledTimes(1);
  });

  it('keeps the grid toggle out of the document and off the undo stack', async () => {
    // Grid visibility is view state. If it ever became a document edit, the
    // undo stack would fill with entries that change nothing you can see.
    const onToggleGrid = vi.fn();
    render(
      <Toolbar
        orthographic={false}
        onToggleProjection={noop}
        showGrid
        onToggleGrid={onToggleGrid}
      />,
    );
    const docBefore = useStore.getState().doc;
    const undoDepthBefore = useStore.getState().past.length;

    await userEvent.click(screen.getByLabelText('Grid'));

    expect(useStore.getState().doc).toBe(docBefore);
    expect(useStore.getState().past.length).toBe(undoDepthBefore);
  });
});
