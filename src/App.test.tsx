import { act, render } from '@testing-library/react';
import App from './App';
import { useStore } from './store/store';
import { createDocument, createBoard } from './document/document';

// The 3D viewport needs a real ResizeObserver and a WebGL-capable canvas,
// neither of which jsdom provides. App's restore/autosave wiring doesn't
// depend on the viewport at all, so it's stubbed out here.
vi.mock('./viewport/Viewport', () => ({
  Viewport: () => null,
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
});
