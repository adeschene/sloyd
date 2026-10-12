import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AngleField } from './AngleField';

describe('AngleField', () => {
  const setup = (value: number, onCommit = vi.fn(), max?: number) => {
    render(<AngleField label="Angle" value={value} onCommit={onCommit} max={max} />);
    return { input: screen.getByLabelText('Angle') as HTMLInputElement, onCommit };
  };
  it('shows degrees to 0.1°', () => {
    expect(setup(45).input.value).toBe('45.0°');
    cleanup();
    expect(setup(22.499999999999996).input.value).toBe('22.5°');
  });
  it('commits a typed angle, with or without the degree sign', async () => {
    const { input, onCommit } = setup(45);
    await userEvent.clear(input); await userEvent.type(input, '22.5{Enter}');
    expect(onCommit).toHaveBeenLastCalledWith(22.5);
    await userEvent.clear(input); await userEvent.type(input, '30°{Enter}');
    expect(onCommit).toHaveBeenLastCalledWith(30);
  });
  it('refuses 0, 90, past max, and junk — and keeps focus', async () => {
    const { input, onCommit } = setup(45, vi.fn(), 80);
    for (const bad of ['0', '90', '85', 'abc']) {
      await userEvent.clear(input); await userEvent.type(input, `${bad}{Enter}`);
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(document.activeElement).toBe(input);
    }
    expect(onCommit).not.toHaveBeenCalled();
  });
  it('states the limit in degrees', async () => {
    const { input } = setup(45, vi.fn(), 80);
    await userEvent.clear(input); await userEvent.type(input, '85{Enter}');
    expect(screen.getByRole('alert').textContent).toBe('Must be at most 80.0°');
  });
  it('accepts an exact max of 45 (the floor must not take it to 44.9)', async () => {
    const { input, onCommit } = setup(30, vi.fn(), 45);
    await userEvent.clear(input); await userEvent.type(input, '45{Enter}');
    expect(onCommit).toHaveBeenLastCalledWith(45);
  });
  it('an untouched blur commits nothing', async () => {
    const { input, onCommit } = setup(22.499999999999996);
    input.focus(); input.blur();
    expect(onCommit).not.toHaveBeenCalled();
  });
});
