import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { createDocument, DocumentError } from '../document/document';
import { FileMenu } from './FileMenu';

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
    render(<FileMenu />);

    await userEvent.click(screen.getByTitle('Export project'));

    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert.textContent).not.toBe('');
  });

  it('shows nothing after a successful export', async () => {
    exportProject.mockResolvedValue(undefined);
    render(<FileMenu />);

    await userEvent.click(screen.getByTitle('Export project'));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('FileMenu import', () => {
  it('surfaces no error when the file picker is cancelled', async () => {
    // Deliberately a message that does NOT contain the word "cancel" — this
    // pins that cancellation is detected via the typed `cancelled` field,
    // not by regex-matching the message text. A regex-based check would
    // fail this test (and would also break for real the moment anyone
    // rewords the message constructed in storage/browser.ts).
    importProject.mockRejectedValue(
      new DocumentError('Never mind, closing.', { cancelled: true }),
    );
    render(<FileMenu />);

    await userEvent.click(screen.getByTitle('Import project'));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('surfaces a visible error when the chosen file is corrupt', async () => {
    importProject.mockRejectedValue(
      new DocumentError('That file is not a valid Sloyd project file.'),
    );
    render(<FileMenu />);

    await userEvent.click(screen.getByTitle('Import project'));

    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert.textContent).toBe('That file is not a valid Sloyd project file.');
  });
});
