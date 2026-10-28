import type { Mock } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { createDocument } from '../document/document';
import type { SavedViewCamera } from '../document/types';
import { ViewsFooter } from './ViewsFooter';

const st = () => useStore.getState();
const cam: SavedViewCamera = { ortho: false, position: [10, 20, 30], target: [0, 0, 0] };
let getCamera: () => SavedViewCamera | null;
let onGoTo: Mock<(id: string) => void>;
beforeEach(() => {
  st().replaceDocument(createDocument('Test'));
  getCamera = () => cam;
  onGoTo = vi.fn<(id: string) => void>();
});

const toggle = () => screen.getByRole('button', { name: /^Views · \d+$/ });
const mount = () => render(<ViewsFooter getCamera={() => getCamera()} onGoTo={onGoTo} />);
const saveBtn = () => screen.getByRole('button', { name: 'Save view' });

describe('ViewsFooter (saved views spec §6)', () => {
  it('the toggle reads Views · N and opens itself when a view is added', () => {
    mount();
    expect(toggle()).toHaveAccessibleName('Views · 0');
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    act(() => { st().saveView(cam); });
    expect(toggle()).toHaveAccessibleName('Views · 1');
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
  });

  it('empty text', async () => {
    mount();
    await userEvent.click(toggle());
    expect(screen.getByText('No saved views. Set up a view, then Save view.')).toBeInTheDocument();
  });

  it('Save view adds View 1; with no camera it adds nothing', async () => {
    mount();
    await userEvent.click(toggle());
    await userEvent.click(saveBtn());
    expect(st().doc.views).toHaveLength(1);
    expect(st().doc.views[0]!.name).toBe('View 1');
    expect(st().doc.views[0]!.camera).toEqual(cam);
    getCamera = () => null;
    await userEvent.click(saveBtn());
    expect(st().doc.views).toHaveLength(1);
  });

  it('Save view focuses and selects the new view name field', async () => {
    mount();
    await userEvent.click(toggle());
    await userEvent.click(saveBtn());
    const input = screen.getByRole('textbox', { name: 'View name' }) as HTMLInputElement;
    expect(input).toHaveValue('View 1');
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 6]);
    const before = st().doc.views;
    await userEvent.tab();
    expect(st().doc.views).toBe(before); // untouched blur commits nothing (inv 5)
  });

  it('clicking a view name calls onGoTo(id)', async () => {
    mount();
    act(() => { st().saveView(cam); });
    const b = screen.getByTitle('Go to this view');
    await userEvent.click(b);
    expect(onGoTo).toHaveBeenCalledWith(st().doc.views[0]!.id);
  });

  it('rename commits on Enter and blur; emptied reverts', async () => {
    mount();
    act(() => { st().saveView(cam); });
    const input = () => screen.getByRole('textbox', { name: 'View name' });
    await userEvent.clear(input());
    await userEvent.type(input(), 'Front{Enter}');
    expect(st().doc.views[0]!.name).toBe('Front');
    await userEvent.clear(input());
    await userEvent.type(input(), 'Back');
    await userEvent.tab();
    expect(st().doc.views[0]!.name).toBe('Back');
    await userEvent.clear(input());
    await userEvent.tab();
    expect(st().doc.views[0]!.name).toBe('Back');
    expect(input()).toHaveValue('Back');
  });

  it('Update replaces the view', async () => {
    mount();
    act(() => { st().saveView(cam); });
    act(() => st().setSection({ axis: 'front', at: 5, flip: false }));
    await userEvent.click(screen.getByTitle('Replace this view with the current view'));
    expect(st().doc.views[0]!.section).toEqual(st().section);
    expect(st().doc.views[0]!.section).not.toBeNull();
  });

  it('x deletes', async () => {
    mount();
    act(() => { st().saveView(cam); });
    await userEvent.click(screen.getByRole('button', { name: 'Delete view View 1' }));
    expect(st().doc.views).toHaveLength(0);
  });

  it('works while exploded', async () => {
    mount();
    act(() => { st().saveView(cam); });
    act(() => st().setExplode(0.5));
    await userEvent.click(saveBtn());
    expect(st().doc.views).toHaveLength(2);
    expect(saveBtn().closest('fieldset[disabled]')).toBeNull();
    await userEvent.click(screen.getAllByTitle('Replace this view with the current view')[0]!);
    expect(st().doc.views[0]!.explode).toBe(0.5);
    const input = screen.getAllByRole('textbox', { name: 'View name' })[0]!;
    await userEvent.clear(input);
    await userEvent.type(input, 'Zed{Enter}');
    expect(st().doc.views[0]!.name).toBe('Zed');
    await userEvent.click(screen.getByRole('button', { name: 'Delete view Zed' }));
    expect(st().doc.views).toHaveLength(1);
  });
});
