import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DimensionField } from './DimensionField';

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
});
