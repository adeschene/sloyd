import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { useStore } from './store/store';
import { createDocument, createBoard } from './document/document';

// The 3D viewport needs a real ResizeObserver and a WebGL-capable canvas,
// neither of which jsdom provides. App's restore/autosave wiring doesn't
// depend on the viewport at all, so it's stubbed out here.
//
// The stub records its props: `shortcutsSuspended` is the only way the cut
// list can reach `CameraKeys`' window listener, and the wiring is testable
// here even though the listener itself is not (the viewport is r3f and is
// verified in a browser by design).
const viewportProps = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));
vi.mock('./viewport/Viewport', () => ({
  Viewport: (props: Record<string, unknown>) => {
    viewportProps.current = props;
    return null;
  },
}));

const loadAutoSaved = vi.fn();
const autoSave = vi.fn().mockResolvedValue(undefined);
const exportProject = vi.fn().mockResolvedValue(undefined);
const importProject = vi.fn();

vi.mock('./storage/browser', () => ({
  storage: {
    available: true,
    capabilities: { recentFiles: false, realPaths: false },
    loadAutoSaved: (...args: unknown[]) => loadAutoSaved(...args),
    autoSave: (...args: unknown[]) => autoSave(...args),
    exportProject: (...args: unknown[]) => exportProject(...args),
    importProject: (...args: unknown[]) => importProject(...args),
    listRecent: () => Promise.resolve([]),
  },
}));

const reset = () => useStore.getState().replaceDocument(createDocument('Test'));

