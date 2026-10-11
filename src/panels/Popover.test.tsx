import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Popover } from './Popover';

function setup(run = vi.fn()) {
  render(
    <div>
      <Popover label={<>Claude<span aria-hidden="true"> ▾</span></>}
        items={[{ label: 'Generate…', detail: 'A new prototype', run }, { label: 'Refine…', run: vi.fn() }]} />
      <button>outside</button>
    </div>,
  );
  return { trigger: screen.getByRole('button', { name: 'Claude' }), run };
}

describe('Popover', () => {
  it('is closed until its trigger is clicked, and says so with aria-expanded', async () => {
    const { trigger } = setup();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Generate…' })).toBeNull();
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Generate…' })).toBeInTheDocument();
    expect(screen.getByText('A new prototype')).toBeInTheDocument();
  });

  it('runs an item, closes, and has focus on the trigger by the time the item runs', async () => {
    let focusedDuringRun: Element | null = null;
    const { trigger } = setup(vi.fn(() => { focusedDuringRun = document.activeElement; }));
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('button', { name: 'Generate…' }));
    expect(focusedDuringRun).toBe(trigger);
    expect(screen.queryByRole('button', { name: 'Generate…' })).toBeNull();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes on Escape, returns focus to the trigger, and keeps the key from reaching window', async () => {
    const { trigger } = setup();
    const onWindowKey = vi.fn();
    window.addEventListener('keydown', onWindowKey);
    await userEvent.click(trigger);
    screen.getByRole('button', { name: 'Refine…' }).focus();
    await userEvent.keyboard('{Escape}');
    window.removeEventListener('keydown', onWindowKey);
    expect(screen.queryByRole('button', { name: 'Refine…' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(onWindowKey).not.toHaveBeenCalled();
  });

  it('closes on a pointerdown outside it, not on one inside it', async () => {
    const { trigger } = setup();
    await userEvent.click(trigger);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Refine…' }));
    expect(screen.getByRole('button', { name: 'Refine…' })).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'outside' }));
    expect(screen.queryByRole('button', { name: 'Refine…' })).toBeNull();
  });

  it('closes when focus leaves it (Tab past the last item)', async () => {
    const { trigger } = setup();
    await userEvent.click(trigger);
    screen.getByRole('button', { name: 'Refine…' }).focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'outside' }));
    expect(screen.queryByRole('button', { name: 'Refine…' })).toBeNull();
  });

  // Follow-up 250. Safari and macOS Firefox do not focus a button on
  // mousedown: pressing an item while focus is inside the popover blurs the
  // focused element with relatedTarget NULL, before the click lands. The
  // focusout must not close the popup then, or the click hits nothing.
  // fireEvent throughout: userEvent would focus the item on mousedown, the
  // very thing those browsers do not do. MUTATE: drop the pointer-down guard
  // in onFocusOut — this goes red.
  it('does not let a null-relatedTarget focusout during a press inside swallow the item click', () => {
    const { trigger, run } = setup();
    fireEvent.click(trigger);
    expect(document.activeElement).toBe(trigger);
    const item = screen.getByRole('button', { name: 'Generate…' });
    fireEvent.pointerDown(item);
    fireEvent.focusOut(document.activeElement!, { relatedTarget: null });
    fireEvent.pointerUp(item);
    fireEvent.click(item);
    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Generate…' })).toBeNull();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('still closes on a null-relatedTarget focusout with no pointer down inside', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.focusOut(trigger, { relatedTarget: null });
    expect(screen.queryByRole('button', { name: 'Generate…' })).toBeNull();
  });

  it('still closes on a null-relatedTarget focusout after a press inside was released', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    const item = screen.getByRole('button', { name: 'Refine…' });
    fireEvent.pointerDown(item);
    fireEvent.pointerUp(item);
    fireEvent.focusOut(trigger, { relatedTarget: null });
    expect(screen.queryByRole('button', { name: 'Refine…' })).toBeNull();
  });

  // The other half of fu 250: in those browsers a mouse-opened popover had
  // focus nowhere inside it, so Escape (listened for on the subtree,
  // invariant 27) never reached it. The trigger focuses itself.
  it('focuses its trigger when the trigger is clicked, so Escape reaches it', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    expect(document.activeElement).toBe(trigger);
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'Generate…' })).toBeNull();
  });

  it('adds no window pointerdown listener while closed', () => {
    const add = vi.spyOn(window, 'addEventListener');
    setup();
    expect(add.mock.calls.filter(([t]) => t === 'pointerdown')).toHaveLength(0);
    add.mockRestore();
  });
});
