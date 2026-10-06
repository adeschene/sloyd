import { useState } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DimensionField } from './DimensionField';

function Harness({ initial }: { initial: number }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <DimensionField label="X" value={value} allowNegative onCommit={setValue} />
      <button onClick={() => setValue(19.25)}>external change</button>
    </>
  );
}

const setup = (props: Partial<React.ComponentProps<typeof DimensionField>> = {}) => {
  const onCommit = vi.fn();
  render(<DimensionField label="Length" value={1.5} onCommit={onCommit} {...props} />);
  return { onCommit, input: screen.getByLabelText('Length') as HTMLInputElement };
};

describe('DimensionField', () => {
  it('displays the value as a fraction', () => {
    const { input } = setup();
    expect(input.value).toBe('1-1/2"');
  });

  it('commits a parsed fraction on blur', async () => {
    const { onCommit, input } = setup();
    await userEvent.clear(input);
    await userEvent.type(input, '3/4');
    await userEvent.tab();
    expect(onCommit).toHaveBeenCalledWith(0.75);
  });

  it('commits on Enter', async () => {
    const { onCommit, input } = setup();
    await userEvent.clear(input);
    await userEvent.type(input, '2{Enter}');
    expect(onCommit).toHaveBeenCalledWith(2);
  });

  // Follow-up 212: Enter commits AND leaves the field, so the commit is seen
  // and the next Ctrl+Z reaches the app's undo rather than the input's.
  it('leaves the field after a successful Enter', async () => {
    const { onCommit, input } = setup();
    await userEvent.clear(input);
    await userEvent.type(input, '2{Enter}');
    expect(onCommit).toHaveBeenCalledWith(2);
    expect(input).not.toHaveFocus();
  });

  // The blur must not resync from the render's stale `value` (1.5 here,
  // since this harness never stores): the field shows what was committed.
  it('shows the committed value, not the stale one, after the Enter blur', async () => {
    const { input } = setup();
    await userEvent.clear(input);
    await userEvent.type(input, '2{Enter}');
    expect(input.value).toBe('2"');
    expect(input).toHaveAttribute('aria-invalid', 'false');
  });

  it('keeps focus when Enter is refused, so the entry can be fixed', async () => {
    const { onCommit, input } = setup();
    await userEvent.clear(input);
    await userEvent.type(input, 'banana{Enter}');
    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('leaves an untouched field on Enter without committing', async () => {
    const { onCommit, input } = setup();
    await userEvent.click(input);
    await userEvent.keyboard('{Enter}');
    expect(onCommit).not.toHaveBeenCalled();
    expect(input).not.toHaveFocus();
  });

  it('normalises the display after committing', async () => {
    const { input } = setup();
    await userEvent.clear(input);
    await userEvent.type(input, '1 1/2{Enter}');
    expect(input.value).toBe('1-1/2"');
  });

  it('marks the field invalid and does not commit unparseable input', async () => {
    const { onCommit, input } = setup();
    await userEvent.clear(input);
    await userEvent.type(input, 'banana');
    await userEvent.tab();
    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('rejects zero and negative dimensions by default', async () => {
    const { onCommit, input } = setup();
    await userEvent.clear(input);
    await userEvent.type(input, '0{Enter}');
    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('accepts negatives when allowNegative is set', async () => {
    const { onCommit, input } = setup({ allowNegative: true });
    await userEvent.clear(input);
    await userEvent.type(input, '-3/4{Enter}');
    expect(onCommit).toHaveBeenCalledWith(-0.75);
  });

  it('reverts to the last good value on Escape', async () => {
    const { onCommit, input } = setup();
    await userEvent.clear(input);
    await userEvent.type(input, 'banana{Escape}');
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe('1-1/2"');
    expect(input).toHaveAttribute('aria-invalid', 'false');
  });

  it('picks up an external value change while not being edited', () => {
    const { rerender } = render(
      <DimensionField label="Length" value={1.5} onCommit={vi.fn()} />,
    );
    rerender(<DimensionField label="Length" value={3} onCommit={vi.fn()} />);
    expect((screen.getByLabelText('Length') as HTMLInputElement).value).toBe('3"');
  });

  it('does not commit when a field is only focused and blurred, untouched', async () => {
    const { onCommit, input } = setup();
    await userEvent.click(input);
    await userEvent.tab();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('still commits on blur when the user actually edited the field', async () => {
    const { onCommit, input } = setup();
    await userEvent.click(input);
    await userEvent.clear(input);
    await userEvent.type(input, '2');
    await userEvent.tab();
    expect(onCommit).toHaveBeenCalledWith(2);
  });

  it('survives a focus/blur round trip unchanged for a value off the 1/16" grid', async () => {
    const { onCommit, input } = setup({ value: 0.7 });
    expect(input.value).toBe('11/16"');
    await userEvent.click(input);
    await userEvent.tab();
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe('11/16"');
  });

  it('does not commit on Enter for an untouched value off the 1/16" grid', async () => {
    // The Enter counterpart to the blur test above. Without the `dirty`
    // guard on the Enter handler, parsing the normalised display text
    // ("11/16\"") back to a number yields 0.6875, not the stored 0.7 — an
    // untouched field would silently rewrite the document and push a bogus
    // undo entry just because the user pressed Enter to dismiss it.
    const { onCommit, input } = setup({ value: 0.7 });
    expect(input.value).toBe('11/16"');
    await userEvent.click(input);
    await userEvent.keyboard('{Enter}');
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe('11/16"');
  });

  it('still commits on blur for a dirty field even if an external value change arrives while focused', async () => {
    // Pins the ordering in the adopt-external-value effect: `dirty.current`
    // must only be reset when `!editing.current`. Moving that reset outside
    // the guard would make it fire on every value-prop change, including
    // one that arrives mid-edit (e.g. a gizmo drag on another axis, or an
    // undo elsewhere), silently dropping this real edit on blur.
    const onCommit = vi.fn();
    const { rerender } = render(
      <DimensionField label="Length" value={1.5} onCommit={onCommit} />,
    );
    const input = screen.getByLabelText('Length') as HTMLInputElement;
    await userEvent.click(input);
    await userEvent.clear(input);
    await userEvent.type(input, '2');

    // An external change lands while the field is still focused.
    rerender(<DimensionField label="Length" value={99} onCommit={onCommit} />);

    await userEvent.tab();
    expect(onCommit).toHaveBeenCalledWith(2);
  });

  it('resyncs to an external value that arrived while focused, once the field blurs untouched', async () => {
    render(<Harness initial={10} />);
    const input = screen.getByLabelText('X') as HTMLInputElement;
    await userEvent.click(input);
    await act(async () => { screen.getByText('external change').click(); });
    await userEvent.tab();
    expect(input.value).toBe('19-1/4"');
  });
});

describe('DimensionField — mixed (value null)', () => {
  it('shows an empty box with a "mixed" placeholder', () => {
    const { input } = setup({ value: null });
    expect(input.value).toBe('');
    expect(input).toHaveAttribute('placeholder', 'mixed');
  });

  it('a field with a value has no placeholder', () => {
    const { input } = setup();
    expect(input).not.toHaveAttribute('placeholder');
  });

  // Review Focus 3. THE TRAP (invariant 5): committing here would set every
  // selected part to one value, silently. Asserts the error state too: with
  // the dirty guard deleted, blur commits '' — parseLength('') is null — so
  // "no onCommit" alone would survive that mutation.
  it('writes NOTHING when focused and blurred untouched, and shows no error', async () => {
    const { onCommit, input } = setup({ value: null });
    await userEvent.click(input);
    await userEvent.tab();
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe('');
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // The case where a deleted dirty guard really WRITES: a shared field is
  // focused, an external change makes the parts differ while it holds focus
  // (the adopt effect skips while editing), and it blurs untouched. Without
  // the guard, blur commits the stale "1-1/2" text, 1.5 !== null, and every
  // part is set to 1.5. This is invariant 5's original failure mode, arriving
  // through the mixed state.
  it('writes nothing when a focused field turns mixed under it and then blurs untouched', async () => {
    const onCommit = vi.fn();
    const { rerender } = render(<DimensionField label="Length" value={1.5} onCommit={onCommit} />);
    const input = screen.getByLabelText('Length') as HTMLInputElement;
    await userEvent.click(input);
    rerender(<DimensionField label="Length" value={null} onCommit={onCommit} />);
    await userEvent.tab();
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe('');
  });

  it('writes nothing on Enter when untouched', async () => {
    const { onCommit, input } = setup({ value: null });
    await userEvent.click(input);
    await userEvent.keyboard('{Enter}');
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('commits a typed value', async () => {
    const { onCommit, input } = setup({ value: null });
    await userEvent.type(input, '3/4');
    await userEvent.tab();
    expect(onCommit).toHaveBeenCalledWith(0.75);
  });

  it('Escape reverts a draft to the empty mixed box', async () => {
    const { onCommit, input } = setup({ value: null });
    await userEvent.type(input, '3/4{Escape}');
    expect(input.value).toBe('');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('adopts an external change from mixed to a value and back', () => {
    const onCommit = vi.fn();
    const { rerender } = render(<DimensionField label="Length" value={null} onCommit={onCommit} />);
    const input = screen.getByLabelText('Length') as HTMLInputElement;
    rerender(<DimensionField label="Length" value={2} onCommit={onCommit} />);
    expect(input.value).toBe('2"');
    rerender(<DimensionField label="Length" value={null} onCommit={onCommit} />);
    expect(input.value).toBe('');
  });
});

describe('DimensionField — commitUnchanged', () => {
  // Off by default: re-entering the stored value is a no-op (no history entry).
  it('without it, a dirty commit of the same value calls nothing', async () => {
    const { onCommit, input } = setup();
    await userEvent.clear(input);
    await userEvent.type(input, '1-1/2{Enter}');
    expect(onCommit).not.toHaveBeenCalled();
  });

  // On: a typed value equal to the shown one is still the person's value, for
  // a caller whose shown value is a live default (copy in a row).
  it('with it, a dirty commit of the same value still calls onCommit', async () => {
    const { onCommit, input } = setup({ commitUnchanged: true });
    await userEvent.clear(input);
    await userEvent.type(input, '1-1/2{Enter}');
    expect(onCommit).toHaveBeenCalledWith(1.5);
  });

  it('with it, an untouched blur or Enter still commits nothing', async () => {
    const { onCommit, input } = setup({ commitUnchanged: true });
    await userEvent.click(input);
    await userEvent.keyboard('{Enter}');
    await userEvent.click(input);
    await userEvent.tab();
    expect(onCommit).not.toHaveBeenCalled();
  });
});

describe('DimensionField — onErrorChange', () => {
  it('reports false on mount, true on a refusal, false once the error clears', async () => {
    const onErrorChange = vi.fn();
    const { input } = setup({ onErrorChange });
    expect(onErrorChange).toHaveBeenLastCalledWith(false);
    await userEvent.clear(input);
    await userEvent.type(input, 'banana');
    await userEvent.tab();
    expect(onErrorChange).toHaveBeenLastCalledWith(true);
    await userEvent.click(input);
    await userEvent.keyboard('{Escape}');
    expect(onErrorChange).toHaveBeenLastCalledWith(false);
  });

  it('reports false when an external change clears the error', async () => {
    const onErrorChange = vi.fn();
    const { rerender } = render(<DimensionField label="Length" value={1.5} onCommit={vi.fn()} onErrorChange={onErrorChange} />);
    const input = screen.getByLabelText('Length') as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, '0');
    await userEvent.tab();
    expect(onErrorChange).toHaveBeenLastCalledWith(true);
    rerender(<DimensionField label="Length" value={3} onCommit={vi.fn()} onErrorChange={onErrorChange} />);
    expect(onErrorChange).toHaveBeenLastCalledWith(false);
  });
});
