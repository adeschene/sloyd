import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { createDocument } from '../document/document';
import { Toolbar } from './Toolbar';

const reset = () => useStore.getState().replaceDocument(createDocument('Test'));

beforeEach(reset);

const noop = () => {};
const asyncNoop = async () => {};
// Duplicate reports a cause or null (follow-up 159); null is "it worked".
const asyncOk = async () => null;

function renderToolbar(overrides: Partial<Parameters<typeof Toolbar>[0]> = {}) {
  return render(
    <Toolbar
      onOpenCutList={noop}
      libraryAvailable={false}
      activeId=""
      onOpenProject={noop}
      onNewProject={noop}
      onDuplicateProject={asyncOk}
      onDeleteProject={asyncNoop}
      onImportProject={noop}
      onOpenGenerate={noop}
      onOpenJoinery={noop}
      onOpenRefine={noop}
      onOpenSettings={noop}
      generating={null}
      {...overrides}
    />,
  );
}

describe('Toolbar Refine button', () => {
  it('asks its parent to open Refine', async () => {
    const onOpenRefine = vi.fn();
    renderToolbar({ onOpenRefine });
    await userEvent.click(screen.getByRole('button', { name: 'Refine…' }));
    expect(onOpenRefine).toHaveBeenCalledTimes(1);
  });
});

describe('Toolbar', () => {
  it('opens the cut list', async () => {
    let opened = false;
    renderToolbar({ onOpenCutList: () => { opened = true; } });
    await userEvent.click(screen.getByText('Cut list'));
    expect(opened).toBe(true);
  });
});

describe('Project menu gating', () => {
  // The menu is gated behind `libraryAvailable` so a failed library adoption
  // degrades to today's single-project app rather than to a menu that lies
  // about being able to switch, duplicate, delete or import anything —
  // flipping this to `libraryAvailable ||` (i.e. always rendering) would
  // still pass every other test in this file, since none of them assert on
  // its absence. These two are what close that gap.
  it('does not render the project menu when the library is unavailable', () => {
    renderToolbar({ libraryAvailable: false });
    expect(screen.queryByLabelText('Open project menu')).toBeNull();
  });

  it('renders the project menu when the library is available', () => {
    renderToolbar({ libraryAvailable: true, activeId: 'p1' });
    expect(screen.getByLabelText('Open project menu')).toBeInTheDocument();
  });
});

describe('Toolbar Generate button', () => {
  it('reads Generate… when nothing is running', () => {
    renderToolbar();
    expect(screen.getByRole('button', { name: 'Generate…' })).toBeInTheDocument();
  });

  it('counts finished runs while a batch is live — done = total − live', () => {
    renderToolbar({ generating: { live: 1, total: 3 } });
    expect(screen.getByRole('button', { name: 'Generating 2/3…' })).toBeInTheDocument();
  });

  it('still opens the dialog while a batch is live', async () => {
    const onOpenGenerate = vi.fn();
    renderToolbar({ generating: { live: 2, total: 2 }, onOpenGenerate });
    await userEvent.click(screen.getByRole('button', { name: 'Generating 0/2…' }));
    expect(onOpenGenerate).toHaveBeenCalledTimes(1);
  });

  it('opens Settings from the gear', async () => {
    const onOpenSettings = vi.fn();
    renderToolbar({ onOpenSettings });
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});
