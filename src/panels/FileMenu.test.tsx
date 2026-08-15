import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { createDocument, DocumentError } from '../document/document';
import { FileMenu } from './FileMenu';
import type { FileMenuHandle } from './FileMenu';

const exportProject = vi.fn();
const importProject = vi.fn();

vi.mock('../storage/browser', () => ({
  storage: {
    available: true,
    capabilities: { recentFiles: false, realPaths: false },
    loadAutoSaved: () => Promise.resolve(null),
    autoSave: () => Promise.resolve(undefined),
    exportProject: (...args: unknown[]) => exportProject(...args),
    importProject: (...args: unknown[]) => importProject(...args),
    listRecent: () => Promise.resolve([]),
  },
}));

const reset = () => useStore.getState().replaceDocument(createDocument('Test'));

beforeEach(() => {
  reset();
  exportProject.mockReset();
  importProject.mockReset();
});

describe('FileMenu export', () => {
  it('surfaces a visible error when exportProject rejects', async () => {
    exportProject.mockRejectedValue(new Error('sandboxed iframe blocked the download'));
    render(<FileMenu onImported={vi.fn()} />);

    await userEvent.click(screen.getByTitle('Export project'));

    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert.textContent).not.toBe('');
  });

  it('shows nothing after a successful export', async () => {
    exportProject.mockResolvedValue(undefined);
    render(<FileMenu onImported={vi.fn()} />);

    await userEvent.click(screen.getByTitle('Export project'));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

// Import no longer has its own trigger button in FileMenu — the button
// moved into ProjectMenu (Task 6). The flow and its error surface stayed
// here, so the tests drive it through the imperative handle ProjectMenu's
// click handler calls, `ref.current.importProjectIntoLibrary()`.
describe('FileMenu import', () => {
  it('does not prompt before importing — every project has its own slot now', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    importProject.mockResolvedValue(createDocument('Imported'));
    const onImported = vi.fn().mockResolvedValue(undefined);
    const ref = createRef<FileMenuHandle>();
    render(<FileMenu ref={ref} onImported={onImported} />);

    await ref.current!.importProjectIntoLibrary();

    expect(confirm).not.toHaveBeenCalled();
    expect(onImported).toHaveBeenCalledWith(expect.objectContaining({ name: 'Imported' }));
    confirm.mockRestore();
  });

  it('surfaces no error when the file picker is cancelled', async () => {
    // Deliberately a message that does NOT contain the word "cancel" — this
    // pins that cancellation is detected via the typed `cancelled` field,
    // not by regex-matching the message text. A regex-based check would
    // fail this test (and would also break for real the moment anyone
    // rewords the message constructed in storage/browser.ts).
    importProject.mockRejectedValue(
      new DocumentError('Never mind, closing.', { cancelled: true }),
    );
    const ref = createRef<FileMenuHandle>();
    render(<FileMenu ref={ref} onImported={vi.fn()} />);

    await ref.current!.importProjectIntoLibrary();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('surfaces a visible error when the chosen file is corrupt', async () => {
    importProject.mockRejectedValue(
      new DocumentError('That file is not a valid Sloyd project file.'),
    );
    const ref = createRef<FileMenuHandle>();
    render(<FileMenu ref={ref} onImported={vi.fn()} />);

    await ref.current!.importProjectIntoLibrary();

    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert.textContent).toBe('That file is not a valid Sloyd project file.');
  });

  it('does not surface an error when onImported itself rejects being reported as an import failure', async () => {
    // Sanity check on ownership: onImported's own errors are not this
    // component's concern to catch specially — it's a thrown error inside
    // the try block just like a bad file, and gets the generic message.
    importProject.mockResolvedValue(createDocument('Imported'));
    const onImported = vi.fn().mockRejectedValue(new Error('storage full'));
    const ref = createRef<FileMenuHandle>();
    render(<FileMenu ref={ref} onImported={onImported} />);

    await ref.current!.importProjectIntoLibrary();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Could not open that file.');
  });
});
