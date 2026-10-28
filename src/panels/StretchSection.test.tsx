import { act, fireEvent, render, screen } from '@testing-library/react';
import { useStore } from '../store/store';
import { apronTable } from '../document/stretchFixtures';
import { StretchSection } from './StretchSection';
import { EditLock } from './EditLock';

/** Parametric-resize spec §8: the Overall size section. The apron table is x 0-48, y 0-30, z 0-24. */
const load = (ids: string[] | 'all' | 'one') => act(() => {
  const doc = apronTable();
  useStore.getState().replaceDocument(doc);
  useStore.setState({ selectedIds: ids === 'all' ? doc.boards.map((b) => b.id) : ids === 'one' ? [doc.boards[0]!.id] : ids });
});
const view = () => render(<EditLock><StretchSection /></EditLock>);
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const xOf = (name: string) => useStore.getState().doc.boards.find((b) => b.name === name)!.position[0];

describe('StretchSection', () => {
  afterEach(() => act(() => { useStore.getState().setExplode(0); useStore.getState().setStretchGuide(null); }));

  it('absent for one part, shown for 2+ items', () => {
    load('one');
    const { container, unmount } = view();
    expect(container.querySelector('.stretch-section')).toBeNull();
    unmount();
    load('all');
    view();
    expect(screen.getByRole('heading', { name: 'Overall size' })).toBeInTheDocument();
  });

  it('shown with one assembly selected', () => {
    act(() => {
      useStore.getState().replaceDocument(apronTable());
      useStore.setState({ selectedIds: useStore.getState().doc.boards.slice(0, 2).map((b) => b.id) });
      useStore.getState().groupSelected();
    });
    view();
    expect(screen.getByRole('heading', { name: 'Overall size' })).toBeInTheDocument();
    expect(screen.getByLabelText('Width (X)')).toHaveValue('1-3/4"');
  });

  it('the three fields show the extent', () => {
    load('all');
    view();
    expect(screen.getByLabelText('Width (X)')).toHaveValue('48"');
    expect(screen.getByLabelText('Height (Y)')).toHaveValue('30"');
    expect(screen.getByLabelText('Depth (Z)')).toHaveValue('24"');
  });

  it('typing arms the line at the middle and the guide; nothing commits on blur', () => {
    load('all');
    view();
    const before = useStore.getState().doc;
    type('Width (X)', '54"');
    fireEvent.blur(screen.getByLabelText('Width (X)'));
    expect(useStore.getState().doc).toBe(before);
    expect(screen.getByLabelText('Stretch at')).toHaveValue('24"');
    expect(screen.getByText('from the left')).toBeInTheDocument();
    expect(useStore.getState().stretchGuide).toEqual({ axis: 0, at: 24 });
    type('Height (Y)', '36"');
    expect(screen.getByLabelText('Stretch at')).toHaveValue('15"');
    expect(screen.getByText('from the bottom')).toBeInTheDocument();
    expect(useStore.getState().stretchGuide).toEqual({ axis: 1, at: 15 });
  });

  it('the preview reads previewText', () => {
    load('all');
    view();
    type('Width (X)', '54"');
    expect(screen.getByText('48" → 54": grows Front apron, Back apron, Top · moves 3 · 3 stay')).toBeInTheDocument();
  });

  it('a refusal shows as a status and Stretch is disabled', () => {
    load('all');
    view();
    type('Width (X)', '54"');
    type('Stretch at', '50"');
    expect(screen.getByRole('status')).toHaveTextContent('The stretch line must be inside the selection.');
    expect(screen.getByRole('button', { name: 'Stretch' })).toBeDisabled();
  });

  it('Stretch applies, clears the armed state and the guide', () => {
    load('all');
    view();
    type('Width (X)', '54"');
    fireEvent.click(screen.getByRole('button', { name: 'Stretch' }));
    expect(xOf('Right back leg')).toBe(52.25);
    expect(xOf('Left back leg')).toBe(0);
    expect(useStore.getState().stretchGuide).toBeNull();
    expect(screen.queryByLabelText('Stretch at')).toBeNull();
    expect(screen.getByLabelText('Width (X)')).toHaveValue('54"');
  });

  it('Cancel restores the fields and clears the guide; Middle resets the line', () => {
    load('all');
    view();
    type('Width (X)', '54"');
    type('Stretch at', '10"');
    expect(useStore.getState().stretchGuide).toEqual({ axis: 0, at: 10 });
    fireEvent.click(screen.getByRole('button', { name: 'Middle' }));
    expect(screen.getByLabelText('Stretch at')).toHaveValue('24"');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('Width (X)')).toHaveValue('48"');
    expect(useStore.getState().stretchGuide).toBeNull();
    expect(screen.queryByLabelText('Stretch at')).toBeNull();
  });

  it('a selection change disarms', () => {
    load('all');
    view();
    type('Width (X)', '54"');
    act(() => useStore.setState({ selectedIds: useStore.getState().doc.boards.slice(0, 3).map((b) => b.id) }));
    expect(screen.queryByLabelText('Stretch at')).toBeNull();
  });

  it('disabled while exploded', () => {
    load('all');
    act(() => useStore.getState().setExplode(0.5));
    view();
    expect(screen.getByLabelText('Width (X)')).toBeDisabled();
  });
});