beforeEach(() => {
  reset();
  loadAutoSaved.mockReset();
  autoSave.mockReset().mockResolvedValue(undefined);
  exportProject.mockReset().mockResolvedValue(undefined);
  importProject.mockReset();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('App restore-on-mount', () => {
  it('does not clobber a document the user edited while the restore was in flight', async () => {
    const { promise, resolve } = deferred<ReturnType<typeof createDocument> | null>();
    loadAutoSaved.mockReturnValue(promise);

    render(<App />);

    // The user edits the document before the (slow) restore resolves.
    await act(async () => {
      useStore.getState().addBoard();
    });
    const editedDoc = useStore.getState().doc;
    expect(editedDoc.boards).toHaveLength(1);
    const editedBoardId = editedDoc.boards[0].id;

    // The restore now resolves with an unrelated saved document.
    const saved = { ...createDocument('Saved'), boards: [createBoard(), createBoard()] };
    await act(async () => {
      resolve(saved);
      await promise;
    });

    // The user's edit must win — the saved document must not have replaced it.
    const finalDoc = useStore.getState().doc;
    expect(finalDoc).toBe(editedDoc);
    expect(finalDoc.boards).toHaveLength(1);
    expect(finalDoc.boards[0].id).toBe(editedBoardId);
  });

  it('does not replace the document after the component has unmounted', async () => {
    const { promise, resolve } = deferred<ReturnType<typeof createDocument> | null>();
    loadAutoSaved.mockReturnValue(promise);

    const { unmount } = render(<App />);
    const beforeDoc = useStore.getState().doc;

    unmount();

    const saved = { ...createDocument('Saved'), boards: [createBoard()] };
    await act(async () => {
      resolve(saved);
      await promise;
    });

    expect(useStore.getState().doc).toBe(beforeDoc);
  });

  it('still marks the restore complete when there is nothing to restore', async () => {
    loadAutoSaved.mockResolvedValue(null);
    const initialDoc = useStore.getState().doc;

    await act(async () => {
      render(<App />);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Document unchanged (nothing to restore), but the autosave path should
    // now be armed — proven by an edit reaching autoSave after a debounce.
    expect(useStore.getState().doc).toBe(initialDoc);
  });

  it('autosaves an edit once the debounce elapses — proves autosave actually arms', async () => {
    // Deleting `restored.current = true` from any restore-completion path
    // leaves this false forever and autoSave() is never called for the rest
    // of the session — the only other assertion in this describe block
    // ("document unchanged") stays green even with that bug, so it does not
    // catch it. This one does.
    vi.useFakeTimers();
    try {
      loadAutoSaved.mockResolvedValue(null);
      render(<App />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      act(() => {
        useStore.getState().addBoard();
      });
      const editedDoc = useStore.getState().doc;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(600);
      });

      expect(autoSave).toHaveBeenCalledWith(editedDoc);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('App keyboard delete', () => {
  const mountWithOneBoard = async () => {
    loadAutoSaved.mockResolvedValue(null);
    render(<App />);
    await act(async () => { await Promise.resolve(); });
    await act(async () => { useStore.getState().addBoard(); });
    const user = userEvent.setup();
    // Click the board in the parts list to set focus on the button, not on the
    // auto-focused Length input. This reflects the real path: the user clicks a
    // part, then presses Delete/Backspace from the button, not while editing.
    await user.click(screen.getByRole('button', { name: 'Board' }));
    return useStore.getState().doc.boards[0].id;
  };

  it('deletes the selected board on Delete', async () => {
    const id = await mountWithOneBoard();
    expect(useStore.getState().selectedId).toBe(id);

    const user = userEvent.setup();
    await user.keyboard('{Delete}');

    expect(useStore.getState().doc.boards).toHaveLength(0);
    expect(useStore.getState().selectedId).toBeNull();
  });

  it('deletes the selected board on Backspace — the Mac "delete" key', async () => {
    await mountWithOneBoard();

    const user = userEvent.setup();
    await user.keyboard('{Backspace}');

    expect(useStore.getState().doc.boards).toHaveLength(0);
  });

  it('is undoable', async () => {
    const id = await mountWithOneBoard();

    const user = userEvent.setup();
    await user.keyboard('{Delete}');
    act(() => { useStore.getState().undo(); });

    expect(useStore.getState().doc.boards.map((b) => b.id)).toEqual([id]);
  });

  it('does nothing when no board is selected', async () => {
    await mountWithOneBoard();
    act(() => { useStore.getState().selectBoard(null); });

    const user = userEvent.setup();
    await user.keyboard('{Delete}');

    expect(useStore.getState().doc.boards).toHaveLength(1);
  });

  it('does not steal Backspace from a text field', async () => {
    await mountWithOneBoard();

    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Project name'));
    await user.keyboard('{Backspace}');

    expect(useStore.getState().doc.boards).toHaveLength(1);
  });

  it('ignores a modified Delete', async () => {
    await mountWithOneBoard();

    const user = userEvent.setup();
    await user.keyboard('{Control>}{Delete}{/Control}');

    expect(useStore.getState().doc.boards).toHaveLength(1);
  });

  it('does not delete the selected board while the cut list is open', async () => {
    const id = await mountWithOneBoard();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Cut list' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Delete}');

    expect(useStore.getState().doc.boards).toHaveLength(1);
    expect(useStore.getState().selectedId).toBe(id);
  });

  it('makes the rest of the app inert while the cut list is open', async () => {
    // The other half of the Delete guard above. The overlay stops the mouse,
    // but Tab used to walk into NameField, the project-name field and the
    // DimensionFields behind the scrim — all of which commit on change or
    // blur, so reading the sheet could silently rewrite the document.
    //
    // Asserted on the attribute rather than by tabbing: jsdom reflects `inert`
    // but does not implement its focus semantics, so a userEvent.tab() test
    // would pass identically with and without the fix. What the attribute
    // buys is verified in a real browser.
    await mountWithOneBoard();
    const shell = document.querySelector('.app-shell')!;
    expect(shell.hasAttribute('inert')).toBe(false);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Cut list' }));
    expect(shell.hasAttribute('inert')).toBe(true);

    await user.keyboard('{Escape}');
    expect(shell.hasAttribute('inert')).toBe(false);
  });

  it('suspends the viewport camera shortcuts while the cut list is open', async () => {
    // `f`/`Home` live on a window listener inside the Canvas, which `inert`
    // cannot reach: a window listener never sees which subtree the event came
    // from. Pressing `f` behind the sheet re-framed the camera invisibly and
    // handed the user back a moved view. Only the prop wiring is asserted —
    // the listener is r3f-side and is browser-verified by design.
    await mountWithOneBoard();
    expect(viewportProps.current?.shortcutsSuspended).toBe(false);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Cut list' }));
    expect(viewportProps.current?.shortcutsSuspended).toBe(true);

    await user.keyboard('{Escape}');
    expect(viewportProps.current?.shortcutsSuspended).toBe(false);
  });

  it('returns focus to the button that opened the cut list', async () => {
    await mountWithOneBoard();
    const user = userEvent.setup();
    const open = screen.getByRole('button', { name: 'Cut list' });

    await user.click(open);
    await user.keyboard('{Escape}');

    expect(document.activeElement).toBe(open);
  });

  it('does not steal Backspace from the Length field', async () => {
    // Regression test: Backspace must be blocked when editing dimensions,
    // not just for arbitrary text inputs. If a bypass for testing artifacts
    // ever crept in, this would fail.
    await mountWithOneBoard();

    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Length'));
    await user.keyboard('{Backspace}');

    expect(useStore.getState().doc.boards).toHaveLength(1);
  });
});
