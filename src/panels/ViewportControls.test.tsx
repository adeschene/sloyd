import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { createDocument } from '../document/document';
import { ViewportControls, EXPLODED_TITLE } from './ViewportControls';

beforeEach(() => useStore.getState().replaceDocument(createDocument('Test')));

const noop = () => {};
function renderControls(overrides: Partial<Parameters<typeof ViewportControls>[0]> = {}) {
  return render(
    <ViewportControls orthographic={false} onToggleProjection={noop} showGrid onToggleGrid={noop}
      showAxes onToggleAxes={noop} showGuides onToggleGuides={noop} {...overrides} />,
  );
}
const btn = (name: string) => screen.getByRole('button', { name });

describe('ViewportControls tools', () => {
  afterEach(() => { act(() => useStore.getState().setTool('select')); });

  it('presses the active tool and switches tool on click', async () => {
    renderControls();
    expect(btn('Select')).toHaveAttribute('aria-pressed', 'true');
    expect(btn('Tape')).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(btn('Tape'));
    expect(useStore.getState().tool).toBe('tape');
    expect(btn('Tape')).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(btn('Move'));
    expect(useStore.getState().tool).toBe('move');
  });

  it('shows "Select a part to move" in the Move tool exactly while nothing is selected', () => {
    renderControls();
    act(() => useStore.getState().setTool('move'));
    expect(screen.getByText('Select a part to move')).toBeInTheDocument();
    act(() => useStore.getState().addBoard());
    expect(screen.queryByText('Select a part to move')).not.toBeInTheDocument();
    act(() => {
      useStore.getState().addBoard();
      useStore.getState().selectAll();
    });
    expect(screen.queryByText('Select a part to move')).not.toBeInTheDocument();
    act(() => useStore.getState().selectBoard(null));
    expect(screen.getByText('Select a part to move')).toBeInTheDocument();
  });
});

describe('ViewportControls while exploded', () => {
  afterEach(() => { act(() => useStore.getState().setExplode(0)); });

  it('disables Move and Tape (not Select) and says why', () => {
    renderControls();
    act(() => useStore.getState().setExplode(0.4));
    expect(btn('Move')).toBeDisabled();
    expect(btn('Tape')).toBeDisabled();
    expect(btn('Select')).not.toBeDisabled();
    expect(btn('Move')).toHaveAttribute('title', EXPLODED_TITLE);
    act(() => useStore.getState().setExplode(0));
    expect(btn('Move')).not.toBeDisabled();
  });
});

describe('ViewportControls projection', () => {
  it('presses Perspective or Orthographic to match, and only the other one toggles', async () => {
    const onToggleProjection = vi.fn();
    renderControls({ orthographic: false, onToggleProjection });
    expect(btn('Perspective')).toHaveAttribute('aria-pressed', 'true');
    expect(btn('Orthographic')).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(btn('Perspective'));
    expect(onToggleProjection).not.toHaveBeenCalled();
    await userEvent.click(btn('Orthographic'));
    expect(onToggleProjection).toHaveBeenCalledTimes(1);
  });

  it('when orthographic, Orthographic is pressed and Perspective toggles', async () => {
    const onToggleProjection = vi.fn();
    renderControls({ orthographic: true, onToggleProjection });
    expect(btn('Orthographic')).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(btn('Orthographic'));
    expect(onToggleProjection).not.toHaveBeenCalled();
    await userEvent.click(btn('Perspective'));
    expect(onToggleProjection).toHaveBeenCalledTimes(1);
  });
});

describe('ViewportControls view toggles', () => {
  it.each([
    ['Grid', 'showGrid', 'onToggleGrid'],
    ['Origin', 'showAxes', 'onToggleAxes'],
    ['Guides', 'showGuides', 'onToggleGuides'],
  ] as const)('%s reflects its state with aria-pressed and asks its parent to toggle', async (name, flag, cb) => {
    const { unmount } = renderControls({ [flag]: false });
    expect(btn(name)).toHaveAttribute('aria-pressed', 'false');
    unmount();
    const spy = vi.fn();
    renderControls({ [flag]: true, [cb]: spy });
    expect(btn(name)).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(btn(name));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('drives the grid and the origin axes independently (follow-up 30)', async () => {
    const onToggleGrid = vi.fn();
    const onToggleAxes = vi.fn();
    renderControls({ showGrid: true, showAxes: false, onToggleGrid, onToggleAxes });
    await userEvent.click(btn('Origin'));
    expect(onToggleAxes).toHaveBeenCalledTimes(1);
    expect(onToggleGrid).not.toHaveBeenCalled();
  });

  it('keeps the toggles out of the document and off the undo stack', async () => {
    renderControls();
    const docBefore = useStore.getState().doc;
    const undoDepthBefore = useStore.getState().past.length;
    await userEvent.click(btn('Grid'));
    await userEvent.click(btn('Origin'));
    await userEvent.click(btn('Guides'));
    expect(useStore.getState().doc).toBe(docBefore);
    expect(useStore.getState().past.length).toBe(undoDepthBefore);
  });
});

describe('ViewportControls explode', () => {
  afterEach(() => { act(() => useStore.getState().setExplode(0)); });

  it('sets the explode amount from the slider and shows it as a percentage', () => {
    renderControls();
    const slider = screen.getByRole('slider', { name: 'Explode' });
    expect(slider).toHaveValue('0');
    fireEvent.change(slider, { target: { value: '0.5' } });
    expect(useStore.getState().explode).toBe(0.5);
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('shows the store value when a change is refused inside a gesture', () => {
    renderControls();
    const slider = screen.getByRole('slider', { name: 'Explode' });
    act(() => useStore.getState().beginGesture());
    fireEvent.change(slider, { target: { value: '0.5' } });
    act(() => useStore.getState().endGesture());
    expect(slider).toHaveValue('0');
  });
});
