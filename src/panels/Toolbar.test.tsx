import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { createDocument } from '../document/document';
import { Toolbar } from './Toolbar';

const reset = () => useStore.getState().replaceDocument(createDocument('Test'));

beforeEach(reset);

const noop = () => {};

/**
 * Every view toggle is optional-by-omission here: the defaults keep each test
 * focused on the one toggle it is about, and adding a third toggle later does
 * not touch the tests for the first two.
 */
function renderToolbar(overrides: Partial<Parameters<typeof Toolbar>[0]> = {}) {
  return render(
    <Toolbar
      orthographic={false}
      onToggleProjection={noop}
      showGrid
      onToggleGrid={noop}
      showAxes
      onToggleAxes={noop}
      showGuides
      onToggleGuides={noop}
      onOpenCutList={noop}
      {...overrides}
    />,
  );
}

describe('Toolbar view toggles', () => {
  it('reflects the grid state in the checkbox', () => {
    const { unmount } = renderToolbar({ showGrid: true });
    expect(screen.getByLabelText('Grid')).toBeChecked();
    unmount();

    renderToolbar({ showGrid: false });
    expect(screen.getByLabelText('Grid')).not.toBeChecked();
  });

  it('asks its parent to toggle the grid when clicked', async () => {
    const onToggleGrid = vi.fn();
    renderToolbar({ onToggleGrid });

    await userEvent.click(screen.getByLabelText('Grid'));

    expect(onToggleGrid).toHaveBeenCalledTimes(1);
  });

  it('keeps the grid toggle out of the document and off the undo stack', async () => {
    // Grid visibility is view state. If it ever became a document edit, the
    // undo stack would fill with entries that change nothing you can see.
    renderToolbar();
    const docBefore = useStore.getState().doc;
    const undoDepthBefore = useStore.getState().past.length;

    await userEvent.click(screen.getByLabelText('Grid'));

    expect(useStore.getState().doc).toBe(docBefore);
    expect(useStore.getState().past.length).toBe(undoDepthBefore);
  });

  it('reflects the origin-axes state in its own checkbox', () => {
    const { unmount } = renderToolbar({ showAxes: true });
    expect(screen.getByLabelText('Origin')).toBeChecked();
    unmount();

    renderToolbar({ showAxes: false });
    expect(screen.getByLabelText('Origin')).not.toBeChecked();
  });

  it('asks its parent to toggle the origin axes when clicked', async () => {
    const onToggleAxes = vi.fn();
    renderToolbar({ onToggleAxes });

    await userEvent.click(screen.getByLabelText('Origin'));

    expect(onToggleAxes).toHaveBeenCalledTimes(1);
  });

  it('keeps the origin-axes toggle out of the document and off the undo stack', async () => {
    renderToolbar();
    const docBefore = useStore.getState().doc;
    const undoDepthBefore = useStore.getState().past.length;

    await userEvent.click(screen.getByLabelText('Origin'));

    expect(useStore.getState().doc).toBe(docBefore);
    expect(useStore.getState().past.length).toBe(undoDepthBefore);
  });

  it('drives the grid and the origin axes independently', async () => {
    // The whole point of follow-up 30: the axes answer "where is the origin"
    // and the grid answers "how big is this", so hiding one must never hide
    // the other.
    const onToggleGrid = vi.fn();
    const onToggleAxes = vi.fn();
    renderToolbar({ showGrid: true, showAxes: false, onToggleGrid, onToggleAxes });

    expect(screen.getByLabelText('Grid')).toBeChecked();
    expect(screen.getByLabelText('Origin')).not.toBeChecked();

    await userEvent.click(screen.getByLabelText('Origin'));

    expect(onToggleAxes).toHaveBeenCalledTimes(1);
    expect(onToggleGrid).not.toHaveBeenCalled();
  });

  it('opens the cut list', async () => {
    let opened = false;
    renderToolbar({ onOpenCutList: () => { opened = true; } });
    await userEvent.click(screen.getByText('Cut list'));
    expect(opened).toBe(true);
  });
});

describe('Guides checkbox', () => {
  it('renders checked and calls back on change', async () => {
    const onToggleGuides = vi.fn();
    renderToolbar({ showGuides: true, onToggleGuides });
    const box = screen.getByLabelText('Guides') as HTMLInputElement;
    expect(box.checked).toBe(true);
    await userEvent.click(box);
    expect(onToggleGuides).toHaveBeenCalledTimes(1);
  });
});
