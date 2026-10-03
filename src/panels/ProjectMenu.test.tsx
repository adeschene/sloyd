import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectMenu, relativeTime } from './ProjectMenu';
import { storage } from '../storage/browser';

const entries = [
  { id: 'b', name: 'Shaker end table', savedAt: 2000, createdAt: 0 },
  { id: 'a', name: 'Workbench', savedAt: 1000, createdAt: 0 },
];

beforeEach(() => {
  vi.spyOn(storage, 'listProjects').mockResolvedValue(entries);
});

const open = async () => {
  const user = userEvent.setup();
  await user.click(screen.getByLabelText('Open project menu'));
  return user;
};

// Rows are plain buttons now (Finding 3 — this popup dropped `role="menu"`
// and its children's menu roles, deliberately: a row carries a name plus two
// independent actions, which is grid- not menu-shaped, and a real menu
// pattern would need arrow-key/roving-tabindex navigation this popup does
// not have). Queried by class rather than by accessible `name` so these
// tests don't depend on how the browser flattens the dot/name/time spans
// into one string — the duplicate/delete buttons carry their own distinct
// `aria-label`s and are still queried that way below.
const openRows = () =>
  screen.getAllByRole('button').filter((b) => b.classList.contains('project-row-open'));

describe('ProjectMenu', () => {
  it('lists projects in the order the adapter returned them', async () => {
    render(<ProjectMenu activeId="a" onOpen={vi.fn()} onNew={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} onImport={vi.fn()} />);
    await open();
    const rows = await screen.findAllByText(/Shaker end table|Workbench/, { selector: '.project-row-name' });
    expect(rows.map((r) => r.textContent)).toEqual(['Shaker end table', 'Workbench']);
  });

  it('marks the active project', async () => {
    render(<ProjectMenu activeId="a" onOpen={vi.fn()} onNew={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} onImport={vi.fn()} />);
    await open();
    await screen.findAllByText('Workbench');
    const rows = openRows();
    const workbench = rows.find((r) => r.textContent?.includes('Workbench'))!;
    const shaker = rows.find((r) => r.textContent?.includes('Shaker'))!;
    expect(workbench).toHaveAttribute('aria-current', 'true');
    expect(shaker).not.toHaveAttribute('aria-current');
  });

  it('opens a project on click', async () => {
    const onOpen = vi.fn();
    render(<ProjectMenu activeId="a" onOpen={onOpen} onNew={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} onImport={vi.fn()} />);
    const user = await open();
    await screen.findAllByText('Shaker end table');
    const shaker = openRows().find((r) => r.textContent?.includes('Shaker'))!;
    await user.click(shaker);
    expect(onOpen).toHaveBeenCalledWith('b');
  });

  it('needs two clicks to delete, and says so in between', async () => {
    // Undo is per-document; there is no cross-project undo and no trash.
    const onDelete = vi.fn();
    render(<ProjectMenu activeId="a" onOpen={vi.fn()} onNew={vi.fn()} onDuplicate={vi.fn()} onDelete={onDelete} onImport={vi.fn()} />);
    const user = await open();
    const deleteButtons = await screen.findAllByLabelText(/^Delete /);
    await user.click(deleteButtons[0]);
    expect(onDelete).not.toHaveBeenCalled();
    // The armed confirm's accessible name carries the project name (Minor
    // finding: "Delete?" alone is ambiguous with several rows armed at
    // once — not reachable simultaneously today since arming one row
    // disarms any other, but the name should say which row regardless).
    const confirm = await screen.findByRole('button', { name: 'Delete Shaker end table?' });
    await user.click(confirm);
    expect(onDelete).toHaveBeenCalledWith('b');
  });

  it('abandons a pending delete when another row is touched', async () => {
    const onDelete = vi.fn();
    render(<ProjectMenu activeId="a" onOpen={vi.fn()} onNew={vi.fn()} onDuplicate={vi.fn()} onDelete={onDelete} onImport={vi.fn()} />);
    const user = await open();
    await user.click((await screen.findAllByLabelText(/^Delete /))[0]);
    await user.click((await screen.findAllByLabelText(/^Duplicate /))[1]);
    expect(screen.queryByRole('button', { name: 'Delete Shaker end table?' })).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('closes on Escape without opening anything', async () => {
    const onOpen = vi.fn();
    render(<ProjectMenu activeId="a" onOpen={onOpen} onNew={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} onImport={vi.fn()} />);
    const user = await open();
    await screen.findAllByText('Workbench');
    await user.keyboard('{Escape}');
    expect(screen.queryByLabelText(/^Delete /)).toBeNull();
    expect(onOpen).not.toHaveBeenCalled();
  });

  /**
   * Follow-up 159. `duplicateProject` returns null for a source that is
   * missing or unreadable, and that path moves no verdict: `storage.available`
   * is untouched (the store is working, one project's data is gone), so the
   * banner cannot speak for it. The user pressed a button and nothing
   * happened. The surface is inline on the row, the way a cut's error lives
   * with its cut — not the banner, which is easy to miss right after a
   * deliberate action.
   */
  describe('a failed duplicate', () => {
    const failing = (cause: 'source-missing' | 'write-failed') =>
      vi.fn().mockResolvedValue(cause);

    it('reports itself on the row that failed', async () => {
      const onDuplicate = failing('source-missing');
      render(<ProjectMenu activeId="a" onOpen={vi.fn()} onNew={vi.fn()} onDuplicate={onDuplicate} onDelete={vi.fn()} onImport={vi.fn()} />);
      const user = await open();
      await user.click(await screen.findByLabelText('Duplicate Workbench'));

      const err = await screen.findByRole('status');
      expect(err.textContent).toMatch(/missing/i);
      // On the failing row, not merely somewhere in the popup — the whole
      // point of a per-row surface is that two rows cannot be confused.
      expect(err.closest('.project-row-group')).toContainElement(
        screen.getByLabelText('Duplicate Workbench'),
      );
      expect(err.closest('.project-row-group')).not.toContainElement(
        screen.getByLabelText('Duplicate Shaker end table'),
      );
    });

    it('names the cause, because the two failures need different sentences', async () => {
      const onDuplicate = failing('write-failed');
      render(<ProjectMenu activeId="a" onOpen={vi.fn()} onNew={vi.fn()} onDuplicate={onDuplicate} onDelete={vi.fn()} onImport={vi.fn()} />);
      const user = await open();
      await user.click(await screen.findByLabelText('Duplicate Workbench'));
      // A write failure is not the source going missing, and saying so would
      // send the user looking for the wrong thing. The banner also shows here.
      expect((await screen.findByRole('status')).textContent).toMatch(/storage/i);
      expect((await screen.findByRole('status')).textContent).not.toMatch(/missing/i);
    });

    it('says nothing when the duplicate succeeds', async () => {
      const onDuplicate = vi.fn().mockResolvedValue(null);
      render(<ProjectMenu activeId="a" onOpen={vi.fn()} onNew={vi.fn()} onDuplicate={onDuplicate} onDelete={vi.fn()} onImport={vi.fn()} />);
      const user = await open();
      await user.click(await screen.findByLabelText('Duplicate Workbench'));
      await waitFor(() => expect(onDuplicate).toHaveBeenCalled());
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('clears when the menu is closed and reopened', async () => {
      const onDuplicate = failing('source-missing');
      render(<ProjectMenu activeId="a" onOpen={vi.fn()} onNew={vi.fn()} onDuplicate={onDuplicate} onDelete={vi.fn()} onImport={vi.fn()} />);
      const user = await open();
      await user.click(await screen.findByLabelText('Duplicate Workbench'));
      await screen.findByRole('status');

      await user.click(screen.getByLabelText('Open project menu'));
      await user.click(screen.getByLabelText('Open project menu'));
      await screen.findAllByText('Workbench');
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('does not leave one row\'s error standing after another row succeeds', async () => {
      const onDuplicate = vi.fn()
        .mockResolvedValueOnce('source-missing')
        .mockResolvedValueOnce(null);
      render(<ProjectMenu activeId="a" onOpen={vi.fn()} onNew={vi.fn()} onDuplicate={onDuplicate} onDelete={vi.fn()} onImport={vi.fn()} />);
      const user = await open();
      await user.click(await screen.findByLabelText('Duplicate Workbench'));
      await screen.findByRole('status');

      await user.click(screen.getByLabelText('Duplicate Shaker end table'));
      await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    });
  });

  /**
   * The file's own warning, finally pinned. The arm/disarm swap renders a
   * <button> at the same sibling index in both branches, and that — not an
   * explicit focus restore — is what keeps focus on the control the user just
   * pressed. Giving either branch a `key` makes React unmount and remount
   * across the swap, dropping focus to the body, and nothing else in this file
   * would notice.
   *
   * Written when follow-up 159 wrapped each row in a Fragment carrying `key`
   * and a `.project-row-group` div. That leaves the delete buttons' index
   * inside `.project-row` untouched, so the warning's subject survives — but
   * "it should still be fine" is exactly the reasoning the warning exists to
   * distrust, so it is asserted rather than reasoned about.
   */
  it('keeps focus on the delete control across the arm swap', async () => {
    render(<ProjectMenu activeId="a" onOpen={vi.fn()} onNew={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} onImport={vi.fn()} />);
    const user = await open();
    await user.click(await screen.findByLabelText('Delete Workbench'));
    expect(document.activeElement).toBe(screen.getByLabelText('Delete Workbench?'));
  });

  it('exposes duplicate and delete to the keyboard, not hover alone', async () => {
    // Hover-only reveal would put both operations out of reach without a
    // pointer. They are always in the DOM; CSS handles the reveal.
    render(<ProjectMenu activeId="a" onOpen={vi.fn()} onNew={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} onImport={vi.fn()} />);
    await open();
    expect(await screen.findAllByLabelText(/^Duplicate /)).toHaveLength(2);
    expect(await screen.findAllByLabelText(/^Delete /)).toHaveLength(2);
  });

  // Finding 3's replacement for the ARIA-menu content model: no roles to
  // assert, so this pins the actual mechanism — Tab order — instead. The
  // sequence is arm (click ×), then Tab, then Enter/Space on the confirm
  // that received focus, which only works if focus SURVIVED the swap.
  it('keeps focus on the confirm button after arming, so Space commits it', async () => {
    const onDelete = vi.fn();
    render(<ProjectMenu activeId="a" onOpen={vi.fn()} onNew={vi.fn()} onDuplicate={vi.fn()} onDelete={onDelete} onImport={vi.fn()} />);
    const user = await open();
    const armButton = (await screen.findAllByLabelText(/^Delete /))[0];
    act(() => { armButton.focus(); });
    await user.keyboard('{Enter}');
    // Same element in the DOM at this sibling index — the arm swaps its
    // label/class, not its identity — so focus was never dropped.
    expect(document.activeElement).toHaveAccessibleName('Delete Shaker end table?');
    await user.keyboard(' ');
    expect(onDelete).toHaveBeenCalledWith('b');
  });

  // R20 (fix round 1, Finding 3): the row's onClick used to fire
  // `refresh()` right after `onDuplicate`/`onDelete` synchronously, not
  // after awaiting them — harmless while both were no-ops, but a real race
  // once they touch storage. A deferred promise as the `onDuplicate` prop is
  // the general technique for pinning "awaits before proceeding": the click
  // handler cannot reach `refresh()` (and so cannot call `listProjects()`
  // again) until the test itself releases the promise.
  it('awaits onDuplicate before refreshing the project list', async () => {
    const listProjects = vi.spyOn(storage, 'listProjects').mockResolvedValue(entries);
    let release!: (v: null) => void;
    // Resolves null — a SUCCESSFUL duplicate held open, which is what this
    // test is about; the failure paths are covered in their own describe.
    const onDuplicate = vi.fn(() => new Promise<null>((r) => { release = r; }));
    render(<ProjectMenu activeId="a" onOpen={vi.fn()} onNew={vi.fn()} onDuplicate={onDuplicate} onDelete={vi.fn()} onImport={vi.fn()} />);
    const user = await open();
    const dupButtons = await screen.findAllByLabelText(/^Duplicate /);
    listProjects.mockClear(); // drop the call `open()` itself triggered

    await user.click(dupButtons[0]);
    expect(onDuplicate).toHaveBeenCalledWith('b');
    // Still pending: the click's own refresh must not have run yet.
    expect(listProjects).not.toHaveBeenCalled();

    release(null);
    await waitFor(() => expect(listProjects).toHaveBeenCalled());
  });

  it('closes when focus leaves the popup entirely (Tab out), independent of outside-click', async () => {
    render(
      <>
        <ProjectMenu activeId="a" onOpen={vi.fn()} onNew={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} onImport={vi.fn()} />
        <button>outside</button>
      </>,
    );
    await open();
    await screen.findAllByText('Workbench');
    const outside = screen.getByRole('button', { name: 'outside' });
    act(() => { outside.focus(); });
    expect(screen.queryByText('Workbench')).toBeNull();
  });
});

describe('relativeTime', () => {
  const now = 1_000_000;

  it('reads as "just now" under a minute', () => {
    expect(relativeTime(now - 30_000, now)).toBe('just now');
  });

  it('reads in minutes under an hour', () => {
    expect(relativeTime(now - 5 * 60_000, now)).toBe('5 min ago');
  });

  it('reads in hours under a day', () => {
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3 hr ago');
  });

  it('reads "yesterday" for exactly one day', () => {
    expect(relativeTime(now - 24 * 3_600_000, now)).toBe('yesterday');
  });

  it('reads in days beyond a day', () => {
    expect(relativeTime(now - 3 * 24 * 3_600_000, now)).toBe('3 days ago');
  });
});

describe('ProjectMenu new badge', () => {
  it('badges a row whose id is in newIds, and only that row', async () => {
    render(<ProjectMenu activeId="a" newIds={new Set(['b'])} onOpen={vi.fn()} onNew={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} onImport={vi.fn()} />);
    await open();
    await screen.findAllByText('Shaker end table');
    const rows = openRows();
    const shaker = rows.find((r) => r.textContent?.includes('Shaker'))!;
    const workbench = rows.find((r) => r.textContent?.includes('Workbench'))!;
    expect(shaker.querySelector('.project-row-new')).toHaveTextContent('new');
    expect(workbench.querySelector('.project-row-new')).toBeNull();
  });
});
