import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { createDocument } from '../document/document';
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
